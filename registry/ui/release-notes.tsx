"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ReleaseKind = "added" | "changed" | "fixed" | "removed";

export type ReleaseCommit = {
  id: string;
  kind: ReleaseKind;
  /** The line as the commit wrote it; an edit overrides it without losing it. */
  text: string;
  /** The part of the service it touched, printed before the line. */
  scope?: string;
};

export type ReleaseNotesProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The landed commits, in the order they landed. */
  commits: ReleaseCommit[];
  /** The release being written. */
  version: string;
  /** What the release is of. */
  service: string;
  /** The release date as a string — the card never reads a clock. */
  dateLabel?: string;
  /** Controlled per-commit text overrides. */
  edits?: Record<string, string>;
  /** Initial overrides for uncontrolled usage. @default {} */
  defaultEdits?: Record<string, string>;
  /** Fires from the setter that committed an edit. */
  onEditsChange?: (edits: Record<string, string>) => void;
  /** Fires once per committed line, with the text it now reads. */
  onEntryCommit?: (id: string, text: string) => void;
  /** Which line is open for editing — a state, so it also fires on mount. */
  onEditingChange?: (id: string | null) => void;
  /** Names the card for assistive technology. @default "Release notes" */
  label?: string;
  className?: string;
};

const ORDER: ReleaseKind[] = ["added", "changed", "fixed", "removed"];

const KIND: Record<ReleaseKind, { word: string; text: string; dot: string }> = {
  added: { word: "Added", text: "text-success", dot: "bg-success" },
  changed: { word: "Changed", text: "text-warn", dot: "bg-warn" },
  fixed: { word: "Fixed", text: "text-cobalt-bright", dot: "bg-cobalt-bright" },
  removed: { word: "Removed", text: "text-ink-2", dot: "bg-ink-3" },
};

const entryPhrase = (count: number): string =>
  `${count} ${count === 1 ? "entry" : "entries"}`;

/** A spoken sentence never doubles a stop the quoted line already carries. */
const endStop = (text: string): string =>
  /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

/**
 * The note a release writes about itself while it is still being cut. Commits
 * arrive as props and the card groups them — added, changed, fixed, removed —
 * printing each group with its own count. A line that lands arrives from
 * `distances.nudge` on `glide`, staggered inside its group by `cascade()`, while
 * the lines already there travel under `layout` on the same spring: a new entry
 * pushing the rest down is a layout shift, not a bounce. Each count sits in one
 * grid cell and cross-fades, so two commits landing together can never blank it.
 *
 * Editing happens in place. Pressing a line swaps its text for an `<input>` in
 * the same cell; the field is focused when it ARRIVES — held in state by a ref
 * callback, focused from an effect keyed on that node — because a focus call
 * fired on a guessed frame lands on an element that does not exist yet. Enter
 * commits, Escape reverts, blur commits, and focus returns to the line's button
 * the same way it left. An edited line keeps a quiet `edited` mark, so the
 * distance between the commit and the note is never silent.
 *
 * Nothing here reads a clock: the date is a string prop. Under reduced motion
 * entries appear with opacity only, `layout` is off, and the counts still
 * change — what the release contains is information, not flourish.
 */
