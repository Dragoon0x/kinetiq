"use client";

import * as React from "react";

import {
  FULLSCREEN_VERTEX,
  createEmptyTexture,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type GlassShardsProps = {
  /** Seeded Voronoi shard count, clamped to [4, 64]. @default 28 */
  shards?: number;
  /** Layout seed — the pane breaks the same way every time. @default 7 */
  seed?: number;
  /** Peak tilt toward the pointer, in degrees. @default 10 */
  tilt?: number;
  /** Peak lift toward the viewer, in CSS px. @default 12 */
  lift?: number;
  /** Influence radius around the pointer, in CSS px. @default 220 */
  radius?: number;
  /** Bend and dispersion strength at each shard's tilt. @default 1 */
  refraction?: number;
  /** Crack-line brightness (0..1). @default 0.5 */
  edge?: number;
  /** Crack-line colour, any CSS colour (tokens included). @default "var(--primary)" */
  color?: string;
  /** Fill for the gaps and the ground beneath a lifted shard. Defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform sampler2D u_state;
uniform vec2 u_res;
uniform vec2 u_sites[64];
uniform int u_count;
uniform float u_tiltRange;
uniform float u_liftRange;
uniform float u_refraction;
uniform float u_edge;
uniform vec4 u_color;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// Decodes shard i's sprung state from the 64x1 state texture: tiltX/tiltY
// in R/G (byte-mapped from [-range, range]), lift in B (byte-mapped from
// [0, range]). Sampled at the exact texel centre, so filtering never blends
// neighbouring shards together.
vec3 shardState(int i) {
  float u = (float(i) + 0.5) / 64.0;
  vec4 enc = texture(u_state, vec2(u, 0.5));
  float tiltX = (enc.r - 0.5) * 2.0 * u_tiltRange;
  float tiltY = (enc.g - 0.5) * 2.0 * u_tiltRange;
  float lift = enc.b * u_liftRange;
  return vec3(tiltX, tiltY, lift);
}

void main() {
  vec2 px = v_uv * u_res;

  // Nearest and second-nearest seed sites — the nearest gives the shard id,
  // the gap between the two gives the crack.
  float d1 = 1.0e9;
  float d2 = 1.0e9;
  int id1 = 0;
  int id2 = 0;
  for (int i = 0; i < u_count; i++) {
    vec2 sitePx = u_sites[i] * u_res;
    float d = distance(px, sitePx);
    if (d < d1) {
      d2 = d1;
      id2 = id1;
      d1 = d;
      id1 = i;
    } else if (d < d2) {
      d2 = d;
      id2 = i;
    }
  }

  vec3 stateSelf = shardState(id1);
  vec3 stateOther = shardState(id2);
  vec2 tilt = stateSelf.xy;
  float liftSelf = stateSelf.z;

  // The shard drifts a little outward, away from the pointer, as it lifts —
  // the tilt vector already points toward the pointer, so its negation is
  // the outward direction.
  float tiltLen = length(tilt);
  vec2 tiltDir = tiltLen > 0.001 ? tilt / tiltLen : vec2(0.0);
  vec2 part = -tiltDir * liftSelf * 0.4;
  // A lifted shard also reads as raised toward the viewer: its image slides
  // toward the top-left, the way a raised card catches the light from there.
  vec2 liftShift = vec2(-liftSelf, -liftSelf) * 0.70710678;

  vec2 offset = tilt * u_refraction * 8.0 + part + liftShift;
  vec2 basePx = px + offset;

  vec2 dispDir = length(offset) > 0.001 ? normalize(offset) : vec2(1.0, 0.0);
  float disp = u_refraction * 2.0;
  vec3 color = vec3(
    sampleOver((basePx + dispDir * disp) / u_res).r,
    sampleOver(basePx / u_res).g,
    sampleOver((basePx - dispDir * disp) / u_res).b
  );

  float gap = d2 - d1;
  float crackMask = 1.0 - smoothstep(0.0, 1.5, gap);

  // Where the neighbour has lifted higher than this shard, the ground shows
  // through a thin band on this (the lower, far) side of the seam.
  float raiseOther = max(stateOther.z - liftSelf, 0.0);
  float groundBand = raiseOther * 0.3;
  float groundMask = groundBand > 0.001
    ? 1.0 - smoothstep(0.0, groundBand, gap)
    : 0.0;
  color = mix(color, u_bg.rgb, groundMask);

  // A bright line along every seam.
  color = mix(color, u_color.rgb, crackMask * u_edge * u_color.a);

  // A faint shadow on the lifted shard's own edge.
  float raiseSelf = max(liftSelf - stateOther.z, 0.0);
  float shadow = crackMask * clamp(raiseSelf * 0.15, 0.0, 0.35);
  color *= 1.0 - shadow;

  o_color = vec4(color, 1.0);
}
`;

/** Fixed uniform-array and state-texture width — up to 64 shards, however many `shards` asks for. */
const MAX_SHARDS = 64;
/** A near-square logical grid the seed sites jitter within, independent of the surface's own aspect. */
const SITE_ASPECT = 1.5;
/** Sites are jittered within their cell but held off the very edge so every shard owns real area. */
const SITE_INSET = 0.14;
/** Per-shard spring toward the pointer-derived target. Tuned snappier than warp-grid's cell field — a shard is a small, light thing. */
const SHARD_STIFFNESS = 0.22;
const SHARD_DAMPING = 0.8;
/** Below this, the field reads as settled — the simulation stops rather than idling forever. */
const ENERGY_STOP = 0.05;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clampByte = (value: number): number =>
  Math.max(0, Math.min(255, Math.round(value)));

/**
 * djb2 over a small integer tuple, folded to [0, 1) — the same seeding idiom
 * VoronoiShatter uses for its cell jitter. Deterministic and SSR-safe: no
 * Math.random anywhere near the site layout.
 */
function hash(a: number, b: number, seed: number): number {
  let h = 5381 + seed;
  h = (Math.imul(h, 33) ^ a) >>> 0;
  h = (Math.imul(h, 33) ^ b) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * `count` seed sites laid on a loose near-square grid and jittered by
 * `hash`, in normalised [0,1] surface units — a fixed-size (`MAX_SHARDS`)
 * array with only the first `count` entries meaningful, matching `u_sites`.
 */
function generateSites(count: number, seed: number): Float32Array {
  const sites = new Float32Array(MAX_SHARDS * 2);
  const columns = Math.max(1, Math.round(Math.sqrt(count * SITE_ASPECT)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const cellW = 1 / columns;
  const cellH = 1 / rows;
  for (let i = 0; i < count; i += 1) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const jx = SITE_INSET + hash(col, row, seed * 2 + 1) * (1 - SITE_INSET * 2);
    const jy = SITE_INSET + hash(col, row, seed * 2 + 2) * (1 - SITE_INSET * 2);
    sites[i * 2] = clamp((col + jx) * cellW, 0, 1);
    sites[i * 2 + 1] = clamp((row + jy) * cellH, 0, 1);
  }
  return sites;
}

type ShardField = {
  count: number;
  /** Sprung tilt (toward the pointer) and lift (toward the viewer), plus their velocities — one entry per shard. */
  tiltX: Float32Array;
  tiltY: Float32Array;
  lift: Float32Array;
  tvx: Float32Array;
  tvy: Float32Array;
  lv: Float32Array;
  /** RGBA8, re-encoded from tiltX/tiltY/lift every simulation step; uploaded as-is into the 64x1 state texture. */
  pixels: Uint8Array;
};

function createShardField(count: number): ShardField {
  return {
    count,
    tiltX: new Float32Array(count),
    tiltY: new Float32Array(count),
    lift: new Float32Array(count),
    tvx: new Float32Array(count),
    tvy: new Float32Array(count),
    lv: new Float32Array(count),
    pixels: new Uint8Array(MAX_SHARDS * 4),
  };
}

/**
 * One simulation step: every shard's tilt/lift springs toward a target
 * derived fresh from the current pointer position (within `radius`, tilt
 * toward the pointer scaled by a smoothstep falloff; lift the same way; at
 * rest, both targets are zero). Re-encodes `pixels` from the new state in
 * the same pass, mirroring warp-grid's `integrateField`. Returns the
 * field's energy — velocity plus distance-from-target, maxed over every
 * shard — so the caller knows whether another frame is worth drawing.
 */
function stepShardField(
  field: ShardField,
  sites: Float32Array,
  pointer: { x: number; y: number } | null,
  hostW: number,
  hostH: number,
  radius: number,
  tiltDeg: number,
  liftPx: number,
): number {
  const { count, tiltX, tiltY, lift, tvx, tvy, lv, pixels } = field;
  const tiltRange = tiltDeg > 0 ? tiltDeg : 0.001;
  const liftRange = liftPx > 0 ? liftPx : 0.001;
  let energy = 0;

  for (let i = 0; i < count; i += 1) {
    const sx = (sites[i * 2] ?? 0) * hostW;
    const sy = (sites[i * 2 + 1] ?? 0) * hostH;

    let targetX = 0;
    let targetY = 0;
    let targetLift = 0;
    if (pointer && radius > 0) {
      const dx = pointer.x - sx;
      const dy = pointer.y - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radius) {
        const t = dist / radius;
        const falloff = 1 - t * t * (3 - 2 * t);
        const inv = dist > 0.0001 ? 1 / dist : 0;
        targetX = dx * inv * tiltDeg * falloff;
        targetY = dy * inv * tiltDeg * falloff;
        targetLift = liftPx * falloff;
      }
    }

    const tx0 = tiltX[i] ?? 0;
    const ty0 = tiltY[i] ?? 0;
    const l0 = lift[i] ?? 0;
    const ntvx =
      ((tvx[i] ?? 0) - (tx0 - targetX) * SHARD_STIFFNESS) * SHARD_DAMPING;
    const ntvy =
      ((tvy[i] ?? 0) - (ty0 - targetY) * SHARD_STIFFNESS) * SHARD_DAMPING;
    const nlv =
      ((lv[i] ?? 0) - (l0 - targetLift) * SHARD_STIFFNESS) * SHARD_DAMPING;
    const ntx = clamp(tx0 + ntvx, -tiltDeg, tiltDeg);
    const nty = clamp(ty0 + ntvy, -tiltDeg, tiltDeg);
    const nl = clamp(l0 + nlv, 0, liftPx);

    tvx[i] = ntvx;
    tvy[i] = ntvy;
    lv[i] = nlv;
    tiltX[i] = ntx;
    tiltY[i] = nty;
    lift[i] = nl;

    const shardEnergy =
      Math.abs(ntvx) +
      Math.abs(ntvy) +
      Math.abs(nlv) +
      Math.abs(ntx - targetX) +
      Math.abs(nty - targetY) +
      Math.abs(nl - targetLift);
    if (shardEnergy > energy) energy = shardEnergy;

    const p = i * 4;
    pixels[p] = clampByte(((ntx / tiltRange) * 0.5 + 0.5) * 255);
    pixels[p + 1] = clampByte(((nty / tiltRange) * 0.5 + 0.5) * 255);
    pixels[p + 2] = clampByte((nl / liftRange) * 255);
    pixels[p + 3] = 255;
  }
  return energy;
}

/** Walks up from the host to the first opaque background colour — the same fallback crystal-lens and warp-grid use so a fully transparent painted texture composites onto the page rather than onto black. */
function effectiveBackground(
  el: HTMLElement | null,
): [number, number, number, number] {
  let node: HTMLElement | null = el;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    const rgba = resolveColor(bg);
    if (rgba[3] > 0.01) return rgba;
    node = node.parentElement;
  }
  return resolveColor(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--background",
    ) || "#fff",
    document.documentElement,
  );
}

type ShardsLayerProps = Required<
  Pick<
    GlassShardsProps,
    | "shards"
    | "seed"
    | "tilt"
    | "lift"
    | "radius"
    | "refraction"
    | "edge"
    | "color"
  >
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the two textures (the
 * painted DOM and the 64x1 shard-state field), the CPU spring simulation,
 * and the frame loop; reads everything else from the surface.
 */
function ShardsLayer({
  shards,
  seed,
  tilt,
  lift,
  radius,
  refraction,
  edge,
  color,
  background,
}: ShardsLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const stateTextureRef = React.useRef<WebGLTexture | null>(null);
  const stateVersionRef = React.useRef(0);
  const uploadedStateVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const simFrameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const colorRef = React.useRef<[number, number, number, number]>([0, 0, 0, 1]);
  const failedRef = React.useRef(false);

  const sitesRef = React.useRef<Float32Array>(new Float32Array(MAX_SHARDS * 2));
  const fieldRef = React.useRef<ShardField | null>(null);
  const pointerRef = React.useRef<{ x: number; y: number } | null>(null);
  const hostSizeRef = React.useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ radius, tilt, lift, refraction, edge });
  React.useEffect(() => {
    paramsRef.current = { radius, tilt, lift, refraction, edge };
  });

  // One frame: upload whichever texture landed a new version, then draw.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
    const gl = glRef.current;
    const program = programRef.current;
    const tri = triRef.current;
    const canvas = canvasRef.current;
    const field = fieldRef.current;
    const stateTexture = stateTextureRef.current;
    const live = surfaceRef.current;
    if (
      !gl ||
      !program ||
      !tri ||
      !canvas ||
      !live.canvas ||
      !field ||
      !stateTexture
    ) {
      return;
    }
    if (gl.isContextLost()) return;

    if (uploadedVersionRef.current !== live.version) {
      textureRef.current = uploadTexture(
        gl,
        live.canvas,
        { linear: true, wrap: "clamp" },
        textureRef.current,
      );
      uploadedVersionRef.current = live.version;
    }
    const texture = textureRef.current;
    if (!texture) return;

    if (uploadedStateVersionRef.current !== stateVersionRef.current) {
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        MAX_SHARDS,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        field.pixels,
      );
      uploadedStateVersionRef.current = stateVersionRef.current;
    }

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;
    const p = paramsRef.current;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.texture("u_state", stateTexture, 1);
    program.set({
      u_res: [cssW, cssH],
      u_sites: sitesRef.current,
      u_count: field.count,
      u_tiltRange: p.tilt,
      u_liftRange: p.lift,
      u_refraction: p.refraction,
      u_edge: p.edge,
      u_color: colorRef.current,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, []);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint), so this is keyed on `surface.active`,
  // not on mount: a mount-only effect would run against no canvas at all.
  React.useEffect(() => {
    if (!surface.active) return;
    const canvas = canvasRef.current;
    if (!canvas || failedRef.current) return;
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: false });
    if (!gl) {
      failedRef.current = true;
      return;
    }
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) {
      failedRef.current = true;
      return;
    }
    const tri = createFullscreenTriangle(gl, program);
    glRef.current = gl;
    programRef.current = program;
    triRef.current = tri;
    uploadedVersionRef.current = 0;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const detach = onContextLoss(canvas, () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (simFrameRef.current !== null)
        cancelAnimationFrame(simFrameRef.current);
      simFrameRef.current = null;
      failedRef.current = true;
    });
    // A paint may already be waiting: draw it now rather than on the next
    // pointer move.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (simFrameRef.current !== null)
        cancelAnimationFrame(simFrameRef.current);
      simFrameRef.current = null;
      if (textureRef.current) gl.deleteTexture(textureRef.current);
      textureRef.current = null;
      uploadedVersionRef.current = 0;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // The seed sites and the spring field are sized from `shards`/`seed`, so
  // they're set up (and torn down) independently of the base GL setup above
  // — changing shards/seed must not recompile the program, only relay out
  // the fracture and reset every shard to rest.
  React.useEffect(() => {
    if (!surface.active) return;
    const gl = glRef.current;
    if (!gl || failedRef.current) return;

    const count = clamp(Math.round(shards), 4, MAX_SHARDS);
    const sites = generateSites(count, Math.round(seed));
    const field = createShardField(count);
    // Encode the at-rest state (pointer null) so the first frame reads as
    // whole glass, never as raw zero bytes decoded into stray tilt.
    stepShardField(
      field,
      sites,
      null,
      1,
      1,
      0,
      paramsRef.current.tilt,
      paramsRef.current.lift,
    );

    const texture = createEmptyTexture(gl, MAX_SHARDS, 1);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      MAX_SHARDS,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      field.pixels,
    );

    sitesRef.current = sites;
    fieldRef.current = field;
    stateTextureRef.current = texture;
    stateVersionRef.current = 1;
    uploadedStateVersionRef.current = 0;
    pointerRef.current = null;
    requestFrame();

    return () => {
      gl.deleteTexture(texture);
      stateTextureRef.current = null;
      fieldRef.current = null;
    };
  }, [surface.active, shards, seed, requestFrame]);

  // Every completed paint asks for a frame, even while the field is at rest.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Colours are resolved against the host once it exists, and again if the
  // caller changes them — `var(--token)` needs the host's computed style to
  // read the theme that actually applies to it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    colorRef.current = resolveColor(color, host);
    requestFrame();
  }, [surface.host, background, color, requestFrame]);

  // Pointer on the host: every move (and enter) records where it is, in host
  // CSS px, and (re)starts the simulation loop. The loop re-derives every
  // shard's tilt/lift target fresh from that stored position each tick,
  // relaxes toward it, and reschedules itself only while there's still
  // energy left to settle — leaving is just a target of zero, so the pane
  // reseals the same way it parted.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const stepSimulation = () => {
      simFrameRef.current = null;
      const live = surfaceRef.current;
      const field = fieldRef.current;
      if (!live.active || !field) return;
      const size = hostSizeRef.current;
      const p = paramsRef.current;
      const energy = stepShardField(
        field,
        sitesRef.current,
        pointerRef.current,
        size.width,
        size.height,
        p.radius,
        p.tilt,
        p.lift,
      );
      stateVersionRef.current += 1;
      requestFrame();
      if (energy > ENERGY_STOP) {
        simFrameRef.current = requestAnimationFrame(stepSimulation);
      }
    };

    const wake = () => {
      if (simFrameRef.current === null) {
        simFrameRef.current = requestAnimationFrame(stepSimulation);
      }
    };

    const updatePointer = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      hostSizeRef.current = { width: rect.width, height: rect.height };
      pointerRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      wake();
    };
    const clearPointer = () => {
      pointerRef.current = null;
      wake();
    };

    host.addEventListener("pointermove", updatePointer);
    host.addEventListener("pointerenter", updatePointer);
    host.addEventListener("pointerleave", clearPointer);
    host.addEventListener("pointercancel", clearPointer);
    return () => {
      host.removeEventListener("pointermove", updatePointer);
      host.removeEventListener("pointerenter", updatePointer);
      host.removeEventListener("pointerleave", clearPointer);
      host.removeEventListener("pointercancel", clearPointer);
      if (simFrameRef.current !== null)
        cancelAnimationFrame(simFrameRef.current);
      simFrameRef.current = null;
    };
  }, [surface.host, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="glass-shards"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface as a pane of glass broken into shards — a seeded Voronoi
 * cell pattern, the same fracture every time for a given `seed`. Each
 * shard reads its own tilt and lift off a small per-shard spring: near the
 * pointer it tips toward the cursor, lifts toward the viewer, and drifts a
 * little outward from its neighbours, so it refracts the painted texture
 * slightly differently from the shards around it. Every crack carries a
 * bright edge, a faint shadow on whichever side has lifted higher, and a
 * sliver of the ground showing through where a shard has risen clear; the
 * whole field relaxes on its own and the simulation stops itself once every
 * shard has settled, waking again on the next pointer move.
 * Reduced motion: `SurfacePaint` renders in replace mode, so the layer
 * returns null and the real, unbroken DOM shows in its place.
 */
export function GlassShards({
  shards = 28,
  seed = 7,
  tilt = 10,
  lift = 12,
  radius = 220,
  refraction = 1,
  edge = 0.5,
  color = "var(--primary)",
  background,
  paint,
  className,
  children,
}: GlassShardsProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={className}
      effect={
        <ShardsLayer
          shards={shards}
          seed={seed}
          tilt={tilt}
          lift={lift}
          radius={radius}
          refraction={refraction}
          edge={edge}
          color={color}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
