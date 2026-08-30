"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PencilVerb = { id: string; label: string };

export type BluePencilProps = {
  /** The passage the pencil works over. */
  children?: React.ReactNode;
  verbs?: PencilVerb[];
  /** Fired with the verb and the selected text. */
  onVerb?: (verbId: string, selection: string) => void;
  /** Accessible name for the toolbar. */
  label?: string;
  className?: string;
};

const DEFAULT_VERBS: PencilVerb[] = [
  { id: "explain", label: "Explain" },
  { id: "improve", label: "Improve" },
  { id: "shorten", label: "Shorten" },
  { id: "tone", label: "Tone" },
  { id: "grammar", label: "Grammar" },
];

const DEFAULT_PASSAGE =
  "North basin holds the tightest window all week. Cut the board first thing Saturday so the crews read it before the gate opens, and keep crane 2 clear until the rig test is signed.";

/**
 * The editor's blue pencil: select a passage and a small toolbar of rewrite
 * verbs springs up anchored to the selection — explain, improve, shorten,
 * tone. The verbs hand the selected text back out; the pencil never rewrites
 * anything itself, because the surface that edits and the model that edits
 * must be separable for either to be trusted. Collapse the selection and the
 * toolbar withdraws.
 *
 * The toolbar is positioned from the selection's own rectangle, clamped to
 * the passage box. Reduced motion: it appears in place, no spring.
 */
export function BluePencil({
  children,
  verbs = DEFAULT_VERBS,
  onVerb,
  label = "Rewrite selection",
  className,
}: BluePencilProps) {
  const motionSafe = useMotionSafe();
  const boxRef = React.useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = React.useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);

  const readSelection = React.useCallback(() => {
    const box = boxRef.current;
    const selection = window.getSelection();
    if (!box || !selection || selection.isCollapsed) {
      setAnchor(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!box.contains(range.commonAncestorContainer)) {
      setAnchor(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const pad = 8;
    setAnchor({
      x: Math.min(
        Math.max(rect.left - boxRect.left + rect.width / 2, pad),
        boxRect.width - pad,
      ),
      y: Math.max(rect.top - boxRect.top, 0),
      text: selection.toString(),
    });
  }, []);

  React.useEffect(() => {
    // Selection can change from keyboard, double-click, or drag — the
    // document-level event catches all three.
    document.addEventListener("selectionchange", readSelection);
    return () => document.removeEventListener("selectionchange", readSelection);
  }, [readSelection]);

  return (
    <div
      ref={boxRef}
      className={cn("relative w-full max-w-md select-text", className)}
    >
      <div className="text-sm leading-relaxed text-ink-2">
        {children ?? <p>{DEFAULT_PASSAGE}</p>}
      </div>

      <AnimatePresence>
        {anchor && (
          <motion.div
            role="toolbar"
            aria-label={label}
            initial={{
              opacity: 0,
              scale: motionSafe ? 0.9 : 1,
              y: motionSafe ? distances.nudge / 2 : 0,
            }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: durations.fast } }}
            transition={motionSafe ? springs.flick : { duration: 0 }}
            className="absolute z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-hairline bg-surface-0 p-1 shadow-raised"
            style={{ left: anchor.x, top: anchor.y - 44 }}
          >
            {verbs.map((verb) => (
              <button
                key={verb.id}
                type="button"
                onClick={() => onVerb?.(verb.id, anchor.text)}
                className="rounded-full px-2.5 py-1 text-xs font-medium text-ink-2 transition-colors hover:bg-surface-1 hover:text-ink"
              >
                {verb.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mt-3 text-xs text-ink-3">
        Select any part of the passage to raise the pencil.
      </p>
    </div>
  );
}
