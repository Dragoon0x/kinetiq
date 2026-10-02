"use client";

import * as React from "react";

import {
  Check,
  ChevronDown,
  Link2,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
  UserPlus,
  X,
} from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type InviteChips = "avatar" | "email" | "name";
export type InviteRoles = "chip" | "list" | "single";
export type InviteSend = "envelopes" | "batch" | "fade";
export type InviteStatus = "ready" | "loading" | "error";

export type InviteRole = {
  id: string;
  label: string;
  /** One line on what the role can do, shown in the picker. */
  description?: string;
};

export type Invitee = {
  /** As typed or pasted; checked, never rewritten. */
  email: string;
  /** A role id from `roleOptions`. */
  role: string;
};

export type InviteFlowProps = {
  /** Controlled list of addresses entered, valid or not. */
  value?: Invitee[];
  /** Initial list when uncontrolled. @default defaultInvitees */
  defaultValue?: Invitee[];
  /** Fires from the keystroke, paste, role pick or removal that changed the list. */
  onValueChange?: (invitees: Invitee[]) => void;
  /** Controlled note sent with the invites. */
  message?: string;
  /** Initial note when uncontrolled. @default "" */
  defaultMessage?: string;
  /** Fires as the note is typed. */
  onMessageChange?: (message: string) => void;
  /** The roles an invitee can have. @default defaultInviteRoles */
  roleOptions?: InviteRole[];
  /** The role a new address starts with. @default "member" */
  defaultRole?: string;
  /** Addresses already in the workspace: entered again, they are flagged. */
  members?: string[];
  /** Seats left. Addresses past it are flagged. Omit for no limit. */
  seats?: number;
  /** Sends the valid invites with the note. Return a promise to hold Send pending; a rejection's message is shown. */
  onSend?: (invites: Invitee[], message: string) => void | Promise<void>;
  /** "Invite more" was pressed on the summary. */
  onDone?: () => void;
  /** The shareable join link offered on the summary. @default "fieldline.app/join/fernworks" */
  inviteLink?: string;
  /** The link was copied. */
  onCopyLink?: (link: string) => void;
  /** How a chip shows its person: a tinted initial and the address, the address alone, or a name read from it. @default "avatar" */
  chips?: InviteChips;
  /** Where roles are picked: in each chip, in a list under the field, or once for everyone. @default "chip" */
  roles?: InviteRoles;
  /** How Send looks: chips fold into envelopes and fly out, gather into one, or tick and fade. @default "envelopes" */
  send?: InviteSend;
  /** The workspace's name, in the heading and the messages. @default "Fernworks" */
  workspace?: string;
  /** Who the note is from, shown under it. @default "Dana Kim" */
  sender?: string;
  /** The field's hint. @default "Add emails, or paste a list" */
  placeholder?: string;
  /** The longest note, in characters. @default 400 */
  maxLength?: number;
  /** Loading draws placeholder chips; error offers Retry. @default "ready" */
  status?: InviteStatus;
  /** The Retry button of the error state. */
  onRetry?: () => void;
  /** The region's accessible name. @default "Invite to <workspace>" */
  label?: string;
  /** Play the chip pops and the envelopes' swish. Off unless asked for. @default false */
  sound?: boolean;
  /** Shows the form but takes no input. */
  disabled?: boolean;
  className?: string;
};

export const defaultInviteRoles: InviteRole[] = [
  {
    id: "admin",
    label: "Admin",
    description: "Billing, members and every setting.",
  },
  { id: "member", label: "Member", description: "Plans and edits routes." },
  {
    id: "viewer",
    label: "Viewer",
    description: "Sees routes, changes nothing.",
  },
];

export const defaultInvitees: Invitee[] = [];

/* -------------------------------- helpers ------------------------------- */

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/;
const SEPARATOR = /[\s,;]/;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const RING_WITHIN =
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring";

const r2 = (v: number) => Math.round(v * 100) / 100;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const lower = (s: string) => s.trim().toLowerCase();

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const TINTS = [
  "--accent-bright",
  "--success",
  "--warn",
  "--signal",
  "--danger",
];
const tintOf = (email: string) =>
  TINTS[hash(lower(email)) % TINTS.length] ?? "--accent-bright";

/** "dana.kim@…" reads as "Dana Kim". */
const nameOf = (email: string) => {
  const local = email.split("@")[0] ?? email;
  const words = local.split(/[._+-]+/).filter(Boolean);
  if (words.length === 0) return email;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
};

/**
 * Entries from pasted or typed text. Commas, semicolons and line breaks
 * always separate; spaces separate only addresses ("a@x.io b@y.io"), so a
 * name beside an address is dropped and "priya at fernworks" stays one entry
 * to fix. "Name <address>" keeps the address.
 */
function tokensOf(text: string): string[] {
  const unwrapped = text.replace(
    /[^,;\n<]*<([^>]+)>/g,
    (_, inner: string) => `, ${inner}, `,
  );
  const out: string[] = [];
  for (const segment of unwrapped.split(/[,;\n]+/)) {
    const words = segment
      .trim()
      .split(/\s+/)
      .map((w) => w.replace(/^mailto:/i, ""))
      .filter(Boolean);
    if (words.length === 0) continue;
    const addresses = words.filter((w) => w.includes("@"));
    if (addresses.length > 0) out.push(...addresses);
    else out.push(words.join(" "));
  }
  return out;
}

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message
    ? error.message
    : typeof error === "string" && error
      ? error
      : fallback;

/** A timeout keyed by `key`, which waits while the page is hidden. */
function useHeldTimer(key: string | null, ms: number, onDone: () => void) {
  const done = React.useRef(onDone);
  React.useEffect(() => {
    done.current = onDone;
  });
  React.useEffect(() => {
    if (key === null) return;
    let left = Math.max(0, ms);
    let started = 0;
    let id = 0;
    const arm = () => {
      started = performance.now();
      id = window.setTimeout(() => done.current(), left);
    };
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(id);
        left = Math.max(0, left - (performance.now() - started));
      } else {
        arm();
      }
    };
    if (!document.hidden) arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key, ms]);
}

/** A box whose height glides to its content's measured height. */
function Measured({
  children,
  motionSafe,
}: {
  children: React.ReactNode;
  motionSafe: boolean;
}) {
  const height = useMotionValue(-1);
  const style = useTransform(height, (v) => (v < 0 ? "auto" : v));
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!node) return;
    let running: AnimationPlaybackControls | null = null;
    const ro = new ResizeObserver(() => {
      const next = node.offsetHeight;
      const now = height.get();
      if (now < 0 || !motionSafe) {
        running?.stop();
        height.jump(next);
        return;
      }
      if (Math.abs(now - next) < 0.5) return;
      running?.stop();
      running = animate(height, next, {
        ...springs.glide,
        velocity: height.getVelocity(),
      });
    });
    ro.observe(node);
    return () => {
      ro.disconnect();
      running?.stop();
      if (height.get() >= 0) height.jump(node.offsetHeight);
    };
  }, [node, motionSafe, height]);

  return (
    <motion.div
      style={{ height: style }}
      className="relative overflow-clip [overflow-clip-margin:6px]"
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

function Avatar({ email, className }: { email: string; className?: string }) {
  const tint = tintOf(email);
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
        className,
      )}
      style={{
        background: `color-mix(in oklab, var(${tint}) 18%, transparent)`,
        color: `var(${tint})`,
      }}
    >
      {(email.trim().charAt(0) || "?").toUpperCase()}
    </span>
  );
}

