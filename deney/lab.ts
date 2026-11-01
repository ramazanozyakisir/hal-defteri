// Tarayıcıda çalışan deney yardımcıları. run.mjs bunları Playwright ile çağırır.
import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentSingleTabManager,
  persistentMultipleTabManager,
  doc,
  setDoc,
  getDocFromCache,
  getDocsFromCache,
  collection,
  onSnapshot,
  waitForPendingWrites,
  type Firestore,
} from 'firebase/firestore';

type Outcome = 'pending' | 'ok' | string;

let db: Firestore;
const outcomes: Record<string, Outcome> = {};
const events: Record<string, Array<{ t: number; exists: boolean; pending: boolean; fromCache: boolean; tutar?: unknown }>> = {};
const t0 = performance.now();

function errCode(e: unknown): string {
  const c = (e as { code?: string })?.code;
  return 'error:' + (c ?? String(e));
}

const lab = {
  async init(opts: { multiTab: boolean }) {
    try {
      const app = initializeApp({ projectId: 'demo-hal-defteri', apiKey: 'demo' });
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: opts.multiTab ? persistentMultipleTabManager() : persistentSingleTabManager(undefined),
        }),
      });
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      // Önbelleğin gerçekten açılabildiğini anlamak için küçük bir okuma
      await getDocsFromCache(collection(db, '_yok')).catch(() => undefined);
      return 'ok';
    } catch (e) {
      return errCode(e);
    }
  },

  // Yazmayı başlatır, sonucunu beklemez (çevrimdışıyken söz hiç çözülmeyebilir)
  write(col: string, id: string, data: Record<string, unknown>) {
    const key = col + '/' + id;
    outcomes[key] = 'pending';
    setDoc(doc(db, col, id), data).then(
      () => (outcomes[key] = 'ok'),
      (e) => (outcomes[key] = errCode(e)),
    );
    return key;
  },

  async writeAwait(col: string, id: string, data: Record<string, unknown>) {
    try {
      await setDoc(doc(db, col, id), data);
      return 'ok';
    } catch (e) {
      return errCode(e);
    }
  },

  writeMany(col: string, n: number, prefix: string) {
    const s = performance.now();
    for (let i = 0; i < n; i++) {
      const id = `${prefix}-${String(i).padStart(4, '0')}`;
      lab.write(col, id, { tur: 'satis', tutar: 10 + (i % 50), cihaz: 'C1', sira: i + 1, olusturma: Date.now() });
    }
    return Math.round(performance.now() - s);
  },

  outcome(key: string) {
    return outcomes[key];
  },

  outcomeSummary(prefix: string) {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(outcomes)) if (k.includes(prefix)) out[v] = (out[v] ?? 0) + 1;
    return out;
  },

  watch(col: string, id: string) {
    const key = col + '/' + id;
    events[key] = [];
    onSnapshot(
      doc(db, col, id),
      { includeMetadataChanges: true },
      (s) =>
        events[key].push({
          t: Math.round(performance.now() - t0),
          exists: s.exists(),
          pending: s.metadata.hasPendingWrites,
          fromCache: s.metadata.fromCache,
          tutar: s.exists() ? s.get('tutar') : undefined,
        }),
      (e) => events[key].push({ t: Math.round(performance.now() - t0), exists: false, pending: false, fromCache: false, tutar: errCode(e) }),
    );
    return key;
  },

  events(key: string) {
    return events[key] ?? [];
  },

  async fromCache(col: string, id: string) {
    try {
      const s = await getDocFromCache(doc(db, col, id));
      return s.exists() ? { exists: true, tutar: s.get('tutar') } : { exists: false };
    } catch (e) {
      return { exists: false, error: errCode(e) };
    }
  },

  async countLocal(col: string) {
    try {
      return (await getDocsFromCache(collection(db, col))).size;
    } catch (e) {
      return errCode(e);
    }
  },

  async pending(timeoutMs = 60000) {
    const s = performance.now();
    const r = await Promise.race([
      waitForPendingWrites(db).then(() => 'ok'),
      new Promise((res) => setTimeout(() => res('timeout'), timeoutMs)),
    ]);
    return { result: r, ms: Math.round(performance.now() - s) };
  },
};

(window as unknown as { lab: typeof lab }).lab = lab;
document.title = 'lab-ready';
