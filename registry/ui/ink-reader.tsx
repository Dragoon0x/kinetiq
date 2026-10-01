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
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type InkReaderRefresh = "full" | "fast";

export type InkReaderProps = {
  /** The text: any long content. The reader lays it out in pages the size of its screen. */
  children?: React.ReactNode;
  /** The reader's accessible name. @default "E-reader" */
  label?: string;
  /** The book or chapter, shown at the top of the screen. */
  title?: string;
  /** Controlled page, from 1. */
  page?: number;
  /** Initial page when uncontrolled. @default 1 */
  defaultPage?: number;
  /** Fires from a swipe, a tap, a key or a page key, with the page asked for. */
  onPageChange?: (page: number) => void;
  /** Fires when the text has been laid out, and again whenever a new size changes its page count. */
  onPageCountChange?: (count: number) => void;
  /** The front light, 0 (off) to 1. The slider starts here and follows a new value. @default 0.5 */
  light?: number;
  /** Fires from the slider with the new level. */
  onLightChange?: (light: number) => void;
  /** The light's colour, 0 (cool white) to 1 (amber). @default 0.3 */
  warmth?: number;
  /** How a page is drawn: a full flash (inverted, then clean) or a fast draw that leaves a ghost. @default "full" */
  refresh?: InkReaderRefresh;
  /** Play a page turn's paper crinkle. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/*
 * The root is a 5:7 size container; the screen is 88 × 112 cqw with a chin
 * under it for the page keys and the light. Inside the screen everything is
 * in the screen's own units.
 */
const SCREEN = { left: 6, top: 6, width: 88, height: 112 };
const CHIN_Y = 129;
const KEY = { width: 15, height: 8.4 };
const TRACK = { left: 32, width: 35 };
/** Gap between page columns, in the page's own cqw. */
const GAP = 8;
/** A full flash at most this often; faster turns draw fast. */
const FLASH_MS = 500;
const SWIPE = 36;
const THROW = 80;

const BODY = "oklch(0.31 0.005 265)";
const BODY_LIGHT = "oklch(0.4 0.005 265)";
const BODY_DARK = "oklch(0.24 0.005 265)";
const KEYCAP = "oklch(0.37 0.005 265)";
const KEYCAP_LIGHT = "oklch(0.46 0.005 265)";
const MARK = "oklch(0.78 0.004 265)";
const PAPER_LIT = "oklch(0.955 0.004 95)";
/** Unlit paper takes the room's light: it is mixed with the page it sits on. */
const PAPER_UNLIT =
  "color-mix(in oklab, oklch(0.88 0.006 95) 60%, var(--background))";
const WASH = "oklch(0.97 0.003 95)";
const COOL = "oklch(0.96 0.02 250)";
const AMBER = "oklch(0.84 0.1 68)";

/**
 * E-ink is grey ink on paper whatever the theme around it: inside the screen
 * every token is redrawn in ink, so content written with tokens reads as
 * print, and its backgrounds let the lit paper through.
 */
const INK_TOKENS = {
  "--ink": "oklch(0.2 0.004 90)",
  "--ink-2": "oklch(0.36 0.004 90)",
  "--ink-3": "oklch(0.5 0.004 90)",
  "--foreground": "oklch(0.2 0.004 90)",
  "--card-foreground": "oklch(0.2 0.004 90)",
  "--popover-foreground": "oklch(0.2 0.004 90)",
  "--secondary-foreground": "oklch(0.2 0.004 90)",
  "--muted-foreground": "oklch(0.36 0.004 90)",
  "--background": "transparent",
  "--bg-0": "transparent",
  "--bg-1": "transparent",
  "--card": "transparent",
  "--bg-2": "oklch(0.2 0.004 90 / 0.06)",
  "--popover": "oklch(0.2 0.004 90 / 0.06)",
  "--secondary": "oklch(0.2 0.004 90 / 0.06)",
  "--muted": "oklch(0.2 0.004 90 / 0.06)",
  "--hairline": "oklch(0.2 0.004 90 / 0.16)",
  "--hairline-strong": "oklch(0.2 0.004 90 / 0.28)",
  "--border": "oklch(0.2 0.004 90 / 0.16)",
  "--input": "oklch(0.2 0.004 90 / 0.28)",
  "--accent": "oklch(0.2 0.004 90)",
  "--accent-bright": "oklch(0.2 0.004 90)",
  "--accent-wash": "oklch(0.2 0.004 90 / 0.08)",
  "--primary": "oklch(0.2 0.004 90)",
  "--primary-foreground": "oklch(0.96 0.004 95)",
  "--ring": "oklch(0.2 0.004 90)",
  "--signal": "oklch(0.36 0.004 90)",
  "--success": "oklch(0.36 0.004 90)",
  "--warn": "oklch(0.36 0.004 90)",
  "--danger": "oklch(0.2 0.004 90)",
  colorScheme: "light",
} as React.CSSProperties;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const cw = (v: number) => `${r2(v)}cqw`;
/** E-ink has grey levels, not fades: a 0–1 amount drawn in three steps. */
const stepped = (v: number) => Math.ceil(clamp01(v) * 3 - 1e-6) / 3;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

type Said = { n: number; page: number; text: string };
type Ghost = { from: number; key: number };

type Api = {
  refreshTo: (from: number) => void;
  measure: () => void;
};

/** A key on the chin: a cap that travels into the body. */
function ChinKey({
  side,
  press,
  motionSafe,
  disabled,
  onTurn,
  onPress,
}: {
  side: "prev" | "next";
  press: MotionValue<number>;
  motionSafe: boolean;
  disabled: boolean;
  onTurn: () => void;
  onPress: (down: boolean) => void;
}) {
  const y = useTransform(press, (p) =>
    motionSafe ? cw(clamp01(p) * 0.7) : "0cqw",
  );
  const shade = useTransform(press, (p) => r3(clamp01(p) * 0.3));
  return (
    <button
      type="button"
      aria-label={side === "prev" ? "Previous page" : "Next page"}
      disabled={disabled}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        onPress(true);
        const id = event.pointerId;
        const up = (e: PointerEvent) => {
          if (e.pointerId !== id) return;
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
          onPress(false);
        };
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
          onPress(true);
        }
      }}
      onKeyUp={(event) => {
        if (event.key === "Enter" || event.key === " ") onPress(false);
      }}
      onBlur={() => onPress(false)}
      onClick={onTurn}
      className={cn(
        "absolute touch-manipulation rounded-full",
        FOCUS_RING,
        disabled ? "cursor-not-allowed" : "cursor-pointer",
      )}
      style={{
        left: side === "prev" ? cw(SCREEN.left) : undefined,
        right: side === "next" ? cw(SCREEN.left) : undefined,
        top: cw(CHIN_Y - KEY.height / 2),
        width: cw(KEY.width),
        height: cw(KEY.height),
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ background: BODY_DARK, translate: `0 ${cw(0.9)}` }}
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-clip rounded-full"
        style={{
          y,
          background: `linear-gradient(180deg, ${KEYCAP_LIGHT}, ${KEYCAP})`,
          boxShadow: `inset 0 ${cw(0.25)} 0 color-mix(in oklab, white 14%, transparent)`,
        }}
      >
        <svg
          viewBox="0 0 12 12"
          style={{ width: cw(3.6), height: cw(3.6) }}
          fill="none"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="relative"
        >
          <path
            d={
              side === "prev"
                ? "M 7.5 2.5 L 4 6 L 7.5 9.5"
                : "M 4.5 2.5 L 8 6 L 4.5 9.5"
            }
            style={{ stroke: MARK }}
          />
        </svg>
        <motion.span
          className="absolute inset-0"
          style={{ opacity: shade, background: "oklch(0 0 0)" }}
        />
      </motion.span>
    </button>
  );
}

