// تخزين العالم: مصفوفة مكعبات، العمود (x,z) متصل في الذاكرة على محور y
class World {
  constructor(cxN, czN) {
    this.cxN = cxN; this.czN = czN;
    this.sx = cxN * CFG.CHUNK; this.sz = czN * CFG.CHUNK; this.sy = CFG.CHUNK_H;
    this.data = new Uint8Array(this.sx * this.sy * this.sz);
    this.colBase = new Uint8Array(this.sx * this.sz);          // عدد المكعبات الصلبة المتصلة من القاع
    this.colTop = new Int16Array(this.sx * this.sz).fill(-1);  // أعلى مكعب غير فارغ
    this.final = false;
  }
  idx(x, y, z) { return (z * this.sx + x) * this.sy + y; }
  inside(x, y, z) { return x >= 0 && z >= 0 && y >= 0 && x < this.sx && z < this.sz && y < this.sy; }
  get(x, y, z) {
    if (y < 0) return 1;                                  // قاع العالم صلب
    if (y >= this.sy) return 0;
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz) return 1;   // حدود العالم صلبة: لا نرسم وجوه الأطراف
    return this.data[this.idx(x, y, z)];
  }
  set(x, y, z, b) { if (this.inside(x, y, z)) { this.data[this.idx(x, y, z)] = b; this.final = false; } }
  fillBox(x0, y0, z0, x1, y1, z1, b) {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, y, z, b);
  }
  // إعادة حساب عمود واحد بدون إلغاء حالة التسريع (للأبواب)
  recalcColumn(x, z) {
    const o = (z * this.sx + x) * this.sy; let base = 0, top = -1, solid = true;
    for (let y = 0; y < this.sy; y++) { if (this.data[o + y]) { top = y; if (solid) base = y + 1; } else solid = false; }
    this.colBase[z * this.sx + x] = base; this.colTop[z * this.sx + x] = top;
  }
  // يحسب أعمدة التسريع للمُشبِّك؛ يُستدعى بعد أي تعديل كبير على العالم
  finalize() {
    const { sx, sz, sy, data } = this;
    for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
      const o = (z * sx + x) * sy; let base = 0, top = -1, solid = true;
      for (let y = 0; y < sy; y++) {
        if (data[o + y]) { top = y; if (solid) base = y + 1; } else solid = false;
      }
      this.colBase[z * sx + x] = base; this.colTop[z * sx + x] = top;
    }
    this.final = true;
  }
}

// عالم المرحلة 1 التجريبي (احتياطي، لم يعد مستخدمًا)
function buildTestWorld() {
  const w = new World(6, 6), G = CFG.SEA;
  for (let z = 0; z < w.sz; z++) for (let x = 0; x < w.sx; x++)
    for (let y = 0; y <= G; y++) w.set(x, y, z, y === G ? B.GRASS : (y > G - 3 ? B.DIRT : B.STONE));
  w.finalize();
  return w;
}
