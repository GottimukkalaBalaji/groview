import React from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

export interface UnsavedChangesModalProps {
  isOpen: boolean;
  onSaveAndContinue: () => void;
  onDiscard: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  onSaveAndContinue,
  onDiscard,
  onCancel,
  isSaving = false,
}) => {
  if (!isOpen) return null;

  return (
    <>
      <div className="modal-backdrop-dark" onClick={onCancel} aria-hidden="true" />
      <div
        className="unsaved-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-modal-title"
      >
        <div className="unsaved-modal-header">
          <div className="unsaved-title-group">
            <div className="unsaved-icon-badge">
              <AlertTriangle size={20} className="text-amber" />
            </div>
            <h3 id="unsaved-modal-title">Unsaved Changes</h3>
          </div>
          <button
            type="button"
            className="sheet-btn-close"
            onClick={onCancel}
            aria-label="Close unsaved changes dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="unsaved-modal-body">
          <p>
            Your active poster contains unsaved edits. Would you like to save your changes before
            leaving this poster?
          </p>
        </div>

        <div className="unsaved-modal-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger-outline"
            onClick={onDiscard}
            disabled={isSaving}
          >
            Discard Changes
          </button>
          <button
            type="button"
            className="poster-btn-primary"
            onClick={onSaveAndContinue}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 size={15} className="spin" />
                <span>Saving…</span>
              </>
            ) : (
              <span>Save & Continue</span>
            )}
          </button>
        </div>
      </div>
    </>
  );
};

export default UnsavedChangesModal;
