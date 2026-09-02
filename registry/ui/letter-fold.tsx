"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import {
  createGL,
  createGridMesh,
  createProgram,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type GLContext,
  type Mesh,
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

// Layout effects only ever run client-side here (the file is "use client"),
// but Next.js still warns about useLayoutEffect during SSR module
// evaluation — the same guard glyph-sweep's own trigger effect uses.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

export type LetterFoldProps = {
  /** Which panel is active. Changing it retains the outgoing panel's texture and runs a fold, a turn, and an unfold to the panel at this index. */
  index: number;
  /** Total transition time in seconds, covering the fold, the turn, and the unfold together. @default 1.6 */
  duration?: number;
  /** Strength of the darkening applied to a flap as it turns away from flat (0..1). @default 0.5 */
  shading?: number;
  /** Fill colour where a texture samples transparent; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  /** The panels. Only the one at `index` renders into the painted DOM. */
  children: React.ReactNode[];
};

// Vertex shader: displaces the grid mesh (1 col x 48 rows, from
// createGridMesh) into a top and a bottom flap hinged at the thirds, then
// spins the whole folded packet about its own horizontal centre line — the
// GPU's fixed-function perspective divide does the foreshortening from a
// per-vertex w, exactly as cube-fold's own vertex shader does.
const VERTEX = /* glsl */ `
in vec2 a_position;
in vec2 a_uv;
uniform float u_fold;
uniform float u_turn;
uniform float u_halfHeightPx;
out vec2 v_uv;
out float v_shade;

const float PI = 3.14159265359;
const float THIRD = 1.0 / 3.0;

void main() {
  vec2 pos = a_position;
  float t = a_uv.y;
  float z = 0.0;
  float shadeFold = 1.0;

  float theta = PI * u_fold;
  float c = cos(theta);
  float s = sin(theta);

  if (t < THIRD) {
    // Top third: hinge at t = 1/3, folds down flat onto the middle third
    // as theta sweeps 0 to PI.
    float hingeY = 1.0 - 2.0 * THIRD;
    float localY = pos.y - hingeY;
    pos.y = hingeY + localY * c;
    z = localY * s;
    shadeFold = c;
  } else if (t > 1.0 - THIRD) {
    // Bottom third: hinge at t = 2/3, folds up flat onto the middle third.
    float hingeY = -1.0 + 2.0 * THIRD;
    float localY = hingeY - pos.y;
    pos.y = hingeY - localY * c;
    z = localY * s;
    shadeFold = c;
  }
  // Middle third: pos.y and z pass through untouched — it never folds.

  // The turn: the already-folded packet rotates as one rigid plane about
  // the horizontal centre line (clip y = 0), like a page turning over top
  // to bottom. z stays 0 whenever the fold is fully in (theta = PI) or
  // fully out (theta = 0), so the packet is flat at both ends of the turn.
  float turnTheta = PI * u_turn;
  float tc = cos(turnTheta);
  float ts = sin(turnTheta);
  float y2 = pos.y * tc - z * ts;
  float z2 = pos.y * ts + z * tc;

  v_uv = a_uv;
  v_shade = shadeFold;

  // z2 is clip-space small; rescale to CSS pixels so dividing by 900 reads
  // like a real perspective(900px) — the same rescale cube-fold's own
  // vertex shader applies before its own divide.
  float zPx = z2 * u_halfHeightPx;
  float w = 1.0 + zPx / 900.0;
  gl_Position = vec4(pos.x, y2, z2, w);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D u_prev;
uniform sampler2D u_tex;
uniform vec4 u_bg;
uniform float u_shading;
uniform float u_turn;
uniform float u_newReady;
in vec2 v_uv;
in float v_shade;
out vec4 o_color;

const float THIRD = 1.0 / 3.0;
const float CREASE_WIDTH = 0.006;

vec3 sampleOver(sampler2D tex, vec2 uv) {
  vec4 t = texture(tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  // The turn passes its own halfway point (edge-on) exactly when u_turn
  // reaches 0.5 — the moment the packet is thinnest and the swap is least
  // visible. Past it, the new texture is sampled through a vertical flip
  // that cancels the turn's own mirroring, so it reads upright once the
  // packet lands flat again at the far end of the unfold.
  float showNew = step(0.5, u_turn) * u_newReady;
  vec2 uvNew = vec2(v_uv.x, 1.0 - v_uv.y);
  vec3 base = showNew > 0.5
    ? sampleOver(u_tex, uvNew)
    : sampleOver(u_prev, v_uv);

  float darken = clamp((1.0 - v_shade) * u_shading, 0.0, 1.0);
  vec3 shaded = mix(base, base * 0.55, darken);

  float d1 = abs(v_uv.y - THIRD);
  float d2 = abs(v_uv.y - 2.0 * THIRD);
  float crease = 1.0 - smoothstep(0.0, CREASE_WIDTH, min(d1, d2));
  vec3 withCrease = mix(shaded, shaded * 0.4, crease);

  o_color = vec4(withCrease, 1.0);
}
`;

