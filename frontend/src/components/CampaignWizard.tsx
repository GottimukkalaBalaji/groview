import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  Users,
  Sliders,
  Send,
  Smartphone,
  Edit3,
  Sparkles,
  Info,
  Lock,
  Save,
  AlertCircle,
  AlertTriangle,
  X,
  Loader2,
  RefreshCw,
  Clock,
  FileImage,
} from "lucide-react";
import { Campaign, CreateCampaignPayload, UpdateCampaignPayload } from "../types/campaign.js";
import { WhatsAppTemplate } from "../types/template.js";
import { ContactList } from "../types/contact.js";
import { PosterCampaignAttachment } from "../types/poster.js";
import { WhatsAppPhonePreview } from "./WhatsAppPhonePreview.js";
import { ApiClientError, apiClient } from "../services/api.js";
import { LaunchConfirmationModal } from "./LaunchConfirmationModal.js";
import { CampaignPosterPickerModal } from "./poster/CampaignPosterPickerModal.js";
import { isAllowedTestTemplate, getFriendlyTemplateName } from "../constants/templateAllowlist.js";
import {
  formatInBusinessTimezone,
  parseScheduleToUTC,
  isValidFutureSchedule,
  getDefaultScheduleInputs,
  DEFAULT_BUSINESS_TIMEZONE,
  BUSINESS_TIMEZONE_LABEL,
  MIN_SCHEDULE_LEAD_MS,
} from "../utils/timezone.js";

const fallbackEmptyTemplate: WhatsAppTemplate = {
  id: "",
  name: "No Approved Template Selected",
  language: "en_US",
  category: "MARKETING",
  status: "APPROVED",
  isSendable: false,
  header: { type: "NONE" },
  body: "No approved WhatsApp message template selected.",
  variables: [],
  buttons: [],
};

interface CampaignWizardProps {
  initialCampaign?: Campaign | null;
  posterAttachment?: PosterCampaignAttachment | null;
  onRemovePosterAttachment?: () => void;
  onSave: (payload: CreateCampaignPayload | UpdateCampaignPayload, isEdit: boolean) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
  onLaunch?: (payload: CreateCampaignPayload | UpdateCampaignPayload, isEdit: boolean) => Promise<void>;
  userId?: string | null;
}

