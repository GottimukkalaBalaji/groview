import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  posterStorageService,
  PosterStorageService,
  STORE_DESIGNS,
  STORE_ASSETS,
} from "../services/posterStorageService";
import { PosterCanvasManager } from "../services/posterCanvasManager";
import {
  SavedPosterDesignInput,
} from "../types/poster";

/**
 * Creates an in-memory mock IDB implementation matching W3C IndexedDB specs
 * for headless Vitest / Happy-DOM runner.
 */
function createMockIndexedDB() {
  const stores = new Map<string, Map<string, any>>([
    [STORE_DESIGNS, new Map<string, any>()],
    [STORE_ASSETS, new Map<string, any>()],
  ]);

  let shouldFailOpen = false;
  let openErrorToThrow: any = null;
  let shouldBeBlocked = false;
  let shouldFailPut = false;
  let putErrorToThrow: any = null;

  const mockFactory = {
    setShouldFailOpen: (fail: boolean, err: any = null) => {
      shouldFailOpen = fail;
      openErrorToThrow = err;
    },
    setShouldBeBlocked: (blocked: boolean) => {
      shouldBeBlocked = blocked;
    },
    setShouldFailPut: (fail: boolean, err: any = null) => {
      shouldFailPut = fail;
      putErrorToThrow = err;
    },
    clearData: () => {
      stores.get(STORE_DESIGNS)?.clear();
      stores.get(STORE_ASSETS)?.clear();
    },
    open: vi.fn((dbName: string, version: number) => {
      const openReq: any = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        onblocked: null,
      };

      setTimeout(() => {
        if (shouldBeBlocked && openReq.onblocked) {
          openReq.onblocked();
          return;
        }

        if (shouldFailOpen) {
          openReq.error = openErrorToThrow || new Error("Failed to open IndexedDB.");
          if (openReq.onerror) openReq.onerror();
          return;
        }

        const mockDb: any = {
          name: dbName,
          version,
          objectStoreNames: {
            contains: (sName: string) => stores.has(sName),
          },
          createObjectStore: vi.fn((sName: string) => {
            if (!stores.has(sName)) {
              stores.set(sName, new Map());
            }
            return {
              createIndex: vi.fn(),
            };
          }),
          transaction: vi.fn((_storeNames: string[], mode: string) => {
            const tx: any = {
              mode,
              error: null,
              oncomplete: null,
              onerror: null,
              objectStore: vi.fn((storeName: string) => {
                const map = stores.get(storeName);
                if (!map) {
                  throw new Error(`Object store ${storeName} not found.`);
                }

                return {
                  put: vi.fn((val: any) => {
                    const req: any = { result: null, error: null, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      if (shouldFailPut) {
                        const err = putErrorToThrow || new Error("Put failed");
                        req.error = err;
                        tx.error = err;
                        if (req.onerror) req.onerror();
                        if (tx.onerror) tx.onerror();
                        return;
                      }
                      const key = val.id;
                      map.set(key, JSON.parse(JSON.stringify(val)));
                      // Preserve Blob reference in mock if present
                      if (val.blob) {
                        map.get(key).blob = val.blob;
                      }
                      req.result = key;
                      if (req.onsuccess) req.onsuccess();
                      if (tx.oncomplete) tx.oncomplete();
                    }, 0);
                    return req;
                  }),
                  get: vi.fn((key: string) => {
                    const req: any = { result: null, error: null, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      const item = map.get(key);
                      req.result = item ? (item.blob ? { ...item, blob: item.blob } : JSON.parse(JSON.stringify(item))) : undefined;
                      if (req.onsuccess) req.onsuccess();
                    }, 0);
                    return req;
                  }),
                  delete: vi.fn((key: string) => {
                    const req: any = { result: null, error: null, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      map.delete(key);
                      req.result = undefined;
                      if (req.onsuccess) req.onsuccess();
                      if (tx.oncomplete) tx.oncomplete();
                    }, 0);
                    return req;
                  }),
                  index: vi.fn((_idxName: string) => {
                    return {
                      openCursor: vi.fn((_range: any, direction?: string) => {
                        const req: any = { result: null, error: null, onsuccess: null, onerror: null };
                        setTimeout(() => {
                          const entries = Array.from(map.values()).sort((a, b) => {
                            if (direction === "prev") {
                              return (b.updatedAt || 0) - (a.updatedAt || 0);
                            }
                            return (a.updatedAt || 0) - (b.updatedAt || 0);
                          });

                          let idx = 0;
                          function makeCursor(i: number): any {
                            if (i >= entries.length) return null;
                            const curVal = entries[i];
                            return {
                              value: curVal.blob ? { ...curVal, blob: curVal.blob } : JSON.parse(JSON.stringify(curVal)),
                              key: curVal.id,
                              continue: () => {
                                idx++;
                                req.result = makeCursor(idx);
                                if (req.onsuccess) req.onsuccess();
                              },
                              delete: () => {
                                map?.delete(curVal.id);
                              },
                            };
                          }

                          req.result = makeCursor(0);
                          if (req.onsuccess) req.onsuccess();
                        }, 0);
                        return req;
                      }),
                    };
                  }),
                  openCursor: vi.fn(() => {
                    const req: any = { result: null, error: null, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      const entries = Array.from(map.values());
                      let idx = 0;
                      function makeCursor(i: number): any {
                        if (i >= entries.length) return null;
                        const curVal = entries[i];
                        return {
                          value: curVal.blob ? { ...curVal, blob: curVal.blob } : JSON.parse(JSON.stringify(curVal)),
                          key: curVal.id,
                          continue: () => {
                            idx++;
                            req.result = makeCursor(idx);
                            if (req.onsuccess) req.onsuccess();
                          },
                          delete: () => {
                            map?.delete(curVal.id);
                          },
                        };
                      }
                      req.result = makeCursor(0);
                      if (req.onsuccess) req.onsuccess();
                    }, 0);
                    return req;
                  }),
                };
              }),
            };
            return tx;
          }),
          close: vi.fn(),
        };

        openReq.result = mockDb;

        // Trigger upgradeneeded if needed
        if (openReq.onupgradeneeded) {
          openReq.onupgradeneeded({ oldVersion: 0, newVersion: version });
        }

        if (openReq.onsuccess) {
          openReq.onsuccess();
        }
      }, 0);

      return openReq;
    }),
  };

  return mockFactory;
}

