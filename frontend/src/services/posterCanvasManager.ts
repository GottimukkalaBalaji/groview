import {
  Canvas,
  FabricImage,
  IText,
  Rect,
  Circle,
  Line,
  FabricObject,
} from "fabric";
import {
  ActiveObjectProperties,
  PosterLayerItem,
  AlignmentType,
  StickerType,
  validatePosterImage,
} from "../types/poster.js";

export interface CanvasManagerOptions {
  canvasElement: HTMLCanvasElement;
  width: number;
  height: number;
  backgroundColor?: string;
  onStateChange?: () => void;
  onSelectionChange?: (props: ActiveObjectProperties | null) => void;
  onLayersChange?: (layers: PosterLayerItem[]) => void;
  onZoomChange?: (zoom: number) => void;
}

export class PosterCanvasManager {
  private canvas: Canvas;
  private logicalWidth: number;
  private logicalHeight: number;
  private onStateChange?: () => void;
  private onSelectionChange?: (props: ActiveObjectProperties | null) => void;
  private onLayersChange?: (layers: PosterLayerItem[]) => void;
  private onZoomChange?: (zoom: number) => void;
  private activeTool: string = "elements";
  private isDisposed: boolean = false;
  private registeredAssets: Map<string, Blob> = new Map();
  private sessionObjectUrls: Set<string> = new Set();

  constructor(options: CanvasManagerOptions) {
    this.logicalWidth = options.width;
    this.logicalHeight = options.height;
    this.onStateChange = options.onStateChange;
    this.onSelectionChange = options.onSelectionChange;
    this.onLayersChange = options.onLayersChange;
    this.onZoomChange = options.onZoomChange;

    this.canvas = new Canvas(options.canvasElement, {
      width: options.width,
      height: options.height,
      backgroundColor: options.backgroundColor || "#ffffff",
      preserveObjectStacking: true,
      selection: true,
    });

    this.setupEventListeners();
  }

  public get fabricCanvas(): Canvas {
    return this.canvas;
  }

  public get width(): number {
    return this.logicalWidth;
  }

  public get height(): number {
    return this.logicalHeight;
  }

  public setActiveTool(tool: string): void {
    this.activeTool = tool;
    if (this.canvas) {
      this.canvas.defaultCursor = tool === "text" ? "text" : "default";
      this.canvas.hoverCursor = tool === "text" ? "text" : "move";
    }
  }

  public getActiveTool(): string {
    return this.activeTool;
  }

  /**
   * Translates pointer event to logical poster coordinates accounting for zoom and element bounds.
   */
  public getScenePointFromEvent(e: MouseEvent | TouchEvent): { x: number; y: number } | null {
    const el = this.canvas.upperCanvasEl || this.canvas.lowerCanvasEl;
    if (!el) return null;

    const rect = el.getBoundingClientRect();
    const clientX =
      "touches" in e && e.touches.length > 0
        ? e.touches[0].clientX
        : (e as MouseEvent).clientX;
    const clientY =
      "touches" in e && e.touches.length > 0
        ? e.touches[0].clientY
        : (e as MouseEvent).clientY;

    if (clientX === undefined || clientY === undefined) return null;

    let cssX: number;
    let cssY: number;
    if (rect.width > 0 && rect.height > 0) {
      cssX = clientX - rect.left;
      cssY = clientY - rect.top;
    } else {
      cssX = clientX;
      cssY = clientY;
    }

    const zoom = this.canvas.getZoom() || 1;
    const x = cssX / zoom;
    const y = cssY / zoom;

    // Check bounds against logical poster boundaries
    if (x < 0 || x > this.logicalWidth || y < 0 || y > this.logicalHeight) {
      return null;
    }

    return { x, y };
  }

