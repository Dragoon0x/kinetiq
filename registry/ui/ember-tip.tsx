"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type EmberTipPlacement = "top" | "bottom" | "left" | "right";
export type EmberTipSize = "sm" | "md" | "lg";

export type EmberTipProps = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  /** The triggers (each wrapped in an EmberTipTrigger) and any layout around them. */
  children?: React.ReactNode;
  /** How long a cold group waits before its first tip, in ms. @default 600 */
  delay?: number;
  /** How long the group stays warm after you leave, in ms; 0 makes every visit cold. @default 1500 */
  warm?: number;
  /** Which side of its trigger the tip sits on. @default "top" */
  placement?: EmberTipPlacement;
  /** The gap between trigger and tip, in px. @default 8 */
  offset?: number;
  /** How far a cold tip rises into place, in px. @default 6 */
  rise?: number;
  /** Grace before a tip hides once the pointer leaves, in ms. @default 100 */
  closeDelay?: number;
  /** An ember glow rides the group's edge under the tip while the group is warm. @default true */
  glow?: boolean;
  /** The warmth's colour, any CSS colour. @default a warm pigment from the theme's --warn */
  ember?: string;
  /** Draw a caret pointing at the trigger. @default true */
  arrow?: boolean;
  /** The widest a tip grows before its text wraps, in px. @default 220 */
  maxWidth?: number;
  /** @default "md" */
  size?: EmberTipSize;
  /** A tip opened (with its trigger's id) or closed (null). */
  onOpenChange?: (triggerId: string | null) => void;
  /** The group warmed up (true) or has fully cooled (false). */
  onWarmChange?: (warm: boolean) => void;
  /** No tips at all. @default false */
  disabled?: boolean;
  className?: string;
};

export type EmberTipTriggerProps = {
  /** What the tip says. Also the control's accessible description. */
  content: React.ReactNode;
  /** The control: one element that accepts aria-describedby. */
  children: React.ReactElement;
  /** Reported by onOpenChange. @default a generated id */
  id?: string;
  /** This trigger shows no tip. @default false */
  disabled?: boolean;
  className?: string;
};

type Via = "pointer" | "focus";

type Group = {
  request: (
    id: string,
    el: HTMLElement | null,
    content: React.ReactNode,
    via: Via,
  ) => void;
  release: (id: string, via: Via) => void;
  dismiss: (id: string) => void;
};

const EmberTipContext = React.createContext<Group | null>(null);

type Layer = { key: number; id: string; content: React.ReactNode };

const SIZES: Record<EmberTipSize, string> = {
  sm: "px-2 py-1 text-[11px] leading-4",
  md: "px-2.5 py-1.5 text-xs leading-4",
  lg: "px-3 py-2 text-sm leading-5",
};

/** Heat climbs to full over this long while a tip is up, in s. */
const WARM_UP = 0.9;
const DEFAULT_EMBER = "oklch(from var(--warn) 0.76 0.16 calc(h - 22))";

const warmth = (at: string) =>
  `radial-gradient(${at}, color-mix(in oklab, var(--ember-tip) 50%, transparent), transparent)`;
