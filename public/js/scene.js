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
const FLOW_Y = 0.62; // 水龍頭出水箭頭的高度（浮在黃銅接頭上方）
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
    // 省電：ticks 是畫面更新的機會，renders 是真的有重畫的次數（巡檢會看兩者的比例）
    this.stats = { ticks: 0, renders: 0 };
    this.skipDrop = false;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.className = 'stage-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
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
      // 水龍頭（水源）的零件：出水口的黃銅接頭、往外流的箭頭、頂上的手輪、底下的色墊
      spout: new THREE.CylinderGeometry(0.265, 0.265, 0.13, 24, 1),
      spoutLip: new THREE.CylinderGeometry(0.2, 0.2, 0.135, 24, 1),
      chevron: new THREE.ConeGeometry(0.13, 0.2, 3),
      wheel: new THREE.TorusGeometry(0.25, 0.035, 10, 28),
      spoke: new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8, 1),
      pad: new THREE.CylinderGeometry(0.455, 0.455, 0.02, 32, 1),
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

    // 顯示卡驅動重啟、分頁在背景太久時 WebGL 會被系統收走：先擋住預設行為，拿回來後請外面重畫
    const onLost = (ev) => {
      ev.preventDefault();
      this.lost = true;
    };
    const onRestored = () => {
      this.lost = false;
      this.handlers.onRestored?.();
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    (this._unbind ||= []).push(() => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    });

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
    const brass = mat({ color: 0xf2b53a, metalness: 0.45, roughness: 0.3, emissive: 0x5a3a00, emissiveIntensity: 0.25 });
    const flowMat = mat({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.3 });
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
      // 水龍頭：每個出水口一圈黃銅接頭＋往外流動的白色箭頭，頂上一個手輪，底下一塊同色的墊子。
      // 這些都跟著水龍頭一起轉，一眼看得出水從哪幾個方向流出去。
      const flows = [];
      if (cell.src) {
        const pad = new THREE.Mesh(this.base.pad, markMats[cell.src]);
        pad.position.y = 0.071;
        group.add(pad);
        const wheel = new THREE.Mesh(this.base.wheel, brass);
        wheel.rotation.x = HALF_PI;
        wheel.position.y = 0.74;
        group.add(wheel);
        for (const rot of [0, HALF_PI]) {
          const spoke = new THREE.Mesh(this.base.spoke, brass);
          spoke.rotation.set(0, rot, HALF_PI);
          spoke.position.y = 0.74;
          group.add(spoke);
        }
        for (const d of DIRS) {
          if (!(cell.mask & d.bit)) continue;
          const axis = d.dx !== 0 ? [0, 0, HALF_PI] : [HALF_PI, 0, 0];
          const spout = new THREE.Mesh(this.base.spout, brass);
          spout.rotation.set(...axis);
          spout.position.set(d.dx * 0.43, PIPE_Y, d.dy * 0.43);
          const lip = new THREE.Mesh(this.base.spoutLip, markMats[cell.src]);
          lip.rotation.set(...axis);
          lip.position.copy(spout.position);
          group.add(spout, lip);
          // 兩個箭頭一前一後沿著出水方向滑動
          for (let k = 0; k < 2; k++) {
            const chev = new THREE.Mesh(this.base.chevron, flowMat);
            // 圓錐尖端預設朝 +Y：放倒並指向出水方向
            chev.rotation.set(d.dy !== 0 ? (d.dy > 0 ? HALF_PI : -HALF_PI) : 0, 0, d.dx !== 0 ? (d.dx > 0 ? -HALF_PI : HALF_PI) : 0);
            chev.position.set(d.dx * 0.36, FLOW_Y, d.dy * 0.36);
            group.add(chev);
            flows.push({ mesh: chev, dx: d.dx, dy: d.dy, phase: k * 0.5 });
          }
        }
      }
      this.root.add(group);
      const turns = cell.rot;
      group.rotation.y = -turns * HALF_PI;
      return {
        group, material, flows, turns, angle: -turns * HALF_PI, from: -turns * HALF_PI, turnT0: -1,
        cur: new THREE.Color(WATER_COLORS[0]), start: new THREE.Color(WATER_COLORS[0]), target: new THREE.Color(WATER_COLORS[0]),
        colorT0: -1, colorCode: 0, bounceT0: -1, shakeT0: -1,
      };
    });
    this.hasFlows = this.cells.some((c) => c.flows.length > 0);
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

  /** 點到鎖住的水管：原地晃兩下表示轉不動 */
  shake(i) {
    const c = this.cells[i];
    if (!c || this.reduced) return;
    c.shakeT0 = performance.now();
    this.dirty = true;
  }

  /** 提示轉正的那一節跳一下，讓玩家看到是哪一節 */
  pulse(i) {
    const c = this.cells[i];
    if (!c || this.reduced) return;
    c.bounceT0 = performance.now() + 120;
    this.dirty = true;
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
    const pad = this.board.wrap ? 0.5 : 0.32; // 環繞盤面外圈還有一排箭頭
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

  /** 盤面底座投影後佔畫面的比例與格子的螢幕尺寸（巡檢用） */
  measure() {
    const { w, h } = this.board;
    const el = this.renderer.domElement;
    let minX = 1, maxX = -1, minY = 1, maxY = -1;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [-0.36, 0.06]) {
      const p = new THREE.Vector3(sx * (w / 2 + 0.25), y, sz * (h / 2 + 0.25)).project(this.camera);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const a = new THREE.Vector3(-0.5, 0.06, 0).project(this.camera), b = new THREE.Vector3(0.5, 0.06, 0).project(this.camera);
    return {
      fillX: +((maxX - minX) / 2).toFixed(3), fillY: +((maxY - minY) / 2).toFixed(3),
      inside: minX >= -1 && maxX <= 1 && minY >= -1 && maxY <= 1,
      cellPx: Math.round(((b.x - a.x) / 2) * el.clientWidth), stage: [el.clientWidth, el.clientHeight],
    };
  }

  /**
   * 點擊準確度（巡檢用）：把每一格「地磚中心」與「水管頂端」投影到螢幕，
   * 再用同一個位置去選格子，回傳選錯的格數。水管有高度、鏡頭是斜的，兩種位置都要選對才不會誤觸鄰格。
   */
  probePick() {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const miss = { tile: 0, pipeTop: 0, armEnd: 0, sourceTop: 0, total: this.cells.length };
    const hit = (x, y, z) => {
      const v = new THREE.Vector3(x, y, z).project(this.camera);
      return this._pick({ clientX: rect.left + ((v.x + 1) / 2) * rect.width, clientY: rect.top + ((1 - v.y) / 2) * rect.height });
    };
    this.cells.forEach((c, i) => {
      const p = this._cellPos(i);
      const cell = this.board.cells[i];
      if (hit(p.x, 0.06, p.z) !== i) miss.tile++;
      if (hit(p.x, PIPE_Y + PIPE_R, p.z) !== i) miss.pipeTop++;
      if (cell.src && hit(p.x, 0.6, p.z) !== i) miss.sourceTop++;
      // 每個開口靠近格子邊緣的水管頂端（最容易點到鄰格的位置）
      const mask = curMask(cell);
      let bad = false;
      for (const d of DIRS) if (mask & d.bit && hit(p.x + d.dx * 0.36, PIPE_Y + PIPE_R, p.z + d.dy * 0.36) !== i) bad = true;
      if (bad) miss.armEnd++;
    });
    return miss;
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
  /**
   * 螢幕座標 → 格子。水管有高度、鏡頭是斜的，只用一個平面換算會把「點在水管上」算成後面那一格，
   * 所以沿著視線由高往低取樣，先碰到哪一格的水管（或水塔）就是那一格；都沒碰到才用地磚所在的格子。
   */
  _pick(ev) {
    if (!this.board) return -1;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const { origin: o, direction: dir } = this.ray.ray;
    if (dir.y >= -1e-6) return -1;
    const { w, h } = this.board;
    const cellAt = (y) => {
      const t = (y - o.y) / dir.y;
      const px = o.x + dir.x * t, pz = o.z + dir.z * t;
      const cx = Math.floor(px + w / 2), cz = Math.floor(pz + h / 2);
      if (cx < 0 || cz < 0 || cx >= w || cz >= h) return null;
      return { i: cz * w + cx, lx: px + w / 2 - cx - 0.5, lz: pz + h / 2 - cz - 0.5 };
    };
    for (let y = 0.96; y > 0.07; y -= 0.03) {
      const c = cellAt(y);
      if (c && this._insidePipe(c.i, c.lx, y, c.lz)) return c.i;
    }
    const tile = cellAt(0.06);
    return tile ? tile.i : -1;
  }

  /** 格子內的一點（相對格子中心）是不是落在這一格的水管或水塔裡 */
  _insidePipe(i, lx, y, lz) {
    const cell = this.board.cells[i];
    const r = Math.hypot(lx, lz);
    const dy = y - PIPE_Y;
    if (cell.src) {
      if (y <= 0.66 && r <= 0.35) return true;
      if (y > 0.6 && y <= 0.8 && r <= 0.29) return true;
      if (y > 0.8 && r <= 0.2) return true;
    }
    const mask = curMask(cell);
    const k = kind(mask);
    if (k === 'end' && !cell.src && Math.hypot(r, dy) <= 0.24) return true;
    if (Math.hypot(r, dy) <= PIPE_R + 0.07) return true;
    if (Math.abs(dy) > PIPE_R + 0.065) return false;
    for (const d of DIRS) {
      if (!(mask & d.bit)) continue;
      const along = lx * d.dx + lz * d.dy;
      const perp = Math.abs(lx * d.dy - lz * d.dx);
      if (along < 0 || along > 0.5) continue;
      const radius = along > 0.4 ? PIPE_R + 0.065 : PIPE_R; // 靠邊那段是比較粗的接頭
      if (Math.abs(dy) <= radius && perp <= Math.sqrt(radius * radius - dy * dy) + 0.015) return true;
    }
    return false;
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
        // 放大之後單指拖曳改成平移（手機上大盤面才好找位置）；沒放大時拖曳是轉視角
        if (p.pan || this.view.zoom > 1.02) this._pan(dx, dy);
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
    if (this.lost) return;
    this.stats.ticks++;
    let busy = false;
    for (const c of this.cells) {
      if (c.turnT0 >= 0) {
        const t = Math.min(1, (now - c.turnT0) / TURN_MS);
        const e = 1 - (1 - t) * (1 - t);
        c.group.rotation.y = c.from + (c.angle - c.from) * e;
        if (t >= 1) c.turnT0 = -1;
        busy = true;
      }
      if (c.shakeT0 >= 0 && c.turnT0 < 0) {
        const t = (now - c.shakeT0) / 280;
        if (t >= 1) {
          c.shakeT0 = -1;
          c.group.rotation.y = c.angle;
        } else c.group.rotation.y = c.angle + Math.sin(t * Math.PI * 4) * 0.13 * (1 - t);
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
    // 只剩漏水的水滴在動時不需要每一幀都畫，隔一幀畫一次（約 30fps）就夠順，手機比較不耗電
    const ambient = this.leaks.length > 0 || this.hasFlows;
    if (!busy && !this.dirty && ambient && !this.reduced) {
      this.skipDrop = !this.skipDrop;
      if (this.skipDrop) return;
    }
    if (this.drops) busy = this._animateDrops(now) || busy;
    // 水龍頭出水口的箭頭往外滑動（從水塔邊滑到接頭前，越遠越淡出）
    if (!this.reduced && this.hasFlows) {
      for (const c of this.cells) {
        for (const f of c.flows) {
          const t = (now / 900 + f.phase) % 1;
          const dist = 0.33 + t * 0.2;
          f.mesh.position.x = f.dx * dist;
          f.mesh.position.z = f.dy * dist;
          const sc = 0.55 + 0.45 * Math.sin(t * Math.PI);
          f.mesh.scale.setScalar(sc);
        }
      }
      busy = true;
    }
    if (busy || this.dirty) {
      this.dirty = false;
      this.stats.renders++;
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
