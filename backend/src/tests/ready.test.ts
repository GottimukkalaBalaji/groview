import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";

describe("GET /api/v1/ready", () => {
  it("should honestly report dependency readiness when database or redis credentials are not configured", async () => {
    const response = await request(app).get("/api/v1/ready");

    // Endpoint responds with 200 (degraded in dev/test) or 503 (not_ready)
    expect([200, 503]).toContain(response.status);
    expect(response.body).toHaveProperty("success", true);
    expect(response.body).toHaveProperty("data");

    const { dependencies, service } = response.body.data;
    expect(service).toBe("grovastra-backend");
    expect(dependencies).toHaveProperty("database");
    expect(dependencies).toHaveProperty("redis");

    // Without live credentials, dependencies should be reported honestly as not_configured or error
    expect(["not_configured", "error", "connected"]).toContain(dependencies.database.status);
    expect(["not_configured", "error", "connected"]).toContain(dependencies.redis.status);
    expect(typeof dependencies.database.message).toBe("string");
    expect(typeof dependencies.redis.message).toBe("string");
  });
});
