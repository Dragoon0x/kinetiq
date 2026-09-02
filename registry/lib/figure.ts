/**
 * The lazy three.js runtime shared by every figure in the `effects` wing —
 * a scene, a camera, studio lighting, and a render target that a figure
 * component post-processes into whatever it wants (ASCII glyphs, halftone,
 * outline). `three` is never imported at module scope: `loadFigureRuntime`
 * pulls the library and its addons in with a dynamic `import()` the first
 * time a figure actually mounts, caches the result, and every later call —
 * from this figure or the next five — returns the same runtime instead of
 * refetching. That keeps three out of every bundle that never renders a
 * figure, and out of the server bundle entirely, while still giving each
 * figure a single shared vocabulary for loading a source, staging it, and
 * reading its lit render back as a texture.
 */

import type * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { SVGLoader } from "three/addons/loaders/SVGLoader.js";

// --------------------------------------------------------------------------
// Runtime
// --------------------------------------------------------------------------

/** Built-in figure geometries — no asset fetch, always available. */
export type FigurePreset = "knot" | "sphere" | "capsule" | "mark";

/**
 * What a figure renders. `src` may point at a GLB/glTF, an SVG, or a raster
 * image (PNG/JPG/WebP) — the format is sniffed from the fetched bytes, never
 * from the URL's extension. `preset` wins when both are given. `scale`
 * multiplies the normalised fit (every object is centred and sized to the
 * same bounding-sphere radius before `scale` is applied).
 */
export type FigureSource = {
  preset?: FigurePreset;
  src?: string;
  scale?: number;
};

/** The dynamically-imported three modules a figure needs, resolved once and reused. */
export type FigureRuntime = {
  THREE: typeof import("three");
  GLTFLoader: typeof GLTFLoader;
  SVGLoader: typeof SVGLoader;
  OrbitControls: typeof OrbitControls;
};

let runtimePromise: Promise<FigureRuntime> | null = null;

/**
 * Dynamically imports three plus the GLTF, SVG, and orbit-control addons
 * this wing needs, caching the settled promise at module scope. Every
 * caller — the first figure on the page and every figure after it — awaits
 * the same import, so the chunk is fetched once no matter how many figures
 * mount.
 */
export function loadFigureRuntime(): Promise<FigureRuntime> {
  if (!runtimePromise) {
    runtimePromise = Promise.all([
      import("three"),
      import("three/addons/loaders/GLTFLoader.js"),
      import("three/addons/loaders/SVGLoader.js"),
      import("three/addons/controls/OrbitControls.js"),
    ]).then(([THREE, gltf, svg, orbit]) => ({
      THREE,
      GLTFLoader: gltf.GLTFLoader,
      SVGLoader: svg.SVGLoader,
      OrbitControls: orbit.OrbitControls,
    }));
  }
  return runtimePromise;
}

// --------------------------------------------------------------------------
// Object loading
// --------------------------------------------------------------------------

const FIGURE_MATERIAL = { color: 0xffffff, roughness: 0.4, metalness: 0.05 };

/** Traces a rounded rectangle into a Shape or Path (a hole), corners clamped so a small box never over-rounds. */
function roundedRectPath(
  target: THREE.Shape | THREE.Path,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  target.moveTo(x + r, y);
  target.lineTo(x + width - r, y);
  target.quadraticCurveTo(x + width, y, x + width, y + r);
  target.lineTo(x + width, y + height - r);
  target.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  target.lineTo(x + r, y + height);
  target.quadraticCurveTo(x, y + height, x, y + height - r);
  target.lineTo(x, y + r);
  target.quadraticCurveTo(x, y, x + r, y);
}

/** The `mark` preset: an abstract glyph — a rounded slab with a smaller rounded window punched through it. */
function buildMarkGeometry(
  THREE: FigureRuntime["THREE"],
): THREE.ExtrudeGeometry {
  const outer = new THREE.Shape();
  roundedRectPath(outer, -1, -0.7, 2, 1.4, 0.28);
  const hole = new THREE.Path();
  roundedRectPath(hole, -0.55, -0.32, 1.1, 0.64, 0.16);
  outer.holes.push(hole);
  return new THREE.ExtrudeGeometry(outer, {
    depth: 0.36,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 3,
    curveSegments: 24,
  });
}

function buildPresetObject(
  THREE: FigureRuntime["THREE"],
  preset: FigurePreset,
): THREE.Object3D {
  const geometry =
    preset === "sphere"
      ? new THREE.SphereGeometry(1.2, 96, 64)
      : preset === "capsule"
        ? new THREE.CapsuleGeometry(0.7, 1.2, 12, 32)
        : preset === "mark"
          ? buildMarkGeometry(THREE)
          : new THREE.TorusKnotGeometry(1, 0.32, 220, 32);
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial(FIGURE_MATERIAL),
  );
}

