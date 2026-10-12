"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  Globe,
  Inbox,
  Mail,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
  Smartphone,
  TriangleAlert,
  X,
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

/** An incident's state, in the order the status chips show it. */
export type DispatchStatus =
  "investigating" | "identified" | "monitoring" | "resolved";

/** One thing the status page reports on. */
export type DispatchComponent = {
  id: string;
  name: string;
  /** Shown as a small prefix, e.g. "Core". */
  group?: string;
};

export type DispatchChannelKind = "page" | "email" | "sms" | "chat";

/** Somewhere an update is delivered to. */
export type DispatchChannel = {
  id: string;
  /** Picks the preview it is rendered with. */
  kind: DispatchChannelKind;
  label: string;
  /** Who receives it, e.g. "1,284 subscribers". */
  audience?: string;
  /** Characters the channel accepts; the preview truncates past it. */
  limit?: number;
};

/** What the composer holds: the status, the affected component ids and the message. */
export type DispatchDraft = {
  status: DispatchStatus;
  components: string[];
  message: string;
};

export type DispatchDraftField = keyof DispatchDraft;

export type DispatchDeliveryState =
  "queued" | "sending" | "delivered" | "failed";

/** One posted update; `deliveries` is how each channel took it. */
export type DispatchUpdate = {
  id: string;
  /** When it was posted, in ms. */
  at: number;
  status: DispatchStatus;
  components: string[];
  message: string;
  deliveries?: Record<string, DispatchDeliveryState>;
};

/** What a host returns from `onDispatch`: one promise per channel id. */
export type DispatchReceipts = Partial<Record<string, Promise<unknown>>>;

export type DispatchIncident = {
  /** Shown in the previews, e.g. "CB-418". */
  ref: string;
  title: string;
};

export type DispatchLoadStatus = "ready" | "loading" | "error";
export type DispatchDensity = "compact" | "cozy" | "roomy";
export type DispatchTimelinePlacement = "side" | "below";

