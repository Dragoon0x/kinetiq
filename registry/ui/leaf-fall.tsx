"use client";

import * as React from "react";

import {
  FULLSCREEN_VERTEX,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type LeafFallPalette = readonly [string, string, string, string];

export type LeafFallProps = {
  /** Leaves in flight or resting at once — hard-capped at 40 regardless. @default 24 */
  count?: number;
  /** Sideways sway strength while a leaf falls. @default 1 */
  wind?: number;
  /** Spin rate while a leaf falls. @default 1 */
  tumble?: number;
  /** Four leaf colours, picked per leaf by a hashed index. CSS; resolved with resolveColor. */
  palette?: LeafFallPalette;
  /** How close the pointer must pass a settled leaf, in CSS pixels, before it blows loose again. @default 50 */
  sweep?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// uniform vec4 u_leaves[MAX_LEAVES] — keep in lockstep with the shader.
const MAX_LEAVES = 40;
// uniform vec3 u_palette[MAX_PALETTE] — keep in lockstep with the shader.
const MAX_PALETTE = 4;

const DEFAULT_PALETTE: LeafFallPalette = [
  "#c2410c",
  "#d97706",
  "#a16207",
  "#7c2d12",
];

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec4 u_leaves[${MAX_LEAVES}];
uniform int u_count;
uniform vec3 u_palette[${MAX_PALETTE}];
in vec2 v_uv;
out vec4 o_color;

const int kx_maxLeaves = ${MAX_LEAVES};
const float kx_length = 14.0;
const float kx_width = 8.0;

// Uniform arrays index by a loop counter only, never a runtime variable —
// so a hashed palette pick has to arrive as a chain of constant-index
// branches rather than u_palette[index].
vec3 kx_paletteColor(int index) {
  vec3 c = u_palette[0];
  c = index == 1 ? u_palette[1] : c;
  c = index == 2 ? u_palette[2] : c;
  c = index >= 3 ? u_palette[3] : c;
  return c;
}

void main() {
  vec2 px = v_uv * u_res;
  vec4 result = vec4(0.0);

  for (int i = 0; i < kx_maxLeaves; i++) {
    if (i >= u_count) break;
    vec4 leaf = u_leaves[i];
    vec2 pos = leaf.xy;
    float rot = leaf.z;
    // w packs paletteIndex (0..3) plus 10 when the leaf is settled — see
    // writeLeafUniforms below.
    float raw = leaf.w;
    float settled = step(5.0, raw);
    int paletteIndex = int(raw - settled * 10.0 + 0.5);

    vec2 d = px - pos;
    if (dot(d, d) > 400.0) continue;

    // A soft shadow under settled leaves only, offset a couple pixels
    // toward the surface they are resting on.
    if (settled > 0.5) {
      vec2 sd = px - (pos + vec2(0.0, 3.0));
      float shadow = (1.0 - smoothstep(2.0, 9.0, length(sd))) * 0.22;
      if (shadow > 0.0) {
        result.rgb = mix(result.rgb, vec3(0.0), shadow);
        result.a = result.a + shadow * (1.0 - result.a);
      }
    }

    // Into the leaf's own frame: local.x runs tail-to-tip, local.y across.
    float cs = cos(-rot);
    float sn = sin(-rot);
    vec2 local = vec2(d.x * cs - d.y * sn, d.x * sn + d.y * cs);

    float halfLen = kx_length * 0.5;
    float halfWid = kx_width * 0.5;
    float uu = local.x / halfLen;
    if (abs(uu) > 1.2) continue;

    // An ellipse envelope (round at both ends) pinched toward a point on
    // the positive-uu half only, so the tail stays rounded and the tip
    // comes to a point — the leaf silhouette.
    float taper = sqrt(clamp(1.0 - uu * uu, 0.0, 1.0));
    float tip = clamp(1.0 - max(uu, 0.0) * 0.85, 0.0, 1.0);
    float widthAtU = halfWid * taper * tip;
    if (widthAtU < 0.05) continue;
    float vv = local.y / widthAtU;

    float aaV = fwidth(vv) * 1.5 + 0.02;
    float aaU = fwidth(uu) * 1.5 + 0.02;
    float mask = (1.0 - smoothstep(1.0 - aaV, 1.0 + aaV, abs(vv)))
      * (1.0 - smoothstep(1.0 - aaU, 1.0 + aaU, abs(uu)));
    if (mask <= 0.0) continue;

    vec3 base = kx_paletteColor(paletteIndex);
    float shade = mix(0.82, 1.08, clamp(uu * 0.5 + 0.5, 0.0, 1.0));
    vec3 color = base * shade;

    float midrib = (1.0 - smoothstep(0.0, 0.9, abs(local.y))) * step(uu, 0.8);
    color = mix(color, base * 0.55, midrib * mask * 0.65);

    result.rgb = mix(result.rgb, color, mask);
    result.a = result.a + mask * (1.0 - result.a);
  }

  o_color = result;
}
`;

type LeafState = "falling" | "settled";

type Leaf = {
  x: number;
  y: number;
  rotation: number;
  restRotation: number;
  speed: number;
  phase: number;
  palette: number;
  state: LeafState;
  tumbleSign: 1 | -1;
  vx: number;
  age: number;
  generation: number;
};

type Ledges = {
  colWidth: number;
  /** Ledge y rows (CSS px), top to bottom is not guaranteed, per 8px-wide column. */
  cols: number[][];
};

/** A tiny, deterministic integer hash — every leaf's speed, sway phase,
 * palette pick, tumble sign and each respawn's fresh start comes from this,
 * never Math.random. Same input, same output, every time. */
function hash01(n: number): number {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const LEDGE_SCALE = 4;
const LEDGE_COLUMN_PX = 8;
const LEDGE_PROBE_GAP = 3;
const LEDGE_LUMA_DROP = 0.25;
const LEDGE_MAX_PER_COLUMN = 6;
const LEDGE_MIN_GAP_ROWS = 3;

/**
 * Downsamples the painted canvas to 1/4 scale and, per 8px-wide column,
 * walks down looking for a lighter pixel with darker content just a few
 * rows below it — the top edge of a card, a table row, a button: anything
 * a leaf could plausibly rest on. Called once per surface version, never
 * per frame; `scratch` is reused across calls so no canvas is allocated on
 * a steady-state page.
 */
function buildLedges(
  scratch: HTMLCanvasElement,
  source: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
): Ledges {
  const numCols = Math.max(1, Math.ceil(cssWidth / LEDGE_COLUMN_PX));
  const width = Math.max(1, Math.round(cssWidth / LEDGE_SCALE));
  const height = Math.max(1, Math.round(cssHeight / LEDGE_SCALE));
  scratch.width = width;
  scratch.height = height;
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!ctx || width < 2 || height < 2) {
    const empty: number[][] = [];
    for (let c = 0; c < numCols; c += 1) empty.push([]);
    return { colWidth: LEDGE_COLUMN_PX, cols: empty };
  }
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const luma = (x: number, y: number): number => {
    const i = (y * width + x) * 4;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  const colStep = Math.max(1, Math.round(LEDGE_COLUMN_PX / LEDGE_SCALE));
  const cols: number[][] = [];
  for (let c = 0; c < numCols; c += 1) {
    const x = Math.min(width - 1, c * colStep);
    const found: number[] = [];
    let y = 0;
    while (
      y < height - LEDGE_PROBE_GAP &&
      found.length < LEDGE_MAX_PER_COLUMN
    ) {
      const drop = luma(x, y) - luma(x, y + LEDGE_PROBE_GAP);
      if (drop > LEDGE_LUMA_DROP) {
        found.push(y * LEDGE_SCALE);
        y += LEDGE_MIN_GAP_ROWS + LEDGE_PROBE_GAP;
      } else {
        y += 1;
      }
    }
    cols.push(found);
  }
  return { colWidth: LEDGE_COLUMN_PX, cols };
}

/** A fresh falling leaf for slot `index`, generation `gen` — the same slot
 * and generation always hash to the same leaf, so a respawn is a new
 * generation, never a new random draw. */
function spawnLeaf(index: number, gen: number, width: number): Leaf {
  const seed = index * 131 + gen * 7919;
  const hx = hash01(seed);
  const hy = hash01(seed + 1);
  const hspeed = hash01(seed + 2);
  const hphase = hash01(seed + 3);
  const hpalette = hash01(seed + 4);
  const hsign = hash01(seed + 5);
  const hrot = hash01(seed + 6);
  return {
    x: hx * Math.max(width, 1),
    y: -16 - hy * 220,
    rotation: hrot * Math.PI * 2,
    restRotation: 0,
    speed: 22 + hspeed * 30,
    phase: hphase * Math.PI * 2,
    palette: Math.floor(hpalette * MAX_PALETTE) % MAX_PALETTE,
    state: "falling",
    tumbleSign: hsign < 0.5 ? -1 : 1,
    vx: 0,
    age: 0,
    generation: gen,
  };
}

/** A settled leaf for slot `index`, placed directly on a ledge — the
 * deterministic reduced-motion initial state. Searches outward from a
 * hashed starting column for the nearest column that actually has a
 * ledge, so leaves spread out rather than stacking in one place when a
 * column happens to be empty. */
function placeOnLedge(index: number, ledges: Ledges, height: number): Leaf {
  const numCols = Math.max(1, ledges.cols.length);
  const baseCol = Math.floor(hash01(index * 4013 + 3) * numCols) % numCols;
  let landedCol = baseCol;
  let landedY: number | null = null;
  for (let r = 0; r < numCols && landedY === null; r += 1) {
    const candidates =
      r === 0
        ? [baseCol]
        : [(baseCol + r) % numCols, (baseCol - r + numCols) % numCols];
    for (const col of candidates) {
      const atCol = ledges.cols[col];
      if (!atCol || atCol.length === 0) continue;
      const pick = Math.floor(hash01(index * 6151 + col) * atCol.length);
      const y = atCol[Math.min(pick, atCol.length - 1)];
      if (y !== undefined) {
        landedCol = col;
        landedY = y;
        break;
      }
    }
  }
  const y = landedY ?? Math.max(0, height - 12);
  const x = landedCol * ledges.colWidth + ledges.colWidth * 0.5;
  const restRotation = (hash01(index * 8191 + 9) - 0.5) * 0.6;
  return {
    x,
    y: y - 2,
    rotation: restRotation,
    restRotation,
    speed: 0,
    phase: 0,
    palette: Math.floor(hash01(index * 977 + 1) * MAX_PALETTE) % MAX_PALETTE,
    state: "settled",
    tumbleSign: hash01(index * 53 + 5) < 0.5 ? -1 : 1,
    vx: 0,
    age: 0,
    generation: 0,
  };
}

/** The full leaf set for a fresh mount: falling from above under normal
 * motion, or already resting on their ledges under reduced motion. */
function createLeafField(
  total: number,
  width: number,
  height: number,
  motionSafe: boolean,
  ledges: Ledges,
): Leaf[] {
  const leaves: Leaf[] = [];
  for (let i = 0; i < total; i += 1) {
    leaves.push(
      motionSafe ? spawnLeaf(i, 0, width) : placeOnLedge(i, ledges, height),
    );
  }
  return leaves;
}

/** A settled leaf pushed loose by the pointer: falling again, with a
 * hashed sideways kick that decays over the next few frames. */
function blowOff(leaf: Leaf, index: number): void {
  leaf.generation += 1;
  const seed = index * 7919 + leaf.generation * 131;
  const hsign = hash01(seed);
  const hmag = hash01(seed + 1);
  leaf.state = "falling";
  leaf.vx = (hsign < 0.5 ? -1 : 1) * (26 + hmag * 34);
  leaf.age = 0;
}

/**
 * One physics step for every active leaf: falling leaves sway, tumble and
 * descend, settle the moment they cross a ledge in their own column, blow
 * loose again when the pointer sweeps close, and respawn at the top once
 * they clear the bottom without ever landing. Mutates `leaves` in place —
 * called only from inside the rAF loop below, never from a hook body
 * directly.
 */
function stepLeaves(
  leaves: Leaf[],
  count: number,
  dt: number,
  wind: number,
  tumble: number,
  sweep: number,
  pointer: { x: number; y: number; active: boolean },
  ledges: Ledges,
  width: number,
  height: number,
): void {
  const n = Math.min(count, leaves.length, MAX_LEAVES);
  const numCols = Math.max(1, ledges.cols.length);

  for (let i = 0; i < n; i += 1) {
    const leaf = leaves[i];
    if (!leaf) continue;

    if (leaf.state === "settled") {
      leaf.rotation +=
        (leaf.restRotation - leaf.rotation) * Math.min(1, dt * 8);
      if (pointer.active) {
        const dx = leaf.x - pointer.x;
        const dy = leaf.y - pointer.y;
        if (dx * dx + dy * dy < sweep * sweep) blowOff(leaf, i);
      }
      continue;
    }

    leaf.age += dt;
    leaf.vx *= Math.max(0, 1 - dt * 3);
    const sway = Math.sin(leaf.age * 1.3 + leaf.phase) * wind * 30 * dt;
    leaf.x += sway + leaf.vx * dt;
    leaf.rotation += tumble * dt * leaf.tumbleSign;

    const prevY = leaf.y;
    const nextY = prevY + leaf.speed * dt;
    const colIndex = clamp(
      Math.floor(leaf.x / ledges.colWidth),
      0,
      numCols - 1,
    );
    const colLedges = ledges.cols[colIndex];
    let landedY: number | null = null;
    if (colLedges) {
      for (const ledgeY of colLedges) {
        if (ledgeY > prevY && ledgeY <= nextY) {
          if (landedY === null || ledgeY < landedY) landedY = ledgeY;
        }
      }
    }

    if (landedY !== null) {
      leaf.state = "settled";
      leaf.y = landedY - 2;
      leaf.vx = 0;
      leaf.restRotation =
        (hash01(i * 9539 + leaf.generation * 17 + 3) - 0.5) * 0.6;
    } else if (nextY > height + 24) {
      const fresh = spawnLeaf(i, leaf.generation + 1, width);
      leaf.x = fresh.x;
      leaf.y = fresh.y;
      leaf.rotation = fresh.rotation;
      leaf.speed = fresh.speed;
      leaf.phase = fresh.phase;
      leaf.palette = fresh.palette;
      leaf.state = fresh.state;
      leaf.tumbleSign = fresh.tumbleSign;
      leaf.vx = 0;
      leaf.age = 0;
      leaf.generation = fresh.generation;
    } else {
      leaf.y = nextY;
    }
  }
}

/** Flattens the active leaves into the vec4[MAX_LEAVES] uniform layout:
 * x, y, rotation, paletteIndex + settled × 10 — zero-padded past `count`.
 * Reuses `target` rather than allocating a fresh array every frame. */
function writeLeafUniforms(
  target: Float32Array,
  leaves: Leaf[],
  count: number,
): Float32Array {
  const n = Math.min(count, leaves.length, MAX_LEAVES);
  for (let i = 0; i < MAX_LEAVES; i += 1) {
    const base = i * 4;
    const leaf = i < n ? leaves[i] : undefined;
    if (!leaf) {
      target[base] = 0;
      target[base + 1] = 0;
      target[base + 2] = 0;
      target[base + 3] = 0;
      continue;
    }
    target[base] = leaf.x;
    target[base + 1] = leaf.y;
    target[base + 2] = leaf.rotation;
    target[base + 3] = leaf.palette + (leaf.state === "settled" ? 10 : 0);
  }
  return target;
}

type LeafLayerProps = Required<
  Pick<LeafFallProps, "count" | "wind" | "tumble" | "sweep" | "palette">
>;

/**
 * The GL layer. Owns the context, the program, the leaf field, the ledge
 * scan and the continuous loop; reads everything else from the surface.
 * No texture is uploaded here — leaves are drawn as procedural shapes, not
 * sampled from the painted DOM, so there is nothing to re-upload on every
 * paint beyond a fresh ledge scan.
 */
function LeafLayer({ count, wind, tumble, sweep, palette }: LeafLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const failedRef = React.useRef(false);

  const leavesRef = React.useRef<Leaf[]>([]);
  const leavesInitRef = React.useRef(false);
  const ledgesRef = React.useRef<Ledges>({
    colWidth: LEDGE_COLUMN_PX,
    cols: [],
  });
  const ledgeScratchRef = React.useRef<HTMLCanvasElement | null>(null);
  const leafUniformRef = React.useRef<Float32Array>(
    new Float32Array(MAX_LEAVES * 4),
  );
  const paletteRgbRef = React.useRef<Float32Array>(
    new Float32Array(MAX_PALETTE * 3),
  );
  const pointerRef = React.useRef<{ x: number; y: number; active: boolean }>({
    x: -9999,
    y: -9999,
    active: false,
  });

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    count: clamp(Math.round(count), 0, MAX_LEAVES),
    wind,
    tumble,
    sweep,
  });
  React.useEffect(() => {
    paramsRef.current = {
      count: clamp(Math.round(count), 0, MAX_LEAVES),
      wind,
      tumble,
      sweep,
    };
  });

  // One frame: refresh the leaf uniform block from the live simulation
  // state, then draw. There is no texture to re-upload — the CPU field is
  // the only thing that changes between frames.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
    const gl = glRef.current;
    const program = programRef.current;
    const tri = triRef.current;
    const canvas = canvasRef.current;
    const live = surfaceRef.current;
    if (!gl || !program || !tri || !canvas || !live.canvas) return;
    if (gl.isContextLost()) return;

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;
    const p = paramsRef.current;

    leafUniformRef.current = writeLeafUniforms(
      leafUniformRef.current,
      leavesRef.current,
      p.count,
    );

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.set({
      u_res: [cssW, cssH],
      u_leaves: leafUniformRef.current,
      u_count: p.count,
      u_palette: paletteRgbRef.current,
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
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const detach = onContextLoss(canvas, () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      failedRef.current = true;
    });
    // Leaves may already be simulating (or, under reduced motion, already
    // placed) by the time the context finishes compiling: draw them now
    // rather than waiting for the next tick or paint.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // Ledges are rebuilt from the live painted canvas on every completed
  // paint — layout changes, so the surfaces leaves can land on do too. The
  // leaf field itself is only ever built once per mount: falling from the
  // top under normal motion, or placed directly on ledges (deterministic,
  // no fall) under reduced motion.
  React.useEffect(() => {
    if (!surface.active) return;
    const canvas = surface.canvas;
    if (!canvas) return;
    const scratch = ledgeScratchRef.current ?? document.createElement("canvas");
    ledgeScratchRef.current = scratch;
    ledgesRef.current = buildLedges(
      scratch,
      canvas,
      surface.width,
      surface.height,
    );

    if (!leavesInitRef.current) {
      leavesInitRef.current = true;
      leavesRef.current = createLeafField(
        MAX_LEAVES,
        surface.width,
        surface.height,
        surface.motionSafe,
        ledgesRef.current,
      );
    }
    requestFrame();
  }, [
    surface.active,
    surface.canvas,
    surface.version,
    surface.width,
    surface.height,
    surface.motionSafe,
    requestFrame,
  ]);

  // The continuous loop: only while motion is safe. A virtual clock in
  // seconds, rebased over pauses, gated by IntersectionObserver and
  // visibilitychange so it truly stops off-screen rather than jumping
  // forward on return. Under reduced motion this effect never starts —
  // the ledge effect above already drew the one settled frame.
  React.useEffect(() => {
    if (!surface.active || !surface.motionSafe) return;
    const host = surface.host;
    if (!host) return;

    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let lastT = 0;
    let inView = false;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (started === null) started = now;
      const t = (now - started) / 1000;
      const dt = Math.min(0.05, Math.max(0, t - lastT));
      lastT = t;

      if (leavesInitRef.current) {
        const p = paramsRef.current;
        const live = surfaceRef.current;
        stepLeaves(
          leavesRef.current,
          p.count,
          dt,
          p.wind,
          p.tumble,
          p.sweep,
          pointerRef.current,
          ledgesRef.current,
          live.width,
          live.height,
        );
      }
      requestFrame();
    };

    const syncLoop = () => {
      const shouldRun = inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so leaves resume falling, not
        // jump ahead as if they had kept falling off-screen.
        if (started !== null && pausedAt !== null) {
          started += performance.now() - pausedAt;
        }
        pausedAt = null;
        raf = requestAnimationFrame(tick);
      } else if (!shouldRun && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
        pausedAt = performance.now();
      }
    };

    const intersection = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) inView = last.isIntersecting;
      syncLoop();
    });
    intersection.observe(host);
    const onVisibility = () => syncLoop();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [surface.active, surface.motionSafe, surface.host, requestFrame]);

  // Pointer on the host: only tracked while motion is safe, since nothing
  // reacts to it otherwise. Purely a proximity test read by the loop above
  // — no spring, no follow, just the last known position.
  React.useEffect(() => {
    if (!surface.motionSafe) return;
    const host = surface.host;
    if (!host) return;
    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointerRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        active: true,
      };
    };
    const leave = () => {
      pointerRef.current = { x: -9999, y: -9999, active: false };
    };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
    };
  }, [surface.host, surface.motionSafe]);

  // Palette colours are resolved against the host once it exists, and
  // again if the caller changes them — `var(--token)` needs the host's
  // computed style to read the theme that actually applies to it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const rgb = new Float32Array(MAX_PALETTE * 3);
    for (let i = 0; i < MAX_PALETTE; i += 1) {
      const css = palette[i] ?? palette[palette.length - 1] ?? "#7c2d12";
      const [r, g, b] = resolveColor(css, host);
      rgb[i * 3] = r;
      rgb[i * 3 + 1] = g;
      rgb[i * 3 + 2] = b;
    }
    paletteRgbRef.current = rgb;
    requestFrame();
  }, [surface.host, palette, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="leaf-fall"
      className="block h-full w-full"
    />
  );
}

/**
 * Up to forty leaves fall over the painted interface and land on it. A CPU
 * field moves each one — a hashed fall speed, a sway riding its own age, a
 * tumble that spins it — while the surfaces they can land on come from the
 * real page: once per paint, the canvas is read at quarter scale and
 * scanned per 8px column for a lighter pixel with darker content just
 * beneath it, up to six such ledges a column. A leaf settles the instant it
 * crosses one, easing to a resting tilt and staying there until the
 * pointer sweeps within `sweep` pixels, which blows it loose with a
 * sideways kick; anything that clears the bottom without landing respawns
 * at the top. The interface underneath stays real, untouched DOM the whole
 * time — a leaf is one procedural shape tested per fragment, never a
 * sampled texture.
 * Reduced motion: all forty leaves are placed on their ledges once,
 * deterministically, and drawn as a single still frame with no loop.
 */
export function LeafFall({
  count = 24,
  wind = 1,
  tumble = 1,
  palette = DEFAULT_PALETTE,
  sweep = 50,
  paint,
  className,
  children,
}: LeafFallProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <LeafLayer
          count={count}
          wind={wind}
          tumble={tumble}
          sweep={sweep}
          palette={palette}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
