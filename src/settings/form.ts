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
  /** Heading for the settings that have no group. */
  title?: string;
}

export interface SettingsForm {
  element: HTMLFormElement;
  /**
   * Show values changed elsewhere (another page or tab). An input being typed
   * in keeps what the user is typing.
   */
  setValues(values: SettingValues): void;
  /** A group's box, to add a note to it; undefined if there's no such group. */
  group(name: string): HTMLElement | undefined;
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
  const groups = groupRows(form, rows, options);

  // Settings that only apply while a checkbox is on are disabled while it's
  // off, and those a checkbox overrides are disabled while it's on.
  const updateEnabled = () => {
    for (const row of rows) {
      const { enabledBy, disabledBy } = row.definition;
      if (!enabledBy && !disabledBy) continue;
      row.setEnabled(
        (!enabledBy || current[enabledBy] === true) &&
          (!disabledBy || current[disabledBy] !== true)
      );
    }
  };
  updateEnabled();

  return {
    element: form,
    group: (name) => groups.get(name),
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

/**
 * Put the rows in their groups, each under its heading. Returns each group's
 * box by name (the settings without a group are under "").
 */
function groupRows(
  form: HTMLFormElement,
  rows: Row[],
  { compact = false, title }: SettingsFormOptions
): Map<string, HTMLElement> {
  const order: string[] = [];
  const members = new Map<string, HTMLElement[]>();
  for (const row of rows) {
    const name = row.definition.group ?? "";
    if (!members.has(name)) {
      members.set(name, []);
      order.push(name);
    }
    members.get(name)!.push(row.element);
  }
  const boxes = new Map<string, HTMLElement>();
  for (const name of order) {
    const heading = name || title;
    const box = compact
      ? el(
          "div",
          { class: "hfgs-settings-group", "data-group": name || null },
          [
            heading && el("div", { class: "hfgs-settings-title" }, heading),
            el("div", { class: "hfgs-settings-grid" }, members.get(name)!),
          ]
        )
      : el("div", { class: "group", "data-group": name || null }, [
          heading && el("h3", { class: "group-title" }, heading),
          ...members.get(name)!,
        ]);
    boxes.set(name, box);
    form.append(box);
  }
  return boxes;
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
      // The unit goes in the label, e.g. "Bet (βytes)", so inputs line up
      const label = setting.unit
        ? `${setting.label} (${setting.unit})`
        : setting.label;
      const field = el(
        "div",
        { class: compact ? "hfgs-field" : "field" },
        input
      );
      const element = compact
        ? el("div", { class: "hfgs-setting hfgs-setting-number", title: tip }, [
            el("label", { for: inputId }, label),
            field,
          ])
        : el("div", { class: "row number" }, [
            el("label", { for: inputId }, label),
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
