// مُصيِّر WebGL2: ألوان رؤوس + ضباب + مقطع أفقي + إخفاء القطع خارج الرؤية والبعيدة
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('هذا الجهاز لا يدعم WebGL2');
    this.gl = gl;
    const vs = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aCol;
uniform mat4 uVP; uniform vec3 uCam;
out vec3 vCol; out float vDist; out float vY;
void main(){ vCol=aCol; vY=aPos.y; vDist=distance(aPos,uCam); gl_Position=uVP*vec4(aPos,1.0); }`.trim();
    const fs = `#version 300 es
precision mediump float;
in vec3 vCol; in float vDist; in float vY;
uniform vec3 uFog; uniform vec2 uRange; uniform float uClip;
out vec4 o;
void main(){ if (vY > uClip) discard; float f=clamp((vDist-uRange.x)/(uRange.y-uRange.x),0.0,1.0); o=vec4(mix(vCol,uFog,f),1.0); }`.trim();
    this.prog = this._program(vs, fs);
    this.u = {
      vp: gl.getUniformLocation(this.prog, 'uVP'), cam: gl.getUniformLocation(this.prog, 'uCam'),
      fog: gl.getUniformLocation(this.prog, 'uFog'), range: gl.getUniformLocation(this.prog, 'uRange'),
      clip: gl.getUniformLocation(this.prog, 'uClip'),
    };
    this.sky = [0.72, 0.82, 0.92];
    this.fogFar = 170; this.aspect = 1; this.clipY = 1000;
    this.planes = new Float32Array(24);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
  }
  _shader(type, src) {
    const gl = this.gl, s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
    return s;
  }
  _program(vs, fs) {
    const gl = this.gl, p = gl.createProgram();
    gl.attachShader(p, this._shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, this._shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    return p;
  }
  // m: من meshChunk {buf, idx, count, itype}؛ b: كرة الإحاطة {x,y,z,r}
  upload(m, b) {
    const gl = this.gl, vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, m.buf, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, 16, 12);
    const ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, vbo, ibo, count: m.count, b, itype: m.itype === 'u16' ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT };
  }
  free(g) { const gl = this.gl; gl.deleteBuffer(g.vbo); gl.deleteBuffer(g.ibo); gl.deleteVertexArray(g.vao); }
  setFog(far) { this.fogFar = far; }
  setClip(y) { this.clipY = y; }          // مقطع أفقي: يخفي كل ما فوق هذا الارتفاع
  // cap: أقصى ارتفاع للرسم بالبكسل، factor: معامل الدقة التكيفية
  resize(cap, factor) {
    const dpr = window.devicePixelRatio || 1, cw = window.innerWidth, ch = window.innerHeight;
    const h = Math.min(ch * dpr, cap) * factor, w = h * cw / ch;
    this.canvas.width = Math.max(2, Math.round(w)); this.canvas.height = Math.max(2, Math.round(h));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.aspect = this.canvas.width / this.canvas.height;
  }
  // مستويات الرؤية الستة من مصفوفة الإسقاط×العرض
  setFrustum(vp) {
    const p = this.planes, rows = [0, 1, 2].map(i => [vp[i], vp[4 + i], vp[8 + i], vp[12 + i]]), r3 = [vp[3], vp[7], vp[11], vp[15]];
    let k = 0;
    for (const r of rows) for (const s of [1, -1]) {
      const a = r3[0] + s * r[0], b = r3[1] + s * r[1], c = r3[2] + s * r[2], d = r3[3] + s * r[3], l = Math.hypot(a, b, c) || 1;
      p[k++] = a / l; p[k++] = b / l; p[k++] = c / l; p[k++] = d / l;
    }
  }
  visible(b) {
    const p = this.planes;
    for (let k = 0; k < 24; k += 4) if (p[k] * b.x + p[k + 1] * b.y + p[k + 2] * b.z + p[k + 3] < -b.r) return false;
    return true;
  }
  render(meshes, vp, cx, cy, cz, maxDist = Infinity) {
    const gl = this.gl; let drawn = 0;
    gl.clearColor(this.sky[0], this.sky[1], this.sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.vp, false, vp);
    gl.uniform3f(this.u.cam, cx, cy, cz);
    gl.uniform3fv(this.u.fog, this.sky);
    gl.uniform2f(this.u.range, this.fogFar * 0.6, this.fogFar);
    gl.uniform1f(this.u.clip, this.clipY);
    this.setFrustum(vp);
    for (const m of meshes) {
      if (m.b) {
        if (!this.visible(m.b)) continue;
        if (Math.hypot(m.b.x - cx, m.b.y - cy, m.b.z - cz) - m.b.r > maxDist) continue;   // تقليم البعيد
      }
      gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.count, m.itype, 0); drawn++;
    }
    gl.bindVertexArray(null);
    return drawn;
  }
}
