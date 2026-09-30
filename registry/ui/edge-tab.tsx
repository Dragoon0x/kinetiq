"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type TactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type EdgeTabTone = "info" | "success" | "warn" | "danger";

export type EdgeTabNotice = {
  id: string;
  title: string;
  body?: string;
  /** @default "info" */
  tone?: EdgeTabTone;
  /** A short time beside the title: "2m", "09:40". */
  time?: string;
};

export type EdgeTabSide = "left" | "right";
export type EdgeTabStack = "urgency" | "time";

export type EdgeTabProps = {
  /** The notices, oldest first. Each waits as a tab at the edge. */
  notices: EdgeTabNotice[];
  /** Fires from the Done button, Delete, or the drag that dismissed a card. */
  onDismiss?: (id: string) => void;
  /** Fires when a card is pushed back to the edge, and its timer starts. */
  onSnooze?: (id: string) => void;
  /** The card that came out (its id), or null when it went back. */
  onOpenChange?: (id: string | null) => void;
  /** How much of each tab shows, 8 to 32 px. The glyph shows from 22. @default 16 */
  peek?: number;
  /** The edge the tabs wait at. @default "right" */
  side?: EdgeTabSide;
  /** Order the tabs by urgency (danger first) or by time (newest first). @default "urgency" */
  stack?: EdgeTabStack;
  /** How long a pushed-back card sleeps, in seconds. @default 300 */
  snoozeFor?: number;
  /** The notice region's accessible name. @default "Notices" */
  label?: string;
  /** The surface the tabs wait at the edge of. */
  children?: React.ReactNode;
  /** Play the slide and the latch. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** Margin inside the surface, above the first tab and below the last. */
const MARGIN = 16;
/** Most and least of each tab's top that shows while stacked. */
const MAX_PITCH = 64;
const MIN_PITCH = 24;
/** A card's height before it has been measured. */
const EST_H = 116;
const BAND = 4;
/** Hovered, a resting tab comes this much further out. */
const LIFT = 6;
/** Space kept between an open card and the far edge. */
const GAP = 12;

const RANK: Record<EdgeTabTone, number> = {
  danger: 0,
  warn: 1,
  info: 2,
  success: 3,
};

const TONES: Record<EdgeTabTone, string> = {
  info: "var(--accent)",
  success: "var(--success)",
  warn: "var(--warn)",
  danger: "var(--danger)",
};

/** The tone as pigment: the band is a filled shape and reads the same in both themes. */
const PIGMENT = "oklch(from var(--tone) 0.66 calc(c * 0.95) h)";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;

const sentence = (text: string) =>
  /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;

const clockText = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const shortTime = (seconds: number) =>
  seconds < 60 ? `${Math.round(seconds)}s` : `${Math.round(seconds / 60)}m`;

const spokenTime = (seconds: number) => {
  const s = Math.round(seconds);
  if (s < 60) return `${s} ${s === 1 ? "second" : "seconds"}`;
  const m = Math.round(s / 60);
  return `${m} ${m === 1 ? "minute" : "minutes"}`;
};

// Whether the page is hidden, read the way React wants external state read.
const subscribeHidden = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const hiddenNow = () => document.hidden;
const hiddenOnServer = () => false;

function Glyph({ tone, asleep }: { tone: EdgeTabTone; asleep: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {asleep ? (
        <>
          <circle cx={8} cy={8} r={5.6} />
          <path d="M8 5v3.2l2 1.3" />
        </>
      ) : tone === "danger" ? (
        <>
          <path d="M8 2.6 14 13H2Z" />
          <path d="M8 6.6v2.8" />
          <circle cx={8} cy={11.2} r={0.5} fill="currentColor" />
        </>
      ) : tone === "warn" ? (
        <>
          <circle cx={8} cy={8} r={5.6} />
          <path d="M8 5.2v3.4" />
          <circle cx={8} cy={10.8} r={0.5} fill="currentColor" />
        </>
      ) : tone === "success" ? (
        <>
          <circle cx={8} cy={8} r={5.6} />
          <path d="m5.6 8.2 1.7 1.6 3.2-3.4" />
        </>
      ) : (
        <>
          <circle cx={8} cy={8} r={5.6} />
          <path d="M8 7.4v3.4" />
          <circle cx={8} cy={5.2} r={0.5} fill="currentColor" />
        </>
      )}
    </svg>
  );
}

type Via = "pointer" | "keyboard";

type CardProps = {
  notice: EdgeTabNotice;
  side: EdgeTabSide;
  peek: number;
  /** Where its top rests, and where it goes when it is out. */
  y: number;
  tabH: number;
  z: number;
  isOpen: boolean;
  asleep: boolean;
  snoozeKey: number;
  wakeKey: number;
  snoozeFor: number;
  paused: boolean;
  fresh: boolean;
  leaving: boolean;
  focusable: boolean;
  disabled: boolean;
  motionSafe: boolean;
  audio: TactileSound;
  hintId: string;
  onOpen: (id: string, via: Via) => void;
  onClose: (id: string, focusTab: boolean) => void;
  onSnooze: (id: string, focusTab: boolean) => void;
  onDismiss: (id: string) => void;
  onGone: (id: string) => void;
  onWake: (id: string) => void;
  onHeight: (id: string, height: number) => void;
  onTabKey: (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onTabFocus: (id: string) => void;
  bindTab: (id: string, node: HTMLButtonElement | null) => void;
  bindPanel: (id: string, node: HTMLDivElement | null) => void;
};

function EdgeCard({
  notice,
  side,
  peek,
  y,
  tabH,
  z,
  isOpen,
  asleep,
  snoozeKey,
  wakeKey,
  snoozeFor,
  paused,
  fresh,
  leaving,
  focusable,
  disabled,
  motionSafe,
  audio,
  hintId,
  onOpen,
  onClose,
  onSnooze,
  onDismiss,
  onGone,
  onWake,
  onHeight,
  onTabKey,
  onTabFocus,
  bindTab,
  bindPanel,
}: CardProps) {
  const id = notice.id;
  const uid = React.useId();
  const tone = notice.tone ?? "info";
  // Pulling out is toward the middle: left on the right edge, right on the left.
  const dir = side === "right" ? -1 : 1;
  const hidden = -(peek + 16);

  const pull = useMotionValue(fresh ? hidden : 0);
  const top = useMotionValue(y);
  const sleep = useMotionValue(1);
  const flash = useMotionValue(0);
  const fade = useMotionValue(1);

  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const fling = React.useRef(0);
  const shownOpen = React.useRef(isOpen);
  const shownY = React.useRef(y);
  const arriving = React.useRef(fresh);
  const lastSnooze = React.useRef(snoozeKey);
  const lastWake = React.useRef(wakeKey);
  const grab = React.useRef({ active: false, start: 0, open: 0 });
  const detach = React.useRef<(() => void) | null>(null);
  const latest = React.useRef({ onGone, onWake, audio });
  React.useEffect(() => {
    latest.current = { onGone, onWake, audio };
  });

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  /** How far out a card has to come to be wholly in view. */
  const openDistance = () => {
    const w = cardRef.current?.offsetWidth ?? 272;
    return Math.max(0, w + GAP - peek);
  };

  const panHere = () => {
    const rect = cardRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  // Out or back, whoever asked: the gesture leaves its speed in `fling`.
  React.useEffect(() => {
    if (isOpen === shownOpen.current) return;
    shownOpen.current = isOpen;
    const velocity = fling.current;
    fling.current = 0;
    const snoozing = snoozeKey !== lastSnooze.current;
    lastSnooze.current = snoozeKey;
    if (!motionSafe) {
      pull.jump(isOpen ? openDistance() : 0);
      fade.set(0.4);
      run(
        "fade",
        animate(fade, 1, { duration: durations.fast, ease: easings.enter }),
      );
      if (snoozing) latest.current.audio.play("click", { gain: 0.55 });
      return;
    }
    if (isOpen) {
      run("pull", animate(pull, openDistance(), { ...springs.snap, velocity }));
    } else {
      run(
        "pull",
        animate(pull, 0, {
          ...springs.glide,
          velocity,
          // The latch is heard when the tab is home, not when it was pushed.
          onComplete: snoozing
            ? () =>
                latest.current.audio.play("click", {
                  gain: 0.55,
                  pan: panHere(),
                })
            : undefined,
        }),
      );
    }
    // The card's position is the gesture's or the host's, not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  React.useEffect(() => {
    if (y === shownY.current) return;
    shownY.current = y;
    if (!motionSafe) {
      top.jump(y);
      return;
    }
    run("top", animate(top, y, springs.glide));
  }, [y, motionSafe, top]);

  // A new notice slides in from beyond the edge; finished, not frozen, if a
  // re-run interrupts it.
  React.useEffect(() => {
    if (!arriving.current || leaving) return;
    const done = () => {
      arriving.current = false;
    };
    if (!motionSafe) {
      pull.jump(0);
      fade.set(0);
      run(
        "fade",
        animate(fade, 1, {
          duration: durations.base,
          ease: easings.enter,
          onComplete: done,
        }),
      );
      return;
    }
    run("pull", animate(pull, 0, { ...springs.snap, onComplete: done }));
  }, [leaving, motionSafe, pull, fade]);

  // Done: back out through the edge, and gone.
  React.useEffect(() => {
    if (!leaving) return;
    const gone = () => latest.current.onGone(id);
    if (!motionSafe) {
      run("fade", animate(fade, 0, { ...exitFor(), onComplete: gone }));
      return;
    }
    run(
      "pull",
      animate(pull, -(peek + 24), {
        duration: durations.base,
        ease: easings.exit,
        onComplete: gone,
      }),
    );
  }, [leaving, motionSafe, pull, fade, peek, id]);

  // The snooze drains while the page can see it; a new snooze starts full.
  React.useEffect(() => {
    if (!asleep) {
      anims.current.get("sleep")?.stop();
      sleep.set(1);
      return;
    }
    if (paused || leaving) return;
    const left = sleep.get();
    const controls = animate(sleep, 0, {
      duration: Math.max(0.05, left * snoozeFor),
      ease: "linear",
      onComplete: () => latest.current.onWake(id),
    });
    run("sleep", controls);
    return () => controls.stop();
  }, [asleep, paused, leaving, snoozeKey, snoozeFor, sleep, id]);

  // Woken: a tap on the shoulder, out and back on snap.
  React.useEffect(() => {
    if (wakeKey === lastWake.current) return;
    lastWake.current = wakeKey;
    if (!motionSafe) {
      flash.set(1);
      run(
        "flash",
        animate(flash, 0, { duration: durations.slow, ease: easings.enter }),
      );
      return;
    }
    run(
      "pull",
      animate(pull, 10, {
        ...springs.snap,
        onComplete: () => {
          if (!shownOpen.current) run("pull", animate(pull, 0, springs.snap));
        },
      }),
    );
  }, [wakeKey, motionSafe, pull, flash]);

  // A re-run (StrictMode, or the card moving in the stack) stops whatever was
  // in flight; the card finishes where its props say it belongs, not frozen.
  const placed = React.useRef({ isOpen, y, leaving, motionSafe });
  React.useEffect(() => {
    placed.current = { isOpen, y, leaving, motionSafe };
  });
  React.useEffect(() => {
    const p = placed.current;
    const settle = p.motionSafe ? springs.glide : { duration: 0 };
    if (!arriving.current && !p.leaving && !grab.current.active) {
      const target = p.isOpen ? openDistance() : 0;
      if (Math.abs(pull.get() - target) > 0.5) {
        run("pull", animate(pull, target, settle));
      }
    }
    if (Math.abs(top.get() - p.y) > 0.5) run("top", animate(top, p.y, settle));
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      detach.current?.();
      detach.current = null;
    };
    // Mount and re-run only: it reads the latest placement from the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bindCard = React.useCallback(
    (node: HTMLDivElement | null) => {
      cardRef.current = node;
      if (!node) return;
      const sizer = new ResizeObserver(() =>
        onHeight(id, Math.round(node.offsetHeight)),
      );
      sizer.observe(node);
      return () => sizer.disconnect();
    },
    [id, onHeight],
  );

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled: disabled || leaving,
    onStart: () => {
      anims.current.get("pull")?.stop();
      grab.current = { active: true, start: pull.get(), open: openDistance() };
    },
    onMove: ({ offset }) => {
      const g = grab.current;
      if (!g.active) return;
      pull.set(r2(rubberClamp(g.start + dir * offset.x, 0, g.open, g.open)));
    },
    onEnd: ({ velocity }) => {
      const g = grab.current;
      if (!g.active) return;
      g.active = false;
      const v = dir * velocity.x;
      const landing = project(pull.get(), v, 0.99);
      const out = landing > g.open / 2;
      fling.current = v;
      if (out && !isOpen) {
        onOpen(id, "pointer");
      } else if (!out && isOpen) {
        onSnooze(id, false);
      } else {
        fling.current = 0;
        run(
          "pull",
          motionSafe
            ? animate(pull, out ? g.open : 0, {
                ...(out ? springs.snap : springs.glide),
                velocity: v,
              })
            : animate(pull, out ? g.open : 0, { duration: 0 }),
        );
      }
    },
    onCancel: () => {
      grab.current.active = false;
      run(
        "pull",
        animate(
          pull,
          isOpen ? grab.current.open : 0,
          motionSafe ? springs.glide : { duration: 0 },
        ),
      );
    },
    onTap: (event) => {
      const target = event.target as Element | null;
      const button = target?.closest("button");
      // The card's own buttons answer their own clicks.
      if (button && !button.hasAttribute("data-edge-tab")) return;
      if (isOpen) {
        if (button) onClose(id, false);
        return;
      }
      onOpen(id, "pointer");
    },
  });

  // A tab is a thin strip: a quick pull leaves it before the drag has
  // travelled far enough to capture the pointer. Until the capture, moves
  // that land outside the card are handed to the drag from the window.
  const onCardPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerDown(event);
    detach.current?.();
    const card = event.currentTarget;
    const pointerId = event.pointerId;
    const outside = (e: PointerEvent) =>
      e.pointerId === pointerId &&
      !(e.target instanceof Node && card.contains(e.target));
    const asReact = (e: PointerEvent) => e as unknown as React.PointerEvent;
    const move = (e: PointerEvent) => {
      if (outside(e)) drag.onPointerMove(asReact(e));
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      if (outside(e)) {
        if (e.type === "pointerup") drag.onPointerUp(asReact(e));
        else drag.onPointerCancel(asReact(e));
      }
      detach.current?.();
      detach.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    detach.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  };

  const x = useTransform(pull, (p) => r2(dir * p));
  const glyphOpacity = useTransform(pull, (p) =>
    peek >= 22 ? 1 : r2(clamp01((p - 8) / 32)),
  );
  const fillScale = useTransform(sleep, (s) => r2(s));
  const flashOpacity = useTransform(flash, (f) => r2(f * 0.8));
  const left = useTransform(sleep, (s) => clockText(s * snoozeFor));
  const glyphInset = Math.max(6, BAND + (peek - 20) / 2);
  const leading = side === "right" ? "left" : "right";

  return (
    <motion.div
      ref={bindCard}
      {...drag}
      onPointerDown={onCardPointerDown}
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse" || disabled || leaving || isOpen)
          return;
        if (grab.current.active || arriving.current || !motionSafe) return;
        run("pull", animate(pull, LIFT, springs.snap));
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse" || leaving || isOpen) return;
        if (grab.current.active || arriving.current || !motionSafe) return;
        run("pull", animate(pull, 0, springs.glide));
      }}
      className={cn(
        "absolute top-0 w-[min(272px,calc(100%-40px))] touch-pan-y rounded-3 border border-hairline-strong bg-popover select-none",
        "shadow-[0_6px_18px_-10px_color-mix(in_oklab,black_45%,transparent)]",
        disabled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
      )}
      style={{
        left: side === "right" ? `calc(100% - ${peek}px)` : undefined,
        right: side === "left" ? `calc(100% - ${peek}px)` : undefined,
        x,
        y: top,
        zIndex: z,
        opacity: fade,
      }}
    >
      <div
        className="contents"
        style={{ "--tone": TONES[tone] } as React.CSSProperties}
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 w-1 overflow-clip",
            side === "right" ? "left-0 rounded-l-3" : "right-0 rounded-r-3",
          )}
          style={{
            background: asleep
              ? `color-mix(in oklab, ${PIGMENT} 28%, transparent)`
              : PIGMENT,
          }}
        >
          {asleep ? (
            <motion.span
              className="absolute inset-0"
              style={{ background: PIGMENT, scaleY: fillScale, originY: 1 }}
            />
          ) : null}
          <motion.span
            className="absolute inset-0"
            style={{
              background: "color-mix(in oklab, var(--tone) 40%, white)",
              opacity: flashOpacity,
            }}
          />
        </span>

        <button
          ref={(node) => bindTab(id, node)}
          type="button"
          data-edge-tab=""
          tabIndex={focusable ? 0 : -1}
          disabled={disabled}
          aria-label={`${notice.title}${asleep ? ", snoozed" : ""}`}
          aria-describedby={hintId}
          aria-expanded={isOpen}
          aria-controls={`${uid}-panel`}
          onKeyDown={(event) => onTabKey(id, event)}
          onFocus={() => onTabFocus(id)}
          onClick={(event) => {
            // Pointer presses arrive through the drag's tap; Enter and Space
            // come here with no pointer behind them.
            if (event.detail !== 0) return;
            if (isOpen) onClose(id, true);
            else onOpen(id, "keyboard");
          }}
          className={cn(
            "absolute top-0 z-10 cursor-pointer rounded-3 outline-none",
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            leading === "left" ? "left-0" : "right-0",
          )}
          style={{ width: peek, height: tabH }}
        />

        <div
          ref={(node) => bindPanel(id, node)}
          id={`${uid}-panel`}
          role="group"
          tabIndex={-1}
          aria-labelledby={`${uid}-title`}
          aria-describedby={notice.body ? `${uid}-body` : undefined}
          inert={!isOpen}
          onKeyDown={(event) => {
            const inward = side === "right" ? "ArrowRight" : "ArrowLeft";
            if (event.key === "Escape") {
              // Handled where focus is: the stage must not also close.
              event.preventDefault();
              onClose(id, true);
            } else if (event.key === inward) {
              event.preventDefault();
              fling.current = 0;
              onSnooze(id, true);
            } else if (event.key === "Delete" || event.key === "Backspace") {
              event.preventDefault();
              onDismiss(id);
            }
          }}
          className="flex flex-col gap-2 rounded-3 py-3 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          style={
            side === "right"
              ? { paddingLeft: glyphInset + 26, paddingRight: 12 }
              : { paddingRight: glyphInset + 26, paddingLeft: 12 }
          }
        >
          <motion.span
            aria-hidden
            className="absolute top-3.5 flex size-4 items-center justify-center"
            style={{
              left: leading === "left" ? glyphInset : undefined,
              right: leading === "right" ? glyphInset : undefined,
              color: PIGMENT,
              opacity: glyphOpacity,
            }}
          >
            <Glyph tone={tone} asleep={asleep} />
          </motion.span>
          <div className="flex items-start gap-2">
            <p
              id={`${uid}-title`}
              className="line-clamp-2 min-w-0 flex-1 text-sm leading-5 font-medium text-foreground"
            >
              {notice.title}
            </p>
            {notice.time ? (
              <span className="shrink-0 font-mono text-[10px] leading-5 text-ink-3 tabular-nums">
                {notice.time}
              </span>
            ) : null}
          </div>
          {notice.body ? (
            <p
              id={`${uid}-body`}
              className="line-clamp-3 text-xs leading-4 text-ink-2"
            >
              {notice.body}
            </p>
          ) : null}
          {asleep ? (
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Snoozed ·{" "}
              <motion.span className="tabular-nums">{left}</motion.span> left
            </p>
          ) : null}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={disabled}
              aria-label={`Snooze for ${spokenTime(snoozeFor)}`}
              onClick={() => {
                fling.current = 0;
                onSnooze(id, true);
              }}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors",
                "hover:bg-surface-2 hover:text-foreground",
                "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                className="size-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
              >
                <circle cx={8} cy={8} r={5.6} />
                <path d="M8 5v3.2l2 1.3" />
              </svg>
              Snooze {shortTime(snoozeFor)}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onDismiss(id)}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity",
                "hover:opacity-90",
                "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

