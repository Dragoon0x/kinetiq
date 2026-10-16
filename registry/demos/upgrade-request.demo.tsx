"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultUpgradeRequestAdmins,
  UpgradeRequest,
  type UpgradeRequestRecord,
} from "@/registry/ui/upgrade-request";

export const tweaks = defineTweaks({
  cardStyle: {
    kind: "choice",
    label: "Card",
    default: "raised",
    options: ["raised", "outline", "tinted"],
    names: { raised: "Raised", outline: "Outline", tinted: "Tinted" },
  },
  envelopeStyle: {
    kind: "choice",
    label: "Envelope",
    default: "classic",
    options: ["classic", "airmail", "plain"],
    names: { classic: "Classic", airmail: "Airmail", plain: "Plain" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "mint", "amber", "ink"],
    names: { cobalt: "Cobalt", mint: "Mint", amber: "Amber", ink: "Ink" },
  },
});

const SEND_MS = 450;
const first = (id: string) =>
  (defaultUpgradeRequestAdmins.find((a) => a.id === id)?.name ?? id)
    .split(" ")[0]
    ?.toLowerCase() ?? id;

/**
 * Rae, a Fieldline member, needs version history to restore the Q3 roadmap.
 * In the docs the admin's answer is yours to give once the request is
 * pending; the gallery card has Priya approve it a moment after it lands.
 */
export function UpgradeRequestDemo({
  chrome = true,
  // The request is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [request, setRequest] = React.useState<UpgradeRequestRecord | null>(
    null,
  );
  const [admin, setAdmin] = React.useState("priya");
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setRequest(null);
    setAdmin("priya");
    setNote(null);
    setRound((r) => r + 1);
  };

  const answer = (status: "approved" | "declined") =>
    setRequest((r) =>
      r
        ? {
            ...r,
            status,
            reply:
              status === "declined"
                ? "We're moving to Business in January. I'll add you then."
                : "Approved for the whole workspace.",
          }
        : r,
    );

  const surface = (
    <UpgradeRequest
      key={round}
      value={admin}
      onValueChange={(id) => {
        setAdmin(id);
        setNote(null);
      }}
      request={request}
      onRequestChange={(next) => {
        setRequest(next);
        if (!next) setNote("asking someone else");
      }}
      onRequest={({ admin: to }) =>
        new Promise<void>((resolve) => {
          timers.current.push(
            window.setTimeout(() => {
              setNote(`asked ${first(to.id)}`);
              resolve();
              if (!chrome) {
                timers.current.push(
                  window.setTimeout(() => answer("approved"), 2600),
                  window.setTimeout(reset, 7000),
                );
              }
            }, SEND_MS),
          );
        })
      }
      onRemind={(r) => setNote(`reminded ${first(r.adminId)}`)}
      onOpenFeature={() => setNote("version history opened")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-50",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );
  const pending = request?.status === "pending";
  const where = request
    ? request.status === "pending"
      ? `pending · ${first(request.adminId)}`
      : request.status
    : `asking ${first(admin)}`;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-disabled={!pending}
          onClick={() => {
            if (!pending) return;
            answer("approved");
            setNote("approved by the admin");
          }}
          className={button}
        >
          Approve as admin
        </button>
        <button
          type="button"
          aria-disabled={!pending}
          onClick={() => {
            if (!pending) return;
            answer("declined");
            setNote("declined with a note");
          }}
          className={button}
        >
          Decline as admin
        </button>
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{note ?? where}</span> · business ·
        version history
      </p>
    </div>
  );
}
