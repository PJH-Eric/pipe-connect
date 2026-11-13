/* ===== scene.js — Three.js 3D 盤面 =====
 * 只負責「把盤面畫出來」和「把點擊換算成格子」，規則一律問 core/rules.js。
 * 座標：格子 (x, y) 在世界座標 (x - (w-1)/2, 0, y - (h-1)/2)，北方是 -Z。
 */
import * as THREE from 'three';
import { DIRS, kind, curMask, neighbor } from './core/rules.js';

export const WATER_COLORS = [0x9aa7b4, 0x2f9bff, 0xff7a3d, 0x35c96b, 0xb06bff];
const MIXED_COLOR = 0x6b4a2e;
const TILE = { normal: 0xe4ecf2, locked: 0x8a8076, hinted: 0xf6d77a };
const PIPE_R = 0.16;
const PIPE_Y = 0.3;
const TURN_MS = 150;
const HALF_PI = Math.PI / 2;

/* ---------- 幾何工具：把多個零件併成一個 mesh，並用頂點色區分零件 ---------- */
function mergeParts(parts) {
  let total = 0;
  const flat = parts.map(({ geo, matrix, shade }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    total += g.attributes.position.count;
    return { g, shade };
  });
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const { g, shade } of flat) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.fill(shade, o * 3, (o + g.attributes.position.count) * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

const M = () => new THREE.Matrix4();
function place(x, y, z, rx = 0, rz = 0) {
  return M().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)),
    new THREE.Vector3(1, 1, 1),
  );
}

/** 依開口組合做出一節水管的幾何（共用快取：同樣的開口＋是否水源只做一次） */
function buildPipeGeometry(mask, isSource, base) {
  const parts = [];
  const k = kind(mask);
  for (let d = 0; d < 4; d++) {
    if (!(mask & DIRS[d].bit)) continue;
    const { dx, dy } = DIRS[d];
    // 圓柱預設沿 Y 軸；轉成沿 X（東西）或沿 Z（南北）
    const rx = dx === 0 ? HALF_PI : 0;
    const rz = dx !== 0 ? HALF_PI : 0;
    parts.push({ geo: base.arm, matrix: place(dx * 0.25, PIPE_Y, dy * 0.25, rx, rz), shade: 1 });
    parts.push({ geo: base.flange, matrix: place(dx * 0.455, PIPE_Y, dy * 0.455, rx, rz), shade: 0.72 });
  }
  if (isSource) {
    parts.push({ geo: base.tank, matrix: place(0, 0.34, 0), shade: 0.82 });
    parts.push({ geo: base.tankRim, matrix: place(0, 0.6, 0), shade: 0.6 });
  } else if (k === 'end') {
    parts.push({ geo: base.bulb, matrix: place(0, PIPE_Y, 0), shade: 0.9 });
    parts.push({ geo: base.cap, matrix: place(0, PIPE_Y + 0.2, 0), shade: 0.6 });
  } else {
    parts.push({ geo: k === 'tee' || k === 'cross' ? base.hub : base.joint, matrix: place(0, PIPE_Y, 0), shade: 1 });
  }
  return mergeParts(parts);
}

