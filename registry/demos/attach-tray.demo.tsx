"use client";

import * as React from "react";

import {
  AttachTray,
  formatBytes,
  type AttachFile,
} from "@/registry/ui/attach-tray";

/** The files a Fieldline brief usually carries, in the order they arrive. */
const SAMPLES = [
  { name: "quarter-brief.pdf", size: 421888 },
  { name: "site-plan.png", size: 1887436 },
  { name: "costs.xlsx", size: 98304 },
  { name: "notes.md", size: 4096 },
  { name: "lint.ts", size: 12288 },
];

/** Seeded per-tick steps, so every upload has a rhythm of its own. */
const STEPS = [0.07, 0.11, 0.05, 0.09, 0.13, 0.06, 0.1];
const TICK_MS = 90;

const buttonClass =
  "h-8 rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const advance = (file: AttachFile, step: number): AttachFile =>
  file.progress >= 1
    ? file
    : {
        ...file,
        progress: Math.min(1, Math.round((file.progress + step) * 1000) / 1000),
      };

export function AttachTrayDemo() {
  const [files, setFiles] = React.useState<AttachFile[]>([]);
  const [minted, setMinted] = React.useState(0);
  const uploading = files.some((file) => file.progress < 1);

  const add = (picked: { name: string; size: number }[]) => {
    setFiles((prev) => [
      ...prev,
      ...picked.map((file, index) => ({
        ...file,
        id: `file-${minted + index}`,
        progress: 0,
      })),
    ]);
    setMinted((prev) => prev + picked.length);
  };

  // Uploads advance on a timer that stops while the tab is hidden; nothing
  // here reads a clock.
  React.useEffect(() => {
    if (!uploading) return;
    let timer = 0;
    let tick = 0;
    const step = () => {
      tick += 1;
      setFiles((prev) =>
        prev.map((file, index) =>
          advance(file, STEPS[(index + tick) % STEPS.length] ?? 0.08),
        ),
      );
      timer = window.setTimeout(step, TICK_MS);
    };
    const onVisibility = () => {
      window.clearTimeout(timer);
      if (!document.hidden) timer = window.setTimeout(step, TICK_MS);
    };
    timer = window.setTimeout(step, TICK_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [uploading]);

  const count = `${files.length} file${files.length === 1 ? "" : "s"}`;
  const pending = files.filter((file) => file.progress < 1).length;
  const total = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <AttachTray
        label="Attach to the brief"
        files={files}
        onAdd={add}
        onRemove={(id) =>
          setFiles((prev) => prev.filter((file) => file.id !== id))
        }
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            const sample = SAMPLES[minted % SAMPLES.length];
            if (sample) add([sample]);
          }}
        >
          Drop a file
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => setFiles([])}
        >
          Clear
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {files.length === 0
          ? "Empty · drop a file"
          : pending > 0
            ? `${count} · ${pending} uploading`
            : `${count} · all attached · ${formatBytes(total)}`}
      </p>
    </div>
  );
}
