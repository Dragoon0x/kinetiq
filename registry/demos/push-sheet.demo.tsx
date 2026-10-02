"use client";

import * as React from "react";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Plus,
} from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { PushSheet, type PushSheetItem } from "@/registry/ui/push-sheet";

export const tweaks = defineTweaks({
  push: {
    kind: "range",
    label: "Push",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  snaps: {
    kind: "choice",
    label: "Snaps",
    default: "half-full",
    options: ["half-full", "full", "thirds"],
    names: { "half-full": "Half + full", full: "Full", thirds: "Thirds" },
  },
  dim: {
    kind: "range",
    label: "Dim",
    default: 0.35,
    min: 0,
    max: 0.8,
    step: 0.05,
  },
});

const CONTACTS = [
  {
    id: "ines",
    name: "Ines Okafor",
    handle: "@ines",
    tint: "var(--accent-bright)",
  },
  {
    id: "tomas",
    name: "Tomas Reyes",
    handle: "@tomasr",
    tint: "var(--signal)",
  },
  {
    id: "amara",
    name: "Amara Lindqvist",
    handle: "@amara",
    tint: "var(--warn)",
  },
  { id: "kenji", name: "Kenji Mori", handle: "@kenji", tint: "var(--success)" },
  {
    id: "priya",
    name: "Priya Natarajan",
    handle: "@priya",
    tint: "var(--danger)",
  },
] as const;

type ContactId = (typeof CONTACTS)[number]["id"];

const RECENT = [
  {
    id: "r1",
    label: "Basinworks Coffee",
    meta: "Today, 08:14",
    amount: "−£4.20",
    out: true,
  },
  {
    id: "r2",
    label: "From Tomas Reyes",
    meta: "Yesterday",
    amount: "+£36.00",
    out: false,
  },
  {
    id: "r3",
    label: "Fieldline Rail",
    meta: "Mon",
    amount: "−£12.80",
    out: true,
  },
  {
    id: "r4",
    label: "Gaugeworks Market",
    meta: "Sun",
    amount: "−£61.45",
    out: true,
  },
] as const;

const FIRST_STOP: Record<string, string> = {
  "half-full": "half height",
  full: "full height",
  thirds: "one third height",
};

const money = (n: number) => `£${n.toFixed(2)}`;

const FIELD =
  "h-10 w-full rounded-2 border border-hairline-strong bg-background px-3 text-sm text-foreground outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const PRIMARY =
  "inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-2 bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50";
const ROW =
  "flex w-full cursor-pointer items-center gap-3 rounded-2 px-2 py-2 text-left transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

function Dot({ name, tint }: { name: string; tint: string }) {
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
      style={{
        color: tint,
        background: `color-mix(in oklab, ${tint} 16%, transparent)`,
      }}
    >
      {name
        .split(" ")
        .map((w) => w.charAt(0))
        .join("")}
    </span>
  );
}

/**
 * Waylight Pay: send money from the home screen. The send sheet rises and
 * the page steps back; choosing a recipient stacks a second sheet on top,
 * and the send sheet steps back the same way.
 */
