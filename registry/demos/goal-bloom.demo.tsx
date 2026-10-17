"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { Flower2, RotateCcw, Sparkles } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  GoalBloom,
  defaultGoalBloomNodes,
  type GoalBloomNode,
  type GoalBloomPlanStatus,
} from "@/registry/ui/goal-bloom";

export const tweaks = defineTweaks({
  petalShape: {
    kind: "choice",
    label: "Petal",
    default: "leaf",
    options: ["leaf", "round", "wedge"],
    names: { leaf: "Leaf", round: "Round", wedge: "Wedge" },
  },
  ringGap: {
    kind: "range",
    label: "Ring gap",
    default: 64,
    min: 40,
    max: 76,
    step: 4,
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

/** The plan as the agent has it when the card is first seen: Launch still being planned. */
const START: GoalBloomNode[] = defaultGoalBloomNodes
  .filter((n) => n.parent !== "launch")
  .map((n) => (n.id === "launch" ? { ...n, status: "planning" } : n));

/** What the agent plans next, in order. */
const QUEUE: GoalBloomNode[] = [
  ...defaultGoalBloomNodes.filter((n) => n.parent === "launch"),
  {
    id: "menu",
    parent: "launch",
    title: "Print the opening menu",
    owner: "Priya",
  },
  {
    id: "bench",
    parent: "fitout",
    title: "Fit the window bench",
    owner: "Tomas",
  },
  {
    id: "rota",
    parent: "hiring",
    title: "Write the first rota",
    owner: "Mara",
  },
  {
    id: "milk",
    parent: "stock",
    title: "Set par levels for milk",
    owner: "Joel",
  },
];

/** Branches the demo can finish, in order. */
const FINISH = ["hiring", "fitout", "stock", "launch"];

/** Adds the next queued step; a branch stops "planning" once it has two. */
const plan = (
  list: GoalBloomNode[],
  parent?: string | null,
): GoalBloomNode[] => {
  const next = QUEUE.find(
    (n) =>
      !list.some((m) => m.id === n.id) &&
      (parent === undefined || parent === null || n.parent === parent),
  );
  if (!next) return list;
  const siblings = list.filter((n) => n.parent === next.parent).length + 1;
  return [
    ...list.map((n) =>
      n.id === next.parent && n.status === "planning" && siblings >= 2
        ? { ...n, status: undefined }
        : n,
    ),
    { ...next, status: "todo" },
  ];
};

const finish = (list: GoalBloomNode[], branch: string): GoalBloomNode[] =>
  list.map((n) =>
    n.parent === branch ? { ...n, status: "done", note: undefined } : n,
  );

/**
 * Coldbrook, the Larch Street opening: the agent plans the store around
 * its goal and the branches close as they finish.
 */
export function GoalBloomDemo({
  chrome = true,
  // The plan is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [nodes, setNodes] = React.useState<GoalBloomNode[]>(START);
  const [finished, setFinished] = React.useState(0);
  const [approved, setApproved] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(frame, { amount: 0.35 });

  const planNext = React.useCallback((parent?: string | null) => {
    setNodes((list) => plan(list, parent));
    setApproved(false);
  }, []);
  const queued = QUEUE.filter((q) => nodes.some((n) => n.id === q.id)).length;
  // The plan is still being planned while Launch has fewer than two steps.
  const status: GoalBloomPlanStatus = nodes.some((n) => n.status === "planning")
    ? "planning"
    : "ready";

  // The card plays the agent once: two steps planned into Launch, the plan
  // ready, then Hiring finishing and folding into its petal.
  const [played, setPlayed] = React.useState(false);
  React.useEffect(() => {
    if (chrome || !inView || played) return;
    const steps: [number, () => void][] = [
      [1100, () => planNext()],
      [1900, () => planNext()],
      [
        3300,
        () => {
          setNodes((list) => finish(list, "hiring"));
          setFinished(1);
          setPlayed(true);
        },
      ],
    ];
    const timers = steps.map(([at, run]) => window.setTimeout(run, at));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [chrome, inView, played, planNext]);

  const steps = nodes.filter((n) => n.parent !== null).length;
  const branches = nodes.filter((n) => n.parent === null);
  const doneBranches = branches.filter((b) => {
    const kids = nodes.filter((n) => n.parent === b.id);
    return kids.length > 0 && kids.every((k) => k.status === "done");
  }).length;

  const surface = (
    <GoalBloom
      key={round}
      nodes={nodes}
      status={status}
      onAddSubgoal={(parent) => planNext(parent)}
      onApprove={() => setApproved(true)}
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
    "hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={frame} className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => planNext()}
          disabled={queued >= QUEUE.length}
          className={button}
        >
          <Sparkles aria-hidden className="size-3.5" />
          Plan a step
        </button>
        <button
          type="button"
          onClick={() => {
            const branch = FINISH[finished];
            if (!branch) return;
            setNodes((list) => finish(list, branch));
            setFinished((f) => f + 1);
            setApproved(false);
          }}
          disabled={finished >= FINISH.length}
          className={button}
        >
          <Flower2 aria-hidden className="size-3.5" />
          Finish a branch
        </button>
        <button
          type="button"
          onClick={() => {
            setNodes(START);
            setFinished(0);
            setApproved(false);
            setPlayed(false);
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
          {approved ? "approved" : status === "planning" ? "planning" : "ready"}
        </span>
        {` · ${steps} steps · ${doneBranches} of ${branches.length} branches done`}
      </p>
    </div>
  );
}
