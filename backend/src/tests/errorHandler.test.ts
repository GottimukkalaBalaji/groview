import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { errorHandler } from "../middleware/errorHandler.js";
import { BadRequestError } from "../utils/errors.js";

describe("Centralized Error Handler Middleware", () => {
  it("should format AppError into standardized error JSON with appropriate status code", async () => {
    const testApp = express();
    testApp.use(express.json());

    testApp.get("/test-error", () => {
      throw new BadRequestError("Custom validation message", [
        { field: "testField", message: "Field is required" },
      ]);
    });

    testApp.use(errorHandler);

    const response = await request(testApp).get("/test-error");

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("success", false);
    expect(response.body.error).toMatchObject({
      code: "BAD_REQUEST",
      message: "Custom validation message",
      details: [{ field: "testField", message: "Field is required" }],
    });
    expect(response.body).toHaveProperty("timestamp");
  });

  it("should handle unexpected generic errors as 500 INTERNAL_SERVER_ERROR", async () => {
    const testApp = express();
    testApp.use(express.json());

    testApp.get("/test-generic-error", () => {
      throw new Error("Unexpected database crash simulation");
    });

    testApp.use(errorHandler);

    const response = await request(testApp).get("/test-generic-error");

    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty("success", false);
    expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
  });
});
