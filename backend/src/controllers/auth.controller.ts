import { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service.js";
import { sendSuccess } from "../utils/response.js";
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} from "../middleware/tenantContext.js";
import { recordSuccessfulLogin } from "../middleware/rateLimiter.js";
import { SignupInput, LoginInput } from "../validators/auth.validator.js";

export class AuthController {
  private getClientMeta(req: Request) {
    return {
      userAgent: req.headers["user-agent"],
      ipAddress:
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.socket.remoteAddress,
    };
  }

  private extractToken(req: Request): string | null {
    return (
      req.cookies?.[SESSION_COOKIE_NAME] ||
      req.headers.authorization?.replace(/^Bearer\s+/i, "") ||
      null
    );
  }

  public signup = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const body = req.body as SignupInput;
      const meta = this.getClientMeta(req);
      const result = await authService.signup(body, meta);

      // Set secure HttpOnly session cookie
      res.cookie(SESSION_COOKIE_NAME, result.token, SESSION_COOKIE_OPTIONS);

      // Return user profile and organization (never secret tokens or hashes)
      sendSuccess(
        res,
        {
          user: result.user,
          organization: result.organization,
        },
        201,
        "Account and organization created successfully"
      );
    } catch (error) {
      next(error);
    }
  };

  public login = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const body = req.body as LoginInput;
      const meta = this.getClientMeta(req);
      const result = await authService.login(body, meta);

      // Reset rate limit on successful authentication
      recordSuccessfulLogin(req);

      // Set secure HttpOnly session cookie
      res.cookie(SESSION_COOKIE_NAME, result.token, SESSION_COOKIE_OPTIONS);

      sendSuccess(
        res,
        {
          user: result.user,
          organization: result.organization,
        },
        200,
        "Logged in successfully"
      );
    } catch (error) {
      next(error);
    }
  };

  public logout = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const token = this.extractToken(req);
      if (token) {
        await authService.logout(token);
      }

      // Clear session cookie
      res.clearCookie(SESSION_COOKIE_NAME, {
        ...SESSION_COOKIE_OPTIONS,
        maxAge: 0,
      });

      sendSuccess(res, { loggedOut: true }, 200, "Logged out successfully");
    } catch (error) {
      next(error);
    }
  };

  public me = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const token = this.extractToken(req);
      if (!token) {
        // If unauthenticated, return 401
        res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await authService.getCurrentUser(token);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  };
}

export const authController = new AuthController();
