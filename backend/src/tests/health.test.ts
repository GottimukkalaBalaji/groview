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

  it("should permit CORS preflight OPTIONS request containing x-scoped-organization-id", async () => {
    const response = await request(app)
      .options("/api/v1/health")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "Content-Type,x-scoped-organization-id");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-headers"]).toContain("x-scoped-organization-id");
  });
});