/** Copies the painted texture into a retained canvas (reused across
 * transitions) so the outgoing panel survives the DOM switch — glyph-sweep's
 * own helper, duplicated here since it isn't exported. */
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

/** Walks up from the host to the first opaque background colour, so folded
 * texels composite onto the page rather than onto black — the same probe
 * cube-fold and glyph-sweep each carry their own copy of. */
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

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Maps the 0..1 transition progress onto how far the flaps have folded (0
 * flat, 1 folded onto the middle) and how far the packet has turned (0 not
 * turned, 1 turned a full half-circle) across three back-to-back phases:
 * fold in (0..0.4), turn (0.4..0.6), unfold (0.6..1). */
function phasesFor(progress: number): { fold: number; turn: number } {
  const p = clamp01(progress);
  if (p <= 0.4) return { fold: p / 0.4, turn: 0 };
  if (p <= 0.6) return { fold: 1, turn: (p - 0.4) / 0.2 };
  return { fold: 1 - (p - 0.6) / 0.4, turn: 1 };
}

type FoldLayerProps = Required<
  Pick<LetterFoldProps, "index" | "duration" | "shading">
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the mesh, the outgoing and
 * incoming page textures, and the frame loop; reads everything else from
 * the surface. `index` is the only trigger for a fold — no idle ticking
 * between them.
 */
