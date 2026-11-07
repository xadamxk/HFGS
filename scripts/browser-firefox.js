// Opens Firefox with the built extension loaded as a temporary add-on, for
// trying the Firefox build and for automation. Run with `npm run browser:firefox [url]`
// after `npm run build`. The Firefox counterpart of browser.js.
//
// - Firefox (stable) is installed into .firefox-for-testing/ on first run.
// - Its profile is kept in .browser-profile-firefox/, so a Hack Forums sign-in
//   survives restarts. Both folders are gitignored: the profile holds your
//   cookies, so never share or commit it.
// - dist/ is copied to .firefox-build/ with the Firefox manifest
//   (scripts/firefox-manifest.js) and installed as a temporary add-on, which
//   Firefox removes when it closes; it's reinstalled on every launch.
// - Scripts drive it over WebDriver BiDi: the endpoint is written to
//   .firefox-endpoint (connect with puppeteer.connect({ browserWSEndpoint,
//   protocol: "webDriverBiDi" })).
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
const { firefoxManifest } = require("./firefox-manifest");

const root = path.resolve(__dirname, "..");
const cacheDir = path.join(root, ".firefox-for-testing");
const profileDir = path.join(root, ".browser-profile-firefox");
const dist = path.join(root, "dist");
const build = path.join(root, ".firefox-build");
const endpointFile = path.join(root, ".firefox-endpoint");
const START_URL = process.argv[2] || "https://hackforums.net/blackjack.php";

/** The newest installed Firefox, installing stable if there's none. */
async function firefoxPath() {
  const installed = (await getInstalledBrowsers({ cacheDir }))
    .filter((browser) => browser.browser === Browser.FIREFOX)
    .sort((a, b) =>
      b.buildId.localeCompare(a.buildId, undefined, { numeric: true })
    );
  if (installed.length) return installed[0].executablePath;
  const platform = detectBrowserPlatform();
  const buildId = await resolveBuildId(Browser.FIREFOX, platform, "stable");
  console.log(`Installing Firefox ${buildId}…`);
  await install({ browser: Browser.FIREFOX, buildId, cacheDir });
  return computeExecutablePath({ browser: Browser.FIREFOX, buildId, cacheDir });
}

/** dist/ with the Firefox manifest, ready to install. */
function prepareBuild() {
  if (!fs.existsSync(path.join(dist, "manifest.json"))) {
    throw new Error("No build in dist/. Run `npm run build` first.");
  }
  fs.rmSync(build, { recursive: true, force: true });
  fs.cpSync(dist, build, { recursive: true });
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dist, "manifest.json"), "utf8")
  );
  fs.writeFileSync(
    path.join(build, "manifest.json"),
    JSON.stringify(firefoxManifest(manifest), null, 2) + "\n"
  );
}

async function main() {
  prepareBuild();
  fs.mkdirSync(profileDir, { recursive: true });
  const browser = await puppeteer.launch({
    browser: "firefox",
    executablePath: await firefoxPath(),
    headless: false,
    userDataDir: profileDir,
    defaultViewport: null,
    debuggingPort: Number(process.env.BIDI_PORT) || 9223,
    extraPrefsFirefox: {
      // Keep the window plain for testing
      "browser.aboutwelcome.enabled": false,
      "datareporting.policy.dataSubmissionEnabled": false,
    },
  });
  const id = await browser.installExtension(build);
  const [page] = await browser.pages();
  await (page ?? (await browser.newPage())).goto(START_URL);

  // Firefox allows one automation session at a time, so let go of ours and
  // just watch the process; scripts connect to the endpoint for their own.
  const firefox = browser.process();
  const endpoint = browser.wsEndpoint();
  await browser.disconnect();
  fs.writeFileSync(endpointFile, endpoint);
  console.log(
    `Firefox is open with the extension loaded (${id}); automation at ${endpoint}. Close the window to stop.`
  );
  const done = () => {
    fs.rmSync(endpointFile, { force: true });
    process.exit(0);
  };
  if (!firefox) return done();
  firefox.on("exit", done);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
