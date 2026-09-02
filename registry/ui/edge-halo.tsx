"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import {
  FULLSCREEN_VERTEX,
  GLSL_LUMA,
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
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type EdgeHaloProps = {
  /** CSS selector for elements the halo can outline. @default "button, a, [role=button], tr, li, h1, h2, h3" */
  selector?: string;
  /** Padding around the target's rect, in CSS pixels. @default 6 */
  padding?: number;
  /** Halo colour, any CSS colour — tokens resolve against the host. @default "var(--primary)" */
  color?: string;
  /** Breathing amplitude (0..1) the glow swings around its base intensity while a box is held. @default 0.25 */
  breath?: number;
  /** Flat wash alpha inside the padded box, under the edge glow. @default 0.06 */
  fill?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec4 u_box;
uniform vec3 u_color;
uniform float u_breath;
uniform float u_fill;
uniform float u_presence;
uniform float u_tick;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_LUMA}

const float RADIUS = 8.0;
const float BLUR_STEP = 1.6;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

float lumaAt(vec2 px, vec2 offset) {
  return kx_luma(sampleOver((px + offset) / u_res));
}

// 3x3 Sobel edge magnitude over luminance, centred at px.
float sobelEdge(vec2 px) {
  float tl = lumaAt(px, vec2(-1.0, -1.0));
  float tc = lumaAt(px, vec2(0.0, -1.0));
  float tr = lumaAt(px, vec2(1.0, -1.0));
  float ml = lumaAt(px, vec2(-1.0, 0.0));
  float mr = lumaAt(px, vec2(1.0, 0.0));
  float bl = lumaAt(px, vec2(-1.0, 1.0));
  float bc = lumaAt(px, vec2(0.0, 1.0));
  float br = lumaAt(px, vec2(1.0, 1.0));
  float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  return length(vec2(gx, gy));
}

