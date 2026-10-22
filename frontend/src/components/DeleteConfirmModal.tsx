import React, { useEffect } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";

interface DeleteConfirmModalProps {
  isOpen: boolean;
  campaignName?: string;
  itemName?: string;
  title?: string;
  message?: string;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  campaignName,
  itemName,
  title,
  message,
  isDeleting,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isDeleting) {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isDeleting, onCancel]);

  if (!isOpen) return null;

  const displayTitle = title || "Delete Campaign Draft?";
  const displayName = itemName || campaignName || "Item";

  return (
    <div className="modal-backdrop" onClick={!isDeleting ? onCancel : undefined}>
      <div
        className="modal-card confirm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
      >
        <div className="modal-header">
          <div className="modal-icon-danger">
            <AlertTriangle size={20} color="var(--accent-rose)" />
          </div>
          <div style={{ flex: 1 }}>
            <h3 id="delete-dialog-title" className="modal-title">{displayTitle}</h3>
            <span className="modal-sub">This action cannot be undone</span>
          </div>
          <button
            type="button"
            className="btn-icon-close"
            onClick={onCancel}
            disabled={isDeleting}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-text">
            {message || (
              <>
                Are you sure you want to delete{" "}
                <strong>"{displayName}"</strong>? This will permanently remove the record from your workspace.
              </>
            )}
          </p>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            <Trash2 size={15} />
            <span>{isDeleting ? "Deleting..." : "Delete Draft"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
