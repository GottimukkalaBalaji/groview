import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CsvImportWizardModal } from "../components/CsvImportWizardModal";
import { apiClient } from "../services/api.js";

vi.mock("../services/api.js", () => {
  return {
    apiClient: {
      previewCsv: vi.fn(),
      importCsv: vi.fn(),
    },
  };
});

describe("CsvImportWizardModal - Consent Mapping", () => {
  const mockOnClose = vi.fn();
  const mockOnImportComplete = vi.fn();
  const mockLists = [
    {
      id: "lst_1",
      name: "VIP List",
      description: "VIP List Description",
      memberCount: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Step 1 and sample CSV download with consent header", () => {
    render(
      <CsvImportWizardModal
        isOpen={true}
        onClose={mockOnClose}
        onImportComplete={mockOnImportComplete}
        existingLists={mockLists}
      />
    );

    expect(screen.getByText(/Import Contacts CSV/i)).toBeDefined();
    expect(screen.getByText(/Download Sample CSV Template/i)).toBeDefined();
  });

  it("advances to Step 2 with auto-detected consent column and includes it in import payload", async () => {
    (apiClient.previewCsv as any).mockResolvedValue({
      data: {
        headers: ["phone", "name", "email", "consent"],
        totalEstimatedRows: 1,
        previewRows: [{ phone: "+919876543210", name: "Diya Reddy", email: "diya@example.com", consent: "OPTED_IN" }],
        suggestedMappings: {
          phoneNumber: "phone",
          firstName: "name",
          email: "email",
          consentStatus: "consent",
        },
      },
    });

    (apiClient.importCsv as any).mockResolvedValue({
      data: {
        id: "job_123",
        status: "COMPLETED",
        totalRows: 1,
        createdContacts: 1,
        updatedContacts: 0,
        skippedDuplicates: 0,
        skippedSuppressed: 0,
        invalidRows: 0,
        rowErrors: [],
      },
    });

    render(
      <CsvImportWizardModal
        isOpen={true}
        onClose={mockOnClose}
        onImportComplete={mockOnImportComplete}
        existingLists={mockLists}
      />
    );

    // Upload a fake CSV file
    const file = new File(
      ["phone,name,email,consent\n+919876543210,Diya Reddy,diya@example.com,OPTED_IN"],
      "diya.csv",
      { type: "text/csv" }
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeDefined();

    fireEvent.change(input, { target: { files: [file] } });

    // Wait for Step 2 header mapping to render
    await waitFor(() => {
      expect(screen.getByText("Consent Status Column (Optional)")).toBeDefined();
    });

    // Check that consent column dropdown exists and is auto-selected to "consent"
    const selects = screen.getAllByRole("combobox");
    const consentSelect = selects.find((s) => (s as HTMLSelectElement).value === "consent");
    expect(consentSelect).toBeDefined();

    // Click Continue to advance to Step 3
    const continueBtn = screen.getByRole("button", { name: /Continue to Destination & Consent/i });
    fireEvent.click(continueBtn);

    // In Step 3, confirm consent checkbox and trigger import
    await waitFor(() => {
      expect(screen.getByText(/Grovastra Consent Protection Guarantee/i)).toBeDefined();
    });

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    const importBtn = screen.getByRole("button", { name: /Execute Import Now/i });
    fireEvent.click(importBtn);

    // Verify importCsv was called with consentStatus mapping
    await waitFor(() => {
      expect(apiClient.importCsv).toHaveBeenCalledWith(
        expect.objectContaining({
          mappings: expect.objectContaining({
            phoneNumber: "phone",
            firstName: "name",
            email: "email",
            consentStatus: "consent",
          }),
        })
      );
    });
  });
});
