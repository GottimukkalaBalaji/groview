import React, { useState } from "react";
import {
  X,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Download,
  ShieldCheck,
} from "lucide-react";
import { apiClient } from "../services/api.js";
import {
  ContactList,
  CsvPreviewData,
  ImportJob,
} from "../types/contact.js";

interface CsvImportWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  existingLists: ContactList[];
}

export const CsvImportWizardModal: React.FC<CsvImportWizardModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  existingLists,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: File state
  const [fileName, setFileName] = useState<string>("");
  const [csvContent, setCsvContent] = useState<string>("");
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<CsvPreviewData | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Step 2: Mappings
  const [phoneCol, setPhoneCol] = useState<string>("");
  const [firstNameCol, setFirstNameCol] = useState<string>("");
  const [lastNameCol, setLastNameCol] = useState<string>("");
  const [emailCol, setEmailCol] = useState<string>("");
  const [consentCol, setConsentCol] = useState<string>("");

  // Step 3: Destination list & consent
  const [listMode, setListMode] = useState<"EXISTING" | "NEW" | "NONE">("NEW");
  const [selectedListId, setSelectedListId] = useState<string>(
    existingLists[0]?.id || ""
  );
  const [newListName, setNewListName] = useState<string>("");
  const [defaultCountryCode, setDefaultCountryCode] = useState<string>("+91");
  const [consentConfirmed, setConsentConfirmed] = useState<boolean>(false);

  // Step 4: Import execution
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importResult, setImportResult] = useState<ImportJob | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState<boolean>(false);

  if (!isOpen) return null;

  const resetState = () => {
    setStep(1);
    setFileName("");
    setCsvContent("");
    setPreviewData(null);
    setUploadError(null);
    setPhoneCol("");
    setFirstNameCol("");
    setLastNameCol("");
    setEmailCol("");
    setConsentCol("");
    setListMode(existingLists.length > 0 ? "EXISTING" : "NEW");
    setNewListName("");
    setConsentConfirmed(false);
    setIsImporting(false);
    setImportResult(null);
    setImportError(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleDownloadSample = () => {
    const sample = `phone,first_name,last_name,email,consent,city
+919876543210,Rahul,Sharma,rahul@example.com,OPTED_IN,Mumbai
9876543211,Priya,Patel,priya@example.com,OPTED_IN,Bengaluru
+14155552671,Alex,Taylor,alex@example.com,PENDING,San Francisco
9876543212,Ananya,Iyer,,OPTED_IN,Chennai`;
    const blob = new Blob([sample], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "grovastra_sample_contacts.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const processFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setUploadError("Please upload a valid .csv file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError("File size exceeds 5MB limit. Please upload a smaller CSV.");
      return;
    }

    setFileName(file.name);
    setNewListName(file.name.replace(/\.[^/.]+$/, ""));
    setUploadError(null);
    setIsParsing(true);

    try {
      const text = await file.text();
      setCsvContent(text);

      const res = await apiClient.previewCsv(text, file.name);
      setPreviewData(res.data);

      // Apply suggested mappings
      if (res.data.suggestedMappings.phoneNumber) {
        setPhoneCol(res.data.suggestedMappings.phoneNumber);
      } else if (res.data.headers.length > 0) {
        setPhoneCol(res.data.headers[0]);
      }
      if (res.data.suggestedMappings.firstName) {
        setFirstNameCol(res.data.suggestedMappings.firstName);
      }
      if (res.data.suggestedMappings.lastName) {
        setLastNameCol(res.data.suggestedMappings.lastName);
      }
      if (res.data.suggestedMappings.email) {
        setEmailCol(res.data.suggestedMappings.email);
      }
      if (res.data.suggestedMappings.consentStatus) {
        setConsentCol(res.data.suggestedMappings.consentStatus);
      }

      setStep(2);
    } catch (err: any) {
      setUploadError(err.message || "Failed to process CSV file.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleExecuteImport = async () => {
    if (!phoneCol) {
      setImportError("Please select a valid Phone column mapping.");
      return;
    }

    if (listMode === "NEW" && !newListName.trim()) {
      setImportError("Please enter a name for the new audience list.");
      return;
    }

    setIsImporting(true);
    setImportError(null);

    const clientRequestId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const res = await apiClient.importCsv({
        csvContent,
        fileName,
        clientRequestId,
        listId: listMode === "EXISTING" ? selectedListId : undefined,
        newListName: listMode === "NEW" ? newListName.trim() : undefined,
        mappings: {
          phoneNumber: phoneCol,
          firstName: firstNameCol || undefined,
          lastName: lastNameCol || undefined,
          email: emailCol || undefined,
          consentStatus: consentCol || undefined,
        },
        defaultCountryCode,
        operatorConsentDeclaration: consentConfirmed
          ? "Confirmed operator marketing consent declaration"
          : undefined,
      });

      setImportResult(res.data);
      setStep(4);
      onImportComplete();
    } catch (err: any) {
      setImportError(err.message || "Failed to execute CSV import.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1050 }}>
      <div
        className="modal-card glass-panel"
        style={{
          maxWidth: "780px",
          width: "92%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid var(--border-subtle)",
            paddingBottom: "1rem",
            marginBottom: "1.25rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "var(--radius-md)",
                background: "rgba(16, 185, 129, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-emerald)",
              }}
            >
              <UploadCloud size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 600, color: "var(--text-primary)" }}>
                Import Contacts CSV
              </h2>
              <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                Step {step} of 4:{" "}
                {step === 1 && "Select CSV File"}
                {step === 2 && "Map Column Headers"}
                {step === 3 && "Destination List & Consent"}
                {step === 4 && "Import Summary"}
              </span>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="action-btn icon-btn"
            style={{ color: "var(--text-secondary)" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* STEP 1: Upload */}
        {step === 1 && (
          <div>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              style={{
                border: "2px dashed var(--border-card)",
                borderRadius: "var(--radius-lg)",
                padding: "2.5rem 1.5rem",
                textAlign: "center",
                background: "rgba(17, 24, 39, 0.4)",
                cursor: "pointer",
                transition: "all var(--transition-fast)",
              }}
              onClick={() => document.getElementById("csv-file-input")?.click()}
            >
              <input
                id="csv-file-input"
                type="file"
                accept=".csv"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
              <UploadCloud
                size={42}
                color="var(--accent-emerald)"
                style={{ margin: "0 auto 1rem auto", opacity: 0.9 }}
              />
              <p style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.35rem" }}>
                Click to browse or drag and drop your contacts CSV
              </p>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                Supports RFC 4180 format, phone, name, email columns (Max 5MB / 10,000 rows)
              </p>
            </div>

            {isParsing && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.75rem",
                  marginTop: "1.5rem",
                  color: "var(--accent-emerald)",
                }}
              >
                <Loader2 size={18} className="spinning" />
                <span style={{ fontSize: "0.9rem" }}>Parsing CSV structure & previewing rows...</span>
              </div>
            )}

            {uploadError && (
              <div
                style={{
                  marginTop: "1.25rem",
                  padding: "0.85rem 1rem",
                  borderRadius: "var(--radius-md)",
                  background: "rgba(244, 63, 94, 0.12)",
                  border: "1px solid rgba(244, 63, 94, 0.3)",
                  color: "var(--accent-rose)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  fontSize: "0.88rem",
                }}
              >
                <AlertCircle size={16} />
                <span>{uploadError}</span>
              </div>
            )}

            <div
              style={{
                marginTop: "1.75rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: "1rem",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <button
                type="button"
                onClick={handleDownloadSample}
                className="btn-secondary"
                style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}
              >
                <Download size={14} />
                Download Sample CSV Template
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Header Mapping */}
        {step === 2 && previewData && (
          <div>
            <div
              style={{
                background: "rgba(30, 41, 59, 0.5)",
                padding: "0.85rem 1rem",
                borderRadius: "var(--radius-md)",
                marginBottom: "1.25rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <FileText size={16} color="var(--accent-emerald)" />
                <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>
                  {fileName}
                </span>
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  ({previewData.totalEstimatedRows.toLocaleString()} rows detected)
                </span>
              </div>
              <span
                style={{
                  fontSize: "0.78rem",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "var(--radius-full)",
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "var(--accent-emerald)",
                }}
              >
                RFC 4180 Valid
              </span>
            </div>

            <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              Match your CSV columns to Grovastra contact attributes:
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    marginBottom: "0.35rem",
                    color: "var(--text-primary)",
                  }}
                >
                  Phone Number Column <span style={{ color: "var(--accent-rose)" }}>*</span>
                </label>
                <select
                  className="input-select"
                  value={phoneCol}
                  onChange={(e) => setPhoneCol(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="">-- Select Phone Column --</option>
                  {previewData.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    marginBottom: "0.35rem",
                    color: "var(--text-primary)",
                  }}
                >
                  First Name Column (Optional)
                </label>
                <select
                  className="input-select"
                  value={firstNameCol}
                  onChange={(e) => setFirstNameCol(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="">-- None / Skip --</option>
                  {previewData.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    marginBottom: "0.35rem",
                    color: "var(--text-primary)",
                  }}
                >
                  Last Name Column (Optional)
                </label>
                <select
                  className="input-select"
                  value={lastNameCol}
                  onChange={(e) => setLastNameCol(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="">-- None / Skip --</option>
                  {previewData.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    marginBottom: "0.35rem",
                    color: "var(--text-primary)",
                  }}
                >
                  Email Column (Optional)
                </label>
                <select
                  className="input-select"
                  value={emailCol}
                  onChange={(e) => setEmailCol(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="">-- None / Skip --</option>
                  {previewData.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    marginBottom: "0.35rem",
                    color: "var(--text-primary)",
                  }}
                >
                  Consent Status Column (Optional)
                </label>
                <select
                  className="input-select"
                  value={consentCol}
                  onChange={(e) => setConsentCol(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="">-- None / Skip (Defaults to PENDING) --</option>
                  {previewData.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row Preview Table */}
            <div style={{ marginBottom: "1.5rem" }}>
              <span
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  display: "block",
                  marginBottom: "0.5rem",
                }}
              >
                Sample Preview (First {previewData.previewRows.length} Rows):
              </span>
              <div
                style={{
                  overflowX: "auto",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  background: "rgba(15, 23, 42, 0.4)",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ background: "rgba(30, 41, 59, 0.7)" }}>
                      {previewData.headers.map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "0.5rem 0.75rem",
                            textAlign: "left",
                            color: h === phoneCol ? "var(--accent-emerald)" : "var(--text-secondary)",
                            fontWeight: 600,
                            borderBottom: "1px solid var(--border-subtle)",
                          }}
                        >
                          {h} {h === phoneCol && "(Phone)"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.previewRows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}
                      >
                        {previewData.headers.map((h) => (
                          <td
                            key={h}
                            style={{
                              padding: "0.5rem 0.75rem",
                              color: "var(--text-primary)",
                            }}
                          >
                            {row[h] || <span style={{ color: "var(--text-muted)" }}>—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: "1rem",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn-secondary"
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <ArrowLeft size={16} /> Back
              </button>
              <button
                type="button"
                disabled={!phoneCol}
                onClick={() => setStep(3)}
                className="btn-primary"
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                Continue to Destination & Consent <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Destination List & Consent */}
        {step === 3 && (
          <div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  marginBottom: "0.5rem",
                  color: "var(--text-primary)",
                }}
              >
                Assign to Audience List
              </label>

              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  marginBottom: "1rem",
                }}
              >
                <button
                  type="button"
                  onClick={() => setListMode("NEW")}
                  className={`btn-secondary ${listMode === "NEW" ? "active" : ""}`}
                  style={{
                    flex: 1,
                    borderColor: listMode === "NEW" ? "var(--accent-emerald)" : undefined,
                    background: listMode === "NEW" ? "rgba(16, 185, 129, 0.1)" : undefined,
                  }}
                >
                  Create New List
                </button>
                {existingLists.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setListMode("EXISTING")}
                    className={`btn-secondary ${listMode === "EXISTING" ? "active" : ""}`}
                    style={{
                      flex: 1,
                      borderColor: listMode === "EXISTING" ? "var(--accent-emerald)" : undefined,
                      background: listMode === "EXISTING" ? "rgba(16, 185, 129, 0.1)" : undefined,
                    }}
                  >
                    Add to Existing List
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setListMode("NONE")}
                  className={`btn-secondary ${listMode === "NONE" ? "active" : ""}`}
                  style={{
                    flex: 1,
                    borderColor: listMode === "NONE" ? "var(--accent-emerald)" : undefined,
                    background: listMode === "NONE" ? "rgba(16, 185, 129, 0.1)" : undefined,
                  }}
                >
                  Contacts Only (No List)
                </button>
              </div>

              {listMode === "NEW" && (
                <div>
                  <input
                    type="text"
                    className="input-text"
                    placeholder="e.g. Festival Campaign Leads"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
              )}

              {listMode === "EXISTING" && (
                <div>
                  <select
                    className="input-select"
                    value={selectedListId}
                    onChange={(e) => setSelectedListId(e.target.value)}
                    style={{ width: "100%" }}
                  >
                    {existingLists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.memberCount} contacts)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  marginBottom: "0.35rem",
                  color: "var(--text-primary)",
                }}
              >
                Default Country Code
              </label>
              <select
                className="input-select"
                value={defaultCountryCode}
                onChange={(e) => setDefaultCountryCode(e.target.value)}
                style={{ width: "100%", maxWidth: "300px" }}
              >
                <option value="+91">+91 (India)</option>
                <option value="+1">+1 (United States / Canada)</option>
                <option value="+44">+44 (United Kingdom)</option>
                <option value="+971">+971 (United Arab Emirates)</option>
                <option value="+65">+65 (Singapore)</option>
              </select>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", display: "block", marginTop: "0.25rem" }}>
                Applied to 10-digit numbers missing a leading international prefix.
              </span>
            </div>

            {/* Consent Policy & Declaration */}
            <div
              style={{
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                borderRadius: "var(--radius-md)",
                padding: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <div style={{ display: "flex", gap: "0.6rem", marginBottom: "0.5rem" }}>
                <ShieldCheck size={18} color="var(--accent-emerald)" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)" }}>
                  Grovastra Consent Protection Guarantee
                </span>
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "0.75rem" }}>
                Imported contacts default strictly to <strong>PENDING</strong> status. 
                Any contact previously opted-out or marked as suppressed in your organization will{" "}
                <strong>never be silently re-opted in</strong> by CSV imports.
              </p>

              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.6rem",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                  color: "var(--text-primary)",
                }}
              >
                <input
                  type="checkbox"
                  checked={consentConfirmed}
                  onChange={(e) => setConsentConfirmed(e.target.checked)}
                  style={{ marginTop: "0.2rem" }}
                />
                <span>
                  I confirm that I have requisite marketing opt-in evidence for these contacts, or acknowledge they will be imported with PENDING consent.
                </span>
              </label>
            </div>

            {importError && (
              <div
                style={{
                  marginBottom: "1.25rem",
                  padding: "0.85rem 1rem",
                  borderRadius: "var(--radius-md)",
                  background: "rgba(244, 63, 94, 0.12)",
                  border: "1px solid rgba(244, 63, 94, 0.3)",
                  color: "var(--accent-rose)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  fontSize: "0.88rem",
                }}
              >
                <AlertCircle size={16} />
                <span>{importError}</span>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: "1rem",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-secondary"
                disabled={isImporting}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <ArrowLeft size={16} /> Back
              </button>
              <button
                type="button"
                disabled={isImporting}
                onClick={handleExecuteImport}
                className="btn-primary"
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                {isImporting ? (
                  <>
                    <Loader2 size={16} className="spinning" />
                    Executing Import...
                  </>
                ) : (
                  <>
                    Execute Import Now <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Results & Diagnostics */}
        {step === 4 && importResult && (
          <div>
            <div
              style={{
                textAlign: "center",
                padding: "1.5rem 0",
              }}
            >
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "50%",
                  background:
                    importResult.status === "COMPLETED"
                      ? "rgba(16, 185, 129, 0.2)"
                      : "rgba(245, 158, 11, 0.2)",
                  color:
                    importResult.status === "COMPLETED"
                      ? "var(--accent-emerald)"
                      : "var(--accent-amber)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 1rem auto",
                }}
              >
                {importResult.status === "COMPLETED" ? (
                  <CheckCircle2 size={30} />
                ) : (
                  <AlertTriangle size={30} />
                )}
              </div>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>
                {importResult.status === "COMPLETED"
                  ? "Contacts Import Completed Successfully!"
                  : "Import Completed with Warnings / Errors"}
              </h3>
              <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                {importResult.fileName} — Processed {importResult.totalRows.toLocaleString()} rows
              </p>
            </div>

            {/* Metrics Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "0.75rem",
                marginBottom: "1.5rem",
              }}
            >
              <div
                style={{
                  background: "rgba(16, 185, 129, 0.1)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: "var(--radius-md)",
                  padding: "0.85rem",
                  textAlign: "center",
                }}
              >
                <span style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--accent-emerald)" }}>
                  {importResult.createdContacts}
                </span>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", display: "block" }}>
                  New Contacts Added
                </span>
              </div>

              <div
                style={{
                  background: "rgba(99, 102, 241, 0.1)",
                  border: "1px solid rgba(99, 102, 241, 0.25)",
                  borderRadius: "var(--radius-md)",
                  padding: "0.85rem",
                  textAlign: "center",
                }}
              >
                <span style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--accent-indigo)" }}>
                  {importResult.updatedContacts}
                </span>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", display: "block" }}>
                  Existing Updated
                </span>
              </div>

              <div
                style={{
                  background: "rgba(14, 165, 233, 0.1)",
                  border: "1px solid rgba(14, 165, 233, 0.25)",
                  borderRadius: "var(--radius-md)",
                  padding: "0.85rem",
                  textAlign: "center",
                }}
              >
                <span style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--accent-sky)" }}>
                  {importResult.addedToList}
                </span>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", display: "block" }}>
                  Added to Audience List
                </span>
              </div>

              <div
                style={{
                  background: "rgba(30, 41, 59, 0.4)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "0.85rem",
                  textAlign: "center",
                }}
              >
                <span style={{ fontSize: "1.2rem", fontWeight: 600, color: "var(--text-primary)" }}>
                  {importResult.skippedDuplicates}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block" }}>
                  In-File Duplicates Skipped
                </span>
              </div>

              <div
                style={{
                  background: "rgba(245, 158, 11, 0.1)",
                  border: "1px solid rgba(245, 158, 11, 0.25)",
                  borderRadius: "var(--radius-md)",
                  padding: "0.85rem",
                  textAlign: "center",
                }}
              >
                <span style={{ fontSize: "1.2rem", fontWeight: 600, color: "var(--accent-amber)" }}>
                  {importResult.skippedSuppressed}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block" }}>
                  Suppressed (Preserved)
                </span>
              </div>

              <div
                style={{
                  background: "rgba(244, 63, 94, 0.1)",
                  border: "1px solid rgba(244, 63, 94, 0.25)",
                  borderRadius: "var(--radius-md)",
                  padding: "0.85rem",
                  textAlign: "center",
                }}
              >
                <span style={{ fontSize: "1.2rem", fontWeight: 600, color: "var(--accent-rose)" }}>
                  {importResult.invalidRows}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block" }}>
                  Invalid Rows Skipped
                </span>
              </div>
            </div>

            {/* Error Details Breakdown if any */}
            {importResult.rowErrors && importResult.rowErrors.length > 0 && (
              <div style={{ marginBottom: "1.5rem" }}>
                <button
                  type="button"
                  onClick={() => setShowErrorDetails(!showErrorDetails)}
                  className="btn-secondary"
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.85rem",
                    padding: "0.6rem 0.85rem",
                  }}
                >
                  <span style={{ color: "var(--accent-rose)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <AlertCircle size={15} />
                    View {importResult.rowErrors.length} Row Diagnostic Issues
                  </span>
                  <span>{showErrorDetails ? "Hide" : "Show Details"}</span>
                </button>

                {showErrorDetails && (
                  <div
                    style={{
                      maxHeight: "200px",
                      overflowY: "auto",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "0 0 var(--radius-md) var(--radius-md)",
                      background: "rgba(15, 23, 42, 0.6)",
                      padding: "0.75rem",
                      fontSize: "0.8rem",
                    }}
                  >
                    {importResult.rowErrors.map((err, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: "0.35rem 0",
                          borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span style={{ color: "var(--text-secondary)" }}>
                          Row {err.rowNumber}:
                        </span>
                        <span style={{ color: "var(--accent-rose)" }}>
                          {err.reason} {err.rawPhone ? `("${err.rawPhone}")` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                paddingTop: "1rem",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <button
                type="button"
                onClick={handleClose}
                className="btn-primary"
                style={{ minWidth: "120px" }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
