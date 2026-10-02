"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultHelpAgent,
  defaultHelpArticles,
  HelpPanel,
} from "@/registry/ui/help-panel";

export const tweaks = defineTweaks({
  corner: {
    kind: "choice",
    label: "Corner",
    default: "bottom-right",
    options: ["bottom-right", "bottom-left", "top-right"],
    names: {
      "bottom-right": "Bottom right",
      "bottom-left": "Bottom left",
      "top-right": "Top right",
    },
  },
  suggest: {
    kind: "choice",
    label: "Suggest",
    default: "page",
    options: ["page", "popular", "off"],
    names: { page: "This page", popular: "Popular", off: "Off" },
  },
  handoff: {
    kind: "choice",
    label: "Handoff",
    default: "chat",
    options: ["chat", "ticket", "instant"],
    names: { chat: "Chat", ticket: "Ticket", instant: "Instant" },
  },
});

const ROUTES = [
  { name: "North loop", stops: 14, state: "On time" },
  { name: "Harbour run", stops: 9, state: "Late" },
  { name: "Market district", stops: 11, state: "On time" },
  { name: "Depot transfer", stops: 3, state: "Done" },
  { name: "Riverside", stops: 12, state: "On time" },
];

/** Fieldline's Routes page: the page the help launcher sits on. */
function RoutesPage({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-4 border border-hairline bg-background text-foreground",
        className,
      )}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline px-4">
        <span aria-hidden className="size-2.5 rounded-full bg-cobalt-bright" />
        <span className="text-[13px] font-semibold">Fieldline</span>
        <span className="text-[13px] text-ink-3">/ Routes</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-clip p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] font-semibold">Today</p>
          <p className="font-mono text-[11px] text-ink-3 tabular-nums">
            5 routes · 49 stops
          </p>
        </div>
        <ul className="flex flex-col gap-1.5">
          {ROUTES.map((r) => (
            <li
              key={r.name}
              className="flex h-11 items-center gap-3 rounded-2 border border-hairline bg-card px-3"
            >
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {r.name}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                {r.stops} stops
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px]",
                  r.state === "Late"
                    ? "bg-danger/10 text-danger"
                    : r.state === "Done"
                      ? "bg-surface-2 text-ink-3"
                      : "bg-success/10 text-success",
                )}
              >
                {r.state}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const pageCount = defaultHelpArticles.filter((a) =>
  (a.tags ?? []).includes("routes"),
).length;
const AGENT = defaultHelpAgent.name.toLowerCase();

/**
 * Fieldline's Routes page with the help panel open in its corner. Sending the
 * form answers after 800 ms; the agent replies from a short script.
 */
export function HelpPanelDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState(true);
  const [note, setNote] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(0);
  const [failNext, setFailNext] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const failRef = React.useRef(false);

  const suggest = values.suggest ?? "page";
  const idle =
    suggest === "page"
      ? `${Math.min(3, pageCount)} suggested for routes`
      : suggest === "popular"
        ? "popular articles"
        : "search only";

  const panel = (
    <HelpPanel
      key={round}
      open={open}
      onOpenChange={setOpen}
      onViewChange={(view) => {
        if (view === "home") setNote(null);
        if (view === "contact") setNote("contact · write to support");
      }}
      onArticleOpen={(a) => setNote(`reading · ${a.title.toLowerCase()}`)}
      onHelpful={(_, yes) =>
        setNote(yes ? "marked helpful" : "marked not helpful")
      }
      onContactSubmit={() =>
        new Promise<void>((resolve, reject) => {
          const fail = failRef.current;
          failRef.current = false;
          setFailNext(false);
          setNote("contact · sending");
          window.setTimeout(() => {
            if (fail) {
              setNote("contact · send failed");
              reject(
                new Error("Fieldline support didn't get that. Try again."),
              );
              return;
            }
            resolve();
          }, 800);
        })
      }
      onHandoff={(kind) =>
        setNote(
          kind === "chat" ? `chat · ${AGENT} is joining` : "ticket opened",
        )
      }
      onSend={() => {
        const n = sent + 1;
        setSent(n);
        setNote(`chat · ${n} ${n === 1 ? "message" : "messages"} sent`);
      }}
      sound={sound}
      {...values}
    >
      <RoutesPage className={chrome ? "h-[520px]" : "h-[548px]"} />
    </HelpPanel>
  );

  if (!chrome) return <div className="w-full">{panel}</div>;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {panel}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {note ? (
            <span className="text-signal">{note}</span>
          ) : (
            <>
              <span className="text-signal">
                {open ? "help open" : "help closed"}
              </span>{" "}
              · {open ? idle : "press the launcher"}
            </>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => {
              const next = !failRef.current;
              failRef.current = next;
              setFailNext(next);
            }}
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-danger/50 aria-pressed:text-danger"
          >
            Fail next
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setNote(null);
              setSent(0);
              failRef.current = false;
              setFailNext(false);
              setRound((r) => r + 1);
            }}
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
