interface EvalFunction {
  (script: string, keys: string[], args: string[]): Promise<string>;
}

export interface RateLimiterConfig {
  prefix: string;
  window: number;
  maxRate: number;
  evalFunc: EvalFunction;
}

export interface RateLimitInfo {
  isLimited: boolean;
  nextAvailableTime: number;
  remaining: number;
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
    local next_available_time = redis.call('ZRANGE', KEYS[1], 0, 0)[1] + window

    if remaining > 0 then
      redis.call('ZADD', KEYS[1], current, current)
      redis.call('EXPIRE', KEYS[1], window / 1000)
    end

    return tostring(remaining) .. ',' .. tostring(next_available_time) .. ',' .. tostring(remaining <= 0)
  `;

  private static checkScript = `
    local current = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])

    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', current - window)

    local remaining = limit - redis.call('ZCARD', KEYS[1])
    local next_available_time = redis.call('ZRANGE', KEYS[1], 0, 0)[1] + window

    return tostring(remaining) .. ',' .. tostring(next_available_time) .. ',' .. tostring(remaining <= 0)
  `;

  constructor(config: RateLimiterConfig) {
    this.prefix = config.prefix;
    this.window = config.window;
    this.maxRate = config.maxRate;
    this.evalFunc = config.evalFunc;
  }

  private async runScript(script: string, key: string): Promise<RateLimitInfo> {
    const now = Date.now();
    const namespacedKey = `${this.prefix}:${key}`;
    const result = await this.evalFunc(script, [namespacedKey], [
      now.toString(),
      this.window.toString(),
      this.maxRate.toString(),
    ]);

    const [remaining, nextAvailableTime, isLimited] = result.split(",");
    return {
      remaining: parseInt(remaining),
      nextAvailableTime: parseInt(nextAvailableTime),
      isLimited: isLimited === "true",
    };
  }

  async limit(key: string): Promise<RateLimitInfo> {
    return await this.runScript(RateLimiter.limitScript, key);
  }

  async check(key: string): Promise<RateLimitInfo> {
    return await this.runScript(RateLimiter.checkScript, key);
  }
}
