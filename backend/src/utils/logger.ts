const SENSITIVE_PATTERNS = [
  /password=[^&\s]+/gi,
  /token=[^&\s]+/gi,
  /bearer\s+[a-zA-Z0-9_\-\.]+/gi,
  /postgresql:\/\/[^:]+:[^@]+@/gi,
  /rediss?:\/\/[^:]+:[^@]+@/gi,
  /"(password|token|secret|access_token|authorization)":\s*"[^"]+"/gi,
];

function sanitize(message: string): string {
  let cleaned = message;
  for (const pattern of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "[REDACTED]");
  }
  return cleaned;
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString();
    const safeMsg = sanitize(message);
    if (meta) {
      console.info(`[${timestamp}] [INFO] ${safeMsg}`, JSON.stringify(meta));
    } else {
      console.info(`[${timestamp}] [INFO] ${safeMsg}`);
    }
  },

  warn: (message: string, meta?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString();
    const safeMsg = sanitize(message);
    if (meta) {
      console.warn(`[${timestamp}] [WARN] ${safeMsg}`, JSON.stringify(meta));
    } else {
      console.warn(`[${timestamp}] [WARN] ${safeMsg}`);
    }
  },

  error: (message: string, error?: unknown) => {
    const timestamp = new Date().toISOString();
    const safeMsg = sanitize(message);
    if (error instanceof Error) {
      console.error(`[${timestamp}] [ERROR] ${safeMsg}: ${error.message}`);
      if (process.env.NODE_ENV !== "production" && error.stack) {
        console.error(error.stack);
      }
    } else if (error) {
      console.error(`[${timestamp}] [ERROR] ${safeMsg}`, error);
    } else {
      console.error(`[${timestamp}] [ERROR] ${safeMsg}`);
    }
  },

  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== "production") {
      const timestamp = new Date().toISOString();
      const safeMsg = sanitize(message);
      if (meta) {
        console.info(`[${timestamp}] [DEBUG] ${safeMsg}`, JSON.stringify(meta));
      } else {
        console.info(`[${timestamp}] [DEBUG] ${safeMsg}`);
      }
    }
  },
};
