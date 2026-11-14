// اختبارات قرية العبيدية — تعمل على ملفات game_src مباشرة (بدون متصفح ولا GPU)
// التشغيل: node tests/run_all.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = path.join(__dirname, '..', 'game_src');
const ORDER = ['config.js', 'math.js', 'meshes.js', 'world.js', 'terrain.js', 'interior.js', 'village.js', 'player.js', 'renderer.js'];
const code = ORDER.map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');

const body = String.raw`
const results = []; const T = (name, ok, info) => results.push([name, !!ok, info || '']);
const NORMS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]], UVX = [[2,1],[0,2],[0,1]];
const w = generateTerrain(), V = buildVillage(w), G = CFG.SEA, houses = V.houses;

// --- 1. الدمج مقارنة بالمرجع (كل وجه مكشوف بالضبط مرة واحدة)
function naiveFaces(cx, cz) {
  const S = CFG.CHUNK, set = new Map();
  for (let y = 0; y < w.sy; y++) for (let z = cz*S; z < cz*S+S; z++) for (let x = cx*S; x < cx*S+S; x++) {
    if (!w.get(x, y, z)) continue; const C = [x, y, z];
    NORMS.forEach((n, f) => { if (w.get(x+n[0], y+n[1], z+n[2])) return;
      const a = f >> 1, sg = (f & 1) ? -1 : 1, plane = C[a] + (sg > 0 ? 1 : 0);
      const k = a+'|'+plane+'|'+C[UVX[a][0]]+'|'+C[UVX[a][1]]+'|'+sg; set.set(k, (set.get(k)||0)+1); });
  } return set;
}
function greedyFaces(m, sgOf) {
  const F = new Float32Array(m.buf), out = new Map();
  for (let q = 0; q < m.nv / 4; q++) {
    const vs = [0,1,2,3].map(k => [F[(q*4+k)*4], F[(q*4+k)*4+1], F[(q*4+k)*4+2]]);
    let a = -1; for (let ax = 0; ax < 3; ax++) if (vs.every(p => p[ax] === vs[0][ax])) a = ax;
    if (a < 0) return null;
    const plane = vs[0][a], au = UVX[a][0], av = UVX[a][1];
    const u0 = Math.min(...vs.map(p => p[au])), u1 = Math.max(...vs.map(p => p[au]));
    const v0 = Math.min(...vs.map(p => p[av])), v1 = Math.max(...vs.map(p => p[av]));
    const sg = sgOf(a, plane, u0, v0);
    for (let u = u0; u < u1; u++) for (let v = v0; v < v1; v++) { const k = a+'|'+plane+'|'+u+'|'+v+'|'+sg; out.set(k, (out.get(k)||0)+1); }
  } return out;
}
let mism = 0, miss = 0, extra = 0, dup = 0, wind = 0, badIdx = 0, tN = 0, tG = 0;
for (let cz = 0; cz < w.czN; cz++) for (let cx = 0; cx < w.cxN; cx++) {
  const m = meshChunk(w, cx, cz, false), nA = naiveFaces(cx, cz);
  const dG = greedyFaces(m, (a, plane, u, v) => { const C = [0,0,0]; C[UVX[a][0]] = u; C[UVX[a][1]] = v; C[a] = plane - 1; return w.get(C[0],C[1],C[2]) ? 1 : -1; });
  if (!dG) { mism++; continue; }
  for (const c of dG.values()) if (c > 1) dup++;
  for (const k of nA.keys()) if (!dG.has(k)) miss++;
  for (const k of dG.keys()) if (!nA.has(k)) extra++;
  if (nA.size !== dG.size) mism++;
  tN += nA.size; tG += m.nv / 4;
  for (let i = 0; i < m.idx.length; i++) if (m.idx[i] >= m.nv) badIdx++;
}
T('الدمج يغطي الوجوه المكشوفة كلها بالضبط', mism === 0 && miss === 0 && extra === 0 && dup === 0, 'وجوه ' + tN + ' → رباعيات ' + tG + ' (تخفيض ' + Math.round(100*(1-tG/tN)) + '%)');
T('الفهارس ضمن حدود الرؤوس', badIdx === 0);

// --- 2. اتجاه المثلثات (CCW من الخارج) مع وبدون AO
function windingOK(ao) {
  let bad = 0;
  for (let cz = 0; cz < w.czN; cz++) for (let cx = 0; cx < w.cxN; cx++) {
    const m = meshChunk(w, cx, cz, ao), F = new Float32Array(m.buf);
    for (let i = 0; i < m.count; i += 3) {
      const p = k => { const o = m.idx[i+k]*4; return [F[o], F[o+1], F[o+2]]; };
      const a = p(0), b = p(1), c = p(2), u = [b[0]-a[0],b[1]-a[1],b[2]-a[2]], v = [c[0]-a[0],c[1]-a[1],c[2]-a[2]];
      const nn = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
      const cen = [(a[0]+b[0]+c[0])/3, (a[1]+b[1]+c[1])/3, (a[2]+b[2]+c[2])/3];
      const ax = Math.abs(nn[0]) > .5 ? 0 : Math.abs(nn[1]) > .5 ? 1 : 2, sg = Math.sign(nn[ax]);
      const pc = cen.map(Math.floor), pp = pc.slice(), pa = pc.slice(); pp[ax] = Math.floor(cen[ax] - .5*sg); pa[ax] = Math.floor(cen[ax] + .5*sg);
      if (!(w.get(...pp) && !w.get(...pa))) bad++;
    }
  } return bad;
}
T('اتجاه المثلثات صحيح بدون AO', windingOK(false) === 0);
T('اتجاه المثلثات صحيح مع AO', windingOK(true) === 0);

// --- 3. الفيزياء
const P = new Player(w), run = s => { for (let i = 0; i < s*60; i++) P.update(1/60, { fwd: 0, str: 0, jump: false }); };
const walk = (s, j) => { for (let i = 0; i < s*60; i++) P.update(1/60, { fwd: 1, str: 0, jump: j && i === 0 }); };
P.place(127.5, G+1, 197.5, 0); run(1);
T('الهبوط على الأرض', P.onGround && Math.abs(P.y - (G+1)) < 0.01, 'y=' + P.y);
const z0 = P.z; walk(3, false); T('المشي للأمام على الطريق', z0 - P.z > 14, 'dz=' + (z0-P.z).toFixed(2));
P.place(127.5, G+1, 197.5, 0); run(0.5); let apex = P.y; P.update(1/60, { fwd:0, str:0, jump:true }); for (let i = 0; i < 90; i++) { P.update(1/60, { fwd:0, str:0, jump:false }); apex = Math.max(apex, P.y); }
T('القفز', apex - (G+1) > 1.0, 'ارتفاع=' + (apex-(G+1)).toFixed(2));
const topY = (x, z) => { for (let y = w.sy-1; y >= 0; y--) if (w.get(x,y,z)) return y+1; return 0; };
let edgeOK = true;
for (const [x, z, yaw] of [[3,128,-Math.PI/2],[252,128,Math.PI/2],[128,252,0],[128,3,Math.PI]]) {
  P.place(x+.5, topY(x,z), z+.5, yaw); run(0.2); for (let i = 0; i < 480; i++) P.update(1/60, { fwd:1, str:0, jump:true });
  if (!(P.x > 0 && P.x < w.sx && P.z > 0 && P.z < w.sz)) edgeOK = false;
}
T('حدود العالم تمنع الخروج', edgeOK);

// --- 4. الأبواب: المغلق يمنع والمفتوح يسمح، واختيار الباب بالشعاع
let closedOK = 0, openOK = 0, pickC = 0, pickO = 0;
const inside = h => P.x > h.x+.5 && P.x < h.x+h.w-.5 && P.z > h.z+.5 && P.z < h.z+h.d-.5 && P.y < G+9;
const yawOf = h => ({ n: Math.PI, s: 0, e: -Math.PI/2, w: Math.PI/2 })[h.face];
const dm = buildDoorMap(w, houses);
for (const h of houses) {
  setDoor(w, h, false); P.place(h.door.ox+.5, G+1, h.door.oz+.5, yawOf(h)); run(0.3); walk(2.5, false); if (!inside(h)) closedOK++;
  P.pitch = 0; P.place(h.door.ox+.5, G+1, h.door.oz+.5, yawOf(h)); const e = P.eye(), d = P.dir();
  if (pickDoor(w, dm, houses, e, d, PH.REACH) === h) pickC++;
  setDoor(w, h, true); P.place(h.door.ox+.5, G+1, h.door.oz+.5, yawOf(h)); P.pitch = 0; run(0.3);
  const e2 = P.eye(), d2 = P.dir(); if (pickDoor(w, dm, houses, e2, d2, PH.REACH) === h) pickO++;
  walk(2.5, false); if (inside(h)) openOK++;
  setDoor(w, h, false);
}
T('الباب المغلق يمنع الدخول', closedOK === houses.length, closedOK + '/' + houses.length);
T('الباب المفتوح يسمح بالدخول', openOK === houses.length, openOK + '/' + houses.length);
T('اختيار الباب بالنظر (مغلق/مفتوح)', pickC === houses.length && pickO === houses.length, pickC + '/' + pickO);

// --- 5. الأبواب لا تكسر تشبيك القطع (فتح/إغلاق كل الأبواب ثم المقارنة)
const coverAll = () => { let bad = 0; for (let cz = 0; cz < w.czN; cz++) for (let cx = 0; cx < w.cxN; cx++) {
  const dG = greedyFaces(meshChunk(w, cx, cz, false), (a, plane, u, v) => { const C = [0,0,0]; C[UVX[a][0]] = u; C[UVX[a][1]] = v; C[a] = plane - 1; return w.get(C[0],C[1],C[2]) ? 1 : -1; });
  const nA = naiveFaces(cx, cz); if (!dG) { bad++; continue; }
  if (nA.size !== dG.size) bad++; for (const k of nA.keys()) if (!dG.has(k)) bad++; for (const c of dG.values()) if (c > 1) bad++;
} return bad; };
for (const h of houses) setDoor(w, h, true);
T('فتح كل الأبواب لا يكسر التشبيك (تغطية الوجوه)', coverAll() === 0);
for (const h of houses) setDoor(w, h, false);
T('إغلاق الأبواب يعيد الحالة', coverAll() === 0);

// --- 6. قابلية الوصول داخل المنازل (الطابقان) والأبواب من الشارع
const key = (x,y,z) => x+','+y+','+z;
const pass = (x,y,z) => { const b = w.get(x,y,z); return b === 0 || b === B.DOOR; };
const stand = (x,y,z) => { const f = w.get(x,y-1,z); return f && f !== B.DOOR && pass(x,y,z) && pass(x,y+1,z); };
let unreachG = 0, unreachU = 0, outerBad = 0;
for (const h of houses) {
  const seen = new Set(), q = [[h.door.ox, G+1, h.door.oz]]; seen.add(key(...q[0]));
  if (!stand(...q[0])) outerBad++;
  while (q.length) { const [x,y,z] = q.pop(); for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x+dx, nz = z+dz;
    for (const dy of [0,1,-1]) { const ny = y+dy; if (stand(nx,ny,nz) && (dy !== 1 || pass(x,y+2,z)) && !seen.has(key(nx,ny,nz))) { seen.add(key(nx,ny,nz)); q.push([nx,ny,nz]); break; } } } }
  for (let z = h.z+1; z < h.z+h.d-1; z++) for (let x = h.x+1; x < h.x+h.w-1; x++) {
    if (stand(x,G+1,z) && !seen.has(key(x,G+1,z))) unreachG++;
    if (h.floors === 2 && stand(x,G+6,z) && !seen.has(key(x,G+6,z))) unreachU++;
  }
}
T('كل غرف الطابق الأرضي قابلة للوصول', unreachG === 0, 'معزولة=' + unreachG);
T('كل غرف الطابق العلوي قابلة للوصول', unreachU === 0, 'معزولة=' + unreachU);
T('الأبواب الخارجية قابلة للوصول من الشارع', outerBad === 0);

// --- 7. سلامة المنازل وعدم التداخل
let ov = 0; for (let i = 0; i < houses.length; i++) for (let j = i+1; j < houses.length; j++) { const a = houses[i], b = houses[j]; if (a.x < b.x+b.w && a.x+a.w > b.x && a.z < b.z+b.d && a.z+a.d > b.z) ov++; }
T('لا تداخل بين المنازل', ov === 0);
let integ = 0; for (const h of houses) { const H = 4*h.floors; for (let z = h.z; z < h.z+h.d; z++) for (let x = h.x; x < h.x+h.w; x++) if (!w.get(x, G+H+1, z)) integ++; }
T('كل منزل له سقف كامل', integ === 0);

// --- 8. الكاميرا وإخفاء القطع
const R = Object.create(Renderer.prototype); R.planes = new Float32Array(24);
const Pm = M4.create(), Vm = M4.create(), VP = M4.create();
M4.perspective(Pm, 1.0, 16/9, .5, 900); M4.lookAt(Vm, 0, 0, 10, 0, 0, 0, 0, 1, 0); M4.multiply(VP, Pm, Vm); R.setFrustum(VP);
T('الإخفاء: أمام الكاميرا مرئي، خلفها مخفي', R.visible({x:0,y:0,z:-50,r:5}) && !R.visible({x:0,y:0,z:60,r:5}));

const fails = results.filter(r => !r[1]);
results.forEach(r => console.log((r[1] ? 'PASS' : 'FAIL') + '  ' + r[0] + (r[2] ? '   [' + r[2] + ']' : '')));
console.log('---');
console.log(fails.length === 0 ? 'ALL ' + results.length + ' TESTS PASSED' : fails.length + ' FAILED of ' + results.length);
globalThis.__failCount = fails.length;
`;
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(code + '\n' + body, sandbox);
process.exit(sandbox.__failCount ? 1 : 0);
