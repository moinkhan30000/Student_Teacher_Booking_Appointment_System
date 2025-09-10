"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type ConfirmProps = {
  open: boolean;
  title?: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: "default" | "destructive";
  onConfirm: () => void | Promise<void>;
  onOpenChange: (v: boolean) => void;
};

export function ConfirmDialog({
  open,
  title = "Are you sure?",
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  tone = "default",
  onConfirm,
  onOpenChange,
}: ConfirmProps) {
  const [busy, setBusy] = React.useState(false);

  async function handleConfirm() {
    try {
      setBusy(true);
      await onConfirm();
    } finally {
      setBusy(false);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Always solid light background for clarity */}
      <DialogContent
        className="
          sm:max-w-md rounded-lg
          bg-white text-black
          border border-neutral-200 shadow-xl
        "
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelText}
          </Button>
          <Button
            variant={tone === "destructive" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? "Please wait…" : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
