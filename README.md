# smooth-rate

A rate limiting module for Deno applications. smooth-rate is designed to work independently of specific Redis libraries, providing a flexible and easy-to-use interface for controlling the rate of operations in your applications.

## Features

- **Redis-Agnostic**: smooth-rate is designed to work with any Redis library. The module doesn't directly depend on any specific Redis library. Instead, it lets you inject your Redis connection into it. This gives you the flexibility to choose and switch your Redis library as needed.

- **Sliding Window Algorithm**: Utilizes the sliding window algorithm for rate limiting, providing accurate and smooth rate limits that slide continuously over time, as opposed to resetting every interval.

- **Flexible Configuration**: You can easily configure the key prefix, window size, and max requests, making the module adaptable to different rate limiting scenarios.

## Basic Usage

First, import the `RateLimiter` class, `RateLimiterConfig`, `EvalFunction`, and `DelFunction` from the module:

```typescript
import { RateLimiter, RateLimiterConfig, EvalFunction, DelFunction } from 'https://deno.land/x/smooth_rate/mod.ts';
```

Then, create an instance of `RateLimiter` with your configuration. The `evalFunc` parameter is a function that takes a Lua script, keys, and arguments, and returns a promise that resolves with the result of the Lua script. The `delFunc` parameter is a function that takes a key and deletes it from Redis.

```typescript
const rateLimiter = new RateLimiter({
  keyPrefix: 'myApp',
  windowMs: 60 * 1000, // 60 seconds
  maxRequests: 100,
  evalFunc: myRedisEvalFunction,
  delFunc: myRedisDelFunction,
});
```

Now, you can use the `limit`, `check`, and `reset` methods of your `RateLimiter` instance:

```typescript
// Limit a request
const limitResult = await rateLimiter.limit('someIdentifier');

// Check the rate limit status
const checkResult = await rateLimiter.check('someIdentifier');

// Reset the rate limit
await rateLimiter.reset('someIdentifier');
```

Both the `limit` and `check` methods return a `RateLimitInfo` object that contains:

- `isLimited`: a boolean indicating whether the identifier is currently limited.
- `nextAvailableTimestamp`: a timestamp (in milliseconds since the Unix epoch) when the next request will be allowed if the current request is limited.
- `remainingRequests`: the number of remaining requests that the identifier can make in the current window.

## Contributing

This project welcomes contributions. Please feel free to open an issue or pull request on GitHub.
