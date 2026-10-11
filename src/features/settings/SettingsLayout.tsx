import { ReactNode } from "react";
import { acceleratorKeys } from "../../lib/acceleratorLabel";
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
  action,
  compact,
  children,
}: {
  /** Shorter rows, for long lists of one-line rows like shortcuts. */
  compact?: boolean;
  title?: string;
  description?: string;
  /** A small control beside the title, e.g. "Reset all". */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`settings-section${compact ? " settings-section--compact" : ""}`}>
      {(title || description || action) && (
        <header className="settings-section__header">
          <div className="settings-section__heading">
            {title && <h2 className="settings-section__title">{title}</h2>}
            {description && <p className="settings-section__description">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="settings-section__rows">{children}</div>
    </section>
  );
}

export function SettingsRow({
  label,
  hint,
  error,
  children,
  below,
}: {
  label: string;
  hint?: string;
  /** Replaces the hint while set, so the row doesn't grow a second line. */
  error?: string | null;
  children?: ReactNode;
  /** Full-width content under the label and control, e.g. a preview. */
  below?: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row__main">
        <div className="settings-row__text">
          <span className="settings-row__label">{label}</span>
          {error ? (
            <span className="settings-row__hint settings-row__hint--error">{error}</span>
          ) : (
            hint && <span className="settings-row__hint">{hint}</span>
          )}
        </div>
        {children && <div className="settings-row__control">{children}</div>}
      </div>
      {below}
    </div>
  );
}

/** Shows an accelerator as separate keycaps, the way people read shortcuts. */
export function Keys({ accelerator }: { accelerator: string }) {
  return (
    <span className="settings-keys">
      {acceleratorKeys(accelerator).map((key, i) => (
        <kbd key={i}>{key}</kbd>
      ))}
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** For screen readers; the row label is the visible one. */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`settings-toggle${checked ? " settings-toggle--on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-toggle__thumb" />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="settings-segmented" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={`settings-segmented__option${option.value === value ? " settings-segmented__option--active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
