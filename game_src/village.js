// بناء القرية — المرحلة 3: أحياء ومنازل (هياكل خارجية) وطرق وأزقة وأسوار
// المواقع مقدَّرة من لقطة القمر الصناعي ومرجع Minecraft. الشمال = -z، الشرق = +x.
const VILLAGE = {
  // أحياء المباني: مركز ونصفا قطر وعدد المنازل المستهدف
  clusters: [
    { id: 'A', cx: 94,  cz: 160, rx: 21, rz: 28, n: 22 },
    { id: 'B', cx: 131, cz: 146, rx: 18, rz: 26, n: 24 },
    { id: 'C', cx: 166, cz: 134, rx: 14, rz: 16, n: 14 },
    { id: 'D', cx: 168, cz: 187, rx: 11, rz: 13, n: 16 },
    { id: 'E', cx: 140, cz: 192, rx: 10, rz: 8,  n: 8 },
  ],
  // طرق ترابية: strict = تُرسم على أرض القرية المسطحة فقط
  roads: [
    { w: 3, strict: true, pts: [[70,140],[84,126],[108,116],[126,112],[150,114],[176,112],[186,128],[190,150],[188,176],[184,196],[170,203],[132,203],[126,198],[112,201],[88,198],[72,184],[68,160],[70,140]] },
    { w: 3, strict: true, pts: [[112,136],[104,132],[100,122],[104,114]] },
    { w: 3, strict: true, pts: [[112,136],[112,200]] },
    { w: 3, strict: true, pts: [[151,116],[151,172]] },
    { w: 3, strict: true, pts: [[112,172],[186,172]] },
    { w: 3, strict: true, pts: [[128,172],[128,200]] },
    { w: 3, strict: false, pts: [[151,114],[146,100],[145,60],[145,45]] },   // شمالًا نحو الوادي
    { w: 3, strict: false, pts: [[127,200],[127,245]] },                      // جنوبًا بين المزارع
    { w: 3, strict: false, pts: [[188,177],[232,177]] },                      // شرقًا بين المزارع
    { w: 3, strict: false, pts: [[69,170],[48,170]] },                        // غربًا
  ],
  // أحواش بأسوار حجرية وبوابة
  yards: [
    { x0: 156, z0: 152, x1: 174, z1: 168, gate: 's' },
    { x0: 115, z0: 176, x1: 125, z1: 186, gate: 'w' },
  ],
};

function stampLine(mask, N, p, q, hw, v) {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]), steps = Math.max(1, Math.ceil(len * 2)), r = Math.ceil(hw);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps, px = p[0] + (q[0] - p[0]) * t, pz = p[1] + (q[1] - p[1]) * t;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const x = Math.round(px) + dx, z = Math.round(pz) + dz;
      if (x < 0 || z < 0 || x >= N || z >= N || Math.hypot(x - px, z - pz) > hw) continue;
      if (!mask[z * N + x]) mask[z * N + x] = v;
    }
  }
}

// يسوّي المستطيل على مستوى الأرض G ويزيل ما فوقه (أشجار أو بقايا)
function levelArea(w, x0, z0, x1, z1) {
  const G = CFG.SEA;
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (!w.inside(x, 0, z)) continue;
    const o = (z * w.sx + x) * w.sy;
    for (let y = G + 1; y < w.sy; y++) w.data[o + y] = 0;
    for (let y = 0; y <= G; y++) if (!w.data[o + y]) w.data[o + y] = B.SAND;
    w.data[o + G] = B.SAND;
    w.colBase[z * w.sx + x] = G + 1; w.colTop[z * w.sx + x] = G;
  }
  w.final = false;
}

function plantTree(w, x, z, gy, rng) {
  const th = 2 + ((rng() * 2) | 0);
  for (let k = 1; k <= th; k++) w.set(x, gy + k, z, B.WOOD);
  const cy = gy + th + 1;
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++)
    if (!(Math.abs(dx) === 2 && Math.abs(dz) === 2) && !w.get(x + dx, cy, z + dz)) w.set(x + dx, cy, z + dz, B.LEAF);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) w.set(x + dx, cy + 1, z + dz, B.LEAF);
}

