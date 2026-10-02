"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { Blocks } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PlugInState = "idle" | "pending" | "success" | "error";

export type PlugInSize = "sm" | "md" | "lg";

export type PlugInProps = {
  /** Controlled: whether the integration is connected. The press reports through `onConnectedChange` and waits for this. */
  connected?: boolean;
  /** Whether it starts connected when uncontrolled. @default false */
  defaultConnected?: boolean;
  /** Each change, once its action has succeeded. */
  onConnectedChange?: (connected: boolean) => void;
  /** Connects. Return a promise and the plug works at the socket until it settles; the signal aborts on Escape. */
  onConnect?: (signal: AbortSignal) => void | Promise<unknown>;
  /** Disconnects, the same way. */
  onDisconnect?: (signal: AbortSignal) => void | Promise<unknown>;
  /** Controlled action state. Every move goes through `onStateChange` and waits for this. */
  state?: PlugInState;
  /** Each action state, from the press, the answer or the timer that caused it. */
  onStateChange?: (state: PlugInState) => void;
  /** Spare cable, 0 to 1: a nearly taut line, or a deep loop that swings when the plug moves. @default 0.5 */
  slack?: number;
  /** The contact's burst, 0 to 1: how many sparks and how far they fly. 0 is a clean connection. @default 0.6 */
  spark?: number;
  /** How hard the plug works at the socket while it connects, 0 to 1. @default 0.5 */
  jiggle?: number;
  /** What is being connected: names the control for assistive technology. @default "Integration" */
  name?: string;
  /** The integration's mark, on the tile the cable comes from. 16px. @default a block glyph */
  icon?: React.ReactNode;
  /** @default "Connect" */
  label?: string;
  /** The text while connecting. @default "Connecting" */
  pendingLabel?: string;
  /** The text once connected. @default "Connected" */
  connectedLabel?: string;
  /** The text a connected button shows on hover or focus: what a press will do. @default "Disconnect" */
  disconnectLabel?: string;
  /** The text after a failure; a press tries again. @default "Retry" */
  errorLabel?: string;
  /** The live cable and the lamp. Any CSS colour. @default "var(--success)" */
  accent?: string;
  /** How long the contact glow holds before the button rests, in ms. @default 1400 */
  successHold?: number;
  /** How long a failure holds before the button rests, in ms. @default 2600 */
  errorHold?: number;
  /** 32, 40 or 48 px tall. @default "md" */
  size?: PlugInSize;
  /** Play the plug's clack as it seats and pulls out, and the spark's pop. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Geometry = {
  h: number;
  /** The tile the cable leaves from. */
  tile: number;
  /** The cable's run between the tile and the button. */
  run: number;
  body: number;
  thick: number;
  prong: number;
  /** The socket plate inside the button's left edge. */
  plate: number;
  pad: number;
  icon: number;
  text: string;
};

const GEOMETRY: Record<PlugInSize, Geometry> = {
  sm: {
    h: 32,
    tile: 24,
    run: 44,
    body: 10,
    thick: 8,
    prong: 4,
    plate: 5,
    pad: 10,
    icon: 14,
    text: "text-xs",
  },
  md: {
    h: 40,
    tile: 28,
    run: 56,
    body: 13,
    thick: 10,
    prong: 5,
    plate: 6,
    pad: 12,
    icon: 16,
    text: "text-sm",
  },
  lg: {
    h: 48,
    tile: 34,
    run: 66,
    body: 15,
    thick: 12,
    prong: 6,
    plate: 7,
    pad: 14,
    icon: 18,
    text: "text-base",
  },
};

/** Sounds answer a press, or a hand on the plug, only within its own beat. */
const BEAT_MS = 4000;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as { then?: unknown }).then === "function";

