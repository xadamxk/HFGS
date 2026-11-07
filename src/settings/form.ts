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
  /** Settings page: a line under a group's heading, by group name. */
  intros?: Record<string, string>;
  /** Settings page: these groups come first, in this order. */
  firstGroups?: string[];
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
  const { groups, nests } = options.compact
    ? { groups: groupRows(form, rows, options), nests: [] }
    : pageGroups(form, rows, options);

  // Settings that only apply while a checkbox is on are disabled while it's
  // off (and on the settings page, hidden when nested under it), and those a
  // checkbox overrides are disabled while it's on.
  const updateEnabled = () => {
    for (const row of rows) {
      const { enabledBy, disabledBy } = row.definition;
      if (!enabledBy && !disabledBy) continue;
      row.setEnabled(
        (!enabledBy || current[enabledBy] === true) &&
          (!disabledBy || current[disabledBy] !== true)
      );
    }
    for (const nest of nests)
      nest.element.hidden = current[nest.parent] !== true;
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

/** Rows by group name, in the order the groups first appear. */
function byGroup(
  rows: Row[],
  nameOf: (row: Row) => string
): Map<string, Row[]> {
  const members = new Map<string, Row[]>();
  for (const row of rows) {
    const name = nameOf(row);
    if (!members.has(name)) members.set(name, []);
    members.get(name)!.push(row);
  }
  return members;
}

/**
 * The game page: the rows in their groups, each under its heading. Returns
 * each group's box by name (the settings without a group are under "").
 */
function groupRows(
  form: HTMLFormElement,
  rows: Row[],
  { title }: SettingsFormOptions
): Map<string, HTMLElement> {
  const boxes = new Map<string, HTMLElement>();
  for (const [name, members] of byGroup(
    rows,
    (row) => row.definition.group ?? ""
  )) {
    const heading = name || title;
    const box = el(
      "div",
      { class: "hfgs-settings-group", "data-group": name || null },
      [
        heading && el("div", { class: "hfgs-settings-title" }, heading),
        el(
          "div",
          { class: "hfgs-settings-grid" },
          members.map((row) => row.element)
        ),
      ]
    );
    boxes.set(name, box);
    form.append(box);
  }
  return boxes;
}

interface Nest {
  /** The checkbox setting that shows these settings while it's on. */
  parent: string;
  element: HTMLElement;
}

/**
 * The settings page: a card per group (its pageGroup, else its group; the
 * settings without either under the title), with the settings that need a
 * checkbox nested under it and same-width settings side by side. Returns
 * each card by name and the nested boxes, to hide while their checkbox is off.
 */
function pageGroups(
  form: HTMLFormElement,
  rows: Row[],
  { title = "", intros = {}, firstGroups = [] }: SettingsFormOptions
): { groups: Map<string, HTMLElement>; nests: Nest[] } {
  const members = byGroup(
    rows,
    (row) => row.definition.pageGroup ?? row.definition.group ?? title
  );
  const rank = (name: string) => {
    const i = firstGroups.indexOf(name);
    return i < 0 ? firstGroups.length : i;
  };
  const order = [...members.keys()].sort((a, b) => rank(a) - rank(b));

  const groups = new Map<string, HTMLElement>();
  const nests: Nest[] = [];
  for (const name of order) {
    const groupRows = members.get(name)!;
    const byId = new Map<string, Row>(
      groupRows.map((row) => [row.definition.id, row])
    );
    // Nested: needs a checkbox in this card that isn't nested itself
    const parentOf = (row: Row): Row | undefined => {
      const enabledBy: string | undefined = row.definition.enabledBy;
      const parent = enabledBy ? byId.get(enabledBy) : undefined;
      return parent &&
        parent !== row &&
        parent.definition.type === "checkbox" &&
        !parentOf(parent)
        ? parent
        : undefined;
    };
    const children = new Map<Row, Row[]>();
    const top: Row[] = [];
    for (const row of groupRows) {
      const parent = parentOf(row);
      if (parent) children.set(parent, [...(children.get(parent) ?? []), row]);
      else top.push(row);
    }

    const items = columns(
      top.map((row) => {
        const kids = children.get(row);
        const { warning, width, id } = row.definition;
        const note = warning ? el("p", { class: "warning" }, warning) : null;
        if (!kids && !note) return { width, element: row.element };
        if (!kids)
          return { width, element: el("div", null, [row.element, note]) };
        const nest = el("div", { class: "nest", "data-nest": id }, [
          ...columns(
            kids.map((kid) => ({
              width: kid.definition.width,
              element: kid.element,
            }))
          ),
          note,
        ]);
        nests.push({ parent: id, element: nest });
        return { width, element: el("div", null, [row.element, nest]) };
      })
    );
    items.forEach((item) => item.classList.add("item"));
    const card = el("div", { class: "card", "data-group": name || null }, [
      name && el("h2", null, name),
      intros[name] && el("p", { class: "description intro" }, intros[name]),
      ...items,
    ]);
    groups.set(name, card);
    form.append(card);
  }
  return { groups, nests };
}

/** Runs of same-width settings go side by side; the rest stay full width. */
function columns(
  items: { width?: "half" | "third"; element: HTMLElement }[]
): HTMLElement[] {
  const out: HTMLElement[] = [];
  let run: HTMLElement[] = [];
  let runWidth: "half" | "third" | undefined;
  const flush = () => {
    if (run.length)
      out.push(
        el("div", { class: `cols cols-${runWidth === "half" ? 2 : 3}` }, run)
      );
    run = [];
  };
  for (const item of items) {
    if (!item.width || item.width !== runWidth) flush();
    runWidth = item.width;
    if (item.width) run.push(item.element);
    else out.push(item.element);
  }
  flush();
  return out;
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
  // Compact rows show the description (and any detail) on hover instead
  const tip = compact
    ? [setting.description, setting.detail, setting.warning]
        .filter(Boolean)
        .join(" ")
    : null;
  // The settings page shows the detail as an ⓘ beside the label
  const info =
    !compact && setting.detail
      ? el(
          "span",
          {
            class: "info",
            title: setting.detail,
            role: "img",
            "aria-label": setting.detail,
            tabindex: 0,
          },
          "?"
        )
      : null;

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
              el("div", { class: "label-line" }, [
                el("label", { for: inputId }, setting.label),
                info,
              ]),
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
          el("legend", null, [setting.label, info]),
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
            el("div", { class: "label-line" }, [
              el("label", { for: inputId }, [
                setting.label,
                setting.unit && el("span", { class: "unit" }, setting.unit),
              ]),
              info,
            ]),
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
