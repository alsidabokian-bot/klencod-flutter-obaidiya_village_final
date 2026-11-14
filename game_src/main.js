function showError(msg) {
  const el = document.getElementById('err');
  el.style.display = 'block'; el.textContent = 'خطأ: ' + msg;
}
window.addEventListener('error', e => showError(e.message + (e.lineno ? ' (سطر ' + e.lineno + ')' : '')));
window.addEventListener('unhandledrejection', e => showError(String(e.reason)));

// حفظ الإعدادات والموقع وحالة الأبواب: localStorage + نسخة احتياطية عبر غلاف Flutter
const Save = {
  data: { quality: 'high', fps: true, pos: null, doors: [] },
  load() {
    try {
      let raw = null;
      try { raw = localStorage.getItem(CFG.SAVE_KEY); } catch (e) {}
      if (!raw && window.__obSaved) raw = window.__obSaved;
      const s = JSON.parse(raw || 'null');
      if (s) Object.assign(this.data, s);
    } catch (e) {}
  },
  store() {
    const j = JSON.stringify(this.data);
    try { localStorage.setItem(CFG.SAVE_KEY, j); } catch (e) {}
    try { if (window.OBStore) window.OBStore.postMessage(j); } catch (e) {}
  },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const VIEWER_FOG = 3;    // عارض التضاريس يرى أبعد
const PLAY_FOG = 1.4;    // مدى الرؤية أثناء اللعب
const LOOK_SENS = 0.0052;
// مواقع جاهزة في وضع المعاينة
const VIEWS = [
  { n: 'عامة',    tx: 128, tz: 128, ty: 20, dist: 270, yaw: 0.3, pitch: 0.85 },
  { n: 'القرية',  tx: 128, tz: 160, ty: 16, dist: 105, yaw: 0.4, pitch: 0.7 },
  { n: 'الأزقة',  tx: 131, tz: 146, ty: 17, dist: 48,  yaw: 0.6, pitch: 0.55 },
  { n: 'حي غربي', tx: 94,  tz: 160, ty: 17, dist: 50,  yaw: -0.5, pitch: 0.5 },
  { n: 'حي شرقي', tx: 166, tz: 140, ty: 17, dist: 50,  yaw: 0.9, pitch: 0.5 },
  { n: 'الوادي',  tx: 128, tz: 52,  ty: 14, dist: 90,  yaw: 0.5, pitch: 0.45 },
  { n: 'المدرجات', tx: 110, tz: 16, ty: 28, dist: 85,  yaw: 0.2, pitch: 0.4 },
  { n: 'المزارع', tx: 150, tz: 215, ty: 14, dist: 80,  yaw: -0.4, pitch: 0.5 },
];

function start() {
  Save.load();
  const $ = id => document.getElementById(id);
  const canvas = $('c'), r = new Renderer(canvas), G = CFG.SEA;

  let t = performance.now();
  const world = generateTerrain();
  const vil = buildVillage(world);
  const tGen = Math.round(performance.now() - t); t = performance.now();
  // استعادة الأبواب المفتوحة المحفوظة قبل التشبيك الأول
  const savedDoors = Array.isArray(Save.data.doors) ? Save.data.doors : [];
  for (const h of vil.houses) if (savedDoors.includes(h.id)) setDoor(world, h, true);

  let aoOn = !!(CFG.QUALITY[Save.data.quality] || CFG.QUALITY.high).ao;
  const meshes = [], gpu = new Map(); let tris = 0;
  // تشبيك قطعة ورفعها (أو استبدال نسختها القديمة بعد فتح باب)
  const putChunk = (cx, cz) => {
    const ci = cz * world.cxN + cx, S = CFG.CHUNK, m = meshChunk(world, cx, cz, aoOn), old = gpu.get(ci), oi = old ? meshes.indexOf(old) : -1;
    if (old) { r.free(old); gpu.delete(ci); if (oi >= 0) meshes.splice(oi, 1); }
    if (!m.count) return 0;
    const g = r.upload(m, { x: cx * S + S / 2, y: m.maxY / 2, z: cz * S + S / 2, r: Math.hypot(S / 2, S / 2, m.maxY / 2) + 1 });
    gpu.set(ci, g); meshes.push(g); return m.count / 3;
  };
  for (let cz = 0; cz < world.czN; cz++) for (let cx = 0; cx < world.cxN; cx++) tris += putChunk(cx, cz);
  const rebuildAll = () => { for (let cz = 0; cz < world.czN; cz++) for (let cx = 0; cx < world.cxN; cx++) putChunk(cx, cz); };
  const tMesh = Math.round(performance.now() - t);

  // ===== اللاعب =====
  const player = new Player(world), doorMap = buildDoorMap(world, vil.houses);
  const SPAWN = { x: 127.5, y: G + 1, z: 197.5, yaw: 0 };      // بداية القرية من الجنوب، النظر شمالًا
  const respawn = () => player.place(SPAWN.x, SPAWN.y, SPAWN.z, SPAWN.yaw);
  const p0 = Save.data.pos;
  if (p0 && [p0.x, p0.y, p0.z, p0.yaw].every(Number.isFinite)) { player.place(p0.x, p0.y, p0.z, p0.yaw); if (player.collides(player.x, player.y, player.z)) respawn(); } else respawn();

  const proj = M4.create(), view = M4.create(), vp = M4.create();
  let factor = 1, slow = 0, fast = 0, avg = 16.7, last = performance.now(), shown = 0, lockUp = 0, drawn = 0, lastSave = 0, target = null, promptUntil = 0;
  const hud = $('fps'), info = $('info'), qbtn = $('q'), vbtn = $('v'), abtn = $('a'), hbtn = $('h'), cbtn = $('c2'), dbtn = $('d'), pbtn = $('p');
  const prompt = $('prompt'), bUse = $('bUse'), menu = $('menu');
  info.textContent = 'بناء: ' + tGen + 'ms · تشبيك: ' + tMesh + 'ms · ' + Math.round(tris / 1000) + 'k مثلث · منازل ' + vil.houses.length + ' · غرف ' + vil.houses.reduce((a, h) => a + h.rooms.length, 0) + ' · أشجار ' + (world.info.trees + vil.trees);

  let mode = 'play', menuOpen = false;
  const cam = Object.assign({}, VIEWS[0]); let auto = true, vi = 0;
  const CLIPS = [{ n: 'بدون', y: 1000 }, { n: 'الطابق الأرضي', y: G + 5.01 }, { n: 'الطابق العلوي', y: G + 9.01 }];
  let ci = 0, hi = -1;

  const savePlay = () => {
    Save.data.pos = { x: +player.x.toFixed(2), y: +player.y.toFixed(2), z: +player.z.toFixed(2), yaw: +player.yaw.toFixed(3) };
    Save.data.doors = vil.houses.filter(h => h.doorOpen).map(h => h.id); Save.store();
  };
  const applyQuality = () => {
    const q = CFG.QUALITY[Save.data.quality] || CFG.QUALITY.high;
    if (!!q.ao !== aoOn) { aoOn = !!q.ao; rebuildAll(); }
    r.setFog(q.fog * (mode === 'play' ? PLAY_FOG : VIEWER_FOG)); r.resize(q.cap, factor);
    qbtn.textContent = 'الجودة: ' + q.name; $('mQuality').textContent = 'الجودة: ' + q.name;
    $('mFps').textContent = 'عدّاد FPS: ' + (Save.data.fps ? 'يعمل' : 'مخفي');
  };
  const label = () => {
    vbtn.textContent = 'المنظر: ' + VIEWS[vi].n; abtn.textContent = 'جولة تلقائية: ' + (auto ? 'تشغيل' : 'إيقاف');
    cbtn.textContent = 'قطع الأسطح: ' + CLIPS[ci].n; hbtn.textContent = hi < 0 ? 'منزل: اختر' : 'منزل ' + (hi + 1) + '/' + vil.houses.length;
    r.setClip(mode === 'play' ? 1000 : CLIPS[ci].y);
  };
  const setMode = m => {
    mode = m; document.body.className = 'mode-' + m; ctl.clear(); menuOpen = false; menu.classList.remove('open');
    if (m === 'view') { Object.assign(cam, { tx: player.x, ty: G + 4, tz: player.z, dist: 60, yaw: player.yaw, pitch: 0.8 }); auto = false; }
    else { prompt.style.display = 'none'; }
    label(); applyQuality();
  };
  const openMenu = () => { menuOpen = true; menu.classList.add('open'); ctl.clear(); savePlay(); };
  const closeMenu = () => { menuOpen = false; menu.classList.remove('open'); last = performance.now(); };
  const cycleQuality = () => { const k = Object.keys(CFG.QUALITY), i = k.indexOf(Save.data.quality); Save.data.quality = k[(i + 1) % k.length]; Save.store(); applyQuality(); };

  const ctl = createControls($('ctrl'), $('bJump'), bUse, () => { if (mode === 'play') (menuOpen ? closeMenu : openMenu)(); });
  window.__back = () => {            // زر الرجوع: معاينة ← لعب ← قائمة ← خروج
    if (mode === 'view') { setMode('play'); return 'stay'; }
    if (!menuOpen) { openMenu(); return 'stay'; }
    return 'exit';
  };
  window.__g = { world, vil, player };    // للاختبار

  // فتح/إغلاق باب رئيسي مع إعادة تشبيك القطع المتأثرة
  const remesh = chunks => { const cs = new Set(); for (const c of chunks) cs.add(c[0] + ',' + c[1]); for (const k of cs) { const [cx, cz] = k.split(',').map(Number); if (cx >= 0 && cz >= 0 && cx < world.cxN && cz < world.czN) putChunk(cx, cz); } };
  const say = (txt, ms) => { prompt.textContent = txt; prompt.style.display = 'block'; promptUntil = performance.now() + ms; };
  const toggleDoor = h => {
    if (h.doorOpen && player.inDoor(h)) { say('ابتعد عن الباب أولًا', 1400); return; }
    remesh(setDoor(world, h, !h.doorOpen)); savePlay();
  };

  // ===== أزرار القائمة =====
  $('bMenu').addEventListener('click', () => (menuOpen ? closeMenu : openMenu)());
  $('mResume').addEventListener('click', closeMenu);
  $('mRespawn').addEventListener('click', () => { respawn(); closeMenu(); savePlay(); });
  $('mQuality').addEventListener('click', cycleQuality);
  $('mFps').addEventListener('click', () => { Save.data.fps = !Save.data.fps; if (!Save.data.fps) hud.textContent = ''; Save.store(); applyQuality(); });
  $('mView').addEventListener('click', () => setMode('view'));

  // ===== أزرار وضع المعاينة =====
  pbtn.addEventListener('click', () => setMode('play'));
  vbtn.addEventListener('click', () => { vi = (vi + 1) % VIEWS.length; Object.assign(cam, VIEWS[vi]); auto = false; label(); });
  abtn.addEventListener('click', () => { auto = !auto; label(); });
  qbtn.addEventListener('click', cycleQuality);
  cbtn.addEventListener('click', () => { ci = (ci + 1) % CLIPS.length; label(); });
  hbtn.addEventListener('click', () => {
    hi = (hi + 1) % vil.houses.length; const h = vil.houses[hi];
    Object.assign(cam, { tx: h.x + h.w / 2, tz: h.z + h.d / 2, ty: G + 2, dist: 18 + Math.max(h.w, h.d), yaw: 0.25, pitch: 1.1 });
    auto = false; if (ci === 0) ci = 1; label();
  });
  dbtn.addEventListener('click', () => {
    const R = cam.dist < 70 ? 16 : 40, near = vil.houses.filter(h => Math.hypot(h.door.x - cam.tx, h.door.z - cam.tz) < R);
    if (!near.length) return;
    const open = !near.every(h => h.doorOpen), cs = [];
    for (const h of near) for (const c of setDoor(world, h, open)) cs.push(c);
    remesh(cs); dbtn.textContent = open ? 'الأبواب القريبة: مفتوحة' : 'الأبواب القريبة: مغلقة';
  });
  window.addEventListener('resize', applyQuality);
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') savePlay(); });
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); showError('فقد الجهاز سياق الرسم، أعد فتح اللعبة'); });

  // ===== تحكم كاميرا المعاينة =====
  const ptrs = new Map(); let pinch = 0;
  const dist2 = () => { const a = [...ptrs.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
  canvas.addEventListener('pointerdown', e => {
    if (mode !== 'view') return;
    canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (auto) { auto = false; label(); }
    pinch = ptrs.size === 2 ? dist2() : 0;
  });
  canvas.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p || mode !== 'view') return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 1) { cam.yaw -= dx * 0.006; cam.pitch = clamp(cam.pitch + dy * 0.005, 0.08, 1.5); }
    else if (ptrs.size === 2) { const d = dist2(); if (pinch > 0 && d > 0) cam.dist = clamp(cam.dist * pinch / d, 25, 480); pinch = d; }
  });
  const up = e => { ptrs.delete(e.pointerId); pinch = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { if (mode !== 'view') return; e.preventDefault(); cam.dist = clamp(cam.dist * (1 + e.deltaY * 0.001), 25, 480); }, { passive: false });

  setMode('play');

  function frame(now) {
    requestAnimationFrame(frame);
    const rawDt = Math.max(0, now - last); last = now;
    avg += (rawDt - avg) * 0.05;
    // دقة رسم تكيفية: تنخفض عند التقطّع وترتفع عند الاستقرار
    if (avg > 19.5) { slow++; fast = 0; } else if (avg < 17.6) { fast++; slow = 0; } else { slow = fast = 0; }
    if (slow > 40 && factor > 0.6) { factor = Math.max(0.6, factor - 0.08); slow = 0; lockUp = now + 15000; applyQuality(); }
    else if (fast > 240 && factor < 1 && now > lockUp) { factor = Math.min(1, factor + 0.04); fast = 0; applyQuality(); }

    let ex, ey, ez;
    if (mode === 'play') {
      if (!menuOpen) {
        const inp = ctl.poll();
        player.yaw += inp.lookX * LOOK_SENS; player.pitch = clamp(player.pitch - inp.lookY * LOOK_SENS, -1.45, 1.45);
        player.update(rawDt / 1000, inp);
        if (inp.use && target) toggleDoor(target);
        if (now - lastSave > 4000) { lastSave = now; savePlay(); }
      }
      [ex, ey, ez] = player.eye(); const d = player.dir();
      // الباب المستهدف: يظهر زر الفتح/الإغلاق ونص التلميح
      const tg = pickDoor(world, doorMap, vil.houses, [ex, ey, ez], d, PH.REACH);
      if (tg !== target || now > promptUntil) {
        target = tg;
        if (tg) { prompt.textContent = tg.doorOpen ? 'إغلاق الباب' : 'فتح الباب'; prompt.style.display = 'block'; bUse.textContent = tg.doorOpen ? 'إغلاق' : 'فتح'; bUse.classList.add('on'); promptUntil = 0; }
        else { prompt.style.display = 'none'; bUse.textContent = 'فتح'; bUse.classList.remove('on'); }
      }
      M4.perspective(proj, 1.2, r.aspect, 0.1, 700);
      M4.lookAt(view, ex, ey, ez, ex + d[0], ey + d[1], ez + d[2], 0, 1, 0);
    } else {
      if (auto) cam.yaw += rawDt * 0.00012;
      const cp = Math.cos(cam.pitch);
      ex = clamp(cam.tx + cam.dist * cp * Math.sin(cam.yaw), 1, world.sx - 2);
      ey = Math.max(G + 4, cam.ty + cam.dist * Math.sin(cam.pitch));
      ez = clamp(cam.tz + cam.dist * cp * Math.cos(cam.yaw), 1, world.sz - 2);
      M4.perspective(proj, 1.0, r.aspect, 0.5, 900);
      M4.lookAt(view, ex, ey, ez, cam.tx, cam.ty, cam.tz, 0, 1, 0);
    }
    M4.multiply(vp, proj, view);
    drawn = r.render(meshes, vp, ex, ey, ez, mode === 'play' ? r.fogFar + 12 : 600);

    if (now - shown > 500) {
      shown = now;
      if (Save.data.fps) hud.textContent = 'FPS ' + Math.round(1000 / avg) + '  |  ' + canvas.width + 'x' + canvas.height + '  |  scale ' + (Math.round(factor * 100) / 100) + '  |  chunks ' + drawn + '/' + meshes.length;
    }
  }
  requestAnimationFrame(frame);
}

setTimeout(() => {
  try { start(); } catch (e) { showError(e.message || String(e)); }
  const l = document.getElementById('loading'); if (l) l.style.display = 'none';
}, 80);
