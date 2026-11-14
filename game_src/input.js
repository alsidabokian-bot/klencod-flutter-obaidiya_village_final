// أدوات التحكم باللمس: عصا حركة عائمة يسارًا، سحب لليمين للنظر، أزرار قفز وفتح. ودعم لوحة المفاتيح والفأرة.
function createControls(root, bJump, bUse, onMenu) {
  const base = document.getElementById('stickBase'), knob = document.getElementById('stickKnob'), R = 56;
  let stick = null, look = null, lx = 0, ly = 0, jumpHeld = false, useEdge = false;
  const keys = {};
  root.addEventListener('pointerdown', e => {
    e.preventDefault(); try { root.setPointerCapture(e.pointerId); } catch (_) {}
    const left = e.pointerType !== 'mouse' && e.clientX < window.innerWidth * 0.42;
    if (left && !stick) {
      stick = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
      base.style.display = 'block'; base.style.left = (e.clientX - R) + 'px'; base.style.top = (e.clientY - R) + 'px'; knob.style.transform = 'translate(0px,0px)';
    } else if (!look) look = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  root.addEventListener('pointermove', e => {
    if (stick && e.pointerId === stick.id) {
      let dx = e.clientX - stick.x, dy = e.clientY - stick.y; const m = Math.hypot(dx, dy);
      if (m > R) { dx *= R / m; dy *= R / m; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; stick.dx = dx / R; stick.dy = dy / R;
    } else if (look && e.pointerId === look.id) {
      lx += e.clientX - look.x; ly += e.clientY - look.y; look.x = e.clientX; look.y = e.clientY;
    }
  });
  const end = e => {
    if (stick && e.pointerId === stick.id) { stick = null; base.style.display = 'none'; }
    if (look && e.pointerId === look.id) look = null;
  };
  root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
  bJump.addEventListener('pointerdown', e => { e.preventDefault(); jumpHeld = true; });
  const jr = () => { jumpHeld = false; }; bJump.addEventListener('pointerup', jr); bJump.addEventListener('pointercancel', jr); bJump.addEventListener('pointerleave', jr);
  bUse.addEventListener('pointerdown', e => { e.preventDefault(); useEdge = true; });
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') { onMenu(); return; }
    if (e.code === 'KeyE' || e.code === 'KeyF') { if (!e.repeat) useEdge = true; return; }
    keys[e.code] = true;
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  return {
    poll() {
      let fwd = 0, str = 0;
      if (stick) { const mag = Math.hypot(stick.dx, stick.dy); if (mag > 0.12) { const k = (mag - 0.12) / 0.88 / mag; fwd = -stick.dy * k; str = stick.dx * k; } }
      if (keys.KeyW || keys.ArrowUp) fwd += 1; if (keys.KeyS || keys.ArrowDown) fwd -= 1;
      if (keys.KeyD || keys.ArrowRight) str += 1; if (keys.KeyA || keys.ArrowLeft) str -= 1;
      const m = Math.hypot(fwd, str); if (m > 1) { fwd /= m; str /= m; }
      const o = { fwd, str, jump: jumpHeld || !!keys.Space, use: useEdge, lookX: lx, lookY: ly };
      lx = ly = 0; useEdge = false; return o;
    },
    clear() { stick = look = null; jumpHeld = useEdge = false; lx = ly = 0; base.style.display = 'none'; },
  };
}
