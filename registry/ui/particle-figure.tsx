"use client";

import * as React from "react";

import type * as THREE from "three";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFigureStage,
  loadFigureRuntime,
  type FigurePreset,
  type FigureRuntime,
  type FigureStage,
} from "@/registry/lib/figure";
import { resolveColor } from "@/registry/lib/paint";
import { djb2, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type ParticleFigureProps = {
  /** Which built-in figure to show; ignored once `src` is set. @default "knot" */
  preset?: FigurePreset;
  /** A GLB/glTF, SVG, or raster image URL, sniffed from its bytes — overrides `preset`. */
  src?: string;
  /** Extra multiplier over the figure's normalised fit. @default 1 */
  scale?: number;
  /** Particles sampled across the surface, weighted by triangle area. @default 6000 */
  count?: number;
  /** Point sprite size, in world units. @default 0.03 */
  size?: number;
  /** Particle colour, resolved through the real cascade so tokens work. CSS. @default "var(--primary)" */
  color?: string;
  /** Cursor scatter strength — also the radius of its influence around the pointer, in the figure's normalised units. @default 0.9 */
  push?: number;
  /** Tangential swirl strength inside the push radius. @default 0.4 */
  swirl?: number;
  /** Pull back toward each particle's sampled home position, every frame. @default 0.08 */
  spring?: number;
  /** Drag to orbit the camera around the figure. Forced off under reduced motion. @default true */
  orbit?: boolean;
  /** Float and gently rock the figure at rest. Forced off under reduced motion. @default true */
  idle?: boolean;
  className?: string;
  /** Rendered under the canvas as a caption slot. */
  children?: React.ReactNode;
  /** Host height in px. @default 360 */
  height?: number;
};

// --------------------------------------------------------------------------
// MeshSurfaceSampler — dynamically imported, so it needs its own structural
// type: the installed @types/three definition doesn't declare
// `setRandomGenerator` even though the shipped addon implements it.
// --------------------------------------------------------------------------

type SurfaceSampler = {
  distribution: Float32Array | null;
  build(): SurfaceSampler;
  sample(target: THREE.Vector3): SurfaceSampler;
  setRandomGenerator(randomFn: () => number): SurfaceSampler;
};

type SurfaceSamplerCtor = new (mesh: THREE.Mesh) => SurfaceSampler;

/** Every Mesh under `object`, presets included (a preset's own root is a Mesh). */
function collectMeshes(object: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  object.traverse((child) => {
    const candidate = child as unknown as Partial<THREE.Mesh>;
    if (candidate.isMesh) meshes.push(child as THREE.Mesh);
  });
  return meshes;
}

/** Splits `total` points across meshes proportional to `areas`, correcting rounding drift so the sum always equals `total` exactly. */
function allocateCounts(areas: number[], total: number): number[] {
  const totalArea = areas.reduce((sum, area) => sum + area, 0) || 1;
  const counts = areas.map((area) =>
    Math.max(0, Math.round((area / totalArea) * total)),
  );
  let sum = counts.reduce((a, b) => a + b, 0);
  let cursor = 0;
  while (sum !== total && counts.length > 0) {
    const index = cursor % counts.length;
    if (sum < total) {
      counts[index] = (counts[index] ?? 0) + 1;
      sum += 1;
    } else if ((counts[index] ?? 0) > 0) {
      counts[index] = (counts[index] ?? 0) - 1;
      sum -= 1;
    }
    cursor += 1;
  }
  return counts;
}

/**
 * Samples `count` points across every mesh under `object`'s surface,
 * proportional to each mesh's share of the total triangle area (a single
 * mesh gets area-weighted sampling for free from `MeshSurfaceSampler`).
 * Every sample is converted from its mesh's local space into `object`'s own
 * local space — so the result is unaffected by `object`'s current position,
 * rotation, or scale and can be re-transformed by them every frame. `rng`
 * drives every sampler, in mesh order, so the whole cloud is deterministic.
 */
function sampleSurfacePoints(
  THREE: FigureRuntime["THREE"],
  SamplerCtor: SurfaceSamplerCtor,
  object: THREE.Object3D,
  count: number,
  rng: () => number,
): Float32Array {
  const meshes = collectMeshes(object);
  const total = Math.max(0, Math.floor(count));
  if (meshes.length === 0 || total === 0) return new Float32Array(0);

  object.updateWorldMatrix(true, true);
  const rootInverse = new THREE.Matrix4().copy(object.matrixWorld).invert();

  const samplers = meshes.map((mesh) =>
    new SamplerCtor(mesh).setRandomGenerator(rng).build(),
  );
  const areas = samplers.map((sampler) => {
    const dist = sampler.distribution;
    return dist && dist.length > 0 ? (dist[dist.length - 1] ?? 0) : 0;
  });
  const counts = allocateCounts(areas, total);

  const positions = new Float32Array(total * 3);
  const tmp = new THREE.Vector3();
  const localToRoot = new THREE.Matrix4();
  let offset = 0;
  for (let m = 0; m < meshes.length; m += 1) {
    const mesh = meshes[m];
    const sampler = samplers[m];
    const n = counts[m] ?? 0;
    if (!mesh || !sampler || n <= 0) continue;
    localToRoot.multiplyMatrices(rootInverse, mesh.matrixWorld);
    for (let s = 0; s < n; s += 1) {
      sampler.sample(tmp);
      tmp.applyMatrix4(localToRoot);
      positions[offset] = tmp.x;
      positions[offset + 1] = tmp.y;
      positions[offset + 2] = tmp.z;
      offset += 3;
    }
  }
  return positions;
}

/** A soft round sprite — a radial gradient, white fading to transparent — so points read as dots instead of squares. */
function buildSpriteTexture(
  THREE: FigureRuntime["THREE"],
): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.9)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * A three.js figure — a torus knot by default — resampled onto its own
 * surface as a cloud of points: thousands of particles placed once with
 * `MeshSurfaceSampler`, weighted by triangle area and driven by a seeded
 * random generator, so the same preset (or `src`) lands the same particles
 * on every visit. three, and the sampler addon, both load lazily after
 * mount — no page pays for either until a figure actually renders. Move the
 * cursor over the render and nearby particles scatter and swirl away from
 * it, springing back to their sampled position once it moves on; drag to
 * orbit the camera around the whole cloud. The solid mesh itself stays
 * hidden the entire time — only its surface sample is ever drawn.
 * Reduced motion: one still frame renders the particles at their sampled
 * positions, orbit and idle are both off, and the cursor applies no force.
 */
