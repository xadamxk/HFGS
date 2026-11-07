import { SettingDefinition } from "./definitions";
import { settingsForm } from "./form";

interface Example {
  on: boolean;
  amount: number;
}

const DEFINITIONS: SettingDefinition<Example>[] = [
  {
    type: "checkbox",
    id: "on",
    label: "On",
    description: "Short.",
    detail: "The longer story.",
    warning: "Careful.",
    default: false,
  },
  {
    type: "number",
    id: "amount",
    label: "Amount",
    description: "How much.",
    default: 1,
    min: 1,
    max: 10,
    step: 1,
    enabledBy: "on",
  },
];

describe("settingsForm", () => {
  it("puts the detail and warning in the game page's tooltip, and keeps its groups flat", () => {
    const form = settingsForm("x", DEFINITIONS, {}, () => undefined, {
      compact: true,
    });
    const row =
      form.element.querySelector<HTMLElement>("#x-on")!.parentElement!;
    expect(row.title).toBe("Short. The longer story. Careful.");
    expect(form.element.querySelector(".nest, .info, .card")).toBeNull();
  });

  it("nests on the settings page, with the warning shown only while it applies", () => {
    const form = settingsForm("x", DEFINITIONS, {}, () => undefined);
    const nest = form.element.querySelector<HTMLElement>(".nest")!;
    expect(nest.contains(form.element.querySelector("#x-amount"))).toBe(true);
    expect(nest.querySelector(".warning")?.textContent).toBe("Careful.");
    expect(nest.hidden).toBe(true);
  });
});
