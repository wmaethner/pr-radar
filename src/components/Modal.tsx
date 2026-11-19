import { type ReactNode, useEffect, useRef } from "react";

/** Open modals, innermost last. Escape closes only the innermost one, e.g. the repo picker over Settings. */
const open: symbol[] = [];

/**
 * A dialog over the whole window: dimmed backdrop, title bar with a close button, Escape and a
 * click on the backdrop both close it. `className` sizes it (see `.modal` in App.css).
 */
export function Modal({
  title,
  onClose,
  className = "",
  children,
}: {
  title: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  // Read through a ref so a parent re-render doesn't re-register the listener, which would
  // move this modal back on top of the stack.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const id = Symbol("modal");
    open.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open[open.length - 1] === id) close.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      open.splice(open.indexOf(id), 1);
    };
  }, []);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <strong>{title}</strong>
          <button type="button" className="icon-btn" aria-label="Close" title="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
