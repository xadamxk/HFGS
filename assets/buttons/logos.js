// Browser logos for the download buttons: the same drawings as HF Convo Anywhere's
// buttons. Each is an SVG group drawn around 0,0 with a radius of about 50.
const LOGOS = {
  chrome:
    '<g><path d="M0 -22 L44.9 -22 A50 50 0 0 0 -41.5 -27.88 L-19.05 11 L0 0 Z" fill="#db4437"/><path d="M0 -22 L44.9 -22 A50 50 0 0 0 -41.5 -27.88 L-19.05 11 L0 0 Z" fill="#f4b400" transform="rotate(120)"/><path d="M0 -22 L44.9 -22 A50 50 0 0 0 -41.5 -27.88 L-19.05 11 L0 0 Z" fill="#0f9d58" transform="rotate(240)"/><circle r="22" fill="#ffffff"/><circle r="17.5" fill="#4285f4"/></g>',
  firefox:
    '<g><defs><radialGradient id="globe" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#b833e1"/><stop offset="0.45" stop-color="#7542e5"/><stop offset="1" stop-color="#3a3dd0"/></radialGradient><linearGradient id="fox" x1="0.85" y1="0.1" x2="0.2" y2="0.95"><stop offset="0" stop-color="#ffe226"/><stop offset="0.35" stop-color="#ff980e"/><stop offset="0.7" stop-color="#ff3750"/><stop offset="1" stop-color="#eb0878"/></linearGradient></defs><circle cx="8" cy="-8" r="34" fill="url(#globe)"/><path d="M-2 -50 C10 -52 22 -48 29 -40 C21 -41 14 -42 8 -42 A34 34 0 1 0 42 -8 C44 -12 46 -16 46 -20 A50 50 0 1 1 -2 -50 Z" fill="url(#fox)"/><path d="M-2 -50 L-9 -58 L4 -51 Z" fill="#ff980e"/></g>',
};

const BROWSER = location.hash.includes("firefox") ? "firefox" : "chrome";
/** Draw the logo into an <svg>, scaled by `scale`. */
function drawLogo(svg, scale = 1) {
  svg.innerHTML = `<g transform="scale(${scale})">${LOGOS[BROWSER]}</g>`;
}
