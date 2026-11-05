import { el } from "../core/Dom";
import { removeItem, STORAGE_KEYS } from "../core/storage";
import { GAMES } from "../games/registry";
import {
  defaultsOf,
  normalizeNumber,
  SettingDefinition,
  SettingValues,
} from "../settings/definitions";
import {
  GLOBAL_SETTINGS,
  GlobalSettings,
  HfgsSettings,
  defaultSettings,
  loadSettings,
  saveSettings,
} from "../settings";

/**
 * The settings page: a section for the global settings and one per game, all
 * generated from their definitions and saved as soon as anything changes. Open
 * game pages pick changes up right away (see watchSettings).
 */
export async function renderOptions(root: HTMLElement): Promise<void> {
  let settings = await loadSettings();
  const status = el("p", { class: "status", role: "status" });
  let statusTimer: ReturnType<typeof setTimeout> | undefined;

  const showStatus = (message: string, isError = false) => {
    status.textContent = message;
    status.classList.toggle("error", isError);
    clearTimeout(statusTimer);
    if (!isError) {
      statusTimer = setTimeout(() => (status.textContent = ""), 2500);
    }
  };

  const persist = async (next: HfgsSettings) => {
    settings = next;
    try {
      await saveSettings(settings);
      showStatus("Saved.");
    } catch (error) {
      showStatus(`Couldn't save: ${(error as Error)?.message}`, true);
    }
  };

  const globalForm = settingsForm(
    "global",
    GLOBAL_SETTINGS,
    settings.global as unknown as SettingValues,
    (change) =>
      persist({
        ...settings,
        global: { ...settings.global, ...change } as GlobalSettings,
      })
  );
  const gameSections = GAMES.map((game) =>
    el("section", { "data-game": game.id }, [
      el("h2", null, game.name),
      el("p", { class: "description intro" }, game.description),
      settingsForm(game.id, game.settings, settings.games[game.id], (change) =>
        persist({
          ...settings,
          games: {
            ...settings.games,
            [game.id]: { ...settings.games[game.id], ...change },
          },
        })
      ),
    ])
  );

  const reset = el("button", { type: "button", class: "secondary" }, [
    "Reset all settings to defaults",
  ]);
  reset.addEventListener("click", async () => {
    await persist(defaultSettings());
    await renderOptions(root);
  });

  root.replaceChildren(
    el("header", null, [
      el("img", { src: "assets/icons/icon48.png", alt: "", width: 32 }),
      el("h1", null, "HF Gambling Suite"),
    ]),
    el("section", { "data-game": "global" }, [
      el("h2", null, "All games"),
      globalForm,
    ]),
    ...gameSections,
    el("section", null, [
      el("h2", null, "Stored data"),
      ...GAMES.map((game) =>
        storageRow(
          STORAGE_KEYS.history(game.id),
          `${game.name} history`,
          `Every ${game.name.toLowerCase()} result and the overall totals (this browser only).`,
          showStatus
        )
      ),
    ]),
    reset,
    status
  );
}

/** A form with one row per setting; `save` gets just the changed value. */
function settingsForm<T>(
  scope: string,
  definitions: SettingDefinition<T>[],
  values: SettingValues,
  save: (change: SettingValues) => void
): HTMLFormElement {
  const current: SettingValues = { ...defaultsOf(definitions), ...values };
  const form = el("form", { class: "settings", novalidate: true });
  form.addEventListener("submit", (event) => event.preventDefault());

  const rows = definitions.map((definition) =>
    settingRow(
      `${scope}-${definition.id}`,
      definition as SettingDefinition<SettingValues>,
      current,
      (change) => {
        Object.assign(current, change);
        updateEnabled();
        save(change);
      }
    )
  );
  form.append(...rows.map((row) => row.element));

  // Settings that only apply while a checkbox is on are disabled while it's off.
  const updateEnabled = () => {
    for (const row of rows) {
      const { enabledBy } = row.definition;
      if (enabledBy) row.setEnabled(current[enabledBy] === true);
    }
  };
  updateEnabled();
  return form;
}

interface Row {
  definition: SettingDefinition<SettingValues>;
  element: HTMLElement;
  setEnabled: (enabled: boolean) => void;
}

function settingRow(
  inputId: string,
  setting: SettingDefinition<SettingValues>,
  values: SettingValues,
  save: (change: SettingValues) => void
): Row {
  const description = el(
    "p",
    { class: "description", id: `${inputId}-description` },
    setting.description
  );

  switch (setting.type) {
    case "checkbox": {
      const input = el("input", {
        type: "checkbox",
        id: inputId,
        name: setting.id,
        "aria-describedby": description.id,
        checked: values[setting.id] === true,
      });
      input.addEventListener("change", () =>
        save({ [setting.id]: input.checked })
      );
      const element = el("div", { class: "row checkbox" }, [
        input,
        el("div", null, [
          el("label", { for: inputId }, setting.label),
          description,
        ]),
      ]);
      return {
        definition: setting,
        element,
        setEnabled: rowEnabler(element, [input]),
      };
    }
    case "radio": {
      const inputs = setting.options.map((option) =>
        el("input", {
          type: "radio",
          name: inputId,
          value: option.value,
          checked: option.value === values[setting.id],
        })
      );
      inputs.forEach((input) =>
        input.addEventListener("change", () => {
          if (input.checked) save({ [setting.id]: input.value });
        })
      );
      const element = el(
        "fieldset",
        { class: "row radio", "aria-describedby": description.id },
        [
          el("legend", null, setting.label),
          description,
          el(
            "div",
            { class: "choices" },
            setting.options.map((option, i) =>
              el("label", { class: "choice" }, [inputs[i], option.label])
            )
          ),
        ]
      );
      return {
        definition: setting,
        element,
        setEnabled: rowEnabler(element, inputs),
      };
    }
    case "number": {
      const input = el("input", {
        type: "number",
        id: inputId,
        name: setting.id,
        min: setting.min,
        max: setting.max,
        step: setting.step,
        value: values[setting.id] as number,
        "aria-describedby": description.id,
      });
      input.addEventListener("change", () => {
        const value = normalizeNumber(setting, input.value);
        if (value === null) {
          input.value = String(values[setting.id]);
          return;
        }
        input.value = String(value);
        save({ [setting.id]: value });
      });
      const element = el("div", { class: "row number" }, [
        el("label", { for: inputId }, setting.label),
        description,
        el("div", { class: "field" }, [
          input,
          setting.unit && el("span", { class: "unit" }, setting.unit),
        ]),
      ]);
      return {
        definition: setting,
        element,
        setEnabled: rowEnabler(element, [input]),
      };
    }
  }
}

function rowEnabler(row: HTMLElement, inputs: HTMLInputElement[]) {
  return (enabled: boolean) => {
    inputs.forEach((input) => (input.disabled = !enabled));
    row.classList.toggle("disabled", !enabled);
  };
}

function storageRow(
  key: string,
  label: string,
  description: string,
  showStatus: (message: string, isError?: boolean) => void
): HTMLElement {
  const clear = el("button", { type: "button", class: "secondary" }, "Clear");
  clear.addEventListener("click", async () => {
    try {
      await removeItem(key);
      showStatus(`${label} cleared.`);
    } catch (error) {
      showStatus(`Couldn't clear: ${(error as Error)?.message}`, true);
    }
  });
  return el("div", { class: "row storage", "data-key": key }, [
    el("div", null, [
      el("strong", null, label),
      el("p", { class: "description" }, description),
    ]),
    clear,
  ]);
}