export function ReleaseNotes({
  ref,
  commits,
  version,
  service,
  dateLabel,
  edits,
  defaultEdits,
  onEditsChange,
  onEntryCommit,
  onEditingChange,
  label = "Release notes",
  className,
}: ReleaseNotesProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [ownEdits, setOwnEdits] = React.useState<Record<string, string>>(
    defaultEdits ?? {},
  );
  const overrides = edits ?? ownEdits;

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [restoreId, setRestoreId] = React.useState<string | null>(null);
  const [spoken, setSpoken] = React.useState("");

  const textOf = (commit: ReleaseCommit): string =>
    overrides[commit.id] ?? commit.text;

  const groups = ORDER.map((kind) => ({
    kind,
    entries: commits.filter((commit) => commit.kind === kind),
  })).filter((group) => group.entries.length > 0);

  // One flat order for the keyboard: the note reads as a single list, so Arrow
  // Down out of the last Added line lands on the first Changed line.
  const lines = groups.flatMap((group) => group.entries);
  const roster = commits.map((commit) => commit.id).join(",");

  // A commit landing is a settled event, so the freeze starts on the note as it
  // stands and speaks nothing on the first commit. Set during render, which is
  // the point: this pass already reads the NEW sentence, not the one it replaced.
  const [landed, setLanded] = React.useState({ key: roster, sentence: "" });
  if (landed.key !== roster) {
    const before = landed.key ? landed.key.split(",") : [];
    const fresh = commits.filter((commit) => !before.includes(commit.id));
    const one = fresh[fresh.length - 1];
    setLanded({
      key: roster,
      sentence:
        fresh.length === 0
          ? `The note now holds ${entryPhrase(commits.length)}.`
          : fresh.length === 1 && one
            ? `${KIND[one.kind].word}: ${endStop(textOf(one))} The note holds ${entryPhrase(commits.length)}.`
            : `${fresh.length} commits grouped into the note, ${entryPhrase(commits.length)} in all.`,
    });
    // The edit region and the landing region are the same region: the newest
    // sentence wins, whichever caused it. A roster that changed under the note
    // also drops the pending focus restore, so a re-mounted line cannot pull
    // the caret back into a list the viewer has left.
    setSpoken("");
    setRestoreId(null);
  }

  const editingRef = React.useRef(onEditingChange);
  React.useEffect(() => {
    editingRef.current = onEditingChange;
  });
  // Which line is open is a state, not an event: it reports from mount.
  React.useEffect(() => {
    editingRef.current?.(editingId);
  }, [editingId]);

  const [editorNode, setEditorNode] = React.useState<HTMLInputElement | null>(
    null,
  );
  React.useEffect(() => {
    if (!editorNode) return;
    editorNode.focus();
    editorNode.select();
  }, [editorNode]);

  // The line's button is remounted by the swap back, so focus is bound to it
  // when it ARRIVES rather than fired at the frame the edit ended on.
  const [lineNode, setLineNode] = React.useState<HTMLButtonElement | null>(
    null,
  );
  React.useEffect(() => {
    lineNode?.focus();
  }, [lineNode]);

  const setEdits = (next: Record<string, string>) => {
    if (edits === undefined) setOwnEdits(next);
    onEditsChange?.(next);
  };

  const startEdit = (commit: ReleaseCommit) => {
    setEditingId(commit.id);
    setDraft(textOf(commit));
    setRestoreId(null);
  };

  const finishEdit = (
    commit: ReleaseCommit,
    keep: boolean,
    restoreFocus: boolean,
  ) => {
    const wanted = draft.trim();
    const settled = keep && wanted.length > 0 ? wanted : textOf(commit);
    if (keep && wanted.length > 0) {
      const next = { ...overrides };
      if (wanted === commit.text) delete next[commit.id];
      else next[commit.id] = wanted;
      setEdits(next);
      onEntryCommit?.(commit.id, settled);
    }
    setEditingId(null);
    // Only a key hands focus back. A blur means the viewer pressed something
    // else, and dragging the caret back into the note would fight them for it.
    setRestoreId(restoreFocus ? commit.id : null);
    setSpoken(
      keep && wanted.length > 0
        ? `Line now reads: ${endStop(settled)}`
        : "Edit cancelled.",
    );
  };

  const focusLine = (index: number) => {
    const target = lines[Math.min(lines.length - 1, Math.max(0, index))];
    if (!target) return;
    setFocusId(target.id);
    document.getElementById(`${baseId}-line-${target.id}`)?.focus();
  };

  const onLineKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    commit: ReleaseCommit,
    index: number,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusLine(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusLine(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusLine(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusLine(lines.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      startEdit(commit);
    }
  };

  const tabbable =
    focusId && lines.some((line) => line.id === focusId)
      ? focusId
      : (lines[0]?.id ?? "");
  const editedCount = commits.filter(
    (commit) => overrides[commit.id] !== undefined,
  ).length;
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const arrive = motionSafe
    ? { opacity: 0, y: distances.nudge }
    : { opacity: 0, y: 0 };
  const leave = { opacity: 0, transition: exitFor(durations.fast) };
  const settle = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn(
        "flex w-full flex-col gap-2.5 overflow-clip rounded-3 border border-hairline bg-surface-1 p-3 [contain:paint]",
        className,
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-ink">
            {service} {version}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-ink-2 tabular-nums">
            {entryPhrase(commits.length)}
          </span>
        </span>
        {dateLabel ? (
          <span className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {dateLabel}
            {editedCount > 0
              ? ` · ${editedCount} edited`
              : " · straight from the commits"}
          </span>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <p className="rounded-2 border border-dashed border-hairline-strong px-2 py-3 text-center font-mono text-[11px] text-ink-3">
          Nothing has landed in {version} yet.
        </p>
      ) : null}

      {/* Not `initial={false}`: the note writes itself as the commits group,
          which is the whole motion idea, and a note rendered whole cascades the
          same way one built line by line does. */}
      <AnimatePresence>
        {groups.map((group) => {
          const stagger = cascade(Math.max(group.entries.length, 1));
          return (
            <motion.section
              key={group.kind}
              layout={motionSafe ? "position" : false}
              className="flex flex-col gap-1"
              initial={arrive}
              animate={{ opacity: 1, y: 0 }}
              exit={leave}
              transition={settle}
            >
              <h3
                className={cn(
                  "flex items-baseline gap-1.5 font-mono text-[10px] font-semibold tracking-[0.08em] uppercase",
                  KIND[group.kind].text,
                )}
              >
                <span>{KIND[group.kind].word}</span>
                {/* One cell, cross-faded: a count that swapped through
                    mode="wait" would blank between two quick landings. */}
                <span className="grid">
                  <AnimatePresence initial={false}>
                    <motion.span
                      key={group.entries.length}
                      className="col-start-1 row-start-1 text-ink-3 tabular-nums"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={leave}
                      transition={fade}
                    >
                      {group.entries.length}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </h3>

              <ol role="list" className="flex flex-col gap-0.5">
                <AnimatePresence>
                  {group.entries.map((commit, index) => {
                    const text = textOf(commit);
                    const edited = overrides[commit.id] !== undefined;
                    const editing = editingId === commit.id;
                    const flat = lines.findIndex(
                      (line) => line.id === commit.id,
                    );
                    return (
                      <motion.li
                        key={commit.id}
                        layout={motionSafe ? "position" : false}
                        className="grid"
                        initial={arrive}
                        animate={{ opacity: 1, y: 0 }}
                        exit={leave}
                        transition={
                          motionSafe
                            ? { ...springs.glide, delay: index * stagger }
                            : { duration: durations.base, ease: easings.enter }
                        }
                      >
                        <AnimatePresence initial={false}>
                          {editing ? (
                            <motion.input
                              key="editor"
                              ref={setEditorNode}
                              value={draft}
                              aria-label={`${KIND[commit.kind].word} entry`}
                              onChange={(event) => setDraft(event.target.value)}
                              onBlur={() => finishEdit(commit, true, false)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  finishEdit(commit, true, true);
                                } else if (event.key === "Escape") {
                                  event.preventDefault();
                                  finishEdit(commit, false, true);
                                }
                              }}
                              className={cn(
                                "col-start-1 row-start-1 h-7 w-full rounded-1 border border-input bg-surface-0 px-2 font-mono text-[11px] text-ink",
                                focusRing,
                              )}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={leave}
                              transition={fade}
                            />
                          ) : (
                            <motion.button
                              key="line"
                              ref={restoreId === commit.id ? setLineNode : null}
                              type="button"
                              id={`${baseId}-line-${commit.id}`}
                              tabIndex={commit.id === tabbable ? 0 : -1}
                              aria-label={`${KIND[commit.kind].word}${commit.scope ? `, ${commit.scope}` : ""}: ${endStop(text)} Press to edit.`}
                              onFocus={() => setFocusId(commit.id)}
                              onClick={() => startEdit(commit)}
                              onKeyDown={(event) =>
                                onLineKeyDown(event, commit, flat)
                              }
                              className={cn(
                                "col-start-1 row-start-1 flex w-full items-start gap-1.5 rounded-1 px-2 py-1 text-left transition-colors hover:bg-accent",
                                focusRing,
                              )}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={leave}
                              transition={fade}
                            >
                              <span
                                aria-hidden
                                className={cn(
                                  "mt-1.5 size-1 shrink-0 rounded-full",
                                  KIND[commit.kind].dot,
                                )}
                              />
                              <span className="min-w-0 flex-1 font-mono text-[11px] leading-snug text-ink">
                                {commit.scope ? (
                                  <span className="text-ink-3">
                                    {commit.scope}{" "}
                                  </span>
                                ) : null}
                                {text}
                              </span>
                              {edited ? (
                                <span
                                  aria-hidden
                                  className="mt-px shrink-0 rounded-1 bg-surface-2 px-1 font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase"
                                >
                                  edited
                                </span>
                              ) : null}
                            </motion.button>
                          )}
                        </AnimatePresence>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ol>
            </motion.section>
          );
        })}
      </AnimatePresence>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken || landed.sentence}
      </span>
    </div>
  );
}
