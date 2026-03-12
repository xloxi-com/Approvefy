type RateBucket = {
  count: number;
  resetAt: number;
};

type ConsumeRateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
};

type ConsumeRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

const rateBuckets = new Map<string, RateBucket>();
const MAX_BUCKETS = 20000;

function pruneBuckets(now: number): void {
  for (const [key, bucket] of rateBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateBuckets.delete(key);
    }
  }
  while (rateBuckets.size > MAX_BUCKETS) {
    const oldestKey = rateBuckets.keys().next().value;
    if (!oldestKey) break;
    rateBuckets.delete(oldestKey);
  }
}

export function getClientAddress(request: Request): string {
  const fromForwarded = request.headers.get("x-forwarded-for");
  if (fromForwarded) {
    const first = fromForwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const fromRealIp = request.headers.get("x-real-ip");
  if (fromRealIp?.trim()) return fromRealIp.trim();
  const fromCf = request.headers.get("cf-connecting-ip");
  if (fromCf?.trim()) return fromCf.trim();
  return "unknown";
}

export function consumeRateLimit(input: ConsumeRateLimitInput): ConsumeRateLimitResult {
  const now = Date.now();
  pruneBuckets(now);

  const limit = Math.max(1, input.limit);
  const windowMs = Math.max(1000, input.windowMs);

  const existing = rateBuckets.get(input.key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + windowMs };

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      remaining: 0,
    };
  }

  bucket.count += 1;
  rateBuckets.set(input.key, bucket);

  return {
    allowed: true,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    remaining: Math.max(0, limit - bucket.count),
  };
}

