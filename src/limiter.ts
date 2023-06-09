interface EvalFunction {
  (script: string, keys: string[], args: string[]): Promise<string>;
}

interface DelFunction {
  (key: string): Promise<void>;
}

export interface RateLimiterConfig {
  keyPrefix: string;
  windowMs: number;
  maxRequests: number;
  redis: {
    eval: EvalFunction;
    del: DelFunction;
  };
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
  private eval: EvalFunction;
  private del: DelFunction;

  private static limitScript = `
    local currentTimestamp = tonumber(ARGV[1])
    local windowMs = tonumber(ARGV[2])
    local maxRequests = tonumber(ARGV[3])

    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', currentTimestamp - windowMs)
    local count = redis.call('ZCARD', KEYS[1])
    local remainingRequests = maxRequests - count
    local isLimited = remainingRequests <= 0

    if not isLimited then
      redis.call('ZADD', KEYS[1], currentTimestamp, currentTimestamp)
      remainingRequests = remainingRequests - 1
    end

    local oldestTimestamp = redis.call('ZRANGE', KEYS[1], 0, 0)[1]
    local nextAvailableTimestamp = oldestTimestamp and tonumber(oldestTimestamp) + windowMs or currentTimestamp

    return tostring(remainingRequests) .. ',' .. tostring(nextAvailableTimestamp) .. ',' .. tostring(isLimited)
  `;

  private static checkScript = `
    local currentTimestamp = tonumber(ARGV[1])
    local windowMs = tonumber(ARGV[2])
    local maxRequests = tonumber(ARGV[3])

    redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', currentTimestamp - windowMs)
    local count = redis.call('ZCARD', KEYS[1])
    local remainingRequests = maxRequests - count
    local isLimited = remainingRequests <= 0

    local oldestTimestamp = redis.call('ZRANGE', KEYS[1], 0, 0)[1]
    local nextAvailableTimestamp = oldestTimestamp and tonumber(oldestTimestamp) + windowMs or currentTimestamp

    return tostring(remainingRequests) .. ',' .. tostring(nextAvailableTimestamp) .. ',' .. tostring(isLimited)
  `;

  constructor(config: RateLimiterConfig) {
    this.keyPrefix = config.keyPrefix;
    this.windowMs = config.windowMs;
    this.maxRequests = config.maxRequests;
    this.eval = config.redis.eval;
    this.del = config.redis.del;
  }

  private async runScript(script: string, key: string): Promise<RateLimitInfo> {
    const currentTimestamp = Date.now();
    const namespacedKey = `${this.keyPrefix}:${key}`;
    const result = await this.eval(script, [namespacedKey], [
      currentTimestamp.toString(),
      this.windowMs.toString(),
      this.maxRequests.toString(),
    ]);

    if (typeof result !== "string") {
      throw new TypeError("Eval function did not return a string");
    }

    const [remainingRequests, nextAvailableTimestamp, isLimited] = result.split(
      ",",
    );
    return {
      remainingRequests: parseInt(remainingRequests),
      nextAvailableTimestamp: parseInt(nextAvailableTimestamp),
      isLimited: isLimited === "true",
    };
  }

  /**
   * Applies a rate limit rule to a given identifier.
   * @param key Identifier to be rate limited.
   * @returns Rate limit information including remaining requests, next available timestamp, and whether it's currently limited.
   */
  async limit(key: string): Promise<RateLimitInfo> {
    return await this.runScript(RateLimiter.limitScript, key);
  }

  /**
   * Checks the rate limit status for a given identifier without applying the rate limit.
   * @param key Identifier to be checked.
   * @returns Rate limit information including remaining requests, next available timestamp, and whether it's currently limited.
   */
  async check(key: string): Promise<RateLimitInfo> {
    return await this.runScript(RateLimiter.checkScript, key);
  }

  /**
   * Resets the rate limit for a given identifier.
   * @param key Identifier for which to reset the rate limit.
   */
  async reset(key: string): Promise<void> {
    const namespacedKey = `${this.keyPrefix}:${key}`;
    return await this.del(namespacedKey);
  }
}
