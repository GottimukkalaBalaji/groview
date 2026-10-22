export interface ApiResponse<T = unknown> {
  success: true;
  message?: string;
  data: T;
  timestamp: string;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    stack?: string;
  };
  timestamp: string;
}

export interface HealthCheckResponse {
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

export interface ReadinessCheckResponse {
  status: "ready" | "not_ready" | "degraded";
  service: string;
  version: string;
  dependencies: {
    database: DependencyStatus;
    redis: DependencyStatus;
  };
  timestamp: string;
}
