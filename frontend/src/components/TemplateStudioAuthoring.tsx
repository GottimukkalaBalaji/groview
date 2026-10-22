import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Lock,
  Plus,
  Trash2,
  Sliders,
  AlertCircle,
  FileText,
  Smartphone,
  Save,
  Upload,
  Image as ImageIcon,
  Video,
  Compass,
} from "lucide-react";
import { WhatsAppTemplate } from "../types/template.js";
import { WhatsAppPhonePreview } from "./WhatsAppPhonePreview.js";
import {
  TemplateStudioType,
  TEMPLATE_TYPE_OPTIONS,
  CarouselWorkspaceShell,
  CouponLtoWorkspaceShell,
  AuthenticationWorkspaceShell,
  FlowsWorkspaceShell,
  CommerceWorkspaceShell,
  AdvancedTypePhonePreview,
} from "./TemplateTypeShells.js";

export interface DraftButton {
  id: string;
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phoneNumber?: string;
}

export interface DraftState {
  name: string;
  category: "MARKETING" | "UTILITY";
  language: string;
  headerType: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  headerText: string;
  headerMediaUrl: string;
  headerMediaSource?: "URL" | "FILE";
  headerMediaFilename?: string;
  headerMediaFilesize?: string;
  headerMediaMimeType?: string;
  body: string;
  footer: string;
  buttons: DraftButton[];
  variables: Record<string, string>; // { "1": "Sample 1", "2": "Sample 2" }
  actionGuidance?: string;
}

// Media Limits and Validation Constants (Client-side validation rules)
export const MEDIA_LIMITS = {
  IMAGE: {
    maxBytes: 5 * 1024 * 1024, // 5 MB
    maxMb: 5,
    allowedMimes: ["image/jpeg", "image/png", "image/jpg", "image/gif"],
    allowedExtensions: [".jpg", ".jpeg", ".png", ".gif"],
    label: "JPEG or PNG (max 5 MB)",
  },
  VIDEO: {
    maxBytes: 16 * 1024 * 1024, // 16 MB
    maxMb: 16,
    allowedMimes: ["video/mp4"],
    allowedExtensions: [".mp4"],
    label: "MP4 video (max 16 MB)",
  },
  DOCUMENT: {
    maxBytes: 16 * 1024 * 1024, // 16 MB
    maxMb: 16,
    allowedMimes: ["application/pdf"],
    allowedExtensions: [".pdf"],
    label: "PDF document (max 16 MB)",
  },
  GIF: {
    maxBytes: 5 * 1024 * 1024, // 5 MB
    maxMb: 5,
    allowedMimes: ["image/gif"],
    allowedExtensions: [".gif"],
    label: "GIF (requires MP4 video for Meta templates)",
  },
} as const;

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const DEFAULT_DRAFT: DraftState = {
  name: "",
  category: "MARKETING",
  language: "en_US",
  headerType: "NONE",
  headerText: "",
  headerMediaUrl: "",
  headerMediaSource: "URL",
  body: "Hello {{1}}! Thank you for choosing Grovastra. Your special code is {{2}}.",
  footer: "Reply STOP to unsubscribe.",
  buttons: [
    {
      id: "btn-init-1",
      type: "URL",
      text: "Visit Store",
      url: "https://grovastra.com",
    },
    {
      id: "btn-init-2",
      type: "PHONE_NUMBER",
      text: "Call Support",
      phoneNumber: "+15551234567",
    },
  ],
  variables: {
    "1": "Priya",
    "2": "GROV20",
  },
  actionGuidance: "",
};

const DRAFTS_STORAGE_KEY = "grovastra_local_template_drafts_v1";

interface TemplateStudioAuthoringProps {
  onBack: () => void;
  onSelectTemplate?: (template: WhatsAppTemplate) => void;
}

