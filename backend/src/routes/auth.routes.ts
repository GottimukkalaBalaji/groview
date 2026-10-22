import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { loginRateLimiter } from "../middleware/rateLimiter.js";
import { signupSchema, loginSchema } from "../validators/auth.validator.js";

const authRouter = Router();

// Customer signup (atomically creates organization and customer account)
authRouter.post(
  "/signup",
  validateRequest({ body: signupSchema }),
  authController.signup
);

// Customer login (rate-limited and constant-time password check)
authRouter.post(
  "/login",
  loginRateLimiter,
  validateRequest({ body: loginSchema }),
  authController.login
);

// Customer logout (revokes database session and clears cookie)
authRouter.post("/logout", authController.logout);

// Current user profile and tenant organization session verification
authRouter.get("/me", authController.me);

export { authRouter };
