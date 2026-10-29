import {
  SavedPosterDesign,
  SavedPosterDesignSummary,
  SavedPosterDesignInput,
  PosterAssetRecord,
} from "../types/poster.js";

export const LEGACY_POSTER_DB_NAME = "grovastra_poster_studio";
export const POSTER_DB_NAME = "grovastra_poster_studio";
export const POSTER_DB_PREFIX = "grovastra_poster_studio_";
export const POSTER_DB_VERSION = 1;
export const STORE_DESIGNS = "designs";
export const STORE_ASSETS = "assets";

/**
 * Returns the isolated database name for a specific user ID.
 * If no user ID is provided, falls back to an isolated anonymous database name.
 * NEVER reuses or reads from the legacy un-isolated global database.
 */
export function getPosterDbName(userId?: string | null): string {
  const cleanId = (userId || "").trim();
  if (cleanId) {
    return `${POSTER_DB_PREFIX}${cleanId}`;
  }
  return `${POSTER_DB_PREFIX}anonymous`;
}

/**
 * Custom error class for poster storage operations to give clear, actionable feedback.
 */
export class PosterStorageError extends Error {
  public code: string;

  constructor(message: string, code: string = "STORAGE_ERROR") {
    super(message);
    this.name = "PosterStorageError";
    this.code = code;
  }
}

/**
 * Native IndexedDB service for Poster Studio.
 * Safely persists multi-poster designs, metadata, and binary image assets
 * in an isolated database per authenticated user.
 */
export class PosterStorageService {
  private currentUserId: string | null = null;
  private currentDbName: string | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private activeDb: IDBDatabase | null = null;

  /**
   * Sets the active authenticated user ID.
   * If the user changes, cleanly closes any active database connection
   * and clears connection caches so subsequent calls connect to the new user's database.
   */
  public setUserId(userId: string | null): void {
    const nextDbName = getPosterDbName(userId);
    if (this.currentDbName !== nextDbName || this.currentUserId !== (userId || null)) {
      this.closeDB();
      this.currentUserId = userId || null;
      this.currentDbName = nextDbName;
    }
  }

  /**
   * Returns the currently configured user ID.
   */
  public getUserId(): string | null {
    return this.currentUserId;
  }

  /**
   * Returns the current database name for the active user.
   */
  public getDbName(): string {
    return this.currentDbName || getPosterDbName(this.currentUserId);
  }

  /**
   * Checks whether native IndexedDB is available in the current environment.
   */
  public isSupported(): boolean {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  }