export function PushSheetDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [stack, setStack] = React.useState<string[]>([]);
  const [stop, setStop] = React.useState<string>(
    FIRST_STOP[values.snaps ?? "half-full"] ?? "half height",
  );
  const [to, setTo] = React.useState<ContactId>("ines");
  const [amount, setAmount] = React.useState("120");
  const [note, setNote] = React.useState("");
  const [done, setDone] = React.useState<string | null>(null);

  const contact = CONTACTS.find((c) => c.id === to) ?? CONTACTS[0];
  const value = Math.max(0, Number.parseFloat(amount) || 0);

  const sheets: PushSheetItem[] = [
    {
      id: "send",
      title: "Send money",
      description: "From Coldbrook Bank ·· 4417",
      content: (api) => (
        <div className="flex flex-col gap-4 pb-4">
          <button
            type="button"
            className={cn(ROW, "border border-hairline")}
            onClick={() => api.open("recipients")}
          >
            <Dot name={contact.name} tint={contact.tint} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {contact.name}
              </span>
              <span className="block truncate text-xs text-ink-3">
                {contact.handle}
              </span>
            </span>
            <span className="flex items-center gap-1 text-xs text-ink-3">
              Change
              <ChevronRight aria-hidden className="size-4" />
            </span>
          </button>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-ink-2">Amount</span>
            <input
              className={cn(FIELD, "font-mono tabular-nums")}
              inputMode="decimal"
              value={amount}
              onChange={(e) =>
                setAmount(e.currentTarget.value.replace(/[^0-9.]/g, ""))
              }
            />
          </label>
          <div className="flex gap-2">
            {["20", "50", "120"].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAmount(n)}
                className={cn(
                  "inline-flex h-8 flex-1 cursor-pointer items-center justify-center rounded-full border font-mono text-xs tabular-nums transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  amount === n
                    ? "border-transparent bg-cobalt-wash text-cobalt-bright"
                    : "border-hairline text-ink-2 hover:bg-surface-2",
                )}
              >
                £{n}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-ink-2">Note</span>
            <input
              className={FIELD}
              placeholder="What it's for"
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
            />
          </label>
          <button
            type="button"
            className={PRIMARY}
            disabled={value <= 0}
            onClick={() => api.open("review")}
          >
            Review
          </button>
        </div>
      ),
    },
    {
      id: "recipients",
      title: "Choose recipient",
      description: "Recent and saved",
      content: (api) => (
        <ul role="list" className="flex flex-col gap-0.5 pb-4">
          {CONTACTS.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={ROW}
                aria-pressed={c.id === to}
                onClick={() => {
                  setTo(c.id);
                  api.close("recipients");
                }}
              >
                <Dot name={c.name} tint={c.tint} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {c.name}
                  </span>
                  <span className="block truncate text-xs text-ink-3">
                    {c.handle}
                  </span>
                </span>
                {c.id === to ? (
                  <Check aria-hidden className="size-4 text-cobalt-bright" />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "review",
      title: "Review transfer",
      description: "Check it before it goes",
      content: (api) => (
        <div className="flex flex-col gap-4 pb-4">
          <dl className="divide-y divide-hairline rounded-2 border border-hairline text-sm">
            {[
              ["To", contact.name],
              ["Amount", money(value)],
              ["Fee", money(0)],
              ["Arrives", "In seconds"],
              ...(note ? [["Note", note]] : []),
            ].map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <dt className="text-ink-3">{k}</dt>
                <dd className="truncate font-medium tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            className={PRIMARY}
            onClick={() => {
              setDone(`sent ${money(value)} to ${contact.name}`);
              api.close("send");
            }}
          >
            Send {money(value)}
          </button>
        </div>
      ),
    },
    {
      id: "request",
      title: "Request money",
      description: "Share a link anyone can pay",
      content: (api) => (
        <div className="flex flex-col gap-4 pb-4">
          <p className="rounded-2 border border-hairline bg-surface-2 px-3 py-2.5 font-mono text-xs break-all text-ink-2">
            waylight.pay/r/dj-7f3k
          </p>
          <button
            type="button"
            className={PRIMARY}
            onClick={() => {
              setDone("request link copied");
              api.close();
            }}
          >
            Copy link
          </button>
        </div>
      ),
    },
    {
      id: "topup",
      title: "Top up",
      description: "From Coldbrook Bank ·· 4417",
      content: (api) => (
        <ul role="list" className="flex flex-col gap-0.5 pb-4">
          {[50, 100, 250].map((n) => (
            <li key={n}>
              <button
                type="button"
                className={ROW}
                onClick={() => {
                  setDone(`topped up ${money(n)}`);
                  api.close();
                }}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-cobalt-wash text-cobalt-bright">
                  <Plus aria-hidden className="size-4" />
                </span>
                <span className="flex-1 font-mono text-sm tabular-nums">
                  {money(n)}
                </span>
                <span className="text-xs text-ink-3">Instant</span>
              </button>
            </li>
          ))}
        </ul>
      ),
    },
  ];

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <PushSheet
        sheets={sheets}
        value={stack}
        onValueChange={(next) => {
          if (next.length > stack.length) {
            setStop(FIRST_STOP[values.snaps ?? "half-full"] ?? "half height");
            setDone(null);
          }
          setStack(next);
        }}
        onSnapChange={(_id, f) =>
          setStop(
            f >= 0.999
              ? "full height"
              : Math.abs(f - 0.5) < 0.01
                ? "half height"
                : f < 0.5
                  ? "one third height"
                  : "two thirds height",
          )
        }
        height={chrome ? 520 : 548}
        sound={sound}
        {...values}
      >
        {(api) => (
          <div className="@container/waylight flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Waylight Pay</p>
              <span className="flex size-7 items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-ink-2">
                DJ
              </span>
            </div>
            <div className="grid gap-4 @min-[36rem]/waylight:grid-cols-2">
              <div className="flex flex-col gap-3">
                <section className="rounded-3 border border-hairline bg-card p-4">
                  <p className="text-xs text-ink-3">Available</p>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
                    £2,480.16
                  </p>
                  <p className="mt-1 text-xs text-ink-3">
                    Coldbrook Bank ·· 4417
                  </p>
                </section>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "send", label: "Send", Icon: ArrowUpRight },
                    { id: "request", label: "Request", Icon: ArrowDownLeft },
                    { id: "topup", label: "Top up", Icon: Plus },
                  ].map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => api.open(id)}
                      className="flex h-16 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-3 border border-hairline bg-card text-xs font-medium transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                    >
                      <Icon aria-hidden className="size-4 text-cobalt-bright" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <section className="flex flex-col gap-1">
                <p className="px-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  Recent
                </p>
                <ul role="list" className="flex flex-col">
                  {RECENT.map((r) => (
                    <li
                      key={r.id}
                      className="flex h-12 items-center justify-between gap-3 border-b border-hairline px-1 last:border-b-0"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">
                          {r.label}
                        </span>
                        <span className="block truncate text-[11px] text-ink-3">
                          {r.meta}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 font-mono text-[13px] tabular-nums",
                          r.out ? "text-foreground" : "text-success",
                        )}
                      >
                        {r.amount}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        )}
      </PushSheet>
      {chrome ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {stack.length > 0 ? (
              <>
                <span className="text-signal">
                  {sheets.find((s) => s.id === stack[stack.length - 1])?.title}
                </span>{" "}
                · {stop}
                {stack.length > 1
                  ? ` · ${stack.length} sheets`
                  : " · page back"}
              </>
            ) : done ? (
              <>
                <span className="text-signal">{done}</span> · nothing open
              </>
            ) : (
              <>
                <span className="text-signal">nothing open</span> · press send
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setStack([]);
              setDone(null);
              setTo("ines");
              setAmount("120");
              setNote("");
            }}
            className="inline-flex h-7 shrink-0 cursor-pointer items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reset
          </button>
        </div>
      ) : null}
    </div>
  );
}