/** A conservative UTF-8 decode used only to sniff for JSON/SVG text markers; a binary payload (already-handled GLB, or a raster image) decodes into bytes that match neither marker, so this never misfires into the wrong loader. */
function sniffText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

function isGlbMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return (
    (bytes[0] ?? 0) === 0x67 &&
    (bytes[1] ?? 0) === 0x6c &&
    (bytes[2] ?? 0) === 0x54 &&
    (bytes[3] ?? 0) === 0x46
  );
}

function buildSvgObject(
  THREE: FigureRuntime["THREE"],
  SVGLoaderCtor: FigureRuntime["SVGLoader"],
  text: string,
): THREE.Object3D {
  const result = new SVGLoaderCtor().parse(text);
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial(FIGURE_MATERIAL);
  for (const path of result.paths) {
    for (const shape of path.toShapes()) {
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 0.2,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.02,
        bevelSegments: 2,
        curveSegments: 16,
      });
      group.add(new THREE.Mesh(geometry, material));
    }
  }
  return group;
}

async function buildImageObject(
  THREE: FigureRuntime["THREE"],
  buffer: ArrayBuffer,
  contentType: string | null,
): Promise<THREE.Object3D> {
  const url = URL.createObjectURL(
    new Blob([buffer], { type: contentType ?? "image/png" }),
  );
  try {
    const texture = await new THREE.TextureLoader().loadAsync(url);
    const image = texture.image as { width?: number; height?: number };
    const aspect = image.width && image.height ? image.width / image.height : 1;
    const width = aspect >= 1 ? 2 * aspect : 2;
    const height = aspect >= 1 ? 2 : 2 / aspect;
    const material = new THREE.MeshStandardMaterial({
      ...FIGURE_MATERIAL,
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadFromSource(
  runtime: FigureRuntime,
  src: string,
): Promise<THREE.Object3D> {
  const {
    THREE,
    GLTFLoader: GLTFLoaderCtor,
    SVGLoader: SVGLoaderCtor,
  } = runtime;
  const response = await fetch(src);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (isGlbMagic(bytes)) {
    const gltf = await new GLTFLoaderCtor().parseAsync(buffer, "");
    return gltf.scene;
  }

  const text = sniffText(bytes);
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") && trimmed.includes('"asset"')) {
    const gltf = await new GLTFLoaderCtor().parseAsync(text, "");
    return gltf.scene;
  }
  if (trimmed.includes("<svg")) {
    return buildSvgObject(THREE, SVGLoaderCtor, text);
  }

  return buildImageObject(THREE, buffer, response.headers.get("content-type"));
}

/** Centres `object` at the origin and scales it so its bounding-sphere radius becomes `1.4 * scale`. */
function normalizeObject(
  THREE: FigureRuntime["THREE"],
  object: THREE.Object3D,
  scale: number,
): void {
  const box = new THREE.Box3().setFromObject(object);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  object.position.sub(sphere.center);
  const radius = sphere.radius > 0 ? sphere.radius : 1;
  object.scale.multiplyScalar((1.4 * scale) / radius);
}

/**
 * Resolves a `FigureSource` into a normalised `Object3D`: a preset built
 * from three primitives, or a fetched `src` sniffed from its bytes (glTF
 * binary or JSON, SVG, else a raster image) and converted into geometry.
 * Every result is centred at the origin and scaled to a common
 * bounding-sphere radius before `source.scale` is applied, so any figure
 * frames the same regardless of what it's showing.
 */
export async function loadFigureObject(
  runtime: FigureRuntime,
  source: FigureSource,
): Promise<THREE.Object3D> {
  const object = source.src
    ? await loadFromSource(runtime, source.src)
    : buildPresetObject(runtime.THREE, source.preset ?? "knot");
  normalizeObject(runtime.THREE, object, source.scale ?? 1);
  return object;
}

// --------------------------------------------------------------------------
// Stage
// --------------------------------------------------------------------------

/**
 * A running figure scene: the loaded object, studio lighting, an optional
 * orbit control, and a render target a figure post-processes instead of
 * drawing straight to the screen. `step`/`render` are separate so a caller
 * can advance the simulation without paying for a draw (or vice versa) when
 * driving its own composited loop.
 */
export type FigureStage = {
  runtime: FigureRuntime;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  object: THREE.Object3D;
  target: THREE.WebGLRenderTarget;
  controls: OrbitControls | null;
  /** Renders the current scene state into `target`. */
  render(): void;
  /** Resizes the renderer, camera, and target to a new canvas size. */
  resize(width: number, height: number, dpr: number): void;
  /** Turns the idle float/rock on or off; `step` is a no-op for motion while off. */
  setIdle(on: boolean): void;
  /** Advances idle motion and orbit damping by `dt` seconds. */
  step(dt: number): void;
  /** Releases every GPU resource this stage allocated: geometries, materials, textures, the target, controls, and the renderer. */
  dispose(): void;
};

function disposeMaterial(material: THREE.Material): void {
  const withMaps = material as unknown as Record<string, unknown>;
  const mapKeys = [
    "map",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "aoMap",
    "emissiveMap",
    "alphaMap",
    "bumpMap",
    "displacementMap",
  ];
  for (const key of mapKeys) {
    const value = withMaps[key];
    if (
      value &&
      typeof value === "object" &&
      "dispose" in value &&
      typeof (value as { dispose: unknown }).dispose === "function"
    ) {
      (value as { dispose: () => void }).dispose();
    }
  }
  material.dispose();
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as unknown as Partial<THREE.Mesh>;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const m of material) disposeMaterial(m);
    } else if (material) {
      disposeMaterial(material);
    }
  });
}

