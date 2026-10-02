"use client";

import * as React from "react";

import { Images } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  UploadOrbit,
  type UploadOrbitFile,
  type UploadOrbitHandle,
  type UploadOrbitState,
} from "@/registry/ui/upload-orbit";

export const tweaks = defineTweaks({
  tail: {
    kind: "range",
    label: "Tail",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  queue: {
    kind: "range",
    label: "Queue",
    default: 2,
    min: 1,
    max: 4,
    step: 1,
  },
});

const SAMPLES = [
  "basin-road-north.jpg",
  "culvert-outfall.jpg",
  "pump-house-roof.jpg",
  "spillway-joint.jpg",
] as const;

const MAX_BYTES = 8 * 1024 * 1024;

/** A small seeded generator, so every run of a sample uploads the same way. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const seedOf = (text: string) =>
  [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/**
 * A connection that sends in uneven chunks, as a phone on site does. It
 * honours the abort signal, and a file marked to fail drops past halfway.
 */
function simulate(
  file: File,
  progress: (share: number) => void,
  signal: AbortSignal,
  fail: boolean,
) {
  return new Promise<void>((resolve, reject) => {
    const rand = seeded(seedOf(file.name) + file.size);
    let share = 0;
    let timer = 0;
    const tick = () => {
      if (signal.aborted) return;
      share = Math.min(1, share + 0.05 + rand() * 0.13);
      if (fail && share > 0.55) {
        reject(new Error("Connection dropped"));
        return;
      }
      progress(share);
      if (share >= 1) {
        resolve();
        return;
      }
      timer = window.setTimeout(tick, 140 + Math.round(rand() * 160));
    };
    timer = window.setTimeout(tick, 200);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new Error("Cancelled"));
      },
      { once: true },
    );
  });
}

/**
 * Attaching site photos to a Fieldline inspection report: drop them on the
 * button or choose them, and watch each one circle until it lands.
 */
export function UploadOrbitDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const handle = React.useRef<UploadOrbitHandle | null>(null);
  const [files, setFiles] = React.useState<UploadOrbitFile[]>([]);
  const [phase, setPhase] = React.useState<UploadOrbitState>("idle");
  const [failNext, setFailNext] = React.useState(false);
  // Read and cleared by the upload that takes it: two starting together must
  // not both see it.
  const failArmed = React.useRef(false);
  const [round, setRound] = React.useState(0);

  const onUpload = (
    file: File,
    progress: (share: number) => void,
    signal: AbortSignal,
  ) => {
    const fail = failArmed.current;
    if (fail) {
      failArmed.current = false;
      setFailNext(false);
    }
    return simulate(file, progress, signal, fail);
  };

  const addSamples = () => {
    const batch = SAMPLES.map(
      (name) =>
        new File([new Uint8Array(round + 1)], name, { type: "image/jpeg" }),
    );
    setRound((r) => r + 1);
    handle.current?.add(batch);
  };

  const done = files.filter((f) => f.status === "done").length;
  const failed = files.filter((f) => f.status === "error").length;
  const going = files.filter(
    (f) => f.status === "queued" || f.status === "uploading",
  ).length;

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex items-center gap-3 rounded-3 border border-hairline bg-card pl-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            Site photos
          </p>
          <p className="truncate text-xs text-ink-3">
            Fieldline · Inspection 14, Basin Road
          </p>
        </div>
        <UploadOrbit
          ref={handle}
          accept="image/*"
          maxSize={MAX_BYTES}
          onUpload={onUpload}
          onFilesChange={setFiles}
          onStateChange={setPhase}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {phase === "pending" ? (
              <>
                <span className="text-signal">uploading</span> ·{" "}
                {going > 0 ? `${going} to go` : "landing"}
              </>
            ) : phase === "error" ? (
              <>
                <span className="text-signal">{failed} failed</span> · press
                retry
              </>
            ) : done > 0 ? (
              <>
                <span className="text-signal">
                  {done} {done === 1 ? "photo" : "photos"}
                </span>{" "}
                on the report
              </>
            ) : (
              <>
                <span className="text-signal">no photos yet</span> · drop or
                choose
              </>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={addSamples}
              className={cn(
                "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              )}
            >
              <Images aria-hidden className="size-3.5 shrink-0" />
              Add samples
            </button>
            <button
              type="button"
              aria-pressed={failNext}
              onClick={() => {
                failArmed.current = !failNext;
                setFailNext(!failNext);
              }}
              className={cn(
                "inline-flex h-7 cursor-pointer items-center rounded-2 border px-2.5 text-xs transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                failNext
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
              )}
            >
              Fail next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
