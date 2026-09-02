"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import {
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
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
import { clamp, djb2, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

// Layout effects only ever run client-side here (the file is "use client"),
// but Next.js still warns about useLayoutEffect during SSR module
// evaluation — the same guard glyph-sweep's own copy uses.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

export type BurnThroughProps = {
  /** Which panel is active. Changing it burns the outgoing panel away, from a single origin point, to reveal the panel at this index. */
  index: number;
  /** Burn duration in seconds. @default 1.4 */
  duration?: number;
  /** Ember-glow strength along the charred front. @default 1 */
  glow?: number;
  /** Scales how wide the charred band reads, in burn-field units. @default 1 */
  char?: number;
  /** Fill colour where a texture samples transparent; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  /** The panels. Only the one at `index` renders into the painted DOM. */
  children: React.ReactNode[];
};

// How many seeded ash flakes rise from the front — a loop bound in the
// shader below, kept in lockstep with the constant it's interpolated into.
const FLAKE_COUNT = 12;

/** Walks up from the host to the first opaque background colour, so a
 * transparent texture region composites onto the real page rather than onto
 * black. Mirrors crystal-lens's and glyph-sweep's own copy. */
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
  );
}

/** A deterministic origin on the host's edge, keyed by panel index — used
 * only when no pointerdown has ever landed, so a burn still starts from a
 * specific place instead of the dead centre every time. */
function hashOriginForIndex(index: number): [number, number] {
  const rand = seeded(djb2(`burn-through:${index}`));
  const edge = Math.floor(rand() * 4);
  const along = rand();
  if (edge === 0) return [along, 0];
  if (edge === 1) return [1, along];
  if (edge === 2) return [along, 1];
  return [0, along];
}

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
uniform sampler2D u_prev;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec2 u_origin;
uniform float u_progress;
uniform float u_char;
uniform float u_glow;
uniform vec4 u_bg;
uniform float u_newReady;
in vec2 v_uv;
out vec4 o_color;

const int FLAKE_COUNT = ${FLAKE_COUNT};
// The front, in burn-field units, once progress reaches 1 — past the field's
// own maximum, so every pixel finishes burned through by the sweep's end.
const float FRONT_SCALE = 1.7;
// Ash rises and fades over this fraction of the sweep, staggered per flake
// by its own seeded spawn point.
const float FLAKE_LIFE = 0.3;