// يرسم مكعب طريق على سطح الأرض (بدون تغيير الارتفاع)
function paintPath(w, x, z, strict) {
  if (!w.inside(x, 0, z)) return;
  const G = CFG.SEA, c = z * w.sx + x, y = w.colBase[c] - 1;
  if (strict ? y !== G : Math.abs(y - G) > 3) return;
  const o = c * w.sy, cur = w.data[o + y];
  if (cur === B.STONE || cur === B.DSTONE || cur === B.SANDSTONE || cur === B.SOIL || cur === B.CROP || cur === B.CROP2 || cur === B.DIRT) return;
  w.data[o + y] = B.PATH;
  for (let k = 1; k <= 7; k++) { const b = w.data[o + y + k]; if (b === B.LEAF || b === B.WOOD) w.data[o + y + k] = 0; }
}

function buildHouse(w, h, rng) {
  const G = CFG.SEA, hh = 4, H = hh * h.floors, x1 = h.x + h.w - 1, z1 = h.z + h.d - 1;
  const style = rng(), wallB = style < .22 ? B.MUD : B.WALL, baseB = style > .55 ? B.STONE : wallB;
  const parapet = rng() < .85, box = rng() < .35;
  for (let X = h.x; X <= x1; X++) for (let Z = h.z; Z <= z1; Z++) {
    const edge = X === h.x || X === x1 || Z === h.z || Z === z1;
    w.set(X, G, Z, edge ? B.STONE : B.DIRT);                         // أساس / أرضية ترابية
    for (let y = 1; y <= H; y++) {
      if (edge) w.set(X, G + y, Z, y === 1 ? baseB : wallB);
      else if (h.floors === 2 && y === hh + 1) w.set(X, G + y, Z, B.ROOF);   // بلاطة الطابق العلوي
    }
    w.set(X, G + H + 1, Z, B.ROOF);                                   // سقف مسطح
    if (edge && parapet) w.set(X, G + H + 2, Z, B.WALL);              // حاجز السطح
  }
  if (box && h.w >= 7 && h.d >= 7) w.fillBox(h.x + 1, G + H + 2, h.z + 1, h.x + 2, G + H + 3, h.z + 2, B.WALL);   // صندوق على السطح
  const d = h.door;                                                    // فتحة الباب + عتب خشبي
  w.set(d.x, G + 1, d.z, B.AIR); w.set(d.x, G + 2, d.z, B.AIR); w.set(d.x, G + 3, d.z, B.WOOD);
}

function buildYard(w, y, rng) {
  const G = CFG.SEA, cx = (y.x0 + y.x1) >> 1, cz = (y.z0 + y.z1) >> 1;
  for (let X = y.x0; X <= y.x1; X++) for (let Z = y.z0; Z <= y.z1; Z++) {
    const edge = X === y.x0 || X === y.x1 || Z === y.z0 || Z === y.z1;
    if (edge) { const b = hash3(X, 3, Z) < .25 ? B.DSTONE : B.STONE; w.set(X, G + 1, Z, b); w.set(X, G + 2, Z, b); }
    else { const q = hash3(X, 9, Z); w.set(X, G, Z, q < .3 ? B.CROP : q < .4 ? B.DGRASS : B.SAND); }
  }
  const gx = y.gate === 'w' ? y.x0 : y.gate === 'e' ? y.x1 : cx, gz = y.gate === 'n' ? y.z0 : y.gate === 's' ? y.z1 : cz;
  for (let k = 0; k < 2; k++) {
    const px = y.gate === 'w' || y.gate === 'e' ? gx : gx + k, pz = y.gate === 'n' || y.gate === 's' ? gz : gz + k;
    w.set(px, G + 1, pz, B.AIR); w.set(px, G + 2, pz, B.AIR); w.set(px, G, pz, B.PATH);
  }
  plantTree(w, cx + 1, cz - 1, G, rng);
}