export const CampaignWizard: React.FC<CampaignWizardProps> = ({
  initialCampaign,
  posterAttachment,
  onRemovePosterAttachment,
  onSave,
  onCancel,
  isSaving,
  onLaunch,
  userId,
}) => {
  const isEdit = Boolean(initialCampaign);

  // Stepper state
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [mobileTab, setMobileTab] = useState<"FORM" | "PREVIEW">("FORM");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Launch confirmation state in wizard
  const [showLaunchConfirm, setShowLaunchConfirm] = useState<boolean>(false);
  const [isLaunchingDraft, setIsLaunchingDraft] = useState<boolean>(false);
  const [launchDraftError, setLaunchDraftError] = useState<string | null>(null);

  // Unsaved changes & exit confirmation states
  const [showDiscardConfirm, setShowDiscardConfirm] = useState<boolean>(false);
  const [isSaveSuccess, setIsSaveSuccess] = useState<boolean>(false);

  // Real audience lists state
  const [realAudiences, setRealAudiences] = useState<ContactList[]>([]);
  const [isLoadingAudiences, setIsLoadingAudiences] = useState<boolean>(true);

  // Live Meta WhatsApp templates state (strictly APPROVED only)
  const [availableTemplates, setAvailableTemplates] = useState<WhatsAppTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState<boolean>(true);
  const [isSyncingTemplates, setIsSyncingTemplates] = useState<boolean>(false);
  const [isValidatingParams, setIsValidatingParams] = useState<boolean>(false);

  // Media & Poster Attachment State
  const [attachedMedia, setAttachedMedia] = useState<PosterCampaignAttachment | null>(
    posterAttachment || null
  );
  const [isPosterPickerOpen, setIsPosterPickerOpen] = useState<boolean>(false);
  const [mediaDetachedNotice, setMediaDetachedNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (posterAttachment !== undefined) {
      setAttachedMedia(posterAttachment);
    }
  }, [posterAttachment]);

  // Stable clientRequestId generated once per logical create draft session
  const clientRequestIdRef = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  );

  // Step 1: Basics
  const [name, setName] = useState<string>(
    initialCampaign?.name || (posterAttachment ? `Campaign - ${posterAttachment.title}` : "")
  );
  const [description, setDescription] = useState<string>(initialCampaign?.description || "");

  // Step 2: Template
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    initialCampaign?.templateId || ""
  );

  // Step 3: Audience
  const [selectedAudienceId, setSelectedAudienceId] = useState<string>(
    initialCampaign?.audienceId || ""
  );

  // Step 5: Scheduling state (defaults to Asia/Kolkata business timezone)
  const defaultSchedule = useMemo(() => getDefaultScheduleInputs(), []);
  const [dispatchMode, setDispatchMode] = useState<"NOW" | "SCHEDULE">(
    initialCampaign?.scheduledAt ? "SCHEDULE" : "NOW"
  );
  const [scheduleDate, setScheduleDate] = useState<string>(() => {
    if (initialCampaign?.scheduledAt) {
      try {
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: DEFAULT_BUSINESS_TIMEZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(initialCampaign.scheduledAt));
      } catch {
        return defaultSchedule.date;
      }
    }
    return defaultSchedule.date;
  });
  const [scheduleTime, setScheduleTime] = useState<string>(() => {
    if (initialCampaign?.scheduledAt) {
      try {
        return new Intl.DateTimeFormat("en-GB", {
          timeZone: DEFAULT_BUSINESS_TIMEZONE,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(initialCampaign.scheduledAt));
      } catch {
        return defaultSchedule.time;
      }
    }
    return defaultSchedule.time;
  });

  const { scheduledAtUtc, scheduleValidationError } = useMemo(() => {
    if (dispatchMode !== "SCHEDULE") {
      return { scheduledAtUtc: null, scheduleValidationError: null };
    }
    if (!scheduleDate || !scheduleTime) {
      return { scheduledAtUtc: null, scheduleValidationError: "Please specify both date and time." };
    }
    try {
      const utcString = parseScheduleToUTC(scheduleDate, scheduleTime);
      const isFuture = isValidFutureSchedule(utcString, MIN_SCHEDULE_LEAD_MS);
      if (!isFuture) {
        return {
          scheduledAtUtc: utcString,
          scheduleValidationError: "Scheduled time must be at least 5 minutes in the future (Asia/Kolkata timezone).",
        };
      }
      return { scheduledAtUtc: utcString, scheduleValidationError: null };
    } catch (err: unknown) {
      return {
        scheduledAtUtc: null,
        scheduleValidationError: err instanceof Error ? err.message : "Invalid schedule date/time.",
      };
    }
  }, [dispatchMode, scheduleDate, scheduleTime]);

  // Fetch real audience lists and live approved Meta templates for the authenticated organization
  useEffect(() => {
    let isMounted = true;

    const fetchAuds = async () => {
      try {
        const res = await apiClient.listAudiences();
        if (isMounted) {
          const lists = res?.data || [];
          setRealAudiences(lists);
          if (lists.length > 0 && !initialCampaign?.audienceId) {
            setSelectedAudienceId(lists[0].id);
          }
        }
      } catch (err) {
        console.warn("Failed to load real audience lists in wizard:", err);
        if (isMounted) setRealAudiences([]);
      } finally {
        if (isMounted) setIsLoadingAudiences(false);
      }
    };

    const fetchTemplates = async () => {
      try {
        const res = await apiClient.listTemplates(false, false);
        const rawTemplates = Array.isArray(res?.data) ? res?.data : (res?.data?.templates || []);
        if (isMounted && rawTemplates.length > 0) {
          // Strictly filter for ALLOWED testing templates only
          const allowlistedTemplates = rawTemplates.filter(
            (t: any) => isAllowedTestTemplate(t.name)
          );

          const mapped: WhatsAppTemplate[] = allowlistedTemplates.map((t: any) => {
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
                label: v.label,
                suggestedMapping: v.suggestedMapping,
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
          });

          setAvailableTemplates(mapped);

          // If not editing an existing campaign, auto-select first approved Meta template
          if (!initialCampaign?.templateId && mapped.length > 0) {
            const preferred =
              mapped.find((t) => t.name === "jaspers_market_order_confirmation_v1" && t.status === "APPROVED") ||
              mapped.find((t) => t.name === "jaspers_market_plain_text_v1" && t.status === "APPROVED") ||
              mapped.find((t) => t.name === "hello_world" && t.status === "APPROVED") ||
              mapped.find((t) => t.status === "APPROVED") ||
              mapped[0];

            if (preferred) {
              setSelectedTemplateId(preferred.id);
              const defaults: Record<string, string> = {};
              preferred.variables.forEach((v) => {
                defaults[v.key] = v.sampleValue || v.fallbackValue || "";
              });
              setVariablesMapping(defaults);
            }
          }
        }
      } catch (err) {
        console.warn("Failed to load live Meta templates in wizard:", err);
        if (isMounted) {
          setAvailableTemplates([]);
          setFormError("Unable to load templates from Meta Cloud API. Please verify WhatsApp connection in Settings.");
        }
      } finally {
        if (isMounted) setIsLoadingTemplates(false);
      }
    };

    fetchAuds();
    fetchTemplates();

    return () => {
      isMounted = false;
    };
  }, [initialCampaign]);

  const handleSyncTemplates = async () => {
    setIsSyncingTemplates(true);
    setFormError(null);
    try {
      const res = await apiClient.syncTemplates();
      const rawSync = Array.isArray(res.data) ? res.data : (res.data?.templates || []);
      if (rawSync.length > 0) {
        const allowlistedTemplates = rawSync.filter(
          (t: any) => isAllowedTestTemplate(t.name)
        );

        const mapped: WhatsAppTemplate[] = allowlistedTemplates.map((t: any) => {
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
              label: v.label,
              suggestedMapping: v.suggestedMapping,
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
        });

        setAvailableTemplates(mapped);
        if (!selectedTemplateId && mapped.length > 0) {
          setSelectedTemplateId(mapped[0].id);
        }
      }
    } catch (err: unknown) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Failed to sync templates from Meta WhatsApp Business Account."
      );
    } finally {
      setIsSyncingTemplates(false);
    }
  };

  // Only genuine, tenant-scoped contact lists
  const allAvailableAudiences = useMemo(() => {
    return realAudiences.map((l) => {
      const eligible = l.eligibleMemberCount !== undefined ? l.eligibleMemberCount : l.memberCount;
      return {
        id: l.id,
        name: l.name,
        description: l.description || "Verified organization audience list",
        count: eligible,
        totalCount: l.memberCount,
        eligibleCount: eligible,
        type: "CONTACT_LIST" as const,
        isReal: true,
        tags: ["Verified List", `${eligible.toLocaleString()} Opted-In`],
      };
    });
  }, [realAudiences]);

  // Selected entities with safe fallbacks
  const selectedTemplate: WhatsAppTemplate =
    availableTemplates.find((t) => t.id === selectedTemplateId || t.name === selectedTemplateId) ||
    availableTemplates[0] ||
    fallbackEmptyTemplate;

  const selectedAudience =
    allAvailableAudiences.find((a) => a.id === selectedAudienceId) ||
    allAvailableAudiences[0] ||
    null;

  // Step 4: Variable Mappings (initialized with template fallbacks or existing campaign mappings)
  const [variablesMapping, setVariablesMapping] = useState<Record<string, string>>(() => {
    if (initialCampaign?.variablesMapping) {
      const existing: Record<string, string> = {};
      Object.entries(initialCampaign.variablesMapping).forEach(([k, v]) => {
        existing[k] = String(v);
      });
      return existing;
    }
    const defaults: Record<string, string> = {};
    if (selectedTemplate && Array.isArray(selectedTemplate.variables)) {
      selectedTemplate.variables.forEach((v) => {
        defaults[v.key] = v.sampleValue || v.fallbackValue || "";
      });
    }
    return defaults;
  });

  // Whenever template changes, re-sync variable defaults and detach incompatible media
  const handleSelectTemplate = (template: WhatsAppTemplate) => {
    setSelectedTemplateId(template.id);
    const updatedVars: Record<string, string> = {};
    template.variables.forEach((v) => {
      updatedVars[v.key] = v.sampleValue || v.fallbackValue || "";
    });
    setVariablesMapping(updatedVars);

    // If switching to a template that does not support image headers, detach any attached media
    const isImageSupported = template.header?.type === "IMAGE";
    if (!isImageSupported && attachedMedia) {
      setAttachedMedia(null);
      onRemovePosterAttachment?.();
      setMediaDetachedNotice(
        `Poster attachment was detached because the selected template "${template.name}" does not support an image header (Header type: ${template.header?.type || "NONE"}).`
      );
    } else {
      setMediaDetachedNotice(null);
    }
  };

  // Variable input change handler
  const handleVariableChange = (key: string, val: string) => {
    setVariablesMapping((prev) => ({
      ...prev,
      [key]: val,
    }));
  };

  const isImageHeaderSupported = selectedTemplate.header?.type === "IMAGE";

  // Construct active template for real-time WhatsApp phone preview
  const livePreviewTemplate: WhatsAppTemplate = {
    ...selectedTemplate,
    header: isImageHeaderSupported
      ? attachedMedia
        ? {
            type: "IMAGE",
            mediaUrl: attachedMedia.dataUrl,
            mediaFilename: attachedMedia.title,
          }
        : {
            type: "IMAGE",
            mediaUrl: undefined,
            mediaFilename: undefined,
          }
      : selectedTemplate.header,
    variables: selectedTemplate.variables.map((v) => ({
      ...v,
      sampleValue: variablesMapping[v.key] ?? v.sampleValue ?? v.fallbackValue,
    })),
  };

  // Track initial state to accurately detect unsaved changes
  const initialName = initialCampaign?.name || "";
  const initialDescription = initialCampaign?.description || "";
  const initialTemplateId = initialCampaign?.templateId || availableTemplates[0]?.id || "";
  const initialAudienceId = initialCampaign?.audienceId || realAudiences[0]?.id || "";

  const initialVariables = useMemo(() => {
    if (initialCampaign?.variablesMapping) {
      const existing: Record<string, string> = {};
      Object.entries(initialCampaign.variablesMapping).forEach(([k, v]) => {
        existing[k] = String(v);
      });
      return existing;
    }
    const defaults: Record<string, string> = {};
    const tpl = availableTemplates.find((t) => t.id === initialTemplateId || t.name === initialTemplateId) || availableTemplates[0];
    tpl?.variables?.forEach((v) => {
      defaults[v.key] = v.sampleValue || v.fallbackValue || "";
    });
    return defaults;
  }, [initialCampaign, initialTemplateId, availableTemplates]);

  const isDirty = useMemo(() => {
    if (isSaveSuccess) return false;
    if (name !== initialName) return true;
    if (description !== initialDescription) return true;
    if (selectedTemplateId !== initialTemplateId) return true;
    if (selectedAudienceId !== initialAudienceId) return true;
    const curKeys = Object.keys(variablesMapping);
    const initKeys = Object.keys(initialVariables);
    if (curKeys.length !== initKeys.length) return true;
    for (const k of curKeys) {
      if (variablesMapping[k] !== initialVariables[k]) return true;
    }
    return false;
  }, [
    name,
    description,
    selectedTemplateId,
    selectedAudienceId,
    variablesMapping,
    initialName,
    initialDescription,
    initialTemplateId,
    initialAudienceId,
    initialVariables,
    isSaveSuccess,
  ]);

  // Warn on browser refresh/close if form has unsaved modifications
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && !isSaveSuccess) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, isSaveSuccess]);

  const handleRequestCancel = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onCancel();
    }
  };

  // Step Validation
  const validateCurrentStep = (): boolean => {
    setFormError(null);

    if (currentStep === 1) {
      const trimmed = name.trim();
      if (trimmed.length < 3) {
        setFormError("Campaign name must be at least 3 characters long.");
        return false;
      }
      if (trimmed.length > 100) {
        setFormError("Campaign name cannot exceed 100 characters.");
        return false;
      }
      if (description.length > 500) {
        setFormError("Campaign description cannot exceed 500 characters.");
        return false;
      }
    }

    if (currentStep === 2) {
      if (!selectedTemplate || !selectedTemplate.id) {
        setFormError("Please select an approved WhatsApp template to proceed.");
        return false;
      }
      if (!isAllowedTestTemplate(selectedTemplate.name)) {
        setFormError(
          `Template "${selectedTemplate.name}" is not a supported campaign template.`
        );
        return false;
      }
      if (selectedTemplate.status !== "APPROVED" || selectedTemplate.isSendable === false) {
        setFormError(
          `Template "${selectedTemplate.name}" is ${selectedTemplate.status} on Meta and cannot be sent. Only APPROVED templates can be selected.`
        );
        return false;
      }
    }

    if (currentStep === 3) {
      if (!selectedAudience || !selectedAudience.id) {
        setFormError("Please select a verified contact list to proceed.");
        return false;
      }
    }

    if (currentStep === 4) {
      for (const v of selectedTemplate.variables) {
        const val = variablesMapping[v.key];
        if (!val || val.trim().length === 0) {
          setFormError(
            `Please configure parameter {{${v.key}}} (${v.label || v.fallbackValue || "Required Parameter"}).`
          );
          return false;
        }
      }
    }

    return true;
  };

  const handleNext = async () => {
    if (!validateCurrentStep()) return;

    // When advancing from Step 4 (Variables), validate parameters against Meta template schema via backend
    if (currentStep === 4 && selectedTemplate.variables.length > 0) {
      setIsValidatingParams(true);
      setFormError(null);
      setFieldErrors({});
      try {
        const valRes = await apiClient.validateTemplateParameters(
          selectedTemplate.name,
          variablesMapping
        );
        if (!valRes.data.isValid) {
          const errors = valRes.data.errors || {};
          setFieldErrors(errors);
          const errList = Object.entries(errors).map(([k, v]) => `${k}: ${v}`);
          setFormError(`Parameter validation failed: ${errList.join("; ")}`);
          return;
        }
      } catch (err: unknown) {
        if (err instanceof ApiClientError && err.statusCode === 400) {
          setFormError(err.message);
          return;
        }
      } finally {
        setIsValidatingParams(false);
      }
    }

    if (currentStep < 5) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleBack = () => {
    setFormError(null);
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSaveDraft = async () => {
    if (!validateCurrentStep()) return;

    if (!selectedAudience || !selectedAudience.id) {
      setFormError("Please select a verified contact list to proceed.");
      setCurrentStep(3);
      return;
    }

    if (selectedTemplate.variables.length > 0) {
      setIsValidatingParams(true);
      try {
        const valRes = await apiClient.validateTemplateParameters(
          selectedTemplate.name,
          variablesMapping
        );
        if (!valRes.data.isValid) {
          const errors = valRes.data.errors || {};
          setFieldErrors(errors);
          const errList = Object.entries(errors).map(([k, v]) => `${k}: ${v}`);
          setFormError(`Template parameter validation failed: ${errList.join("; ")}`);
          setCurrentStep(4);
          return;
        }
      } catch (err: unknown) {
        if (err instanceof ApiClientError && err.statusCode === 400) {
          setFormError(err.message);
          setCurrentStep(4);
          return;
        }
      } finally {
        setIsValidatingParams(false);
      }
    }

    const payload: CreateCampaignPayload = {
      name: name.trim(),
      description: description.trim() || null,
      templateId: selectedTemplate.id,
      templateName: selectedTemplate.name,
      templateLanguage: selectedTemplate.language || "en_US",
      templateCategory: selectedTemplate.category || "MARKETING",
      variablesMapping,
      audienceType: "CONTACT_LIST",
      audienceId: selectedAudience.id,
      audienceName: selectedAudience.name,
      totalRecipients: selectedAudience.count,
      scheduledAt: dispatchMode === "SCHEDULE" ? scheduledAtUtc : null,
      clientRequestId: clientRequestIdRef.current,
    };

    try {
      setFormError(null);
      setFieldErrors({});
      await onSave(payload, isEdit);
      setIsSaveSuccess(true);
    } catch (err) {
      if (err instanceof ApiClientError && err.details && err.details.length > 0) {
        const errors: Record<string, string> = {};
        const messages: string[] = [];
        err.details.forEach((item) => {
          if (item.field) {
            errors[item.field] = item.message;
          }
          messages.push(item.field ? `${item.field}: ${item.message}` : item.message);
        });
        setFieldErrors(errors);
        setFormError(`Validation error: ${messages.join(" • ")}`);
        if (errors["name"] || errors["description"]) {
          setCurrentStep(1);
        } else if (errors["templateId"] || errors["templateName"]) {
          setCurrentStep(2);
        } else if (errors["audienceId"] || errors["totalRecipients"]) {
          setCurrentStep(3);
        }
      } else {
        setFormError(err instanceof Error ? err.message : "Failed to save campaign draft.");
      }
    }
  };

  const handleConfirmLaunchFromWizard = async () => {
    if (!onLaunch) return;
    if (!selectedAudience || !selectedAudience.id) {
      setLaunchDraftError("A verified contact list must be selected to launch.");
      return;
    }
    setIsLaunchingDraft(true);
    setLaunchDraftError(null);

    const payload: CreateCampaignPayload = {
      name: name.trim(),
      description: description.trim() || null,
      templateId: selectedTemplate.id,
      templateName: selectedTemplate.name,
      templateLanguage: selectedTemplate.language || "en_US",
      templateCategory: selectedTemplate.category || "MARKETING",
      variablesMapping,
      audienceType: "CONTACT_LIST",
      audienceId: selectedAudience.id,
      audienceName: selectedAudience.name,
      totalRecipients: selectedAudience.count,
      scheduledAt: dispatchMode === "SCHEDULE" ? scheduledAtUtc : null,
      clientRequestId: clientRequestIdRef.current,
    };

    try {
      await onLaunch(payload, isEdit);
      setShowLaunchConfirm(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to launch campaign.";
      setLaunchDraftError(msg);
    } finally {
      setIsLaunchingDraft(false);
    }
  };

  // Comprehensive launch readiness evaluation with clear prerequisite feedback
  const launchReadiness = useMemo(() => {
    const issues: string[] = [];

    // 1. Campaign Name
    if (name.trim().length < 3) {
      issues.push("Campaign name must be at least 3 characters long.");
    }

    // 2. Template
    if (!selectedTemplate || !selectedTemplate.id || !selectedTemplate.name) {
      issues.push("No template selected.");
    } else if (!isAllowedTestTemplate(selectedTemplate.name)) {
      issues.push(`Template "${selectedTemplate.name}" is not a supported campaign template.`);
    } else if (selectedTemplate.status !== "APPROVED" || selectedTemplate.isSendable === false) {
      issues.push(
        `Template "${selectedTemplate.name}" is not approved by Meta (${selectedTemplate.status}). Only APPROVED templates can be launched.`
      );
    }

    // 3. Variables
    if (selectedTemplate && Array.isArray(selectedTemplate.variables) && selectedTemplate.variables.length > 0) {
      for (const v of selectedTemplate.variables) {
        const val = variablesMapping[v.key];
        if (!val || val.trim().length === 0) {
          issues.push(`Missing required template variable {{${v.key}}} (${v.label || v.fallbackValue || "Required"}).`);
        }
      }
    }

    // 4. Audience
    if (!selectedAudience || !selectedAudience.id) {
      issues.push("No verified contact list selected.");
    } else if ((selectedAudience.count ?? 0) <= 0 && (selectedAudience.eligibleCount ?? 0) <= 0) {
      issues.push("Selected contact list has 0 eligible opted-in contacts.");
    }

    // 5. Scheduling verification
    if (dispatchMode === "SCHEDULE") {
      if (scheduleValidationError) {
        issues.push(scheduleValidationError);
      } else if (!scheduledAtUtc) {
        issues.push("A valid future schedule date and time is required.");
      }
    }

    return {
      isReady: issues.length === 0,
      issues,
    };
  }, [name, selectedTemplate, variablesMapping, selectedAudience, dispatchMode, scheduleValidationError, scheduledAtUtc]);

  const steps = [
    { num: 1, label: "Basics", icon: FileText },
    { num: 2, label: "Template", icon: Sparkles },
    { num: 3, label: "Audience", icon: Users },
    { num: 4, label: "Variables", icon: Sliders },
    { num: 5, label: "Review & Launch", icon: Send },
  ];

  return (
    <div className="campaign-wizard-wrapper">
      {/* Top Breadcrumb & Title Bar */}
      <div className="workspace-header-bar">
        <button
          type="button"
          className="btn-back-breadcrumb"
          onClick={handleRequestCancel}
          aria-label="Back to campaign list"
        >
          <ArrowLeft size={16} />
          <span>All Campaigns</span>
        </button>

        <div className="workspace-title-wrap">
          <span className="workspace-subtitle">
            {isEdit ? "Editing Draft:" : "Campaign Creation Wizard:"}
          </span>
          <span className="workspace-template-name">
            {name.trim() || "Untitled Campaign Draft"}
          </span>
        </div>

        {/* Mobile View Switcher (Only visible on screens <= 1024px in Steps 2-5) */}
        {currentStep >= 2 && (
          <div className="mobile-view-switcher" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mobileTab === "FORM"}
              className={`tab-btn ${mobileTab === "FORM" ? "active" : ""}`}
              onClick={() => setMobileTab("FORM")}
            >
              <Edit3 size={14} />
              <span>Form Details</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileTab === "PREVIEW"}
              className={`tab-btn ${mobileTab === "PREVIEW" ? "active" : ""}`}
              onClick={() => setMobileTab("PREVIEW")}
            >
              <Smartphone size={14} />
              <span>Live Phone Preview</span>
            </button>
          </div>
        )}
      </div>

      {/* 5-Step Stepper Progress Bar */}
      <nav className="wizard-stepper-bar" aria-label="Campaign Creation Steps">
        {steps.map((st) => {
          const isDone = st.num < currentStep;
          const isCurrent = st.num === currentStep;

          return (
            <button
              key={st.num}
              type="button"
              className={`wizard-step-node ${isCurrent ? "current" : isDone ? "completed" : "pending"}`}
              onClick={() => {
                if (st.num < currentStep) {
                  setCurrentStep(st.num);
                }
              }}
              disabled={st.num > currentStep}
              aria-current={isCurrent ? "step" : undefined}
            >
              <div className="step-circle">
                {isDone ? <Check size={14} /> : <span>{st.num}</span>}
              </div>
              <div className="step-text-col">
                <span className="step-num-label">Step {st.num}</span>
                <span className="step-name">{st.label}</span>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Validation Error Banner */}
      {formError && (
        <div className="wizard-error-banner" role="alert">
          <AlertCircle size={16} />
          <span>{formError}</span>
        </div>
      )}

      {/* Main Two-Column Grid */}
      <div className="wizard-two-col-layout">
        {/* Left Column: Interactive Step Form */}
        <div className={`wizard-form-col ${mobileTab === "PREVIEW" ? "hide-on-mobile" : ""}`}>
          {/* Campaign Media (WhatsApp Header) Section */}
          <div className="campaign-media-section" data-testid="campaign-media-section" style={{ marginBottom: "1.25rem" }}>
            {/* If template was switched and media detached, show notice */}
            {mediaDetachedNotice && (
              <div
                className="wizard-error-banner"
                role="alert"
                style={{
                  margin: "0 0 0.75rem 0",
                  background: "rgba(245, 158, 11, 0.1)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  color: "var(--accent-amber)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.6rem 0.85rem",
                  borderRadius: "6px",
                  fontSize: "0.82rem",
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{mediaDetachedNotice}</span>
              </div>
            )}

            {!isImageHeaderSupported ? (
              <div
                className="campaign-media-disabled-banner"
                data-testid="campaign-media-disabled-banner"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.65rem",
                  padding: "0.85rem 1rem",
                  borderRadius: "8px",
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-secondary)",
                  fontSize: "0.82rem",
                  lineHeight: 1.4,
                }}
              >
                <Info size={16} style={{ color: "var(--accent-indigo-light)", flexShrink: 0 }} />
                <span>
                  The selected template <strong>"{selectedTemplate.name}"</strong> does not support image headers (Header type: {selectedTemplate.header?.type || "NONE"}). Posters and image uploads are only available for templates with an IMAGE header.
                </span>
              </div>
            ) : (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    e.target.value = "";

                    if (!file.type.startsWith("image/")) {
                      setFormError("Please select a valid image file (PNG, JPEG, or WebP).");
                      return;
                    }

                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const dataUrl = event.target?.result as string;
                      if (!dataUrl) return;

                      const img = new Image();
                      img.onload = () => {
                        const width = img.naturalWidth || 1080;
                        const height = img.naturalHeight || 1080;

                        const newAttachment: PosterCampaignAttachment = {
                          blob: file,
                          dataUrl,
                          title: file.name.replace(/\.[^/.]+$/, ""),
                          width,
                          height,
                          presetId: "",
                          format: file.type.includes("jpeg") || file.type.includes("jpg") ? "jpeg" : "png",
                          filename: file.name,
                          createdAt: Date.now(),
                        };

                        setAttachedMedia(newAttachment);
                        setFormError(null);
                        setMediaDetachedNotice(null);
                      };
                      img.src = dataUrl;
                    };
                    reader.readAsDataURL(file);
                  }}
                  aria-label="Upload Image File"
                  data-testid="campaign-image-file-input"
                />

                {attachedMedia ? (
                  <div
                    className="campaign-attached-poster-banner"
                    data-testid="attached-media-card"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "1rem",
                      padding: "0.85rem 1rem",
                      borderRadius: "8px",
                      background: "rgba(16, 185, 129, 0.08)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0, flex: 1 }}>
                      <img
                        src={attachedMedia.dataUrl}
                        alt={attachedMedia.title}
                        style={{
                          width: "48px",
                          height: "48px",
                          objectFit: "cover",
                          borderRadius: "6px",
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)" }}>
                            {attachedMedia.title}
                          </strong>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              padding: "0.1rem 0.4rem",
                              borderRadius: "4px",
                              background: "rgba(16, 185, 129, 0.15)",
                              color: "var(--accent-emerald-light)",
                            }}
                          >
                            {attachedMedia.width} × {attachedMedia.height} px ({attachedMedia.format.toUpperCase()})
                          </span>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              padding: "0.1rem 0.4rem",
                              borderRadius: "4px",
                              background: "rgba(255, 255, 255, 0.08)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {attachedMedia.presetId ? "Poster Studio" : "Uploaded Image"}
                          </span>
                          {Math.abs(attachedMedia.width / attachedMedia.height - 1.91) > 0.1 && (
                            <span
                              style={{
                                fontSize: "0.7rem",
                                padding: "0.1rem 0.4rem",
                                borderRadius: "4px",
                                background: "rgba(99, 102, 241, 0.15)",
                                color: "var(--accent-indigo-light)",
                              }}
                              title="Full composition preserved without cropping via contain mode"
                            >
                              Preserved in Contain Mode
                            </span>
                          )}
                        </div>
                        <p style={{ margin: "0.15rem 0 0 0", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          Attached for campaign preview in browser memory. (Note: WhatsApp Cloud API live send requires future media integration).
                        </p>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: "0.75rem", padding: "0.35rem 0.65rem" }}
                        onClick={() => setIsPosterPickerOpen(true)}
                        aria-label="Replace Poster"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: "0.75rem", padding: "0.35rem 0.65rem" }}
                        onClick={() => {
                          setAttachedMedia(null);
                          onRemovePosterAttachment?.();
                        }}
                        aria-label="Remove media"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="campaign-media-picker-card"
                    data-testid="campaign-media-picker-card"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.6rem",
                      padding: "0.9rem 1rem",
                      borderRadius: "8px",
                      background: "var(--bg-glass-card)",
                      border: "1px dashed var(--border-subtle)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <FileImage size={18} color="var(--accent-emerald)" />
                        <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)" }}>
                          Campaign Media (WhatsApp Header)
                        </span>
                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                          (No image selected)
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
                          onClick={() => fileInputRef.current?.click()}
                          aria-label="Upload Image"
                        >
                          <FileImage size={13} />
                          <span>Upload Image</span>
                        </button>

                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
                          onClick={() => setIsPosterPickerOpen(true)}
                          aria-label="Posters"
                        >
                          <Sparkles size={13} color="var(--accent-emerald)" />
                          <span>Posters</span>
                        </button>
                      </div>
                    </div>
                    <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      This template header requires an image. Attach a 1200×628 WhatsApp header design (or 1080×1080 poster) from Poster Studio or upload a local image to preview in your campaign's WhatsApp message header.
                    </p>
                  </div>
                )}

                {/* User-Isolated Saved Posters Picker Modal */}
                <CampaignPosterPickerModal
                  isOpen={isPosterPickerOpen}
                  onClose={() => setIsPosterPickerOpen(false)}
                  onSelectPoster={(poster) => {
                    setAttachedMedia(poster);
                    setIsPosterPickerOpen(false);
                    setFormError(null);
                    setMediaDetachedNotice(null);
                  }}
                  userId={userId}
                />
              </>
            )}
          </div>

          {/* STEP 1: CAMPAIGN BASICS */}
          {currentStep === 1 && (
            <div className="wizard-step-card">
              <div className="step-card-header">
                <div className="step-icon-wrap">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="step-heading">Step 1: Campaign Basics</h3>
                  <p className="step-desc">
                    Give your WhatsApp marketing broadcast a clear name and optional description for your team.
                  </p>
                </div>
              </div>

              <div className="form-field-group">
                <label htmlFor="campaign-name-input" className="form-label">
                  Campaign Name <span className="text-required">*</span>
                </label>
                <input
                  id="campaign-name-input"
                  type="text"
                  className={`form-input ${fieldErrors["name"] ? "form-input-error" : ""}`}
                  placeholder="e.g. Diwali Mega Flash Sale 2026"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (fieldErrors["name"]) {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next["name"];
                        return next;
                      });
                    }
                  }}
                  maxLength={100}
                  autoFocus
                />
                {fieldErrors["name"] && (
                  <div className="field-error-text" role="alert">
                    <AlertCircle size={12} />
                    <span>{fieldErrors["name"]}</span>
                  </div>
                )}
                <div className="field-hint-row">
                  <span className="field-hint">Required. Must be 3–100 characters.</span>
                  <span className="char-count">{name.length}/100</span>
                </div>
              </div>

              <div className="form-field-group">
                <label htmlFor="campaign-desc-input" className="form-label">
                  Description / Internal Notes <span className="text-optional">(Optional)</span>
                </label>
                <textarea
                  id="campaign-desc-input"
                  className={`form-textarea ${fieldErrors["description"] ? "form-input-error" : ""}`}
                  rows={3}
                  placeholder="Internal notes regarding promotional discount codes, target audience goals, or launch timeline..."
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    if (fieldErrors["description"]) {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next["description"];
                        return next;
                      });
                    }
                  }}
                  maxLength={500}
                />
                {fieldErrors["description"] && (
                  <div className="field-error-text" role="alert">
                    <AlertCircle size={12} />
                    <span>{fieldErrors["description"]}</span>
                  </div>
                )}
                <div className="field-hint-row">
                  <span className="field-hint">Maximum 500 characters.</span>
                  <span className="char-count">{description.length}/500</span>
                </div>
              </div>

              <div className="info-callout-box">
                <Info size={16} color="var(--accent-indigo-light)" />
                <span>
                  <strong>Draft Mode:</strong> Campaigns are created in <code>DRAFT</code> status. No messages will be dispatched until confirmed and approved.
                </span>
              </div>
            </div>
          )}

          {/* STEP 2: TEMPLATE SELECTION */}
          {currentStep === 2 && (
            <div className="wizard-step-card">
              <div className="step-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                  <div className="step-icon-wrap">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 className="step-heading">Step 2: Select Message Template</h3>
                    <p className="step-desc">
                      Choose from approved templates on Grovastra's shared WhatsApp platform account. Templates define structure, variables, and CTA buttons.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleSyncTemplates}
                  disabled={isLoadingTemplates || isSyncingTemplates}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
                  id="wizard-sync-templates-btn"
                >
                  <RefreshCw size={13} className={isSyncingTemplates ? "spinning" : ""} />
                  <span>{isSyncingTemplates ? "Syncing..." : "Sync from Meta"}</span>
                </button>
              </div>

              <div className="sync-status-bar glass-panel" style={{ marginBottom: "1rem", padding: "0.75rem 1rem", borderRadius: "8px", display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <Sparkles size={14} color="var(--accent-emerald)" />
                <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  Showing <strong>{availableTemplates.length} verified campaign templates</strong> ready for broadcast. Only Meta-approved templates can be launched.
                </span>
              </div>

              {isLoadingTemplates ? (
                <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--text-secondary)" }}>
                  <Loader2 size={24} className="spinning" style={{ margin: "0 auto 0.75rem auto" }} />
                  <span>Loading approved templates from Meta WhatsApp Business Account...</span>
                </div>
              ) : availableTemplates.length === 0 ? (
                <div className="empty-templates-card" style={{ padding: "3rem 1.5rem", textAlign: "center", background: "var(--bg-glass-card)", borderRadius: "8px", border: "1px dashed var(--border-subtle)" }}>
                  <Sparkles size={32} color="var(--accent-emerald)" style={{ margin: "0 auto 0.75rem auto" }} />
                  <h4 style={{ margin: "0 0 0.5rem 0" }}>No approved WhatsApp templates available</h4>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", maxWidth: "460px", margin: "0 auto 1.25rem auto", lineHeight: 1.5 }}>
                    Only templates with <strong>APPROVED</strong> status from Meta can be used in campaigns. If you recently created or updated templates in Meta Business Manager, click below to synchronize.
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSyncTemplates}
                    disabled={isSyncingTemplates}
                    style={{ fontSize: "0.82rem" }}
                  >
                    <RefreshCw size={13} className={isSyncingTemplates ? "spinning" : ""} style={{ marginRight: "0.4rem" }} />
                    <span>Sync from Meta</span>
                  </button>
                </div>
              ) : (
                <div className="template-picker-grid">
                  {availableTemplates.map((tpl) => {
                    const isSelected = tpl.id === selectedTemplateId;

                    return (
                      <div
                        key={tpl.id}
                        className={`template-picker-card ${isSelected ? "selected" : ""}`}
                        style={{
                          cursor: "pointer",
                          borderColor: isSelected ? "var(--accent-primary)" : undefined,
                        }}
                        onClick={() => {
                          setFormError(null);
                          handleSelectTemplate(tpl);
                        }}
                      >
                        <div className="picker-card-top">
                          <div className="picker-card-title-row" style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                            <span className="picker-tpl-name" style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                              {getFriendlyTemplateName(tpl.name)}
                            </span>
                            <code style={{ fontSize: "0.72rem", background: "rgba(255, 255, 255, 0.06)", padding: "0.15rem 0.4rem", borderRadius: "4px", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                              {tpl.name}
                            </code>
                            <span className="lang-tag">{tpl.language}</span>
                            {tpl.status === "APPROVED" ? (
                              <span
                                className="status-sub-pill"
                                style={{
                                  background: "rgba(16, 185, 129, 0.15)",
                                  color: "var(--accent-emerald)",
                                  fontSize: "0.68rem",
                                  fontWeight: 600,
                                }}
                              >
                                Approved by Meta
                              </span>
                            ) : (
                              <span
                                className="status-sub-pill"
                                style={{
                                  background: "rgba(244, 63, 94, 0.15)",
                                  color: "var(--accent-rose)",
                                  fontSize: "0.68rem",
                                  fontWeight: 600,
                                }}
                              >
                                {tpl.status || "Not Approved"}
                              </span>
                            )}
                            {!tpl.isSendable && (
                              <span
                                className="status-sub-pill"
                                style={{
                                  background: "rgba(245, 158, 11, 0.15)",
                                  color: "var(--accent-amber)",
                                  fontSize: "0.68rem",
                                  fontWeight: 600,
                                }}
                              >
                                Non-Sendable
                              </span>
                            )}
                          </div>
                          <span className="picker-tpl-category">{tpl.category}</span>
                        </div>

                        <p className="picker-tpl-body-preview">{tpl.body}</p>

                        <div className="picker-card-footer">
                          <span className="picker-var-count">
                            {tpl.variables.length} Variable{tpl.variables.length === 1 ? "" : "s"}
                          </span>
                          {isSelected && (
                            <span className="picker-selected-pill">
                              <CheckCircle2 size={13} /> Selected
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: AUDIENCE SELECTION */}
          {currentStep === 3 && (
            <div className="wizard-step-card">
              <div className="step-card-header">
                <div className="step-icon-wrap">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="step-heading">Step 3: Select Target Audience</h3>
                  <p className="step-desc">
                    Choose the customer audience for this campaign from your verified organization contact lists.
                  </p>
                </div>
              </div>

              <div className="audience-warning-box">
                <AlertCircle size={16} color="var(--accent-emerald)" />
                <div style={{ flex: 1 }}>
                  <strong>Audience Consent & Send Eligibility:</strong>
                  <p>
                    Only contacts with confirmed <code>OPTED_IN</code> consent status and not on the suppression list are send-eligible. Contacts in <code>PENDING</code>, <code>OPTED_OUT</code>, or suppressed states are automatically excluded from broadcasts.
                  </p>
                </div>
              </div>

              <div className="audience-picker-list" style={{ marginTop: "1rem" }}>
                {isLoadingAudiences ? (
                  <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)" }}>
                    <Loader2 size={20} className="spinning" style={{ margin: "0 auto 0.5rem auto" }} />
                    <span>Loading organization audience lists...</span>
                  </div>
                ) : allAvailableAudiences.length === 0 ? (
                  <div className="empty-audiences-card" style={{ padding: "3rem 1.5rem", textAlign: "center", background: "var(--bg-glass-card)", borderRadius: "8px", border: "1px dashed var(--border-subtle)" }}>
                    <Users size={32} color="var(--text-muted)" style={{ margin: "0 auto 0.75rem auto" }} />
                    <h4 style={{ margin: "0 0 0.5rem 0" }}>No verified contact lists available</h4>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", maxWidth: "440px", margin: "0 auto 1.25rem auto", lineHeight: 1.5 }}>
                      No contact lists were found for your organization. Please import your customer contacts on the Audiences page before launching a WhatsApp campaign.
                    </p>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={onCancel}
                      style={{ fontSize: "0.82rem" }}
                    >
                      Go to Audiences & Contacts
                    </button>
                  </div>
                ) : (
                  allAvailableAudiences.map((aud) => {
                    const isSelected = aud.id === selectedAudienceId;
                    return (
                      <div
                        key={aud.id}
                        className={`audience-picker-card ${isSelected ? "selected" : ""}`}
                        onClick={() => setSelectedAudienceId(aud.id)}
                      >
                        <div className="aud-card-left">
                          <div className="aud-card-title-row">
                            <span className="aud-name">{aud.name}</span>
                            <span
                              className="status-sub-pill"
                              style={{
                                background: "rgba(16, 185, 129, 0.15)",
                                color: "var(--accent-emerald)",
                              }}
                            >
                              VERIFIED CONTACT LIST
                            </span>
                          </div>
                          <p className="aud-desc">{aud.description}</p>
                          <div className="aud-tags-row">
                            {aud.tags.map((t, i) => (
                              <span key={i} className="aud-tag">
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="aud-card-right">
                          <span className="aud-count-val">{aud.count.toLocaleString()}</span>
                          <span className="aud-count-label">
                            Opted-In & Send-Eligible
                          </span>
                          {aud.totalCount > aud.count && (
                            <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                              {aud.totalCount.toLocaleString()} Total ({aud.totalCount - aud.count} unconsented excluded)
                            </span>
                          )}
                          {isSelected && (
                            <span className="picker-selected-pill" style={{ marginTop: "0.5rem" }}>
                              <CheckCircle2 size={13} /> Selected
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* STEP 4: VARIABLES & MAPPING */}
          {currentStep === 4 && (
            <div className="wizard-step-card">
              <div className="step-card-header">
                <div className="step-icon-wrap">
                  <Sliders size={20} />
                </div>
                <div>
                  <h3 className="step-heading">Step 4: Configure Message Variables</h3>
                  <p className="step-desc">
                    Customize parameter values for variables detected in template <strong>"{selectedTemplate.name}"</strong>. The WhatsApp phone preview updates in real time.
                  </p>
                </div>
              </div>

              {selectedTemplate.variables.length === 0 ? (
                <div className="empty-variables-box">
                  <CheckCircle2 size={24} color="var(--accent-emerald)" />
                  <h4>No Dynamic Variables</h4>
                  <p>
                    Template <strong>"{selectedTemplate.name}"</strong> does not contain any <code>&#123;&#123;1&#125;&#125;</code> variable placeholders. The message body is static and ready for broadcast without variable mapping.
                  </p>
                </div>
              ) : (
                <div className="variables-form-list">
                  <div
                    className="meta-locked-banner"
                    style={{
                      background: "rgba(99, 102, 241, 0.08)",
                      border: "1px solid rgba(99, 102, 241, 0.25)",
                      borderRadius: "var(--radius-md)",
                      padding: "0.85rem 1rem",
                      marginBottom: "1rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      fontSize: "0.84rem",
                    }}
                  >
                    <Lock size={16} color="var(--accent-indigo-light)" style={{ flexShrink: 0 }} />
                    <span>
                      <strong>Meta-approved template · Structure locked:</strong> Approved template content cannot be edited here. Enter recipient parameter values below for message delivery.
                    </span>
                  </div>
                  {selectedTemplate.variables.map((v) => {
                    const currentVal = variablesMapping[v.key] ?? "";
                    const isMissing = !currentVal || currentVal.trim().length === 0;
                    return (
                      <div key={v.key} className="variable-input-row">
                        <div className="var-badge-wrap">
                          <span className="var-chip">&#123;&#123;{v.key}&#125;&#125;</span>
                          <span className="var-fallback-hint">
                            {v.label || `Parameter {{${v.key}}}`}
                          </span>
                        </div>

                        <div className="var-input-col">
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem", flexWrap: "wrap", gap: "0.35rem" }}>
                            <label htmlFor={`var-input-${v.key}`} className="form-label-sm" style={{ margin: 0 }}>
                              {v.label || `Parameter {{${v.key}}}`} <span style={{ color: "var(--accent-crimson)" }}>*</span>
                            </label>

                            {/* Contact attribute quick-mapping presets */}
                            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                              <button
                                type="button"
                                style={{
                                  fontSize: "0.7rem",
                                  padding: "0.15rem 0.45rem",
                                  borderRadius: "4px",
                                  border: "1px solid var(--border-subtle)",
                                  background: "var(--bg-glass-card)",
                                  color: "var(--text-secondary)",
                                  cursor: "pointer",
                                }}
                                onClick={() => handleVariableChange(v.key, "{{contact.firstName}}")}
                                title="Map to recipient's First Name"
                              >
                                + First Name
                              </button>
                              <button
                                type="button"
                                style={{
                                  fontSize: "0.7rem",
                                  padding: "0.15rem 0.45rem",
                                  borderRadius: "4px",
                                  border: "1px solid var(--border-subtle)",
                                  background: "var(--bg-glass-card)",
                                  color: "var(--text-secondary)",
                                  cursor: "pointer",
                                }}
                                onClick={() => handleVariableChange(v.key, "{{contact.name}}")}
                                title="Map to recipient's Full Name"
                              >
                                + Full Name
                              </button>
                              <button
                                type="button"
                                style={{
                                  fontSize: "0.7rem",
                                  padding: "0.15rem 0.45rem",
                                  borderRadius: "4px",
                                  border: "1px solid var(--border-subtle)",
                                  background: "var(--bg-glass-card)",
                                  color: "var(--text-secondary)",
                                  cursor: "pointer",
                                }}
                                onClick={() => handleVariableChange(v.key, "{{contact.phoneNumber}}")}
                                title="Map to recipient's Phone Number"
                              >
                                + Phone
                              </button>
                              {v.sampleValue && !v.sampleValue.startsWith("{{") && (
                                <button
                                  type="button"
                                  style={{
                                    fontSize: "0.7rem",
                                    padding: "0.15rem 0.45rem",
                                    borderRadius: "4px",
                                    border: "1px solid var(--border-subtle)",
                                    background: "var(--bg-glass-card)",
                                    color: "var(--accent-indigo-light)",
                                    cursor: "pointer",
                                  }}
                                  onClick={() => handleVariableChange(v.key, v.sampleValue!)}
                                  title={`Use sample value "${v.sampleValue}"`}
                                >
                                  + Sample ({v.sampleValue})
                                </button>
                              )}
                            </div>
                          </div>

                          <input
                            id={`var-input-${v.key}`}
                            type="text"
                            className={`form-input ${isMissing ? "form-input-error" : ""}`}
                            value={currentVal}
                            onChange={(e) => handleVariableChange(v.key, e.target.value)}
                            placeholder={v.sampleValue ? `e.g. ${v.sampleValue}` : (v.label ? `Enter value or mapping for ${v.label}` : `Value for {{${v.key}}}`)}
                          />
                          {isMissing && (
                            <span style={{ fontSize: "0.75rem", color: "var(--accent-crimson)", marginTop: "0.2rem", display: "block" }}>
                              This parameter is required before proceeding to review.
                            </span>
                          )}
                          {!isMissing && currentVal.startsWith("{{") && (
                            <span style={{ fontSize: "0.75rem", color: "var(--accent-emerald)", marginTop: "0.2rem", display: "block" }}>
                              ✓ Mapped to dynamic contact attribute
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 5: REVIEW & SAVE */}
          {currentStep === 5 && (
            <div className="wizard-step-card">
              <div className="step-card-header">
                <div className="step-icon-wrap">
                  <Send size={20} />
                </div>
                <div>
                  <h3 className="step-heading">Step 5: Review Campaign Details</h3>
                  <p className="step-desc">
                    Review your campaign configuration before persisting it as a draft.
                  </p>
                </div>
              </div>

              <div className="review-summary-grid">
                <div className="review-summary-item">
                  <span className="review-k">Campaign Name</span>
                  <span className="review-v">{name}</span>
                </div>
                <div className="review-summary-item">
                  <span className="review-k">Channel</span>
                  <span className="review-v" style={{ color: "var(--accent-emerald)", fontWeight: 600 }}>
                    WhatsApp (Grovastra Shared Platform Account)
                  </span>
                </div>
                <div className="review-summary-item">
                  <span className="review-k">Template</span>
                  <span className="review-v template-link-text">
                    {getFriendlyTemplateName(selectedTemplate.name)} ({selectedTemplate.name})
                  </span>
                </div>
                <div className="review-summary-item">
                  <span className="review-k">Category</span>
                  <span className="review-v">{selectedTemplate.category}</span>
                </div>
                <div className="review-summary-item">
                  <span className="review-k">Target Audience</span>
                  <div className="review-v-with-badge">
                    <span>{selectedAudience?.name || "No Audience Selected"}</span>
                    <span
                      className="status-sub-pill"
                      style={{ background: "rgba(16, 185, 129, 0.15)", color: "var(--accent-emerald)" }}
                    >
                      VERIFIED CONTACT LIST
                    </span>
                  </div>
                </div>
                <div className="review-summary-item">
                  <span className="review-k">Send-Eligible Recipients</span>
                  <span className="review-v sent-count-num">
                    {selectedAudience ? (
                      <>
                        {selectedAudience.count.toLocaleString()} Opted-In Contacts
                        {((selectedAudience.totalCount || selectedAudience.count) > selectedAudience.count) && (
                          <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", display: "block", marginTop: "0.15rem" }}>
                            ({((selectedAudience.totalCount || selectedAudience.count) - selectedAudience.count).toLocaleString()} unconsented excluded)
                          </span>
                        )}
                      </>
                    ) : (
                      "0 Contacts"
                    )}
                  </span>
                </div>
                <div className="review-summary-item">
                  <span className="review-k">Header Media</span>
                  <span className="review-v">
                    {attachedMedia ? `${attachedMedia.title} (${attachedMedia.width}×${attachedMedia.height} px)` : "None (Text Header)"}
                  </span>
                </div>
                <div className="review-summary-item">
                  <span className="review-k">Template Parameters</span>
                  <span className="review-v">
                    {selectedTemplate.variables.length > 0
                      ? `${selectedTemplate.variables.length} parameters configured & validated`
                      : "No variables (Static body)"}
                  </span>
                </div>
                <div className="review-summary-item">
                  <span className="review-k">Initial Status</span>
                  {dispatchMode === "SCHEDULE" ? (
                    <span className="status-pill status-pending">SCHEDULED</span>
                  ) : (
                    <span className="status-pill status-draft">DRAFT</span>
                  )}
                </div>
                {dispatchMode === "SCHEDULE" && scheduledAtUtc && (
                  <div className="review-summary-item" style={{ gridColumn: "1 / -1" }}>
                    <span className="review-k">Scheduled Dispatch</span>
                    <span className="review-v" style={{ color: "#a78bfa", fontWeight: 700 }}>
                      {formatInBusinessTimezone(scheduledAtUtc)} ({BUSINESS_TIMEZONE_LABEL})
                    </span>
                  </div>
                )}
              </div>

              {/* Dispatch Timing Options: Send Now vs Schedule for Later */}
              <div
                className="dispatch-timing-card"
                style={{
                  marginTop: "1.25rem",
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "1.25rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.85rem" }}>
                  <Clock size={16} color="var(--accent-primary)" />
                  <strong style={{ fontSize: "0.95rem", color: "var(--text-primary)" }}>
                    Dispatch Timing
                  </strong>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.6rem",
                      padding: "0.85rem 1rem",
                      borderRadius: "var(--radius-md)",
                      border: dispatchMode === "NOW" ? "1.5px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                      background: dispatchMode === "NOW" ? "rgba(99, 102, 241, 0.08)" : "transparent",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <input
                      type="radio"
                      name="dispatchMode"
                      value="NOW"
                      checked={dispatchMode === "NOW"}
                      onChange={() => setDispatchMode("NOW")}
                      id="dispatch-mode-now"
                      style={{ marginTop: "3px" }}
                    />
                    <div>
                      <strong style={{ display: "block", color: "var(--text-primary)", fontSize: "0.88rem" }}>
                        Send now
                      </strong>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-secondary)" }}>
                        Queue broadcast immediately upon review
                      </span>
                    </div>
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.6rem",
                      padding: "0.85rem 1rem",
                      borderRadius: "var(--radius-md)",
                      border: dispatchMode === "SCHEDULE" ? "1.5px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
                      background: dispatchMode === "SCHEDULE" ? "rgba(99, 102, 241, 0.08)" : "transparent",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <input
                      type="radio"
                      name="dispatchMode"
                      value="SCHEDULE"
                      checked={dispatchMode === "SCHEDULE"}
                      onChange={() => setDispatchMode("SCHEDULE")}
                      id="dispatch-mode-schedule"
                      style={{ marginTop: "3px" }}
                    />
                    <div>
                      <strong style={{ display: "block", color: "var(--text-primary)", fontSize: "0.88rem" }}>
                        Schedule for later
                      </strong>
                      <span style={{ fontSize: "0.76rem", color: "var(--text-secondary)" }}>
                        Automatically dispatch at a future date & time
                      </span>
                    </div>
                  </label>
                </div>

                {dispatchMode === "SCHEDULE" && (
                  <div
                    style={{
                      background: "rgba(99, 102, 241, 0.04)",
                      border: "1px dashed rgba(99, 102, 241, 0.35)",
                      borderRadius: "var(--radius-md)",
                      padding: "1rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.85rem",
                    }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                      <div>
                        <label
                          htmlFor="schedule-date-input"
                          style={{ display: "block", fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}
                        >
                          Schedule Date ({DEFAULT_BUSINESS_TIMEZONE})
                        </label>
                        <input
                          type="date"
                          className="form-input"
                          min={defaultSchedule.minDate}
                          value={scheduleDate}
                          onChange={(e) => setScheduleDate(e.target.value)}
                          id="schedule-date-input"
                          style={{ width: "100%", padding: "0.55rem 0.75rem" }}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="schedule-time-input"
                          style={{ display: "block", fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}
                        >
                          Schedule Time (24h format, IST)
                        </label>
                        <input
                          type="time"
                          className="form-input"
                          value={scheduleTime}
                          onChange={(e) => setScheduleTime(e.target.value)}
                          id="schedule-time-input"
                          style={{ width: "100%", padding: "0.55rem 0.75rem" }}
                        />
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "var(--text-secondary)", flexWrap: "wrap", gap: "0.5rem" }}>
                      <span>
                        Business Timezone: <strong style={{ color: "var(--text-primary)" }}>{DEFAULT_BUSINESS_TIMEZONE} ({BUSINESS_TIMEZONE_LABEL})</strong>
                      </span>
                      {scheduledAtUtc && !scheduleValidationError && (
                        <span style={{ color: "var(--accent-emerald)", fontWeight: 600 }}>
                          Scheduled for: {formatInBusinessTimezone(scheduledAtUtc)}
                        </span>
                      )}
                    </div>

                    {scheduleValidationError && (
                      <div
                        role="alert"
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--accent-rose)",
                          background: "rgba(244, 63, 94, 0.08)",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "var(--radius-sm)",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                        }}
                      >
                        <AlertCircle size={14} />
                        <span>{scheduleValidationError}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Consent & Suppression Safeguard Policy */}
              <div className="audience-warning-box" style={{ marginTop: "1rem" }}>
                <AlertTriangle size={18} color="#fbbf24" style={{ flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <strong>WhatsApp Consent & Suppression Safeguard Policy:</strong>
                  <p style={{ margin: "0.25rem 0 0 0" }}>
                    WhatsApp Business terms strictly mandate prior opt-in consent. When launched, the dispatch orchestrator will query contacts JIT and immediately exclude any contact whose consent status is not <code>OPTED_IN</code> or who is actively suppressed.
                  </p>
                </div>
              </div>

              {/* Safeguard Notification */}
              <div className="safeguard-locked-box" style={{ marginTop: "1rem" }}>
                <Lock size={18} color="var(--accent-amber)" />
                <div style={{ flex: 1 }}>
                  <strong>Safety Protection & Staged Dispatch:</strong>
                  <p>
                    Campaign drafts are safely stored and isolated to your organization. Outbound WhatsApp messages require your explicit confirmation before dispatch.
                  </p>
                </div>
              </div>

              {/* Pre-Launch Readiness & Prerequisite Feedback */}
              {!launchReadiness.isReady ? (
                <div
                  className="launch-prerequisites-alert"
                  role="alert"
                  style={{
                    marginTop: "1.25rem",
                    padding: "0.85rem 1rem",
                    borderRadius: "var(--radius-md)",
                    background: "rgba(244, 63, 94, 0.08)",
                    border: "1px solid rgba(244, 63, 94, 0.25)",
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "flex-start",
                    fontSize: "0.84rem",
                    color: "var(--accent-rose)",
                  }}
                >
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
                  <div>
                    <strong>Sending is currently disabled:</strong>
                    <ul style={{ margin: "0.35rem 0 0 1rem", padding: 0 }}>
                      {launchReadiness.issues.map((issue, idx) => (
                        <li key={idx} style={{ marginTop: "0.2rem" }}>
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div
                  className="launch-prerequisites-success"
                  style={{
                    marginTop: "1.25rem",
                    padding: "0.85rem 1rem",
                    borderRadius: "var(--radius-md)",
                    background: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid rgba(16, 185, 129, 0.25)",
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "center",
                    fontSize: "0.84rem",
                    color: "var(--accent-emerald)",
                  }}
                >
                  <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
                  <span>
                    <strong>Ready to Launch:</strong> Meta template verified APPROVED, audience has {selectedAudience?.count.toLocaleString()} opted-in contacts, and required parameters are resolved.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Wizard Navigation Footer */}
          <div className="wizard-footer-actions">
            <div className="wizard-footer-left">
              {currentStep > 1 && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleBack}
                  disabled={isSaving || isValidatingParams}
                >
                  <ArrowLeft size={15} />
                  <span>Back</span>
                </button>
              )}
            </div>

            <div className="wizard-footer-right">
              <button
                type="button"
                className="btn-secondary"
                onClick={handleRequestCancel}
                disabled={isSaving || isValidatingParams}
              >
                Cancel
              </button>

              {currentStep < 5 ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleNext}
                  disabled={isValidatingParams}
                  id="wizard-continue-btn"
                >
                  {isValidatingParams && <Loader2 size={14} className="spinning" />}
                  <span>{isValidatingParams ? "Validating Parameters..." : "Continue"}</span>
                  <ArrowRight size={15} />
                </button>
              ) : (
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleSaveDraft}
                    disabled={isSaving || isValidatingParams || isLaunchingDraft}
                    id="wizard-save-draft-btn"
                  >
                    {isSaving ? <Loader2 size={14} className="spinning" /> : <Save size={15} />}
                    <span>{isSaving ? "Saving Draft..." : isEdit ? "Update Draft" : "Save as Draft"}</span>
                  </button>

                  {onLaunch && (
                    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => setShowLaunchConfirm(true)}
                        disabled={!launchReadiness.isReady || isSaving || isValidatingParams || isLaunchingDraft}
                        id="wizard-launch-campaign-btn"
                        title={
                          !launchReadiness.isReady
                            ? launchReadiness.issues.join("; ")
                            : dispatchMode === "SCHEDULE"
                            ? "Review and schedule this campaign"
                            : "Review and launch this campaign"
                        }
                      >
                        {isLaunchingDraft ? (
                          <Loader2 size={14} className="spinning" />
                        ) : dispatchMode === "SCHEDULE" ? (
                          <Clock size={15} />
                        ) : (
                          <Send size={15} />
                        )}
                        <span>
                          {isLaunchingDraft
                            ? dispatchMode === "SCHEDULE"
                              ? "Scheduling..."
                              : "Launching..."
                            : dispatchMode === "SCHEDULE"
                            ? "Review & Schedule"
                            : "Review & Launch"}
                        </span>
                      </button>
                      {!launchReadiness.isReady && (
                        <span
                          className="send-disabled-reason"
                          style={{
                            fontSize: "0.72rem",
                            color: "var(--accent-rose)",
                            maxWidth: "280px",
                            textAlign: "right",
                          }}
                        >
                          {launchReadiness.issues[0]}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live WhatsApp Phone Preview (Steps 2-5) */}
        <div
          className={`wizard-preview-col ${mobileTab === "FORM" ? "hide-on-mobile" : ""}`}
        >
          <div className="sticky-preview-container">
            <WhatsAppPhonePreview template={livePreviewTemplate} />
          </div>
        </div>
      </div>

      {/* Discard Unsaved Changes Confirmation Modal */}
      {showDiscardConfirm && (
        <div className="modal-backdrop" onClick={() => setShowDiscardConfirm(false)}>
          <div
            className="modal-card confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="discard-dialog-title"
          >
            <div className="modal-header">
              <div className="modal-icon-danger">
                <AlertTriangle size={20} color="var(--accent-amber)" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 id="discard-dialog-title" className="modal-title">Discard Unsaved Changes?</h3>
                <span className="modal-sub">You have unsaved edits in this campaign draft</span>
              </div>
              <button
                type="button"
                className="btn-icon-close"
                onClick={() => setShowDiscardConfirm(false)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-text">
                Are you sure you want to exit the wizard? Any changes made to this campaign draft will be permanently discarded.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowDiscardConfirm(false)}
              >
                Keep Editing
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  setShowDiscardConfirm(false);
                  onCancel();
                }}
                id="confirm-discard-btn"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Campaign Launch Confirmation Modal */}
      <LaunchConfirmationModal
        isOpen={showLaunchConfirm}
        campaign={{
          id: initialCampaign?.id || "draft_new",
          name: name.trim() || "Untitled Campaign",
          templateName: selectedTemplate.name,
          templateLanguage: selectedTemplate.language || "en_US",
          audienceName: selectedAudience?.name || "No Audience Selected",
          totalRecipients: selectedAudience?.count || 0,
          status: dispatchMode === "SCHEDULE" ? "SCHEDULED" : "DRAFT",
          organizationId: initialCampaign?.organizationId || "",
          description: description.trim() || null,
          templateId: selectedTemplate.id,
          templateCategory: selectedTemplate.category || "MARKETING",
          variablesMapping,
          audienceType: "CONTACT_LIST",
          audienceId: selectedAudience?.id || "",
          scheduledAt: dispatchMode === "SCHEDULE" ? scheduledAtUtc : null,
          startedAt: null,
          completedAt: null,
          createdBy: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }}
        isLaunching={isLaunchingDraft}
        launchError={launchDraftError}
        onConfirm={handleConfirmLaunchFromWizard}
        onCancel={() => {
          setShowLaunchConfirm(false);
          setLaunchDraftError(null);
        }}
        eligibleCount={selectedAudience?.count ?? null}
        scheduledAt={dispatchMode === "SCHEDULE" ? scheduledAtUtc : null}
      />
    </div>
  );
};
