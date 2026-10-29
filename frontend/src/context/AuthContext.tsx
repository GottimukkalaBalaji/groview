import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { User, Organization, SignupPayload, LoginPayload } from "../types/auth.js";
import { PlatformCapabilities, AssignedOrganizationSummary } from "../types/platform.js";
import { apiClient } from "../services/api.js";

const STORAGE_ACTIVE_SCOPED_ORG_KEY = "grovastra_active_scoped_org_id";

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  platformCapabilities: PlatformCapabilities | null;
  assignedOrganizations?: AssignedOrganizationSummary[];
  activeAssignedOrgId?: string | null;
  setActiveAssignedOrgId?: (orgId: string | null) => void;
  refreshAssignedOrganizations?: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [platformCapabilities, setPlatformCapabilities] = useState<PlatformCapabilities | null>(null);
  const [assignedOrganizations, setAssignedOrganizations] = useState<AssignedOrganizationSummary[]>([]);
  const [activeAssignedOrgId, setActiveAssignedOrgIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const setActiveAssignedOrgId = useCallback((orgId: string | null) => {
    setActiveAssignedOrgIdState(orgId);
    apiClient.setScopedOrganizationId(orgId);
    try {
      if (orgId) {
        sessionStorage.setItem(STORAGE_ACTIVE_SCOPED_ORG_KEY, orgId);
      } else {
        sessionStorage.removeItem(STORAGE_ACTIVE_SCOPED_ORG_KEY);
      }
    } catch {
      // Safe no-op in testing or restricted environments
    }
  }, []);

  const refreshAssignedOrganizations = useCallback(async (): Promise<void> => {
    try {
      const res = await apiClient.getMyAssignedOrganizations();
      if (res && res.success && Array.isArray(res.data)) {
        const orgs = res.data;
        setAssignedOrganizations(orgs);

        let chosenId: string | null = null;
        let storedId: string | null = null;
        try {
          storedId = sessionStorage.getItem(STORAGE_ACTIVE_SCOPED_ORG_KEY);
        } catch {
          storedId = null;
        }

        if (storedId && orgs.some((o) => o.id === storedId)) {
          chosenId = storedId;
        } else if (orgs.length > 0) {
          chosenId = orgs[0].id;
        } else {
          chosenId = null;
        }

        setActiveAssignedOrgId(chosenId);
      } else {
        setAssignedOrganizations([]);
        setActiveAssignedOrgId(null);
      }
    } catch {
      setAssignedOrganizations([]);
      setActiveAssignedOrgId(null);
    }
  }, [setActiveAssignedOrgId]);

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
        const caps = capsRes.value.data;
        setPlatformCapabilities(caps);

        if (caps.platformRole === "DELEGATED_ADMIN") {
          await refreshAssignedOrganizations();
        } else {
          setAssignedOrganizations([]);
          setActiveAssignedOrgId(null);
        }
      } else {
        setPlatformCapabilities(null);
        setAssignedOrganizations([]);
        setActiveAssignedOrgId(null);
      }
    } catch {
      setUser(null);
      setOrganization(null);
      setPlatformCapabilities(null);
      setAssignedOrganizations([]);
      setActiveAssignedOrgId(null);
    } finally {
      setIsLoading(false);
    }
  }, [refreshAssignedOrganizations, setActiveAssignedOrgId]);

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
          const caps = capsRes.data;
          setPlatformCapabilities(caps);
          if (caps.platformRole === "DELEGATED_ADMIN") {
            await refreshAssignedOrganizations();
          } else {
            setAssignedOrganizations([]);
            setActiveAssignedOrgId(null);
          }
        } else {
          setPlatformCapabilities(null);
          setAssignedOrganizations([]);
          setActiveAssignedOrgId(null);
        }
      } catch {
        setPlatformCapabilities(null);
        setAssignedOrganizations([]);
        setActiveAssignedOrgId(null);
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
          setAssignedOrganizations([]);
          setActiveAssignedOrgId(null);
        } else {
          setPlatformCapabilities(null);
          setAssignedOrganizations([]);
          setActiveAssignedOrgId(null);
        }
      } catch {
        setPlatformCapabilities(null);
        setAssignedOrganizations([]);
        setActiveAssignedOrgId(null);
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
      setAssignedOrganizations([]);
      setActiveAssignedOrgId(null);
      try {
        sessionStorage.removeItem(STORAGE_ACTIVE_SCOPED_ORG_KEY);
      } catch {
        // Safe no-op
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        platformCapabilities,
        assignedOrganizations,
        activeAssignedOrgId,
        setActiveAssignedOrgId,
        refreshAssignedOrganizations,
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
