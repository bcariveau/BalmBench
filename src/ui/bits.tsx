import { useEffect, useRef, useState, type ReactNode } from "react";

export function Modal({
  title,
  children,
  onClose,
  wide,
  testId,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  testId?: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-back" role="presentation" onMouseDown={onClose}>
      <div
        className={`modal${wide ? " wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-head no-print">
          <h2>{title}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function Badge({ tone, children }: { tone?: "sage" | "clay" | "amber" | "blue" | "ink"; children: ReactNode }) {
  return <span className={`badge ${tone ?? "ink"}`}>{children}</span>;
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export function IconBook() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4.5h9.5A3.5 3.5 0 0 1 18 8v11.5H8.5A3.5 3.5 0 0 0 5 16.5z" />
      <path d="M5 4.5A3.5 3.5 0 0 0 8.5 8H18" />
    </svg>
  );
}
export function IconBeaker() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3h6M10 3v5L5.5 18.5A3.5 3.5 0 0 0 8.7 21h6.6a3.5 3.5 0 0 0 3.2-2.5L14 8V3" />
      <path d="M8 14h8" />
    </svg>
  );
}
export function IconBoxes() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8l9-4 9 4-9 4-9-4z" />
      <path d="M3 8v8l9 4 9-4V8" />
      <path d="M12 12v8" />
    </svg>
  );
}
export function IconTag() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4h6a2 2 0 0 1 2 2v6l-9.5 9.5a2 2 0 0 1-2.8 0L3.5 16.3a2 2 0 0 1 0-2.8z" />
      <path d="M16 8h.01" />
    </svg>
  );
}
export function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  );
}
export function IconSun() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" />
    </svg>
  );
}
export function IconMoon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16 3.5A8.5 8.5 0 1 0 20.5 14 7 7 0 0 1 16 3.5z" />
    </svg>
  );
}
export function useNarrow(maxWidth = 959): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export function NamePicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const current = options.find((option) => option.id === value)?.label ?? "Choose";
  return (
    <div className="field span-2">
      <span>{label}</span>
      <details className="picker" ref={ref}>
        <summary>{current}</summary>
        <div className="list">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className="choice"
              aria-pressed={option.id === value}
              onClick={() => {
                onChange(option.id);
                if (ref.current) ref.current.open = false;
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

export function IconCloud() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.5 18h9.2a3.8 3.8 0 0 0 .5-7.6 5.6 5.6 0 0 0-10.8 1.6A3.2 3.2 0 0 0 7.5 18z" />
    </svg>
  );
}
export function IconGear() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M5.8 5.8l1.4 1.4M16.8 16.8l1.4 1.4M18.2 5.8l-1.4 1.4M7.2 16.8l-1.4 1.4" />
    </svg>
  );
}
