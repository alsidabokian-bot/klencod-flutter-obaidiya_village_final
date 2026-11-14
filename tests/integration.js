// اختبار التكامل: يشغّل ملف assets/game/index.html المجمّع في بيئة DOM وهمية (بدون GPU)
// يتحقق من: بدء بلا أخطاء، عصا ونظر وقفز، الأبواب، القائمة، زر الرجوع، الحفظ والاستعادة
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'assets', 'game', 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

function boot(savedJson) {
  const stats = { draw: 0, del: 0, clip: [], stores: [] };
  const gl = new Proxy({}, { get(t, k) {
    if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
    if (k === 'drawElements') return () => { stats.draw++; };
    if (k === 'deleteBuffer' || k === 'deleteVertexArray') return () => { stats.del++; };
    if (k === 'uniform1f') return (loc, v) => { if (loc === 'uClip') stats.clip.push(v); };
    if (k === 'getUniformLocation') return (p, n) => n;
    if (typeof k === 'string' && /^[A-Z_0-9]+$/.test(k)) return 1;
    return () => ({});
  } });
  const els = {};
  const mk = id => { const cls = new Set(); return { id, style: {}, textContent: '', listeners: {},
    classList: { add: c => cls.add(c), remove: c => cls.delete(c), has: c => cls.has(c) },
    addEventListener(e, f) { (this.listeners[e] = this.listeners[e] || []).push(f); },
    setPointerCapture() {}, getContext: () => gl,
    click() { (this.listeners.click || []).forEach(f => f({})); },
    fire(e, ev) { (this.listeners[e] || []).forEach(f => f(Object.assign({ preventDefault() {}, pointerType: 'touch' }, ev))); } }; };
  const winL = {}, storeW = [];
  const document = { body: { className: '' }, hidden: false, getElementById: id => els[id] || (els[id] = mk(id)), addEventListener() {} };
  let rafQ = [], timeouts = [], T = 0;
  const ls = { getItem: () => savedJson || null, setItem: () => {} };
  const win = { innerWidth: 800, innerHeight: 360, devicePixelRatio: 2, addEventListener(e, f) { (winL[e] = winL[e] || []).push(f); }, OBStore: { postMessage: m => storeW.push(m) } };
  const ctx = { document, window: win, performance: { now: () => T }, localStorage: ls,
    requestAnimationFrame: f => rafQ.push(f), setTimeout: f => timeouts.push(f), console,
    Math, JSON, Float32Array, Uint8Array, Uint16Array, Uint32Array, Int16Array, Int32Array, Map, Set, Object, Array, Number, String, Error, Date, Promise, isFinite, parseInt, parseFloat };
  Object.assign(win, ctx); vm.createContext(ctx); vm.runInContext(code, ctx); timeouts.forEach(f => f());
  const run = n => { for (let i = 0; i < n; i++) { const q = rafQ; rafQ = []; T += 16.7; q.forEach(f => f(T)); } };
  return { els, run, win, stats, storeW, doc: document, get g() { return win.__g; } };
}

