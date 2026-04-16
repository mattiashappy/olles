function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeWithRetry(task, options = {}) {
  const {
    retries = 3,
    baseDelayMs = 200,
    maxDelayMs = 5_000,
    jitterMs = 100,
    onFailedAttempt,
  } = options;

  let attempt = 0;
  let lastError;

  while (attempt <= retries) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;

      if (typeof onFailedAttempt === 'function') {
        await onFailedAttempt({ attempt, error });
      }

      if (attempt === retries) {
        throw error;
      }

      const backoff = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const jitter = Math.floor(Math.random() * jitterMs);
      await sleep(backoff + jitter);
      attempt += 1;
    }
  }

  throw lastError;
}

module.exports = { executeWithRetry };
