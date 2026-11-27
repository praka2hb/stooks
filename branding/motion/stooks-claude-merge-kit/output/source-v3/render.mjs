// node render.mjs              → ../stooks-merge-v3.mp4 and ../stooks-merge-v3.webp
// node render.mjs --stills 0,60,120 --out DIR   → PNG stills only
// needs: ffmpeg, img2webp (brew install ffmpeg webp) and Chrome (set CHROME=... to override)
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path'; import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), kit = path.resolve(here, '../..'), outDir = path.resolve(here, '..');
const arg = n => { const i = process.argv.indexOf('--' + n); return i < 0 ? null : process.argv[i + 1]; };
const W = 2172, H = 724, FPS = 60, N = 534;

// assets.js is generated from ../lettering so index.html also opens by double-click
const { build, CFG: L } = await import('../lettering/lettering.mjs');
const words = Object.fromEntries(['stocks', 'hooks', 'stooks'].map(w => [w, build(w)]));
const r2 = poly => poly.map(p => p.map(v => +v.toFixed(2)));
const piece = (word, i, id, role) => { const g = words[word].glyphs[i]; return { id, word, role, d: g.d, outer: g.outer, polys: [g.shell, g.plate].filter(Boolean).map(r2) }; };
fs.writeFileSync(path.join(here, 'assets.js'), 'window.STOOKS_ASSETS=' + JSON.stringify({
  text: JSON.parse(fs.readFileSync(path.join(here, 'text/words.json'))),
  climb: L.climb, face: L.face, back: L.back, faceFrom: L.faceFrom, backFrom: L.backFrom, gloss: L.gloss,
  pieces: [...['s1', 't', 'to', 'tc', 'tk', 'ts'].map((id, i) => piece('stocks', i, id, i < 2 ? 'L' : 'tuckL')),
           ...['h', 'o1', 'o2', 'k', 's2'].map((id, i) => piece('hooks', i, id, i ? 'R' : 'tuckR'))],
  outlines: Object.fromEntries(Object.entries(words).map(([w, b]) => [w, { red: b.back, white: b.border }])),
  background: 'data:image/png;base64,' + fs.readFileSync(path.join(kit, 'blurred-blue.png')).toString('base64') }) + ';');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stooks-'));
const stills = arg('stills') && arg('stills').split(',').map(Number);
const frames = stills || [...Array(N).keys()], stillDir = arg('out') || tmp;
const raw = ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`];
let enc = null, webpEnc = null;
if (!stills) {
  const rgb = [...raw, '-r', String(FPS), '-i', '-'];
  enc = spawn('ffmpeg', ['-v', 'error', '-y', ...rgb, '-an',
    '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int+full_chroma_inp,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-profile:v', 'high', '-aq-mode', '3', '-g', '60',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', path.join(tmp, 'out.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
  webpEnc = spawn('ffmpeg', ['-v', 'error', '-y', ...rgb, '-vf', 'select=not(mod(n\\,2)),scale=1086:362:flags=lanczos,format=rgb24', '-fps_mode', 'passthrough', '-compression_level', '9', '-pred', 'mixed', path.join(tmp, '%04d.png')], { stdio: ['pipe', 'inherit', 'inherit'] });
}
const push = (p, b) => new Promise(r => p.stdin.write(b, r));
let finish; const done = new Promise(r => finish = r);
const srv = http.createServer(async (q, r) => {
  const chunks = []; if (q.method === 'POST') for await (const c of q) chunks.push(c);
  const body = Buffer.concat(chunks), u = q.url.split('?')[0];
  if (u === '/frames') return r.end(JSON.stringify(frames));
  if (u === '/error') { console.error(body.toString()); r.end(); return finish(1); }
  if (u === '/done') { r.end(); return finish(0); }
  if (u.startsWith('/frame/')) {
    const f = +u.slice(7);
    if (stills) spawnSync('ffmpeg', ['-v', 'error', '-y', ...raw, '-i', '-', '-frames:v', '1', path.join(stillDir, String(f).padStart(4, '0') + '.png')], { input: body });
    else { await Promise.all([push(enc, body), push(webpEnc, body)]); if (f % 60 === 0) console.log('frame', f); }
    return r.end();
  }
  const file = path.join(here, path.basename(u === '/' ? 'index.html' : u));
  if (!fs.existsSync(file)) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : 'text/html'); r.end(fs.readFileSync(file));
}).listen(0, '127.0.0.1');
await new Promise(r => srv.once('listening', r));
const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless', '--no-first-run', '--hide-scrollbars', '--force-color-profile=srgb', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--user-data-dir=${path.join(tmp, 'profile')}`, '--remote-debugging-port=0', '--disk-cache-size=1',
   // software GL on purpose: the default headless backend drops canvas contents at random
   '--use-angle=swiftshader', '--disable-accelerated-2d-canvas', '--disable-gpu-compositing',
   `http://127.0.0.1:${srv.address().port}/#render`], { stdio: 'ignore' });
const code = await done;
chrome.kill(); srv.close(); srv.closeAllConnections();
if (!stills && code === 0) {
  const end = p => new Promise(r => { p.on('close', r); p.stdin.end(); });
  await Promise.all([end(enc), end(webpEnc)]);
  const pngs = fs.readdirSync(tmp).filter(f => f.endsWith('.png')).sort();
  const a = ['-loop', '0', '-lossy', '-q', '72', '-m', '6'];
  pngs.forEach((f, i) => a.push('-d', String(Math.round((i + 1) * 1000 / 30) - Math.round(i * 1000 / 30)), path.join(tmp, f)));
  const w = spawnSync('img2webp', [...a, '-o', path.join(tmp, 'out.webp')], { stdio: 'inherit' });
  if (w.status !== 0) throw new Error('img2webp failed');
  fs.copyFileSync(path.join(tmp, 'out.mp4'), path.join(outDir, 'stooks-merge-v3.mp4'));
  fs.copyFileSync(path.join(tmp, 'out.webp'), path.join(outDir, 'stooks-merge-v3.webp'));
}
await new Promise(r => setTimeout(r, 300)); fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
process.exit(code);
