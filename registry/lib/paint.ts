/**
 * The DOM painter — rasterises a live DOM subtree onto a 2D canvas so a
 * WebGL (or any canvas-consuming) effect can sample the interface as a
 * texture. Dependency-free, evergreen-only: every capability this file
 * leans on is feature-detected before use, never assumed. No React here —
 * see `registry/hooks/use-painted-surface.ts` for the component-facing
 * wrapper.
 */

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------

/**
 * DOM-painter configuration. Every field is optional; the defaults are what
 * `createPainter` uses for an untuned subtree.
 */
export type PaintOptions = {
  /** DPR cap for the texture. @default 2 */
  dprCap?: number;
  /** Bail out to a background+border-only paint past this many nodes. @default 1500 */
  maxNodes?: number;
  /** Paint ::before/::after with string `content` and list markers (approximate). @default false */
  paintPseudo?: boolean;
  /** Draw a focus ring into the texture for the :focus-visible element. @default true */
  focusRing?: boolean;
  /** Fill the canvas with this CSS colour before painting; null = transparent. @default null */
  background?: string | null;
};

/**
 * A completed paint. `canvas` is the same element for the life of the
 * controller — only its pixels and the fields below change between passes.
 */
export type PaintedSurface = {
  canvas: HTMLCanvasElement;
  /** Bumps on every completed paint (sync pass and each async sub-resource pass). */
  version: number;
  /** CSS pixel size of the root's border box at the last paint. */
  width: number;
  height: number;
  dpr: number;
  /** True when the browser exposed a native element-to-canvas draw and it was used. */
  native: boolean;
};

/** Handle returned by `createPainter`; owns the canvas and its observers. */
export type PaintController = {
  /** The current surface; the canvas object is stable, its contents and `version` change. */
  readonly surface: PaintedSurface;
  /** Schedule a repaint; coalesced to one per animation frame. */
  repaint(): void;
  /** Paint synchronously right now (used by tests and by effects that must sample before their first frame). Returns the new version. */
  paintNow(): number;
  /** Subscribe to completed paints. Returns an unsubscribe. */
  subscribe(listener: (surface: PaintedSurface) => void): () => void;
  /** Stop observing and release the canvas. Idempotent. */
  dispose(): void;
};

// --------------------------------------------------------------------------
// Small geometry helpers
// --------------------------------------------------------------------------

type Box = { x: number; y: number; w: number; h: number };

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const safeRect = (el: Element): DOMRect | null => {
  try {
    return el.getBoundingClientRect();
  } catch {
    return null;
  }
};

/** `el`'s border box, relative to the painted root's border box. */
const borderBox = (rect: DOMRect, rootRect: DOMRect): Box => ({
  x: rect.left - rootRect.left,
  y: rect.top - rootRect.top,
  w: rect.width,
  h: rect.height,
});

/** `el`'s padding box (border box minus border widths). */
const paddingBox = (
  rect: DOMRect,
  rootRect: DOMRect,
  style: CSSStyleDeclaration,
): Box => {
  const bl = parseFloat(style.borderLeftWidth) || 0;
  const bt = parseFloat(style.borderTopWidth) || 0;
  const br = parseFloat(style.borderRightWidth) || 0;
  const bb = parseFloat(style.borderBottomWidth) || 0;
  return {
    x: rect.left - rootRect.left + bl,
    y: rect.top - rootRect.top + bt,
    w: Math.max(0, rect.width - bl - br),
    h: Math.max(0, rect.height - bt - bb),
  };
};

/** `el`'s content box (padding box minus padding). */
const contentBox = (
  rect: DOMRect,
  rootRect: DOMRect,
  style: CSSStyleDeclaration,
): Box => {
  const bl = parseFloat(style.borderLeftWidth) || 0;
  const bt = parseFloat(style.borderTopWidth) || 0;
  const br = parseFloat(style.borderRightWidth) || 0;
  const bb = parseFloat(style.borderBottomWidth) || 0;
  const pl = parseFloat(style.paddingLeft) || 0;
  const pt = parseFloat(style.paddingTop) || 0;
  const pr = parseFloat(style.paddingRight) || 0;
  const pb = parseFloat(style.paddingBottom) || 0;
  return {
    x: rect.left - rootRect.left + bl + pl,
    y: rect.top - rootRect.top + bt + pt,
    w: Math.max(0, rect.width - bl - br - pl - pr),
    h: Math.max(0, rect.height - bt - bb - pt - pb),
  };
};

const insetBox = (box: Box, amount: number): Box => ({
  x: box.x + amount,
  y: box.y + amount,
  w: Math.max(0, box.w - amount * 2),
  h: Math.max(0, box.h - amount * 2),
});

/** One horizontal radius per corner — an elliptical corner's vertical radius is dropped (approximate). */
const cornerRadii = (
  style: CSSStyleDeclaration,
): [number, number, number, number] => {
  const parse = (v: string): number => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  return [
    parse(style.borderTopLeftRadius),
    parse(style.borderTopRightRadius),
    parse(style.borderBottomRightRadius),
    parse(style.borderBottomLeftRadius),
  ];
};

const insetRadii = (
  radii: [number, number, number, number],
  amount: number,
): [number, number, number, number] => [
  Math.max(0, radii[0] - amount),
  Math.max(0, radii[1] - amount),
  Math.max(0, radii[2] - amount),
  Math.max(0, radii[3] - amount),
];

/**
 * Traces `box` as the current path, rounded per corner. Uses the native
 * `ctx.roundRect` when present, otherwise a hand-rolled arc path — both
 * house idioms are feature-detected, never assumed.
 */
const tracePath = (
  ctx: CanvasRenderingContext2D,
  box: Box,
  radii: [number, number, number, number],
): void => {
  ctx.beginPath();
  if (box.w <= 0 || box.h <= 0) return;
  const maxR = Math.min(box.w, box.h) / 2;
  const tl = clamp(radii[0], 0, maxR);
  const tr = clamp(radii[1], 0, maxR);
  const br = clamp(radii[2], 0, maxR);
  const bl = clamp(radii[3], 0, maxR);
  if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
    ctx.rect(box.x, box.y, box.w, box.h);
    return;
  }
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(box.x, box.y, box.w, box.h, [tl, tr, br, bl]);
    return;
  }
  const { x, y, w, h } = box;
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr > 0) ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  if (br > 0) ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  if (bl > 0) ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  if (tl > 0) ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
};

// --------------------------------------------------------------------------
// Colour probe (also the exported `resolveColor`)
// --------------------------------------------------------------------------

