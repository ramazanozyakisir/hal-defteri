// Firestore ön deneyleri (D1–D5). Çalıştırma: npm run deney
// Emülatörü firebase emulators:exec başlatır; bu betik Vite + Playwright ile
// gerçek tarayıcıda Firestore web SDK'yı çalıştırır ve sonuçları yazar.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROJECT = 'demo-hal-defteri';
const EMU = 'http://127.0.0.1:8080';
const DOCS = `${EMU}/v1/projects/${PROJECT}/databases/(default)/documents`;
const OWNER = { Authorization: 'Bearer owner' }; // emülatörde kuralları atlayarak sunucu durumunu okur
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();

async function clearDb() {
  await fetch(`${EMU}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}
async function serverDocs(col) {
  const all = [];
  let token = '';
  do {
    const r = await fetch(`${DOCS}/${col}?pageSize=300${token ? '&pageToken=' + token : ''}`, { headers: OWNER });
    const j = await r.json();
    all.push(...(j.documents ?? []));
    token = j.nextPageToken ?? '';
  } while (token);
  return all;
}
async function serverDoc(col, id) {
  const r = await fetch(`${DOCS}/${col}/${id}`, { headers: OWNER });
  if (r.status === 404) return null;
  const j = await r.json();
  const f = j.fields ?? {};
  return { tutar: f.tutar?.integerValue ?? f.tutar?.doubleValue };
}
const hareket = (tutar, sira = 1) => ({ tur: 'satis', tutar, cihaz: 'C1', sira, olusturma: Date.now() });

async function openLab(ctx, url, multiTab) {
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForFunction(() => document.title === 'lab-ready');
  const init = await page.evaluate((m) => window.lab.init({ multiTab: m }), multiTab);
  return { page, init };
}
async function waitOutcome(page, key, ms = 15000) {
  const end = now() + ms;
  let o;
  while (now() < end) {
    o = await page.evaluate((k) => window.lab.outcome(k), key);
    if (o !== 'pending') return o;
    await sleep(200);
  }
  return o;
}

const results = {};

async function D1(browser, url) {
  await clearDb();
  const ctx = await browser.newContext();
  const { page, init } = await openLab(ctx, url, false);
  const key = await page.evaluate(() => window.lab.watch('hareketler', 'd1'));
  await ctx.setOffline(true);
  await page.evaluate((d) => window.lab.write('hareketler', 'd1', d), hareket(-5)); // kural: tutar > 0 → geçersiz
  await sleep(800);
  const offlineCache = await page.evaluate(() => window.lab.fromCache('hareketler', 'd1'));
  await ctx.setOffline(false);
  const outcome = await waitOutcome(page, key);
  await sleep(1500);
  const afterCache = await page.evaluate(() => window.lab.fromCache('hareketler', 'd1'));
  const events = await page.evaluate((k) => window.lab.events(k), key);
  const server = await serverDoc('hareketler', 'd1');
  await ctx.close();
  results.D1 = {
    init,
    cevrimdisiYerelOnbellek: offlineCache,
    yazmaSonucu: outcome,
    eslemeSonrasiYerelOnbellek: afterCache,
    sunucudaVar: !!server,
    dinleyiciOlaylari: events,
  };
}

async function D2(browser, url) {
  await clearDb();
  const d = hareket(100);
  const ctx1 = await browser.newContext();
  const a = await openLab(ctx1, url, false);
  const strictIlk = await a.page.evaluate((x) => window.lab.writeAwait('hareketler_strict', 'd2', x), d);
  const asilIlk = await a.page.evaluate((x) => window.lab.writeAwait('hareketler', 'd2', x), d);
  await ctx1.close();
  // Onay kaybı sonrası yeniden gönderimi temsilen: aynı kimliğe ikinci kez yazma
  const ctx2 = await browser.newContext();
  const b = await openLab(ctx2, url, false);
  const strictAyniIcerik = await b.page.evaluate((x) => window.lab.writeAwait('hareketler_strict', 'd2', x), d);
  const asilAyniIcerik = await b.page.evaluate((x) => window.lab.writeAwait('hareketler', 'd2', x), d);
  const asilFarkliIcerik = await b.page.evaluate((x) => window.lab.writeAwait('hareketler', 'd2', x), { ...d, tutar: 999 });
  await ctx2.close();
  const server = await serverDoc('hareketler', 'd2');
  results.D2 = {
    not: 'Gerçek onay kaybı yerine, aynı kimliğe ikinci istemciden yeniden yazma ile temsil edilmiştir.',
    strict: { ilkYazma: strictIlk, ayniIcerikYenidenYazma: strictAyniIcerik },
    asilKural: { ilkYazma: asilIlk, ayniIcerikYenidenYazma: asilAyniIcerik, farkliIcerikYazma: asilFarkliIcerik },
    sunucudakiTutar: server?.tutar,
    sunucudakiBelgeSayisi: (await serverDocs('hareketler')).length,
  };
}

async function D3(browser, url, N = 500) {
  await clearDb();
  const ctx = await browser.newContext();
  const { page, init } = await openLab(ctx, url, false);
  await ctx.setOffline(true);
  const yerelYazmaMs = await page.evaluate((n) => window.lab.writeMany('hareketler', n, 'd3'), N);
  await sleep(1000);
  const yerelSayi = await page.evaluate(() => window.lab.countLocal('hareketler'));
  const sunucuOnce = (await serverDocs('hareketler')).length;
  await ctx.setOffline(false);
  const p = await page.evaluate(() => window.lab.pending(120000));
  await sleep(1000);
  const sunucuSonra = (await serverDocs('hareketler')).length;
  const sonuclar = await page.evaluate(() => window.lab.outcomeSummary('d3'));
  await ctx.close();
  results.D3 = { init, N, yerelYazmaMs, yerelSayi, sunucuCevrimdisiyken: sunucuOnce, eslemeMs: p.ms, eslemeSonucu: p.result, sunucuSonra, yazmaSonuclari: sonuclar };
}

async function D4(browser, url) {
  const out = {};
  for (const multi of [true, false]) {
    await clearDb();
    const ctx = await browser.newContext();
    const a = await openLab(ctx, url, multi);
    const b = await openLab(ctx, url, multi);
    const keyB = await b.page.evaluate(() => window.lab.watch('hareketler', 'd4'));
    await ctx.setOffline(true);
    await a.page.evaluate((d) => window.lab.write('hareketler', 'd4', d), hareket(50));
    await sleep(1500);
    const bOnbellek = await b.page.evaluate(() => window.lab.fromCache('hareketler', 'd4'));
    await ctx.setOffline(false);
    const pa = await a.page.evaluate(() => window.lab.pending(30000));
    await sleep(1500);
    const bOlaylar = await b.page.evaluate((k) => window.lab.events(k), keyB);
    const sunucu = (await serverDocs('hareketler')).length;
    await ctx.close();
    out[multi ? 'cokSekmeYoneticisi' : 'tekSekmeYoneticisi'] = {
      sekmeA_init: a.init, sekmeB_init: b.init,
      sekmeB_cevrimdisiGoruyorMu: bOnbellek, sekmeB_olaylar: bOlaylar,
      eslemeA: pa, sunucuBelgeSayisi: sunucu,
    };
  }
  results.D4 = out;
}

async function D5(url) {
  await clearDb();
  const dir = mkdtempSync(join(tmpdir(), 'hal-d5-'));
  let ctx = await chromium.launchPersistentContext(dir, { headless: true, ...exe });
  let { page, init } = await openLab(ctx, url, false);
  await ctx.setOffline(true);
  await page.evaluate((d) => window.lab.write('hareketler', 'd5', d), hareket(75));
  await sleep(1000);
  const kapanmadanOnceSunucu = !!(await serverDoc('hareketler', 'd5'));
  await ctx.close(); // uygulama/cihaz kapanır
  ctx = await chromium.launchPersistentContext(dir, { headless: true, ...exe });
  const r = await openLab(ctx, url, false);
  const yenidenAcilinca = await r.page.evaluate(() => window.lab.fromCache('hareketler', 'd5'));
  const p = await r.page.evaluate(() => window.lab.pending(30000));
  await sleep(1500);
  const sunucuSonra = await serverDoc('hareketler', 'd5');
  await ctx.close();
  rmSync(dir, { recursive: true, force: true });
  results.D5 = { init, kapanmadanOnceSunucudaVar: kapanmadanOnceSunucu, yenidenAcilincaYerelOnbellek: yenidenAcilinca, esleme: p, sunucudaVarSonra: !!sunucuSonra };
}

const vite = await createServer({ server: { port: 5173, strictPort: true, host: 'localhost' }, logLevel: 'error' });
await vite.listen();
const url = 'http://localhost:5173/deney/index.html';
const exe = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const browser = await chromium.launch({ headless: true, ...exe });
const run = async (name, fn) => {
  process.stdout.write(`${name} ... `);
  try { await fn(); console.log('tamam'); }
  catch (e) { results[name] = { hata: String(e?.stack ?? e) }; console.log('HATA: ' + e?.message); }
};
await run('D1', () => D1(browser, url));
await run('D2', () => D2(browser, url));
await run('D3', () => D3(browser, url));
await run('D4', () => D4(browser, url));
await run('D5', () => D5(url));
await browser.close();
await vite.close();

const meta = { tarih: new Date().toISOString(), node: process.version, firebase: (await import('firebase/package.json', { with: { type: 'json' } })).default.version };
writeFileSync('deney/sonuclar.json', JSON.stringify({ meta, results }, null, 2));
console.log('\nSonuçlar deney/sonuclar.json dosyasına yazıldı. Bu dosyayı gönder.');
