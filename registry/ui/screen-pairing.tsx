"use client";

import * as React from "react";

import { motion } from "motion/react";
import { LogOut, RotateCw, ShieldCheck, TriangleAlert, Tv } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ScreenPairingAccount = {
  /** Who approved the screen, as it should be greeted. */
  name: string;
  /** One line under the greeting: the booking, the team, the address. */
  detail?: string;
};

export type ScreenPairingTileStyle = "flap" | "keycap" | "outline" | "solid";
export type ScreenPairingStatus = "ready" | "loading" | "error";

export type ScreenPairingProps = {
  /** The code your server issued for this screen. Omit it and the screen shows a seeded placeholder of `codeLength` characters, so it reads finished before it is wired. */
  code?: string;
  /** Length of placeholder codes and of the loading outlines, 4 to 10. Tiles group in fours, threes or fives and wrap on narrow screens. @default 8 */
  codeLength?: number;
  /** How each character is drawn: a split-flap tile, a raised keycap, an accent outline or a solid accent tile. @default "flap" */
  tileStyle?: ScreenPairingTileStyle;
  /** The expiry bar, the waiting dots, the link's underline, outline and solid tiles and the avatar; any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Seconds a code lives, counted from when it appears on screen. @default 300 */
  expiresIn?: number;
  /** Asked every `pollInterval` while the code is live. Resolve an account to sign the screen in, or null to keep waiting. Each call steps the waiting dots. */
  poll?: () =>
    ScreenPairingAccount | null | Promise<ScreenPairingAccount | null>;
  /** Milliseconds between polls. @default 3000 */
  pollInterval?: number;
  /** Controlled sign-in: an account shows the welcome, null shows the code. Leave it undefined and `poll` decides. */
  approved?: ScreenPairingAccount | null;
  /** Fires once, from the poll that approved the screen, with the account. */
  onApproved?: (account: ScreenPairingAccount) => void;
  /** The visitor asked for a new code (New code, Get a new code, Try again). Placeholder codes roll by themselves; a controlled `code` waits for yours. */
  onRefresh?: () => void;
  /** Fires once when the code runs out. */
  onExpire?: () => void;
  /** "Not you? Sign out" was pressed on the welcome; the screen goes back to a fresh code. */
  onSignOut?: () => void;
  /** Whether a code is ready: loading draws tile outlines, error offers Try again. @default "ready" */
  status?: ScreenPairingStatus;
  /** The screen's name, in the header and the greeting. @default "Harbour Room" */
  room?: string;
  /** Where people enter the code. @default "coldbrook.app/pair" */
  url?: string;
  /** The room clock in the header, ms since the epoch (shown in UTC). @default defaultScreenPairingNow */
  now?: number;
  /** Seeds the placeholder codes. @default 7 */
  seed?: number;
  /** Pauses polling and the countdown and dims the screen. */
  disabled?: boolean;
  /** Classes for the outer panel. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

/** 14:02 on 16 October 2026, a Friday afternoon in Harbour Room. */
export const defaultScreenPairingNow = Date.UTC(2026, 9, 16, 14, 2);

/** Ines, booked in for the design review. */
export const defaultScreenPairingAccount: ScreenPairingAccount = {
  name: "Ines Park",
  detail: "Design review · until 15:00",
};

/** No 0/O or 1/I: a code read across a room must not be misread. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededCode(seed: number, round: number, length: number): string {
  const rand = mulberry32(((seed * 7919) ^ (round * 104729)) >>> 0);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(rand() * ALPHABET.length)] ?? "K";
  }
  return out;
}

/** Fours, threes or fives: a code is read aloud in groups, never as a run of ten. */
function groupsOf(n: number): number[] {
  if (n <= 5) return [n];
  if (n === 7) return [4, 3];
  if (n === 9) return [3, 3, 3];
  if (n % 2 === 0 && n / 2 <= 5) return [n / 2, n / 2];
  const out: number[] = [];
  for (let left = n; left > 0; left -= 4) out.push(Math.min(4, left));
  return out;
}

/** UTC by hand: a locale lookup in render would not survive hydration. */
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")}`;
};

const countdown = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const DOTS = 5;

