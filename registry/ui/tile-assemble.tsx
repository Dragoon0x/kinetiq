"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import {
  GLSL_NOISE,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  uploadTexture,
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

// Layout effects only ever run client-side here (the file is "use client"),
// but Next.js still warns about useLayoutEffect during SSR module
// evaluation — the same guard glyph-sweep's own copy uses.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

export type TileAssembleProps = {
  /** Which panel is active. Changing it retains the outgoing frame and sends its tiles flying apart while the incoming panel's tiles fly in from a scatter and settle. */
  index: number;
  /** Grid columns. @default 8 */
  cols?: number;
  /** Grid rows. @default 5 */
  rows?: number;
  /** Assembly duration in seconds. @default 1.1 */
  duration?: number;
  /** How far a tile travels at full flight, in CSS pixels. @default 220 */
  spread?: number;
  /** Fill colour where a texture samples transparent; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  /** The panels. Only the one at `index` renders into the painted DOM. */
  children: React.ReactNode[];
};

// A custom vertex shader over per-tile quads (see createTileMesh): each
// tile reads its own settle amount from u_progress via a per-tile stagger,
// rotates and translates about its own centre, and gains a small z so a
// cheap perspective divide sells the flight as a little bit of depth, not a
// flat slide. u_pass picks which of the two draws this is — 0 walks the
// OLD texture's tiles away from centre, 1 walks the NEW texture's tiles in
// from that same scatter — so the geometry, not the fragment stage, is what
// differs between the two passes.
const VERTEX = /* glsl */ `
${GLSL_NOISE}
in vec2 a_position;
in vec2 a_uv;
in vec2 a_center;

uniform vec2 u_res;
uniform float u_progress;
uniform float u_spread;
uniform float u_pass;

out vec2 v_uv;
out float v_alpha;

const float PERSPECTIVE = 900.0;
const float STAGGER_RANGE = 0.4;
const float STAGGER_SPAN = 0.6;
const float ROTATE_MAX = 0.6;
const float ANGLE_JITTER = 0.35;

void main() {
  // Two independent hashes drawn from the tile's own centre, so every
  // corner of the same tile agrees: one delays when it starts moving, the
  // other jitters the angle its flight departs from dead-centre.
  float hStagger = kx_hash(a_center);
  float hAngle = kx_hash(a_center + vec2(19.19, 71.31));

  float stagger = hStagger * STAGGER_RANGE;
  float raw = clamp((u_progress - stagger) / STAGGER_SPAN, 0.0, 1.0);
  float settle = smoothstep(0.0, 1.0, raw);

  // t is how far THIS pass's tile currently sits from its resting
  // transform: the outgoing tile flies out as settle rises; the incoming
  // tile starts at full displacement and flies in as settle rises. Alpha
  // reduces to 1.0 - t either way, so the tile still moving is always the
  // one still fading.
  float t = u_pass > 0.5 ? (1.0 - settle) : settle;

  vec2 fromCenter = a_center - vec2(0.5);
  float baseAngle = atan(fromCenter.y, fromCenter.x);
  float angle = baseAngle + (hAngle - 0.5) * 6.2831853 * ANGLE_JITTER;
  vec2 dir = vec2(cos(angle), sin(angle));

  vec2 offsetPx = t * dir * u_spread;
  float rotation = t * ROTATE_MAX;
  float z = t * u_spread * 0.35;

  vec2 centerPx = a_center * u_res;
  vec2 localPx = a_position * u_res - centerPx;
  float c = cos(rotation);
  float s = sin(rotation);
  vec2 rotatedPx = vec2(
    localPx.x * c - localPx.y * s,
    localPx.x * s + localPx.y * c
  );

  float persp = 1.0 + z / PERSPECTIVE;
  vec2 screenPx = centerPx + (rotatedPx + offsetPx) * persp;
  vec2 clipUv = screenPx / u_res;
  gl_Position = vec4(clipUv.x * 2.0 - 1.0, 1.0 - clipUv.y * 2.0, 0.0, 1.0);

  v_uv = a_uv;
  v_alpha = 1.0 - t;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D u_prev;
uniform sampler2D u_tex;
uniform float u_pass;
uniform float u_newReady;
uniform vec4 u_bg;
in vec2 v_uv;
in float v_alpha;
out vec4 o_color;

vec3 sampleOver(sampler2D tex, vec2 uv) {
  vec4 t = texture(tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec3 color;
  if (u_pass > 0.5) {
    // The incoming panel may not have painted yet the instant a transition
    // starts — sample the outgoing frame until it has, same as the alpha
    // fade already hides these tiles behind a mostly-settled outgoing pass.
    color = u_newReady > 0.5 ? sampleOver(u_tex, v_uv) : sampleOver(u_prev, v_uv);
  } else {
    color = sampleOver(u_prev, v_uv);
  }
  o_color = vec4(color, v_alpha);
}
`;

function mustCreate<T>(value: T | null, what: string): T {
  if (value === null) {
    throw new Error(
      `tile-assemble: failed to allocate ${what} (context lost?)`,
    );
  }
  return value;
}

