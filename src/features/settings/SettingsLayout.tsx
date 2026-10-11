import { ReactNode } from "react";
import "./SettingsLayout.css";

/**
 * The building blocks every settings page is made of. Pages only decide
 * *what* to show; how a page, a section and a row look is decided once,
 * here, so a new page can't drift from the others.
 */

export function SettingsPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="settings-page">
      <h1 className="settings-page__title">{title}</h1>
      {children}
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-section">
      {(title || description) && (
        <header className="settings-section__header">
          {title && <h2 className="settings-section__title">{title}</h2>}
          {description && <p className="settings-section__description">{description}</p>}
        </header>
      )}
      <div className="settings-section__rows">{children}</div>
    </section>
  );
}

export function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row__text">
        <span className="settings-row__label">{label}</span>
        {hint && <span className="settings-row__hint">{hint}</span>}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  );
}

/** Shows an accelerator as separate keycaps, the way people read shortcuts. */
export function Keys({ accelerator }: { accelerator: string }) {
  return (
    <span className="settings-keys">
      {accelerator.split("+").map((key, i) => (
        <kbd key={i}>{KEY_LABELS[key] ?? key}</kbd>
      ))}
    </span>
  );
}

/** Accelerator names are for the shortcut parser; these are for humans,
 * and match what's printed on most keyboards. */
const KEY_LABELS: Record<string, string> = {
  PrintScreen: "PrtSc",
  Control: "Ctrl",
  CommandOrControl: "Ctrl",
  Super: "Win",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};
