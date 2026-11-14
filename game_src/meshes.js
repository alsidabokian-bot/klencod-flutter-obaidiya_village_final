// بناء شبكة القطعة — المرحلة 6
// 1) دمج الوجوه المتجاورة المتطابقة (Greedy meshing): مثلثات أقل بكثير.
// 2) إضاءة محيطية (AO) لكل زاوية: ظلال ناعمة في الزوايا والأزقة (بدون ظلال حقيقية).
// 3) صيغة الرأس 16 بايت: موقع float32×3 + لون uint8×4 (بدل 24 بايت).
// 4) فهارس 16-بت حين يسمح عدد الرؤوس.
const FACES = [
  { n: [ 1, 0, 0], s: .82, c: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]] },
  { n: [-1, 0, 0], s: .82, c: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },
  { n: [ 0, 1, 0], s: 1.0, c: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
  { n: [ 0,-1, 0], s: .50, c: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { n: [ 0, 0, 1], s: .90, c: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  { n: [ 0, 0,-1], s: .70, c: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] },
];
const NORM = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const FACE_SHADE = [0.82, 0.82, 1.0, 0.5, 0.9, 0.7];
const AO_LIGHT = [0.5, 0.68, 0.84, 1.0];           // ao = 0 (الأغمق) .. 3 (مكشوف)
const UV = [[2, 1], [0, 2], [0, 1]];                // محاور المستوى (u,v) لكل محور عمودي
// اتجاه المثلثات: CCW من الخارج، لازم لـ CULL_FACE
const FLIP = NORM.map((n, f) => {
  const a = f >> 1, au = UV[a][0], av = UV[a][1];
  const c = (u, v) => { const p = [0, 0, 0]; p[au] = u; p[av] = v; return p; };
  const c0 = c(0, 0), c1 = c(1, 0), c2 = c(1, 1);
  const e1 = [c1[0]-c0[0], c1[1]-c0[1], c1[2]-c0[2]], e2 = [c2[0]-c0[0], c2[1]-c0[1], c2[2]-c0[2]];
  const cr = [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]];
  return (cr[0]*n[0] + cr[1]*n[1] + cr[2]*n[2]) < 0;
});
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// ao=true: إضاءة محيطية. يعيد {buf, nv, idx, count, itype, maxY}
function meshChunk(world, cx, cz, ao = true) {
  const S = CFG.CHUNK, sx = world.sx, x0 = cx * S, z0 = cz * S;
  let H = world.sy;
  if (world.final) {   // لا توجد مكعبات صلبة فوق أعلى عمود في القطعة
    let top = -1;
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) { const t = world.colTop[(z0 + z) * sx + x0 + x]; if (t > top) top = t; }
    H = Math.max(1, top + 1);
  }
  const dims = [S, H, S], base = [x0, 0, z0];
  const mask = new Int32Array(S * Math.max(S, H));
  const vtx = [], idx = [], P = [0, 0, 0];
  let nv = 0, maxY = 0;
  for (let f = 0; f < 6; f++) {
    const a = f >> 1, sg = (f & 1) ? -1 : 1, au = UV[a][0], av = UV[a][1], n = NORM[f];
    const Du = dims[au], Dv = dims[av], Dc = dims[a];
    for (let c = 0; c < Dc; c++) {
      // قناع الوجوه المكشوفة في هذه الشريحة
      let any = false;
      for (let iv = 0; iv < Dv; iv++) for (let iu = 0; iu < Du; iu++) {
        const L = [0, 0, 0]; L[a] = c; L[au] = iu; L[av] = iv;
        const gx = base[0] + L[0], gy = L[1], gz = base[2] + L[2];
        const b = world.get(gx, gy, gz);
        let key = -1;
        if (b && !world.get(gx + n[0], gy + n[1], gz + n[2])) {
          let code = 255;                                   // 3 في كل زاوية = مكشوف
          if (ao) {
            const ox = gx + n[0], oy = gy + n[1], oz = gz + n[2];
            const sol = (du, dv) => { P[0] = ox; P[1] = oy; P[2] = oz; P[au] += du; P[av] += dv; return world.get(P[0], P[1], P[2]) ? 1 : 0; };
            code = 0;
            for (let k = 0; k < 4; k++) {
              const du = (k === 1 || k === 2) ? 1 : -1, dv = k >= 2 ? 1 : -1;
              const s1 = sol(du, 0), s2 = sol(0, dv), cc = sol(du, dv);
              const v = (s1 && s2) ? 0 : 3 - (s1 + s2 + cc);
              code |= v << (2 * k);
            }
          }
          const q = Math.floor(hash3(gx >> 3, 0, gz >> 3) * 4);   // تدرّج لوني خفيف على مساحات 8×8 (يسمح بالدمج)
          key = ((b * 4 + q) << 8) | code;
          any = true;
        }
        mask[iv * Du + iu] = key;
      }
      if (!any) continue;
      // دمج مستطيلات متطابقة في الشريحة
      for (let iv = 0; iv < Dv; iv++) for (let iu = 0; iu < Du; ) {
        const k = mask[iv * Du + iu];
        if (k < 0) { iu++; continue; }
        let w = 1; while (iu + w < Du && mask[iv * Du + iu + w] === k) w++;
        let h = 1;
        grow: while (iv + h < Dv) { for (let t = 0; t < w; t++) if (mask[(iv + h) * Du + iu + t] !== k) break grow; h++; }
        for (let dv = 0; dv < h; dv++) for (let du = 0; du < w; du++) mask[(iv + dv) * Du + iu + du] = -1;
        const kk = k >> 8, bid = kk >> 2, jq = kk & 3, code = k & 255;
        const col = BLOCK_COLOR[bid], shade = FACE_SHADE[f] * (1 + (jq - 1.5) * 0.035);
        const plane = c + (sg > 0 ? 1 : 0);
        const cs = [[iu, iv], [iu + w, iv], [iu + w, iv + h], [iu, iv + h]];
        for (let i = 0; i < 4; i++) {
          const L = [0, 0, 0]; L[a] = plane; L[au] = cs[i][0]; L[av] = cs[i][1];
          const X = base[0] + L[0], Y = L[1], Z = base[2] + L[2];
          const lum = shade * AO_LIGHT[(code >> (2 * i)) & 3];
          vtx.push(X, Y, Z, col[0] * lum, col[1] * lum, col[2] * lum);
          if (Y > maxY) maxY = Y;
        }
        if (FLIP[f]) idx.push(nv, nv + 2, nv + 1, nv, nv + 3, nv + 2);
        else idx.push(nv, nv + 1, nv + 2, nv, nv + 2, nv + 3);
        nv += 4;
        iu += w;
      }
    }
  }
  // تعبئة الذاكرة: 16 بايت للرأس
  const buf = new ArrayBuffer(nv * 16), F = new Float32Array(buf), U = new Uint8Array(buf);
  for (let i = 0; i < nv; i++) {
    const o = i * 6, fo = i * 4, bo = i * 16;
    F[fo] = vtx[o]; F[fo + 1] = vtx[o + 1]; F[fo + 2] = vtx[o + 2];
    U[bo + 12] = Math.min(255, Math.round(vtx[o + 3] * 255));
    U[bo + 13] = Math.min(255, Math.round(vtx[o + 4] * 255));
    U[bo + 14] = Math.min(255, Math.round(vtx[o + 5] * 255));
    U[bo + 15] = 255;
  }
  const small = nv < 65536;
  return { buf, nv, idx: small ? new Uint16Array(idx) : new Uint32Array(idx), count: idx.length, itype: small ? 'u16' : 'u32', maxY };
}
