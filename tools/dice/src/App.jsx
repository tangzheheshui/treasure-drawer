import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { World, Body, Box, Vec3, Quaternion as CQuat } from 'cannon-es';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// BoxGeometry/AXES 面序 [+x,-x,+y,-y,+z,-z]，对面和为 7
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const CUP_H = 3.6;               // 骰盅高（二轮反馈：加高）
const REST_Y = CUP_H / 2 + 0.02; // 扣在桌面时的盅中心高度
const WALL_MARGIN = 0.12;        // 物理边界比盅口内收量（留给摇盅晃动的余量）
const FELT_R = 4.6;              // 桌毡半径
const TABLE_R = 6.8;             // 木桌半径

// 圆盘内摆 n 颗骰子的基准网格（用于推导盅径下限）
function packedPositions(n) {
  const pts = [];
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) pts.push([i * 1.12, j * 1.12]);
  pts.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]) || Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
  return pts.slice(0, n);
}

// 骰盅半径：罩住全部落点再留余量，骰子再多也盖得住
const cupRadiusFor = (n) =>
  Math.max(1.05, Math.max(...packedPositions(n).map(([x, z]) => Math.hypot(x, z))) + 0.85);

// 随机落点：随机撒点 → 成对推开 → 收进盅口，每次布局都不一样、互不重叠
function scatterPositions(n, rMax) {
  const lim = Math.max(0.2, rMax - 0.72);
  const pts = Array.from({ length: n }, () => {
    const r = lim * Math.sqrt(Math.random());
    const th = Math.random() * Math.PI * 2;
    return [Math.cos(th) * r, Math.sin(th) * r];
  });
  for (let it = 0; it < 90; it++) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = pts[j][0] - pts[i][0], dz = pts[j][1] - pts[i][1];
      let d = Math.hypot(dx, dz);
      if (d < 1.1) {
        d = d || 0.01;
        const push = (1.1 - d) / 2, nx = dx / d, nz = dz / d;
        pts[i][0] -= nx * push; pts[i][1] -= nz * push;
        pts[j][0] += nx * push; pts[j][1] += nz * push;
      }
    }
    for (const p of pts) {
      const d = Math.hypot(p[0], p[1]);
      if (d > lim) { p[0] *= lim / d; p[1] *= lim / d; }
    }
  }
  return pts;
}

// 每面点数的排布（±1 为面内归一偏移）
const PIPS = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};

// 3D 实体点数：小球压扁贴在六面上，中式骰 1、4 为红。全部骰子共用这一份几何。
function buildPipGeometry() {
  const geos = [];
  for (let fi = 0; fi < 6; fi++) {
    const n = new THREE.Vector3(...AXES[fi]);
    const u = new THREE.Vector3().crossVectors(n, Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
    const w = new THREE.Vector3().crossVectors(n, u).normalize();
    for (const [dx, dy] of PIPS[FACE_VALUES[fi]]) {
      const g = new THREE.SphereGeometry(0.092, 14, 10);
      g.scale(1, 1, 0.5); // 压扁成浅凸点
      const m = new THREE.Matrix4().makeBasis(u, w, n);
      m.setPosition(new THREE.Vector3().addScaledVector(n, 0.485).addScaledVector(u, dx * 0.19).addScaledVector(w, dy * 0.19));
      g.applyMatrix4(m);
      // 明亮红 / 纯深黑，打足对比度（线性空间取高饱和，过 ACES 后仍正红）
      const col = FACE_VALUES[fi] === 1 || FACE_VALUES[fi] === 4 ? [1.0, 0.045, 0.015] : [0.06, 0.06, 0.08];
      const cnt = g.attributes.position.count;
      const colors = new Float32Array(cnt * 3);
      for (let i = 0; i < cnt; i++) { colors[i * 3] = col[0]; colors[i * 3 + 1] = col[1]; colors[i * 3 + 2] = col[2]; }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geos.push(g);
    }
  }
  return mergeGeometries(geos);
}

// 程序生成毛毡纹理：绿底 + 颗粒噪点
function feltTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2e6b4a';
  g.fillRect(0, 0, 256, 256);
  const img = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 30;
    img.data[i] += n - 4; img.data[i + 1] += n; img.data[i + 2] += n - 3;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 程序生成木纹纹理：底色 + 纵向年轮条 + 细噪点
function woodTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#5d4126';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 512;
    g.strokeStyle = `hsl(${25 + Math.random() * 12}, ${26 + Math.random() * 20}%, ${18 + Math.random() * 14}%)`;
    g.globalAlpha = 0.16 + Math.random() * 0.26;
    g.lineWidth = 0.6 + Math.random() * 2;
    g.beginPath();
    g.moveTo(x, -10);
    for (let y = 0; y <= 522; y += 26) g.lineTo(x + Math.sin(y * 0.02 + i * 1.7) * 5, y);
    g.stroke();
  }
  g.globalAlpha = 1;
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function topFace(body) {
  let best = -2, bi = 0;
  AXES.forEach((a, i) => {
    const v = body.quaternion.vmult(new Vec3(a[0], a[1], a[2]));
    if (v.y > best) { best = v.y; bi = i; }
  });
  return { value: FACE_VALUES[bi], up: best };
}

