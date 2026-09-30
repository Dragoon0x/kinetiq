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
import { durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type OverflowGlidePhase = "rest" | "reading" | "holding" | "returning";

export type OverflowGlideProps = {
  /** The line. Cut to its box at rest; the rest glides into view on request. */
  children: string;
  /** Reading pace in words per second, where a word is five characters. @default 3 */
  speed?: number;
  /** Seconds held at the end of the line before it eases home. @default 0.8 */
  pause?: number;
  /** Soft ramps at the cut edges instead of hard ones. @default true */
  fade?: boolean;
  /** Keep reading, again and again, while pointed at or focused. @default false */
  loop?: boolean;
  /**
   * Drive the glide from outside — for a host that tracks its own hover and
   * focus. Leave undefined and the line follows the nearest link, button,
   * option, tab, menu item, row or label around it (or itself).
   */
  active?: boolean;
  /** Reports each phase of the glide as it begins. */
  onPhaseChange?: (phase: OverflowGlidePhase) => void;
  /** Play the soft swish when a glide starts. Off unless asked for. @default false */
  sound?: boolean;
  className?: string;
};

/** The interactive ancestors whose hover and focus a line answers to. */
const HOST =
  "a[href], button, [role='button'], [role='link'], [role='option'], [role='tab'], [role='menuitem'], [role='row'], summary, label";

/** A word, for pace, is five characters — the typist's measure. */
const CHARS_PER_WORD = 5;
/** Width of the soft ramp at a cut edge, px. */
const RAMP = 16;
/** Breathing room between the last visible glyph and the ellipsis, px. */
const GAP = 2;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

type Metrics = {
  /** Width of the clip window. */
  window: number;
  /** Full width of the text. */
  text: number;
  /** Width of the ellipsis glyph. */
  ellipsis: number;
  /** True when no interactive ancestor hosts the line. */
  standalone: boolean;
};

/** Has the page had a press or a key yet? Until then audio stays asleep. */
const userActivated = (): boolean =>
  typeof navigator !== "undefined" &&
  (navigator.userActivation?.hasBeenActive ?? true);

const focusVisible = (element: Element): boolean => {
  try {
    return element.matches(":focus-visible");
  } catch {
    return true;
  }
};

/**
 * A line of text cut to its box that, pointed at or tabbed to, glides left at
 * reading speed until its last character reaches the right edge, holds there,
 * and eases home. The ellipsis dissolves within its own width of travel and
 * returns within the same distance of home; with `fade`, the cut edges are
 * soft ramps that follow how much text is hidden on each side.
 *
 * Speed is words per second, not pixels: a word is five characters, so a
 * long file name with no spaces reads at the same pace as a sentence. The
 * text is never covered — the window is masked — so the line sits on any
 * background, a hovered row included. It answers to its host's hover and
 * keyboard focus (or its own, when it has no host and is cut); on touch the
 * first tap reveals and the second acts. Under reduced motion it pages through
 * the line with fades instead of travelling.
 */
export function OverflowGlide({
  children,
  speed = 3,
  pause = 0.8,
  fade = true,
  loop = false,
  active,
  onPhaseChange,
  sound = false,
  className,
}: OverflowGlideProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const chars = Math.max(1, Array.from(children).length);

  const [root, setRoot] = React.useState<HTMLSpanElement | null>(null);
  const [clip, setClip] = React.useState<HTMLSpanElement | null>(null);
  const [textNode, setTextNode] = React.useState<HTMLSpanElement | null>(null);
  const [ellipsisNode, setEllipsisNode] =
    React.useState<HTMLSpanElement | null>(null);
  const [metrics, setMetrics] = React.useState<Metrics | null>(null);

  const x = useMotionValue(0);
  const veil = useMotionValue(1);

  const metricsRef = React.useRef<Metrics | null>(null);
  const phase = React.useRef<OverflowGlidePhase>("rest");
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const timer = React.useRef<number | null>(null);
  const wanted = React.useRef(false);
  const once = React.useRef(false);
  const lastSwish = React.useRef(-Infinity);
  const latest = React.useRef({
    speed,
    pause,
    loop,
    motionSafe,
    audio,
    chars,
    onPhaseChange,
  });
  React.useEffect(() => {
    latest.current = {
      speed,
      pause,
      loop,
      motionSafe,
      audio,
      chars,
      onPhaseChange,
    };
  });

  const overflow = metrics ? Math.max(0, r2(metrics.text - metrics.window)) : 0;
  const cut = overflow > 0.5;

  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  /**
   * The whole glide as one state machine over refs: read → hold → home →
   * rest, and round again while wanted and looping. Everything it reads is
   * current at the moment it runs, so a timer set under old props acts on new
   * ones.
   */
  const drive = React.useCallback(
    (action: "engage" | "release" | "reset") => {
      const set = (next: OverflowGlidePhase) => {
        if (phase.current === next) return;
        phase.current = next;
        latest.current.onPhaseChange?.(next);
      };
      const later = (fn: () => void, seconds: number) => {
        timer.current = window.setTimeout(
          () => {
            timer.current = null;
            fn();
          },
          Math.round(seconds * 1000),
        );
      };
      /** Fade out, move, fade in: the reduced-motion way to change place. */
      const dip = (to: number, then: () => void) => {
        running.current = [
          animate(veil, 0, {
            duration: durations.fast,
            ease: easings.exit,
            onComplete: () => {
              x.set(to);
              running.current = [
                animate(veil, 1, {
                  duration: durations.fast,
                  ease: easings.enter,
                  onComplete: then,
                }),
              ];
            },
          }),
        ];
      };
      const pace = () => {
        const m = metricsRef.current;
        const perChar = m ? m.text / latest.current.chars : 8;
        return Math.max(1, latest.current.speed * CHARS_PER_WORD * perChar);
      };
      const swish = () => {
        if (!userActivated()) return;
        const now = performance.now();
        if (now - lastSwish.current < 400) return;
        lastSwish.current = now;
        const rect = root?.getBoundingClientRect();
        latest.current.audio.play("swish", {
          gain: 0.3,
          pitch: 0.8 + latest.current.speed * 0.08,
          pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
        });
      };

      const rested = () => {
        set("rest");
        if (once.current) {
          once.current = false;
          wanted.current = false;
        }
        const hidden =
          typeof document !== "undefined" &&
          document.visibilityState === "hidden";
        if (latest.current.loop && wanted.current && !hidden) {
          later(read, Math.max(latest.current.pause, 0.6));
        }
      };

      const home = () => {
        halt();
        if (x.get() === 0 && veil.get() === 1) {
          rested();
          return;
        }
        set("returning");
        if (!latest.current.motionSafe) {
          dip(0, rested);
          return;
        }
        // The spring takes the tween's velocity: a line let go mid-read
        // slows, turns and comes home rather than snapping back.
        const velocity = x.getVelocity();
        running.current = [
          animate(x, 0, { ...springs.glide, velocity, onComplete: rested }),
        ];
        if (veil.get() < 1) {
          running.current.push(
            animate(veil, 1, { duration: durations.fast, ease: easings.enter }),
          );
        }
      };

      const hold = () => {
        set("holding");
        later(home, Math.max(0, latest.current.pause));
      };

      const read = () => {
        halt();
        const m = metricsRef.current;
        const target = m ? -Math.max(0, r2(m.text - m.window)) : 0;
        // A line that fits has nothing to reveal, and nothing to loop.
        if (target > -0.5) {
          set("rest");
          return;
        }
        if (x.get() - target < 0.5) {
          hold();
          return;
        }
        set("reading");
        swish();
        if (!latest.current.motionSafe && m) {
          // Page through: one window less 15% at a time, so a few characters
          // carry over and the eye keeps its place.
          const step = Math.max(24, m.window * 0.85);
          const next = () => {
            const at = x.get();
            const to = Math.max(target, r2(at - step));
            dip(to, () => {
              if (to <= target + 0.5) {
                hold();
                return;
              }
              later(next, (at - to) / pace());
            });
          };
          next();
          return;
        }
        const distance = x.get() - target;
        // Linear, the marquee curve: reading wants a constant pace, and a
        // pan that eases in mid-sentence makes the eye wait for it.
        running.current = [
          animate(x, target, {
            duration: Math.max(durations.fast, distance / pace()),
            ease: easings.linear,
            onComplete: hold,
          }),
        ];
      };

      if (action === "engage") {
        wanted.current = true;
        if (phase.current === "rest" || phase.current === "returning") read();
      } else if (action === "release") {
        wanted.current = false;
        once.current = false;
        if (phase.current === "rest") halt();
        else home();
      } else if (phase.current !== "rest") {
        home();
      }
    },
    [halt, root, veil, x],
  );

  // Measure the window, the text and the ellipsis whenever any of them
  // changes size — a narrower row, a web font landing, new text. Scale is
  // divided out, so a parent mid-zoom does not skew the numbers.
  React.useEffect(() => {
    if (!root || !clip || !textNode || !ellipsisNode) return;
    const measure = () => {
      const box = clip.getBoundingClientRect();
      const scale = clip.offsetWidth > 0 ? box.width / clip.offsetWidth : 1;
      if (!scale) return;
      const next: Metrics = {
        window: r2(box.width / scale),
        text: r2(textNode.getBoundingClientRect().width / scale),
        ellipsis: r2(ellipsisNode.getBoundingClientRect().width / scale),
        standalone: !root.parentElement?.closest(HOST),
      };
      const prev = metricsRef.current;
      if (
        prev &&
        prev.window === next.window &&
        prev.text === next.text &&
        prev.ellipsis === next.ellipsis &&
        prev.standalone === next.standalone
      ) {
        return;
      }
      metricsRef.current = next;
      setMetrics(next);
      // A resize mid-glide changes where the end is; go home and start over.
      if (prev) drive("reset");
    };
    const observer = new ResizeObserver(measure);
    observer.observe(clip);
    observer.observe(textNode);
    observer.observe(ellipsisNode);
    return () => observer.disconnect();
  }, [clip, drive, ellipsisNode, root, textNode]);

  // Hover and keyboard focus on the host, and the touch contract: on a cut
  // line the first tap is swallowed and reveals, the second acts.
  React.useEffect(() => {
    if (!root || active !== undefined) return;
    const host =
      (root.parentElement?.closest(HOST) as HTMLElement | null) ?? root;
    let hovering = false;
    let focused = false;
    let touch = false;
    let armed = false;
    const update = () => {
      if (hovering || focused) drive("engage");
      else if (!once.current) drive("release");
    };
    const onEnter = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      hovering = true;
      update();
    };
    const onLeave = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      hovering = false;
      update();
    };
    const onFocusIn = (event: FocusEvent) => {
      focused = event.target instanceof Element && focusVisible(event.target);
      update();
    };
    const onFocusOut = (event: FocusEvent) => {
      if (
        event.relatedTarget instanceof Node &&
        host.contains(event.relatedTarget)
      )
        return;
      focused = false;
      update();
    };
    const onDown = (event: PointerEvent) => {
      touch = event.pointerType === "touch";
    };
    const onClick = (event: MouseEvent) => {
      const wasTouch = touch;
      touch = false;
      if (!wasTouch || event.detail === 0) return;
      const m = metricsRef.current;
      if (!m || m.text - m.window <= 0.5 || armed) return;
      // Stopped in the capture phase, before the host's own handler runs.
      event.preventDefault();
      event.stopPropagation();
      armed = true;
      once.current = true;
      drive("engage");
    };
    const onOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && host.contains(event.target)) return;
      armed = false;
    };
    host.addEventListener("pointerenter", onEnter);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("focusin", onFocusIn);
    host.addEventListener("focusout", onFocusOut);
    host.addEventListener("pointerdown", onDown, true);
    host.addEventListener("click", onClick, true);
    document.addEventListener("pointerdown", onOutside, true);
    return () => {
      host.removeEventListener("pointerenter", onEnter);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("focusin", onFocusIn);
      host.removeEventListener("focusout", onFocusOut);
      host.removeEventListener("pointerdown", onDown, true);
      host.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerdown", onOutside, true);
      drive("release");
    };
  }, [active, drive, root]);

  // A host that drives the line itself.
  React.useEffect(() => {
    if (active === undefined) return;
    drive(active ? "engage" : "release");
  }, [active, drive]);

  React.useEffect(() => halt, [halt]);

  // Per frame, from the text's travel: the ellipsis dissolves within its own
  // width, and the mask opens on the left and closes on the right. (A mask
  // reads only alpha, so `black` and `transparent` here are coverage, not
  // colour.)
  const reach = metrics ? Math.max(1, Math.min(metrics.ellipsis, overflow)) : 1;
  const presence = (travel: number) => 1 - clamp01(travel / reach);
  const ellipsisOpacity = useTransform(x, (v) => (cut ? r2(presence(-v)) : 0));
  const mask = useTransform(x, (v) => {
    if (!metrics || !cut) return "none";
    const travel = Math.max(0, -v);
    const hiddenRight = Math.max(0, overflow - travel);
    const zone = (metrics.ellipsis + GAP) * presence(travel);
    const rampLeft = fade ? Math.min(RAMP, travel) : 0;
    const rampRight = fade ? Math.min(RAMP, hiddenRight) : 0;
    const end = metrics.window - zone;
    return `linear-gradient(to right, transparent 0px, black ${r2(rampLeft)}px, black ${r2(Math.max(rampLeft, end - rampRight))}px, transparent ${r2(end)}px)`;
  });

  const focusable = metrics?.standalone && cut && active === undefined;

  return (
    <span
      ref={setRoot}
      tabIndex={focusable ? 0 : undefined}
      className={cn(
        "relative block min-w-0 rounded-1 outline-none",
        focusable &&
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <motion.span className="relative block" style={{ opacity: veil }}>
        <motion.span
          ref={setClip}
          className={cn(
            "block overflow-clip whitespace-nowrap [contain:paint]",
            // Until the line is measured, the browser's own ellipsis stands in.
            !metrics && "text-ellipsis",
          )}
          style={{ maskImage: mask, WebkitMaskImage: mask }}
        >
          <motion.span
            ref={setTextNode}
            className={metrics ? "inline-block" : undefined}
            style={{ x }}
          >
            {children}
          </motion.span>
        </motion.span>
        <motion.span
          ref={setEllipsisNode}
          aria-hidden
          className="pointer-events-none absolute top-0 right-0"
          style={{ opacity: ellipsisOpacity }}
        >
          …
        </motion.span>
      </motion.span>
    </span>
  );
}
