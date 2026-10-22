import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";

describe("GET /api/v1/health", () => {
  it("should return HTTP 200 with healthy status and service metadata without external dependencies", async () => {
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("success", true);
    expect(response.body).toHaveProperty("data");
    expect(response.body.data).toMatchObject({
      status: "healthy",
      service: "grovastra-backend",
      version: "0.1.0",
    });
    expect(response.body.data).toHaveProperty("uptime");
    expect(response.body.data).toHaveProperty("timestamp");
    expect(typeof response.body.data.uptime).toBe("number");
  });
});
