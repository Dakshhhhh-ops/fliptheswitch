import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { calm } from '../lib/motion.js';

// A slowly turning 3D lattice. ML-KEM and ML-DSA are lattice-based, so the
// hero is the structure the migration moves to. The share of points lit in
// lime is the share of findings shipped.
const NX = 20, NY = 11, NZ = 7, GAP = 1.05;
const LIME = new THREE.Color('#c8ff3d');
const DIM = new THREE.Color('#6b6862');
const MID = new THREE.Color('#b9b5ab');

function seeded(n) {
  let s = 1234567;
  return Array.from({ length: n }, () => ((s = (s * 16807) % 2147483647) / 2147483647));
}

export default function Lattice({ progress = 0 }) {
  const host = useRef(null);
  const api = useRef(null);

  useEffect(() => {
    const el = host.current;
    // With no animation loop, keep the one frame we draw instead of letting it clear.
    const still = calm();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: still });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a0b, 0.038);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 17);

    const group = new THREE.Group();
    scene.add(group);

    const count = NX * NY * NZ;
    const pos = new Float32Array(count * 3);
    const idx = (x, y, z) => x + NX * (y + NY * z);
    for (let z = 0; z < NZ; z++)
      for (let y = 0; y < NY; y++)
        for (let x = 0; x < NX; x++) {
          const i = idx(x, y, z) * 3;
          pos[i] = (x - (NX - 1) / 2) * GAP;
          pos[i + 1] = (y - (NY - 1) / 2) * GAP;
          pos[i + 2] = (z - (NZ - 1) / 2) * GAP;
        }

    const order = seeded(count);
    const colors = new Float32Array(count * 3);
    const pointsGeo = new THREE.BufferGeometry();
    pointsGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pointsGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(
      pointsGeo,
      new THREE.PointsMaterial({ size: 0.09, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95 }),
    );
    group.add(points);

    // Edges to the next point along each axis.
    const edges = [];
    for (let z = 0; z < NZ; z++)
      for (let y = 0; y < NY; y++)
        for (let x = 0; x < NX; x++) {
          const a = idx(x, y, z);
          if (x + 1 < NX) edges.push(a, idx(x + 1, y, z));
          if (y + 1 < NY) edges.push(a, idx(x, y + 1, z));
          if (z + 1 < NZ) edges.push(a, idx(x, y, z + 1));
        }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lineGeo.setIndex(edges);
    const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xf2efe8, transparent: true, opacity: 0.085 }));
    group.add(lines);

    const paint = (p) => {
      for (let i = 0; i < count; i++) {
        const c = order[i] < p ? LIME : order[i] < p + 0.18 ? MID : DIM;
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
      pointsGeo.attributes.color.needsUpdate = true;
    };
    paint(progress);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.position.z = w < 700 ? 24 : 17;
      group.position.x = w < 960 ? 0 : 4.2;
      camera.updateProjectionMatrix();
      // Resizing clears the canvas; redraw now if nothing else will.
      if (still) renderer.render(scene, camera);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e) => {
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove);

    let frame;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);
    const clock = new THREE.Clock();
    const render = () => {
      const t = clock.getElapsedTime();
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      group.rotation.y = -0.55 + t * 0.045 + mouse.x * 0.28;
      group.rotation.x = 0.32 + Math.sin(t * 0.2) * 0.05 + mouse.y * 0.16;
      group.position.y = Math.sin(t * 0.4) * 0.15;
      renderer.render(scene, camera);
    };
    const loop = () => {
      if (visible) render();
      frame = requestAnimationFrame(loop);
    };
    resize();
    if (still) render();
    else loop();

    api.current = { paint, render: still ? render : null };
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
      pointsGeo.dispose();
      lineGeo.dispose();
      points.material.dispose();
      lines.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    api.current?.paint(progress);
    api.current?.render?.();
  }, [progress]);

  return <div className="lattice" ref={host} aria-hidden="true" />;
}
