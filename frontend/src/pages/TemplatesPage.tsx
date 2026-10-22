import React, { useState, useEffect, useCallback } from "react";
import { Smartphone, ArrowLeft, FileText } from "lucide-react";
import { WhatsAppTemplate, TemplateSyncSummary } from "../types/template.js";
import { TemplateList } from "../components/TemplateList.js";
import { TemplateEditor } from "../components/TemplateEditor.js";
import { TemplateStudioAuthoring } from "../components/TemplateStudioAuthoring.js";
import { WhatsAppPhonePreview } from "../components/WhatsAppPhonePreview.js";
import { apiClient } from "../services/api.js";
import { isAllowedTestTemplate } from "../constants/templateAllowlist.js";
import { useAuth } from "../context/AuthContext.js";

function mapNormalizedToFrontend(t: any): WhatsAppTemplate {
  const isApproved = t.status === "APPROVED";
  return {
    id: t.id,
    name: t.name,
    language: t.language || "en_US",
    category: t.category,
    status: t.status,
    isSendable: isApproved && t.isSendable !== false,
    lastUpdated: t.lastUpdated || new Date().toISOString(),
    header: {
      type: t.header?.format || t.header?.type || "NONE",
      text: t.header?.text,
      mediaUrl: t.header?.mediaUrl,
    },
    body: t.body,
    variables: (t.variables || []).map((v: any) => ({
      key: v.key,
      fallbackValue: v.fallbackValue || v.label || `Value {{${v.key}}}`,
      sampleValue: v.sampleValue || v.exampleValue || v.label || `Sample {{${v.key}}}`,
    })),
    footer: t.footer,
    buttons: (t.buttons || []).map((b: any, idx: number) => ({
      id: b.id || `btn-${idx}`,
      type: b.type,
      text: b.text,
      url: b.url,
      phoneNumber: b.phoneNumber || b.phone_number,
    })),
  };
}

export const TemplatesPage: React.FC = () => {
  const { user, platformCapabilities } = useAuth();
  const isSuperAdmin = Boolean(
    user?.platformRole === "PLATFORM_MASTER_ADMIN" ||
      (platformCapabilities?.isPlatformAdmin &&
        platformCapabilities?.platformRole === "PLATFORM_MASTER_ADMIN")
  );

  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [summary, setSummary] = useState<TemplateSyncSummary | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<WhatsAppTemplate | null>(null);
  const [isAuthoring, setIsAuthoring] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<"DETAILS" | "PREVIEW">("DETAILS");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Synchronize templates on page load
  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await apiClient.listTemplates();
      if (res.data && Array.isArray(res.data.templates)) {
        const allowlisted = res.data.templates.filter((t: any) => isAllowedTestTemplate(t.name));
        const mapped = allowlisted.map(mapNormalizedToFrontend);
        setTemplates(mapped);
        setSummary(res.data.summary);
      } else {
        setTemplates([]);
      }
    } catch (err: unknown) {
      console.warn("Unable to fetch templates from Meta Cloud API:", err);
      setLoadError(
        err instanceof Error
          ? err.message
          : "Failed to connect to Meta WhatsApp Cloud API. Please ensure Meta credentials are configured."
      );
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSync = async () => {
    setIsSyncing(true);
    setLoadError(null);
    try {
      const res = await apiClient.syncTemplates();
      if (res.data && Array.isArray(res.data.templates)) {
        const allowlisted = res.data.templates.filter((t: any) => isAllowedTestTemplate(t.name));
        const mapped = allowlisted.map(mapNormalizedToFrontend);
        setTemplates(mapped);
        setSummary(res.data.summary);
      }
    } catch (err: unknown) {
      console.error("Template synchronization error:", err);
      setLoadError(
        err instanceof Error
          ? err.message
          : "Failed to sync templates from Meta WhatsApp Business Account."
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSelectTemplate = (template: WhatsAppTemplate) => {
    setActiveTemplate({ ...template });
    setIsAuthoring(false);
    setMobileTab("DETAILS");
  };

  const handleUpdateTemplatePreview = (updated: WhatsAppTemplate) => {
    setActiveTemplate(updated);
  };

  const handleCreateNew = () => {
    if (!isSuperAdmin) return;
    setActiveTemplate(null);
    setIsAuthoring(true);
  };

  const handleBackFromStudio = () => {
    setIsAuthoring(false);
  };

  return (
    <div className="templates-page-wrapper">
      {!activeTemplate && !isAuthoring ? (
        /* TEMPLATES LIST VIEW */
        <TemplateList
          templates={templates}
          onSelectTemplate={handleSelectTemplate}
          summary={summary}
          onSync={handleSync}
          isSyncing={isSyncing}
          isLoading={isLoading}
          loadError={loadError}
          onRetry={fetchTemplates}
          canCreateTemplate={isSuperAdmin}
          onCreateNew={isSuperAdmin ? handleCreateNew : undefined}
        />
      ) : isAuthoring && isSuperAdmin ? (
        /* TEMPLATE STUDIO AUTHORING WORKSPACE */
        <TemplateStudioAuthoring onBack={handleBackFromStudio} />
      ) : activeTemplate ? (
        /* TEMPLATE INSPECTOR & LIVE PREVIEW WORKSPACE */
        <div className="template-workspace">
          {/* Breadcrumb Navigation Bar */}
          <div className="workspace-header-bar">
            <button
              type="button"
              className="btn-back-breadcrumb"
              onClick={() => setActiveTemplate(null)}
              aria-label="Back to templates list"
            >
              <ArrowLeft size={16} />
              <span>All Templates</span>
            </button>
            <div className="workspace-title-wrap">
              <span className="workspace-subtitle">Inspecting Template (Read-Only):</span>
              <span className="workspace-template-name">{activeTemplate.name}</span>
            </div>

            {/* Mobile Tab Switcher (Visible only on screens <= 1024px) */}
            <div className="mobile-view-switcher" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mobileTab === "DETAILS"}
                className={`tab-btn ${mobileTab === "DETAILS" ? "active" : ""}`}
                onClick={() => setMobileTab("DETAILS")}
              >
                <FileText size={14} />
                <span>Specification</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileTab === "PREVIEW"}
                className={`tab-btn ${mobileTab === "PREVIEW" ? "active" : ""}`}
                onClick={() => setMobileTab("PREVIEW")}
              >
                <Smartphone size={14} />
                <span>Live Preview</span>
              </button>
            </div>
          </div>

          {/* Two-Column Responsive Grid */}
          <div className="workspace-columns-grid">
            {/* Column 1: Inspector / Read-Only Specification */}
            <div
              className={`workspace-col-editor ${
                mobileTab === "PREVIEW" ? "hide-on-mobile" : ""
              }`}
            >
              <TemplateEditor
                template={activeTemplate}
                onChange={handleUpdateTemplatePreview}
                onCancel={() => setActiveTemplate(null)}
              />
            </div>

            {/* Column 2: Live WhatsApp Phone Preview */}
            <div
              className={`workspace-col-preview ${
                mobileTab === "DETAILS" ? "hide-on-mobile" : ""
              }`}
            >
              <WhatsAppPhonePreview template={activeTemplate} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
