import { useEffect, useId, useRef, type ReactNode } from 'react';
import './ui.css';

type Props = { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode };

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A bottom sheet over a dim overlay. Escape or a tap outside closes it. While
// open, Tab and Shift+Tab stay inside it (it is aria-modal).
export default function Sheet({ open, onClose, title, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = ref.current;
      if (!root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!root.contains(active) || active === root) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        ref={ref}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="sheet-title">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
