"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type UnderlinePeekStiffness = "soft" | "firm";

export type UnderlinePeekProps = {
  /** Where the link goes. */
  href: string;
  /** The link text. */
  children: React.ReactNode;
  /**
   * The preview card's content. Phrasing content only (spans styled as
   * blocks), because the link usually sits inside a paragraph.
   */
  preview: React.ReactNode;
  /** Milliseconds the pointer or focus must rest on the link before the preview drops. @default 300 */
  delay?: number;
  /** The card slides along under the link toward the pointer, on a lag. @default true */
  follow?: boolean;
  /** Card width in px, capped to the boundary. @default 280 */
  width?: number;
  /** Soft is a slower drop and a longer lag; firm is crisp. @default "firm" */
  stiffness?: UnderlinePeekStiffness;
  /** Controlled open state. */
  open?: boolean;
  /** Initial open state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the hover, focus, tap or key that opened or closed it. */
  onOpenChange?: (open: boolean) => void;
  /** The box the card must stay inside. @default the viewport */
  boundary?: HTMLElement | null;
  target?: string;
  rel?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  /** Play the unfurl and fold. Off unless asked for. @default false */
  sound?: boolean;
  /** The preview never opens; the link still works. @default false */
  disabled?: boolean;
  /** Classes for the link itself. */
  className?: string;
};

/** The underline's thickness while lit: the sheet grows out of exactly this strip. */
const LINE = 2;
/** The tab between the underline and the card. */
const TAB = 6;
/** Card corner (rounded-3) and the fillet where the tab meets the card. */
const RADIUS = 10;
const FILLET = 5;
/** Long enough for a pointer to cross the tab from the link into the card. */
const GRACE = 140;
/** Cubic handle length that draws a quarter circle. */
const KAPPA = 0.5523;
/** A jittery hover must not stack unfurls and folds. */
const SOUND_GAP = 120;

const FEEL = {
  soft: { sheet: springs.glide, follow: springs.drift, lag: 0.08 },
  firm: { sheet: springs.snap, follow: springs.glide, lag: 0.05 },
} as const;

type Geometry = {
  /** Link width and height (layout px). */
  lw: number;
  lh: number;
  /** Boundary left edge and width, relative to the link's left edge. */
  bl: number;
  bw: number;
  /** Whether the card hangs below the link or rises above it. */
  below: boolean;
};

/** x, y, corner radius. */
type Vertex = readonly [number, number, number];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Hover sounds wait for the page's first press, so hovering never wakes audio. */
const activated = () =>
  typeof navigator === "undefined" || !("userActivation" in navigator)
    ? true
    : navigator.userActivation.hasBeenActive;

/**
 * A closed polygon with each corner rounded by its own radius, as one path.
 * Convex corners and concave fillets are the same operation — cut back along
 * both edges, bridge with a quarter-circle cubic — so the tab, its fillets and
 * the card's corners come out of a single outline that stays crisp at every
 * frame of the unfold.
 */
function roundedOutline(
  vertices: readonly Vertex[],
  at: (x: number, y: number) => string,
): string {
  const pts: Vertex[] = [];
  for (const v of vertices) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(v[0] - last[0], v[1] - last[1]) > 0.01) {
      pts.push(v);
    }
  }
  const first = pts[0];
  const tail = pts[pts.length - 1];
  if (
    first &&
    tail &&
    pts.length > 1 &&
    Math.hypot(first[0] - tail[0], first[1] - tail[1]) <= 0.01
  ) {
    pts.pop();
  }
  const n = pts.length;
  if (n < 3) return "";
  const out: string[] = [];
  for (let i = 0; i <= n; i += 1) {
    const v = pts[i % n];
    const p = pts[(i - 1 + n) % n];
    const q = pts[(i + 1) % n];
    if (!v || !p || !q) return "";
    const lp = Math.hypot(p[0] - v[0], p[1] - v[1]);
    const lq = Math.hypot(q[0] - v[0], q[1] - v[1]);
    const r = Math.max(0, Math.min(v[2], lp, lq));
    const a = [
      v[0] + ((p[0] - v[0]) / lp) * r,
      v[1] + ((p[1] - v[1]) / lp) * r,
    ];
    const b = [
      v[0] + ((q[0] - v[0]) / lq) * r,
      v[1] + ((q[1] - v[1]) / lq) * r,
    ];
    const [ax = 0, ay = 0] = a;
    const [bx = 0, by = 0] = b;
    if (i === 0) {
      out.push(`M ${at(bx, by)}`);
      continue;
    }
    out.push(`L ${at(ax, ay)}`);
    if (r > 0.01) {
      out.push(
        `C ${at(ax + (v[0] - ax) * KAPPA, ay + (v[1] - ay) * KAPPA)} ${at(
          bx + (v[0] - bx) * KAPPA,
          by + (v[1] - by) * KAPPA,
        )} ${at(bx, by)}`,
      );
    }
  }
  out.push("Z");
  return out.join(" ");
}

