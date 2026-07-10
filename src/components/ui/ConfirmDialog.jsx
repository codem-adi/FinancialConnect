import { AlertCircle } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Btn } from './index.jsx';

/** Simple yes/cancel confirmation overlay. */
export function ConfirmDialog({
  open,
  title = 'Confirm action',
  message,
  detail,
  confirmLabel = 'Yes',
  cancelLabel = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const text = message.includes('?')
    ? message
    : message.startsWith('Are you sure')
      ? message
      : `Are you sure you want to ${message}?`;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${variant === 'danger' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
            <AlertCircle className={`w-5 h-5 ${variant === 'danger' ? 'text-red-600' : 'text-amber-600'}`} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{text}</p>
            {detail && <p className="text-xs text-slate-500 mt-2 leading-relaxed whitespace-pre-line">{detail}</p>}
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Btn type="button" variant="ghost" size="sm" onClick={onCancel}>{cancelLabel}</Btn>
          <Btn type="button" variant={variant === 'danger' ? 'danger' : 'primary'} size="sm" onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>,
    document.body,
  );
}
