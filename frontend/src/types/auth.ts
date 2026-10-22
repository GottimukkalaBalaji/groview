import { PlatformRole } from "./platform.js";

export interface User {
  id: string;
  organizationId: string;
  email: string;
  firstName: string;
  lastName: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
  platformRole?: PlatformRole;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface AuthResponse {
  user: User;
  organization: Organization;
}

export interface SignupPayload {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
  organizationName: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}
