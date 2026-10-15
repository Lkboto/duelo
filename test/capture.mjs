// Capturas de una partida de bots en Chrome headless (para revisar animaciones).
//   node test/capture.mjs <carpeta-salida> [personajeA] [personajeB] [n] [cadaMs]
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [outDir = 'shots', a = 'kaze', b = 'toro', n = '12', every = '180'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
const port = 9334;
const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'duelo-cap-'))}`,
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) }); break; } catch { await sleep(200); } }
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent((process.env.DUO_BASE || 'http://localhost:8123') + '/index.html')}`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await sleep(2500);
  await send('Runtime.evaluate', { expression: `App.startMatch({ mode: 'bots', stage: STAGES[0].id, firstTo: 9, seed: 7, players: [{ charId: '${a}', source: 'bot', level: 'hard', slot: 0 }, { charId: '${b}', source: 'bot', level: 'hard', slot: 1 }] })` });
  await sleep(1800);
  for (let i = 0; i < +n; i++) {
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    writeFileSync(join(outDir, `f${String(i).padStart(2, '0')}.jpg`), Buffer.from(r.result.data, 'base64'));
    await sleep(+every);
  }
  ws.close();
} finally { proc.kill(); }
