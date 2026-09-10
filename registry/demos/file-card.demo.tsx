"use client";

import * as React from "react";

import { FileCard, type FileMessage } from "@/registry/ui/file-card";

const OPENING: FileMessage[] = [
  {
    id: "f1",
    from: "peer",
    name: "site-survey.pdf",
    bytes: 2_410_000,
    time: "9:41",
  },
  {
    id: "f2",
    from: "peer",
    name: "pallet-counts.csv",
    bytes: 48_200,
    time: "9:42",
  },
];

/** The seeded script: the counts file drops the line the first time through. */
const SCRIPTED_FAULT: Record<string, number> = { f2: 0.62 };

export function FileCardDemo() {
  const [files, setFiles] = React.useState<FileMessage[]>(OPENING);
  const [faults, setFaults] = React.useState(SCRIPTED_FAULT);
  const [note, setNote] = React.useState("two files offered");

  const moving = files.some((file) => file.state === "loading");

  // One interval for the thread, cleaned up, and skipped while the tab is
  // hidden so a backgrounded page is not still pulling bytes.
  React.useEffect(() => {
    if (!moving) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setFiles((current) =>
        current.map((file) => {
          if (file.state !== "loading") return file;
          const next = Math.min(1, (file.progress ?? 0) + 0.07);
          const fault = faults[file.id];
          if (fault !== undefined && next >= fault) {
            return { ...file, progress: fault, state: "failed" };
          }
          return {
            ...file,
            progress: next,
            state: next >= 1 ? "ready" : "loading",
          };
        }),
      );
    }, 130);
    return () => window.clearInterval(timer);
  }, [moving, faults]);

  const start = (id: string, clearFault: boolean) => {
    if (clearFault) {
      setFaults((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([key]) => key !== id),
        ),
      );
    }
    setFiles((current) =>
      current.map((file) =>
        file.id === id ? { ...file, progress: 0, state: "loading" } : file,
      ),
    );
  };

  const nameOf = (id: string) =>
    files.find((file) => file.id === id)?.name ?? id;
  const busy = files.find((file) => file.state === "loading") ?? null;
  const broken = files.find((file) => file.state === "failed") ?? null;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <FileCard
        label="Site thread with Rui"
        peerName="Rui"
        files={files}
        onDownload={(id) => start(id, false)}
        onRetry={(id) => start(id, true)}
        onCancel={(id) => {
          setNote(`${nameOf(id)} cancelled`);
          setFiles((current) =>
            current.map((file) =>
              file.id === id ? { ...file, progress: 0, state: "offer" } : file,
            ),
          );
        }}
        onOpen={(id) => setNote(`${nameOf(id)} opened`)}
        onSettle={(id) => setNote(`${nameOf(id)} ready`)}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {busy ? (
          <span className="text-signal">
            {busy.name} {Math.round((busy.progress ?? 0) * 100)}%
          </span>
        ) : broken ? (
          <span className="text-danger">{broken.name} failed</span>
        ) : (
          <span className="text-signal">{note}</span>
        )}
      </p>
    </div>
  );
}
