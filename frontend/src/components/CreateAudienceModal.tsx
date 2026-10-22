import React, { useState, useEffect } from "react";
import { X, Users, Loader2 } from "lucide-react";
import { apiClient } from "../services/api.js";
import { ContactList } from "../types/contact.js";

interface CreateAudienceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingList?: ContactList | null;
}

export const CreateAudienceModal: React.FC<CreateAudienceModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  editingList,
}) => {
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingList) {
      setName(editingList.name);
      setDescription(editingList.description || "");
    } else {
      setName("");
      setDescription("");
    }
    setError(null);
  }, [editingList, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Audience list name is required");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (editingList) {
        await apiClient.updateAudience(editingList.id, {
          name: name.trim(),
          description: description.trim() || undefined,
        });
      } else {
        await apiClient.createAudience({
          name: name.trim(),
          description: description.trim() || undefined,
        });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save audience list.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1050 }}>
      <div
        className="modal-card glass-panel"
        style={{
          maxWidth: "480px",
          width: "90%",
        }}
      >
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "var(--radius-md)",
                background: "rgba(16, 185, 129, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-emerald)",
              }}
            >
              <Users size={18} />
            </div>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)" }}>
              {editingList ? "Rename Audience List" : "Create New Audience List"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="action-btn icon-btn"
            style={{ color: "var(--text-secondary)" }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div
              style={{
                marginBottom: "1rem",
                padding: "0.75rem",
                borderRadius: "var(--radius-md)",
                background: "rgba(244, 63, 94, 0.12)",
                border: "1px solid rgba(244, 63, 94, 0.3)",
                color: "var(--accent-rose)",
                fontSize: "0.85rem",
              }}
            >
              {error}
            </div>
          )}

          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.82rem",
                fontWeight: 600,
                marginBottom: "0.35rem",
                color: "var(--text-primary)",
              }}
            >
              List Name <span style={{ color: "var(--accent-rose)" }}>*</span>
            </label>
            <input
              type="text"
              className="input-text"
              placeholder="e.g. VIP Customers, Diwali Broadcast"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: "100%" }}
              autoFocus
            />
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.82rem",
                fontWeight: 600,
                marginBottom: "0.35rem",
                color: "var(--text-primary)",
              }}
            >
              Description (Optional)
            </label>
            <textarea
              className="input-text"
              placeholder="Add optional context regarding this audience segment..."
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.75rem",
              paddingTop: "1rem",
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              {isSubmitting && <Loader2 size={16} className="spinning" />}
              {editingList ? "Save Changes" : "Create List"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