  /**
   * Opens or returns the cached connection to the user-isolated IndexedDB database.
   */
  public async openDB(userId?: string | null): Promise<IDBDatabase> {
    if (!this.isSupported()) {
      throw new PosterStorageError(
        "IndexedDB is not supported or available in this browser environment.",
        "NOT_SUPPORTED"
      );
    }

    const targetUserId = userId !== undefined ? userId : this.currentUserId;
    const targetDbName = getPosterDbName(targetUserId);

    // If an active database is already open for this exact target database, return it
    if (this.activeDb && this.currentDbName === targetDbName) {
      return this.activeDb;
    }

    // If switching database names, close old connection first
    if (this.currentDbName && this.currentDbName !== targetDbName) {
      this.closeDB();
    }

    this.currentUserId = targetUserId || null;
    this.currentDbName = targetDbName;

    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      try {
        const req = indexedDB.open(targetDbName, POSTER_DB_VERSION);

        req.onupgradeneeded = () => {
          const db = req.result;

          // 1. Designs Store: stores design metadata & canvas JSON
          if (!db.objectStoreNames.contains(STORE_DESIGNS)) {
            const designStore = db.createObjectStore(STORE_DESIGNS, { keyPath: "id" });
            designStore.createIndex("by_updated", "updatedAt", { unique: false });
            designStore.createIndex("by_name", "name", { unique: false });
            designStore.createIndex("by_preset", "presetId", { unique: false });
          }

          // 2. Assets Store: stores binary image blobs natively (no base64 overhead)
          if (!db.objectStoreNames.contains(STORE_ASSETS)) {
            const assetStore = db.createObjectStore(STORE_ASSETS, { keyPath: "id" });
            assetStore.createIndex("by_created", "createdAt", { unique: false });
          }
        };

        req.onsuccess = () => {
          this.activeDb = req.result;

          // Listen for unexpected closures or version change requests
          this.activeDb.onversionchange = () => {
            this.activeDb?.close();
            this.activeDb = null;
            this.dbPromise = null;
          };

          this.activeDb.onclose = () => {
            this.activeDb = null;
            this.dbPromise = null;
          };

          resolve(req.result);
        };

        req.onerror = () => {
          this.dbPromise = null;
          const err = req.error;
          let msg = err?.message || "Failed to open poster storage database.";
          if (err?.name === "QuotaExceededError") {
            msg = "Storage quota exceeded. Please free up browser storage space.";
          }
          reject(new PosterStorageError(msg, err?.name || "OPEN_FAILED"));
        };

        req.onblocked = () => {
          reject(
            new PosterStorageError(
              "Database upgrade was blocked. Please close other open Poster Studio tabs.",
              "UPGRADE_BLOCKED"
            )
          );
        };
      } catch (err: any) {
        this.dbPromise = null;
        reject(
          new PosterStorageError(
            err?.message || "Unexpected exception during IndexedDB initialization.",
            "INIT_EXCEPTION"
          )
        );
      }
    });

    return this.dbPromise;
  }

  /**
   * Closes active database connection.
   */
  public closeDB(): void {
    if (this.activeDb) {
      try {
        this.activeDb.close();
      } catch {
        // ignore
      }
      this.activeDb = null;
    }
    this.dbPromise = null;
    this.currentDbName = null;
  }

  /**
   * Saves or updates a poster design along with any new or modified binary image assets.
   */
  public async saveDesign(
    designInput: SavedPosterDesignInput,
    assets?: Map<string, Blob> | Record<string, Blob> | PosterAssetRecord[]
  ): Promise<SavedPosterDesign> {
    const db = await this.openDB();
    const now = Date.now();

    const id = designInput.id || `des_${now}_${Math.random().toString(36).substring(2, 9)}`;

    // Read existing design to preserve creation timestamp
    const existing = await this.getDesign(id);
    const createdAt = existing ? existing.createdAt : now;
    const updatedAt = now;

    // Normalize asset IDs referenced in the design and scan canvas objects
    const referencedAssetIds = new Set<string>(designInput.assetIds || []);
    try {
      const parsedCanvas =
        typeof designInput.canvasJson === "string"
          ? JSON.parse(designInput.canvasJson)
          : designInput.canvasJson;
      if (parsedCanvas && Array.isArray(parsedCanvas.objects)) {
        parsedCanvas.objects.forEach((obj: any) => {
          if (obj && obj.assetId) {
            referencedAssetIds.add(String(obj.assetId));
          }
        });
      }
    } catch {
      // ignore
    }

    // 1. Prepare and save binary image assets if provided
    if (assets) {
      const providedAssetsMap = new Map<string, Blob>();
      if (Array.isArray(assets)) {
        assets.forEach((rec) => {
          providedAssetsMap.set(rec.id, rec.blob);
          referencedAssetIds.add(rec.id);
        });
      } else if (assets instanceof Map) {
        assets.forEach((blob, assetId) => {
          providedAssetsMap.set(assetId, blob);
          referencedAssetIds.add(assetId);
        });
      } else if (typeof assets === "object") {
        Object.entries(assets).forEach(([assetId, blob]) => {
          providedAssetsMap.set(assetId, blob);
          referencedAssetIds.add(assetId);
        });
      }

      // Persist new or changed assets without rewriting existing identical records
      const assetRecordsToSave: PosterAssetRecord[] = [];
      for (const [assetId, blob] of providedAssetsMap.entries()) {
        const existingAsset = await this.getAsset(assetId);
        if (!existingAsset || existingAsset.size !== blob.size) {
          assetRecordsToSave.push({
            id: assetId,
            blob,
            mimeType: blob.type || "image/png",
            name: `asset-${assetId}.png`,
            size: blob.size,
            createdAt: existingAsset ? existingAsset.createdAt : now,
          });
        }
      }

      if (assetRecordsToSave.length > 0) {
        await this.saveAssetRecords(assetRecordsToSave);
      }
    }

    const designRecord: SavedPosterDesign = {
      id,
      name: (designInput.name || "Untitled Poster").trim() || "Untitled Poster",
      presetId: designInput.presetId || "whatsapp-post",
      width: designInput.width,
      height: designInput.height,
      canvasJson: designInput.canvasJson,
      thumbnailDataUrl: designInput.thumbnailDataUrl,
      assetIds: Array.from(referencedAssetIds),
      createdAt,
      updatedAt,
    };

    return new Promise<SavedPosterDesign>((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_DESIGNS], "readwrite");
        const store = tx.objectStore(STORE_DESIGNS);
        const putReq = store.put(designRecord);

        putReq.onsuccess = () => {
          resolve(designRecord);
        };

        putReq.onerror = () => {
          const err = putReq.error;
          let msg = err?.message || "Failed to write design to storage.";
          if (err?.name === "QuotaExceededError") {
            msg = "Storage quota exceeded. Please remove older designs or images.";
          }
          reject(new PosterStorageError(msg, err?.name || "WRITE_FAILED"));
        };

        tx.onerror = () => {
          const err = tx.error;
          reject(new PosterStorageError(err?.message || "Transaction failed.", err?.name || "TX_ERROR"));
        };
      } catch (err: any) {
        reject(new PosterStorageError(err?.message || "Failed to initiate save transaction.", "SAVE_FAILED"));
      }
    });
  }

  /**
   * Retrieves a single saved design by ID.
   */
  public async getDesign(id: string): Promise<SavedPosterDesign | null> {
    const db = await this.openDB();

    return new Promise<SavedPosterDesign | null>((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_DESIGNS], "readonly");
        const store = tx.objectStore(STORE_DESIGNS);
        const req = store.get(id);

        req.onsuccess = () => {
          resolve(req.result || null);
        };

        req.onerror = () => {
          reject(
            new PosterStorageError(
              req.error?.message || `Failed to read design ${id}.`,
              req.error?.name || "READ_FAILED"
            )
          );
        };
      } catch (err: any) {
        reject(new PosterStorageError(err?.message || "Failed to initiate read transaction.", "READ_FAILED"));
      }
    });
  }

  /**
   * Returns a list of all saved designs sorted newest to oldest.
   * Omits large canvasJson to ensure fast, memory-efficient listing for My Designs.
   */
  public async listDesigns(): Promise<SavedPosterDesignSummary[]> {
    const db = await this.openDB();

    return new Promise<SavedPosterDesignSummary[]>((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_DESIGNS], "readonly");
        const store = tx.objectStore(STORE_DESIGNS);
        const index = store.index("by_updated");
        const req = index.openCursor(null, "prev"); // newest first

        const results: SavedPosterDesignSummary[] = [];

        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const val = cursor.value as SavedPosterDesign;
            results.push({
              id: val.id,
              name: val.name,
              presetId: val.presetId,
              width: val.width,
              height: val.height,
              thumbnailDataUrl: val.thumbnailDataUrl,
              assetIds: val.assetIds || [],
              createdAt: val.createdAt,
              updatedAt: val.updatedAt,
            });
            cursor.continue();
          } else {
            resolve(results);
          }
        };

        req.onerror = () => {
          reject(
            new PosterStorageError(
              req.error?.message || "Failed to list poster designs.",
              req.error?.name || "LIST_FAILED"
            )
          );
        };
      } catch (err: any) {
        reject(new PosterStorageError(err?.message || "Failed to list designs.", "LIST_FAILED"));
      }
    });
  }

  /**
   * Deletes a poster design by ID.
   * Optionally cleans up unreferenced orphan assets.
   */
  public async deleteDesign(
    id: string,
    options: { cleanupOrphans?: boolean } = { cleanupOrphans: true }
  ): Promise<boolean> {
    const db = await this.openDB();

    await new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_DESIGNS], "readwrite");
        const store = tx.objectStore(STORE_DESIGNS);
        const req = store.delete(id);

        req.onsuccess = () => resolve();
        req.onerror = () => {
          reject(
            new PosterStorageError(
              req.error?.message || `Failed to delete design ${id}.`,
              req.error?.name || "DELETE_FAILED"
            )
          );
        };
      } catch (err: any) {
        reject(new PosterStorageError(err?.message || "Failed to initiate delete transaction.", "DELETE_FAILED"));
      }
    });

    if (options.cleanupOrphans) {
      try {
        await this.cleanupOrphanAssets();
      } catch (err) {
        console.warn("[PosterStorageService] Non-critical orphan cleanup warning:", err);
      }
    }

    return true;
  }

  /**
   * Duplicates an existing design under a new unique ID with a copy prefix.
   */
  public async duplicateDesign(id: string, newName?: string): Promise<SavedPosterDesign> {
    const source = await this.getDesign(id);
    if (!source) {
      throw new PosterStorageError(`Source design '${id}' not found for duplication.`, "NOT_FOUND");
    }

    const title = newName?.trim() || `Copy of ${source.name}`;
    const newId = `des_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return this.saveDesign({
      id: newId,
      name: title,
      presetId: source.presetId,
      width: source.width,
      height: source.height,
      canvasJson: source.canvasJson,
      thumbnailDataUrl: source.thumbnailDataUrl,
      assetIds: [...source.assetIds],
    });
  }

  /**
   * Renames a saved design while preserving its ID, assets, and canvas data.
   */
  public async renameDesign(id: string, newName: string): Promise<SavedPosterDesign> {
    const trimmed = (newName || "").trim();
    if (!trimmed) {
      throw new PosterStorageError("Design name cannot be empty.", "INVALID_NAME");
    }
    if (trimmed.length > 80) {
      throw new PosterStorageError("Design name cannot exceed 80 characters.", "INVALID_NAME");
    }

    const design = await this.getDesign(id);
    if (!design) {
      throw new PosterStorageError(`Design '${id}' not found for renaming.`, "NOT_FOUND");
    }

    design.name = trimmed;
    design.updatedAt = Date.now();

    const db = await this.openDB();
    return new Promise<SavedPosterDesign>((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_DESIGNS], "readwrite");
        const store = tx.objectStore(STORE_DESIGNS);
        const putReq = store.put(design);

        putReq.onsuccess = () => resolve(design);
        putReq.onerror = () => {
          reject(new PosterStorageError(putReq.error?.message || "Failed to update design name.", "RENAME_FAILED"));
        };
        tx.onerror = () => {
          reject(new PosterStorageError(tx.error?.message || "Transaction error during rename.", "TX_ERROR"));
        };
      } catch (err: any) {
        reject(new PosterStorageError(err?.message || "Failed to initiate rename transaction.", "RENAME_FAILED"));
      }
    });
  }

  /**
   * Saves binary asset records to the assets store.
   */
  public async saveAssetRecords(records: PosterAssetRecord[]): Promise<void> {
    if (records.length === 0) return;
    const db = await this.openDB();

    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_ASSETS], "readwrite");
        const store = tx.objectStore(STORE_ASSETS);

        records.forEach((record) => {
          store.put(record);
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          const err = tx.error;
          let msg = err?.message || "Failed to save image assets.";
          if (err?.name === "QuotaExceededError") {
            msg = "Storage quota exceeded while saving image assets.";
          }
          reject(new PosterStorageError(msg, err?.name || "ASSET_WRITE_FAILED"));
        };
      } catch (err: any) {
        reject(new PosterStorageError(err?.message || "Failed to initiate asset save transaction.", "ASSET_TX_ERROR"));
      }
    });
  }

  /**
   * Retrieves a single binary asset by ID.
   */
  public async getAsset(id: string): Promise<PosterAssetRecord | null> {
    const db = await this.openDB();

    return new Promise<PosterAssetRecord | null>((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_ASSETS], "readonly");
        const store = tx.objectStore(STORE_ASSETS);
        const req = store.get(id);

        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => {
          reject(
            new PosterStorageError(
              req.error?.message || `Failed to read asset ${id}.`,
              req.error?.name || "ASSET_READ_FAILED"
            )
          );
        };
      } catch (err: any) {
        reject(new PosterStorageError(err?.message || "Failed to read asset.", "ASSET_READ_FAILED"));
      }
    });
  }

  /**
   * Retrieves multiple binary assets by their IDs.
   */
  public async getAssets(ids: string[]): Promise<Map<string, PosterAssetRecord>> {
    const results = new Map<string, PosterAssetRecord>();
    if (!ids || ids.length === 0) return results;

    const uniqueIds = Array.from(new Set(ids));
    const db = await this.openDB();

    return new Promise<Map<string, PosterAssetRecord>>((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_ASSETS], "readonly");
        const store = tx.objectStore(STORE_ASSETS);

        let completed = 0;
        uniqueIds.forEach((id) => {
          const req = store.get(id);
          req.onsuccess = () => {
            if (req.result) {
              results.set(id, req.result);
            }
            completed++;
            if (completed === uniqueIds.length) {
              resolve(results);
            }
          };
          req.onerror = () => {
            completed++;
            if (completed === uniqueIds.length) {
              resolve(results);
            }
          };
        });

        tx.onerror = () => {
          reject(new PosterStorageError("Transaction error while fetching assets.", "ASSET_BATCH_FAILED"));
        };
      } catch (err: any) {
        reject(new PosterStorageError(err?.message || "Failed to batch retrieve assets.", "ASSET_BATCH_ERROR"));
      }
    });
  }

  /**
   * Deletes a single asset by ID.
   */
  public async deleteAsset(id: string): Promise<boolean> {
    const db = await this.openDB();

    return new Promise<boolean>((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_ASSETS], "readwrite");
        const store = tx.objectStore(STORE_ASSETS);
        const req = store.delete(id);

        req.onsuccess = () => resolve(true);
        req.onerror = () => {
          reject(
            new PosterStorageError(
              req.error?.message || `Failed to delete asset ${id}.`,
              req.error?.name || "DELETE_ASSET_FAILED"
            )
          );
        };
      } catch (err: any) {
        reject(new PosterStorageError(err?.message || "Failed to delete asset.", "DELETE_ASSET_FAILED"));
      }
    });
  }

  /**
   * Scans all designs and removes any stored assets that are no longer referenced by any design.
   * Prevents unbounded storage growth over time.
   */
  public async cleanupOrphanAssets(): Promise<number> {
    const db = await this.openDB();

    // 1. Gather all active asset IDs across all designs
    const designs = await this.listDesigns();
    const activeAssetIds = new Set<string>();
    designs.forEach((d) => {
      d.assetIds?.forEach((aid) => activeAssetIds.add(aid));
    });

    // 2. Scan all stored assets
    return new Promise<number>((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_ASSETS], "readwrite");
        const store = tx.objectStore(STORE_ASSETS);
        const req = store.openCursor();

        let deletedCount = 0;

        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const assetId = cursor.key as string;
            if (!activeAssetIds.has(assetId)) {
              cursor.delete();
              deletedCount++;
            }
            cursor.continue();
          } else {
            resolve(deletedCount);
          }
        };

        req.onerror = () => {
          reject(
            new PosterStorageError(
              req.error?.message || "Failed during orphan asset cleanup scan.",
              req.error?.name || "ORPHAN_CLEANUP_FAILED"
            )
          );
        };
      } catch (err: any) {
        reject(new PosterStorageError(err?.message || "Failed to cleanup orphan assets.", "CLEANUP_ERROR"));
      }
    });
  }

  /**
   * Rehydrates serialized canvas JSON with fresh, active session object URLs from stored Blobs.
   * Fixes the critical defect where expired blob: URLs fail on browser refresh or reload.
   * Throws an explicit error if any required asset is missing from storage.
   */
  public async hydrateDesignForCanvas(
    design: SavedPosterDesign
  ): Promise<{ hydratedJson: string; sessionUrls: string[] }> {
    let parsed: any;
    try {
      parsed = JSON.parse(design.canvasJson);
    } catch (e: any) {
      throw new PosterStorageError(`Corrupt canvas JSON in design ${design.id}: ${e?.message}`, "CORRUPT_JSON");
    }

    const sessionUrls: string[] = [];
    const objects: any[] = parsed.objects || [];

    // Identify all image objects with assetIds
    const assetIdSet = new Set<string>();
    objects.forEach((obj) => {
      if ((obj.type === "Image" || obj.type === "image" || obj.assetId) && obj.assetId) {
        assetIdSet.add(obj.assetId);
      }
    });

    if (parsed.backgroundImage && parsed.backgroundImage.assetId) {
      assetIdSet.add(parsed.backgroundImage.assetId);
    }

    if (assetIdSet.size === 0) {
      return { hydratedJson: design.canvasJson, sessionUrls: [] };
    }

    // Retrieve all needed assets from storage in a single transaction
    const assetsMap = await this.getAssets(Array.from(assetIdSet));

    // Verify all referenced assets are present
    for (const assetId of assetIdSet) {
      if (!assetsMap.has(assetId)) {
        throw new PosterStorageError(
          `Missing image asset record '${assetId}'. The asset was deleted or corrupt.`,
          "MISSING_ASSET"
        );
      }
    }

    // Replace old/stale src with fresh session object URLs
    objects.forEach((obj) => {
      if (obj.assetId && assetsMap.has(obj.assetId)) {
        const asset = assetsMap.get(obj.assetId)!;
        const freshUrl = URL.createObjectURL(asset.blob);
        sessionUrls.push(freshUrl);
        obj.src = freshUrl;
      }
    });

    if (parsed.backgroundImage && parsed.backgroundImage.assetId) {
      const asset = assetsMap.get(parsed.backgroundImage.assetId);
      if (asset) {
        const freshUrl = URL.createObjectURL(asset.blob);
        sessionUrls.push(freshUrl);
        parsed.backgroundImage.src = freshUrl;
      }
    }

    return {
      hydratedJson: JSON.stringify(parsed),
      sessionUrls,
    };
  }

  /**
   * Revokes created session object URLs to prevent memory leaks.
   */
  public revokeSessionUrls(urls: string[]): void {
    if (!urls || urls.length === 0) return;
    urls.forEach((url) => {
      if (url && typeof url === "string" && url.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }
    });
  }
}

export const posterStorageService = new PosterStorageService();
