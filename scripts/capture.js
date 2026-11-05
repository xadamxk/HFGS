// Phase 0: records HF's game requests and responses while you play by hand in
// the test browser, so the rewrite has real fixtures. Needs `npm run browser` running.
// Run with `npm run capture`, play a few hands / spins, then press Ctrl+C.
// The script sends nothing itself. my_post_key is redacted before saving.
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const PORT = Number(process.env.CDP_PORT) || 9222;
const MATCH = /hackforums\.net\/(blackjack\/blackjack_action\.php|slots\/[^?]*\.php)/;
const outDir = path.join(__dirname, "..", "fixtures", "responses");
const redact = (s) => (s || "").replace(/(my_post_key=)[^&]*/g, "$1REDACTED");

let count = 0;
const watched = new WeakSet();

function watch(page) {
  if (watched.has(page)) return;
  watched.add(page);
  page.on("response", async (response) => {
    const request = response.request();
    if (!MATCH.test(request.url())) return;
    let body;
    try {
      body = await response.text();
    } catch {
      body = null;
    }
    let json = null;
    try {
      json = JSON.parse(body);
    } catch {
      /* not JSON */
    }
    // Error responses can be full HTML pages that embed the post key, so scrub it from the body too.
    const postKey = (request.postData() || "").match(/my_post_key=([^&]+)/)?.[1];
    if (postKey && typeof body === "string") body = body.split(postKey).join("REDACTED");
    const url = new URL(request.url());
    const action = url.searchParams.get("action") || path.basename(url.pathname, ".php");
    const entry = {
      capturedAt: new Date().toISOString(),
      method: request.method(),
      url: request.url(),
      requestBody: redact(request.postData()),
      status: response.status(),
      // Non-JSON answers are full HF pages carrying session tokens (logout key etc.): keep only a summary.
      response: json ?? {
        nonJson: true,
        contentLength: (body || "").length,
        title: (body || "").match(/<title>([^<]*)/)?.[1] ?? null,
      },
    };
    const file = path.join(outDir, `${String(++count).padStart(3, "0")}-${action}.json`);
    fs.writeFileSync(file, JSON.stringify(entry, null, 2));
    const outcome = json?.data ? ` outcome1=${json.data.outcome1} turn=${json.data.turn}` : "";
    console.log(`${action} ${response.status()}${outcome} -> ${path.relative(process.cwd(), file)}`);
  });
}

async function main() {
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
  fs.mkdirSync(outDir, { recursive: true });
  // Continue numbering after existing captures so earlier fixtures are never overwritten.
  count = Math.max(0, ...fs.readdirSync(outDir).map((f) => parseInt(f, 10) || 0));
  for (const page of await browser.pages()) watch(page);
  browser.on("targetcreated", async (target) => {
    const page = await target.page();
    if (page) watch(page);
  });
  console.log("Capturing HF blackjack/slots requests. Play in the test browser; Ctrl+C to stop.");
  process.on("SIGINT", () => {
    console.log(`\nCaptured ${count} responses into ${path.relative(process.cwd(), outDir)}`);
    browser.disconnect();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
