"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultStatusAudiences,
  defaultStatusDraft,
  defaultStatusNow,
  StatusDispatch,
  type StatusDraft,
} from "@/registry/ui/status-dispatch";

export const tweaks = defineTweaks({
  previewMode: {
    kind: "choice",
    label: "Preview",
    default: "page",
    options: ["page", "email", "sms"],
    names: { page: "Page", email: "Email", sms: "Text" },
  },
  stampStyle: {
    kind: "choice",
    label: "Stamp",
    default: "seal",
    options: ["seal", "chip", "tick"],
    names: { seal: "Seal", chip: "Chip", tick: "Tick" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--signal)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--signal)": "Mint",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const PUBLISH_MS = 650;
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * Waylight's on-call engineer posts the second update of an API latency
 * incident: the cause is found, two components change, and email and text
 * subscribers hear about it. Fail next publish shows the draft surviving a
 * refused post.
 */
export function StatusDispatchDemo({
  chrome = true,
  // The composer is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [draft, setDraft] = React.useState<StatusDraft>(defaultStatusDraft);
  const [now, setNow] = React.useState(defaultStatusNow);
  const [run, setRun] = React.useState(0);
  const [failNext, setFailNext] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);

  const recipients = (d: StatusDraft) =>
    defaultStatusAudiences
      .filter((a) => d.notify.includes(a.id))
      .reduce((sum, a) => sum + a.count, 0);

  const publish = (d: StatusDraft) =>
    new Promise<void>((resolve, reject) => {
      const fail = failNext;
      setNote("publishing");
      timers.current.push(
        window.setTimeout(() => {
          if (fail) {
            setFailNext(false);
            setNote("publish failed · draft kept");
            reject(new Error("publish failed"));
            return;
          }
          setNote(
            `published ${clock(now)} · ${grouped(recipients(d))} notified`,
          );
          resolve();
          // The next post goes out a few minutes later.
          timers.current.push(
            window.setTimeout(() => setNow((n) => n + 4 * 60_000), 1800),
          );
        }, PUBLISH_MS),
      );
    });

  const composer = (
    <StatusDispatch
      key={run}
      draft={draft}
      onDraftChange={(next) => {
        setDraft(next);
        setNote((n) => (n === "publishing" ? n : null));
      }}
      onPublish={publish}
      onSchedule={(_d, at) => setNote(`scheduled for ${clock(at)}`)}
      onSaveDraft={() => setNote("draft saved")}
      now={now}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{composer}</div>;

  const changed = Object.keys(draft.affected).length;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {composer}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((v) => !v)}
          className={cn(
            button,
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next publish
        </button>
        <button
          type="button"
          onClick={() => {
            for (const t of timers.current) window.clearTimeout(t);
            timers.current = [];
            setDraft(defaultStatusDraft);
            setNow(defaultStatusNow);
            setFailNext(false);
            setNote(null);
            setRun((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {note ? (
          <span className="text-signal">{note}</span>
        ) : (
          <>
            <span className="text-signal">{draft.phase}</span> ·{" "}
            {changed === 1 ? "1 component" : `${changed} components`} ·{" "}
            {grouped(recipients(draft))} recipients · draft
          </>
        )}
      </p>
    </div>
  );
}
