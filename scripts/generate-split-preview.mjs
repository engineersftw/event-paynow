// Makes the social preview image of the Split PayNow Bot page: web/public/split-preview.jpg (1280x720).
// Run by hand when the name, tagline or logo changes, then commit the JPEG (like the explainer poster).
//
// Usage:
//   node scripts/generate-split-preview.mjs <path-to-the-full-size-logo>
//
// Needs Playwright with a Chromium (already installed in the dev container); not part of CI.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname } from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/generate-split-preview.mjs <path-to-the-full-size-logo>');
  process.exit(1);
}
const { chromium } = createRequire(import.meta.url)('playwright');

const type = { '.webp': 'image/webp', '.png': 'image/png' }[extname(src).toLowerCase()];
if (!type) {
  console.error('the logo must be a .png or .webp file');
  process.exit(1);
}
const logo = `data:${type};base64,${readFileSync(src).toString('base64')}`;

const html = `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box}
body{margin:0;width:1280px;height:720px;display:flex;align-items:center;gap:56px;padding:0 90px;
  background:linear-gradient(135deg,#fff 0%,#fef2f2 100%);color:#09090b;
  font-family:system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif}
img{width:430px;height:430px;flex:none}
h1{font-size:84px;line-height:1.02;letter-spacing:-.03em;margin:0 0 24px}
p{font-size:38px;line-height:1.3;margin:0;color:#52525b}
.pill{display:inline-block;margin-top:34px;padding:12px 28px;border-radius:999px;background:#e11d2e;color:#fff;font-size:30px;font-weight:600}
</style>
<img src="${logo}" alt="">
<div><h1>Split PayNow Bot</h1><p>Split a bill in Telegram. Everyone gets a PayNow QR for what they owe.</p><span class="pill">Equal, custom, or by receipt</span></div>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
await page.setContent(html);
writeFileSync('web/public/split-preview.jpg', await page.screenshot({ type: 'jpeg', quality: 80 }));
await browser.close();
console.log('wrote web/public/split-preview.jpg');