export default function App() {
  const mountRef = useRef(null);
  const eng = useRef(null);
  const acRef = useRef(null);
  const lastClack = useRef(0);
  const soundRef = useRef(true);
  const [count, setCount] = useState(5);
  const [ui, setUi] = useState('idle'); // idle | rolling | covered | open
  const [total, setTotal] = useState(null);
  const [showTotal, setShowTotal] = useState(false);
  const [sound, setSound] = useState(true);
  soundRef.current = sound;

  function ensureAudio() {
    if (!acRef.current) { try { acRef.current = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* 无声 */ } }
    return acRef.current;
  }

  function clack(vol) {
    const ac = acRef.current;
    if (!ac || !soundRef.current) return;
    const buf = ac.createBuffer(1, ac.sampleRate * 0.05, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const src = ac.createBufferSource(); src.buffer = buf;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800 + Math.random() * 1600; bp.Q.value = 1.1;
    const g = ac.createGain(); g.gain.value = 0.35 * vol;
    src.connect(bp); bp.connect(g); g.connect(ac.destination);
    src.start();
  }

  function ding() {
    const ac = acRef.current;
    if (!ac || !soundRef.current) return;
    [[880, 0], [1174.7, 0.13]].forEach(([f, t]) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = f;
      const t0 = ac.currentTime + t;
      g.gain.setValueAtTime(0.001, t0);
      g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
      o.connect(g); g.connect(ac.destination);
      o.start(t0); o.stop(t0 + 0.4);
    });
  }

  useEffect(() => {
    const mount = mountRef.current;
    const e = {
      count: 5, cupR: cupRadiusFor(5), phase: 'idle', phaseT: 0,
      prog: 0, progTarget: 0, dragging: false, dragBase: 0, dragStartY: 0,
      shakeTick: 0, retries: 0, dice: [], bounds: [], visOpen: false,
    };
    eng.current = e;
    e.setUI = setUi; e.setTotalVal = setTotal; e.setTotalVis = setShowTotal;
    if (typeof window !== 'undefined') window.__dice = e; // 调试/自检探针

    // ── three 场景：ACES 调色 + 环境反射 + 三路打亮 + 软阴影 ──
    e.scene = new THREE.Scene();
    e.scene.background = new THREE.Color('#15181d');
    e.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    e.renderer = new THREE.WebGLRenderer({ antialias: true });
    e.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    e.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    e.renderer.toneMappingExposure = 1.25;
    e.renderer.shadowMap.enabled = true;
    e.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(e.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(e.renderer);
    e.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    e.scene.environmentIntensity = 0.5;
    pmrem.dispose();

    e.scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    e.scene.add(new THREE.HemisphereLight(0xfff6e6, 0x2e4636, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(5, 9, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -7.5, right: 7.5, top: 7.5, bottom: -7.5, near: 2, far: 30 });
    sun.shadow.bias = -0.0004;
    e.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xfff2dd, 0.6);
    fill.position.set(-5, 6, -4);
    e.scene.add(fill);

    // 木桌 + 桌毡（程序纹理，无外部资源）
    const wood = new THREE.Mesh(
      new THREE.CylinderGeometry(TABLE_R, TABLE_R * 1.03, 0.6, 64),
      new THREE.MeshPhysicalMaterial({ map: woodTexture(), roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.35 })
    );
    wood.position.y = -0.3;
    wood.receiveShadow = true;
    e.scene.add(wood);
    const felt = new THREE.Mesh(
      new THREE.CircleGeometry(FELT_R, 64),
      new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.97 })
    );
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = 0.005;
    felt.receiveShadow = true;
    e.scene.add(felt);

    // ── cannon 世界 ──
    e.world = new World({ gravity: new Vec3(0, -32, 0) });
    e.world.allowSleep = true;
    e.world.defaultContactMaterial.friction = 0.35;
    e.world.defaultContactMaterial.restitution = 0.32;

    const ground = new Body({ mass: 0, shape: new Box(new Vec3(14, 0.5, 14)) });
    ground.position.set(0, -0.5, 0);
    e.world.addBody(ground);

    // 十二边形隐形围栏：半径永远 = 盅口内径，骰子物理上出不了盅
    e.buildBounds = () => {
      e.bounds.forEach((b) => e.world.removeBody(b));
      e.bounds.length = 0;
      const a = e.cupR - WALL_MARGIN;
      const half = a * Math.tan(Math.PI / 12) + 0.3;
      for (let k = 0; k < 12; k++) {
        const ang = (k * Math.PI) / 6;
        const b = new Body({ mass: 0, shape: new Box(new Vec3(half, CUP_H / 2 + 0.5, 0.25)) });
        b.position.set(Math.sin(ang) * (a + 0.25), 1.5, Math.cos(ang) * (a + 0.25));
        b.quaternion.setFromEuler(0, ang, 0);
        e.world.addBody(b);
        e.bounds.push(b);
      }
    };

    // ── 骰子：圆角立方体 + 3D 点数 ──
    const bodyGeo = new RoundedBoxGeometry(1, 1, 1, 5, 0.18);
    const ivory = new THREE.MeshStandardMaterial({ color: '#fdf6e3', roughness: 0.3 });
    const pipGeo = buildPipGeometry();
    const pipMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22 });
    for (let i = 0; i < 9; i++) {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(bodyGeo, ivory));
      group.add(new THREE.Mesh(pipGeo, pipMat));
      group.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      group.visible = false;
      e.scene.add(group);
      const body = new Body({ mass: 1, shape: new Box(new Vec3(0.5, 0.5, 0.5)) });
      body.linearDamping = 0.12;
      body.angularDamping = 0.2;
      body.allowSleep = true;
      body.sleepSpeedLimit = 0.35;
      body.sleepTimeLimit = 0.25;
      body.position.set(0, -60, 0);
      body.addEventListener('collide', (ev) => {
        const now = performance.now();
        if (now - lastClack.current < 60) return;
        const v = Math.abs((ev.contact && ev.contact.getImpactVelocityAlongNormal && ev.contact.getImpactVelocityAlongNormal()) || 0);
        if (v > 1.5) { lastClack.current = now; clack(Math.min(1, v / 10)); }
      });
      e.world.addBody(body);
      e.dice.push({ mesh: group, body });
    }

    // ── 骰盅：锥形杯身 + 浅圆顶盖 + 口沿卷边（基础几何渲染可靠），亮漆塑料质感 ──
    e.cupMat = new THREE.MeshPhysicalMaterial({
      color: '#9c261c', roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3,
      envMapIntensity: 0.7, side: THREE.DoubleSide,
    });
    e.cupGroup = new THREE.Group();
    e.cupGroup.visible = false;
    e.scene.add(e.cupGroup);
    e.rebuildCup = () => {
      e.cupGroup.children.forEach((m) => m.geometry.dispose());
      e.cupGroup.clear();
      const rB = e.cupR + 0.1; // 盅口（最窄处，决定盖不盖得住）
      const rT = rB * 1.15;    // 顶圈略宽，倒扣杯身的梯形轮廓
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, CUP_H, 48, 1, true), e.cupMat);
      wall.castShadow = true;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(rT, 48, 12, 0, Math.PI * 2, 0, Math.PI / 2), e.cupMat);
      dome.scale.y = 0.35; // 浅圆顶封口
      dome.position.y = CUP_H / 2;
      dome.castShadow = true;
      const lip = new THREE.Mesh(new THREE.TorusGeometry(rB + 0.02, 0.075, 10, 48), e.cupMat);
      lip.rotation.x = Math.PI / 2; // 口沿一圈卷边
      lip.position.y = 0.06;
      lip.castShadow = true;
      e.cupGroup.add(wall, dome, lip);
    };

    // 随机一面朝上的正放姿态（兜底摆正用）
    const faceUpRandom = (body) => {
      const fi = Math.floor(Math.random() * 6);
      const qA = new CQuat();
      qA.setFromVectors(new Vec3(...AXES[fi]), new Vec3(0, 1, 0));
      const qY = new CQuat();
      qY.setFromAxisAngle(new Vec3(0, 1, 0), Math.random() * Math.PI * 2);
      qY.mult(qA, body.quaternion);
      return FACE_VALUES[fi];
    };

    // 摆放：前 count 颗随机散点布局（每次都不同），其余收回场外
    e.layoutDice = () => {
      const pts = scatterPositions(e.count, e.cupR);
      e.dice.forEach((d, i) => {
        if (i < e.count) {
          d.mesh.visible = true;
          d.body.position.set(pts[i][0], 0.5, pts[i][1]);
          d.body.velocity.set(0, 0, 0);
          d.body.angularVelocity.set(0, 0, 0);
          faceUpRandom(d.body);
          d.body.sleep();
        } else {
          d.body.position.set(0, -60, 0);
          d.body.velocity.set(0, 0, 0);
          d.body.angularVelocity.set(0, 0, 0);
          d.mesh.visible = false;
        }
      });
    };

    // 盅位曲线：p=0 扣住骰子，p=1 悬到侧后方；先竖直升降再平移，壁永不剐蹭骰子
    e.applyCup = (p) => {
      const yP = Math.min(1, p / 0.6);
      const zP = Math.max(0, (p - 0.5) / 0.5);
      e.cupGroup.position.set(0, REST_Y + yP * 3.2, -zP * (e.cupR + 0.95));
      e.cupGroup.rotation.x = -0.1 * Math.sin(zP * Math.PI);
    };

    e.rebuild = (n) => {
      e.count = n;
      e.cupR = cupRadiusFor(n);
      e.rebuildCup();
      e.buildBounds();
      e.layoutDice();
      e.fit();
    };

    // ── 尺寸自适应：镜头距离按屏幕比例自动拉远，盅、骰、停泊位都看得全 ──
    const fit = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      e.renderer.setSize(w, h);
      e.camera.aspect = w / h;
      const halfV = (50 / 2) * Math.PI / 180;
      const halfH = Math.atan(Math.tan(halfV) * e.camera.aspect);
      const need = e.cupR * 2 + 1.8; // 整个桌面布局收进画面，再留一口气
      const dist = Math.max(need / Math.tan(halfH), (need + 2.2) / Math.tan(halfV));
      const dir = new THREE.Vector3(0.24, 0.92, 0.78).normalize(); // 偏俯视，看得全
      e.camera.position.copy(dir.multiplyScalar(dist));
      e.camera.lookAt(0, 0.2, 0);
      e.camera.updateProjectionMatrix();
    };
    e.fit = fit;
    const ro = new ResizeObserver(fit);
    ro.observe(mount);

    // ── 手势：盖着时上划开盅，开着时下划盖回（跟手，松手过半自动走完）──
    const el = e.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (ev) => {
      if (e.phase !== 'cup') return;
      e.dragging = true;
      e.dragBase = e.prog;
      e.dragStartY = ev.clientY;
      el.setPointerCapture(ev.pointerId);
    });
    el.addEventListener('pointermove', (ev) => {
      if (!e.dragging) return;
      e.prog = Math.min(1, Math.max(0, e.dragBase + (e.dragStartY - ev.clientY) * 0.0042));
    });
    const endDrag = () => {
      if (!e.dragging) return;
      e.dragging = false;
      e.progTarget = e.prog > 0.5 ? 1 : 0;
      e.setUI(e.progTarget ? 'open' : 'covered');
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    // ── 阶段机 ──
    const clock = new THREE.Clock();
    const startShake = () => {
      e.phase = 'shake'; e.phaseT = 0; e.shakeTick = 0;
      e.setUI('rolling');
      e.setTotalVal(null);
      e.setTotalVis(false);
      e.visOpen = false;
      navigator.vibrate && navigator.vibrate(150);
    };
    e.startShake = startShake;

    const finishSettle = (active, bad) => {
      const pts = scatterPositions(e.count, e.cupR);
      let sum = 0;
      active.forEach((d, i) => {
        if (bad) { // 盅扣着看不见：直接摆正到随机落点，保证不叠不歪不出圈
          d.body.position.set(pts[i][0], 0.5, pts[i][1]);
          d.body.velocity.set(0, 0, 0);
          d.body.angularVelocity.set(0, 0, 0);
          sum += faceUpRandom(d.body);
          d.body.sleep();
        } else {
          sum += topFace(d.body).value;
        }
      });
      e.setTotalVal(sum);
      e.prog = 0; e.progTarget = 0; e.dragging = false; e.visOpen = false;
      e.phase = 'cup';
      e.setUI('covered');
    };

    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      e.phaseT += dt;
      if (e.phase === 'drop') {
        const k = Math.min(1, e.phaseT / 0.32);
        const ease = 1 - Math.pow(1 - k, 3);
        e.applyCup(0);
        e.cupGroup.position.y += 6.5 * (1 - ease);
        if (k >= 1) startShake();
      } else if (e.phase === 'shake') {
        // 只竖直砸 + 微幅平移（0.08 < 边界余量 0.12），骰子再乱撞也碰不到盅壁
        e.applyCup(0);
        e.cupGroup.position.y += Math.abs(Math.sin(e.phaseT * 13)) * 0.5;
        e.cupGroup.position.x += Math.sin(e.phaseT * 31) * 0.08;
        e.cupGroup.position.z += Math.cos(e.phaseT * 27) * 0.08;
        e.shakeTick -= dt;
        if (e.shakeTick <= 0) {
          e.shakeTick = 0.08;
          e.dice.slice(0, e.count).forEach((d) => {
            const k = 7 + Math.random() * 6; // 力度每拍随机，落点更散
            d.body.wakeUp();
            d.body.velocity.x += (Math.random() - 0.5) * k;
            d.body.velocity.z += (Math.random() - 0.5) * k;
            d.body.velocity.y += Math.random() * 4;
            d.body.angularVelocity.x += (Math.random() - 0.5) * (18 + Math.random() * 18);
            d.body.angularVelocity.y += (Math.random() - 0.5) * (18 + Math.random() * 18);
            d.body.angularVelocity.z += (Math.random() - 0.5) * (18 + Math.random() * 18);
          });
        }
        if (e.phaseT > 1.05) { e.phase = 'settle'; e.phaseT = 0; e.retries = 0; }
      } else if (e.phase === 'settle') {
        const decay = Math.max(0, 1 - e.phaseT / 0.22);
        e.applyCup(0);
        e.cupGroup.position.y += Math.abs(Math.sin(e.phaseT * 13)) * 0.5 * decay;
        e.cupGroup.position.x += Math.sin(e.phaseT * 31) * 0.08 * decay;
        e.cupGroup.position.z += Math.cos(e.phaseT * 27) * 0.08 * decay;
        if (e.phaseT > 0.22) {
          const active = e.dice.slice(0, e.count);
          const still = active.every((d) => d.body.sleepState === 2 || d.body.velocity.length() < 0.08);
          if (still || e.phaseT > 5) {
            // 歪放 / 互叠 / 跑出盅圈 → 轻推重停，最多两回；仍不行就暗中摆正（盖着看不见）
            const bad = active.some((d) =>
              topFace(d.body).up < 0.93 ||
              Math.hypot(d.body.position.x, d.body.position.z) > e.cupR - 0.75 ||
              active.some((o) => o !== d
                && Math.hypot(d.body.position.x - o.body.position.x, d.body.position.z - o.body.position.z) < 1.02
                && Math.abs(d.body.position.y - o.body.position.y) < 1.05));
            if (bad && e.retries < 2) {
              e.retries++;
              e.phaseT = 0.22;
              active.forEach((d) => {
                d.body.wakeUp();
                d.body.velocity.y += 3.4;
                d.body.velocity.x += (Math.random() - 0.5) * 2.6;
                d.body.velocity.z += (Math.random() - 0.5) * 2.6;
                d.body.angularVelocity.x += (Math.random() - 0.5) * 12;
                d.body.angularVelocity.y += (Math.random() - 0.5) * 12;
                d.body.angularVelocity.z += (Math.random() - 0.5) * 12;
              });
            } else {
              finishSettle(active, bad);
            }
          }
        }
      } else if (e.phase === 'cup') {
        if (!e.dragging) {
          const d = e.progTarget - e.prog;
          e.prog += Math.sign(d) * Math.min(Math.abs(d), dt * 3.2);
        }
        e.applyCup(e.prog);
        const vis = e.prog > 0.85;
        if (vis !== e.visOpen) {
          e.visOpen = vis;
          e.setTotalVis(vis);
          if (vis) { ding(); navigator.vibrate && navigator.vibrate(40); }
        }
      } else if (e.phase === 'conceal') { // 开着时再摇：先盖回再摇
        e.prog = Math.max(0, e.prog - dt * 3.4);
        e.applyCup(e.prog);
        const vis = e.prog > 0.85;
        if (vis !== e.visOpen) { e.visOpen = vis; e.setTotalVis(vis); }
        if (e.prog <= 0) startShake();
      }
      e.world.step(1 / 60, dt, 3);
      e.dice.forEach((d) => { d.mesh.position.copy(d.body.position); d.mesh.quaternion.copy(d.body.quaternion); });
      e.renderer.render(e.scene, e.camera);
      e.raf = requestAnimationFrame(tick);
    };

    e.rebuild(e.count);
    tick();

    return () => {
      cancelAnimationFrame(e.raf);
      ro.disconnect();
      e.renderer.dispose();
      mount.removeChild(e.renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const e = eng.current;
    if (!e) return;
    e.rebuild(count);
  }, [count]);

  function roll() {
    const e = eng.current;
    if (!e || (e.phase !== 'idle' && e.phase !== 'cup')) return;
    ensureAudio();
    if (e.phase === 'idle') {
      e.cupGroup.visible = true;
      e.phase = 'drop';
      e.phaseT = 0;
      e.applyCup(0);
      e.cupGroup.position.y += 6.5;
    } else if (e.progTarget === 1 || e.prog > 0) {
      e.phase = 'conceal';
      e.progTarget = 0;
      e.dragging = false;
      e.phaseT = 0;
    } else {
      e.startShake();
    }
  }

  return (
    <div className="app">
      <div ref={mountRef} className="stage3d" />
      <div className="hud">
        <div className="stepper">
          <button onClick={() => setCount(c => Math.max(1, c - 1))} disabled={ui === 'rolling'}>−</button>
          <b>{count}</b>
          <button onClick={() => setCount(c => Math.min(9, c + 1))} disabled={ui === 'rolling'}>＋</button>
          <span>骰子</span>
        </div>
        <button className="snd" onClick={() => setSound(s => !s)}>{sound ? '🔊' : '🔇'}</button>
      </div>
      {total !== null && <div className={`total ${showTotal ? 'on' : ''}`}>{total} 点</div>}
      {ui === 'covered' && <div className="hint">↑ 上划开盅</div>}
      {ui === 'open' && <div className="hint">↓ 下划盖上</div>}
      <button className={`roll ${ui === 'rolling' ? 'busy' : ''}`} onClick={roll} disabled={ui === 'rolling'}>
        {ui === 'rolling' ? '摇骰中…' : '摇'}
      </button>
    </div>
  );
}