/**
 * An e-reader holding any long text. The reader lays the text out in pages
 * exactly as wide as its screen — CSS columns, measured, so a narrower
 * reader has more pages — and every turn is the medium's own motion: a full
 * refresh shows the new page inverted, snaps to white and clears in three
 * grey steps; a fast refresh draws at once and leaves the old page as a
 * ghost that clears the same way. A full flash is never repeated within
 * half a second, so a run of turns cannot strobe.
 *
 * Swipe or tap the page (the left third goes back), press the keys on the
 * chin, or use the keyboard on the focused page. The front-light slider
 * brings the paper up from the room's own light — in a dark theme an unlit
 * page is dim — and tints it with the light's colour, cool to amber, while
 * the ink stays black. The page count in the footer updates with each
 * refresh. Under reduced motion there is no flash and no ghost: the new page
 * appears under a paper wash that fades.
 */
export function InkReader({
  children,
  label = "E-reader",
  title,
  page,
  defaultPage = 1,
  onPageChange,
  onPageCountChange,
  light = 0.5,
  onLightChange,
  warmth = 0.3,
  refresh = "full",
  sound = false,
  disabled = false,
  className,
}: InkReaderProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);

  const [count, setCount] = React.useState<number | null>(null);
  const [ownPage, setOwnPage] = React.useState(() =>
    Math.max(1, Math.round(defaultPage)),
  );
  const asked = Math.max(1, Math.round(page ?? ownPage));
  const shown = count === null ? asked : Math.min(asked, count);

  // The light follows a new value passed in, and the slider moves it from there.
  const [level, setLevel] = React.useState(() => r2(clamp01(light)));
  const [seenLight, setSeenLight] = React.useState(light);
  if (seenLight !== light) {
    setSeenLight(light);
    setLevel(r2(clamp01(light)));
  }

  const [said, setSaid] = React.useState<Said>({ n: 0, page: shown, text: "" });
  if (said.page !== shown) {
    setSaid({
      n: said.n + 1,
      page: shown,
      text: count === null ? `Page ${shown}.` : `Page ${shown} of ${count}.`,
    });
  }
  const [ghost, setGhost] = React.useState<Ghost | null>(null);

  const flash = useMotionValue(0);
  const wash = useMotionValue(0);
  const fade = useMotionValue(0);
  const knob = useMotionValue(level);
  const prevPress = useMotionValue(0);
  const nextPress = useMotionValue(0);

  const pageRef = React.useRef<HTMLDivElement | null>(null);
  const flowRef = React.useRef<HTMLDivElement | null>(null);
  const endRef = React.useRef<HTMLSpanElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const lastFlash = React.useRef(-Infinity);
  const ghostKey = React.useRef(0);
  const dragFrom = React.useRef(0);
  const measureSoon = React.useRef(0);
  const counted = React.useRef<number | null>(null);
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  /* ------------------------------- turning ------------------------------- */

  const goTo = (to: number) => {
    if (disabled) return;
    const last = count ?? Math.max(shown, to);
    const next = Math.min(last, Math.max(1, to));
    if (next === shown) {
      setSaid((s) => ({
        ...s,
        n: s.n + 1,
        text: to > shown ? "Last page." : "First page.",
      }));
      return;
    }
    audio.play("paper", {
      pitch: next > shown ? 1.05 : 0.92,
      gain: 0.45,
      pan: next > shown ? 0.3 : -0.3,
    });
    if (page === undefined) setOwnPage(next);
    onPageChange?.(next);
  };
  const turn = (dir: 1 | -1) => goTo(shown + dir);

  const refreshTo = (from: number) => {
    if (!motionSafe) {
      wash.set(0.7);
      run(
        "wash",
        animate(wash, 0, { duration: durations.fast, ease: easings.enter }),
      );
      return;
    }
    const now = performance.now();
    const full = refresh === "full" && now - lastFlash.current >= FLASH_MS;
    if (full) {
      lastFlash.current = now;
      setGhost(null);
      // Inverted for 160 ms, then white, cleared in three grey steps.
      run(
        "flash",
        animate(flash, [2, 2, 1, 0], {
          duration: 0.52,
          times: [0, 0.3, 0.31, 1],
          ease: "linear",
        }),
      );
      return;
    }
    ghostKey.current += 1;
    const key = ghostKey.current;
    setGhost({ from, key });
    fade.set(1);
    run(
      "fade",
      animate(fade, 0, {
        duration: 0.6,
        ease: "linear",
        onComplete: () => setGhost((g) => (g && g.key === key ? null : g)),
      }),
    );
  };

  /* ------------------------------ measuring ------------------------------ */

  const measure = () => {
    const flow = flowRef.current;
    const end = endRef.current;
    const viewport = pageRef.current;
    if (!flow || !end || !viewport) return;
    const width = viewport.clientWidth;
    if (width < 1) return;
    const gap = parseFloat(getComputedStyle(flow).columnGap) || 0;
    const dx =
      end.getBoundingClientRect().left - flow.getBoundingClientRect().left;
    const pages = Math.max(1, Math.floor((dx + 1) / (width + gap)) + 1);
    if (pages === counted.current) return;
    counted.current = pages;
    setCount(pages);
    onPageCountChange?.(pages);
  };

  React.useEffect(() => {
    api.current = { refreshTo, measure };
  });

  // Content may change on any render; the count is read on the next frame.
  React.useEffect(() => {
    if (measureSoon.current) return;
    measureSoon.current = window.requestAnimationFrame(() => {
      measureSoon.current = 0;
      api.current?.measure();
    });
  });

  React.useEffect(() => {
    const fonts = document.fonts;
    let live = true;
    void fonts?.ready.then(() => {
      if (live) api.current?.measure();
    });
    return () => {
      live = false;
    };
  }, []);

  const bindPage = React.useCallback((node: HTMLDivElement | null) => {
    pageRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  const shownPage = React.useRef(shown);
  React.useEffect(() => {
    if (shownPage.current === shown) return;
    const from = shownPage.current;
    shownPage.current = shown;
    api.current?.refreshTo(from);
  }, [shown]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      if (measureSoon.current) window.cancelAnimationFrame(measureSoon.current);
      measureSoon.current = 0;
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /* ------------------------------- gestures ------------------------------ */

  const swipe = useDrag({
    axis: "x",
    threshold: 6,
    disabled,
    onEnd: ({ offset, velocity }) => {
      const thrown = project(offset.x, velocity.x, 0.99);
      if (Math.abs(offset.x) > SWIPE || Math.abs(thrown) > THROW) {
        turn((offset.x !== 0 ? offset.x : thrown) < 0 ? 1 : -1);
      }
    },
    onTap: (event) => {
      const rect = pageRef.current?.getBoundingClientRect();
      if (!rect) return;
      turn(event.clientX - rect.left < rect.width / 3 ? -1 : 1);
    },
  });

  const onPageKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.metaKey || event.ctrlKey || event.altKey) return;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
      case "PageDown":
        event.preventDefault();
        turn(1);
        return;
      case "ArrowLeft":
      case "ArrowUp":
      case "PageUp":
        event.preventDefault();
        turn(-1);
        return;
      case " ":
        event.preventDefault();
        turn(event.shiftKey ? -1 : 1);
        return;
      case "Home":
        event.preventDefault();
        goTo(1);
        return;
      case "End":
        event.preventDefault();
        goTo(count ?? shown);
        return;
    }
  };

  const pressKey = (side: "prev" | "next", down: boolean) => {
    const mv = side === "prev" ? prevPress : nextPress;
    if (!motionSafe) {
      anims.current.get(side)?.stop();
      mv.set(down ? 1 : 0);
      return;
    }
    run(side, animate(mv, down ? 1 : 0, down ? springs.flick : springs.snap));
  };

  /* ------------------------------ the light ------------------------------ */

  const setLight = (v: number) => {
    const next = r2(clamp01(v));
    if (next === level) return;
    setLevel(next);
    onLightChange?.(next);
  };

  const settleKnob = (to: number) => {
    if (!motionSafe) {
      anims.current.get("knob")?.stop();
      knob.set(to);
      return;
    }
    run("knob", animate(knob, to, springs.snap));
  };

  const slide = useDrag({
    axis: "x",
    threshold: 2,
    disabled,
    onStart: () => {
      anims.current.get("knob")?.stop();
      dragFrom.current = knob.get();
    },
    onMove: ({ offset }) => {
      const width = trackRef.current?.clientWidth ?? 0;
      if (width < 1) return;
      const raw = dragFrom.current + offset.x / width;
      // The knob is never stopped dead under the finger: past the ends it gives.
      const shownAt =
        raw < 0
          ? rubberband(raw, 0.4)
          : raw > 1
            ? 1 + rubberband(raw - 1, 0.4)
            : raw;
      knob.set(r3(shownAt));
      setLight(raw);
    },
    onEnd: () => settleKnob(clamp01(knob.get())),
    onCancel: () => settleKnob(level),
    onTap: (event) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width < 1) return;
      const v = r2(clamp01((event.clientX - rect.left) / rect.width));
      setLight(v);
      settleKnob(v);
    },
  });

  const onSliderKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const steps: Record<string, number> = {
      ArrowRight: 0.05,
      ArrowUp: 0.05,
      ArrowLeft: -0.05,
      ArrowDown: -0.05,
      PageUp: 0.2,
      PageDown: -0.2,
    };
    let to: number | null = null;
    if (event.key in steps) to = level + (steps[event.key] ?? 0);
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = 1;
    if (to === null) return;
    event.preventDefault();
    const v = r2(clamp01(to));
    setLight(v);
    settleKnob(v);
  };

  // A level that arrives from outside (the prop) moves the knob too.
  const knobLevel = React.useRef(level);
  React.useEffect(() => {
    if (knobLevel.current === level) return;
    knobLevel.current = level;
    if (Math.abs(knob.get() - level) > 0.011) settleKnob(level);
    // The knob only follows the level; the drag sets both itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  /* ---------------------------- derived values --------------------------- */

  const invert = useTransform(flash, (f) =>
    f > 1.0001 ? "invert(1)" : "none",
  );
  const white = useTransform(flash, (f) => (f > 1.0001 ? 0 : stepped(f)));
  const ghostOpacity = useTransform(fade, (f) => r3(stepped(f) * 0.3));
  const knobLeft = useTransform(knob, (k) => `${r2(k * 100)}%`);
  const fillWidth = useTransform(knob, (k) => `${r2(clamp01(k) * 100)}%`);

  const paper = `color-mix(in oklab, ${PAPER_LIT} ${Math.round(level * 100)}%, ${PAPER_UNLIT})`;
  // Cool white to amber in oklab: the straight path runs through neutral,
  // where an oklch path between these hues would pass through green.
  const tint = `color-mix(in oklab, ${COOL}, ${AMBER} ${Math.round(clamp01(warmth) * 100)}%)`;
  const progress = count && count > 1 ? (shown - 1) / (count - 1) : 0;
  const pageLabel =
    count === null ? `Page ${shown}` : `Page ${shown} of ${count}`;
  const pageFlow = (index: number): React.CSSProperties => ({
    width: "100cqw",
    columnWidth: "100cqw",
    columnGap: cw(GAP),
    columnFill: "auto",
    transform: `translateX(calc(${-index} * (100cqw + ${cw(GAP)})))`,
    fontSize: "max(10px, 5cqw)",
    lineHeight: 1.5,
  });

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "group/ink-reader [container-type:size] relative aspect-[5/7] w-full select-none",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: cw(7),
          background: `linear-gradient(160deg, ${BODY_LIGHT}, ${BODY} 30%, ${BODY_DARK})`,
          boxShadow: `inset 0 0 0 ${cw(0.5)} color-mix(in oklab, white 10%, transparent), inset 0 ${cw(-1)} ${cw(2)} color-mix(in oklab, black 30%, transparent)`,
        }}
      />

      <motion.div
        className="[container-type:size] absolute overflow-clip"
        style={{
          left: cw(SCREEN.left),
          top: cw(SCREEN.top),
          width: cw(SCREEN.width),
          height: cw(SCREEN.height),
          borderRadius: cw(1.4),
          background: paper,
          filter: invert,
        }}
      >
        <div className="absolute inset-0 text-foreground" style={INK_TOKENS}>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 border-b border-hairline font-sans text-ink-2"
            style={{
              height: "9%",
              paddingInline: "6%",
              fontSize: "max(9px, 3.6cqw)",
            }}
          >
            <span className="truncate font-medium tracking-[0.04em] uppercase">
              {title}
            </span>
            <svg
              viewBox="0 0 16 9"
              className="block shrink-0"
              style={{ width: cw(5.6), height: cw(3.2) }}
              fill="none"
              stroke="currentColor"
            >
              <rect
                x="0.6"
                y="0.6"
                width="13"
                height="7.8"
                rx="1.4"
                strokeWidth="1.1"
              />
              <rect
                x="2.2"
                y="2.2"
                width="7.4"
                height="4.6"
                fill="currentColor"
                stroke="none"
              />
              <rect
                x="14.4"
                y="3"
                width="1.2"
                height="3"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          </div>

          <div
            ref={bindPage}
            role="region"
            aria-label={pageLabel}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={onPageKey}
            {...swipe}
            className={cn(
              "[container-type:size] absolute touch-pan-y overflow-clip rounded-1 outline-none [-webkit-touch-callout:none]",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
            )}
            style={{ left: "6%", right: "6%", top: "12%", bottom: "11%" }}
          >
            <div
              ref={flowRef}
              className="absolute top-0 left-0 h-full"
              style={pageFlow(shown - 1)}
            >
              {children}
              <span ref={endRef} aria-hidden className="block h-0" />
            </div>
            {ghost ? (
              <motion.div
                key={ghost.key}
                aria-hidden
                inert
                className="pointer-events-none absolute top-0 left-0 h-full"
                style={{ ...pageFlow(ghost.from - 1), opacity: ghostOpacity }}
              >
                {children}
              </motion.div>
            ) : null}
          </div>

          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 font-sans text-ink-2 tabular-nums"
            style={{
              height: "9%",
              paddingInline: "6%",
              fontSize: "max(9px, 3.4cqw)",
            }}
          >
            <span className="shrink-0">{pageLabel}</span>
            <span className="relative h-px flex-1 bg-hairline-strong">
              <span
                className="absolute inset-y-0 left-0 bg-ink-2"
                style={{ width: `${r2(progress * 100)}%` }}
              />
            </span>
            <span className="shrink-0">{Math.round(progress * 100)}%</span>
          </div>
        </div>

        {/* The front light: its colour over the paper, a little stronger at the
            bottom edge where its LEDs sit. Multiply keeps the ink black. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 mix-blend-multiply"
          style={{ background: tint, opacity: r3(level * 0.6) }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, color-mix(in oklab, white 26%, transparent), transparent 38%)",
            opacity: r3(level * 0.6),
          }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: WASH, opacity: white }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: PAPER_LIT, opacity: wash }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            borderRadius: cw(1.4),
            boxShadow: `inset 0 ${cw(0.6)} ${cw(1.4)} color-mix(in oklab, black 26%, transparent)`,
          }}
        />
      </motion.div>

      <ChinKey
        side="prev"
        press={prevPress}
        motionSafe={motionSafe}
        disabled={disabled}
        onTurn={() => turn(-1)}
        onPress={(down) => pressKey("prev", down)}
      />
      <ChinKey
        side="next"
        press={nextPress}
        motionSafe={motionSafe}
        disabled={disabled}
        onTurn={() => turn(1)}
        onPress={(down) => pressKey("next", down)}
      />

      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="pointer-events-none absolute"
        style={{
          left: cw(TRACK.left - 7.6),
          top: cw(CHIN_Y - 1.8),
          width: cw(3.6),
          height: cw(3.6),
        }}
        fill="none"
        strokeWidth="1.3"
      >
        <circle cx="6" cy="6" r="3.2" style={{ stroke: MARK }} />
      </svg>
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="pointer-events-none absolute"
        style={{
          left: cw(TRACK.left + TRACK.width + 3.2),
          top: cw(CHIN_Y - 2.2),
          width: cw(4.4),
          height: cw(4.4),
        }}
        fill="none"
        strokeWidth="1.3"
        strokeLinecap="round"
      >
        <circle cx="6" cy="6" r="2.6" style={{ fill: MARK }} />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
          const rad = (a * Math.PI) / 180;
          return (
            <line
              key={a}
              x1={r3(6 + Math.cos(rad) * 4)}
              y1={r3(6 + Math.sin(rad) * 4)}
              x2={r3(6 + Math.cos(rad) * 5.4)}
              y2={r3(6 + Math.sin(rad) * 5.4)}
              style={{ stroke: MARK }}
            />
          );
        })}
      </svg>
      <div
        role="slider"
        aria-label="Front light"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(level * 100)}
        aria-valuetext={`${Math.round(level * 100)}%`}
        aria-orientation="horizontal"
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onSliderKey}
        {...slide}
        className={cn(
          "absolute touch-pan-y rounded-full",
          FOCUS_RING,
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
        style={{
          left: cw(TRACK.left - 2),
          width: cw(TRACK.width + 4),
          top: cw(CHIN_Y - 4.5),
          height: cw(9),
        }}
      >
        <div
          ref={trackRef}
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: cw(2),
            right: cw(2),
            height: cw(1.3),
            background: BODY_DARK,
            boxShadow: `inset 0 ${cw(0.3)} ${cw(0.4)} color-mix(in oklab, black 40%, transparent)`,
          }}
        >
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: fillWidth,
              background: `color-mix(in oklab, oklch(0.92 0.02 250), oklch(0.86 0.1 75) ${Math.round(clamp01(warmth) * 100)}%)`,
            }}
          />
          <motion.span
            className="absolute top-1/2 rounded-full"
            style={{
              left: knobLeft,
              width: cw(5),
              height: cw(5),
              x: "-50%",
              y: "-50%",
              background:
                "linear-gradient(180deg, oklch(0.95 0.003 265), oklch(0.8 0.004 265))",
              boxShadow: `0 ${cw(0.4)} ${cw(0.8)} color-mix(in oklab, black 40%, transparent)`,
            }}
          />
        </div>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
