import { cardCorner, followConvoDock, placeCard } from "./card";

/** HF Convo Anywhere's dock, as its content script adds it. */
function addConvoDock(left = false): HTMLElement {
  const dock = document.createElement("div");
  dock.id = "hfx-chat-dock";
  if (left) dock.className = "hfx-chat-left";
  document.body.append(dock);
  return dock;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => document.body.replaceChildren());

describe("status card next to HF Convo Anywhere", () => {
  it("sits bottom right on its own, and opposite Convo's dock otherwise", () => {
    expect(cardCorner(document)).toBe("right");
    const dock = addConvoDock();
    expect(cardCorner(document)).toBe("left");
    dock.classList.add("hfx-chat-left");
    expect(cardCorner(document)).toBe("right");
  });

  it("places the card with left or right", () => {
    const host = document.createElement("div");
    placeCard(host, document);
    expect([host.style.left, host.style.right]).toEqual(["auto", "16px"]);
    addConvoDock();
    placeCard(host, document);
    expect([host.style.left, host.style.right]).toEqual(["16px", "auto"]);
    expect(host.dataset.corner).toBe("left");
  });

  it("moves when Convo's dock appears, switches sides, or goes away", async () => {
    const host = document.createElement("div");
    const stop = followConvoDock(host, document);
    expect(host.dataset.corner).toBe("right");

    const dock = addConvoDock();
    await tick();
    expect(host.dataset.corner).toBe("left");

    dock.classList.add("hfx-chat-left");
    await tick();
    expect(host.dataset.corner).toBe("right");

    dock.classList.remove("hfx-chat-left");
    await tick();
    expect(host.dataset.corner).toBe("left");

    dock.remove();
    await tick();
    expect(host.dataset.corner).toBe("right");
    stop();
  });
});
