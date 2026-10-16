"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultMacroTicket,
  defaultMacros,
  MacroReply,
  type MacroReplyHandle,
  type MacroTicket,
} from "@/registry/ui/macro-reply";

export const tweaks = defineTweaks({
  sidebarSide: {
    kind: "choice",
    label: "Sidebar",
    default: "right",
    options: ["left", "right"],
    names: { left: "Left", right: "Right" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "jade", "amber", "mono"],
    names: { cobalt: "Cobalt", jade: "Jade", amber: "Amber", mono: "Mono" },
  },
});

const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Basinworks support on a Thursday morning: Theo picks up Mara's ticket about
 * a double charge after an upgrade. Type # in the reply (or press Macros) and
 * pick "Refund duplicate charge": the reply types itself while the status,
 * priority and tag switch one by one in the sidebar. The gallery card applies
 * that macro once, a moment after it comes into view.
 */
export function MacroReplyDemo({
  chrome = true,
  // The desk is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [ticket, setTicket] = React.useState<MacroTicket>(defaultMacroTicket);
  const [round, setRound] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [failNext, setFailNext] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const handle = React.useRef<MacroReplyHandle | null>(null);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(frame, { amount: 0.4 });
  const played = React.useRef(false);
  const failRef = React.useRef(failNext);
  React.useEffect(() => {
    failRef.current = failNext;
  }, [failNext]);

  // The gallery card shows the macro once, after it has been seen.
  React.useEffect(() => {
    if (chrome || !inView || played.current) return;
    const t = window.setTimeout(() => {
      played.current = true;
      handle.current?.applyMacro("refund-duplicate");
    }, 1200);
    return () => window.clearTimeout(t);
  }, [chrome, inView, round]);

  React.useEffect(() => {
    if (!loading) return;
    const t = window.setTimeout(() => setLoading(false), 1400);
    return () => window.clearTimeout(t);
  }, [loading]);

  const surface = (
    <MacroReply
      key={round}
      ref={handle}
      ticket={ticket}
      macros={defaultMacros}
      status={loading ? "loading" : "ready"}
      onApplyMacro={(macro) => setNote(`macro · ${macro.name.toLowerCase()}`)}
      onStatusChange={(status, source) => {
        setTicket((t) => ({ ...t, status }));
        if (source !== "macro") setNote(`status · ${status.replace("-", " ")}`);
      }}
      onSend={async (reply) => {
        await wait(failRef.current ? 900 : 600);
        if (failRef.current) {
          setFailNext(false);
          setNote("send failed · draft kept");
          throw new Error("offline");
        }
        setNote(`sent · status ${reply.fields.status.replace("-", " ")}`);
      }}
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={frame} className="w-full">
        {surface}
      </div>
    );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-pressed:border-danger/50 aria-pressed:text-danger",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );
  const closed = ticket.status === "closed";

  return (
    <div ref={frame} className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((f) => !f)}
          className={button}
        >
          Fail next send
        </button>
        <button
          type="button"
          aria-disabled={closed || undefined}
          onClick={() => {
            if (closed) return;
            setTicket((t) => ({ ...t, status: "closed" }));
            setNote("ticket closed");
          }}
          className={cn(button, closed && "cursor-not-allowed opacity-60")}
        >
          Close ticket
        </button>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setNote("loading ticket");
          }}
          className={button}
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => {
            setTicket(defaultMacroTicket);
            setLoading(false);
            setFailNext(false);
            setNote(null);
            setRound((r) => r + 1);
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
        <span className="text-signal">
          {note ?? `${ticket.status.replace("-", " ")} · type # for macros`}
        </span>{" "}
        · ticket #{ticket.number} · mara lindqvist
      </p>
    </div>
  );
}
