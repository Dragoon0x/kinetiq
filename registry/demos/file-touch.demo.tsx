"use client";

import * as React from "react";

import {
  FileTouch,
  type DiffLine,
  type TouchedFile,
} from "@/registry/ui/file-touch";

type Seed = Omit<TouchedFile, "added" | "removed"> & { diff: DiffLine[] };

/** Gaugeworks Reasoner tidying a Basinworks ledger parser. */
const SEEDS: Seed[] = [
  {
    id: "parse",
    path: "src/ledger/parse.ts",
    kind: "modified",
    diff: [
      { kind: "ctx", text: "export function parseRow(line: string) {" },
      { kind: "del", text: "  const amount = Number(cells[2]);" },
      { kind: "add", text: "  const amount = parseAmount(cells[2]);" },
      { kind: "add", text: "  if (amount === null) throw new RowError(line);" },
      { kind: "ctx", text: "  return { date, account, amount };" },
    ],
  },
  {
    id: "rates",
    path: "src/ledger/rates.ts",
    kind: "created",
    diff: [
      { kind: "add", text: "export const RATES = {" },
      { kind: "add", text: '  "rainy-day": 0.042,' },
      { kind: "add", text: '  "fieldline-ops": 0.011,' },
      { kind: "add", text: "} as const;" },
    ],
  },
  {
    id: "test",
    path: "tests/parse.test.ts",
    kind: "modified",
    diff: [
      {
        kind: "ctx",
        text: 'test("rejects words in the amount column", () => {',
      },
      { kind: "del", text: "  expect(parseRow(row).amount).toBeNaN();" },
      { kind: "add", text: "  expect(() => parseRow(row)).toThrow(RowError);" },
      { kind: "ctx", text: "});" },
    ],
  },
  {
    id: "readme",
    path: "README.md",
    kind: "modified",
    diff: [
      { kind: "del", text: "Amounts must be numbers." },
      {
        kind: "add",
        text: "Amounts must be numbers; a word aborts the import.",
      },
    ],
  },
];

/** Each tick raises one file's counts; a file's first tick is its arrival. */
const STEPS: { id: string; added: number; removed: number }[] = [
  { id: "parse", added: 4, removed: 2 },
  { id: "parse", added: 9, removed: 5 },
  { id: "parse", added: 14, removed: 7 },
  { id: "rates", added: 6, removed: 0 },
  { id: "rates", added: 16, removed: 0 },
  { id: "test", added: 3, removed: 1 },
  { id: "test", added: 6, removed: 4 },
  { id: "readme", added: 2, removed: 1 },
];
const TICK_MS = 380;

const button =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function FileTouchDemo() {
  const [step, setStep] = React.useState(0);
  const [writing, setWriting] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  // A hidden tab holds the write where it is rather than finishing unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!writing || !visible) return;
    const timer = window.setTimeout(() => {
      if (step >= STEPS.length) setWriting(false);
      else setStep((current) => current + 1);
    }, TICK_MS);
    return () => window.clearTimeout(timer);
  }, [writing, visible, step]);

  const files: TouchedFile[] = [];
  for (const entry of STEPS.slice(0, step)) {
    const seed = SEEDS.find((candidate) => candidate.id === entry.id);
    if (!seed) continue;
    const existing = files.find((file) => file.id === entry.id);
    if (existing) {
      existing.added = entry.added;
      existing.removed = entry.removed;
    } else {
      files.push({ ...seed, added: entry.added, removed: entry.removed });
    }
  }
  const added = files.reduce((sum, file) => sum + file.added, 0);
  const removed = files.reduce((sum, file) => sum + file.removed, 0);
  const viewing = files.find((file) => file.id === openId);

  const start = () => {
    setStep(0);
    setOpenId(null);
    setWriting(true);
  };

  const status = writing
    ? `Writing · ${files.length} ${files.length === 1 ? "file" : "files"}`
    : files.length > 0
      ? `Wrote ${files.length} files · +${added} −${removed}`
      : "Idle · ready";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <FileTouch
        label="Gaugeworks Reasoner"
        files={files}
        writing={writing}
        openId={openId}
        onOpenChange={setOpenId}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={start}
          disabled={writing}
          className={button}
        >
          {step > 0 ? "Write again" : "Write"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
        {viewing ? ` · viewing ${viewing.path.split("/").pop()}` : ""}
      </p>
    </div>
  );
}
