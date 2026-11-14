// مولّد التضاريس — المرحلة 2
// الاتجاهات: الشمال = -z (أعلى الصورة)، الشرق = +x. الأحداثيات مقدَّرة من لقطة القمر الصناعي ومرجع Minecraft.
const TERRAIN = {
  village: { cx: 128, cz: 160, rx: 62, rz: 50, blend: 14 },   // منصة القرية المسطحة (للمرحلة 3)
  wadiZ: 52,                                                    // مجرى الوادي الجاف شمال القرية
  // مزارع: [x0, z0, x1, z1, النوع, سور حجري]
  fields: [
    [148, 88, 186, 111, 'soil', true],
    [116, 91, 142, 108, 'soil', false],
    [130, 205, 191, 230, 'crop', true],
    [60, 207, 92, 221, 'crop', true],
    [64, 224, 96, 236, 'crop', false],
    [196, 150, 224, 175, 'crop', true],
    [196, 180, 224, 196, 'soil', false],
  ],
  circles: [
    { x: 116, z: 221, r: 8, kind: 'threshing' },   // بيدر دائري
    { x: 100, z: 243, r: 5, kind: 'pit' },         // حفرة بسور حجري
    { x: 114, z: 129, r: 4, kind: 'well' },        // بئر/حظيرة دائرية
  ],
  mounds: [ { x: 82, z: 158, r: 9, h: 4 }, { x: 205, z: 215, r: 6, h: 3 }, { x: 92, z: 200, r: 6, h: 3 } ],
};

function rnd2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z, seed) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = rnd2(xi, zi, seed), b = rnd2(xi + 1, zi, seed), c = rnd2(xi, zi + 1, seed), d = rnd2(xi + 1, zi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, seed) {   // 0..1
  let s = 0, a = .5, f = 1;
  for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, z * f, seed + i * 17); f *= 2; a *= .5; }
  return s / .9375;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth01 = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

