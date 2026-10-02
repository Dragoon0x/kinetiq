"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  DownloadTray,
  type DownloadTrayState,
} from "@/registry/ui/download-tray";

export const tweaks = defineTweaks({
  tray: {
    kind: "choice",
    label: "Tray",
    default: "glide",
    options: ["glide", "snap", "recoil"],
    names: { glide: "Glide", snap: "Snap", recoil: "Bounce" },
  },
  progress: {
    kind: "choice",
    label: "Progress",
    default: "line",
    options: ["line", "ticks", "bytes"],
    names: { line: "Line", ticks: "Ticks", bytes: "Bytes" },
  },
  size: {
    kind: "choice",
    label: "Size",
    default: "md",
    options: ["sm", "md", "lg"],
    names: { sm: "Small", md: "Medium", lg: "Large" },
  },
});

const BYTES = 8_412_000;
/** How long the statement takes to come down, in ms. */
const TRANSFER = 2400;

/**
 * Coldbrook Bank's September statement: the PDF drops into the tray and the
 * tray slides shut with its size stamped.
 */
export function DownloadTrayDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [phase, setPhase] = React.useState<DownloadTrayState>("idle");
  const [cancelled, setCancelled] = React.useState(false);
  const [dropNext, setDropNext] = React.useState(false);

  const onDownload = () => {
    const drop = dropNext;
    setDropNext(false);
    return new Promise<void>((resolve, reject) => {
      window.setTimeout(
        () => (drop ? reject(new Error("Connection lost")) : resolve()),
        drop ? TRANSFER * 0.6 : TRANSFER + 200,
      );
    });
  };

  return (
    <div className="flex w-full max-w-xs flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-card px-4 pt-3 pb-1">
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground">
            September statement
          </p>
          <p className="truncate font-mono text-[11px] text-ink-3">
            Coldbrook Bank · checking ··42
          </p>
        </div>
        <DownloadTray
          className="self-start"
          bytes={BYTES}
          kind="PDF"
          duration={TRANSFER}
          onDownload={onDownload}
          onCancel={() => setCancelled(true)}
          onStateChange={(state) => {
            if (state === "pending") setCancelled(false);
            setPhase(state);
          }}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {phase === "pending" ? (
              <>
                <span className="text-signal">downloading</span> · press to
                cancel
              </>
            ) : phase === "success" ? (
              <>
                <span className="text-signal">saved</span> · statement-09.pdf
              </>
            ) : phase === "error" ? (
              <>
                <span className="text-signal">failed</span> · connection lost
              </>
            ) : cancelled ? (
              <>
                <span className="text-signal">cancelled</span> · nothing saved
              </>
            ) : (
              <>
                <span className="text-signal">ready</span> · statement-09.pdf
              </>
            )}
          </p>
          <button
            type="button"
            aria-pressed={dropNext}
            onClick={() => setDropNext((d) => !d)}
            className={cn(
              "inline-flex h-7 shrink-0 items-center rounded-2 border px-2.5 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              dropNext
                ? "border-danger/40 bg-danger/10 text-danger"
                : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
            )}
          >
            Drop connection
          </button>
        </div>
      ) : null}
    </div>
  );
}
