"use client";

import * as React from "react";

import { ImageBubble, type PhotoMessage } from "@/registry/ui/image-bubble";

/** Ines's camera roll, in order; the seeds draw the pictures. */
const ROLL: Omit<PhotoMessage, "id" | "progress">[] = [
  { from: "peer", seed: 31, caption: "Quay at first light", time: "6:12" },
  { from: "peer", seed: 74, caption: "Crane bay, tide out", time: "6:20" },
];

const OPENING: PhotoMessage[] = [
  { id: "p0", from: "me", seed: 58, caption: "Dock four clear", time: "6:04" },
];

export function ImageBubbleDemo() {
  const [photos, setPhotos] = React.useState<PhotoMessage[]>(OPENING);
  const [received, setReceived] = React.useState(0);
  const [viewing, setViewing] = React.useState<string | null>(null);

  const loading = photos.find((photo) => (photo.progress ?? 1) < 1) ?? null;
  const loadingId = loading?.id ?? null;

  // The arrival is the demo's, not the component's: one interval, cleaned up,
  // and skipped while the tab is hidden so a backgrounded page stops loading.
  React.useEffect(() => {
    if (loadingId === null) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setPhotos((current) =>
        current.map((photo) =>
          photo.id === loadingId
            ? { ...photo, progress: Math.min(1, (photo.progress ?? 0) + 0.08) }
            : photo,
        ),
      );
    }, 120);
    return () => window.clearInterval(timer);
  }, [loadingId]);

  const receive = () => {
    const next = ROLL[received % ROLL.length];
    if (!next || loadingId !== null) return;
    setReceived((count) => count + 1);
    setPhotos((current) =>
      [...current, { ...next, id: `p${received + 1}`, progress: 0 }].slice(-2),
    );
  };

  const openCaption =
    photos.find((photo) => photo.id === viewing)?.caption ?? null;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ImageBubble
        label="Harbour thread with Ines"
        peerName="Ines"
        photos={photos}
        onOpen={setViewing}
        onClose={() => setViewing(null)}
      />

      <button
        type="button"
        onClick={receive}
        disabled={loadingId !== null}
        className="h-9 self-start rounded-3 border border-hairline-strong px-3 text-sm font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-cobalt-wash disabled:opacity-50"
      >
        Receive photo
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {photos.length} photos ·{" "}
        <span className="text-signal">
          {openCaption
            ? `viewer · ${openCaption}`
            : loading
              ? `${loading.caption} ${Math.round((loading.progress ?? 0) * 100)}%`
              : "all sharp"}
        </span>
      </p>
    </div>
  );
}