let colorProbe: CanvasRenderingContext2D | null | undefined;

const getColorProbe = (): CanvasRenderingContext2D | null => {
  if (colorProbe === undefined) {
    if (typeof document === "undefined") {
      colorProbe = null;
    } else {
      const el = document.createElement("canvas");
      el.width = 1;
      el.height = 1;
      colorProbe = el.getContext("2d", { willReadFrequently: true });
    }
  }
  return colorProbe;
};

/**
 * Resolves any CSS colour string (oklch, hex, named, rgb, ...) to
 * `[r, g, b, a]` in 0..1, by filling a 1x1 canvas and reading the pixel back
 * — the same probe idiom `sun-shaft.tsx` uses for its beam/core colours.
 * An unparsable string resolves to opaque black rather than throwing.
 */
export function resolveColor(css: string): [number, number, number, number] {
  const probe = getColorProbe();
  if (!probe) return [0, 0, 0, 1];
  try {
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = "#000";
    probe.fillStyle = css;
    probe.fillRect(0, 0, 1, 1);
    const data = probe.getImageData(0, 0, 1, 1).data;
    const r = data[0] ?? 0;
    const g = data[1] ?? 0;
    const b = data[2] ?? 0;
    const a = data[3] ?? 255;
    return [r / 255, g / 255, b / 255, a / 255];
  } catch {
    return [0, 0, 0, 1];
  }
}

// --------------------------------------------------------------------------
// Native fast path (feature-detected; nothing implements this today)
// --------------------------------------------------------------------------

type NativeElementPaintContext = CanvasRenderingContext2D & {
  drawElementImage?: (
    el: Element,
    x: number,
    y: number,
    w?: number,
    h?: number,
  ) => void;
  drawElement?: (
    el: Element,
    x: number,
    y: number,
    w?: number,
    h?: number,
  ) => void;
};

const detectNativeElementPaint = (ctx: CanvasRenderingContext2D): boolean => {
  const probe = ctx as NativeElementPaintContext;
  return (
    typeof probe.drawElementImage === "function" ||
    typeof probe.drawElement === "function"
  );
};

/**
 * Whether this browser exposes a native element-to-canvas draw — a function
 * named `drawElementImage` or `drawElement` on a 2D context. Purely feature
 * detected against a throwaway context; no browser implements this yet, so
 * it resolves false everywhere today, and that's fine — the check exists so
 * a future native path lights up on its own, never because we assumed it.
 */
export function supportsNativeElementPaint(): boolean {
  if (typeof document === "undefined") return false;
  const probe = document.createElement("canvas").getContext("2d");
  return probe ? detectNativeElementPaint(probe) : false;
}

// --------------------------------------------------------------------------
// linear-gradient() parsing (single background-image only)
// --------------------------------------------------------------------------

type GradientStop = { color: string; offset: number | null };
type ParsedGradient = { angleDeg: number; stops: GradientStop[] };