function FoldLayer({ index, duration, shading, background }: FoldLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // 1 = fully settled on the incoming panel — the steady state between
  // transitions, and the correct value before any transition has ever run.
  const progress = useMotionValue<number>(1);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const meshRef = React.useRef<Mesh | null>(null);
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
  const transitionControlsRef = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );
  // Whether u_tex already holds the incoming panel's own paint. False from
  // the moment a transition starts until the painter lands a version newer
  // than the one in force when it started.
  const newReadyRef = React.useRef(true);
  const transitionStartVersionRef = React.useRef(0);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ shading });

  // One frame: upload whatever textures landed since the last draw, derive
  // the fold and turn fractions from progress, then draw the mesh.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
    const gl = glRef.current;
    const program = programRef.current;
    const mesh = meshRef.current;
    const canvas = canvasRef.current;
    const live = surfaceRef.current;
    if (!gl || !program || !mesh || !canvas || !live.canvas) return;
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

    if (
      !newReadyRef.current &&
      live.version > transitionStartVersionRef.current
    ) {
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
    // Before the first transition nothing has been retained yet. Falling
    // back to the current texture is harmless — at rest the shader only
    // ever samples u_tex.
    const prevTexture = prevTextureRef.current ?? texture;

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const halfHeightPx = size.height / size.dpr / 2;
    const { fold, turn } = phasesFor(progress.get());
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_prev", prevTexture, 0);
    program.texture("u_tex", texture, 1);
    program.set({
      u_fold: fold,
      u_turn: turn,
      u_halfHeightPx: halfHeightPx,
      u_shading: paramsRef.current.shading,
      u_bg: bg,
      u_newReady: newReadyRef.current ? 1 : 0,
    });
    mesh.draw();
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
    const program = createProgram(gl, VERTEX, FRAGMENT);
    if (!program) {
      failedRef.current = true;
      return;
    }
    const mesh = createGridMesh(gl, program, 1, 48);
    glRef.current = gl;
    programRef.current = program;
    meshRef.current = mesh;
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
      mesh.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      meshRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // The transition's own progress and every completed paint ask for a
  // frame — nothing else does, so the loop is silent between transitions.
  React.useEffect(() => {
    const unsubscribe = progress.on("change", requestFrame);
    return unsubscribe;
  }, [progress, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // A shape prop changed with progress otherwise static: still worth one
  // fresh frame, just not a loop.
  React.useEffect(() => {
    paramsRef.current = { shading };
    requestFrame();
  }, [shading, requestFrame]);

  // Resolve the fill colour against the host, so `var(--token)` reads the
  // theme in force there.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // The transition trigger: retain the outgoing frame the moment `index`
  // changes, then run `progress` 0 → 1 through the fold, turn, and unfold.
  // A layout effect so the retain runs synchronously against the
  // pre-swap paint, in the same tick React committed the new panel —
  // before the painter has had a chance to repaint over it.
  useIsomorphicLayoutEffect(() => {
    const fromIndex = prevIndexRef.current;
    prevIndexRef.current = index;
    if (fromIndex === index) return;

    transitionControlsRef.current?.stop();
    const live = surfaceRef.current;
    if (!live.canvas || !live.motionSafe) {
      // Nothing painted yet, or reduced motion (the layer renders nothing
      // regardless of what happens here) — land on the incoming panel with
      // no fold to run.
      progress.jump(1);
      newReadyRef.current = true;
      return;
    }

    prevCanvasRef.current = retainCopy(prevCanvasRef.current, live.canvas);
    prevCaptureIdRef.current += 1;

    newReadyRef.current = false;
    transitionStartVersionRef.current = live.version;

    progress.jump(0);
    transitionControlsRef.current = animate(progress, 1, {
      duration,
      ease: "easeInOut",
      onComplete: () => {
        // Safety net: the painter should already have repainted the
        // incoming panel well before the turn's halfway point, but if it
        // somehow has not, stop waiting on it rather than hold the far
        // side of the turn on stale pixels forever.
        if (!newReadyRef.current) {
          newReadyRef.current = true;
          requestFrame();
        }
      },
    });
    requestFrame();
  }, [index, duration, progress, requestFrame]);

  // A transition in flight must not outlive the component.
  React.useEffect(
    () => () => {
      transitionControlsRef.current?.stop();
    },
    [],
  );

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="letter-fold"
      className="block h-full w-full"
    />
  );
}

/**
 * A transition between panels built like folding a letter: change `index`
 * and the outgoing panel folds into thirds — the top flap hinges down and
 * the bottom flap hinges up, meeting edge to edge over the middle — turns
 * over as one rigid packet, then unfolds flat again on the new index. The
 * geometry is one hinged grid mesh (cube-fold's own construction, 1 column
 * by 48 rows) driven by a single progress tween across three phases — fold,
 * turn, unfold — with a real perspective divide so the flaps foreshorten
 * and the packet thins to an edge mid-turn. The outgoing texture is
 * retained into its own canvas the instant `index` changes, before the
 * painter has repainted anything, so the fold never waits on a paint to
 * start; the incoming texture swaps in right as the packet passes edge-on,
 * sampled through a vertical flip that cancels the turn's own mirroring so
 * it reads upright once everything lands flat. Each flap darkens by the
 * cosine of its own fold angle and carries a thin crease line at its hinge.
 * Reduced motion: panels swap instantly with no fold, and this layer
 * renders nothing — the real DOM shows the active panel directly.
 */
export function LetterFold({
  index,
  duration = 1.6,
  shading = 0.5,
  background,
  paint,
  className,
  children,
}: LetterFoldProps) {
  const activeIndex =
    children.length > 0 ? clamp(index, 0, children.length - 1) : 0;

  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <FoldLayer
          index={activeIndex}
          duration={duration}
          shading={shading}
          background={background}
        />
      }
    >
      {children[activeIndex] ?? null}
    </SurfacePaint>
  );
}
