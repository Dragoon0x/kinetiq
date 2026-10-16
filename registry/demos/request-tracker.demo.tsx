"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultTrackedRequest,
  defaultTrackerNow,
  RequestTracker,
  type TrackedRequest,
  type TrackerUpdate,
} from "@/registry/ui/request-tracker";

export const tweaks = defineTweaks({
  stageStyle: {
    kind: "choice",
    label: "Stages",
    default: "rail",
    options: ["rail", "segments", "ladder"],
    names: { rail: "Rail", segments: "Segments", ladder: "Ladder" },
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

const MIN = 60_000;

/** What Noor posts as the request moves on, keyed by the stage it reaches. */
const NEXT: Record<string, Omit<TrackerUpdate, "id" | "at">> = {
  investigating: {
    role: "support",
    author: "Noor",
    title: "Looking into the export limit",
    body: "I can reproduce the cut-off on large workspaces, so it isn't your file.",
  },
  fixing: {
    role: "support",
    author: "Noor",
    title: "Found it: a page-size limit",
    body: "The export stopped after its first page of results. A fix goes out this afternoon.",
  },
  solved: {
    role: "support",
    author: "Noor",
    title: "Fixed in today's release",
    body: "Exports now include every row. Thanks for the log ID, it pointed straight at the cause.",
  },
};

/**
 * Jun at Coldbrook Studio checks request 4812 with Basinworks support: the
 * export stops at 10,000 rows, and Noor has asked for the export's log ID,
 * so it's Jun's turn. Reply, or move the request along with Advance stage.
 */
export function RequestTrackerDemo({
  chrome = true,
  // The page is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [request, setRequest] = React.useState<TrackedRequest>(
    defaultTrackedRequest,
  );
  const [status, setStatus] = React.useState<"ready" | "loading" | "error">(
    "ready",
  );
  const [round, setRound] = React.useState(0);
  const [note, setNote] = React.useState<string | null>(null);
  const [minutes, setMinutes] = React.useState(0);

  React.useEffect(() => {
    if (status !== "loading") return;
    const t = window.setTimeout(() => setStatus("ready"), 1200);
    return () => window.clearTimeout(t);
  }, [status]);

  const now = defaultTrackerNow + minutes * MIN;
  const stageIndex = request.stages.findIndex((s) => s.id === request.stage);
  const stage = request.stages[stageIndex];
  const solved = stageIndex === request.stages.length - 1;

  const surface = (
    <RequestTracker
      key={round}
      request={request}
      now={now}
      status={status}
      onReply={async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        setRequest((r) => ({ ...r, waitingOn: "support", lastReplyAt: now }));
        setNote("reply sent · with basinworks");
      }}
      onClose={() => {
        const last = request.stages[request.stages.length - 1];
        if (last) setRequest((r) => ({ ...r, stage: last.id }));
        setNote("closed by jun");
      }}
      onReopen={() => {
        const back = request.stages[1];
        if (back)
          setRequest((r) => ({
            ...r,
            stage: back.id,
            waitingOn: "support",
            rating: null,
          }));
        setNote("reopened");
      }}
      onRate={(rating) => {
        setRequest((r) => ({ ...r, rating }));
        setNote(`rated ${rating}`);
      }}
      onRetry={() => setStatus("loading")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-pressed:border-danger/50 aria-pressed:text-danger",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  const advance = () => {
    const next = request.stages[stageIndex + 1];
    if (!next) return;
    const post = NEXT[next.id];
    const at = now + 20 * MIN;
    setMinutes((m) => m + 20);
    setRequest((r) => ({
      ...r,
      stage: next.id,
      waitingOn: "support",
      lastReplyAt: at,
      updates: post
        ? [...r.updates, { ...post, id: `demo-${r.updates.length}`, at }]
        : r.updates,
    }));
    setNote(`moved to ${next.label.toLowerCase()}`);
  };

  const ask = () => {
    const at = now + 10 * MIN;
    setMinutes((m) => m + 10);
    setRequest((r) => ({
      ...r,
      waitingOn: "customer",
      updates: [
        ...r.updates,
        {
          id: `demo-${r.updates.length}`,
          role: "support",
          author: "Noor",
          at,
          title: "Which browser were you using?",
          body: "One more thing: the export button behaves differently in some browsers. Which one did you use?",
        },
      ],
    }));
    setNote("noor asked a question");
  };

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-disabled={solved || undefined}
          onClick={advance}
          className={cn(button, solved && "cursor-not-allowed opacity-60")}
        >
          Advance stage
        </button>
        <button
          type="button"
          aria-disabled={
            solved || request.waitingOn === "customer" || undefined
          }
          onClick={() => {
            if (!solved && request.waitingOn !== "customer") ask();
          }}
          className={cn(
            button,
            (solved || request.waitingOn === "customer") &&
              "cursor-not-allowed opacity-60",
          )}
        >
          Ask for info
        </button>
        <button
          type="button"
          aria-pressed={status === "error"}
          onClick={() => setStatus((s) => (s === "error" ? "ready" : "error"))}
          className={button}
        >
          Fail load
        </button>
        <button
          type="button"
          onClick={() => {
            setRequest(defaultTrackedRequest);
            setStatus("ready");
            setMinutes(0);
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
          {status === "error"
            ? "updates failed to load"
            : `${stage?.label.toLowerCase() ?? ""} · ${
                solved
                  ? request.rating
                    ? `rated ${request.rating}`
                    : "waiting for a rating"
                  : request.waitingOn === "customer"
                    ? "your turn"
                    : "with basinworks"
              }`}
        </span>
        {note ? ` · ${note}` : " · request 4812"}
      </p>
    </div>
  );
}
