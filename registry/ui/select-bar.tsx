"use client";

import * as React from "react";

import { AnimatePresence, motion, type Transition } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SelectAction = "bold" | "italic" | "link" | "code";

export type SelectBarProps = {
  /** Buttons on the bar. @default ["bold", "italic", "link"] */
  actions?: SelectAction[];
  /** The editable content. */
  children: React.ReactNode;
  /** Fires after an action, with the editor's HTML. */
  onChange?: (html: string) => void;
  /** Fires with the action that was applied. */
  onAction?: (action: SelectAction) => void;
  /** Accessible name for the editable region. @default "Editable passage" */
  label?: string;
  className?: string;
};

const TAGS: Record<SelectAction, string> = {
  bold: "strong",
  italic: "em",
  link: "a",
  code: "code",
};

const NAMES: Record<SelectAction, string> = {
  bold: "Bold",
  italic: "Italic",
  link: "Link",
  code: "Code",
};

const GLYPHS: Record<SelectAction, React.ReactNode> = {
  bold: <span className="text-[13px] font-bold">B</span>,
  italic: <span className="text-[13px] italic">I</span>,
  link: (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="size-3.5"
    >
      <path d="M6.9 9.1 9.1 6.9" />
      <path d="M7.6 4.9 8.9 3.6a2.5 2.5 0 0 1 3.5 3.5L11.1 8.4" />
      <path d="M8.4 11.1 7.1 12.4a2.5 2.5 0 0 1-3.5-3.5l1.3-1.3" />
    </svg>
  ),
  code: <span className="font-mono text-[10px]">{"</>"}</span>,
};

type Anchor = {
  center: number;
  top: number;
  bottom: number;
  active: Record<string, boolean>;
};

/** Walks out of the selection to the nearest wrapper of `tag`, stopping at the editor. */
function closestTag(node: Node | null, tag: string, root: HTMLElement) {
  let step: Node | null = node;
  while (step && step !== root) {
    if (step instanceof HTMLElement && step.localName === tag) return step;
    step = step.parentNode;
  }
  return null;
}

/**
 * A format bar that rises out of the selection. Select words and the toolbar
 * lifts above them on `recoil` — two visible bounces, the physics of something
 * landing — positioned from the selection's own rectangle and clamped to the
 * passage so it cannot hang off the column on a phone. Change the selection and
 * the bar follows: it glides sideways and rises again. Let the selection go and
 * it fades on the exit ease, because exits never spring.
 *
 * Formatting is range wrapping, not `execCommand`: the selected range is
 * surrounded by a real `<strong>`, `<em>`, `<a>` or `<code>`, and pressing the
 * same button again unwraps it. Every DOM call sits behind a guard, so a
 * synthetic drag across the specimen leaves the passage intact.
 *
 * The editor is a real textbox — `role="textbox"`, `aria-multiline`, reachable
 * by Tab — and the bar is a `role="toolbar"` with a roving tabindex: Left and
 * Right step the buttons, Home and End jump, Enter or Space applies, Escape
 * drops the bar. Cmd or Ctrl with B or I never needs the bar at all. Under
 * reduced motion it appears where it belongs.
 */