/** Page visibility as a store: read on the client, "visible" on the server. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageVisible = () => !document.hidden;
const serverVisible = () => true;

/* ----------------------------------------------------------------------- */
/*                                   Tile                                   */
/* ----------------------------------------------------------------------- */

const TILE_BOX =
  "relative flex h-12 w-9 items-center justify-center rounded-2 font-mono text-[1.625rem] leading-none font-semibold select-none @min-[24rem]:h-13 @min-[24rem]:w-10 @min-[24rem]:text-[1.75rem] @min-[40rem]:h-17 @min-[40rem]:w-13 @min-[40rem]:text-[2.25rem]";

function TileFace({
  char,
  tileStyle,
  accent,
}: {
  char: string;
  tileStyle: ScreenPairingTileStyle;
  accent: string;
}) {
  if (tileStyle === "keycap") {
    return (
      <span
        className={cn(
          TILE_BOX,
          "border border-hairline-strong bg-card text-foreground shadow-[0_2px_0_var(--hairline-strong)]",
        )}
      >
        <span className="-translate-y-px">{char}</span>
      </span>
    );
  }
  if (tileStyle === "outline") {
    return (
      <span
        className={cn(TILE_BOX, "border-2")}
        style={{
          borderColor: `color-mix(in oklab, ${accent} 55%, transparent)`,
          color: accent,
        }}
      >
        {char}
      </span>
    );
  }
  if (tileStyle === "solid") {
    return (
      <span
        className={cn(TILE_BOX, "text-primary-foreground")}
        style={{ backgroundColor: `oklch(from ${accent} 0.58 c h)` }}
      >
        {char}
      </span>
    );
  }
  // Split-flap: two leaves with a hinge between them, the top a shade lighter.
  return (
    <span
      className={cn(TILE_BOX, "overflow-clip bg-surface-2 text-foreground")}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1/2 bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)]"
      />
      <span className="relative">{char}</span>
      <span
        aria-hidden
        className="absolute inset-x-0 top-1/2 h-px -translate-y-px bg-hairline-strong"
      />
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Screen                                  */
/* ----------------------------------------------------------------------- */

type Phase = "live" | "expired" | "welcome";

/**
 * A device-code sign-in for a shared screen. The code stands on the screen in
 * wide tiles, grouped so it can be read across a room; a bar under it drains
 * as one linear tween over the code's life and five waiting dots step along on
 * snap each time the screen asks whether anyone has approved it, so the dots
 * walk only when it is really checking.
 *
 * A new code stands up tile by tile on snap, each hinged at its foot. When a
 * poll comes back with an account, the dots light in a run on flick and the
 * tiles drop away one by one — each tips over its bottom edge and falls 16px
 * on the exit ease, because a falling thing accelerates and exits never
 * spring — while a clip sweeps the welcome open behind them in step; the
 * avatar lands on recoil and the greeting settles on glide.
 *
 * The countdown, the bar and polling stop while the screen is off view or the
 * page is hidden and resume from the real elapsed time, so the expiry stays
 * true. An expired code says so and offers a new one. Every action is a real
 * button; the code is spoken one character at a time, and the state changes
 * are announced once each. Under reduced motion tiles and welcome cross-fade
 * and the dots change colour without growing; the bar still drains.
 */
