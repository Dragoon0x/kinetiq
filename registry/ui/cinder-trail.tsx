"use client";

import * as React from "react";

import {
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
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
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type CinderTrailProps = {
  /** Embers spawned per second of pointer travel, before the speed bonus. @default 60 */
  rate?: number;
  /** Seconds an ember lives before it burns out. @default 1.4 */
  life?: number;
  /** Upward drift speed, in CSS px/s. @default 90 */
  lift?: number;
  /** Glow strength — multiplies every ember's alpha. @default 1 */
  heat?: number;
  /** Spark colour at the moment an ember is born, any CSS colour (tokens included). It cools through a common ember orange toward char as it ages. @default "#ffb347" */
  color?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

/** Hard cap on the live particle pool. */
const MAX_EMBERS = 240;
/** How many of the youngest embers the shader ever sees, per frame. */
const EMBER_SLOTS = 64;
const EMBER_FLOATS = EMBER_SLOTS * 4;
/** Below this per-frame travel, a segment is too small to bother spawning along. */
const MOVE_EPSILON = 0.05;
/** Reference speed, in CSS px/s, at which the speed bonus roughly doubles the base rate. */
const SPEED_REFERENCE = 600;
/** Cap on the speed bonus, so a wild flick still spawns a bounded burst. */
const MAX_SPEED_FACTOR = 5;

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec4 u_embers[${EMBER_SLOTS}];
uniform vec4 u_color;
uniform float u_still;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

void main() {
  if (u_still > 0.5) {
    // Reduced motion: the simulation never runs and nothing was ever
    // spawned, so this frame has no embers to draw at all.
    o_color = vec4(0.0);
    return;
  }

  vec2 px = v_uv * u_res;
  vec3 litColor = vec3(0.0);
  float litAlpha = 0.0;

  for (int i = 0; i < ${EMBER_SLOTS}; i += 1) {
    vec4 e = u_embers[i];
    float heat = e.w;
    if (heat <= 0.0) continue;

    float ageT = clamp(e.z, 0.0, 1.0);
    float radius = mix(2.0, 4.0, kx_hash(vec2(float(i) * 3.11, 5.7)));
    float dist = distance(px, e.xy);
    float disc = 1.0 - smoothstep(radius * 0.6, radius, dist);
    if (disc <= 0.0) continue;

    // Cooling path: the spark colour at birth, through a common ember
    // orange mid-life, down to char as it nears burnout.
    vec3 emberOrange = vec3(1.0, 0.55, 0.16);
    vec3 charColor = vec3(0.06, 0.02, 0.02);
    vec3 body = mix(u_color.rgb, emberOrange, smoothstep(0.0, 0.4, ageT));
    body = mix(body, charColor, smoothstep(0.55, 1.0, ageT));

    // A near-white core at the disc centre, hottest while the ember is
    // young.
    float core = 1.0 - smoothstep(0.0, radius * 0.5, dist);
    vec3 lit = mix(body, vec3(1.0, 0.96, 0.85), core * (1.0 - ageT));

    float fade = 1.0 - ageT;
    float alpha = disc * fade * fade * heat;

    litColor += lit * alpha;
    litAlpha += alpha;
  }

  if (litAlpha <= 0.0015) {
    o_color = vec4(0.0);
    return;
  }
  vec3 avgColor = litColor / litAlpha;
  o_color = vec4(avgColor, min(litAlpha, 1.0));
}
`;

type Ember = {
  x: number;
  y: number;
  age: number;
  life: number;
  /** 0..1, seeded once at spawn from the particle's own index. */
  liftJitter: number;
  swayAmp: number;
  swayFreq: number;
  swayPhase: number;
};

/** Deterministic, seeded on an integer index — never Math.random. */
function hashIndex(i: number): number {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Spawns `count` embers along the segment from (x0,y0) to (x1,y1), pushing
 * onto `list` (mutated in place) and dropping the oldest once the pool hits
 * MAX_EMBERS. Returns the next free spawn index.
 */
function spawnAlong(
  list: Ember[],
  startIndex: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  count: number,
  life: number,
): number {
  let index = startIndex;
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (let i = 0; i < count; i += 1) {
    const t = (i + 1) / (count + 1);
    const h1 = hashIndex(index);
    const h2 = hashIndex(index + 91.233);
    const h3 = hashIndex(index + 193.71);
    const ember: Ember = {
      x: x0 + dx * t,
      y: y0 + dy * t,
      age: 0,
      life,
      liftJitter: h1,
      swayAmp: 6 + h2 * 16,
      swayFreq: 1.4 + h3 * 2.6,
      swayPhase: h1 * Math.PI * 2,
    };
    if (list.length >= MAX_EMBERS) list.shift();
    list.push(ember);
    index += 1;
  }
  return index;
}

/**
 * One physics step for every live ember, then prunes anything past its own
 * life. Every ember ages at the same real-time rate from a shared `dt`, so
 * the earliest-spawned always crosses its own `life` first — pruning from
 * the front is enough, no scan or sort needed.
 */
function stepEmbers(list: Ember[], dt: number, lift: number): void {
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    if (!e) continue;
    const sway = e.swayAmp * Math.sin(e.age * e.swayFreq + e.swayPhase) * dt;
    e.y -= lift * dt * (0.6 + 0.4 * e.liftJitter);
    e.x += sway;
    e.age += dt;
  }
  let cut = 0;
  while (cut < list.length) {
    const e = list[cut];
    if (!e || e.age <= e.life) break;
    cut += 1;
  }
  if (cut > 0) list.splice(0, cut);
}

/**
 * Packs the youngest EMBER_SLOTS embers into `data` as flat
 * (x, y, age/life, heat) quads; unused slots get an age past 1 and zero
 * heat so the shader skips them for free.
 */
function packEmbers(data: Float32Array, list: Ember[], heat: number): void {
  const n = list.length;
  const start = Math.max(0, n - EMBER_SLOTS);
  let slot = 0;
  for (let i = start; i < n; i += 1) {
    const e = list[i];
    if (!e) continue;
    const o = slot * 4;
    data[o] = e.x;
    data[o + 1] = e.y;
    data[o + 2] = e.life > 0 ? e.age / e.life : 1;
    data[o + 3] = heat;
    slot += 1;
  }
  for (; slot < EMBER_SLOTS; slot += 1) {
    const o = slot * 4;
    data[o] = -9999;
    data[o + 1] = -9999;
    data[o + 2] = 1;
    data[o + 3] = 0;
  }
}

type EmberLayerProps = Required<
  Pick<CinderTrailProps, "rate" | "life" | "lift" | "heat" | "color">
>;

/**
 * The GL layer. Owns the context, the program, the particle pool and the
 * self-stopping simulation loop; reads everything else from the surface.
 */
function EmberLayer({ rate, life, lift, heat, color }: EmberLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const failedRef = React.useRef(false);

  const embersRef = React.useRef<Ember[]>([]);
  const nextIndexRef = React.useRef(0);
  const emberDataRef = React.useRef<Float32Array>(
    new Float32Array(EMBER_FLOATS),
  );
  const colorRef = React.useRef<[number, number, number, number]>([
    1, 0.702, 0.278, 1,
  ]);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ rate, life, lift, heat });
  React.useEffect(() => {
    paramsRef.current = { rate, life, lift, heat };
  });

  // One frame: repack the live embers and draw.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
    const gl = glRef.current;
    const program = programRef.current;
    const tri = triRef.current;
    const canvas = canvasRef.current;
    const live = surfaceRef.current;
    if (!gl || !program || !tri || !canvas) return;
    if (gl.isContextLost()) return;

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;
    const still = !live.motionSafe;
    packEmbers(emberDataRef.current, embersRef.current, paramsRef.current.heat);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.set({
      u_res: [cssW, cssH],
      u_embers: emberDataRef.current,
      u_color: colorRef.current,
      u_still: still ? 1 : 0,
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
    // A paint may already be waiting: draw the (empty, or still) frame now
    // rather than on the next pointer move.
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

  // The spark colour is resolved against the host once it exists, and
  // again if the caller changes it — `var(--token)` needs the host's
  // computed style to read the theme that actually applies to it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    colorRef.current = resolveColor(color, host);
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // Pointer on the host: spawns embers two ways, and drives the
  // simulation's own rAF loop. The loop lives entirely in this effect's
  // closure (plain locals, not refs) — it steps every frame while an ember
  // is alive and stops itself the moment the pool empties.
  //
  // Spawning is not left to the loop alone. A handful of synthetic events
  // (Playwright's stepped pointer sweeps included) can all land before the
  // first animation frame ever runs, and that first frame has no prior
  // timestamp to diff against — a dt of 0 would spawn nothing and, with
  // the pool still empty, immediately stop a loop that never got a second
  // frame to prove itself. So every pointermove spawns its own segment's
  // worth of embers immediately, synchronously, off the event's own
  // position delta (`spawnForEvent`) — no frame, no dt, required. The
  // per-frame path below stays too, layering the speed-scaled density a
  // smoothly, continuously moving real pointer produces frame over frame.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    // Reduced motion: no simulation ever runs and nothing is ever spawned —
    // the still, transparent frame drawn above is the whole story.
    if (!surfaceRef.current.motionSafe) return;

    let raf = 0;
    let lastTs: number | null = null;
    let spawnCarry = 0;
    let pointerPos: { x: number; y: number } | null = null;
    let lastProcessed: { x: number; y: number } | null = null;
    // The previous *event* position — distinct from `lastProcessed`, which
    // tracks the previous *frame's* position for the speed-scaled path
    // below. Tracking both lets a burst of events spawn immediately without
    // the frame-synced path double-processing the same ground once a tick
    // finally runs.
    let prevEventPos: { x: number; y: number } | null = null;

    const tick = (ts: number) => {
      raf = 0;
      if (lastTs === null) {
        // First frame since the loop (re)started: only establish the clock
        // baseline. Integrating here would diff against nothing (dt = 0),
        // and stopping on an empty pool at this point would never give a
        // genuine second frame the chance to run.
        lastTs = ts;
        drawFrame();
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min((ts - lastTs) / 1000, 1 / 20);
      lastTs = ts;
      const p = paramsRef.current;

      if (pointerPos && lastProcessed && dt > 0) {
        const dx = pointerPos.x - lastProcessed.x;
        const dy = pointerPos.y - lastProcessed.y;
        const dist = Math.hypot(dx, dy);
        if (dist > MOVE_EPSILON) {
          const speed = dist / dt;
          const speedFactor = Math.min(
            1 + speed / SPEED_REFERENCE,
            MAX_SPEED_FACTOR,
          );
          spawnCarry += p.rate * speedFactor * dt;
          const count = Math.floor(spawnCarry);
          if (count > 0) {
            spawnCarry -= count;
            nextIndexRef.current = spawnAlong(
              embersRef.current,
              nextIndexRef.current,
              lastProcessed.x,
              lastProcessed.y,
              pointerPos.x,
              pointerPos.y,
              count,
              p.life,
            );
          }
        }
        lastProcessed = pointerPos;
      }

      stepEmbers(embersRef.current, dt, p.lift);
      drawFrame();

      if (embersRef.current.length > 0) {
        raf = requestAnimationFrame(tick);
      } else {
        lastTs = null;
        spawnCarry = 0;
      }
    };

    const wake = () => {
      if (raf === 0) raf = requestAnimationFrame(tick);
    };

    // Spawns immediately along the segment from the previous event to this
    // one — distance-based, not time-based, so it is exact regardless of
    // how the events were paced or batched to get here.
    const spawnForEvent = (next: { x: number; y: number }) => {
      const prev = prevEventPos;
      prevEventPos = next;
      if (!prev) return;
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const segmentLength = Math.hypot(dx, dy);
      if (segmentLength <= MOVE_EPSILON) return;
      const p = paramsRef.current;
      const count = Math.min(
        12,
        Math.max(1, Math.round((p.rate * segmentLength) / 120)),
      );
      nextIndexRef.current = spawnAlong(
        embersRef.current,
        nextIndexRef.current,
        prev.x,
        prev.y,
        next.x,
        next.y,
        count,
        p.life,
      );
    };

    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const next = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      // Primes both position trackers so the very next pointermove already
      // has a baseline to spawn a segment from, instead of treating that
      // first move as the baseline itself and spawning nothing for it.
      prevEventPos = next;
      if (lastProcessed === null) lastProcessed = next;
      pointerPos = next;
      wake();
    };

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const next = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      spawnForEvent(next);
      if (lastProcessed === null) lastProcessed = next;
      pointerPos = next;
      wake();
    };
    const leave = () => {
      pointerPos = null;
      lastProcessed = null;
      prevEventPos = null;
    };

    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
      if (raf !== 0) cancelAnimationFrame(raf);
      embersRef.current = [];
      nextIndexRef.current = 0;
    };
  }, [surface.host, drawFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="cinder-trail"
      className="block h-full w-full"
    />
  );
}

/**
 * Embers rising from the pointer's own path. A CPU particle pool, 240 at
 * most, spawns along the segment travelled since the last pointer event —
 * immediately, event by event, so a handful of coarse steps still leaves a
 * trail — and again each frame at a speed-scaled rate for a smoothly
 * moving real pointer, more of them the faster it moves. Each ember seeds
 * its sway and its climb once, from its own spawn index, never from
 * Math.random. Only the 64 youngest ever reach the shader, uploaded every
 * frame as a flat vec4 array and drawn as soft discs with a hot core,
 * cooling from the spark colour through a common ember orange to char as
 * they age. The loop is not continuous — it runs only while an ember is
 * alive, steps on the real time between frames, and stops itself the
 * moment the pool empties; a fresh sweep restarts it clean.
 * Reduced motion: no embers ever spawn and the simulation never runs — the
 * canvas still mounts but draws a fully transparent frame, leaving the page
 * exactly as painted.
 */
export function CinderTrail({
  rate = 60,
  life = 1.4,
  lift = 90,
  heat = 1,
  color = "#ffb347",
  paint,
  className,
  children,
}: CinderTrailProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <EmberLayer
          rate={rate}
          life={life}
          lift={lift}
          heat={heat}
          color={color}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