/* --------------------------------- chips -------------------------------- */

type ChipProps = {
  entry: Invitee;
  index: number;
  problem: string | null;
  look: InviteChips;
  roleLabel: string | null;
  tabbable: boolean;
  /** Added this session, so it pops in; one already there at mount sits still. */
  fresh: boolean;
  enterDelay: number;
  shake: number;
  pulse: number;
  hidden: boolean;
  /** Focused by a refused send: ringed even where the browser would not show focus. */
  ring: boolean;
  /** The quiet send: when this chip ticks, in seconds, or null. */
  tickDelay: number | null;
  busy: boolean;
  disabled: boolean;
  motionSafe: boolean;
  bind: (node: HTMLButtonElement | null) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onActivate: () => void;
  onRole: (anchor: HTMLElement) => void;
  onRemove: () => void;
  onFocus: () => void;
  onBlur: () => void;
};

function Chip({
  entry,
  index,
  problem,
  look,
  roleLabel,
  tabbable,
  fresh,
  enterDelay,
  shake,
  pulse,
  hidden,
  ring,
  tickDelay,
  busy,
  disabled,
  motionSafe,
  bind,
  onKeyDown,
  onActivate,
  onRole,
  onRemove,
  onFocus,
  onBlur,
}: ChipProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const opacity = useMotionValue(1);
  const bad = problem !== null;

  // Pops in on snap, a cascade step after the chip before it. Every move is
  // on motion values, so a StrictMode re-run starts it again from the top.
  React.useEffect(() => {
    if (!fresh || !motionSafe) return;
    scale.jump(0.8);
    opacity.jump(0);
    y.jump(distances.nudge);
    const runs = [
      animate(scale, 1, { ...springs.snap, delay: enterDelay }),
      animate(y, 0, { ...springs.snap, delay: enterDelay }),
      animate(opacity, 1, {
        duration: durations.fast,
        ease: easings.enter,
        delay: enterDelay,
      }),
    ];
    return () => {
      for (const r of runs) r.stop();
      scale.jump(1);
      opacity.jump(1);
      y.jump(0);
    };
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An invalid chip shakes once it has landed: a five-key tween, since a
  // spring takes exactly two keys.
  React.useEffect(() => {
    if (shake === 0 || !bad || !motionSafe) return;
    const c = animate(x, [0, -6, 6, -4, 4, 0], {
      duration: 0.36,
      ease: "easeInOut",
      delay: fresh ? enterDelay + 0.18 : 0,
    });
    return () => {
      c.stop();
      x.jump(0);
    };
    // Each new shake asks once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shake]);

  // A duplicate pulses the chip that was already there: out on flick, back on snap.
  React.useEffect(() => {
    if (pulse === 0 || !motionSafe) return;
    let back: AnimationPlaybackControls | null = null;
    const out = animate(scale, 1.08, {
      ...springs.flick,
      onComplete: () => {
        back = animate(scale, 1, springs.snap);
      },
    });
    return () => {
      out.stop();
      back?.stop();
      scale.jump(1);
    };
    // Each new pulse asks once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse]);

  // The quiet send: a check, then the chip fades, in turn.
  React.useEffect(() => {
    if (tickDelay === null) return;
    const c = animate(opacity, 0, {
      duration: durations.base,
      ease: easings.exit,
      delay: tickDelay + 0.32,
    });
    return () => c.stop();
  }, [tickDelay, opacity]);

  const name =
    look === "name"
      ? nameOf(entry.email)
      : look === "avatar"
        ? (entry.email.split("@")[0] ?? entry.email)
        : entry.email;
  const domain =
    look === "name" && entry.email.includes("@")
      ? `@${entry.email.split("@")[1] ?? ""}`
      : null;
  const spoken = bad
    ? `${entry.email}, ${problem}`
    : `${entry.email}${roleLabel ? `, ${roleLabel}` : ""}`;

  return (
    <motion.li
      className="max-w-full"
      style={{
        x,
        y,
        scale,
        opacity,
        visibility: hidden ? "hidden" : undefined,
      }}
    >
      <span
        title={bad ? `${entry.email}: ${problem}` : entry.email}
        className={cn(
          "flex h-7 max-w-full items-center rounded-full border text-[12px] transition-colors",
          bad
            ? "border-danger/60 bg-danger/8 text-danger"
            : "border-hairline-strong bg-surface-2 text-foreground",
        )}
      >
        <button
          ref={bind}
          type="button"
          data-chip={index}
          aria-label={spoken}
          aria-disabled={busy || undefined}
          tabIndex={tabbable ? 0 : -1}
          disabled={disabled}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          onClick={onActivate}
          className={cn(
            "flex h-full min-w-0 items-center gap-1.5 rounded-full pr-1.5 pl-1",
            FOCUS,
            ring && "outline-2 outline-offset-2 outline-ring outline-solid",
            !roleLabel && !bad && look !== "avatar" && "pl-2.5",
            bad && "pl-2",
          )}
        >
          {bad ? (
            <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          ) : tickDelay !== null ? (
            <motion.span
              aria-hidden
              className="grid size-5 shrink-0 place-items-center rounded-full bg-[oklch(from_var(--success)_0.82_c_h)] text-[oklch(from_var(--success)_0.32_c_h)]"
              initial={{ scale: motionSafe ? 0.4 : 1, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                scale: motionSafe
                  ? { ...springs.snap, delay: tickDelay }
                  : { duration: 0 },
                opacity: { duration: durations.fast, delay: tickDelay },
              }}
            >
              <Check className="size-3" />
            </motion.span>
          ) : look === "avatar" ? (
            <Avatar email={entry.email} />
          ) : null}
          <span aria-hidden className="min-w-0 truncate">
            {name}
            {domain ? <span className="text-ink-3">{domain}</span> : null}
          </span>
        </button>
        {roleLabel && !bad ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            disabled={disabled}
            onClick={(event) => onRole(event.currentTarget)}
            className="flex h-full shrink-0 items-center gap-0.5 border-l border-hairline pr-1 pl-2 text-[11px] text-ink-2 transition-colors hover:text-foreground"
          >
            {roleLabel}
            <ChevronDown className="size-3" />
          </button>
        ) : null}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          disabled={disabled}
          onClick={onRemove}
          className={cn(
            "mr-1 grid size-5 shrink-0 place-items-center rounded-full transition-colors",
            bad
              ? "hover:bg-danger/15"
              : "text-ink-3 hover:bg-hairline-strong hover:text-foreground",
          )}
        >
          <X className="size-3" />
        </button>
      </span>
    </motion.li>
  );
}

/* --------------------------------- menu --------------------------------- */

type Menu = {
  /** "all" for the shared picker, or the email the menu is for. */
  target: string;
  left: number;
  /** From the root's top edge when it opens downward… */
  top?: number;
  /** …or from its bottom edge when there is no room below. */
  bottom?: number;
  returnTo: HTMLElement | null;
};

function RoleMenu({
  menu,
  options,
  value,
  uid,
  motionSafe,
  onPick,
  onClose,
}: {
  menu: Menu;
  options: InviteRole[];
  value: string;
  uid: string;
  motionSafe: boolean;
  onPick: (role: string) => void;
  onClose: (refocus: boolean) => void;
}) {
  const [active, setActive] = React.useState(() =>
    Math.max(
      0,
      options.findIndex((o) => o.id === value),
    ),
  );
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    node?.focus({ preventScroll: true });
  }, [node]);

  React.useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (node && event.target instanceof Node && node.contains(event.target))
        return;
      onClose(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [node, onClose]);

  const optionId = (id: string) => `${uid}-role-${id}`;
  const current = options[active];

  return (
    <motion.div
      ref={setNode}
      role="listbox"
      tabIndex={-1}
      aria-label={
        menu.target === "all" ? "Role for everyone" : `Role for ${menu.target}`
      }
      aria-activedescendant={current ? optionId(current.id) : undefined}
      onKeyDown={(event) => {
        const n = options.length;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setActive((i) => (i + (event.key === "ArrowDown" ? 1 : -1) + n) % n);
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          setActive(event.key === "Home" ? 0 : n - 1);
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (current) onPick(current.id);
        } else if (event.key === "Escape") {
          // Handled here, where focus is; the page must not also see it.
          event.preventDefault();
          event.stopPropagation();
          onClose(true);
        } else if (event.key === "Tab") {
          event.preventDefault();
          onClose(true);
        }
      }}
      initial={
        motionSafe
          ? {
              opacity: 0,
              scale: 0.96,
              y: menu.bottom !== undefined ? distances.nudge : -distances.nudge,
            }
          : { opacity: 0 }
      }
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{
        opacity: { duration: durations.fast, ease: easings.enter },
        scale: motionSafe ? springs.snap : { duration: 0 },
        y: motionSafe ? springs.snap : { duration: 0 },
      }}
      style={{
        left: menu.left,
        top: menu.top,
        bottom: menu.bottom,
        // Whatever the estimate missed scrolls inside the menu, never past the root.
        maxHeight: `calc(100% - ${r2((menu.top ?? menu.bottom ?? 0) + 6)}px)`,
        originX: 0,
        originY: menu.bottom !== undefined ? 1 : 0,
      }}
      className="absolute z-40 flex w-56 flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-3 border border-hairline-strong bg-card p-1 shadow-[0_10px_28px_color-mix(in_oklab,black_18%,transparent)] outline-none @min-[64rem]:w-64"
    >
      {options.map((o, i) => {
        const on = o.id === value;
        return (
          <div
            key={o.id}
            id={optionId(o.id)}
            role="option"
            aria-selected={on}
            onPointerMove={() => setActive(i)}
            onClick={() => onPick(o.id)}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-2 px-2 py-1.5",
              i === active ? "bg-surface-2" : "",
            )}
          >
            <span className="mt-0.5 grid size-4 shrink-0 place-items-center text-cobalt-bright">
              {on ? <Check aria-hidden className="size-3.5" /> : null}
            </span>
            <span className="min-w-0">
              <span className="block text-[12px] leading-4 font-medium text-foreground">
                {o.label}
              </span>
              {o.description ? (
                <span className="block text-[11px] leading-4 text-ink-3">
                  {o.description}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </motion.div>
  );
}

/* ------------------------------- envelopes ------------------------------ */

type Flight = {
  key: string;
  email: string;
  text: string;
  index: number;
  count: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

type Target = { exitX: number; gatherX: number; gatherY: number };

/**
 * One chip becoming an envelope: it closes to an envelope's size on flick
 * where it sits, the flap folds down, and it leaves across the right edge —
 * x on the exit ease, y on the enter ease, so the path rises first and then
 * runs out. In a batch it glides to the Send button instead and is gone.
 */
function Envelope({
  flight,
  target,
  mode,
  delay,
  onDone,
}: {
  flight: Flight;
  target: Target;
  mode: "out" | "gather";
  delay: number;
  onDone: (key: string) => void;
}) {
  const x = useMotionValue(flight.x);
  const y = useMotionValue(flight.y);
  const w = useMotionValue(flight.w);
  const h = useMotionValue(flight.h);
  const radius = useMotionValue(flight.h / 2);
  const rotate = useMotionValue(0);
  const opacity = useMotionValue(1);
  const words = useMotionValue(1);
  const glyph = useMotionValue(0);
  const flap = useMotionValue(-1);

  React.useEffect(() => {
    const W = 30;
    const H = 22;
    const runs: AnimationPlaybackControls[] = [];
    const cx = flight.x + flight.w / 2 - W / 2;
    const cy = flight.y + flight.h / 2 - H / 2;
    runs.push(
      animate(w, W, { ...springs.flick, delay }),
      animate(h, H, { ...springs.flick, delay }),
      animate(x, cx, { ...springs.flick, delay }),
      animate(y, cy, { ...springs.flick, delay }),
      animate(radius, 4, { ...springs.flick, delay }),
      animate(words, 0, { duration: durations.blink, delay }),
      animate(glyph, 1, { duration: durations.fast, delay: delay + 0.04 }),
      animate(flap, 1, { ...springs.flick, delay: delay + 0.12 }),
    );
    const leave = delay + 0.22;
    if (mode === "out") {
      const rise = 26 + (flight.index % 3) * 10;
      runs.push(
        animate(x, target.exitX, {
          duration: 0.5,
          ease: easings.exit,
          delay: leave,
        }),
        animate(y, r2(cy - rise), {
          duration: 0.5,
          ease: easings.enter,
          delay: leave,
        }),
        animate(rotate, -10, {
          duration: 0.5,
          ease: easings.move,
          delay: leave,
        }),
        animate(opacity, 0, {
          duration: 0.18,
          ease: easings.exit,
          delay: leave + 0.34,
          onComplete: () => onDone(flight.key),
        }),
      );
    } else {
      runs.push(
        animate(x, target.gatherX - W / 2, { ...springs.glide, delay: leave }),
        animate(y, target.gatherY - H / 2, { ...springs.glide, delay: leave }),
        animate(opacity, 0, {
          duration: durations.fast,
          delay: leave + 0.3,
          onComplete: () => onDone(flight.key),
        }),
      );
    }
    return () => {
      for (const r of runs) r.stop();
    };
    // One flight per envelope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      aria-hidden
      className="absolute top-0 left-0 overflow-visible border border-hairline-strong bg-card shadow-[0_4px_12px_color-mix(in_oklab,black_16%,transparent)]"
      style={{
        x,
        y,
        width: w,
        height: h,
        borderRadius: radius,
        rotate,
        opacity,
      }}
    >
      <motion.span
        className="absolute inset-0 flex items-center px-2.5 text-[12px] whitespace-nowrap text-foreground"
        style={{ opacity: words }}
      >
        <span className="truncate">{flight.text}</span>
      </motion.span>
      <motion.svg
        viewBox="0 0 30 22"
        className="absolute inset-0 size-full overflow-visible fill-none stroke-cobalt-bright"
        strokeWidth={1.4}
        strokeLinejoin="round"
        style={{ opacity: glyph }}
      >
        <path
          d="M2.5 19.5 12 11.5M27.5 19.5 18 11.5"
          className="stroke-hairline-strong"
        />
        <motion.path
          d="M1.5 1.5 15 12.5 28.5 1.5"
          style={{ scaleY: flap, originX: 0.5, originY: 0 }}
        />
      </motion.svg>
    </motion.div>
  );
}

/** The batch's single envelope: lands where the chips gathered, then leaves. */
function BatchEnvelope({
  at,
  count,
  exitX,
  onDone,
}: {
  at: { x: number; y: number };
  count: number;
  exitX: number;
  onDone: () => void;
}) {
  const x = useMotionValue(at.x - 17);
  const y = useMotionValue(at.y - 12);
  const scale = useMotionValue(0.7);
  const rotate = useMotionValue(0);
  const opacity = useMotionValue(1);
  const flap = useMotionValue(-1);
  React.useEffect(() => {
    const runs = [
      animate(scale, 1, springs.recoil),
      animate(flap, 1, { ...springs.flick, delay: 0.12 }),
      animate(x, exitX, { duration: 0.5, ease: easings.exit, delay: 0.3 }),
      animate(y, r2(at.y - 12 - 40), {
        duration: 0.5,
        ease: easings.enter,
        delay: 0.3,
      }),
      animate(rotate, -10, { duration: 0.5, ease: easings.move, delay: 0.3 }),
      animate(opacity, 0, {
        duration: 0.18,
        ease: easings.exit,
        delay: 0.64,
        onComplete: onDone,
      }),
    ];
    return () => {
      for (const r of runs) r.stop();
    };
    // One flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <motion.div
      aria-hidden
      className="absolute top-0 left-0 h-6 w-[34px] overflow-visible rounded-1 border border-hairline-strong bg-card shadow-[0_4px_12px_color-mix(in_oklab,black_16%,transparent)]"
      style={{ x, y, scale, rotate, opacity }}
    >
      <svg
        viewBox="0 0 34 24"
        className="absolute inset-0 size-full overflow-visible fill-none stroke-cobalt-bright"
        strokeWidth={1.4}
        strokeLinejoin="round"
      >
        <motion.path
          d="M1.5 1.5 17 13.5 32.5 1.5"
          style={{ scaleY: flap, originX: 0.5, originY: 0 }}
        />
      </svg>
      <span className="absolute -top-2 -right-2 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 font-mono text-[9px] text-primary-foreground tabular-nums">
        {count}
      </span>
    </motion.div>
  );
}

function Count({ to, motionSafe }: { to: number; motionSafe: boolean }) {
  const v = useMotionValue(motionSafe ? 0 : to);
  const shown = useTransform(v, (n) => String(Math.max(0, Math.round(n))));
  React.useEffect(() => {
    if (!motionSafe) {
      v.jump(to);
      return;
    }
    const c = animate(v, to, { ...springs.snap, delay: 0.1 });
    return () => c.stop();
  }, [to, motionSafe, v]);
  return <motion.span className="tabular-nums">{shown}</motion.span>;
}

/* -------------------------------- the flow ------------------------------- */

type Phase = "idle" | "sending" | "flying" | "sent";

/**
 * An invite form for a workspace. Addresses become chips as you type a
 * separator, or several at once when you paste a list ("Name <address>"
 * included): each pops in on snap, a cascade step after the one before, and
 * one that is not an address, is already in the workspace or is past the
 * seats left shakes once it lands and stays tinted with the reason in its
 * name. Every invitee gets a role — in its chip, in a list under the field,
 * or once for everyone — and there is room for a note.
 *
 * Send folds each chip into an envelope where it sits on flick, closes the
 * flap and flies it out across the right edge, x on the exit ease and y on
 * the enter ease so the path rises before it runs; or gathers the chips on
 * the Send button into one envelope that leaves; or, quietly, ticks each one
 * and fades it. Then the summary: a count that rolls to the number sent on
 * snap, who was invited as what, and a join link to copy.
 *
 * The chips are a list with roving focus — arrows move, Delete removes,
 * Enter fixes an invalid chip or opens a role picker that is a real listbox —
 * and Ctrl or Cmd with Enter sends from anywhere. Under reduced motion
 * nothing pops, shakes or flies: chips appear, a problem is its tint and its
 * words, and Send cross-fades to the summary with each chip checked.
 */
export function InviteFlow({
  value,
  defaultValue = defaultInvitees,
  onValueChange,
  message,
  defaultMessage = "",
  onMessageChange,
  roleOptions = defaultInviteRoles,
  defaultRole = "member",
  members,
  seats,
  onSend,
  onDone,
  inviteLink = "fieldline.app/join/fernworks",
  onCopyLink,
  chips = "avatar",
  roles = "chip",
  send = "envelopes",
  workspace = "Fernworks",
  sender = "Dana Kim",
  placeholder = "Add emails, or paste a list",
  maxLength = 400,
  status = "ready",
  onRetry,
  label,
  sound = false,
  disabled = false,
  className,
}: InviteFlowProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const noteId = `${uid}-note`;
  const limit = Math.max(1, Math.round(maxLength));

  const [own, setOwn] = React.useState<Invitee[]>(defaultValue);
  const list = value ?? own;
  const [ownNote, setOwnNote] = React.useState(defaultMessage);
  const note = message ?? ownNote;
  const [text, setText] = React.useState("");
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [failure, setFailure] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState<Invitee[]>([]);
  const [fresh, setFresh] = React.useState<
    Record<string, { i: number; n: number }>
  >({});
  const [shakes, setShakes] = React.useState<Record<string, number>>({});
  const [pulses, setPulses] = React.useState<Record<string, number>>({});
  const [focusAt, setFocusAt] = React.useState(-1);
  const [ringed, setRinged] = React.useState<string | null>(null);
  const [menu, setMenu] = React.useState<Menu | null>(null);
  const [flights, setFlights] = React.useState<Flight[]>([]);
  const [target, setTarget] = React.useState<Target>({
    exitX: 0,
    gatherX: 0,
    gatherY: 0,
  });
  const [batch, setBatch] = React.useState<{
    x: number;
    y: number;
    n: number;
  } | null>(null);
  const [ticking, setTicking] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const sendRef = React.useRef<HTMLButtonElement | null>(null);
  const chipNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const timers = React.useRef<number[]>([]);
  const left = React.useRef(0);
  const flightSeq = React.useRef(0);
  const menuRef = React.useRef<Menu | null>(null);
  const alive = React.useRef(true);

  const roleLabel = (id: string) =>
    roleOptions.find((r) => r.id === id)?.label ?? roleOptions[0]?.label ?? id;
  const sharedRole = list[0]?.role ?? defaultRole;
  const memberSet = new Set((members ?? []).map(lower));

  // What is wrong with each entry, if anything. Seats are counted over the
  // valid entries in order, so the ones past the limit are the late ones.
  const problemsOf = (entries: Invitee[]) => {
    const out: (string | null)[] = [];
    let valid = 0;
    for (const entry of entries) {
      const e = lower(entry.email);
      let p: string | null = null;
      if (!EMAIL.test(e)) p = "not an email address";
      else if (memberSet.has(e)) p = `already in ${workspace}`;
      else if (seats !== undefined && valid >= seats) p = "no seats left";
      else valid += 1;
      out.push(p);
    }
    return out;
  };
  const problems = problemsOf(list);
  const validCount = problems.filter((p) => p === null).length;
  const badCount = list.length - validCount;
  const busy = phase !== "idle";

  const say = (t: string) => setSaid((s) => ({ n: s.n + 1, text: t }));
  const panOf = (el: Element | null | undefined) => {
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(() => alive.current && fn(), ms));
  };

  const commit = (next: Invitee[]) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  /* ------------------------------- adding ------------------------------- */

  const add = (tokens: string[]) => {
    if (disabled || busy || tokens.length === 0) return;
    const next = [...list];
    const seen = new Set(next.map((e) => lower(e.email)));
    const added: string[] = [];
    const repeats: string[] = [];
    const role = roles === "single" ? sharedRole : defaultRole;
    for (const t of tokens) {
      const key = lower(t);
      if (seen.has(key)) {
        repeats.push(key);
        continue;
      }
      seen.add(key);
      next.push({ email: t, role });
      added.push(t);
    }
    if (repeats.length) {
      setPulses((p) => {
        const out = { ...p };
        for (const key of repeats) {
          const hit = list.find((e) => lower(e.email) === key);
          if (hit) out[hit.email] = (out[hit.email] ?? 0) + 1;
        }
        return out;
      });
    }
    if (added.length === 0) {
      say(
        repeats.length === 1
          ? `${repeats[0]} is already on the list.`
          : `${plural(repeats.length, "address", "addresses")} already on the list.`,
      );
      return;
    }
    commit(next);
    setFresh((f) => {
      const out = { ...f };
      added.forEach((email, i) => {
        out[email] = { i, n: added.length };
      });
      return out;
    });
    // Problems of the new list, to shake and to say.
    const isNew = new Set(added);
    const found = problemsOf(next);
    const nextProblems = next.flatMap((entry, i) => {
      const problem = found[i];
      return problem && isNew.has(entry.email)
        ? [{ email: entry.email, problem }]
        : [];
    });
    if (nextProblems.length) {
      setShakes((s) => {
        const out = { ...s };
        for (const { email } of nextProblems)
          out[email] = (out[email] ?? 0) + 1;
        return out;
      });
    }
    const first = nextProblems[0];
    say(
      `${added.length} added${nextProblems.length ? `, ${nextProblems.length} ${nextProblems.length === 1 ? "needs" : "need"} fixing${first ? `: ${first.email}, ${first.problem}` : ""}` : ""}.`,
    );
    const step = Math.round(cascade(added.length) * 1000);
    added.forEach((_, i) => {
      later(
        () =>
          audio.play("pop", {
            pitch: r2(semitones(Math.min(10, next.length - added.length + i))),
            gain: 0.42,
            pan: panOf(inputRef.current),
          }),
        i * step,
      );
    });
  };

  const commitText = (raw = text) => {
    const tokens = tokensOf(raw);
    setText("");
    add(tokens);
  };

  const remove = (index: number, focusAfter: boolean) => {
    if (disabled || busy) return;
    const entry = list[index];
    if (!entry) return;
    const next = list.filter((_, i) => i !== index);
    commit(next);
    say(`${entry.email} removed.`);
    if (!focusAfter) return;
    const neighbour = next[Math.min(index, next.length - 1)];
    if (neighbour) {
      setFocusAt(Math.min(index, next.length - 1));
      // Focus moves once the list has re-rendered without it.
      later(() => chipNodes.current.get(neighbour.email)?.focus(), 0);
    } else {
      inputRef.current?.focus();
    }
  };

  const edit = (index: number) => {
    const entry = list[index];
    if (!entry || busy || disabled) return;
    commit(list.filter((_, i) => i !== index));
    setText(entry.email);
    inputRef.current?.focus();
    say(`Editing ${entry.email}.`);
  };

  const setRole = (target: string, role: string) => {
    const next =
      target === "all"
        ? list.map((e) => ({ ...e, role }))
        : list.map((e) => (e.email === target ? { ...e, role } : e));
    commit(next);
    audio.play("pop", { pitch: 0.9, gain: 0.3, pan: panOf(rootRef.current) });
    say(
      target === "all"
        ? `Everyone joins as ${roleLabel(role)}.`
        : `${target} is now ${roleLabel(role)}.`,
    );
  };

  /* ------------------------------- the menu ------------------------------ */

  const openMenu = (
    targetEmail: string,
    anchor: HTMLElement,
    returnTo: HTMLElement | null,
  ) => {
    const root = rootRef.current;
    if (!root || disabled || busy) return;
    const box = root.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    const width = root.clientWidth >= 1024 ? 256 : 224;
    // Below the anchor if it fits, above if that fits, otherwise as low as
    // the box allows: the menu never leaves the root, which clips.
    const tall =
      8 + roleOptions.reduce((h, o) => h + (o.description ? 52 : 30), 0);
    const below = box.bottom - a.bottom - 4;
    const above = a.top - box.top - 4;
    const left = r2(
      Math.max(6, Math.min(a.left - box.left, root.clientWidth - width - 6)),
    );
    setMenu(
      below >= tall
        ? {
            target: targetEmail,
            left,
            top: r2(a.bottom - box.top + 4),
            returnTo,
          }
        : above >= tall
          ? {
              target: targetEmail,
              left,
              bottom: r2(box.bottom - a.top + 4),
              returnTo,
            }
          : {
              target: targetEmail,
              left,
              top: r2(Math.max(6, root.clientHeight - tall - 6)),
              returnTo,
            },
    );
  };

  const closeMenu = React.useCallback((refocus: boolean) => {
    const m = menuRef.current;
    if (m && refocus) m.returnTo?.focus({ preventScroll: true });
    setMenu(null);
  }, []);

  /* -------------------------------- sending ------------------------------- */

  const refuse = (why: string) => {
    setFailure(why);
    say(why);
    const bad = list.filter((_, i) => problems[i] !== null);
    if (bad.length) {
      setShakes((s) => {
        const out = { ...s };
        for (const e of bad) out[e.email] = (out[e.email] ?? 0) + 1;
        return out;
      });
      const first = bad[0];
      if (first) {
        setRinged(first.email);
        chipNodes.current.get(first.email)?.focus();
      }
    } else {
      inputRef.current?.focus();
    }
  };

  const go = async () => {
    if (disabled || busy) return;
    // Text still in the box is an address too: it joins the list first, and
    // is checked with the rest.
    let current = list;
    if (text.trim()) {
      const seen = new Set(list.map((e) => lower(e.email)));
      const extra = tokensOf(text).filter((t) => !seen.has(lower(t)));
      if (extra.length) {
        add(extra);
        current = [
          ...list,
          ...extra.map((email) => ({
            email,
            role: roles === "single" ? sharedRole : defaultRole,
          })),
        ];
      }
      setText("");
    }
    const found = problemsOf(current);
    const bad = found.filter((p) => p !== null).length;
    if (current.length === 0) {
      refuse("Add at least one email address.");
      return;
    }
    if (bad > 0) {
      refuse(
        `Fix or remove ${plural(bad, "address", "addresses")} before sending.`,
      );
      return;
    }
    const invites = current;
    setFailure(null);
    setMenu(null);
    setPhase("sending");
    say(`Sending ${plural(invites.length, "invite")}.`);
    try {
      await onSend?.(invites, note.trim());
      if (!alive.current) return;
      launch(invites);
    } catch (error) {
      if (!alive.current) return;
      setPhase("idle");
      setFailure(messageOf(error, "The invites didn't send. Try again."));
    }
  };

  /** The chips leave the field, by whichever way `send` says. */
  const launch = (invites: Invitee[]) => {
    setSent(invites);
    const root = rootRef.current;
    if (!root) {
      finish(invites);
      return;
    }
    // The quiet way is also the reduced-motion way: a check, then a fade.
    if (send === "fade" || !motionSafe) {
      setPhase("flying");
      flightSeq.current += 1;
      setTicking(`t${flightSeq.current}`);
      return;
    }
    const box = root.getBoundingClientRect();
    const list2: Flight[] = [];
    invites.forEach((e, i) => {
      const node = chipNodes.current.get(e.email)?.closest("li");
      const r = node?.getBoundingClientRect();
      if (!r) return;
      list2.push({
        key: `${e.email}-${i}`,
        email: e.email,
        text: chips === "name" ? nameOf(e.email) : e.email,
        index: i,
        count: invites.length,
        x: r2(r.left - box.left),
        y: r2(r.top - box.top),
        w: r2(r.width),
        h: r2(r.height),
      });
    });
    const b = sendRef.current?.getBoundingClientRect();
    setTarget({
      exitX: r2(root.clientWidth + 24),
      gatherX: b
        ? r2(b.left - box.left + b.width / 2)
        : r2(root.clientWidth - 40),
      gatherY: b
        ? r2(b.top - box.top + b.height / 2)
        : r2(root.clientHeight - 24),
    });
    left.current = list2.length;
    setFlights(list2);
    const stagger = cascade(list2.length);
    if (send === "envelopes") {
      list2.forEach((f) =>
        later(
          () =>
            audio.play("swish", {
              pitch: r2(0.9 + 0.08 * f.index),
              gain: 0.32,
              pan: 0.5,
            }),
          Math.round((f.index * stagger + 0.22) * 1000),
        ),
      );
    }
    setPhase("flying");
    if (list2.length === 0) finish(invites);
  };

  const finish = (invites: Invitee[]) => {
    setFlights([]);
    setBatch(null);
    setTicking(null);
    setPhase("sent");
    commit([]);
    if (message === undefined) setOwnNote("");
    onMessageChange?.("");
    say(`${plural(invites.length, "invite")} sent.`);
  };

  const onEnvelopeDone = (key: string) => {
    left.current -= 1;
    setFlights((f) => f.filter((x) => x.key !== key));
    if (left.current > 0) return;
    if (send === "batch") {
      setBatch({ x: target.gatherX, y: target.gatherY, n: sent.length });
      audio.play("swish", {
        pitch: 1.1,
        gain: 0.4,
        pan: panOf(sendRef.current),
      });
      return;
    }
    finish(sent);
  };

  useHeldTimer(
    ticking,
    Math.round(
      (cascade(sent.length) * Math.max(0, sent.length - 1) + 0.62) * 1000,
    ),
    () => finish(sent),
  );

  const again = () => {
    setPhase("idle");
    setSent([]);
    setFresh({});
    setShakes({});
    setPulses({});
    setFailure(null);
    onDone?.();
    later(() => inputRef.current?.focus(), 0);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard?.writeText(
        `https://${inviteLink.replace(/^https?:\/\//, "")}`,
      );
    } catch {
      // Copying can be refused; the link is still on screen to select.
    }
    if (!alive.current) return;
    setCopied((c) => c + 1);
    onCopyLink?.(inviteLink);
    say("Link copied.");
    audio.play("pop", { pitch: 1.3, gain: 0.35, pan: panOf(rootRef.current) });
  };
  useHeldTimer(copied > 0 ? String(copied) : null, 1400, () => setCopied(0));

  /* -------------------------------- effects ------------------------------- */

  React.useEffect(() => {
    menuRef.current = menu;
  });

  React.useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      for (const t of pending) window.clearTimeout(t);
    };
  }, []);

  // A scrolled field would leave the role picker hanging: it closes.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || !menu) return;
    const onScroll = () => closeMenu(false);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [menu, closeMenu]);

  /* ---------------------------------- keys -------------------------------- */

  const onChipKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    const n = list.length;
    const focusChip = (j: number) => {
      const e = list[j];
      if (!e) return;
      setFocusAt(j);
      chipNodes.current.get(e.email)?.focus();
    };
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        focusChip(Math.max(0, i - 1));
        return;
      case "ArrowRight":
        event.preventDefault();
        if (i >= n - 1) inputRef.current?.focus();
        else focusChip(i + 1);
        return;
      case "Home":
        event.preventDefault();
        focusChip(0);
        return;
      case "End":
        event.preventDefault();
        focusChip(n - 1);
        return;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        remove(i, true);
        return;
      case "ArrowDown":
        if (!event.altKey) return;
        event.preventDefault();
        if (roles === "chip" && problems[i] === null) {
          const e = list[i];
          if (e) openMenu(e.email, event.currentTarget, event.currentTarget);
        }
        return;
    }
  };

  const onInputKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const el = event.currentTarget;
    if (event.key === "Enter" && !(event.metaKey || event.ctrlKey)) {
      if (!text.trim()) return;
      event.preventDefault();
      commitText();
      return;
    }
    if (event.key === "Tab" && text.trim() && !event.shiftKey) {
      event.preventDefault();
      commitText();
      return;
    }
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    if (
      (event.key === "Backspace" && !text) ||
      (event.key === "ArrowLeft" && atStart)
    ) {
      const last = list[list.length - 1];
      if (!last) return;
      event.preventDefault();
      setFocusAt(list.length - 1);
      chipNodes.current.get(last.email)?.focus();
    }
  };

  /* ---------------------------------- view -------------------------------- */

  const tabbable =
    focusAt >= 0 && focusAt < list.length ? focusAt : list.length - 1;
  const flying = new Set(flights.map((f) => f.email));
  // Flying chips are carried by their envelopes; ticking ones stay put.
  const gone = phase === "flying" && ticking === null;
  const tickStep = cascade(sent.length);
  const counts = new Map<string, number>();
  for (const e of sent) counts.set(e.role, (counts.get(e.role) ?? 0) + 1);
  const breakdown = [...counts.entries()]
    .map(([role, n]) => {
      const name = roleLabel(role).toLowerCase();
      return `${n} ${n === 1 ? name : `${name}s`}`;
    })
    .join(", ");

  const field = (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={`${uid}-input`}
          className="text-[12px] font-medium text-ink-2"
        >
          To
        </label>
        {roles === "single" ? (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={(event) =>
              openMenu("all", event.currentTarget, event.currentTarget)
            }
            aria-haspopup="listbox"
            aria-expanded={menu?.target === "all"}
            className={cn(
              "-mr-1 inline-flex h-6 items-center gap-1 rounded-2 px-1.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            Everyone joins as
            <span className="font-medium text-foreground">
              {roleLabel(sharedRole)}
            </span>
            <ChevronDown aria-hidden className="size-3.5" />
          </button>
        ) : null}
      </div>
      <div
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            inputRef.current?.focus();
          }
        }}
        className={cn(
          "flex cursor-text flex-wrap items-center gap-1.5 rounded-2 border bg-background p-1.5 transition-colors",
          RING_WITHIN,
          failure && badCount > 0
            ? "border-danger/60"
            : "border-input hover:border-hairline-strong",
        )}
      >
        {list.length > 0 ? (
          <ul role="list" aria-label="Invitees" className="contents">
            {list.map((entry, i) => (
              <Chip
                key={entry.email}
                entry={entry}
                index={i}
                problem={problems[i] ?? null}
                look={chips}
                roleLabel={roles === "chip" ? roleLabel(entry.role) : null}
                tabbable={i === tabbable}
                fresh={fresh[entry.email] !== undefined}
                enterDelay={r2(
                  (fresh[entry.email]?.i ?? 0) *
                    cascade(fresh[entry.email]?.n ?? 1),
                )}
                shake={shakes[entry.email] ?? 0}
                pulse={pulses[entry.email] ?? 0}
                hidden={
                  gone &&
                  (flying.has(entry.email) ||
                    sent.some((s) => s.email === entry.email))
                }
                tickDelay={
                  ticking && problems[i] === null
                    ? r2(
                        Math.max(
                          0,
                          sent.findIndex((s) => s.email === entry.email),
                        ) * tickStep,
                      )
                    : null
                }
                busy={busy}
                disabled={disabled}
                motionSafe={motionSafe}
                bind={(node) => {
                  if (node) chipNodes.current.set(entry.email, node);
                  else chipNodes.current.delete(entry.email);
                }}
                onKeyDown={(event) => onChipKey(event, i)}
                ring={ringed === entry.email}
                onFocus={() => setFocusAt(i)}
                onBlur={() => setRinged((r) => (r === entry.email ? null : r))}
                onActivate={() => {
                  if (problems[i] !== null) edit(i);
                  else if (roles === "chip") {
                    const node = chipNodes.current.get(entry.email);
                    if (node) openMenu(entry.email, node, node);
                  }
                }}
                onRole={(anchor) =>
                  openMenu(
                    entry.email,
                    anchor,
                    chipNodes.current.get(entry.email) ?? null,
                  )
                }
                onRemove={() => remove(i, false)}
              />
            ))}
          </ul>
        ) : null}
        <input
          ref={inputRef}
          id={`${uid}-input`}
          type="text"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          value={text}
          readOnly={busy}
          disabled={disabled}
          placeholder={list.length ? "Add more" : placeholder}
          aria-describedby={hintId}
          onChange={(event) => {
            const v = event.currentTarget.value;
            const hard = Math.max(
              v.lastIndexOf(","),
              v.lastIndexOf(";"),
              v.lastIndexOf("\n"),
            );
            const space = v.lastIndexOf(" ");
            // A space ends an entry only when what came before it is an address.
            const soft =
              space > hard && v.slice(hard + 1, space).includes("@")
                ? space
                : -1;
            if (hard >= 0 || soft >= 0) {
              const cut = Math.max(hard, soft);
              const done = v.slice(0, cut);
              const rest = v.slice(cut + 1);
              setText(rest);
              add(tokensOf(done));
              return;
            }
            setText(v);
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text");
            if (!SEPARATOR.test(pasted.trim()) && !pasted.includes("<")) return;
            event.preventDefault();
            const tokens = tokensOf(`${text} ${pasted}`);
            setText("");
            add(tokens);
          }}
          onKeyDown={onInputKey}
          onBlur={() => {
            if (text.trim() && !busy) commitText();
          }}
          className="h-7 min-w-32 flex-1 bg-transparent px-1.5 text-[13px] text-foreground outline-none placeholder:text-ink-3"
        />
      </div>
      {/* Wide, the heading's pill carries the seats; the hint is still read. */}
      <p
        id={hintId}
        className="text-[11px] leading-4 text-ink-3 @min-[40rem]:sr-only"
      >
        {seats !== undefined
          ? `${plural(Math.max(0, seats - validCount), "seat")} left · `
          : ""}
        Separate with commas or spaces.
      </p>
      {roles === "list" && list.some((_, i) => problems[i] === null) ? (
        <ul role="list" aria-label="Roles" className="flex flex-col gap-1">
          {list.map((entry, i) =>
            problems[i] === null ? (
              <RoleRow
                key={entry.email}
                entry={entry}
                options={roleOptions}
                uid={uid}
                look={chips}
                motionSafe={motionSafe}
                disabled={disabled || busy}
                onPick={(role) => setRole(entry.email, role)}
              />
            ) : null,
          )}
        </ul>
      ) : null}
    </div>
  );

  const compose = (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={noteId} className="text-[12px] font-medium text-ink-2">
        Note <span className="font-normal text-ink-3">· optional</span>
      </label>
      <textarea
        id={noteId}
        rows={3}
        maxLength={limit}
        value={note}
        readOnly={busy}
        disabled={disabled}
        placeholder={`Join us in ${workspace} to plan this week's routes.`}
        onChange={(event) => {
          const v = event.currentTarget.value.slice(0, limit);
          if (message === undefined) setOwnNote(v);
          onMessageChange?.(v);
        }}
        className={cn(
          "block w-full resize-none rounded-2 border border-input bg-background px-3 py-2 text-[13px] leading-5 text-foreground placeholder:text-ink-3 hover:border-hairline-strong",
          FOCUS,
        )}
      />
      <p className="flex items-center justify-between gap-2 text-[11px] leading-4 text-ink-3">
        <span className="truncate">From {sender}</span>
        <span className="shrink-0 font-mono tabular-nums">
          {limit - note.length}
        </span>
      </p>
      <AnimatePresence initial={false}>
        {failure ? (
          <motion.p
            key="failure"
            role="alert"
            className="flex items-start gap-1.5 text-[12px] leading-4 text-danger"
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.base, ease: easings.enter }}
          >
            <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
            {failure}
          </motion.p>
        ) : null}
      </AnimatePresence>
      <div className="mt-auto flex items-center justify-end gap-2 pt-1">
        <span className="mr-auto hidden font-mono text-[10px] text-ink-3 @min-[40rem]:inline">
          Ctrl ↵ to send
        </span>
        <button
          ref={sendRef}
          type="button"
          disabled={disabled}
          aria-disabled={busy || undefined}
          onClick={() => void go()}
          className={cn(
            "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-2 bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 @min-[40rem]:w-auto",
            FOCUS,
            busy && "cursor-progress",
          )}
        >
          <span className="grid">
            {["Send invites", "Sending…"].map((t) => {
              const on = (t === "Sending…") === (phase === "sending");
              return (
                <span
                  key={t}
                  aria-hidden={!on || undefined}
                  className={cn(
                    "col-start-1 row-start-1 flex items-center justify-center gap-1.5 whitespace-nowrap",
                    on ? "visible" : "invisible",
                  )}
                >
                  {t === "Sending…" ? (
                    <LoaderCircle
                      aria-hidden
                      className={cn("size-3.5", motionSafe && "animate-spin")}
                    />
                  ) : null}
                  {t}
                </span>
              );
            })}
          </span>
          <span className="rounded-full bg-primary-foreground/20 px-1.5 font-mono text-[10px] leading-4 tabular-nums">
            {validCount}
          </span>
        </button>
      </div>
    </div>
  );

  const summary = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <motion.span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[oklch(from_var(--success)_0.82_c_h)] text-[oklch(from_var(--success)_0.32_c_h)]"
          initial={motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={
            motionSafe
              ? { scale: springs.recoil, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          <Check className="size-4" />
        </motion.span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-foreground">
            <Count to={sent.length} motionSafe={motionSafe} />{" "}
            {sent.length === 1 ? "invite" : "invites"} sent
          </p>
          <p className="truncate text-[12px] text-ink-3">
            To {workspace}
            {breakdown ? ` · ${breakdown}` : ""}
          </p>
        </div>
      </div>
      <ul role="list" aria-label="Invited" className="flex flex-wrap gap-1.5">
        {sent.map((e, i) => (
          <motion.li
            key={e.email}
            initial={
              motionSafe ? { opacity: 0, y: distances.nudge } : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            transition={{
              opacity: {
                duration: durations.base,
                delay: 0.12 + i * cascade(sent.length),
              },
              y: motionSafe
                ? { ...springs.snap, delay: 0.12 + i * cascade(sent.length) }
                : { duration: 0 },
            }}
            className="flex h-7 max-w-full items-center gap-1.5 rounded-full border border-hairline bg-surface-2 pr-2.5 pl-1 text-[12px]"
          >
            <Avatar email={e.email} />
            <span className="min-w-0 truncate text-foreground">{e.email}</span>
            <span className="shrink-0 text-ink-3">{roleLabel(e.role)}</span>
          </motion.li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={again}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90",
            FOCUS,
          )}
        >
          <UserPlus aria-hidden className="size-3.5" />
          Invite more
        </button>
        <button
          type="button"
          onClick={() => void copyLink()}
          className={cn(
            "inline-flex h-8 min-w-0 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          {copied ? (
            <Check aria-hidden className="size-3.5 shrink-0 text-success" />
          ) : (
            <Link2 aria-hidden className="size-3.5 shrink-0" />
          )}
          <span className="grid min-w-0">
            {[inviteLink, "Link copied"].map((t) => (
              <span
                key={t}
                aria-hidden={(t === "Link copied") !== copied > 0 || undefined}
                className={cn(
                  "col-start-1 row-start-1 truncate font-mono text-[11px]",
                  (t === "Link copied") === copied > 0
                    ? "visible"
                    : "invisible",
                )}
              >
                {t}
              </span>
            ))}
          </span>
        </button>
      </div>
    </div>
  );

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div
        aria-hidden
        className="flex flex-wrap gap-1.5 rounded-2 border border-input p-1.5"
      >
        {[96, 128, 80].map((w) => (
          <span
            key={w}
            className={cn(
              "h-7 rounded-full bg-ink-3/12",
              motionSafe && "animate-pulse",
            )}
            style={{ width: w }}
          />
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex items-center gap-3 rounded-3 border border-hairline bg-surface-2 px-3 py-3">
        <TriangleAlert aria-hidden className="size-4 shrink-0 text-danger" />
        <p className="min-w-0 flex-1 text-[13px] text-foreground">
          Your team didn&apos;t load.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
            FOCUS,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Retry
        </button>
      </div>
    );
  } else {
    body = (
      <Measured motionSafe={motionSafe}>
        <AnimatePresence initial={false} mode="popLayout">
          {phase === "sent" ? (
            <motion.div
              key="sent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              {summary}
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
              className="grid gap-3 @min-[40rem]:grid-cols-[minmax(0,1fr)_16rem] @min-[40rem]:gap-4 @min-[64rem]:grid-cols-[minmax(0,1fr)_20rem]"
            >
              {field}
              {compose}
            </motion.div>
          )}
        </AnimatePresence>
      </Measured>
    );
  }

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      aria-busy={busy && phase !== "sent" ? true : undefined}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void go();
        }
      }}
      className={cn(
        "@container relative isolate flex w-full flex-col overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        ref={scrollRef}
        className="flex flex-1 [scrollbar-width:thin] flex-col gap-3 overflow-x-hidden overflow-y-auto overscroll-contain p-3 @min-[40rem]:px-4 @min-[40rem]:py-3.5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id={titleId}
            className="truncate text-[14px] font-semibold text-foreground"
          >
            Invite to {workspace}
          </h2>
          {seats !== undefined && phase !== "sent" ? (
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] tabular-nums",
                validCount > seats
                  ? "bg-danger/10 text-danger"
                  : "bg-surface-2 text-ink-2",
              )}
            >
              {Math.min(validCount, seats)} of {seats} seats
            </span>
          ) : null}
        </div>
        {body}
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-clip"
      >
        {flights.map((f) => (
          <Envelope
            key={f.key}
            flight={f}
            target={target}
            mode={send === "batch" ? "gather" : "out"}
            delay={r2(f.index * cascade(f.count))}
            onDone={onEnvelopeDone}
          />
        ))}
        {batch ? (
          <BatchEnvelope
            at={batch}
            count={batch.n}
            exitX={target.exitX}
            onDone={() => finish(sent)}
          />
        ) : null}
      </div>

      <AnimatePresence>
        {menu ? (
          <RoleMenu
            key={menu.target}
            menu={menu}
            options={roleOptions}
            value={
              menu.target === "all"
                ? sharedRole
                : (list.find((e) => e.email === menu.target)?.role ??
                  defaultRole)
            }
            uid={uid}
            motionSafe={motionSafe}
            onPick={(role) => {
              setRole(menu.target, role);
              closeMenu(true);
            }}
            onClose={closeMenu}
          />
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/** One invitee in the list layout: who, and a segmented role control. */
function RoleRow({
  entry,
  options,
  uid,
  look,
  motionSafe,
  disabled,
  onPick,
}: {
  entry: Invitee;
  options: InviteRole[];
  uid: string;
  look: InviteChips;
  motionSafe: boolean;
  disabled: boolean;
  onPick: (role: string) => void;
}) {
  const at = Math.max(
    0,
    options.findIndex((o) => o.id === entry.role),
  );
  const name = `${uid}-row-${hash(entry.email)}`;
  return (
    <li className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">
      {look === "avatar" ? <Avatar email={entry.email} /> : null}
      <span
        className="min-w-24 flex-1 basis-24 truncate text-[12px] text-foreground"
        title={entry.email}
      >
        {look === "name" ? nameOf(entry.email) : entry.email}
      </span>
      <div
        role="radiogroup"
        aria-label={`Role for ${entry.email}`}
        className="relative grid h-7 shrink-0 rounded-2 border border-input bg-background p-0.5"
        // Even, fixed segments: a bold choice never widens its row.
        style={{
          gridTemplateColumns: `repeat(${options.length}, 4rem)`,
        }}
      >
        <motion.span
          aria-hidden
          className="absolute top-0.5 bottom-0.5 left-0.5 rounded-1 bg-cobalt-wash"
          style={{
            width: `calc((100% - 4px) / ${Math.max(1, options.length)})`,
          }}
          initial={false}
          animate={{ x: `${at * 100}%` }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        />
        {options.map((o) => {
          const on = o.id === entry.role;
          return (
            <label
              key={o.id}
              title={o.description}
              className={cn(
                "relative flex cursor-pointer items-center justify-center rounded-1 px-2 text-[11px] transition-colors",
                RING_WITHIN,
                on
                  ? "font-medium text-cobalt-bright"
                  : "text-ink-2 hover:text-foreground",
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.id}
                checked={on}
                disabled={disabled}
                onChange={() => onPick(o.id)}
                className="sr-only"
              />
              <span className="truncate">{o.label}</span>
            </label>
          );
        })}
      </div>
    </li>
  );
}
