"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  FolderDrop,
  type FolderDropItem,
  type FolderDropRejection,
} from "@/registry/ui/folder-drop";

export const tweaks = defineTweaks({
  maxSize: {
    kind: "range",
    label: "Max size",
    default: 10,
    min: 1,
    max: 20,
    step: 1,
    unit: "MB",
  },
  accept: {
    kind: "choice",
    label: "Accept",
    default: "any",
    options: ["images", "docs", "any"],
    names: { images: "Images", docs: "Docs", any: "Any" },
  },
  folder: {
    kind: "choice",
    label: "Folder",
    default: "manila",
    options: ["manila", "blue", "kraft"],
    names: { manila: "Manila", blue: "Blue", kraft: "Kraft" },
  },
});

const MB = 1024 * 1024;

/** Already on the survey: one filed, one still going up. */
const START: FolderDropItem[] = [
  {
    id: "north-wall",
    name: "north-wall.jpg",
    size: Math.round(2.4 * MB),
    type: "image/jpeg",
    progress: 1,
  },
  {
    id: "roof-east",
    name: "roof-east.png",
    size: Math.round(1.1 * MB),
    type: "image/png",
    progress: 0.64,
  },
];

/** What "Drop a sample" hands the folder, in turn. */
const SAMPLES = [
  { name: "gate-west", ext: "jpg", size: 3.1 * MB, type: "image/jpeg" },
  { name: "drone-pass", ext: "tif", size: 12.4 * MB, type: "image/tiff" },
  { name: "survey-notes", ext: "pdf", size: 0.4 * MB, type: "application/pdf" },
] as const;

/** How far an upload climbs per tick, from its id: steady, not random. */
const rateOf = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 0.05 + (h % 5) * 0.012;
};

/**
 * Files for a Fieldline site survey report. New files upload on their own;
 * the demo fakes the upload with a short timer that runs only while one is
 * going.
 */
export function FolderDropDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [files, setFiles] = React.useState<FolderDropItem[]>(START);
  const [bounce, setBounce] = React.useState<FolderDropRejection | null>(null);
  const [turn, setTurn] = React.useState(0);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const uploading = files.filter((f) => (f.progress ?? 1) < 1).length;

  React.useEffect(() => {
    if (uploading === 0) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setFiles((list) =>
        list.map((f) =>
          f.progress !== undefined && f.progress < 1
            ? {
                ...f,
                progress: Math.min(
                  1,
                  Number((f.progress + rateOf(f.id)).toFixed(3)),
                ),
              }
            : f,
        ),
      );
    }, 160);
    return () => window.clearInterval(timer);
  }, [uploading]);

  /** Hands a sample to the folder through a real drop, checks and all. */
  const dropSample = () => {
    const sample = SAMPLES[turn % SAMPLES.length];
    const round = Math.floor(turn / SAMPLES.length);
    const target = wrapRef.current?.querySelector("button");
    if (!sample || !target) return;
    setTurn((t) => t + 1);
    const file = new File(
      [new ArrayBuffer(Math.round(sample.size))],
      `${sample.name}${round ? `-${round + 1}` : ""}.${sample.ext}`,
      { type: sample.type },
    );
    try {
      const data = new DataTransfer();
      data.items.add(file);
      const box = target.getBoundingClientRect();
      target.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
          clientX: box.left + box.width / 2,
          clientY: box.top + box.height / 2,
        }),
      );
    } catch {
      // A browser without DataTransfer: drop a real file instead.
    }
  };

  return (
    <div ref={wrapRef} className="flex w-full max-w-sm flex-col gap-4">
      <form onSubmit={(event) => event.preventDefault()} className="w-full">
        <FolderDrop
          label="Survey files"
          name="survey"
          value={files}
          onValueChange={(next) => {
            // New files start uploading as soon as they are in the folder.
            setFiles(
              next.map((f) =>
                f.progress === undefined ? { ...f, progress: 0 } : f,
              ),
            );
            setBounce(null);
          }}
          onReject={(r) => setBounce(r[0] ?? null)}
          sound={sound}
          {...values}
        />
      </form>
      {chrome ? (
        <>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={dropSample}
              className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Drop a sample
            </button>
            <span className="truncate text-xs text-ink-3">
              Next: {SAMPLES[turn % SAMPLES.length]?.name}.
              {SAMPLES[turn % SAMPLES.length]?.ext}
            </span>
          </div>
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {bounce ? (
              <>
                <span className="text-signal">bounced {bounce.name}</span> ·{" "}
                {bounce.reason.replace(/\.$/, "")}
              </>
            ) : (
              <>
                <span className="text-signal">
                  {files.length} {files.length === 1 ? "file" : "files"}
                </span>{" "}
                · {uploading ? `${uploading} uploading` : "all filed"}
              </>
            )}
          </p>
        </>
      ) : null}
    </div>
  );
}
