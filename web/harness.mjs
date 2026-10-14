// Shared helpers for the browser tests: serve dist/site, launch headless Chromium, open the page with error capture.
// Chromium is found from PE_CHROMIUM, else the usual Playwright location, else Playwright's own lookup.
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../dist/site/', import.meta.url));
const CANDIDATES = [process.env.PE_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);

export function makeChecker() {
  const state = { fails: 0, passes: 0 };
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  ' + String(detail).slice(0, 500) : ''}`);
    if (ok) state.passes++; else state.fails++;
  };
  const done = () => { console.log(state.fails ? `\n${state.fails} FAILED` : `\nALL PASS (${state.passes} checks)`); return state.fails ? 1 : 0; };
  return { check, done, state };
}

export async function startSite() {
  const server = http.createServer((q, r) => {
    const f = path.join(root, q.url === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0]));
    if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': f.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' }); r.end(fs.readFileSync(f));
  });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() };
}

export async function launch() {
  const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
  return chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] });
}

/**
 * Open the page. Records every page error, console error and failed request into `errors`, except Google Fonts
 * (blocked on purpose so tests do not depend on the network; the page falls back to system fonts).
 * opts: state (put in local storage before load), step, width, scheme, init (script run before load), downloads.
 */
export async function openApp(browser, url, { state = null, step = null, width = 1100, height = 900, scheme = 'light', init = null, downloads = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, acceptDownloads: downloads });
  const errors = [];
  const page = await ctx.newPage();
  const isFont = (u) => /fonts\.(googleapis|gstatic)\.com/.test(u || '');
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !isFont(m.location().url)) errors.push(`console: ${m.text()} (${m.location().url})`); });
  page.on('requestfailed', (r) => { if (!isFont(r.url())) errors.push(`request failed: ${r.url()}`); });
  page.on('response', (r) => { if (r.status() >= 400 && !isFont(r.url())) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (state) await ctx.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v); } catch (e) {} }, ['pe.state.v1', JSON.stringify(step ? { ...state, step } : state)]);
  if (init) await ctx.addInitScript(init);
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('#panel-title'));
  await page.waitForFunction(() => !document.querySelector('#panel').textContent.includes('Loading print data'));
  return { ctx, page, errors };
}

export const download = async (page, sel) => { const [d] = await Promise.all([page.waitForEvent('download'), page.click(sel)]); return { name: d.suggestedFilename(), bytes: fs.readFileSync(await d.path()) }; };

/** Read the entries of a store-only zip (the only kind this tool writes). */
export function readZip(buf) {
  const out = {}; let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) { const size = buf.readUInt32LE(p + 18), n = buf.readUInt16LE(p + 26), x = buf.readUInt16LE(p + 28); const name = buf.slice(p + 30, p + 30 + n).toString(); out[name] = buf.slice(p + 30 + n + x, p + 30 + n + x + size); p += 30 + n + x + size; }
  return out;
}

/** Contrast audit of every visible text node inside `selector`. Returns the nodes that fail WCAG AA (4.5, or 3 for large text). */
export async function contrastAudit(page, selector = '#panel') {
  const nodes = await page.evaluate((sel) => {
    const out = []; const parse = (c) => c.match(/[\d.]+/g).map(Number);
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.length < 4 || c[3] > 0.05) return c.slice(0, 3); } return [255, 255, 255]; };
    for (const el of document.querySelectorAll(`${sel} *`)) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const st = getComputedStyle(el); if (st.visibility === 'hidden' || st.display === 'none' || el.closest('[disabled]')) continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      out.push({ t: el.textContent.trim().slice(0, 30), fg: parse(st.color).slice(0, 3), bg: bgOf(el), big: parseFloat(st.fontSize) >= 24 || (parseFloat(st.fontSize) >= 18.66 && +st.fontWeight >= 700) });
    }
    return out;
  }, selector);
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const fail = nodes.filter((x) => { const a = lum(x.fg), b = lum(x.bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < (x.big ? 3 : 4.5); });
  return { count: nodes.length, fail };
}
