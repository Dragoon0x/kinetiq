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
import { springs } from "@/registry/lib/motion";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type HexFloorProps = {
  /** Hex cell size in CSS pixels. @default 26 */
  cell?: number;
  /** Peak prism height in CSS pixels. @default 7 */
  height?: number;
  /** Idle breathing strength (0..1-ish) and the continuous-loop gate — 0 stills the wave and stops the rAF loop entirely; the cursor spring alone then asks for frames. @default 0.5 */
  idle?: number;
  /** Flatten radius around the cursor, in CSS pixels. @default 200 */
  radius?: number;
  /** Fraction of `radius` spent easing into the flatten; 0 is a hard edge, 1 spreads it across the whole radius. @default 0.6 */
  softness?: number;
  /** Floor tilt in degrees about the x axis. @default 22 */
  tilt?: number;
  /** Side-face darkening (0..1). @default 0.1 */
  shading?: number;
  /** Fill colour override; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_cell;
uniform float u_height;
uniform float u_idle;
uniform float u_radius;
uniform float u_softness;
uniform float u_tilt;
uniform float u_shading;
uniform vec2 u_cursor;
uniform float u_time;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// Exact signed distance to a regular hexagon (negative inside), circumradius r.
// The same construction shield-field uses for its own hex lattice.
float sdHexagon(vec2 p, float r) {
  const vec3 k = vec3(-0.8660254, 0.5, 0.5773503);
  vec2 q = abs(p);
  q -= 2.0 * min(dot(k.xy, q), 0.0) * k.xy;
  q -= vec2(clamp(q.x, -k.z * r, k.z * r), r);
  return length(q) * sign(q.y);
}

// Hex lattice: nearest centre via two offset square grids (the standard
// two-grid trick), then the exact hexagon SDF for the edge distance.
// Returns cell centre (.xy) and distance to the cell edge (.z, 0 outside).
vec3 hexCell(vec2 p, float r) {
  vec2 c = vec2(r * 1.7320508, r * 1.5);
  vec2 a = mod(p, c) - c * 0.5;
  vec2 b = mod(p - c * 0.5, c) - c * 0.5;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  vec2 center = p - gv;
  float edge = max(0.0, -sdHexagon(gv, r));
  return vec3(center, edge);
}

// Seeded per-cell prism height, in px: a fixed range from the cell's own
// hash, a slow breathing wave blended in by u_idle, and pulled to zero
// (flat) near the cursor so whatever is under the pointer always reads
// clearly, however tall the floor stands elsewhere.
float cellHeight(vec2 center, vec2 cursorPlane) {
  float hash = kx_hash(center);
  float base = 0.35 + 0.65 * hash;
  float breathe = mix(
    1.0,
    0.85 + 0.15 * sin(u_time + hash * 6.28318),
    clamp(u_idle, 0.0, 1.0)
  );
  float inner = u_radius * clamp(1.0 - u_softness, 0.0, 1.0);
  float outer = max(u_radius, inner + 1.0);
  // Standard smoothstep(inner, outer, dist) — 0 (flat) inside the flatten
  // radius, 1 (full height) beyond it. GLSL leaves edge0 >= edge1 undefined,
  // so the low-to-high order here is deliberate, not the spec's raw phrasing.
  float flatten = smoothstep(inner, outer, distance(center, cursorPlane));
  return u_height * base * breathe * flatten;
}

void main() {
  vec2 px = v_uv * u_res;
  float tiltRad = radians(u_tilt);
  float cosT = max(cos(tiltRad), 0.05);
  float sinT = sin(tiltRad);
  float cy = u_res.y * 0.5;

  // View transform: undo the "scale y by cos(tilt) about the centre" fake
  // tilt to recover the untilted plane pixel the hex cells and heights are
  // measured in. The per-row parallax the tilt implies is exactly the
  // per-cell extrusion offset below, so it is not a separate term here.
  vec2 plane = vec2(px.x, (px.y - cy) / cosT + cy);
  vec2 cursorPlane = vec2(u_cursor.x, (u_cursor.y - cy) / cosT + cy);

  float cellR = max(u_cell, 1.0) * 0.5;
  vec3 cell = hexCell(plane, cellR);
  float h = cellHeight(cell.xy, cursorPlane);

  // EXTRUSION as parallax, side face: raymarch straight up from this pixel
  // looking for the seam into the cell above. If that neighbour stands tall
  // enough for its wall to reach this far down, this pixel belongs to its
  // side, not this cell's own top.
  float maxWall = u_height * sinT;
  bool onWall = false;
  vec3 wallCell = vec3(0.0);
  float wallH = 0.0;
  if (maxWall > 0.5) {
    const int WALL_STEPS = 6;
    for (int i = 1; i <= WALL_STEPS; i++) {
      float o = maxWall * float(i) / float(WALL_STEPS);
      vec3 probeCell = hexCell(plane - vec2(0.0, o), cellR);
      if (distance(probeCell.xy, cell.xy) > 0.5) {
        float probeH = cellHeight(probeCell.xy, cursorPlane);
        if (o <= probeH * sinT) {
          onWall = true;
          wallCell = probeCell;
          wallH = probeH;
        }
        break;
      }
    }
  }

  vec3 color;
  if (onWall) {
    vec2 wallUV = (wallCell.xy + vec2(0.0, wallH * sinT)) / u_res;
    color = sampleOver(wallUV) * (1.0 - 0.45 * clamp(u_shading, 0.0, 1.0));
  } else {
    // EXTRUSION as parallax, top face: sample the content that would sit
    // below this pixel by the prism's own rise, so a raised cell reads as
    // content pulled up toward the viewer.
    vec2 topUV = (plane + vec2(0.0, h * sinT)) / u_res;
    color = sampleOver(topUV) + h * 0.002;
    float seam = 1.0 - smoothstep(0.0, 1.5, cell.z);
    color *= mix(1.0, 0.97, seam);
  }

  o_color = vec4(color, 1.0);
}
`;

type HexFloorLayerProps = Required<
  Pick<
    HexFloorProps,
    "cell" | "height" | "idle" | "radius" | "softness" | "tilt" | "shading"
  >
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so the
 * floor fills its transparent regions with the page rather than black —
 * the same probe crystal-lens and dust-reveal use for their own backdrop. */
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

// Sentinel cursor position, far enough outside any canvas that the flatten
// radius never reaches it — the same off-screen relax dust-reveal uses.
const OFFSCREEN = -9999;

/**
 * The GL layer. Owns the context, the program, the texture, the pointer
 * spring, the idle-breathing tick and the frame loop; reads everything else
 * from the surface.
 */
function HexFloorLayer({
  cell,
  height,
  idle,
  radius,
  softness,
  tilt,
  shading,
  background,
}: HexFloorLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(OFFSCREEN);
  const y = useMotionValue<number>(OFFSCREEN);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    cell,
    height,
    idle,
    radius,
    softness,
    tilt,
    shading,
  });
  React.useEffect(() => {
    paramsRef.current = { cell, height, idle, radius, softness, tilt, shading };
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
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_cell: p.cell,
      u_height: p.height,
      u_idle: p.idle,
      u_radius: p.radius,
      u_softness: p.softness,
      u_tilt: p.tilt,
      u_shading: p.shading,
      u_cursor: [x.get(), y.get()],
      u_time: tickRef.current,
      u_bg: bg,
    });
    tri.draw();
  }, [x, y]);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint, and only under motion-safe conditions in
  // this replace-mode effect), so this is keyed on `surface.active`, not on
  // mount — a mount-only effect would run against no canvas at all.
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
    // pointer move or idle tick.
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

  // Every motion-value change and every completed paint asks for a frame —
  // this alone covers the whole effect whenever the idle loop below is
  // stopped (idle is 0).
  React.useEffect(() => {
    const unsubs = [x, y].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The idle-breathing loop: a rAF tick that only exists to advance u_time
  // and redraw every frame while the seeded wave should be breathing. Gated
  // the same way as the GL effect (only while the surface is active) plus
  // IntersectionObserver/visibilitychange, and stopped outright when there
  // is no idle strength to animate — dust-reveal's loop shape.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host || idle <= 0) return;

    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let inView = false;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (started === null) started = now;
      tickRef.current = (now - started) / 1000;
      drawFrame();
    };

    const syncLoop = () => {
      const shouldRun = inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so the wave resumes, not jumps.
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
  }, [surface.active, surface.host, idle, drawFrame]);

  // Pointer on the host: spring the cursor toward the flatten point, snap it
  // in on entry so the first flatten never sweeps in from the offscreen
  // sentinel, and spring it back out on exit so the floor relaxes to full
  // height rather than jumping.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background)
      : effectiveBackground(host);

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      animate(x, event.clientX - rect.left, springs.snap);
      animate(y, event.clientY - rect.top, springs.snap);
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
    };
    const leave = () => {
      animate(x, OFFSCREEN, springs.snap);
      animate(y, OFFSCREEN, springs.snap);
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
    };
  }, [surface.host, background, x, y]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="hex-floor"
      className="block h-full w-full"
    />
  );
}

/**
 * A floor of hexagonal prisms laid under the interface and viewed at a
 * shallow tilt: each cell stands at a seeded height and breathes on a slow
 * wave, its top read back as a parallax offset into the same texture — no
 * mesh, no vertices, just a per-hex sample shift and a darker seam at each
 * boundary. Near the cursor every prism flattens into the page, so whatever
 * sits under the pointer reads flush while the rest of the floor stands in
 * relief around it; move away and the relief returns. The tilt itself is a
 * fake: the plane is squashed vertically about its centre, and every
 * prism's rise is read back into that squashed space, so the whole floor
 * costs one fragment shader over one fullscreen triangle.
 * Reduced motion: the real DOM shows flat and this layer renders nothing.
 */
export function HexFloor({
  cell = 26,
  height = 7,
  idle = 0.5,
  radius = 200,
  softness = 0.6,
  tilt = 22,
  shading = 0.1,
  background,
  paint,
  className,
  children,
}: HexFloorProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <HexFloorLayer
          cell={cell}
          height={height}
          idle={idle}
          radius={radius}
          softness={softness}
          tilt={tilt}
          shading={shading}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