/** A bright edge line and a soft spill inward, from the side the tip is on. */
const GLOW: Record<EmberTipPlacement, string> = {
  top: `linear-gradient(90deg, transparent, var(--ember-tip), transparent) top / 100% 1px no-repeat, ${warmth("50% 100% at 50% 0%")}`,
  bottom: `linear-gradient(90deg, transparent, var(--ember-tip), transparent) bottom / 100% 1px no-repeat, ${warmth("50% 100% at 50% 100%")}`,
  left: `linear-gradient(180deg, transparent, var(--ember-tip), transparent) left / 1px 100% no-repeat, ${warmth("100% 50% at 0% 50%")}`,
  right: `linear-gradient(180deg, transparent, var(--ember-tip), transparent) right / 1px 100% no-repeat, ${warmth("100% 50% at 100% 50%")}`,
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * A tooltip group that warms up as you explore it. The group owns one shared
 * bubble. Cold, the first hover waits `delay` and the tip fades in slowly,
 * rising a few pixels on the drift spring. While a tip is up the group warms,
 * and moving to a neighbouring trigger does not re-show anything: the bubble
 * slides there on the glide spring, its size morphing to the new words as the
 * old ones cross-fade out, its caret sliding along its edge to point at the
 * new trigger, and it stretches a little in the direction it travels. Leave,
 * and it hides after a short grace and cools over `warm`; come back while it
 * is still warm and the next tip arrives almost at once.
 *
 * The heat is visible: the bubble's border warms toward the ember colour, and
 * an ember glow rides the group's edge under the tip, brightening as you
 * explore and cooling after you leave. Keyboard focus shows tips by the same
 * rules, Escape dismisses, tips are hoverable, and every trigger keeps its
 * tip as an accessible description whether or not it is showing. Under
 * reduced motion tips fade in place and jump between triggers while the
 * words cross-fade; the delays and the warmth still apply.
 */
export function EmberTip({
  children,
  delay = 600,
  warm = 1500,
  placement = "top",
  offset = 8,
  rise = 6,
  closeDelay = 100,
  glow = true,
  ember = DEFAULT_EMBER,
  arrow = true,
  maxWidth = 220,
  size = "md",
  onOpenChange,
  onWarmChange,
  disabled = false,
  className,
  style,
  onKeyDown,
  ...rest
}: EmberTipProps) {
  const motionSafe = useMotionSafe();
  const vertical = placement === "top" || placement === "bottom";

  const [layers, setLayers] = React.useState<Layer[]>([]);
  const [open, setOpen] = React.useState(false);

  const ax = useMotionValue(0);
  const ay = useMotionValue(0);
  const bw = useMotionValue(0);
  const bh = useMotionValue(0);
  const rootW = useMotionValue(0);
  const lift = useMotionValue(0);
  const opacity = useMotionValue(0);
  const heat = useMotionValue(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const layerNodes = React.useRef(new Map<number, HTMLDivElement>());
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef({ open: 0, close: 0 });
  const holds = React.useRef(new Map<string, Set<Via>>());
  const pending = React.useRef<string | null>(null);
  const active = React.useRef<string | null>(null);
  const dismissed = React.useRef<string | null>(null);
  const counter = React.useRef(0);
  const next = React.useRef<{
    kind: "appear" | "slide";
    x: number;
    y: number;
  } | null>(null);
  const warmShown = React.useRef(false);
  const latest = React.useRef<{
    request: Group["request"];
    release: Group["release"];
    dismiss: Group["dismiss"];
    hide: (now: boolean) => void;
    onWarmChange?: (warm: boolean) => void;
  } | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  /** The trigger's anchor point inside the group's padding box. */
  const anchorOf = (el: HTMLElement) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const a = root.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const left = b.left - a.left - root.clientLeft;
    const top = b.top - a.top - root.clientTop;
    switch (placement) {
      case "bottom":
        return { x: r2(left + b.width / 2), y: r2(top + b.height) };
      case "left":
        return { x: r2(left), y: r2(top + b.height / 2) };
      case "right":
        return { x: r2(left + b.width), y: r2(top + b.height / 2) };
      default:
        return { x: r2(left + b.width / 2), y: r2(top) };
    }
  };

  const warmUp = () => {
    const h = heat.get();
    run(
      "heat",
      animate(heat, 1, { duration: (1 - h) * WARM_UP, ease: "linear" }),
    );
  };

  const show = (id: string, el: HTMLElement, content: React.ReactNode) => {
    const showing = active.current !== null || opacity.get() > 0.05;
    const at = anchorOf(el);
    const same = active.current === id;
    active.current = id;
    pending.current = null;
    setOpen(true);
    if (same && showing) {
      // Still fading out from this very trigger: it simply comes back.
      run(
        "opacity",
        animate(opacity, 1, { duration: durations.fast, ease: easings.enter }),
      );
      warmUp();
      onOpenChange?.(id);
      return;
    }
    next.current = { kind: showing ? "slide" : "appear", x: at.x, y: at.y };
    counter.current += 1;
    const layer = { key: counter.current, id, content };
    setLayers((prev) => (showing ? [...prev.slice(-1), layer] : [layer]));
    onOpenChange?.(id);
  };

  const hide = (now: boolean) => {
    window.clearTimeout(timers.current.open);
    window.clearTimeout(timers.current.close);
    pending.current = null;
    const go = () => {
      if (active.current === null) return;
      active.current = null;
      setOpen(false);
      run(
        "opacity",
        animate(opacity, 0, {
          duration: durations.fast,
          ease: easings.exit,
        }),
      );
      // Cooling: the heat drains linearly over `warm`.
      const h = heat.get();
      run(
        "heat",
        animate(heat, 0, {
          duration: (h * Math.max(0, warm)) / 1000,
          ease: "linear",
        }),
      );
      onOpenChange?.(null);
    };
    if (now) go();
    else timers.current.close = window.setTimeout(go, Math.max(0, closeDelay));
  };

  const request: Group["request"] = (id, el, content, via) => {
    if (disabled || !el) return;
    const held = holds.current.get(id) ?? new Set<Via>();
    held.add(via);
    holds.current.set(id, held);
    if (dismissed.current === id) return;
    window.clearTimeout(timers.current.close);
    const showing = active.current !== null || opacity.get() > 0.05;
    if (showing) {
      window.clearTimeout(timers.current.open);
      show(id, el, content);
      return;
    }
    if (pending.current === id) return;
    window.clearTimeout(timers.current.open);
    pending.current = id;
    const h = heat.get();
    const wait = Math.max(0, delay) * (1 - h) * (1 - h);
    timers.current.open = window.setTimeout(
      () => latest.current && show(id, el, content),
      wait,
    );
  };

  const release: Group["release"] = (id, via) => {
    const held = holds.current.get(id);
    held?.delete(via);
    if (held && held.size > 0) return;
    holds.current.delete(id);
    if (dismissed.current === id) dismissed.current = null;
    if (pending.current === id) {
      window.clearTimeout(timers.current.open);
      pending.current = null;
    }
    if (active.current === id) hide(false);
  };

  const dismiss: Group["dismiss"] = (id) => {
    dismissed.current = id;
    if (pending.current === id || active.current === id) hide(true);
  };

  React.useEffect(() => {
    latest.current = { request, release, dismiss, hide, onWarmChange };
  });

  const group = React.useMemo<Group>(
    () => ({
      request: (...args) => latest.current?.request(...args),
      release: (...args) => latest.current?.release(...args),
      dismiss: (...args) => latest.current?.dismiss(...args),
    }),
    [],
  );

  // A new layer has been rendered and can be measured: place the bubble.
  const topKey = layers[layers.length - 1]?.key ?? 0;
  React.useLayoutEffect(() => {
    const plan = next.current;
    const node = layerNodes.current.get(topKey);
    if (!plan || !node) return;
    next.current = null;
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const temperature = heat.get();
    if (plan.kind === "appear" || !motionSafe) {
      ax.jump(plan.x);
      ay.jump(plan.y);
      bw.jump(w);
      bh.jump(h);
    } else {
      run("ax", animate(ax, plan.x, springs.glide));
      run("ay", animate(ay, plan.y, springs.glide));
      run("bw", animate(bw, w, springs.glide));
      run("bh", animate(bh, h, springs.glide));
    }
    if (plan.kind === "appear") {
      if (motionSafe && rise > 0) {
        lift.jump(r2(rise * (1 - temperature)));
        run(
          "lift",
          animate(lift, 0, temperature > 0.3 ? springs.glide : springs.drift),
        );
      } else lift.jump(0);
      run(
        "opacity",
        animate(opacity, 1, {
          duration: lerp(0.42, 0.12, temperature),
          ease: easings.enter,
        }),
      );
    } else {
      run(
        "opacity",
        animate(opacity, 1, { duration: durations.fast, ease: easings.enter }),
      );
    }
    warmUp();
    // Placed once per new layer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topKey]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => rootW.set(root.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [rootW]);

  React.useEffect(
    () =>
      heat.on("change", (v) => {
        const isWarm = v > 0.001;
        if (isWarm === warmShown.current) return;
        warmShown.current = isWarm;
        latest.current?.onWarmChange?.(isWarm);
      }),
    [heat],
  );

  React.useEffect(() => {
    if (disabled) latest.current?.hide(true);
  }, [disabled]);

  React.useEffect(() => {
    const running = anims.current;
    const t = timers.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      window.clearTimeout(t.open);
      window.clearTimeout(t.close);
    };
  }, []);

  const place = useTransform(
    [ax, ay, bw, bh, rootW, lift] as MotionValue<number>[],
    ([x = 0, y = 0, w = 0, h = 0, rw = 0, l = 0]: number[]) => {
      if (vertical) {
        const left = w >= rw ? (rw - w) / 2 : clamp(x - w / 2, 0, rw - w);
        const top = placement === "top" ? y - offset - h + l : y + offset - l;
        return {
          x: r2(left),
          y: r2(top),
          caret: r2(clamp(x - left, 10, Math.max(10, w - 10))),
        };
      }
      const top = y - h / 2;
      const left = placement === "left" ? x - offset - w + l : x + offset - l;
      return {
        x: r2(left),
        y: r2(top),
        caret: r2(clamp(y - top, 8, Math.max(8, h - 8))),
      };
    },
  );
  const bubbleX = useTransform(place, (p) => p.x);
  const bubbleY = useTransform(place, (p) => p.y);
  const caretAt = useTransform(place, (p) => p.caret - 5);
  const travel = useVelocity(vertical ? ax : ay);
  const stretch = useTransform(travel, (v) =>
    motionSafe ? r2(1 + Math.min(0.05, Math.abs(v) / 8000)) : 1,
  );
  const border = useTransform(
    heat,
    (h) =>
      `color-mix(in oklab, var(--ember-tip) ${Math.round(h * 62)}%, var(--hairline-strong))`,
  );
  const shadow = useTransform(
    heat,
    (h) =>
      `0 8px 22px -12px color-mix(in oklab, var(--ember-tip) ${Math.round(h * 70)}%, transparent), 0 1px 2px color-mix(in oklab, black 10%, transparent)`,
  );
  const glowAlpha = useTransform(heat, (h) => r2(h * 0.95));
  const glowAt = useTransform(vertical ? ax : ay, (v) => r2(v - 80));

  const caretStyle: Record<EmberTipPlacement, string> = {
    top: "top-full -mt-px",
    bottom: "bottom-full -mb-px rotate-180",
    left: "left-full -ml-px -rotate-90",
    right: "right-full -mr-px rotate-90",
  };

  return (
    <EmberTipContext.Provider value={group}>
      <div
        {...rest}
        ref={rootRef}
        className={cn("relative", className)}
        style={
          { ...style, ["--ember-tip" as string]: ember } as React.CSSProperties
        }
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (
            event.key === "Escape" &&
            (active.current !== null || pending.current !== null)
          ) {
            // Dismissed where focus is; the stage must not also close.
            event.preventDefault();
            const id = active.current ?? pending.current;
            if (id) dismiss(id);
          }
        }}
      >
        {children}

        {glow ? (
          // Warmth seeping in at the group's edge, centred under the tip.
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute overflow-clip",
              placement === "top" && "inset-x-0 top-0 h-3 rounded-t-[inherit]",
              placement === "bottom" &&
                "inset-x-0 bottom-0 h-3 rounded-b-[inherit]",
              placement === "left" &&
                "inset-y-0 left-0 w-3 rounded-l-[inherit]",
              placement === "right" &&
                "inset-y-0 right-0 w-3 rounded-r-[inherit]",
            )}
          >
            <motion.span
              className={cn(
                "absolute",
                vertical ? "left-0 h-3 w-40" : "top-0 h-40 w-3",
                placement === "bottom" ? "bottom-0" : "top-0",
                placement === "right" ? "right-0" : "left-0",
              )}
              style={{
                ...(vertical ? { x: glowAt } : { y: glowAt }),
                opacity: glowAlpha,
                background: GLOW[placement],
              }}
            />
          </span>
        ) : null}

        <motion.div
          aria-hidden
          className={cn(
            "absolute top-0 left-0 z-30",
            open ? "pointer-events-auto" : "pointer-events-none",
          )}
          style={{
            x: bubbleX,
            y: bubbleY,
            width: bw,
            height: bh,
            opacity,
            ...(vertical ? { scaleX: stretch } : { scaleY: stretch }),
          }}
          onPointerEnter={() => window.clearTimeout(timers.current.close)}
          onPointerLeave={() => {
            if (active.current && !holds.current.get(active.current)?.size) {
              hide(false);
            }
          }}
        >
          <motion.div
            className="relative size-full overflow-clip rounded-2 border bg-popover text-popover-foreground"
            style={{ borderColor: border, boxShadow: shadow }}
          >
            {layers.map((layer, i) => {
              const current = i === layers.length - 1;
              return (
                <motion.div
                  key={layer.key}
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: current ? 1 : 0 }}
                  transition={{
                    duration: current ? durations.base : durations.fast,
                    ease: current ? easings.enter : easings.exit,
                    delay: current && layers.length > 1 ? 0.04 : 0,
                  }}
                >
                  <div
                    ref={(node) => {
                      if (node) layerNodes.current.set(layer.key, node);
                      else layerNodes.current.delete(layer.key);
                    }}
                    className={cn("w-max", SIZES[size] ?? SIZES.md)}
                    style={{ maxWidth }}
                  >
                    {layer.content}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
          {arrow ? (
            <motion.svg
              width={10}
              height={6}
              viewBox="0 0 10 6"
              className={cn(
                "absolute block overflow-visible",
                caretStyle[placement],
              )}
              style={vertical ? { left: caretAt } : { top: caretAt }}
            >
              <motion.path
                d="M0 0L5 5.5L10 0"
                strokeWidth={1}
                strokeLinejoin="round"
                className="fill-popover"
                style={{ stroke: border }}
              />
            </motion.svg>
          ) : null}
        </motion.div>
      </div>
    </EmberTipContext.Provider>
  );
}