type TileMesh = {
  count: number;
  draw(): void;
  dispose(): void;
};

/**
 * A per-tile quad buffer — `cols` × `rows` tiles, 4 vertices and 6 indices
 * each, built fresh (never `createGridMesh`'s shared-vertex grid, whose
 * shared corners would smear one tile's rotation into its neighbours).
 * `a_position` and `a_uv` are the same corner, in [0,1] surface fractions;
 * `a_center` is the tile's own centre, unshifted, for the vertex shader's
 * per-tile hash, rotation pivot, and outward direction.
 */
function createTileMesh(
  gl: GLContext,
  program: Program,
  cols: number,
  rows: number,
): TileMesh {
  const vao = mustCreate(gl.createVertexArray(), "tile mesh VAO");
  const positionBuffer = mustCreate(
    gl.createBuffer(),
    "tile mesh position buffer",
  );
  const uvBuffer = mustCreate(gl.createBuffer(), "tile mesh uv buffer");
  const centerBuffer = mustCreate(gl.createBuffer(), "tile mesh center buffer");
  const indexBuffer = mustCreate(gl.createBuffer(), "tile mesh index buffer");

  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));

  const vertexCount = c * r * 4;
  const positions = new Float32Array(vertexCount * 2);
  const uvs = new Float32Array(vertexCount * 2);
  const centers = new Float32Array(vertexCount * 2);
  const indexCount = c * r * 6;
  const useShort = vertexCount <= 65535;
  const indices = useShort
    ? new Uint16Array(indexCount)
    : new Uint32Array(indexCount);

  let v = 0;
  let ii = 0;
  for (let row = 0; row < r; row += 1) {
    const v0 = row / r;
    const v1 = (row + 1) / r;
    for (let col = 0; col < c; col += 1) {
      const u0 = col / c;
      const u1 = (col + 1) / c;
      const base = v;
      // Corner order: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.
      const cornerU = [u0, u1, u0, u1];
      const cornerV = [v0, v0, v1, v1];
      const cu = (u0 + u1) / 2;
      const cv = (v0 + v1) / 2;
      for (let k = 0; k < 4; k += 1) {
        positions[v * 2] = cornerU[k] ?? 0;
        positions[v * 2 + 1] = cornerV[k] ?? 0;
        uvs[v * 2] = cornerU[k] ?? 0;
        uvs[v * 2 + 1] = cornerV[k] ?? 0;
        centers[v * 2] = cu;
        centers[v * 2 + 1] = cv;
        v += 1;
      }
      const a = base;
      const b = base + 1;
      const bl = base + 2;
      const br = base + 3;
      indices[ii] = a;
      indices[ii + 1] = bl;
      indices[ii + 2] = b;
      indices[ii + 3] = b;
      indices[ii + 4] = bl;
      indices[ii + 5] = br;
      ii += 6;
    }
  }

  gl.bindVertexArray(vao);
  const bindAttribute = (
    buffer: WebGLBuffer,
    name: string,
    data: Float32Array,
  ) => {
    const location = program.attributes[name];
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    if (location === undefined) return;
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  };
  bindAttribute(positionBuffer, "a_position", positions);
  bindAttribute(uvBuffer, "a_uv", uvs);
  bindAttribute(centerBuffer, "a_center", centers);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  const indexType = useShort ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT;
  let disposed = false;
  return {
    count: indexCount,
    draw: () => {
      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, indexCount, indexType, 0);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(uvBuffer);
      gl.deleteBuffer(centerBuffer);
      gl.deleteBuffer(indexBuffer);
    },
  };
}

/** Copies the painted texture into a retained canvas (reused across transitions) so the outgoing panel survives the DOM switch. Mirrors glyph-sweep's own copy. */
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

/** Walks up from the host to the first opaque background colour, so a
 * transparent texture region composites onto the real page rather than onto
 * black. Mirrors crystal-lens's, glyph-sweep's, and tile-wave's own copy. */
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

type AssembleLayerProps = Required<
  Pick<TileAssembleProps, "index" | "cols" | "rows" | "duration" | "spread">
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the tile mesh, the
 * outgoing/incoming page textures, and the frame loop; reads everything
 * else from the surface. `index` is the only trigger for a transition — no
 * idle ticking between them.
 */