type Said = { n: number; text: string; urgent: boolean };

/**
 * Notices that wait at the edge of a surface as tabs. Each card is tucked
 * behind the edge with only a `peek`-wide strip showing: a band in its tone
 * and, when there is room, its glyph. The strips stagger down the edge like
 * index tabs, most urgent first (or newest first), and glide to new places
 * when the order changes.
 *
 * Pull a tab and the card follows the finger 1:1, rubber-banding past fully
 * out; let go past half-way and it comes into view on snap with the throw's
 * speed, otherwise it glides home. Push an open card back to the edge and it
 * is snoozed: it tucks in, clicks into a slot at the bottom of the stack, and
 * its band becomes a timer that drains over `snoozeFor`. When the time is up
 * it wakes, glides back into place and nudges out, a tap on the shoulder.
 *
 * The tabs are a roving-focus set: arrows move between them, Enter or the
 * arrow away from the edge pulls a card out and puts focus in it, Escape puts
 * it back, the arrow toward the edge snoozes it, Delete dismisses it. Under
 * reduced motion cards appear out and back in place with a short fade, and
 * the snooze timer still drains.
 */
export function EdgeTab({
  notices,
  onDismiss,
  onSnooze,
  onOpenChange,
  peek = 16,
  side = "right",
  stack = "urgency",
  snoozeFor = 300,
  label = "Notices",
  children,
  sound = false,
  disabled = false,
  className,
}: EdgeTabProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const strip = Math.round(clamp(peek, 8, 32));
  const sleepFor = Math.max(1, snoozeFor);
  const surface = children !== undefined && children !== null;

  const [seen, setSeen] = React.useState(() => notices.map((n) => n.id));
  // Notices there from the start rest at the edge; later ones slide in.
  const [initialIds] = React.useState(() => new Set(notices.map((n) => n.id)));
  const [open, setOpen] = React.useState<string | null>(null);
  const [opened, setOpened] = React.useState({ n: 0, id: "", via: "pointer" });
  const [asleep, setAsleep] = React.useState<string[]>([]);
  const [snoozeKeys, setSnoozeKeys] = React.useState<Record<string, number>>(
    {},
  );
  const [wakeKeys, setWakeKeys] = React.useState<Record<string, number>>({});
  const [gone, setGone] = React.useState<string[]>([]);
  const [leaving, setLeaving] = React.useState<
    { notice: EdgeTabNotice; y: number; z: number }[]
  >([]);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const [heights, setHeights] = React.useState<Record<string, number>>({});
  const [offscreen, setOffscreen] = React.useState(false);
  const [said, setSaid] = React.useState<Said>({
    n: 0,
    text: "",
    urgent: false,
  });
  const pageHidden = React.useSyncExternalStore(
    subscribeHidden,
    hiddenNow,
    hiddenOnServer,
  );

  const live = notices.filter((n) => !gone.includes(n.id));
  if (gone.some((id) => !notices.some((n) => n.id === id))) {
    setGone(gone.filter((id) => notices.some((n) => n.id === id)));
  }
  // A new notice is announced once, in the render that brings it.
  const fresh = live.filter((n) => !seen.includes(n.id));
  if (fresh.length > 0) {
    const newest = fresh[fresh.length - 1] as EdgeTabNotice;
    setSeen([...seen, ...fresh.map((n) => n.id)]);
    setSaid({
      n: said.n + 1,
      text: `New: ${sentence(newest.title)}${fresh.length > 1 ? ` ${fresh.length} new notices.` : ""}`,
      urgent: newest.tone === "danger",
    });
  }
  const openId = open && live.some((n) => n.id === open) ? open : null;

  const order = live
    .map((n, i) => ({ n, i }))
    .sort((a, b) => {
      const sa = asleep.includes(a.n.id) ? 1 : 0;
      const sb = asleep.includes(b.n.id) ? 1 : 0;
      if (sa !== sb) return sa - sb;
      if (stack === "urgency") {
        const d = RANK[a.n.tone ?? "info"] - RANK[b.n.tone ?? "info"];
        if (d !== 0) return d;
      }
      return b.i - a.i;
    })
    .map((x) => x.n);

  const count = order.length;
  const lastH = count ? (heights[order[count - 1]?.id ?? ""] ?? EST_H) : EST_H;
  // With no surface the component is as tall as its stack, with room for the
  // tallest card to come out.
  const tallest = Math.max(EST_H, ...order.map((n) => heights[n.id] ?? 0));
  const boxH = surface
    ? box.h || 520
    : Math.max(
        2 * MARGIN + Math.max(0, count - 1) * MAX_PITCH + lastH,
        2 * MARGIN + tallest,
      );
  const pitch =
    count > 1
      ? Math.round(
          clamp(
            (boxH - 2 * MARGIN - lastH) / (count - 1),
            MIN_PITCH,
            MAX_PITCH,
          ),
        )
      : MAX_PITCH;
  const rovingId =
    focusId && order.some((n) => n.id === focusId)
      ? focusId
      : (order[0]?.id ?? null);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const regionRef = React.useRef<HTMLDivElement | null>(null);
  const tabs = React.useRef(new Map<string, HTMLButtonElement>());
  const panels = React.useRef(new Map<string, HTMLDivElement>());
  const latest = React.useRef<{
    openId: string | null;
    close: (id: string) => void;
  } | null>(null);

  const panOf = (id: string) => {
    const rect = tabs.current.get(id)?.getBoundingClientRect();
    return rect ? panFrom(rect.left, null) : side === "right" ? 0.5 : -0.5;
  };

  const say = (text: string, urgent = false) =>
    setSaid((p) => ({ n: p.n + 1, text, urgent }));

  const openCard = (id: string, via: Via) => {
    if (disabled) return;
    setOpen(id);
    setFocusId(id);
    setOpened((p) => ({ n: p.n + 1, id, via }));
    onOpenChange?.(id);
    audio.play("swish", { pitch: 1.1, gain: 0.45, pan: panOf(id) });
  };

  const closeCard = (id: string, focusTab: boolean) => {
    setOpen((o) => (o === id ? null : o));
    onOpenChange?.(null);
    if (focusTab) tabs.current.get(id)?.focus({ preventScroll: true });
  };

  const snoozeCard = (id: string, focusTab: boolean) => {
    if (disabled) return;
    const notice = live.find((n) => n.id === id);
    setOpen((o) => (o === id ? null : o));
    setAsleep((a) => (a.includes(id) ? a : [...a, id]));
    setSnoozeKeys((k) => ({ ...k, [id]: (k[id] ?? 0) + 1 }));
    onSnooze?.(id);
    onOpenChange?.(null);
    if (notice)
      say(`${sentence(notice.title)} Snoozed for ${spokenTime(sleepFor)}.`);
    if (focusTab) tabs.current.get(id)?.focus({ preventScroll: true });
  };

  const wake = (id: string) => {
    const notice = live.find((n) => n.id === id);
    setAsleep((a) => a.filter((x) => x !== id));
    setWakeKeys((k) => ({ ...k, [id]: (k[id] ?? 0) + 1 }));
    if (notice) say(`${sentence(notice.title)} Back from snooze.`);
  };

  const dismiss = (id: string) => {
    if (disabled) return;
    const index = order.findIndex((n) => n.id === id);
    const notice = order[index];
    if (!notice) return;
    const hadFocus = Boolean(
      rootRef.current?.contains(document.activeElement ?? null),
    );
    setLeaving((l) => [
      ...l.filter((x) => x.notice.id !== id),
      { notice, y: MARGIN + index * pitch, z: 40 },
    ]);
    setGone((g) => (g.includes(id) ? g : [...g, id]));
    setAsleep((a) => a.filter((x) => x !== id));
    if (openId === id) {
      setOpen(null);
      onOpenChange?.(null);
    }
    onDismiss?.(id);
    audio.play("swish", { pitch: 0.8, gain: 0.45, pan: panOf(id) });
    say(`${sentence(notice.title)} Dismissed.`);
    if (hadFocus) {
      const next = order[index + 1] ?? order[index - 1];
      if (next) {
        setFocusId(next.id);
        tabs.current.get(next.id)?.focus({ preventScroll: true });
      } else {
        regionRef.current?.focus({ preventScroll: true });
      }
    }
  };

  const onTabKey = (
    id: string,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    const index = order.findIndex((n) => n.id === id);
    const outward = side === "right" ? "ArrowLeft" : "ArrowRight";
    const inward = side === "right" ? "ArrowRight" : "ArrowLeft";
    const move = (i: number) => {
      const next = order[(i + count) % count];
      if (!next) return;
      setFocusId(next.id);
      tabs.current.get(next.id)?.focus({ preventScroll: true });
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(index + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        move(index - 1);
        return;
      case "Home":
        event.preventDefault();
        move(0);
        return;
      case "End":
        event.preventDefault();
        move(count - 1);
        return;
      case outward:
        event.preventDefault();
        if (openId !== id) openCard(id, "keyboard");
        else panels.current.get(id)?.focus({ preventScroll: true });
        return;
      case inward:
        if (openId !== id) return;
        event.preventDefault();
        snoozeCard(id, true);
        return;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        dismiss(id);
        return;
      case "Escape":
        if (openId !== id) return;
        event.preventDefault();
        closeCard(id, true);
        return;
    }
  };

  React.useEffect(() => {
    latest.current = { openId, close: (id) => closeCard(id, false) };
  });

  // A card pulled out from the keyboard takes focus once it is out.
  React.useEffect(() => {
    if (opened.via !== "keyboard" || !opened.id) return;
    panels.current.get(opened.id)?.focus({ preventScroll: true });
  }, [opened]);

  // A press anywhere else puts an open card back as it was.
  React.useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const now = latest.current;
      if (!now?.openId) return;
      const target = event.target;
      const card = panels.current.get(now.openId)?.parentElement;
      if (target instanceof Node && card?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-edge-tab]"))
        return;
      now.close(now.openId);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      const w = Math.round(node.clientWidth);
      const h = Math.round(node.clientHeight);
      setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOffscreen(!entry?.isIntersecting);
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const onHeight = React.useCallback((id: string, h: number) => {
    setHeights((prev) => (prev[id] === h ? prev : { ...prev, [id]: h }));
  }, []);
  const onGone = React.useCallback((id: string) => {
    setLeaving((l) => l.filter((x) => x.notice.id !== id));
  }, []);
  const bindTab = React.useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      if (node) tabs.current.set(id, node);
      else tabs.current.delete(id);
    },
    [],
  );
  const bindPanel = React.useCallback(
    (id: string, node: HTMLDivElement | null) => {
      if (node) panels.current.set(id, node);
      else panels.current.delete(id);
    },
    [],
  );

  const paused = pageHidden || offscreen;

  const cardFor = (
    notice: EdgeTabNotice,
    y: number,
    z: number,
    tabH: number,
    isLeaving: boolean,
  ) => (
    <EdgeCard
      key={notice.id}
      notice={notice}
      side={side}
      peek={strip}
      y={y}
      tabH={tabH}
      z={z}
      isOpen={!isLeaving && openId === notice.id}
      asleep={!isLeaving && asleep.includes(notice.id)}
      snoozeKey={snoozeKeys[notice.id] ?? 0}
      wakeKey={wakeKeys[notice.id] ?? 0}
      snoozeFor={sleepFor}
      paused={paused}
      fresh={!initialIds.has(notice.id)}
      leaving={isLeaving}
      focusable={!isLeaving && rovingId === notice.id}
      disabled={disabled}
      motionSafe={motionSafe}
      audio={audio}
      hintId={hintId}
      onOpen={openCard}
      onClose={closeCard}
      onSnooze={snoozeCard}
      onDismiss={dismiss}
      onGone={onGone}
      onWake={wake}
      onHeight={onHeight}
      onTabKey={onTabKey}
      onTabFocus={setFocusId}
      bindTab={bindTab}
      bindPanel={bindPanel}
    />
  );

  return (
    <div
      ref={bindRoot}
      className={cn("relative isolate w-full overflow-clip", className)}
      style={surface ? undefined : { height: boxH }}
    >
      {surface ? <div className="relative">{children}</div> : null}
      <div
        ref={regionRef}
        role="region"
        aria-label={label}
        tabIndex={-1}
        className="pointer-events-none absolute inset-0 z-10 outline-none [&>*]:pointer-events-auto"
      >
        <p id={hintId} className="sr-only">
          Arrow keys move between notices. Enter pulls one out, Escape puts it
          back, and Delete dismisses it.
        </p>
        {order.map((notice, i) => {
          const h = heights[notice.id] ?? EST_H;
          const rest = MARGIN + i * pitch;
          const y =
            openId === notice.id
              ? Math.max(MARGIN, Math.min(rest, boxH - MARGIN - h))
              : rest;
          const tabH = i === count - 1 ? h : Math.min(h, pitch);
          return cardFor(
            notice,
            y,
            openId === notice.id ? 50 : i + 1,
            tabH,
            false,
          );
        })}
        {leaving
          .filter((l) => !order.some((n) => n.id === l.notice.id))
          .map((l) => cardFor(l.notice, l.y, l.z, 0, true))}
        <p role="status" className="sr-only">
          <span key={said.n}>{said.urgent ? "" : said.text}</span>
        </p>
        <p role="alert" aria-live="assertive" className="sr-only">
          <span key={said.n}>{said.urgent ? said.text : ""}</span>
        </p>
      </div>
    </div>
  );
}
