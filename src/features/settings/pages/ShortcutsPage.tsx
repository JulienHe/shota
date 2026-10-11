import { useEffect, useState } from "react";
import { GlobalShortcuts, ShortcutKind, tauriApi } from "../../../lib/tauriApi";
import { t } from "../../../lib/i18n";
import { AcceleratorProblem, checkAccelerator, sameAccelerator } from "../../../lib/accelerator";
import { EDITOR_ACTIONS, EditorActionId, resolveBindings } from "../../../lib/editorShortcuts";
import { formatAcceleratorLabel } from "../../../lib/acceleratorLabel";
import { usePreferencesStore } from "../../../stores/preferencesStore";
import { SettingsPage, SettingsRow, SettingsSection } from "../SettingsLayout";
import { ShortcutRecorder } from "../ShortcutRecorder";
import "./ShortcutsPage.css";

const GLOBAL_ROWS: { kind: ShortcutKind; label: string; hint?: string }[] = [
  { kind: "area", label: "settings.areaWindow", hint: "settings.areaHint" },
  { kind: "fullscreen", label: "settings.fullScreen" },
  { kind: "history", label: "settings.history", hint: "settings.historyHint" },
];

const TOOL_ACTIONS = EDITOR_ACTIONS.filter((action) => action.id.startsWith("tool."));
const OTHER_ACTIONS = EDITOR_ACTIONS.filter((action) => !action.id.startsWith("tool."));

/** Global and editor rows share one id space, so only one records at a time. */
type RowId = `global:${ShortcutKind}` | `editor:${EditorActionId}`;

const PROBLEM_MESSAGES: Record<AcceleratorProblem, string> = {
  needsModifier: "settings.needsModifier",
  reserved: "settings.reservedKey",
};

