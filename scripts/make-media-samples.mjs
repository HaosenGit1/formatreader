// Records the video (and Opus audio) samples in samples/videos and samples/sounds with Chrome's
// MediaRecorder: an animated turbine on a canvas with a tone. Needs Google Chrome.
//   node scripts/make-media-samples.mjs
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', 'samples');
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9590', '--no-first-run', '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${join(import.meta.dirname, '..', 'node_modules', '.media-prof')}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
  await sleep(200);
  try { wsUrl = (await (await fetch('http://127.0.0.1:9590/json')).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

const record = (mime, video) => `(async () => {
  const ac = new AudioContext(); await ac.resume();
  const osc = ac.createOscillator(); osc.frequency.value = 440; const gain = ac.createGain(); gain.gain.value = 0.2;
  const dest = ac.createMediaStreamDestination(); osc.connect(gain).connect(dest); osc.start();
  let stream = dest.stream;
  if (${video}) {
    const c = document.createElement('canvas'); c.width = 640; c.height = 360; const g = c.getContext('2d');
    let a = 0; const draw = () => { a += 0.08; g.fillStyle = '#7fb2f0'; g.fillRect(0, 0, 640, 360); g.fillStyle = '#5c9e4a'; g.fillRect(0, 270, 640, 90);
      g.fillStyle = '#fff'; g.fillRect(316, 110, 8, 165); g.save(); g.translate(320, 110); g.rotate(a);
      for (let k = 0; k < 3; k++) { g.rotate(2 * Math.PI / 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(-7, -95); g.lineTo(0, -100); g.lineTo(7, -95); g.fill(); } g.restore();
      g.fillStyle = '#123'; g.font = 'bold 26px sans-serif'; g.fillText('FormatReader sample · 风电场', 20, 40); osc.frequency.value = 330 + 110 * Math.sin(a); requestAnimationFrame(draw); };
    draw(); stream = new MediaStream([...c.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  }
  if (!MediaRecorder.isTypeSupported('${mime}')) return 'unsupported';
  const rec = new MediaRecorder(stream, { mimeType: '${mime}' }); const parts = [];
  rec.ondataavailable = (e) => parts.push(e.data); rec.start();
  await new Promise((r) => setTimeout(r, 3000)); rec.stop(); await new Promise((r) => (rec.onstop = r));
  const buf = new Uint8Array(await new Blob(parts).arrayBuffer()); let bin = ''; for (const b of buf) bin += String.fromCharCode(b); return btoa(bin);
})()`;

await send('Runtime.enable');
for (const [file, mime, video] of [
  [join(root, 'videos', 'turbine.mp4'), 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', true],
  [join(root, 'videos', 'turbine.webm'), 'video/webm;codecs=vp9,opus', true],
  [join(root, 'sounds', 'tone.webm'), 'audio/webm;codecs=opus', false],
]) {
  const r = await send('Runtime.evaluate', { expression: record(mime, video), awaitPromise: true, returnByValue: true });
  const v = r.result?.result?.value;
  if (!v || v === 'unsupported') console.log(file, 'not supported by this Chrome:', mime, r.result?.exceptionDetails?.text ?? '');
  else { writeFileSync(file, Buffer.from(v, 'base64')); console.log('made', file); }
}
ws.close();
chrome.kill();
process.exit(0);