function buildVillage(w) {
  const N = w.sx, G = CFG.SEA, T = TERRAIN, rng = mulberry32(77);
  const roadMask = new Uint8Array(N * N), obs = new Uint8Array(N * N), occH = new Uint8Array(N * N);
  const stamp = (a, x0, z0, x1, z1) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (x >= 0 && z >= 0 && x < N && z < N) a[z * N + x] = 1; };
  const disc = (a, cx, cz, r) => { for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (x >= 0 && z >= 0 && x < N && z < N && Math.hypot(x - cx, z - cz) <= r) a[z * N + x] = 1; };

  // 1) أقنعة: طرق، وعوائق (مزارع/دوائر/تلال/أحواش)
  for (const r of VILLAGE.roads) for (let i = 0; i < r.pts.length - 1; i++) stampLine(roadMask, N, r.pts[i], r.pts[i + 1], r.w / 2, r.strict ? 1 : 2);
  for (const f of T.fields) stamp(obs, f[0] - 2, f[1] - 2, f[2] + 2, f[3] + 2);
  for (const c of T.circles) disc(obs, c.x, c.z, c.r + 3);
  for (const m of T.mounds) disc(obs, m.x, m.z, m.r + 3);
  for (const y of VILLAGE.yards) stamp(obs, y.x0 - 1, y.z0 - 1, y.x1 + 1, y.z1 + 1);

  // 2) رسم الطرق على الأرض قبل بناء المنازل
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const m = roadMask[z * N + x]; if (m) paintPath(w, x, z, m === 1); }

  // 3) توزيع المنازل داخل الأحياء بفراغات أزقة
  const houses = [], inEll = (c, px, pz) => { const a = Math.abs((px - c.cx) / c.rx), b = Math.abs((pz - c.cz) / c.rz); return a * a * a + b * b * b <= 1; };   // شكل شبه مستطيل بحواف مستديرة
  const blocked = (x, z, ww, dd) => {
    for (let Z = z - 1; Z <= z + dd; Z++) for (let X = x - 1; X <= x + ww; X++) {
      if (X < 1 || Z < 1 || X >= N - 1 || Z >= N - 1) return true;
      if (obs[Z * N + X]) return true;
      const inside = X >= x && X < x + ww && Z >= z && Z < z + dd;
      if (inside && roadMask[Z * N + X]) return true;           // الطريق ممنوع تحت المبنى، ويُسمح بالتماس معه
    } return false;
  };
  for (const c of VILLAGE.clusters) {
    let placed = 0;
    // مسح منظّم من الشمال إلى الجنوب ومن الغرب إلى الشرق: يملأ الحي بكثافة مع أزقة ضيقة
    for (let z = Math.floor(c.cz - c.rz); z <= c.cz + c.rz && placed < c.n; z++) {
      for (let x = Math.floor(c.cx - c.rx); x <= c.cx + c.rx && placed < c.n; x++) {
        if (rng() < .08) continue;
        for (let t = 0; t < 6; t++) {
          const ww = 7 + ((rng() * 7) | 0), dd = 7 + ((rng() * 5) | 0);
          if (!inEll(c, x, z) || !inEll(c, x + ww - 1, z) || !inEll(c, x, z + dd - 1) || !inEll(c, x + ww - 1, z + dd - 1)) continue;
          if (blocked(x, z, ww, dd)) continue;
          const gap = rng() < .65 ? 1 : 2; let bad = false;
          for (const o of houses) if (x < o.x + o.w + gap && x + ww + gap > o.x && z < o.z + o.d + gap && z + dd + gap > o.z) { bad = true; break; }
          if (bad) continue;
          houses.push({ id: houses.length + 1, cluster: c.id, x, z, w: ww, d: dd, floors: rng() < .35 ? 2 : 1 });
          placed++; x += ww; break;
        }
      }
    }
  }
  for (const h of houses) for (let Z = h.z; Z < h.z + h.d; Z++) for (let X = h.x; X < h.x + h.w; X++) occH[Z * N + X] = 1;

  // 4) اختيار جهة الباب: نحو أكثر فراغ/طريق قريب
  const free = (x, z) => x > 0 && z > 0 && x < N - 1 && z < N - 1 && !occH[z * N + x] && !obs[z * N + x];
  for (const h of houses) {
    const mx = h.x + (h.w >> 1), mz = h.z + (h.d >> 1); let best = null, bs = -1;
    for (const s of ['n', 's', 'e', 'w']) {
      let sc = 0;
      for (let k = -1; k <= 1; k++) for (let dep = 1; dep <= 3; dep++) {
        const px = s === 'n' || s === 's' ? mx + k : (s === 'e' ? h.x + h.w - 1 + dep : h.x - dep);
        const pz = s === 'e' || s === 'w' ? mz + k : (s === 's' ? h.z + h.d - 1 + dep : h.z - dep);
        if (free(px, pz)) sc += 1 + (roadMask[pz * N + px] ? 2 : 0);
      }
      sc += rng() * .6; if (sc > bs) { bs = sc; best = s; }
    }
    const offX = h.x + 1 + ((rng() * (h.w - 2)) | 0), offZ = h.z + 1 + ((rng() * (h.d - 2)) | 0);
    h.face = best;
    h.door = best === 'n' ? { x: offX, z: h.z, ox: offX, oz: h.z - 1 } : best === 's' ? { x: offX, z: h.z + h.d - 1, ox: offX, oz: h.z + h.d }
           : best === 'e' ? { x: h.x + h.w - 1, z: offZ, ox: h.x + h.w, oz: offZ } : { x: h.x, z: offZ, ox: h.x - 1, oz: offZ };
  }

  // 5) تسوية الأرض ثم بناء الأحواش والمنازل
  for (const y of VILLAGE.yards) levelArea(w, y.x0 - 1, y.z0 - 1, y.x1 + 1, y.z1 + 1);
  for (const h of houses) levelArea(w, h.x - 1, h.z - 1, h.x + h.w, h.z + h.d);
  for (const y of VILLAGE.yards) buildYard(w, y, rng);
  for (const h of houses) h.plan = planInterior(h, rng);     // قد يخفض المنزل لطابق واحد إن لم يتسع السلم
  for (const h of houses) buildHouse(w, h, rng);
  for (const h of houses) buildInterior(w, h, rng);          // غرف، أبواب، نوافذ، أثاث، سلالم

  // 6) حواف ترابية حول المنازل ومدخل الباب (أزقة)
  w.finalize();
  for (const h of houses) {
    for (let Z = h.z - 1; Z <= h.z + h.d; Z++) for (let X = h.x - 1; X <= h.x + h.w; X++) {
      const ring = X === h.x - 1 || X === h.x + h.w || Z === h.z - 1 || Z === h.z + h.d;
      if (ring && !occH[Z * N + X] && !obs[Z * N + X]) paintPath(w, X, Z, true);
    }
    for (let k = 1; k <= 3; k++) {
      const px = h.door.ox + (h.face === 'e' ? k - 1 : h.face === 'w' ? -(k - 1) : 0), pz = h.door.oz + (h.face === 's' ? k - 1 : h.face === 'n' ? -(k - 1) : 0);
      if (!occH[pz * N + px]) paintPath(w, px, pz, true);
    }
  }

  // 7) أشجار داخل القرية بعيدة عن المنازل والطرق
  const dil = new Uint8Array(N * N);
  for (const h of houses) for (let Z = h.z - 2; Z <= h.z + h.d + 1; Z++) for (let X = h.x - 2; X <= h.x + h.w + 1; X++) dil[Z * N + X] = 1;
  const occ = new Uint8Array((N >> 2) * (N >> 2)), V = T.village; let trees = 0;
  for (let a = 0; a < 1500 && trees < 30; a++) {
    const x = 70 + ((rng() * 120) | 0), z = 112 + ((rng() * 100) | 0), i = z * N + x;
    if (dil[i] || obs[i] || roadMask[i] || Math.hypot((x - V.cx) / V.rx, (z - V.cz) / V.rz) > 1) continue;
    const y = w.colBase[i] - 1; if (y !== G) continue;
    const top = w.data[i * w.sy + y]; if (top === B.PATH || top === B.SOIL || top === B.CROP || top === B.CROP2 || top === B.STONE) continue;
    if (w.data[i * w.sy + G + 1]) continue;
    const oc = (z >> 2) * (N >> 2) + (x >> 2); if (occ[oc] || rng() > .35) continue; occ[oc] = 1;
    plantTree(w, x, z, G, rng); trees++;
  }
  w.finalize();
  w.village = { houses, yards: VILLAGE.yards, trees };
  return w.village;
}
