import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { notFoundHandler } from "./middleware/notFoundHandler.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/index.js";

export function createApp(): Express {
  const app = express();

  // 1. Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // 2. Explicit CORS configuration
  const allowedOrigins = env.FRONTEND_ORIGIN.split(",").map((o) => o.trim());

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, Postman)
        if (!origin) return callback(null, true);

        // In development, also permit standard local and development origins:
        // localhost, IPv4/IPv6 loopback, LAN network (192.168.x, 10.x, 172.x), and ngrok tunnels
        if (env.NODE_ENV === "development") {
          const isDevOrigin =
            origin.startsWith("http://localhost:") ||
            origin.startsWith("https://localhost:") ||
            origin.startsWith("http://127.0.0.1:") ||
            origin.startsWith("https://127.0.0.1:") ||
            origin.startsWith("http://[::1]:") ||
            origin.startsWith("https://[::1]:") ||
            origin.startsWith("http://192.168.") ||
            origin.startsWith("https://192.168.") ||
            origin.startsWith("http://10.") ||
            origin.startsWith("https://10.") ||
            origin.startsWith("http://172.") ||
            origin.startsWith("https://172.") ||
            origin.endsWith(".ngrok-free.dev") ||
            origin.endsWith(".ngrok-free.app") ||
            origin.endsWith(".ngrok.io") ||
            origin.endsWith(".ngrok.app");

          if (isDevOrigin) {
            return callback(null, true);
          }
        }

        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        // Return false gracefully instead of throwing 500 error
        callback(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    })
  );

  // 3. Cookie Parsing
  app.use(cookieParser());

  // 4. Body Parsing (with rawBody capture for webhook HMAC verification)
  app.use(
    express.json({
      limit: "1mb",
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // 4. Request Logging (sanitizes credentials & message tokens)
  app.use(requestLogger);

  // 5. Versioned API Routes (/api/v1)
  app.use("/api/v1", apiRouter);

  // 6. Handle 404 for unknown routes
  app.use(notFoundHandler);

  // 7. Centralized Error Handling
  app.use(errorHandler);

  return app;
}

export const app = createApp();
