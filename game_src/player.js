// لاعب منظور الشخص الأول — المرحلة 5: فيزياء مكعبات (تصادم، قفز، صعود درجة تلقائي) + اختيار الأبواب
const PH = { SPEED: 5.0, JUMP: 8.6, GRAV: 26, HW: 0.3, H: 1.8, EYE: 1.62, REACH: 3.4 };

class Player {
  constructor(world) {
    this.w = world; this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0; this.onGround = false; this.camOff = 0;
  }
  place(x, y, z, yaw) {
    this.x = x; this.y = y; this.z = z; this.vx = this.vy = this.vz = 0;
    this.yaw = yaw || 0; this.pitch = 0; this.onGround = false; this.camOff = 0;
  }
  // هل يتقاطع صندوق اللاعب مع مكعب صلب؟
  collides(x, y, z) {
    const w = this.w, e = 1e-4, x0 = Math.floor(x - PH.HW + e), x1 = Math.floor(x + PH.HW - e);
    const y0 = Math.floor(y + e), y1 = Math.floor(y + PH.H - e), z0 = Math.floor(z - PH.HW + e), z1 = Math.floor(z + PH.HW - e);
    for (let yy = y0; yy <= y1; yy++) for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) if (w.get(xx, yy, zz)) return true;
    return false;
  }
  eye() { return [this.x, this.y + PH.EYE + this.camOff, this.z]; }
  dir() { const cp = Math.cos(this.pitch); return [Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp]; }
  _moveH(ax, d) {
    if (!d) return;
    const nx = ax === 0 ? this.x + d : this.x, nz = ax === 1 ? this.z + d : this.z;
    if (!this.collides(nx, this.y, nz)) { this.x = nx; this.z = nz; return; }
    // درجة بارتفاع مكعب واحد: نصعدها تلقائيًا إذا كان فوقها فراغ كافٍ
    if (this.onGround && !this.collides(this.x, this.y + 1.001, this.z) && !this.collides(nx, this.y + 1.001, nz)) {
      this.x = nx; this.z = nz; this.y += 1; this.camOff -= 1; return;
    }
    if (ax === 0) this.vx = 0; else this.vz = 0;
  }
  _moveY(d) {
    const ny = this.y + d;
    if (!this.collides(this.x, ny, this.z)) { this.y = ny; return; }
    if (d < 0) { this.y = Math.floor(ny) + 1; this.vy = 0; this.onGround = true; }       // هبوط على سطح مكعب
    else { this.y = Math.floor(ny + PH.H) - PH.H - 0.001; this.vy = 0; }                  // ارتطام الرأس بسقف
  }
  // inp: { fwd, str (من -1 إلى 1), jump }
  update(dt, inp) {
    dt = Math.min(dt, 0.05); if (dt <= 0) return;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const tvx = (sy * inp.fwd + cy * inp.str) * PH.SPEED, tvz = (-cy * inp.fwd + sy * inp.str) * PH.SPEED;
    const k = 1 - Math.exp(-(this.onGround ? 16 : 5) * dt);
    this.vx += (tvx - this.vx) * k; this.vz += (tvz - this.vz) * k;
    if (inp.jump && this.onGround) { this.vy = PH.JUMP; this.onGround = false; }
    this.vy = Math.max(-40, this.vy - PH.GRAV * dt);
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(this.vx), Math.abs(this.vz), Math.abs(this.vy)) * dt / 0.2)), sdt = dt / n;
    for (let i = 0; i < n; i++) { this._moveH(0, this.vx * sdt); this._moveH(1, this.vz * sdt); this._moveY(this.vy * sdt); }
    this.onGround = this.vy <= 0 && this.collides(this.x, this.y - 0.01, this.z);
    this.camOff += (0 - this.camOff) * Math.min(1, dt * 10);
  }
  // هل يتقاطع الصندوق مع خلية باب المنزل؟ (لمنع إغلاق الباب على اللاعب)
  inDoor(h) {
    const G = CFG.SEA, d = h.door;
    return Math.abs(this.x - (d.x + .5)) < PH.HW + .5 && Math.abs(this.z - (d.z + .5)) < PH.HW + .5 && this.y < G + 3 && this.y + PH.H > G + 1;
  }
}

// خريطة خلايا الأبواب الرئيسية: فهرس العمود -> رقم المنزل+1
function buildDoorMap(world, houses) {
  const m = new Int16Array(world.sx * world.sz);
  houses.forEach((h, i) => { m[h.door.z * world.sx + h.door.x] = i + 1; });
  return m;
}
// شعاع عبر المكعبات (DDA): أول باب رئيسي ضمن المدى قبل أي جدار صلب
function pickDoor(w, map, houses, o, d, maxD) {
  const G = CFG.SEA; let x = Math.floor(o[0]), y = Math.floor(o[1]), z = Math.floor(o[2]);
  const sx = d[0] > 0 ? 1 : -1, sy = d[1] > 0 ? 1 : -1, sz = d[2] > 0 ? 1 : -1;
  const dx = Math.abs(d[0]) > 1e-9 ? Math.abs(1 / d[0]) : Infinity, dy = Math.abs(d[1]) > 1e-9 ? Math.abs(1 / d[1]) : Infinity, dz = Math.abs(d[2]) > 1e-9 ? Math.abs(1 / d[2]) : Infinity;
  let tx = d[0] > 0 ? (x + 1 - o[0]) * dx : (o[0] - x) * dx, ty = d[1] > 0 ? (y + 1 - o[1]) * dy : (o[1] - y) * dy, tz = d[2] > 0 ? (z + 1 - o[2]) * dz : (o[2] - z) * dz;
  if (!isFinite(tx)) tx = Infinity; if (!isFinite(ty)) ty = Infinity; if (!isFinite(tz)) tz = Infinity;
  for (let t = 0; t <= maxD;) {
    if (y >= G + 1 && y <= G + 2 && x >= 0 && z >= 0 && x < w.sx && z < w.sz) { const id = map[z * w.sx + x]; if (id) return houses[id - 1]; }
    if (w.get(x, y, z)) return null;
    if (tx <= ty && tx <= tz) { t = tx; tx += dx; x += sx; } else if (ty <= tz) { t = ty; ty += dy; y += sy; } else { t = tz; tz += dz; z += sz; }
  }
  return null;
}
