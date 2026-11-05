/**
 * A form for a list of settings, built from their definitions. Used by the
 * settings page and, in a compact layout, by the panel on each game page, so
 * both apply the same limits, rounding and "only applies when…" rules.
 */

import { el } from "../core/Dom";
import {
  defaultsOf,
  normalizeNumber,
  SettingDefinition,
  SettingValue,
  SettingValues,
} from "./definitions";

export interface SettingsFormOptions {
  /**
   * Compact layout for the game page: descriptions become tooltips and number
   * inputs get HF's own `textbox` class so they follow the forum theme.
   */
  compact?: boolean;
}

export interface SettingsForm {
  element: HTMLFormElement;
  /**
   * Show values changed elsewhere (another page or tab). An input being typed
   * in keeps what the user is typing.
   */
  setValues(values: SettingValues): void;
}

interface Row {
  definition: SettingDefinition<SettingValues>;
  element: HTMLElement;
  setEnabled: (enabled: boolean) => void;
  setValue: (value: SettingValue) => void;
}

/** A form with one row per setting; `save` gets just the changed value. */
export function settingsForm<T>(
  scope: string,
  definitions: SettingDefinition<T>[],
  values: SettingValues,
  save: (change: SettingValues) => void,
  options: SettingsFormOptions = {}
): SettingsForm {
  const current: SettingValues = { ...defaultsOf(definitions), ...values };
  const form = el("form", {
    class: options.compact ? "hfgs-settings" : "settings",
    novalidate: true,
  });
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
      },
      options
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

  return {
    element: form,
    setValues(next) {
      for (const row of rows) {
        const value = next[row.definition.id];
        if (value === undefined || value === current[row.definition.id])
          continue;
        current[row.definition.id] = value;
        row.setValue(value);
      }
      updateEnabled();
    },
  };
}

function settingRow(
  inputId: string,
  setting: SettingDefinition<SettingValues>,
  values: SettingValues,
  save: (change: SettingValues) => void,
  { compact = false }: SettingsFormOptions
): Row {
  const description = compact
    ? null
    : el(
        "p",
        { class: "description", id: `${inputId}-description` },
        setting.description
      );
  const describedBy = description ? description.id : null;
  // Compact rows show the description on hover instead
  const tip = compact ? setting.description : null;

  switch (setting.type) {
    case "checkbox": {
      const input = el("input", {
        type: "checkbox",
        id: inputId,
        name: setting.id,
        "aria-describedby": describedBy,
        "aria-description": tip,
        checked: values[setting.id] === true,
      });
      input.addEventListener("change", () =>
        save({ [setting.id]: input.checked })
      );
      const element = compact
        ? el("div", { class: "hfgs-setting hfgs-setting-check", title: tip }, [
            input,
            el("label", { for: inputId }, setting.label),
          ])
        : el("div", { class: "row checkbox" }, [
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
        setValue: (value) => (input.checked = value === true),
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
        {
          class: compact ? "hfgs-setting hfgs-setting-radio" : "row radio",
          "aria-describedby": describedBy,
          title: tip,
        },
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
        setValue: (value) =>
          inputs.forEach((input) => (input.checked = input.value === value)),
      };
    }
    case "number": {
      const input = el("input", {
        type: "number",
        id: inputId,
        name: setting.id,
        class: compact ? "textbox" : null,
        min: setting.min,
        max: setting.max,
        step: setting.step,
        value: values[setting.id] as number,
        "aria-describedby": describedBy,
        "aria-description": tip,
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
      const field = el("div", { class: compact ? "hfgs-field" : "field" }, [
        input,
        setting.unit && el("span", { class: "unit" }, setting.unit),
      ]);
      const element = compact
        ? el("div", { class: "hfgs-setting hfgs-setting-number", title: tip }, [
            el("label", { for: inputId }, setting.label),
            field,
          ])
        : el("div", { class: "row number" }, [
            el("label", { for: inputId }, setting.label),
            description,
            field,
          ]);
      return {
        definition: setting,
        element,
        setEnabled: rowEnabler(element, [input]),
        setValue: (value) => {
          // Don't overwrite what the user is typing
          if (document.activeElement !== input) input.value = String(value);
        },
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
