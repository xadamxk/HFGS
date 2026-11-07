/**
 * Settings described as data: the options page renders them, and stored values
 * are checked against them. Used for each game's settings and the Hack Game's.
 */

/**
 * The group for every setting that decides when a run ends: each game's round
 * count, stop-loss and take-profit (the Hack Game's job limit too).
 */
export const STOP_GROUP = "Stop the bot";

export type SettingValue = boolean | number | string;
export type SettingValues = Record<string, SettingValue>;

type KeysOfType<T, V> = {
  [K in keyof T]: T[K] extends V ? K : never;
}[keyof T] &
  string;

interface BaseDefinition<T, K extends keyof T & string> {
  id: K;
  label: string;
  description: string;
  /**
   * Settings with the same group are shown together under it as a heading, in
   * the order the groups first appear. Settings without one come under the
   * form's own title, if it has one.
   */
  group?: string;
  /**
   * The settings page's group (its card) when it differs from `group`, which
   * the game page keeps using.
   */
  pageGroup?: string;
  /**
   * Settings page: puts this beside its neighbors of the same width, two
   * ("half") or three ("third") to a row.
   */
  width?: "half" | "third";
  /**
   * More detail than the description: an ⓘ tooltip on the settings page,
   * added to the setting's tooltip on the game page.
   */
  detail?: string;
  /**
   * Settings page: a warning under this setting, inside the settings nested
   * under it if it has any (so it shows only while they apply).
   */
  warning?: string;
  /**
   * A checkbox setting that must be on for this one to apply (it's disabled
   * otherwise). On the settings page, a setting in the same group as its
   * checkbox is nested under it and hidden while it's off.
   */
  enabledBy?: KeysOfType<T, boolean>;
  /** A checkbox setting that makes this one not apply while it's on (disabled then). */
  disabledBy?: KeysOfType<T, boolean>;
}

export interface CheckboxDefinition<T> extends BaseDefinition<
  T,
  KeysOfType<T, boolean>
> {
  type: "checkbox";
  default: boolean;
}

export interface RadioDefinition<T> extends BaseDefinition<
  T,
  KeysOfType<T, string>
> {
  type: "radio";
  default: string;
  options: { label: string; value: string }[];
}

export interface NumberDefinition<T> extends BaseDefinition<
  T,
  KeysOfType<T, number>
> {
  type: "number";
  default: number;
  min: number;
  max: number;
  /** Values are rounded to a multiple of this from `min` (e.g. 1, 100 or 0.05). */
  step: number;
  /** Shown in brackets after the label, e.g. "βytes" or "ms". */
  unit?: string;
  /** Only these values are valid (e.g. a game's bet steps); input snaps to the nearest. */
  allowed?: number[];
}

export type SettingDefinition<T> =
  CheckboxDefinition<T> | RadioDefinition<T> | NumberDefinition<T>;

export function defaultsOf<T>(definitions: SettingDefinition<T>[]): T {
  return Object.fromEntries(
    definitions.map((definition) => [definition.id, definition.default])
  ) as T;
}

/**
 * A number setting's value from user or stored input: clamped to min/max and
 * rounded to the step, or snapped to the nearest allowed value (the lower one
 * on a tie). Returns null when the input isn't a number.
 */
export function normalizeNumber(
  definition: Pick<
    NumberDefinition<unknown>,
    "min" | "max" | "step" | "allowed"
  >,
  input: unknown
): number | null {
  if (input === "" || input === null || typeof input === "boolean") return null;
  const number = Number(input);
  if (!Number.isFinite(number)) return null;
  const { min, max, step, allowed } = definition;
  if (allowed?.length) {
    return allowed.reduce((best, value) =>
      Math.abs(value - number) < Math.abs(best - number) ? value : best
    );
  }
  const stepped = min + Math.round((number - min) / step) * step;
  const decimals = (String(step).split(".")[1] || "").length;
  const rounded = Number(stepped.toFixed(decimals));
  return Math.min(max, Math.max(min, rounded));
}

/**
 * Keep only valid stored values, falling back to each setting's default (for
 * missing, older or hand-edited values). Unknown keys are dropped.
 */
export function normalizeValues<T>(
  definitions: SettingDefinition<T>[],
  stored: unknown
): T {
  const source = (stored && typeof stored === "object" ? stored : {}) as Record<
    string,
    unknown
  >;
  const values: Record<string, unknown> = {};
  for (const definition of definitions) {
    const value = source[definition.id];
    values[definition.id] = definition.default;
    switch (definition.type) {
      case "checkbox":
        if (typeof value === "boolean") values[definition.id] = value;
        break;
      case "radio":
        if (definition.options.some((option) => option.value === value)) {
          values[definition.id] = value;
        }
        break;
      case "number": {
        const number = normalizeNumber(definition, value);
        if (number !== null) values[definition.id] = number;
        break;
      }
    }
  }
  return values as T;
}