/** Seeded, so the server and the browser throw the same sparks. */
function sparks(count: number) {
  let seed = 0x5eed_c0de;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffff_ffff;
  };
  return Array.from({ length: count }, (_, i) => {
    // Out of the seam between plug and socket: alternately up and down, in
    // two fans, since the plug's own body fills the left.
    const up = i % 2 === 0;
    const spread = (Math.floor(i / 2) + 0.5) / Math.ceil(count / 2);
    const angle = (up ? -150 : 30) + spread * 120 + (next() - 0.5) * 16;
    return { angle, reach: 0.6 + 0.4 * next() };
  });
}

type Pt = readonly [number, number];

/** A point of the plug's own frame (x forward, y down), placed and turned. */
const place = (
  cx: number,
  cy: number,
  deg: number,
  x: number,
  y: number,
): Pt => {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [cx + x * c - y * s, cy + x * s + y * c];
};

const poly = (pts: Pt[]) =>
  `M ${pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(" L ")} Z`;

/** A box in the plug's frame, from x0 to x1 and y0 to y1, as a closed path. */
const box = (
  cx: number,
  cy: number,
  deg: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
) =>
  poly([
    place(cx, cy, deg, x0, y0),
    place(cx, cy, deg, x1, y0),
    place(cx, cy, deg, x1, y1),
    place(cx, cy, deg, x0, y1),
  ]);

type Pose = "rest" | "mouth" | "seat";

type Api = {
  succeed: (kind: "connect" | "disconnect") => void;
  requestState: (next: PlugInState) => void;
  move: (from: Pose, to: Pose, audible: boolean) => void;
  contact: (audible: boolean) => void;
};

/**
 * A connect button with a plug on a cable. Pressed, the plug lifts level and
 * slides to the socket in the button's edge while its cable, which has
 * weight, first dips and then straightens; while `onConnect` runs the plug
 * works at the socket mouth, jiggling. When it answers the plug seats on
 * the snap spring with a clack, a seeded burst of sparks flies from the
 * contact, the lamp lights and the label rolls to "Connected". Pressing a
 * connected button pulls the plug out and the cable recoils, swinging twice
 * on the recoil spring. The plug can also be pushed in, or pulled out, by
 * hand: it follows 1:1, rubber-bands at either end and commits by where the
 * throw would land.
 *
 * The cable's sag runs from deep at rest to nearly taut when seated, by
 * `slack`, and a spring carries the swing on top of it. Everything is
 * rebuilt per frame from motion values, rounded. The button is a native
 * button in a group named after the integration: Enter and Space press it,
 * Escape cancels a connection in flight. Under reduced motion the plug
 * swaps between its poses, the cable takes its sag at once, the contact is
 * a still flash that fades, and the lamp and label still tell the state.
 */
