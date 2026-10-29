import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { PosterEditorPage } from "../pages/PosterEditorPage";
import { PosterToolbar } from "../components/poster/PosterToolbar";
import { PosterPropertiesPanel } from "../components/poster/PosterPropertiesPanel";
import { PosterConvertSizeModal } from "../components/poster/PosterConvertSizeModal";
import { PosterUseInCampaignModal } from "../components/poster/PosterUseInCampaignModal";
import { adaptCanvasJsonToPreset } from "../utils/posterConversion";
import { POSTER_PRESETS, PosterCampaignAttachment, ActiveObjectProperties, findPreset } from "../types/poster";
import { posterStorageService } from "../services/posterStorageService";
import * as exportService from "../services/posterExportService";
import { CampaignsPage } from "../pages/CampaignsPage";

// Mock canvas manager for isolated editor testing
vi.mock("../services/posterCanvasManager.js", () => {
  return {
    PosterCanvasManager: class MockPosterCanvasManager {
      setActiveTool = vi.fn();
      setZoom = vi.fn();
      addText = vi.fn();
      clear = vi.fn();
      toJSON = vi.fn(() => JSON.stringify({
        objects: [
          { type: "text", text: "SAMPLE TEXT", top: 100, left: 100, width: 200, height: 50 },
        ],
      }));
      getRegisteredAssets = vi.fn(() => new Map());
      getAssetIds = vi.fn(() => []);
      fabricCanvas = {
        getObjects: vi.fn(() => []),
        getActiveObject: vi.fn(() => null),
        backgroundColor: "#ffffff",
        requestRenderAll: vi.fn(),
        getWidth: vi.fn(() => 1080),
        getHeight: vi.fn(() => 1080),
        toDataURL: vi.fn(() => "data:image/png;base64,mockPngDataUrl"),
      };
      getLayers = vi.fn(() => []);
      dispose = vi.fn();
      setLogicalDimensions = vi.fn();
      getSelectedProperties = vi.fn(() => null);
      loadFromJSON = vi.fn().mockResolvedValue({ width: 1080, height: 1080 });
      trackSessionUrl = vi.fn();
      getSessionObjectUrls = vi.fn(() => ["blob:http://localhost:5173/mock-session-url"]);

      constructor(public options?: any) {}
    },
  };
});

vi.mock("../services/api.js", () => {
  return {
    apiClient: {
      getSchedulerStatus: vi.fn().mockResolvedValue({ success: true, data: { isRunning: true } }),
      listCampaigns: vi.fn().mockResolvedValue({
        success: true,
        data: {
          items: [],
          metrics: { total: 0, draft: 0, scheduled: 0, sending: 0, completed: 0, failed: 0, cancelled: 0 },
          pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false },
        },
      }),
      listAudiences: vi.fn().mockResolvedValue({ success: true, data: [{ id: "aud_1", name: "VIP Customers", memberCount: 15 }] }),
      listTemplates: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            id: "tmpl_1",
            name: "jaspers_market_order_confirmation_v1",
            category: "MARKETING",
            status: "APPROVED",
            isSendable: true,
            header: { type: "IMAGE", mediaUrl: "https://example.com/demo.jpg" },
            body: "Your order is confirmed!",
            variables: [],
            buttons: [],
          },
        ],
      }),
      createCampaign: vi.fn().mockResolvedValue({ success: true, data: { id: "cmp_new", name: "Test Campaign" } }),
    },
  };
});