const splitTopLevelCommas = (input: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charAt(i);
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "," && depth === 0) {
      parts.push(input.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(input.slice(start));
  return parts;
};

const SIDE_ANGLES: Record<string, number> = {
  top: 0,
  right: 90,
  bottom: 180,
  left: 270,
};
const CORNER_ANGLES: Record<string, number> = {
  "top,right": 45,
  "right,top": 45,
  "bottom,right": 135,
  "right,bottom": 135,
  "bottom,left": 225,
  "left,bottom": 225,
  "top,left": 315,
  "left,top": 315,
};

const angleFromSide = (a: string, b: string | undefined): number => {
  const key = a.toLowerCase();
  if (!b) return SIDE_ANGLES[key] ?? 180;
  return CORNER_ANGLES[`${key},${b.toLowerCase()}`] ?? SIDE_ANGLES[key] ?? 180;
};

const parseColorStop = (text: string): GradientStop | null => {
  if (!text) return null;
  const match = /(-?[\d.]+%)\s*$/.exec(text);
  const percent = match ? match[1] : undefined;
  if (percent) {
    const color = text.slice(0, text.length - percent.length).trim();
    return color ? { color, offset: parseFloat(percent) / 100 } : null;
  }
  return { color: text, offset: null };
};

/** Parses `linear-gradient(<angle-or-side>, <stop>, <stop>, ...)`; any other `background-image` value is left unhandled. */
const parseLinearGradient = (
  backgroundImage: string,
): ParsedGradient | null => {
  const outer = /^\s*linear-gradient\((.*)\)\s*$/i.exec(backgroundImage.trim());
  const inner = outer ? outer[1] : undefined;
  if (!inner) return null;
  const parts = splitTopLevelCommas(inner);
  if (parts.length === 0) return null;
  const first = (parts[0] ?? "").trim();
  let angleDeg = 180;
  let stopParts = parts;
  const angleMatch = /^(-?[\d.]+)deg$/i.exec(first);
  const toMatch =
    /^to\s+(top|bottom|left|right)(?:\s+(top|bottom|left|right))?$/i.exec(
      first,
    );
  const angleGroup = angleMatch ? angleMatch[1] : undefined;
  const toSideGroup = toMatch ? toMatch[1] : undefined;
  if (angleGroup) {
    angleDeg = parseFloat(angleGroup);
    stopParts = parts.slice(1);
  } else if (toSideGroup) {
    angleDeg = angleFromSide(toSideGroup, toMatch ? toMatch[2] : undefined);
    stopParts = parts.slice(1);
  }
  const stops: GradientStop[] = [];
  for (const raw of stopParts) {
    const stop = parseColorStop(raw.trim());
    if (stop) stops.push(stop);
  }
  return stops.length >= 2 ? { angleDeg, stops } : null;
};

/** Missing offsets are spread evenly — CSS's real distribution algorithm is more nuanced; this is the documented approximation. */
const normalizeStops = (
  stops: GradientStop[],
): { color: string; offset: number }[] => {
  const missing = stops.some((s) => s.offset === null);
  if (!missing)
    return stops.map((s) => ({ color: s.color, offset: s.offset ?? 0 }));
  const count = stops.length;
  return stops.map((s, i) => ({
    color: s.color,
    offset: count > 1 ? i / (count - 1) : 0,
  }));
};

/** CSS gradient-angle-to-line-endpoints: the classic box-diagonal-projection construction. */
const gradientLine = (
  box: Box,
  angleDeg: number,
): { x0: number; y0: number; x1: number; y1: number } => {
  const angleRad = (angleDeg * Math.PI) / 180;
  const halfW = box.w / 2;
  const halfH = box.h / 2;
  const cx = box.x + halfW;
  const cy = box.y + halfH;
  const dx = Math.sin(angleRad);
  const dy = -Math.cos(angleRad);
  const length = Math.abs(halfW * dx) + Math.abs(halfH * dy);
  return {
    x0: cx - dx * length,
    y0: cy - dy * length,
    x1: cx + dx * length,
    y1: cy + dy * length,
  };
};

// --------------------------------------------------------------------------
// Background & border
// --------------------------------------------------------------------------

const paintBackground = (
  ctx: CanvasRenderingContext2D,
  style: CSSStyleDeclaration,
  box: Box,
  radii: [number, number, number, number],
): void => {
  if (box.w <= 0 || box.h <= 0) return;
  const bgColor = style.backgroundColor;
  const hasColor =
    bgColor.length > 0 &&
    bgColor !== "rgba(0, 0, 0, 0)" &&
    bgColor !== "transparent";
  const gradient = parseLinearGradient(style.backgroundImage);
  if (!hasColor && !gradient) return;
  ctx.save();
  tracePath(ctx, box, radii);
  if (hasColor) {
    ctx.fillStyle = bgColor;
    ctx.fill();
  }
  if (gradient) {
    const line = gradientLine(box, gradient.angleDeg);
    const canvasGradient = ctx.createLinearGradient(
      line.x0,
      line.y0,
      line.x1,
      line.y1,
    );
    for (const stop of normalizeStops(gradient.stops)) {
      try {
        canvasGradient.addColorStop(clamp(stop.offset, 0, 1), stop.color);
      } catch {
        /* unparsable stop colour — skip it, keep the rest of the ramp */
      }
    }
    ctx.fillStyle = canvasGradient;
    ctx.fill();
  }
  ctx.restore();
};

const paintBorder = (
  ctx: CanvasRenderingContext2D,
  style: CSSStyleDeclaration,
  box: Box,
  radii: [number, number, number, number],
): void => {
  const widths: [number, number, number, number] = [
    parseFloat(style.borderTopWidth) || 0,
    parseFloat(style.borderRightWidth) || 0,
    parseFloat(style.borderBottomWidth) || 0,
    parseFloat(style.borderLeftWidth) || 0,
  ];
  const styles: [string, string, string, string] = [
    style.borderTopStyle,
    style.borderRightStyle,
    style.borderBottomStyle,
    style.borderLeftStyle,
  ];
  const colors: [string, string, string, string] = [
    style.borderTopColor,
    style.borderRightColor,
    style.borderBottomColor,
    style.borderLeftColor,
  ];
  const visTop =
    widths[0] > 0 && styles[0] !== "none" && styles[0] !== "hidden";
  const visRight =
    widths[1] > 0 && styles[1] !== "none" && styles[1] !== "hidden";
  const visBottom =
    widths[2] > 0 && styles[2] !== "none" && styles[2] !== "hidden";
  const visLeft =
    widths[3] > 0 && styles[3] !== "none" && styles[3] !== "hidden";
  if (!visTop && !visRight && !visBottom && !visLeft) return;

  const uniform =
    visTop &&
    visRight &&
    visBottom &&
    visLeft &&
    widths[0] === widths[1] &&
    widths[1] === widths[2] &&
    widths[2] === widths[3] &&
    colors[0] === colors[1] &&
    colors[1] === colors[2] &&
    colors[2] === colors[3];

  if (uniform) {
    const w = widths[0];
    ctx.save();
    tracePath(ctx, insetBox(box, w / 2), insetRadii(radii, w / 2));
    ctx.strokeStyle = colors[0];
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.save();
  if (visTop) {
    ctx.fillStyle = colors[0];
    ctx.fillRect(box.x, box.y, box.w, widths[0]);
  }
  if (visBottom) {
    ctx.fillStyle = colors[2];
    ctx.fillRect(box.x, box.y + box.h - widths[2], box.w, widths[2]);
  }
  if (visLeft) {
    ctx.fillStyle = colors[3];
    ctx.fillRect(box.x, box.y, widths[3], box.h);
  }
  if (visRight) {
    ctx.fillStyle = colors[1];
    ctx.fillRect(box.x + box.w - widths[1], box.y, widths[1], box.h);
  }
  ctx.restore();
};

// --------------------------------------------------------------------------
// Text: grapheme segmentation, run grouping, baseline, decoration
// --------------------------------------------------------------------------

type GraphemeCluster = { start: number; end: number };

let graphemeSegmenter: Intl.Segmenter | null | undefined;

const getGraphemeSegmenter = (): Intl.Segmenter | null => {
  if (graphemeSegmenter === undefined) {
    graphemeSegmenter =
      typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
        ? new Intl.Segmenter("und", { granularity: "grapheme" })
        : null;
  }
  return graphemeSegmenter;
};

/** Splits `text` into grapheme clusters (start/end code-unit offsets) via `Intl.Segmenter`, falling back to `Array.from` (code points). */
const segmentGraphemes = (text: string): GraphemeCluster[] => {
  const segmenter = getGraphemeSegmenter();
  const clusters: GraphemeCluster[] = [];
  if (segmenter) {
    for (const seg of segmenter.segment(text)) {
      clusters.push({ start: seg.index, end: seg.index + seg.segment.length });
    }
    return clusters;
  }
  let idx = 0;
  for (const ch of Array.from(text)) {
    clusters.push({ start: idx, end: idx + ch.length });
    idx += ch.length;
  }
  return clusters;
};

/** Approximates `text-transform`; `capitalize` upper-cases the first letter after start-of-string or whitespace. */
const applyTextTransform = (text: string, transform: string): string => {
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  if (transform === "capitalize") {
    return text.replace(
      /(^|\s)(\S)/g,
      (_m, boundary: string, ch: string) => boundary + ch.toUpperCase(),
    );
  }
  return text;
};

const buildFontShorthand = (style: CSSStyleDeclaration): string => {
  const fontStyle = style.fontStyle || "normal";
  const fontWeight = style.fontWeight || "400";
  const fontSize = style.fontSize || "16px";
  const lineHeight =
    style.lineHeight && style.lineHeight !== "normal"
      ? `/${style.lineHeight}`
      : "";
  const fontFamily = style.fontFamily || "sans-serif";
  return `${fontStyle} ${fontWeight} ${fontSize}${lineHeight} ${fontFamily}`;
};

/** `ctx.font` must already be set to the text's own font before calling. */
const measureAscent = (
  ctx: CanvasRenderingContext2D,
  fontSizePx: number,
): number => {
  const metrics = ctx.measureText("Hg");
  return metrics.actualBoundingBoxAscent > 0
    ? metrics.actualBoundingBoxAscent
    : fontSizePx * 0.8;
};

const paintTextDecoration = (
  ctx: CanvasRenderingContext2D,
  style: CSSStyleDeclaration,
  firstRect: DOMRect,
  lastRect: DOMRect,
  rootRect: DOMRect,
  baseline: number,
): void => {
  const line = style.textDecorationLine;
  if (!line || line === "none") return;
  const hasUnderline = line.includes("underline");
  const hasStrike = line.includes("line-through");
  if (!hasUnderline && !hasStrike) return;
  const x0 = firstRect.left - rootRect.left;
  const x1 = lastRect.right - rootRect.left;
  if (x1 <= x0) return;
  ctx.save();
  ctx.strokeStyle = style.textDecorationColor || style.color;
  ctx.lineWidth = 1;
  if (hasUnderline) {
    const y = baseline + 2;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }
  if (hasStrike) {
    const y = baseline - (parseFloat(style.fontSize) || 16) * 0.3;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }
  ctx.restore();
};

/**
 * Paints one text node: segments it into grapheme clusters, reads each
 * cluster's line-box rect off a per-cluster `Range`, groups consecutive
 * clusters that land on the same line (top/height within 0.5px) into a run,
 * and draws each run with a single `fillText` — unless letter-spacing is
 * both non-zero and unsupported by this engine's `ctx.letterSpacing`, in
 * which case that run falls back to one `fillText` per cluster, each
 * positioned by its own rect.
 */
const paintTextNode = (
  ctx: CanvasRenderingContext2D,
  textNode: Text,
  parent: Element,
  state: PassState,
): void => {
  const raw = textNode.data;
  if (raw.length === 0) return;
  let style: CSSStyleDeclaration;
  try {
    style = getComputedStyle(parent);
  } catch {
    return;
  }
  if (style.display === "none" || style.visibility === "hidden") return;
  const clusters = segmentGraphemes(raw);
  if (clusters.length === 0) return;
  const transformed = applyTextTransform(raw, style.textTransform);

  ctx.save();
  ctx.font = buildFontShorthand(style);
  const ascent = measureAscent(ctx, parseFloat(style.fontSize) || 16);
  const letterSpacingPx =
    style.letterSpacing === "normal" ? 0 : parseFloat(style.letterSpacing) || 0;
  ctx.fillStyle = style.color;
  if (state.supportsLetterSpacing) {
    ctx.letterSpacing = letterSpacingPx !== 0 ? style.letterSpacing : "0px";
  }

  type RunCluster = { start: number; end: number; rect: DOMRect };
  let run: RunCluster[] = [];
  let runTop = 0;
  let runHeight = 0;

  const flushRun = (): void => {
    const first = run[0];
    const last = run[run.length - 1];
    if (!first || !last) {
      run = [];
      return;
    }
    const relTop = first.rect.top - state.rootRect.top;
    const relLeft = first.rect.left - state.rootRect.left;
    const baseline = relTop + ascent;
    if (letterSpacingPx !== 0 && !state.supportsLetterSpacing) {
      for (const cluster of run) {
        const text = transformed.slice(cluster.start, cluster.end);
        if (!text) continue;
        const cx = cluster.rect.left - state.rootRect.left;
        const cy = cluster.rect.top - state.rootRect.top + ascent;
        ctx.fillText(text, cx, cy);
      }
    } else {
      const text = transformed.slice(first.start, last.end);
      if (text) ctx.fillText(text, relLeft, baseline);
    }
    paintTextDecoration(
      ctx,
      style,
      first.rect,
      last.rect,
      state.rootRect,
      baseline,
    );
    run = [];
  };

  for (const cluster of clusters) {
    let rect: DOMRect | null = null;
    try {
      const range = document.createRange();
      range.setStart(textNode, cluster.start);
      range.setEnd(textNode, cluster.end);
      const rects = range.getClientRects();
      rect = rects.length > 0 ? (rects[0] ?? null) : null;
    } catch {
      rect = null;
    }
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      // A zero-size rect is collapsed whitespace (or a detached-range
      // failure) — end the current run without extending it.
      flushRun();
      continue;
    }
    if (
      run.length > 0 &&
      Math.abs(rect.top - runTop) <= 0.5 &&
      Math.abs(rect.height - runHeight) <= 0.5
    ) {
      run.push({ start: cluster.start, end: cluster.end, rect });
    } else {
      flushRun();
      run = [{ start: cluster.start, end: cluster.end, rect }];
      runTop = rect.top;
      runHeight = rect.height;
    }
  }
  flushRun();
  ctx.restore();
};

// --------------------------------------------------------------------------
// Replaced content: img / canvas / video / inline svg
// --------------------------------------------------------------------------

const drawReplacedMedia = (
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  naturalW: number,
  naturalH: number,
  box: Box,
  fit: string,
): void => {
  if (naturalW <= 0 || naturalH <= 0 || box.w <= 0 || box.h <= 0) return;
  try {
    if (fit === "contain" || fit === "cover") {
      const scale =
        fit === "cover"
          ? Math.max(box.w / naturalW, box.h / naturalH)
          : Math.min(box.w / naturalW, box.h / naturalH);
      const dw = naturalW * scale;
      const dh = naturalH * scale;
      const dx = box.x + (box.w - dw) / 2;
      const dy = box.y + (box.h - dh) / 2;
      if (fit === "cover") {
        ctx.save();
        ctx.beginPath();
        ctx.rect(box.x, box.y, box.w, box.h);
        ctx.clip();
        ctx.drawImage(source, dx, dy, dw, dh);
        ctx.restore();
      } else {
        ctx.drawImage(source, dx, dy, dw, dh);
      }
    } else {
      // "fill" (the CSS default for replaced elements) and anything else unrecognised.
      ctx.drawImage(source, box.x, box.y, box.w, box.h);
    }
  } catch {
    // Cross-origin taint or a mid-decode failure — never let a bad source crash the pass.
  }
};

type SvgCacheEntry = { key: string; image: HTMLImageElement; loaded: boolean };

let svgSerializer: XMLSerializer | null | undefined;

const getSvgSerializer = (): XMLSerializer | null => {
  if (svgSerializer === undefined) {
    svgSerializer =
      typeof XMLSerializer !== "undefined" ? new XMLSerializer() : null;
  }
  return svgSerializer;
};

/**
 * Serialises `svg`, inlines `currentColor` via an explicit `color` (and, if
 * the root itself paints with `currentColor`, explicit `fill`/`stroke`),
 * and rasterises it through a cached data-URL `Image`. The first pass for a
 * never-seen (or changed) svg draws nothing and starts the load; the image
 * appears once it decodes, via `requestAsyncRedraw`.
 */
const paintInlineSvg = (
  ctx: CanvasRenderingContext2D,
  svg: SVGSVGElement,
  style: CSSStyleDeclaration,
  box: Box,
  state: PassState,
): void => {
  if (box.w <= 0 || box.h <= 0) return;
  const serializer = getSvgSerializer();
  if (!serializer) return;
  let markup: string;
  try {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const existingStyle = clone.getAttribute("style") ?? "";
    clone.setAttribute("style", `${existingStyle};color:${style.color}`);
    if (style.fill === "currentcolor") clone.setAttribute("fill", style.color);
    if (style.stroke === "currentcolor")
      clone.setAttribute("stroke", style.color);
    markup = serializer.serializeToString(clone);
  } catch {
    return;
  }
  let entry = state.svgImageCache.get(svg);
  if (!entry || entry.key !== markup) {
    const image = new Image();
    const nextEntry: SvgCacheEntry = { key: markup, image, loaded: false };
    state.svgImageCache.set(svg, nextEntry);
    entry = nextEntry;
    image.onload = () => {
      nextEntry.loaded = true;
      state.requestAsyncRedraw();
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  }
  if (entry.loaded && entry.image.naturalWidth > 0) {
    try {
      ctx.drawImage(entry.image, box.x, box.y, box.w, box.h);
    } catch {
      /* decode failure after load — skip this pass */
    }
  }
};

const paintReplacedContent = (
  ctx: CanvasRenderingContext2D,
  el: Element,
  style: CSSStyleDeclaration,
  rect: DOMRect,
  state: PassState,
): void => {
  const box = contentBox(rect, state.rootRect, style);
  if (el instanceof HTMLImageElement) {
    if (el.complete && el.naturalWidth > 0) {
      drawReplacedMedia(
        ctx,
        el,
        el.naturalWidth,
        el.naturalHeight,
        box,
        style.objectFit,
      );
    } else if (!state.imgLoading.has(el)) {
      state.imgLoading.add(el);
      const img = el;
      const onSettle = (): void => {
        state.imgLoading.delete(img);
        img.removeEventListener("load", onSettle);
        img.removeEventListener("error", onSettle);
        state.requestAsyncRedraw();
      };
      img.addEventListener("load", onSettle, { once: true });
      img.addEventListener("error", onSettle, { once: true });
    }
  } else if (el instanceof HTMLCanvasElement) {
    if (el.width > 0 && el.height > 0)
      drawReplacedMedia(ctx, el, el.width, el.height, box, style.objectFit);
  } else if (el instanceof HTMLVideoElement) {
    if (el.videoWidth > 0 && el.videoHeight > 0) {
      drawReplacedMedia(
        ctx,
        el,
        el.videoWidth,
        el.videoHeight,
        box,
        style.objectFit,
      );
    }
  } else if (el instanceof SVGSVGElement) {
    paintInlineSvg(ctx, el, style, box, state);
  }
};

// --------------------------------------------------------------------------
// Form controls
// --------------------------------------------------------------------------

const TEXT_LIKE_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "number",
  "date",
  "month",
  "week",
  "time",
  "datetime-local",
]);

