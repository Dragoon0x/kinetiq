"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
  type Variants,
} from "motion/react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  History,
  KeyRound,
  LifeBuoy,
  Mail,
  Receipt,
  Search,
  Users,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type BackStackIcon = React.ComponentType<{
  className?: string;
  style?: React.CSSProperties;
}>;

export type BackStackPage = {
  id: string;
  title: string;
  /** The part of the site it belongs to ("Billing"). */
  section: string;
  icon?: BackStackIcon;
  summary: string;
  /** Ids of related pages, shown as links that push onto the history. */
  links?: string[];
};

export type BackStackVisit = {
  /** A page id. */
  page: string;
  /** When it was visited, ms since the epoch. */
  at: number;
};

export type BackStackVia = "back" | "forward" | "stack" | "link";
export type BackStackAccentName = "cobalt" | "plum" | "mint" | "ink";
export type BackStackLabelMode = "hover" | "always" | "tip";
export type BackStackStyle = "list" | "cards" | "rail";
export type BackStackStatus = "ready" | "loading" | "error";

export type BackStackProps = {
  /** Every page the session can reach. @default defaultBackStackPages */
  pages?: BackStackPage[];
  /** Controlled history, oldest first. */
  history?: BackStackVisit[];
  /** Initial history when uncontrolled. @default defaultBackStackHistory */
  defaultHistory?: BackStackVisit[];
  /** Controlled position in the history. */
  index?: number;
  /** Initial position when uncontrolled. @default 3 */
  defaultIndex?: number;
  /** Fires from the press, hold, key or link that moved, with where it landed and how. */
  onNavigate?: (
    index: number,
    visit: BackStackVisit,
    via: BackStackVia,
  ) => void;
  /** Fires when the history itself changes: a link pushed a page, or it was cleared. */
  onHistoryChange?: (history: BackStackVisit[], index: number) => void;
  /** Fires from Clear history in the stack. */
  onClearHistory?: () => void;
  /** Controlled: whether the history stack is dropped. A host-opened stack never moves focus. */
  stackOpen?: boolean;
  /** Initial stack state when uncontrolled. @default false */
  defaultStackOpen?: boolean;
  /** Fires from the hold, key, right-click, choice or Escape that opened or closed the stack. */
  onStackOpenChange?: (open: boolean) => void;
  /** How long Back or Forward is held before the stack drops, ms. @default 450 */
  holdMs?: number;
  /** The time visits are measured from, ms since the epoch. @default defaultBackStackNow */
  now?: number;
  /** How Back names where it leads: a chip on hover, a label always, or a tooltip. @default "hover" */
  labelMode?: BackStackLabelMode;
  /** How the dropped stack reads: plain rows, dealt cards, or a timeline rail. @default "list" */
  stackStyle?: BackStackStyle;
  /** Current entry, hold bar and links: a named accent or any CSS colour. @default "cobalt" */
  accent?: BackStackAccentName | (string & {});
  /** The product the header belongs to; names the piece. @default "Waylight Help" */
  product?: string;
  /** Shows a Search help button that calls this. */
  onSearch?: () => void;
  /** Page state: loading shows a skeleton page, error a retry. @default "ready" */
  status?: BackStackStatus;
  /** Called by the error state's Retry. */
  onRetry?: () => void;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultBackStackPages: BackStackPage[] = [
  {
    id: "home",
    title: "Help centre",
    section: "Waylight Help",
    icon: LifeBuoy,
    summary:
      "Guides for billing, security, seats and the desktop app, written by the people who answer your tickets.",
    links: ["billing", "sso", "contact"],
  },
  {
    id: "billing",
    title: "Billing and invoices",
    section: "Billing",
    icon: Receipt,
    summary:
      "Plans, payment methods and the invoices Waylight sends each month, and how to change any of them.",
    links: ["refunds", "invoice-address"],
  },
  {
    id: "refunds",
    title: "Refunds for annual plans",
    section: "Billing",
    icon: CreditCard,
    summary:
      "Annual plans are refunded in full within 30 days of renewal, then pro rata for the months you have not used.",
    links: ["invoice-address", "contact"],
  },
  {
    id: "invoice-address",
    title: "Change the address on an invoice",
    section: "Billing",
    icon: FileText,
    summary:
      "Edit the billing address in Settings, then reissue any invoice from the last twelve months with the new one.",
    links: ["refunds", "seats", "contact"],
  },
  {
    id: "sso",
    title: "Set up single sign-on",
    section: "Security",
    icon: KeyRound,
    summary:
      "Connect your identity provider, verify your domain, then require sign-on for everyone in the workspace.",
    links: ["seats", "contact"],
  },
  {
    id: "seats",
    title: "Add or remove seats",
    section: "Account",
    icon: Users,
    summary:
      "Seats are billed by the day; removing one credits the rest of the period to your next invoice.",
    links: ["billing", "contact"],
  },
  {
    id: "contact",
    title: "Contact support",
    section: "Support",
    icon: Mail,
    summary:
      "Write to us from the help centre and a person replies within four working hours, every weekday.",
    links: ["home"],
  },
];

/** A fixed moment, so the server and the browser print the same "2 min ago". */
export const defaultBackStackNow = Date.UTC(2026, 9, 17, 14, 32, 0);

const MIN = 60_000;
export const defaultBackStackHistory: BackStackVisit[] = [
  { page: "home", at: defaultBackStackNow - 14 * MIN },
  { page: "billing", at: defaultBackStackNow - 11 * MIN },
  { page: "refunds", at: defaultBackStackNow - 6 * MIN },
  { page: "invoice-address", at: defaultBackStackNow - 2 * MIN },
  { page: "sso", at: defaultBackStackNow - 1 * MIN },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const ACCENTS: Record<BackStackAccentName, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const accentVars = (accent: string): React.CSSProperties =>
  ({
    "--bs-accent": Object.hasOwn(ACCENTS, accent)
      ? ACCENTS[accent as BackStackAccentName]
      : accent,
    "--bs-wash": "color-mix(in oklab, var(--bs-accent) 11%, transparent)",
    "--bs-soft": "color-mix(in oklab, var(--bs-accent) 36%, transparent)",
  }) as React.CSSProperties;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const HEADER = 48;

const ago = (now: number, at: number) => {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};

/* ----------------------------------------------------------------------- */
/*                                 The stack                                */
/* ----------------------------------------------------------------------- */

type Entry = {
  index: number;
  page: BackStackPage;
  at: number;
  where: "ahead" | "here" | "behind";
};

function Stack({
  grabFocus,
  entries,
  current,
  stackStyle,
  now,
  motionSafe,
  canClear,
  single,
  onPick,
  onClear,
  onClose,
}: {
  grabFocus: boolean;
  entries: Entry[];
  current: number;
  stackStyle: BackStackStyle;
  now: number;
  motionSafe: boolean;
  canClear: boolean;
  single: boolean;
  onPick: (index: number) => void;
  onClear: () => void;
  onClose: (refocus: boolean) => void;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const start = Math.max(
    0,
    entries.findIndex((e) => e.index === current),
  );
  const [active, setActive] = React.useState(start);
  const total = entries.length + 1;
  const itemAt = React.useCallback(
    (i: number) =>
      node?.querySelectorAll<HTMLElement>("[role=menuitem]")[i] ?? null,
    [node],
  );

  // Focus lands on the current entry when the stack's node arrives.
  React.useEffect(() => {
    if (!node || !grabFocus) return;
    itemAt(start)?.focus();
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node]);

  const close = React.useRef(onClose);
  React.useEffect(() => {
    close.current = onClose;
  });
  React.useEffect(() => {
    if (!node) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target || node.contains(target) || target.closest("[data-bs-nav]"))
        return;
      close.current(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [node]);

  const move = (to: number) => {
    const i = ((to % total) + total) % total;
    setActive(i);
    itemAt(i)?.focus();
  };

  const step = cascade(entries.length + 1);
  const cardPitch = 44;
  const variants: Variants = {
    hidden: (i: unknown) => {
      const k = typeof i === "number" ? i : 0;
      if (!motionSafe) return { opacity: 0 };
      // Cards start piled at the top, 4 px apart, and deal down to place.
      if (stackStyle === "cards")
        return { opacity: 0, y: -k * cardPitch + k * distances.nudge };
      return { opacity: 0, y: -6 };
    },
    shown: (i: unknown) => {
      const k = typeof i === "number" ? i : 0;
      return {
        opacity: 1,
        y: 0,
        transition: motionSafe
          ? {
              ...springs.snap,
              delay: k * step,
              opacity: { duration: durations.fast, delay: k * step },
            }
          : { duration: durations.fast },
      };
    },
  };

  const rail = stackStyle === "rail";
  const cards = stackStyle === "cards";

  return (
    <motion.div
      ref={setNode}
      role="menu"
      aria-label="History"
      onKeyDown={(event) => {
        // The stack owns its keys; Escape must not reach the page either.
        event.stopPropagation();
        if (event.key === "ArrowDown") {
          event.preventDefault();
          move(active + 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          move(active - 1);
        } else if (event.key === "Home") {
          event.preventDefault();
          move(0);
        } else if (event.key === "End") {
          event.preventDefault();
          move(total - 1);
        } else if (event.key === "Escape") {
          event.preventDefault();
          close.current(true);
        } else if (event.key === "Tab") {
          close.current(false);
        }
      }}
      initial={
        motionSafe
          ? { opacity: 0, clipPath: "inset(0% 0% 100% 0% round 12px)" }
          : { opacity: 0 }
      }
      animate={{ opacity: 1, clipPath: "inset(0% 0% 0% 0% round 12px)" }}
      exit={
        motionSafe
          ? {
              opacity: 0,
              clipPath: "inset(0% 0% 100% 0% round 12px)",
              transition: exitFor(durations.base),
            }
          : { opacity: 0, transition: { duration: durations.fast } }
      }
      transition={
        motionSafe
          ? {
              clipPath: { duration: durations.slow, ease: easings.enter },
              opacity: { duration: durations.fast },
            }
          : { duration: durations.fast }
      }
      className={cn(
        "absolute left-2 z-30 flex w-[22rem] max-w-[calc(100%-1rem)] [scrollbar-width:thin] flex-col overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-popover p-1.5 text-popover-foreground shadow-lg",
        cards && "gap-1.5 bg-surface-1",
      )}
      style={{ top: HEADER + 4, maxHeight: `calc(100% - ${HEADER + 10}px)` }}
    >
      {entries.map((entry, i) => {
        const Icon = entry.page.icon;
        const here = entry.where === "here";
        const ahead = entry.where === "ahead";
        const last = i === entries.length - 1;
        return (
          <motion.button
            key={entry.index}
            type="button"
            role="menuitem"
            custom={i}
            variants={variants}
            initial="hidden"
            animate="shown"
            aria-current={here ? "page" : undefined}
            aria-label={`${entry.page.title}, ${entry.page.section}, ${
              here
                ? "you are here"
                : ahead
                  ? `ahead, ${ago(now, entry.at)}`
                  : ago(now, entry.at)
            }`}
            tabIndex={i === active ? 0 : -1}
            onFocus={() => setActive(i)}
            onClick={() => onPick(entry.index)}
            className={cn(
              "relative flex h-11 shrink-0 items-center gap-2.5 rounded-2 px-2 text-left transition-colors",
              FOCUS,
              rail && "pl-8",
              cards && "border border-hairline bg-card shadow-sm",
              here
                ? "bg-[var(--bs-wash)]"
                : cards
                  ? "hover:border-hairline-strong"
                  : "hover:bg-surface-2",
            )}
          >
            {rail ? (
              <>
                {!last ? (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-1/2 left-[15px] h-11 w-0 border-l",
                      ahead
                        ? "border-dashed border-hairline-strong"
                        : "border-hairline-strong",
                    )}
                  />
                ) : null}
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1/2 left-[11px] size-[9px] -translate-y-1/2 rounded-full",
                    here
                      ? "border-2 border-[var(--bs-accent)] bg-card"
                      : ahead
                        ? "border border-ink-3 bg-card"
                        : "bg-ink-3",
                  )}
                />
              </>
            ) : null}
            {Icon && !rail ? (
              <span
                aria-hidden
                className={cn(
                  "inline-flex size-7 shrink-0 items-center justify-center rounded-2",
                  here
                    ? "bg-[var(--bs-wash)] text-[var(--bs-accent)]"
                    : "bg-surface-2 text-ink-2",
                  ahead && "opacity-70",
                )}
              >
                <Icon className="size-3.5" />
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate text-[13px] leading-tight",
                  here ? "font-semibold" : ahead ? "text-ink-2" : "",
                )}
              >
                {entry.page.title}
              </span>
              <span className="block truncate text-[11px] leading-tight text-ink-3">
                {`${entry.page.section} · ${here ? "you are here" : ahead ? `ahead · ${ago(now, entry.at)}` : ago(now, entry.at)}`}
              </span>
            </span>
            {here ? (
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-[var(--bs-accent)]"
              />
            ) : null}
          </motion.button>
        );
      })}
      {single ? (
        <p className="px-2 py-1.5 text-[11.5px] text-ink-3">
          This is the first page of this visit.
        </p>
      ) : null}
      <div role="separator" className="mx-1 my-1 h-px shrink-0 bg-hairline" />
      <button
        type="button"
        role="menuitem"
        aria-disabled={!canClear || undefined}
        tabIndex={active === entries.length ? 0 : -1}
        onFocus={() => setActive(entries.length)}
        onClick={() => {
          if (!canClear) return;
          onClear();
        }}
        className={cn(
          "flex h-8 shrink-0 items-center gap-2 rounded-2 px-2 text-[12.5px]",
          FOCUS,
          canClear
            ? "text-ink-2 hover:bg-surface-2 hover:text-foreground"
            : "cursor-not-allowed text-ink-3 opacity-60",
        )}
      >
        <History aria-hidden className="size-3.5" />
        Clear history
      </button>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * An app header whose Back and Forward know where they lead, over the page
 * being read. Back names the page it returns to — a chip that slides out from
 * under it on snap, a label it always carries, or a tooltip — and holding
 * Back or Forward fills a bar under the button; when the hold completes the
 * whole history drops from under the header, unrolling on an enter tween
 * while its entries arrive in `cascade()` order on snap, newest first, with
 * the current one marked. Choosing an entry jumps there and the page slides
 * in from the side the jump went on glide while the old one leaves on the
 * exit ease.
 *
 * Alt with Left and Right moves, Alt+Down (or Down on either button) opens
 * the stack, right-click opens it too, and on touch a long press does.
 * Disabled ends stay focusable and say why. Under reduced motion the hold bar
 * still fills — it is feedback — the stack fades in already in place and the
 * page cross-fades.
 */
export function BackStack({
  pages = defaultBackStackPages,
  history,
  defaultHistory = defaultBackStackHistory,
  index,
  defaultIndex = 3,
  onNavigate,
  onHistoryChange,
  onClearHistory,
  stackOpen,
  defaultStackOpen = false,
  onStackOpenChange,
  holdMs = 450,
  now = defaultBackStackNow,
  labelMode = "hover",
  stackStyle = "list",
  accent = "cobalt",
  product = "Waylight Help",
  onSearch,
  status = "ready",
  onRetry,
  disabled = false,
  className,
}: BackStackProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();

  const [ownHistory, setOwnHistory] = React.useState(defaultHistory);
  const list = history ?? ownHistory;
  const [ownIndex, setOwnIndex] = React.useState(defaultIndex);
  const cur = Math.min(
    Math.max(0, index ?? ownIndex),
    Math.max(0, list.length - 1),
  );

  const pageOf = React.useCallback(
    (id: string): BackStackPage =>
      pages.find((p) => p.id === id) ?? {
        id,
        title: id,
        section: "",
        summary: "",
      },
    [pages],
  );
  const here = list[cur];
  const page = here ? pageOf(here.page) : null;
  const prev = cur > 0 ? list[cur - 1] : undefined;
  const next = cur < list.length - 1 ? list[cur + 1] : undefined;
  const prevPage = prev ? pageOf(prev.page) : null;
  const nextPage = next ? pageOf(next.page) : null;

  // The direction of the last move, from the index itself, so a host that
  // moves the history gets the same slide a press would.
  const [trail, setTrail] = React.useState({ cur, dir: 0 });
  if (trail.cur !== cur) setTrail({ cur, dir: cur > trail.cur ? 1 : -1 });
  const dir = trail.dir;
  const [ownOpen, setOwnOpen] = React.useState(defaultStackOpen);
  const isOpen = stackOpen ?? ownOpen;
  // Only a stack the visitor opened takes focus; one the host opens does not.
  const [grabFocus, setGrabFocus] = React.useState(false);
  const controlledOpen = stackOpen !== undefined;
  const reportOpen = React.useRef(onStackOpenChange);
  React.useEffect(() => {
    reportOpen.current = onStackOpenChange;
  });
  const [peek, setPeek] = React.useState<"back" | "forward" | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const backRef = React.useRef<HTMLButtonElement | null>(null);
  const forwardRef = React.useRef<HTMLButtonElement | null>(null);
  const opener = React.useRef<"back" | "forward">("back");
  const [openFrom, setOpenFrom] = React.useState<"back" | "forward">("back");

  /* ---------------------------- navigation ----------------------------- */

  const go = (to: number, via: BackStackVia) => {
    if (disabled) return;
    if (to < 0 || to >= list.length || to === cur) return;
    const visit = list[to];
    if (!visit) return;
    if (index === undefined) setOwnIndex(to);
    onNavigate?.(to, visit, via);
    const title = pageOf(visit.page).title;
    setAnnouncement(
      via === "back" || (via === "stack" && to < cur)
        ? `Back to ${title}.`
        : `Forward to ${title}.`,
    );
  };

  const follow = (id: string) => {
    if (disabled) return;
    const visit = { page: id, at: now };
    const nextList = [...list.slice(0, cur + 1), visit];
    const to = nextList.length - 1;
    if (history === undefined) setOwnHistory(nextList);
    if (index === undefined) setOwnIndex(to);
    onHistoryChange?.(nextList, to);
    onNavigate?.(to, visit, "link");
    setAnnouncement(`Opened ${pageOf(id).title}.`);
  };

  const clearHistory = () => {
    if (!here || list.length < 2) return;
    const nextList = [here];
    if (history === undefined) setOwnHistory(nextList);
    if (index === undefined) setOwnIndex(0);
    onHistoryChange?.(nextList, 0);
    onClearHistory?.();
    setAnnouncement("History cleared. This page is the only one left.");
  };

  const openStack = (from: "back" | "forward") => {
    if (disabled) return;
    opener.current = from;
    setOpenFrom(from);
    setPeek(null);
    setGrabFocus(true);
    if (!controlledOpen) setOwnOpen(true);
    reportOpen.current?.(true);
  };

  const closeStack = React.useCallback(
    (refocus: boolean) => {
      if (!controlledOpen) setOwnOpen(false);
      setGrabFocus(false);
      reportOpen.current?.(false);
      const node =
        opener.current === "forward" ? forwardRef.current : backRef.current;
      // A previous opening's node can be gone; never focus a dead target.
      if (refocus && node?.isConnected) node.focus();
    },
    [controlledOpen],
  );

  /* ------------------------------- hold -------------------------------- */

  const fillBack = useMotionValue(0);
  const fillForward = useMotionValue(0);
  const holdFor = React.useRef<"back" | "forward" | null>(null);
  const holdTimer = React.useRef(0);
  const holdAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const swallowClick = React.useRef(false);

  const endHold = React.useCallback(() => {
    window.clearTimeout(holdTimer.current);
    holdAnim.current?.stop();
    const fill = holdFor.current === "forward" ? fillForward : fillBack;
    holdAnim.current = animate(fill, 0, {
      duration: durations.fast,
      ease: easings.exit,
    });
    holdFor.current = null;
  }, [fillBack, fillForward]);

  React.useEffect(
    () => () => {
      window.clearTimeout(holdTimer.current);
      holdAnim.current?.stop();
    },
    [],
  );

  const startHold = (which: "back" | "forward", event: React.PointerEvent) => {
    if (disabled || event.button !== 0) return;
    holdFor.current = which;
    swallowClick.current = false;
    holdAnim.current?.stop();
    const fill = which === "forward" ? fillForward : fillBack;
    fill.jump(0);
    // The fill is the hold's own clock, so it runs linear and is kept under
    // reduced motion: it is feedback, not flourish.
    holdAnim.current = animate(fill, 1, {
      duration: Math.max(0.15, holdMs / 1000),
      ease: easings.linear,
    });
    holdTimer.current = window.setTimeout(
      () => {
        swallowClick.current = true;
        fill.jump(0);
        holdFor.current = null;
        openStack(which);
      },
      Math.max(150, holdMs),
    );
  };

  /* ----------------------------- keyboard ------------------------------ */

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (disabled || !event.altKey || event.metaKey || event.ctrlKey) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']"))
      return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (cur > 0) go(cur - 1, "back");
      else setAnnouncement("No earlier page.");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (next) go(cur + 1, "forward");
      else setAnnouncement("No later page.");
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      openStack(target.closest("[data-bs-nav=forward]") ? "forward" : "back");
    }
  };

  /* ------------------------------ render ------------------------------- */

  const entries: Entry[] = list
    .map((visit, i) => ({
      index: i,
      page: pageOf(visit.page),
      at: visit.at,
      where: (i > cur
        ? "ahead"
        : i === cur
          ? "here"
          : "behind") as Entry["where"],
    }))
    .reverse();

  const navButton = (which: "back" | "forward") => {
    const target = which === "back" ? prevPage : nextPage;
    const off = !target;
    const always = labelMode === "always" && which === "back" && !!target;
    const Chevron = which === "back" ? ChevronLeft : ChevronRight;
    const name = target
      ? `${which === "back" ? "Back to" : "Forward to"} ${target.title}`
      : which === "back"
        ? "Back, no earlier page"
        : "Forward, no later page";
    return (
      <button
        ref={which === "back" ? backRef : forwardRef}
        type="button"
        data-bs-nav={which}
        aria-label={name}
        aria-disabled={off || undefined}
        aria-haspopup="menu"
        aria-expanded={isOpen && openFrom === which}
        aria-keyshortcuts={
          which === "back"
            ? "Alt+ArrowLeft Alt+ArrowDown"
            : "Alt+ArrowRight Alt+ArrowDown"
        }
        disabled={disabled}
        onPointerDown={(event) => startHold(which, event)}
        onPointerUp={() => {
          if (holdFor.current) endHold();
        }}
        onPointerLeave={() => {
          if (holdFor.current) endHold();
          setPeek((p) => (p === which ? null : p));
        }}
        onPointerCancel={() => {
          if (holdFor.current) endHold();
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse" && target && !isOpen)
            setPeek(which);
        }}
        onFocus={(event) => {
          if (target && event.currentTarget.matches(":focus-visible"))
            setPeek(which);
        }}
        onBlur={() => setPeek((p) => (p === which ? null : p))}
        onContextMenu={(event) => {
          // Right-click and a long press on touch both mean "show me the list".
          event.preventDefault();
          if (holdFor.current) endHold();
          swallowClick.current = true;
          openStack(which);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !event.altKey) {
            event.preventDefault();
            openStack(which);
          }
        }}
        onClick={() => {
          if (swallowClick.current) {
            swallowClick.current = false;
            return;
          }
          setPeek(null);
          if (off) {
            setAnnouncement(
              which === "back" ? "No earlier page." : "No later page.",
            );
            return;
          }
          go(which === "back" ? cur - 1 : cur + 1, which);
        }}
        className={cn(
          "relative inline-flex h-8 shrink-0 touch-manipulation items-center justify-center gap-1 overflow-hidden rounded-2 select-none [-webkit-touch-callout:none]",
          FOCUS,
          always
            ? "max-w-[14ch] pr-2.5 pl-1.5 @max-[30rem]:max-w-[9ch]"
            : "w-8",
          off
            ? "cursor-not-allowed text-ink-3 opacity-50"
            : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
          isOpen && openFrom === which && "bg-surface-2 text-foreground",
        )}
      >
        <Chevron aria-hidden className="size-4 shrink-0" />
        {always && target ? (
          <span className="grid min-w-0" aria-hidden>
            <AnimatePresence initial={false}>
              <motion.span
                key={target.id}
                className="col-start-1 row-start-1 truncate text-[12.5px] font-medium"
                title={target.title}
                initial={
                  motionSafe
                    ? { opacity: 0, x: dir * distances.step }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe ? springs.glide : { duration: durations.fast }
                }
              >
                {target.title}
              </motion.span>
            </AnimatePresence>
          </span>
        ) : null}
        <motion.span
          aria-hidden
          className="absolute inset-x-1.5 bottom-[3px] h-[2px] origin-left rounded-full bg-[var(--bs-accent)]"
          style={{
            scaleX: which === "forward" ? fillForward : fillBack,
            opacity: which === "forward" ? fillForward : fillBack,
          }}
        />
      </button>
    );
  };

  const peekTarget =
    peek === "back" ? prevPage : peek === "forward" ? nextPage : null;
  const PeekIcon = peekTarget?.icon;
  const PageIcon = page?.icon;
  // Keyed by the visit, not the position: clearing the history keeps the
  // page in place instead of replaying its arrival.
  const pageKey = `${here?.page ?? ""}-${here?.at ?? 0}`;

  const pageVariants: Variants = {
    enter: (d: unknown) => ({
      opacity: 0,
      x: motionSafe && typeof d === "number" ? d * distances.shift : 0,
    }),
    shown: {
      opacity: 1,
      x: 0,
      transition: motionSafe
        ? {
            ...springs.glide,
            opacity: { duration: durations.base, ease: easings.enter },
          }
        : { duration: durations.fast },
    },
    leave: (d: unknown) => ({
      opacity: 0,
      x: motionSafe && typeof d === "number" ? -d * distances.step : 0,
      transition: exitFor(durations.fast),
    }),
  };

  return (
    <section
      aria-label={product}
      onKeyDown={onKeyDown}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
      style={accentVars(accent)}
    >
      {/* ------------------------------ header ----------------------------- */}
      <header
        className="relative z-20 flex shrink-0 items-center gap-1 border-b border-hairline bg-card px-2"
        style={{ height: HEADER }}
      >
        <nav
          aria-label="Back and forward"
          className="flex shrink-0 items-center gap-0.5"
        >
          {navButton("back")}
          {navButton("forward")}
        </nav>
        <span aria-hidden className="mx-1.5 h-5 w-px shrink-0 bg-hairline" />

        <div className="grid min-w-0 flex-1 items-center">
          <AnimatePresence initial={false} custom={dir}>
            {page ? (
              <motion.p
                key={pageKey}
                custom={dir}
                variants={pageVariants}
                initial="enter"
                animate="shown"
                exit="leave"
                className={cn(
                  "col-start-1 row-start-1 flex min-w-0 items-center gap-2 text-[13px] transition-opacity",
                  peek && labelMode === "hover" && "opacity-40",
                )}
              >
                {PageIcon ? (
                  <PageIcon
                    aria-hidden
                    className="size-4 shrink-0 text-ink-3"
                  />
                ) : null}
                <span className="shrink-0 text-ink-3 @max-[30rem]:hidden">
                  {page.section}
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-3 shrink-0 text-ink-3 @max-[30rem]:hidden"
                />
                <span
                  className="min-w-0 truncate font-medium"
                  title={page.title}
                >
                  {page.title}
                </span>
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        {onSearch ? (
          <button
            type="button"
            onClick={onSearch}
            disabled={disabled}
            aria-label="Search help"
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-2 rounded-2 border border-hairline px-2.5 text-[12.5px] text-ink-3 transition-colors hover:border-hairline-strong hover:text-foreground @max-[36rem]:w-8 @max-[36rem]:justify-center @max-[36rem]:border-transparent @max-[36rem]:px-0",
              FOCUS,
            )}
          >
            <Search aria-hidden className="size-4 shrink-0" />
            <span aria-hidden className="@max-[36rem]:hidden">
              Search help
            </span>
          </button>
        ) : null}

        {/* Naming the way back. */}
        <AnimatePresence>
          {peekTarget && labelMode !== "always" ? (
            <motion.span
              key={`${peek}-${labelMode}`}
              aria-hidden
              className={cn(
                "pointer-events-none absolute z-30 flex max-w-[16rem] items-center gap-2 rounded-2 border border-hairline bg-popover px-2 shadow-md",
                labelMode === "hover" ? "h-8" : "py-1.5",
              )}
              style={
                labelMode === "hover"
                  ? { left: peek === "back" ? 44 : 78, top: (HEADER - 32) / 2 }
                  : { left: peek === "back" ? 8 : 42, top: HEADER + 4 }
              }
              initial={
                motionSafe
                  ? labelMode === "hover"
                    ? { opacity: 0, x: -distances.step }
                    : { opacity: 0, y: -distances.nudge }
                  : { opacity: 0 }
              }
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe ? springs.snap : { duration: durations.fast }
              }
            >
              {labelMode === "hover" ? (
                <>
                  {PeekIcon ? (
                    <PeekIcon className="size-3.5 shrink-0 text-ink-3" />
                  ) : null}
                  <span className="truncate text-[12.5px] font-medium">
                    {peekTarget.title}
                  </span>
                </>
              ) : (
                <span className="text-[12px] leading-snug">
                  <span className="text-ink-3">
                    {peek === "back" ? "Back to " : "Forward to "}
                  </span>
                  <span className="font-medium">{peekTarget.title}</span>
                  <kbd className="ml-1.5 font-mono text-[10.5px] text-ink-3">
                    {peek === "back" ? "Alt ←" : "Alt →"}
                  </kbd>
                </span>
              )}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </header>

      {/* ------------------------------- page ------------------------------ */}
      <div className="relative grid">
        <AnimatePresence initial={false} custom={dir}>
          {status === "ready" && page ? (
            <motion.article
              key={pageKey}
              custom={dir}
              variants={pageVariants}
              initial="enter"
              animate="shown"
              exit="leave"
              aria-labelledby={`${uid}-h`}
              className="col-start-1 row-start-1 flex min-w-0 flex-col gap-1 px-4 pt-3.5 pb-4 @max-[30rem]:pt-3 @max-[30rem]:pb-3"
            >
              <p className="font-mono text-[10.5px] tracking-[0.08em] text-ink-3 uppercase @max-[30rem]:hidden">
                {page.section}
              </p>
              <h3
                id={`${uid}-h`}
                className="text-[15px] leading-snug font-semibold"
              >
                {page.title}
              </h3>
              <p className="line-clamp-2 text-[13px] leading-[1.45] text-ink-2">
                {page.summary}
              </p>
              {page.links && page.links.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-[11px] text-ink-3 @max-[30rem]:hidden">
                    Related
                  </span>
                  {page.links.slice(0, 3).map((id, i) => {
                    const target = pageOf(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={disabled}
                        onClick={() => follow(id)}
                        className={cn(
                          "inline-flex h-6 items-center gap-1 rounded-1 text-[12.5px] font-medium text-[var(--bs-accent)] hover:underline hover:underline-offset-2",
                          FOCUS,
                          i === 2 && "@max-[30rem]:hidden",
                        )}
                      >
                        {target.title}
                        <ArrowRight aria-hidden className="size-3 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </motion.article>
          ) : null}
        </AnimatePresence>
        {status === "loading" ? (
          <div
            aria-busy="true"
            aria-label="Loading the page"
            className="flex flex-col gap-2 px-4 pt-4 pb-5"
          >
            <span className="h-2.5 w-16 rounded-full bg-surface-2" />
            <span className="h-3.5 w-56 max-w-full rounded-full bg-surface-2 motion-safe:animate-pulse" />
            <span className="h-2.5 w-full rounded-full bg-surface-2 motion-safe:animate-pulse" />
            <span className="h-2.5 w-2/3 rounded-full bg-surface-2 motion-safe:animate-pulse" />
          </div>
        ) : null}
        {status === "error" ? (
          <div className="flex flex-col items-start gap-2 px-4 pt-4 pb-5">
            <p className="text-[13px]">This article didn’t load.</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  FOCUS,
                )}
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {isOpen ? (
          <Stack
            key="stack"
            grabFocus={grabFocus}
            entries={entries}
            current={cur}
            stackStyle={stackStyle}
            now={now}
            motionSafe={motionSafe}
            canClear={list.length > 1}
            single={list.length < 2}
            onPick={(to) => {
              closeStack(true);
              go(to, "stack");
            }}
            onClear={() => {
              clearHistory();
              closeStack(true);
            }}
            onClose={closeStack}
          />
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