const results = []; const ok = (n, c, info) => results.push([n, !!c, info || '']);
const A = boot(null); A.run(5);
ok('بدء بلا أخطاء', !A.doc.getElementById('err').textContent, A.doc.getElementById('err').textContent);
ok('وضع اللعب افتراضيًا', A.doc.body.className === 'mode-play');
const P = A.g.player, ctrl = A.els.ctrl;
const z0 = P.z;
ctrl.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 250 }); ctrl.fire('pointermove', { pointerId: 1, clientX: 100, clientY: 190 }); A.run(120);
ok('عصا الحركة تحرّك اللاعب', z0 - P.z > 5, 'dz=' + (z0 - P.z).toFixed(2));
ctrl.fire('pointerup', { pointerId: 1 }); A.run(40);
const yaw0 = P.yaw; ctrl.fire('pointerdown', { pointerId: 2, clientX: 600, clientY: 200 }); ctrl.fire('pointermove', { pointerId: 2, clientX: 700, clientY: 200 }); A.run(2); ctrl.fire('pointerup', { pointerId: 2 });
ok('السحب يدير النظر', Math.abs(P.yaw - yaw0 - 0.52) < 0.02);
const base = P.y; A.els.bJump.fire('pointerdown', {}); let mx = P.y; for (let i = 0; i < 30; i++) { A.run(1); mx = Math.max(mx, P.y); } A.els.bJump.fire('pointerup', {});
ok('زر القفز', mx - base > 1.0, 'apex=' + (mx - base).toFixed(2));
const { world, vil } = A.g, G = 14, h = vil.houses[3], yawOf = { n: Math.PI, s: 0, e: -Math.PI/2, w: Math.PI/2 }[h.face];
P.place(h.door.ox + .5, G + 1, h.door.oz + .5, yawOf); A.run(10);
ok('نص الفتح يظهر أمام الباب', A.els.bUse.classList.has('on') && A.els.prompt.textContent === 'فتح الباب', A.els.prompt.textContent);
const del0 = A.stats.del; A.els.bUse.fire('pointerdown', {}); A.run(3);
ok('فتح الباب يعيد تشبيك القطع', h.doorOpen === true && A.stats.del > del0);
P.place(h.door.x + .5, G + 1, h.door.z + .5, yawOf); A.run(3); A.els.bUse.fire('pointerdown', {}); A.run(3);
ok('لا يُغلق الباب على اللاعب', h.doorOpen === true);
P.place(127.5, G + 1, 197.5, 0); A.run(5);
ok('الرجوع الأول يفتح القائمة', A.win.__back() === 'stay' && A.els.menu.classList.has('open'));
ok('الرجوع الثاني يطلب الخروج', A.win.__back() === 'exit');
A.els.mResume.fire('click', {});
A.els.mView.fire('click', {}); A.run(3);
ok('وضع المعاينة', A.doc.body.className === 'mode-view');
A.els.c2.fire('click', {}); A.run(2);
ok('قطع الأسطح يعمل في المعاينة', A.stats.clip.slice(-1)[0] < 100);
A.win.__back(); A.run(2);
ok('الرجوع من المعاينة إلى اللعب', A.doc.body.className === 'mode-play' && A.stats.clip.slice(-1)[0] === 1000);
A.els.bMenu.fire('click', {});
const last = A.storeW[A.storeW.length - 1], sv = JSON.parse(last);
ok('الحفظ يتضمن الموقع وحالة الأبواب', sv.pos && Number.isFinite(sv.pos.x) && Array.isArray(sv.doors), 'doors=' + JSON.stringify(sv.doors));
const B2 = boot(last); B2.run(5);
ok('استعادة الموقع', Math.hypot(B2.g.player.x - sv.pos.x, B2.g.player.z - sv.pos.z) < 0.3);
ok('استعادة الأبواب المفتوحة', JSON.stringify(B2.g.vil.houses.filter(x => x.doorOpen).map(x => x.id)) === JSON.stringify(sv.doors));
const C = boot(JSON.stringify({ quality: 'low', pos: { x: h.x + .5, y: 15, z: h.z + .5, yaw: 0 }, doors: [] })); C.run(3);
ok('موقع محفوظ داخل جدار يُصحَّح للبداية', Math.abs(C.g.player.x - 127.5) < 0.1 && Math.abs(C.g.player.z - 197.5) < 1);
const D = boot(JSON.stringify({ quality: 'low', pos: null, doors: [] })); D.run(3);
ok('الجودة المحفوظة منخفضة تُطبَّق بلا خطأ', !D.doc.getElementById('err').textContent && D.doc.getElementById('q').textContent.includes('منخفضة'), D.doc.getElementById('q').textContent);

const fails = results.filter(r => !r[1]);
results.forEach(r => console.log((r[1] ? 'PASS' : 'FAIL') + '  ' + r[0] + (r[2] ? '   [' + r[2] + ']' : '')));
console.log('---'); console.log(fails.length ? fails.length + ' FAILED of ' + results.length : 'ALL ' + results.length + ' INTEGRATION TESTS PASSED');
process.exit(fails.length ? 1 : 0);
