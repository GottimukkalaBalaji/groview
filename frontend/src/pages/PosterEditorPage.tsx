import React, { useState, useEffect, useRef, useCallback } from "react";
import { PosterToolbar } from "../components/poster/PosterToolbar.js";
import { PosterToolRail } from "../components/poster/PosterToolRail.js";
import { PosterPropertiesPanel } from "../components/poster/PosterPropertiesPanel.js";
import { PosterLayersPanel } from "../components/poster/PosterLayersPanel.js";
import { PosterMobileSheet } from "../components/poster/PosterMobileSheet.js";
import { PosterMobileDock, MobileActiveTab } from "../components/poster/PosterMobileDock.js";
import { PosterMobileAddSheet } from "../components/poster/PosterMobileAddSheet.js";
import { PosterCanvasManager } from "../services/posterCanvasManager.js";
import { PosterHistoryManager } from "../services/posterHistoryManager.js";
import {
  exportCanvasToImage,
  downloadDataUrl,
  generateCanvasThumbnail,
} from "../services/posterExportService.js";
import { posterStorageService } from "../services/posterStorageService.js";
import {
  POSTER_PRESETS,
  PosterPreset,
  ExportFormat,
  ActiveObjectProperties,
  PosterLayerItem,
  AlignmentType,
  StickerType,
  PosterToolTab,
  findPreset,
  AutoSaveStatus,
  SavedPosterDesignInput,
  PosterCampaignAttachment,
} from "../types/poster.js";
import { Sliders, Layers, X } from "lucide-react";
import { MyDesignsModal } from "../components/poster/MyDesignsModal.js";
import { UnsavedChangesModal } from "../components/poster/UnsavedChangesModal.js";
import { PosterGalleryView } from "../components/poster/PosterGalleryView.js";
import { PosterConvertSizeModal } from "../components/poster/PosterConvertSizeModal.js";
import { adaptCanvasJsonToPreset } from "../utils/posterConversion.js";
import { useAuth } from "../context/AuthContext.js";
import { User } from "../types/auth.js";

const AIBackgroundRemovalModal = React.lazy(
  () => import("../components/poster/AIBackgroundRemovalModal.js")
);
const AIBackgroundBlurModal = React.lazy(
  () => import("../components/poster/AIBackgroundBlurModal.js")
);

export interface PosterEditorPageProps {
  initialView?: "gallery" | "editor";
  currentUser?: User | null;
  onNavigateToCampaigns?: (posterData: PosterCampaignAttachment) => void;
}

/**
 * Returns the localStorage key for user-scoped Auto Save preference.
 */
export function getAutoSaveStorageKey(userId?: string | null): string {
  const clean = (userId || "").trim();
  return clean
    ? `grovastra_poster_autosave_enabled_${clean}`
    : "grovastra_poster_autosave_enabled";
}

/**
 * Retrieves the stored Auto Save preference for a specific user,
 * falling back to the legacy un-scoped key if user-specific key is not yet set.
 */
export function getAutoSavePreference(userId?: string | null): boolean {
  if (typeof window === "undefined" || !window.localStorage) return true;
  try {
    const key = getAutoSaveStorageKey(userId);
    const stored = localStorage.getItem(key);
    if (stored !== null) return stored === "true";
    const legacy = localStorage.getItem("grovastra_poster_autosave_enabled");
    return legacy === null ? true : legacy === "true";
  } catch {
    return true;
  }
}