export function SelectBar({
  actions = ["bold", "italic", "link"],
  children,
  onChange,
  onAction,
  label = "Editable passage",
  className,
}: SelectBarProps) {
  const motionSafe = useMotionSafe();
  const barId = React.useId();

  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const barRef = React.useRef<HTMLDivElement | null>(null);
  // Read only inside event callbacks: focusing the link field clears the
  // document selection, and the bar must not vanish out from under it.
  const linkingRef = React.useRef(false);
  const savedRange = React.useRef<Range | null>(null);

  // The anchor outlives the selection on purpose: the bar has to fade out
  // where it was standing, not from wherever a nulled anchor would put it.
  const [anchor, setAnchor] = React.useState<Anchor | null>(null);
  const [open, setOpen] = React.useState(false);
  const [bar, setBar] = React.useState({ width: 0, height: 0 });
  const [boxWidth, setBoxWidth] = React.useState(0);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const [linking, setLinking] = React.useState(false);
  const [href, setHref] = React.useState("");

  const readSelection = React.useCallback(() => {
    if (linkingRef.current) return;
    const box = boxRef.current;
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!box || !editor || !selection || selection.rangeCount === 0) {
      setOpen(false);
      return;
    }
    const range = selection.getRangeAt(0);
    if (
      selection.isCollapsed ||
      !editor.contains(range.commonAncestorContainer)
    ) {
      setOpen(false);
      return;
    }
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setOpen(false);
      return;
    }
    const bounds = box.getBoundingClientRect();
    const active: Record<string, boolean> = {};
    for (const name of Object.keys(TAGS) as SelectAction[]) {
      active[name] = Boolean(
        closestTag(range.startContainer, TAGS[name], editor),
      );
    }
    setAnchor({
      center: rect.left + rect.width / 2 - bounds.left,
      top: rect.top - bounds.top,
      bottom: rect.bottom - bounds.top,
      active,
    });
    setOpen(true);
  }, []);

  // A selection changes from a drag, a double-click or Shift with an arrow key;
  // the document-level event is the only thing that catches all three.
  React.useEffect(() => {
    document.addEventListener("selectionchange", readSelection);
    return () => document.removeEventListener("selectionchange", readSelection);
  }, [readSelection]);

  React.useEffect(() => {
    const node = boxRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setBoxWidth(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The bar's own size arrives from an observer, so the clamp knows how wide
  // the thing it is clamping actually is. Measured once and kept, so only the
  // very first raise lands without its rise.
  React.useEffect(() => {
    const node = barRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const width = node.offsetWidth;
      const height = node.offsetHeight;
      setBar((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [open]);

  const apply = (action: SelectAction, url?: string) => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed || !editor.contains(range.commonAncestorContainer))
      return;
    const tag = TAGS[action];
    const existing = closestTag(range.startContainer, tag, editor);
    try {
      if (existing?.parentNode) {
        // Toggling off: the wrapper's children take its place and the selection
        // is laid back over them, so the bar stays where the reader left it.
        const parent = existing.parentNode;
        const first = existing.firstChild;
        const last = existing.lastChild;
        while (existing.firstChild)
          parent.insertBefore(existing.firstChild, existing);
        parent.removeChild(existing);
        if (first && last) {
          const next = document.createRange();
          next.setStartBefore(first);
          next.setEndAfter(last);
          selection.removeAllRanges();
          selection.addRange(next);
        }
      } else {
        const wrapper = document.createElement(tag);
        if (action === "link") {
          wrapper.setAttribute("href", url || "#");
          wrapper.setAttribute("rel", "noreferrer");
        }
        try {
          range.surroundContents(wrapper);
        } catch {
          // A range that crosses an element boundary cannot be surrounded;
          // lifting its contents out and putting them back does the same job.
          wrapper.appendChild(range.extractContents());
          range.insertNode(wrapper);
        }
        const next = document.createRange();
        next.selectNodeContents(wrapper);
        selection.removeAllRanges();
        selection.addRange(next);
      }
    } catch {
      // A synthetic sweep can hand over a range that no longer resolves.
      return;
    }
    onChange?.(editor.innerHTML);
    onAction?.(action);
    readSelection();
  };

  const startLink = () => {
    if (anchor?.active.link) {
      apply("link");
      return;
    }
    const selection = window.getSelection();
    savedRange.current =
      selection && selection.rangeCount > 0
        ? selection.getRangeAt(0).cloneRange()
        : null;
    linkingRef.current = true;
    setLinking(true);
  };

  const closeLink = (commit: boolean) => {
    linkingRef.current = false;
    setLinking(false);
    const url = href.trim();
    const range = savedRange.current;
    savedRange.current = null;
    setHref("");
    editorRef.current?.focus();
    // The field took the selection with it; the saved range puts it back
    // before the wrap runs.
    const selection = window.getSelection();
    if (range && selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    if (commit && url) apply("link", url);
    else readSelection();
  };

  const onBarKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      editorRef.current?.focus();
      return;
    }
    const last = actions.length - 1;
    let next = focusIndex;
    if (event.key === "ArrowRight")
      next = focusIndex === last ? 0 : focusIndex + 1;
    else if (event.key === "ArrowLeft")
      next = focusIndex === 0 ? last : focusIndex - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;
    event.preventDefault();
    setFocusIndex(next);
    const target = actions[next];
    if (target) document.getElementById(`${barId}-${target}`)?.focus();
  };

  const onEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    const action: SelectAction | null =
      key === "b" ? "bold" : key === "i" ? "italic" : null;
    if (!action || !actions.includes(action)) return;
    event.preventDefault();
    apply(action);
  };

  // Frozen on the first render: the passage is edited in the DOM, and React
  // must never reconcile a fresh copy of these children over those edits.
  const [seed] = React.useState(() => children);

  const ready = bar.width > 0;
  const pad = 4;
  const half = bar.width / 2;
  // Clamped to the passage: a selection at either margin would otherwise hang
  // the bar off the column at 342px.
  const x =
    anchor && boxWidth > bar.width
      ? Math.min(Math.max(anchor.center, half + pad), boxWidth - half - pad) -
        half
      : pad;
  // Not enough room above the first line: the bar drops below the selection
  // rather than climbing out of the frame.
  const above = anchor ? anchor.top - bar.height - 8 : 0;
  const y = anchor ? (above < 0 ? anchor.bottom + 8 : above) : 0;
  const place = (spring: Transition): Transition =>
    ready && motionSafe ? spring : { duration: 0 };

  return (
    <div ref={boxRef} className={cn("relative w-full", className)}>
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        contentEditable
        suppressContentEditableWarning
        tabIndex={0}
        spellCheck={false}
        onKeyDown={onEditorKeyDown}
        onKeyUp={readSelection}
        onPointerUp={readSelection}
        className={cn(
          "rounded-2 border border-hairline bg-surface-1 px-3 py-2.5 text-sm leading-relaxed text-ink-2 outline-none",
          "[&_a]:text-cobalt-bright [&_a]:underline [&_a]:underline-offset-2",
          "[&_code]:rounded-1 [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[13px]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_strong]:text-foreground",
        )}
      >
        {seed}
      </div>

      <AnimatePresence>
        {open && anchor && (
          <motion.div
            ref={barRef}
            role="toolbar"
            aria-label="Format selection"
            aria-orientation="horizontal"
            onKeyDown={onBarKeyDown}
            className="absolute top-0 left-0 z-20 flex items-center gap-0.5 rounded-full border border-hairline bg-surface-0 p-1 shadow-raised"
            initial={{ opacity: 0, x, y: motionSafe ? y + 6 : y }}
            animate={{ opacity: ready ? 1 : 0, x, y }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              // Rising bounces; following slides. One bar, two jobs.
              y: place(springs.recoil),
              x: place(springs.glide),
              opacity: { duration: durations.fast, ease: easings.enter },
            }}
          >
            {linking ? (
              <div className="flex items-center gap-1 pl-2">
                <input
                  autoFocus
                  type="url"
                  value={href}
                  aria-label="Link address"
                  placeholder="https://"
                  onChange={(event) => setHref(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== "Escape") return;
                    // Escape belongs to the field, not the bar behind it.
                    event.stopPropagation();
                    event.preventDefault();
                    closeLink(event.key === "Enter");
                  }}
                  onBlur={() => {
                    if (linkingRef.current) closeLink(false);
                  }}
                  className="h-7 w-32 min-w-0 bg-transparent font-mono text-[11px] text-ink outline-none placeholder:text-ink-3"
                />
                <button
                  type="button"
                  // Focus stays in the field, so its blur cannot cancel the
                  // link before this click lands.
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => closeLink(true)}
                  className="h-7 shrink-0 rounded-full bg-primary px-2.5 text-[11px] font-medium text-primary-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Apply
                </button>
              </div>
            ) : (
              actions.map((action, position) => (
                <button
                  key={action}
                  id={`${barId}-${action}`}
                  type="button"
                  aria-pressed={Boolean(anchor.active[action])}
                  aria-label={NAMES[action]}
                  tabIndex={position === focusIndex ? 0 : -1}
                  // Keeps the selection alive: a pointerdown on the bar would
                  // otherwise collapse it before the click ever landed.
                  onPointerDown={(event) => event.preventDefault()}
                  onFocus={() => setFocusIndex(position)}
                  onClick={() =>
                    action === "link" ? startLink() : apply(action)
                  }
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-xs transition-colors outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    anchor.active[action]
                      ? "bg-cobalt-wash text-cobalt-bright"
                      : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  {GLYPHS[action]}
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