const drawFieldText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  box: Box,
  style: CSSStyleDeclaration,
  align: "center" | "top",
  placeholderPaint?: { color: string; opacity: number },
): void => {
  if (box.w <= 0 || box.h <= 0 || text.length === 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.font = buildFontShorthand(style);
  const ascent = measureAscent(ctx, parseFloat(style.fontSize) || 16);
  const baseline =
    align === "center" ? box.y + (box.h + ascent) / 2 : box.y + ascent;
  ctx.fillStyle = (placeholderPaint && placeholderPaint.color) || style.color;
  if (placeholderPaint)
    ctx.globalAlpha *= clamp(placeholderPaint.opacity, 0, 1);
  ctx.fillText(applyTextTransform(text, style.textTransform), box.x, baseline);
  ctx.restore();
};

const paintFieldValue = (
  ctx: CanvasRenderingContext2D,
  el: HTMLInputElement | HTMLTextAreaElement,
  style: CSSStyleDeclaration,
  rect: DOMRect,
  state: PassState,
  align: "center" | "top",
): void => {
  const box = contentBox(rect, state.rootRect, style);
  if (el.value.length > 0) {
    drawFieldText(ctx, el.value, box, style, align);
    return;
  }
  if (!el.placeholder) return;
  let placeholderStyle: CSSStyleDeclaration | null = null;
  try {
    placeholderStyle = getComputedStyle(el, "::placeholder");
  } catch {
    placeholderStyle = null;
  }
  const opacityValue = placeholderStyle
    ? parseFloat(placeholderStyle.opacity)
    : NaN;
  drawFieldText(ctx, el.placeholder, box, style, align, {
    color: (placeholderStyle && placeholderStyle.color) || style.color,
    opacity: Number.isFinite(opacityValue) ? opacityValue : 1,
  });
};

/** Buttons aren't handled here — their label is a real text node, painted by `paintTextNode` like any other element's text. */
const paintFormControlValue = (
  ctx: CanvasRenderingContext2D,
  el: Element,
  style: CSSStyleDeclaration,
  rect: DOMRect,
  state: PassState,
): void => {
  if (el instanceof HTMLInputElement) {
    if (!TEXT_LIKE_INPUT_TYPES.has(el.type)) return;
    paintFieldValue(ctx, el, style, rect, state, "center");
  } else if (el instanceof HTMLTextAreaElement) {
    paintFieldValue(ctx, el, style, rect, state, "top");
  } else if (el instanceof HTMLSelectElement) {
    const opt = el.options.item(el.selectedIndex);
    const label = opt ? opt.label || opt.text : "";
    if (!label) return;
    const box = contentBox(rect, state.rootRect, style);
    drawFieldText(ctx, label, box, style, "center");
  }
};

// --------------------------------------------------------------------------
// Pseudo-elements (opt-in, approximate)
// --------------------------------------------------------------------------

const parseContentString = (content: string): string => {
  const trimmed = content.trim();
  if (trimmed.length >= 2) {
    const quote = trimmed.charAt(0);
    if (
      (quote === '"' || quote === "'") &&
      trimmed.charAt(trimmed.length - 1) === quote
    ) {
      return trimmed.slice(1, -1);
    }
  }
  return "";
};

const paintPseudoContent = (
  ctx: CanvasRenderingContext2D,
  el: Element,
  pseudo: string,
  origin: Box,
): void => {
  let ps: CSSStyleDeclaration;
  try {
    ps = getComputedStyle(el, pseudo);
  } catch {
    return;
  }
  const text = parseContentString(ps.content);
  if (!text) return;
  ctx.save();
  ctx.font = buildFontShorthand(ps);
  const ascent = measureAscent(ctx, parseFloat(ps.fontSize) || 16);
  ctx.fillStyle = ps.color;
  ctx.fillText(
    applyTextTransform(text, ps.textTransform),
    origin.x,
    origin.y + ascent,
  );
  ctx.restore();
};

const paintMarker = (
  ctx: CanvasRenderingContext2D,
  el: Element,
  elStyle: CSSStyleDeclaration,
  origin: Box,
): void => {
  if (!(el instanceof HTMLLIElement) || elStyle.display !== "list-item") return;
  const type = elStyle.listStyleType;
  let glyph = "";
  if (type === "disc") {
    glyph = "•";
  } else if (type === "decimal") {
    const list = el.parentElement;
    let index = 1;
    if (list) {
      let n = 0;
      for (const child of Array.from(list.children)) {
        if (child instanceof HTMLLIElement) {
          n += 1;
          if (child === el) {
            index = n;
            break;
          }
        }
      }
    }
    glyph = `${index}.`;
  } else {
    return;
  }
  let ms: CSSStyleDeclaration = elStyle;
  try {
    ms = getComputedStyle(el, "::marker");
  } catch {
    /* fall back to the list item's own style */
  }
  ctx.save();
  ctx.font = buildFontShorthand(elStyle);
  ctx.fillStyle = ms.color || elStyle.color;
  const ascent = measureAscent(ctx, parseFloat(elStyle.fontSize) || 16);
  ctx.fillText(glyph, origin.x - 16, origin.y + ascent);
  ctx.restore();
};

const paintPseudoElements = (
  ctx: CanvasRenderingContext2D,
  el: Element,
  elStyle: CSSStyleDeclaration,
  state: PassState,
): void => {
  const rect = safeRect(el);
  if (!rect) return;
  const origin = paddingBox(rect, state.rootRect, elStyle);
  paintPseudoContent(ctx, el, "::before", origin);
  paintPseudoContent(ctx, el, "::after", origin);
  paintMarker(ctx, el, elStyle, origin);
};

// --------------------------------------------------------------------------
// Focus ring
// --------------------------------------------------------------------------

const paintFocusRing = (
  ctx: CanvasRenderingContext2D,
  root: HTMLElement,
  rootRect: DOMRect,
): void => {
  let focused: Element | null = null;
  try {
    focused = root.querySelector(":focus-visible");
  } catch {
    focused = null;
  }
  if (!focused) return;
  const rect = safeRect(focused);
  if (!rect) return;
  let style: CSSStyleDeclaration;
  try {
    style = getComputedStyle(focused);
  } catch {
    return;
  }
  const outlineColor = style.outlineColor;
  const colorCss =
    outlineColor && outlineColor.length > 0
      ? outlineColor
      : getComputedStyle(document.documentElement)
          .getPropertyValue("--primary")
          .trim() || "#4d7fff";
  const rgba = resolveColor(colorCss);
  const box: Box = {
    x: rect.left - rootRect.left - 3,
    y: rect.top - rootRect.top - 3,
    w: rect.width + 6,
    h: rect.height + 6,
  };
  const base = cornerRadii(style);
  const radii: [number, number, number, number] = [
    base[0] + 3,
    base[1] + 3,
    base[2] + 3,
    base[3] + 3,
  ];
  ctx.save();
  tracePath(ctx, box, radii);
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgba(${Math.round(rgba[0] * 255)}, ${Math.round(rgba[1] * 255)}, ${Math.round(rgba[2] * 255)}, ${rgba[3]})`;
  ctx.stroke();
  ctx.restore();
};

// --------------------------------------------------------------------------
// Traversal: a single DFS via TreeWalker, z-index deferred to a second pass
// --------------------------------------------------------------------------

type PassState = {
  canvas: HTMLCanvasElement;
  rootRect: DOMRect;
  maxNodes: number;
  paintPseudo: boolean;
  supportsLetterSpacing: boolean;
  svgImageCache: WeakMap<Element, SvgCacheEntry>;
  imgLoading: WeakSet<HTMLImageElement>;
  requestAsyncRedraw: () => void;
  /** Shared across the root pass and every deferred z-index sub-pass, so `maxNodes` bounds the whole paint, not each subtree independently. */
  counter: { value: number };
};

const isPositionedWithZIndex = (style: CSSStyleDeclaration): boolean => {
  if (style.position === "static") return false;
  const z = parseFloat(style.zIndex);
  return Number.isFinite(z) && z > 0;
};

/** Opens a save()-scoped opacity/clip region for `el`'s descendants when either is needed; returns whether a scope was actually opened (i.e. whether the caller owes a matching `ctx.restore()`). */
const openScope = (
  ctx: CanvasRenderingContext2D,
  el: Element,
  style: CSSStyleDeclaration,
  state: PassState,
): boolean => {
  const opacityRaw = parseFloat(style.opacity);
  const opacityValue = Number.isFinite(opacityRaw)
    ? clamp(opacityRaw, 0, 1)
    : 1;
  const clips = style.overflowX !== "visible" || style.overflowY !== "visible";
  if (opacityValue >= 1 && !clips) return false;
  ctx.save();
  if (opacityValue < 1) ctx.globalAlpha *= opacityValue;
  if (clips) {
    const rect = safeRect(el);
    if (rect) {
      tracePath(
        ctx,
        paddingBox(rect, state.rootRect, style),
        cornerRadii(style),
      );
      ctx.clip();
    }
  }
  return true;
};

const paintBoxDecoration = (
  ctx: CanvasRenderingContext2D,
  el: Element,
  state: PassState,
  style: CSSStyleDeclaration,
): void => {
  const rect = safeRect(el);
  if (!rect || (rect.width <= 0 && rect.height <= 0)) return;
  const box = borderBox(rect, state.rootRect);
  const radii = cornerRadii(style);
  paintBackground(ctx, style, box, radii);
  paintBorder(ctx, style, box, radii);
};

const paintElementBox = (
  ctx: CanvasRenderingContext2D,
  el: Element,
  state: PassState,
  style: CSSStyleDeclaration,
): void => {
  if (el === state.canvas) return;
  paintBoxDecoration(ctx, el, state, style);
  const rect = safeRect(el);
  if (!rect) return;
  paintReplacedContent(ctx, el, style, rect, state);
  paintFormControlValue(ctx, el, style, rect, state);
};

/**
 * Paints `subtreeRoot` and its descendants in DOM order via a single
 * `TreeWalker` pass, scoping opacity/overflow-clip with `ctx.save()` /
 * `ctx.restore()` pairs that mirror the DOM's own nesting (tracked with an
 * explicit stack, since a flat `nextNode()` walk gives no other signal for
 * "this element's subtree is finished"). `display:none`, `visibility:hidden`
 * and `position:fixed` subtrees are rejected by the walker's filter, so they
 * never cost a traversal step. Positioned elements with `z-index > 0` are
 * collected instead of descended into, then repainted — subtree and all —
 * after the rest of the pass, via a recursive call. Returns whether the
 * shared `maxNodes` budget was exceeded.
 */
const paintTree = (
  ctx: CanvasRenderingContext2D,
  subtreeRoot: Element,
  state: PassState,
): boolean => {
  const deferred: Element[] = [];
  const styleCache = new Map<Element, CSSStyleDeclaration>();

  const accept = (node: Node): number => {
    if (node.nodeType !== Node.ELEMENT_NODE) return NodeFilter.FILTER_ACCEPT;
    const el = node as Element;
    if (el === state.canvas) return NodeFilter.FILTER_REJECT;
    let style: CSSStyleDeclaration;
    try {
      style = getComputedStyle(el);
    } catch {
      return NodeFilter.FILTER_REJECT;
    }
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.position === "fixed"
    ) {
      return NodeFilter.FILTER_REJECT;
    }
    if (isPositionedWithZIndex(style)) {
      deferred.push(el);
      return NodeFilter.FILTER_REJECT;
    }
    styleCache.set(el, style);
    return NodeFilter.FILTER_ACCEPT;
  };

  const walker = document.createTreeWalker(
    subtreeRoot,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode: accept,
    },
  );

  let rootStyle: CSSStyleDeclaration;
  try {
    rootStyle = getComputedStyle(subtreeRoot);
  } catch {
    return false;
  }
  paintElementBox(ctx, subtreeRoot, state, rootStyle);
  if (state.paintPseudo)
    paintPseudoElements(ctx, subtreeRoot, rootStyle, state);
  const rootSaved = openScope(ctx, subtreeRoot, rootStyle, state);
  const stack: { el: Element; saved: boolean }[] = [
    { el: subtreeRoot, saved: rootSaved },
  ];

  let truncated = false;
  let node: Node | null = walker.nextNode();
  while (node) {
    state.counter.value += 1;
    if (state.counter.value > state.maxNodes) {
      truncated = true;
      break;
    }

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (!top || node.parentElement === top.el) break;
      stack.pop();
      if (top.saved) ctx.restore();
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const style = styleCache.get(el) ?? getComputedStyle(el);
      paintElementBox(ctx, el, state, style);
      if (state.paintPseudo) paintPseudoElements(ctx, el, style, state);
      const saved = openScope(ctx, el, style, state);
      stack.push({ el, saved });
    } else if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentElement;
      if (parent) paintTextNode(ctx, node as Text, parent, state);
    }

    node = walker.nextNode();
  }

  while (stack.length > 0) {
    const top = stack.pop();
    if (top?.saved) ctx.restore();
  }

  if (!truncated) {
    for (const el of deferred) {
      if (paintTree(ctx, el, state)) {
        truncated = true;
        break;
      }
    }
  }

  return truncated;
};

// --------------------------------------------------------------------------
// createPainter
// --------------------------------------------------------------------------

/**
 * Rasterises `root`'s live subtree onto a canvas so it can be sampled as a
 * texture by a WebGL (or any other canvas-consuming) effect. The canvas is
 * created but never inserted anywhere — mount it wherever you like, but
 * never inside `root` itself, or the painter would observe and repaint its
 * own output forever; treat it as a sibling of `root`.
 *
 * The painting contract:
 *
 * PAINT: element backgrounds (`background-color`, and a single
 * `linear-gradient(...)` `background-image`) with per-corner
 * `border-radius`; `opacity` multiplied down the tree; `overflow:
 * hidden|clip|auto|scroll` clipping descendants to the padding box; borders
 * (stroked as one rounded path when all four sides match, else four filled
 * edges); every visible text node, grapheme-cluster by grapheme-cluster,
 * grouped into per-line runs and drawn with the computed font, color,
 * letter-spacing, text-transform and white-space collapsing, plus
 * underline/line-through; `<input>` (text-like types) and `<textarea>`
 * painting `.value` or their `::placeholder`; `<select>` painting the
 * selected option's label; `<button>` painting like any element, since its
 * label is a real text node; `<img>` (complete, decoded), `<canvas>`,
 * `<video>` (current frame) via `drawImage`, honouring `object-fit:
 * cover|contain|fill`; inline `<svg>` with `currentColor` inlined,
 * rasterised through a cached data-URL `Image` (asynchronous — see below);
 * a `:focus-visible` ring, when `focusRing` is on.
 *
 * APPROXIMATE: `border-radius` uses one horizontal radius per corner, no
 * elliptical corners. Gradients support only a single `linear-gradient`.
 * Pseudo `content` strings and `::marker` (disc/decimal only) paint only
 * when `paintPseudo` is on, positioned at the parent's padding-edge origin.
 * Stacking is DOM order plus one pass: positioned elements with `z-index >
 * 0` are collected and repainted, subtree and all, after their siblings.
 *
 * SKIP: `position: fixed` subtrees, `box-shadow`, `filter`,
 * `backdrop-filter`, `mix-blend-mode`, `clip-path`, `mask`, transforms on
 * the root itself (a child's own transform is already baked into its
 * client rects), scrollbars, `::selection`, and any `display: none` /
 * `visibility: hidden` subtree. `aria-hidden` is NOT a reason to skip —
 * decorative art still paints.
 *
 * Coordinates are relative to `root`'s border box. Canvas size is
 * `ceil(rect.width * dpr) x ceil(rect.height * dpr)`, and the drawing
 * transform is set with `ctx.setTransform` on every pass — never an
 * accumulated `ctx.scale`.
 *
 * Async: a pass that touches a still-loading `<img>` or a not-yet-rasterised
 * inline `<svg>` finishes its synchronous walk with that resource simply
 * absent, then — once the resource settles — repaints the WHOLE surface and
 * bumps `version` again. A subscriber only ever sees completed passes, never
 * a half-painted frame.
 *
 * Past `maxNodes` (shared across the main pass and every deferred
 * z-index sub-pass), the pass discards whatever it had painted and falls
 * back to the root's background + border only, warning once per painter.
 */
export function createPainter(
  root: HTMLElement,
  options: PaintOptions = {},
): PaintController {
  const dprCap = options.dprCap ?? 2;
  const maxNodes = options.maxNodes ?? 1500;
  const paintPseudo = options.paintPseudo ?? false;
  const focusRing = options.focusRing ?? true;
  const background = options.background ?? null;

  const canvas = document.createElement("canvas");
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) {
    throw new Error("paint.ts: createPainter requires a 2D canvas context");
  }
  // Re-bound as non-null so the hoisted helpers below see the narrowed type.
  const ctx: CanvasRenderingContext2D = maybeCtx;
  const nativeCtx = ctx as NativeElementPaintContext;
  const useNative = detectNativeElementPaint(ctx);
  const supportsLetterSpacing = "letterSpacing" in ctx;

  let version = 0;
  let cssWidth = 0;
  let cssHeight = 0;
  let dpr = 1;
  let disposed = false;
  let warnedTruncated = false;
  let rafHandle = 0;
  let repaintQueued = false;

  const listeners = new Set<(surface: PaintedSurface) => void>();
  const svgImageCache = new WeakMap<Element, SvgCacheEntry>();
  const imgLoading = new WeakSet<HTMLImageElement>();

  const surface: PaintedSurface = {
    canvas,
    version: 0,
    width: 0,
    height: 0,
    dpr: 1,
    native: useNative,
  };

  const notify = (): void => {
    for (const listener of listeners) listener(surface);
  };

  const staticState = {
    canvas,
    maxNodes,
    paintPseudo,
    supportsLetterSpacing,
    svgImageCache,
    imgLoading,
    requestAsyncRedraw: (): void => {
      if (!disposed) performAsyncRedraw();
    },
  };

  function ensureCanvasSize(): void {
    const rect = safeRect(root) ?? new DOMRect(0, 0, 0, 0);
    dpr = Math.min(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      dprCap,
    );
    cssWidth = rect.width;
    cssHeight = rect.height;
    const pxW = Math.ceil(cssWidth * dpr);
    const pxH = Math.ceil(cssHeight * dpr);
    if (canvas.width !== pxW) canvas.width = pxW;
    if (canvas.height !== pxH) canvas.height = pxH;
    // setTransform, not scale — idempotent no matter how many times a pass calls it.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function fillBackground(): void {
    if (!background) return;
    ctx.save();
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.restore();
  }

  function runSyncPass(): void {
    ensureCanvasSize();
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    if (useNative) {
      if (background) fillBackground();
      try {
        if (typeof nativeCtx.drawElementImage === "function") {
          nativeCtx.drawElementImage(root, 0, 0, cssWidth, cssHeight);
        } else if (typeof nativeCtx.drawElement === "function") {
          nativeCtx.drawElement(root, 0, 0, cssWidth, cssHeight);
        }
      } catch {
        /* native path failed — leave whatever background was drawn */
      }
      surface.native = true;
      return;
    }
    surface.native = false;
    if (background) fillBackground();
    const rootRect = safeRect(root);
    if (!rootRect) return;
    const state: PassState = {
      ...staticState,
      rootRect,
      counter: { value: 0 },
    };
    const truncated = paintTree(ctx, root, state);
    if (truncated) {
      ctx.clearRect(0, 0, cssWidth, cssHeight);
      if (background) fillBackground();
      try {
        paintBoxDecoration(ctx, root, state, getComputedStyle(root));
      } catch {
        /* leave the cleared (and possibly backgrounded) canvas as the truncated result */
      }
      if (!warnedTruncated) {
        warnedTruncated = true;
        console.warn(
          `paint.ts: painted subtree exceeds maxNodes (${maxNodes}); painting root background and border only.`,
        );
      }
      return;
    }
    if (focusRing) paintFocusRing(ctx, root, rootRect);
  }

  function commitPass(): number {
    runSyncPass();
    version += 1;
    surface.version = version;
    surface.width = cssWidth;
    surface.height = cssHeight;
    surface.dpr = dpr;
    notify();
    return version;
  }

  function performAsyncRedraw(): void {
    if (disposed) return;
    commitPass();
  }

  function paintNow(): number {
    if (disposed) return version;
    return commitPass();
  }

  function scheduleFrame(): void {
    if (repaintQueued || disposed) return;
    repaintQueued = true;
    rafHandle = requestAnimationFrame(() => {
      repaintQueued = false;
      if (!disposed) commitPass();
    });
  }

  function repaint(): void {
    if (disposed) return;
    scheduleFrame();
  }

  function subscribe(listener: (s: PaintedSurface) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  const resizeObserver =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => repaint())
      : null;
  resizeObserver?.observe(root);

  const mutationObserver =
    typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => repaint())
      : null;
  mutationObserver?.observe(root, {
    childList: true,
    characterData: true,
    attributes: true,
    subtree: true,
  });

  const themeObserver =
    typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => repaint())
      : null;
  themeObserver?.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme"],
  });

  const onFocusChange = (): void => repaint();
  if (focusRing) {
    root.addEventListener("focusin", onFocusChange);
    root.addEventListener("focusout", onFocusChange);
  }

  const onFontsLoadingDone = (): void => repaint();
  const fontSet = typeof document !== "undefined" ? document.fonts : undefined;
  fontSet?.addEventListener("loadingdone", onFontsLoadingDone);

  // The automatic first paint waits for fonts; paintNow() never does (tests, and
  // effects that must sample before their own first frame, call it directly).
  const fontsReady: Promise<unknown> = fontSet?.ready ?? Promise.resolve();
  fontsReady.then(
    () => {
      if (!disposed) repaint();
    },
    () => {
      if (!disposed) repaint();
    },
  );

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    if (rafHandle) cancelAnimationFrame(rafHandle);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    themeObserver?.disconnect();
    if (focusRing) {
      root.removeEventListener("focusin", onFocusChange);
      root.removeEventListener("focusout", onFocusChange);
    }
    fontSet?.removeEventListener("loadingdone", onFontsLoadingDone);
    listeners.clear();
  }

  return { surface, repaint, paintNow, subscribe, dispose };
}
