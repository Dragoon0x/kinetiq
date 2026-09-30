"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { AbacusCount } from "@/registry/ui/abacus-count";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  rods: {
    kind: "range",
    label: "Rods",
    default: 3,
    min: 2,
    max: 5,
    step: 1,
  },
  beads: {
    kind: "choice",
    label: "Beads",
    default: "wood",
    options: ["wood", "glass", "stone"],
    names: { wood: "Wood", glass: "Glass", stone: "Stone" },
  },
});

const ROWS = 480;
const FILE = "basin-ledger-q3.csv";

type Phase = "preparing" | "importing" | "imported";
type Job = { phase: Phase; rows: number; wait: number };

const LABELS: Record<Phase, string> = {
  preparing: "Preparing ledger",
  importing: "Importing ledger",
  imported: "Ledger imported",
};

/** One beat of the simulated import: uneven batches, then a rest, then again. */
function advance(job: Job): Job {
  if (job.phase === "importing") {
    // Batches of 4 to 14 rows, the same run every time.
    const batch = 4 + ((job.rows * 37 + 11) % 11);
    const rows = Math.min(ROWS, job.rows + batch);
    return rows >= ROWS
      ? { phase: "imported", rows: ROWS, wait: 9 }
      : { ...job, rows };
  }
  if (job.wait > 0) return { ...job, wait: job.wait - 1 };
  return job.phase === "imported"
    ? { phase: "preparing", rows: 0, wait: 10 }
    : { phase: "importing", rows: 0, wait: 0 };
}

/**
 * Basinworks Exchange importing a quarter's ledger: the frame counts while
 * the file is prepared, then its beads read the rows as they land.
 */
export function AbacusCountDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [job, setJob] = React.useState<Job>({
    phase: "importing",
    rows: 212,
    wait: 0,
  });
  const [flicked, setFlicked] = React.useState(0);

  React.useEffect(() => {
    let timer = 0;
    const beat = () => {
      timer = window.setTimeout(beat, 260);
      if (!document.hidden) setJob(advance);
    };
    timer = window.setTimeout(beat, 260);
    return () => window.clearTimeout(timer);
  }, []);

  const progress = job.phase === "preparing" ? undefined : job.rows / ROWS;
  const percent = `${Math.round((job.rows / ROWS) * 100)}%`;

  const scene = (
    <div className="flex w-full max-w-xs flex-col gap-4 self-center">
      <AbacusCount
        size={64}
        label={LABELS[job.phase]}
        progress={progress}
        total={ROWS}
        onFlick={() => setFlicked((n) => n + 1)}
        sound={sound}
        {...values}
      />
      <div className="flex items-center gap-2 rounded-2 border border-hairline bg-card px-3 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate text-foreground" title={FILE}>
          {FILE}
        </span>
        <AbacusCount
          size={16}
          hideLabel
          disabled
          label={`${LABELS[job.phase]}: ${FILE}`}
          progress={progress}
          total={ROWS}
          {...values}
        />
        <span className="w-10 shrink-0 text-right font-mono text-xs text-ink-3 tabular-nums">
          {job.phase === "preparing" ? "—" : percent}
        </span>
      </div>
    </div>
  );

  if (!chrome) return scene;

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {scene}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{job.phase}</span>
        {job.phase === "preparing"
          ? " · counting while it waits"
          : ` · ${ROWS} rows`}
        {flicked > 0 ? ` · ${flicked} flicked` : ""}
      </p>
    </div>
  );
}
