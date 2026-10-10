"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FlickNoteTone = "info" | "success" | "warn" | "danger";
export type FlickNoteSize = "sm" | "md" | "lg";
export type FlickNoteVia = "flick" | "key" | "button";

export type FlickNoteItem = {
  id: string;
  title: string;
  /** One line under the title. */
  body?: string;
  /** A short time: "2m", "09:14". */
  time?: string;
  /** Sets the icon and its colour. @default "info" */
  tone?: FlickNoteTone;
};

export type FlickNoteProps = {
  /** The notes, newest first. */
  notes: FlickNoteItem[];
  /** A note was dismissed — by a flick, a key or its close button — at the moment it was let go. */
  onDismiss?: (id: string, via: FlickNoteVia) => void;
  /** A click or Enter on a note. */
  onOpen?: (id: string) => void;
  /** How many notes the stack shows. @default 3 */
  visible?: number;
  /** Space between fanned notes, in px; the stack's peek at rest follows it. @default 8 */
  gap?: number;
  /** How far a throw must carry to dismiss, in px. @default 120 */
  distance?: number;
  /** How much a held note turns with the pull, 0 to 1. @default 0.6 */
  tilt?: number;
  /** Fan the stack on hover and focus, or keep it fanned. @default "hover" */
  expand?: "hover" | "always";
  /** The region's accessible name. @default "Notifications" */
  label?: string;
  /** Note height: 48, 56 or 64px. @default "md" */
  size?: FlickNoteSize;
  /** A swish as a note is thrown, a pop as one seats back. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Leaving = { note: FlickNoteItem; k: number; via: FlickNoteVia | "host" };
type Api = {
  reconcile: (notes: FlickNoteItem[]) => void;
};

const HEIGHTS: Record<FlickNoteSize, number> = { sm: 48, md: 56, lg: 64 };
/** The region's inset around the notes, so their shadow has room. */
const INSET_X = 6;
const INSET_BOTTOM = 6;
const INSET_TOP = 2;

const TONES: Record<
  FlickNoteTone,
  { icon: typeof Info; className: string; word: string }
> = {
  info: { icon: Info, className: "text-cobalt-bright", word: "Info" },
  success: { icon: CircleCheck, className: "text-success", word: "Done" },
  warn: { icon: TriangleAlert, className: "text-warn", word: "Warning" },
  danger: { icon: CircleAlert, className: "text-danger", word: "Problem" },
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** One sentence, never a doubled full stop. */
const sentence = (n: FlickNoteItem) => {
  const tone = TONES[n.tone ?? "info"] ?? TONES.info;
  const parts = [tone.word, n.title, n.body, n.time].filter((p): p is string =>
    Boolean(p && p.trim()),
  );
  return parts
    .map((p, i) => (i === 0 ? `${p}:` : /[.!?]$/.test(p) ? p : `${p}.`))
    .join(" ");
};

type Layout = {
  h: number;
  gap: number;
  peek: number;
  visible: number;
};

/** Where note `k` (0 is the front) rests, stacked or fanned. */
const restOf = (k: number, fanned: boolean, l: Layout) => {
  const shown = Math.min(k, l.visible - 1);
  if (fanned) {
    return {
      y: -shown * (l.h + l.gap),
      scale: 1,
      opacity: k < l.visible ? 1 : 0,
      shade: 0,
      ink: 1,
    };
  }
  // Stacked, a note behind shows only its edge: opaque, a shade darker,
  // its words hidden so they never read through the one in front.
  return {
    y: -shown * l.peek,
    scale: r2(1 - 0.05 * shown),
    opacity: k < l.visible ? 1 : 0,
    shade: r2(0.035 * shown),
    ink: shown > 0 ? 0 : 1,
  };
};

type NoteProps = {
  note: FlickNoteItem;
  k: number;
  leaving: Leaving["via"] | null;
  fanned: boolean;
  layout: Layout;
  distance: number;
  tilt: number;
  grabbable: boolean;
  focusable: boolean;
  motionSafe: boolean;
  disabled: boolean;
  ready: { current: boolean };
  region: { current: HTMLElement | null };
  bind: (id: string, node: HTMLLIElement | null) => void;
  onThrow: (id: string, speed: number, dx: number) => void;
  onSeat: () => void;
  onGone: (id: string) => void;
  onClose: (id: string) => void;
  onTap: (id: string, pointerType: string) => void;
  onFocusNote: (id: string) => void;
};

/**
 * One note: its place in the stack, its drag and its exit. Position, turn
 * and fade live in motion values; React renders it only when its place or
 * its state changes.
 */
function Note({
  note,
  k,
  leaving,
  fanned,
  layout,
  distance,
  tilt,
  grabbable,
  focusable,
  motionSafe,
  disabled,
  ready,
  region,
  bind,
  onThrow,
  onSeat,
  onGone,
  onClose,
  onTap,
  onFocusNote,
}: NoteProps) {
  const rest = restOf(k, fanned, layout);
  const x = useMotionValue(0);
  const y = useMotionValue(rest.y);
  const rotate = useMotionValue(0);
  const scale = useMotionValue(rest.scale);
  const opacity = useMotionValue(rest.opacity);
  const shade = useMotionValue(rest.shade);
  const ink = useMotionValue(rest.ink);
  const running = React.useRef(new Map<string, AnimationPlaybackControls>());
  const grab = React.useRef({ gx: 0, gy: 0, w: 1, base: 0 });
  const [held, setHeld] = React.useState(false);
  const thrown = React.useRef(false);
  const timer = React.useRef(0);
  const tone = TONES[note.tone ?? "info"] ?? TONES.info;
  const Icon = tone.icon;
  const id = note.id;
  const bindNode = React.useCallback(
    (node: HTMLLIElement | null) => bind(id, node),
    [bind, id],
  );

  const run = (key: string, controls: AnimationPlaybackControls) => {
    running.current.get(key)?.stop();
    running.current.set(key, controls);
  };

  // Arrival: a note that comes after the first paint rises in from below
  // on the house's toast landing.
  React.useEffect(() => {
    if (!ready.current || leaving) return;
    if (motionSafe) {
      y.jump(rest.y + distances.shift);
      run("y", animate(y, rest.y, springs.recoil));
    }
    opacity.jump(0);
    run(
      "opacity",
      animate(opacity, rest.opacity, {
        duration: durations.base,
        ease: easings.enter,
      }),
    );
    // Once, when the note arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Its place in the stack: fanning opens on snap, everything else glides.
  // Letting go is not a change of place: the release's own spring runs.
  React.useEffect(() => {
    if (leaving || held || thrown.current) return;
    const tween = { duration: durations.base, ease: easings.enter };
    run("shade", animate(shade, rest.shade, tween));
    run("ink", animate(ink, rest.ink, tween));
    if (!motionSafe) {
      for (const key of ["y", "scale", "opacity"])
        running.current.get(key)?.stop();
      y.jump(rest.y);
      scale.jump(rest.scale);
      run(
        "opacity",
        animate(opacity, rest.opacity, { duration: durations.fast }),
      );
      return;
    }
    const spring = fanned ? springs.snap : springs.glide;
    run("y", animate(y, rest.y, spring));
    run("scale", animate(scale, rest.scale, spring));
    run(
      "opacity",
      animate(opacity, rest.opacity, {
        duration: durations.base,
        ease: easings.enter,
      }),
    );
    // The resting place is all this follows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rest.y,
    rest.scale,
    rest.opacity,
    rest.shade,
    rest.ink,
    fanned,
    leaving,
    motionSafe,
  ]);

  // A keyed or host exit: away to the right, or a fade where it stands.
  React.useEffect(() => {
    if (!leaving || leaving === "flick" || thrown.current) return;
    thrown.current = true;
    const w = region.current?.clientWidth ?? 320;
    const done = () => onGone(note.id);
    if (!motionSafe || leaving === "host") {
      run(
        "opacity",
        animate(opacity, 0, {
          duration: durations.base,
          ease: easings.exit,
          onComplete: done,
        }),
      );
      return;
    }
    run(
      "x",
      animate(x, w * 1.15, { duration: durations.slow, ease: easings.exit }),
    );
    run(
      "rotate",
      animate(rotate, 6 * tilt, {
        duration: durations.slow,
        ease: easings.exit,
      }),
    );
    run(
      "opacity",
      animate(opacity, 0, {
        duration: durations.slow,
        ease: easings.exit,
        onComplete: done,
      }),
    );
    // The exit runs once, when it is asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  React.useEffect(() => {
    const anims = running.current;
    const t = timer;
    return () => {
      window.clearTimeout(t.current);
      for (const c of anims.values()) c.stop();
      anims.clear();
    };
  }, []);

  const drag = useDrag({
    threshold: 4,
    disabled: disabled || !grabbable || leaving !== null,
    onStart: ({ event }) => {
      const node =
        event.currentTarget instanceof Element ? event.currentTarget : null;
      const r = node?.getBoundingClientRect();
      const px = "clientX" in event ? event.clientX : 0;
      const py = "clientY" in event ? event.clientY : 0;
      grab.current = {
        gx: r ? clamp(((px - r.left) / r.width) * 2 - 1, -1, 1) : 0,
        gy: r ? clamp(((py - r.top) / r.height) * 2 - 1, -1, 1) : 0,
        w: r?.width ?? 320,
        base: rest.y,
      };
      for (const c of running.current.values()) c.stop();
      setHeld(true);
    },
    onMove: ({ offset }) => {
      const g = grab.current;
      x.set(r2(offset.x));
      y.set(r2(g.base + offset.y));
      // A card held off its middle turns with the pull: above the middle it
      // leans with a sideways pull, below it leans against it.
      const turn =
        tilt *
          22 *
          ((g.gx * offset.y) / (layout.h * 3) - (g.gy * offset.x) / g.w) +
        (tilt * 5 * offset.x) / g.w;
      rotate.set(r2(clamp(turn, -24, 24)));
      const far = Math.hypot(offset.x, offset.y) / Math.max(1, distance);
      opacity.set(r2(1 - 0.5 * clamp(far, 0, 1)));
    },
    onEnd: ({ offset, velocity }) => {
      setHeld(false);
      const g = grab.current;
      const px = project(offset.x, velocity.x, 0.995);
      const py = project(offset.y, velocity.y, 0.995);
      if (Math.hypot(px, py) > distance) {
        thrown.current = true;
        const len = Math.hypot(px, py) || 1;
        const dx = px / len;
        const dy = py / len;
        const speed = Math.hypot(velocity.x, velocity.y);
        onThrow(note.id, speed, dx);
        if (!motionSafe) {
          run(
            "opacity",
            animate(opacity, 0, {
              duration: durations.fast,
              ease: easings.exit,
              onComplete: () => onGone(note.id),
            }),
          );
          return;
        }
        // Far enough to clear the region whichever way it goes, at a pace
        // whose opening slope is the release speed: the throw carries on.
        const regionW = region.current?.clientWidth ?? g.w;
        const regionH = region.current?.clientHeight ?? 240;
        const travel = Math.hypot(regionW, regionH) + g.w * 0.6;
        const pace = Math.max(speed, 900);
        const time = clamp((4.5 * travel) / pace, 0.22, 0.5);
        const ease = easings.enter;
        run(
          "x",
          animate(x, r2(offset.x + dx * travel), { duration: time, ease }),
        );
        run(
          "y",
          animate(y, r2(g.base + offset.y + dy * travel), {
            duration: time,
            ease,
          }),
        );
        const spin = rotate.get() + Math.sign(dx || 1) * tilt * 28;
        run("rotate", animate(rotate, r2(spin), { duration: time, ease }));
        run(
          "opacity",
          animate(opacity, 0, {
            duration: time,
            ease: easings.exit,
            onComplete: () => onGone(note.id),
          }),
        );
        return;
      }
      // Short: home on snap with the throw's speed, and it seats.
      if (!motionSafe) {
        x.jump(0);
        y.jump(rest.y);
        rotate.jump(0);
        opacity.jump(rest.opacity);
        return;
      }
      run("x", animate(x, 0, { ...springs.snap, velocity: velocity.x }));
      run("y", animate(y, rest.y, { ...springs.snap, velocity: velocity.y }));
      run("rotate", animate(rotate, 0, springs.snap));
      run(
        "opacity",
        animate(opacity, rest.opacity, {
          duration: durations.fast,
          ease: easings.enter,
        }),
      );
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(onSeat, 170);
    },
    onCancel: () => {
      setHeld(false);
      run("x", animate(x, 0, springs.glide));
      run("rotate", animate(rotate, 0, springs.glide));
      run("y", animate(y, rest.y, springs.glide));
      run(
        "opacity",
        animate(opacity, rest.opacity, { duration: durations.fast }),
      );
    },
    onTap: (event) => {
      if (leaving) return;
      onTap(note.id, event.pointerType);
    },
  });

  return (
    <motion.li
      ref={bindNode}
      tabIndex={focusable && !leaving ? 0 : -1}
      aria-label={sentence(note)}
      aria-hidden={leaving ? true : undefined}
      data-k={k}
      onFocus={() => onFocusNote(note.id)}
      {...drag}
      className={cn(
        "group/flick-note absolute right-0 bottom-0 left-0 list-none outline-none select-none",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        grabbable && !disabled
          ? "cursor-grab touch-none active:cursor-grabbing"
          : "touch-pan-y",
        "rounded-3",
      )}
      style={{
        height: layout.h,
        x,
        y,
        rotate,
        scale,
        opacity,
        originX: 0.5,
        originY: 1,
        zIndex: held || leaving === "flick" ? 200 : 100 - k,
        pointerEvents: leaving ? "none" : undefined,
      }}
    >
      <div className="relative h-full overflow-hidden rounded-3 border border-hairline-strong bg-popover shadow-[0_3px_8px_-5px_color-mix(in_oklab,black_40%,transparent)]">
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-foreground"
          style={{ opacity: shade }}
        />
        <motion.div
          className="relative flex h-full items-center gap-3 pr-2 pl-3"
          style={{ opacity: ink }}
        >
          <Icon aria-hidden className={cn("size-4 shrink-0", tone.className)} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] leading-[18px] font-medium text-foreground">
              {note.title}
            </p>
            {note.body ? (
              <p className="truncate text-xs leading-4 text-ink-3">
                {note.body}
              </p>
            ) : null}
          </div>
          {note.time ? (
            <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
              {note.time}
            </span>
          ) : null}
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Dismiss ${note.title}`}
            disabled={disabled}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onClose(note.id);
            }}
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-2 text-ink-3 opacity-0 transition-opacity outline-none hover:bg-surface-2 hover:text-foreground",
              "group-hover/flick-note:opacity-100 group-focus-visible/flick-note:opacity-100",
            )}
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </motion.div>
      </div>
    </motion.li>
  );
}

/**
 * A toast stack you handle like cards. Notes stack at the bottom of their
 * region with depth — each one behind a little higher, smaller and fainter,
 * `visible` deep — and a new one rises in on the recoil spring while the
 * rest step back on glide. Hovering or focusing the stack fans it open into
 * a readable column on the snap spring; a tap does it on a touch screen.
 *
 * Any open note (the front one when stacked) follows the finger 1:1 in any
 * direction and turns like a real card held off its middle. On release the
 * throw is projected: past `distance` the note carries on along the throw
 * at its own speed, spinning, out through the region's edge, and the stack
 * closes up behind it; short of it, the note springs home with the throw's
 * velocity and seats.
 *
 * The stack is a labelled list with one tab stop: arrows move between
 * notes, Enter opens one, Delete dismisses it, Escape dismisses the top
 * note. Under reduced motion nothing travels: notes fade in and out where
 * they stand and the fan swaps at once.
 */
export function FlickNote({
  notes,
  onDismiss,
  onOpen,
  visible = 3,
  gap = 8,
  distance = 120,
  tilt = 0.6,
  expand = "hover",
  label = "Notifications",
  size = "md",
  sound = false,
  disabled = false,
  className,
}: FlickNoteProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const h = HEIGHTS[size] ?? HEIGHTS.md;
  const deep = clamp(Math.round(visible), 1, 6);
  const space = Math.max(0, gap);
  const layout: Layout = React.useMemo(
    () => ({ h, gap: space, peek: r2(space * 0.75 + 4), visible: deep }),
    [h, space, deep],
  );
  const regionH = h + (deep - 1) * (h + space) + INSET_BOTTOM + INSET_TOP;

  const [order, setOrder] = React.useState(() => notes.map((n) => n.id));
  const [leaving, setLeaving] = React.useState<Map<string, Leaving>>(
    () => new Map(),
  );
  const [hovered, setHovered] = React.useState(false);
  const [within, setWithin] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [spoken, setSpoken] = React.useState("");

  const regionRef = React.useRef<HTMLElement | null>(null);
  const nodes = React.useRef(new Map<string, HTMLLIElement>());
  const ready = React.useRef(false);
  const known = React.useRef(new Map<string, FlickNoteItem>());
  const api = React.useRef<Api | null>(null);

  const active = notes.filter((n) => !leaving.has(n.id));
  const fanned = expand === "always" || hovered || within || touched;
  const extra = Math.max(0, active.length - deep);
  const front = active[0]?.id ?? null;
  const roving =
    focusId && active.some((n) => n.id === focusId) ? focusId : front;

  const bind = React.useCallback((id: string, node: HTMLLIElement | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  }, []);

  const pan = (id: string) => {
    const r = nodes.current.get(id)?.getBoundingClientRect();
    return r ? panFrom(r.left + r.width / 2, null) : 0;
  };

  /** Commits a dismissal now, from the gesture or key that made it. */
  const dismiss = (id: string, via: FlickNoteVia) => {
    const note = notes.find((n) => n.id === id);
    if (!note || leaving.has(id)) return;
    const k = active.findIndex((n) => n.id === id);
    // Focus that was on the leaving note goes to the one taking its place.
    const hadFocus = nodes.current.get(id) === document.activeElement;
    const next = active[k + 1] ?? active[k - 1];
    setLeaving((prev) => new Map(prev).set(id, { note, k, via }));
    onDismiss?.(id, via);
    if (hadFocus && next) {
      setFocusId(next.id);
      nodes.current.get(next.id)?.focus({ preventScroll: true });
    }
  };

  const onThrow = (id: string, speed: number, dx: number) => {
    audio.play("swish", {
      pitch: r2(clamp(0.8 + speed / 4000, 0.8, 1.5)),
      gain: 0.5,
      pan: r2(clamp(pan(id) + dx * 0.3, -0.6, 0.6)),
    });
    dismiss(id, "flick");
  };

  const onKeyDismiss = (id: string, via: FlickNoteVia) => {
    audio.play("swish", { pitch: 1, gain: 0.4, pan: pan(id) });
    dismiss(id, via);
  };

  const onGone = React.useCallback((id: string) => {
    setLeaving((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setOrder((prev) => prev.filter((x) => x !== id));
  }, []);

  /** New ids join the order at the end (DOM order never moves); notes the host dropped fade out. */
  const reconcile = (list: FlickNoteItem[]) => {
    const ids = new Set(list.map((n) => n.id));
    const arrived = list.filter((n) => !known.current.has(n.id));
    const vanished = [...known.current.values()].filter(
      (n) => !ids.has(n.id) && !leaving.has(n.id),
    );
    // A vanished note is tracked by its fade from here on, not by `known`.
    known.current = new Map(list.map((n) => [n.id, n]));
    if (vanished.length) {
      setLeaving((prev) => {
        const next = new Map(prev);
        for (const n of vanished) {
          if (!next.has(n.id)) next.set(n.id, { note: n, k: 0, via: "host" });
        }
        return next;
      });
    }
    setOrder((prev) => {
      const kept = prev.filter(
        (id) =>
          ids.has(id) || leaving.has(id) || vanished.some((v) => v.id === id),
      );
      const added = list.map((n) => n.id).filter((id) => !kept.includes(id));
      return added.length || kept.length !== prev.length
        ? [...kept, ...added]
        : prev;
    });
    const newest = arrived[0];
    if (newest && ready.current) {
      setSpoken(`New notification: ${newest.title}`);
    }
  };

  React.useEffect(() => {
    api.current = { reconcile };
  });

  React.useEffect(() => {
    api.current?.reconcile(notes);
  }, [notes]);

  // Notes that mount after the first paint arrive with the landing; the
  // flag is reset on cleanup so a rehearsal remount never animates in.
  React.useEffect(() => {
    ready.current = true;
    return () => {
      ready.current = false;
    };
  }, []);

  // A tap opened the fan on a touch screen; a press anywhere else closes it.
  React.useEffect(() => {
    if (!touched) return;
    const onDown = (event: PointerEvent) => {
      const region = regionRef.current;
      if (
        region &&
        event.target instanceof Node &&
        region.contains(event.target)
      )
        return;
      setTouched(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [touched]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (disabled) return;
    const at = active.findIndex((n) => n.id === roving);
    const move = (to: number) => {
      const n = active[clamp(to, 0, Math.min(active.length, deep) - 1)];
      if (!n) return;
      event.preventDefault();
      setFocusId(n.id);
      nodes.current.get(n.id)?.focus({ preventScroll: true });
    };
    switch (event.key) {
      case "Escape": {
        if (!front) return;
        // Handled here, where focus is, so the page never sees it.
        event.preventDefault();
        onKeyDismiss(front, "key");
        return;
      }
      case "ArrowUp":
        move(at + 1);
        return;
      case "ArrowDown":
        move(at - 1);
        return;
      case "Home":
        move(0);
        return;
      case "End":
        move(active.length - 1);
        return;
      case "Delete":
      case "Backspace":
        if (!roving) return;
        event.preventDefault();
        onKeyDismiss(roving, "key");
        return;
      case "Enter":
        if (!roving) return;
        event.preventDefault();
        onOpen?.(roving);
        return;
    }
  };

  const rendered = order
    .map((id) => {
      const gone = leaving.get(id);
      const note = gone?.note ?? notes.find((n) => n.id === id);
      if (!note) return null;
      const k = gone ? gone.k : active.findIndex((n) => n.id === id);
      return { note, k: Math.max(0, k), via: gone?.via ?? null };
    })
    .filter(
      (
        x,
      ): x is { note: FlickNoteItem; k: number; via: Leaving["via"] | null } =>
        x !== null,
    );

  return (
    <section
      ref={regionRef}
      aria-label={label}
      onKeyDown={onKeyDown}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setHovered(false);
      }}
      onFocus={(event) => {
        // Keyboard focus fans the stack; a click's focus leaves it to hover.
        if (
          event.target instanceof Element &&
          event.target.matches(":focus-visible")
        ) {
          setWithin(true);
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setWithin(false);
        }
      }}
      className={cn(
        "relative w-full overflow-clip",
        disabled && "opacity-50",
        className,
      )}
      style={{ height: regionH }}
    >
      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute right-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        style={{
          bottom:
            INSET_BOTTOM +
            h +
            (Math.min(deep, active.length) - 1) * layout.peek +
            4,
        }}
        initial={false}
        animate={{ opacity: extra > 0 && !fanned ? 1 : 0 }}
        transition={{ duration: durations.fast }}
      >
        +{extra} more
      </motion.span>
      <ol
        role="list"
        className="absolute"
        style={{
          left: INSET_X,
          right: INSET_X,
          bottom: INSET_BOTTOM,
          top: INSET_TOP,
        }}
      >
        {rendered.map(({ note, k, via }) => (
          <Note
            key={note.id}
            note={note}
            k={k}
            leaving={via}
            fanned={fanned}
            layout={layout}
            distance={Math.max(24, distance)}
            tilt={clamp(tilt, 0, 1)}
            grabbable={!via && (fanned ? k < deep : k === 0)}
            focusable={note.id === roving}
            motionSafe={motionSafe}
            disabled={disabled}
            ready={ready}
            region={regionRef}
            bind={bind}
            onThrow={onThrow}
            onSeat={() => audio.play("pop", { pitch: 0.9, gain: 0.35 })}
            onGone={onGone}
            onClose={(id) => onKeyDismiss(id, "button")}
            onTap={(id, pointerType) => {
              // On a touch screen the first tap fans the stack; after that,
              // and always with a mouse, a tap opens the note.
              if (pointerType !== "mouse" && !fanned) setTouched(true);
              else onOpen?.(id);
            }}
            onFocusNote={setFocusId}
          />
        ))}
      </ol>
    </section>
  );
}