export function PlugIn({
  connected,
  defaultConnected = false,
  onConnectedChange,
  onConnect,
  onDisconnect,
  state,
  onStateChange,
  slack = 0.5,
  spark = 0.6,
  jiggle = 0.5,
  name = "Integration",
  icon,
  label = "Connect",
  pendingLabel = "Connecting",
  connectedLabel = "Connected",
  disconnectLabel = "Disconnect",
  errorLabel = "Retry",
  accent = "var(--success)",
  successHold = 1400,
  errorHold = 2600,
  size = "md",
  sound = false,
  disabled = false,
  className,
}: PlugInProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `plug-${uid}-hint`;
  const clipId = `plug-${uid}-clip`;
  const g = GEOMETRY[size] ?? GEOMETRY.md;
  const loose = clamp01(slack);
  const burstSize = clamp01(spark);
  const shake = clamp01(jiggle);

  const [ownConnected, setOwnConnected] = React.useState(defaultConnected);
  const isConnected = connected ?? ownConnected;
  const [ownState, setOwnState] = React.useState<PlugInState>("idle");
  const shownState = state ?? ownState;
  const [kind, setKind] = React.useState<"connect" | "disconnect">("connect");
  const [preview, setPreview] = React.useState(false);

  // One sentence per change, frozen from the values it changed to.
  const [seen, setSeen] = React.useState({ c: isConnected, s: shownState });
  const [said, setSaid] = React.useState("");
  if (seen.c !== isConnected || seen.s !== shownState) {
    const was = seen;
    setSeen({ c: isConnected, s: shownState });
    // A pointer still resting on the button has not asked to disconnect: the
    // preview waits for it to come back.
    if (was.c !== isConnected) setPreview(false);
    setSaid(
      was.c !== isConnected
        ? isConnected
          ? `${connectedLabel}.`
          : "Disconnected."
        : shownState === "pending"
          ? kind === "connect"
            ? `${pendingLabel}.`
            : "Disconnecting."
          : shownState === "error"
            ? `Couldn't ${kind}. Press ${errorLabel} to try again.`
            : was.s === "pending" && shownState === "idle"
              ? "Cancelled."
              : "",
    );
  }

  // Where things stand along the cable's run, in the root's own px.
  const cy = g.h / 2;
  const anchorX = g.tile - 1;
  const faceX = g.tile + g.run;
  const restX = g.tile + g.run * 0.62;
  const mouthX = faceX - g.prong - 1;
  const seatX = faceX;

  const pose: Pose =
    shownState === "pending"
      ? kind === "connect"
        ? "mouth"
        : "seat"
      : isConnected
        ? "seat"
        : "rest";
  const at = (p: Pose) =>
    p === "seat" ? seatX : p === "mouth" ? mouthX : restX;

  const plugX = useMotionValue(at(pose));
  const swing = useMotionValue(0);
  const jx = useMotionValue(0);
  const jr = useMotionValue(0);
  const burst = useMotionValue(0);
  const flash = useMotionValue(0);
  const holdClock = useMotionValue(0);

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const api = React.useRef<Api | null>(null);
  const prevPose = React.useRef(pose);
  const controller = React.useRef<AbortController | null>(null);
  const epoch = React.useRef(0);
  const beat = React.useRef(-Infinity);
  const dragFrom = React.useRef(0);
  const dragging = React.useRef(false);
  const hovered = React.useRef(false);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  const pan = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left, null) : 0;
  };

  const requestState = (next: PlugInState) => {
    if (state === undefined) setOwnState(next);
    onStateChange?.(next);
  };
  const requestConnected = (next: boolean) => {
    if (connected === undefined) setOwnConnected(next);
    onConnectedChange?.(next);
  };

  const succeed = (k: "connect" | "disconnect") => {
    requestConnected(k === "connect");
    requestState("success");
  };

  const act = (k: "connect" | "disconnect") => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    epoch.current += 1;
    const token = epoch.current;
    setKind(k);
    let result: unknown;
    try {
      result = (k === "connect" ? onConnect : onDisconnect)?.(ctrl.signal);
    } catch {
      requestState("error");
      return;
    }
    if (!isThenable(result)) {
      succeed(k);
      return;
    }
    requestState("pending");
    result.then(
      () => {
        if (epoch.current === token) api.current?.succeed(k);
      },
      () => {
        if (epoch.current === token) api.current?.requestState("error");
      },
    );
  };

  const press = () => {
    if (disabled || shownState === "pending") return;
    beat.current = performance.now();
    act(isConnected ? "disconnect" : "connect");
  };

  const cancel = () => {
    epoch.current += 1;
    controller.current?.abort();
    controller.current = null;
    requestState("idle");
  };

  /** The plug meets the socket: the clack, then the burst and its pop. */
  const contact = (sounding: boolean) => {
    if (sounding) {
      audio.play("clack", { pitch: 1, gain: 0.55, pan: pan() });
      if (burstSize > 0) {
        window.setTimeout(
          () =>
            audio.play("pop", {
              pitch: r2(1 + 0.35 * burstSize),
              gain: r2(0.3 + 0.3 * burstSize),
              pan: pan(),
            }),
          28,
        );
      }
    }
    if (burstSize <= 0) return;
    if (!motionSafe) {
      // A still flash that fades: the contact is information, not a show.
      burst.set(0.6);
      flash.set(1);
      run(
        "flash",
        animate(flash, 0, { duration: durations.slow, ease: easings.enter }),
      );
      return;
    }
    burst.jump(0);
    flash.jump(1);
    run("burst", animate(burst, 1, { duration: 0.32, ease: easings.enter }));
    run("flash", animate(flash, 0, { duration: 0.32, ease: easings.enter }));
  };

  /** The plug goes where the state says; the cable answers. */
  const move = (from: Pose, to: Pose, sounding: boolean) => {
    const target = at(to);
    halt("jx");
    if (!motionSafe) {
      halt("plugX");
      plugX.set(target);
      swing.set(0);
      if (to === "seat" && from !== "seat") contact(sounding);
      if (from === "seat" && to === "rest" && sounding) {
        audio.play("clack", { pitch: 0.75, gain: 0.45, pan: pan() });
      }
      return;
    }
    if (to === "seat" && from !== "seat") {
      // Seating is a landing: one crisp overshoot into the socket, and the
      // contact the moment the prongs are in.
      let met = false;
      run(
        "plugX",
        animate(plugX, target, {
          ...(from === "mouth" ? springs.snap : springs.glide),
          velocity: plugX.getVelocity(),
          onUpdate: (v) => {
            if (!met && v >= seatX - 0.6) {
              met = true;
              api.current?.contact(sounding);
            }
          },
        }),
      );
      return;
    }
    if (from === "seat" && to === "rest") {
      // Pulled out: the plug leaves on a tween (exits never spring), and the
      // cable it drags behind it recoils on two bounces.
      if (sounding)
        audio.play("clack", { pitch: 0.75, gain: 0.45, pan: pan() });
      run(
        "plugX",
        animate(plugX, target, {
          duration: durations.slow,
          ease: easings.move,
        }),
      );
      run(
        "swing",
        animate(swing, 0, {
          ...springs.recoil,
          velocity: -lerp(90, 220, loose),
        }),
      );
      return;
    }
    if (from === "rest" && to !== "rest") {
      // Picking the plug up takes the slack: the cable dips, then pulls straight.
      run(
        "swing",
        animate(swing, 0, {
          ...springs.snap,
          velocity: lerp(60, 160, loose),
        }),
      );
    }
    run(
      "plugX",
      animate(plugX, target, {
        ...springs.glide,
        velocity: plugX.getVelocity(),
      }),
    );
  };

  const lean = (on: boolean) => {
    if (!motionSafe || dragging.current || shownState === "pending") return;
    const base = at(pose);
    const to = on ? (pose === "rest" ? base + 4 : base - 1.5) : base;
    run("plugX", animate(plugX, to, springs.snap));
  };

  React.useEffect(() => {
    api.current = { succeed, requestState, move, contact };
  });

  React.useEffect(() => {
    const was = prevPose.current;
    if (was === pose) return;
    prevPose.current = pose;
    if (dragging.current) return;
    api.current?.move(was, pose, performance.now() - beat.current < BEAT_MS);
  }, [pose]);

  // A size change moves every pose; the plug goes straight to its own.
  React.useEffect(() => {
    plugX.set(
      prevPose.current === "seat"
        ? seatX
        : prevPose.current === "mouth"
          ? mouthX
          : restX,
    );
  }, [seatX, mouthX, restX, plugX]);

  // Working at the socket: a seeded, uneven jiggle, never on a hidden page.
  const working = shownState === "pending" && motionSafe && shake > 0;
  const outward = kind === "disconnect";
  React.useEffect(() => {
    if (!working) return;
    const amp = shake * 2.6;
    const tilt = shake * 7;
    const xs = outward
      ? [0, -1, -0.3, -0.9, -0.2, -0.7, 0]
      : [0, 1, -0.6, 0.8, -1, 0.4, 0];
    const rs = [0, -0.6, 1, -0.8, 0.5, -0.3, 0];
    const loops = [
      animate(
        jx,
        xs.map((v) => r2(v * amp)),
        { duration: 0.52, ease: "easeInOut", repeat: Infinity },
      ),
      animate(
        jr,
        rs.map((v) => r2(v * tilt)),
        { duration: 0.52, ease: "easeInOut", repeat: Infinity },
      ),
    ];
    const onVisibility = () => {
      for (const l of loops) {
        if (document.hidden) l.pause();
        else l.play();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      for (const l of loops) l.stop();
      animate(jx, 0, springs.flick);
      animate(jr, 0, springs.flick);
    };
  }, [working, outward, shake, jx, jr]);

  // The contact's glow holds, then rests; an error holds too. Both pause on
  // a hidden page.
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

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const controls of running.values()) controls.stop();
      running.clear();
      epoch.current += 1;
      controller.current?.abort();
    };
  }, []);

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled: disabled || shownState === "pending",
    onStart: () => {
      dragging.current = true;
      halt("plugX");
      dragFrom.current = plugX.get();
    },
    onMove: ({ offset }) => {
      // 1:1 under the hand, giving way past the rest and past the seat.
      plugX.set(r2(rubberClamp(dragFrom.current + offset.x, restX, seatX, 24)));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const landing = project(plugX.get(), velocity.x, 0.99);
      beat.current = performance.now();
      if (!isConnected && landing > (restX + seatX) / 2) {
        // Pushed in by hand: the press's own path takes it from where the
        // hand left it, with the hand's velocity.
        act("connect");
        return;
      }
      if (isConnected && landing < seatX - 8) {
        act("disconnect");
        return;
      }
      run(
        "plugX",
        animate(plugX, at(pose), {
          ...(motionSafe ? springs.snap : { duration: 0 }),
          velocity: velocity.x,
        }),
      );
    },
    onCancel: () => {
      dragging.current = false;
      run(
        "plugX",
        animate(plugX, at(pose), motionSafe ? springs.snap : { duration: 0 }),
      );
    },
    onTap: () => press(),
  });

  // ---- per-frame drawing ---------------------------------------------------

  const sagRest = lerp(8, 15, loose);
  const sagSeat = lerp(1.2, 6.5, loose);
  const restDY = g.h * 0.14;
  const fan = React.useMemo(
    () => sparks(Math.round(3 + 7 * burstSize)),
    [burstSize],
  );
  const scene = useTransform(
    [plugX, swing, jx, jr, burst] as MotionValue<number>[],
    ([px = 0, sw = 0, ox = 0, or = 0, b = 0]: number[]) => {
      const x = px + ox;
      // How far along its run the plug is: it levels and lifts as it goes.
      const p = clamp01((x - restX) / (seatX - restX));
      const deg = lerp(9, 0, Math.min(1, p * 1.6)) + or;
      const ccx = x - g.body / 2;
      const ccy = cy + restDY * (1 - Math.min(1, p * 1.6));
      const half = g.thick / 2;
      const body = box(ccx, ccy, deg, -g.body / 2, g.body / 2, -half, half);
      const prongs = [-0.26, 0.26]
        .map((k) =>
          box(
            ccx,
            ccy,
            deg,
            g.body / 2,
            g.body / 2 + g.prong,
            k * g.thick - 0.8,
            k * g.thick + 0.8,
          ),
        )
        .join(" ");
      const boot = box(
        ccx,
        ccy,
        deg,
        -g.body / 2 - 4,
        -g.body / 2,
        -half * 0.55,
        half * 0.55,
      );
      const [bx, by] = place(ccx, ccy, deg, -g.body / 2 - 4, 0);
      const sag = Math.max(
        -4,
        Math.min(g.h / 2 - 2.5, lerp(sagRest, sagSeat, Math.pow(p, 0.8)) + sw),
      );
      const dx = bx - anchorX;
      const lift = sag * 1.33;
      const cable = `M ${r2(anchorX)} ${r2(cy)} C ${r2(anchorX + dx / 3)} ${r2(cy + lift)} ${r2(anchorX + (2 * dx) / 3)} ${r2(by + lift)} ${r2(bx)} ${r2(by)}`;
      // The burst, from where the prongs meet the socket face.
      let rays = "";
      if (b > 0 && b < 1) {
        // Scaled to the button, so the longest ray stays inside its height.
        const len = (5 + 13 * burstSize) * (g.h / 40);
        rays = fan
          .map(({ angle, reach }) => {
            const a = (angle * Math.PI) / 180;
            const r1 = 1.5 + len * reach * b;
            const r0 = 1.5 + len * reach * b * 0.45;
            return `M ${r2(faceX + r0 * Math.cos(a))} ${r2(cy + r0 * Math.sin(a))} L ${r2(faceX + r1 * Math.cos(a))} ${r2(cy + r1 * Math.sin(a))}`;
          })
          .join(" ");
      }
      return { body, prongs, boot, cable, rays };
    },
  );
  const bodyD = useTransform(scene, (s) => s.body);
  const prongsD = useTransform(scene, (s) => s.prongs);
  const bootD = useTransform(scene, (s) => s.boot);
  const cableD = useTransform(scene, (s) => s.cable);
  const raysD = useTransform(scene, (s) => s.rays);
  const raysOpacity = useTransform(
    [burst, flash] as MotionValue<number>[],
    ([b = 0, f = 0]: number[]) => (motionSafe ? r2(1 - b) : r2(f)),
  );
  const flashR = useTransform(burst, (b) => r2(1.5 + 4.5 * b));

  const live = isConnected && shownState !== "pending";
  const face =
    shownState === "pending"
      ? kind === "connect"
        ? "pending"
        : "disconnect"
      : shownState === "error"
        ? "error"
        : isConnected
          ? preview
            ? "disconnect"
            : "connected"
          : "connect";
  const text =
    face === "pending"
      ? pendingLabel
      : face === "error"
        ? errorLabel
        : face === "connected"
          ? connectedLabel
          : face === "disconnect"
            ? disconnectLabel
            : label;
  const hint =
    isConnected && shownState !== "pending" ? "Press to disconnect." : "";
  const overlayW = faceX + g.plate + 16;

  return (
    <span
      role="group"
      aria-label={name}
      className={cn(
        "relative inline-flex shrink-0 items-center align-middle",
        className,
      )}
      style={
        {
          height: g.h,
          "--plug-live": accent,
          "--plug-spark": "oklch(from var(--warn) 0.8 c h)",
          "--plug-lamp": `oklch(from ${accent} 0.74 c h)`,
        } as React.CSSProperties
      }
    >
      <span
        aria-hidden
        className="relative z-0 flex shrink-0 items-center justify-center rounded-2 border border-hairline bg-surface-2 text-ink-2"
        style={{ width: g.tile, height: g.tile }}
      >
        {icon ?? <Blocks size={g.icon} strokeWidth={1.75} />}
      </span>

      {/* The cable's run, and the handle a hand can push the plug in by. */}
      <span
        aria-hidden
        {...drag}
        className={cn(
          "relative z-20 block shrink-0 touch-pan-y select-none",
          disabled || shownState === "pending"
            ? "cursor-default"
            : "cursor-grab active:cursor-grabbing",
        )}
        style={{ width: g.run, height: g.h }}
      />

      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
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
          setPreview(true);
          lean(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          hovered.current = false;
          setPreview(false);
          lean(false);
        }}
        onFocus={(event) => {
          if (!event.currentTarget.matches(":focus-visible")) return;
          setPreview(true);
          lean(true);
        }}
        onBlur={() => {
          if (hovered.current) return;
          setPreview(false);
          lean(false);
        }}
        className={cn(
          "relative z-10 inline-flex shrink-0 touch-manipulation items-center rounded-l-1 rounded-r-3 border font-medium whitespace-nowrap transition-[color,border-color,background-color,scale] duration-200 outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "active:scale-[0.98] motion-reduce:active:scale-100",
          g.text,
          live
            ? "border-[color-mix(in_oklab,var(--plug-live)_45%,transparent)] bg-[color-mix(in_oklab,var(--plug-live)_9%,var(--card))]"
            : "border-hairline-strong bg-card",
          face === "error"
            ? "text-danger"
            : face === "disconnect" && shownState !== "pending"
              ? "text-danger"
              : "text-foreground",
          disabled
            ? "cursor-not-allowed opacity-50"
            : shownState === "pending"
              ? "cursor-progress"
              : "cursor-pointer hover:bg-surface-2",
        )}
        style={{
          height: g.h,
          paddingLeft: g.plate + g.pad * 0.75,
          paddingRight: g.pad,
          gap: r2(g.pad * 0.6),
        }}
      >
        {/* The socket: a plate in the button's edge with two holes. */}
        <span
          aria-hidden
          className="absolute inset-y-[22%] left-0 flex flex-col items-center justify-center gap-[22%] rounded-r-1 border-y border-r border-hairline-strong bg-surface-2"
          style={{ width: g.plate }}
        >
          <span className="h-[1.5px] w-[60%] rounded-full bg-ink-3" />
          <span className="h-[1.5px] w-[60%] rounded-full bg-ink-3" />
        </span>
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full transition-[background-color,box-shadow] duration-300",
            live
              ? "bg-(--plug-lamp) shadow-[0_0_0_2px_color-mix(in_oklab,var(--plug-lamp)_25%,transparent)]"
              : "bg-ink-3/40",
          )}
        />
        <span className="relative grid overflow-clip [contain:paint]">
          {[
            label,
            pendingLabel,
            connectedLabel,
            disconnectLabel,
            errorLabel,
          ].map((t, i) => (
            <span
              key={i}
              aria-hidden
              className="invisible col-start-1 row-start-1"
            >
              {t}
            </span>
          ))}
          <AnimatePresence initial={false}>
            <motion.span
              key={face}
              className={cn(
                "col-start-1 row-start-1 text-left",
                face === "disconnect" &&
                  shownState === "pending" &&
                  "opacity-60",
              )}
              initial={
                motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }
              }
              animate={{
                opacity: 1,
                y: 0,
                transition: motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.base } }
                  : { duration: durations.base },
              }}
              exit={{
                opacity: 0,
                y: motionSafe ? -distances.step : 0,
                transition: exitFor(durations.base),
              }}
            >
              {text}
            </motion.span>
          </AnimatePresence>
        </span>
      </button>

      <svg
        aria-hidden
        width={overlayW}
        height={g.h}
        viewBox={`0 0 ${overlayW} ${g.h}`}
        className="pointer-events-none absolute top-0 left-0 z-30 block"
      >
        <defs>
          <clipPath id={clipId}>
            {/* The prongs vanish into the socket at the button's face. */}
            <rect x={0} y={0} width={faceX + 0.5} height={g.h} />
          </clipPath>
        </defs>
        <motion.path
          d={cableD}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          className={cn(
            "transition-[stroke] duration-500",
            live ? "stroke-(--plug-live)" : "stroke-ink-3",
          )}
        />
        <g clipPath={`url(#${clipId})`}>
          <motion.path d={prongsD} className="fill-ink-3" />
        </g>
        <motion.path d={bootD} className="fill-ink-3" />
        <motion.path d={bodyD} className="fill-ink-2" />
        {burstSize > 0 ? (
          <>
            <motion.circle
              cx={faceX}
              cy={cy}
              r={flashR}
              className="fill-(--plug-spark)"
              style={{ opacity: flash }}
            />
            <motion.path
              d={raysD}
              fill="none"
              strokeWidth={1.5}
              strokeLinecap="round"
              className="stroke-(--plug-spark)"
              style={{ opacity: raysOpacity }}
            />
          </>
        ) : null}
      </svg>

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