export function ShortcutsPage() {
  const [shortcuts, setShortcuts] = useState<GlobalShortcuts | null>(null);
  const [defaults, setDefaults] = useState<GlobalShortcuts | null>(null);
  const [recording, setRecording] = useState<RowId | null>(null);
  const [error, setError] = useState<{ row: RowId; message: string } | null>(null);
  const [printScreenTaken, setPrintScreenTaken] = useState(false);
  const preferences = usePreferencesStore((s) => s.preferences);
  const updatePreferences = usePreferencesStore((s) => s.update);
  const editorBindings = resolveBindings(preferences?.editorShortcuts);

  useEffect(() => {
    tauriApi.getShortcuts().then(setShortcuts);
    tauriApi.defaultShortcuts().then(setDefaults);
    tauriApi
      .printScreenOwnedBySnippingTool()
      .then(setPrintScreenTaken)
      .catch(() => setPrintScreenTaken(false));
  }, []);

  if (!shortcuts || !defaults || !preferences) return null;

  /** The name of whatever already uses `accelerator`, other than `row`. */
  const conflictFor = (row: RowId, accelerator: string): string | null => {
    for (const { kind, label } of GLOBAL_ROWS) {
      if (row !== `global:${kind}` && sameAccelerator(shortcuts[kind], accelerator)) return t(label);
    }
    // A global shortcut is taken by Windows before the editor ever sees the
    // key, so it clashes with editor shortcuts too ~ but two editor
    // shortcuts don't clash with anything outside the editor.
    for (const action of EDITOR_ACTIONS) {
      if (row === `editor:${action.id}`) continue;
      if (sameAccelerator(editorBindings[action.id], accelerator)) return t(action.label);
    }
    return null;
  };

  const validate = (row: RowId, accelerator: string, scope: "global" | "editor"): string | null => {
    const problem = checkAccelerator(accelerator, scope);
    if (problem) return t(PROBLEM_MESSAGES[problem], { keys: formatAcceleratorLabel(accelerator) });
    const taken = conflictFor(row, accelerator);
    if (taken) return t("settings.conflict", { action: taken });
    return null;
  };

  const recordGlobal = async (kind: ShortcutKind, accelerator: string) => {
    const row: RowId = `global:${kind}`;
    const problem = validate(row, accelerator, "global");
    if (problem) {
      setError({ row, message: problem });
      return;
    }
    try {
      await tauriApi.setShortcut(kind, accelerator);
      setShortcuts({ ...shortcuts, [kind]: accelerator });
      setError(null);
    } catch {
      setError({ row, message: t("settings.registerFailed") });
    }
  };

  const recordEditor = (id: EditorActionId, accelerator: string) => {
    const row: RowId = `editor:${id}`;
    const problem = validate(row, accelerator, "editor");
    if (problem) {
      setError({ row, message: problem });
      return;
    }
    const overrides = { ...preferences.editorShortcuts };
    const action = EDITOR_ACTIONS.find((a) => a.id === id)!;
    // Store overrides only: a binding equal to its default is no override,
    // so a later change to that default still reaches this user.
    if (sameAccelerator(accelerator, action.default)) delete overrides[id];
    else overrides[id] = accelerator;
    updatePreferences({ editorShortcuts: overrides });
    setError(null);
  };

  const recorderProps = (row: RowId) => ({
    recording: recording === row,
    onRecordingChange: (on: boolean) => {
      setRecording(on ? row : null);
      if (on) setError(null);
    },
  });

  const resetEditor = () => {
    updatePreferences({ editorShortcuts: {} });
    setError(null);
  };

  return (
    <SettingsPage title={t("settings.shortcuts")}>
      {/* Windows 11 binds Print Screen to the Snipping Tool by default, which
          swallows Shota's capture shortcut with no error and no clue as to
          why. The toggle is a per-user registry value, so rather than telling
          someone to go hunting through Windows Settings, offer to flip it. */}
      {printScreenTaken && (
        <div className="shortcuts-page__notice">
          <span>{t("settings.printScreenOwned")}</span>
          <button
            type="button"
            className="settings-control settings-control--primary"
            onClick={() => {
              tauriApi
                .releasePrintScreen()
                .then(() => setPrintScreenTaken(false))
                .catch((err) => console.error("could not release Print Screen", err));
            }}
          >
            {t("settings.printScreenFix")}
          </button>
        </div>
      )}

      <SettingsSection title={t("settings.globalSection")} description={t("settings.shortcutsHint")}>
        {GLOBAL_ROWS.map(({ kind, label, hint }) => {
          const row: RowId = `global:${kind}`;
          return (
            <SettingsRow
              key={kind}
              label={t(label)}
              hint={hint ? t(hint) : undefined}
              error={error?.row === row ? error.message : null}
            >
              <ShortcutRecorder
                value={shortcuts[kind]}
                defaultValue={defaults[kind]}
                global
                onRecord={(accelerator) => recordGlobal(kind, accelerator)}
                {...recorderProps(row)}
              />
            </SettingsRow>
          );
        })}
      </SettingsSection>

      {[
        { title: "settings.toolsSection", actions: TOOL_ACTIONS, reset: true },
        { title: "settings.editorSection", actions: OTHER_ACTIONS, reset: false },
      ].map(({ title, actions, reset }) => (
        <SettingsSection
          key={title}
          compact
          title={t(title)}
          action={
            reset && Object.keys(preferences.editorShortcuts).length > 0 ? (
              <button type="button" className="shortcuts-page__reset-all" onClick={resetEditor}>
                {t("settings.resetEditor")}
              </button>
            ) : undefined
          }
        >
          {actions.map((action) => {
            const row: RowId = `editor:${action.id}`;
            return (
              <SettingsRow key={action.id} label={t(action.label)} error={error?.row === row ? error.message : null}>
                <ShortcutRecorder
                  value={editorBindings[action.id]}
                  defaultValue={action.default}
                  global={false}
                  onRecord={(accelerator) => recordEditor(action.id, accelerator)}
                  {...recorderProps(row)}
                />
              </SettingsRow>
            );
          })}
        </SettingsSection>
      ))}

      <p className="shortcuts-page__fixed">{t("settings.fixedKeys")}</p>
    </SettingsPage>
  );
}
