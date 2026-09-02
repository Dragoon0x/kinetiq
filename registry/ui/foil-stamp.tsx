"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import {
  FULLSCREEN_VERTEX,
  GLSL_LUMA,
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

export type FoilStampProps = {
  /** Luma cutoff where ink starts reading as foil; raise it to keep only the darkest strokes. @default 0.35 */
  threshold?: number;
  /** Foil colour. CSS, tokens included; resolved with resolveColor. @default "#d4af37" */
  foil?: string;
  /** Specular highlight strength at the light's own reflection. @default 0.8 */
  shine?: number;
  /** Glint density along the stamped edges (0..1-ish). @default 0.6 */
  sparkle?: number;
  /** Fill colour behind transparent texture regions; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
${GLSL_LUMA}
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec2 u_pointer;
uniform float u_threshold;
uniform vec3 u_foil;
uniform float u_shine;
uniform float u_sparkle;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 pageAt(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// The foil mask: a fully transparent texel, or a page pixel within 0.04 of
// the background colour, stays bare. Everything else reads as foil in
// proportion to how dark it is, so the darkest ink crosses the threshold
// first and pale ink stays plain.
float maskAt(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  if (t.a < 0.01) return 0.0;
  vec3 page = mix(u_bg.rgb, t.rgb, t.a);
  if (distance(page, u_bg.rgb) < 0.04) return 0.0;
  float th = clamp(u_threshold, 0.0, 0.999);
  return smoothstep(th, 1.0, 1.0 - kx_luma(page));
}

// A 3-tap blur of the mask along the pixel diagonal, sampled before its own
// gradient is taken, so the stamped edge bends light like relief rather than
// creasing at the hard edge the smoothstep alone would leave.
float blurredMaskAt(vec2 uv, vec2 d) {
  return (maskAt(uv - d) + maskAt(uv) + maskAt(uv + d)) / 3.0;
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 texel = 1.0 / u_res;
  vec2 blurStep = texel;

  float f = maskAt(v_uv);

  float gx = (blurredMaskAt(v_uv + vec2(texel.x, 0.0), blurStep) -
              blurredMaskAt(v_uv - vec2(texel.x, 0.0), blurStep)) * 1.5;
  float gy = (blurredMaskAt(v_uv + vec2(0.0, texel.y), blurStep) -
              blurredMaskAt(v_uv - vec2(0.0, texel.y), blurStep)) * 1.5;
  vec3 n = normalize(vec3(-gx, -gy, 1.0));

  vec3 L = normalize(vec3(u_pointer - px, 300.0));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);

  vec3 reflection = u_foil * (0.5 + 0.5 * dot(n, L)) +
    vec3(1.0) * pow(max(dot(n, H), 0.0), 40.0) * u_shine;

  // Sparkle rides the mask's own edge, where its gradient is steep, so the
  // twinkle traces the stamp's rim instead of scattering across flat foil.
  float edge = length(vec2(gx, gy));
  if (edge > 0.15) {
    vec2 cell = floor(px / 3.0);
    if (kx_hash(cell) > 0.96) {
      reflection += vec3(1.0) * u_sparkle * pow(max(dot(n, L), 0.0), 8.0);
    }
  }

  vec3 page = pageAt(v_uv);
  vec3 color = mix(page, reflection, f);
  o_color = vec4(color, 1.0);
}
`;

type FoilLayerProps = Required<
  Pick<FoilStampProps, "threshold" | "foil" | "shine" | "sparkle">
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so a
 * sample over a transparent texture region composites onto the page rather
 * than onto black. Mirrors crystal-lens's `effectiveBackground`. */
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
 * The GL layer. Owns the context, the program, the page texture, the
 * pointer spring, and the frame loop; reads everything else from the
 * surface.
 */
function FoilLayer({
  threshold,
  foil,
  shine,
  sparkle,
  background,
}: FoilLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(0);
  const y = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const foilRef = React.useRef<[number, number, number]>([0.83, 0.69, 0.22]);
  const seededRef = React.useRef(false);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ threshold, shine, sparkle });
  React.useEffect(() => {
    paramsRef.current = { threshold, shine, sparkle };
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
      u_pointer: [x.get(), y.get()],
      u_threshold: p.threshold,
      u_foil: foilRef.current,
      u_shine: p.shine,
      u_sparkle: p.sparkle,
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
  // replace mode), so this is keyed on `surface.active`, not on mount — a
  // mount-only effect would run against no canvas at all.
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

  // Every pointer-spring tick asks for a frame; once the spring settles the
  // motion values stop emitting "change" and the loop goes quiet on its
  // own — it wakes again only on the next pointer move.
  React.useEffect(() => {
    const unsubs = [x, y].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Colours resolved against the host, and the pointer seeded to the host's
  // own centre once, so the first paint is already lit before any hover.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    const rgba = resolveColor(foil, host);
    foilRef.current = [rgba[0], rgba[1], rgba[2]];
    if (!seededRef.current) {
      seededRef.current = true;
      const rect = host.getBoundingClientRect();
      x.jump(rect.width / 2);
      y.jump(rect.height / 2);
    }
    requestFrame();
  }, [surface.active, surface.host, background, foil, x, y, requestFrame]);

  // Pointer on the host springs the light toward it on `springs.glide`; the
  // "change" subscription above keeps the loop running until the spring
  // settles, then it stops on its own.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;
    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      animate(x, px, springs.glide);
      animate(y, py, springs.glide);
    };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerenter", move);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerenter", move);
    };
  }, [surface.active, surface.host, x, y]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="foil-stamp"
      className="block h-full w-full"
    />
  );
}

/**
 * The page's own ink reads as hot-stamped foil under a raking light that
 * follows the pointer. A mask built from the painted texture's luminance
 * decides what counts as foil — the darkest strokes cross the threshold
 * first, the bare page and any transparent texel stay plain — and a blurred
 * copy of that same mask supplies its own surface normal, so the stamp has
 * relief without any actual geometry underneath it. The light position is a
 * spring on the wrapper's pointer, never on the canvas: it eases toward the
 * cursor on `springs.glide`, and the frame loop wakes on every spring tick
 * and goes quiet the moment the light settles.
 * Reduced motion: `SurfacePaint`'s replace-mode contract handles it — the
 * real DOM shows at full opacity and this layer renders nothing.
 */
export function FoilStamp({
  threshold = 0.35,
  foil = "#d4af37",
  shine = 0.8,
  sparkle = 0.6,
  background,
  paint,
  className,
  children,
}: FoilStampProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <FoilLayer
          threshold={threshold}
          foil={foil}
          shine={shine}
          sparkle={sparkle}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