/**
 * One trigger in an EmberTip group: wraps a single control, gives it its tip
 * as an accessible description, and shows the tip on hover (mouse and pen) and
 * keyboard focus. A mouse press dismisses the tip until the pointer leaves.
 */
export function EmberTipTrigger({
  content,
  children,
  id,
  disabled = false,
  className,
}: EmberTipTriggerProps) {
  const group = React.useContext(EmberTipContext);
  const own = React.useId();
  const key = id ?? own;
  const descId = `${own}-tip`;
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const off = disabled || !group;

  const child = children as React.ReactElement<{
    "aria-describedby"?: string;
  }>;
  const describedBy = [child.props["aria-describedby"], off ? null : descId]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      ref={ref}
      className={cn("inline-flex", className)}
      onPointerEnter={(event) => {
        if (event.pointerType === "touch" || off) return;
        group.request(key, ref.current, content, "pointer");
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        group?.release(key, "pointer");
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse") group?.dismiss(key);
      }}
      onFocus={(event) => {
        if (off) return;
        if (
          event.target instanceof Element &&
          event.target.matches(":focus-visible")
        ) {
          group.request(key, ref.current, content, "focus");
        }
      }}
      onBlur={() => group?.release(key, "focus")}
    >
      {React.isValidElement(children)
        ? React.cloneElement(child, {
            "aria-describedby": describedBy || undefined,
          })
        : children}
      <span id={descId} hidden>
        {content}
      </span>
    </span>
  );
}