float sdRoundBox(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 boxHalf = max(u_box.zw, vec2(0.0)) * 0.5;
  vec2 boxCenter = u_box.xy + boxHalf;
  float radius = min(RADIUS, min(boxHalf.x, boxHalf.y));
  float sdf = sdRoundBox(px - boxCenter, boxHalf, radius);
  float mask = 1.0 - smoothstep(-1.0, 1.0, sdf);
  if (mask <= 0.0 || u_presence <= 0.001) { o_color = vec4(0.0); return; }

  // A 5-tap, plus-shaped blur of the edge signal, softening it into a glow.
  float edge = sobelEdge(px) * 0.4
    + sobelEdge(px + vec2(BLUR_STEP, 0.0)) * 0.15
    + sobelEdge(px - vec2(BLUR_STEP, 0.0)) * 0.15
    + sobelEdge(px + vec2(0.0, BLUR_STEP)) * 0.15
    + sobelEdge(px - vec2(0.0, BLUR_STEP)) * 0.15;

  float breathe = u_still > 0.5 ? 1.0 : (1.0 + sin(u_tick * 2.0) * u_breath);
  float glow = edge * breathe;

  float alpha = clamp((glow + u_fill) * u_presence * mask, 0.0, 1.0);
  o_color = vec4(u_color, alpha);
}
`;

type HaloLayerProps = Required<
  Pick<EdgeHaloProps, "selector" | "padding" | "color" | "breath" | "fill">
>;

/** Walks up from the host to the first opaque background colour, so a
 * transparent texel composites onto the page rather than onto black — the
 * same probe crystal-lens uses for its own backdrop. */
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

/**
 * The GL layer. Owns the context, the program, the texture, the
 * pointer-tracked box springs, the presence fade, and the breathing loop;
 * reads everything else from the surface.
 */
function HaloLayer({ selector, padding, color, breath, fill }: HaloLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(0);
  const y = useMotionValue<number>(0);
  const w = useMotionValue<number>(0);
  const h = useMotionValue<number>(0);
  const presence = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const colorRef = React.useRef<[number, number, number]>([1, 1, 1]);
  const tickRef = React.useRef(0);
  const hadTargetRef = React.useRef(false);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ selector, padding, breath, fill });
  React.useEffect(() => {
    paramsRef.current = { selector, padding, breath, fill };
  });

  // One frame: upload the texture if a new paint landed, then draw.
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
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_box: [x.get(), y.get(), w.get(), h.get()],
      u_color: colorRef.current,
      u_breath: p.breath,
      u_fill: p.fill,
      u_presence: presence.get(),
      u_tick: tickRef.current,
      u_still: live.motionSafe ? 0 : 1,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, [x, y, w, h, presence]);

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
      failedRef.current = true;
    });
    // A paint may already be waiting: draw it now rather than on the next
    // pointer move.
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

  // Every motion-value change and every completed paint asks for a frame.
  React.useEffect(() => {
    const unsubs = [x, y, w, h, presence].map((mv) =>
      mv.on("change", requestFrame),
    );
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, w, h, presence, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The breathing loop: while a box is present it ticks the clock and
  // redraws every frame, so the glow pulses on its own; it stops the moment
  // presence has faded back to 0 after the pointer leaves. A plain local
  // function that re-arms itself, never a self-referential callback.
  React.useEffect(() => {
    if (!surface.active || !surface.motionSafe) return;

    let raf = 0;
    let started: number | null = null;

    const tick = (now: number) => {
      if (started === null) started = now;
      tickRef.current = (now - started) / 1000;
      drawFrame();
      raf = presence.get() > 0.001 ? requestAnimationFrame(tick) : 0;
      if (raf === 0) started = null;
    };

    const start = () => {
      if (raf === 0) raf = requestAnimationFrame(tick);
    };

    const unsub = presence.on("change", (value) => {
      if (value > 0.001) start();
    });
    if (presence.get() > 0.001) start();

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      unsub();
    };
  }, [surface.active, surface.motionSafe, presence, drawFrame]);

  // Pointer on the host: find the element under the cursor, spring the box
  // to its padded rect, and fade presence in and out around it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);
    const rgba = resolveColor(color, host);
    colorRef.current = [rgba[0], rgba[1], rgba[2]];

    const move = (event: PointerEvent) => {
      const still = !surfaceRef.current.motionSafe;
      const found = document.elementFromPoint(event.clientX, event.clientY);
      const target = found?.closest(paramsRef.current.selector) ?? null;

      if (!target) {
        hadTargetRef.current = false;
        if (still) presence.set(0);
        else if (presence.get() > 0.001)
          animate(presence, 0, { duration: 0.22 });
        return;
      }

      const hostRect = host.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const pad = paramsRef.current.padding;
      const boxX = rect.left - hostRect.left - pad;
      const boxY = rect.top - hostRect.top - pad;
      const boxW = rect.width + pad * 2;
      const boxH = rect.height + pad * 2;

      if (!hadTargetRef.current || still) {
        x.jump(boxX);
        y.jump(boxY);
        w.jump(boxW);
        h.jump(boxH);
      } else {
        animate(x, boxX, springs.snap);
        animate(y, boxY, springs.snap);
        animate(w, boxW, springs.snap);
        animate(h, boxH, springs.snap);
      }
      hadTargetRef.current = true;

      if (still) presence.set(1);
      else if (presence.get() < 0.999) animate(presence, 1, { duration: 0.18 });
    };

    const leave = () => {
      hadTargetRef.current = false;
      if (!surfaceRef.current.motionSafe) presence.set(0);
      else animate(presence, 0, { duration: 0.22 });
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
    };
  }, [surface.host, color, x, y, w, h, presence]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="edge-halo"
      className="block h-full w-full"
    />
  );
}

/**
 * Outlines whatever sits under the pointer without touching its pixels: a
 * padded, rounded box tracks the element `elementFromPoint` and `closest`
 * resolve — a button, a link, a table row, a heading — while its content
 * edges are read straight off the painted texture with a 3x3 Sobel filter
 * over luminance, blurred into a soft glow, and tinted the halo colour. A
 * flat wash at `fill` sits under the glow, and the whole halo breathes on a
 * slow sine for as long as a target is held, quieting the instant the
 * pointer moves off. The box springs to a new target on `springs.snap` and
 * jumps straight there the first time a target is acquired, so it never
 * drags in from a stale position.
 * Reduced motion: the box still tracks the pointer, but it jumps instead of
 * springing and the glow holds steady with no breathing.
 */
export function EdgeHalo({
  selector = "button, a, [role=button], tr, li, h1, h2, h3",
  padding = 6,
  color = "var(--primary)",
  breath = 0.25,
  fill = 0.06,
  paint,
  className,
  children,
}: EdgeHaloProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <HaloLayer
          selector={selector}
          padding={padding}
          color={color}
          breath={breath}
          fill={fill}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