export const PosterEditorPage: React.FC<PosterEditorPageProps> = ({
  initialView = "gallery",
  currentUser,
}) => {
  // Safely consume useAuth() if mounted within AuthProvider, or fallback gracefully for standalone tests
  let authUser: User | null = null;
  try {
    const auth = useAuth();
    authUser = auth?.user ?? null;
  } catch {
    authUser = null;
  }
  const activeUser = currentUser !== undefined ? currentUser : authUser;
  const activeUserId = activeUser?.id || null;

  const [viewMode, setViewMode] = useState<"gallery" | "editor">(initialView);
  const [title, setTitle] = useState<string>("WhatsApp Campaign Poster");
  const [selectedPreset, setSelectedPreset] = useState<PosterPreset>(POSTER_PRESETS[0]);
  const [activeTool, setActiveTool] = useState<PosterToolTab>("elements");
  const [zoomLevel, setZoomLevel] = useState<number>(0.55);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);
  const [activeProperties, setActiveProperties] = useState<ActiveObjectProperties | null>(null);
  const [layers, setLayers] = useState<PosterLayerItem[]>([]);
  const [rightPanelTab, setRightPanelTab] = useState<"properties" | "layers">("properties");
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState<boolean>(false);
  const [activeMobileTab, setActiveMobileTab] = useState<MobileActiveTab>(null);
  const [isMobile, setIsMobile] = useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth <= 640
  );
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isAiBgModalOpen, setIsAiBgModalOpen] = useState<boolean>(false);
  const [isAiBgBlurModalOpen, setIsAiBgBlurModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastIsError, setToastIsError] = useState<boolean>(false);

  // Phase 3A Persistence, AutoSave & Design Management State
  const [activeDesignId, setActiveDesignId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>("saved");
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    return getAutoSavePreference(activeUserId);
  });

  // Format Conversion Modal
  const [isConvertModalOpen, setIsConvertModalOpen] = useState<boolean>(false);
  const [convertTargetPreset, setConvertTargetPreset] = useState<PosterPreset>(POSTER_PRESETS[1]);

  // Phase 3A Step 3: My Designs & Unsaved Changes Modal State
  const [isMyDesignsOpen, setIsMyDesignsOpen] = useState<boolean>(false);
  const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<
    { type: "new"; preset?: PosterPreset } | { type: "open"; designId: string } | { type: "gallery" } | null
  >(null);

  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const canvasManagerRef = useRef<PosterCanvasManager | null>(null);
  const historyManagerRef = useRef<PosterHistoryManager>(new PosterHistoryManager(25));
  const isInitializingRef = useRef<boolean>(true);
  const isManualZoomRef = useRef<boolean>(false);
  const selectedPresetRef = useRef<PosterPreset>(selectedPreset);

  // Persistence Refs
  const activeUserIdRef = useRef<string | null>(activeUserId);
  const activeDesignIdRef = useRef<string | null>(null);
  const autoSaveEnabledRef = useRef<boolean>(autoSaveEnabled);
  const titleRef = useRef<string>(title);
  const isSavingRef = useRef<boolean>(false);
  const pendingSaveRequestedRef = useRef<boolean>(false);
  const hasUnsavedChangesRef = useRef<boolean>(false);
  const autoSaveTimerRef = useRef<any>(null);
  const isRestoringRef = useRef<boolean>(false);
  const executeSaveRef = useRef<((isManual?: boolean) => Promise<boolean>) | null>(null);
  const markUnsavedRef = useRef<() => void>(() => {});
  const isMyDesignsOpenRef = useRef<boolean>(false);
  const isUnsavedModalOpenRef = useRef<boolean>(false);

  // Authenticated user lifecycle & account switch isolation
  useEffect(() => {
    const prevUserId = activeUserIdRef.current;
    if (prevUserId !== activeUserId) {
      // 1. Cancel pending debounce timer immediately
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }

      // 2. Clear pending save flags so prior user's changes don't persist into new user's DB
      pendingSaveRequestedRef.current = false;
      isSavingRef.current = false;
      hasUnsavedChangesRef.current = false;

      // 3. Clean up canvas and revoke created object URLs
      if (canvasManagerRef.current) {
        const sessionUrls = canvasManagerRef.current.getSessionObjectUrls();
        posterStorageService.revokeSessionUrls(sessionUrls);
        canvasManagerRef.current.clear();
      }

      // 4. Reset history and properties
      historyManagerRef.current.clear();
      setCanUndo(false);
      setCanRedo(false);
      setLayers([]);
      setActiveProperties(null);
      const defaultTitle = "Untitled Poster";
      setTitle(defaultTitle);
      titleRef.current = defaultTitle;

      // 5. Reset active design ID and save status
      setActiveDesignId(null);
      activeDesignIdRef.current = null;
      setSaveStatus("saved");

      // 6. Reset view back to gallery
      setViewMode("gallery");

      // 7. Close old database and scope storage service to new user
      posterStorageService.closeDB();
      posterStorageService.setUserId(activeUserId);
      activeUserIdRef.current = activeUserId;

      // 8. Load user-scoped Auto Save preference
      const enabledForUser = getAutoSavePreference(activeUserId);
      setAutoSaveEnabled(enabledForUser);
      autoSaveEnabledRef.current = enabledForUser;
    } else {
      posterStorageService.setUserId(activeUserId);
    }
  }, [activeUserId]);

  useEffect(() => {
    isMyDesignsOpenRef.current = isMyDesignsOpen;
  }, [isMyDesignsOpen]);

  useEffect(() => {
    isUnsavedModalOpenRef.current = isUnsavedModalOpen;
  }, [isUnsavedModalOpen]);

  useEffect(() => {
    selectedPresetRef.current = selectedPreset;
  }, [selectedPreset]);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    autoSaveEnabledRef.current = autoSaveEnabled;
  }, [autoSaveEnabled]);

  useEffect(() => {
    activeDesignIdRef.current = activeDesignId;
  }, [activeDesignId]);

  // Window resize listener to sync isMobile mode and clean up mobile sheets on desktop
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 640;
      setIsMobile(mobile);
      if (!mobile) {
        setIsMobileSheetOpen(false);
        setActiveMobileTab(null);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Dynamic Fit to Workspace calculation based on container client dimensions
  const fitToWorkspace = useCallback((targetPreset?: PosterPreset) => {
    const container = workspaceRef.current;
    if (!container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w <= 0 || h <= 0) return;

    const mobile = typeof window !== "undefined" ? window.innerWidth <= 640 : false;
    // On mobile, 16px horizontal margin (8px on each side) lets the poster scale up to fill screen.
    // On mobile, 72px vertical margin accounts for the 56px bottom dock + 16px vertical margins so the poster sits comfortably above the dock.
    const padX = mobile ? 16 : 48;
    const padY = mobile ? 72 : 48;

    const availW = Math.max(120, w - padX);
    const availH = Math.max(120, h - padY);

    const preset = targetPreset || selectedPresetRef.current;
    const scaleW = availW / preset.width;
    const scaleH = availH / preset.height;
    const targetZoom = Math.min(scaleW, scaleH);

    const clamped = Math.max(0.2, Math.min(Number(targetZoom.toFixed(3)), 3.0));
    setZoomLevel(clamped);
    canvasManagerRef.current?.setZoom(clamped);
  }, []);

  const updateHistoryState = useCallback(() => {
    const manager = canvasManagerRef.current;
    const history = historyManagerRef.current;
    if (!manager || history.isLocked) return;

    const json = manager.toJSON();
    history.pushState(json);
    setCanUndo(history.canUndo());
    setCanRedo(history.canRedo());
  }, []);

  const handleSelectionChange = useCallback((props: ActiveObjectProperties | null) => {
    setActiveProperties(props);
    const mobile = typeof window !== "undefined" && window.innerWidth <= 640;
    if (mobile) {
      if (props) {
        setActiveMobileTab("edit");
        setIsMobileSheetOpen(true);
      } else {
        setActiveMobileTab((prev) => (prev === "edit" ? null : prev));
        setIsMobileSheetOpen(false);
      }
    } else {
      // Desktop: mobile bottom sheet and mobile tabs must never open
      setActiveMobileTab(null);
      setIsMobileSheetOpen(false);
    }
  }, []);

  const handleLayersChange = useCallback((newLayers: PosterLayerItem[]) => {
    setLayers(newLayers);
  }, []);

  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const showToast = useCallback((msg: string, isError: boolean = false) => {
    setToastMessage(msg);
    setToastIsError(isError);
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      setToastIsError(false);
    }, 3200);
  }, []);

  const executeSave = useCallback(
    async (isManual: boolean = false): Promise<boolean> => {
      const savingForUserId = activeUserIdRef.current;
      const manager = canvasManagerRef.current;
      if (!manager) return false;

      // Abort immediately if user switched or DB mismatch
      if (
        activeUserIdRef.current !== savingForUserId ||
        posterStorageService.getUserId() !== savingForUserId
      ) {
        return false;
      }

      // Handle in-progress save concurrency
      if (isSavingRef.current) {
        pendingSaveRequestedRef.current = true;
        return false;
      }

      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }

      isSavingRef.current = true;
      setSaveStatus("saving");

      try {
        // 1. Snapshot canvas JSON & registered image assets
        const rawJson = manager.toJSON();
        const assets = manager.getRegisteredAssets();

        // Integrity verification: ensure all canvas image objects with stable assetId references have blobs
        const canvasObjects = manager.fabricCanvas.getObjects();
        for (const obj of canvasObjects) {
          const assetId = (obj as any).assetId;
          if (assetId) {
            const inMemoryBlob = assets.get(assetId);
            if (!inMemoryBlob) {
              const inDbAsset = await posterStorageService.getAsset(assetId);
              if (!inDbAsset || !inDbAsset.blob) {
                throw new Error(
                  `Image asset "${assetId}" is missing binary data and cannot be safely saved.`
                );
              }
            }
          }
        }

        // 2. Generate lightweight canvas thumbnail
        const thumb = generateCanvasThumbnail(
          manager.fabricCanvas,
          selectedPresetRef.current.width,
          selectedPresetRef.current.height
        );

        // 3. Prepare design input record
        const designInput: SavedPosterDesignInput = {
          id: activeDesignIdRef.current || undefined,
          name: (titleRef.current || "Untitled Poster").trim() || "Untitled Poster",
          presetId: selectedPresetRef.current.id,
          width: selectedPresetRef.current.width,
          height: selectedPresetRef.current.height,
          canvasJson: rawJson,
          thumbnailDataUrl: thumb,
          assetIds: Array.from(assets.keys()),
        };

        // Guard: ensure target user is still active before writing
        if (
          activeUserIdRef.current !== savingForUserId ||
          posterStorageService.getUserId() !== savingForUserId
        ) {
          isSavingRef.current = false;
          return false;
        }

        // 4. Save to IndexedDB (verifies all asset Blobs first)
        const saved = await posterStorageService.saveDesign(designInput, assets);

        // Guard: ensure user did not switch while async save was in-flight
        if (activeUserIdRef.current !== savingForUserId) {
          isSavingRef.current = false;
          return false;
        }

        activeDesignIdRef.current = saved.id;
        setActiveDesignId(saved.id);
        hasUnsavedChangesRef.current = false;
        isSavingRef.current = false;

        // 5. If changes occurred during the in-flight save, schedule follow-up
        if (pendingSaveRequestedRef.current) {
          pendingSaveRequestedRef.current = false;
          hasUnsavedChangesRef.current = true;
          setSaveStatus("unsaved");
          if (autoSaveEnabledRef.current) {
            scheduleAutoSave();
          }
        } else {
          setSaveStatus("saved");
        }

        if (isManual) {
          showToast("Poster saved successfully");
        }
        return true;
      } catch (err: any) {
        isSavingRef.current = false;
        setSaveStatus("error");
        const errorMsg = err?.message || "Failed to save poster design.";
        showToast(errorMsg, true);
        console.error("Poster Studio save failed:", err);
        return false;
      }
    },
    [showToast]
  );

  useEffect(() => {
    executeSaveRef.current = executeSave;
  }, [executeSave]);

  const scheduleAutoSave = useCallback(() => {
    if (!autoSaveEnabledRef.current) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      executeSaveRef.current?.(false);
    }, 1500);
  }, []);

  const markUnsaved = useCallback(() => {
    if (isInitializingRef.current || isRestoringRef.current) return;
    hasUnsavedChangesRef.current = true;
    if (isSavingRef.current) {
      pendingSaveRequestedRef.current = true;
    } else {
      setSaveStatus("unsaved");
    }
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  useEffect(() => {
    markUnsavedRef.current = markUnsaved;
  }, [markUnsaved]);

  const handleAutoSaveToggle = (enabled: boolean) => {
    setAutoSaveEnabled(enabled);
    autoSaveEnabledRef.current = enabled;
    try {
      localStorage.setItem(getAutoSaveStorageKey(activeUserIdRef.current), String(enabled));
    } catch {
      // ignore
    }
    if (!enabled && autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (enabled && hasUnsavedChangesRef.current && !isSavingRef.current) {
      scheduleAutoSave();
    }
  };

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    titleRef.current = newTitle;
    markUnsaved();
  };

  // Helper to wait for active in-flight save to resolve before navigation
  const waitForInFlightSave = useCallback(async (timeoutMs: number = 3000): Promise<void> => {
    const start = Date.now();
    while (isSavingRef.current && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 40));
    }
  }, []);

  // --- Phase 3A, Step 3 & Phase 3B: Gallery & Restoration Handlers ---

  const proceedNewPoster = useCallback((presetChoice?: PosterPreset) => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    pendingSaveRequestedRef.current = false;
    isRestoringRef.current = true;

    const manager = canvasManagerRef.current;
    if (manager) {
      // Revoke any previous session object URLs
      const oldSessionUrls = manager.getSessionObjectUrls();
      posterStorageService.revokeSessionUrls(oldSessionUrls);

      manager.clear();
      const defaultPreset = presetChoice || POSTER_PRESETS[0];
      setSelectedPreset(defaultPreset);
      selectedPresetRef.current = defaultPreset;
      manager.setLogicalDimensions(defaultPreset.width, defaultPreset.height);

      const defaultTitle = "Untitled Poster";
      setTitle(defaultTitle);
      titleRef.current = defaultTitle;

      // Restore default template
      manager.addText("SUMMER SALE", {
        fontSize: 54,
        fontWeight: "bold",
        fill: "#10b981",
        top: defaultPreset.height * 0.28,
      });

      manager.addText("UP TO 50% OFF ON ALL ORDERS", {
        fontSize: 28,
        fontWeight: "normal",
        fill: "#334155",
        top: defaultPreset.height * 0.38,
      });

      historyManagerRef.current.clear();
      historyManagerRef.current.pushState(manager.toJSON());
      setCanUndo(false);
      setCanRedo(false);
      setLayers(manager.getLayers());
      setActiveProperties(null);

      // Reset active design ID to null for fresh design
      setActiveDesignId(null);
      activeDesignIdRef.current = null;
      hasUnsavedChangesRef.current = false;
      setSaveStatus("saved");

      setTimeout(() => fitToWorkspace(defaultPreset), 50);
    }

    isRestoringRef.current = false;
    setViewMode("editor");
    setIsMyDesignsOpen(false);
    showToast(`New ${presetChoice ? presetChoice.name : "WhatsApp Post"} ready`);
  }, [fitToWorkspace, showToast]);

  const handleNewPoster = useCallback(async (presetChoice?: PosterPreset) => {
    if (isSavingRef.current) {
      await waitForInFlightSave();
    }

    if (hasUnsavedChangesRef.current) {
      if (autoSaveEnabledRef.current) {
        // Auto Save ON: flush pending changes before clearing
        await executeSave(false);
        proceedNewPoster(presetChoice);
      } else {
        // Auto Save OFF: prompt user
        setPendingAction({ type: "new", preset: presetChoice });
        setIsUnsavedModalOpen(true);
      }
    } else {
      proceedNewPoster(presetChoice);
    }
  }, [executeSave, proceedNewPoster, waitForInFlightSave]);

  const proceedOpenDesign = useCallback(
    async (designId: string) => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      pendingSaveRequestedRef.current = false;

      const manager = canvasManagerRef.current;
      if (!manager) return;

      try {
        const design = await posterStorageService.getDesign(designId);
        if (!design) {
          showToast(`Design "${designId}" not found.`, true);
          return;
        }

        // Hydrate design image assets with fresh session object URLs
        const { hydratedJson, sessionUrls } = await posterStorageService.hydrateDesignForCanvas(design);

        isRestoringRef.current = true;

        // Fetch binary blobs for canvas manager in-memory asset registry
        const assetsMap = await posterStorageService.getAssets(design.assetIds || []);
        const assetBlobs = new Map<string, Blob>();
        assetsMap.forEach((rec, id) => assetBlobs.set(id, rec.blob));

        const preset =
          findPreset(design.presetId) ||
          findPreset(design.width, design.height) ||
          POSTER_PRESETS[0];

        setSelectedPreset(preset);
        selectedPresetRef.current = preset;
        setTitle(design.name);
        titleRef.current = design.name;

        manager.setLogicalDimensions(design.width, design.height);

        // Load into Fabric.js canvas
        await manager.loadFromJSON(hydratedJson, assetBlobs);
        sessionUrls.forEach((url) => manager.trackSessionUrl(url));

        // Reinitialize undo/redo history so previous design's history doesn't leak
        historyManagerRef.current.clear();
        historyManagerRef.current.pushState(manager.toJSON());
        setCanUndo(false);
        setCanRedo(false);

        // Refresh layers and properties
        setLayers(manager.getLayers());
        setActiveProperties(null);

        // Establish active design ID
        setActiveDesignId(design.id);
        activeDesignIdRef.current = design.id;
        hasUnsavedChangesRef.current = false;
        setSaveStatus("saved");

        setTimeout(() => fitToWorkspace(preset), 50);

        isRestoringRef.current = false;
        setViewMode("editor");
        setIsMyDesignsOpen(false);
        showToast(`Opened "${design.name}"`);
      } catch (err: any) {
        isRestoringRef.current = false;
        const msg = err?.message || "Failed to open poster design.";
        showToast(msg, true);
        console.error("Open poster error:", err);
      }
    },
    [fitToWorkspace, showToast]
  );

  const handleOpenDesign = useCallback(
    async (designId: string) => {
      if (designId === activeDesignIdRef.current) {
        setIsMyDesignsOpen(false);
        setViewMode("editor");
        setTimeout(() => fitToWorkspace(selectedPresetRef.current), 50);
        return;
      }

      if (isSavingRef.current) {
        await waitForInFlightSave();
      }

      if (hasUnsavedChangesRef.current) {
        if (autoSaveEnabledRef.current) {
          // Auto Save ON: flush pending changes before opening
          await executeSave(false);
          await proceedOpenDesign(designId);
        } else {
          // Auto Save OFF: prompt user
          setPendingAction({ type: "open", designId });
          setIsUnsavedModalOpen(true);
        }
      } else {
        await proceedOpenDesign(designId);
      }
    },
    [executeSave, proceedOpenDesign, waitForInFlightSave, fitToWorkspace]
  );

  const handleBackToGallery = useCallback(async () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    if (isSavingRef.current) {
      await waitForInFlightSave();
    }

    if (hasUnsavedChangesRef.current) {
      if (autoSaveEnabledRef.current) {
        // Auto Save ON: flush pending save and wait for it
        const success = await executeSave(false);
        if (success) {
          setViewMode("gallery");
        }
      } else {
        // Auto Save OFF: prompt user
        setPendingAction({ type: "gallery" });
        setIsUnsavedModalOpen(true);
      }
    } else {
      setViewMode("gallery");
    }
  }, [executeSave, waitForInFlightSave]);

  const handleUnsavedSaveAndContinue = useCallback(async () => {
    const success = await executeSave(true);
    if (!success) {
      return;
    }
    setIsUnsavedModalOpen(false);
    const action = pendingAction;
    setPendingAction(null);

    if (action?.type === "gallery") {
      setViewMode("gallery");
    } else if (action?.type === "new") {
      proceedNewPoster(action.preset);
    } else if (action?.type === "open") {
      await proceedOpenDesign(action.designId);
    }
  }, [executeSave, pendingAction, proceedNewPoster, proceedOpenDesign]);

  const handleUnsavedDiscard = useCallback(async () => {
    hasUnsavedChangesRef.current = false;
    setIsUnsavedModalOpen(false);
    const action = pendingAction;
    setPendingAction(null);

    if (action?.type === "gallery") {
      setViewMode("gallery");
    } else if (action?.type === "new") {
      proceedNewPoster(action.preset);
    } else if (action?.type === "open") {
      await proceedOpenDesign(action.designId);
    }
  }, [pendingAction, proceedNewPoster, proceedOpenDesign]);

  const handleUnsavedCancel = useCallback(() => {
    setIsUnsavedModalOpen(false);
    setPendingAction(null);
  }, []);

  const handleDesignRenamed = useCallback((id: string, newName: string) => {
    if (id === activeDesignIdRef.current) {
      setTitle(newName);
      titleRef.current = newName;
    }
  }, []);

  const handleDesignDeleted = useCallback((id: string) => {
    if (id === activeDesignIdRef.current) {
      setActiveDesignId(null);
      activeDesignIdRef.current = null;
    }
  }, []);

  // Whenever switching into editor mode, automatically fit canvas to container
  useEffect(() => {
    if (viewMode === "editor") {
      const timer = setTimeout(() => {
        fitToWorkspace();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [viewMode, fitToWorkspace]);

  // Initialize Canvas
  useEffect(() => {
    if (!canvasElRef.current) return;

    const manager = new PosterCanvasManager({
      canvasElement: canvasElRef.current,
      width: selectedPreset.width,
      height: selectedPreset.height,
      backgroundColor: "#ffffff",
      onStateChange: () => {
        if (!isInitializingRef.current && !isRestoringRef.current) {
          updateHistoryState();
          markUnsavedRef.current();
        }
      },
      onSelectionChange: handleSelectionChange,
      onLayersChange: handleLayersChange,
      onZoomChange: (z) => {
        isManualZoomRef.current = true;
        setZoomLevel(z);
      },
    });

    canvasManagerRef.current = manager;
    manager.setActiveTool(activeTool);
    manager.setZoom(zoomLevel);

    // Initial clean canvas state - do not automatically initialize a sample SUMMER SALE poster on mount.
    // Starter template or fresh design is only initialized when user explicitly clicks "Create New Poster".
    const initialJson = manager.toJSON();
    historyManagerRef.current.clear();
    historyManagerRef.current.pushState(initialJson);
    setCanUndo(false);
    setCanRedo(false);
    setLayers(manager.getLayers());
    isInitializingRef.current = false;

    // Initial auto-fit
    setTimeout(fitToWorkspace, 40);

    // React Strict Mode cleanup
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      manager.dispose();
      canvasManagerRef.current = null;
    };
  }, []); // Run once on mount

  // Automatically recalculate fit zoom whenever container or viewport resizes
  // unless user has actively applied manual zoom
  useEffect(() => {
    const container = workspaceRef.current;
    if (!container) return;

    let resizeTimer: any = null;
    let lastW = container.clientWidth;
    let lastH = container.clientHeight;

    const observer = new ResizeObserver((entries) => {
      if (isManualZoomRef.current) return;
      const entry = entries[0];
      if (entry) {
        const newW = entry.contentRect.width;
        const newH = entry.contentRect.height;
        // Avoid endless loops if dimensions haven't significantly changed
        if (Math.abs(newW - lastW) < 2 && Math.abs(newH - lastH) < 2) {
          return;
        }
        lastW = newW;
        lastH = newH;
      }
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!isManualZoomRef.current) {
          fitToWorkspace();
        }
      }, 50);
    });
    observer.observe(container);

    return () => {
      clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, [fitToWorkspace]);

  // Handle Preset Dimension Changes
  const handlePresetChange = (preset: PosterPreset) => {
    setSelectedPreset(preset);
    selectedPresetRef.current = preset;
    isManualZoomRef.current = false;
    const manager = canvasManagerRef.current;
    if (!manager) return;

    manager.setLogicalDimensions(preset.width, preset.height);
    updateHistoryState();
    markUnsaved();
    fitToWorkspace(preset);
    showToast(`Canvas resized to ${preset.name} (${preset.width}×${preset.height})`);
  };

  // Zoom Handler
  const handleZoomChange = (newZoom: number) => {
    isManualZoomRef.current = true;
    const clamped = Math.max(0.2, Math.min(Number(newZoom.toFixed(2)), 3.0));
    setZoomLevel(clamped);
    canvasManagerRef.current?.setZoom(clamped);
  };

  const handleResetZoom = () => {
    isManualZoomRef.current = false;
    fitToWorkspace();
  };

  // Undo / Redo
  const handleUndo = async () => {
    const history = historyManagerRef.current;
    const manager = canvasManagerRef.current;
    if (!history.canUndo() || !manager) return;

    history.setLock(true);
    isRestoringRef.current = true;
    try {
      const prevState = history.undo();
      if (prevState) {
        const restored = await manager.loadFromJSON(prevState);
        if (restored.width && restored.height) {
          const match = findPreset(restored.width, restored.height);
          if (match && match.id !== selectedPresetRef.current.id) {
            setSelectedPreset(match);
            selectedPresetRef.current = match;
            isManualZoomRef.current = false;
            fitToWorkspace(match);
          } else if (!isManualZoomRef.current) {
            fitToWorkspace();
          }
        }
        setCanUndo(history.canUndo());
        setCanRedo(history.canRedo());
        setActiveProperties(manager.getSelectedProperties());
        setLayers(manager.getLayers());
        markUnsaved();
      }
    } finally {
      history.setLock(false);
      isRestoringRef.current = false;
    }
  };

  const handleRedo = async () => {
    const history = historyManagerRef.current;
    const manager = canvasManagerRef.current;
    if (!history.canRedo() || !manager) return;

    history.setLock(true);
    isRestoringRef.current = true;
    try {
      const nextState = history.redo();
      if (nextState) {
        const restored = await manager.loadFromJSON(nextState);
        if (restored.width && restored.height) {
          const match = findPreset(restored.width, restored.height);
          if (match && match.id !== selectedPresetRef.current.id) {
            setSelectedPreset(match);
            selectedPresetRef.current = match;
            isManualZoomRef.current = false;
            fitToWorkspace(match);
          } else if (!isManualZoomRef.current) {
            fitToWorkspace();
          }
        }
        setCanUndo(history.canUndo());
        setCanRedo(history.canRedo());
        setActiveProperties(manager.getSelectedProperties());
        setLayers(manager.getLayers());
        markUnsaved();
      }
    } finally {
      history.setLock(false);
      isRestoringRef.current = false;
    }
  };

  // Add Elements
  const handleAddImage = async (file: File) => {
    const manager = canvasManagerRef.current;
    if (!manager) return;
    try {
      await manager.addImageFromFile(file);
      showToast("Image added to canvas");
    } catch (err: any) {
      showToast(err.message || "Failed to add image", true);
    }
  };

  const handleAddText = (type: "heading" | "subheading" | "body" | "badge") => {
    const manager = canvasManagerRef.current;
    if (!manager) return;

    switch (type) {
      case "heading":
        manager.addText("SPECIAL OFFER", { fontSize: 52, fontWeight: "bold", fill: "#111827" });
        break;
      case "subheading":
        manager.addText("Limited Time Discount", { fontSize: 32, fontWeight: "normal", fill: "#475569" });
        break;
      case "body":
        manager.addText("Order today and enjoy free doorstep delivery via WhatsApp.", {
          fontSize: 22,
          fontWeight: "normal",
          fill: "#64748b",
        });
        break;
      case "badge":
        manager.addSticker("discount-50");
        break;
    }
  };

  const handleAddShape = (shape: "rect" | "circle" | "line") => {
    const manager = canvasManagerRef.current;
    if (!manager) return;

    if (shape === "rect") {
      manager.addRectangle();
    } else if (shape === "circle") {
      manager.addCircle();
    } else if (shape === "line") {
      manager.addLine();
    }
  };

  const handleAddSticker = (type: StickerType) => {
    const manager = canvasManagerRef.current;
    if (!manager) return;
    manager.addSticker(type);
    showToast("Sticker added to poster");
  };

  const handleBackgroundColorChange = (color: string) => {
    const manager = canvasManagerRef.current;
    if (!manager) return;
    manager.fabricCanvas.backgroundColor = color;
    manager.fabricCanvas.requestRenderAll();
    updateHistoryState();
    markUnsaved();
  };

  const handleClearCanvas = () => {
    const manager = canvasManagerRef.current;
    if (!manager) return;
    manager.clear();
    updateHistoryState();
    markUnsaved();
    showToast("Canvas cleared");
  };

  // Properties Updates & Alignment
  const handleUpdateProperty = (key: string, value: any) => {
    canvasManagerRef.current?.updateSelectedProperty(key, value);
  };

  const handleAlign = (alignment: AlignmentType) => {
    canvasManagerRef.current?.alignActiveObject(alignment);
  };

  const handleDeleteSelected = () => {
    const deleted = canvasManagerRef.current?.deleteSelected();
    if (deleted) {
      setActiveProperties(null);
      showToast("Element deleted");
    }
  };

  // Layer Actions
  const handleSelectLayer = (id: string) => {
    canvasManagerRef.current?.selectLayer(id);
    setActiveProperties(canvasManagerRef.current?.getSelectedProperties() || null);
  };

  const handleMoveLayerUp = (id: string) => {
    canvasManagerRef.current?.moveLayerUp(id);
  };

  const handleMoveLayerDown = (id: string) => {
    canvasManagerRef.current?.moveLayerDown(id);
  };

  const handleToggleLayerVisibility = (id: string) => {
    canvasManagerRef.current?.toggleLayerVisibility(id);
  };

  const handleToggleLayerLock = (id: string) => {
    canvasManagerRef.current?.toggleLayerLock(id);
  };

  const handleDeleteLayer = (id: string) => {
    canvasManagerRef.current?.deleteLayer(id);
    showToast("Layer deleted");
  };

  // Export
  const handleExport = (format: ExportFormat) => {
    const manager = canvasManagerRef.current;
    if (!manager) return;

    setIsExporting(true);
    try {
      const sanitizedName = title.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "poster";
      const result = exportCanvasToImage(
        manager.fabricCanvas,
        selectedPreset.width,
        selectedPreset.height,
        {
          format,
          quality: 0.95,
          filename: `${sanitizedName}-${selectedPreset.width}x${selectedPreset.height}.${
            format === "jpeg" ? "jpg" : "png"
          }`,
        }
      );

      downloadDataUrl(result.dataUrl, result.filename);
      showToast(`Exported ${format.toUpperCase()} (${result.width}×${result.height}) successfully!`);
    } catch (err: any) {
      console.error("Export error:", err);
      showToast("Failed to export image.", true);
    } finally {
      setIsExporting(false);
    }
  };

  // Format Conversion
  const handleConvertToOtherSize = useCallback((targetPreset: PosterPreset) => {
    setConvertTargetPreset(targetPreset);
    setIsConvertModalOpen(true);
  }, []);

  const handleConfirmConvert = useCallback(
    async (targetPreset: PosterPreset) => {
      const manager = canvasManagerRef.current;
      if (!manager) return;

      try {
        setIsConvertModalOpen(false);

        // 1. Ensure current design is saved so original design is preserved safely in storage
        if (hasUnsavedChangesRef.current) {
          await executeSave(false);
        }

        // 2. Intelligently adapt canvas layout to target dimensions without clipping
        const currentJson = manager.toJSON();
        const { convertedJson, newName } = adaptCanvasJsonToPreset(
          currentJson,
          selectedPresetRef.current,
          targetPreset,
          titleRef.current
        );

        // 3. Save as a new independent design record in user's isolated IndexedDB
        const thumbnail = generateCanvasThumbnail(
          manager.fabricCanvas,
          targetPreset.width,
          targetPreset.height
        );
        const savedDesign = await posterStorageService.saveDesign({
          name: newName,
          presetId: targetPreset.id,
          width: targetPreset.width,
          height: targetPreset.height,
          canvasJson: convertedJson,
          thumbnailDataUrl: thumbnail,
          assetIds: [],
        });

        // 4. Update editor state to load the converted design
        setSelectedPreset(targetPreset);
        selectedPresetRef.current = targetPreset;
        setTitle(newName);
        titleRef.current = newName;
        setActiveDesignId(savedDesign.id);
        activeDesignIdRef.current = savedDesign.id;

        manager.setLogicalDimensions(targetPreset.width, targetPreset.height);
        await manager.loadFromJSON(convertedJson);

        // Reset history for the new design
        historyManagerRef.current.clear();
        historyManagerRef.current.pushState(manager.toJSON());
        setCanUndo(false);
        setCanRedo(false);
        setLayers(manager.getLayers());
        setActiveProperties(null);
        hasUnsavedChangesRef.current = false;
        setSaveStatus("saved");

        setTimeout(() => fitToWorkspace(targetPreset), 50);
        showToast(`Converted to ${targetPreset.name}! Original preserved.`);
      } catch (err: any) {
        console.error("Format conversion error:", err);
        showToast(err?.message || "Failed to convert poster format.", true);
      }
    },
    [executeSave, fitToWorkspace, showToast]
  );


  // Keyboard Shortcuts (Save, Undo, Redo, Delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not intercept shortcuts when modal dialogs are active
      if (isMyDesignsOpenRef.current || isUnsavedModalOpenRef.current) {
        return;
      }

      // Global Ctrl+S / Cmd+S save shortcut
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        e.stopPropagation();
        executeSave(true);
        return;
      }

      const manager = canvasManagerRef.current;
      const active = manager?.fabricCanvas.getActiveObject();
      const isEditingText = Boolean(active && (active as any).isEditing);

      // Do not intercept if user is typing in form controls or directly inside an editable canvas text object
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "SELECT" ||
        document.activeElement?.getAttribute("contenteditable") === "true" ||
        isEditingText
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (active) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, canRedo, executeSave]);

  return (
    <div className="poster-editor-page" id="poster-editor-root">
      {viewMode === "gallery" && (
        <PosterGalleryView
          key={activeUserId || "anonymous"}
          userId={activeUserId}
          onOpenDesign={handleOpenDesign}
          onNewPoster={handleNewPoster}
          activeDesignId={activeDesignId}
          onDesignRenamed={handleDesignRenamed}
          onDesignDeleted={handleDesignDeleted}
        />
      )}

      {/* Editor layout remains mounted in DOM, hidden when viewMode === "gallery" */}
      <div
        className="poster-editor-layout-wrapper"
        style={{
          display: viewMode === "editor" ? "flex" : "none",
          flexDirection: "column",
          flex: 1,
          height: "100%",
          overflow: "hidden",
        }}
      >
        {/* Top Toolbar */}
        <PosterToolbar
          title={title}
          onTitleChange={handleTitleChange}
          selectedPreset={selectedPreset}
          onPresetChange={handlePresetChange}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          zoomLevel={zoomLevel}
          onZoomChange={handleZoomChange}
          onResetZoom={handleResetZoom}
          onExport={handleExport}
          isExporting={isExporting}
          onConvertToOtherSize={handleConvertToOtherSize}
          onSave={() => executeSave(true)}
          isSaving={saveStatus === "saving"}
          saveStatus={saveStatus}
          autoSaveEnabled={autoSaveEnabled}
          onAutoSaveToggle={handleAutoSaveToggle}
          onOpenMyDesigns={() => setIsMyDesignsOpen(true)}
          onBackToGallery={handleBackToGallery}
          onNewPoster={handleNewPoster}
        />

        {/* Main Studio Body: Tool Rail + Canvas Workspace + Right Studio Panel */}
        <div className="poster-editor-body">
          {/* Left Tools */}
          <PosterToolRail
            activeTool={activeTool}
            onToolChange={(tool) => {
              setActiveTool(tool);
              canvasManagerRef.current?.setActiveTool(tool);
            }}
            onAddImage={handleAddImage}
            onOpenAiBgRemoval={() => setIsAiBgModalOpen(true)}
            onOpenAiBgBlur={() => setIsAiBgBlurModalOpen(true)}
            onAddText={handleAddText}
            onAddShape={handleAddShape}
            onAddSticker={handleAddSticker}
            onBackgroundColorChange={handleBackgroundColorChange}
            onClearCanvas={handleClearCanvas}
          />

          {/* Central Viewport Workspace */}
          <main ref={workspaceRef} className="poster-canvas-workspace" aria-label="Poster Design Canvas">
            <div className="canvas-scroll-container">
              <div
                className="canvas-card-shadow"
                style={{
                  width: selectedPreset.width * zoomLevel,
                  height: selectedPreset.height * zoomLevel,
                }}
              >
                <canvas ref={canvasElRef} id="grovastra-fabric-canvas" />
              </div>
            </div>
          </main>

          {/* Right Studio Panel (Tabs: Properties & Layers) - Hidden on Mobile */}
          <div className="poster-right-rail">
            {/* Panel Switcher Tabs */}
            <div className="right-rail-tabs" role="tablist">
              <button
                type="button"
                className={`right-tab-btn ${rightPanelTab === "properties" ? "active" : ""}`}
                onClick={() => setRightPanelTab("properties")}
                role="tab"
                aria-selected={rightPanelTab === "properties"}
              >
                <Sliders size={14} />
                <span>Properties</span>
              </button>

              <button
                type="button"
                className={`right-tab-btn ${rightPanelTab === "layers" ? "active" : ""}`}
                onClick={() => setRightPanelTab("layers")}
                role="tab"
                aria-selected={rightPanelTab === "layers"}
              >
                <Layers size={14} />
                <span>Layers ({layers.length})</span>
              </button>
            </div>

            {/* Tab Content */}
            <div className="right-rail-content">
              {rightPanelTab === "properties" ? (
                <PosterPropertiesPanel
                  properties={activeProperties}
                  onUpdateProperty={handleUpdateProperty}
                  onDeleteSelected={handleDeleteSelected}
                  onAlign={handleAlign}
                />
              ) : (
                <PosterLayersPanel
                  layers={layers}
                  onSelectLayer={handleSelectLayer}
                  onMoveUp={handleMoveLayerUp}
                  onMoveDown={handleMoveLayerDown}
                  onToggleVisibility={handleToggleLayerVisibility}
                  onToggleLock={handleToggleLayerLock}
                  onDeleteLayer={handleDeleteLayer}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Studio Navigation, Drawers & Sheets — strictly mobile viewports (<= 640px) and editor mode */}
      {isMobile && viewMode === "editor" && (
        <>
          <PosterMobileDock
            activeTab={activeMobileTab}
            onTabChange={(tab) => {
              setActiveMobileTab(tab);
              if (tab === "edit") {
                setIsMobileSheetOpen(true);
              }
            }}
            hasSelection={Boolean(activeProperties)}
            layersCount={layers.length}
            onFitCanvas={() => {
              isManualZoomRef.current = false;
              fitToWorkspace();
            }}
          />

          <PosterMobileAddSheet
            isOpen={activeMobileTab === "add"}
            onClose={() => setActiveMobileTab(null)}
            onAddImage={handleAddImage}
            onOpenAiBgRemoval={() => setIsAiBgModalOpen(true)}
            onOpenAiBgBlur={() => setIsAiBgBlurModalOpen(true)}
            onAddText={handleAddText}
            onAddShape={handleAddShape}
            onAddSticker={handleAddSticker}
            onBackgroundColorChange={handleBackgroundColorChange}
            onOpenMyDesigns={() => setIsMyDesignsOpen(true)}
          />

          {activeMobileTab === "layers" && (
            <>
              <div
                className="mobile-sheet-backdrop"
                onClick={() => setActiveMobileTab(null)}
                aria-hidden="true"
              />
              <div
                className="mobile-properties-sheet mobile-layers-drawer"
                role="dialog"
                aria-modal="true"
                aria-label="Poster Layers Order and Controls"
              >
                <div className="mobile-sheet-handle-bar">
                  <div className="sheet-handle" />
                </div>
                <div className="mobile-sheet-header">
                  <div className="sheet-title-group">
                    <Layers size={16} className="text-emerald" />
                    <h3>Poster Layers ({layers.length})</h3>
                  </div>
                  <button
                    type="button"
                    className="sheet-btn-close"
                    onClick={() => setActiveMobileTab(null)}
                    aria-label="Close layers menu"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="mobile-layers-drawer-body">
                  <PosterLayersPanel
                    layers={layers}
                    onSelectLayer={(id) => {
                      handleSelectLayer(id);
                      setActiveMobileTab(null);
                    }}
                    onMoveUp={handleMoveLayerUp}
                    onMoveDown={handleMoveLayerDown}
                    onToggleVisibility={handleToggleLayerVisibility}
                    onToggleLock={handleToggleLayerLock}
                    onDeleteLayer={handleDeleteLayer}
                  />
                </div>
              </div>
            </>
          )}

          <PosterMobileSheet
            isOpen={isMobileSheetOpen || activeMobileTab === "edit"}
            onClose={() => {
              setIsMobileSheetOpen(false);
              setActiveMobileTab(null);
            }}
            properties={activeProperties}
            onUpdateProperty={handleUpdateProperty}
            onDeleteSelected={handleDeleteSelected}
            onAlign={handleAlign}
          />
        </>
      )}

      {/* Toast Feedback Notification */}
      {toastMessage && (
        <div className={`poster-toast-feedback ${toastIsError ? "toast-error" : ""}`} role="status">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Phase 3A, Step 3: My Designs Modal */}
      <MyDesignsModal
        isOpen={isMyDesignsOpen}
        onClose={() => setIsMyDesignsOpen(false)}
        activeDesignId={activeDesignId}
        onOpenDesign={handleOpenDesign}
        onNewPoster={handleNewPoster}
        onDesignRenamed={handleDesignRenamed}
        onDesignDeleted={handleDesignDeleted}
      />

      {/* Phase 3A, Step 3: Unsaved Changes Protection Modal */}
      <UnsavedChangesModal
        isOpen={isUnsavedModalOpen}
        onSaveAndContinue={handleUnsavedSaveAndContinue}
        onDiscard={handleUnsavedDiscard}
        onCancel={handleUnsavedCancel}
        isSaving={saveStatus === "saving"}
      />

      {/* Format Conversion Confirmation Modal */}
      <PosterConvertSizeModal
        isOpen={isConvertModalOpen}
        onClose={() => setIsConvertModalOpen(false)}
        currentPreset={selectedPreset}
        targetPreset={convertTargetPreset}
        posterTitle={title}
        onConfirmConvert={handleConfirmConvert}
      />


      {/* AI Background Removal Modal (Isolated PoC - Lazy Loaded) */}
      <React.Suspense fallback={null}>
        {isAiBgModalOpen && (
          <AIBackgroundRemovalModal
            isOpen={isAiBgModalOpen}
            onClose={() => setIsAiBgModalOpen(false)}
            onApplyResult={handleAddImage}
          />
        )}
      </React.Suspense>

      {/* AI Background Blur Modal (Isolated PoC - Lazy Loaded) */}
      <React.Suspense fallback={null}>
        {isAiBgBlurModalOpen && (
          <AIBackgroundBlurModal
            isOpen={isAiBgBlurModalOpen}
            onClose={() => setIsAiBgBlurModalOpen(false)}
            onApplyResult={handleAddImage}
          />
        )}
      </React.Suspense>
    </div>
  );
};

export default PosterEditorPage;
