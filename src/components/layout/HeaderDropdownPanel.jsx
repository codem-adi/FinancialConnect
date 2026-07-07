import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

/** Full-screen overlay + panel for header menus; portals above mobile nav (z-100). */
export function HeaderDropdownPanel({
  open,
  onClose,
  title,
  titleExtra,
  headerAction,
  children,
  footer,
}) {
  if (!open) return null;

  const panel = (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[105] bg-black/35 sm:bg-black/25 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Close menu"
      />
      <div
        className={cn(
          'z-[110] flex flex-col rounded-xl border border-slate-200 dark:border-slate-700',
          'bg-white dark:bg-slate-900 shadow-2xl overflow-hidden',
          'fixed left-3 right-3 top-[3.75rem] max-h-[min(calc(100dvh-5rem),26rem)]',
          'sm:left-auto sm:right-6 sm:w-80 sm:max-h-[min(calc(100dvh-6rem),28rem)]',
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 min-w-0 truncate">
            {title}
            {titleExtra}
          </p>
          {headerAction}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-slate-100 dark:border-slate-800">
            {footer}
          </div>
        ) : null}
      </div>
    </>
  );

  return createPortal(panel, document.body);
}