/** Where a sheet's local "away from the underline" frame starts, and how long its tab is. */
const frameOf = (g: Geometry) => ({
  // Below: from the top of the underline down. Above: from its bottom up,
  // through the word, so the ribbon rises behind the text.
  origin: g.below ? g.lh - LINE : g.lh,
  tab: g.below ? LINE + TAB : g.lh + TAB,
});

/**
 * The sheet at one moment: `d` is how far it has dropped away from the line,
 * `s` how far it has spread from the link's width to the card's. At d = 0 it
 * is the underline; at s = 0 a ribbon exactly as wide as the word; at 1, 1 the
 * card hanging from a tab under the word.
 */
function sheetPath(
  d: number,
  s: number,
  cardX: number,
  g: Geometry,
  width: number,
  height: number,
): string {
  if (d < 0.002 || height <= 0) return "";
  const { tab } = frameOf(g);
  const lt = tab * d;
  const hc = height * d;
  const x0 = lerp(0, cardX, s);
  const x1 = lerp(g.lw, cardX + width, s);
  // The tab is the word's span, kept on the card.
  const t0 = clamp(0, x0, x1);
  const t1 = clamp(g.lw, t0, x1);
  const el = t0 - x0;
  const er = x1 - t1;
  const rb = Math.min(RADIUS, hc / 2, (x1 - x0) / 2);
  const rl = Math.min(RADIUS, el, hc / 2);
  const rr = Math.min(RADIUS, er, hc / 2);
  const fl = Math.min(FILLET, lt, Math.max(0, el - rl));
  const fr = Math.min(FILLET, lt, Math.max(0, er - rr));
  const oy = g.below ? 1 : tab + height + 1;
  const dir = g.below ? 1 : -1;
  return roundedOutline(
    [
      [t0, 0, 0],
      [t1, 0, 0],
      [t1, lt, fr],
      [x1, lt, rr],
      [x1, lt + hc, rb],
      [x0, lt + hc, rb],
      [x0, lt, rl],
      [t0, lt, fl],
    ],
    (x, y) => `${r2(x - g.bl)} ${r2(oy + dir * y)}`,
  );
}

/**
 * The card's left edge: as close to `want` as it can be while still covering
 * the whole word (so the tab always lands on it) and staying inside the
 * boundary. The boundary wins when both cannot hold.
 */
function placeX(want: number, g: Geometry, width: number): number {
  const lo = Math.max(g.lw - width, g.bl);
  const hi = Math.min(0, g.bl + g.bw - width);
  if (lo <= hi) return Math.round(clamp(want, lo, hi));
  return Math.round(clamp(want, g.bl, Math.max(g.bl, g.bl + g.bw - width)));
}

const sameGeometry = (a: Geometry | null, b: Geometry) =>
  !!a &&
  a.lw === b.lw &&
  a.lh === b.lh &&
  a.bl === b.bl &&
  a.bw === b.bw &&
  a.below === b.below;

/**
 * A link whose underline opens into its preview. Rest on it and the line
 * stretches away from the word as a ribbon exactly its width, then spreads
 * into a card that hangs from a tab under the word — one outline, rebuilt each
 * frame from two springs, with concave fillets where the tab meets the card.
 * While it is open the card slides along beneath the link toward the pointer
 * on a lagging spring; the tab stays with the word. Leave, blur or press
 * Escape and it folds back into the line on exit tweens.
 *
 * It is a real link: focus opens the preview after the same delay and the
 * preview is the link's description; Escape folds it without closing anything
 * around it; on touch the first tap opens the preview and the second follows
 * the link. The card opens below the word, or above when only that side has
 * room inside `boundary`. Under reduced motion the finished card cross-fades
 * in place, with no drop, spread or travel.
 */