vec3 sampleOver(sampler2D tex, vec2 uv) {
  vec4 t = texture(tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 origin = u_origin * u_res;
  float maxDist = max(length(u_res), 1.0);

  // A field combining drifting noise with radial distance from the origin —
  // low where the fire has already passed, high where it has not reached
  // yet. The front is a plain float that climbs past the field's own
  // maximum, so a single comparison per pixel decides old, charred, or new.
  float burn = kx_fbm(px * 0.01) * 0.6 + distance(px, origin) / maxDist;
  float front = u_progress * FRONT_SCALE;
  float bandWidth = max(u_char, 0.0) * 0.08;

  vec3 oldColor = sampleOver(u_prev, px / u_res);
  vec3 newColor = u_newReady > 0.5 ? sampleOver(u_tex, px / u_res) : oldColor;

  vec3 result;
  if (burn < front - bandWidth) {
    // Ahead of the char: the new panel has already taken over.
    result = newColor;
  } else if (burn >= front) {
    // Untouched: the old panel, unburned.
    result = oldColor;
  } else {
    // Inside the charred band: t = 0 at the still-unburned edge (burn just
    // under front), t = 1 at the edge already giving way to the new panel.
    float t = bandWidth > 0.0001
      ? clamp((front - burn) / bandWidth, 0.0, 1.0)
      : 0.0;
    float crinkle = 0.15 + kx_hash(px) * 0.1;
    vec3 charColor = oldColor * crinkle;
    float emberT = pow(clamp(1.0 - t / 0.45, 0.0, 1.0), 2.0);
    vec3 emberColor = mix(vec3(1.0, 0.55, 0.12), vec3(1.0, 0.96, 0.85), emberT);
    result = charColor + emberColor * emberT * max(u_glow, 0.0);
  }

  // A dozen seeded flakes of ash rise from the front and fade as the sweep
  // passes them by — deterministic per flake index, never per-frame random.
  float darken = 0.0;
  for (int i = 0; i < FLAKE_COUNT; i++) {
    float seed = float(i);
    float angle = kx_hash(vec2(seed, 1.7)) * 6.2831853;
    float spawnT = kx_hash(vec2(seed, 5.3)) * 0.7;
    float life = clamp((u_progress - spawnT) / FLAKE_LIFE, 0.0, 1.0);
    float fade = (1.0 - life) * smoothstep(0.0, 0.08, life);
    float startDist = clamp(spawnT * FRONT_SCALE, 0.0, 1.0) * maxDist;
    vec2 flakeOrigin = origin + vec2(cos(angle), sin(angle)) * startDist;
    float rise = life * u_res.y * 0.05;
    float xDrift = (kx_hash(vec2(seed, 9.1)) - 0.5) * u_res.x * 0.02 * life;
    vec2 flakePos = flakeOrigin + vec2(xDrift, -rise);
    float size = mix(1.0, 2.2, kx_hash(vec2(seed, 3.9)));
    float d = length(px - flakePos);
    darken += (1.0 - smoothstep(size * 0.4, size, d)) * fade;
  }
  result = mix(result, vec3(0.04, 0.03, 0.03), clamp(darken, 0.0, 0.85));

  o_color = vec4(result, 1.0);
}
`;

/** Copies the painted texture into a retained canvas (reused across burns) so the outgoing panel survives the DOM switch. */
function retainCopy(
  target: HTMLCanvasElement | null,
  source: HTMLCanvasElement,
): HTMLCanvasElement {
  const canvas = target ?? document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext("2d")?.drawImage(source, 0, 0);
  return canvas;
}

type BurnLayerProps = Required<
  Pick<BurnThroughProps, "index" | "duration" | "glow" | "char">
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the outgoing/incoming page
 * textures, the burn origin, and the frame loop; reads everything else from
 * the surface. `index` is the only trigger for a burn — no idle ticking
 * between them.
 */
function BurnLayer({
  index,
  duration,
  glow,
  char,
  background,
}: BurnLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // 1 = fully settled on the incoming panel — the steady state between
  // burns, and the correct value before any burn has ever run.
  const progress = useMotionValue<number>(1);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const prevCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const prevTextureRef = React.useRef<WebGLTexture | null>(null);
  const prevCaptureIdRef = React.useRef(0);
  const prevUploadedIdRef = React.useRef(0);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const frameRef = React.useRef<number | null>(null);
  const failedRef = React.useRef(false);

  const prevIndexRef = React.useRef(index);
  const sweepControlsRef = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );
  // Whether u_tex already holds the incoming panel's own paint. False from
  // the moment a burn starts until the painter lands a version newer than
  // the one in force when it started.
  const newReadyRef = React.useRef(true);
  const sweepStartVersionRef = React.useRef(0);

  // The last pointerdown seen anywhere on the document, in viewport
  // coordinates — the burn's origin when one is available.
  const lastPointerRef = React.useRef<{ x: number; y: number } | null>(null);
  // Host-relative fraction the current (or most recently run) burn spreads
  // from, read by drawFrame every frame.
  const originRef = React.useRef<[number, number]>([0.5, 0.5]);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ glow, char });
  React.useEffect(() => {
    paramsRef.current = { glow, char };
  });

  // One frame: upload whatever textures landed since the last draw, then
  // composite the outgoing texture, the charred front, and the incoming
  // texture in a single pass.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
    const gl = glRef.current;
    const program = programRef.current;
    const tri = triRef.current;
    const canvas = canvasRef.current;
    const live = surfaceRef.current;
    if (!gl || !program || !tri || !canvas || !live.canvas) return;
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

    if (!newReadyRef.current && live.version > sweepStartVersionRef.current) {
      newReadyRef.current = true;
    }

    if (
      prevUploadedIdRef.current !== prevCaptureIdRef.current &&
      prevCanvasRef.current
    ) {
      prevTextureRef.current = uploadTexture(
        gl,
        prevCanvasRef.current,
        { linear: true, wrap: "clamp" },
        prevTextureRef.current,
      );
      prevUploadedIdRef.current = prevCaptureIdRef.current;
    }
    // Before the first burn nothing has been retained yet. Falling back to
    // the current texture is harmless — at progress 1 the shader never
    // actually samples u_prev.
    const prevTexture = prevTextureRef.current ?? texture;

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;
    const p = paramsRef.current;
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_prev", prevTexture, 0);
    program.texture("u_tex", texture, 1);
    program.set({
      u_res: [cssW, cssH],
      u_origin: originRef.current,
      u_progress: progress.get(),
      u_char: p.char,
      u_glow: p.glow,
      u_bg: bg,
      u_newReady: newReadyRef.current ? 1 : 0,
    });
    tri.draw();
  }, [progress]);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint, and only under motion-safe conditions in
  // replace mode), so this is keyed on `surface.active`, not on mount — a
  // mount-only effect would run against no canvas at all.
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
    prevUploadedIdRef.current = 0;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const detach = onContextLoss(canvas, () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      failedRef.current = true;
    });
    // A paint (or a retained frame) may already be waiting: draw it now
    // rather than on the next index change.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (textureRef.current) gl.deleteTexture(textureRef.current);
      textureRef.current = null;
      uploadedVersionRef.current = 0;
      if (prevTextureRef.current) gl.deleteTexture(prevTextureRef.current);
      prevTextureRef.current = null;
      prevUploadedIdRef.current = 0;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // The burn's own progress and every completed paint ask for a frame —
  // nothing else does, so the loop is silent between burns.
  React.useEffect(() => {
    const unsubscribe = progress.on("change", requestFrame);
    return unsubscribe;
  }, [progress, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the fill colour for wherever a texture samples transparent.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // Track the last pointerdown anywhere on the document, captured before it
  // can be stopped by anything it lands on. This is independent of the
  // surface and the host — it just remembers where the page was last
  // pressed, ready for whenever the next burn needs an origin.
  React.useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
    };
    document.addEventListener("pointerdown", onPointerDown, {
      capture: true,
    });
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  // The burn trigger: pick an origin, retain the outgoing frame the moment
  // `index` changes, then run `progress` 0 → 1. A layout effect so the
  // retain runs synchronously against the pre-swap paint, in the same tick
  // React committed the new panel — before the painter has had a chance to
  // repaint over it.
  useIsomorphicLayoutEffect(() => {
    const fromIndex = prevIndexRef.current;
    prevIndexRef.current = index;
    if (fromIndex === index) return;

    sweepControlsRef.current?.stop();
    const live = surfaceRef.current;

    // The origin is host-relative fractions of the last pointerdown on the
    // document, clamped into the host's box (a press above the host lands
    // at y = 0, and so on for the other edges). With no pointerdown yet,
    // fall back to a point seeded from the incoming index, placed on an
    // edge, so every panel still burns from somewhere specific.
    const host = live.host;
    const last = lastPointerRef.current;
    if (last && host) {
      const rect = host.getBoundingClientRect();
      const fx =
        rect.width > 0 ? clamp((last.x - rect.left) / rect.width, 0, 1) : 0.5;
      const fy =
        rect.height > 0 ? clamp((last.y - rect.top) / rect.height, 0, 1) : 0.5;
      originRef.current = [fx, fy];
    } else {
      originRef.current = hashOriginForIndex(index);
    }

    if (!live.canvas || !live.motionSafe) {
      // Nothing painted yet, or reduced motion (the layer renders nothing
      // regardless of what happens here) — land on the incoming panel with
      // no burn to run.
      progress.jump(1);
      newReadyRef.current = true;
      return;
    }

    prevCanvasRef.current = retainCopy(prevCanvasRef.current, live.canvas);
    prevCaptureIdRef.current += 1;

    newReadyRef.current = false;
    sweepStartVersionRef.current = live.version;

    progress.jump(0);
    sweepControlsRef.current = animate(progress, 1, {
      duration,
      ease: "easeInOut",
      onComplete: () => {
        // Safety net: the painter should already have repainted the
        // incoming panel well before the burn finishes, but if it somehow
        // has not, stop waiting on it rather than hold the new panel back
        // on stale pixels forever.
        if (!newReadyRef.current) {
          newReadyRef.current = true;
          requestFrame();
        }
      },
    });
    requestFrame();
  }, [index, duration, progress, requestFrame]);

  // A burn in flight must not outlive the component.
  React.useEffect(
    () => () => {
      sweepControlsRef.current?.stop();
    },
    [],
  );

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="burn-through"
      className="block h-full w-full"
    />
  );
}

/**
 * A transition between panels: change `index` and the outgoing panel burns
 * away from a single point, spreading through a fractal noise field until
 * the incoming panel shows through behind it. The point is wherever the
 * pointer last went down anywhere on the page, converted to a fraction of
 * the host — or, with nothing pressed yet, a point seeded from the incoming
 * index and placed on the host's edge, so every panel still burns from
 * somewhere specific. A pixel turns only once the sweep's front — a plain
 * float climbing 0 → 1.7 over `duration` — overtakes that pixel's own mix of
 * noise and distance from the origin, leaving a charred, ember-lit band
 * trailing the front with a dozen seeded ash flakes rising through it. Only
 * the active panel ever renders into the painted DOM — the outgoing texture
 * is retained the instant `index` changes, exactly like glyph-sweep, so the
 * burn never waits on a repaint to start.
 * Reduced motion: panels switch instantly with no burn, and this layer
 * renders nothing — the real DOM shows the active panel directly.
 */
export function BurnThrough({
  index,
  duration = 1.4,
  glow = 1,
  char = 1,
  background,
  paint,
  className,
  children,
}: BurnThroughProps) {
  const activeIndex =
    children.length > 0 ? clamp(index, 0, children.length - 1) : 0;

  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <BurnLayer
          index={activeIndex}
          duration={duration}
          glow={glow}
          char={char}
          background={background}
        />
      }
    >
      {children[activeIndex] ?? null}
    </SurfacePaint>
  );
}