export function ParticleFigure({
  preset = "knot",
  src,
  scale = 1,
  count = 6000,
  size = 0.03,
  color = "var(--primary)",
  push = 0.9,
  swirl = 0.4,
  spring = 0.08,
  orbit = true,
  idle = true,
  className,
  children,
  height = 360,
}: ParticleFigureProps) {
  const motionSafe = useMotionSafe();
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    setReady(false);
    let disposed = false;
    let stage: FigureStage | null = null;
    let points: THREE.Points<
      THREE.BufferGeometry,
      THREE.PointsMaterial
    > | null = null;
    let pointsGeometry: THREE.BufferGeometry | null = null;
    let pointsMaterial: THREE.PointsMaterial | null = null;
    let spriteTexture: THREE.CanvasTexture | null = null;
    let positionAttribute: THREE.BufferAttribute | null = null;
    let homePositions = new Float32Array(0);
    let simPositions = new Float32Array(0);
    let velocities = new Float32Array(0);
    let pointCount = 0;
    let centreTmp: THREE.Vector3 | null = null;
    let cursorTmp: THREE.Vector3 | null = null;
    let axisTmp: THREE.Vector3 | null = null;
    let invQuat: THREE.Quaternion | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let raf = 0;
    let last: number | null = null;
    let inView = false;
    let hasPointer = false;
    const pointerNDC = { x: 0, y: 0 };

    const still = !motionSafe;

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(rect.width, 1);
      const heightPx = Math.max(rect.height, 1);
      pointerNDC.x = ((event.clientX - rect.left) / width) * 2 - 1;
      pointerNDC.y = -(((event.clientY - rect.top) / heightPx) * 2 - 1);
      hasPointer = true;
    };

    const onPointerLeave = () => {
      hasPointer = false;
    };

    const syncPointsTransform = () => {
      if (!stage || !points) return;
      points.position.copy(stage.object.position);
      points.rotation.copy(stage.object.rotation);
      points.scale.copy(stage.object.scale);
    };

    // The cursor's screen position, projected onto the plane through the
    // object's centre parallel to the camera, then converted into the
    // points object's own local space — the space `pos`/`home`/`vel` live
    // in — so the simulation stays correct while the cloud idles or orbits.
    const computeCursorLocal = (): THREE.Vector3 | null => {
      if (!stage || !points || !centreTmp || !cursorTmp) return null;
      stage.object.getWorldPosition(centreTmp);
      centreTmp.project(stage.camera);
      cursorTmp.set(pointerNDC.x, pointerNDC.y, centreTmp.z);
      cursorTmp.unproject(stage.camera);
      points.worldToLocal(cursorTmp);
      return cursorTmp;
    };

    // The camera's view direction, rotated into the same local space as the
    // cursor above, used as the axis the swirl force turns particles around.
    const computeSwirlAxisLocal = (): THREE.Vector3 | null => {
      if (!stage || !points || !axisTmp || !invQuat) return null;
      stage.camera.getWorldDirection(axisTmp);
      invQuat.copy(points.quaternion).invert();
      axisTmp.applyQuaternion(invQuat);
      return axisTmp;
    };

    const stepParticles = (
      cursor: THREE.Vector3 | null,
      axis: THREE.Vector3 | null,
    ) => {
      if (!positionAttribute) return;
      const ax = axis?.x ?? 0;
      const ay = axis?.y ?? 0;
      const az = axis?.z ?? 0;
      for (let i = 0; i < pointCount; i += 1) {
        const ix = i * 3;
        const iy = ix + 1;
        const iz = ix + 2;
        let px = simPositions[ix] ?? 0;
        let py = simPositions[iy] ?? 0;
        let pz = simPositions[iz] ?? 0;
        let vx = velocities[ix] ?? 0;
        let vy = velocities[iy] ?? 0;
        let vz = velocities[iz] ?? 0;

        if (cursor) {
          const dx = px - cursor.x;
          const dy = py - cursor.y;
          const dz = pz - cursor.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > 1e-4 && dist < push) {
            const falloff = 1 - dist / push;
            const nx = dx / dist;
            const ny = dy / dist;
            const nz = dz / dist;
            const pushForce = push * falloff;
            vx += nx * pushForce;
            vy += ny * pushForce;
            vz += nz * pushForce;

            const tx = ay * nz - az * ny;
            const ty = az * nx - ax * nz;
            const tz = ax * ny - ay * nx;
            const swirlForce = swirl * falloff;
            vx += tx * swirlForce;
            vy += ty * swirlForce;
            vz += tz * swirlForce;
          }
        }

        const hx = homePositions[ix] ?? 0;
        const hy = homePositions[iy] ?? 0;
        const hz = homePositions[iz] ?? 0;
        vx += (hx - px) * spring;
        vy += (hy - py) * spring;
        vz += (hz - pz) * spring;

        vx *= 0.86;
        vy *= 0.86;
        vz *= 0.86;

        px += vx;
        py += vy;
        pz += vz;

        simPositions[ix] = px;
        simPositions[iy] = py;
        simPositions[iz] = pz;
        velocities[ix] = vx;
        velocities[iy] = vy;
        velocities[iz] = vz;
      }
      positionAttribute.needsUpdate = true;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!stage || !points) return;
      stage.step(dt);
      syncPointsTransform();
      points.updateMatrixWorld();
      const cursor = hasPointer ? computeCursorLocal() : null;
      const axis = cursor ? computeSwirlAxisLocal() : null;
      stepParticles(cursor, axis);
      stage.renderer.setRenderTarget(null);
      stage.renderer.render(stage.scene, stage.camera);
    };

    const syncLoop = () => {
      const shouldRun = inView && !document.hidden;
      if (shouldRun && raf === 0) {
        last = null;
        raf = requestAnimationFrame(tick);
      } else if (!shouldRun && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    void (async () => {
      const runtime = await loadFigureRuntime();
      if (disposed) return;

      const createdStage = await createFigureStage(canvas, runtime, {
        source: { preset, src, scale },
        orbit: orbit && !still,
        idle: idle && !still,
      });
      if (disposed) {
        createdStage.dispose();
        return;
      }
      createdStage.object.visible = false;

      const samplerModule =
        await import("three/addons/math/MeshSurfaceSampler.js");
      if (disposed) {
        createdStage.dispose();
        return;
      }
      const SamplerCtor =
        samplerModule.MeshSurfaceSampler as unknown as SurfaceSamplerCtor;

      const rng = seeded(djb2(`${preset}|${src ?? ""}`));
      const sampled = sampleSurfacePoints(
        runtime.THREE,
        SamplerCtor,
        createdStage.object,
        count,
        rng,
      );

      stage = createdStage;
      centreTmp = new runtime.THREE.Vector3();
      cursorTmp = new runtime.THREE.Vector3();
      axisTmp = new runtime.THREE.Vector3();
      invQuat = new runtime.THREE.Quaternion();

      // Fresh ArrayBuffer-backed copies: the sampler's buffer type is wider.
      homePositions = new Float32Array(sampled);
      simPositions = new Float32Array(sampled);
      velocities = new Float32Array(sampled.length);
      pointCount = sampled.length / 3;

      const geometry = new runtime.THREE.BufferGeometry();
      const attribute = new runtime.THREE.BufferAttribute(simPositions, 3);
      attribute.setUsage(runtime.THREE.DynamicDrawUsage);
      geometry.setAttribute("position", attribute);
      positionAttribute = attribute;
      pointsGeometry = geometry;

      const texture = buildSpriteTexture(runtime.THREE);
      spriteTexture = texture;

      const ink = resolveColor(color, host);
      const material = new runtime.THREE.PointsMaterial({
        size,
        sizeAttenuation: true,
        color: new runtime.THREE.Color(ink[0], ink[1], ink[2]),
        map: texture,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        alphaTest: 0.3,
      });
      pointsMaterial = material;

      const pointsObject = new runtime.THREE.Points(geometry, material);
      pointsObject.frustumCulled = false;
      createdStage.scene.add(pointsObject);
      points = pointsObject;
      syncPointsTransform();

      const rect = host.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, rect.width);
      const heightPx = Math.max(1, rect.height);
      stage.resize(width, heightPx, pixelRatio);

      const drawOnce = () => {
        if (!stage) return;
        stage.step(0);
        syncPointsTransform();
        if (!still) stepParticles(null, null);
        stage.renderer.setRenderTarget(null);
        stage.renderer.render(stage.scene, stage.camera);
      };

      if (still) {
        drawOnce();
        setReady(true);
        return;
      }

      resizeObserver = new ResizeObserver(() => {
        const r = host.getBoundingClientRect();
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        stage?.resize(Math.max(1, r.width), Math.max(1, r.height), ratio);
      });
      resizeObserver.observe(host);

      intersectionObserver = new IntersectionObserver((entries) => {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) inView = lastEntry.isIntersecting;
        syncLoop();
      });
      intersectionObserver.observe(host);
      document.addEventListener("visibilitychange", syncLoop);

      canvas.addEventListener("pointermove", onPointerMove, { passive: true });
      canvas.addEventListener("pointerleave", onPointerLeave, {
        passive: true,
      });

      drawOnce();
      setReady(true);
    })();

    return () => {
      disposed = true;
      if (raf !== 0) cancelAnimationFrame(raf);
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", syncLoop);
      resizeObserver?.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      if (points && stage) stage.scene.remove(points);
      pointsGeometry?.dispose();
      pointsMaterial?.dispose();
      spriteTexture?.dispose();
      stage?.dispose();
    };
  }, [
    preset,
    src,
    scale,
    count,
    size,
    color,
    push,
    swirl,
    spring,
    orbit,
    idle,
    motionSafe,
  ]);

  return (
    <div
      ref={hostRef}
      data-figure-host
      data-figure-ready={ready ? "true" : undefined}
      className={cn("relative overflow-hidden rounded-4", className)}
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        data-effect-canvas="particle-figure"
        className="block h-full w-full"
      />
      {children && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 text-center">
          {children}
        </div>
      )}
    </div>
  );
}