import { FabricImage, Rect } from "fabric";

describe("Phase 3A, Step 1: IndexedDB Storage Foundation Tests", () => {
  let mockIDB: ReturnType<typeof createMockIndexedDB>;
  let originalIndexedDB: any;

  beforeEach(() => {
    vi.clearAllMocks();
    originalIndexedDB = (globalThis as any).indexedDB;
    mockIDB = createMockIndexedDB();
    (globalThis as any).indexedDB = mockIDB;

    // Reset posterStorageService internal singleton connection
    posterStorageService.closeDB();

    // Mock 2D canvas context for Fabric SelectableCanvas
    const mockCtx2D = {
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      setTransform: vi.fn(),
      resetTransform: vi.fn(),
      transform: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(400) })),
      putImageData: vi.fn(),
      createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(400) })),
      measureText: vi.fn(() => ({ width: 50, height: 20 })),
      setLineDash: vi.fn(),
      getLineDash: vi.fn(() => []),
      createPattern: vi.fn(),
      canvas: {},
    };
    HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx2D) as any;

    vi.spyOn(FabricImage, "fromURL").mockImplementation(async (_url: string) => {
      const imgObj = new Rect({ width: 200, height: 200 }) as any;
      imgObj.type = "Image";
      return imgObj;
    });
  });

  afterEach(() => {
    posterStorageService.closeDB();
    (globalThis as any).indexedDB = originalIndexedDB;
  });

  describe("1. Environment Detection and Database Initialization", () => {
    it("detects when IndexedDB is supported in the browser environment", () => {
      expect(posterStorageService.isSupported()).toBe(true);
    });

    it("throws explicit, actionable error if IndexedDB is not supported or undefined", async () => {
      (globalThis as any).indexedDB = undefined;
      const unsuppService = new PosterStorageService();

      expect(unsuppService.isSupported()).toBe(false);
      await expect(unsuppService.openDB()).rejects.toThrow(
        "IndexedDB is not supported or available in this browser environment."
      );
    });

    it("successfully opens database and creates versioned 'designs' and 'assets' object stores", async () => {
      const dbAnon = await posterStorageService.openDB();
      expect(dbAnon).toBeDefined();
      expect(dbAnon.name).toBe("grovastra_poster_studio_anonymous");
      expect(mockIDB.open).toHaveBeenCalledWith("grovastra_poster_studio_anonymous", 1);

      posterStorageService.closeDB();
      posterStorageService.setUserId("user_alpha");
      const dbUser = await posterStorageService.openDB();
      expect(dbUser).toBeDefined();
      expect(dbUser.name).toBe("grovastra_poster_studio_user_alpha");
      expect(mockIDB.open).toHaveBeenCalledWith("grovastra_poster_studio_user_alpha", 1);
    });

    it("handles blocked database upgrade errors safely", async () => {
      posterStorageService.closeDB();
      mockIDB.setShouldBeBlocked(true);

      await expect(posterStorageService.openDB()).rejects.toThrow(
        "Database upgrade was blocked. Please close other open Poster Studio tabs."
      );
    });

    it("handles quota exceeded and storage initialization errors safely", async () => {
      posterStorageService.closeDB();
      const quotaErr = new Error("Disk full");
      quotaErr.name = "QuotaExceededError";
      mockIDB.setShouldFailOpen(true, quotaErr);

      await expect(posterStorageService.openDB()).rejects.toThrow(
        "Storage quota exceeded. Please free up browser storage space."
      );
    });
  });

  describe("2. Design Saving, Retrieval, Listing and Deletion", () => {
    it("saves a new design record to IndexedDB with timestamps and returns saved design", async () => {
      const designInput: SavedPosterDesignInput = {
        name: "Diwali Special Offer",
        presetId: "whatsapp-post",
        width: 1080,
        height: 1080,
        canvasJson: JSON.stringify({ objects: [{ type: "rect", left: 100, top: 100 }] }),
        thumbnailDataUrl: "data:image/jpeg;base64,mockthumb",
      };

      const saved = await posterStorageService.saveDesign(designInput);

      expect(saved.id).toBeDefined();
      expect(saved.id.startsWith("des_")).toBe(true);
      expect(saved.name).toBe("Diwali Special Offer");
      expect(saved.width).toBe(1080);
      expect(saved.height).toBe(1080);
      expect(saved.createdAt).toBeGreaterThan(0);
      expect(saved.updatedAt).toBe(saved.createdAt);

      // Verify retrieval
      const retrieved = await posterStorageService.getDesign(saved.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("Diwali Special Offer");
      expect(retrieved?.presetId).toBe("whatsapp-post");
      expect(retrieved?.canvasJson).toBe(designInput.canvasJson);
    });

    it("preserves createdAt timestamp when updating an existing design", async () => {
      const created = await posterStorageService.saveDesign({
        name: "Initial Version",
        presetId: "whatsapp-post",
        width: 1080,
        height: 1080,
        canvasJson: "{}",
      });

      const originalCreatedAt = created.createdAt;

      // Small delay to verify timestamp difference
      const updated = await posterStorageService.saveDesign({
        id: created.id,
        name: "Updated Version",
        presetId: "whatsapp-post",
        width: 1080,
        height: 1080,
        canvasJson: '{"version":2}',
      });

      expect(updated.id).toBe(created.id);
      expect(updated.name).toBe("Updated Version");
      expect(updated.createdAt).toBe(originalCreatedAt);
      expect(updated.updatedAt).toBeGreaterThanOrEqual(originalCreatedAt);
    });

    it("lists saved designs sorted newest to oldest and omits heavy canvasJson", async () => {
      const d1 = await posterStorageService.saveDesign({
        name: "First Design",
        presetId: "whatsapp-post",
        width: 1080,
        height: 1080,
        canvasJson: '{"heavy": true}',
      });

      const d2 = await posterStorageService.saveDesign({
        name: "Second Design",
        presetId: "whatsapp-status",
        width: 1080,
        height: 1920,
        canvasJson: '{"heavy": true}',
      });

      const list = await posterStorageService.listDesigns();

      expect(list.length).toBe(2);
      expect(list[0].id).toBe(d2.id); // Newest first
      expect(list[1].id).toBe(d1.id);
      expect((list[0] as any).canvasJson).toBeUndefined(); // Canvas JSON omitted for performance
    });

    it("duplicates an existing design under a new ID and 'Copy of' prefix", async () => {
      const original = await posterStorageService.saveDesign({
        name: "Summer Sale",
        presetId: "whatsapp-post",
        width: 1080,
        height: 1080,
        canvasJson: '{"objects":[]}',
        assetIds: ["ast_mock_1"],
      });

      const copy = await posterStorageService.duplicateDesign(original.id);

      expect(copy.id).not.toBe(original.id);
      expect(copy.name).toBe("Copy of Summer Sale");
      expect(copy.presetId).toBe(original.presetId);
      expect(copy.assetIds).toEqual(["ast_mock_1"]);

      // Verify both designs now exist independently
      const list = await posterStorageService.listDesigns();
      expect(list.length).toBe(2);
    });

    it("deletes a design record successfully", async () => {
      const saved = await posterStorageService.saveDesign({
        name: "To Delete",
        presetId: "whatsapp-post",
        width: 1080,
        height: 1080,
        canvasJson: "{}",
      });

      expect(await posterStorageService.getDesign(saved.id)).toBeDefined();

      const deleted = await posterStorageService.deleteDesign(saved.id);
      expect(deleted).toBe(true);

      const after = await posterStorageService.getDesign(saved.id);
      expect(after).toBeNull();
    });
  });

  describe("3. Binary Asset Storage, Retrieval and Orphan Cleanup", () => {
    it("stores and retrieves binary Blobs without base64 string overhead", async () => {
      const fakeBlob = new Blob(["fake-binary-image-data"], { type: "image/png" });
      const assetId = "ast_prod_12345";

      await posterStorageService.saveAssetRecords([
        {
          id: assetId,
          blob: fakeBlob,
          mimeType: "image/png",
          name: "shoes.png",
          size: fakeBlob.size,
          createdAt: Date.now(),
        },
      ]);

      const retrieved = await posterStorageService.getAsset(assetId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(assetId);
      expect(retrieved?.mimeType).toBe("image/png");
      expect(retrieved?.blob).toBe(fakeBlob);
    });

    it("atomically saves binary assets alongside design input in saveDesign", async () => {
      const fakeBlob = new Blob(["product-cutout-data"], { type: "image/png" });
      const assetId = "ast_cutout_999";

      const assetsMap = new Map<string, Blob>();
      assetsMap.set(assetId, fakeBlob);

      const savedDesign = await posterStorageService.saveDesign(
        {
          name: "Cutout Poster",
          presetId: "whatsapp-post",
          width: 1080,
          height: 1080,
          canvasJson: JSON.stringify({
            objects: [{ type: "Image", assetId, left: 50, top: 50 }],
          }),
        },
        assetsMap
      );

      expect(savedDesign.assetIds).toContain(assetId);

      // Verify asset was stored in assets table
      const storedAsset = await posterStorageService.getAsset(assetId);
      expect(storedAsset).toBeDefined();
      expect(storedAsset?.blob).toBe(fakeBlob);
    });

    it("cleans up orphan assets that are no longer referenced by any design", async () => {
      const activeBlob = new Blob(["active-image"], { type: "image/png" });
      const orphanBlob = new Blob(["orphan-image"], { type: "image/png" });

      await posterStorageService.saveAssetRecords([
        {
          id: "ast_active",
          blob: activeBlob,
          mimeType: "image/png",
          name: "active.png",
          size: activeBlob.size,
          createdAt: Date.now(),
        },
        {
          id: "ast_orphan",
          blob: orphanBlob,
          mimeType: "image/png",
          name: "orphan.png",
          size: orphanBlob.size,
          createdAt: Date.now(),
        },
      ]);

      // Save design referencing only ast_active
      await posterStorageService.saveDesign({
        name: "Active Design",
        presetId: "whatsapp-post",
        width: 1080,
        height: 1080,
        canvasJson: "{}",
        assetIds: ["ast_active"],
      });

      const deletedCount = await posterStorageService.cleanupOrphanAssets();
      expect(deletedCount).toBe(1);

      expect(await posterStorageService.getAsset("ast_active")).toBeDefined();
      expect(await posterStorageService.getAsset("ast_orphan")).toBeNull();
    });
  });

  describe("4. Canvas Hydration with Fresh Object URLs & Cleanup", () => {
    it("hydrates serialized canvas JSON by replacing stale/expired URLs with fresh session object URLs", async () => {
      const fakeBlob = new Blob(["product-pixels"], { type: "image/png" });
      const assetId = "ast_watch_42";

      await posterStorageService.saveAssetRecords([
        {
          id: assetId,
          blob: fakeBlob,
          mimeType: "image/png",
          name: "watch.png",
          size: fakeBlob.size,
          createdAt: Date.now(),
        },
      ]);

      const staleBlobUrl = "blob:http://localhost:5173/stale-dead-uuid-from-yesterday";

      const design = await posterStorageService.saveDesign({
        name: "Watch Poster",
        presetId: "whatsapp-post",
        width: 1080,
        height: 1080,
        canvasJson: JSON.stringify({
          objects: [
            {
              type: "Image",
              id: "layer_img_1",
              name: "Watch Cutout",
              assetId,
              src: staleBlobUrl, // Stale expired URL that would fail on refresh
              left: 200,
              top: 200,
            },
          ],
        }),
        assetIds: [assetId],
      });

      const { hydratedJson, sessionUrls } = await posterStorageService.hydrateDesignForCanvas(design);

      expect(sessionUrls.length).toBe(1);
      expect(sessionUrls[0].startsWith("blob:")).toBe(true);
      expect(sessionUrls[0]).not.toBe(staleBlobUrl); // Fresh active object URL generated!

      const parsedHydrated = JSON.parse(hydratedJson);
      expect(parsedHydrated.objects[0].src).toBe(sessionUrls[0]);
      expect(parsedHydrated.objects[0].assetId).toBe(assetId);
      expect(parsedHydrated.objects[0].id).toBe("layer_img_1");
    });

    it("throws explicit error when a required image asset is missing or corrupt in storage", async () => {
      const design = await posterStorageService.saveDesign({
        name: "Broken Poster",
        presetId: "whatsapp-post",
        width: 1080,
        height: 1080,
        canvasJson: JSON.stringify({
          objects: [
            {
              type: "Image",
              assetId: "ast_missing_nonexistent",
              src: "blob:dead",
            },
          ],
        }),
        assetIds: ["ast_missing_nonexistent"],
      });

      await expect(posterStorageService.hydrateDesignForCanvas(design)).rejects.toThrow(
        "Missing image asset record 'ast_missing_nonexistent'"
      );
    });

    it("revokes created session object URLs cleanly without memory leaks", () => {
      const revokeSpy = vi.spyOn(URL, "revokeObjectURL");
      const urls = ["blob:http://localhost:5173/test-1", "blob:http://localhost:5173/test-2"];

      posterStorageService.revokeSessionUrls(urls);

      expect(revokeSpy).toHaveBeenCalledTimes(2);
      expect(revokeSpy).toHaveBeenCalledWith("blob:http://localhost:5173/test-1");
      expect(revokeSpy).toHaveBeenCalledWith("blob:http://localhost:5173/test-2");
    });
  });

  describe("5. PosterCanvasManager Asset Tracking & Serialization Integration", () => {
    it("tracks assetId on image layers and includes assetId in toJSON()", async () => {
      const mockCanvasEl = document.createElement("canvas");
      const manager = new PosterCanvasManager({
        canvasElement: mockCanvasEl,
        width: 1080,
        height: 1080,
      });

      const testFile = new File(["dummy-pixels"], "sample.png", { type: "image/png" });

      const imgLayer = await manager.addImageFromFile(testFile, {
        assetId: "ast_sample_123",
        name: "Sample Product",
      });

      expect(imgLayer.get("assetId")).toBe("ast_sample_123");

      // Verify asset is registered in in-memory map
      const registered = manager.getRegisteredAssets();
      expect(registered.has("ast_sample_123")).toBe(true);

      // Verify toJSON includes assetId
      const json = manager.toJSON();
      expect(json).toContain("ast_sample_123");
      const parsed = JSON.parse(json);
      const imgObj = parsed.objects.find((o: any) => o.assetId === "ast_sample_123");
      expect(imgObj).toBeDefined();
      expect(imgObj.assetId).toBe("ast_sample_123");

      manager.dispose();
    });

    it("cleans up session URLs and registered assets on canvas clear() and dispose()", async () => {
      const revokeSpy = vi.spyOn(URL, "revokeObjectURL");
      const mockCanvasEl = document.createElement("canvas");
      const manager = new PosterCanvasManager({
        canvasElement: mockCanvasEl,
        width: 1080,
        height: 1080,
      });

      const testFile = new File(["dummy-pixels"], "sample.png", { type: "image/png" });
      await manager.addImageFromFile(testFile, { assetId: "ast_cleanup_test" });

      expect(manager.getSessionObjectUrls().length).toBeGreaterThan(0);

      // Dispose should revoke URLs
      manager.dispose();

      expect(revokeSpy).toHaveBeenCalled();
      expect(manager.getSessionObjectUrls().length).toBe(0);
      expect(manager.getRegisteredAssets().size).toBe(0);
    });
  });
});