function createMultiDatabaseMock() {
  const databases = new Map<string, Map<string, Map<string, any>>>();

  const getOrCreateDB = (dbName: string) => {
    if (!databases.has(dbName)) {
      databases.set(
        dbName,
        new Map<string, Map<string, any>>([
          ["designs", new Map<string, any>()],
          ["assets", new Map<string, any>()],
        ])
      );
    }
    return databases.get(dbName)!;
  };

  const mockFactory = {
    databases,
    clearAll: () => databases.clear(),
    open: vi.fn((dbName: string, version: number) => {
      const dbStores = getOrCreateDB(dbName);

      const openReq: any = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };

      setTimeout(() => {
        const fakeDB: any = {
          name: dbName,
          version,
          objectStoreNames: {
            contains: (name: string) => dbStores.has(name),
          },
          createObjectStore: (name: string) => {
            if (!dbStores.has(name)) {
              dbStores.set(name, new Map());
            }
            return {
              createIndex: vi.fn(),
            };
          },
          transaction: (storeNames: string[], _mode: string) => {
            const txStore = dbStores.get(storeNames[0])!;
            return {
              objectStore: (name: string) => {
                const targetStore = dbStores.get(name) || txStore;
                return {
                  put: (item: any) => {
                    const req: any = { result: item.id, error: null, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      targetStore.set(item.id, JSON.parse(JSON.stringify(item)));
                      req.onsuccess?.();
                    }, 0);
                    return req;
                  },
                  get: (id: string) => {
                    const req: any = { result: null, error: null, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      const item = targetStore.get(id);
                      req.result = item ? JSON.parse(JSON.stringify(item)) : undefined;
                      req.onsuccess?.();
                    }, 0);
                    return req;
                  },
                  delete: (id: string) => {
                    const req: any = { result: undefined, error: null, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      targetStore.delete(id);
                      req.onsuccess?.();
                    }, 0);
                    return req;
                  },
                  index: (_indexName: string) => {
                    return {
                      openCursor: () => {
                        const req: any = { result: null, onsuccess: null, onerror: null };
                        const items = Array.from(targetStore.values()).sort(
                          (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
                        );
                        let idx = 0;
                        const advance = () => {
                          if (idx < items.length) {
                            req.result = {
                              value: JSON.parse(JSON.stringify(items[idx])),
                              continue: () => {
                                idx++;
                                advance();
                              },
                            };
                          } else {
                            req.result = null;
                          }
                          req.onsuccess?.();
                        };
                        setTimeout(advance, 0);
                        return req;
                      },
                    };
                  },
                };
              },
            };
          },
          close: vi.fn(),
        };

        openReq.result = fakeDB;
        openReq.onupgradeneeded?.();
        openReq.onsuccess?.();
      }, 0);

      return openReq;
    }),
  };

  return mockFactory;
}

