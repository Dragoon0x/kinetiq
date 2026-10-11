"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultGlassineAlbumPhotos,
  GlassineAlbum,
} from "@/registry/ui/glassine-album";

export const tweaks = defineTweaks({
  weight: {
    kind: "range",
    label: "Page weight",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tissue: {
    kind: "range",
    label: "Tissue",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  paperTone: {
    kind: "choice",
    label: "Paper",
    default: "black",
    options: ["cream", "black", "dove", "sage"],
    names: { cream: "Cream", black: "Black", dove: "Dove", sage: "Sage" },
  },
});

const PHOTOS = defaultGlassineAlbumPhotos;
const LAST = Math.ceil(PHOTOS.length / 2);

/**
 * The Coldbrook family album: one summer at Saltmarsh, eight prints between
 * sheets of glassine.
 */
export function GlassineAlbumDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [spread, setSpread] = React.useState(0);
  const right = PHOTOS[2 * spread];
  const left = PHOTOS[2 * spread - 1];
  const total = PHOTOS.length;

  const album = (
    <GlassineAlbum
      title="Summers at Saltmarsh"
      label="Coldbrook family album"
      value={spread}
      onValueChange={setSpread}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) {
    return <div className="mx-auto flex w-full max-w-[46rem]">{album}</div>;
  }

  return (
    <div className="flex w-full max-w-[46rem] flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Coldbrook family album · 1961
      </p>
      {album}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {spread === 0 ? (
          <>
            <span className="text-signal">inside the cover</span> · drag the
            page toward the spine
          </>
        ) : spread >= LAST ? (
          <>
            <span className="text-signal">
              page {total} of {total}
            </span>{" "}
            · {left?.caption ?? "the end"}
          </>
        ) : (
          <>
            <span className="text-signal">
              pages {2 * spread}–{2 * spread + 1} of {total}
            </span>{" "}
            · {right?.caption ?? ""}
          </>
        )}
      </p>
    </div>
  );
}
