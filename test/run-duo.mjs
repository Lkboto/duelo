// Ejecuta test/duo.html en Chrome/Edge headless (sin limitar los
// temporizadores de segundo plano) y muestra el resultado.
//   node test/run-duo.mjs "lag=60&jitter=25&loss=0.02&rollback=1&secs=30" [...más escenarios]
// Requiere el servidor de desarrollo en http://localhost:8123 (python test/serve.py).
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const exe = BROWSERS.find((p) => existsSync(p));
if (!exe) { console.error('No se encontró Chrome ni Edge'); process.exit(1); }
const scenarios = process.argv.slice(2);
if (!scenarios.length) scenarios.push('lag=60&jitter=25&loss=0.02&rollback=1&secs=30');
const port = 9333;
const profile = mkdtempSync(join(tmpdir(), 'duelo-duo-'));
const proc = spawn(exe, [
  '--headless=new', `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`,
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--no-first-run', '--no-default-browser-check', '--window-size=1600,900', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  return {
    send: (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }),
    close: () => ws.close(),
  };
}

try {
  let ver = null;
  for (let i = 0; i < 50 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) })).json(); } catch { await sleep(200); } }
  for (const sc of scenarios) {
    const url = `${process.env.DUO_BASE || "http://localhost:8123"}/test/duo.html?${sc}`;
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
    const c = await cdp(target.webSocketDebuggerUrl);
    let res = null;
    const secs = +(new URLSearchParams(sc).get('secs') || 30);
    const until = Date.now() + (secs + 40) * 1000;
    while (!res && Date.now() < until) {
      await sleep(1000);
      const r = await c.send('Runtime.evaluate', { expression: 'window.duoResult ? JSON.stringify(window.duoResult) : null', returnByValue: true });
      if (r.result && r.result.result && r.result.result.value) res = JSON.parse(r.result.result.value);
    }
    console.log('### ' + sc);
    console.log(JSON.stringify(res, null, 1));
    c.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
  }
} finally {
  proc.kill();
}
