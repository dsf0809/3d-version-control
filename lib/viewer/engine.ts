import { applyComparisonVisibility, defaultComparisonVisibility, type ComparisonVisibility } from './comparison-visibility';
import type { Model } from '../cad/model';
import { createRenderScheduler } from './render-scheduler';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  resizeCamera,
  fitCameraDistance,
  anchorCamera,
} from '../viewer-camera';
import type { Compiled, Comparison } from '../cad/compile';
import type { FeatureChange } from '../cad/changes';
export function createViewer(
  host: HTMLElement,
  isFocused: () => boolean,
  setError: (message: string) => void,
  onSelectFeature?: (id: string) => void,
) {
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
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.52,
    metalness: 0.06,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  const diffGroup = new THREE.Group();
  scene.add(diffGroup);
  let comparisonVisibility = { ...defaultComparisonVisibility };
  const selection = new THREE.Group();
  scene.add(selection);
  const clearDiff = () => {
    for (const child of [...diffGroup.children]) {
      const m = child as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      diffGroup.remove(m);
    }
  };
  const scheduler = createRenderScheduler(
    () => {
      const moving = controls.update();
      renderer.render(scene, camera);
      return moving;
    },
    requestAnimationFrame,
    cancelAnimationFrame,
  );
  const invalidate = scheduler.invalidate;
  controls.addEventListener('change', invalidate);
  let hasGeometry = false;
  let radius = 85;
  const center = new THREE.Vector3(0, 0, 13);
  const fit = () => {
    const distance = fitCameraDistance(camera, radius);
    camera.position
      .copy(center)
      .add(
        new THREE.Vector3(1, -1.4, 1.15).normalize().multiplyScalar(distance),
      );
    controls.target.copy(center);
    controls.update();
    invalidate();
  };
  let currentGeometry: Compiled | null = null;
  let appearance: Model | null = null;
  const paint = () => {
    if (!currentGeometry) return;
    const g = currentGeometry,
      values = new Float32Array(g.positions.length);
    const colors = new Map(
      appearance?.operations.map((o) => [
        o.id,
        new THREE.Color(o.color || '#778ee0'),
      ]) || [],
    );
    for (let triangle = 0; triangle < g.positions.length / 9; triangle++) {
      const id = g.featureIds?.[g.owners?.[triangle] || 0];
      const color = colors.get(id) || new THREE.Color('#778ee0');
      for (let vertex = 0; vertex < 3; vertex++)
        color.toArray(values, triangle * 9 + vertex * 3);
    }
    mesh.geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
    invalidate();
  };
  const raycaster = new THREE.Raycaster();
  let pointerStart: { x: number; y: number } | null = null;
  const down = (event: PointerEvent) => {
    pointerStart = { x: event.clientX, y: event.clientY };
  };
  const up = (event: PointerEvent) => {
    if (
      !pointerStart ||
      Math.hypot(
        event.clientX - pointerStart.x,
        event.clientY - pointerStart.y,
      ) > 4
    )
      return;
    pointerStart = null;
    if (!mesh.visible || !currentGeometry) return;
    const rect = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    );
    const hit = raycaster.intersectObject(mesh)[0];
    if (hit?.faceIndex == null) return;
    const id =
      currentGeometry.featureIds?.[
        currentGeometry.owners?.[hit.faceIndex] || 0
      ];
    if (id) onSelectFeature?.(id);
  };
  renderer.domElement.addEventListener('pointerdown', down);
  renderer.domElement.addEventListener('pointerup', up);
  const api = {
    visibility: (value: ComparisonVisibility) => {
      comparisonVisibility = { ...value };
      applyComparisonVisibility([...diffGroup.children, ...selection.children], comparisonVisibility);
      invalidate();
    },
    appearance: (model: Model) => {
      appearance = model;
      paint();
    },
    highlight: (change: FeatureChange | null) => {
      invalidate();
      for (const child of [...selection.children]) {
        const line = child as THREE.LineSegments;
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
        selection.remove(line);
      }
      if (!change) return;
      for (const [feature, color] of [
        [change.before, 0xe55a65],
        [change.after, 0x28b578],
      ] as const) {
        if (!feature) continue;
        const box = new THREE.BoxGeometry(...feature.size);
        const line = new THREE.LineSegments(
          new THREE.EdgesGeometry(box),
          new THREE.LineBasicMaterial({
            color,
            depthTest: false,
            transparent: true,
            opacity: 1,
          }),
        );
        box.dispose();
        line.position.set(...feature.position);
        line.rotation.set(
          ...(feature.rotation.map(THREE.MathUtils.degToRad) as [
            number,
            number,
            number,
          ]),
          'ZYX',
        );
        line.name = color === 0xe55a65 ? 'removed' : 'added';
        applyComparisonVisibility([line], comparisonVisibility);
        line.renderOrder = 10;
        selection.add(line);
      }
    },
    set: (g: Compiled, c: Comparison | null) => {
      currentGeometry = g;
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
          const layer = new THREE.Mesh(geo, mat);
          layer.name = key;
          applyComparisonVisibility([layer], comparisonVisibility);
          diffGroup.add(layer);
        }
      }
      const b = new THREE.BufferGeometry();
      b.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
      b.computeVertexNormals();
      b.computeBoundingBox();
      b.computeBoundingSphere();
      mesh.geometry.dispose();
      mesh.geometry = b;
      paint();
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
      if (!hasGeometry) {
        fit();
        hasGeometry = true;
      }
      invalidate();
    },
    fit,
    grid: () => {
      gridHelper.visible = !gridHelper.visible;
      invalidate();
    },
    wire: () => {
      material.wireframe = !material.wireframe;
      invalidate();
      diffGroup.children.forEach((child) => {
        (
          (child as THREE.Mesh).material as THREE.MeshStandardMaterial
        ).wireframe = material.wireframe;
      });
    },
  };
  let viewportHeight = 0;
  let normalCenter: { x: number; y: number } | null = null;
  const resize = () => {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    invalidate();
    resizeCamera(camera, w, h, viewportHeight);
    viewportHeight = h;
    const bounds = host.getBoundingClientRect();
    const panel =
      host.closest('.viewer-panel')?.getBoundingClientRect() ?? bounds;
    const center = {
      x: bounds.left - panel.left + w / 2,
      y: bounds.top - panel.top + h / 2,
    };
    const isFullscreen =
      document.fullscreenElement ===
      host.closest('.model-stage, .viewer-panel');
    if (isFullscreen) {
      anchorCamera(camera, w, h, 0, 0);
    } else {
      if (!isFocused() || !normalCenter) normalCenter = center;
      anchorCamera(
        camera,
        w,
        h,
        center.x - normalCenter.x,
        center.y - normalCenter.y,
      );
    }
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  fit();
  const lost = (e: Event) => {
    e.preventDefault();
    setError(
      'The 3D connection was interrupted. Reload to restore the viewer.',
    );
  };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  const dispose = () => {
    scheduler.dispose();
    renderer.domElement.removeEventListener('pointerdown', down);
    renderer.domElement.removeEventListener('pointerup', up);
    renderer.domElement.removeEventListener('webglcontextlost', lost);
    controls.removeEventListener('change', invalidate);
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
  };
  return {
    ...api,
    dispose,
    view: () => ({
      position: camera.position.toArray(),
      target: controls.target.toArray(),
      zoom: camera.zoom,
      projection: camera.projectionMatrix.toArray(),
    }),
  };
}
