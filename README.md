# smooth-rate

A Redis-agnostic rate limiting module for Deno applications. smooth-rate offers a simple and adaptable interface for managing operation rates, making it an ideal solution for high-concurrency environments.

## Features

- **Redis-Agnostic**: Built to integrate with any Redis library, offering freedom to choose or switch your Redis library as per your needs.
  
- **Sliding Window Algorithm**: Implements the sliding window algorithm for precise and fluid rate limits, that transition smoothly over time rather than resetting periodically.

- **Flexible Configuration**: Easy customization of key prefix, window size, and max requests to adapt to diverse rate limiting requirements.

- **Atomic Operations**: Each operation is atomic, ensuring consistent results in a concurrent environment.

## Basic Usage

Import the `RateLimiter` class from the module:

```typescript
import { RateLimiter } from 'https://deno.land/x/smooth_rate/mod.ts';
```

Create an instance of `RateLimiter`:

```typescript
const rateLimiter = new RateLimiter({
  keyPrefix: 'ratelimit',
  windowMs: 60 * 1000, // 60 seconds
  maxRequests: 100,
  redis: {
    // Take `x/redis` as an example
    async eval(script, keys, args) {
      const raw = await redis.eval(script, keys, args);
      return raw!.toString();
    },
    async del(key) {
      await redis.del(key);
    },
  },
});
```

Use the `limit` and `check` methods:

```typescript
// Limit a request
const limitResult = await rateLimiter.limit('someIdentifier');

// Check the rate limit status
const checkResult = await rateLimiter.check('someIdentifier');
```

Both `limit` and `check` return a `RateLimitInfo` object:

- `isLimited`: Is the identifier currently limited?
- `nextAvailableTimestamp`: When is the next request allowed?
- `remainingRequests`: How many requests remain for the current window?

Use `reset` to reset the rate limit for an identifier:

```typescript
await rateLimiter.reset('someIdentifier');
```

## Contributing

Contributions are welcome. Open an issue or pull request on GitHub.
