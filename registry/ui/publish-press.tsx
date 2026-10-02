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
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PublishStatus = "draft" | "published" | "scheduled";

export type PublishPressState = "idle" | "pending" | "success" | "error";

export type PublishPressSize = "sm" | "md" | "lg";

export type PublishPressProps = {
  /** Controlled document status. The press reports through `onValueChange` and waits for this. */
  value?: PublishStatus;
  /** The status when uncontrolled. @default "draft" */
  defaultValue?: PublishStatus;
  /** Each status the document moves to, once its action has succeeded. */
  onValueChange?: (value: PublishStatus) => void;
  /** Publishes now (`at` is null) or schedules for `at`. Return a promise and the roller waits on it. */
  onPublish?: (at: Date | null, signal: AbortSignal) => void | Promise<unknown>;
  /** Takes a published or scheduled document back to draft. */
  onUnpublish?: (signal: AbortSignal) => void | Promise<unknown>;
  /** When set, a press schedules for this moment and stamps the date instead of rolling. */
  schedule?: Date | number | null;
  /** How the stamped date reads. @default "Oct 9 · 09:00", in UTC so server and browser agree */
  formatDate?: (date: Date) => string;
  /** Controlled action state. Every move goes through `onStateChange` and waits for this. */
  state?: PublishPressState;
  /** Each action state, from the press, the answer or the timer that caused it. */
  onStateChange?: (state: PublishPressState) => void;
  /** How much ink the roller carries, 0 to 1: a pale, speckled print or a dense, solid one. @default 0.7 */
  ink?: number;
  /** How big and heavy the roller is, 0 to 1: a quick small brayer or a slow drum. @default 0.5 */
  roller?: number;
  /** How much the old label smears as the roller drags over it, 0 to 1. 0 wipes clean. @default 0.5 */
  smudge?: number;
  /** The text on a draft. @default "Publish" */
  label?: string;
  /** The text on a draft when `schedule` is set. @default "Schedule" */
  scheduleLabel?: string;
  /** The text while publishing. @default "Publishing" */
  pendingLabel?: string;
  /** The word the roller inks. @default "Published" */
  publishedLabel?: string;
  /** The text after an action failed; a press tries again. @default "Retry" */
  errorLabel?: string;
  /** The ink: the printed word, the stamp, the roller. Any CSS colour. @default "var(--accent-bright)" */
  inkColor?: string;
  /** How long fresh ink stays wet before it dries, in ms. @default 1400 */
  successHold?: number;
  /** How long the error holds before the button rests, in ms. @default 2600 */
  errorHold?: number;
  /** @default "md" */
  size?: PublishPressSize;
  /** Play the roller setting down, the roll and the stamp. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Face = "draft" | "pending" | "error" | "published" | "scheduled";
type Kind = "publish" | "schedule" | "unpublish";

type Geometry = { h: number; pad: number; k: number };

const GEOMETRY: Record<PublishPressSize, Geometry> = {
  sm: { h: 32, pad: 12, k: 0.85 },
  md: { h: 40, pad: 16, k: 1 },
  lg: { h: 48, pad: 20, k: 1.15 },
};

const TEXT: Record<PublishPressSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Sounds answer a press only within its own choreography. */
const BEAT_MS = 900;
const STRIPS = 4;
const RIBS = 6;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Built from UTC parts, so the server and the browser print the same date. */
const utcDate = (d: Date) =>
  `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()} · ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;

const toDate = (v: Date | number | null | undefined) =>
  v === null || v === undefined ? null : v instanceof Date ? v : new Date(v);

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as { then?: unknown }).then === "function";

const faceOf = (value: PublishStatus): Face =>
  value === "draft" ? "draft" : value;

/** The halftone screen the ink is printed through: dots grow with the ink. */
const screen = (radius: number) =>
  radius >= 1.42
    ? "none"
    : `radial-gradient(circle, black ${r2(radius)}px, transparent ${r2(radius + 0.55)}px)`;

/** The printed ink: the word, or the stamped date in its ruled box. */
function Ink({
  kind,
  text,
  mask,
  shadow,
}: {
  kind: "published" | "scheduled";
  text: string;
  mask: MotionValue<string>;
  shadow: MotionValue<string>;
}) {
  const style = {
    maskImage: mask,
    WebkitMaskImage: mask,
    maskSize: "2px 2px",
    WebkitMaskSize: "2px 2px",
    textShadow: shadow,
  };
  if (kind === "published") {
    return (
      <motion.span
        className="block text-center text-(--publish-press-ink)"
        style={style}
      >
        {text}
      </motion.span>
    );
  }
  return (
    <span className="flex justify-center">
      <motion.span
        className="inline-flex -rotate-3 items-center rounded-1 border-[1.5px] border-(--publish-press-ink) px-1.5 py-px font-mono text-[10px] leading-4 tracking-[0.08em] text-(--publish-press-ink) uppercase"
        style={style}
      >
        {text}
      </motion.span>
    </span>
  );
}

type Api = {
  transition: (
    fv: PublishStatus,
    tv: PublishStatus,
    fs: PublishPressState,
    ts: PublishPressState,
  ) => void;
  settle: () => void;
  rolled: () => void;
  requestState: (next: PublishPressState) => void;
  succeed: (target: PublishStatus) => void;
};

/**
 * A publish button drawn as a sheet of paper, printed by a roller. A press
 * sets an inked roller down at the start of the label; while the action is
 * pending it bobs in place, pressing and lifting. When the action succeeds it
 * rolls across the label left to right: behind it the new word is inked in —
 * clipped to the roller's track — and ahead of it the old label stays crisp
 * until the roller drags it into a smear that dries away. The roller is a
 * cylinder seen face on, its ribs turning at distance over radius, so a big
 * drum visibly turns slower than a small brayer.
 *
 * The ink is printed through a halftone screen whose dots grow with `ink`;
 * fresh ink is wet and solid and dries back to its screen over
 * `successHold`. With `schedule` set, the press raises a date stamp instead,
 * which slams down on the recoil spring and leaves the date in a tilted box.
 * Pressing a published or scheduled button lifts the ink off in strips.
 * Escape cancels while pending, and a failure leaves "Retry". Under reduced
 * motion nothing rolls, bobs, drops or peels: the ink and the stamp fade in
 * and out, dry, and the states and their words are unchanged.
 */
export function PublishPress({
  value,
  defaultValue = "draft",
  onValueChange,
  onPublish,
  onUnpublish,
  schedule,
  formatDate = utcDate,
  state,
  onStateChange,
  ink = 0.7,
  roller = 0.5,
  smudge = 0.5,
  label = "Publish",
  scheduleLabel = "Schedule",
  pendingLabel = "Publishing",
  publishedLabel = "Published",
  errorLabel = "Retry",
  inkColor = "var(--accent-bright)",
  successHold = 1400,
  errorHold = 2600,
  size = "md",
  sound = false,
  disabled = false,
  className,
}: PublishPressProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `press-${uid}-hint`;
  const g = GEOMETRY[size] ?? GEOMETRY.md;
  const load = clamp01(ink);
  const heft = clamp01(roller);
  const smear = clamp01(smudge);
  const when = toDate(schedule);
  const date = when ? formatDate(when) : "";

  const [ownValue, setOwnValue] = React.useState<PublishStatus>(defaultValue);
  const shownValue = value ?? ownValue;
  const [ownState, setOwnState] = React.useState<PublishPressState>("idle");
  const shownState = state ?? ownState;
  const [kind, setKind] = React.useState<Kind>("publish");
  const restFace = (v: PublishStatus, s: PublishPressState): Face =>
    s === "error"
      ? "error"
      : s === "pending" && v === "draft" && kind === "publish"
        ? "pending"
        : faceOf(v);
  const [face, setFace] = React.useState<Face>(() =>
    restFace(shownValue, shownState),
  );
  const [rolling, setRolling] = React.useState(false);
  const [strips, setStrips] = React.useState<{
    key: number;
    kind: "published" | "scheduled";
  } | null>(null);
  const [cell, setCell] = React.useState<HTMLSpanElement | null>(null);
  const [geo, setGeo] = React.useState({ left: g.pad, w: 0 });

  // One sentence per change, frozen from the value and state it changed to.
  const [seen, setSeen] = React.useState({ v: shownValue, s: shownState });
  const [said, setSaid] = React.useState("");
  if (seen.v !== shownValue || seen.s !== shownState) {
    const was = seen;
    setSeen({ v: shownValue, s: shownState });
    setSaid(
      was.v !== shownValue
        ? shownValue === "published"
          ? "Published."
          : shownValue === "scheduled"
            ? `Scheduled for ${date || "later"}.`
            : was.v === "scheduled"
              ? "Schedule cancelled."
              : "Unpublished."
        : shownState === "pending"
          ? kind === "unpublish"
            ? "Unpublishing."
            : kind === "schedule"
              ? "Scheduling."
              : "Publishing."
          : shownState === "error"
            ? `Not ${kind === "unpublish" ? "unpublished" : kind === "schedule" ? "scheduled" : "published"}. Press ${errorLabel} to try again.`
            : was.s === "pending" && shownState === "idle"
              ? "Cancelled."
              : "",
    );
  }

  /** How much of the new ink is down, 0 to 1. */
  const u = useMotionValue(shownValue === "published" ? 1 : 0);
  /** How much of the old label the roller has wiped, 0 to 1. */
  const wipe = useMotionValue(0);
  /** Where the roller stands along the label, 0 to 1. */
  const park = useMotionValue(0);
  const peek = useMotionValue(0);
  const rollerOn = useMotionValue(0);
  const lift = useMotionValue(0);
  const bob = useMotionValue(0);
  const smearOn = useMotionValue(0);
  const squash = useMotionValue(0);
  const wet = useMotionValue(0);
  const stampScale = useMotionValue(1);
  const stampOn = useMotionValue(shownValue === "scheduled" ? 1 : 0);
  const holdClock = useMotionValue(0);

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const api = React.useRef<Api | null>(null);
  const prev = React.useRef({ v: shownValue, s: shownState });
  const beat = React.useRef(-Infinity);
  const controller = React.useRef<AbortController | null>(null);
  const epoch = React.useRef(0);
  const busy = React.useRef(false);
  const hovered = React.useRef(false);
  const stripKey = React.useRef(0);

  const radius = lerp(4, 10, heft) * g.k;
  const rollSeconds = 0.4 + 0.2 * heft;
  const restDot = lerp(0.62, 1.45, load);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  const audible = () => performance.now() - beat.current < BEAT_MS;
  const pan = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const requestState = (next: PublishPressState) => {
    if (state === undefined) setOwnState(next);
    onStateChange?.(next);
  };
  const requestValue = (next: PublishStatus) => {
    if (value === undefined) setOwnValue(next);
    onValueChange?.(next);
  };

  const fade = (mv: MotionValue<number>, to: number, key: string) =>
    run(
      key,
      animate(mv, to, {
        duration: to > mv.get() ? durations.fast : durations.base,
        ease: to > mv.get() ? easings.enter : easings.exit,
      }),
    );

  /** The roller (or the stamp) comes off the paper. */
  const liftOff = () => {
    halt("peek");
    if (!motionSafe) {
      rollerOn.set(0);
      return;
    }
    run(
      "lift",
      animate(lift, -3 * g.k, { duration: durations.base, ease: easings.exit }),
    );
    run(
      "rollerOn",
      animate(rollerOn, 0, {
        duration: durations.base,
        ease: easings.exit,
        onComplete: () => lift.jump(0),
      }),
    );
  };

  /** Sets the roller down where a pending action will start from. */
  const setDown = (at: "start" | "end") => {
    lift.jump(0);
    if (!motionSafe) {
      park.set(at === "start" ? 0 : 1);
      peek.set(0);
      rollerOn.set(1);
      return;
    }
    run("park", animate(park, at === "start" ? 0 : 1, springs.snap));
    run("peek", animate(peek, 0, springs.snap));
    fade(rollerOn, 1, "rollerOn");
  };

  const dry = () => {
    if (!motionSafe) {
      wet.set(0);
      return;
    }
    wet.jump(1);
    run(
      "wet",
      animate(wet, 0, {
        duration: Math.max(0.2, successHold / 1000),
        ease: easings.enter,
      }),
    );
  };

  const roll = () => {
    busy.current = true;
    halt("peek");
    lift.jump(0);
    peek.jump(0);
    halt("park");
    u.jump(0);
    wipe.jump(0);
    park.jump(0);
    rollerOn.jump(1);
    smearOn.jump(smear > 0 ? 1 : 0);
    wet.jump(1);
    setRolling(true);
    if (audible()) {
      audio.play("swish", {
        pitch: r2(1.15 - 0.3 * heft),
        gain: 0.5,
        pan: pan(),
      });
    }
    // One tween drives the ink, the wipe and the roller, so they never part.
    run(
      "u",
      animate(u, 1, {
        duration: rollSeconds,
        ease: easings.move,
        onUpdate: (v) => {
          wipe.set(v);
          park.set(v);
        },
        onComplete: () => api.current?.rolled(),
      }),
    );
  };

  const rolled = () => {
    busy.current = false;
    wipe.jump(0);
    setRolling(false);
    setFace("published");
    liftOff();
    run(
      "smear",
      animate(smearOn, 0, { duration: durations.slow, ease: easings.exit }),
    );
    dry();
  };

  const stamp = () => {
    halt("stampBreath");
    halt("peek");
    rollerOn.set(0);
    if (!motionSafe) {
      stampScale.set(1);
      fade(stampOn, 1, "stampOn");
      setFace("scheduled");
      wet.set(0);
      return;
    }
    stampOn.jump(1);
    run("stampScale", animate(stampScale, 1, springs.recoil));
    squash.jump(0);
    run(
      "squash",
      animate(squash, 1, {
        duration: durations.base,
        ease: easings.exit,
        onComplete: () => squash.jump(0),
      }),
    );
    if (audible()) {
      audio.play("thock", { pitch: 0.9, gain: 0.62, pan: pan() });
    }
    setFace("scheduled");
    dry();
  };

  /** The ink comes off in strips, and the draft shows through again. */
  const peel = (from: "published" | "scheduled") => {
    halt("stampBreath");
    liftOff();
    u.jump(0);
    wipe.jump(0);
    if (!motionSafe) {
      stampOn.set(0);
      setFace("draft");
      return;
    }
    if (audible()) {
      audio.play("swish", { pitch: 1.3, gain: 0.42, pan: pan() });
    }
    stripKey.current += 1;
    setStrips({ key: stripKey.current, kind: from });
    stampOn.jump(0);
    setFace("draft");
  };

  const settle = () => {
    for (const c of anims.current.values()) c.stop();
    anims.current.clear();
    busy.current = false;
    setRolling(false);
    setStrips(null);
    u.set(shownValue === "published" ? 1 : 0);
    wipe.set(0);
    park.set(shownState === "pending" && kind === "unpublish" ? 1 : 0);
    peek.set(0);
    lift.set(0);
    bob.set(0);
    smearOn.set(0);
    squash.set(0);
    wet.set(0);
    stampScale.set(1);
    stampOn.set(shownValue === "scheduled" ? 1 : 0);
    rollerOn.set(
      shownState === "pending" && shownValue === "draft" && kind === "publish"
        ? 1
        : 0,
    );
    setFace(restFace(shownValue, shownState));
  };

  const transition = (
    fv: PublishStatus,
    tv: PublishStatus,
    fs: PublishPressState,
    ts: PublishPressState,
  ) => {
    if (!motionSafe) {
      settle();
      return;
    }
    if (fv !== tv) {
      halt("stampBreath");
      if (tv === "published" && fv === "draft") roll();
      else if (tv === "scheduled" && fv === "draft") stamp();
      else if (tv === "draft")
        peel(fv === "scheduled" ? "scheduled" : "published");
      else {
        stampOn.set(tv === "scheduled" ? 1 : 0);
        u.set(tv === "published" ? 1 : 0);
        setFace(faceOf(tv));
      }
      return;
    }
    if (ts === "pending") {
      if (kind === "schedule") {
        // The stamp is lifted and inked, hovering where it will land.
        stampScale.jump(1.18);
        run("stampOn", animate(stampOn, 0.3, { duration: durations.fast }));
      } else {
        setDown(kind === "unpublish" ? "end" : "start");
      }
      setFace(restFace(tv, ts));
      return;
    }
    if (fs === "pending") {
      // Refused or cancelled: the tools come away and nothing is printed.
      liftOff();
      if (kind === "schedule") fade(stampOn, 0, "stampOn");
      if (tv === "published") u.set(1);
    }
    setFace(restFace(tv, ts));
  };

  const succeed = (target: PublishStatus) => {
    requestValue(target);
    requestState("success");
  };

  const act = (next: Kind) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    epoch.current += 1;
    const token = epoch.current;
    const target: PublishStatus =
      next === "unpublish"
        ? "draft"
        : next === "schedule"
          ? "scheduled"
          : "published";
    let result: unknown;
    try {
      result =
        next === "unpublish"
          ? onUnpublish?.(ctrl.signal)
          : onPublish?.(next === "schedule" ? when : null, ctrl.signal);
    } catch {
      requestState("error");
      return;
    }
    if (!isThenable(result)) {
      succeed(target);
      return;
    }
    requestState("pending");
    result.then(
      () => {
        if (epoch.current === token) api.current?.succeed(target);
      },
      () => {
        if (epoch.current === token) api.current?.requestState("error");
      },
    );
  };

  const press = () => {
    if (disabled || busy.current || shownState === "pending") return;
    beat.current = performance.now();
    const next: Kind =
      shownValue !== "draft" ? "unpublish" : when ? "schedule" : "publish";
    setKind(next);
    if (next !== "schedule") {
      audio.play("thock", {
        pitch: r2(1.1 - 0.25 * heft),
        gain: 0.45,
        pan: pan(),
      });
    }
    act(next);
  };

  const cancel = () => {
    epoch.current += 1;
    controller.current?.abort();
    controller.current = null;
    requestState("idle");
  };

  React.useEffect(() => {
    api.current = { transition, settle, rolled, requestState, succeed };
  });

  // The paper follows the shown value and state, so a host's answer prints
  // the same way a press does.
  React.useEffect(() => {
    const was = prev.current;
    if (was.v === shownValue && was.s === shownState) return;
    prev.current = { v: shownValue, s: shownState };
    api.current?.transition(was.v, shownValue, was.s, shownState);
  }, [shownValue, shownState]);

  // Mounting (or re-mounting under StrictMode) puts the paper at rest.
  React.useEffect(() => {
    const running = anims.current;
    api.current?.settle();
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      epoch.current += 1;
    };
  }, []);

  // The label's box, measured where it sits in the button.
  React.useEffect(() => {
    if (!cell) return;
    const measure = () =>
      setGeo((was) =>
        was.left === cell.offsetLeft && was.w === cell.offsetWidth
          ? was
          : { left: cell.offsetLeft, w: cell.offsetWidth },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(cell);
    return () => observer.disconnect();
  }, [cell]);

  // While pending, the roller (or the stamp) bobs; never on a hidden page.
  const bobbing = shownState === "pending" && motionSafe;
  React.useEffect(() => {
    if (!bobbing) return;
    const loop = animate(bob, [0, 1], {
      duration: 0.5,
      ease: easings.move,
      repeat: Infinity,
      repeatType: "mirror",
    });
    const onVisibility = () => {
      if (document.hidden) loop.pause();
      else loop.play();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      loop.stop();
      animate(bob, 0, springs.snap);
    };
  }, [bobbing, bob]);

  // Wet ink holds, then dries; an error holds, then rests.
  const holding = shownState === "success" || shownState === "error";
  const holdMs = shownState === "success" ? successHold : errorHold;
  React.useEffect(() => {
    if (!holding) return;
    holdClock.jump(0);
    const controls = animate(holdClock, 1, {
      duration: Math.max(0, holdMs) / 1000,
      ease: "linear",
      onComplete: () => api.current?.requestState("idle"),
    });
    const onVisibility = () => {
      if (document.hidden) controls.pause();
      else controls.play();
    };
    if (document.hidden) controls.pause();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      controls.stop();
    };
  }, [holding, holdMs, holdClock]);

  const hover = (on: boolean) => {
    if (!motionSafe || busy.current || shownState !== "idle") return;
    if (shownValue !== "draft") return;
    if (when) {
      stampScale.jump(1.2);
      fade(stampOn, on ? 0.16 : 0, "stampOn");
      return;
    }
    // A hint of the roller at the start of the label.
    if (on) {
      park.jump(0);
      peek.jump(-0.6 * radius);
    }
    fade(rollerOn, on ? 0.5 : 0, "rollerOn");
  };

  // Per-frame geometry, all from motion values, all rounded.
  const W = geo.w;
  const oldClip = useTransform(
    wipe,
    (v) => `inset(0 0 0 ${r2(clamp01(v) * W)}px)`,
  );
  const inkClip = useTransform(
    u,
    (v) => `inset(0 ${r2((1 - clamp01(v)) * W)}px 0 0)`,
  );
  const drag = 5 * smear * g.k;
  const band = (6 + 22 * smear) * g.k;
  const smearClip = useTransform(u, (v) => {
    const at = clamp01(v) * W;
    return `inset(0 ${r2(Math.max(0, W - at + drag))}px 0 ${r2(Math.max(0, at - band - drag))}px)`;
  });
  const smearOpacity = useTransform(smearOn, (s) => r2(0.7 * smear * s));
  const oldScaleY = useTransform(squash, (s) => r2(1 - 0.2 * s));
  const oldScaleX = useTransform(squash, (s) => r2(1 + 0.1 * smear * s));
  const oldOpacity = useTransform(squash, (s) => r2(1 - s));
  const dot = useTransform(wet, (w) => lerp(restDot, 1.5, clamp01(w)));
  const mask = useTransform(dot, screen);
  const shadow = useTransform(wet, (w) =>
    w <= 0.01
      ? "none"
      : `0 0 ${r2(3 * w)}px color-mix(in oklab, var(--publish-press-ink) ${Math.round(55 * w)}%, transparent)`,
  );

  const rollerTop = 4 * (g.h / 40);
  const rollerHeight = g.h - 2 * rollerTop;
  const body = useTransform(
    [park, peek, bob, lift] as MotionValue<number>[],
    ([v = 0, pk = 0, b = 0, l = 0]: number[]) => {
      const cx = geo.left + clamp01(v) * W + pk;
      return {
        x: r2(cx - radius),
        y: r2(rollerTop + 2 * b * g.k + l),
        h: r2(rollerHeight - 1.5 * b * g.k),
        phase: (clamp01(v) * W) / Math.max(1, radius),
        cx,
      };
    },
  );
  const rollerX = useTransform(body, (b) => b.x);
  const rollerY = useTransform(body, (b) => b.y);
  const rollerH = useTransform(body, (b) => b.h);
  const highlightX = useTransform(body, (b) => r2(b.cx - radius * 0.45));
  const capX = useTransform(body, (b) => r2(b.cx - radius * 0.6));
  const capY = useTransform(body, (b) => r2(b.y - 1.5));
  const capBottomY = useTransform(body, (b) => r2(b.y + b.h - 0.5));
  const ribs = useTransform(body, (b) => {
    // Ribs round the drum, seen face on: x is the sine of each one's angle,
    // and only those facing out are drawn, the edge-on ones fainter.
    const front: string[] = [];
    const side: string[] = [];
    for (let i = 0; i < RIBS; i += 1) {
      const a = -b.phase + (i * 2 * Math.PI) / RIBS;
      const c = Math.cos(a);
      if (c <= 0.05) continue;
      const x = r2(b.cx + radius * 0.9 * Math.sin(a));
      const seg = `M ${x} ${r2(b.y + 2)} V ${r2(b.y + b.h - 2)}`;
      (c > 0.55 ? front : side).push(seg);
    }
    return { front: front.join(" "), side: side.join(" ") };
  });
  const ribsFront = useTransform(ribs, (r) => r.front);
  const ribsSide = useTransform(ribs, (r) => r.side);
  const stampDisplayScale = useTransform(
    [stampScale, bob] as MotionValue<number>[],
    ([s = 1, b = 0]: number[]) =>
      r2(s + (s > 1.05 && kind === "schedule" ? 0.03 * b : 0)),
  );

  const plainFaces: { key: Face; text: string; tone?: string }[] = [
    { key: "draft", text: when ? scheduleLabel : label },
    { key: "pending", text: pendingLabel },
    { key: "error", text: errorLabel, tone: "text-danger" },
  ];
  const draftText = when ? scheduleLabel : label;
  const name =
    shownState === "error"
      ? errorLabel
      : shownValue === "published"
        ? publishedLabel
        : shownValue === "scheduled"
          ? `Scheduled for ${date || "later"}`
          : shownState === "pending" && kind === "publish"
            ? pendingLabel
            : when
              ? `${scheduleLabel} for ${date}`
              : label;
  const hint =
    shownState === "pending"
      ? "Escape cancels."
      : shownState === "error"
        ? "Press to try again."
        : shownValue === "published"
          ? "Press to unpublish."
          : shownValue === "scheduled"
            ? "Press to cancel the schedule."
            : "";
  const inkOn = face === "published" || rolling;
  const smearText =
    face === "pending"
      ? pendingLabel
      : face === "error"
        ? errorLabel
        : draftText;

  return (
    <span
      className={cn("relative inline-flex shrink-0 align-middle", className)}
      style={{ "--publish-press-ink": inkColor } as React.CSSProperties}
    >
      <motion.button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={name}
        aria-describedby={hint ? hintId : undefined}
        aria-busy={shownState === "pending" || undefined}
        onClick={press}
        onKeyDown={(event) => {
          if (event.key === "Escape" && shownState === "pending") {
            // Handled here, where focus is; the page must not also see it.
            event.preventDefault();
            cancel();
          }
        }}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse") return;
          hovered.current = true;
          hover(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          hovered.current = false;
          hover(false);
        }}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) hover(true);
        }}
        onBlur={() => {
          if (!hovered.current) hover(false);
        }}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center overflow-clip rounded-3 border bg-card font-medium whitespace-nowrap text-foreground transition-colors [contain:paint] outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          TEXT[size],
          face === "error"
            ? "border-[color-mix(in_oklab,var(--danger)_45%,transparent)]"
            : "border-hairline-strong",
          disabled
            ? "cursor-not-allowed opacity-50"
            : shownState === "pending"
              ? "cursor-progress"
              : "cursor-pointer hover:bg-surface-2",
        )}
        style={{ height: g.h, paddingInline: g.pad }}
      >
        <span ref={setCell} aria-hidden className="relative grid">
          {/* The widest of every face holds the width, so nothing beside the
            button moves whatever it prints. */}
          {[
            label,
            when ? scheduleLabel : "",
            pendingLabel,
            publishedLabel,
            errorLabel,
          ]
            .filter(Boolean)
            .map((text, i) => (
              <span key={i} className="invisible col-start-1 row-start-1">
                {text}
              </span>
            ))}
          {when || shownValue === "scheduled" ? (
            <span className="invisible col-start-1 row-start-1 flex justify-center">
              <span className="inline-flex border-[1.5px] px-1.5 py-px font-mono text-[10px] leading-4 tracking-[0.08em] uppercase">
                {date || publishedLabel}
              </span>
            </span>
          ) : null}

          {plainFaces.map((f) => (
            <motion.span
              key={f.key}
              className={cn(
                "col-start-1 row-start-1 text-center",
                f.key === "pending" && "text-ink-2",
                f.tone,
              )}
              initial={false}
              animate={{
                // Under a hovering stamp the label steps back.
                opacity:
                  face !== f.key
                    ? 0
                    : f.key === "draft" && shownState === "pending"
                      ? 0.45
                      : 1,
              }}
              transition={{
                duration: face === f.key ? durations.base : durations.fast,
                ease: face === f.key ? easings.enter : easings.exit,
                // The draft comes back once the strips have cleared it.
                delay: face === f.key && f.key === "draft" && strips ? 0.3 : 0,
              }}
            >
              <motion.span
                className="block"
                style={{
                  clipPath: oldClip,
                  scaleX: oldScaleX,
                  scaleY: oldScaleY,
                  opacity: oldOpacity,
                }}
              >
                {f.text}
              </motion.span>
            </motion.span>
          ))}

          {motionSafe && smear > 0 ? (
            <motion.span
              className="col-start-1 row-start-1 text-center text-ink-3"
              style={{
                clipPath: smearClip,
                opacity: smearOpacity,
                x: drag,
                skewX: -16 * smear,
              }}
            >
              {smearText}
            </motion.span>
          ) : null}

          <motion.span
            className="col-start-1 row-start-1"
            initial={false}
            animate={{ opacity: inkOn ? 1 : 0 }}
            transition={
              rolling || strips
                ? { duration: 0 }
                : { duration: durations.base, ease: easings.enter }
            }
            style={{ clipPath: inkClip }}
          >
            <Ink
              kind="published"
              text={publishedLabel}
              mask={mask}
              shadow={shadow}
            />
          </motion.span>

          <motion.span
            className="col-start-1 row-start-1 self-center"
            style={{ opacity: stampOn, scale: stampDisplayScale }}
          >
            <Ink
              kind="scheduled"
              text={date || publishedLabel}
              mask={mask}
              shadow={shadow}
            />
          </motion.span>

          {strips
            ? Array.from({ length: STRIPS }, (_, i) => (
                <motion.span
                  key={`${strips.key}-${i}`}
                  className="pointer-events-none col-start-1 row-start-1 self-center"
                  style={{
                    clipPath: `inset(${(i * 100) / STRIPS}% 0 ${100 - ((i + 1) * 100) / STRIPS}% 0)`,
                  }}
                  initial={{ y: 0, x: 0, rotate: 0, opacity: 1 }}
                  animate={{
                    y: -(10 + 4 * (i % 2)) * g.k,
                    x: (i % 2 ? 4 : -3) * g.k,
                    rotate: i % 2 ? 4 : -5,
                    opacity: 0,
                  }}
                  transition={{
                    duration: 0.28,
                    ease: easings.exit,
                    delay: i * cascade(STRIPS),
                  }}
                  onAnimationComplete={() => {
                    if (i === STRIPS - 1) setStrips(null);
                  }}
                >
                  <Ink
                    kind={strips.kind}
                    text={
                      strips.kind === "published"
                        ? publishedLabel
                        : date || publishedLabel
                    }
                    mask={mask}
                    shadow={shadow}
                  />
                </motion.span>
              ))
            : null}
        </span>

        <svg
          aria-hidden
          width="100%"
          height="100%"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <motion.g style={{ opacity: rollerOn }}>
            <motion.rect
              x={capX}
              y={capY}
              width={r2(radius * 1.2)}
              height={2}
              rx={1}
              style={{ fill: "var(--ink-2)" }}
            />
            <motion.rect
              x={capX}
              y={capBottomY}
              width={r2(radius * 1.2)}
              height={2}
              rx={1}
              style={{ fill: "var(--ink-2)" }}
            />
            <motion.rect
              x={rollerX}
              y={rollerY}
              width={r2(radius * 2)}
              height={rollerH}
              rx={r2(Math.min(radius, 3))}
              strokeWidth={1}
              style={{
                fill: "color-mix(in oklab, var(--publish-press-ink) 62%, var(--card))",
                stroke:
                  "color-mix(in oklab, var(--publish-press-ink) 80%, black)",
              }}
            />
            <motion.rect
              x={highlightX}
              y={rollerY}
              width={r2(radius * 0.5)}
              height={rollerH}
              style={{ fill: "white", opacity: 0.22 }}
            />
            <motion.path
              d={ribsFront}
              fill="none"
              strokeWidth={1}
              style={{
                stroke:
                  "color-mix(in oklab, var(--publish-press-ink) 70%, black)",
                opacity: 0.55,
              }}
            />
            <motion.path
              d={ribsSide}
              fill="none"
              strokeWidth={1}
              style={{
                stroke:
                  "color-mix(in oklab, var(--publish-press-ink) 70%, black)",
                opacity: 0.25,
              }}
            />
          </motion.g>
        </svg>
      </motion.button>
      {hint ? (
        <span id={hintId} className="sr-only">
          {hint}
        </span>
      ) : null}
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </span>
  );
}
