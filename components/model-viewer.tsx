'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Compiled, Comparison } from '@/lib/cad/compile';
import { Focus, Grid2X2, Box } from 'lucide-react';
export default function ModelViewer({
  geometry,
  comparison,
}: {
  geometry: Compiled | null;
  comparison: Comparison | null;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const api = useRef<{
    set: (g: Compiled, c: Comparison | null) => void;
    fit: () => void;
    grid: () => void;
    wire: () => void;
  } | null>(null);
  const [error, setError] = useState('');
  const [grid, setGrid] = useState(true);
  const [wire, setWire] = useState(false);
  useEffect(() => {
    const host = mount.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError(
        '3D rendering needs WebGL. Try a browser with hardware acceleration enabled.',
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xedf0f4, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D model. Drag to orbit, scroll to zoom.',
    );
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#edf0f4');
    scene.fog = new THREE.Fog('#edf0f4', 700, 1800);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 4000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 2;
    controls.maxDistance = 2200;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x778598, 2.8));
    const light = new THREE.DirectionalLight(0xffffff, 3.3);
    light.position.set(-150, -200, 350);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    Object.assign(light.shadow.camera, {
      left: -400,
      right: 400,
      top: 400,
      bottom: -400,
      near: 1,
      far: 1500,
    });
    light.shadow.bias = -0.001;
    scene.add(light);
    const fill = new THREE.DirectionalLight(0xc7dbff, 1.5);
    fill.position.set(100, 100, 60);
    scene.add(fill);
    const gridHelper = new THREE.GridHelper(1600, 160, 0xc5ccd7, 0xdce1e8);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.z = -0.3;
    scene.add(gridHelper);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.ShadowMaterial({ opacity: 0.1 }),
    );
    floor.position.z = -0.4;
    floor.receiveShadow = true;
    scene.add(floor);
    const material = new THREE.MeshStandardMaterial({
      color: 0x778ee0,
      roughness: 0.52,
      metalness: 0.06,
    });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const diffGroup = new THREE.Group();
    scene.add(diffGroup);
    const clearDiff = () => {
      for (const child of [...diffGroup.children]) {
        const m = child as THREE.Mesh;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        diffGroup.remove(m);
      }
    };
    let radius = 85;
    const center = new THREE.Vector3(0, 0, 13);
    const fit = () => {
      const aspect = Math.min(camera.aspect, 1);
      const distance =
        ((radius / Math.sin(THREE.MathUtils.degToRad(18))) * 1.05) / aspect;
      camera.position
        .copy(center)
        .add(
          new THREE.Vector3(1, -1.4, 1.15).normalize().multiplyScalar(distance),
        );
      controls.target.copy(center);
      controls.update();
    };
    api.current = {
      set: (g, c) => {
        clearDiff();
        mesh.visible = !c;
        if (c) {
          for (const key of ['unchanged', 'added', 'removed'] as const) {
            if (!c[key].length) continue;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(c[key], 3));
            geo.computeVertexNormals();
            const mat = new THREE.MeshStandardMaterial({
              color:
                key === 'added'
                  ? 0x28b578
                  : key === 'removed'
                    ? 0xe55a65
                    : 0x969eaa,
              roughness: 0.7,
              transparent: key === 'unchanged',
              opacity: key === 'unchanged' ? 0.45 : 1,
              depthWrite: key !== 'unchanged',
              wireframe: material.wireframe,
              polygonOffset: key !== 'unchanged',
              polygonOffsetFactor: -1,
            });
            diffGroup.add(new THREE.Mesh(geo, mat));
          }
        }
        const b = new THREE.BufferGeometry();
        b.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
        b.computeVertexNormals();
        b.computeBoundingBox();
        b.computeBoundingSphere();
        mesh.geometry.dispose();
        mesh.geometry = b;
        const box = b.boundingBox!;
        box.getCenter(center);
        radius = Math.max(5, b.boundingSphere!.radius);
        if (c) {
          const combined = new THREE.Box3().setFromObject(diffGroup);
          if (!combined.isEmpty()) {
            combined.getCenter(center);
            radius = Math.max(
              5,
              combined.getBoundingSphere(new THREE.Sphere()).radius,
            );
          }
        }
        floor.position.z = box.min.z - 0.4;
        gridHelper.position.z = box.min.z - 0.3;
        fit();
      },
      fit,
      grid: () => {
        gridHelper.visible = !gridHelper.visible;
      },
      wire: () => {
        material.wireframe = !material.wireframe;
        diffGroup.children.forEach((child) => {
          (
            (child as THREE.Mesh).material as THREE.MeshStandardMaterial
          ).wireframe = material.wireframe;
        });
      },
    };
    const resize = () => {
      const w = host.clientWidth,
        h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    fit();
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
    const lost = (e: Event) => {
      e.preventDefault();
      setError(
        'The 3D connection was interrupted. Reload to restore the viewer.',
      );
    };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, []);
  useEffect(() => {
    if (geometry) api.current?.set(geometry, comparison);
  }, [geometry, comparison]);
  return (
    <>
      <div ref={mount} className="view-canvas" />
      {error && (
        <div role="alert" className="viewer-error">
          {error}
        </div>
      )}
      <div className="view-tools">
        <button
          className="quiet tool"
          title="Fit model"
          aria-label="Fit model"
          onClick={() => api.current?.fit()}
        >
          <Focus size={17} />
        </button>
        <button
          className={`quiet tool ${grid ? 'active' : ''}`}
          title="Toggle grid"
          aria-label="Toggle grid"
          aria-pressed={grid}
          onClick={() => {
            api.current?.grid();
            setGrid(!grid);
          }}
        >
          <Grid2X2 size={17} />
        </button>
        <button
          className={`quiet tool ${wire ? 'active' : ''}`}
          title="Toggle wireframe"
          aria-label="Toggle wireframe"
          aria-pressed={wire}
          onClick={() => {
            api.current?.wire();
            setWire(!wire);
          }}
        >
          <Box size={17} />
        </button>
      </div>
    </>
  );
}