function AssembleLayer({
  index,
  cols,
  rows,
  duration,
  spread,
  background,
}: AssembleLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // 1 = fully settled on the incoming panel — the steady state between
  // transitions, and the correct value before any transition has ever run.
  const progress = useMotionValue<number>(1);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const meshRef = React.useRef<TileMesh | null>(null);
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
  const flightControlsRef = React.useRef<ReturnType<typeof animate> | null>(
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
  const paramsRef = React.useRef({ spread });
  React.useEffect(() => {
    paramsRef.current = { spread };
  });

  // One frame: upload whichever textures landed a new version, then draw
  // the same mesh twice — the outgoing texture's tiles flying out, then the
  // incoming texture's tiles flying in, over it, with blending on.
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
    // back to the current texture is harmless — at progress 1 every tile
    // has settled and the outgoing pass never actually shows.
    const prevTexture = prevTextureRef.current ?? texture;

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;
    const p = paramsRef.current;
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], bg[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_prev", prevTexture, 0);
    program.texture("u_tex", texture, 1);
    const common = {
      u_res: [cssW, cssH],
      u_progress: progress.get(),
      u_spread: p.spread,
      u_bg: bg,
      u_newReady: newReadyRef.current ? 1 : 0,
    };
    program.set({ ...common, u_pass: 0 });
    mesh.draw();
    program.set({ ...common, u_pass: 1 });
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
    glRef.current = gl;
    programRef.current = program;
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
      program.dispose();
      glRef.current = null;
      programRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // The tile mesh is sized from cols×rows alone (no gap to convert against
  // the host's aspect, unlike tile-wave), so it's built — and torn down —
  // independently of the base GL setup above; changing cols/rows must not
  // recompile the program, only rebuild the geometry.
  React.useEffect(() => {
    if (!surface.active) return;
    const gl = glRef.current;
    const program = programRef.current;
    if (!gl || !program || failedRef.current) return;
    const mesh = createTileMesh(gl, program, cols, rows);
    meshRef.current = mesh;
    requestFrame();
    return () => {
      mesh.dispose();
      meshRef.current = null;
    };
  }, [surface.active, cols, rows, requestFrame]);

  // The transition's own progress and every completed paint ask for a
  // frame — nothing else does, so the loop is silent between transitions.
  React.useEffect(() => {
    const unsubscribe = progress.on("change", requestFrame);
    return unsubscribe;
  }, [progress, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the fill colour for wherever a texture samples transparent, and
  // for the clear itself — the host's own theme scope, not the document
  // root's, so `var(--token)` reads right.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // The transition trigger: retain the outgoing frame the moment `index`
  // changes, then run `progress` 0 → 1. A layout effect so the retain runs
  // synchronously against the pre-swap paint, in the same tick React
  // committed the new panel — before the painter has had a chance to
  // repaint over it.
  useIsomorphicLayoutEffect(() => {
    const fromIndex = prevIndexRef.current;
    prevIndexRef.current = index;
    if (fromIndex === index) return;

    flightControlsRef.current?.stop();
    const live = surfaceRef.current;
    if (!live.canvas || !live.motionSafe) {
      // Nothing painted yet, or reduced motion (the layer renders nothing
      // regardless of what happens here) — land on the incoming panel with
      // no flight to run.
      progress.jump(1);
      newReadyRef.current = true;
      return;
    }

    prevCanvasRef.current = retainCopy(prevCanvasRef.current, live.canvas);
    prevCaptureIdRef.current += 1;

    newReadyRef.current = false;
    transitionStartVersionRef.current = live.version;

    progress.jump(0);
    flightControlsRef.current = animate(progress, 1, {
      duration,
      ease: "easeInOut",
      onComplete: () => {
        // Safety net: the painter should already have repainted the
        // incoming panel well before the flight finishes, but if it somehow
        // has not, stop waiting on it rather than hold the tiles on stale
        // pixels forever.
        if (!newReadyRef.current) {
          newReadyRef.current = true;
          requestFrame();
        }
      },
    });
    requestFrame();
  }, [index, duration, progress, requestFrame]);

  // A flight in progress must not outlive the component.
  React.useEffect(
    () => () => {
      flightControlsRef.current?.stop();
    },
    [],
  );

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="tile-assemble"
      className="block h-full w-full"
    />
  );
}

/**
 * A transition between panels: change `index` and the outgoing panel comes
 * apart into a grid of tiles that fly away from its centre while the
 * incoming panel's tiles fly in from that same scatter and settle into
 * place. Each tile is its own quad on an unshared-vertex mesh (never
 * `createGridMesh`, whose shared corners would smear one tile's rotation
 * into its neighbours) — a per-tile hash staggers when it starts moving and
 * jitters the angle it flies at, so the break reads organic rather than a
 * uniform grid wipe. The outgoing texture is retained into its own canvas
 * the instant `index` changes, before the painter has redrawn anything, so
 * the flight never waits on a paint to start; both textures are drawn with
 * the same mesh in two passes, each tile fading in step with how far it
 * still has to travel.
 * Reduced motion: panels switch instantly with no flight, and this layer
 * renders nothing — the real DOM shows the active panel directly.
 */
export function TileAssemble({
  index,
  cols = 8,
  rows = 5,
  duration = 1.1,
  spread = 220,
  background,
  paint,
  className,
  children,
}: TileAssembleProps) {
  const activeIndex =
    children.length > 0 ? clamp(index, 0, children.length - 1) : 0;

  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <AssembleLayer
          index={activeIndex}
          cols={cols}
          rows={rows}
          duration={duration}
          spread={spread}
          background={background}
        />
      }
    >
      {children[activeIndex] ?? null}
    </SurfacePaint>
  );
}
