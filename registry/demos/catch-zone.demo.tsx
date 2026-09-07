"use client";

import * as React from "react";

import { CatchZone, fileKey, formatSize } from "@/registry/ui/catch-zone";

const MAX_SIZE = 4 * 1024 * 1024;
const TICK_MS = 120;
const STEP = 0.08;

export function CatchZoneDemo() {
  const [files, setFiles] = React.useState<File[]>([]);
  const [progress, setProgress] = React.useState<Record<string, number>>({});

  const settled = files.every((file) => (progress[fileKey(file)] ?? 0) >= 1);

  // Basinworks has no server here, so the upload is simulated — on a timer that
  // only exists while something is actually in flight.
  React.useEffect(() => {
    if (files.length === 0 || settled) return;
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        const next = { ...prev };
        for (const file of files) {
          const key = fileKey(file);
          next[key] = Math.min(1, (next[key] ?? 0) + STEP);
        }
        return next;
      });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [files, settled]);

  const total = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CatchZone
        label="Drop Basinworks invoices"
        accept=".pdf,.csv,image/*"
        maxSize={MAX_SIZE}
        progress={progress}
        onFiles={(next) => {
          setFiles(next);
          // Forget the progress of anything that has been taken back out.
          setProgress((prev) => {
            const keys = new Set(next.map(fileKey));
            return Object.fromEntries(
              Object.entries(prev).filter(([key]) => keys.has(key)),
            );
          });
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal tabular-nums">{files.length}</span>{" "}
        {files.length === 1 ? "file" : "files"} ·{" "}
        <span className="text-signal tabular-nums">{formatSize(total)}</span>
      </p>
    </div>
  );
}
