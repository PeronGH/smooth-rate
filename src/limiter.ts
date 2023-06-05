interface EvalFunction {
  (script: string, keys: string[], args: string[]): Promise<number>;
}

export interface RateLimiterConfig {
  prefix: string;
  window: number;
  maxRate: number;
  evalFunc: EvalFunction;
}

export class RateLimiter {
  private prefix: string;
  private window: number;
  private maxRate: number;
  private evalFunc: EvalFunction;

  private static limitScript = `
    local current = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])

    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', current - window)

    local remaining = limit - redis.call('ZCARD', KEYS[1])

    if remaining > 0 then
    redis.call('ZADD', KEYS[1], current, current)
    redis.call('EXPIRE', KEYS[1], window / 1000)
    end

    return remaining
`;

  private static checkScript = `
    local current = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])

    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', current - window)

    local remaining = limit - redis.call('ZCARD', KEYS[1])

    return remaining
`;

  constructor(config: RateLimiterConfig) {
    this.prefix = config.prefix;
    this.window = config.window;
    this.maxRate = config.maxRate;
    this.evalFunc = config.evalFunc;
  }

  private async runScript(script: string, key: string): Promise<number> {
    const now = Date.now();
    const namespacedKey = `${this.prefix}:${key}`;
    return await this.evalFunc(script, [namespacedKey], [
      now.toString(),
      this.window.toString(),
      this.maxRate.toString(),
    ]);
  }

  async limit(key: string): Promise<number> {
    return await this.runScript(RateLimiter.limitScript, key);
  }

  async check(key: string): Promise<number> {
    return await this.runScript(RateLimiter.checkScript, key);
  }
}
