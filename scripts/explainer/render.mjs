// Builds the explainer video: `npm run video`. Needs Playwright's Chromium and ffmpeg.
// Output goes to out/explainer/ (gitignored); frames are piped straight into ffmpeg, never written to disk.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildPayNowPayload } from '../../src/sgqr/paynow.ts';
import { renderQrPngBuffer } from '../../src/sgqr/qr-render-node.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const OUT = join(root, 'out', 'explainer');
const FPS = 30;
const W = 1920;
const H = 1080;

const captions = JSON.parse(await readFile(join(here, 'captions.json'), 'utf8'));
const total = captions.scenes.at(-1).end;

// Sample QR: the bot's own renderer with a fictional UEN, so it never identifies a real payee
const payload = buildPayNowPayload({
  proxyType: 'uen',
  proxyValue: '201900000A',
  amountCents: 1250,
  description: 'Team Dinner',
});
const qr = await renderQrPngBuffer(payload);
const logo = await readFile(join(root, 'web', 'public', 'logo.png'));
const files = {
  '/': ['text/html', await readFile(join(here, 'scenes.html'))],
  '/captions.json': ['application/json', await readFile(join(here, 'captions.json'))],
  '/sample-qr.png': ['image/png', qr],
  '/logo.png': ['image/png', logo],
};
const server = http.createServer((req, res) => {
  const f = files[req.url ?? ''];
  if (!f) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': f[0] }).end(f[1]);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${server.address().port}/`;

await mkdir(OUT, { recursive: true });
const mp4 = join(OUT, 'explainer.mp4');
const ffmpeg = spawn(
  'ffmpeg',
  [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'image2pipe',
    '-framerate',
    String(FPS),
    '-i',
    '-',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '20',
    '-preset',
    'medium',
    '-movflags',
    '+faststart',
    mp4,
  ],
  { stdio: ['pipe', 'inherit', 'inherit'] }
);
const ffmpegDone = new Promise((ok, fail) => {
  ffmpeg.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}`))));
  ffmpeg.stdin.on('error', fail);
});

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(url);
  await page.waitForFunction(() => window.ready === true);

  const frames = Math.round(total * FPS);
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.renderAt(t), i / FPS);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ffmpeg.stdin.write(jpg)) await new Promise((ok) => ffmpeg.stdin.once('drain', ok));
    if (i % 150 === 0) process.stdout.write(`frame ${i}/${frames}\n`);
  }
  ffmpeg.stdin.end();
  await ffmpegDone;

  await page.evaluate((t) => window.renderAt(t), 2);
  await page.screenshot({ path: join(OUT, 'poster.png') });
} finally {
  await browser.close();
  server.close();
}

// Companion files from the same caption text as the burned-in captions
const stamp = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const srt = captions.scenes
  .map((s, i) => `${i + 1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${s.text}\n`)
  .join('\n');
await writeFile(join(OUT, 'captions.srt'), srt);

let transcript = `${captions.title}\n`;
let chapter = '';
for (const s of captions.scenes) {
  if (s.chapter !== chapter) {
    chapter = s.chapter;
    transcript += `\n${chapter}\n`;
  }
  transcript += `${s.text}\n`;
}
await writeFile(join(OUT, 'transcript.txt'), transcript);

console.log(`Done: ${OUT}`);
