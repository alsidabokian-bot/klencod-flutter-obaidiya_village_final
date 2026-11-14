// داخل المنازل — المرحلة 4: غرف، أبواب، نوافذ، أثاث، سلالم
// ارتفاع الطابق الأرضي 4 مكعبات (y=1..4 فوق الأرض G)، بلاطة الطابق العلوي عند y=5، الطابق العلوي y=6..8.
function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
const k2 = (x, z) => x * 1024 + z;

// يخطط السلم ومنطقة المدخل. يخفض المنزل لطابق واحد إن لم يتسع السلم.
function planInterior(h, rng) {
  const x0 = h.x + 1, x1 = h.x + h.w - 2, z0 = h.z + 1, z1 = h.z + h.d - 2, d = h.door;
  const ex = d.x + (h.face === 'e' ? -1 : h.face === 'w' ? 1 : 0), ez = d.z + (h.face === 's' ? -1 : h.face === 'n' ? 1 : 0);
  const P = { x0, x1, z0, z1, entry: { x: ex, z: ez }, entryZone: new Set(), reserved: new Set(), keep: new Set(), upKeep: new Set(), stairs: null };
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) P.entryZone.add(k2(ex + dx, ez + dz));
  if (h.floors === 2) {
    const iw = x1 - x0 + 1, id = z1 - z0 + 1, c = [];
    const run = (sx, sz, dx, dz) => { const cells = []; for (let k = 0; k < 6; k++) cells.push({ x: sx + dx * k, z: sz + dz * k }); return { cells, dx, dz }; };
    if (iw >= 6) for (const zz of [z0, z1]) { c.push(run(x0 + 5, zz, -1, 0)); c.push(run(x1 - 5, zz, 1, 0)); }
    if (id >= 6) for (const xx of [x0, x1]) { c.push(run(xx, z0 + 5, 0, -1)); c.push(run(xx, z1 - 5, 0, 1)); }
    shuffle(c, rng);
    const ok = c.find(s => !s.cells.some(q => P.entryZone.has(k2(q.x, q.z))));
    if (!ok) h.floors = 1;
    else {
      P.stairs = ok;
      for (const q of ok.cells) P.reserved.add(k2(q.x, q.z));
      const px = ok.dz !== 0 ? 1 : 0, pz = ok.dx !== 0 ? 1 : 0, s0 = ok.cells[0];
      const add = (set, x, z) => { if (x >= x0 && x <= x1 && z >= z0 && z <= z1) set.add(k2(x, z)); };
      add(P.keep, s0.x - ok.dx, s0.z - ok.dz); add(P.keep, s0.x + px, s0.z + pz); add(P.keep, s0.x - px, s0.z - pz);
      for (let k = 1; k <= 5; k++) { add(P.upKeep, ok.cells[k].x + px, ok.cells[k].z + pz); add(P.upKeep, ok.cells[k].x - px, ok.cells[k].z - pz); }
    }
  }
  return P;
}

// تقسيم الطابق الأرضي إلى غرف بجدران وفتحات أبواب (BSP)
function partitionRooms(P, rng) {
  const rooms = [], walls = [], doorways = [], doorAdj = new Set();
  const bad = (x, z) => P.entryZone.has(k2(x, z)) || P.reserved.has(k2(x, z)) || P.keep.has(k2(x, z)) || doorAdj.has(k2(x, z));
  const rec = (r, depth) => {
    const w = r.x1 - r.x0 + 1, d = r.z1 - r.z0 + 1, canX = w >= 7, canZ = d >= 7;
    if (depth >= 2 || (!canX && !canZ) || (depth > 0 && (rng() < .2 || w * d < 40))) { rooms.push(r); return; }
    const ax = canX && canZ ? (w > d + 1 ? 'x' : d > w + 1 ? 'z' : (rng() < .5 ? 'x' : 'z')) : (canX ? 'x' : 'z');
    const lo = ax === 'x' ? r.x0 + 3 : r.z0 + 3, hi = ax === 'x' ? r.x1 - 3 : r.z1 - 3, ps = [];
    for (let p = lo; p <= hi; p++) ps.push(p);
    shuffle(ps, rng);
    const from = ax === 'x' ? r.z0 : r.x0, to = ax === 'x' ? r.z1 : r.x1; let pick = null;
    for (const p of ps) {
      let ok = true; const cand = [];
      for (let q = from; q <= to; q++) {
        const cx = ax === 'x' ? p : q, cz = ax === 'x' ? q : p;
        if (bad(cx, cz)) { ok = false; break; }
        const sa = ax === 'x' ? [cx - 1, cz] : [cx, cz - 1], sb = ax === 'x' ? [cx + 1, cz] : [cx, cz + 1];
        if (!bad(sa[0], sa[1]) && !bad(sb[0], sb[1])) cand.push(q);
      }
      if (ok && cand.length) { pick = { p, q: cand[(rng() * cand.length) | 0] }; break; }
    }
    if (!pick) { rooms.push(r); return; }
    const dw = ax === 'x' ? { x: pick.p, z: pick.q, ax } : { x: pick.q, z: pick.p, ax };
    walls.push({ ax, p: pick.p, r }); doorways.push(dw);
    doorAdj.add(k2(dw.x, dw.z));
    if (ax === 'x') { doorAdj.add(k2(dw.x - 1, dw.z)); doorAdj.add(k2(dw.x + 1, dw.z)); }
    else { doorAdj.add(k2(dw.x, dw.z - 1)); doorAdj.add(k2(dw.x, dw.z + 1)); }
    if (ax === 'x') { rec({ x0: r.x0, x1: pick.p - 1, z0: r.z0, z1: r.z1 }, depth + 1); rec({ x0: pick.p + 1, x1: r.x1, z0: r.z0, z1: r.z1 }, depth + 1); }
    else { rec({ x0: r.x0, x1: r.x1, z0: r.z0, z1: pick.p - 1 }, depth + 1); rec({ x0: r.x0, x1: r.x1, z0: pick.p + 1, z1: r.z1 }, depth + 1); }
  };
  rec({ x0: P.x0, x1: P.x1, z0: P.z0, z1: P.z1 }, 0);
  return { rooms, walls, doorways, doorAdj };
}