function generateTerrain() {
  const NC = CFG.WORLD_CHUNKS, w = new World(NC, NC), N = w.sx, G = CFG.SEA, T = TERRAIN, V = T.village;
  const n = N * N, H = new Int16Array(n), S = new Uint8Array(n), R = new Uint8Array(n), WD = new Uint8Array(n);
  const wadiC = x => T.wadiZ + 5 * Math.sin(x * .045) + (fbm(x * .02, 9, 31) - .5) * 8;
  const wadiW = x => 8 + (fbm(x * .05, 3, 7) - .5) * 6;

  // 1) الارتفاعات: جبال محيطة (الشمال الأعلى) + تموّج خفيف + منصة القرية + الوادي
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = z * N + x, n1 = fbm(x * .035, z * .035, 11);
    const jx = (fbm(x * .02 + 40, z * .02, 61) - .5) * 40, jz = (fbm(x * .02, z * .02 + 40, 73) - .5) * 40;  // حواف غير مستقيمة
    const hill = Math.max(
      smooth01(1 - (z + jz) / 46) * (22 + 18 * n1),
      smooth01(1 - (N - 1 - z + jz) / 40) * (6 + 10 * n1),
      smooth01(1 - (x + jx) / 50) * (8 + 12 * n1),
      smooth01(1 - (N - 1 - x + jx) / 50) * (8 + 12 * n1));
    let val = hill + (fbm(x * .06, z * .06, 5) - .5) * 3;
    const e = Math.hypot((x - V.cx) / V.rx, (z - V.cz) / V.rz);
    val *= smooth01((e - 1) / (V.blend / ((V.rx + V.rz) / 2)));
    const dw = Math.abs(z - wadiC(x)), hw = wadiW(x);
    if (dw < hw) { val -= 2 * (1 - (dw / hw) * (dw / hw)); WD[i] = 1; }
    let h;
    if (val > 3) { h = 3 + 2 * Math.floor((val - 3) / 2); R[i] = 1; }   // مدرجات بخطوة مكعبين
    else h = Math.round(val);
    H[i] = G + h;
  }

  // 2) تلال صغيرة صخرية
  for (const m of T.mounds) for (let z = (m.z - m.r) | 0; z <= m.z + m.r; z++) for (let x = (m.x - m.r) | 0; x <= m.x + m.r; x++) {
    const d = Math.hypot(x - m.x, z - m.z); if (d >= m.r) continue;
    const i = z * N + x, add = Math.round(m.h * (1 - (d / m.r) * (d / m.r)));
    if (add > 0) { H[i] += add; R[i] = 1; S[i] = (hash3(x, 0, z) < .5) ? B.GRAVEL : B.DSTONE; }
  }

  // 3) دوائر: بيدر، حفرة بسور، بئر
  for (const c of T.circles) for (let z = (c.z - c.r) | 0; z <= c.z + c.r; z++) for (let x = (c.x - c.r) | 0; x <= c.x + c.r; x++) {
    const d = Math.hypot(x - c.x, z - c.z); if (d > c.r) continue;
    const i = z * N + x;
    if (c.kind === 'threshing') { H[i] = G; R[i] = 0; S[i] = B.SOIL; }
    else {
      const inner = c.kind === 'pit' ? .55 : .45;
      if (d < c.r * inner) { H[i] = G - (c.kind === 'pit' ? 2 : 3); R[i] = 0; S[i] = c.kind === 'pit' ? B.GRAVEL : B.DSTONE; }
      else { H[i] = G + 1; R[i] = 1; S[i] = B.STONE; }
    }
  }

  // 4) مزارع مسطحة بأسوار حجرية منخفضة وفتحات
  T.fields.forEach((f, fi) => {
    const [x0, z0, x1, z1, type, wall] = f;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = z * N + x; H[i] = G; R[i] = 0; WD[i] = 0;
      if (type === 'soil') S[i] = B.SOIL;
      else S[i] = ((z - z0) % 3 === 0) ? B.SOIL : ((fi % 2) ? B.CROP2 : B.CROP);
      if (wall && (x === x0 || x === x1 || z === z0 || z === z1) && hash3(x, 5, z) > .1) { H[i] = G + 1; R[i] = 1; S[i] = B.STONE; }
    }
  });

  // 5) تعبئة الأعمدة
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = z * N + x, h = Math.max(1, Math.min(w.sy - 1, H[i])), o = (z * N + x) * w.sy;
    const rocky = R[i], hs = hash3(x, 0, z);
    for (let y = 0; y <= h; y++) {
      let b;
      if (y === h) {
        if (S[i]) b = S[i];
        else if (rocky) b = hs < .55 ? B.DSAND : hs < .82 ? B.GRAVEL : B.DGRASS;
        else if (WD[i]) b = hs < .25 ? B.GRAVEL : hs < .5 ? B.DSAND : B.SAND;
        else b = hs < .10 ? B.DSAND : hs < .14 ? B.DGRASS : B.SAND;
      } else if (rocky) {
        const q = hash3(x, y, z); b = q < .22 ? B.SANDSTONE : (y % 3 === 0 ? B.DSTONE : B.STONE);
      } else if (y >= h - 2) b = (S[i] === B.SOIL || S[i] === B.CROP || S[i] === B.CROP2) ? B.SOIL : B.SAND;
      else b = B.STONE;
      w.data[o + y] = b;
    }
  }

  // 6) أشجار (سنط) وشجيرات خارج منصة القرية — داخل القرية تُوزَّع في المرحلة 3
  const rng = mulberry32(2025), occ = new Uint8Array((N >> 2) * (N >> 2)), trees = [];
  for (let a = 0; a < 3200; a++) {
    const x = 3 + ((rng() * (N - 6)) | 0), z = 3 + ((rng() * (N - 6)) | 0), i = z * N + x;
    if (S[i] || R[i] || H[i] > G + 3 || H[i] < G - 4) continue;
    const e = Math.hypot((x - V.cx) / V.rx, (z - V.cz) / V.rz); if (e < .95) continue;
    const near = Math.abs(z - wadiC(x)) < wadiW(x) + 16;
    if (rng() > (near ? .6 : .2)) continue;
    const hh = H[i]; if (Math.abs(H[i + 1] - hh) > 1 || Math.abs(H[i - 1] - hh) > 1 || Math.abs(H[i + N] - hh) > 1 || Math.abs(H[i - N] - hh) > 1) continue;
    const oc = (z >> 2) * (N >> 2) + (x >> 2); if (occ[oc]) continue; occ[oc] = 1;
    if (rng() < .3) { w.set(x, hh + 1, z, B.LEAF); continue; }          // شجيرة
    const th = 2 + ((rng() * 2) | 0);
    for (let k = 1; k <= th; k++) w.set(x, hh + k, z, B.WOOD);
    const cy = hh + th + 1;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++)
      if (!(Math.abs(dx) === 2 && Math.abs(dz) === 2) && !w.get(x + dx, cy, z + dz)) w.set(x + dx, cy, z + dz, B.LEAF);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) w.set(x + dx, cy + 1, z + dz, B.LEAF);
    trees.push([x, z]);
  }
  w.finalize();
  w.info = { trees: trees.length };
  return w;
}
