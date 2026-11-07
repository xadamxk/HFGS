// Opens Chrome for Testing for trying the extension and for automation.
// Run with `npm run browser [url]`. Same setup as HF-Convo-Anywhere's scripts/browser.js.
//
// - Chrome for Testing is installed into .chrome-for-testing/ on first run.
//   Unlike regular Chrome, it still accepts --load-extension.
// - Its profile is kept in .browser-profile/, so a Hack Forums sign-in
//   survives restarts. Both folders are gitignored: the profile holds your
//   cookies, so never share or commit it.
// - Remote debugging listens on 127.0.0.1:9222 (set CDP_PORT to change it),
//   so scripts (probe.js, capture.js) can drive this browser.
// - The built extension in dist/ is loaded when it exists (the MV3 rewrite).
//   Until then the browser opens without it: the old MV2 extension at the
//   repo root can't load in current Chrome, and Phase 0 looks at the bare site.
/* global chrome -- only inside page.evaluate on chrome://extensions */
const fs = require("fs");
const path = require("path");
const {
  Browser,
  computeExecutablePath,
  detectBrowserPlatform,
  getInstalledBrowsers,
  install,
  resolveBuildId,
} = require("@puppeteer/browsers");
const puppeteer = require("puppeteer-core");

const root = path.resolve(__dirname, "..");
const cacheDir = path.join(root, ".chrome-for-testing");
const profileDir = path.join(root, ".browser-profile");
const dist = path.join(root, "dist");
const PORT = Number(process.env.CDP_PORT) || 9222;
const START_URL = process.argv[2] || "https://hackforums.net/blackjack.php";

/** The newest installed Chrome for Testing, installing Stable if there's none. */
async function chromePath() {
  const installed = (await getInstalledBrowsers({ cacheDir }))
    .filter((browser) => browser.browser === Browser.CHROME)
    .sort((a, b) =>
      b.buildId.localeCompare(a.buildId, undefined, { numeric: true })
    );
  if (installed.length) return installed[0].executablePath;
  const platform = detectBrowserPlatform();
  const buildId = await resolveBuildId(Browser.CHROME, platform, "stable");
  console.log(`Installing Chrome for Testing ${buildId}…`);
  await install({ browser: Browser.CHROME, buildId, cacheDir });
  return computeExecutablePath({ browser: Browser.CHROME, buildId, cacheDir });
}

/**
 * Chrome turns a --load-extension extension off ("unsupported developer
 * extension") unless Developer mode is on, so turn it on and the extension
 * back on, from chrome://extensions (the only page with these APIs).
 */
async function enableExtension(browser) {
  const page = await browser.newPage();
  try {
    await page.goto("chrome://extensions");
    const state = await page.evaluate(async (dir) => {
      const api = chrome.developerPrivate;
      await api.updateProfileConfiguration({ inDeveloperMode: true });
      const norm = (p) => p.replace(/[\\/]+$/, "").toLowerCase();
      const ours = (await api.getExtensionsInfo()).find(
        (info) => info.path && norm(info.path) === norm(dir)
      );
      if (!ours) return "missing";
      if (ours.state !== "ENABLED")
        await new Promise((resolve) =>
          chrome.management.setEnabled(ours.id, true, resolve)
        );
      return "enabled";
    }, dist);
    if (state === "missing")
      console.warn("The extension didn't load; check chrome://extensions.");
  } finally {
    await page.close();
  }
}

async function main() {
  const withExtension = fs.existsSync(path.join(dist, "manifest.json"));
  const browser = await puppeteer.launch({
    executablePath: await chromePath(),
    headless: false,
    userDataDir: profileDir,
    defaultViewport: null,
    // Puppeteer turns extensions off by default
    ignoreDefaultArgs: withExtension ? ["--disable-extensions"] : [],
    args: [
      ...(withExtension ? [`--load-extension=${dist}`] : []),
      `--remote-debugging-port=${PORT}`,
      "--remote-debugging-address=127.0.0.1",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  if (withExtension) await enableExtension(browser);
  const [page] = await browser.pages();
  await (page ?? (await browser.newPage())).goto(START_URL);
  console.log(
    `Chrome for Testing is open ${withExtension ? "with dist/ loaded" : "without the extension (no dist/ build yet)"}` +
      ` (debugging on 127.0.0.1:${PORT}). Close the window to stop.`
  );
  browser.on("disconnected", () => process.exit(0));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
