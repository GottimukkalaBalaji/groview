export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; message: string }>;
  };
  timestamp: string;
}

export interface HealthData {
  status: "healthy" | "degraded" | "unhealthy";
  service: string;
  version: string;
  uptime: number;
  environment: string;
  timestamp: string;
}

export interface DependencyStatus {
  status: "connected" | "not_configured" | "error";
  message: string;
  latencyMs?: number;
}

export interface ReadinessData {
  status: "ready" | "not_ready" | "degraded";
  service: string;
  version: string;
  dependencies: {
    database: DependencyStatus;
    redis: DependencyStatus;
  };
  timestamp: string;
}

export type ConnectionState = "idle" | "loading" | "connected" | "error" | "degraded";
