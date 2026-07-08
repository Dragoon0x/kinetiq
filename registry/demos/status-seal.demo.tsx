"use client";

import * as React from "react";

import { AtSign } from "lucide-react";

import { StatusSeal, type StatusSealVariant } from "@/registry/ui/status-seal";

type Stage = "queued" | "building" | "deployed" | "failed";

const STAGE_SEAL: Record<
  Stage,
  { variant: StatusSealVariant; label: string; live?: boolean }
> = {
  queued: { variant: "info", label: "QUEUED" },
  building: { variant: "warn", label: "BUILDING", live: true },
  deployed: { variant: "success", label: "DEPLOYED" },
  failed: { variant: "danger", label: "FAILED" },
};

export function StatusSealDemo() {
  const [stage, setStage] = React.useState<Stage>("queued");
  const [run, setRun] = React.useState(1);
  const [mentions, setMentions] = React.useState(2);

  const seal = STAGE_SEAL[stage];
  // Odd runs land, even runs fail — the demo alternates outcomes.
  const nextStage: Stage =
    stage === "queued"
      ? "building"
      : stage === "building"
        ? run % 2 === 1
          ? "deployed"
          : "failed"
        : "queued";

  const advance = () => {
    if (nextStage === "queued") setRun((current) => current + 1);
    setStage(nextStage);
  };

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <span className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
        Pipeline · kinetiq-web
      </span>

      <div className="border-border bg-card w-full rounded-3 border p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">deploy.yml</p>
            <p className="text-muted-foreground font-mono text-[10px] tabular-nums">
              run {String(run).padStart(3, "0")} · main
            </p>
          </div>
          <StatusSeal variant={seal.variant} live={seal.live}>
            {seal.label}
          </StatusSeal>
        </div>
        <div className="border-border mt-3 flex items-center justify-between gap-3 border-t pt-3">
          <button
            type="button"
            onClick={advance}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 rounded-2 px-3 text-xs font-medium"
          >
            Advance
          </button>
          <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
            next · {STAGE_SEAL[nextStage].label.toLowerCase()}
          </span>
        </div>
      </div>

      <div className="border-border bg-card flex w-full items-center justify-between gap-3 rounded-3 border p-4">
        <StatusSeal
          variant="info"
          count={mentions}
          icon={<AtSign className="size-3 shrink-0" aria-hidden />}
        >
          Mentions
        </StatusSeal>
        <button
          type="button"
          onClick={() => setMentions((current) => current + 1)}
          className="border-input hover:bg-accent h-8 rounded-2 border bg-transparent px-3 font-mono text-xs font-medium"
        >
          +1
        </button>
      </div>
    </div>
  );
}
