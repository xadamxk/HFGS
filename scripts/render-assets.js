// Renders the store and release-thread images from their HTML sources:
//   assets/screenshots/<n>.html   -> store/screenshots/<n>.png   (1280x800)
//   assets/banners/banner-thread*.html -> assets/banners/<same>.png
//                                    (laid out at 1400x560, drawn at 1200x480
//                                    to match the buttons' width)
//   assets/buttons/button.html    -> assets/buttons/button-<browser>.png
//                                    (1200x132, transparent corners)
// Needs `npm run browser` running (it draws in that Chrome on 127.0.0.1:9222).
// Run with `npm run assets:png`, or name sources to render only those:
//   npm run assets:png -- assets/screenshots/2-slots.html
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const root = path.join(__dirname, "..");
const PORT = Number(process.env.CDP_PORT) || 9222;
const fileUrl = (file) =>
  "file:///" + path.resolve(root, file).split(path.sep).join("/");

/**
 * Every image: its source page (with any #options), output, layout size and
 * scale (the PNG is width x scale wide).
 */
function jobs() {
  const list = [];
  for (const name of fs.readdirSync(path.join(root, "assets/screenshots"))) {
    if (/^\d+-.*\.html$/.test(name))
      list.push({
        source: `assets/screenshots/${name}`,
        out: `store/screenshots/${name.replace(/\.html$/, ".png")}`,
        width: 1280,
        height: 800,
      });
  }
  for (const name of fs.readdirSync(path.join(root, "assets/banners"))) {
    if (/^banner-thread.*\.html$/.test(name))
      list.push({
        source: `assets/banners/${name}`,
        out: `assets/banners/${name.replace(/\.html$/, ".png")}`,
        width: 1400,
        height: 560,
        scale: 1200 / 1400,
      });
  }
  for (const browser of ["chrome", "firefox"])
    list.push({
      source: "assets/buttons/button.html",
      hash: browser,
      out: `assets/buttons/button-${browser}.png`,
      width: 1200,
      height: 132,
      transparent: true,
    });
  return list;
}

async function main() {
  const only = process.argv.slice(2).map((f) => path.normalize(f));
  const todo = jobs().filter(
    (job) => !only.length || only.includes(path.normalize(job.source))
  );
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${PORT}`,
    defaultViewport: null,
  });
  try {
    // A fresh tab per image, in front: Chrome can stall screenshots of
    // background tabs
    for (const job of todo) {
      const page = await browser.newPage();
      try {
        await page.bringToFront();
        await page.setViewport({
          width: job.width,
          height: job.height,
          deviceScaleFactor: job.scale ?? 1,
        });
        await page.goto(
          fileUrl(job.source) + (job.hash ? `#${job.hash}` : ""),
          { waitUntil: "load" }
        );
        await page.screenshot({
          path: path.join(root, job.out),
          omitBackground: Boolean(job.transparent),
        });
        console.log(job.out);
      } finally {
        await page.close();
      }
    }
  } finally {
    browser.disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
