import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CampaignWizard } from "../components/CampaignWizard.js";
import { CampaignPosterPickerModal } from "../components/poster/CampaignPosterPickerModal.js";
import { posterStorageService } from "../services/posterStorageService.js";
import { PosterCampaignAttachment } from "../types/poster.js";
import { apiClient } from "../services/api.js";

// Mock API Client
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
      listAudiences: vi.fn().mockResolvedValue({
        status: "success",
        data: [{ id: "aud_1", name: "VIP Club", memberCount: 50, eligibleMemberCount: 50 }],
      }),
      listTemplates: vi.fn().mockResolvedValue({
        status: "success",
        data: {
          templates: [
            {
              id: "tpl_plain_1",
              name: "jaspers_market_plain_text_v1",
              language: "en_US",
              category: "MARKETING",
              status: "APPROVED",
              isSendable: true,
              header: { type: "IMAGE" },
              body: "Welcome to Jaspers Market!",
              variables: [],
              buttons: [],
            },
          ],
          totalCount: 1,
          approvedCount: 1,
          source: "SHARED_PLATFORM_WABA",
        },
      }),
      validateTemplateParameters: vi.fn().mockResolvedValue({ success: true, data: { isValid: true } }),
      createCampaign: vi.fn().mockResolvedValue({ success: true, data: { id: "cmp_new", name: "Test" } }),
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
    open: vi.fn((dbName: string) => {
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
          objectStoreNames: {
            contains: (name: string) => dbStores.has(name),
          },
          transaction: (storeNames: string | string[], _mode: "readonly" | "readwrite") => {
            const primaryStoreName = Array.isArray(storeNames) ? storeNames[0] : storeNames;
            const targetStore = dbStores.get(primaryStoreName) || new Map<string, any>();

            return {
              objectStore: (_name: string) => {
                return {
                  get: (key: string) => {
                    const req: any = { result: targetStore.get(key) || null, onsuccess: null, onerror: null };
                    setTimeout(() => req.onsuccess?.(), 0);
                    return req;
                  },
                  put: (value: any, key?: string) => {
                    const putKey = key || value.id;
                    targetStore.set(putKey, JSON.parse(JSON.stringify(value)));
                    const req: any = { result: putKey, onsuccess: null, onerror: null };
                    setTimeout(() => req.onsuccess?.(), 0);
                    return req;
                  },
                  delete: (key: string) => {
                    targetStore.delete(key);
                    const req: any = { result: undefined, onsuccess: null, onerror: null };
                    setTimeout(() => req.onsuccess?.(), 0);
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

describe("Campaign Media Picker — Phase 3E Comprehensive Tests", () => {
  const userA = "usr_alice_marketing";
  const userB = "usr_bob_competitor";
  let mockIDB: ReturnType<typeof createMultiDatabaseMock>;

  beforeEach(async () => {
    localStorage.clear();
    mockIDB = createMultiDatabaseMock();
    (globalThis as any).indexedDB = mockIDB;
    posterStorageService.closeDB();

    // Seed User A's isolated database with 2 designs: 1 Square, 1 Status
    posterStorageService.setUserId(userA);
    await posterStorageService.saveDesign({
      id: "des_square_1",
      name: "Alice Square Diwali Flyer",
      presetId: "whatsapp-post",
      width: 1080,
      height: 1080,
      canvasJson: JSON.stringify({ objects: [] }),
      thumbnailDataUrl: "data:image/jpeg;base64,aliceSquareThumbData",
    });

    await posterStorageService.saveDesign({
      id: "des_status_2",
      name: "Alice Vertical Story Promo",
      presetId: "whatsapp-status",
      width: 1080,
      height: 1920,
      canvasJson: JSON.stringify({ objects: [] }),
      thumbnailDataUrl: "data:image/jpeg;base64,aliceStatusThumbData",
    });

    // Seed User B's isolated database with Bob's private design
    posterStorageService.setUserId(userB);
    await posterStorageService.saveDesign({
      id: "des_bob_confidential",
      name: "Bob Secret Strategy Poster",
      presetId: "whatsapp-post",
      width: 1080,
      height: 1080,
      canvasJson: JSON.stringify({ objects: [] }),
      thumbnailDataUrl: "data:image/jpeg;base64,bobThumbData",
    });

    // Reset back to User A
    posterStorageService.setUserId(userA);

    vi.mocked(apiClient.listAudiences).mockResolvedValue({
      status: "success",
      data: [{ id: "aud_1", name: "VIP Club", memberCount: 50, eligibleMemberCount: 50 }],
    } as any);

    vi.mocked(apiClient.listTemplates).mockResolvedValue({
      status: "success",
      data: {
        templates: [
          {
            id: "tpl_image_1",
            name: "jaspers_market_order_confirmation_v1",
            language: "en_US",
            category: "MARKETING",
            status: "APPROVED",
            isSendable: true,
            header: {
              type: "IMAGE",
              format: "IMAGE",
            },
            body: "Welcome to Jaspers Market!",
            variables: [],
            buttons: [],
          },
        ],
        totalCount: 1,
        approvedCount: 1,
        source: "SHARED_PLATFORM_WABA",
      },
    } as any);
  });

  afterEach(() => {
    posterStorageService.closeDB();
    localStorage.clear();
  });

  it("1. Campaign media section displays clearly visible Upload Image and Posters options", async () => {
    render(
      <CampaignWizard
        userId={userA}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        isSaving={false}
      />
    );

    // Two buttons present once template loads
    const uploadBtn = await screen.findByRole("button", { name: "Upload Image" });
    const postersBtn = await screen.findByRole("button", { name: "Posters" });

    // Section title
    expect(screen.getByText("Campaign Media (WhatsApp Header)")).toBeDefined();
    expect(uploadBtn).toBeDefined();
    expect(postersBtn).toBeDefined();
  });

  it("2. Posters picker lists only the current user's saved designs (strict tenant isolation)", async () => {
    render(
      <CampaignPosterPickerModal
        isOpen={true}
        onClose={vi.fn()}
        onSelectPoster={vi.fn()}
        userId={userA}
      />
    );

    await waitFor(() => {
      // User A's posters must be visible
      expect(screen.getByText("Alice Square Diwali Flyer")).toBeDefined();
      expect(screen.getByText("Alice Vertical Story Promo")).toBeDefined();
    });

    // User B's confidential poster must NEVER appear
    expect(screen.queryByText("Bob Secret Strategy Poster")).toBeNull();
  });

  it("3. Square (1080x1080) is selectable, while vertical Status (1080x1920) displays compatibility status and is blocked", async () => {
    const handleSelect = vi.fn();

    render(
      <CampaignPosterPickerModal
        isOpen={true}
        onClose={vi.fn()}
        onSelectPoster={handleSelect}
        userId={userA}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Alice Vertical Story Promo")).toBeDefined();
      expect(screen.getByText("Alice Square Diwali Flyer")).toBeDefined();
    });

    // Incompatible badge is displayed on the 1080x1920 poster
    expect(screen.getAllByText(/Incompatible/i).length).toBeGreaterThan(0);

    // Clicking vertical Status poster does NOT enable the confirm button
    const statusCard = screen.getByText("Alice Vertical Story Promo");
    fireEvent.click(statusCard);

    const confirmBtn = screen.getByRole("button", { name: "Use Selected Poster" });
    expect(confirmBtn).toBeDisabled();

    // Clicking compatible Square poster enables the confirm button
    const squareCard = screen.getByText("Alice Square Diwali Flyer");
    fireEvent.click(squareCard);
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);

    expect(handleSelect).toHaveBeenCalledTimes(1);
    const selectedAttachment = handleSelect.mock.calls[0][0] as PosterCampaignAttachment;
    expect(selectedAttachment.title).toBe("Alice Square Diwali Flyer");
    expect(selectedAttachment.width).toBe(1080);
    expect(selectedAttachment.height).toBe(1080);
    expect(selectedAttachment.presetId).toBe("whatsapp-post");
  });

  it("4. Selected poster appears in campaign draft media card and updates phone live preview", async () => {
    render(
      <CampaignWizard
        userId={userA}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        isSaving={false}
      />
    );

    // Open picker
    const postersBtn = await screen.findByRole("button", { name: "Posters" });
    fireEvent.click(postersBtn);

    // Modal opens
    await waitFor(() => {
      expect(screen.getByText("Select from Saved Posters")).toBeDefined();
      expect(screen.getByText("Alice Square Diwali Flyer")).toBeDefined();
    });

    // Select Square poster
    const squareCard = screen.getByText("Alice Square Diwali Flyer");
    fireEvent.click(squareCard);

    const usePosterBtn = screen.getByRole("button", { name: "Use Selected Poster" });
    fireEvent.click(usePosterBtn);

    // Attached media card is now rendered in draft
    await waitFor(() => {
      expect(screen.getByTestId("attached-media-card")).toBeDefined();
      expect(screen.getByText("Alice Square Diwali Flyer")).toBeDefined();
      expect(screen.getByText(/1080 × 1080 px/i)).toBeDefined();
      expect(screen.getByText("Poster Studio")).toBeDefined();
    });

    // WhatsApp phone preview image is updated with dataUrl
    const previewImg = screen.getAllByRole("img").find((img) =>
      img.getAttribute("src")?.includes("aliceSquareThumbData")
    );
    expect(previewImg).toBeDefined();
  });

  it("5. Replacing and removing the selected poster works cleanly", async () => {
    // Seed another square poster for replacement
    await posterStorageService.saveDesign({
      name: "Alice Square Spring Flyer",
      presetId: "whatsapp-post",
      width: 1080,
      height: 1080,
      canvasJson: JSON.stringify({ objects: [] }),
      thumbnailDataUrl: "data:image/png;base64,aliceSpringThumb",
    });

    render(
      <CampaignWizard
        userId={userA}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        isSaving={false}
      />
    );

    // Open and select first poster
    const postersBtn = await screen.findByRole("button", { name: "Posters" });
    fireEvent.click(postersBtn);
    await waitFor(() => screen.getByText("Alice Square Diwali Flyer"));
    fireEvent.click(screen.getByText("Alice Square Diwali Flyer"));
    fireEvent.click(screen.getByRole("button", { name: "Use Selected Poster" }));

    await waitFor(() => {
      expect(screen.getByText("Alice Square Diwali Flyer")).toBeDefined();
    });

    // Click Replace -> opens picker again
    const replaceBtn = screen.getByRole("button", { name: "Replace Poster" });
    fireEvent.click(replaceBtn);

    await waitFor(() => {
      expect(screen.getByText("Select from Saved Posters")).toBeDefined();
    });

    // Choose the second Square poster
    const secondPoster = await screen.findByText("Alice Square Spring Flyer");
    fireEvent.click(secondPoster);
    fireEvent.click(screen.getByRole("button", { name: "Use Selected Poster" }));

    await waitFor(() => {
      expect(screen.getByText("Alice Square Spring Flyer")).toBeDefined();
      expect(screen.queryByText("Alice Square Diwali Flyer")).toBeNull();
    });

    // Click Remove -> clears attachment
    const removeBtn = screen.getByRole("button", { name: "Remove media" });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.queryByTestId("attached-media-card")).toBeNull();
      expect(screen.getByRole("button", { name: "Posters" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Upload Image" })).toBeDefined();
    });
  });

  it("6. Cancelling the picker preserves the existing campaign draft without modifying fields", async () => {
    render(
      <CampaignWizard
        userId={userA}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        isSaving={false}
      />
    );

    // Enter campaign name
    const nameInput = screen.getByPlaceholderText(/Diwali Mega Flash Sale 2026/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Untouched Campaign Title" } });

    // Open picker and close without selecting
    const postersBtn = await screen.findByRole("button", { name: "Posters" });
    fireEvent.click(postersBtn);

    await waitFor(() => {
      expect(screen.getByText("Select from Saved Posters")).toBeDefined();
    });

    const cancelBtn = screen.getByTestId("poster-picker-cancel-btn");
    fireEvent.click(cancelBtn);

    // Picker closes
    await waitFor(() => {
      expect(screen.queryByText("Select from Saved Posters")).toBeNull();
    });

    // Campaign name is completely preserved
    expect(nameInput.value).toBe("Untouched Campaign Title");
    expect(screen.queryByTestId("attached-media-card")).toBeNull();
  });

  it("7. Empty poster gallery state displays helpful guidance and close action", async () => {
    // Clear User A's database
    posterStorageService.closeDB();
    mockIDB.clearAll();

    render(
      <CampaignPosterPickerModal
        isOpen={true}
        onClose={vi.fn()}
        onSelectPoster={vi.fn()}
        userId="usr_empty_brand"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("No Saved Posters Found")).toBeDefined();
      expect(screen.getByText(/You haven't created any posters in Poster Studio yet/i)).toBeDefined();
      expect(screen.getByRole("button", { name: "Close & Return" })).toBeDefined();
    });
  });

  it("8. Existing Upload Image workflow remains functional alongside Posters", async () => {
    render(
      <CampaignWizard
        userId={userA}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        isSaving={false}
      />
    );

    const fileInput = await screen.findByTestId("campaign-image-file-input") as HTMLInputElement;

    // Simulate selecting a local image file
    const fakeFile = new File(["dummy_image_data"], "summer_sale_banner.png", { type: "image/png" });

    // Mock FileReader
    class MockFileReader {
      onload: ((event: any) => void) | null = null;
      readAsDataURL(_blob: Blob) {
        setTimeout(() => {
          this.onload?.({ target: { result: "data:image/png;base64,mockLocalImageBase64" } });
        }, 0);
      }
    }
    vi.stubGlobal("FileReader", MockFileReader);

    // Mock natural image dimensions
    class MockImage {
      naturalWidth = 1200;
      naturalHeight = 628;
      onload: (() => void) | null = null;
      set src(_val: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    vi.stubGlobal("Image", MockImage);

    Object.defineProperty(fileInput, "files", {
      value: [fakeFile],
      configurable: true,
    });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(screen.getByTestId("attached-media-card")).toBeDefined();
      expect(screen.getByText("summer_sale_banner")).toBeDefined();
      expect(screen.getByText("Uploaded Image")).toBeDefined();
    });

    vi.unstubAllGlobals();
  });

  it("9. Selecting a poster alone does not create, save, or send a campaign", async () => {
    const handleSave = vi.fn();
    const handleLaunch = vi.fn();

    render(
      <CampaignWizard
        userId={userA}
        onSave={handleSave}
        onLaunch={handleLaunch}
        onCancel={vi.fn()}
        isSaving={false}
      />
    );

    // Select a poster
    const postersBtn = await screen.findByRole("button", { name: "Posters" });
    fireEvent.click(postersBtn);
    await waitFor(() => screen.getByText("Alice Square Diwali Flyer"));
    fireEvent.click(screen.getByText("Alice Square Diwali Flyer"));
    fireEvent.click(screen.getByRole("button", { name: "Use Selected Poster" }));

    await waitFor(() => {
      expect(screen.getByText("Alice Square Diwali Flyer")).toBeDefined();
    });

    // Neither save nor launch API must have been triggered
    expect(handleSave).not.toHaveBeenCalled();
    expect(handleLaunch).not.toHaveBeenCalled();
  });

  it("10. Backend verification: validates that campaign draft submission payload contains no media payload (media is preview-only)", async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);

    render(
      <CampaignWizard
        userId={userA}
        onSave={handleSave}
        onCancel={vi.fn()}
        isSaving={false}
      />
    );

    // Attach a poster
    const postersBtn = await screen.findByRole("button", { name: "Posters" });
    fireEvent.click(postersBtn);
    await waitFor(() => screen.getByText("Alice Square Diwali Flyer"));
    fireEvent.click(screen.getByText("Alice Square Diwali Flyer"));
    fireEvent.click(screen.getByRole("button", { name: "Use Selected Poster" }));

    await waitFor(() => {
      expect(screen.getByText("Alice Square Diwali Flyer")).toBeDefined();
    });

    // Advance to Step 5 and click Save Draft
    fireEvent.change(screen.getByPlaceholderText(/Diwali Mega Flash Sale 2026/i), {
      target: { value: "Preview Only Test Campaign" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // to 2

    await screen.findByText("Step 2: Select Message Template");
    await screen.findByText(/Jasper's Market/i);
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // to 3

    await screen.findByText("Step 3: Select Target Audience");
    await screen.findByText("VIP Club");
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // to 4

    await screen.findByText("Step 4: Configure Message Variables");
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // to 5

    await screen.findByText("Step 5: Review Campaign Details");

    const saveDraftBtn = screen.getByRole("button", { name: /Save as Draft/i });
    fireEvent.click(saveDraftBtn);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledTimes(1);
    });

    const payload = handleSave.mock.calls[0][0] as any;
    // Verified: payload strictly matches CreateCampaignPayload schema: no mediaUrl, no headerMediaUrl, no mediaId
    expect(payload.mediaUrl).toBeUndefined();
    expect(payload.headerMediaUrl).toBeUndefined();
    expect(payload.mediaId).toBeUndefined();
    expect(payload.attachment).toBeUndefined();
    expect(payload.name).toBe("Preview Only Test Campaign");
  });
});