export type StatusDispatchProps = {
  /** The components an update can name as affected. @default defaultDispatchComponents */
  components?: DispatchComponent[];
  /** Where an update goes, in preview-tab and delivery order. @default defaultDispatchChannels */
  channels?: DispatchChannel[];
  /** The incident the updates belong to, shown in every preview. @default defaultDispatchIncident */
  incident?: DispatchIncident;
  /** Who the previews say the update is from. @default "Coldbrook Status" */
  sender?: string;
  /** Controlled timeline of posted updates, oldest first. */
  updates?: DispatchUpdate[];
  /** Initial timeline when uncontrolled. @default defaultDispatchUpdates */
  defaultUpdates?: DispatchUpdate[];
  /** Fires with the whole timeline after Dispatch appends to it. */
  onUpdatesChange?: (updates: DispatchUpdate[]) => void;
  /** Dispatch was pressed. Return one promise per channel id and each row settles as its promise does; return nothing and a simulator delivers them, failing one. */
  onDispatch?: (
    update: DispatchUpdate,
    channels: DispatchChannel[],
  ) => DispatchReceipts | void;
  /** Retry was pressed on a failed channel. Return a promise for that channel; return nothing and the simulator delivers it. */
  onRetryChannel?: (
    channel: DispatchChannel,
    update: DispatchUpdate,
  ) => Promise<unknown> | void;
  /** A channel's delivery state changed. */
  onDelivery?: (
    update: DispatchUpdate,
    channelId: string,
    state: DispatchDeliveryState,
  ) => void;
  /** Controlled draft. */
  value?: DispatchDraft;
  /** Initial draft when uncontrolled. @default defaultDispatchDraft */
  defaultValue?: DispatchDraft;
  /** Fires from every keystroke, chip press or status change, with the field that changed. */
  onChange?: (draft: DispatchDraft, field: DispatchDraftField) => void;
  /** The message's character budget; over it, Dispatch is held. @default 280 */
  maxLength?: number;
  /** The channel whose preview shows first, by id. @default "page" */
  previewChannel?: string;
  /** Padding, type size and chip heights. @default "cozy" */
  density?: DispatchDensity;
  /** Whether the timeline takes a third column from a 64rem container, or always sits below the composer and previews. @default "side" */
  timeline?: DispatchTimelinePlacement;
  /** The moment a dispatched update is stamped with, in ms — never read from the clock. @default defaultDispatchNow */
  now?: number;
  /** Whether the components and channels have arrived. @default "ready" */
  status?: DispatchLoadStatus;
  /** Try again was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Post an update" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; its columns scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be typed, toggled or dispatched. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

/** Monday 12 October 2026, 09:30 UTC. */
export const defaultDispatchNow = Date.UTC(2026, 9, 12, 9, 30);

export const defaultDispatchComponents: DispatchComponent[] = [
  { id: "api", name: "Coldbrook API", group: "Core" },
  { id: "dashboard", name: "Dashboard", group: "Core" },
  { id: "webhooks", name: "Webhooks", group: "Core" },
  { id: "auth", name: "Sign-in", group: "Core" },
  { id: "ingest", name: "Event ingest", group: "Pipelines" },
  { id: "exports", name: "Exports", group: "Pipelines" },
  { id: "docs", name: "Docs site", group: "Web" },
];

export const defaultDispatchChannels: DispatchChannel[] = [
  { id: "page", kind: "page", label: "Status page", audience: "public" },
  { id: "email", kind: "email", label: "Email", audience: "1,284 subscribers" },
  {
    id: "sms",
    kind: "sms",
    label: "SMS",
    audience: "312 subscribers",
    limit: 160,
  },
  { id: "chat", kind: "chat", label: "Chat", audience: "#coldbrook-status" },
];

export const defaultDispatchIncident: DispatchIncident = {
  ref: "CB-418",
  title: "Elevated error rates on the Coldbrook API",
};

/** Two updates already posted, 26 and 11 minutes ago, every channel delivered. */
export const defaultDispatchUpdates: DispatchUpdate[] = [
  {
    id: "upd-1",
    at: defaultDispatchNow - 26 * MIN,
    status: "investigating",
    components: ["api", "webhooks"],
    message:
      "We are investigating elevated 5xx error rates on the API. Webhook deliveries are delayed while we look.",
    deliveries: {
      page: "delivered",
      email: "delivered",
      sms: "delivered",
      chat: "delivered",
    },
  },
  {
    id: "upd-2",
    at: defaultDispatchNow - 11 * MIN,
    status: "identified",
    components: ["api", "webhooks", "dashboard"],
    message:
      "A configuration push to the edge tier is returning errors for roughly 12% of API calls. A rollback is under way.",
    deliveries: {
      page: "delivered",
      email: "delivered",
      sms: "delivered",
      chat: "delivered",
    },
  },
];

export const defaultDispatchDraft: DispatchDraft = {
  status: "monitoring",
  components: ["api", "webhooks"],
  message:
    "The rollback has completed and error rates are back to normal. We are monitoring for the next 30 minutes before resolving.",
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const STATUS_ORDER: DispatchStatus[] = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
];

const STATUS_META: Record<
  DispatchStatus,
  { label: string; color: string; lead: string }
> = {
  investigating: {
    label: "Investigating",
    color: "var(--danger)",
    lead: "We are looking into it",
  },
  identified: {
    label: "Identified",
    color: "var(--warn)",
    lead: "The cause is known",
  },
  monitoring: {
    label: "Monitoring",
    color: "var(--accent-bright)",
    lead: "A fix is in and being watched",
  },
  resolved: {
    label: "Resolved",
    color: "var(--success)",
    lead: "This incident is over",
  },
};

const STATE_WORD: Record<DispatchDeliveryState, string> = {
  queued: "queued",
  sending: "sending",
  delivered: "delivered",
  failed: "failed",
};

const DENSITY: Record<
  DispatchDensity,
  {
    pad: string;
    gap: string;
    chip: string;
    text: string;
    row: string;
    rows: number;
    tab: string;
  }
> = {
  compact: {
    pad: "px-3 py-2.5",
    gap: "gap-2.5",
    chip: "h-6 text-[11px]",
    text: "text-[12px] leading-[17px]",
    row: "h-8",
    rows: 3,
    tab: "h-8 text-[11px]",
  },
  cozy: {
    pad: "px-4 py-3",
    gap: "gap-3",
    chip: "h-7 text-xs",
    text: "text-[13px] leading-[19px]",
    row: "h-9",
    rows: 4,
    tab: "h-9 text-xs",
  },
  roomy: {
    pad: "px-5 py-4",
    gap: "gap-4",
    chip: "h-8 text-[13px]",
    text: "text-[13px] leading-5",
    row: "h-10",
    rows: 5,
    tab: "h-10 text-[13px]",
  },
};

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const noopSubscribe = () => () => {};

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "09:30", always UTC so the seeded timeline reads the same everywhere. */
const fmtTime = (at: number) => {
  const d = new Date(at);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

const fmtDate = (at: number) => {
  const d = new Date(at);
  const months = [
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
  ];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}`;
};

const joinNames = (names: string[]) => {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

/** The whole SMS as sent: the sender, the status word and the message. */
const smsText = (
  sender: string,
  status: DispatchStatus,
  message: string,
  ref: string,
) =>
  `${sender} ${ref}: ${STATUS_META[status].label.toUpperCase()} - ${message.trim()}`;

/** Cuts to `limit` characters with a trailing ellipsis when it has to. */
const truncate = (text: string, limit: number) =>
  text.length <= limit
    ? text
    : `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;

const isMac = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

/* ----------------------------------------------------------------------- */
/*                                   Tick                                   */
/* ----------------------------------------------------------------------- */

function Tick({
  animated,
  className,
}: {
  /** Draws in on flick when true; sits complete when false. */
  animated: boolean;
  className?: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 14 14" className={cn("size-3", className)}>
      <motion.path
        d="M3 7.4 5.8 10 11 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animated ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={animated ? springs.flick : { duration: 0 }}
      />
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Status chips                               */
/* ----------------------------------------------------------------------- */

function StatusPicker({
  value,
  motionSafe,
  uid,
  inert,
  chip,
  onChange,
}: {
  value: DispatchStatus;
  motionSafe: boolean;
  uid: string;
  inert: boolean;
  chip: string;
  onChange: (status: DispatchStatus) => void;
}) {
  const nodes = React.useRef(new Map<DispatchStatus, HTMLButtonElement>());
  const move = (event: React.KeyboardEvent, from: DispatchStatus) => {
    const i = STATUS_ORDER.indexOf(from);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = STATUS_ORDER.length - 1;
    else return;
    event.preventDefault();
    const target = STATUS_ORDER[clamp(to, 0, STATUS_ORDER.length - 1)];
    if (!target) return;
    nodes.current.get(target)?.focus();
    if (!inert) onChange(target);
  };
  return (
    <div
      role="radiogroup"
      aria-label="Status"
      className="grid grid-cols-2 gap-1 rounded-3 border border-hairline bg-surface-1 p-1 @min-[64rem]:grid-cols-4"
    >
      {STATUS_ORDER.map((s) => {
        const meta = STATUS_META[s];
        const checked = s === value;
        return (
          <button
            key={s}
            ref={(node) => {
              if (node) nodes.current.set(s, node);
              else nodes.current.delete(s);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-disabled={inert || undefined}
            tabIndex={checked ? 0 : -1}
            onClick={() => {
              if (!inert) onChange(s);
            }}
            onKeyDown={(event) => move(event, s)}
            style={{ ["--sd-status" as string]: meta.color }}
            className={cn(
              "relative flex min-w-0 items-center justify-center gap-1.5 rounded-2 px-2 font-medium transition-colors",
              chip,
              checked ? "text-foreground" : "text-ink-2 hover:text-foreground",
              inert ? "cursor-default" : "cursor-pointer",
              FOCUS_RING,
            )}
          >
            {checked ? (
              <motion.span
                aria-hidden
                layoutId={motionSafe ? `${uid}-status-ind` : undefined}
                transition={springs.snap}
                className="absolute inset-0 rounded-2 border border-[color-mix(in_oklab,var(--sd-status)_45%,transparent)] bg-[color-mix(in_oklab,var(--sd-status)_14%,var(--bg-0))] shadow-[0_1px_2px_color-mix(in_oklab,black_12%,transparent)]"
              />
            ) : null}
            <span
              aria-hidden
              className="relative size-1.5 shrink-0 rounded-full transition-colors duration-200"
              style={{ background: checked ? meta.color : "var(--ink-3)" }}
            />
            <span className="relative truncate">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                              Component chips                             */
/* ----------------------------------------------------------------------- */

function ComponentChips({
  components,
  selected,
  motionSafe,
  inert,
  chip,
  onToggle,
}: {
  components: DispatchComponent[];
  selected: string[];
  motionSafe: boolean;
  inert: boolean;
  chip: string;
  onToggle: (id: string) => void;
}) {
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const [active, setActive] = React.useState<string | null>(null);
  const ids = components.map((c) => c.id);
  const activeId = active && ids.includes(active) ? active : (ids[0] ?? null);

  const move = (event: React.KeyboardEvent, from: string) => {
    const i = ids.indexOf(from);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = ids.length - 1;
    else return;
    event.preventDefault();
    const target = ids[clamp(to, 0, ids.length - 1)];
    if (target) nodes.current.get(target)?.focus();
  };

  return (
    <div
      role="toolbar"
      aria-label="Affected components"
      className="flex flex-wrap gap-1.5"
    >
      {components.map((c) => {
        const on = selected.includes(c.id);
        return (
          <motion.button
            key={c.id}
            ref={(node) => {
              if (node) nodes.current.set(c.id, node);
              else nodes.current.delete(c.id);
            }}
            type="button"
            aria-pressed={on}
            aria-disabled={inert || undefined}
            aria-label={`${c.name}${c.group ? `, ${c.group}` : ""}, ${on ? "affected" : "not affected"}`}
            tabIndex={activeId === c.id ? 0 : -1}
            onFocus={() => setActive(c.id)}
            onClick={() => {
              if (!inert) onToggle(c.id);
            }}
            onKeyDown={(event) => move(event, c.id)}
            whileTap={motionSafe && !inert ? { scale: 0.96 } : undefined}
            transition={springs.flick}
            className={cn(
              "flex max-w-full items-center gap-1 rounded-full border pr-2.5 pl-1.5 font-medium whitespace-nowrap transition-colors duration-200",
              chip,
              on
                ? "border-[color-mix(in_oklab,var(--accent-bright)_35%,transparent)] bg-cobalt-wash text-cobalt-bright"
                : "border-hairline-strong bg-transparent text-ink-2 hover:bg-surface-2 hover:text-foreground",
              inert ? "cursor-default" : "cursor-pointer",
              FOCUS_RING,
            )}
          >
            <span className="flex size-3.5 shrink-0 items-center justify-center">
              {on ? (
                <Tick animated={motionSafe} />
              ) : (
                <Plus aria-hidden className="size-3 text-ink-3" />
              )}
            </span>
            <span className="truncate">{c.name}</span>
            {c.group ? (
              <span className="hidden font-mono text-[10px] text-ink-3 @min-[48rem]:inline">
                {c.group}
              </span>
            ) : null}
          </motion.button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Previews                                 */
/* ----------------------------------------------------------------------- */

type PreviewProps = {
  draft: DispatchDraft;
  names: string[];
  incident: DispatchIncident;
  sender: string;
  channel: DispatchChannel;
  at: number;
  text: string;
};

function StatusPill({
  status,
  className,
}: {
  status: DispatchStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
      style={{
        color: meta.color,
        borderColor: `color-mix(in oklab, ${meta.color} 40%, transparent)`,
        background: `color-mix(in oklab, ${meta.color} 10%, transparent)`,
      }}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ background: meta.color }}
      />
      {meta.label}
    </span>
  );
}

function Placeholder({ text }: { text: string }) {
  return <span className="text-ink-3 italic">{text}</span>;
}

function PagePreview({ draft, names, incident, at, text }: PreviewProps) {
  const message = draft.message.trim();
  return (
    <div className="flex flex-col gap-2.5 rounded-3 border border-hairline bg-surface-0 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {incident.ref} · incident
          </p>
          <p className="text-[13px] font-semibold text-foreground">
            {incident.title}
          </p>
        </div>
        <StatusPill status={draft.status} />
      </div>
      <div className="flex gap-2.5 border-t border-hairline pt-2.5">
        <div className="flex shrink-0 flex-col items-center pt-1">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ background: STATUS_META[draft.status].color }}
          />
          <span aria-hidden className="mt-1 w-px flex-1 bg-hairline" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-ink-3">
            <span className="font-medium text-foreground">
              {STATUS_META[draft.status].label}
            </span>
            <span className="font-mono tabular-nums">
              {fmtDate(at)} {fmtTime(at)} UTC
            </span>
          </p>
          <p className={cn("mt-1 break-words text-foreground", text)}>
            {message || <Placeholder text="Your message will appear here." />}
          </p>
          <p className="mt-1.5 text-[11px] text-ink-2">
            {names.length ? (
              <>
                <span className="text-ink-3">Affected: </span>
                {joinNames(names)}
              </>
            ) : (
              <span className="text-ink-3">No components marked affected</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function EmailPreview({
  draft,
  names,
  incident,
  sender,
  channel,
  text,
}: PreviewProps) {
  const message = draft.message.trim();
  const meta = STATUS_META[draft.status];
  return (
    <div className="flex flex-col rounded-3 border border-hairline bg-surface-0">
      <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-2 gap-y-1 border-b border-hairline px-3 py-2.5 text-[11px]">
        <span className="text-ink-3">From</span>
        <span className="truncate text-foreground">
          {sender} &lt;status@coldbrook.example&gt;
        </span>
        <span className="text-ink-3">To</span>
        <span className="truncate text-foreground">
          {channel.audience ?? "subscribers"}
        </span>
        <span className="text-ink-3">Subject</span>
        <span className="truncate font-medium text-foreground">
          [{meta.label}] {incident.title}
        </span>
      </div>
      <div className={cn("flex flex-col gap-2.5 px-3 py-3", text)}>
        <p className="text-foreground">
          <span className="font-medium">{meta.label}</span>
          <span className="text-ink-2"> · {meta.lead}.</span>
        </p>
        <p className="break-words text-foreground">
          {message || <Placeholder text="Your message will appear here." />}
        </p>
        <p className="text-[11px] text-ink-2">
          {names.length ? (
            <>
              <span className="text-ink-3">Affected components: </span>
              {joinNames(names)}
            </>
          ) : (
            <span className="text-ink-3">No components marked affected</span>
          )}
        </p>
        <p className="border-t border-hairline pt-2 text-[10px] leading-4 text-ink-3">
          You are receiving this because you subscribe to {sender} updates for{" "}
          {incident.ref}. Reply STOP to unsubscribe.
        </p>
      </div>
    </div>
  );
}

function SmsPreview({ draft, sender, channel, incident, text }: PreviewProps) {
  const limit = channel.limit ?? 160;
  const full = smsText(sender, draft.status, draft.message, incident.ref);
  const shown = truncate(full, limit);
  const over = full.length > limit;
  const hasMessage = draft.message.trim().length > 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2"
        >
          <Smartphone className="size-3" />
        </span>
        <div className="max-w-[88%] min-w-0">
          <p className="mb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {sender} · {channel.audience ?? "subscribers"}
          </p>
          <p
            className={cn(
              "rounded-3 rounded-bl-1 border border-hairline bg-surface-1 px-3 py-2 break-words text-foreground",
              text,
            )}
          >
            {hasMessage ? (
              shown
            ) : (
              <>
                {truncate(full, limit)}
                <Placeholder text=" your message" />
              </>
            )}
          </p>
        </div>
      </div>
      <p
        className={cn(
          "flex items-center gap-2 pl-8 font-mono text-[10px] tracking-[0.08em] uppercase",
          over ? "text-warn" : "text-ink-3",
        )}
      >
        <span className="tabular-nums">
          {full.length} / {limit}
        </span>
        {over ? <span>cut to {limit}</span> : <span>fits in one message</span>}
      </p>
    </div>
  );
}

function ChatPreview({
  draft,
  names,
  incident,
  sender,
  channel,
  at,
  text,
}: PreviewProps) {
  const message = draft.message.trim();
  const meta = STATUS_META[draft.status];
  return (
    <div className="flex flex-col gap-2 rounded-3 border border-hairline bg-surface-0 p-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        {channel.audience ?? "channel"}
      </p>
      <div className="flex gap-2.5">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-2 bg-primary font-mono text-[10px] font-semibold text-primary-foreground"
        >
          {sender
            .split(/\s+/)
            .map((w) => w.charAt(0))
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
            <span className="font-semibold text-foreground">{sender}</span>
            <span className="rounded-1 bg-surface-2 px-1 font-mono text-[9px] tracking-[0.06em] text-ink-3 uppercase">
              app
            </span>
            <span className="font-mono text-[10px] text-ink-3 tabular-nums">
              {fmtTime(at)}
            </span>
          </p>
          <div
            className="mt-1.5 border-l-2 pl-2.5"
            style={{ borderColor: meta.color }}
          >
            <p className="text-[12px] font-semibold text-foreground">
              {meta.label} · {incident.ref} {incident.title}
            </p>
            <p className={cn("mt-1 break-words text-foreground", text)}>
              {message || <Placeholder text="Your message will appear here." />}
            </p>
            {names.length ? (
              <p className="mt-1.5 flex flex-wrap gap-1">
                {names.map((n) => (
                  <span
                    key={n}
                    className="rounded-1 border border-hairline bg-surface-1 px-1.5 py-px text-[10px] text-ink-2"
                  >
                    {n}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

const PREVIEWS: Record<
  DispatchChannelKind,
  (p: PreviewProps) => React.ReactNode
> = {
  page: (p) => <PagePreview {...p} />,
  email: (p) => <EmailPreview {...p} />,
  sms: (p) => <SmsPreview {...p} />,
  chat: (p) => <ChatPreview {...p} />,
};

const CHANNEL_ICON: Record<
  DispatchChannelKind,
  React.ComponentType<{ className?: string }>
> = {
  page: Globe,
  email: Mail,
  sms: Smartphone,
  chat: MessageSquare,
};

/* ----------------------------------------------------------------------- */
/*                               Delivery row                               */
/* ----------------------------------------------------------------------- */

function DeliveryRow({
  channel,
  state,
  animated,
  motionSafe,
  index,
  count,
  row,
  inert,
  onRetry,
}: {
  channel: DispatchChannel;
  state: DispatchDeliveryState;
  /** True for the update dispatched in this session: the bar fills and the tick draws. */
  animated: boolean;
  motionSafe: boolean;
  index: number;
  count: number;
  row: string;
  inert: boolean;
  onRetry: () => void;
}) {
  const Icon = CHANNEL_ICON[channel.kind];
  const scaleX =
    state === "queued"
      ? 0
      : state === "sending"
        ? 0.72
        : state === "failed"
          ? 0.72
          : 1;
  const color =
    state === "failed"
      ? "var(--danger)"
      : state === "delivered"
        ? "var(--success)"
        : "var(--accent-bright)";
  return (
    <motion.li
      initial={
        animated ? { opacity: 0, y: motionSafe ? distances.nudge : 0 } : false
      }
      animate={{ opacity: 1, y: 0 }}
      transition={{
        y: motionSafe
          ? { ...springs.glide, delay: r3(index * cascade(count)) }
          : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter },
      }}
      className={cn("flex items-center gap-2.5", row)}
    >
      <span className="flex w-[5.5rem] shrink-0 items-center gap-1.5 text-xs text-foreground @max-[26rem]:w-[4.25rem]">
        <Icon aria-hidden className="size-3.5 shrink-0 text-ink-3" />
        <span className="truncate">{channel.label}</span>
      </span>
      <span
        aria-hidden
        className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2"
      >
        <motion.span
          className="absolute inset-y-0 left-0 w-full rounded-full"
          style={{ originX: 0, background: color }}
          initial={animated ? { scaleX: 0 } : false}
          animate={{ scaleX }}
          transition={motionSafe && animated ? springs.glide : { duration: 0 }}
        />
      </span>
      <span
        className={cn(
          "flex w-[4.75rem] shrink-0 items-center justify-end gap-1 text-[11px]",
          state === "failed"
            ? "text-danger"
            : state === "delivered"
              ? "text-success"
              : "text-ink-2",
        )}
      >
        {state === "delivered" ? (
          <Tick animated={animated && motionSafe} className="size-3.5" />
        ) : state === "failed" ? (
          <X aria-hidden className="size-3.5" />
        ) : state === "sending" ? (
          <span
            aria-hidden
            className="size-2 rounded-full bg-current motion-safe:animate-pulse"
          />
        ) : null}
        <span>{STATE_WORD[state]}</span>
      </span>
      <span className="flex w-14 shrink-0 justify-end">
        <AnimatePresence initial={false}>
          {state === "failed" ? (
            <motion.button
              key="retry"
              type="button"
              aria-label={`Retry ${channel.label}`}
              aria-disabled={inert || undefined}
              onClick={() => {
                if (!inert) onRetry();
              }}
              initial={{ opacity: 0, scale: motionSafe ? 0.9 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-2 border border-hairline px-2 text-[11px] text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3" />
              Retry
            </motion.button>
          ) : null}
        </AnimatePresence>
      </span>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type LiveMap = Record<string, Record<string, DispatchDeliveryState>>;

/**
 * A composer for one status-page update, with the places it goes beside it.
 * On the left, the status chips are one radio group whose filled indicator
 * slides to the chosen state on `springs.snap`; the affected components are
 * toggle chips whose check draws in on `springs.flick`; the message sits
 * over a character budget whose bar fills on `springs.glide` and turns amber,
 * then red, as it runs out. On the right, one preview per channel — the
 * status page card, the email, the SMS (cut to its limit, with the count) and
 * the chat post — behind a tab strip whose underline glides, each re-rendered
 * from the draft as it is typed.
 *
 * Dispatch posts the update: a delivery row per channel fills its bar on
 * `springs.glide`, ticks in on `springs.flick` as its promise settles, or
 * turns red with a Retry that lands on `springs.snap` when it fails. The
 * posted update rises into the timeline on `springs.glide` while the entries
 * below it glide down to make room. Without an `onDispatch`, a seeded
 * simulator delivers the channels in turn and fails one.
 *
 * Arrows move and choose within the status group, move along the component
 * chips (Space or Enter toggles) and along the preview tabs; Ctrl or Cmd and
 * Enter dispatches from anywhere in the surface. Every change is announced.
 * Under reduced motion nothing slides or draws — indicators, bars, ticks and
 * entries appear in place — and every state is still reached and read out.
 */
export function StatusDispatch({
  components = defaultDispatchComponents,
  channels = defaultDispatchChannels,
  incident = defaultDispatchIncident,
  sender = "Coldbrook Status",
  updates,
  defaultUpdates = defaultDispatchUpdates,
  onUpdatesChange,
  onDispatch,
  onRetryChannel,
  onDelivery,
  value,
  defaultValue = defaultDispatchDraft,
  onChange,
  maxLength = 280,
  previewChannel = "page",
  density = "cozy",
  timeline = "side",
  now = defaultDispatchNow,
  status = "ready",
  onRetry,
  title = "Post an update",
  label,
  height = 540,
  disabled = false,
  className,
}: StatusDispatchProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const messageId = `${uid}-message`;
  const budgetId = `${uid}-budget`;
  const d = DENSITY[density] ?? DENSITY.cozy;

  const [ownDraft, setOwnDraft] = React.useState<DispatchDraft>(defaultValue);
  const draft = value ?? ownDraft;
  const [ownUpdates, setOwnUpdates] =
    React.useState<DispatchUpdate[]>(defaultUpdates);
  const list = updates ?? ownUpdates;

  /** Delivery states for updates dispatched in this session, by update id. */
  const [live, setLive] = React.useState<LiveMap>({});
  const liveRef = React.useRef<LiveMap>({});
  const [tab, setTab] = React.useState<string>(previewChannel);
  const [tabDir, setTabDir] = React.useState(1);
  // The host's first-shown channel wins again whenever it changes.
  const [seenPreview, setSeenPreview] = React.useState(previewChannel);
  if (seenPreview !== previewChannel) {
    setSeenPreview(previewChannel);
    setTab(previewChannel);
  }
  const [announcement, setAnnouncement] = React.useState("");
  const [overSaid, setOverSaid] = React.useState(false);

  const alive = React.useRef(true);
  const timers = React.useRef(new Set<number>());
  const seq = React.useRef(0);
  const listRef = React.useRef(list);
  const tabNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const messageRef = React.useRef<HTMLTextAreaElement | null>(null);

  // "Cmd" only once the client knows it is on a Mac; the server says "Ctrl".
  const mac = React.useSyncExternalStore(noopSubscribe, isMac, () => false);

  React.useEffect(() => {
    listRef.current = list;
  }, [list]);

  React.useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  const ready = status === "ready";
  const inert = disabled || !ready;

  /* -------------------------------- data ------------------------------- */

  const byId = new Map(components.map((c) => [c.id, c]));
  const names = draft.components
    .map((id) => byId.get(id)?.name)
    .filter((n): n is string => typeof n === "string");
  const length = draft.message.length;
  const over = length > maxLength;
  const ratio = maxLength > 0 ? clamp(length / maxLength, 0, 1) : 0;
  const budgetTone: "danger" | "warn" | "ink" = over
    ? "danger"
    : ratio >= 0.9
      ? "warn"
      : "ink";
  const channelIds = channels.map((c) => c.id);
  const activeTab = channelIds.includes(tab) ? tab : (channelIds[0] ?? "");
  const activeChannel = channels.find((c) => c.id === activeTab) ?? null;

  const sorted = [...list].sort((a, b) => b.at - a.at);
  const latest = sorted[0] ?? null;
  const deliveriesOf = (u: DispatchUpdate) => live[u.id] ?? u.deliveries ?? {};
  const latestDeliveries = latest ? deliveriesOf(latest) : {};
  const sending =
    latest !== null &&
    live[latest.id] !== undefined &&
    Object.values(latestDeliveries).some((s) => s === "sending");
  const canDispatch =
    !inert && draft.message.trim().length > 0 && !over && !sending;

  /* ------------------------------- helpers ----------------------------- */

  const say = (text: string) => setAnnouncement(text);

  const later = (ms: number, fn: () => void) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      if (alive.current) fn();
    }, ms);
    timers.current.add(t);
  };

  const commitDraft = (next: DispatchDraft, field: DispatchDraftField) => {
    if (value === undefined) setOwnDraft(next);
    onChange?.(next, field);
  };

  const setStatus = (s: DispatchStatus) => {
    if (inert || s === draft.status) return;
    commitDraft({ ...draft, status: s }, "status");
    say(`Status ${STATUS_META[s].label}.`);
  };

  const toggleComponent = (id: string) => {
    if (inert) return;
    const on = draft.components.includes(id);
    const nextIds = on
      ? draft.components.filter((x) => x !== id)
      : [...draft.components, id];
    commitDraft({ ...draft, components: nextIds }, "components");
    const name = byId.get(id)?.name ?? id;
    say(
      `${name} ${on ? "removed" : "added"}. ${nextIds.length} of ${components.length} components affected.`,
    );
  };

  const setMessage = (text: string) => {
    if (inert) return;
    commitDraft({ ...draft, message: text }, "message");
    const nowOver = text.length > maxLength;
    if (nowOver && !overSaid) {
      setOverSaid(true);
      say(
        `Over the ${maxLength} character budget by ${text.length - maxLength}.`,
      );
    } else if (!nowOver && overSaid) {
      setOverSaid(false);
      say("Back within the character budget.");
    }
  };

  /* ------------------------------ delivery ----------------------------- */

  const settle = (
    update: DispatchUpdate,
    channelId: string,
    state: DispatchDeliveryState,
  ) => {
    if (!alive.current) return;
    const current = liveRef.current[update.id] ?? {};
    const nextRow = { ...current, [channelId]: state };
    liveRef.current = { ...liveRef.current, [update.id]: nextRow };
    setLive(liveRef.current);
    onDelivery?.(update, channelId, state);
    const ch = channels.find((c) => c.id === channelId);
    const name = ch?.label ?? channelId;
    const states = Object.values(nextRow);
    const done = states.every((s) => s === "delivered" || s === "failed");
    if (done) {
      const delivered = states.filter((s) => s === "delivered").length;
      const failed = states.length - delivered;
      say(
        `${name} ${STATE_WORD[state]}. Update posted: ${delivered} of ${states.length} channels delivered${failed ? `, ${failed} failed. Retry available.` : "."}`,
      );
    } else {
      say(
        `${name} ${STATE_WORD[state]}${state === "failed" ? ". Retry available." : "."}`,
      );
    }
  };

  const watch = (
    update: DispatchUpdate,
    channelId: string,
    p: Promise<unknown> | undefined,
  ) => {
    if (!p) {
      settle(update, channelId, "delivered");
      return;
    }
    p.then(
      () => settle(update, channelId, "delivered"),
      () => settle(update, channelId, "failed"),
    );
  };

  /** The default: channels land in turn, and one of them, seeded, does not. */
  const simulate = (update: DispatchUpdate, n: number): DispatchReceipts => {
    const rand = mulberry32(1653 + n);
    const failing =
      n === 1 || rand() < 0.35
        ? (channels[Math.floor(rand() * channels.length)]?.id ?? null)
        : null;
    const out: DispatchReceipts = {};
    channels.forEach((ch, i) => {
      out[ch.id] = new Promise<void>((resolve, reject) => {
        later(520 + i * 380 + Math.round(rand() * 160), () =>
          ch.id === failing
            ? reject(new Error(`${ch.label} did not accept the update`))
            : resolve(),
        );
      });
    });
    return out;
  };

  const dispatch = () => {
    if (!canDispatch) return;
    seq.current += 1;
    const n = seq.current;
    const update: DispatchUpdate = {
      id: `upd-${now.toString(36)}-${n}`,
      at: now,
      status: draft.status,
      components: [...draft.components],
      message: draft.message.trim(),
    };
    const row: Record<string, DispatchDeliveryState> = {};
    for (const ch of channels) row[ch.id] = "sending";
    liveRef.current = { ...liveRef.current, [update.id]: row };
    setLive(liveRef.current);
    const nextList = [...listRef.current, update];
    listRef.current = nextList;
    if (updates === undefined) setOwnUpdates(nextList);
    onUpdatesChange?.(nextList);
    commitDraft({ ...draft, message: "" }, "message");
    setOverSaid(false);
    say(
      `Dispatching ${STATUS_META[update.status].label} update to ${channels.length} channels.`,
    );
    const receipts = onDispatch?.(update, channels) ?? simulate(update, n);
    for (const ch of channels) watch(update, ch.id, receipts[ch.id]);
  };

  const retryChannel = (update: DispatchUpdate, channel: DispatchChannel) => {
    if (inert) return;
    const current = liveRef.current[update.id] ?? {};
    liveRef.current = {
      ...liveRef.current,
      [update.id]: { ...current, [channel.id]: "sending" },
    };
    setLive(liveRef.current);
    say(`Retrying ${channel.label}.`);
    const p =
      onRetryChannel?.(channel, update) ??
      new Promise<void>((resolve) => later(700, resolve));
    watch(update, channel.id, p);
  };

  /* ------------------------------- keyboard ---------------------------- */

  const onRootKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey) &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      dispatch();
    }
  };

  const selectTab = (id: string) => {
    const from = channelIds.indexOf(activeTab);
    const to = channelIds.indexOf(id);
    setTabDir(to >= from ? 1 : -1);
    setTab(id);
  };

  const onTabKey = (event: React.KeyboardEvent, id: string) => {
    const i = channelIds.indexOf(id);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = channelIds.length - 1;
    else return;
    event.preventDefault();
    const target = channelIds[clamp(to, 0, channelIds.length - 1)];
    if (!target) return;
    tabNodes.current.get(target)?.focus();
    selectTab(target);
  };

  /* -------------------------------- render ----------------------------- */

  const side = timeline === "side";
  const modKey = mac ? "Cmd" : "Ctrl";
  const smallLabel =
    "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";

  const scrollCol = side
    ? "@min-[64rem]:min-h-0 @min-[64rem]:overflow-y-auto @min-[64rem]:overscroll-contain"
    : "";

  const composer = (
    <form
      aria-label="Composer"
      onSubmit={(event) => {
        event.preventDefault();
        dispatch();
      }}
      className={cn(
        "flex min-w-0 flex-col border-hairline",
        "border-b @min-[40rem]:border-r @min-[40rem]:border-b-0",
        scrollCol,
        d.pad,
        d.gap,
      )}
    >
      <div className="flex flex-col gap-1.5">
        <p className={smallLabel}>Status</p>
        <StatusPicker
          value={draft.status}
          motionSafe={motionSafe}
          uid={uid}
          inert={inert}
          chip={d.chip}
          onChange={setStatus}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className={cn("flex items-baseline justify-between", smallLabel)}>
          <span>Affected components</span>
          <span className="tabular-nums">
            {draft.components.length} of {components.length}
          </span>
        </p>
        <ComponentChips
          components={components}
          selected={draft.components}
          motionSafe={motionSafe}
          inert={inert}
          chip={d.chip}
          onToggle={toggleComponent}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <label htmlFor={messageId} className={smallLabel}>
          Message
        </label>
        <div
          className={cn(
            "flex flex-col overflow-hidden rounded-2 border bg-surface-1 transition-colors",
            over ? "border-danger" : "border-hairline-strong",
            "focus-within:border-ring",
          )}
        >
          <textarea
            id={messageId}
            ref={messageRef}
            rows={d.rows}
            value={draft.message}
            readOnly={inert}
            aria-disabled={inert || undefined}
            aria-describedby={`${budgetId} ${hintId}`}
            aria-invalid={over || undefined}
            placeholder="What changed, and what happens next?"
            onChange={(event) => setMessage(event.currentTarget.value)}
            className={cn(
              "w-full resize-none bg-transparent px-2.5 py-2 text-foreground outline-none placeholder:text-ink-3 read-only:cursor-default",
              d.text,
            )}
          />
          <span
            aria-hidden
            className="relative block h-0.5 w-full bg-[color-mix(in_oklab,var(--hairline)_60%,transparent)]"
          >
            <motion.span
              className="absolute inset-y-0 left-0 w-full"
              style={{
                originX: 0,
                background:
                  budgetTone === "danger"
                    ? "var(--danger)"
                    : budgetTone === "warn"
                      ? "var(--warn)"
                      : "var(--ink-3)",
              }}
              initial={false}
              animate={{ scaleX: ratio }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            />
          </span>
        </div>
        <p
          id={budgetId}
          className={cn(
            "flex items-center justify-between font-mono text-[10px] tracking-[0.08em] uppercase",
            budgetTone === "danger"
              ? "text-danger"
              : budgetTone === "warn"
                ? "text-warn"
                : "text-ink-3",
          )}
        >
          <span className="tabular-nums">
            {length} / {maxLength}
            {over ? ` · ${length - maxLength} over` : ""}
          </span>
          <span className="hidden @min-[24rem]:inline">
            {modKey}+Enter dispatches
          </span>
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[11px] text-ink-3">
          {channels.length} channel{channels.length === 1 ? "" : "s"} ·{" "}
          {sending ? "sending" : `stamped ${fmtTime(now)} UTC`}
        </p>
        <motion.button
          type="submit"
          aria-disabled={!canDispatch || undefined}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          whileTap={motionSafe && canDispatch ? { scale: 0.97 } : undefined}
          transition={springs.flick}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity",
            !canDispatch && "cursor-default opacity-50",
            FOCUS_RING,
          )}
        >
          <Send aria-hidden className="size-3.5" />
          {sending ? "Dispatching" : "Dispatch"}
        </motion.button>
      </div>
    </form>
  );

  const previews = (
    <section
      aria-label="Previews and deliveries"
      className={cn("flex min-w-0 flex-col", scrollCol, d.gap, d.pad)}
    >
      <div className="flex flex-col gap-2">
        <p className={cn("flex items-baseline justify-between", smallLabel)}>
          <span>Preview</span>
          {activeChannel?.audience ? (
            <span className="truncate normal-case">
              {activeChannel.audience}
            </span>
          ) : null}
        </p>
        <div
          role="tablist"
          aria-label="Preview channel"
          aria-orientation="horizontal"
          className="relative flex border-b border-hairline"
        >
          {channels.map((ch) => {
            const selected = ch.id === activeTab;
            const Icon = CHANNEL_ICON[ch.kind];
            return (
              <button
                key={ch.id}
                ref={(node) => {
                  if (node) tabNodes.current.set(ch.id, node);
                  else tabNodes.current.delete(ch.id);
                }}
                type="button"
                role="tab"
                id={`${uid}-tab-${ch.id}`}
                aria-selected={selected}
                aria-controls={`${uid}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(ch.id)}
                onKeyDown={(event) => onTabKey(event, ch.id)}
                className={cn(
                  "relative -mb-px flex min-w-0 items-center gap-1.5 px-2.5 font-medium whitespace-nowrap transition-colors @min-[48rem]:px-3",
                  d.tab,
                  selected
                    ? "text-foreground"
                    : "text-ink-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <Icon aria-hidden className="size-3.5 shrink-0 text-ink-3" />
                <span className="truncate">{ch.label}</span>
                {selected ? (
                  <motion.span
                    aria-hidden
                    layoutId={motionSafe ? `${uid}-tab-ind` : undefined}
                    transition={springs.glide}
                    className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-foreground"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        <div
          role="tabpanel"
          id={`${uid}-panel`}
          aria-labelledby={`${uid}-tab-${activeTab}`}
          tabIndex={0}
          className={cn("relative overflow-hidden rounded-3", FOCUS_RING)}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {activeChannel ? (
              <motion.div
                key={activeChannel.id}
                initial={{
                  opacity: 0,
                  x: motionSafe ? tabDir * distances.step : 0,
                }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        ...springs.glide,
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                      }
                    : { duration: durations.fast }
                }
              >
                {PREVIEWS[activeChannel.kind]({
                  draft,
                  names,
                  incident,
                  sender,
                  channel: activeChannel,
                  at: now,
                  text: d.text,
                })}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className={cn("flex items-baseline justify-between", smallLabel)}>
          <span>Deliveries</span>
          {latest ? (
            <span className="tabular-nums">
              {STATUS_META[latest.status].label} · {fmtTime(latest.at)}
            </span>
          ) : null}
        </p>
        {latest ? (
          <ul
            aria-label="Deliveries of the latest update"
            className="flex flex-col"
          >
            {channels.map((ch, i) => (
              <DeliveryRow
                key={`${latest.id}-${ch.id}`}
                channel={ch}
                state={latestDeliveries[ch.id] ?? "queued"}
                animated={live[latest.id] !== undefined}
                motionSafe={motionSafe}
                index={i}
                count={channels.length}
                row={d.row}
                inert={inert}
                onRetry={() => retryChannel(latest, ch)}
              />
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-ink-3">
            Nothing posted yet · the first dispatch lands here.
          </p>
        )}
      </div>
    </section>
  );

  const timelineColumn = (
    <section
      aria-label="Timeline"
      className={cn(
        "flex min-w-0 flex-col border-hairline",
        "border-t @min-[40rem]:col-span-2",
        side &&
          "@min-[64rem]:col-span-1 @min-[64rem]:border-t-0 @min-[64rem]:border-l",
        scrollCol,
        d.pad,
      )}
    >
      <p className={cn("mb-2 flex items-baseline justify-between", smallLabel)}>
        <span>Timeline</span>
        <span className="tabular-nums">
          {sorted.length} update{sorted.length === 1 ? "" : "s"}
        </span>
      </p>
      {sorted.length === 0 ? (
        <p className="text-[11px] text-ink-3">No updates posted yet.</p>
      ) : (
        <ol
          aria-label="Posted updates, newest first"
          className="relative flex flex-col"
        >
          <span
            aria-hidden
            className="absolute top-2 bottom-2 left-[5px] w-px bg-hairline"
          />
          <AnimatePresence initial={false}>
            {sorted.map((u) => {
              const dl = deliveriesOf(u);
              const states = channels.map((ch) => dl[ch.id] ?? "queued");
              const delivered = states.filter((s) => s === "delivered").length;
              const failed = states.filter((s) => s === "failed").length;
              const busy = states.some((s) => s === "sending");
              const meta = STATUS_META[u.status];
              const uNames = u.components
                .map((id) => byId.get(id)?.name)
                .filter((n): n is string => typeof n === "string");
              return (
                <motion.li
                  key={u.id}
                  layout={motionSafe ? "position" : false}
                  initial={{ opacity: 0, y: motionSafe ? distances.shift : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{
                    layout: springs.glide,
                    y: motionSafe ? springs.glide : { duration: 0 },
                    opacity: { duration: durations.base, ease: easings.enter },
                  }}
                  className="relative flex gap-3 py-2 pl-5"
                >
                  <span
                    aria-hidden
                    className="absolute top-[13px] left-0 size-[11px] rounded-full border-2 border-card"
                    style={{ background: meta.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
                      <span className="font-medium text-foreground">
                        {meta.label}
                      </span>
                      <span className="font-mono text-ink-3 tabular-nums">
                        {fmtTime(u.at)}
                      </span>
                      <span
                        className={cn(
                          "ml-auto font-mono text-[10px] tabular-nums",
                          failed
                            ? "text-danger"
                            : busy
                              ? "text-ink-2"
                              : "text-ink-3",
                        )}
                      >
                        {busy
                          ? `${delivered}/${states.length} sending`
                          : failed
                            ? `${failed} failed`
                            : `${delivered}/${states.length} delivered`}
                      </span>
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 break-words text-foreground",
                        d.text,
                      )}
                    >
                      {u.message}
                    </p>
                    {uNames.length ? (
                      <p className="mt-1 truncate text-[11px] text-ink-3">
                        {uNames.join(" · ")}
                      </p>
                    ) : null}
                    <p aria-hidden className="mt-1.5 flex gap-1">
                      {channels.map((ch, i) => {
                        const s = states[i] ?? "queued";
                        return (
                          <span
                            key={ch.id}
                            title={`${ch.label}: ${STATE_WORD[s]}`}
                            className={cn(
                              "h-1 w-4 rounded-full transition-colors duration-200",
                              s === "sending" && "motion-safe:animate-pulse",
                            )}
                            style={{
                              background:
                                s === "delivered"
                                  ? "var(--success)"
                                  : s === "failed"
                                    ? "var(--danger)"
                                    : s === "sending"
                                      ? "var(--accent-bright)"
                                      : "var(--hairline-strong)",
                            }}
                          />
                        );
                      })}
                    </p>
                    <p className="sr-only">
                      {channels
                        .map(
                          (ch, i) =>
                            `${ch.label} ${STATE_WORD[states[i] ?? "queued"]}`,
                        )
                        .join(", ")}
                    </p>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );

  const skeleton = (
    <div
      aria-busy="true"
      className={cn(
        "grid flex-1 grid-cols-1 @min-[40rem]:grid-cols-2",
        side && "@min-[64rem]:grid-cols-[5fr_5fr_4fr]",
      )}
    >
      <span className="sr-only">Loading the components and channels</span>
      <div
        aria-hidden
        className={cn(
          "flex flex-col border-b border-hairline @min-[40rem]:border-r @min-[40rem]:border-b-0",
          d.pad,
          d.gap,
        )}
      >
        <span className="h-3 w-16 rounded-full bg-surface-2 motion-safe:animate-pulse" />
        <span className="h-9 rounded-3 bg-surface-2 motion-safe:animate-pulse" />
        <span className="h-3 w-28 rounded-full bg-surface-2 motion-safe:animate-pulse" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className="h-7 rounded-full bg-surface-2 motion-safe:animate-pulse"
              style={{
                width: 64 + ((i * 29) % 40),
                animationDelay: `${i * 70}ms`,
              }}
            />
          ))}
        </div>
        <span className="h-3 w-16 rounded-full bg-surface-2 motion-safe:animate-pulse" />
        <span className="h-24 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
      </div>
      <div aria-hidden className={cn("flex flex-col", d.pad, d.gap)}>
        <span className="h-3 w-16 rounded-full bg-surface-2 motion-safe:animate-pulse" />
        <span className="h-9 w-3/4 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
        <span className="h-32 rounded-3 bg-surface-2 motion-safe:animate-pulse" />
        <span className="h-3 w-20 rounded-full bg-surface-2 motion-safe:animate-pulse" />
        {Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className="h-5 rounded-2 bg-surface-2 motion-safe:animate-pulse"
            style={{ animationDelay: `${i * 110}ms` }}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      aria-describedby={hintId}
      onKeyDown={onRootKey}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <p id={hintId} className="sr-only">
        Control or Command and Enter dispatches the update to every channel.
      </p>

      <header
        className={cn(
          "flex shrink-0 items-center justify-between gap-3 border-b border-hairline",
          d.pad,
        )}
      >
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-2">
            <span className="font-mono text-ink-3">{incident.ref}</span> ·{" "}
            {incident.title}
          </p>
        </div>
        {ready && latest ? (
          <StatusPill status={latest.status} className="shrink-0" />
        ) : null}
      </header>

      {status === "loading" ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {skeleton}
        </div>
      ) : status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The components didn&apos;t load.
          </p>
          <p className="max-w-xs text-[12px] text-ink-2">
            An update cannot name what it affects until they do.
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      ) : components.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
          <Inbox aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-foreground">No components to report on.</p>
          <p className="max-w-xs text-[12px] text-ink-2">
            Add the services the {sender} page covers, and updates can name what
            each one affects.
          </p>
        </div>
      ) : (
        <LayoutGroup id={uid}>
          <div
            className={cn(
              "grid min-h-0 flex-1 grid-cols-1 overflow-y-auto overscroll-contain @min-[40rem]:grid-cols-2",
              side &&
                "@min-[64rem]:grid-cols-[5fr_5fr_4fr] @min-[64rem]:grid-rows-[minmax(0,1fr)] @min-[64rem]:overflow-hidden",
            )}
          >
            {composer}
            {previews}
            {timelineColumn}
          </div>
        </LayoutGroup>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
