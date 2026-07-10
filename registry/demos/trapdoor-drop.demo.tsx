"use client";

import * as React from "react";

import { TrapdoorDrop } from "@/registry/ui/trapdoor-drop";

const CRATES = [
  { id: "crate-12", label: "CRATE 12", contents: "SCRAP COILS" },
  { id: "crate-13", label: "CRATE 13", contents: "BENT RAILS" },
  { id: "crate-14", label: "CRATE 14", contents: "DUST FILTERS" },
];

export function TrapdoorDropDemo() {
  const [dropped, setDropped] = React.useState(0);
  const crate = CRATES[dropped];

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
          <p className="text-label text-ink-3">DISPOSAL CHUTE · 03 CRATES</p>
          <p className="text-label text-ink-3">KQ-159</p>
        </div>

        {crate ? (
          <TrapdoorDrop
            itemKey={crate.id}
            height={230}
            armLabel="DISMISS CRATE"
            dropLabel="CONFIRM DROP"
            disarmLabel="KEEP IT"
            onDrop={() => setDropped((n) => n + 1)}
          >
            <span className="block text-center">
              <span className="text-ink block font-mono text-xs">
                {crate.label}
              </span>
              <span className="text-ink-3 block font-mono text-[10px]">
                {crate.contents}
              </span>
            </span>
          </TrapdoorDrop>
        ) : (
          <div className="border-hairline bg-surface-0 flex h-[230px] items-center justify-center rounded-3 border">
            <p className="text-ink-3 font-mono text-xs">CHUTE CLEAR</p>
          </div>
        )}

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          {dropped >= CRATES.length ? (
            <span className="text-cobalt-bright">CHUTE CLEAR</span>
          ) : (
            <>
              DROPPED ·{" "}
              <span className="text-cobalt-bright">
                {String(dropped).padStart(2, "0")}
              </span>
            </>
          )}
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Arm the doors, then confirm - the crate takes the long way down.
        </p>
      </div>
    </div>
  );
}
