"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

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
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type PageCurlCorner = "tl" | "tr" | "bl" | "br";

export type PageCurlProps = {
  /** Which corner curls. @default "br" */
  corner?: PageCurlCorner;
  /** The curl's cylinder radius in CSS pixels. @default 70 */
  radius?: number;
  /** How far hovering near the corner lifts it, in CSS pixels (sprung). @default 36 */
  hoverLift?: number;
  /** Colour tint for the page's back, shown through the curl. @default "#f3f0e8" */
  back?: string;
  /** Shadow strength cast by the curl onto the ground it reveals (0..1). @default 0.45 */
  shadow?: number;
  /** Fill colour where the painted texture is transparent; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

/** How close the pointer must be to the corner, in CSS px, for a hover lift
 * or a drag to start. */
// Wide enough that a drag from most of the sheet finds the corner.
const HOVER_RADIUS = 260;

const CORNER_SIGN: Record<PageCurlCorner, readonly [number, number]> = {
  tl: [0, 0],
  tr: [1, 0],
  bl: [0, 1],
  br: [1, 1],
};

// The direction a hover-lift nudges the corner: away from the corner,
// diagonally into the page.
const CORNER_DIAG: Record<PageCurlCorner, readonly [number, number]> = {
  tl: [Math.SQRT1_2, Math.SQRT1_2],
  tr: [-Math.SQRT1_2, Math.SQRT1_2],
  bl: [Math.SQRT1_2, -Math.SQRT1_2],
  br: [-Math.SQRT1_2, -Math.SQRT1_2],
};

/** The corner's position in host-relative CSS px, given the host's size. */
function cornerPoint(
  corner: PageCurlCorner,
  width: number,
  height: number,
): readonly [number, number] {
  const sign = CORNER_SIGN[corner];
  return [sign[0] * width, sign[1] * height];
}

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec2 u_corner;
uniform vec2 u_offset;
uniform float u_radius;
uniform vec3 u_back;
uniform float u_shadow;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

const float PI = 3.14159265;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  float r = length(u_offset);
  vec2 n = r > 0.0001 ? u_offset / r : vec2(0.0, -1.0);
  vec2 mid = u_corner + u_offset * 0.5;

  // Signed distance from this pixel to the fold line, measured along the
  // normal that points from the corner inward: negative on the flat side,
  // zero at the crease, growing through the curled band and past it.
  float d = dot(mid - px, n);

  float R = max(u_radius, 1.0);
  float curlEnd = PI * R;

  vec3 flatColor = sampleOver(v_uv);

  // The curled band: the sheet wraps a cylinder of radius R, so the
  // visible surface is the page's back. A straight mirror across the fold
  // line stands in for the true unrolled sample — simple, and continuous
  // with the flat sample at d = 0.
  float theta = clamp(d, 0.0, curlEnd) / R;
  vec2 mirrored = px + 2.0 * d * n;
  vec3 backSample = sampleOver(mirrored / u_res);
  // Brightest tangent to the page (theta 0 and theta PI), darkest edge-on
  // at the crown of the roll (theta PI/2) — a cheap stand-in for real
  // cylinder shading.
  float shade = mix(1.0, 0.5, sin(theta));
  vec3 curlColor = mix(backSample, u_back, 0.85) * shade;

  // Past the curl the sheet has lifted clear: the ground shows through,
  // darkened by a shadow that fades with distance from the roll's edge.
  float shadowAmt = u_shadow * exp(-max(d - curlEnd, 0.0) / 24.0);
  vec3 groundColor = mix(u_bg.rgb, vec3(0.0), shadowAmt);

  float toCurl = r > 0.0001 ? smoothstep(-1.0, 1.0, d) : 0.0;
  float toGround = r > 0.0001 ? smoothstep(curlEnd - 1.0, curlEnd + 1.0, d) : 0.0;

  vec3 c = mix(flatColor, curlColor, toCurl);
  c = mix(c, groundColor, toGround);
  o_color = vec4(c, 1.0);
}
`;

type CurlLayerProps = Required<
  Pick<PageCurlProps, "corner" | "radius" | "hoverLift" | "back" | "shadow">
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so a
 * transparent region of the painted texture composites onto the page rather
 * than onto black. */
function effectiveBackground(
  el: HTMLElement | null,
): [number, number, number, number] {
  let node: HTMLElement | null = el;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    const rgba = resolveColor(bg, node);
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

/**
 * The GL layer. Owns the context, the program, the texture, the fold
 * offset spring and the frame loop; reads everything else from the
 * surface.
 */
function CurlLayer({
  corner,
  radius,
  hoverLift,
  back,
  shadow,
  background,
}: CurlLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // The fold point, expressed as an offset from the resting corner. Zero
  // means flat; the shader treats it as a fold line through the midpoint
  // of corner + offset, perpendicular to it.
  const offsetX = useMotionValue<number>(0);
  const offsetY = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const backRef = React.useRef<[number, number, number]>([0.95, 0.94, 0.91]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ corner, radius, hoverLift, shadow });
  React.useEffect(() => {
    paramsRef.current = { corner, radius, hoverLift, shadow };
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

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;
    const p = paramsRef.current;
    const bg = bgRef.current;
    const cornerPx = cornerPoint(p.corner, cssW, cssH);

    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_corner: [cornerPx[0], cornerPx[1]],
      u_offset: [offsetX.get(), offsetY.get()],
      u_radius: p.radius,
      u_back: backRef.current,
      u_shadow: p.shadow,
      u_bg: bg,
    });
    tri.draw();
  }, [offsetX, offsetY]);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint), so this is keyed on surface.active,
  // not on mount: a mount-only effect would run against no canvas at all.
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
    // A paint may already be waiting: draw the flat, undisturbed sheet now
    // rather than on the first hover.
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

  // The fold offset asks for a frame on every spring tick, and stops
  // asking once motion's animate settles — no loop lives here.
  React.useEffect(() => {
    const unsubs = [offsetX, offsetY].map((mv) =>
      mv.on("change", requestFrame),
    );
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [offsetX, offsetY, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Pointer on the host: hover near the corner lifts it a little, a
  // pointerdown anywhere on the sheet grabs the corner (the fold moves by
  // the pointer's travel from where it was grabbed, so nothing jumps), and
  // release springs back to the hover lift (still near) or flat (not).
  // The pointer is captured only once a real drag begins, so a plain click
  // still reaches the controls under the sheet.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    const backRgba = resolveColor(back, host);
    backRef.current = [backRgba[0], backRgba[1], backRgba[2]];

    let dragging = false;
    let captured = false;
    let pointerId: number | null = null;
    let near = false;
    let grabX = 0;
    let grabY = 0;
    let baseX = 0;
    let baseY = 0;

    const settle = () => {
      const p = paramsRef.current;
      const diag = CORNER_DIAG[p.corner];
      const targetX = near ? p.hoverLift * diag[0] : 0;
      const targetY = near ? p.hoverLift * diag[1] : 0;
      animate(offsetX, targetX, springs.glide);
      animate(offsetY, targetY, springs.glide);
    };

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const p = paramsRef.current;
      const c = cornerPoint(p.corner, rect.width, rect.height);

      if (dragging && event.pointerId === pointerId) {
        const dx = px - grabX;
        const dy = py - grabY;
        if (!captured && Math.hypot(dx, dy) > 4) {
          host.setPointerCapture(event.pointerId);
          captured = true;
        }
        animate(offsetX, baseX + dx, springs.snap);
        animate(offsetY, baseY + dy, springs.snap);
        return;
      }

      const nowNear = Math.hypot(px - c[0], py - c[1]) <= HOVER_RADIUS;
      if (nowNear !== near) {
        near = nowNear;
        settle();
      }
    };

    const down = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const p = paramsRef.current;
      const c = cornerPoint(p.corner, rect.width, rect.height);
      const nearCorner = Math.hypot(px - c[0], py - c[1]) <= HOVER_RADIUS;
      dragging = true;
      near = true;
      captured = false;
      pointerId = event.pointerId;
      grabX = px;
      grabY = py;
      if (nearCorner) {
        // Grabbed at the corner: the fold sits under the pointer.
        baseX = 0;
        baseY = 0;
        grabX = c[0];
        grabY = c[1];
        animate(offsetX, px - c[0], springs.snap);
        animate(offsetY, py - c[1], springs.snap);
      } else {
        // Grabbed on the sheet: the corner follows the pointer's travel.
        baseX = offsetX.get();
        baseY = offsetY.get();
      }
    };

    const up = (event: PointerEvent) => {
      if (!dragging || event.pointerId !== pointerId) return;
      dragging = false;
      if (captured && host.hasPointerCapture(event.pointerId)) {
        host.releasePointerCapture(event.pointerId);
      }
      captured = false;
      pointerId = null;
      const rect = host.getBoundingClientRect();
      const p = paramsRef.current;
      const c = cornerPoint(p.corner, rect.width, rect.height);
      near =
        Math.hypot(
          event.clientX - rect.left - c[0],
          event.clientY - rect.top - c[1],
        ) <= HOVER_RADIUS;
      settle();
    };

    const leave = () => {
      if (dragging) return;
      near = false;
      settle();
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerdown", down);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointercancel", up);
    host.addEventListener("pointerleave", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointercancel", up);
      host.removeEventListener("pointerleave", leave);
    };
  }, [surface.host, background, back, offsetX, offsetY]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="page-curl"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface as a sheet whose corner can be lifted and dragged like
 * paper. Hovering near the chosen corner springs it up a little; grabbing
 * it and dragging folds the sheet along the perpendicular bisector between
 * the corner and the pointer, so the corner always lands under the cursor.
 * The fold is one analytic cylinder in the fragment shader — a signed
 * distance to that fold line, not a mesh: flat page on one side, the
 * page's own tinted back shaded around the curl in the middle, and past
 * the wrap the ground shows through with a soft shadow. Release and the
 * fold springs back to the hover lift or flat.
 * Reduced motion: this layer renders nothing and the real, flat DOM shows
 * at full opacity.
 */
export function PageCurl({
  corner = "br",
  radius = 70,
  hoverLift = 36,
  back = "#f3f0e8",
  shadow = 0.45,
  background,
  paint,
  className,
  children,
}: PageCurlProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <CurlLayer
          corner={corner}
          radius={radius}
          hoverLift={hoverLift}
          back={back}
          shadow={shadow}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