export const TemplateStudioAuthoring: React.FC<TemplateStudioAuthoringProps> = ({
  onBack,
}) => {
  const [draft, setDraft] = useState<DraftState>(() => {
    try {
      const saved = localStorage.getItem(DRAFTS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { ...DEFAULT_DRAFT, ...parsed[0] };
        }
      }
    } catch {
      // Fallback on storage read error
    }
    return DEFAULT_DRAFT;
  });

  const [mobileTab, setMobileTab] = useState<"DETAILS" | "PREVIEW">("DETAILS");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showDiscardModal, setShowDiscardModal] = useState<boolean>(false);

  // Template Type Dropdown state
  const [selectedType, setSelectedType] = useState<TemplateStudioType>("STANDARD");
  const [savedDraftSnapshot, setSavedDraftSnapshot] = useState<DraftState>(() => draft);
  const [pendingTypeSwitch, setPendingTypeSwitch] = useState<TemplateStudioType | null>(null);
  const [showTypeSwitchModal, setShowTypeSwitchModal] = useState<boolean>(false);

  // Active blob object URL ref for local media preview cleanup
  const activeObjectURLRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Revoke object URLs on component unmount
  useEffect(() => {
    return () => {
      if (activeObjectURLRef.current) {
        URL.revokeObjectURL(activeObjectURLRef.current);
        activeObjectURLRef.current = null;
      }
    };
  }, []);

  // Check if standard draft has unsaved changes compared to snapshot
  const hasUnsavedStandardEdits = useMemo(() => {
    return JSON.stringify(draft) !== JSON.stringify(savedDraftSnapshot);
  }, [draft, savedDraftSnapshot]);

  const handleTypeDropdownChange = (targetType: TemplateStudioType) => {
    if (targetType === selectedType) return;

    // If currently on STANDARD and user has unsaved edits, warn before switching!
    if (selectedType === "STANDARD" && hasUnsavedStandardEdits) {
      setPendingTypeSwitch(targetType);
      setShowTypeSwitchModal(true);
      return;
    }

    // Otherwise, switch cleanly
    setSelectedType(targetType);
  };

  const handleCancelTypeSwitch = () => {
    setPendingTypeSwitch(null);
    setShowTypeSwitchModal(false);
  };

  const handleConfirmTypeSwitch = () => {
    if (pendingTypeSwitch) {
      setSelectedType(pendingTypeSwitch);
      // Discard unsaved changes and reset to saved snapshot
      setDraft(savedDraftSnapshot);
    }
    setPendingTypeSwitch(null);
    setShowTypeSwitchModal(false);
  };

  const handleRequestExit = () => {
    if (hasUnsavedStandardEdits) {
      setShowDiscardModal(true);
    } else {
      onBack();
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Extract positional variables {{1}}, {{2}} from body and text header
  const detectedVariableKeys = useMemo(() => {
    const combinedText = `${draft.headerType === "TEXT" ? draft.headerText : ""} ${draft.body}`;
    const matches = Array.from(combinedText.matchAll(/\{\{(\d+)\}\}/g));
    const uniqueKeys = Array.from(new Set(matches.map((m) => m[1]))).sort(
      (a, b) => Number(a) - Number(b)
    );
    return uniqueKeys;
  }, [draft.headerType, draft.headerText, draft.body]);

  // Keep variables map synchronized with detected keys
  useEffect(() => {
    setDraft((prev) => {
      let changed = false;
      const nextVars = { ...prev.variables };
      detectedVariableKeys.forEach((key) => {
        if (!nextVars[key]) {
          nextVars[key] = `Sample ${key}`;
          changed = true;
        }
      });
      return changed ? { ...prev, variables: nextVars } : prev;
    });
  }, [detectedVariableKeys]);

  // Reactive phone preview model - accurately mirrors user state without stock image injection
  const previewTemplate: WhatsAppTemplate = useMemo(() => {
    const variablesList = detectedVariableKeys.map((k) => ({
      key: k,
      fallbackValue: `{{${k}}}`,
      sampleValue: draft.variables[k] || `Sample ${k}`,
    }));

    const isMedia =
      draft.headerType === "IMAGE" ||
      draft.headerType === "VIDEO" ||
      draft.headerType === "DOCUMENT";

    return {
      id: "local-draft-preview",
      name: draft.name.trim() || "untitled_draft",
      language: draft.language,
      category: draft.category,
      status: "DRAFT",
      isSendable: false,
      header: {
        type: draft.headerType,
        text: draft.headerType === "TEXT" ? draft.headerText : undefined,
        mediaUrl: isMedia ? (draft.headerMediaUrl || undefined) : undefined,
        mediaFilename: isMedia ? draft.headerMediaFilename : undefined,
        mediaFilesize: isMedia ? draft.headerMediaFilesize : undefined,
        mediaIsLocal: draft.headerMediaSource === "FILE" || draft.headerMediaUrl?.startsWith("blob:"),
        mimeType: draft.headerMediaMimeType,
      },
      body: draft.body || "Message body will appear here...",
      footer: draft.footer.trim() || undefined,
      buttons: draft.buttons.map((b) => ({
        id: b.id,
        type: b.type,
        text:
          b.text ||
          (b.type === "URL"
            ? "Visit Website"
            : b.type === "PHONE_NUMBER"
            ? "Call Support"
            : "Quick Reply"),
        url: b.url,
        phoneNumber: b.phoneNumber,
      })),
      variables: variablesList,
    };
  }, [draft, detectedVariableKeys]);

  // Field change handlers
  const handleNameChange = (val: string) => {
    const sanitized = val.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setDraft((prev) => ({ ...prev, name: sanitized }));
    if (errors.name) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.name;
        return next;
      });
    }
  };

  const handleInsertVariable = () => {
    let nextNum = 1;
    if (detectedVariableKeys.length > 0) {
      const highest = Math.max(...detectedVariableKeys.map(Number));
      nextNum = highest + 1;
    }
    const tag = ` {{${nextNum}}} `;
    setDraft((prev) => ({
      ...prev,
      body: prev.body + tag,
    }));
  };

  // Media Source and File Handlers
  const handleMediaSourceToggle = (source: "URL" | "FILE") => {
    if (source === draft.headerMediaSource) return;
    if (source === "URL" && activeObjectURLRef.current) {
      URL.revokeObjectURL(activeObjectURLRef.current);
      activeObjectURLRef.current = null;
    }
    setDraft((prev) => ({
      ...prev,
      headerMediaSource: source,
      headerMediaUrl: source === "URL" && prev.headerMediaUrl.startsWith("blob:") ? "" : prev.headerMediaUrl,
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.headerMedia;
      return next;
    });
  };

  const handleMediaUrlChange = (val: string) => {
    if (activeObjectURLRef.current) {
      URL.revokeObjectURL(activeObjectURLRef.current);
      activeObjectURLRef.current = null;
    }
    setDraft((prev) => ({
      ...prev,
      headerMediaUrl: val,
      headerMediaFilename: undefined,
      headerMediaFilesize: undefined,
      headerMediaMimeType: undefined,
      headerMediaSource: "URL",
    }));
    if (errors.headerMedia) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.headerMedia;
        return next;
      });
    }
  };

  const handleRemoveFile = () => {
    if (activeObjectURLRef.current) {
      URL.revokeObjectURL(activeObjectURLRef.current);
      activeObjectURLRef.current = null;
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setDraft((prev) => ({
      ...prev,
      headerMediaUrl: "",
      headerMediaFilename: undefined,
      headerMediaFilesize: undefined,
      headerMediaMimeType: undefined,
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.headerMedia;
      return next;
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const headerType = draft.headerType;
    if (headerType !== "IMAGE" && headerType !== "VIDEO" && headerType !== "DOCUMENT") {
      return;
    }

    const limits = MEDIA_LIMITS[headerType];
    const extension = `.${file.name.split(".").pop()?.toLowerCase() || ""}`;
    const fileMime = file.type?.toLowerCase() || "";

    // 1. Size Validation
    if (file.size > limits.maxBytes) {
      setErrors((prev) => ({
        ...prev,
        headerMedia: `File "${file.name}" exceeds maximum allowed size of ${limits.maxMb} MB (${formatFileSize(file.size)}).`,
      }));
      return;
    }

    // 2. Format & MIME Validation
    if (headerType === "IMAGE") {
      const isAllowedExt = [".jpg", ".jpeg", ".png", ".gif"].includes(extension);
      const isAllowedMime = !fileMime || ["image/jpeg", "image/png", "image/jpg", "image/gif"].includes(fileMime);
      if (!isAllowedExt || !isAllowedMime) {
        setErrors((prev) => ({
          ...prev,
          headerMedia: `Unsupported image format. Allowed formats: JPEG, PNG, or GIF. Found: ${file.name}`,
        }));
        return;
      }
    } else if (headerType === "VIDEO") {
      const isAllowedExt = extension === ".mp4";
      const isAllowedMime = !fileMime || fileMime === "video/mp4";
      if (!isAllowedExt || !isAllowedMime) {
        setErrors((prev) => ({
          ...prev,
          headerMedia: `Unsupported video format. WhatsApp templates require MP4 video. Found: ${file.name}`,
        }));
        return;
      }
    } else if (headerType === "DOCUMENT") {
      const isAllowedExt = extension === ".pdf";
      const isAllowedMime = !fileMime || fileMime === "application/pdf";
      if (!isAllowedExt || !isAllowedMime) {
        setErrors((prev) => ({
          ...prev,
          headerMedia: `Unsupported document format. WhatsApp template headers only support PDF documents. Found: ${file.name}`,
        }));
        return;
      }
    }

    // Clear previous errors
    setErrors((prev) => {
      const next = { ...prev };
      delete next.headerMedia;
      return next;
    });

    // Revoke previous object URL
    if (activeObjectURLRef.current) {
      URL.revokeObjectURL(activeObjectURLRef.current);
      activeObjectURLRef.current = null;
    }

    const objectUrl = URL.createObjectURL(file);
    activeObjectURLRef.current = objectUrl;

    setDraft((prev) => ({
      ...prev,
      headerMediaUrl: objectUrl,
      headerMediaFilename: file.name,
      headerMediaFilesize: formatFileSize(file.size),
      headerMediaMimeType: file.type || undefined,
      headerMediaSource: "FILE",
    }));
  };

  const handleHeaderTypeChange = (newType: DraftState["headerType"]) => {
    if (newType === draft.headerType) return;
    if (activeObjectURLRef.current) {
      URL.revokeObjectURL(activeObjectURLRef.current);
      activeObjectURLRef.current = null;
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setDraft((prev) => ({
      ...prev,
      headerType: newType,
      headerMediaUrl: "",
      headerMediaFilename: undefined,
      headerMediaFilesize: undefined,
      headerMediaMimeType: undefined,
      headerMediaSource: "URL",
      headerText: newType === "TEXT" ? prev.headerText : "",
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.headerMedia;
      delete next.headerText;
      delete next.headerVars;
      return next;
    });
  };

  // Buttons Handlers (Maximum 3 buttons total, max 2 URL, max 1 Phone Number)
  const handleAddButton = () => {
    if (draft.buttons.length >= 3) return;
    const urlCount = draft.buttons.filter((b) => b.type === "URL").length;
    const phoneCount = draft.buttons.filter((b) => b.type === "PHONE_NUMBER").length;

    let nextType: "URL" | "PHONE_NUMBER" = "URL";
    if (urlCount >= 2 && phoneCount < 1) {
      nextType = "PHONE_NUMBER";
    } else if (urlCount >= 2 && phoneCount >= 1) {
      return; // All slots exhausted
    }

    const newBtn: DraftButton = {
      id: `btn-${Date.now()}`,
      type: nextType,
      text: nextType === "URL" ? "Visit Website" : "Call Support",
      url: nextType === "URL" ? "https://yourbrand.com" : undefined,
      phoneNumber: nextType === "PHONE_NUMBER" ? "+15551234567" : undefined,
    };
    setDraft((prev) => ({
      ...prev,
      buttons: [...prev.buttons, newBtn],
    }));
  };

  const handleUpdateButton = (id: string, updates: Partial<DraftButton>) => {
    setDraft((prev) => ({
      ...prev,
      buttons: prev.buttons.map((b) => {
        if (b.id !== id) return b;
        const updated = { ...b, ...updates };
        if (updates.type && updates.type !== b.type) {
          if (updates.type === "URL") {
            updated.url = updated.url || "https://yourbrand.com";
            updated.phoneNumber = undefined;
          } else if (updates.type === "PHONE_NUMBER") {
            updated.phoneNumber = updated.phoneNumber || "+15551234567";
            updated.url = undefined;
          }
        }
        return updated;
      }),
    }));
  };

  const handleRemoveButton = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      buttons: prev.buttons.filter((b) => b.id !== id),
    }));
  };

  const handleVariableSampleChange = (key: string, val: string) => {
    setDraft((prev) => ({
      ...prev,
      variables: {
        ...prev.variables,
        [key]: val,
      },
    }));
  };

  // Local draft validation
  const validateDraft = (): boolean => {
    const errs: Record<string, string> = {};

    if (!draft.name || draft.name.trim().length === 0) {
      errs.name = "Template name is required.";
    } else if (!/^[a-z0-9_]+$/.test(draft.name.trim())) {
      errs.name = "Template name must contain only lowercase letters, numbers, and underscores.";
    } else if (draft.name.length > 100) {
      errs.name = "Template name cannot exceed 100 characters.";
    }

    if (!draft.body || draft.body.trim().length === 0) {
      errs.body = "Message body text is required.";
    } else if (draft.body.length > 1024) {
      errs.body = `Message body exceeds Meta 1024 character limit (${draft.body.length}/1024).`;
    }

    // Meta Rule: Cannot start or end body with variable
    if (/^\s*\{\{\d+\}\}/.test(draft.body)) {
      errs.bodyVars = "Meta rule: Body text cannot begin directly with a variable. Add introductory text first.";
    } else if (/\{\{\d+\}\}\s*$/.test(draft.body)) {
      errs.bodyVars = "Meta rule: Body text cannot end with a variable. Add closing text or punctuation.";
    }

    // Meta Rule: Cannot have consecutive variables like {{1}}{{2}}
    if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(draft.body)) {
      errs.bodyConsecutive = "Meta rule: Variables cannot be placed consecutively without words between them.";
    }

    // Meta Rule: Variables must be strictly sequential starting from 1 with no missing numbers
    const sortedVarNums = detectedVariableKeys.map(Number);
    for (let i = 0; i < sortedVarNums.length; i++) {
      if (sortedVarNums[i] !== i + 1) {
        errs.variables = `Meta rule: Variables must be numbered sequentially starting from {{1}} without gaps. Found {{${sortedVarNums[i]}}} instead of {{${i + 1}}}.`;
        break;
      }
    }

    // Meta Rule: Sample values required for all detected variables
    detectedVariableKeys.forEach((key) => {
      const sample = draft.variables[key];
      if (!sample || sample.trim().length === 0) {
        errs[`var_sample_${key}`] = `Sample value for variable {{${key}}} is required.`;
      }
    });

    // Header validation
    if (draft.headerType === "TEXT") {
      if (draft.headerText.length > 60) {
        errs.headerText = "Header text cannot exceed 60 characters.";
      }
      const headerVars = Array.from(draft.headerText.matchAll(/\{\{(\d+)\}\}/g));
      if (headerVars.length > 1) {
        errs.headerVars = "Meta rule: Header can contain at most one variable.";
      }
    } else if (
      draft.headerType === "IMAGE" ||
      draft.headerType === "VIDEO" ||
      draft.headerType === "DOCUMENT"
    ) {
      if (draft.headerMediaSource === "URL" && draft.headerMediaUrl.trim().length > 0) {
        if (!/^https?:\/\//i.test(draft.headerMediaUrl.trim())) {
          errs.headerMedia = "Media URL must start with http:// or https://";
        }
      }
    }

    // Footer validation
    if (draft.footer && draft.footer.length > 60) {
      errs.footer = "Footer text cannot exceed 60 characters.";
    }
    if (draft.footer && /\{\{\d+\}\}/.test(draft.footer)) {
      errs.footerVars = "Meta rule: Footers cannot contain variables.";
    }

    // Buttons validation: Max 3 buttons total, max 2 URL, max 1 Phone Number
    if (draft.buttons.length > 3) {
      errs.buttons = "Meta rule: Templates can have at most 3 buttons total.";
    }

    const phoneBtnCount = draft.buttons.filter((b) => b.type === "PHONE_NUMBER").length;
    const urlBtnCount = draft.buttons.filter((b) => b.type === "URL").length;
    if (phoneBtnCount > 1) {
      errs.buttons = "Meta rule: Templates can have at most 1 Phone Number button.";
    }
    if (urlBtnCount > 2) {
      errs.buttons = "Meta rule: Templates can have at most 2 Website URL buttons.";
    }

    // Meta Rule: Unique button titles
    const buttonTexts = new Set<string>();
    draft.buttons.forEach((btn, idx) => {
      if (!btn.text || btn.text.trim().length === 0) {
        errs[`btn_${idx}_text`] = "Button title is required.";
      } else if (btn.text.length > 25) {
        errs[`btn_${idx}_text`] = "Button title cannot exceed 25 characters.";
      } else {
        const normalized = btn.text.trim().toLowerCase();
        if (buttonTexts.has(normalized)) {
          errs[`btn_${idx}_text`] = "Button title must be unique. Another button has the same label.";
        } else {
          buttonTexts.add(normalized);
        }
      }

      if (btn.type === "URL") {
        if (!btn.url || btn.url.trim().length === 0) {
          errs[`btn_${idx}_url`] = "Website URL is required.";
        } else if (!/^https?:\/\//i.test(btn.url.trim())) {
          errs[`btn_${idx}_url`] = "URL must start with http:// or https://";
        } else if (/^https?:\/\/\{\{\d+\}\}/i.test(btn.url.trim())) {
          errs[`btn_${idx}_url`] = "Meta rule: Domain cannot be a variable.";
        } else if (btn.url.length > 2000) {
          errs[`btn_${idx}_url`] = "Website URL cannot exceed 2000 characters.";
        } else {
          const urlVars = Array.from(btn.url.matchAll(/\{\{(\d+)\}\}/g));
          if (urlVars.length > 1) {
            errs[`btn_${idx}_url`] = "Meta rule: Website URL can contain at most one variable.";
          }
        }
      }

      if (btn.type === "PHONE_NUMBER") {
        if (!btn.phoneNumber || btn.phoneNumber.trim().length === 0) {
          errs[`btn_${idx}_phone`] = "Phone number is required.";
        } else if (!/^\+[1-9]\d{6,14}$/.test(btn.phoneNumber.replace(/[\s-]/g, ""))) {
          errs[`btn_${idx}_phone`] = "Phone number must be in E.164 format with country code (e.g. +919876543210).";
        }
      }
    });

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSaveDraft = () => {
    if (selectedType !== "STANDARD") {
      showToast("Cannot save: Advanced template types cannot be saved as Standard templates.");
      return;
    }

    if (!validateDraft()) {
      showToast("Please correct validation errors before saving draft.");
      return;
    }

    try {
      const existingRaw = localStorage.getItem(DRAFTS_STORAGE_KEY);
      const list: any[] = existingRaw ? JSON.parse(existingRaw) : [];
      // Do not persist temporary blob: URLs into durable storage
      const mediaUrlToPersist = draft.headerMediaUrl.startsWith("blob:") ? "" : draft.headerMediaUrl;
      const updatedList = [
        {
          ...draft,
          headerMediaUrl: mediaUrlToPersist,
          headerMediaIsLocal: draft.headerMediaSource === "FILE" || draft.headerMediaUrl.startsWith("blob:"),
          updatedAt: new Date().toISOString(),
          status: "LOCAL_DRAFT",
        },
        ...list.filter((d) => d.name !== draft.name),
      ];
      localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(updatedList));
      setSavedDraftSnapshot({ ...draft });
      showToast(`Draft "${draft.name}" saved locally.`);
    } catch {
      setSavedDraftSnapshot({ ...draft });
      showToast("Draft saved in session memory.");
    }
  };

  return (
    <div className="template-workspace">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className="toast-notification toast-success"
          role="status"
          style={{ position: "fixed", top: "1.5rem", right: "1.5rem", zIndex: 9999 }}
        >
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Type Switch Confirmation Modal */}
      {showTypeSwitchModal && pendingTypeSwitch && (
        <div className="modal-backdrop" onClick={handleCancelTypeSwitch}>
          <div
            className="modal-card confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: "480px" }}
          >
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <AlertCircle size={20} style={{ color: "var(--accent-amber)" }} />
                <span>Switch Template Type?</span>
              </h3>
            </div>
            <div className="modal-body">
              <p className="modal-text">
                You have unsaved changes in your current <strong>Standard Text / Media + Buttons</strong> draft.
              </p>
              <p className="modal-text" style={{ marginTop: "0.6rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Switching to <strong>{TEMPLATE_TYPE_OPTIONS.find((t) => t.id === pendingTypeSwitch)?.label}</strong> will discard your unsaved draft edits. Your entered text, variables, and buttons will be reset.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCancelTypeSwitch}
                id="cancel-type-switch-btn"
              >
                Stay on Current Editor
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleConfirmTypeSwitch}
                id="confirm-type-switch-btn"
              >
                Discard Changes & Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discard Confirmation Modal */}
      {showDiscardModal && (
        <div className="modal-backdrop" onClick={() => setShowDiscardModal(false)}>
          <div
            className="modal-card confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: "440px" }}
          >
            <div className="modal-header">
              <h3 className="modal-title">Leave Template Studio?</h3>
            </div>
            <div className="modal-body">
              <p className="modal-text">
                Any unsaved changes to this local draft will be discarded. Are you sure you want to return to the template list?
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowDiscardModal(false)}
              >
                Keep Editing
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={onBack}
                id="confirm-discard-btn"
              >
                Discard & Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb Navigation Bar */}
      <div className="workspace-header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-back-breadcrumb"
            onClick={handleRequestExit}
            aria-label="Back to templates list"
          >
            <ArrowLeft size={16} />
            <span>All Templates</span>
          </button>

          {/* Template Type Dropdown */}
          <div
            className="template-type-select-container"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "rgba(255, 255, 255, 0.03)",
              padding: "0.2rem 0.6rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <label
              htmlFor="template-type-select"
              style={{
                fontSize: "0.82rem",
                fontWeight: 600,
                color: "var(--text-secondary)",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                cursor: "pointer",
              }}
            >
              <Sliders size={13} style={{ color: "var(--accent-indigo-light)" }} />
              <span>Template Type:</span>
            </label>
            <select
              id="template-type-select"
              data-testid="template-type-select"
              className="form-input template-type-select"
              style={{
                width: "auto",
                minWidth: "260px",
                height: "34px",
                padding: "0.25rem 0.65rem",
                fontSize: "0.84rem",
                fontWeight: 600,
                color: "var(--text-primary)",
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
              value={selectedType}
              onChange={(e) => handleTypeDropdownChange(e.target.value as TemplateStudioType)}
            >
              <option value="STANDARD">Standard Text / Media + Buttons</option>
              <option value="CAROUSEL">Carousel</option>
              <option value="COUPON_LTO">Coupon / LTO</option>
              <option value="AUTHENTICATION">Authentication</option>
              <option value="FLOWS">WhatsApp Flows</option>
              <option value="COMMERCE">Commerce Integrations</option>
            </select>
          </div>

          <div className="workspace-title-wrap">
            <span className="workspace-subtitle">Super Admin Template Studio:</span>
            <span className="workspace-template-name">
              {draft.name || "New Template Draft"}
            </span>
          </div>
        </div>

        {/* Mobile Tab Switcher */}
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
        {/* Column 1: Authoring Form */}
        <div
          className={`workspace-col-editor ${
            mobileTab === "PREVIEW" ? "hide-on-mobile" : ""
          }`}
        >
          {selectedType === "STANDARD" ? (
            <div className="template-editor-container" data-testid="standard-editor-workspace">
            {/* Prominent Local Draft Banner */}
            <div
              className="local-draft-notice-banner"
              style={{
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                borderRadius: "var(--radius-md)",
                padding: "1rem 1.25rem",
                marginBottom: "1.5rem",
                display: "flex",
                alignItems: "flex-start",
                gap: "0.85rem",
              }}
              role="status"
              data-testid="local-draft-banner"
            >
              <div
                style={{
                  background: "rgba(245, 158, 11, 0.2)",
                  color: "var(--accent-amber)",
                  padding: "0.4rem",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "2px",
                }}
              >
                <Lock size={18} />
              </div>
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                    marginBottom: "0.25rem",
                  }}
                >
                  <strong style={{ fontSize: "0.95rem", color: "var(--text-primary)" }}>
                    Template Studio (Super Admin)
                  </strong>
                  <span
                    className="status-sub-pill"
                    style={{
                      background: "rgba(245, 158, 11, 0.15)",
                      color: "var(--accent-amber)",
                      fontWeight: 600,
                      fontSize: "0.68rem",
                      padding: "0.15rem 0.45rem",
                      borderRadius: "var(--radius-full)",
                    }}
                  >
                    Local Draft — Not Submitted to Meta
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.84rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                  }}
                >
                  This template is authored as a local draft. It has not been submitted to Meta, does not have an active Meta approval, and cannot be dispatched in broadcasts yet.
                </p>
              </div>
            </div>

            {/* Top Action Bar */}
            <div className="editor-top-actions">
              <div className="editor-heading-wrap">
                <h2 className="editor-heading">Template Specification</h2>
                <span
                  className="status-sub-pill"
                  style={{
                    background: "rgba(99, 102, 241, 0.12)",
                    color: "var(--accent-indigo-light)",
                    fontSize: "0.75rem",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "var(--radius-full)",
                  }}
                >
                  Interactive Authoring
                </span>
              </div>

              <div className="editor-action-buttons">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowDiscardModal(true)}
                >
                  <ArrowLeft size={14} style={{ marginRight: "0.35rem" }} />
                  <span>Exit</span>
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSaveDraft}
                  id="save-draft-btn"
                >
                  <Save size={14} style={{ marginRight: "0.35rem" }} />
                  <span>Save Local Draft</span>
                </button>
              </div>
            </div>

            <div className="editor-sections-stack">
              {/* SECTION 1: Basic Information */}
              <section className="editor-card">
                <h3 className="section-title-sm" style={{ marginBottom: "0.75rem" }}>
                  1. Basic Details
                </h3>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label htmlFor="draft-name" className="form-label">
                      Template Name <span style={{ color: "var(--accent-rose)" }}>*</span>
                    </label>
                    <input
                      id="draft-name"
                      type="text"
                      className="form-input"
                      placeholder="e.g. seasonal_promo_offer_v1"
                      value={draft.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                    />
                    <span className="input-hint">
                      Lowercase alphanumeric characters and underscores only.
                    </span>
                    {errors.name && (
                      <span className="input-error" style={{ color: "var(--accent-rose)", fontSize: "0.78rem" }}>
                        {errors.name}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="draft-category" className="form-label">
                      Category
                    </label>
                    <select
                      id="draft-category"
                      className="form-input"
                      value={draft.category}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          category: e.target.value as "MARKETING" | "UTILITY",
                        }))
                      }
                    >
                      <option value="MARKETING">Marketing (Promotions, Discounts)</option>
                      <option value="UTILITY">Utility (Order Alerts, Receipts)</option>
                    </select>
                    <span className="input-hint">
                      Meta template category classification.
                    </span>
                  </div>

                  <div className="form-group">
                    <label htmlFor="draft-language" className="form-label">
                      Language
                    </label>
                    <select
                      id="draft-language"
                      className="form-input"
                      value={draft.language}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, language: e.target.value }))
                      }
                    >
                      <option value="en_US">English (US) — en_US</option>
                      <option value="en_GB">English (UK) — en_GB</option>
                      <option value="hi">Hindi — hi</option>
                      <option value="es">Spanish — es</option>
                      <option value="pt_BR">Portuguese (BR) — pt_BR</option>
                    </select>
                    <span className="input-hint">
                      Language code for message localization.
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <input
                      type="text"
                      className="form-input"
                      value="LOCAL_DRAFT (Local Authoring)"
                      disabled
                      readOnly
                      style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        cursor: "not-allowed",
                        color: "var(--accent-amber)",
                        fontWeight: 500,
                      }}
                    />
                    <span className="input-hint">
                      Draft is stored locally and isolated from live broadcasts.
                    </span>
                  </div>
                </div>
              </section>

              {/* SECTION 2: Message Header */}
              <section className="editor-card">
                <h3 className="section-title-sm" style={{ marginBottom: "0.75rem" }}>
                  2. Message Header (Optional)
                </h3>
                <p className="section-desc" style={{ marginBottom: "1rem" }}>
                  Highlight your message with a bold text title or rich media header.
                </p>

                <div className="form-group" style={{ marginBottom: "1rem" }}>
                  <label className="form-label">Header Format</label>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {(["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"] as const).map(
                      (type) => (
                        <button
                          key={type}
                          type="button"
                          className={`btn-secondary ${
                            draft.headerType === type ? "active-pill-btn" : ""
                          }`}
                          style={
                            draft.headerType === type
                              ? {
                                  background: "rgba(99, 102, 241, 0.2)",
                                  borderColor: "var(--accent-indigo-light)",
                                  color: "var(--text-primary)",
                                }
                              : undefined
                          }
                          onClick={() => handleHeaderTypeChange(type)}
                        >
                          {type}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {draft.headerType === "TEXT" && (
                  <div className="form-group">
                    <label htmlFor="header-text-input" className="form-label">
                      Header Text ({draft.headerText.length}/60)
                    </label>
                    <input
                      id="header-text-input"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Special Announcement!"
                      value={draft.headerText}
                      maxLength={60}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, headerText: e.target.value }))
                      }
                    />
                    {errors.headerText && (
                      <span className="input-error" style={{ color: "var(--accent-rose)", fontSize: "0.78rem" }}>
                        {errors.headerText}
                      </span>
                    )}
                    {errors.headerVars && (
                      <span className="input-error" style={{ color: "var(--accent-rose)", fontSize: "0.78rem" }}>
                        {errors.headerVars}
                      </span>
                    )}
                  </div>
                )}

                {(draft.headerType === "IMAGE" ||
                  draft.headerType === "VIDEO" ||
                  draft.headerType === "DOCUMENT") && (
                  <div
                    className="media-header-controls"
                    data-testid="media-header-controls"
                    style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}
                  >
                    {/* Media Type Specification Banner */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                        padding: "0.5rem 0.75rem",
                        background: "rgba(255, 255, 255, 0.02)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-sm)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          fontSize: "0.8rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {draft.headerType === "IMAGE" && (
                          <ImageIcon size={15} style={{ color: "var(--accent-indigo-light)" }} />
                        )}
                        {draft.headerType === "VIDEO" && (
                          <Video size={15} style={{ color: "var(--accent-indigo-light)" }} />
                        )}
                        {draft.headerType === "DOCUMENT" && (
                          <FileText size={15} style={{ color: "var(--accent-indigo-light)" }} />
                        )}
                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                          {draft.headerType === "IMAGE"
                            ? "Image Header"
                            : draft.headerType === "VIDEO"
                            ? "Video Header"
                            : "Document Header"}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--accent-indigo-light)",
                          fontWeight: 500,
                        }}
                      >
                        {draft.headerType === "IMAGE" && "Allowed: JPEG, PNG, or GIF • Max 5 MB"}
                        {draft.headerType === "VIDEO" && "Allowed: MP4 (H.264 + AAC) • Max 16 MB"}
                        {draft.headerType === "DOCUMENT" && "Allowed: PDF only • Max 16 MB"}
                      </span>
                    </div>

                    {/* Source Toggle: URL vs File Upload */}
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        className={`btn-secondary ${
                          draft.headerMediaSource === "URL" ? "active-pill-btn" : ""
                        }`}
                        style={{
                          fontSize: "0.78rem",
                          padding: "0.3rem 0.75rem",
                          ...(draft.headerMediaSource === "URL"
                            ? {
                                background: "rgba(99, 102, 241, 0.2)",
                                borderColor: "var(--accent-indigo-light)",
                                color: "var(--text-primary)",
                              }
                            : {}),
                        }}
                        onClick={() => handleMediaSourceToggle("URL")}
                        id="media-source-url-btn"
                        data-testid="media-source-url-btn"
                      >
                        Provide Public URL
                      </button>
                      <button
                        type="button"
                        className={`btn-secondary ${
                          draft.headerMediaSource === "FILE" ? "active-pill-btn" : ""
                        }`}
                        style={{
                          fontSize: "0.78rem",
                          padding: "0.3rem 0.75rem",
                          ...(draft.headerMediaSource === "FILE"
                            ? {
                                background: "rgba(99, 102, 241, 0.2)",
                                borderColor: "var(--accent-indigo-light)",
                                color: "var(--text-primary)",
                              }
                            : {}),
                        }}
                        onClick={() => handleMediaSourceToggle("FILE")}
                        id="media-source-file-btn"
                        data-testid="media-source-file-btn"
                      >
                        <Upload size={13} style={{ marginRight: "0.25rem" }} />
                        Upload from Device (Local Preview)
                      </button>
                    </div>

                    {/* URL Input Mode */}
                    {draft.headerMediaSource === "URL" && (
                      <div className="form-group" style={{ margin: 0 }}>
                        <label htmlFor="header-media-url-input" className="form-label">
                          {draft.headerType === "IMAGE"
                            ? "Sample Image URL"
                            : draft.headerType === "VIDEO"
                            ? "Sample Video URL (MP4)"
                            : "Sample Document URL (PDF)"}
                        </label>
                        <input
                          id="header-media-url-input"
                          data-testid="header-media-url-input"
                          type="url"
                          className="form-input"
                          placeholder={
                            draft.headerType === "IMAGE"
                              ? "https://yourbrand.com/banner.jpg"
                              : draft.headerType === "VIDEO"
                              ? "https://yourbrand.com/promo.mp4"
                              : "https://yourbrand.com/catalog.pdf"
                          }
                          value={
                            draft.headerMediaUrl.startsWith("blob:") ? "" : draft.headerMediaUrl
                          }
                          onChange={(e) => handleMediaUrlChange(e.target.value)}
                        />
                        <span className="input-hint">
                          Exact URL used for preview. Never replaced with stock photo substitutes.
                        </span>
                        {errors.headerMedia && (
                          <span
                            className="input-error"
                            style={{ color: "var(--accent-rose)", fontSize: "0.78rem" }}
                          >
                            {errors.headerMedia}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Device Upload Mode */}
                    {draft.headerMediaSource === "FILE" && (
                      <div
                        className="file-upload-section"
                        data-testid="file-upload-section"
                        style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}
                      >
                        <input
                          ref={fileInputRef}
                          id="header-file-upload-input"
                          data-testid="header-file-upload-input"
                          type="file"
                          accept={
                            draft.headerType === "IMAGE"
                              ? "image/jpeg,image/png,image/jpg,image/gif,.jpg,.jpeg,.png,.gif"
                              : draft.headerType === "VIDEO"
                              ? "video/mp4,.mp4"
                              : "application/pdf,.pdf"
                          }
                          style={{ display: "none" }}
                          onChange={handleFileSelect}
                        />

                        {draft.headerMediaFilename ? (
                          <div
                            className="selected-file-card"
                            data-testid="selected-file-card"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "0.75rem 1rem",
                              background: "rgba(99, 102, 241, 0.06)",
                              border: "1px solid rgba(99, 102, 241, 0.25)",
                              borderRadius: "var(--radius-sm)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.6rem",
                                overflow: "hidden",
                              }}
                            >
                              {draft.headerType === "IMAGE" && (
                                <ImageIcon
                                  size={20}
                                  style={{ color: "var(--accent-indigo-light)", flexShrink: 0 }}
                                />
                              )}
                              {draft.headerType === "VIDEO" && (
                                <Video
                                  size={20}
                                  style={{ color: "var(--accent-indigo-light)", flexShrink: 0 }}
                                />
                              )}
                              {draft.headerType === "DOCUMENT" && (
                                <FileText
                                  size={20}
                                  style={{ color: "var(--accent-indigo-light)", flexShrink: 0 }}
                                />
                              )}
                              <div
                                style={{ display: "flex", flexDirection: "column", minWidth: 0 }}
                              >
                                <span
                                  data-testid="selected-file-name"
                                  style={{
                                    fontSize: "0.82rem",
                                    fontWeight: 600,
                                    color: "var(--text-primary)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {draft.headerMediaFilename}
                                </span>
                                <span
                                  data-testid="selected-file-size"
                                  style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}
                                >
                                  {draft.headerMediaFilesize} •{" "}
                                  {draft.headerMediaMimeType || "Local file"}
                                </span>
                              </div>
                            </div>

                            <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
                                onClick={() => fileInputRef.current?.click()}
                                id="replace-file-btn"
                                data-testid="replace-file-btn"
                              >
                                Replace
                              </button>
                              <button
                                type="button"
                                className="btn-icon-danger"
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: "var(--accent-rose)",
                                  cursor: "pointer",
                                  padding: "0.25rem",
                                }}
                                onClick={handleRemoveFile}
                                id="remove-file-btn"
                                data-testid="remove-file-btn"
                                title="Remove selected file"
                                aria-label="Remove selected file"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "1.5rem",
                              border: "2px dashed var(--border-subtle)",
                              borderRadius: "var(--radius-md)",
                              cursor: "pointer",
                              background: "rgba(255, 255, 255, 0.01)",
                              transition: "border-color 0.2s ease",
                            }}
                            id="file-drop-target"
                            data-testid="file-drop-target"
                          >
                            <Upload
                              size={24}
                              style={{
                                color: "var(--accent-indigo-light)",
                                marginBottom: "0.5rem",
                              }}
                            />
                            <span
                              style={{
                                fontSize: "0.84rem",
                                fontWeight: 600,
                                color: "var(--text-primary)",
                              }}
                            >
                              Choose a {draft.headerType.toLowerCase()} from your device
                            </span>
                            <span
                              style={{
                                fontSize: "0.74rem",
                                color: "var(--text-muted)",
                                marginTop: "0.2rem",
                              }}
                            >
                              {draft.headerType === "IMAGE" &&
                                "Supports JPEG, PNG, or GIF up to 5 MB"}
                              {draft.headerType === "VIDEO" && "Supports MP4 up to 16 MB"}
                              {draft.headerType === "DOCUMENT" && "Supports PDF up to 16 MB"}
                            </span>
                          </div>
                        )}

                        {/* Informational Guidance Callouts */}
                        {draft.headerType === "IMAGE" && (
                          <span className="input-hint" style={{ fontSize: "0.72rem" }}>
                            <strong>Note on GIFs:</strong> Direct .gif files are shown in local preview, but Meta WhatsApp template headers do not natively support direct GIF files and require MP4 video looping.
                          </span>
                        )}
                        {draft.headerType === "VIDEO" && (
                          <span className="input-hint" style={{ fontSize: "0.72rem" }}>
                            <strong>Video codecs:</strong> Browser validation checks the MP4 container. Ensure internal streams are H.264 video + AAC audio for Meta WhatsApp compatibility.
                          </span>
                        )}
                        {draft.headerType === "DOCUMENT" && (
                          <span className="input-hint" style={{ fontSize: "0.72rem" }}>
                            <strong>Document limits:</strong> WhatsApp template headers are restricted to PDF up to 16 MB.
                          </span>
                        )}

                        {/* Safety Boundary Notice: No remote upload */}
                        <div
                          style={{
                            padding: "0.4rem 0.6rem",
                            background: "rgba(255, 255, 255, 0.03)",
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "var(--radius-xs)",
                            fontSize: "0.7rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          🔒 <strong>Local Preview Only:</strong> Files remain on your device and are not uploaded to remote servers or Meta. Temporary object URLs are revoked on file change/unmount and are not persisted across page reloads.
                        </div>

                        {errors.headerMedia && (
                          <span
                            className="input-error"
                            style={{ color: "var(--accent-rose)", fontSize: "0.78rem" }}
                          >
                            {errors.headerMedia}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* SECTION 3: Message Body */}
              <section className="editor-card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                  }}
                >
                  <h3 className="section-title-sm" style={{ margin: 0 }}>
                    3. Message Body <span style={{ color: "var(--accent-rose)" }}>*</span>
                  </h3>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: "0.78rem", padding: "0.25rem 0.65rem" }}
                    onClick={handleInsertVariable}
                    id="add-variable-btn"
                  >
                    <Plus size={13} style={{ marginRight: "0.25rem" }} />
                    <span>Add Variable (&#123;&#123;n&#125;&#125;)</span>
                  </button>
                </div>

                <p className="section-desc" style={{ marginBottom: "0.75rem" }}>
                  Enter message text. Use <code>&#123;&#123;1&#125;&#125;</code>, <code>&#123;&#123;2&#125;&#125;</code> for recipient attributes. Formatting supported: <code>*bold*</code>, <code>_italic_</code>, <code>~strike~</code>.
                </p>

                <div className="form-group" style={{ margin: 0 }}>
                  <textarea
                    className="form-input"
                    rows={6}
                    value={draft.body}
                    maxLength={1024}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, body: e.target.value }))
                    }
                    placeholder="Type your message body here..."
                    style={{ fontFamily: "inherit", resize: "vertical" }}
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: "0.35rem",
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    <span>{detectedVariableKeys.length} variable(s) detected</span>
                    <span>{draft.body.length}/1024 chars</span>
                  </div>
                  {errors.body && (
                    <span className="input-error" style={{ color: "var(--accent-rose)", fontSize: "0.78rem" }}>
                      {errors.body}
                    </span>
                  )}
                  {errors.bodyVars && (
                    <span className="input-error" style={{ color: "var(--accent-rose)", fontSize: "0.78rem" }}>
                      {errors.bodyVars}
                    </span>
                  )}
                  {errors.bodyConsecutive && (
                    <span className="input-error" style={{ color: "var(--accent-rose)", fontSize: "0.78rem" }}>
                      {errors.bodyConsecutive}
                    </span>
                  )}
                  {errors.variables && (
                    <span className="input-error" style={{ color: "var(--accent-rose)", fontSize: "0.78rem" }}>
                      {errors.variables}
                    </span>
                  )}
                </div>
              </section>

              {/* SECTION 4: Interactive Sample Variables */}
              {detectedVariableKeys.length > 0 && (
                <section className="editor-card">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <Sliders size={16} color="var(--accent-indigo-light)" />
                    <h3 className="section-title-sm" style={{ margin: 0 }}>
                      4. Sample Variables (for preview)
                    </h3>
                  </div>

                  <p className="section-desc" style={{ marginBottom: "0.75rem" }}>
                    Sample values replace <code>&#123;&#123;n&#125;&#125;</code> placeholders in the preview phone screen on the right.
                  </p>

                  <div className="variables-fields-stack">
                    {detectedVariableKeys.map((key) => (
                      <div
                        key={key}
                        className="variable-row-card"
                        style={{
                          marginBottom: "0.75rem",
                          padding: "0.75rem",
                          background: "rgba(255, 255, 255, 0.02)",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            marginBottom: "0.4rem",
                          }}
                        >
                          <span className="var-chip">&#123;&#123;{key}&#125;&#125;</span>
                          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                            Sample value for Variable &#123;&#123;{key}&#125;&#125;
                          </span>
                        </div>
                        <input
                          type="text"
                          className="form-input"
                          placeholder={`Sample value for {{${key}}}`}
                          value={draft.variables[key] || ""}
                          onChange={(e) =>
                            handleVariableSampleChange(key, e.target.value)
                          }
                        />
                        {errors[`var_sample_${key}`] && (
                          <span className="input-error" style={{ color: "var(--accent-rose)", fontSize: "0.78rem", marginTop: "0.25rem", display: "block" }}>
                            {errors[`var_sample_${key}`]}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* SECTION 5: Footer */}
              <section className="editor-card">
                <h3 className="section-title-sm" style={{ marginBottom: "0.75rem" }}>
                  5. Footer Text (Optional)
                </h3>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="draft-footer" className="form-label">
                    Footer Text ({draft.footer.length}/60)
                  </label>
                  <input
                    id="draft-footer"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Reply STOP to unsubscribe."
                    value={draft.footer}
                    maxLength={60}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, footer: e.target.value }))
                    }
                  />
                  <span className="input-hint">
                    Appears in subtle text at the bottom of the WhatsApp bubble.
                  </span>
                  {errors.footer && (
                    <span className="input-error" style={{ color: "var(--accent-rose)", fontSize: "0.78rem" }}>
                      {errors.footer}
                    </span>
                  )}
                  {errors.footerVars && (
                    <span className="input-error" style={{ color: "var(--accent-rose)", fontSize: "0.78rem" }}>
                      {errors.footerVars}
                    </span>
                  )}
                </div>
              </section>

              {/* SECTION 6: Action Buttons */}
              <section className="editor-card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.75rem",
                  }}
                >
                  <h3 className="section-title-sm" style={{ margin: 0 }}>
                    6. Interactive Buttons ({draft.buttons.length}/3)
                  </h3>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: "0.78rem", padding: "0.25rem 0.65rem" }}
                    onClick={handleAddButton}
                    disabled={
                      draft.buttons.length >= 3 ||
                      (draft.buttons.filter((b) => b.type === "URL").length >= 2 &&
                        draft.buttons.filter((b) => b.type === "PHONE_NUMBER").length >= 1)
                    }
                    id="add-button-btn"
                    data-testid="add-button-btn"
                  >
                    <Plus size={13} style={{ marginRight: "0.25rem" }} />
                    <span>Add Button</span>
                  </button>
                </div>

                {errors.buttons && (
                  <span
                    className="input-error"
                    style={{
                      color: "var(--accent-rose)",
                      fontSize: "0.78rem",
                      display: "block",
                      marginBottom: "0.75rem",
                    }}
                  >
                    {errors.buttons}
                  </span>
                )}

                {draft.buttons.length === 0 ? (
                  <p className="section-desc" style={{ fontStyle: "italic", margin: 0 }}>
                    No buttons configured. Click &quot;Add Button&quot; to attach Website or Call CTA buttons.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {draft.buttons.map((btn, idx) => {
                      const urlCount = draft.buttons.filter((b) => b.type === "URL").length;
                      const phoneCount = draft.buttons.filter((b) => b.type === "PHONE_NUMBER").length;

                      return (
                        <div
                          key={btn.id}
                          data-testid={`button-editor-${idx}`}
                          style={{
                            padding: "0.85rem",
                            background: "rgba(255, 255, 255, 0.02)",
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "var(--radius-sm)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "0.6rem",
                            }}
                          >
                            <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                              Button #{idx + 1}
                            </span>
                            <button
                              type="button"
                              className="btn-icon-danger"
                              onClick={() => handleRemoveButton(btn.id)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "var(--accent-rose)",
                                cursor: "pointer",
                                padding: "0.2rem",
                              }}
                              title="Remove button"
                              aria-label={`Remove button ${idx + 1}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <div className="form-grid-2">
                            <div className="form-group">
                              <label className="form-label">Type</label>
                              <select
                                className="form-input"
                                value={btn.type}
                                data-testid={`button-type-select-${idx}`}
                                onChange={(e) =>
                                  handleUpdateButton(btn.id, {
                                    type: e.target.value as DraftButton["type"],
                                  })
                                }
                              >
                                {btn.type === "QUICK_REPLY" && (
                                  <option value="QUICK_REPLY" disabled>
                                    Legacy Quick Reply (Deprecated for Standard CTA)
                                  </option>
                                )}
                                <option
                                  value="URL"
                                  disabled={urlCount >= 2 && btn.type !== "URL"}
                                >
                                  Visit Website (URL){" "}
                                  {urlCount >= 2 && btn.type !== "URL" ? "(Limit 2 reached)" : ""}
                                </option>
                                <option
                                  value="PHONE_NUMBER"
                                  disabled={phoneCount >= 1 && btn.type !== "PHONE_NUMBER"}
                                >
                                  Call Phone Number{" "}
                                  {phoneCount >= 1 && btn.type !== "PHONE_NUMBER"
                                    ? "(Limit 1 reached)"
                                    : ""}
                                </option>
                              </select>
                            </div>

                            <div className="form-group">
                              <label className="form-label">Button Title (max 25)</label>
                              <input
                                type="text"
                                className="form-input"
                                value={btn.text}
                                maxLength={25}
                                onChange={(e) =>
                                  handleUpdateButton(btn.id, { text: e.target.value })
                                }
                                placeholder="Button label"
                              />
                              {errors[`btn_${idx}_text`] && (
                                <span
                                  className="input-error"
                                  style={{ color: "var(--accent-rose)", fontSize: "0.78rem" }}
                                >
                                  {errors[`btn_${idx}_text`]}
                                </span>
                              )}
                            </div>

                            {btn.type === "QUICK_REPLY" && (
                              <div
                                className="legacy-quick-reply-notice"
                                data-testid="legacy-quick-reply-notice"
                                style={{
                                  gridColumn: "1 / -1",
                                  padding: "0.5rem 0.75rem",
                                  background: "rgba(245, 158, 11, 0.08)",
                                  border: "1px solid rgba(245, 158, 11, 0.3)",
                                  borderRadius: "var(--radius-sm)",
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: "0.5rem",
                                  fontSize: "0.75rem",
                                  color: "var(--accent-amber)",
                                }}
                              >
                                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: "2px" }} />
                                <div>
                                  <strong>Legacy Quick Reply Detected:</strong> Meta standard templates require Call-to-Action buttons (URL or Phone Number). You can safely convert this button to URL or Phone Number above, or remove it.
                                </div>
                              </div>
                            )}

                            {btn.type === "URL" && (
                              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                                <label className="form-label">Website URL</label>
                                <input
                                  type="url"
                                  className="form-input"
                                  value={btn.url || ""}
                                  onChange={(e) =>
                                    handleUpdateButton(btn.id, { url: e.target.value })
                                  }
                                  placeholder="https://yourstore.com/order"
                                />
                                {errors[`btn_${idx}_url`] && (
                                  <span
                                    className="input-error"
                                    style={{ color: "var(--accent-rose)", fontSize: "0.78rem" }}
                                  >
                                    {errors[`btn_${idx}_url`]}
                                  </span>
                                )}
                              </div>
                            )}

                            {btn.type === "PHONE_NUMBER" && (
                              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                                <label className="form-label">
                                  Phone Number (E.164 with Country Code)
                                </label>
                                <input
                                  type="tel"
                                  className="form-input"
                                  value={btn.phoneNumber || ""}
                                  onChange={(e) =>
                                    handleUpdateButton(btn.id, { phoneNumber: e.target.value })
                                  }
                                  placeholder="+919876543210"
                                />
                                {errors[`btn_${idx}_phone`] && (
                                  <span
                                    className="input-error"
                                    style={{ color: "var(--accent-rose)", fontSize: "0.78rem" }}
                                  >
                                    {errors[`btn_${idx}_phone`]}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Directions / Action Guidance Section */}
                <div
                  className="action-guidance-card"
                  data-testid="action-guidance-card"
                  style={{
                    marginTop: "1.25rem",
                    padding: "1rem",
                    background: "rgba(99, 102, 241, 0.04)",
                    border: "1px solid rgba(99, 102, 241, 0.2)",
                    borderRadius: "var(--radius-md)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.6rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Compass size={16} style={{ color: "var(--accent-indigo-light)" }} />
                    <h4
                      style={{
                        margin: 0,
                        fontSize: "0.88rem",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      CTA Directions & Action Guidance
                    </h4>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.78rem",
                      color: "var(--text-secondary)",
                      lineHeight: 1.5,
                    }}
                  >
                    WhatsApp Call-to-Action (CTA) buttons trigger native device actions when tapped by the customer:
                  </p>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: "1.2rem",
                      fontSize: "0.76rem",
                      color: "var(--text-muted)",
                      lineHeight: 1.5,
                    }}
                  >
                    <li>
                      <strong style={{ color: "var(--text-primary)" }}>Website URL Buttons:</strong> Open the external URL directly in the customer&apos;s mobile web browser (e.g., Safari or Chrome). Supports dynamic URL paths (e.g. <code>https://brand.com/track/&#123;&#123;1&#125;&#125;</code>).
                    </li>
                    <li>
                      <strong style={{ color: "var(--text-primary)" }}>Phone Number Buttons:</strong> Immediately launch the customer&apos;s native device phone dialer with the prefilled E.164 number.
                    </li>
                  </ul>
                  <div
                    style={{
                      padding: "0.5rem 0.75rem",
                      background: "rgba(245, 158, 11, 0.08)",
                      border: "1px solid rgba(245, 158, 11, 0.25)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.74rem",
                      color: "var(--accent-amber)",
                      lineHeight: 1.4,
                    }}
                  >
                    <strong>Important:</strong> These buttons perform direct device actions (browser navigation or phone dialing). They do <em>not</em> send an automated in-chat reply or trigger chatbot follow-ups. Inbound reply-triggered automation is a future platform capability requiring webhook ingestion and conversational action routing.
                  </div>
                  <div className="form-group" style={{ marginTop: "0.4rem", margin: 0 }}>
                    <label
                      htmlFor="action-guidance-notes"
                      className="form-label"
                      style={{ fontSize: "0.78rem" }}
                    >
                      Author Action Notes (Optional Documentation)
                    </label>
                    <textarea
                      id="action-guidance-notes"
                      data-testid="action-guidance-notes"
                      className="form-input"
                      rows={2}
                      placeholder="e.g. Tapping Visit Website opens product landing page with campaign tracking UTM..."
                      value={draft.actionGuidance || ""}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, actionGuidance: e.target.value }))
                      }
                      style={{ fontSize: "0.78rem", resize: "vertical" }}
                    />
                    <span className="input-hint" style={{ fontSize: "0.7rem" }}>
                      Internal documentation for marketing and support teams. Not visible to end customers on WhatsApp.
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : selectedType === "CAROUSEL" ? (
          <CarouselWorkspaceShell onExit={handleRequestExit} />
        ) : selectedType === "COUPON_LTO" ? (
          <CouponLtoWorkspaceShell onExit={handleRequestExit} />
        ) : selectedType === "AUTHENTICATION" ? (
          <AuthenticationWorkspaceShell onExit={handleRequestExit} />
        ) : selectedType === "FLOWS" ? (
          <FlowsWorkspaceShell onExit={handleRequestExit} />
        ) : (
          <CommerceWorkspaceShell onExit={handleRequestExit} />
        )}
      </div>

      {/* Column 2: Live Phone Preview */}
      <div
        className={`workspace-col-preview ${
          mobileTab === "DETAILS" ? "hide-on-mobile" : ""
        }`}
      >
        {selectedType === "STANDARD" ? (
          <WhatsAppPhonePreview template={previewTemplate} />
        ) : (
          <AdvancedTypePhonePreview type={selectedType} />
        )}
      </div>
    </div>
  </div>
);
};