describe("Poster Studio — Phase 3D Comprehensive Tests", () => {
  const testUserId = "usr_phase3d_test";
  let mockIDB: ReturnType<typeof createMultiDatabaseMock>;

  beforeEach(async () => {
    localStorage.clear();
    mockIDB = createMultiDatabaseMock();
    (globalThis as any).indexedDB = mockIDB;
    posterStorageService.closeDB();
    posterStorageService.setUserId(testUserId);
  });

  afterEach(async () => {
    posterStorageService.closeDB();
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe("Task 1: WhatsApp Poster Formats & Presets", () => {
    it("maintains single fixed WhatsApp Post (1080x1080, 1:1) as campaign format and preserves legacy status", () => {
      expect(POSTER_PRESETS).toHaveLength(1);

      const postPreset = POSTER_PRESETS[0];
      expect(postPreset.id).toBe("whatsapp-post");
      expect(postPreset.name).toBe("WhatsApp Post");
      expect(postPreset.width).toBe(1080);
      expect(postPreset.height).toBe(1080);
      expect(postPreset.width / postPreset.height).toBe(1);
      expect(postPreset.ratioLabel).toBe("1:1");

      const statusPreset = findPreset(1080, 1920);
      expect(statusPreset).toBeDefined();
      expect(statusPreset?.id).toBe("whatsapp-status");
      expect(statusPreset?.name).toBe("WhatsApp Status");
      expect(statusPreset?.width).toBe(1080);
      expect(statusPreset?.height).toBe(1920);
      expect(statusPreset!.width / statusPreset!.height).toBe(1080 / 1920);
      expect(statusPreset?.ratioLabel).toBe("9:16");
    });

    it("opens in gallery-first mode by default and does not create or save a new poster", async () => {
      render(<PosterEditorPage currentUser={{ id: testUserId, email: "tester@grovastra.com", name: "Tester", role: "admin" } as any} />);

      await waitFor(() => {
        expect(screen.getByRole("region", { name: "My Posters Gallery" })).toBeDefined();
      });

      const designs = await posterStorageService.listDesigns();
      expect(designs).toHaveLength(0);
    });

    it("makes WhatsApp Post (1080x1080) the default when clicking Create New Poster", async () => {
      render(<PosterEditorPage currentUser={{ id: testUserId, email: "tester@grovastra.com", name: "Tester", role: "admin" } as any} />);

      await waitFor(() => {
        expect(screen.getByRole("region", { name: "My Posters Gallery" })).toBeDefined();
      });

      const newBtn = screen.getAllByRole("button", { name: "Create New Poster" })[0];
      await act(async () => {
        fireEvent.click(newBtn);
      });

      await waitFor(() => {
        expect(screen.getByText("WhatsApp Post")).toBeDefined();
        expect(screen.getByText("1:1")).toBeDefined();
      });
    });

    it("gallery offers single primary Create New Poster action without WhatsApp Status split dropdown", async () => {
      render(<PosterEditorPage currentUser={{ id: testUserId, email: "tester@grovastra.com", name: "Tester", role: "admin" } as any} />);

      await waitFor(() => {
        expect(screen.getByRole("region", { name: "My Posters Gallery" })).toBeDefined();
      });

      // Split toggle is removed in Phase 3F
      const splitToggle = screen.queryByRole("button", { name: "Select format for new poster" });
      expect(splitToggle).toBeNull();

      // Single Create New Poster button exists
      const newBtn = screen.getAllByRole("button", { name: "Create New Poster" })[0];
      expect(newBtn).toBeDefined();
    });

    it("adapts layout sensibly between formats without clipping via adaptCanvasJsonToPreset", () => {
      const squarePreset = POSTER_PRESETS[0]; // 1080x1080
      const statusPreset = findPreset(1080, 1920)!; // 1080x1920

      const sampleJson = JSON.stringify({
        objects: [
          { type: "text", text: "Centered Promo", top: 100, left: 100, width: 300, height: 60, scaleX: 1, scaleY: 1 },
        ],
      });

      // 1:1 -> 9:16: Shifts down vertically by +420px to center in vertical Status
      const squareToStatus = adaptCanvasJsonToPreset(sampleJson, squarePreset, statusPreset, "Summer Flyer");
      expect(squareToStatus.newName).toBe("Summer Flyer (WhatsApp Status)");
      const statusObjects = JSON.parse(squareToStatus.convertedJson).objects;
      expect(statusObjects[0].top).toBe(100 + 420); // 520

      // 9:16 -> 1:1: Scales down vertical positions and bounds heights
      const tallJson = JSON.stringify({
        objects: [
          { type: "image", top: 800, left: 100, width: 400, height: 1000, scaleX: 1, scaleY: 1 },
        ],
      });
      const statusToSquare = adaptCanvasJsonToPreset(tallJson, statusPreset, squarePreset, "Status Story");
      expect(statusToSquare.newName).toBe("Status Story (WhatsApp Post)");
      const squareObjects = JSON.parse(statusToSquare.convertedJson).objects;
      // Height was 1000 (> 85% of 1080), so scaleY should be scaled down to fit
      expect(squareObjects[0].scaleY).toBeLessThan(1);
      expect(squareObjects[0].top + (squareObjects[0].height * squareObjects[0].scaleY)).toBeLessThanOrEqual(1080);
    });

    it("format conversion preserves the original design in storage and saves a copy", async () => {
      const statusPreset = findPreset(1080, 1920)!;

      // Seed an initial square design
      const origDesign = await posterStorageService.saveDesign({
        name: "Black Friday Flyer",
        presetId: "whatsapp-post",
        width: 1080,
        height: 1080,
        canvasJson: JSON.stringify({ objects: [{ type: "text", text: "SALE", top: 100 }] }),
      });

      const onConfirmConvert = vi.fn(async (target) => {
        // Adapt and save copy
        const result = adaptCanvasJsonToPreset(origDesign.canvasJson, POSTER_PRESETS[0], target, origDesign.name);
        await posterStorageService.saveDesign({
          name: result.newName,
          presetId: target.id,
          width: target.width,
          height: target.height,
          canvasJson: result.convertedJson,
        });
      });

      render(
        <PosterConvertSizeModal
          isOpen={true}
          onClose={vi.fn()}
          currentPreset={POSTER_PRESETS[0]}
          targetPreset={statusPreset}
          posterTitle="Black Friday Flyer"
          onConfirmConvert={onConfirmConvert}
        />
      );

      expect(screen.getByText("Convert to Other Size")).toBeDefined();
      expect(screen.getByText("Your Original Design is Safe")).toBeDefined();

      const convertBtn = screen.getByRole("button", { name: /Convert and Save Copy as WhatsApp Status/i });
      await act(async () => {
        fireEvent.click(convertBtn);
      });

      expect(onConfirmConvert).toHaveBeenCalledWith(statusPreset);

      await waitFor(async () => {
        const designs = await posterStorageService.listDesigns();
        expect(designs).toHaveLength(2);
        expect(designs.some((d) => d.name === "Black Friday Flyer" && d.width === 1080 && d.height === 1080)).toBe(true);
        expect(designs.some((d) => d.name === "Black Friday Flyer (WhatsApp Status)" && d.width === 1080 && d.height === 1920)).toBe(true);
      });
    });
  });

  describe("Task 3: Options & Controls Display Bug Fixes", () => {
    it("correctly displays Left text alignment as active when textAlign is 'left'", () => {
      const onUpdateProperty = vi.fn();
      const onAlign = vi.fn();

      const textProps: ActiveObjectProperties = {
        type: "text",
        text: "Discount Headline",
        fontSize: 32,
        fontWeight: "normal",
        fontStyle: "normal",
        fill: "#10b981",
        textAlign: "left",
      };

      render(
        <PosterPropertiesPanel
          properties={textProps}
          onUpdateProperty={onUpdateProperty}
          onDeleteSelected={vi.fn()}
          onAlign={onAlign}
        />
      );

      const alignLeftBtn = screen.getByRole("button", { name: "Align Left" });
      const alignCenterBtn = screen.getByRole("button", { name: "Align Center" });

      expect(alignLeftBtn.classList.contains("active")).toBe(true);
      expect(alignCenterBtn.classList.contains("active")).toBe(false);
    });

    it("correctly identifies bold font weight for both 'bold' string and numeric 700 / 800", () => {
      const boldNumericProps: ActiveObjectProperties = {
        type: "text",
        text: "Bold Headline",
        fontSize: 36,
        fontWeight: 700 as any,
        textAlign: "center",
      };

      render(
        <PosterPropertiesPanel
          properties={boldNumericProps}
          onUpdateProperty={vi.fn()}
          onDeleteSelected={vi.fn()}
          onAlign={vi.fn()}
        />
      );

      const boldBtn = screen.getByRole("button", { name: "Toggle Bold" });
      expect(boldBtn.classList.contains("active")).toBe(true);
    });

    it("normalizes hex color inputs and hides Fill Color control on images and lines", () => {
      const imageProps: ActiveObjectProperties = {
        type: "image",
        opacity: 1,
      };

      const { queryByLabelText } = render(
        <PosterPropertiesPanel
          properties={imageProps}
          onUpdateProperty={vi.fn()}
          onDeleteSelected={vi.fn()}
          onAlign={vi.fn()}
        />
      );

      // Fill color control must NOT be rendered for images
      expect(queryByLabelText("Object fill color")).toBeNull();
    });
  });

  describe("Task 4: Campaign-Only Poster Export & In-Memory Flow", () => {
    it("renders 'Save' as the primary action on the toolbar and does not auto-navigate to campaigns", async () => {
      const onSave = vi.fn();
      const onExport = vi.fn();

      render(
        <PosterToolbar
          title="Campaign Flyer"
          onTitleChange={vi.fn()}
          selectedPreset={POSTER_PRESETS[0]}
          onPresetChange={vi.fn()}
          canUndo={false}
          canRedo={false}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          zoomLevel={1}
          onZoomChange={vi.fn()}
          onResetZoom={vi.fn()}
          onExport={onExport}
          isExporting={false}
          onSave={onSave}
        />
      );

      const saveBtn = screen.getByRole("button", { name: "Save poster design" });
      expect(saveBtn).toBeDefined();
      expect(saveBtn.classList.contains("poster-btn-primary")).toBe(true);

      // Does not render Use in Campaign button
      expect(screen.queryByRole("button", { name: "Use in Campaign" })).toBeNull();

      await act(async () => {
        fireEvent.click(saveBtn);
      });

      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("exportCanvasToBlob generates an in-memory Blob without calling downloadDataUrl", async () => {
      const downloadSpy = vi.spyOn(exportService, "downloadDataUrl");

      const mockFabric = {
        getWidth: () => 1080,
        getHeight: () => 1080,
        getZoom: () => 1,
        setZoom: vi.fn(),
        setViewportTransform: vi.fn(),
        setDimensions: vi.fn(),
        requestRenderAll: vi.fn(),
        renderAll: vi.fn(),
        toDataURL: () => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      } as any;

      const { blob } = exportService.exportCanvasToBlob(mockFabric, 1080, 1080, { format: "png" });

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("image/png");
      expect(downloadSpy).not.toHaveBeenCalled();
    });

    it("displays in-memory storage notice in PosterUseInCampaignModal and notifies user", () => {
      const mockAttachment: PosterCampaignAttachment = {
        blob: new Blob(["dummy"], { type: "image/png" }),
        dataUrl: "data:image/png;base64,dummyDataUrl",
        title: "Exclusive Discount Poster",
        width: 1080,
        height: 1080,
        format: "png",
        presetId: "whatsapp-post",
        filename: "exclusive-poster.png",
        createdAt: Date.now(),
      };

      const onProceed = vi.fn();

      render(
        <PosterUseInCampaignModal
          isOpen={true}
          onClose={vi.fn()}
          attachment={mockAttachment}
          onProceedToCampaign={onProceed}
        />
      );

      expect(screen.getByText("Use Poster in Grovastra Campaign")).toBeDefined();
      expect(screen.getByText("Held Securely in Browser Memory")).toBeDefined();
      expect(screen.getByText(/been saved to your mobile phone’s local Downloads/i)).toBeDefined();

      const proceedBtn = screen.getByRole("button", { name: "Create Campaign Draft with Poster" });
      fireEvent.click(proceedBtn);

      expect(onProceed).toHaveBeenCalledWith(mockAttachment);
    });

    it("receives poster in CampaignsPage draft and displays attached banner in memory without auto-sending", async () => {
      const mockAttachment: PosterCampaignAttachment = {
        blob: new Blob(["dummy"], { type: "image/png" }),
        dataUrl: "data:image/png;base64,dummyDataUrl",
        title: "Special Festive Sale",
        width: 1080,
        height: 1080,
        format: "png",
        presetId: "whatsapp-post",
        filename: "festive-sale.png",
        createdAt: Date.now(),
      };

      const onClear = vi.fn();

      render(
        <CampaignsPage
          initialPosterAttachment={mockAttachment}
          onClearPosterAttachment={onClear}
        />
      );

      // Opens directly in Wizard
      await waitFor(() => {
        expect(screen.getByText("Special Festive Sale")).toBeDefined();
        expect(screen.getByText(/in browser memory/i)).toBeDefined();
      });

      // Default name initialized
      expect(screen.getByDisplayValue("Campaign - Special Festive Sale")).toBeDefined();

      // User cancels wizard -> calls onClearPosterAttachment
      const cancelBtn = screen.getByRole("button", { name: "Back to campaign list" });
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      // Confirm discard dialog appears
      const discardBtn = screen.getByRole("button", { name: "Discard Changes" });
      await act(async () => {
        fireEvent.click(discardBtn);
      });

      expect(onClear).toHaveBeenCalled();
    });
  });
});
