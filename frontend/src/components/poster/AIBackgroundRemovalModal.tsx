import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Upload,
  Sparkles,
  AlertCircle,
  Check,
  RefreshCw,
  Eye,
  Sliders,
  Layers,
  Brush,
  Eraser,
  Undo2,
  Redo2,
  RotateCcw,
} from "lucide-react";
import {
  backgroundRemovalService,
  BackgroundRemovalResult,
  ProgressStage,
} from "../../services/ai/backgroundRemovalService";

export interface AIBackgroundRemovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyResult: (transparentFile: File) => void;
  initialFile?: File | null;
}

export const AIBackgroundRemovalModal: React.FC<AIBackgroundRemovalModalProps> = ({
  isOpen,
  onClose,
  onApplyResult,
  initialFile = null,
}) => {
  const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [progressStage, setProgressStage] = useState<ProgressStage>("init");
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<BackgroundRemovalResult | null>(null);
  const [previewTab, setPreviewTab] = useState<"compare" | "result" | "original">("compare");

  // Manual Refine Cutout State
  const [viewMode, setViewMode] = useState<"preview" | "refine">("preview");
  const [refineTool, setRefineTool] = useState<"keep" | "remove">("keep");
  const [brushSize, setBrushSize] = useState<number>(24);
  const [showMaskOverlay, setShowMaskOverlay] = useState<boolean>(false);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);
  const [isApplyingRefine, setIsApplyingRefine] = useState<boolean>(false);
  const [brushCursor, setBrushCursor] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeResultRef = useRef<BackgroundRemovalResult | null>(null);

  // References for manual refine editor
  const interactiveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const editableMaskCanvasRef = useRef<OffscreenCanvas | HTMLCanvasElement | null>(null);
  const initialMaskCanvasRef = useRef<OffscreenCanvas | HTMLCanvasElement | null>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const redoStackRef = useRef<ImageData[]>([]);
  const isDrawingRef = useRef<boolean>(false);
  const currentStrokePointsRef = useRef<Array<{ x: number; y: number }>>([]);

  // Keep track of active result for cleanup on unmount
  useEffect(() => {
    activeResultRef.current = result;
  }, [result]);

  const cleanupUrls = useCallback(() => {
    if (activeResultRef.current) {
      backgroundRemovalService.revokeUrls(
        activeResultRef.current.transparentUrl,
        activeResultRef.current.originalUrl
      );
    }
    editableMaskCanvasRef.current = null;
    initialMaskCanvasRef.current = null;
    sourceImageRef.current = null;
    undoStackRef.current = [];
    redoStackRef.current = [];
  }, []);

  const handleClose = useCallback(() => {
    cleanupUrls();
    setStatus("idle");
    setViewMode("preview");
    setResult(null);
    setErrorMessage(null);
    onClose();
  }, [cleanupUrls, onClose]);

  const processFile = useCallback(
    async (file: File) => {
      setStatus("processing");
      setViewMode("preview");
      setErrorMessage(null);
      setProgressStage("init");
      setProgressPercent(10);

      // Clean up previous URLs if any
      cleanupUrls();
      setResult(null);

      try {
        const res = await backgroundRemovalService.removeBackground(file, {
          onProgress: (stage, percent) => {
            setProgressStage(stage);
            setProgressPercent(percent);
          },
        });

        setResult(res);
        setStatus("success");
      } catch (err: any) {
        setStatus("error");
        setErrorMessage(
          err?.message ||
            "Failed to remove background. Please check the image format and try again."
        );
      }
    },
    [cleanupUrls]
  );

  // Auto-process initialFile when modal opens
  useEffect(() => {
    if (isOpen && initialFile) {
      processFile(initialFile);
    } else if (isOpen && !initialFile && status === "idle") {
      setResult(null);
      setViewMode("preview");
    }
  }, [isOpen, initialFile, processFile]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupUrls();
    };
  }, [cleanupUrls]);

  // Refine Mode: Renders interactive viewport canvas combining source image & editable mask
  const renderInteractiveViewport = useCallback(() => {
    const canvas = interactiveCanvasRef.current;
    const mask = editableMaskCanvasRef.current;
    const sourceImg = sourceImageRef.current;
    if (!canvas || !mask || !sourceImg || !result) return;

    if (canvas.width !== result.width || canvas.height !== result.height) {
      canvas.width = result.width;
      canvas.height = result.height;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, result.width, result.height);

    // Draw composited cutout: sourceImg destination-in mask
    ctx.save();
    ctx.drawImage(sourceImg, 0, 0, result.width, result.height);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0, result.width, result.height);
    ctx.restore();

    // Optional visual mask overlay tint so users clearly see where mask is applied
    if (showMaskOverlay) {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(16, 185, 129, 0.28)";
      ctx.drawImage(mask, 0, 0, result.width, result.height);
      ctx.restore();
    }
  }, [result, showMaskOverlay]);

  // Initialize Refine Mode
  const handleEnterRefineMode = async () => {
    if (!result) return;
    try {
      const sourceImg = await backgroundRemovalService.loadImageElement(result.originalUrl);
      sourceImageRef.current = sourceImg;

      const cutoutImg = await backgroundRemovalService.loadImageElement(result.transparentUrl);
      const maskCanvas = backgroundRemovalService.createEditableMask(
        cutoutImg,
        result.width,
        result.height
      );
      editableMaskCanvasRef.current = maskCanvas;

      const initialClone = backgroundRemovalService.createEditableMask(
        cutoutImg,
        result.width,
        result.height
      );
      initialMaskCanvasRef.current = initialClone;

      undoStackRef.current = [];
      redoStackRef.current = [];
      setCanUndo(false);
      setCanRedo(false);
      setViewMode("refine");
    } catch (err) {
      console.error("[AIBackgroundRemovalModal] Failed to initialize refine mode:", err);
    }
  };

  // Re-render viewport whenever viewMode is refine or overlay changes
  useEffect(() => {
    if (viewMode === "refine") {
      renderInteractiveViewport();
    }
  }, [viewMode, showMaskOverlay, renderInteractiveViewport]);

  const saveMaskSnapshot = () => {
    const mask = editableMaskCanvasRef.current;
    if (!mask || !result) return;
    const ctx = mask.getContext("2d", { willReadFrequently: true }) as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!ctx) return;

    try {
      const snap = ctx.getImageData(0, 0, result.width, result.height);
      undoStackRef.current.push(snap);
      if (undoStackRef.current.length > 20) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
      setCanUndo(true);
      setCanRedo(false);
    } catch {
      // ignore in mocked environments
    }
  };

  const getCanvasCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = interactiveCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.max(0, Math.min(canvas.width, (e.clientX - rect.left) * scaleX));
    const y = Math.max(0, Math.min(canvas.height, (e.clientY - rect.top) * scaleY));
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    const coords = getCanvasCoordinates(e);

    saveMaskSnapshot();
    isDrawingRef.current = true;
    currentStrokePointsRef.current = [coords];

    const mask = editableMaskCanvasRef.current;
    if (mask) {
      backgroundRemovalService.applyBrushStroke(mask as any, {
        tool: refineTool,
        size: brushSize,
        points: [coords],
      });
      renderInteractiveViewport();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = interactiveCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;

    setBrushCursor({
      x: relX,
      y: relY,
      visible: relX >= 0 && relX <= rect.width && relY >= 0 && relY <= rect.height,
    });

    if (!isDrawingRef.current) return;
    e.preventDefault();

    const coords = getCanvasCoordinates(e);
    const pts = currentStrokePointsRef.current;
    const lastPt = pts[pts.length - 1];

    if (lastPt) {
      const dist = Math.hypot(coords.x - lastPt.x, coords.y - lastPt.y);
      if (dist >= 2) {
        pts.push(coords);
        const mask = editableMaskCanvasRef.current;
        if (mask) {
          backgroundRemovalService.applyBrushStroke(mask as any, {
            tool: refineTool,
            size: brushSize,
            points: [lastPt, coords],
          });
          renderInteractiveViewport();
        }
      }
    }
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    currentStrokePointsRef.current = [];
  };

  const handlePointerLeave = () => {
    setBrushCursor((prev) => ({ ...prev, visible: false }));
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      currentStrokePointsRef.current = [];
    }
  };

  const handleUndo = () => {
    const mask = editableMaskCanvasRef.current;
    if (!mask || !result || undoStackRef.current.length === 0) return;
    const ctx = mask.getContext("2d", { willReadFrequently: true }) as any;
    if (!ctx) return;

    try {
      const currentSnap = ctx.getImageData(0, 0, result.width, result.height);
      redoStackRef.current.push(currentSnap);
      const prevSnap = undoStackRef.current.pop()!;
      ctx.putImageData(prevSnap, 0, 0);
      setCanUndo(undoStackRef.current.length > 0);
      setCanRedo(true);
      renderInteractiveViewport();
    } catch {
      // ignore
    }
  };

  const handleRedo = () => {
    const mask = editableMaskCanvasRef.current;
    if (!mask || !result || redoStackRef.current.length === 0) return;
    const ctx = mask.getContext("2d", { willReadFrequently: true }) as any;
    if (!ctx) return;

    try {
      const currentSnap = ctx.getImageData(0, 0, result.width, result.height);
      undoStackRef.current.push(currentSnap);
      const nextSnap = redoStackRef.current.pop()!;
      ctx.putImageData(nextSnap, 0, 0);
      setCanUndo(true);
      setCanRedo(redoStackRef.current.length > 0);
      renderInteractiveViewport();
    } catch {
      // ignore
    }
  };

  const handleReset = () => {
    const mask = editableMaskCanvasRef.current;
    const initial = initialMaskCanvasRef.current;
    if (!mask || !initial || !result) return;
    saveMaskSnapshot();
    const initialCtx = initial.getContext("2d", { willReadFrequently: true }) as any;
    const maskCtx = mask.getContext("2d", { willReadFrequently: true }) as any;
    if (initialCtx && maskCtx) {
      try {
        const snap = initialCtx.getImageData(0, 0, result.width, result.height);
        maskCtx.putImageData(snap, 0, 0);
        renderInteractiveViewport();
      } catch {
        // ignore
      }
    }
  };

  const handleDoneRefining = async () => {
    const mask = editableMaskCanvasRef.current;
    const sourceImg = sourceImageRef.current;
    if (!mask || !sourceImg || !result) {
      setViewMode("preview");
      return;
    }

    try {
      setIsApplyingRefine(true);
      const baseName = result.transparentFile.name.replace(/-(?:nobg|refined)\.png$/, "");
      const refined = await backgroundRemovalService.recompositeWithMask(
        sourceImg,
        mask,
        result.width,
        result.height,
        `${baseName}-refined.png`
      );

      // Revoke previous transparentUrl to prevent memory leak
      backgroundRemovalService.revokeUrls(result.transparentUrl);

      setResult({
        ...result,
        transparentBlob: refined.transparentBlob,
        transparentFile: refined.transparentFile,
        transparentUrl: refined.transparentUrl,
      });

      setViewMode("preview");
    } catch (e) {
      console.error("[AIBackgroundRemovalModal] Failed to recomposite refined cutout:", e);
    } finally {
      setIsApplyingRefine(false);
    }
  };

  const handleApplyDirectlyFromRefine = async () => {
    const mask = editableMaskCanvasRef.current;
    const sourceImg = sourceImageRef.current;
    if (!mask || !sourceImg || !result) {
      handleApply();
      return;
    }

    try {
      setIsApplyingRefine(true);
      const baseName = result.transparentFile.name.replace(/-(?:nobg|refined)\.png$/, "");
      const refined = await backgroundRemovalService.recompositeWithMask(
        sourceImg,
        mask,
        result.width,
        result.height,
        `${baseName}-refined.png`
      );

      onApplyResult(refined.transparentFile);
      handleClose();
    } catch (e) {
      console.error("[AIBackgroundRemovalModal] Failed to apply refined cutout:", e);
    } finally {
      setIsApplyingRefine(false);
    }
  };

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleApply = () => {
    if (!result) return;
    onApplyResult(result.transparentFile);
    handleClose();
  };

  const getStageLabel = () => {
    switch (progressStage) {
      case "init":
        return "Initializing AI inference engine...";
      case "preprocessing":
        return "Resizing and normalizing image tensor (320×320)...";
      case "inference":
        return "Predicting foreground mask with U²-Netp ONNX...";
      case "compositing":
        return "Rendering high-precision transparent alpha mask...";
      case "complete":
        return "Background removal complete!";
      default:
        return "Processing image...";
    }
  };

  return (
    <div
      className="ai-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-modal-title"
    >
      <div className="ai-modal-container">
        {/* Header */}
        <div className="ai-modal-header">
          <div className="ai-modal-title-group">
            <div className="ai-modal-badge">
              <Sparkles size={16} />
              <span>{viewMode === "refine" ? "Manual Refinement" : "Isolated AI PoC"}</span>
            </div>
            <h3 id="ai-modal-title">
              {viewMode === "refine" ? "Refine Cutout Edges" : "AI Product Background Removal"}
            </h3>
            <p className="ai-modal-subtitle">
              {viewMode === "refine"
                ? "Paint over missed foreground parts to Keep / Restore, or brush over unwanted areas to Remove."
                : "Browser-native segmentation using U²-Netp ONNX. 100% private — runs entirely on your device."}
            </p>
          </div>
          <button
            type="button"
            className="ai-modal-close-btn"
            onClick={handleClose}
            aria-label="Close background removal modal"
            disabled={status === "processing"}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Content */}
        <div className="ai-modal-body">
          {/* 1. IDLE: Pick File */}
          {status === "idle" && (
            <div className="ai-upload-dropzone">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                id="ai-bg-file-picker"
              />
              <div
                className="ai-dropzone-content"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="ai-dropzone-icon">
                  <Upload size={36} />
                </div>
                <h4>Select a Product Photo</h4>
                <p>Supports PNG, JPG, or WebP up to 10 MB</p>
                <button
                  type="button"
                  className="ai-primary-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  <Upload size={16} />
                  <span>Choose Photo</span>
                </button>
              </div>
            </div>
          )}

          {/* 2. PROCESSING: Progress */}
          {status === "processing" && (
            <div className="ai-processing-state" role="status" aria-live="polite">
              <div className="ai-spinner-wrap">
                <div className="ai-spinner" />
                <Sparkles size={24} className="ai-spinner-icon" />
              </div>
              <h4>Removing Background</h4>
              <p className="ai-stage-text">{getStageLabel()}</p>

              <div className="ai-progress-track">
                <div
                  className="ai-progress-bar"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="ai-progress-num">{progressPercent}%</span>

              <p className="ai-processing-note">
                Processing runs locally in a dedicated Web Worker to ensure smooth canvas responsiveness.
              </p>
            </div>
          )}

          {/* 3. ERROR: Actionable feedback */}
          {status === "error" && (
            <div className="ai-error-state" role="alert">
              <div className="ai-error-icon">
                <AlertCircle size={32} />
              </div>
              <h4>Background Removal Failed</h4>
              <p className="ai-error-message">{errorMessage}</p>

              <div className="ai-error-actions">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  className="ai-primary-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <RefreshCw size={15} />
                  <span>Try Another Photo</span>
                </button>
                <button
                  type="button"
                  className="ai-secondary-btn"
                  onClick={handleClose}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* 4. SUCCESS: Preview Mode OR Refine Mode */}
          {status === "success" && result && viewMode === "preview" && (
            <div className="ai-success-state">
              {/* Preview Toggle Tabs */}
              <div className="ai-preview-tabs">
                <button
                  type="button"
                  className={`ai-tab-btn ${previewTab === "compare" ? "active" : ""}`}
                  onClick={() => setPreviewTab("compare")}
                >
                  <Eye size={14} />
                  <span>Side-by-Side</span>
                </button>
                <button
                  type="button"
                  className={`ai-tab-btn ${previewTab === "result" ? "active" : ""}`}
                  onClick={() => setPreviewTab("result")}
                >
                  <Layers size={14} />
                  <span>Transparent Result</span>
                </button>
                <button
                  type="button"
                  className={`ai-tab-btn ${previewTab === "original" ? "active" : ""}`}
                  onClick={() => setPreviewTab("original")}
                >
                  <Sliders size={14} />
                  <span>Original Photo</span>
                </button>
              </div>

              {/* Visual Preview Containers */}
              <div className="ai-preview-stage">
                {previewTab === "compare" && (
                  <div className="ai-compare-split">
                    <div className="ai-preview-card">
                      <span className="ai-card-tag">Original</span>
                      <div className="ai-img-frame plain-frame">
                        <img
                          src={result.originalUrl}
                          alt="Original Product"
                          className="ai-preview-img"
                        />
                      </div>
                      <div className="ai-card-meta">
                        {result.originalWidth} × {result.originalHeight} px
                      </div>
                    </div>

                    <div className="ai-preview-card">
                      <span className="ai-card-tag success-tag">Background Removed</span>
                      <div className="ai-img-frame checkerboard-frame">
                        <img
                          src={result.transparentUrl}
                          alt="Transparent Product"
                          className="ai-preview-img"
                        />
                      </div>
                      <div className="ai-card-meta">
                        {result.width} × {result.height} px
                        {result.scaleApplied < 1
                          ? ` (optimized to ${Math.round(result.scaleApplied * 100)}%)`
                          : " (100% resolution)"}
                      </div>
                    </div>
                  </div>
                )}

                {previewTab === "result" && (
                  <div className="ai-single-preview">
                    <div className="ai-img-frame checkerboard-frame expanded-frame">
                      <img
                        src={result.transparentUrl}
                        alt="Transparent Product Result"
                        className="ai-preview-img"
                      />
                    </div>
                  </div>
                )}

                {previewTab === "original" && (
                  <div className="ai-single-preview">
                    <div className="ai-img-frame plain-frame expanded-frame">
                      <img
                        src={result.originalUrl}
                        alt="Original Product Photo"
                        className="ai-preview-img"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Informational badge & Refine prompt */}
              <div className="ai-quality-notice">
                <Sparkles size={14} className="text-emerald" />
                <span>
                  Transparent PNG generated with alpha mask. Click <strong>Refine Cutout</strong> to manually restore missed parts or erase unwanted background areas.
                </span>
              </div>
            </div>
          )}

          {/* 5. REFINE MODE: Interactive Keep/Remove Brush Viewport */}
          {status === "success" && result && viewMode === "refine" && (
            <div className="ai-refine-workspace">
              {/* Refine Controls Toolbar */}
              <div className="ai-refine-toolbar">
                {/* Tool Selection */}
                <div className="ai-refine-tools-group">
                  <button
                    type="button"
                    className={`ai-refine-tool-btn keep-btn ${refineTool === "keep" ? "active" : ""}`}
                    onClick={() => setRefineTool("keep")}
                    title="Keep / Restore: Paint over foreground areas that were accidentally removed"
                  >
                    <Brush size={15} />
                    <span>Keep / Restore</span>
                  </button>
                  <button
                    type="button"
                    className={`ai-refine-tool-btn remove-btn ${refineTool === "remove" ? "active" : ""}`}
                    onClick={() => setRefineTool("remove")}
                    title="Remove: Paint over unwanted background areas to make them transparent"
                  >
                    <Eraser size={15} />
                    <span>Remove Background</span>
                  </button>
                </div>

                {/* Brush Size Controls */}
                <div className="ai-refine-size-group">
                  <span className="ai-refine-label">Size:</span>
                  <input
                    type="range"
                    min={5}
                    max={80}
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="ai-refine-slider"
                  />
                  <span className="ai-refine-size-pill">{brushSize}px</span>
                  <div className="ai-refine-presets">
                    {[10, 25, 50].map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        className={`ai-refine-preset-btn ${brushSize === sz ? "active" : ""}`}
                        onClick={() => setBrushSize(sz)}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                {/* History & View Controls */}
                <div className="ai-refine-history-group">
                  <button
                    type="button"
                    className="ai-refine-icon-btn"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    title="Undo latest brush stroke"
                  >
                    <Undo2 size={16} />
                  </button>
                  <button
                    type="button"
                    className="ai-refine-icon-btn"
                    onClick={handleRedo}
                    disabled={!canRedo}
                    title="Redo stroke"
                  >
                    <Redo2 size={16} />
                  </button>
                  <button
                    type="button"
                    className="ai-refine-icon-btn"
                    onClick={handleReset}
                    title="Reset to initial AI Cutout"
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    type="button"
                    className={`ai-refine-icon-btn ${showMaskOverlay ? "active-tint" : ""}`}
                    onClick={() => setShowMaskOverlay(!showMaskOverlay)}
                    title="Toggle Mask Overlay Tint"
                  >
                    <Eye size={16} />
                  </button>
                </div>
              </div>

              {/* Interactive Drawing Canvas */}
              <div className="ai-refine-canvas-stage checkerboard-frame">
                <canvas
                  ref={interactiveCanvasRef}
                  className="ai-refine-canvas"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerLeave}
                  style={{ touchAction: "none" }}
                />

                {/* Circular Brush Cursor Indicator */}
                {brushCursor.visible && (
                  <div
                    className={`ai-brush-indicator ${refineTool}`}
                    style={{
                      left: `${brushCursor.x}px`,
                      top: `${brushCursor.y}px`,
                      width: `${brushSize}px`,
                      height: `${brushSize}px`,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                )}
              </div>

              {/* Guidance helper */}
              <div className="ai-refine-tip">
                <span className={refineTool === "keep" ? "text-emerald" : "text-rose"}>
                  {refineTool === "keep"
                    ? "Painting restores original subject pixels with full sharpness."
                    : "Painting erases background pixels cleanly to transparent."}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="ai-modal-footer">
          {viewMode === "preview" && (
            <>
              <button
                type="button"
                className="ai-secondary-btn"
                onClick={handleClose}
                disabled={status === "processing"}
              >
                Cancel
              </button>

              {status === "success" && (
                <div className="ai-footer-actions-group">
                  <button
                    type="button"
                    className="ai-secondary-btn refine-trigger-btn"
                    onClick={handleEnterRefineMode}
                  >
                    <Brush size={16} />
                    <span>Refine Cutout</span>
                  </button>
                  <button
                    type="button"
                    className="ai-primary-btn apply-btn"
                    onClick={handleApply}
                  >
                    <Check size={16} />
                    <span>Use Result</span>
                  </button>
                </div>
              )}

              {status === "idle" && (
                <button
                  type="button"
                  className="ai-primary-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={16} />
                  <span>Select Image</span>
                </button>
              )}
            </>
          )}

          {viewMode === "refine" && (
            <>
              <button
                type="button"
                className="ai-secondary-btn"
                onClick={() => setViewMode("preview")}
                disabled={isApplyingRefine}
              >
                Cancel Refine
              </button>

              <div className="ai-footer-actions-group">
                <button
                  type="button"
                  className="ai-secondary-btn"
                  onClick={handleDoneRefining}
                  disabled={isApplyingRefine}
                >
                  <span>Done Refining</span>
                </button>
                <button
                  type="button"
                  className="ai-primary-btn apply-btn"
                  onClick={handleApplyDirectlyFromRefine}
                  disabled={isApplyingRefine}
                >
                  <Check size={16} />
                  <span>Use Result</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIBackgroundRemovalModal;
