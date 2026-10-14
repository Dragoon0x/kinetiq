"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  advanceUpgradeRequest,
  defaultUpgradeAdmins,
  defaultUpgradeFeature,
  defaultUpgradeNow,
  defaultUpgradeRequests,
  UpgradeRequest,
  type UpgradeRequestRecord,
} from "@/registry/ui/upgrade-request";

export const tweaks = defineTweaks({
  railStyle: {
    kind: "choice",
    label: "Rail",
    default: "rail",
    options: ["rail", "steps"],
    names: { rail: "Rail", steps: "Steps" },
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
    options: ["cobalt", "signal", "ink"],
    names: { cobalt: "Cobalt", signal: "Signal", ink: "Ink" },
  },
});

const MIN = 60_000;

const firstName = (id: string) =>
  defaultUpgradeAdmins.find((a) => a.id === id)?.name.split(" ")[0] ??
  "the admin";

/**
 * A Fieldline member hits Shared exports on the Team plan and asks Mara for
 * it; the buttons play the admin, who opens it, then approves or declines.
 */
export function UpgradeRequestDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [requests, setRequests] = React.useState<UpgradeRequestRecord[]>(
    defaultUpgradeRequests,
  );
  const [note, setNote] = React.useState<string | null>(null);

  const live = requests.find((r) => r.featureId === defaultUpgradeFeature.id);
  const pending = !!live && (live.stage === "sent" || live.stage === "seen");

  const surface = (
    <UpgradeRequest
      key={round}
      requests={requests}
      onRequestsChange={setRequests}
      onSend={(r) => setNote(`sent to ${firstName(r.adminId)}`)}
      onRetryLater={() => setNote("asking again")}
      onOpenFeature={(f) => setNote(`opened ${f.name.toLowerCase()}`)}
      now={defaultUpgradeNow}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  const advance = () => {
    if (!live || !pending) return;
    const who = firstName(live.adminId);
    if (live.stage === "sent") {
      setRequests((rs) =>
        advanceUpgradeRequest(rs, live.id, "seen", defaultUpgradeNow + 4 * MIN),
      );
      setNote(`${who} opened it`);
    } else {
      setRequests((rs) =>
        advanceUpgradeRequest(
          rs,
          live.id,
          "approved",
          defaultUpgradeNow + 21 * MIN,
          "Done. The folder is under Exports.",
        ),
      );
      setNote(`${who} approved it`);
    }
  };

  const decline = () => {
    if (!live || !pending) return;
    setRequests((rs) =>
      advanceUpgradeRequest(
        rs,
        live.id,
        "declined",
        defaultUpgradeNow + 12 * MIN,
        "Not this month; the export add-on is still under review.",
      ),
    );
    setNote(`${firstName(live.adminId)} declined it`);
  };

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-disabled={!pending || undefined}
          onClick={advance}
          className={button}
        >
          {live?.stage === "seen" ? "Admin approves" : "Admin opens it"}
        </button>
        <button
          type="button"
          aria-disabled={!pending || undefined}
          onClick={decline}
          className={button}
        >
          Admin declines
        </button>
        <button
          type="button"
          onClick={() => {
            setRequests(defaultUpgradeRequests);
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
          {note ?? (live ? `request ${live.stage}` : "no request yet")}
        </span>{" "}
        · {requests.length} on file
      </p>
    </div>
  );
}
