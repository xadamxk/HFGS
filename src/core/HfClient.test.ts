import { HfClient, HfError } from "./HfClient";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as Response;
}

function client(
  fetchImpl: jest.Mock,
  extra: Partial<ConstructorParameters<typeof HfClient>[0]> = {}
) {
  let clock = 0;
  const sleeps: number[] = [];
  const instance = new HfClient({
    postKey: "abc123",
    minIntervalMs: 1000,
    fetch: fetchImpl as unknown as typeof fetch,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    ...extra,
  });
  return { instance, sleeps, advance: (ms: number) => (clock += ms) };
}

describe("HfClient", () => {
  it("posts a form with the post key and returns the JSON", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse({ success: true, credits: 5 }));
    const { instance } = client(fetchImpl);
    await expect(
      instance.post("/slots/spin.php", { bet: 1, windowID: "9" })
    ).resolves.toEqual({
      success: true,
      credits: 5,
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://hackforums.net/slots/spin.php");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.headers["X-Requested-With"]).toBe("XMLHttpRequest");
    expect(new URLSearchParams(init.body).toString()).toBe(
      "bet=1&windowID=9&my_post_key=abc123"
    );
  });

  it("runs requests one at a time, spaced by the minimum interval", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchImpl = jest.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      return jsonResponse({ success: true });
    });
    const { instance, sleeps } = client(fetchImpl);
    await Promise.all([
      instance.post("/a", {}),
      instance.post("/b", {}),
      instance.post("/c", {}),
    ]);
    expect(maxInFlight).toBe(1);
    expect(
      fetchImpl.mock.calls.map((call) => (call as unknown as [string])[0])
    ).toEqual([
      "https://hackforums.net/a",
      "https://hackforums.net/b",
      "https://hackforums.net/c",
    ]);
    expect(sleeps).toEqual([1000, 1000]);
  });

  it("doesn't wait when the interval has already passed", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse({ success: true }));
    const { instance, sleeps, advance } = client(fetchImpl);
    await instance.post("/a", {});
    advance(5000);
    await instance.post("/b", {});
    expect(sleeps).toEqual([]);
  });

  it("keeps going after a failed request", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse("<html>", 200))
      .mockResolvedValueOnce(jsonResponse({ success: true, ok: 1 }));
    const { instance } = client(fetchImpl);
    const first = instance.post("/a", {});
    const second = instance.post("/b", {});
    await expect(first).rejects.toMatchObject({ kind: "nonJson" });
    await expect(second).resolves.toEqual({ success: true, ok: 1 });
  });

  it.each([
    ["an HTML page", jsonResponse("<!DOCTYPE html><html>"), "nonJson"],
    [
      "a logged-out answer",
      jsonResponse({ success: false, error: "loggedOut" }),
      "loggedOut",
    ],
    [
      "an HF error",
      jsonResponse({ success: false, error: "Not enough βytes" }),
      "hfError",
    ],
    ["a server error", jsonResponse("oops", 500), "http"],
  ])("turns %s into an HfError", async (_label, response, kind) => {
    const { instance } = client(jest.fn().mockResolvedValue(response));
    const error = await instance.post("/a", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HfError);
    expect((error as HfError).kind).toBe(kind);
  });

  it("reports network failures and missing post keys", async () => {
    const failing = client(
      jest.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    );
    await expect(failing.instance.post("/a", {})).rejects.toMatchObject({
      kind: "network",
    });

    const fetchImpl = jest.fn();
    const signedOut = client(fetchImpl, { postKey: null });
    await expect(signedOut.instance.post("/a", {})).rejects.toMatchObject({
      kind: "noPostKey",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
