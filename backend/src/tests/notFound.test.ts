import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";

describe("404 Unknown Route Handler", () => {
  it("should return HTTP 404 with standardized error response for non-existent routes", async () => {
    const response = await request(app).get("/api/v1/non-existent-route-endpoint");

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty("success", false);
    expect(response.body).toHaveProperty("error");
    expect(response.body.error).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(response.body.error.message).toContain("non-existent-route-endpoint");
    expect(response.body).toHaveProperty("timestamp");
  });
});
