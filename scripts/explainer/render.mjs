// Builds the explainer video: `npm run video`. Needs Playwright's Chromium and ffmpeg.
// Output goes to out/explainer/ (gitignored); frames are piped straight into ffmpeg, never written to disk.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
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

// Music: `npm run video -- --silent` skips it. The audio is never stored in Git: a slice of the
// remote CC0 track is fetched into the gitignored out/ folder and reused on later runs.
const silent = process.argv.includes('--silent');
const music = JSON.parse(await readFile(join(here, 'music.json'), 'utf8'));
let musicFile = null;
if (!silent) {
  const slice = total + 2; // a little spare; the mix trims to the exact video length
  const key = createHash('sha1')
    .update(`${music.url}|${music.startSeconds}|${slice}`)
    .digest('hex')
    .slice(0, 12);
  musicFile = join(OUT, '.music-cache', `${key}.mp3`);
  const cached = await stat(musicFile).then(
    (f) => f.size > 0,
    () => false
  );
  if (!cached) {
    await mkdir(dirname(musicFile), { recursive: true });
    console.log(`Fetching music: ${music.title} by ${music.creator}`);
    const code = await new Promise((ok) => {
      // -vn/-map: audio only (the source MP3 carries a cover image); the seek reads just this slice
      const f = spawn(
        'ffmpeg',
        [
          '-y',
          '-loglevel',
          'error',
          '-ss',
          String(music.startSeconds),
          '-i',
          music.url,
          '-t',
          String(slice),
          '-map',
          '0:a:0',
          '-c',
          'copy',
          musicFile,
        ],
        { stdio: ['ignore', 'inherit', 'inherit'] }
      );
      f.on('error', () => ok(1));
      f.on('exit', ok);
    });
    if (code !== 0) {
      console.error(
        `Could not fetch the music track (${music.url}). Check the network, or run with --silent.`
      );
      process.exit(1);
    }
  }
}

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
    ...(musicFile ? ['-i', musicFile] : []),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '20',
    '-preset',
    'medium',
    ...(musicFile
      ? [
          '-map',
          '0:v',
          '-map',
          '1:a',
          // quiet, even level; 2 s fade in, 3 s fade out; exactly as long as the video
          '-af',
          `atrim=0:${total},asetpts=N/SR/TB,loudnorm=I=-23:TP=-2:LRA=7,afade=t=in:st=0:d=2,afade=t=out:st=${total - 3}:d=3`,
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-ar',
          '48000',
          '-ac',
          '2',
        ]
      : []),
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
if (!silent) {
  transcript += `\nMusic: ${music.title} by ${music.creator} (CC0 1.0), ${music.sourcePage}\n`;
}
await writeFile(join(OUT, 'transcript.txt'), transcript);

console.log(`Done: ${OUT}`);