export function UnderlinePeek({
  href,
  children,
  preview,
  delay = 300,
  follow = true,
  width = 280,
  stiffness = "firm",
  open,
  defaultOpen = false,
  onOpenChange,
  boundary = null,
  target,
  rel,
  onClick,
  sound = false,
  disabled = false,
  className,
}: UnderlinePeekProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const cardId = React.useId();
  const feel = FEEL[stiffness] ?? FEEL.firm;

  const [own, setOwn] = React.useState(defaultOpen);
  const isOpen = (open ?? own) && !disabled;
  const [hot, setHot] = React.useState(false);

  const [wrap, setWrap] = React.useState<HTMLSpanElement | null>(null);
  const [card, setCard] = React.useState<HTMLSpanElement | null>(null);
  const [geo, setGeo] = React.useState<Geometry | null>(null);
  const [cardHeight, setCardHeight] = React.useState(0);
  const cardWidth = Math.max(0, Math.round(Math.min(width, geo?.bw ?? width)));

  const drop = useMotionValue(isOpen ? 1 : 0);
  const spread = useMotionValue(isOpen ? 1 : 0);
  // Opacity of the whole sheet: 1 whenever it is out under full motion; the
  // only thing that moves under reduced motion.
  const fade = useMotionValue(isOpen ? 1 : 0);
  const cardX = useMotionValue(0);

  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const openTimer = React.useRef<number | undefined>(undefined);
  const closeTimer = React.useRef<number | undefined>(undefined);
  const pointerX = React.useRef<number | null>(null);
  const overLink = React.useRef(false);
  const overCard = React.useRef(false);
  const keyFocus = React.useRef(false);
  const dismissed = React.useRef(false);
  const tapType = React.useRef("mouse");
  const lastSound = React.useRef(-Infinity);
  const seq = React.useRef(0);

  /**
   * Layout px from rects, so a surrounding transform (a stage growing out of a
   * card, a zoomed canvas) never skews the geometry. Placement is decided here,
   * once per open or resize, never per frame.
   */
  const measure = React.useCallback(
    (height = cardHeight) => {
      if (!wrap || typeof window === "undefined") return;
      const w = wrap.getBoundingClientRect();
      const sx = (wrap.offsetWidth > 0 ? w.width / wrap.offsetWidth : 1) || 1;
      const sy =
        (wrap.offsetHeight > 0 ? w.height / wrap.offsetHeight : 1) || 1;
      const b = boundary?.getBoundingClientRect() ?? {
        left: 0,
        top: 0,
        width: window.innerWidth,
        bottom: window.innerHeight,
      };
      // The card, its tab gap and the 2px offset shadow under it.
      const need = TAB + height + 3;
      const below = (b.bottom - w.bottom) / sy;
      const above = (w.top - b.top) / sy;
      const next: Geometry = {
        lw: wrap.offsetWidth,
        lh: wrap.offsetHeight,
        // A pixel in from each side, so the card's hairline is never cut.
        bl: Math.round((b.left - w.left) / sx) + 1,
        bw: Math.round(b.width / sx) - 2,
        below: below >= need ? true : above >= need ? false : below >= above,
      };
      setGeo((prev) => (sameGeometry(prev, next) ? prev : next));
    },
    [boundary, cardHeight, wrap],
  );

  React.useEffect(() => {
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(wrap);
    if (boundary) observer.observe(boundary);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [boundary, measure, wrap]);

  React.useEffect(() => {
    if (!card || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setCardHeight(card.offsetHeight));
    observer.observe(card);
    return () => observer.disconnect();
  }, [card]);

  const commit = (next: boolean) => {
    if (next === isOpen) return;
    if (open === undefined) setOwn(next);
    onOpenChange?.(next);
  };

  // Timers and document listeners fire after renders they did not see.
  const latest = React.useRef({ commit, measure });
  React.useEffect(() => {
    latest.current = { commit, measure };
  });

  const localX = (clientX: number) => {
    if (!wrap) return 0;
    const w = wrap.getBoundingClientRect();
    const sx = (wrap.offsetWidth > 0 ? w.width / wrap.offsetWidth : 1) || 1;
    return (clientX - w.left) / sx;
  };

  const wantX = React.useCallback(
    (g: Geometry) =>
      placeX(
        follow && pointerX.current !== null
          ? pointerX.current - cardWidth / 2
          : (g.lw - cardWidth) / 2,
        g,
        cardWidth,
      ),
    [cardWidth, follow],
  );

  const chirp = React.useCallback(
    (kind: "unfurl" | "fold") => {
      const now = performance.now();
      if (now - lastSound.current < SOUND_GAP || !activated()) return;
      lastSound.current = now;
      const r = wrap?.getBoundingClientRect();
      const pan = r ? panFrom(r.left + r.width / 2, null) : 0;
      if (kind === "unfurl") {
        audio.play("swish", { pitch: 0.9, gain: 0.3, pan });
      } else {
        audio.play("paper", { pitch: 0.85, gain: 0.28, pan });
      }
    },
    [audio, wrap],
  );

  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
  }, []);

  const unfold = React.useCallback(() => {
    halt();
    seq.current += 1;
    if (geo) {
      const to = wantX(geo);
      // A fresh open starts where it will hang; only a re-open mid-fold slides.
      if (drop.get() < 0.05 || !motionSafe) cardX.set(to);
      else running.current.push(animate(cardX, to, feel.follow));
    }
    if (!motionSafe) {
      drop.set(1);
      spread.set(1);
      running.current.push(
        animate(fade, 1, { duration: durations.fast, ease: easings.enter }),
      );
    } else {
      fade.set(1);
      // The ribbon leads and the card follows: the spread starts a beat
      // after the drop on the same spring, so the line visibly stretches
      // before it widens.
      running.current.push(
        animate(drop, 1, feel.sheet),
        animate(spread, 1, { ...feel.sheet, delay: feel.lag }),
      );
    }
    chirp("unfurl");
  }, [cardX, chirp, drop, fade, feel, geo, halt, motionSafe, spread, wantX]);

  const fold = React.useCallback(() => {
    halt();
    // A completion from a fold that an unfold has since overtaken must not
    // hide the card it re-opened.
    const token = ++seq.current;
    if (!motionSafe) {
      running.current = [
        animate(fade, 0, {
          ...exitFor(durations.fast),
          onComplete: () => {
            if (seq.current !== token) return;
            drop.set(0);
            spread.set(0);
          },
        }),
      ];
    } else {
      // Exits never spring: the card narrows first, then the ribbon is
      // pulled back into the line, both accelerating away.
      running.current = [
        animate(spread, 0, exitFor(durations.base)),
        animate(drop, 0, {
          ...exitFor(durations.base),
          delay: durations.blink,
          onComplete: () => {
            if (seq.current === token) fade.set(0);
          },
        }),
      ];
    }
    chirp("fold");
  }, [chirp, drop, fade, halt, motionSafe, spread]);

  // A host that flips `open` gets the same unfold a hover would.
  const shown = React.useRef(isOpen);
  React.useEffect(() => {
    if (shown.current === isOpen) return;
    shown.current = isOpen;
    if (isOpen) unfold();
    else fold();
  }, [fold, isOpen, unfold]);

  // New geometry or width: the card stays where it may hang.
  React.useEffect(() => {
    if (!geo) return;
    if (drop.get() < 0.01) cardX.set(wantX(geo));
    else animate(cardX, placeX(cardX.get(), geo, cardWidth), feel.follow);
  }, [cardWidth, cardX, drop, feel.follow, geo, wantX]);

  const stopAll = React.useCallback(() => {
    halt();
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  }, [halt]);
  React.useEffect(() => stopAll, [stopAll]);

  // While open, Escape anywhere folds it (hover content must be dismissible
  // without moving the pointer) and is marked handled so nothing around it
  // closes too; a press outside folds it as well.
  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
      dismissed.current = true;
      latest.current.commit(false);
    };
    const onDown = (event: PointerEvent) => {
      if (wrap && event.target instanceof Node && wrap.contains(event.target)) {
        return;
      }
      latest.current.commit(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [isOpen, wrap]);

  const requestOpen = () => {
    window.clearTimeout(closeTimer.current);
    if (disabled || dismissed.current || isOpen) return;
    window.clearTimeout(openTimer.current);
    const go = () => {
      latest.current.measure();
      latest.current.commit(true);
    };
    if (delay <= 0) go();
    else openTimer.current = window.setTimeout(go, delay);
  };

  const requestClose = (after: number) => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      if (overLink.current || overCard.current || keyFocus.current) return;
      latest.current.commit(false);
    }, after);
  };

  const presence = useTransform(
    [drop, fade] as MotionValue<number>[],
    ([d, f]) =>
      (d as number) > 0.002 && (f as number) > 0.002 ? "visible" : "hidden",
  );
  // The open link rises above its neighbours so another link's text can never
  // paint over its card; at rest it sits at the page's own level.
  const layer = useTransform(presence, (p) => (p === "visible" ? 30 : 0));
  const outline = useTransform(
    [drop, spread, cardX] as MotionValue<number>[],
    ([d, s, x]) =>
      geo
        ? sheetPath(
            d as number,
            s as number,
            x as number,
            geo,
            cardWidth,
            cardHeight,
          )
        : "",
  );
  // The first frames of the drop wear the underline's colour, so the line
  // itself is seen to stretch; it cools to the card surface as it lengthens.
  const tint = useTransform(
    drop,
    (d) =>
      `color-mix(in oklch, var(--accent-bright) ${Math.round((1 - clamp01(d * 1.8)) * 70)}%, var(--popover))`,
  );
  const edge = useTransform(drop, (d) => r3(clamp01(d * 2)));
  const contentOpacity = useTransform(
    [drop, spread, fade] as MotionValue<number>[],
    ([d, s, f]) =>
      r3(
        clamp01(((s as number) - 0.45) / 0.55) *
          clamp01(((d as number) - 0.5) / 0.5) *
          (f as number),
      ),
  );
  // The content is laid out at its final size from the start, so it is
  // clipped to the sheet's current card: words never show past the edge of
  // the paper they are printed on.
  const contentClip = useTransform(
    [drop, spread, cardX] as MotionValue<number>[],
    ([d, s, x]) => {
      if (!geo) return "none";
      const { tab } = frameOf(geo);
      const dv = d as number;
      const sv = s as number;
      const xv = x as number;
      const lt = tab * dv;
      const x0 = lerp(0, xv, sv);
      const x1 = lerp(geo.lw, xv + cardWidth, sv);
      const left = clamp(x0 - xv, 0, cardWidth);
      const right = clamp(xv + cardWidth - x1, 0, cardWidth);
      const near = clamp(lt - tab, 0, cardHeight);
      const far = clamp(
        tab + cardHeight - (lt + cardHeight * dv),
        0,
        cardHeight,
      );
      const [top, bottom] = geo.below ? [near, far] : [far, near];
      return `inset(${r2(top)}px ${r2(right)}px ${r2(bottom)}px ${r2(left)}px round ${RADIUS}px)`;
    },
  );
  const shiftX = useTransform(cardX, (x) => r2(x));
  const sheetOpacity = useTransform(fade, (f) => r3(f));

  const frame = geo ? frameOf(geo) : null;
  const svgHeight = frame ? Math.round(frame.tab + cardHeight + 4) : 0;
  const lit = hot || isOpen;

  return (
    <motion.span
      ref={setWrap}
      className="relative inline-block max-w-full align-baseline"
      style={{ zIndex: layer }}
    >
      <a
        href={href}
        target={target}
        rel={rel}
        aria-describedby={geo ? cardId : undefined}
        onPointerEnter={(event) => {
          if (event.pointerType === "touch") return;
          overLink.current = true;
          setHot(true);
          pointerX.current = localX(event.clientX);
          requestOpen();
        }}
        onPointerMove={(event) => {
          if (event.pointerType === "touch") return;
          pointerX.current = localX(event.clientX);
          if (isOpen && follow && motionSafe && geo) {
            animate(cardX, wantX(geo), feel.follow);
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "touch") return;
          overLink.current = false;
          if (!keyFocus.current) setHot(false);
          if (!overCard.current && !keyFocus.current) dismissed.current = false;
          requestClose(GRACE);
        }}
        onPointerDown={(event) => {
          tapType.current = event.pointerType;
        }}
        onFocus={(event) => {
          let byKeyboard = true;
          try {
            byKeyboard = event.currentTarget.matches(":focus-visible");
          } catch {
            // An engine without :focus-visible treats every focus as keyboard.
          }
          if (!byKeyboard) return;
          keyFocus.current = true;
          setHot(true);
          pointerX.current = null;
          requestOpen();
        }}
        onBlur={() => {
          keyFocus.current = false;
          dismissed.current = false;
          if (!overLink.current) setHot(false);
          requestClose(0);
        }}
        onKeyDown={(event) => {
          // Escape before the preview has dropped cancels the wait; once it
          // is open the document listener above handles it.
          if (event.key !== "Escape" || isOpen) return;
          window.clearTimeout(openTimer.current);
          dismissed.current = true;
        }}
        onClick={(event) => {
          // Touch has no hover: the first tap shows what hover would, the
          // second is the link.
          if (
            tapType.current === "touch" &&
            event.detail > 0 &&
            !isOpen &&
            !disabled
          ) {
            event.preventDefault();
            tapType.current = "mouse";
            dismissed.current = false;
            pointerX.current = localX(event.clientX);
            measure();
            commit(true);
            return;
          }
          onClick?.(event);
        }}
        className={cn(
          "relative z-20 block rounded-1 font-medium text-foreground no-underline outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          className,
        )}
      >
        {children}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 rounded-full transition-[height,background-color] duration-150",
            lit ? "h-0.5 bg-cobalt-bright" : "h-px bg-ink-3",
          )}
        />
      </a>
      {geo && frame ? (
        <>
          {/* Positioned by a plain box: a motion SVG keeps the static style
              it mounted with, and this box moves whenever the link reflows. */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute z-10 block"
            style={{
              left: geo.bl,
              top: geo.below
                ? frame.origin - 1
                : frame.origin - frame.tab - cardHeight - 1,
              width: geo.bw,
              height: svgHeight,
              opacity: sheetOpacity,
              visibility: presence,
            }}
          >
            <svg
              width={geo.bw}
              height={svgHeight}
              viewBox={`0 0 ${geo.bw} ${svgHeight}`}
              className="block overflow-visible"
            >
              {/* A hard offset copy of the outline instead of a blurred
                  shadow: it lifts the card off the text it covers at no cost.
                  The offset sits on a plain group, never on a motion element,
                  whose transform motion would own. */}
              <g transform="translate(0 2)">
                <motion.path d={outline} className="fill-ink/8" />
              </g>
              <motion.path
                d={outline}
                strokeWidth={1}
                className="stroke-hairline-strong"
                style={{ fill: tint, strokeOpacity: edge }}
              />
            </svg>
          </motion.span>
          <motion.span
            ref={setCard}
            id={cardId}
            role="tooltip"
            onPointerEnter={(event) => {
              if (event.pointerType === "touch") return;
              overCard.current = true;
              window.clearTimeout(closeTimer.current);
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "touch") return;
              overCard.current = false;
              if (!overLink.current && !keyFocus.current) {
                dismissed.current = false;
              }
              requestClose(GRACE);
            }}
            className={cn(
              "absolute left-0 z-20 block p-3 text-left text-sm leading-5 font-normal whitespace-normal text-popover-foreground not-italic",
              isOpen ? "pointer-events-auto" : "pointer-events-none",
            )}
            style={{
              top: geo.below ? geo.lh + TAB : -TAB - cardHeight,
              width: cardWidth,
              x: shiftX,
              opacity: contentOpacity,
              clipPath: contentClip,
              visibility: presence,
            }}
          >
            {preview}
          </motion.span>
        </>
      ) : null}
    </motion.span>
  );
}