const POST_VERTEX = /* glsl */ `
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Builds one figure's scene: the renderer bound to `canvas`, a fixed studio
 * camera and three-point lighting rig, the object resolved from
 * `options.source`, and — when `options.orbit` is on — drag-to-orbit
 * controls with zoom and pan disabled so the gesture only ever spins the
 * figure in place. Returns once the object has finished loading.
 */
export async function createFigureStage(
  canvas: HTMLCanvasElement,
  runtime: FigureRuntime,
  options: {
    source: FigureSource;
    orbit?: boolean;
    idle?: boolean;
    dprCap?: number;
  },
): Promise<FigureStage> {
  const { THREE, OrbitControls: OrbitControlsCtor } = runtime;
  const { source, orbit = false, idle = false, dprCap = 2 } = options;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0, 5.2);
  camera.lookAt(0, 0, 0);

  const hemi = new THREE.HemisphereLight(0xf5f7ff, 0x22242c, 0.65);
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(-3.2, 4, 5);
  const rim = new THREE.DirectionalLight(0x9fd4ff, 0.55);
  rim.position.set(3.4, 1.2, -4);
  const ambient = new THREE.AmbientLight(0xffffff, 0.12);
  scene.add(hemi, key, rim, ambient);

  const object = await loadFigureObject(runtime, source);
  scene.add(object);

  const controls = orbit ? new OrbitControlsCtor(camera, canvas) : null;
  if (controls) {
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = false;
  }

  const target = new THREE.WebGLRenderTarget(1, 1, {
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });

  let idleOn = idle;
  let clock = 0;

  function render(): void {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
  }

  function resize(width: number, height: number, dpr: number): void {
    const pixelRatio = Math.min(dpr, dprCap);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    target.setSize(
      Math.max(1, Math.round(width * pixelRatio)),
      Math.max(1, Math.round(height * pixelRatio)),
    );
  }

  function setIdle(on: boolean): void {
    idleOn = on;
  }

  function step(dt: number): void {
    if (idleOn) {
      clock += dt;
      object.position.y = Math.sin(clock * 0.9) * 0.06;
      object.rotation.y += dt * 0.25;
      object.rotation.x = Math.sin(clock * 0.6) * 0.05;
    }
    controls?.update();
  }

  function dispose(): void {
    controls?.dispose();
    disposeObject(object);
    target.dispose();
    renderer.dispose();
  }

  return {
    runtime,
    scene,
    camera,
    renderer,
    object,
    target,
    controls,
    render,
    resize,
    setIdle,
    step,
    dispose,
  };
}

/**
 * A fullscreen post pass over a figure stage's render target: a 2×2 quad
 * carrying `fragment` as a GLSL3 `ShaderMaterial`, plus whatever uniforms
 * the caller supplies (the caller is responsible for keeping a `tScene`
 * uniform pointed at the stage's `target.texture` before each `render`).
 * The vertex stage is fixed — it only forwards `vUv` — so a figure never
 * needs to write its own.
 */
export function createPostPass(
  runtime: FigureRuntime,
  fragment: string,
  uniforms: Record<string, THREE.IUniform>,
): {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  material: THREE.ShaderMaterial;
  render(renderer: THREE.WebGLRenderer): void;
  dispose(): void;
} {
  const { THREE } = runtime;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: POST_VERTEX,
    fragmentShader: fragment,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(geometry, material));

  function render(renderer: THREE.WebGLRenderer): void {
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }

  function dispose(): void {
    geometry.dispose();
    material.dispose();
  }

  return { scene, camera, material, render, dispose };
}
