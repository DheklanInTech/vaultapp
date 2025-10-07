import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import "dotenv/config";

// Be tolerant if env vars are not configured (e.g., preview deploys)
// When missing, provide a no-op limiter that always succeeds to avoid function crashes
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

let ratelimit;
if (url && token) {
  const redis = new Redis({ url, token });
  ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, "60 s"),
  });
} else {
  // Fallback: allow requests when Upstash is not configured
  ratelimit = { limit: async () => ({ success: true }) };
}

export default ratelimit;
