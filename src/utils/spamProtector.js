// utils/spamProtector.js

function track(ws, config = {}) {
  const WINDOW_SECONDS = config.window_seconds ?? 10;
  const MESSAGE_LIMIT = config.message_limit ?? 50;
  const DISCONNECT_THRESHOLD = config.disconnect_threshold ?? 5;

  const refillRate = MESSAGE_LIMIT / WINDOW_SECONDS; // tokens per second
  const now = Date.now();

  if (!ws.tokenBucket) {
    ws.tokenBucket = {
      tokens: MESSAGE_LIMIT,
      lastCheck: now
    };
  }

  const bucket = ws.tokenBucket;
  const MAX_REFILL_CLAMP = config.max_refill_seconds ?? WINDOW_SECONDS;
  const elapsed = Math.min((now - bucket.lastCheck) / 1000, MAX_REFILL_CLAMP); // clamped seconds
  bucket.tokens = Math.min(MESSAGE_LIMIT, bucket.tokens + elapsed * refillRate);
  bucket.lastCheck = now;

  if (bucket.tokens < 1) {
    return {
      violation: true,
      limit: MESSAGE_LIMIT,
      window: WINDOW_SECONDS,
      disconnect_threshold: DISCONNECT_THRESHOLD
    };
  }

  bucket.tokens -= 1;

  return { violation: false };
}

module.exports = { track };

