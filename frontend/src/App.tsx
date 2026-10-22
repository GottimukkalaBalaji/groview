import React, { useState } from "react";
import { Sidebar } from "./components/Sidebar.js";
import { Header } from "./components/Header.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { TemplatesPage } from "./pages/TemplatesPage.js";
import { CampaignsPage } from "./pages/CampaignsPage.js";
import { ComingSoonPage } from "./pages/ComingSoonPage.js";
import { AudiencesPage } from "./pages/AudiencesPage.js";
import { AnalyticsPage } from "./pages/AnalyticsPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";
import { MasterAdminPage } from "./pages/MasterAdminPage.js";
import { AuthPage } from "./pages/AuthPage.js";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import { Sparkles, Loader2 } from "lucide-react";

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading, platformCapabilities } = useAuth();
  const [currentView, setCurrentView] = useState<string>("dashboard");
  const [isMobileNavOpen, setIsMobileNavOpen] = useState<boolean>(false);

  // While validating initial session cookie
  if (isLoading) {
    return (
      <div className="auth-loading-splash">
        <div className="auth-brand-icon">
          <Sparkles size={28} className="pulsing" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Loader2 size={16} className="spinning" color="var(--accent-emerald)" />
          <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
            Securing Grovastra session...
          </span>
        </div>
      </div>
    );
  }

  // Enforce customer authentication: redirect unauthenticated users to Login/Signup
  if (!isAuthenticated) {
    return <AuthPage initialMode="login" />;
  }

  const getHeaderProps = () => {
    switch (currentView) {
      case "dashboard":
        return {
          title: "Dashboard",
        };
      case "templates":
        return {
          title: "Message Templates",
        };
      case "campaigns":
        return {
          title: "WhatsApp Campaigns",
        };
      case "contacts":
        return {
          title: "Audiences & Contacts",
        };
      case "analytics":
        return {
          title: "Campaign Analytics",
        };
      case "settings":
        return {
          title: "Integration Settings",
        };
      case "master-admin":
        return {
          title: "Master Admin",
          badge: "Platform Control",
        };
      default:
        return {
          title: "Dashboard",
        };
    }
  };

  const headerProps = getHeaderProps();

  const renderContent = () => {
    switch (currentView) {
      case "dashboard":
        return <DashboardPage onNavigate={(view) => setCurrentView(view)} />;
      case "templates":
        return <TemplatesPage />;
      case "campaigns":
        return <CampaignsPage />;
      case "contacts":
        return <AudiencesPage />;
      case "analytics":
        return <AnalyticsPage onNavigate={(view) => setCurrentView(view)} />;
      case "settings":
        return <SettingsPage />;
      case "master-admin":
        return <MasterAdminPage />;
      default:
        return (
          <ComingSoonPage
            view={currentView}
            onNavigate={(view) => setCurrentView(view)}
          />
        );
    }
  };

  const canAccessMasterAdmin = Boolean(
    platformCapabilities?.canManageAllOrganizations || platformCapabilities?.isPlatformAdmin
  );

  return (
    <div className="app-container">
      <Sidebar
        currentView={currentView}
        onNavigate={(view) => setCurrentView(view)}
        isOpenMobile={isMobileNavOpen}
        onCloseMobile={() => setIsMobileNavOpen(false)}
        canAccessMasterAdmin={canAccessMasterAdmin}
      />

      <div className="main-wrapper">
        <Header
          title={headerProps.title}
          badge={headerProps.badge}
          onToggleMobileMenu={() => setIsMobileNavOpen(!isMobileNavOpen)}
        />

        {renderContent()}
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