export class PipeScene {
  /**
   * @param container 放 canvas 的元素（canvas 會填滿它）
   * @param handlers { onTap(i), onHover(i) }
   */
  constructor(container, handlers = {}) {
    this.container = container;
    this.handlers = handlers;
    this.reduced = false;
    this.board = null;
    this.cells = [];
    this.geoCache = new Map();
    this.disposables = [];
    this.view = { az: 0, polar: 0.56, zoom: 1, panX: 0, panZ: 0, fit: 10 };
    this.pointers = new Map();
    this.running = false;
    this.dirty = true;
    this.cursor = -1;
    this.leaks = [];
    this.celebrateAt = 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.className = 'stage-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5f78, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(3.5, 9, 5);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9fd8ff, 0.55);
    fill.position.set(-6, 4, -3);
    this.scene.add(fill);
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.base = {
      arm: new THREE.CylinderGeometry(PIPE_R, PIPE_R, 0.5, 18, 1),
      flange: new THREE.CylinderGeometry(PIPE_R + 0.065, PIPE_R + 0.065, 0.09, 18, 1),
      joint: new THREE.SphereGeometry(PIPE_R, 18, 12),
      hub: new THREE.SphereGeometry(PIPE_R + 0.06, 18, 12),
      bulb: new THREE.SphereGeometry(0.23, 20, 14),
      cap: new THREE.CylinderGeometry(0.1, 0.13, 0.08, 14, 1),
      tank: new THREE.CylinderGeometry(0.31, 0.34, 0.46, 24, 1),
      tankRim: new THREE.CylinderGeometry(0.35, 0.35, 0.07, 24, 1),
      tile: new THREE.BoxGeometry(0.94, 0.12, 0.94),
      rivet: new THREE.SphereGeometry(0.055, 10, 8),
      drop: new THREE.SphereGeometry(0.06, 10, 8),
      arrow: new THREE.ConeGeometry(0.13, 0.26, 4),
      // 水源頂上的形狀：顏色之外再用形狀區分（球／方塊／三角錐／八面體）
      marks: [
        new THREE.SphereGeometry(0.17, 18, 12),
        new THREE.BoxGeometry(0.27, 0.27, 0.27),
        new THREE.ConeGeometry(0.19, 0.32, 4),
        new THREE.OctahedronGeometry(0.2),
      ],
    };
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.22);

