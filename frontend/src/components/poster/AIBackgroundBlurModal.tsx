import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Upload,
  Sliders,
  AlertCircle,
  Check,
  RefreshCw,
  Eye,
  Layers,
  Sparkles,
} from "lucide-react";
import {
  backgroundRemovalService,
  BackgroundRemovalResult,
  ProgressStage,
} from "../../services/ai/backgroundRemovalService";

export interface AIBackgroundBlurModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyResult: (blurredFile: File) => void;
  initialFile?: File | null;
}

export const DEFAULT_BLUR_RADIUS = 12;
export const MIN_BLUR_RADIUS = 0;
export const MAX_BLUR_RADIUS = 30;

export const AIBackgroundBlurModal: React.FC<AIBackgroundBlurModalProps> = ({
  isOpen,
  onClose,
  onApplyResult,
  initialFile = null,
}) => {
  const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [progressStage, setProgressStage] = useState<ProgressStage>("init");
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Segmentation state
  const [segResult, setSegResult] = useState<BackgroundRemovalResult | null>(null);
  const [blurRadius, setBlurRadius] = useState<number>(DEFAULT_BLUR_RADIUS);
  const [blurredUrl, setBlurredUrl] = useState<string | null>(null);
  const [blurredFile, setBlurredFile] = useState<File | null>(null);
  const [isReblurring, setIsReblurring] = useState<boolean>(false);

  // Preview tab
  const [previewTab, setPreviewTab] = useState<"compare" | "result" | "original">("compare");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeSegResultRef = useRef<BackgroundRemovalResult | null>(null);
  const activeBlurredUrlRef = useRef<string | null>(null);
  const loadedImagesRef = useRef<{
    orig: HTMLImageElement;
    cutout: HTMLImageElement;
    infilled?: CanvasImageSource;
  } | null>(null);

  useEffect(() => {
    activeSegResultRef.current = segResult;
  }, [segResult]);

  useEffect(() => {
    activeBlurredUrlRef.current = blurredUrl;
  }, [blurredUrl]);

  // Clean up all allocated object URLs
  const cleanupAllUrls = useCallback(() => {
    if (activeBlurredUrlRef.current) {
      backgroundRemovalService.revokeUrls(activeBlurredUrlRef.current);
      activeBlurredUrlRef.current = null;
    }
    if (activeSegResultRef.current) {
      backgroundRemovalService.revokeUrls(
        activeSegResultRef.current.transparentUrl,
        activeSegResultRef.current.originalUrl
      );
      activeSegResultRef.current = null;
    }
    loadedImagesRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    cleanupAllUrls();
    setStatus("idle");
    setSegResult(null);
    setBlurredUrl(null);
    setBlurredFile(null);
    setErrorMessage(null);
    setBlurRadius(DEFAULT_BLUR_RADIUS);
    onClose();
  }, [cleanupAllUrls, onClose]);

  // Re-renders blur composite without running inference again
  const renderBlurComposite = useCallback(
    async (radius: number, seg: BackgroundRemovalResult) => {
      try {
        setIsReblurring(true);
        let images = loadedImagesRef.current;
        if (!images) {
          const [orig, cutout] = await Promise.all([
            backgroundRemovalService.loadImageElement(seg.originalUrl),
            backgroundRemovalService.loadImageElement(seg.transparentUrl),
          ]);
          // Pre-compute infilled background plate once to eliminate white shirt / hair color halos
          let infilled: CanvasImageSource | undefined;
          try {
            infilled = backgroundRemovalService.prepareInfilledBackground(
              orig,
              cutout,
              seg.width,
              seg.height
            );
          } catch (e) {
            console.warn("[AIBackgroundBlurModal] Could not prepare infilled background:", e);
          }
          images = { orig, cutout, infilled };
          loadedImagesRef.current = images;
        }

        const baseName = seg.transparentFile.name.replace(/-nobg\.png$/, "");
        const composite = await backgroundRemovalService.createBlurredComposite(
          images.orig,
          images.cutout,
          seg.width,
          seg.height,
          radius,
          `${baseName}-blurred.png`,
          images.infilled
        );

        // Revoke previous blurred URL to prevent memory leaks
        if (activeBlurredUrlRef.current) {
          backgroundRemovalService.revokeUrls(activeBlurredUrlRef.current);
        }

        setBlurredUrl(composite.blurredUrl);
        setBlurredFile(composite.blurredFile);
      } catch (err: any) {
        console.error("[AIBackgroundBlurModal] Error applying blur composite:", err);
      } finally {
        setIsReblurring(false);
      }
    },
    []
  );

  const processFile = useCallback(
    async (file: File) => {
      setStatus("processing");
      setErrorMessage(null);
      setProgressStage("init");
      setProgressPercent(10);

      cleanupAllUrls();
      setSegResult(null);
      setBlurredUrl(null);
      setBlurredFile(null);

      try {
        // Run AI foreground segmentation once
        const res = await backgroundRemovalService.removeBackground(file, {
          onProgress: (stage, percent) => {
            setProgressStage(stage);
            setProgressPercent(percent);
          },
        });

        setSegResult(res);
        setProgressStage("compositing");
        setProgressPercent(95);

        // Render initial blurred composite with default radius
        await renderBlurComposite(DEFAULT_BLUR_RADIUS, res);

        setProgressStage("complete");
        setProgressPercent(100);
        setStatus("success");
      } catch (err: any) {
        setStatus("error");
        setErrorMessage(
          err?.message ||
            "Failed to segment foreground and blur background. Please check the image and try again."
        );
      }
    },
    [cleanupAllUrls, renderBlurComposite]
  );

  // Auto-process initialFile when modal opens
  useEffect(() => {
    if (isOpen && initialFile) {
      processFile(initialFile);
    } else if (isOpen && !initialFile && status === "idle") {
      setSegResult(null);
      setBlurredUrl(null);
      setBlurredFile(null);
    }
  }, [isOpen, initialFile, processFile]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanupAllUrls();
    };
  }, [cleanupAllUrls]);

  // Handle slider changes reactively
  const handleSliderChange = (newRadius: number) => {
    setBlurRadius(newRadius);
    if (segResult) {
      renderBlurComposite(newRadius, segResult);
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
    if (!blurredFile) return;
    onApplyResult(blurredFile);
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
        return "Rendering smooth background blur with sharp foreground...";
      case "complete":
        return "Background blur complete!";
      default:
        return "Processing image...";
    }
  };

  return (
    <div
      className="ai-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-blur-modal-title"
    >
      <div className="ai-modal-container">
        {/* Header */}
        <div className="ai-modal-header">
          <div className="ai-modal-title-group">
            <div
              className="ai-modal-badge"
              style={{
                borderColor: "rgba(99, 102, 241, 0.35)",
                background: "rgba(99, 102, 241, 0.12)",
                color: "#a5b4fc",
              }}
            >
              <Sliders size={16} />
              <span>AI Bokeh Studio</span>
            </div>
            <h3 id="ai-blur-modal-title">AI Product Background Blur</h3>
            <p className="ai-modal-subtitle">
              Keep your product or model razor-sharp while blurring the background for a premium portrait depth-of-field effect.
            </p>
          </div>

          <button
            type="button"
            className="ai-modal-close-btn"
            onClick={handleClose}
            aria-label="Close modal"
            disabled={status === "processing"}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="ai-modal-body">
          {/* 1. IDLE STATE: Upload Dropzone */}
          {status === "idle" && (
            <div
              className="ai-upload-dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) processFile(file);
              }}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
              />
              <div className="ai-dropzone-content">
                <div
                  className="ai-dropzone-icon"
                  style={{
                    background: "rgba(99, 102, 241, 0.15)",
                    color: "#a5b4fc",
                  }}
                >
                  <Upload size={28} />
                </div>
                <h4>Select a Product or Model Photo</h4>
                <p>Drag and drop, or click to browse files from your device</p>
                <div className="ai-badge-group">
                  <span className="ai-fmt-badge">JPEG</span>
                  <span className="ai-fmt-badge">PNG</span>
                  <span className="ai-fmt-badge">WebP</span>
                  <span className="ai-fmt-badge">Max 10 MB</span>
                </div>
              </div>
            </div>
          )}

          {/* 2. PROCESSING STATE */}
          {status === "processing" && (
            <div className="ai-processing-state">
              <div className="ai-spinner-wrap">
                <div
                  className="ai-spinner"
                  style={{
                    borderTopColor: "#6366f1",
                    borderColor: "rgba(99, 102, 241, 0.15)",
                  }}
                />
                <Sliders size={22} className="ai-spinner-icon" style={{ color: "#a5b4fc" }} />
              </div>
              <h4>Analyzing Image Depth & Segmentation</h4>
              <p className="ai-stage-text" style={{ color: "#a5b4fc" }}>
                {getStageLabel()}
              </p>

              <div className="ai-progress-track">
                <div
                  className="ai-progress-bar"
                  style={{
                    width: `${progressPercent}%`,
                    background: "linear-gradient(90deg, #6366f1, #a855f7)",
                  }}
                />
              </div>
              <span className="ai-progress-num">{progressPercent}%</span>

              <p className="ai-processing-note">
                U²-Netp ONNX is computing the subject boundary off the main thread in a Web Worker.
              </p>
            </div>
          )}

          {/* 3. ERROR STATE */}
          {status === "error" && (
            <div className="ai-error-state">
              <AlertCircle size={36} className="ai-error-icon" />
              <h4>Background Blur Failed</h4>
              <p className="ai-error-message">{errorMessage}</p>

              <div className="ai-error-actions">
                <button
                  type="button"
                  className="ai-secondary-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <RefreshCw size={14} />
                  <span>Try Another Photo</span>
                </button>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
              />
            </div>
          )}

          {/* 4. SUCCESS & PREVIEW STAGE */}
          {status === "success" && segResult && blurredUrl && (
            <div className="ai-success-state">
              {/* Blur Control Bar with Slider and Presets */}
              <div className="ai-blur-controls-panel">
                <div className="ai-blur-header-row">
                  <div className="ai-blur-label-group">
                    <Sliders size={16} className="text-indigo" />
                    <strong>Blur Strength:</strong>
                    <span className="ai-blur-value-pill">{blurRadius}px</span>
                  </div>

                  <div className="ai-blur-presets-group">
                    <button
                      type="button"
                      className={`ai-blur-preset-btn ${blurRadius === 5 ? "active" : ""}`}
                      onClick={() => handleSliderChange(5)}
                    >
                      Subtle (5px)
                    </button>
                    <button
                      type="button"
                      className={`ai-blur-preset-btn ${blurRadius === 12 ? "active" : ""}`}
                      onClick={() => handleSliderChange(12)}
                    >
                      Medium (12px)
                    </button>
                    <button
                      type="button"
                      className={`ai-blur-preset-btn ${blurRadius === 24 ? "active" : ""}`}
                      onClick={() => handleSliderChange(24)}
                    >
                      Deep (24px)
                    </button>
                  </div>
                </div>

                <div className="ai-blur-slider-track-wrap">
                  <input
                    type="range"
                    min={MIN_BLUR_RADIUS}
                    max={MAX_BLUR_RADIUS}
                    step={1}
                    value={blurRadius}
                    onChange={(e) => handleSliderChange(Number(e.target.value))}
                    className="ai-blur-slider"
                    aria-label="Background Blur Strength"
                    disabled={isReblurring}
                  />
                  <div className="ai-blur-slider-ticks">
                    <span>0px (Sharp)</span>
                    <span>12px (Natural Bokeh)</span>
                    <span>30px (Strong)</span>
                  </div>
                </div>
              </div>

              {/* View Switcher Tabs */}
              <div className="ai-preview-tabs">
                <button
                  type="button"
                  className={`ai-tab-btn ${previewTab === "compare" ? "active" : ""}`}
                  onClick={() => setPreviewTab("compare")}
                >
                  <Eye size={14} />
                  <span>Compare (Before / After)</span>
                </button>
                <button
                  type="button"
                  className={`ai-tab-btn ${previewTab === "result" ? "active" : ""}`}
                  onClick={() => setPreviewTab("result")}
                >
                  <Check size={14} />
                  <span>Blurred Result</span>
                </button>
                <button
                  type="button"
                  className={`ai-tab-btn ${previewTab === "original" ? "active" : ""}`}
                  onClick={() => setPreviewTab("original")}
                >
                  <Layers size={14} />
                  <span>Original</span>
                </button>
              </div>

              {/* Preview Frames */}
              <div className="ai-preview-workspace">
                {previewTab === "compare" && (
                  <div className="ai-compare-split">
                    <div className="ai-preview-card">
                      <div className="ai-card-tag">Original Photo</div>
                      <div className="ai-img-frame plain-frame">
                        <img
                          src={segResult.originalUrl}
                          alt="Original"
                          className="ai-preview-img"
                        />
                      </div>
                    </div>

                    <div className="ai-preview-card">
                      <div className="ai-card-tag accent-tag">Blurred Background ({blurRadius}px)</div>
                      <div className="ai-img-frame plain-frame">
                        <img
                          src={blurredUrl}
                          alt="Blurred Background Result"
                          className="ai-preview-img"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {previewTab === "result" && (
                  <div className="ai-single-preview">
                    <div className="ai-img-frame plain-frame expanded-frame">
                      <img
                        src={blurredUrl}
                        alt="Blurred Background Result"
                        className="ai-preview-img"
                      />
                    </div>
                  </div>
                )}

                {previewTab === "original" && (
                  <div className="ai-single-preview">
                    <div className="ai-img-frame plain-frame expanded-frame">
                      <img
                        src={segResult.originalUrl}
                        alt="Original Product Photo"
                        className="ai-preview-img"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Informational Notice */}
              <div className="ai-quality-notice">
                <Sparkles size={14} style={{ color: "#a5b4fc" }} />
                <span>
                  The foreground product is preserved at 100% original sharpness with smooth anti-aliased edge blending.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="ai-modal-footer">
          <button
            type="button"
            className="ai-secondary-btn"
            onClick={handleClose}
            disabled={status === "processing"}
          >
            Cancel
          </button>

          {status === "success" && (
            <button
              type="button"
              className="ai-primary-btn apply-btn"
              onClick={handleApply}
              style={{
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              }}
            >
              <Check size={16} />
              <span>Use Result</span>
            </button>
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
        </div>
      </div>
    </div>
  );
};

export default AIBackgroundBlurModal;
