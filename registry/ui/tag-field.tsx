"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const SPLIT = /[,\n\t]+/;

export type TagFieldProps = {
  ref?: React.Ref<HTMLInputElement>;
  value: string[];
  onValueChange: (tags: string[]) => void;
  placeholder?: string;
  /** Cap on the number of tags. */
  maxTags?: number;
  /** Accessible name for the field. @default "Tags" */
  label?: string;
  className?: string;
};

/**
 * A field that turns text into tokens. Type and press Enter or comma to chip a
 * tag in on a spring; paste a delimited list and it splits into several at once;
 * backspace on an empty field lifts the last one back off. Removing a chip
 * reflows the rest with a FLIP glide. Duplicates are ignored. Under reduced
 * motion chips appear and leave with no spring or reflow.
 */
export function TagField({
  ref,
  value,
  onValueChange,
  placeholder = "Add a tag…",
  maxTags,
  label = "Tags",
  className,
}: TagFieldProps) {
  const motionSafe = useMotionSafe();
  const [input, setInput] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const setInputRef = (node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) {
      (ref as React.RefObject<HTMLInputElement | null>).current = node;
    }
  };

  const addTags = (raw: string) => {
    const parts = raw
      .split(SPLIT)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value];
    for (const part of parts) {
      if (maxTags != null && next.length >= maxTags) break;
      if (!next.includes(part)) next.push(part);
    }
    if (next.length !== value.length) onValueChange(next);
  };

  const removeAt = (index: number) => {
    onValueChange(value.filter((_, i) => i !== index));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      if (input.trim()) {
        event.preventDefault();
        addTags(input);
        setInput("");
      }
    } else if (event.key === "Backspace" && input === "" && value.length > 0) {
      event.preventDefault();
      removeAt(value.length - 1);
    }
  };

  const onPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (SPLIT.test(text)) {
      event.preventDefault();
      addTags(input + text);
      setInput("");
    }
  };

  const atMax = maxTags != null && value.length >= maxTags;

  return (
    <div
      role="group"
      aria-label={label}
      onClick={() => inputRef.current?.focus()}
      className={cn(
        "border-hairline bg-surface-0 focus-within:ring-cobalt-bright/50 flex min-h-[2.75rem] w-full cursor-text flex-wrap items-center gap-1.5 rounded-3 border p-1.5 focus-within:ring-2",
        className,
      )}
    >
      <AnimatePresence initial={false}>
        {value.map((tag, i) => (
          <motion.span
            key={tag}
            layout={motionSafe}
            initial={motionSafe ? { opacity: 0, scale: 0.8 } : false}
            animate={{ opacity: 1, scale: 1 }}
            exit={
              motionSafe
                ? { opacity: 0, scale: 0.8, transition: exitFor(durations.fast) }
                : { opacity: 0 }
            }
            transition={motionSafe ? springs.snap : { duration: 0 }}
            className="bg-cobalt-wash text-cobalt inline-flex items-center gap-1 rounded-2 py-1 pr-1 pl-2.5 text-sm font-medium"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={() => removeAt(i)}
              className="hover:bg-cobalt/20 focus-visible:ring-cobalt-bright/60 grid size-4 place-items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <path
                  d="M2.5 2.5 7.5 7.5M7.5 2.5 2.5 7.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </motion.span>
        ))}
      </AnimatePresence>

      <input
        ref={setInputRef}
        value={input}
        disabled={atMax}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        aria-label={label}
        placeholder={atMax ? "" : placeholder}
        className="text-ink placeholder:text-ink-3 min-w-[6ch] flex-1 bg-transparent px-1.5 py-1 text-sm outline-none disabled:cursor-not-allowed"
      />
    </div>
  );
}