    this._bind();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
  }

  /* ---------- 建立盤面 ---------- */
  setBoard(board) {
    this._clearBoard();
    this.board = board;
    const { w, h } = board;
    const n = w * h;
    const add = (obj) => {
      this.root.add(obj);
      return obj;
    };
    const mat = (opts) => {
      const m = new THREE.MeshStandardMaterial(opts);
      this.disposables.push(m);
      return m;
    };

    // 底座
    const baseGeo = new THREE.BoxGeometry(w + 0.5, 0.3, h + 0.5);
    this.disposables.push(baseGeo);
    const baseMesh = add(new THREE.Mesh(baseGeo, mat({ color: 0x1d3147, roughness: 0.8 })));
    baseMesh.position.y = -0.21;

    // 邊框：一般盤面是實心圍欄；環繞盤面改成一圈往外指的箭頭
    if (board.wrap) {
      const arrows = add(new THREE.InstancedMesh(this.base.arrow, mat({ color: 0x37e0d0, emissive: 0x0b6b63, roughness: 0.4 }), 2 * (w + h)));
      const m4 = M();
      const q = new THREE.Quaternion();
      const one = new THREE.Vector3(1, 1, 1);
      let k = 0;
      const put = (x, z, rx, rz) => {
        q.setFromEuler(new THREE.Euler(rx, 0, rz));
        arrows.setMatrixAt(k++, m4.compose(new THREE.Vector3(x, 0.02, z), q, one));
      };
      for (let x = 0; x < w; x++) {
        put(x - (w - 1) / 2, -h / 2 - 0.3, -HALF_PI, 0);
        put(x - (w - 1) / 2, h / 2 + 0.3, HALF_PI, 0);
      }
      for (let y = 0; y < h; y++) {
        put(-w / 2 - 0.3, y - (h - 1) / 2, 0, HALF_PI);
        put(w / 2 + 0.3, y - (h - 1) / 2, 0, -HALF_PI);
      }
    } else {
      const railMat = mat({ color: 0x2c4a66, roughness: 0.55 });
      const sideGeo = new THREE.BoxGeometry(w + 0.5, 0.22, 0.2);
      const endGeo = new THREE.BoxGeometry(0.2, 0.22, h + 0.1);
      this.disposables.push(sideGeo, endGeo);
      [[0, -h / 2 - 0.15, sideGeo], [0, h / 2 + 0.15, sideGeo], [-w / 2 - 0.15, 0, endGeo], [w / 2 + 0.15, 0, endGeo]].forEach(([x, z, g]) => {
        const r = add(new THREE.Mesh(g, railMat));
        r.position.set(x, 0.05, z);
      });
    }

    // 地磚（一次畫完）
    this.tiles = add(new THREE.InstancedMesh(this.base.tile, mat({ color: 0xffffff, roughness: 0.55 }), n));
    this.tiles.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const m4 = M();
    for (let i = 0; i < n; i++) {
      const p = this._cellPos(i);
      this.tiles.setMatrixAt(i, m4.makeTranslation(p.x, 0, p.z));
    }

    // 鎖住水管的四角鉚釘
    this.rivets = add(new THREE.InstancedMesh(this.base.rivet, mat({ color: 0x4a423b, metalness: 0.5, roughness: 0.4 }), n * 4));
    this.rivets.count = 0;

    // 游標（鍵盤與滑鼠停留的格子）
    const curGeo = new THREE.BoxGeometry(0.98, 0.03, 0.98);
    this.disposables.push(curGeo);
    this.cursorMesh = add(new THREE.Mesh(curGeo, mat({ color: 0xffe066, emissive: 0xffc400, emissiveIntensity: 0.7, transparent: true, opacity: 0.75 })));
    this.cursorMesh.visible = false;

    // 漏水的水滴
    this.drops = add(new THREE.InstancedMesh(this.base.drop, mat({ color: 0xffffff, roughness: 0.15 }), 96));
    this.drops.count = 0;
    this.drops.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(96 * 3), 3);

    // 水管
    const markMats = WATER_COLORS.map((c) => mat({ color: c, emissive: c, emissiveIntensity: 0.45, roughness: 0.3 }));
    this.cells = board.cells.map((cell, i) => {
      const key = cell.mask + (cell.src ? 's' : 'p');
      if (!this.geoCache.has(key)) this.geoCache.set(key, buildPipeGeometry(cell.mask, !!cell.src, this.base));
      const material = mat({ color: WATER_COLORS[0], vertexColors: true, metalness: 0.25, roughness: 0.32 });
      const group = new THREE.Group();
      const p = this._cellPos(i);
      group.position.set(p.x, 0, p.z);
      group.add(new THREE.Mesh(this.geoCache.get(key), material));
      if (cell.src) {
        const mark = new THREE.Mesh(this.base.marks[(cell.src - 1) % 4], markMats[cell.src]);
        mark.position.y = cell.src === 3 ? 0.8 : 0.77;
        if (cell.src === 3) mark.rotation.y = Math.PI / 4;
        group.add(mark);
      }
      this.root.add(group);
      const turns = cell.rot;
      group.rotation.y = -turns * HALF_PI;
      return {
        group, material, turns, angle: -turns * HALF_PI, from: -turns * HALF_PI, turnT0: -1,
        cur: new THREE.Color(WATER_COLORS[0]), start: new THREE.Color(WATER_COLORS[0]), target: new THREE.Color(WATER_COLORS[0]),
        colorT0: -1, colorCode: 0, bounceT0: -1,
      };
    });
    this._paintTiles();
    this.view.zoom = 1;
    this.view.panX = this.view.panZ = 0;
    this.view.az = 0;
    this.view.polar = 0.56;
    this._fit();
    this.dirty = true;
  }

  _cellPos(i) {
    const { w, h } = this.board;
    return { x: (i % w) - (w - 1) / 2, z: Math.floor(i / w) - (h - 1) / 2 };
  }

  _paintTiles() {
    const c = new THREE.Color();
    const m4 = M();
    let r = 0;
    this.board.cells.forEach((cell, i) => {
      const checker = ((i % this.board.w) + Math.floor(i / this.board.w)) % 2 ? 0.94 : 1;
      c.setHex(cell.hinted ? TILE.hinted : cell.locked ? TILE.locked : TILE.normal).multiplyScalar(checker);
      this.tiles.setColorAt(i, c);
      if (cell.locked && !cell.hinted) {
        const p = this._cellPos(i);
        for (const [ox, oz] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]]) {
          this.rivets.setMatrixAt(r++, m4.makeTranslation(p.x + ox, 0.07, p.z + oz));
        }
      }
    });
    this.rivets.count = r;
    this.rivets.instanceMatrix.needsUpdate = true;
    this.tiles.instanceColor.needsUpdate = true;
    this.dirty = true;
  }

  /* ---------- 同步規則狀態 ---------- */
  /** 順時針（dir=1）或逆時針（dir=-1）轉一格的動畫 */
  turn(i, dir) {
    const c = this.cells[i];
    c.turns += dir;
    this._startTurn(c);
  }

  /** 提示：順時針轉到指定的 rot */
  setRot(i, rot) {
    const c = this.cells[i];
    const diff = (((rot - c.turns) % 4) + 4) % 4;
    if (diff) {
      c.turns += diff;
      this._startTurn(c);
    }
  }

  _startTurn(c) {
    c.from = c.group.rotation.y;
    c.angle = -c.turns * HALF_PI;
    c.turnT0 = this.reduced ? -1 : performance.now();
    if (this.reduced) c.group.rotation.y = c.angle;
    this.dirty = true;
  }

  /** 依水流結果更新顏色、漏水與鎖定外觀 */
  applyFlow(result, { instant = false } = {}) {
    const now = performance.now();
    this.cells.forEach((c, i) => {
      const code = result.color[i];
      if (code === c.colorCode) return;
      const becameWet = code !== 0;
      c.colorCode = code;
      c.start.copy(c.cur);
      c.target.setHex(code < 0 ? MIXED_COLOR : WATER_COLORS[code]);
      if (instant || this.reduced) {
        c.cur.copy(c.target);
        c.colorT0 = -1;
        this._applyColor(c);
      } else {
        // 水從水源一格一格流過去
        c.colorT0 = now + (becameWet ? Math.min(result.dist[i], 30) * 32 : 0);
      }
    });
    this.leaks = result.leaks.filter((l) => result.color[l.i] !== 0).slice(0, 96);
    this._paintTiles();
    this.dirty = true;
  }

  _applyColor(c) {
    c.material.color.copy(c.cur);
    const wet = c.colorCode !== 0;
    c.material.emissive.copy(c.cur);
    c.material.emissiveIntensity = wet ? 0.28 : 0;
  }

  /** 過關慶祝：水管依離水源的距離像波浪一樣彈起來 */
  celebrate(dist) {
    if (this.reduced) return;
    const now = performance.now();
    this.cells.forEach((c, i) => (c.bounceT0 = now + Math.max(0, dist[i]) * 38));
    this.dirty = true;
  }

  setCursor(i) {
    if (this.cursor === i) return;
    this.cursor = i;
    if (!this.cursorMesh) return;
    if (i < 0 || !this.board) {
      this.cursorMesh.visible = false;
    } else {
      const p = this._cellPos(i);
      this.cursorMesh.position.set(p.x, 0.07, p.z);
      this.cursorMesh.visible = true;
    }
    this.dirty = true;
  }

  setReducedMotion(on) {
    this.reduced = !!on;
  }

  /* ---------- 鏡頭 ---------- */
  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._fit();
    this.dirty = true;
  }

  /** 算出剛好把整個盤面放進畫面的鏡頭距離 */
  _fit() {
    if (!this.board) return;
    const { w, h } = this.board;
    const pad = this.board.wrap ? 0.62 : 0.45; // 環繞盤面外圈還有一排箭頭
    const hw = w / 2 + pad, hh = h / 2 + pad;
    const corners = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [-0.3, 0.9]) corners.push(new THREE.Vector3(sx * hw, y, sz * hh));
    let dist = 12;
    const saved = { ...this.view };
    this.view.zoom = 1;
    this.view.panX = this.view.panZ = 0;
    for (let it = 0; it < 6; it++) {
      this.view.fit = dist;
      this._placeCamera();
      let m = 0;
      for (const c of corners) {
        const p = c.clone().project(this.camera);
        m = Math.max(m, Math.abs(p.x), Math.abs(p.y));
      }
      dist *= m / 0.97;
    }
    this.view.fit = dist;
    this.view.zoom = saved.zoom;
    this.view.panX = saved.panX;
    this.view.panZ = saved.panZ;
    this._placeCamera();
  }

  _placeCamera() {
    const v = this.view;
    const d = v.fit / v.zoom;
    const sp = Math.sin(v.polar), cp = Math.cos(v.polar);
    this.camera.position.set(v.panX + d * sp * Math.sin(v.az), d * cp, v.panZ + d * sp * Math.cos(v.az));
    this.camera.lookAt(v.panX, 0.1, v.panZ);
    this.camera.updateMatrixWorld();
    this.dirty = true;
  }

  _clampView() {
    const v = this.view;
    v.zoom = Math.min(4, Math.max(1, v.zoom));
    v.polar = Math.min(1.05, Math.max(0.05, v.polar));
    v.az = Math.min(0.9, Math.max(-0.9, v.az));
    if (this.board) {
      const slack = 1 - 1 / v.zoom;
      const mx = (this.board.w / 2) * slack * 1.2, mz = (this.board.h / 2) * slack * 1.2;
      v.panX = Math.min(mx, Math.max(-mx, v.panX));
      v.panZ = Math.min(mz, Math.max(-mz, v.panZ));
    }
  }

  zoomBy(f) {
    this.view.zoom *= f;
    this._clampView();
    this._placeCamera();
  }

  resetView() {
    Object.assign(this.view, { az: 0, polar: 0.56, zoom: 1, panX: 0, panZ: 0 });
    this._placeCamera();
  }

  get isDefaultView() {
    const v = this.view;
    return v.zoom === 1 && v.az === 0 && Math.abs(v.polar - 0.56) < 1e-6;
  }

  /* ---------- 輸入 ---------- */
  _pick(ev) {
    if (!this.board) return -1;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, hit)) return -1;
    const { w, h } = this.board;
    const x = Math.floor(hit.x + w / 2), y = Math.floor(hit.z + h / 2);
    return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x;
  }

  _bind() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    const on = (type, fn, opts) => {
      el.addEventListener(type, fn, opts);
      (this._unbind ||= []).push(() => el.removeEventListener(type, fn, opts));
    };
    let gesture = null;

    on('pointerdown', (ev) => {
      el.setPointerCapture?.(ev.pointerId);
      this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY, moved: false, pan: ev.button === 2 || ev.shiftKey });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        a.moved = b.moved = true;
        gesture = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      }
    });
    on('pointermove', (ev) => {
      const p = this.pointers.get(ev.pointerId);
      if (!p) {
        if (ev.pointerType === 'mouse') this.handlers.onHover?.(this._pick(ev));
        return;
      }
      const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
      p.x = ev.clientX;
      p.y = ev.clientY;
      if (!p.moved && Math.hypot(p.x - p.sx, p.y - p.sy) > 9) p.moved = true;
      if (this.pointers.size === 2 && gesture) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        this.view.zoom *= d / (gesture.d || d);
        this._pan(cx - gesture.cx, cy - gesture.cy);
        gesture = { d, cx, cy };
        this._clampView();
        this._placeCamera();
      } else if (this.pointers.size === 1 && p.moved) {
        if (p.pan) this._pan(dx, dy);
        else {
          this.view.az -= dx * 0.006;
          this.view.polar -= dy * 0.006;
        }
        this._clampView();
        this._placeCamera();
      }
    });
    const up = (ev) => {
      const p = this.pointers.get(ev.pointerId);
      if (!p) return;
      this.pointers.delete(ev.pointerId);
      if (this.pointers.size < 2) gesture = null;
      if (ev.type === 'pointerup' && !p.moved && !p.pan && this.pointers.size === 0) {
        const i = this._pick(ev);
        if (i >= 0) this.handlers.onTap?.(i);
      }
    };
    on('pointerup', up);
    on('pointercancel', up);
    on('pointerleave', (ev) => {
      if (ev.pointerType === 'mouse' && !this.pointers.size) this.handlers.onHover?.(-1);
    });
    on('wheel', (ev) => {
      ev.preventDefault();
      this.zoomBy(Math.exp(-ev.deltaY * 0.0015));
    }, { passive: false });
    on('contextmenu', (ev) => ev.preventDefault());
  }

  /** 畫面上拖曳 (dx, dy) 像素 → 平移看的位置 */
  _pan(dx, dy) {
    const h = this.container.clientHeight || 1;
    const unit = ((this.view.fit / this.view.zoom) * 2 * Math.tan((this.camera.fov * Math.PI) / 360)) / h;
    const ca = Math.cos(this.view.az), sa = Math.sin(this.view.az);
    const mx = -dx * unit, mz = (-dy * unit) / Math.max(0.35, Math.cos(this.view.polar));
    this.view.panX += mx * ca + mz * sa;
    this.view.panZ += -mx * sa + mz * ca;
  }

  /* ---------- 每幀 ---------- */
  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this._frame(performance.now());
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  _frame(now) {
    let busy = false;
    for (const c of this.cells) {
      if (c.turnT0 >= 0) {
        const t = Math.min(1, (now - c.turnT0) / TURN_MS);
        const e = 1 - (1 - t) * (1 - t);
        c.group.rotation.y = c.from + (c.angle - c.from) * e;
        if (t >= 1) c.turnT0 = -1;
        busy = true;
      }
      if (c.colorT0 >= 0) {
        const t = (now - c.colorT0) / 200;
        if (t >= 0) {
          c.cur.copy(c.start).lerp(c.target, Math.min(1, t));
          this._applyColor(c);
          if (t >= 1) c.colorT0 = -1;
        }
        busy = true;
      }
      if (c.bounceT0 >= 0) {
        const t = (now - c.bounceT0) / 420;
        if (t >= 1) {
          c.bounceT0 = -1;
          c.group.position.y = 0;
          c.group.scale.setScalar(1);
        } else if (t >= 0) {
          const s = Math.sin(t * Math.PI);
          c.group.position.y = s * 0.28;
          c.group.scale.setScalar(1 + s * 0.12);
        }
        busy = true;
      }
    }
    // 混色的水管閃爍警告
    if (!this.reduced) {
      for (const c of this.cells) {
        if (c.colorCode < 0 && c.colorT0 < 0) {
          c.material.emissiveIntensity = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(now / 160));
          busy = true;
        }
      }
    }
    if (this.drops) busy = this._animateDrops(now) || busy;
    if (busy || this.dirty) {
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
    }
  }

  _animateDrops(now) {
    const list = this.leaks;
    const m4 = M();
    const col = new THREE.Color();
    const perLeak = list.length > 48 ? 1 : 2;
    let k = 0;
    for (const leak of list) {
      const p = this._cellPos(leak.i);
      const { dx, dy } = DIRS[leak.d];
      const code = this.cells[leak.i].colorCode;
      col.setHex(code < 0 ? MIXED_COLOR : WATER_COLORS[code]);
      for (let j = 0; j < perLeak && k < 96; j++) {
        const t = this.reduced ? 0.3 + j * 0.3 : ((now / 620 + j / perLeak + leak.i * 0.37) % 1);
        const out = 0.5 + t * 0.2;
        const s = 1 - t * 0.6;
        m4.makeScale(s, s, s).setPosition(p.x + dx * out, PIPE_Y - t * t * 0.28, p.z + dy * out);
        this.drops.setMatrixAt(k, m4);
        this.drops.setColorAt(k, col);
        k++;
      }
    }
    this.drops.count = k;
    this.drops.instanceMatrix.needsUpdate = true;
    if (this.drops.instanceColor) this.drops.instanceColor.needsUpdate = true;
    return k > 0 && !this.reduced;
  }

  /* ---------- 釋放 ---------- */
  _clearBoard() {
    while (this.root.children.length) this.root.remove(this.root.children[0]);
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.geoCache.forEach((g) => g.dispose());
    this.geoCache.clear();
    [this.tiles, this.rivets, this.drops].forEach((m) => m?.dispose?.());
    this.tiles = this.rivets = this.drops = this.cursorMesh = null;
    this.cells = [];
    this.leaks = [];
    this.cursor = -1;
    this.board = null;
  }

  dispose() {
    this.stop();
    this._unbind?.forEach((f) => f());
    this.resizeObs.disconnect();
    this._clearBoard();
    Object.values(this.base).flat().forEach((g) => g.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** 給說明頁與其他地方用：把顏色編號轉成 CSS 色碼 */
export function waterCss(code) {
  return '#' + WATER_COLORS[code].toString(16).padStart(6, '0');
}
export { curMask, neighbor };
