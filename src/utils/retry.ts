import { logger } from './logger';

/** Transient Firestore error codes that are safe to retry */
const RETRYABLE_CODES = new Set([
  'unavailable',
  'deadline-exceeded',
  'resource-exhausted',
  'aborted',
  'internal',
]);

function isRetryable(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: string }).code);
    // Firestore codes come as "firestore/unavailable" or just "unavailable"
    const short = code.includes('/') ? code.split('/').pop()! : code;
    return RETRYABLE_CODES.has(short);
  }
  // Network errors
  if (err instanceof TypeError && err.message.includes('fetch')) return true;
  return false;
}

/**
 * Retry an async function with exponential backoff.
 * Only retries on transient Firestore/network errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 500,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && isRetryable(err)) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 200;
        logger.warn(`[retry] Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms...`, err);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}
