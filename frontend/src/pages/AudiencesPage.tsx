import React, { useState, useEffect, useCallback } from "react";
import {
  Users,
  UploadCloud,
  Plus,
  Search,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Trash2,
  Edit2,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FolderOpen,
} from "lucide-react";
import { apiClient } from "../services/api.js";
import {
  Contact,
  ContactList,
  ImportJob,
  ConsentStatus,
} from "../types/contact.js";
import { CsvImportWizardModal } from "../components/CsvImportWizardModal.js";
import { CreateAudienceModal } from "../components/CreateAudienceModal.js";
import { DeleteConfirmModal } from "../components/DeleteConfirmModal.js";

export const AudiencesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"LISTS" | "CONTACTS" | "HISTORY">("LISTS");

  // Data states
  const [lists, setLists] = useState<ContactList[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination for contacts
  const [contactPage, setContactPage] = useState<number>(1);
  const [contactTotalPages, setContactTotalPages] = useState<number>(1);
  const [contactTotalItems, setContactTotalItems] = useState<number>(0);

  // Filters for contacts
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedConsent, setSelectedConsent] = useState<string>("ALL");
  const [selectedListFilter, setSelectedListFilter] = useState<string>("ALL");
  const [suppressedOnly, setSuppressedOnly] = useState<boolean>(false);

  // Modals
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isCreateListModalOpen, setIsCreateListModalOpen] = useState<boolean>(false);
  const [editingList, setEditingList] = useState<ContactList | null>(null);

  // Deletion modal states
  const [deletingList, setDeletingList] = useState<ContactList | null>(null);
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Fetch Lists
  const fetchLists = useCallback(async () => {
    try {
      const res = await apiClient.listAudiences();
      setLists(res.data);
    } catch (err: any) {
      console.error("Failed to load audience lists:", err);
    }
  }, []);

  // Fetch Contacts
  const fetchContacts = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiClient.listContacts({
        page: contactPage,
        limit: 15,
        search: searchQuery || undefined,
        consentStatus:
          selectedConsent !== "ALL" ? (selectedConsent as ConsentStatus) : undefined,
        isSuppressed: suppressedOnly ? true : undefined,
        listId: selectedListFilter !== "ALL" ? selectedListFilter : undefined,
      });

      setContacts(res.data.items);
      setContactTotalPages(res.data.pagination.totalPages);
      setContactTotalItems(res.data.pagination.totalItems);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load contacts.");
    } finally {
      setIsLoading(false);
    }
  }, [contactPage, searchQuery, selectedConsent, selectedListFilter, suppressedOnly]);

  // Fetch Import History
  const fetchImportHistory = useCallback(async () => {
    try {
      const res = await apiClient.listImportJobs();
      setImportJobs(res.data);
    } catch (err: any) {
      console.error("Failed to load import jobs:", err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const loadAll = async () => {
      setIsLoading(true);
      await Promise.all([fetchLists(), fetchContacts(), fetchImportHistory()]);
      setIsLoading(false);
    };
    loadAll();
  }, [fetchLists, fetchContacts, fetchImportHistory]);

  const handleRefresh = async () => {
    setIsLoading(true);
    await Promise.all([fetchLists(), fetchContacts(), fetchImportHistory()]);
    setIsLoading(false);
  };

  const handleDeleteList = async () => {
    if (!deletingList) return;
    setIsDeleting(true);
    try {
      await apiClient.deleteAudience(deletingList.id);
      setDeletingList(null);
      await Promise.all([fetchLists(), fetchContacts()]);
    } catch (err: any) {
      setError(err.message || "Failed to delete audience list.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!deletingContact) return;
    setIsDeleting(true);
    try {
      await apiClient.deleteContact(deletingContact.id);
      setDeletingContact(null);
      await fetchContacts();
    } catch (err: any) {
      setError(err.message || "Failed to delete contact.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleSuppression = async (contact: Contact) => {
    try {
      await apiClient.recordContactConsent(contact.id, {
        eventType: contact.isSuppressed ? "UNSUPPRESS" : "SUPPRESS",
        source: "OPERATOR_DASHBOARD",
        evidence: contact.isSuppressed
          ? "Manually unsuppressed by operator"
          : "Manually suppressed by operator",
      });
      await fetchContacts();
    } catch (err: any) {
      setError(err.message || "Failed to update contact suppression status.");
    }
  };

  // Stats calculation
  const totalAudienceCount = lists.length;
  const totalAudienceContacts = lists.reduce((sum, l) => sum + l.memberCount, 0);

  return (
    <div className="content-area">
      {/* Top Banner / Metrics */}
      <div
        className="glass-panel"
        style={{
          padding: "1.5rem",
          borderRadius: "var(--radius-lg)",
          marginBottom: "1.5rem",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "0.25rem",
            }}
          >
            Audiences & Contacts Hub
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            Manage verified WhatsApp audiences, perform RFC 4180 CSV imports, and enforce opt-in consent.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            onClick={() => {
              setEditingList(null);
              setIsCreateListModalOpen(true);
            }}
            className="btn-secondary"
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <Plus size={16} /> New Audience List
          </button>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <UploadCloud size={16} /> Import Contacts CSV
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div className="glass-panel" style={{ padding: "1.1rem", borderRadius: "var(--radius-md)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 600 }}>
              Audience Lists
            </span>
            <Users size={18} color="var(--accent-indigo)" />
          </div>
          <span style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--text-primary)" }}>
            {totalAudienceCount}
          </span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginTop: "0.2rem" }}>
            {totalAudienceContacts.toLocaleString()} total memberships
          </span>
        </div>

        <div className="glass-panel" style={{ padding: "1.1rem", borderRadius: "var(--radius-md)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 600 }}>
              Total Verified Contacts
            </span>
            <ShieldCheck size={18} color="var(--accent-emerald)" />
          </div>
          <span style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--accent-emerald)" }}>
            {contactTotalItems.toLocaleString()}
          </span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginTop: "0.2rem" }}>
            Normalized E.164 phone records
          </span>
        </div>

        <div className="glass-panel" style={{ padding: "1.1rem", borderRadius: "var(--radius-md)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 600 }}>
              Consent Status
            </span>
            <Clock size={18} color="var(--accent-amber)" />
          </div>
          <span style={{ fontSize: "1.2rem", fontWeight: 600, color: "var(--text-primary)" }}>
            Opt-in Protected
          </span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginTop: "0.2rem" }}>
            CSV imports default to PENDING
          </span>
        </div>

        <div className="glass-panel" style={{ padding: "1.1rem", borderRadius: "var(--radius-md)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 600 }}>
              Recent CSV Imports
            </span>
            <UploadCloud size={18} color="var(--accent-sky)" />
          </div>
          <span style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--text-primary)" }}>
            {importJobs.length}
          </span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginTop: "0.2rem" }}>
            Full diagnostic history kept
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border-subtle)",
          marginBottom: "1.5rem",
          gap: "1.5rem",
        }}
      >
        <button
          onClick={() => setActiveTab("LISTS")}
          style={{
            padding: "0.75rem 0.25rem",
            fontSize: "0.95rem",
            fontWeight: 600,
            color: activeTab === "LISTS" ? "var(--accent-emerald)" : "var(--text-secondary)",
            borderBottom: activeTab === "LISTS" ? "2px solid var(--accent-emerald)" : "2px solid transparent",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: "pointer",
          }}
        >
          <Users size={16} />
          Audience Lists ({lists.length})
        </button>

        <button
          onClick={() => setActiveTab("CONTACTS")}
          style={{
            padding: "0.75rem 0.25rem",
            fontSize: "0.95rem",
            fontWeight: 600,
            color: activeTab === "CONTACTS" ? "var(--accent-emerald)" : "var(--text-secondary)",
            borderBottom: activeTab === "CONTACTS" ? "2px solid var(--accent-emerald)" : "2px solid transparent",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: "pointer",
          }}
        >
          <FolderOpen size={16} />
          All Contacts ({contactTotalItems.toLocaleString()})
        </button>

        <button
          onClick={() => setActiveTab("HISTORY")}
          style={{
            padding: "0.75rem 0.25rem",
            fontSize: "0.95rem",
            fontWeight: 600,
            color: activeTab === "HISTORY" ? "var(--accent-emerald)" : "var(--text-secondary)",
            borderBottom: activeTab === "HISTORY" ? "2px solid var(--accent-emerald)" : "2px solid transparent",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: "pointer",
          }}
        >
          <Clock size={16} />
          Import History ({importJobs.length})
        </button>
      </div>

      {error && (
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
          <span>{error}</span>
        </div>
      )}

      {/* TAB 1: Audience Lists Grid */}
      {activeTab === "LISTS" && (
        <div>
          {lists.length === 0 && !isLoading ? (
            <div
              className="glass-panel"
              style={{
                padding: "3.5rem 1.5rem",
                textAlign: "center",
                borderRadius: "var(--radius-lg)",
              }}
            >
              <Users
                size={48}
                color="var(--accent-emerald)"
                style={{ margin: "0 auto 1rem auto", opacity: 0.6 }}
              />
              <h3 style={{ fontSize: "1.2rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.4rem" }}>
                No Audience Lists Created Yet
              </h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", maxWidth: "440px", margin: "0 auto 1.5rem auto" }}>
                Audience lists group your verified WhatsApp contacts for targeted campaign delivery. Create your first list or import contacts directly from a CSV file.
              </p>
              <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem" }}>
                <button
                  onClick={() => setIsCreateListModalOpen(true)}
                  className="btn-secondary"
                  style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
                >
                  <Plus size={16} /> Create Audience List
                </button>
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="btn-primary"
                  style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
                >
                  <UploadCloud size={16} /> Import Contacts CSV
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: "1.25rem",
              }}
            >
              {lists.map((list) => (
                <div
                  key={list.id}
                  className="glass-panel"
                  style={{
                    padding: "1.25rem",
                    borderRadius: "var(--radius-md)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    transition: "transform var(--transition-fast), border-color var(--transition-fast)",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: "0.6rem",
                      }}
                    >
                      <h3
                        style={{
                          fontSize: "1.1rem",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        {list.name}
                      </h3>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.2rem" }}>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            padding: "0.2rem 0.6rem",
                            borderRadius: "var(--radius-full)",
                            background: "rgba(16, 185, 129, 0.15)",
                            color: "var(--accent-emerald)",
                          }}
                        >
                          {list.eligibleMemberCount !== undefined
                            ? `${list.eligibleMemberCount.toLocaleString()} Eligible`
                            : `${list.memberCount.toLocaleString()} Contacts`}
                        </span>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                          {list.memberCount.toLocaleString()} Total Contacts
                        </span>
                      </div>
                    </div>

                    {list.eligibleMemberCount !== undefined && list.eligibleMemberCount < list.memberCount && (
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          fontSize: "0.72rem",
                          color: "var(--accent-amber)",
                          marginBottom: "0.6rem",
                          background: "rgba(245, 158, 11, 0.1)",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "var(--radius-sm)",
                        }}
                      >
                        <AlertCircle size={12} />
                        <span>{list.memberCount - list.eligibleMemberCount} unconsented contacts excluded</span>
                      </div>
                    )}

                    <p
                      style={{
                        fontSize: "0.85rem",
                        color: "var(--text-secondary)",
                        marginBottom: "1rem",
                        minHeight: "2.4rem",
                      }}
                    >
                      {list.description || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>No description provided</span>}
                    </p>
                  </div>

                  <div
                    style={{
                      borderTop: "1px solid var(--border-subtle)",
                      paddingTop: "0.85rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <button
                      onClick={() => {
                        setSelectedListFilter(list.id);
                        setActiveTab("CONTACTS");
                      }}
                      className="btn-secondary"
                      style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
                    >
                      View Contacts
                    </button>

                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <button
                        onClick={() => {
                          setEditingList(list);
                          setIsCreateListModalOpen(true);
                        }}
                        className="action-btn icon-btn"
                        title="Rename List"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => setDeletingList(list)}
                        className="action-btn icon-btn delete-btn"
                        title="Delete List"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Contacts Table */}
      {activeTab === "CONTACTS" && (
        <div className="glass-panel" style={{ padding: "1.25rem", borderRadius: "var(--radius-lg)" }}>
          {/* Filter Bar */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              marginBottom: "1.25rem",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", flex: 1, minWidth: "280px" }}>
              {/* Search */}
              <div style={{ position: "relative", minWidth: "220px", flex: 1 }}>
                <Search
                  size={16}
                  style={{
                    position: "absolute",
                    left: "0.75rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-muted)",
                  }}
                />
                <input
                  type="text"
                  className="input-text"
                  placeholder="Search phone, name, email..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setContactPage(1);
                  }}
                  style={{ paddingLeft: "2.25rem", width: "100%" }}
                />
              </div>

              {/* Consent filter */}
              <select
                className="input-select"
                value={selectedConsent}
                onChange={(e) => {
                  setSelectedConsent(e.target.value);
                  setContactPage(1);
                }}
              >
                <option value="ALL">All Consent States</option>
                <option value="OPTED_IN">Opted In</option>
                <option value="PENDING">Pending</option>
                <option value="OPTED_OUT">Opted Out</option>
              </select>

              {/* List filter */}
              <select
                className="input-select"
                value={selectedListFilter}
                onChange={(e) => {
                  setSelectedListFilter(e.target.value);
                  setContactPage(1);
                }}
              >
                <option value="ALL">All Audiences</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>

              {/* Suppression Checkbox */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.82rem",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  padding: "0 0.5rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={suppressedOnly}
                  onChange={(e) => {
                    setSuppressedOnly(e.target.checked);
                    setContactPage(1);
                  }}
                />
                <span>Suppressed Only</span>
              </label>
            </div>

            <button
              onClick={handleRefresh}
              className="action-btn icon-btn"
              title="Refresh Contacts"
            >
              <RefreshCw size={16} className={isLoading ? "spinning" : ""} />
            </button>
          </div>

          {/* Contacts Table */}
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-secondary)" }}>
              <Loader2 size={24} className="spinning" style={{ margin: "0 auto 0.5rem auto" }} />
              <span>Loading contacts...</span>
            </div>
          ) : contacts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
              <Users size={36} color="var(--text-muted)" style={{ margin: "0 auto 0.75rem auto" }} />
              <p style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
                No contacts match your active filters.
              </p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedConsent("ALL");
                  setSelectedListFilter("ALL");
                  setSuppressedOnly(false);
                }}
                className="btn-secondary"
                style={{ marginTop: "1rem", fontSize: "0.82rem" }}
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)", textAlign: "left" }}>
                    <th style={{ padding: "0.75rem 0.5rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                      Phone (E.164)
                    </th>
                    <th style={{ padding: "0.75rem 0.5rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                      Name
                    </th>
                    <th style={{ padding: "0.75rem 0.5rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                      Email
                    </th>
                    <th style={{ padding: "0.75rem 0.5rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                      Consent State
                    </th>
                    <th style={{ padding: "0.75rem 0.5rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                      Send Eligibility
                    </th>
                    <th style={{ padding: "0.75rem 0.5rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                      Audience Lists
                    </th>
                    <th style={{ padding: "0.75rem 0.5rem", color: "var(--text-secondary)", fontWeight: 600, textAlign: "right" }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => {
                    const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
                    const isSendEligible = contact.consentStatus === "OPTED_IN" && !contact.isSuppressed;

                    return (
                      <tr
                        key={contact.id}
                        style={{
                          borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                          transition: "background var(--transition-fast)",
                        }}
                      >
                        <td style={{ padding: "0.75rem 0.5rem", fontWeight: 600, color: "var(--text-primary)" }}>
                          {contact.phoneNumber}
                          {contact.isSuppressed && (
                            <span
                              style={{
                                marginLeft: "0.4rem",
                                fontSize: "0.7rem",
                                padding: "0.15rem 0.45rem",
                                borderRadius: "var(--radius-full)",
                                background: "rgba(244, 63, 94, 0.15)",
                                color: "var(--accent-rose)",
                              }}
                            >
                              Suppressed
                            </span>
                          )}
                        </td>

                        <td style={{ padding: "0.75rem 0.5rem", color: "var(--text-primary)" }}>
                          {fullName || <span style={{ color: "var(--text-muted)" }}>—</span>}
                        </td>

                        <td style={{ padding: "0.75rem 0.5rem", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                          {contact.email || <span style={{ color: "var(--text-muted)" }}>—</span>}
                        </td>

                        <td style={{ padding: "0.75rem 0.5rem" }}>
                          <span
                            style={{
                              fontSize: "0.74rem",
                              fontWeight: 600,
                              padding: "0.2rem 0.55rem",
                              borderRadius: "var(--radius-full)",
                              background:
                                contact.consentStatus === "OPTED_IN"
                                  ? "rgba(16, 185, 129, 0.15)"
                                  : contact.consentStatus === "OPTED_OUT"
                                  ? "rgba(244, 63, 94, 0.15)"
                                  : "rgba(245, 158, 11, 0.15)",
                              color:
                                contact.consentStatus === "OPTED_IN"
                                  ? "var(--accent-emerald)"
                                  : contact.consentStatus === "OPTED_OUT"
                                  ? "var(--accent-rose)"
                                  : "var(--accent-amber)",
                            }}
                          >
                            {contact.consentStatus}
                          </span>
                        </td>

                        <td style={{ padding: "0.75rem 0.5rem" }}>
                          {isSendEligible ? (
                            <span
                              style={{
                                fontSize: "0.72rem",
                                fontWeight: 600,
                                padding: "0.2rem 0.55rem",
                                borderRadius: "var(--radius-full)",
                                background: "rgba(16, 185, 129, 0.15)",
                                color: "var(--accent-emerald)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.25rem",
                              }}
                            >
                              <ShieldCheck size={12} /> Send Eligible
                            </span>
                          ) : contact.isSuppressed ? (
                            <span
                              style={{
                                fontSize: "0.72rem",
                                fontWeight: 600,
                                padding: "0.2rem 0.55rem",
                                borderRadius: "var(--radius-full)",
                                background: "rgba(244, 63, 94, 0.15)",
                                color: "var(--accent-rose)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.25rem",
                              }}
                            >
                              <ShieldAlert size={12} /> Suppressed (Ineligible)
                            </span>
                          ) : contact.consentStatus === "OPTED_OUT" ? (
                            <span
                              style={{
                                fontSize: "0.72rem",
                                fontWeight: 600,
                                padding: "0.2rem 0.55rem",
                                borderRadius: "var(--radius-full)",
                                background: "rgba(244, 63, 94, 0.12)",
                                color: "var(--accent-rose)",
                              }}
                            >
                              Opted Out
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: "0.72rem",
                                fontWeight: 600,
                                padding: "0.2rem 0.55rem",
                                borderRadius: "var(--radius-full)",
                                background: "rgba(245, 158, 11, 0.12)",
                                color: "var(--accent-amber)",
                              }}
                            >
                              Pending Consent
                            </span>
                          )}
                        </td>

                        <td style={{ padding: "0.75rem 0.5rem" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                            {contact.lists.length > 0 ? (
                              contact.lists.map((l) => (
                                <span
                                  key={l.id}
                                  style={{
                                    fontSize: "0.72rem",
                                    padding: "0.15rem 0.45rem",
                                    borderRadius: "var(--radius-sm)",
                                    background: "rgba(99, 102, 241, 0.12)",
                                    color: "var(--accent-indigo)",
                                  }}
                                >
                                  {l.name}
                                </span>
                              ))
                            ) : (
                              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>No list</span>
                            )}
                          </div>
                        </td>

                        <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.35rem" }}>
                            <button
                              onClick={() => handleToggleSuppression(contact)}
                              className="action-btn icon-btn"
                              title={contact.isSuppressed ? "Unsuppress Contact" : "Suppress Contact"}
                              style={{
                                color: contact.isSuppressed ? "var(--accent-emerald)" : "var(--accent-amber)",
                              }}
                            >
                              {contact.isSuppressed ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}
                            </button>
                            <button
                              onClick={() => setDeletingContact(contact)}
                              className="action-btn icon-btn delete-btn"
                              title="Delete Contact"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {contactTotalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: "1rem",
                borderTop: "1px solid var(--border-subtle)",
                marginTop: "1rem",
                fontSize: "0.85rem",
                color: "var(--text-secondary)",
              }}
            >
              <span>
                Page {contactPage} of {contactTotalPages} ({contactTotalItems.toLocaleString()} contacts)
              </span>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  disabled={contactPage <= 1}
                  onClick={() => setContactPage((p) => Math.max(1, p - 1))}
                  className="btn-secondary"
                  style={{ padding: "0.35rem 0.75rem" }}
                >
                  <ChevronLeft size={16} /> Previous
                </button>
                <button
                  disabled={contactPage >= contactTotalPages}
                  onClick={() => setContactPage((p) => p + 1)}
                  className="btn-secondary"
                  style={{ padding: "0.35rem 0.75rem" }}
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Import History */}
      {activeTab === "HISTORY" && (
        <div className="glass-panel" style={{ padding: "1.25rem", borderRadius: "var(--radius-lg)" }}>
          {importJobs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
              <Clock size={36} color="var(--text-muted)" style={{ margin: "0 auto 0.75rem auto" }} />
              <p style={{ color: "var(--text-secondary)", fontWeight: 500 }}>
                No CSV imports have been run yet for your organization.
              </p>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="btn-primary"
                style={{ marginTop: "1rem", fontSize: "0.85rem" }}
              >
                Start First CSV Import
              </button>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)", textAlign: "left" }}>
                    <th style={{ padding: "0.75rem 0.5rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                      File Name
                    </th>
                    <th style={{ padding: "0.75rem 0.5rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                      Target Audience
                    </th>
                    <th style={{ padding: "0.75rem 0.5rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                      Status
                    </th>
                    <th style={{ padding: "0.75rem 0.5rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                      Processed
                    </th>
                    <th style={{ padding: "0.75rem 0.5rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                      Outcomes
                    </th>
                    <th style={{ padding: "0.75rem 0.5rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {importJobs.map((job) => (
                    <tr
                      key={job.id}
                      style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}
                    >
                      <td style={{ padding: "0.75rem 0.5rem", fontWeight: 600, color: "var(--text-primary)" }}>
                        {job.fileName}
                      </td>

                      <td style={{ padding: "0.75rem 0.5rem", color: "var(--text-secondary)" }}>
                        {job.listName || <span style={{ color: "var(--text-muted)" }}>General Contacts</span>}
                      </td>

                      <td style={{ padding: "0.75rem 0.5rem" }}>
                        <span
                          style={{
                            fontSize: "0.74rem",
                            fontWeight: 600,
                            padding: "0.2rem 0.55rem",
                            borderRadius: "var(--radius-full)",
                            background:
                              job.status === "COMPLETED"
                                ? "rgba(16, 185, 129, 0.15)"
                                : job.status === "COMPLETED_WITH_ERRORS"
                                ? "rgba(245, 158, 11, 0.15)"
                                : "rgba(244, 63, 94, 0.15)",
                            color:
                              job.status === "COMPLETED"
                                ? "var(--accent-emerald)"
                                : job.status === "COMPLETED_WITH_ERRORS"
                                ? "var(--accent-amber)"
                                : "var(--accent-rose)",
                          }}
                        >
                          {job.status}
                        </span>
                      </td>

                      <td style={{ padding: "0.75rem 0.5rem", color: "var(--text-primary)" }}>
                        {job.processedRows.toLocaleString()} / {job.totalRows.toLocaleString()} rows
                      </td>

                      <td style={{ padding: "0.75rem 0.5rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        <span style={{ color: "var(--accent-emerald)" }}>+{job.createdContacts} created</span>,{" "}
                        <span style={{ color: "var(--accent-indigo)" }}>{job.updatedContacts} updated</span>
                        {job.skippedDuplicates > 0 && (
                          <span style={{ color: "var(--text-muted)" }}>, {job.skippedDuplicates} dups</span>
                        )}
                        {job.invalidRows > 0 && (
                          <span style={{ color: "var(--accent-rose)" }}>, {job.invalidRows} errors</span>
                        )}
                      </td>

                      <td style={{ padding: "0.75rem 0.5rem", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                        {new Date(job.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CSV Import Wizard Modal */}
      <CsvImportWizardModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={handleRefresh}
        existingLists={lists}
      />

      {/* Create / Edit Audience List Modal */}
      <CreateAudienceModal
        isOpen={isCreateListModalOpen}
        onClose={() => {
          setIsCreateListModalOpen(false);
          setEditingList(null);
        }}
        onSaved={handleRefresh}
        editingList={editingList}
      />

      {/* Delete List Confirmation */}
      {deletingList && (
        <DeleteConfirmModal
          isOpen={true}
          title="Delete Audience List?"
          message={`Are you sure you want to delete '${deletingList.name}'? Contact records will remain in your database, but this list and its memberships will be removed.`}
          onConfirm={handleDeleteList}
          onCancel={() => setDeletingList(null)}
          isDeleting={isDeleting}
        />
      )}

      {/* Delete Contact Confirmation */}
      {deletingContact && (
        <DeleteConfirmModal
          isOpen={true}
          title="Delete Contact?"
          message={`Are you sure you want to delete contact '${deletingContact.phoneNumber}'? All associated list memberships and audit history will be deleted.`}
          onConfirm={handleDeleteContact}
          onCancel={() => setDeletingContact(null)}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
};
