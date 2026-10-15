// Renders the trailer to a video file, frame by frame, with its score.
//
//   npm run dev                                    (in another terminal: the trailer page has to be served)
//   node tools/render-trailer.mjs                  -> trailer.mp4, 1920x1080 at 60 fps
//   node tools/render-trailer.mjs --fps 30 --w 1280 --h 720 --out preview.mp4
//
// Every frame is stepped exactly 1/fps on from the last and read back from
// the page (window.trailerExport.frame: the 3D frame and the overlay in one),
// so the video is smooth however slow the machine is, and it is the same
// film every time (the trailer seeds its own random). The score is rendered
// offline in the page (window.trailerExport.audio) and muxed in.
//
// Needs: Playwright (npm i -D playwright, then npx playwright install chromium)
// and ffmpeg on the PATH. Options:
//   --url <page>      default http://localhost:5173/trailer/
//   --out <file>      default trailer.mp4
//   --w --h --fps     default 1920 1080 60
//   --from --to       seconds, to render a part of it (no audio unless --from is 0)
//   --browser <path>  a Chromium to use instead of Playwright's
//   --gpu             use the machine's GPU (default: software GL, which works anywhere)
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const has = (k) => args.includes(`--${k}`);
const W = +opt('w', 1920), H = +opt('h', 1080), FPS = +opt('fps', 60);
const URL0 = opt('url', 'http://localhost:5173/trailer/');
const OUT = opt('out', 'trailer.mp4');
const FROM = +opt('from', 0);

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('render-trailer: needs Playwright. npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const flags = has('gpu') ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args: flags, executablePath: opt('browser') });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.error('[page]', e.message));
await page.goto(`${URL0}?export&w=${W}&h=${H}`);
console.log('building the levels...');
await page.waitForFunction(() => window.trailerExport?.ready, null, { timeout: 20 * 60 * 1000 });
const length = await page.evaluate(() => window.trailerExport.length);
const TO = Math.min(length, +opt('to', length));

const wavPath = `${OUT}.score.wav`;
const withAudio = FROM === 0;
if (withAudio) {
  const b64 = await page.evaluate(() => window.trailerExport.audio());
  writeFileSync(wavPath, Buffer.from(b64, 'base64'));
}

// jpeg frames straight into ffmpeg
const ff = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  ...(withAudio ? ['-i', wavPath, '-c:a', 'aac', '-b:a', '256k', '-shortest'] : []),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  OUT,
], { stdio: ['pipe', 'inherit', 'inherit'] });

const first = Math.round(FROM * FPS), last = Math.floor(TO * FPS);
const t0 = Date.now();
for (let i = first; i < last; i++) {
  const url = await page.evaluate(([i, fps]) => window.trailerExport.frame(i, fps, 'image/jpeg', 0.95), [i, FPS]);
  const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % FPS === 0) {
    const done = (i - first + 1) / (last - first);
    const left = ((Date.now() - t0) / done - (Date.now() - t0)) / 1000;
    process.stdout.write(`\r${(i / FPS).toFixed(0)} s / ${TO.toFixed(0)} s   (${Math.round(done * 100)}%, ~${Math.round(left)} s left)   `);
  }
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
if (withAudio) rmSync(wavPath, { force: true });
console.log(`\nwrote ${OUT}`);
