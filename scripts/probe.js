// Phase 0: checks that every selector and page variable HFGS relies on still exists.
// Needs `npm run browser` running and signed in to Hack Forums.
// Run with `npm run probe`. Read-only: it opens each game page in a new tab,
// runs scripts/phase0-probe.js there, saves the report and closes the tab.
// It places no bets and sends no game requests.
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const PORT = Number(process.env.CDP_PORT) || 9222;
const PAGES = {
  blackjack: "https://hackforums.net/blackjack.php",
  slots: "https://hackforums.net/slots.php",
};
const outDir = path.join(__dirname, "..", "fixtures", "phase0");
const probeSource = fs.readFileSync(
  path.join(__dirname, "phase0-probe.js"),
  "utf8"
);

async function main() {
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${PORT}`,
    defaultViewport: null,
  });
  fs.mkdirSync(outDir, { recursive: true });
  try {
    for (const [name, url] of Object.entries(PAGES)) {
      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
        if (!page.url().includes(`${name}.php`)) {
          console.log(`${name}: redirected to ${page.url()} (signed out?)`);
          continue;
        }
        const report = await page.evaluate(probeSource);
        // Full markup, for designing selectors offline. my_post_key is a per-session CSRF token: redact it.
        const postKey = await page.evaluate(() => globalThis.my_post_key || "");
        const markup = await page.content();
        // Also scrub every other token-shaped value (logoutkey, signed URLs, etc.): 32+ hex chars.
        report.html = (
          postKey ? markup.split(postKey).join("REDACTED") : markup
        )
          .replace(/\b[0-9a-f]{32,}\b/gi, "REDACTED")
          .replace(/((?:logoutkey|token|key)=)[^&"'\s\\]+/gi, "$1REDACTED");
        const file = path.join(outDir, `${name}.json`);
        fs.writeFileSync(file, JSON.stringify(report, null, 2));
        const { html, ...summary } = report;
        console.log(
          `\n=== ${name} (${page.url()})\n` + JSON.stringify(summary, null, 2)
        );
        console.log(`Saved ${path.relative(process.cwd(), file)}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    browser.disconnect();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
