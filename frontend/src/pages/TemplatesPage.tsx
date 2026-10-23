import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Smartphone, ArrowLeft, FileText } from "lucide-react";
import { WhatsAppTemplate, TemplateSyncSummary } from "../types/template.js";
import { TemplateList } from "../components/TemplateList.js";
import { TemplateEditor } from "../components/TemplateEditor.js";
import { TemplateStudioAuthoring, DRAFTS_STORAGE_KEY } from "../components/TemplateStudioAuthoring.js";
import { WhatsAppPhonePreview } from "../components/WhatsAppPhonePreview.js";
import { apiClient } from "../services/api.js";
import { isAllowedTestTemplate, addAllowedTestTemplate } from "../constants/templateAllowlist.js";
import { useAuth } from "../context/AuthContext.js";

export function parseLocalDrafts(raw: string | null): WhatsAppTemplate[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
      ? [parsed]
      : [];

    return list
      .filter((d) => d && typeof d === "object" && (d.name || d.body))
      .map((d: any, idx: number) => {
        const varKeys =
          d.variables && typeof d.variables === "object"
            ? Array.isArray(d.variables)
              ? d.variables.map((v: any) => v.key || String(v))
              : Object.keys(d.variables)
            : [];

        const templateVariables = varKeys.map((k: string) => ({
          key: k,
          fallbackValue:
            (d.variables && !Array.isArray(d.variables) && d.variables[k]) ||
            `Value {{${k}}}`,
          sampleValue:
            (d.variables && !Array.isArray(d.variables) && d.variables[k]) ||
            `Sample {{${k}}}`,
        }));

        const isMedia =
          d.headerType === "IMAGE" ||
          d.headerType === "VIDEO" ||
          d.headerType === "DOCUMENT";

        return {
          id: d.id || `local-draft-${d.name || idx}`,
          name: d.name || `draft_${idx + 1}`,
          language: d.language || "en_US",
          category: d.category || "MARKETING",
          status: "LOCAL_DRAFT" as const,
          isSendable: false,
          isLocalDraft: true,
          lastUpdated: d.updatedAt || d.lastUpdated || new Date().toISOString(),
          header: {
            type:
              d.headerType ||
              (d.header && (d.header.format || d.header.type)) ||
              "NONE",
            text:
              d.headerType === "TEXT"
                ? d.headerText
                : (d.header && d.header.text) || undefined,
            mediaUrl: isMedia
              ? d.headerMediaUrl || (d.header && d.header.mediaUrl) || undefined
              : undefined,
            mediaFilename: d.headerMediaFilename,
            mediaFilesize: d.headerMediaFilesize,
            mediaIsLocal:
              d.headerMediaIsLocal ||
              (d.headerMediaUrl && d.headerMediaUrl.startsWith("blob:")),
            mimeType: d.headerMediaMimeType,
          },
          body: d.body || "",
          variables: templateVariables,
          footer: d.footer || undefined,
          buttons: Array.isArray(d.buttons)
            ? d.buttons.map((b: any, bIdx: number) => ({
                id: b.id || `btn-draft-${bIdx}`,
                type: b.type,
                text: b.text || "",
                url: b.url,
                phoneNumber: b.phoneNumber || b.phone_number,
              }))
            : [],
        };
      });
  } catch (err) {
    console.warn("Failed to parse local template drafts from localStorage:", err);
    return [];
  }
}

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

  const [metaTemplates, setMetaTemplates] = useState<WhatsAppTemplate[]>([]);
  const [localDrafts, setLocalDrafts] = useState<WhatsAppTemplate[]>(() => {
    try {
      return parseLocalDrafts(localStorage.getItem(DRAFTS_STORAGE_KEY));
    } catch {
      return [];
    }
  });
  const [summary, setSummary] = useState<TemplateSyncSummary | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<WhatsAppTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null);
  const [isAuthoring, setIsAuthoring] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<"DETAILS" | "PREVIEW">("DETAILS");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Synchronize templates on page load
  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    // Refresh local drafts from browser storage
    try {
      const drafts = parseLocalDrafts(localStorage.getItem(DRAFTS_STORAGE_KEY));
      setLocalDrafts(drafts);
    } catch {
      // Ignore storage read error
    }

    try {
      const res = await apiClient.listTemplates();
      if (res.data && Array.isArray(res.data.templates)) {
        res.data.templates.forEach((t: any) => {
          if (t?.name) addAllowedTestTemplate(t.name);
        });
        const allowlisted = res.data.templates.filter((t: any) => isAllowedTestTemplate(t.name));
        const mapped = allowlisted.map(mapNormalizedToFrontend);
        setMetaTemplates(mapped);
        setSummary(res.data.summary);
      } else {
        setMetaTemplates([]);
      }
    } catch (err: unknown) {
      console.warn("Unable to fetch templates from Meta Cloud API:", err);
      setLoadError(
        err instanceof Error
          ? err.message
          : "Failed to connect to Meta WhatsApp Cloud API. Please ensure Meta credentials are configured."
      );
      setMetaTemplates([]);
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
        res.data.templates.forEach((t: any) => {
          if (t?.name) addAllowedTestTemplate(t.name);
        });
        const allowlisted = res.data.templates.filter((t: any) => isAllowedTestTemplate(t.name));
        const mapped = allowlisted.map(mapNormalizedToFrontend);
        setMetaTemplates(mapped);
        setSummary(res.data.summary);
      }
      // Keep local drafts synchronized
      const drafts = parseLocalDrafts(localStorage.getItem(DRAFTS_STORAGE_KEY));
      setLocalDrafts(drafts);
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

  const allTemplates = useMemo(() => {
    // If a template exists on Meta, prefer the real Meta template over an unsubmitted local draft
    const metaNames = new Set(metaTemplates.map((t) => t.name));
    const uniqueLocalDrafts = localDrafts.filter((d) => !metaNames.has(d.name));
    return [...uniqueLocalDrafts, ...metaTemplates];
  }, [localDrafts, metaTemplates]);

  const handleSelectTemplate = (template: WhatsAppTemplate) => {
    setActiveTemplate({ ...template });
    setIsAuthoring(false);
    setMobileTab("DETAILS");
  };

  const handleEditDraft = (template: WhatsAppTemplate) => {
    if (!isSuperAdmin) return;
    setEditingTemplate(template);
    setActiveTemplate(null);
    setIsAuthoring(true);
  };

  const handleDeleteDraft = (draftName: string) => {
    try {
      const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const updated = list.filter((d: any) => d && d.name !== draftName);
      localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(updated));
      setLocalDrafts(parseLocalDrafts(JSON.stringify(updated)));
    } catch (err) {
      console.warn("Failed to delete local draft:", err);
    }
  };

  const handleUpdateTemplatePreview = (updated: WhatsAppTemplate) => {
    setActiveTemplate(updated);
  };

  const handleCreateNew = () => {
    if (!isSuperAdmin) return;
    setEditingTemplate(null);
    setActiveTemplate(null);
    setIsAuthoring(true);
  };

  const handleBackFromStudio = () => {
    setIsAuthoring(false);
    setEditingTemplate(null);
    // Reload local drafts upon returning to Templates page
    try {
      const drafts = parseLocalDrafts(localStorage.getItem(DRAFTS_STORAGE_KEY));
      setLocalDrafts(drafts);
    } catch {
      // Ignore
    }
  };

  const handleDraftSaved = () => {
    try {
      const drafts = parseLocalDrafts(localStorage.getItem(DRAFTS_STORAGE_KEY));
      setLocalDrafts(drafts);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="templates-page-wrapper">
      {!activeTemplate && !isAuthoring ? (
        /* TEMPLATES LIST VIEW */
        <TemplateList
          templates={allTemplates}
          onSelectTemplate={handleSelectTemplate}
          summary={summary}
          onSync={handleSync}
          isSyncing={isSyncing}
          isLoading={isLoading}
          loadError={loadError}
          onRetry={fetchTemplates}
          canCreateTemplate={isSuperAdmin}
          onCreateNew={isSuperAdmin ? handleCreateNew : undefined}
          onEditDraft={isSuperAdmin ? handleEditDraft : undefined}
          onDeleteDraft={isSuperAdmin ? handleDeleteDraft : undefined}
        />
      ) : isAuthoring && isSuperAdmin ? (
        /* TEMPLATE STUDIO AUTHORING WORKSPACE */
        <TemplateStudioAuthoring
          onBack={handleBackFromStudio}
          initialTemplate={editingTemplate}
          onDraftSaved={handleDraftSaved}
        />
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