  private assignLayerMetadata(obj: any, defaultName: string): void {
    if (!obj.get("id")) {
      obj.set("id", `layer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    }
    if (!obj.get("name")) {
      obj.set("name", defaultName);
    }
    if (obj.get("isLocked") === undefined) {
      obj.set("isLocked", false);
    }
  }

  private setupEventListeners(): void {
    const notifyState = () => {
      if (!this.isDisposed) {
        if (this.onLayersChange) {
          this.onLayersChange(this.getLayers());
        }
        if (this.onStateChange) {
          this.onStateChange();
        }
      }
    };

    const notifySelection = () => {
      if (!this.isDisposed) {
        if (this.onSelectionChange) {
          this.onSelectionChange(this.getSelectedProperties());
        }
        if (this.onLayersChange) {
          this.onLayersChange(this.getLayers());
        }
      }
    };

    this.canvas.on("object:modified", notifyState);
    this.canvas.on("object:added", (e) => {
      if (e.target && !e.target.get("id")) {
        const type = e.target.type || "Element";
        this.assignLayerMetadata(e.target, `${type.charAt(0).toUpperCase() + type.slice(1)}`);
      }
      notifyState();
    });
    this.canvas.on("object:removed", notifyState);

    this.canvas.on("selection:created", notifySelection);
    this.canvas.on("selection:updated", notifySelection);
    this.canvas.on("selection:cleared", () => {
      if (!this.isDisposed) {
        if (this.onSelectionChange) {
          this.onSelectionChange(null);
        }
        if (this.onLayersChange) {
          this.onLayersChange(this.getLayers());
        }
      }
    });

    // Desktop text placement on canvas click when Text tool is active
    this.canvas.on("mouse:down", (opt) => {
      if (this.isDisposed) return;

      if (this.activeTool !== "text") return;

      // If user clicked on an existing object, allow selection/interaction
      if (opt.target) return;

      // Clicked on empty canvas background
      const point = this.getScenePointFromEvent(opt.e);
      if (!point) return;

      // Insert new text at exact clicked position
      const newText = this.addText("Heading Text", {
        left: Math.round(point.x),
        top: Math.round(point.y),
        fontSize: 44,
        fontWeight: "bold",
        fill: "#111827",
      });

      this.canvas.setActiveObject(newText);
      newText.enterEditing();
      newText.selectAll();
      this.canvas.requestRenderAll();
    });

    // Smooth Ctrl+Wheel / Meta+Wheel zooming
    this.canvas.on("mouse:wheel", (opt) => {
      const e = opt.e as WheelEvent;
      if (!e) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY;
        let zoom = this.canvas.getZoom();
        zoom = delta > 0 ? zoom - 0.05 : zoom + 0.05;
        const bounded = Math.max(0.2, Math.min(Number(zoom.toFixed(2)), 3.0));
        this.setZoom(bounded);
        if (this.onZoomChange) {
          this.onZoomChange(bounded);
        }
      }
    });
  }

  /**
   * Set canvas logical dimensions and update canvas element.
   */
  public setLogicalDimensions(width: number, height: number): void {
    this.logicalWidth = width;
    this.logicalHeight = height;
    const zoom = this.canvas.getZoom() || 1;
    this.canvas.setDimensions({
      width: width * zoom,
      height: height * zoom,
    });
    this.canvas.calcOffset();
    this.canvas.requestRenderAll();
  }

  /**
   * Update zoom and viewport scale without changing logical export coordinates.
   */
  public setZoom(zoomFactor: number): void {
    const boundedZoom = Math.max(0.2, Math.min(zoomFactor, 3.0));
    this.canvas.setZoom(boundedZoom);
    this.canvas.setDimensions({
      width: this.logicalWidth * boundedZoom,
      height: this.logicalHeight * boundedZoom,
    });
    this.canvas.calcOffset();
    this.canvas.requestRenderAll();
  }

  /**
   * Add image from file with size/type validation.
   * Assigns a stable assetId and registers the binary blob for persistent IndexedDB storage.
   */
  public async addImageFromFile(
    file: File,
    options: { assetId?: string; name?: string } = {}
  ): Promise<FabricImage> {
    const validation = validatePosterImage(file);
    if (!validation.valid) {
      throw new Error(validation.error || "Invalid image file.");
    }

    const assetId =
      options.assetId || `ast_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.registeredAssets.set(assetId, file);

    const objectUrl = URL.createObjectURL(file);
    this.sessionObjectUrls.add(objectUrl);

    try {
      const img = await FabricImage.fromURL(objectUrl, {
        crossOrigin: "anonymous",
      });

      img.set("assetId", assetId);
      this.assignLayerMetadata(img, options.name || `Photo (${file.name.substring(0, 16)})`);

      // Fit image reasonably within canvas bounds if it's too large
      const maxDim = Math.min(this.logicalWidth, this.logicalHeight) * 0.75;
      const naturalWidth = img.width || 1;
      const naturalHeight = img.height || 1;

      if (naturalWidth > maxDim || naturalHeight > maxDim) {
        const scale = maxDim / Math.max(naturalWidth, naturalHeight);
        img.scale(scale);
      }

      this.canvas.add(img);
      const imgWidth = img.getScaledWidth() || 200;
      const imgHeight = img.getScaledHeight() || 200;
      img.set({
        left: Math.round((this.logicalWidth - imgWidth) / 2),
        top: Math.round((this.logicalHeight - imgHeight) / 2),
      });
      img.setCoords();
      this.canvas.setActiveObject(img);
      this.canvas.requestRenderAll();

      return img;
    } catch (err) {
      this.sessionObjectUrls.delete(objectUrl);
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // ignore
      }
      throw err;
    }
  }

  /**
   * Add text element (headline, subheading, body, badge).
   */
  public addText(
    text: string = "Heading Text",
    options: Partial<IText> = {}
  ): IText {
    const textObject = new IText(text, {
      left: options.left !== undefined ? options.left : Math.round(this.logicalWidth / 2 - 120),
      top: options.top !== undefined ? options.top : Math.round(this.logicalHeight / 2 - 30),
      fontSize: options.fontSize || 42,
      fontFamily: options.fontFamily || "Inter, sans-serif",
      fontWeight: options.fontWeight || "bold",
      fill: options.fill || "#111827",
      ...options,
    });

    const labelSnippet = text.length > 14 ? `${text.substring(0, 14)}...` : text;
    this.assignLayerMetadata(textObject, `Text (${labelSnippet})`);

    this.canvas.add(textObject);

    // If neither left nor top was provided, center logically on the poster canvas
    if (options.left === undefined && options.top === undefined) {
      const textWidth = textObject.width || 240;
      const textHeight = textObject.height || 60;
      textObject.set({
        left: Math.round((this.logicalWidth - textWidth) / 2),
        top: Math.round((this.logicalHeight - textHeight) / 2),
      });
      textObject.setCoords();
    }

    this.canvas.setActiveObject(textObject);
    this.canvas.requestRenderAll();

    return textObject;
  }

  /**
   * Add rectangle shape.
   */
  public addRectangle(options: Partial<Rect> = {}): Rect {
    const width = options.width || 200;
    const height = options.height || 200;
    const rect = new Rect({
      left: options.left !== undefined ? options.left : Math.round((this.logicalWidth - width) / 2),
      top: options.top !== undefined ? options.top : Math.round((this.logicalHeight - height) / 2),
      width,
      height,
      fill: options.fill || "#10b981",
      stroke: options.stroke || "#059669",
      strokeWidth: options.strokeWidth || 0,
      rx: 12,
      ry: 12,
      ...options,
    });

    this.assignLayerMetadata(rect, "Rectangle Box");

    this.canvas.add(rect);
    this.canvas.setActiveObject(rect);
    this.canvas.requestRenderAll();

    return rect;
  }

  /**
   * Add circle shape.
   */
  public addCircle(options: Partial<Circle> = {}): Circle {
    const radius = options.radius || 90;
    const circle = new Circle({
      left: options.left !== undefined ? options.left : Math.round(this.logicalWidth / 2 - radius),
      top: options.top !== undefined ? options.top : Math.round(this.logicalHeight / 2 - radius),
      radius,
      fill: options.fill || "#6366f1",
      stroke: options.stroke || "#4f46e5",
      strokeWidth: options.strokeWidth || 0,
      ...options,
    });

    this.assignLayerMetadata(circle, "Circle");

    this.canvas.add(circle);
    this.canvas.setActiveObject(circle);
    this.canvas.requestRenderAll();

    return circle;
  }

  /**
   * Add line element.
   */
  public addLine(options: Partial<Line> = {}): Line {
    const line = new Line(
      [
        Math.round(this.logicalWidth / 2 - 150),
        Math.round(this.logicalHeight / 2),
        Math.round(this.logicalWidth / 2 + 150),
        Math.round(this.logicalHeight / 2),
      ],
      {
        stroke: options.stroke || "#10b981",
        strokeWidth: options.strokeWidth || 4,
        ...options,
      }
    );

    this.assignLayerMetadata(line, "Divider Line");

    this.canvas.add(line);
    this.canvas.setActiveObject(line);
    this.canvas.requestRenderAll();

    return line;
  }

  /**
   * Add curated promotional sticker elements (Native Fabric editable elements).
   */
  public addSticker(type: StickerType): IText {
    let text = "SPECIAL OFFER";
    let fill = "#ffffff";
    let bg = "#10b981";
    let fontSize = 34;
    let name = "Sticker";

    switch (type) {
      case "sale-badge":
        text = "🔥 MEGA SALE";
        bg = "#f43f5e";
        fontSize = 36;
        name = "Sale Badge";
        break;
      case "discount-50":
        text = "⚡ FLAT 50% OFF";
        bg = "#10b981";
        fontSize = 36;
        name = "50% Off Badge";
        break;
      case "new-arrival":
        text = "✨ NEW ARRIVAL";
        bg = "#6366f1";
        fontSize = 32;
        name = "New Arrival Badge";
        break;
      case "price-bubble":
        text = "🏷️ ONLY ₹499";
        bg = "#f59e0b";
        fill = "#111827";
        fontSize = 34;
        name = "Price Tag";
        break;
      case "order-whatsapp":
        text = "💬 ORDER ON WHATSAPP";
        bg = "#25D366";
        fontSize = 30;
        name = "WhatsApp Callout";
        break;
    }

    const sticker = new IText(text, {
      fontSize,
      fontFamily: "Inter, sans-serif",
      fontWeight: "800",
      fill,
      backgroundColor: bg,
      padding: 14,
    });

    this.assignLayerMetadata(sticker, name);

    this.canvas.add(sticker);
    const stickerWidth = sticker.width || 240;
    const stickerHeight = sticker.height || 60;
    sticker.set({
      left: Math.round((this.logicalWidth - stickerWidth) / 2),
      top: Math.round((this.logicalHeight - stickerHeight) / 2),
    });
    sticker.setCoords();

    this.canvas.setActiveObject(sticker);
    this.canvas.requestRenderAll();

    return sticker;
  }

  /**
   * Align active object relative to logical canvas bounds.
   */
  public alignActiveObject(alignment: AlignmentType): void {
    const active = this.canvas.getActiveObject();
    if (!active) return;

    // Use axis-aligned bounding box to properly account for rotated objects,
    // custom originX/originY, and scaled boundaries.
    const bound = active.getBoundingRect();
    const leftOffset = active.left - bound.left;
    const topOffset = active.top - bound.top;

    switch (alignment) {
      case "centerH":
        active.set({ left: (this.logicalWidth - bound.width) / 2 + leftOffset });
        break;
      case "centerV":
        active.set({ top: (this.logicalHeight - bound.height) / 2 + topOffset });
        break;
      case "centerBoth":
        active.set({
          left: (this.logicalWidth - bound.width) / 2 + leftOffset,
          top: (this.logicalHeight - bound.height) / 2 + topOffset,
        });
        break;
      case "alignLeft":
        active.set({ left: 0 + leftOffset });
        break;
      case "alignRight":
        active.set({ left: this.logicalWidth - bound.width + leftOffset });
        break;
      case "alignTop":
        active.set({ top: 0 + topOffset });
        break;
      case "alignBottom":
        active.set({ top: this.logicalHeight - bound.height + topOffset });
        break;
    }

    active.setCoords();
    this.canvas.requestRenderAll();

    if (this.onStateChange) {
      this.onStateChange();
    }
  }

  /**
   * Returns current layer stack in reverse order (top layer first in UI list).
   */
  public getLayers(): PosterLayerItem[] {
    const objects = this.canvas.getObjects();
    const active = this.canvas.getActiveObject();

    return [...objects]
      .reverse()
      .map((obj) => {
        const id = (obj.get("id") as string) || "";
        const name = (obj.get("name") as string) || obj.type || "Layer";
        const isLocked = Boolean(obj.get("isLocked"));
        const visible = obj.visible !== false;
        const isSelected = active === obj;

        return {
          id,
          name,
          type: obj.type || "element",
          visible,
          isLocked,
          isSelected,
        };
      });
  }

  /**
   * Select an object by its unique layer ID.
   */
  public selectLayer(layerId: string): void {
    const obj = this.findObjectById(layerId);
    if (!obj) return;

    if (obj.get("isLocked") || !obj.visible) {
      // Locked or hidden objects cannot be active on canvas
      this.canvas.discardActiveObject();
      this.canvas.requestRenderAll();
      if (this.onSelectionChange) {
        this.onSelectionChange(null);
      }
      return;
    }

    this.canvas.setActiveObject(obj);
    this.canvas.requestRenderAll();
  }

  /**
   * Move layer one step forward in rendering z-stack (higher z-index).
   */
  public moveLayerUp(layerId: string): void {
    const obj = this.findObjectById(layerId);
    if (!obj) return;

    this.canvas.bringObjectForward(obj);
    this.canvas.requestRenderAll();

    if (this.onStateChange) {
      this.onStateChange();
    }
    if (this.onLayersChange) {
      this.onLayersChange(this.getLayers());
    }
  }

  /**
   * Move layer one step backward in rendering z-stack (lower z-index).
   */
  public moveLayerDown(layerId: string): void {
    const obj = this.findObjectById(layerId);
    if (!obj) return;

    this.canvas.sendObjectBackwards(obj);
    this.canvas.requestRenderAll();

    if (this.onStateChange) {
      this.onStateChange();
    }
    if (this.onLayersChange) {
      this.onLayersChange(this.getLayers());
    }
  }

  /**
   * Toggle visibility of a layer. Hidden layers are not rendered or exported.
   */
  public toggleLayerVisibility(layerId: string): void {
    const obj = this.findObjectById(layerId);
    if (!obj) return;

    const newVisibility = !obj.visible;
    obj.set("visible", newVisibility);

    if (!newVisibility && this.canvas.getActiveObject() === obj) {
      this.canvas.discardActiveObject();
    }

    this.canvas.requestRenderAll();

    if (this.onStateChange) {
      this.onStateChange();
    }
    if (this.onLayersChange) {
      this.onLayersChange(this.getLayers());
    }
  }

  /**
   * Toggle lock state of a layer. Locked objects cannot be dragged or transformed on canvas.
   */
  public toggleLayerLock(layerId: string): void {
    const obj = this.findObjectById(layerId);
    if (!obj) return;

    const currentlyLocked = Boolean(obj.get("isLocked"));
    const shouldLock = !currentlyLocked;

    obj.set({
      isLocked: shouldLock,
      selectable: !shouldLock,
      evented: !shouldLock,
      lockMovementX: shouldLock,
      lockMovementY: shouldLock,
      lockRotation: shouldLock,
      lockScalingX: shouldLock,
      lockScalingY: shouldLock,
      hasControls: !shouldLock,
    });

    if (shouldLock && this.canvas.getActiveObject() === obj) {
      this.canvas.discardActiveObject();
    }

    this.canvas.requestRenderAll();

    if (this.onStateChange) {
      this.onStateChange();
    }
    if (this.onLayersChange) {
      this.onLayersChange(this.getLayers());
    }
  }

  /**
   * Delete layer by its ID.
   */
  public deleteLayer(layerId: string): void {
    const obj = this.findObjectById(layerId);
    if (!obj) return;

    if (this.canvas.getActiveObject() === obj) {
      this.canvas.discardActiveObject();
    }
    this.canvas.remove(obj);
    this.canvas.requestRenderAll();

    if (this.onStateChange) {
      this.onStateChange();
    }
    if (this.onLayersChange) {
      this.onLayersChange(this.getLayers());
    }
  }

  private findObjectById(id: string): FabricObject | undefined {
    return this.canvas.getObjects().find((o) => (o.get("id") as string) === id);
  }

  /**
   * Delete currently active object(s).
   */
  public deleteSelected(): boolean {
    const activeObjects = this.canvas.getActiveObjects();
    if (!activeObjects || activeObjects.length === 0) return false;

    this.canvas.discardActiveObject();
    activeObjects.forEach((obj) => {
      this.canvas.remove(obj);
    });

    this.canvas.requestRenderAll();
    return true;
  }

  /**
   * Get active object properties for properties panel.
   */
  public getSelectedProperties(): ActiveObjectProperties | null {
    const active = this.canvas.getActiveObject();
    if (!active) return null;

    const props: ActiveObjectProperties = {
      type: active.type || "object",
      fill: (active.get("fill") as string) || "#000000",
      stroke: (active.get("stroke") as string) || undefined,
      strokeWidth: (active.get("strokeWidth") as number) || 0,
      opacity: (active.get("opacity") as number) ?? 1,
      isLocked: Boolean(active.get("isLocked")),
    };

    if (active.type === "i-text" || active.type === "text") {
      const textObj = active as IText;
      props.text = textObj.text || "";
      props.fontSize = textObj.fontSize;
      props.fontFamily = textObj.fontFamily;
      props.fontWeight = textObj.fontWeight;
      props.fontStyle = textObj.fontStyle;
      props.textAlign = textObj.textAlign;
    }

    return props;
  }

  /**
   * Update active object property and re-render.
   */
  public updateSelectedProperty(key: string, value: any): void {
    const active = this.canvas.getActiveObject();
    if (!active) return;

    active.set(key as any, value);
    active.setCoords();
    this.canvas.requestRenderAll();

    if (this.onStateChange) {
      this.onStateChange();
    }
    if (this.onSelectionChange) {
      this.onSelectionChange(this.getSelectedProperties());
    }
  }

  /**
   * Serialize canvas to JSON string for history/persistence, preserving custom metadata.
   */
  public toJSON(): string {
    const obj = this.canvas.toObject([
      "id",
      "name",
      "assetId",
      "isLocked",
      "selectable",
      "evented",
      "lockMovementX",
      "lockMovementY",
      "lockRotation",
      "lockScalingX",
      "lockScalingY",
      "hasControls",
    ]);
    (obj as any).logicalWidth = this.logicalWidth;
    (obj as any).logicalHeight = this.logicalHeight;
    return JSON.stringify(obj);
  }

  /**
   * Returns a copy of the in-memory registered binary assets map.
   */
  public getRegisteredAssets(): Map<string, Blob> {
    return new Map(this.registeredAssets);
  }

  /**
   * Manually registers a binary asset associated with an assetId.
   */
  public registerAsset(assetId: string, blob: Blob): void {
    this.registeredAssets.set(assetId, blob);
  }

  /**
   * Tracks an active session object URL so it can be revoked upon cleanup.
   */
  public trackSessionUrl(url: string): void {
    if (url && typeof url === "string" && url.startsWith("blob:")) {
      this.sessionObjectUrls.add(url);
    }
  }

  /**
   * Returns list of currently tracked session object URLs.
   */
  public getSessionObjectUrls(): string[] {
    return Array.from(this.sessionObjectUrls);
  }

  /**
   * Load canvas from serialized JSON string.
   * Optionally accepts an assets map to register into in-memory storage.
   */
  public async loadFromJSON(
    jsonString: string,
    assets?: Map<string, Blob> | Record<string, Blob>
  ): Promise<{ width?: number; height?: number }> {
    try {
      if (assets) {
        if (assets instanceof Map) {
          assets.forEach((blob, id) => this.registeredAssets.set(id, blob));
        } else if (typeof assets === "object") {
          Object.entries(assets).forEach(([id, blob]) => this.registeredAssets.set(id, blob));
        }
      }

      const parsed = JSON.parse(jsonString);

      // Restore logical dimensions if present and different
      if (parsed.logicalWidth && parsed.logicalHeight) {
        if (
          parsed.logicalWidth !== this.logicalWidth ||
          parsed.logicalHeight !== this.logicalHeight
        ) {
          this.setLogicalDimensions(parsed.logicalWidth, parsed.logicalHeight);
        }
      }

      // Discard active selection before reloading canvas objects
      this.canvas.discardActiveObject();

      await this.canvas.loadFromJSON(parsed);

      // Re-validate and strictly enforce layer metadata and lock constraints
      this.canvas.getObjects().forEach((obj, idx) => {
        if (!obj.get("id")) {
          this.assignLayerMetadata(obj, `Layer ${idx + 1}`);
        }
        const isLocked = Boolean(obj.get("isLocked"));
        if (isLocked) {
          obj.set({
            isLocked: true,
            selectable: false,
            evented: false,
            hasControls: false,
            lockMovementX: true,
            lockMovementY: true,
            lockRotation: true,
            lockScalingX: true,
            lockScalingY: true,
          });
        }
      });

      this.canvas.requestRenderAll();

      if (this.onSelectionChange) {
        this.onSelectionChange(null);
      }
      if (this.onLayersChange) {
        this.onLayersChange(this.getLayers());
      }

      return {
        width: parsed.logicalWidth,
        height: parsed.logicalHeight,
      };
    } catch (err) {
      console.error("Failed to load canvas from JSON:", err);
      return {};
    }
  }

  /**
   * Clear all canvas objects and release active session object URLs.
   */
  public clear(): void {
    this.sessionObjectUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    });
    this.sessionObjectUrls.clear();
    this.registeredAssets.clear();

    this.canvas.clear();
    this.canvas.backgroundColor = "#ffffff";
    this.canvas.requestRenderAll();

    if (this.onLayersChange) {
      this.onLayersChange([]);
    }
  }

  /**
   * Clean up all Fabric.js DOM wrappers, event listeners, timers, and session URLs.
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    this.sessionObjectUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    });
    this.sessionObjectUrls.clear();
    this.registeredAssets.clear();

    try {
      this.canvas.dispose();
    } catch (e) {
      console.warn("Error while disposing Fabric canvas:", e);
    }
  }
}

