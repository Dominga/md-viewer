import { useEffect } from "react";

export function Lightbox({
  url,
  alt,
  path,
  onClose,
}: {
  url: string;
  alt: string;
  path: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label={alt || path}>
      <button className="lightbox-close" onClick={onClose} title="Close (Esc)">
        ✕
      </button>
      <img src={url} alt={alt} onClick={(event) => event.stopPropagation()} />
      <div className="lightbox-caption" onClick={(event) => event.stopPropagation()}>
        <span>{alt || path}</span>
        <code>{path}</code>
      </div>
    </div>
  );
}
