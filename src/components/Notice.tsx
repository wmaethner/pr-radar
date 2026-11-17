/** A message that stays until dismissed, wrapping so long paths and errors can be read in full. */
export function Notice({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div className="notice" role="alert">
      <span>{message}</span>
      <button className="icon-btn" title="Dismiss" aria-label="Dismiss" onClick={onDismiss}>
        ✕
      </button>
    </div>
  );
}
