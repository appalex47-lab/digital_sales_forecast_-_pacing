// Hallazgo 3.2: estado de persistencia del repositorio con IndexedDB simulado.  node tools/test-repository-persistence.js
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
const srcs = [...html.matchAll(/<script src="(js\/[^"?]+)/g)].map((m) => m[1]).filter((f) => /js\/(config|storage)\//.test(f) && !/tests/.test(f));
const ctx = { console, Math, Date, JSON, Map, Set, Intl, Number, String, Array, Object, RegExp, Error, Promise, setTimeout, clearTimeout, Symbol };
ctx.globalThis = ctx; ctx.window = undefined; vm.createContext(ctx);
srcs.forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }));
const FP = ctx.FP;
let bad = 0;
const t = (n, c, d) => { console.log((c ? '✔ ' : '✘ ') + n + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : '')); if (!c) bad++; };

(async () => {
  const disk = new Map(); let failNext = 0, delay = 0;
  FP.idb = {
    available: () => true,
    open: async () => ({ close() {} }),
    getAll: async () => [...disk.entries()].map(([key, envelope]) => ({ key, envelope })),
    put: async (db, store, row) => { if (delay) await new Promise((r) => setTimeout(r, delay)); if (failNext > 0) { failNext--; throw new Error('QuotaExceededError'); } disk.set(row.key, row.envelope); },
    del: async (db, store, key) => { disk.delete(key); },
    keys: async () => [...disk.keys()]
  };
  const repo = FP.repository.createRepository({ name: 'x', version: 1 });
  const settled = []; let errs = 0;
  repo.onSettled = (s) => settled.push(s.state); repo.onError = () => { errs++; };
  await repo.init();
  t('arranca en modo indexeddb y estado saved', repo.mode === 'indexeddb' && repo.status().state === 'saved');

  delay = 20;
  const ret = repo.kvSet('a', { data: 1 });
  t('kvSet devuelve true de inmediato (contrato síncrono intacto)', ret === true);
  t('...pero el estado es PENDING hasta confirmar (no "guardado")', repo.status().state === 'pending' && repo.status().pending === 1 && !disk.has('a'));
  await repo.flush();
  t('tras flush: saved, escrito en disco y con marca de confirmación', repo.status().state === 'saved' && disk.has('a') && !!repo.status().lastConfirmedAt);
  t('onSettled notificó la confirmación', settled[settled.length - 1] === 'saved');

  delay = 0; failNext = 1;
  repo.kvSet('b', { data: 2 });
  await repo.flush().catch(() => {}); await new Promise((r) => setTimeout(r, 5));
  const st = repo.status();
  t('fallo de escritura (cuota) → estado FAILED, clave registrada y datos solo en memoria', st.state === 'failed' && st.failedKeys[0] === 'b' && !disk.has('b') && repo.kvGet('b') !== null, st);
  t('onError y onSettled(failed) disparados', errs === 1 && settled.includes('failed'));
  repo.kvSet('c', { data: 3 }); await repo.flush();
  t('un fallo no rompe la cola: otras escrituras se confirman', disk.has('c') && repo.status().state === 'failed');
  const after = await repo.retryFailed();
  t('reintento exitoso → saved y escrito en disco', after.state === 'saved' && disk.has('b'), after);

  failNext = 1;
  const okAsync = await repo.kvSetAsync('d', { data: 4 });
  t('kvSetAsync devuelve false si IndexedDB falla (antes también) y no queda "failed" por clave sin copia', okAsync === false && repo.status().failed === 0);
  const okAsync2 = await repo.kvSetAsync('d', { data: 4 });
  t('kvSetAsync devuelve true tras confirmar', okAsync2 === true && disk.has('d'));

  failNext = 1; repo.kvSet('e', { data: 5 }); await repo.flush().catch(() => {}); await new Promise((r) => setTimeout(r, 5));
  repo.kvSet('e', { data: 6 }); await repo.flush();
  t('una escritura posterior de la misma clave limpia el fallo (la versión nueva quedó en disco)', repo.status().state === 'saved' && disk.get('e').data === 6, repo.status());

  repo.kvDelete('a'); await repo.flush();
  t('kvDelete confirmado y sin pendientes', !disk.has('a') && repo.status().pending === 0);

  // carrera: dos escrituras seguidas de la misma clave → gana la última
  delay = 5; repo.kvSet('r', { data: 'v1' }); repo.kvSet('r', { data: 'v2' }); await repo.flush();
  t('carrera de escrituras: queda la última, en orden', disk.get('r').data === 'v2');

  // enrutado: save() síncrono sigue funcionando
  const ls = { kind: 'localStorage', lastError: null, save: () => true, load: () => null, remove() {}, clear() {} };
  const routed = FP.repository.createRoutedStorage({ ls, repo });
  t('createRoutedStorage.save mantiene su firma (true) y deja estado pending', routed.save('historicalData', { x: 1 }) === true && repo.status().state === 'pending');
  await repo.flush();

  // IndexedDB no disponible
  FP.idb = { available: () => false };
  const repo2 = FP.repository.createRepository({ name: 'y', version: 1 });
  await repo2.init();
  t('IndexedDB no disponible → modo unavailable, estado memory, lastError explicativo', repo2.mode === 'unavailable' && repo2.status().state === 'memory' && /disponible/.test(repo2.lastError));
  console.log(bad ? `\n${bad} FALLAS` : '\nOK'); process.exit(bad ? 1 : 0);
})();
