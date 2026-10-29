import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { PosterEditorPage, getAutoSaveStorageKey, getAutoSavePreference } from "../pages/PosterEditorPage";
import {
  posterStorageService,
  getPosterDbName,
  LEGACY_POSTER_DB_NAME,
  STORE_DESIGNS,
  STORE_ASSETS,
} from "../services/posterStorageService";
import { User } from "../types/auth";
import { SavedPosterDesignInput } from "../types/poster";

// Mock canvas manager for isolated editor testing
vi.mock("../services/posterCanvasManager.js", () => {
  return {
    PosterCanvasManager: class MockPosterCanvasManager {
      setActiveTool = vi.fn();
      setZoom = vi.fn();
      addText = vi.fn();
      clear = vi.fn();
      toJSON = vi.fn(() => JSON.stringify({ objects: [] }));
      getRegisteredAssets = vi.fn(() => new Map());
      fabricCanvas = {
        getObjects: vi.fn(() => []),
        getActiveObject: vi.fn(() => null),
        backgroundColor: "#ffffff",
        requestRenderAll: vi.fn(),
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

vi.mock("../services/posterExportService.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    generateCanvasThumbnail: vi.fn(() => "data:image/jpeg;base64,mockthumb"),
  };
});

/**
 * In-memory multi-database IndexedDB mock supporting isolated databases per user
 */
function createMultiDatabaseMock() {
  const databases = new Map<string, Map<string, Map<string, any>>>();

  const getOrCreateDB = (dbName: string) => {
    if (!databases.has(dbName)) {
      databases.set(
        dbName,
        new Map<string, Map<string, any>>([
          [STORE_DESIGNS, new Map<string, any>()],
          [STORE_ASSETS, new Map<string, any>()],
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

describe("Phase 3C: User Isolation & Empty Initial State Tests", () => {
  let mockIDB: ReturnType<typeof createMultiDatabaseMock>;

  const mockUserA: User = {
    id: "user_alpha_101",
    organizationId: "org_1",
    email: "alpha@example.com",
    firstName: "Alpha",
    lastName: "User",
    role: "OWNER",
    createdAt: new Date().toISOString(),
  };

  const mockUserB: User = {
    id: "user_beta_202",
    organizationId: "org_2",
    email: "beta@example.com",
    firstName: "Beta",
    lastName: "User",
    role: "OWNER",
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    mockIDB = createMultiDatabaseMock();
    (global as any).indexedDB = mockIDB;
    posterStorageService.closeDB();
  });

  afterEach(() => {
    posterStorageService.closeDB();
  });

  // 1. Poster Studio opens on the gallery without creating a poster
  it("1. opens Poster Studio on the gallery without creating or persisting any poster", async () => {
    const saveSpy = vi.spyOn(posterStorageService, "saveDesign");

    render(<PosterEditorPage currentUser={mockUserA} />);

    // Renders the My Posters gallery
    expect(screen.getByRole("heading", { name: "My Posters", level: 1 })).toBeInTheDocument();
    expect(
      screen.getByText("Reopen and edit your saved designs or create a new marketing flyer.")
    ).toBeInTheDocument();

    // Verify storage was never touched for writes
    expect(saveSpy).not.toHaveBeenCalled();

    // Verify User A's database contains no records
    const userADbName = getPosterDbName(mockUserA.id);
    const userAStore = mockIDB.databases.get(userADbName)?.get(STORE_DESIGNS);
    expect(userAStore ? userAStore.size : 0).toBe(0);
  });

  // 2. An empty gallery displays Create New Poster
  it("2. displays Create New Poster in empty state when user gallery has no saved designs", async () => {
    render(<PosterEditorPage currentUser={mockUserA} />);

    await waitFor(() => {
      expect(screen.getByText("No Saved Posters Yet")).toBeInTheDocument();
    });

    // The primary Create New Poster button is rendered in the empty state
    const ctaBtns = screen.getAllByRole("button", { name: "Create New Poster" });
    expect(ctaBtns.length).toBeGreaterThanOrEqual(2); // Header action + Empty state card
  });

  // 3. Clicking Create New Poster opens a fresh editor without persisting
  it("3. clicking Create New Poster opens a fresh editor without saving to IndexedDB", async () => {
    const saveSpy = vi.spyOn(posterStorageService, "saveDesign");

    render(<PosterEditorPage currentUser={mockUserA} />);

    await waitFor(() => {
      expect(screen.getByText("No Saved Posters Yet")).toBeInTheDocument();
    });

    const ctaBtns = screen.getAllByRole("button", { name: "Create New Poster" });
    // Click the empty state action button
    await act(async () => {
      fireEvent.click(ctaBtns[1]);
    });

    // Editor is now displayed
    expect(screen.getByLabelText("Poster project title")).toBeInTheDocument();
    expect(screen.getByLabelText("Back to My Posters")).toBeInTheDocument();

    // Still, no IndexedDB save has occurred
    expect(saveSpy).not.toHaveBeenCalled();
    const userADbName = getPosterDbName(mockUserA.id);
    const userAStore = mockIDB.databases.get(userADbName)?.get(STORE_DESIGNS);
    expect(userAStore ? userAStore.size : 0).toBe(0);
  });

  // 4. No IndexedDB design is written until explicit save or genuine edit with Auto Save
  it("4. does not write to IndexedDB when returning from unmodified editor, but saves on explicit save or dirty edit", async () => {
    const saveSpy = vi.spyOn(posterStorageService, "saveDesign");

    render(<PosterEditorPage currentUser={mockUserA} />);

    await waitFor(() => {
      expect(screen.getByText("No Saved Posters Yet")).toBeInTheDocument();
    });

    const ctaBtns = screen.getAllByRole("button", { name: "Create New Poster" });
    await act(async () => {
      fireEvent.click(ctaBtns[1]);
    });

    // Return to gallery without edits
    const backBtn = screen.getByLabelText("Back to My Posters");
    await act(async () => {
      fireEvent.click(backBtn);
    });

    // Directly in gallery, no save called
    expect(screen.getByRole("heading", { name: "My Posters", level: 1 })).toBeInTheDocument();
    expect(saveSpy).not.toHaveBeenCalled();

    // Now re-enter editor and explicitly save
    const newBtns = screen.getAllByRole("button", { name: "Create New Poster" });
    await act(async () => {
      fireEvent.click(newBtns[0]);
    });

    const titleInput = screen.getByLabelText("Poster project title");
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: "Manual Save Poster" } });
    });

    // Click Save button
    const saveBtn = screen.getByRole("button", { name: "Save poster design" });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // Now saveDesign was called and design is saved in user A's database
    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });
  });

  // 5. User A and User B have independent databases and galleries
  it("5. ensures User A and User B have completely independent databases and galleries", async () => {
    // 1. User A creates and saves a design
    posterStorageService.setUserId(mockUserA.id);
    const userADesign: SavedPosterDesignInput = {
      name: "User A Winter Fest",
      presetId: "whatsapp-post",
      width: 1080,
      height: 1080,
      canvasJson: JSON.stringify({ objects: [] }),
    };
    await posterStorageService.saveDesign(userADesign);

    // Verify stored under User A's DB
    const userADbName = getPosterDbName(mockUserA.id);
    expect(userADbName).toBe("grovastra_poster_studio_user_alpha_101");
    const userAList = await posterStorageService.listDesigns();
    expect(userAList.length).toBe(1);
    expect(userAList[0].name).toBe("User A Winter Fest");

    // 2. Switch to User B
    posterStorageService.setUserId(mockUserB.id);
    const userBDbName = getPosterDbName(mockUserB.id);
    expect(userBDbName).toBe("grovastra_poster_studio_user_beta_202");

    // User B's gallery must be completely empty!
    const userBList = await posterStorageService.listDesigns();
    expect(userBList.length).toBe(0);

    // 3. User B creates their own design
    const userBDesign: SavedPosterDesignInput = {
      name: "User B Spring Clearance",
      presetId: "whatsapp-status",
      width: 1080,
      height: 1920,
      canvasJson: JSON.stringify({ objects: [] }),
    };
    await posterStorageService.saveDesign(userBDesign);

    // User B has only 1 design
    const userBListAfter = await posterStorageService.listDesigns();
    expect(userBListAfter.length).toBe(1);
    expect(userBListAfter[0].name).toBe("User B Spring Clearance");

    // Switch back to User A: User A still has only their 1 design
    posterStorageService.setUserId(mockUserA.id);
    const userARecheck = await posterStorageService.listDesigns();
    expect(userARecheck.length).toBe(1);
    expect(userARecheck[0].name).toBe("User A Winter Fest");
  });

  // 6. User switching and logout clear prior-user editor/gallery state and revoke object URLs
  it("6. clears prior-user editor/gallery state and revokes session object URLs on account switch/logout", async () => {
    const revokeSpy = vi.spyOn(posterStorageService, "revokeSessionUrls");

    const { rerender } = render(<PosterEditorPage currentUser={mockUserA} initialView="editor" />);

    // Editor is active with User A
    expect(screen.getByLabelText("Poster project title")).toBeInTheDocument();

    // Account switches to User B
    await act(async () => {
      rerender(<PosterEditorPage currentUser={mockUserB} initialView="editor" />);
    });

    // View is automatically reset to gallery
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "My Posters", level: 1 })).toBeInTheDocument();
    });

    // Object URLs from previous session were revoked
    expect(revokeSpy).toHaveBeenCalled();
  });

  // 7. Pending saves and timers cannot write into another user's database
  it("7. prevents pending saves and timers from writing into another user's database", async () => {
    vi.useFakeTimers();

    const { rerender } = render(<PosterEditorPage currentUser={mockUserA} initialView="editor" />);

    // User A makes a dirty change (schedules 1500ms auto-save timer)
    const titleInput = screen.getByLabelText("Poster project title");
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: "User A Dirty Draft" } });
    });

    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    // Advance 500ms (timer has not fired yet)
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // User A logs out and User B logs in before the 1500ms elapses
    await act(async () => {
      rerender(<PosterEditorPage currentUser={mockUserB} initialView="editor" />);
    });

    // Now advance past 1500ms
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // User B's database must remain clean and NOT contain User A's draft!
    const userBDbName = getPosterDbName(mockUserB.id);
    const userBStore = mockIDB.databases.get(userBDbName)?.get(STORE_DESIGNS);
    expect(userBStore ? userBStore.size : 0).toBe(0);

    vi.useRealTimers();
  });

  // 8. Legacy global database records are not imported or displayed
  it("8. does not import, display, or migrate legacy global database records", async () => {
    // Populate legacy global database `grovastra_poster_studio` with old records
    const legacyDbStores = new Map<string, Map<string, any>>([
      [
        STORE_DESIGNS,
        new Map<string, any>([
          [
            "des_legacy_999",
            {
              id: "des_legacy_999",
              name: "Old Legacy Global Poster",
              presetId: "whatsapp-post",
              width: 1080,
              height: 1080,
              canvasJson: "{}",
              createdAt: 1000,
              updatedAt: 1000,
            },
          ],
        ]),
      ],
      [STORE_ASSETS, new Map<string, any>()],
    ]);
    mockIDB.databases.set(LEGACY_POSTER_DB_NAME, legacyDbStores);

    // User A opens Poster Studio
    render(<PosterEditorPage currentUser={mockUserA} />);

    await waitFor(() => {
      expect(screen.getByText("No Saved Posters Yet")).toBeInTheDocument();
    });

    // Legacy record is NOT displayed
    expect(screen.queryByText("Old Legacy Global Poster")).not.toBeInTheDocument();

    // User A's storage list has 0 designs
    posterStorageService.setUserId(mockUserA.id);
    const userADesigns = await posterStorageService.listDesigns();
    expect(userADesigns.length).toBe(0);

    // The legacy database record remains untouched and unmodified
    expect(mockIDB.databases.get(LEGACY_POSTER_DB_NAME)?.get(STORE_DESIGNS)?.size).toBe(1);
  });

  // 9. Scoped Auto Save preferences are isolated per authenticated user
  it("9. scopes Auto Save preference per authenticated user", () => {
    // User A sets Auto Save to false
    localStorage.setItem(getAutoSaveStorageKey(mockUserA.id), "false");

    expect(getAutoSavePreference(mockUserA.id)).toBe(false);

    // User B has not configured Auto Save -> defaults to true
    expect(getAutoSavePreference(mockUserB.id)).toBe(true);

    // User B explicitly sets Auto Save to true
    localStorage.setItem(getAutoSaveStorageKey(mockUserB.id), "true");

    expect(getAutoSavePreference(mockUserA.id)).toBe(false);
    expect(getAutoSavePreference(mockUserB.id)).toBe(true);
  });
});
