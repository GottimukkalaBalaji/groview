import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { User, Organization, SignupPayload, LoginPayload } from "../types/auth.js";
import { PlatformCapabilities } from "../types/platform.js";
import { apiClient } from "../services/api.js";

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  platformCapabilities: PlatformCapabilities | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [platformCapabilities, setPlatformCapabilities] = useState<PlatformCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async () => {
    try {
      const [userRes, capsRes] = await Promise.allSettled([
        apiClient.getCurrentUser(),
        apiClient.getPlatformCapabilities(),
      ]);

      if (userRes.status === "fulfilled" && userRes.value.success && userRes.value.data) {
        setUser(userRes.value.data.user);
        setOrganization(userRes.value.data.organization);
      } else {
        setUser(null);
        setOrganization(null);
      }

      if (capsRes.status === "fulfilled" && capsRes.value.success && capsRes.value.data) {
        setPlatformCapabilities(capsRes.value.data);
      } else {
        setPlatformCapabilities(null);
      }
    } catch {
      setUser(null);
      setOrganization(null);
      setPlatformCapabilities(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (payload: LoginPayload): Promise<void> => {
    const response = await apiClient.login(payload);
    if (response.success && response.data) {
      setUser(response.data.user);
      setOrganization(response.data.organization);
      try {
        const capsRes = await apiClient.getPlatformCapabilities();
        if (capsRes.success && capsRes.data) {
          setPlatformCapabilities(capsRes.data);
        } else {
          setPlatformCapabilities(null);
        }
      } catch {
        setPlatformCapabilities(null);
      }
    }
  };

  const signup = async (payload: SignupPayload): Promise<void> => {
    const response = await apiClient.signup(payload);
    if (response.success && response.data) {
      setUser(response.data.user);
      setOrganization(response.data.organization);
      try {
        const capsRes = await apiClient.getPlatformCapabilities();
        if (capsRes.success && capsRes.data) {
          setPlatformCapabilities(capsRes.data);
        } else {
          setPlatformCapabilities(null);
        }
      } catch {
        setPlatformCapabilities(null);
      }
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await apiClient.logout();
    } finally {
      setUser(null);
      setOrganization(null);
      setPlatformCapabilities(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        platformCapabilities,
        isAuthenticated: !!user,
        isLoading,
        login,
        signup,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
