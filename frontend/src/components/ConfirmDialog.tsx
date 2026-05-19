import type { ReactNode } from 'react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  busyLabel?: string;
  cancelLabel?: string;
  confirmTone?: 'primary' | 'danger';
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  busyLabel,
  cancelLabel = 'Cancel',
  confirmTone = 'primary',
  busy = false,
}: ConfirmDialogProps) {
  const confirmClass = confirmTone === 'danger' ? 'btn-danger' : 'btn-primary';
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {message && <div className="text-slate-300">{message}</div>}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" onClick={() => void onConfirm()} disabled={busy} className={confirmClass}>
            {busy ? busyLabel ?? confirmLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
