"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import {
  FULLSCREEN_VERTEX,
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
import { springs } from "@/registry/lib/motion";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type ZoomModifier = "shift" | "alt" | "ctrl" | "meta" | "none";

export type ScannerLensProps = {
  /** Lens radius in CSS pixels. @default 140 */
  size?: number;
  /** Magnification inside the reticle. @default 1.5 */
  zoom?: number;
  /** Let the wheel adjust zoom (1..4) while `zoomModifier` is held. @default false */
  scrollZoom?: boolean;
  /** The modifier that arms wheel-zoom; "none" arms it unconditionally. @default "shift" */
  zoomModifier?: ZoomModifier;
  /** Reticle and readout colour, any CSS colour. @default "var(--primary)" */
  color?: string;
  /** How tightly the reticle chases the pointer — ≥0.5 snaps, below glides. @default 0.25 */
  follow?: number;
  /** HUD chrome opacity (0..1). @default 0.8 */
  hud?: number;
  /** Outer reticle ring. @default true */
  ring?: boolean;
  /** Crosshair lines with a gap at the centre. @default true */
  crosshair?: boolean;
  /** 24 tick marks around the ring. @default true */
  ticks?: boolean;
  /** Corner brackets framing the reticle. @default true */
  brackets?: boolean;
  /** Centre dot. @default true */
  dot?: boolean;
  /** A faint grid inside the ring. @default false */
  grid?: boolean;
  /** The mono tag/text/coordinate readout beside the reticle. @default true */
  readout?: boolean;
  /** Per-channel radial colour fringe at the rim (0..~2). @default 0.35 */
  aberration?: number;
  /** Vignette thinning the image toward the rim (0..1). @default 0.2 */
  haze?: number;
  /** Ripples on click. @default true */
  ripples?: boolean;
  /** Ripple radius growth, px/s. @default 900 */
  rippleSpeed?: number;
  /** Width of the band a ripple bends, px. @default 100 */
  rippleBendWidth?: number;
  /** How far a ripple displaces the image radially, px. @default 20 */
  rippleBend?: number;
  /** Ripple ring glow strength. @default 1 */
  rippleGlow?: number;
  /** Seconds for a ripple to fully decay. @default 1.4 */
  rippleLife?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec3 u_lens;
uniform float u_zoom;
uniform float u_aberration;
uniform float u_haze;
uniform float u_opacity;
uniform vec3 u_color;
uniform vec4 u_bg;
uniform vec4 u_ripple0;
uniform vec4 u_ripple1;
uniform vec4 u_ripple2;
uniform vec4 u_ripple3;
uniform float u_rippleBendWidth;
uniform float u_rippleBend;
uniform float u_rippleGlow;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 d = px - u_lens.xy;
  float r = length(d);
  float R = max(u_lens.z, 1.0);
  float edge = 1.0 - smoothstep(R - 1.5, R + 0.5, r);
  if (edge <= 0.0) { o_color = vec4(0.0); return; }
  float t = clamp(r / R, 0.0, 1.0);
  vec2 dir = r > 0.0 ? d / r : vec2(0.0);

  // Uniform magnification about the reticle centre — instrumentation, not
  // an optic lens, so the rim never tapers back to 1.
  vec2 src = u_lens.xy + d / max(u_zoom, 0.01);

  // Ripples bend the sample point within a band around their growing
  // radius and contribute a faint additive glow. A local array (not a
  // uniform array) sidesteps any indexing ambiguity entirely.
  vec4 ripples[4] = vec4[4](u_ripple0, u_ripple1, u_ripple2, u_ripple3);
  float glow = 0.0;
  float bandHalf = max(u_rippleBendWidth, 1.0) * 0.5;
  for (int i = 0; i < 4; i++) {
    vec4 rp = ripples[i];
    float strength = rp.w;
    if (strength <= 0.0) continue;
    vec2 rd = src - rp.xy;
    float rr = length(rd);
    vec2 rdir = rr > 0.0001 ? rd / rr : vec2(0.0);
    float band = 1.0 - smoothstep(0.0, bandHalf, abs(rr - rp.z));
    src += rdir * (u_rippleBend * band * strength);
    glow += band * strength;
  }
  glow = clamp(glow, 0.0, 1.0);

  // Per-channel radial aberration, tapering in from the centre.
  float ab = u_aberration * 6.0 * t * t;
  vec3 c = vec3(
    sampleOver((src + dir * ab) / u_res).r,
    sampleOver(src / u_res).g,
    sampleOver((src - dir * ab) / u_res).b
  );

  // Haze: a soft vignette thinning the image toward the rim.
  float haze = clamp(u_haze, 0.0, 1.0) * smoothstep(0.35, 1.0, t) * 0.65;
  c = mix(c, u_bg.rgb, haze);

  // Ripple glow ring, tinted by the HUD colour.
  c += u_color * glow * u_rippleGlow * 0.6;

  o_color = vec4(c, u_opacity * edge);
}
`;

type LensLayerProps = Required<
  Pick<
    ScannerLensProps,
    | "size"
    | "zoom"
    | "scrollZoom"
    | "zoomModifier"
    | "color"
    | "follow"
    | "hud"
    | "ring"
    | "crosshair"
    | "ticks"
    | "brackets"
    | "dot"
    | "grid"
    | "readout"
    | "aberration"
    | "haze"
    | "ripples"
    | "rippleSpeed"
    | "rippleBendWidth"
    | "rippleBend"
    | "rippleGlow"
    | "rippleLife"
  >
>;

type RippleRecord = { x: number; y: number; born: number };
type ReadoutInfo = { tag: string; text: string; x: number; y: number };

/** Nominal seconds per ripple tick — the ripple clock advances one tick per
 * drawn frame rather than reading the wall clock, trading a little physical
 * precision on non-60Hz displays for a clock that is never `Date.now`. */
const FRAME_DT = 1 / 60;
/** How many wheel px map to one unit of zoom when `scrollZoom` is armed. */
const WHEEL_ZOOM_RATE = 0.0025;
/** Readout commit cadence, ms — ~10Hz regardless of pointermove rate. */
const READOUT_TICK_MS = 100;

/** Walks up from the host to the first opaque background colour, so ripple
 * and rim samples over transparent texture regions composite onto the page
 * rather than onto black — the same idiom `crystal-lens.tsx` uses. */
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

/** 24 evenly-spaced tick segments around a ring of radius `r`, centred at
 * (`c`, `c`) in local HUD space. */
function buildTicks(
  r: number,
  c: number,
): { x1: number; y1: number; x2: number; y2: number }[] {
  const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const count = 24;
  const inner = r - 7;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    out.push({
      x1: c + cos * inner,
      y1: c + sin * inner,
      x2: c + cos * r,
      y2: c + sin * r,
    });
  }
  return out;
}

/** Whether the wheel-zoom modifier is currently held for `event`. */
function modifierHeld(event: WheelEvent, modifier: ZoomModifier): boolean {
  switch (modifier) {
    case "none":
      return true;
    case "shift":
      return event.shiftKey;
    case "alt":
      return event.altKey;
    case "ctrl":
      return event.ctrlKey;
    case "meta":
      return event.metaKey;
    default:
      return false;
  }
}

/** Four L-shaped corner brackets loosely framing the ring, in local HUD
 * space centred at (`c`, `c`). */
function buildBrackets(r: number, c: number): { d: string }[] {
  const b = r * 0.86;
  const leg = 12;
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  return corners.map(([sx, sy]) => {
    const cx = c + sx * b;
    const cy = c + sy * b;
    return {
      d: `M ${cx - sx * leg} ${cy} L ${cx} ${cy} L ${cx} ${cy - sy * leg}`,
    };
  });
}

/**
 * The GL layer. Owns the context, the program, the texture, the pointer
 * spring, the ripple ledger, and the frame loop; the HUD ring and mono
 * readout are DOM/SVG siblings of the canvas, driven by the same motion
 * values, so their strokes and type stay crisp at any DPR.
 */
function LensLayer({
  size,
  zoom,
  scrollZoom,
  zoomModifier,
  color,
  follow,
  hud,
  ring,
  crosshair,
  ticks,
  brackets,
  dot,
  grid,
  readout,
  aberration,
  haze,
  ripples,
  rippleSpeed,
  rippleBendWidth,
  rippleBend,
  rippleGlow,
  rippleLife,
}: LensLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const uid = React.useId();

  const x = useMotionValue<number>(-9999);
  const y = useMotionValue<number>(-9999);
  const opacity = useMotionValue<number>(0);
  const zoomLevel = useMotionValue<number>(zoom);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const colorRef = React.useRef<[number, number, number]>([1, 1, 1]);
  const failedRef = React.useRef(false);

  const ripplesRef = React.useRef<RippleRecord[]>([]);
  const tickRef = React.useRef(0);

  const readoutInfoRef = React.useRef<ReadoutInfo | null>(null);
  const [readoutInfo, setReadoutInfo] = React.useState<ReadoutInfo | null>(
    null,
  );

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    size,
    aberration,
    haze,
    ripples,
    rippleSpeed,
    rippleBendWidth,
    rippleBend,
    rippleGlow,
    rippleLife,
  });
  React.useEffect(() => {
    paramsRef.current = {
      size,
      aberration,
      haze,
      ripples,
      rippleSpeed,
      rippleBendWidth,
      rippleBend,
      rippleGlow,
      rippleLife,
    };
  });

  // Mirrored so the frame can re-arm the loop (ripples keep animating
  // without input) without depending on the scheduler itself, which would
  // make the two callbacks mutually self-referential.
  const requestFrameRef = React.useRef<() => void>(() => {});

  // One frame: upload the texture if a new paint landed, age the ripple
  // ledger off the tick clock, then draw.
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

    const sized = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = sized.width / sized.dpr;
    const cssH = sized.height / sized.dpr;
    const p = paramsRef.current;

    const rippleUniforms: Record<string, number[]> = {
      u_ripple0: [0, 0, 0, 0],
      u_ripple1: [0, 0, 0, 0],
      u_ripple2: [0, 0, 0, 0],
      u_ripple3: [0, 0, 0, 0],
    };
    if (p.ripples && ripplesRef.current.length > 0) {
      tickRef.current += 1;
    }
    const tick = tickRef.current;
    if (p.ripples) {
      const alive = ripplesRef.current.filter(
        (rp) => (tick - rp.born) * FRAME_DT < p.rippleLife,
      );
      ripplesRef.current = alive;
      alive.slice(0, 4).forEach((rp, i) => {
        const age = (tick - rp.born) * FRAME_DT;
        const strength = Math.max(0, 1 - age / Math.max(p.rippleLife, 0.0001));
        rippleUniforms[`u_ripple${i}`] = [
          rp.x,
          rp.y,
          age * p.rippleSpeed,
          strength,
        ];
      });
    } else {
      ripplesRef.current = [];
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_lens: [x.get(), y.get(), p.size],
      u_zoom: zoomLevel.get(),
      u_aberration: p.aberration,
      u_haze: p.haze,
      u_opacity: opacity.get(),
      u_color: colorRef.current,
      u_bg: bgRef.current,
      u_rippleBendWidth: p.rippleBendWidth,
      u_rippleBend: p.rippleBend,
      u_rippleGlow: p.rippleGlow,
      ...rippleUniforms,
    });
    tri.draw();

    if (p.ripples && ripplesRef.current.length > 0) {
      requestFrameRef.current();
    }
  }, [x, y, opacity, zoomLevel]);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  React.useEffect(() => {
    requestFrameRef.current = requestFrame;
  }, [requestFrame]);

  // Every motion-value change and every completed paint asks for a frame.
  React.useEffect(() => {
    const unsubs = [x, y, opacity, zoomLevel].map((mv) =>
      mv.on("change", requestFrame),
    );
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, opacity, zoomLevel, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // GL setup and teardown. The canvas isn't mounted (canvasRef.current is
  // null) until `surface.active` is true — the layer returns null before
  // the first paint lands — so this must gate on `active` rather than run
  // once on mount, or GL is never created.
  React.useEffect(() => {
    if (!surface.active) return;
    const canvas = canvasRef.current;
    if (!canvas || failedRef.current) return;
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
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
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );

    const detach = onContextLoss(canvas, () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      failedRef.current = true;
    });

    // A paint may already have landed while GL was spinning up — draw it
    // now instead of waiting for the next change.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
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

  // Pointer on the host: spring the reticle, sample the real DOM for the
  // readout, fade in and out, and throw ripples on click.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);
    const colorRgba = resolveColor(color, host);
    colorRef.current = [colorRgba[0], colorRgba[1], colorRgba[2]];

    const followTransition = follow >= 0.5 ? springs.snap : springs.glide;

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      if (!surfaceRef.current.motionSafe) {
        x.set(px);
        y.set(py);
      } else {
        animate(x, px, followTransition);
        animate(y, py, followTransition);
      }
      if (readout) {
        const el = document.elementFromPoint(event.clientX, event.clientY);
        readoutInfoRef.current = el
          ? {
              tag: el.tagName.toLowerCase(),
              text: (el.textContent ?? "")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 24),
              x: Math.round(px),
              y: Math.round(py),
            }
          : { tag: "—", text: "", x: Math.round(px), y: Math.round(py) };
      }
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
      if (!surfaceRef.current.motionSafe) opacity.set(1);
      else animate(opacity, 1, { duration: 0.18 });
    };
    const leave = () => {
      if (!surfaceRef.current.motionSafe) opacity.set(0);
      else animate(opacity, 0, { duration: 0.22 });
      readoutInfoRef.current = null;
      setReadoutInfo(null);
    };
    const down = (event: PointerEvent) => {
      if (!ripples || !surfaceRef.current.motionSafe) return;
      const rect = host.getBoundingClientRect();
      const list = ripplesRef.current;
      list.push({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        born: tickRef.current,
      });
      if (list.length > 4) list.shift();
      requestFrame();
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    host.addEventListener("pointerdown", down);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
      host.removeEventListener("pointerdown", down);
    };
  }, [
    surface.host,
    color,
    follow,
    readout,
    ripples,
    x,
    y,
    opacity,
    requestFrame,
  ]);

  // Wheel zoom: element-bound and non-passive (React's onWheel is passive),
  // armed only while `zoomModifier` is held so the page keeps its scroll.
  React.useEffect(() => {
    if (!scrollZoom) return;
    const host = surface.host;
    if (!host) return;
    const handleWheel = (event: WheelEvent) => {
      if (!modifierHeld(event, zoomModifier)) return;
      event.preventDefault();
      const next = clamp(
        zoomLevel.get() - event.deltaY * WHEEL_ZOOM_RATE,
        1,
        4,
      );
      if (surfaceRef.current.motionSafe)
        animate(zoomLevel, next, springs.glide);
      else zoomLevel.jump(next);
    };
    host.addEventListener("wheel", handleWheel, { passive: false });
    return () => host.removeEventListener("wheel", handleWheel);
  }, [scrollZoom, zoomModifier, surface.host, zoomLevel]);

  // The base `zoom` prop can change at runtime (no per-target zoom here to
  // pick it up implicitly, unlike crystal-lens) — track it explicitly.
  React.useEffect(() => {
    if (surfaceRef.current.motionSafe) animate(zoomLevel, zoom, springs.glide);
    else zoomLevel.jump(zoom);
  }, [zoom, zoomLevel]);

  // Commits the readout ref to state at a fixed ~10Hz tick, independent of
  // how often pointermove actually fires.
  React.useEffect(() => {
    if (!readout) return;
    const id = window.setInterval(() => {
      const next = readoutInfoRef.current;
      setReadoutInfo((prev) =>
        prev?.tag === next?.tag &&
        prev?.text === next?.text &&
        prev?.x === next?.x &&
        prev?.y === next?.y
          ? prev
          : next,
      );
    }, READOUT_TICK_MS);
    return () => window.clearInterval(id);
  }, [readout]);

  const PAD = 22;
  const half = size + PAD;
  const box = half * 2;
  const hudOpacity = useTransform(opacity, (o) => o * hud);
  const readoutX = useTransform(x, (v) => v + size + 18);
  const readoutY = useTransform(y, (v) => v - size);

  const tickSegments = React.useMemo(
    () => (ticks ? buildTicks(size, half) : []),
    [ticks, size, half],
  );
  const bracketPaths = React.useMemo(
    () => (brackets ? buildBrackets(size, half) : []),
    [brackets, size, half],
  );
  const gridClipId = `${uid}-scanner-grid`;

  if (!surface.active) return null;

  const info = readoutInfo ?? { tag: "—", text: "", x: 0, y: 0 };

  return (
    <>
      <canvas
        ref={canvasRef}
        data-effect-canvas="scanner-lens"
        className="block h-full w-full"
      />
      <motion.div
        style={{
          x,
          y,
          opacity: hudOpacity,
          marginLeft: -half,
          marginTop: -half,
          width: box,
          height: box,
        }}
        className="pointer-events-none absolute top-0 left-0"
      >
        <svg viewBox={`0 0 ${box} ${box}`} width={box} height={box}>
          {grid && (
            <>
              <clipPath id={gridClipId}>
                <circle cx={half} cy={half} r={size} />
              </clipPath>
              <g
                clipPath={`url(#${gridClipId})`}
                stroke={color}
                strokeWidth={1}
                opacity={0.35}
              >
                {[-0.5, 0, 0.5].map((f) => (
                  <line
                    key={`gv-${f}`}
                    x1={half + f * size}
                    y1={half - size}
                    x2={half + f * size}
                    y2={half + size}
                  />
                ))}
                {[-0.5, 0, 0.5].map((f) => (
                  <line
                    key={`gh-${f}`}
                    x1={half - size}
                    y1={half + f * size}
                    x2={half + size}
                    y2={half + f * size}
                  />
                ))}
              </g>
            </>
          )}
          <g stroke={color} strokeWidth={1} fill="none">
            {ring && <circle cx={half} cy={half} r={size} />}
            {crosshair && (
              <>
                <line x1={half - size} y1={half} x2={half - 14} y2={half} />
                <line x1={half + 14} y1={half} x2={half + size} y2={half} />
                <line x1={half} y1={half - size} x2={half} y2={half - 14} />
                <line x1={half} y1={half + 14} x2={half} y2={half + size} />
              </>
            )}
            {tickSegments.map((seg, i) => (
              <line key={i} x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} />
            ))}
            {bracketPaths.map((bracket, i) => (
              <path key={i} d={bracket.d} strokeLinecap="round" />
            ))}
          </g>
          {dot && <circle cx={half} cy={half} r={2} fill={color} />}
        </svg>
      </motion.div>
      {readout && (
        <motion.div
          style={{ x: readoutX, y: readoutY, opacity }}
          className="pointer-events-none absolute top-0 left-0 min-w-28 rounded-1 border border-hairline bg-surface-0/85 px-2 py-1 font-mono text-[10px] leading-tight backdrop-blur-sm"
        >
          <div className="text-ink">&lt;{info.tag}&gt;</div>
          <div className="max-w-40 truncate text-ink-2">{info.text || "—"}</div>
          <div className="text-ink-3 tabular-nums">
            {info.x}, {info.y}
          </div>
        </motion.div>
      )}
    </>
  );
}

