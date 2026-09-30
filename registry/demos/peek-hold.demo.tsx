"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  PeekHold,
  type PeekHoldAction,
  type PeekHoldItem,
} from "@/registry/ui/peek-hold";

export const tweaks = defineTweaks({
  delay: {
    kind: "range",
    label: "Delay",
    default: 450,
    min: 200,
    max: 900,
    step: 50,
    unit: "ms",
  },
  lift: {
    kind: "range",
    label: "Lift",
    default: 12,
    min: 0,
    max: 24,
    step: 2,
    unit: "px",
  },
  blur: {
    kind: "range",
    label: "Blur",
    default: 6,
    min: 0,
    max: 12,
    step: 1,
    unit: "px",
  },
  actions: {
    kind: "choice",
    label: "Actions",
    default: "list",
    options: ["list", "row"],
    names: { list: "List", row: "Row" },
  },
});

type Thread = {
  id: string;
  from: string;
  time: string;
  subject: string;
  body: string;
};

/** The Fieldline Mail inbox. */
const THREADS: Thread[] = [
  {
    id: "coldbrook",
    from: "Coldbrook Bank",
    time: "09:14",
    subject: "Your March statement is ready",
    body: "Your statement for March is ready to view. Spending was 12% lower than February, and round-ups moved 38.40 to Savings.",
  },
  {
    id: "gaugeworks",
    from: "Gaugeworks",
    time: "08:52",
    subject: "Uptime report: 99.98% in May",
    body: "Two short incidents this month, both in the eu-west region, both resolved inside four minutes. The full timeline is attached.",
  },
  {
    id: "fernworks",
    from: "Fernworks",
    time: "Tue",
    subject: "Order FW-4410 has shipped",
    body: "Three ferns and a bag of bark mix are on their way. Expect them Thursday; the courier will leave them at the door.",
  },
  {
    id: "waylight",
    from: "Waylight Pay",
    time: "Mon",
    subject: "Payout of 1,240.00 sent",
    body: "We sent 1,240.00 to the account ending 0412. It usually lands within one working day.",
  },
  {
    id: "basinworks",
    from: "Basinworks",
    time: "Sun",
    subject: "Invoice 2291 for May",
    body: "Invoice 2291 for 86.20 is attached and due on the 14th. Nothing changes if you pay by direct debit.",
  },
];

const icon = (d: string) => (
  <svg
    viewBox="0 0 16 16"
    className="size-4"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
);

const ICONS = {
  open: icon("M6 3.5H3.5v9h9V10M9 3.5h3.5V7M12.5 3.5 7.5 8.5"),
  reply: icon("M6.5 4 3 7.5 6.5 11M3 7.5h6.5a3.5 3.5 0 0 1 3.5 3.5v1"),
  flag: icon("M4 14V2.5M4 3h7.5l-1.8 2.75L11.5 8.5H4"),
  read: icon("M2.5 4.5h11v7h-11zM2.5 4.5 8 9l5.5-4.5"),
};

const VERBS: Record<string, string> = {
  open: "opened",
  reply: "replying",
  flag: "flagged",
  unflag: "unflagged",
  read: "marked read",
  unread: "marked unread",
};

type Status =
  | { kind: "idle" }
  | { kind: "peek"; id: string }
  | { kind: "closed"; id: string }
  | { kind: "did"; verb: string; id: string };

/**
 * The Fieldline Mail inbox: hold a thread to read it without opening it,
 * then slide to reply, flag it or change its read state.
 */
export function PeekHoldDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [flagged, setFlagged] = React.useState<ReadonlySet<string>>(
    () => new Set(["waylight"]),
  );
  const [unread, setUnread] = React.useState<ReadonlySet<string>>(
    () => new Set(["coldbrook", "gaugeworks"]),
  );
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });

  const toggle = (
    set: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>,
    id: string,
    on: boolean,
  ) =>
    set((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const items: PeekHoldItem[] = THREADS.map((t) => ({
    id: t.id,
    title: t.from,
    subtitle: t.subject,
    meta: t.time,
    leading: unread.has(t.id) ? (
      <span className="size-2 rounded-full bg-cobalt-bright">
        <span className="sr-only">Unread</span>
      </span>
    ) : null,
    badge: flagged.has(t.id) ? (
      <span className="inline-flex text-warn">
        <span aria-hidden>{ICONS.flag}</span>
        <span className="sr-only">Flagged</span>
      </span>
    ) : undefined,
    preview: t.body,
  }));

  const menu = (item: PeekHoldItem): PeekHoldAction[] => [
    { id: "open", label: "Open", icon: ICONS.open },
    { id: "reply", label: "Reply", icon: ICONS.reply },
    flagged.has(item.id)
      ? { id: "unflag", label: "Unflag", icon: ICONS.flag }
      : { id: "flag", label: "Flag", icon: ICONS.flag },
    unread.has(item.id)
      ? { id: "read", label: "Mark read", icon: ICONS.read }
      : { id: "unread", label: "Mark unread", icon: ICONS.read },
  ];

  const onAction = (action: string, id: string) => {
    if (action === "flag" || action === "unflag") {
      toggle(setFlagged, id, action === "flag");
    }
    if (action === "read" || action === "unread" || action === "open") {
      toggle(setUnread, id, action === "unread");
    }
    setStatus({ kind: "did", verb: VERBS[action] ?? action, id });
  };

  const who = (id: string) =>
    THREADS.find((t) => t.id === id)?.from.toLowerCase() ?? id;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PeekHold
        label="Inbox"
        items={items}
        menu={menu}
        onOpen={(id) => {
          toggle(setUnread, id, false);
          setStatus({ kind: "did", verb: "opened", id });
        }}
        onAction={onAction}
        onPeekChange={(id) =>
          setStatus((prev) =>
            id !== null
              ? { kind: "peek", id }
              : prev.kind === "peek"
                ? { kind: "closed", id: prev.id }
                : prev,
          )
        }
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {status.kind === "idle" ? (
            <>
              <span className="text-signal">hold a row to peek</span> ·
              shift+f10 from the keyboard
            </>
          ) : status.kind === "peek" ? (
            <>
              <span className="text-signal">peeking</span> · {who(status.id)}
            </>
          ) : status.kind === "closed" ? (
            <>
              <span className="text-signal">peek closed</span> · nothing changed
            </>
          ) : (
            <>
              <span className="text-signal">{status.verb}</span> ·{" "}
              {who(status.id)}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
