/**
 * Firefox's manifest, from the Chrome one in src/manifest.json: the add-on ID
 * (fixed once published on AMO), the data collection declaration AMO requires
 * of new extensions, and an event page instead of a service worker (Firefox
 * MV3 runs background.scripts, not background.service_worker). Firefox 140 is
 * the first with data_collection_permissions; MAIN-world content scripts need 128+.
 * Used by package.js and by browser.js --firefox.
 */
function firefoxManifest(chrome) {
  const { service_worker, ...background } = chrome.background ?? {};
  return {
    ...chrome,
    background: service_worker
      ? { ...background, scripts: [service_worker] }
      : chrome.background,
    browser_specific_settings: {
      gecko: {
        // The ID AMO gave the add-on when 1.x was first uploaded: updates
        // must keep it
        id: "{c2c9b5a3-0412-4ebf-ba24-0967feece06a}",
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] },
      },
    },
  };
}

module.exports = { firefoxManifest };
