"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  BlockEditor,
  defaultEditorBlocks,
  type EditorBlock,
} from "@/registry/ui/block-editor";

export const tweaks = defineTweaks({
  handles: {
    kind: "choice",
    label: "Handles",
    default: "hover",
    options: ["hover", "always", "off"],
    names: { hover: "On hover", always: "Always", off: "Off" },
  },
  slash: {
    kind: "choice",
    label: "Slash menu",
    default: "list",
    options: ["list", "grid", "off"],
    names: { list: "List", grid: "Grid", off: "Off" },
  },
  bubble: {
    kind: "choice",
    label: "Bubble",
    default: "full",
    options: ["full", "compact", "off"],
    names: { full: "Full", compact: "Compact", off: "Off" },
  },
});

const plain = (text: string) =>
  text.replace(/\*\*|~~|`|_|\[|\]\([^)]*\)/g, "").trim();

const words = (blocks: EditorBlock[]) =>
  blocks.reduce((n, b) => n + (plain(b.text).match(/[^\s]+/g)?.length ?? 0), 0);

/** What changed between two versions of the notes, in a few words. */
function describe(before: EditorBlock[], after: EditorBlock[]): string | null {
  if (after.length > before.length) {
    const added = after.find((b) => !before.some((x) => x.id === b.id));
    return added?.type === "todo" ? "added a to-do" : "added a block";
  }
  if (after.length < before.length) return "removed a block";
  const order = after.map((b) => b.id).join();
  if (order !== before.map((b) => b.id).join()) {
    const moved = after.find((b, i) => before[i]?.id !== b.id);
    const i = moved ? after.indexOf(moved) : -1;
    return moved
      ? `moved “${plain(moved.text).slice(0, 28)}” to ${i + 1}`
      : "moved a block";
  }
  for (const b of after) {
    const was = before.find((x) => x.id === b.id);
    if (!was) continue;
    if (was.type !== b.type) return `turned a block into ${b.type}`;
    if (!!was.checked !== !!b.checked) {
      return `${b.checked ? "ticked" : "unticked"} “${plain(b.text).slice(0, 28)}”`;
    }
    if (was.text !== b.text) {
      const marks = (t: string) => (t.match(/\*\*|~~|`|_/g) ?? []).length;
      if (marks(b.text) !== marks(was.text)) return "formatting changed";
      return null;
    }
  }
  return null;
}

/**
 * Fieldline field notes from a river survey: a heading, notes with marks in
 * them, a checklist for the end of the day and a quote to remember.
 */
export function BlockEditorDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [blocks, setBlocks] =
    React.useState<EditorBlock[]>(defaultEditorBlocks);
  const [note, setNote] = React.useState<string | null>(null);

  const editor = (
    <BlockEditor
      blocks={blocks}
      onBlocksChange={(next) => {
        const said = describe(blocks, next);
        if (said) setNote(said);
        setBlocks(next);
      }}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{editor}</div>;

  const todos = blocks.filter((b) => b.type === "todo");
  const done = todos.filter((b) => b.checked).length;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {editor}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {note ? (
            <span className="text-signal">{note}</span>
          ) : (
            <>
              <span className="text-signal">
                {blocks.length} blocks · {words(blocks)} words
              </span>{" "}
              · {done} of {todos.length} to-dos done
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setBlocks(defaultEditorBlocks);
            setNote(null);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