function perimeterCells(r, blocked, used) {
  const out = [];
  for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) {
    if (!(x === r.x0 || x === r.x1 || z === r.z0 || z === r.z1)) continue;
    const k = k2(x, z); if (!blocked.has(k) && !used.has(k)) out.push({ x, z });
  }
  return out;
}

function placeBed(w, r, fy, blocked, used, rng) {
  const per = shuffle(perimeterCells(r, blocked, used), rng), has = new Set(per.map(c => k2(c.x, c.z)));
  for (const c of per) for (const [dx, dz] of [[1, 0], [0, 1]]) {
    const x2 = c.x + dx, z2 = c.z + dz;
    if (!has.has(k2(x2, z2))) continue;
    w.set(c.x, fy, c.z, B.WOOD); w.set(x2, fy, z2, B.BEDSPREAD); used.add(k2(c.x, c.z)); used.add(k2(x2, z2)); return true;
  }
  return false;
}

function furnishRoom(w, r, type, fy, blocked, used, rng) {
  const rw = r.x1 - r.x0 + 1, rd = r.z1 - r.z0 + 1, G = CFG.SEA;
  const rug = () => { if (rw >= 5 && rd >= 5) for (let z = r.z0 + 1; z < r.z1; z++) for (let x = r.x0 + 1; x < r.x1; x++) if (w.get(x, fy - 1, z)) w.set(x, fy - 1, z, B.RUG); };
  const take = n => shuffle(perimeterCells(r, blocked, used), rng).slice(0, n);
  const put = (c, ...bs) => { bs.forEach((b, i) => w.set(c.x, fy + i, c.z, b)); used.add(k2(c.x, c.z)); };
  if (type === 'majlis') {            // مجلس: سجاد وفرش على الجانبين الطويلين
    rug();
    const alongX = rw >= rd;
    for (const c of perimeterCells(r, blocked, used)) {
      if (alongX ? (c.z === r.z0 || c.z === r.z1) : (c.x === r.x0 || c.x === r.x1)) put(c, B.CUSHION);
    }
  } else if (type === 'bedroom' || type === 'upper') {   // سرير وصندوق
    if (type === 'upper') rug();
    placeBed(w, r, fy, blocked, used, rng);
    if (type === 'upper' && rw * rd >= 28) placeBed(w, r, fy, blocked, used, rng);
    for (const c of take(1)) put(c, B.WOOD);
  } else if (type === 'kitchen') {    // مطبخ: تنور، جرار، خزانة
    const corners = [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]].filter(q => !blocked.has(k2(q[0], q[1])) && !used.has(k2(q[0], q[1])));
    if (corners.length) { const q = corners[(rng() * corners.length) | 0]; put({ x: q[0], z: q[1] }, B.DSTONE, B.DSTONE); }
    const t = take(4);
    if (t[0]) put(t[0], B.CLAY); if (t[1]) put(t[1], B.CLAY); if (t[2]) put(t[2], B.WOOD, B.WOOD);
  } else if (type === 'storage') {    // مخزن: أكياس وصناديق
    const t = take(6);
    t.forEach((c, i) => { if (i < 3) put(c, B.SACK, ...(i === 0 ? [B.SACK] : [])); else put(c, B.WOOD, ...(i === 3 ? [B.WOOD] : [])); });
  }
}

