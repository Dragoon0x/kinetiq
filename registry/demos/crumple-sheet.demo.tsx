"use client";

import * as React from "react";

import { CrumpleSheet } from "@/registry/ui/crumple-sheet";

export function CrumpleSheetDemo() {
  const [wadded, setWadded] = React.useState(false);

  return (
    <div className="w-full max-w-lg">
      <div className="border-hairline bg-surface-1 relative rounded-4 border p-4">
        <span
          aria-hidden
          className="border-hairline absolute top-2 left-2 size-2 border-t border-l"
        />
        <span
          aria-hidden
          className="border-hairline absolute top-2 right-2 size-2 border-t border-r"
        />
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-label text-ink-3">DRAFT NOTICE</p>
          <p className="text-label text-ink-3">KQ-099</p>
        </div>

        <CrumpleSheet height={220} onCrumpleChange={setWadded}>
          <div className="flex h-full flex-col justify-between p-4">
            <div className="pr-20">
              <p className="text-ink-3 font-mono text-[10px] tracking-wide">
                DRAFT &middot; REV 2
              </p>
              <p className="text-ink-2 mt-3 text-xs leading-relaxed">
                Routing memo awaiting countersign.
              </p>
              <p className="text-ink-2 text-xs leading-relaxed">
                Supersedes REV 1 held on file.
              </p>
            </div>
            <div className="border-hairline flex items-baseline justify-between border-t pt-2">
              <p className="text-ink-3 font-mono text-[10px] tracking-wide">
                SGD &middot; K. QUILL
              </p>
              <p className="text-ink-3 font-mono text-[10px] tracking-wide">
                REG 04-KQ
              </p>
            </div>
          </div>
        </CrumpleSheet>

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          SHEET &middot;{" "}
          <span className="text-cobalt-bright">
            {wadded ? "WADDED" : "FLAT"}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Crumple the draft - press the wad to smooth it back out.
        </p>
      </div>
    </div>
  );
}
