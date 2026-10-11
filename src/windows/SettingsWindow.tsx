import { ComponentType, useState } from "react";
import { Info, Keyboard, LucideIcon, SlidersHorizontal } from "lucide-react";
import { t } from "../lib/i18n";
import { GeneralPage } from "../features/settings/pages/GeneralPage";
import { ShortcutsPage } from "../features/settings/pages/ShortcutsPage";
import { AboutPage } from "../features/settings/pages/AboutPage";
import "./SettingsWindow.css";

interface Page {
  id: string;
  label: string;
  icon: LucideIcon;
  component: ComponentType;
}

/**
 * Every settings page, in sidebar order. Adding a page is one entry here.
 *
 * Each inner array is a sidebar group: things that change how Shota
 * behaves first, and About on its own below a divider, because it isn't a
 * setting.
 */
const PAGES: Page[][] = [
  [
    { id: "general", label: "settings.general", icon: SlidersHorizontal, component: GeneralPage },
    { id: "shortcuts", label: "settings.shortcuts", icon: Keyboard, component: ShortcutsPage },
  ],
  [{ id: "about", label: "settings.about", icon: Info, component: AboutPage }],
];

export function SettingsWindow() {
  const [active, setActive] = useState(PAGES[0][0].id);
  const Current = PAGES.flat().find((page) => page.id === active)!.component;

  return (
    <div className="settings-window">
      <nav className="settings-window__sidebar">
        <div className="settings-window__brand">
          <img src="/logo.png" alt="" className="settings-window__logo" />
          <span>Shota</span>
        </div>

        {PAGES.map((group, i) => (
          <div key={i} className="settings-window__group">
            {group.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`settings-window__nav${id === active ? " settings-window__nav--active" : ""}`}
                aria-current={id === active ? "page" : undefined}
                onClick={() => setActive(id)}
              >
                <Icon size={16} strokeWidth={1.75} />
                {t(label)}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <main className="settings-window__content">
        <Current />
      </main>
    </div>
  );
}