function addWindows(w, h, rng, wy, forbid) {
  const G = CFG.SEA, d = h.door, x1 = h.x + h.w - 1, z1 = h.z + h.d - 1;
  const sides = [
    { cells: Array.from({ length: h.w - 2 }, (_, i) => ({ x: h.x + 1 + i, z: h.z, ix: h.x + 1 + i, iz: h.z + 1 })), horiz: true },
    { cells: Array.from({ length: h.w - 2 }, (_, i) => ({ x: h.x + 1 + i, z: z1, ix: h.x + 1 + i, iz: z1 - 1 })), horiz: true },
    { cells: Array.from({ length: h.d - 2 }, (_, i) => ({ x: h.x, z: h.z + 1 + i, ix: h.x + 1, iz: h.z + 1 + i })), horiz: false },
    { cells: Array.from({ length: h.d - 2 }, (_, i) => ({ x: x1, z: h.z + 1 + i, ix: x1 - 1, iz: h.z + 1 + i })), horiz: false },
  ];
  let n = 0;
  for (const s of sides) {
    let skip = 1 + ((rng() * 2) | 0);
    for (const c of s.cells) {
      if (skip > 0) { skip--; continue; }
      if (Math.abs(c.x - d.x) <= 1 && Math.abs(c.z - d.z) <= 1) continue;
      if (forbid.has(k2(c.ix, c.iz))) continue;
      w.set(c.x, G + wy, c.z, B.AIR); n++; skip = 2 + ((rng() * 2) | 0);
    }
  }
  return n;
}

function buildInterior(w, h, rng) {
  const G = CFG.SEA, P = h.plan, part = partitionRooms(P, rng), wallCells = new Set();
  // 1) جدران التقسيم وفتحات الأبواب الداخلية
  for (const wl of part.walls) {
    const from = wl.ax === 'x' ? wl.r.z0 : wl.r.x0, to = wl.ax === 'x' ? wl.r.z1 : wl.r.x1;
    for (let q = from; q <= to; q++) {
      const x = wl.ax === 'x' ? wl.p : q, z = wl.ax === 'x' ? q : wl.p;
      wallCells.add(k2(x, z));
      for (let y = 1; y <= 4; y++) w.set(x, G + y, z, B.WALL);
    }
  }
  for (const d of part.doorways) { w.set(d.x, G + 1, d.z, B.AIR); w.set(d.x, G + 2, d.z, B.AIR); }
  // 2) السلم: 5 درجات حجرية، وفتحة في بلاطة الطابق العلوي فوق الدرجات 2..4
  if (h.floors === 2 && P.stairs) {
    for (let i = 1; i <= 5; i++) { const c = P.stairs.cells[i]; for (let y = 1; y <= i; y++) w.set(c.x, G + y, c.z, B.STONE); }
    for (let i = 2; i <= 4; i++) { const c = P.stairs.cells[i]; w.set(c.x, G + 5, c.z, B.AIR); }
  }
  // 3) الباب الرئيسي مغلق (يُفتح بـ setDoor)
  w.set(h.door.x, G + 1, h.door.z, B.DOOR); w.set(h.door.x, G + 2, h.door.z, B.DOOR); h.doorOpen = false;
  // 4) الأثاث: المجلس عند المدخل ثم بقية الغرف
  const blocked = new Set([...P.entryZone, ...P.reserved, ...P.keep, ...part.doorAdj]), used = new Set();
  const rooms = part.rooms.map(r => ({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, type: '' }));
  let er = rooms.find(r => P.entry.x >= r.x0 && P.entry.x <= r.x1 && P.entry.z >= r.z0 && P.entry.z <= r.z1) || rooms[0];
  er.type = 'majlis';
  const others = rooms.filter(r => r !== er).sort((a, b) => (b.x1 - b.x0 + 1) * (b.z1 - b.z0 + 1) - (a.x1 - a.x0 + 1) * (a.z1 - a.z0 + 1));
  const seq = ['bedroom', 'kitchen', 'storage', 'bedroom'];
  others.forEach((r, i) => { r.type = seq[i % seq.length]; });
  for (const r of rooms) furnishRoom(w, r, r.type, G + 1, blocked, used, rng);
  if (rooms.length === 1) { furnishRoom(w, er, 'bedroom', G + 1, blocked, used, rng); furnishRoom(w, er, 'kitchen', G + 1, blocked, used, rng); }
  // 5) الطابق العلوي: غرفة مفتوحة بأسرّة وصندوق
  let nWin = 0;
  const wallInner = new Set([...wallCells, ...P.reserved, ...P.keep, ...part.doorAdj]);
  nWin += addWindows(w, h, rng, 2, wallInner);
  if (h.floors === 2) {
    const up = { x0: P.x0, x1: P.x1, z0: P.z0, z1: P.z1 };
    furnishRoom(w, up, 'upper', G + 6, new Set([...P.reserved, ...P.upKeep]), new Set(), rng);
    rooms.push(Object.assign({ type: 'upper', floor: 2 }, up));
    nWin += addWindows(w, h, rng, 7, new Set([...P.reserved]));
  }
  h.rooms = rooms; h.doorways = part.doorways; h.stairs = P.stairs; h.windows = nWin; h.plan = null;
}

// فتح/إغلاق الباب الرئيسي. يعيد قائمة القطع [cx,cz] التي تحتاج إعادة تشبيك
function setDoor(w, h, open) {
  const G = CFG.SEA, d = h.door, S = CFG.CHUNK, out = new Set();
  for (let y = 1; y <= 2; y++) w.data[w.idx(d.x, G + y, d.z)] = open ? B.AIR : B.DOOR;
  w.recalcColumn(d.x, d.z); h.doorOpen = open;
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) out.add(Math.floor((d.x + dx) / S) + ',' + Math.floor((d.z + dz) / S));
  return [...out].map(s => s.split(',').map(Number));
}
