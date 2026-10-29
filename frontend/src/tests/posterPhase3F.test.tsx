import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PosterToolbar } from "../components/poster/PosterToolbar.js";
import { PosterGalleryView } from "../components/poster/PosterGalleryView.js";
import { CampaignPosterPickerModal } from "../components/poster/CampaignPosterPickerModal.js";
import { CampaignWizard } from "../components/CampaignWizard.js";
import { TemplateStudioAuthoring } from "../components/TemplateStudioAuthoring.js";
import { TemplateList } from "../components/TemplateList.js";
import { TemplateEditor } from "../components/TemplateEditor.js";
import { POSTER_PRESETS, findPreset } from "../types/poster.js";
import { posterStorageService } from "../services/posterStorageService.js";
import { WhatsAppTemplate } from "../types/template.js";
import { apiClient } from "../services/api.js";

vi.mock("../context/AuthContext.js", () => ({
  useAuth: () => ({
    user: { id: "usr_phase3f_alice", email: "alice@example.com", name: "Alice", role: "admin" },
  }),
}));

// Mock API client
vi.mock("../services/api.js", () => {
  return {
    apiClient: {
      getSchedulerStatus: vi.fn().mockResolvedValue({ success: true, data: { isRunning: true } }),
      listCampaigns: vi.fn().mockResolvedValue({
        success: true,
        data: { items: [], metrics: {}, pagination: { page: 1, limit: 10, total: 0 } },
      }),
      listAudiences: vi.fn().mockResolvedValue({
        status: "success",
        data: [{ id: "aud_1", name: "VIP Club", memberCount: 20, eligibleMemberCount: 20 }],
      }),
      listTemplates: vi.fn().mockResolvedValue({
        status: "success",
        data: {
          templates: [
            {
              id: "tpl_img_1",
              name: "jaspers_market_order_confirmation_v1",
              language: "en_US",
              category: "MARKETING",
              status: "APPROVED",
              isSendable: true,
              header: { type: "IMAGE", format: "IMAGE" },
              body: "Order confirmation with image header",
              variables: [],
              buttons: [],
            },
            {
              id: "tpl_txt_1",
              name: "jaspers_market_plain_text_v1",
              language: "en_US",
              category: "MARKETING",
              status: "APPROVED",
              isSendable: true,
              header: { type: "NONE" },
              body: "Plain text order confirmation",
              variables: [],
              buttons: [],
            },
          ],
        },
      }),
      syncTemplates: vi.fn().mockResolvedValue({
        status: "success",
        data: {
          templates: [
            {
              id: "tpl_img_1",
              name: "jaspers_market_order_confirmation_v1",
              language: "en_US",
              category: "MARKETING",
              status: "APPROVED",
              isSendable: true,
              header: { type: "IMAGE", format: "IMAGE" },
              body: "Order confirmation with image header",
              variables: [],
              buttons: [],
            },
          ],
        },
      }),
      validateTemplateParameters: vi.fn().mockResolvedValue({ success: true, data: { isValid: true } }),
      createCampaign: vi.fn().mockResolvedValue({ success: true, data: { id: "cmp_new" } }),
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

  return {
    databases,
    clearAll: () => databases.clear(),
    open: vi.fn((dbName: string, version: number) => {
      const dbStores = getOrCreateDB(dbName);
      const openReq: any = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      setTimeout(() => {
        const fakeDB: any = {
          name: dbName,
          version,
          objectStoreNames: { contains: (name: string) => dbStores.has(name) },
          createObjectStore: (name: string) => {
            if (!dbStores.has(name)) dbStores.set(name, new Map());
            return { createIndex: vi.fn() };
          },
          transaction: (storeNames: string[]) => {
            const txStore = dbStores.get(storeNames[0])!;
            return {
              objectStore: (name: string) => {
                const targetStore = dbStores.get(name) || txStore;
                return {
                  put: (item: any) => {
                    const req: any = { result: item.id, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      targetStore.set(item.id, JSON.parse(JSON.stringify(item)));
                      req.onsuccess?.();
                    }, 0);
                    return req;
                  },
                  get: (id: string) => {
                    const req: any = { result: null, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      const item = targetStore.get(id);
                      req.result = item ? JSON.parse(JSON.stringify(item)) : undefined;
                      req.onsuccess?.();
                    }, 0);
                    return req;
                  },
                  delete: (id: string) => {
                    const req: any = { result: undefined, onsuccess: null, onerror: null };
                    setTimeout(() => {
                      targetStore.delete(id);
                      req.onsuccess?.();
                    }, 0);
                    return req;
                  },
                  index: () => ({
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
                  }),
                };
              },
            };
          },
          close: vi.fn(),
        };
        openReq.result = fakeDB;
        openReq.onsuccess?.();
      }, 0);
      return openReq;
    }),
  };
}

describe("Phase 3F: Poster Compatibility, Admin Template Featured Visibility & Export Removal", () => {
  const userA = "usr_phase3f_alice";
  const userB = "usr_phase3f_bob";
  let mockIDB: any;

  beforeEach(async () => {
    localStorage.clear();
    mockIDB = createMultiDatabaseMock();
    (globalThis as any).indexedDB = mockIDB;

    posterStorageService.closeDB();
    posterStorageService.setUserId(userA);

    // Seed User A's designs: 1 compatible 1080x1080 and 1 older vertical 1080x1920
    await posterStorageService.saveDesign({
      id: "alice_square_1",
      name: "Alice Compatible 1080x1080 Square",
      presetId: "whatsapp-post",
      width: 1080,
      height: 1080,
      canvasJson: JSON.stringify({ objects: [] }),
      thumbnailDataUrl: "data:image/png;base64,squareThumb",
    });

    await posterStorageService.saveDesign({
      id: "alice_status_1",
      name: "Alice Legacy 1080x1920 Status",
      presetId: "whatsapp-status",
      width: 1080,
      height: 1920,
      canvasJson: JSON.stringify({ objects: [] }),
      thumbnailDataUrl: "data:image/png;base64,statusThumb",
    });

    // Seed User B's design to verify strict user isolation
    posterStorageService.setUserId(userB);
    await posterStorageService.saveDesign({
      id: "bob_private_1",
      name: "Bob Confidential Campaign Creative",
      presetId: "whatsapp-post",
      width: 1080,
      height: 1080,
      canvasJson: JSON.stringify({ objects: [] }),
      thumbnailDataUrl: "data:image/png;base64,bobThumb",
    });

    posterStorageService.setUserId(userA);
  });

  afterEach(() => {
    posterStorageService.closeDB();
    localStorage.clear();
  });

  describe("1. Fixed Campaign Poster Format & Presets", () => {
    it("offers exactly one fixed campaign format: 1080x1080 Square in POSTER_PRESETS", () => {
      expect(POSTER_PRESETS).toHaveLength(1);
      const [campaignPreset] = POSTER_PRESETS;
      expect(campaignPreset.id).toBe("whatsapp-post");
      expect(campaignPreset.width).toBe(1080);
      expect(campaignPreset.height).toBe(1080);
      expect(campaignPreset.ratioLabel).toBe("1:1");
    });

    it("preserves legacy 1080x1920 status designs in findPreset without cropping or converting", () => {
      const legacyStatus = findPreset(1080, 1920);
      expect(legacyStatus).toBeDefined();
      expect(legacyStatus?.id).toBe("whatsapp-status");
      expect(legacyStatus?.width).toBe(1080);
      expect(legacyStatus?.height).toBe(1920);
      expect(legacyStatus?.ratioLabel).toBe("9:16");
    });

    it("gallery offers single primary Create New Poster button and no WhatsApp Status dropdown", () => {
      render(
        <PosterGalleryView
          userId={userA}
          onOpenDesign={vi.fn()}
          onNewPoster={vi.fn()}
        />
      );

      // Verify no split dropdown exists
      expect(screen.queryByRole("button", { name: "Select format for new poster" })).toBeNull();
      // Primary button exists
      expect(screen.getAllByRole("button", { name: "Create New Poster" })[0]).toBeDefined();
    });
  });

  describe("2. Export/Download Controls Removed", () => {
    it("completely omits Export and Download controls from PosterToolbar", () => {
      render(
        <PosterToolbar
          title="Campaign Creative"
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
        />
      );

      expect(screen.queryByRole("button", { name: /Export/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /Download/i })).toBeNull();
      expect(screen.queryByText(/Export as PNG/i)).toBeNull();
      expect(screen.queryByText(/Export as JPEG/i)).toBeNull();
      expect(screen.queryByText(/Convert to Other Size/i)).toBeNull();
    });
  });

  describe("3. Campaign Poster Picker Compatibility & Isolation", () => {
    it("marks 1080x1080 as compatible and 1080x1920 as incompatible with clear status banner", async () => {
      render(
        <CampaignPosterPickerModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectPoster={vi.fn()}
          userId={userA}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Alice Compatible 1080x1080 Square")).toBeDefined();
        expect(screen.getByText("Alice Legacy 1080x1920 Status")).toBeDefined();
      });

      // Status pill check
      expect(screen.getByText("Compatible (1080×1080)")).toBeDefined();
      expect(screen.getByText("Incompatible (Status)")).toBeDefined();
      expect(screen.getByText("Requires 1080×1080 Square")).toBeDefined();

      // Clicking incompatible 1080x1920 vertical design shows compatibility warning and disables confirm
      const incompatibleCard = screen.getByText("Alice Legacy 1080x1920 Status");
      fireEvent.click(incompatibleCard);

      const confirmBtn = screen.getByRole("button", { name: "Use Selected Poster" });
      expect(confirmBtn).toBeDisabled();
      expect(screen.getByText("Requires 1080×1080 Square")).toBeDefined();

      // Original design is NOT deleted or converted
      const allDesigns = await posterStorageService.listDesigns();
      expect(allDesigns.find((d) => d.id === "alice_status_1")).toBeDefined();
    });

    it("strictly isolates User A from User B's saved designs", async () => {
      render(
        <CampaignPosterPickerModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectPoster={vi.fn()}
          userId={userA}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Alice Compatible 1080x1080 Square")).toBeDefined();
      });

      expect(screen.queryByText("Bob Confidential Campaign Creative")).toBeNull();
    });
  });

  describe("4. Admin Template Create/Edit — Upload Image + Posters", () => {
    it("offers Upload Image and Choose from Posters only when header is IMAGE", () => {
      render(<TemplateStudioAuthoring onBack={vi.fn()} />);

      // Default header type is NONE, so neither button should be visible
      expect(screen.queryByTestId("choose-from-posters-btn")).toBeNull();

      // Switch header to IMAGE via header format button
      const imageFormatBtn = screen.getByRole("button", { name: "IMAGE" });
      fireEvent.click(imageFormatBtn);

      // Both buttons are now visible
      expect(screen.getByTestId("choose-from-posters-btn")).toBeInTheDocument();
      expect(screen.getByText("Choose from Posters")).toBeInTheDocument();
      expect(screen.getByText(/Selected image or poster is saved with your template draft/i)).toBeInTheDocument();

      // Switch header to TEXT -> image options disappear
      const textFormatBtn = screen.getByRole("button", { name: "TEXT" });
      fireEvent.click(textFormatBtn);
      expect(screen.queryByTestId("choose-from-posters-btn")).toBeNull();
    });
  });

  describe("5. Campaign Creation — Conditional Visibility & Detach on Switch", () => {
    it("shows Posters button when selected template supports IMAGE header", async () => {
      render(
        <CampaignWizard
          userId={userA}
          onSave={vi.fn()}
          onCancel={vi.fn()}
          isSaving={false}
        />
      );

      await waitFor(() => {
        // Preferred template jaspers_market_order_confirmation_v1 has IMAGE header
        expect(screen.getByText("Campaign Media (WhatsApp Header)")).toBeDefined();
        expect(screen.getByRole("button", { name: "Posters" })).toBeDefined();
        expect(screen.getByRole("button", { name: "Upload Image" })).toBeDefined();
      });
    });

    it("displays disabled banner when template does not support IMAGE header", async () => {
      // Mock returning only text template
      vi.mocked(apiClient.listTemplates).mockResolvedValueOnce({
        status: "success",
        data: {
          templates: [
            {
              id: "tpl_txt_only",
              name: "jaspers_market_plain_text_v1",
              language: "en_US",
              category: "MARKETING",
              status: "APPROVED",
              isSendable: true,
              header: { type: "NONE" },
              body: "Plain text only",
              variables: [],
              buttons: [],
            },
          ],
        },
      } as any);

      render(
        <CampaignWizard
          userId={userA}
          onSave={vi.fn()}
          onCancel={vi.fn()}
          isSaving={false}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("campaign-media-disabled-banner")).toBeDefined();
        expect(screen.getByText(/does not support image headers/i)).toBeDefined();
      });

      // Posters button is NOT rendered
      expect(screen.queryByRole("button", { name: "Posters" })).toBeNull();
    });
  });

  describe("6. Featured Templates Visibility & Send Eligibility", () => {
    const mockTemplates: WhatsAppTemplate[] = [
      {
        id: "draft_saved_1",
        name: "spring_sale_featured_draft",
        language: "en_US",
        category: "MARKETING",
        status: "LOCAL_DRAFT",
        isLocalDraft: true,
        isSendable: false,
        header: { type: "IMAGE" },
        body: "Special featured sale preview",
        variables: [],
        buttons: [],
        lastUpdated: new Date().toISOString(),
      },
      {
        id: "meta_approved_1",
        name: "jaspers_market_order_confirmation_v1",
        language: "en_US",
        category: "MARKETING",
        status: "APPROVED",
        isSendable: true,
        header: { type: "IMAGE" },
        body: "Your order is confirmed",
        variables: [],
        buttons: [],
        lastUpdated: new Date().toISOString(),
      },
    ];

    it("displays Featured · Pending Meta Approval badge on saved local drafts in TemplateList", () => {
      render(
        <TemplateList
          templates={mockTemplates}
          isLoading={false}
          onSync={vi.fn()}
          onSelectTemplate={vi.fn()}
        />
      );

      expect(screen.getByText("Featured · Pending Meta Approval")).toBeInTheDocument();
      expect(screen.getAllByText("Non-Sendable").length).toBeGreaterThan(0);
      expect(screen.getByText("Featured Templates (Admin Saved)")).toBeInTheDocument();
    });

    it("renders informative Featured banner in TemplateEditor for saved local drafts", () => {
      render(
        <TemplateEditor
          template={mockTemplates[0]}
          onChange={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByTestId("local-featured-banner")).toBeInTheDocument();
      expect(screen.getByText("Featured Template · Pending Meta Approval")).toBeInTheDocument();
      expect(screen.getByText("Featured (Admin Saved)")).toBeInTheDocument();
      expect(screen.getByText(/This template was created and saved by an Admin as a Grovastra Featured Template/i)).toBeInTheDocument();
    });

    it("renders Meta-approved locked banner for approved templates in TemplateEditor", () => {
      render(
        <TemplateEditor
          template={mockTemplates[1]}
          onChange={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.queryByTestId("local-featured-banner")).toBeNull();
      expect(screen.getByText("Meta-approved template · Editing unavailable")).toBeInTheDocument();
    });
  });
});