export function ScreenPairing({
  code,
  codeLength = 8,
  tileStyle = "flap",
  accent = "var(--accent-bright)",
  expiresIn = 300,
  poll,
  pollInterval = 3000,
  approved,
  onApproved,
  onRefresh,
  onExpire,
  onSignOut,
  status = "ready",
  room = "Harbour Room",
  url = "coldbrook.app/pair",
  now = defaultScreenPairingNow,
  seed = 7,
  disabled = false,
  className,
}: ScreenPairingProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const length = Math.min(10, Math.max(4, Math.round(codeLength)));
  const lifetime = Math.max(0, expiresIn);

  /* -------------------------------- code -------------------------------- */

  const [round, setRound] = React.useState(0);
  const chars = (
    code !== undefined
      ? code.toUpperCase().replace(/[^A-Z0-9]/g, "")
      : seededCode(seed, round, length)
  ).split("");
  const codeText = chars.join("");
  const codeKey =
    code !== undefined ? `c:${codeText}` : `s:${seed}:${round}:${length}`;
  const groups = groupsOf(Math.max(1, chars.length));

  /* ------------------------------- states ------------------------------- */

  const [own, setOwn] = React.useState<ScreenPairingAccount | null>(null);
  const account = approved !== undefined ? approved : own;
  const [expiredKey, setExpiredKey] = React.useState<string | null>(null);
  const ready = status === "ready";
  const phase: Phase = account
    ? "welcome"
    : expiredKey === codeKey
      ? "expired"
      : "live";
  const [left, setLeft] = React.useState(lifetime);
  const [polls, setPolls] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // The first code is painted by the server as it stands; only later codes
  // stand up tile by tile.
  const [firstKey] = React.useState(codeKey);
  const [seenKey, setSeenKey] = React.useState(codeKey);
  if (seenKey !== codeKey) {
    setSeenKey(codeKey);
    setLeft(lifetime);
    setPolls(0);
    if (ready) say("New code ready.");
  }
  /** The account our own poll brought in, already announced by the poll. */
  const [pollWon, setPollWon] = React.useState<string | null>(null);
  const [seenAccount, setSeenAccount] = React.useState(account);
  if (seenAccount !== account) {
    setSeenAccount(account);
    // A host-driven sign-in is announced from the render that shows it.
    if (account && approved !== undefined && pollWon !== account.name) {
      say(`Signed in. Welcome, ${account.name}.`);
    }
  }

  /* ------------------------------ activity ------------------------------ */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [rootNode, setRootNode] = React.useState<HTMLDivElement | null>(null);
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setRootNode(node);
  }, []);
  const [inView, setInView] = React.useState(true);
  React.useEffect(() => {
    if (!rootNode || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setInView(entry.isIntersecting);
    });
    io.observe(rootNode);
    return () => io.disconnect();
  }, [rootNode]);
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    pageVisible,
    serverVisible,
  );
  const running = phase === "live" && ready && !disabled;
  const active = running && inView && visible;

  // Callbacks read at the moment a timer fires, so an inline function from
  // the host never restarts the clock.
  const latest = React.useRef({ poll, onApproved, onExpire, approved });
  React.useEffect(() => {
    latest.current = { poll, onApproved, onExpire, approved };
  });

  /** The moment this code appeared, in the page's own clock. */
  const issued = React.useRef<{ key: string; at: number } | null>(null);
  React.useEffect(() => {
    if (issued.current?.key === codeKey) return;
    issued.current = { key: codeKey, at: performance.now() };
  }, [codeKey]);

  /* ----------------------------- focus carry ----------------------------- */

  const focusInside = React.useRef(false);
  const carry = React.useRef(false);
  /** Remembers whether focus is inside, before a change that may take its control away. */
  const holdFocus = React.useCallback(() => {
    const el = document.activeElement;
    carry.current =
      !!el && el !== rootRef.current && !!rootRef.current?.contains(el);
  }, []);
  const primary = React.useRef<Partial<Record<Phase, HTMLButtonElement>>>({});
  React.useEffect(() => {
    const lost =
      focusInside.current &&
      (document.activeElement === document.body ||
        document.activeElement === null);
    if (!carry.current && !lost) return;
    carry.current = false;
    primary.current[phase]?.focus({ preventScroll: true });
  }, [phase]);

  /* ------------------------------ countdown ------------------------------ */

  // The bar drains on the compositor: one CSS transition over the time left,
  // so a five-minute code costs no script per frame. Off view it freezes
  // where the clock says it is, and picks up from there.
  const barRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const set = (fraction: number, seconds: number) => {
      el.style.transition =
        seconds > 0
          ? `transform ${seconds}s linear, background-color 500ms linear`
          : "background-color 500ms linear";
      el.style.transform = `scaleX(${Number(fraction.toFixed(4))})`;
    };
    const timeLeft = () => {
      const at = issued.current?.key === codeKey ? issued.current.at : null;
      const elapsed = at === null ? 0 : (performance.now() - at) / 1000;
      return Math.max(0, lifetime - elapsed);
    };
    if (phase === "expired") {
      set(0, 0);
      return;
    }
    if (phase === "welcome") return;
    const remaining = timeLeft();
    set(lifetime > 0 ? remaining / lifetime : 0, 0);
    if (!active || remaining <= 0) return;
    // Commit the starting width before the transition takes it to zero.
    void el.offsetWidth;
    set(0, Math.round(remaining * 100) / 100);
    return () => set(lifetime > 0 ? timeLeft() / lifetime : 0, 0);
  }, [active, phase, codeKey, lifetime]);

  React.useEffect(() => {
    if (!active) return;
    let warned = false;
    const tick = () => {
      const at = issued.current?.key === codeKey ? issued.current.at : null;
      if (at === null) return;
      const remaining = Math.max(0, lifetime - (performance.now() - at) / 1000);
      setLeft(Math.ceil(remaining));
      if (remaining <= 0) {
        window.clearInterval(id);
        holdFocus();
        setExpiredKey(codeKey);
        setSaid((s) => ({ n: s.n + 1, text: "Code expired." }));
        latest.current.onExpire?.();
        return;
      }
      if (!warned && lifetime > 90 && remaining <= 60) {
        warned = true;
        setSaid((s) => ({ n: s.n + 1, text: "Code expires in 1 minute." }));
      }
    };
    // First reading on the next frame, then once a second.
    const first = window.setTimeout(tick, 16);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [active, codeKey, lifetime, holdFocus]);

  /* -------------------------------- polling ------------------------------ */

  const hasPoll = poll !== undefined;
  React.useEffect(() => {
    if (!active || !hasPoll) return;
    let cancelled = false;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(
        async () => {
          if (cancelled) return;
          setPolls((p) => p + 1);
          let result: ScreenPairingAccount | null = null;
          try {
            result = (await latest.current.poll?.()) ?? null;
          } catch {
            result = null;
          }
          if (cancelled) return;
          if (!result) {
            schedule();
            return;
          }
          holdFocus();
          setPollWon(result.name);
          if (latest.current.approved === undefined) setOwn(result);
          setSaid((s) => ({
            n: s.n + 1,
            text: `Signed in. Welcome, ${result.name}.`,
          }));
          latest.current.onApproved?.(result);
        },
        Math.max(250, pollInterval),
      );
    };
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, hasPoll, pollInterval, codeKey, holdFocus]);

  /* -------------------------------- actions ------------------------------ */

  const refresh = () => {
    if (disabled) return;
    holdFocus();
    if (code === undefined) setRound((r) => r + 1);
    setExpiredKey(null);
    onRefresh?.();
  };

  const signOut = () => {
    if (disabled) return;
    holdFocus();
    setOwn(null);
    setPollWon(null);
    setExpiredKey(null);
    if (code === undefined) setRound((r) => r + 1);
    say("Signed out. A new code is ready.");
    onSignOut?.();
  };

  /* ------------------------------- render -------------------------------- */

  const welcome = phase === "welcome";
  const n = chars.length;
  const step = cascade(n);
  const dropStart = motionSafe ? 0.18 : 0;
  const dropTime = 0.34;
  const sweep = (n - 1) * step + dropTime;
  const landAt = dropStart + sweep * 0.82;
  const urgent = phase === "live" && left <= Math.min(60, lifetime * 0.25);
  const lit = polls % DOTS;
  const starts = groups.map((_, g) =>
    groups.slice(0, g).reduce((a, b) => a + b, 0),
  );
  const spoken = groups
    .map((size, g) => {
      const from = starts[g] ?? 0;
      return chars.slice(from, from + size).join(" ");
    })
    .join(", ");
  const fresh = codeKey !== firstKey;

  const tiles = groups.map((size, g) => {
    const base = starts[g] ?? 0;
    const slice = chars.slice(base, base + size);
    return (
      <span key={g} className="flex gap-1.5 @min-[40rem]:gap-2">
        {slice.map((char, j) => {
          const i = base + j;
          return (
            <motion.span
              key={`${codeKey}-${i}`}
              className="block"
              style={{ transformOrigin: "50% 100%" }}
              initial={
                fresh
                  ? motionSafe
                    ? { rotateX: 80, opacity: 0, y: 0 }
                    : { opacity: 0 }
                  : false
              }
              animate={
                welcome
                  ? motionSafe
                    ? { rotateX: -72, y: distances.shift, opacity: 0 }
                    : { opacity: 0 }
                  : { rotateX: 0, y: 0, opacity: 1 }
              }
              transition={
                welcome
                  ? {
                      duration: motionSafe ? dropTime : durations.base,
                      ease: easings.exit,
                      delay: motionSafe ? dropStart + i * step : 0,
                    }
                  : motionSafe
                    ? {
                        rotateX: { ...springs.snap, delay: i * step },
                        y: { ...springs.snap, delay: i * step },
                        opacity: {
                          duration: durations.fast,
                          ease: easings.enter,
                          delay: i * step,
                        },
                      }
                    : { duration: durations.base, ease: easings.enter }
              }
            >
              <TileFace char={char} tileStyle={tileStyle} accent={accent} />
            </motion.span>
          );
        })}
      </span>
    );
  });

  const outlines = groupsOf(length).map((size, g) => (
    <span key={g} className="flex gap-1.5 @min-[40rem]:gap-2">
      {Array.from({ length: size }, (_, j) => (
        <span
          key={j}
          className={cn(
            TILE_BOX,
            "border border-dashed border-hairline-strong motion-safe:animate-pulse",
          )}
        />
      ))}
    </span>
  ));

  const stage =
    status === "loading" ? (
      <div
        aria-busy="true"
        className="flex flex-wrap justify-center gap-x-4 gap-y-3 @min-[40rem]:gap-x-6"
      >
        <span className="sr-only">Getting a code.</span>
        {outlines}
      </div>
    ) : status === "error" ? (
      <div className="flex flex-col items-center gap-2 py-3 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">Could not get a code.</p>
        <p className="text-[12px] text-ink-3">
          The screen is online, but the sign-in service did not answer.
        </p>
      </div>
    ) : (
      <div className="grid w-full place-items-center">
        <div
          role="group"
          aria-label={`Code ${spoken}`}
          aria-hidden={welcome || undefined}
          className="relative z-[1] flex flex-wrap justify-center gap-x-4 gap-y-3 [grid-area:1/1] @min-[40rem]:gap-x-6"
          style={{ perspective: 640 }}
        >
          {tiles}
          {phase === "expired" ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute -inset-1 rounded-3 bg-card/60"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, var(--hairline-strong) 0 1px, transparent 1px 7px)",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: durations.slow, ease: easings.enter }}
            />
          ) : null}
        </div>

        <motion.div
          aria-hidden={!welcome || undefined}
          className="flex max-w-full items-center gap-3 text-left [grid-area:1/1] @min-[40rem]:gap-4"
          initial={false}
          animate={
            welcome
              ? motionSafe
                ? { clipPath: "inset(0% 0% 0% 0%)", opacity: 1 }
                : { opacity: 1 }
              : motionSafe
                ? { clipPath: "inset(0% 100% 0% 0%)", opacity: 0 }
                : { opacity: 0 }
          }
          transition={
            welcome
              ? {
                  clipPath: {
                    duration: sweep,
                    ease: easings.move,
                    delay: dropStart,
                  },
                  opacity: {
                    duration: motionSafe ? durations.fast : durations.slow,
                    delay: motionSafe ? dropStart : 0,
                  },
                }
              : { duration: durations.fast, ease: easings.exit }
          }
        >
          <motion.span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold text-primary-foreground @min-[40rem]:size-14 @min-[40rem]:text-lg"
            style={{ backgroundColor: `oklch(from ${accent} 0.58 c h)` }}
            initial={false}
            animate={{
              scale: welcome || !motionSafe ? 1 : 0.6,
            }}
            transition={
              welcome && motionSafe
                ? { ...springs.recoil, delay: landAt }
                : { duration: 0 }
            }
          >
            {account ? initialsOf(account.name) : ""}
          </motion.span>
          <motion.span
            className="flex min-w-0 flex-col gap-0.5"
            initial={false}
            animate={{ y: welcome || !motionSafe ? 0 : distances.step }}
            transition={
              welcome && motionSafe
                ? { ...springs.glide, delay: landAt }
                : { duration: 0 }
            }
          >
            <span className="text-[17px] leading-tight font-semibold tracking-[-0.01em] break-words @min-[40rem]:text-[22px]">
              {account ? `Welcome, ${account.name}` : " "}
            </span>
            {account?.detail ? (
              <span className="text-[12px] text-ink-2 @min-[40rem]:text-[13px]">
                {account.detail}
              </span>
            ) : null}
          </motion.span>
        </motion.div>
      </div>
    );

  const layer = (on: boolean) =>
    cn(
      "flex w-full flex-col items-center gap-3 [grid-area:1/1] transition-opacity",
      on ? "opacity-100" : "pointer-events-none opacity-0",
    );
  const ghostButton = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-xs font-medium text-ink-2 transition-colors",
    "hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
    FOCUS,
  );
  const solidButton = cn(
    "inline-flex h-9 items-center gap-1.5 rounded-2 bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity",
    "hover:opacity-90 disabled:opacity-50",
    FOCUS,
  );

  const actions = !ready ? (
    status === "error" ? (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onRefresh?.()}
        className={solidButton}
      >
        <RotateCw aria-hidden className="size-3.5" />
        Try again
      </button>
    ) : (
      <p className="font-mono text-[11px] tracking-[0.06em] text-ink-3 uppercase">
        Getting a code
      </p>
    )
  ) : (
    <div
      className="grid w-full max-w-md"
      onFocus={() => {
        focusInside.current = true;
      }}
      onBlur={(event) => {
        const to = event.relatedTarget;
        if (to instanceof Node && event.currentTarget.contains(to)) return;
        focusInside.current = false;
      }}
    >
      {/* Live: the bar, the countdown and the waiting dots. */}
      <div
        className={layer(phase === "live")}
        aria-hidden={phase !== "live" || undefined}
        inert={phase !== "live"}
        style={{
          transitionDuration: `${phase === "live" ? 240 : 150}ms`,
          transitionDelay: `${welcome && motionSafe ? 260 : 0}ms`,
        }}
      >
        <div className="h-1 w-full max-w-[22rem] overflow-clip rounded-full bg-surface-2">
          <div
            ref={barRef}
            className="h-full w-full rounded-full"
            style={{
              transformOrigin: "0% 50%",
              backgroundColor: urgent ? "var(--warn)" : accent,
            }}
          />
        </div>
        <div className="flex w-full max-w-[22rem] flex-wrap items-center justify-center gap-x-4 gap-y-1.5 @min-[24rem]:justify-between">
          <span
            className={cn(
              "font-mono text-[11px] tabular-nums transition-colors",
              urgent ? "text-warn" : "text-ink-3",
            )}
          >
            Expires in {countdown(left)}
          </span>
          <span className="inline-flex items-center gap-2 text-[11px] text-ink-3">
            <span aria-hidden className="inline-flex items-center gap-1.5">
              {Array.from({ length: DOTS }, (_, i) => {
                const on = welcome || i === lit;
                const trail =
                  !welcome && hasPoll && i === (lit + DOTS - 1) % DOTS;
                return (
                  <motion.span
                    key={i}
                    className="block size-1.5 rounded-full"
                    style={{ backgroundColor: accent }}
                    initial={false}
                    animate={{
                      scale: on && motionSafe && !welcome ? 1.6 : 1,
                      opacity: on ? 1 : trail ? 0.5 : 0.22,
                    }}
                    transition={
                      welcome
                        ? motionSafe
                          ? { ...springs.flick, delay: i * 0.035 }
                          : { duration: durations.blink }
                        : motionSafe
                          ? springs.snap
                          : { duration: durations.blink }
                    }
                  />
                );
              })}
            </span>
            Waiting for approval
          </span>
        </div>
        <button
          ref={(node) => {
            if (node) primary.current.live = node;
          }}
          type="button"
          disabled={disabled}
          onClick={refresh}
          className={ghostButton}
        >
          <RotateCw aria-hidden className="size-3.5" />
          New code
        </button>
      </div>

      {/* Expired: say so, and offer the next one. */}
      <div
        className={layer(phase === "expired")}
        aria-hidden={phase !== "expired" || undefined}
        inert={phase !== "expired"}
        style={{ transitionDuration: "240ms" }}
      >
        <p className="text-[13px] text-foreground">
          This code expired.
          {lifetime >= 30 ? (
            <span className="text-ink-3">
              {" "}
              Codes last{" "}
              {lifetime >= 60
                ? `${Math.round(lifetime / 60)} min`
                : `${Math.round(lifetime)} s`}
              .
            </span>
          ) : null}
        </p>
        <button
          ref={(node) => {
            if (node) primary.current.expired = node;
          }}
          type="button"
          disabled={disabled}
          onClick={refresh}
          className={solidButton}
        >
          <RotateCw aria-hidden className="size-3.5" />
          Get a new code
        </button>
      </div>

      {/* Welcome: who is in, and the way back out. */}
      <div
        className={layer(welcome)}
        aria-hidden={!welcome || undefined}
        inert={!welcome}
        style={{
          transitionDuration: "320ms",
          transitionDelay: `${welcome && motionSafe ? Math.round((dropStart + sweep) * 1000) : 0}ms`,
        }}
      >
        <p className="text-[13px] text-ink-2">
          Signed in to <span className="text-foreground">{room}</span>
        </p>
        <button
          ref={(node) => {
            if (node) primary.current.welcome = node;
          }}
          type="button"
          disabled={disabled}
          onClick={signOut}
          className={ghostButton}
        >
          <LogOut aria-hidden className="size-3.5" />
          Not you? Sign out
        </button>
      </div>
    </div>
  );

  // The outgoing words leave quickly; the incoming ones wait for the reveal,
  // so the two lines never read through each other.
  const reveal = welcome && motionSafe ? Math.round(landAt * 1000) : 120;
  const swap = (on: boolean) =>
    cn(
      "[grid-area:1/1] transition-opacity",
      on ? "opacity-100 duration-300" : "opacity-0 duration-150",
    );
  const swapStyle = (on: boolean): React.CSSProperties => ({
    transitionDelay: on ? `${reveal}ms` : "0ms",
  });

  return (
    <div
      ref={bindRoot}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container w-full overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex h-12 items-center justify-between gap-3 border-b border-hairline px-4">
        <span className="inline-flex h-7 min-w-0 items-center gap-2 rounded-full border border-hairline bg-surface-1 px-2.5 text-[12px] font-medium text-ink-2">
          <Tv aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{room}</span>
        </span>
        <span className="shrink-0 font-mono text-[12px] text-ink-3 tabular-nums">
          <span className="sr-only">Time </span>
          {clock(now)}
        </span>
      </header>

      <div className="flex flex-col items-center gap-5 px-4 pt-6 pb-6 text-center @min-[24rem]:px-6 @min-[40rem]:gap-6 @min-[40rem]:pt-9 @min-[40rem]:pb-8">
        {/* Both headings share one cell, so the swap never moves the code. */}
        <div className="flex max-w-lg flex-col items-center gap-1.5">
          <h2
            id={titleId}
            className="grid text-[17px] leading-snug font-semibold tracking-[-0.01em] @min-[40rem]:text-xl"
          >
            <span
              aria-hidden={welcome || undefined}
              className={swap(!welcome)}
              style={swapStyle(!welcome)}
            >
              Sign in to {room}
            </span>
            <span
              aria-hidden={!welcome || undefined}
              className={swap(welcome)}
              style={swapStyle(welcome)}
            >
              {room} is yours
            </span>
          </h2>
          <p className="grid text-[13px] leading-relaxed text-balance text-ink-2 @min-[40rem]:text-sm">
            <span
              aria-hidden={welcome || undefined}
              className={swap(!welcome)}
              style={swapStyle(!welcome)}
            >
              On your phone or laptop, go to{" "}
              <span
                className="font-mono text-[0.95em] text-foreground underline decoration-2 underline-offset-4"
                style={{
                  textDecorationColor: `color-mix(in oklab, ${accent} 70%, transparent)`,
                }}
              >
                {url}
              </span>{" "}
              and enter this code.
            </span>
            <span
              aria-hidden={!welcome || undefined}
              className={swap(welcome)}
              style={swapStyle(welcome)}
            >
              Start the meeting or share a screen from your phone.
            </span>
          </p>
        </div>

        {stage}
        {actions}
      </div>

      <p className="flex items-start justify-center gap-2 border-t border-hairline px-4 py-3 text-[12px] leading-snug text-ink-3 @min-[24rem]:px-6">
        <ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0" />
        <span className="text-balance">
          Only enter a code you can see on this screen. Each code works once.
        </span>
      </p>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
