"use client";

import { X } from "lucide-react";
import { Button } from "@/components/Button";

// Shared "are you sure?" confirmation modal for every destructive delete
// action in the app -- same overlay/card/Cancel-Delete layout that
// settings/page.tsx's "Delete account?" dialog already used, just pulled
// out so every other delete (chat, memory, resume, admin email template...)
// gets the same guard instead of firing immediately on tap. A stray tap on
// a delete button (especially the small icon-only ones, or a menu item
// sitting right above other options) previously deleted the item outright
// with nothing to undo.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  loading = false,
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  // Almost every use of this is a delete (red confirm button), but kept
  // togglable rather than hardcoded in case a future non-destructive
  // confirmation (e.g. "Sign out everywhere?") wants the same shell without
  // looking like a delete.
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
      onClick={onCancel}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-card bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-ink">{title}</h3>
          <button onClick={onCancel} aria-label="Close">
            <X size={18} className="text-ink-soft" />
          </button>
        </div>
        <p className="text-sm text-ink-soft">{description}</p>
        <div className="mt-5 flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} className="flex-1" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