/**
 * A scanner that follows the cursor and magnifies the painted interface
 * inside a HUD reticle — ring, crosshair, ticks, corner brackets, a centre
 * dot — with per-channel aberration fringing the rim and a haze thinning
 * toward the edge. A mono readout beside the reticle names the element
 * under the pointer straight off the real DOM via `elementFromPoint`, not
 * the painted texture, so it always reads what is actually there. Clicks
 * throw a ripple that bends the magnified image radially and glows as it
 * grows, aging off a deterministic frame-tick clock rather than the wall
 * clock. Hold `zoomModifier` and turn the wheel to dial the zoom between 1
 * and 4 when `scrollZoom` is on. The optics are one fragment shader over
 * the painted texture; the reticle and readout are DOM/SVG layered above it
 * for crisp strokes and legible type.
 * Reduced motion: the reticle snaps to the pointer instead of springing,
 * new ripples are suppressed, and magnification still applies.
 */
export function ScannerLens({
  size = 140,
  zoom = 1.5,
  scrollZoom = false,
  zoomModifier = "shift",
  color = "var(--primary)",
  follow = 0.25,
  hud = 0.8,
  ring = true,
  crosshair = true,
  ticks = true,
  brackets = true,
  dot = true,
  grid = false,
  readout = true,
  aberration = 0.35,
  haze = 0.2,
  ripples = true,
  rippleSpeed = 900,
  rippleBendWidth = 100,
  rippleBend = 20,
  rippleGlow = 1,
  rippleLife = 1.4,
  paint,
  className,
  children,
}: ScannerLensProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn("cursor-none", className)}
      effect={
        <LensLayer
          size={size}
          zoom={zoom}
          scrollZoom={scrollZoom}
          zoomModifier={zoomModifier}
          color={color}
          follow={follow}
          hud={hud}
          ring={ring}
          crosshair={crosshair}
          ticks={ticks}
          brackets={brackets}
          dot={dot}
          grid={grid}
          readout={readout}
          aberration={aberration}
          haze={haze}
          ripples={ripples}
          rippleSpeed={rippleSpeed}
          rippleBendWidth={rippleBendWidth}
          rippleBend={rippleBend}
          rippleGlow={rippleGlow}
          rippleLife={rippleLife}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
