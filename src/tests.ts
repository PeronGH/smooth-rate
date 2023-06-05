import { connect } from "https://deno.land/x/redis@v0.29.4/mod.ts";
import { FakeTime } from "https://deno.land/std@0.190.0/testing/time.ts";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { RateLimiter } from "./limiter.ts";

const redis = await connect({
  hostname: "127.0.0.1",
  port: 6379,
});

await redis.del("ratelimit:test:test");

const rateLimiter = new RateLimiter({
  keyPrefix: "ratelimit:test",
  windowMs: 60000,
  maxRequests: 10,
  async evalFunc(script, keys, args) {
    const raw = await redis.eval(script, keys, args);
    return raw!.toString();
  },
  async delFunc(key) {
    await redis.del(key);
  },
});

Deno.test("ratelimit", async () => {
  const time = new FakeTime();

  try {
    for (let i = 0; i < 10; ++i) {
      const limitResult = await rateLimiter.limit("test");

      // should not be limited
      assertEquals(limitResult, {
        isLimited: false,
        remainingRequests: 9 - i,
        nextAvailableTimestamp: time.start + 60000,
      });

      const checkResult = await rateLimiter.check("test");

      if (i === 9) {
        // check should return limited after max requests exceeded
        assert(checkResult.isLimited);
      } else {
        // check should return the same result
        assertEquals(checkResult, limitResult);
      }

      time.tick(1000);
    }

    // further requests should be limited
    const shouldLimit = await rateLimiter.limit("test");
    assertEquals(shouldLimit, {
      isLimited: true,
      remainingRequests: 0,
      nextAvailableTimestamp: time.start + 60000,
    });

    time.tick(50000);

    // after the first request expires, the next request can be made
    const shouldNotLimit = await rateLimiter.limit("test");
    assertEquals(shouldNotLimit, {
      isLimited: false,
      remainingRequests: 0,
      nextAvailableTimestamp: time.start + 61000,
    });

    // reset should clear the limit
    await rateLimiter.reset("test");

    time.tick(1000);

    // after reset, the next request should not be limited
    const shouldNotLimitAfterReset = await rateLimiter.limit("test");
    assertEquals(shouldNotLimitAfterReset, {
      isLimited: false,
      remainingRequests: 9,
      nextAvailableTimestamp: time.start + 121000,
    });
  } finally {
    // clean up
    time.restore();
  }
});
