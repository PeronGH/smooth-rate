interface EvalFunction {
  (script: string, keys: string[], args: string[]): Promise<string>;
}

export interface RateLimiterConfig {
  keyPrefix: string;
  windowMs: number;
  maxRequests: number;
  evalFunc: EvalFunction;
}

export interface RateLimitInfo {
  isLimited: boolean;
  nextAvailableTimestamp: number;
  remainingRequests: number;
}

export class RateLimiter {
  private keyPrefix: string;
  private windowMs: number;
  private maxRequests: number;
  private evalFunc: EvalFunction;

  private static limitScript = `
    local currentTimestamp = tonumber(ARGV[1])
    local windowMs = tonumber(ARGV[2])
    local maxRequests = tonumber(ARGV[3])

    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', currentTimestamp - windowMs)

    local remainingRequests = maxRequests - redis.call('ZCARD', KEYS[1])
    local nextAvailableTimestamp = redis.call('ZRANGE', KEYS[1], 0, 0)[1] + windowMs

    if remainingRequests > 0 then
      redis.call('ZADD', KEYS[1], currentTimestamp, currentTimestamp)
      redis.call('EXPIRE', KEYS[1], windowMs / 1000)
    end

    return tostring(remainingRequests) .. ',' .. tostring(nextAvailableTimestamp) .. ',' .. tostring(remainingRequests <= 0)
  `;

  private static checkScript = `
    local currentTimestamp = tonumber(ARGV[1])
    local windowMs = tonumber(ARGV[2])
    local maxRequests = tonumber(ARGV[3])

    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', currentTimestamp - windowMs)

    local remainingRequests = maxRequests - redis.call('ZCARD', KEYS[1])
    local nextAvailableTimestamp = redis.call('ZRANGE', KEYS[1], 0, 0)[1] + windowMs

    return tostring(remainingRequests) .. ',' .. tostring(nextAvailableTimestamp) .. ',' .. tostring(remainingRequests <= 0)
  `;

  constructor(config: RateLimiterConfig) {
    this.keyPrefix = config.keyPrefix;
    this.windowMs = config.windowMs;
    this.maxRequests = config.maxRequests;
    this.evalFunc = config.evalFunc;
  }

  private async runScript(script: string, key: string): Promise<RateLimitInfo> {
    const currentTimestamp = Date.now();
    const namespacedKey = `${this.keyPrefix}:${key}`;
    const result = await this.evalFunc(script, [namespacedKey], [
      currentTimestamp.toString(),
      this.windowMs.toString(),
      this.maxRequests.toString(),
    ]);

    const [remainingRequests, nextAvailableTimestamp, isLimited] = result.split(
      ",",
    );
    return {
      remainingRequests: parseInt(remainingRequests),
      nextAvailableTimestamp: parseInt(nextAvailableTimestamp),
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
