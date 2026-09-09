"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ComposerMode = {
  value: string;
  label: string;
  /** What the field asks for in this mode. */
  placeholder: string;
  /** The action button's copy — "Send", "Run". */
  action: string;
  /** Mono aside beside the action — the model, a limit. */
  note?: string;
  /** Printed as chips on the row's left. */
  tools?: string[];
  /** The field's surface: plain, or the cobalt wash. @default "plain" */
  tint?: "plain" | "wash";
};

export type ModeSwitchProps = {
  /** The field, so a parent can focus it. */
  ref?: React.Ref<HTMLTextAreaElement>;
  /** At least two. */
  modes: ComposerMode[];
  /** Controlled mode value. */
  value?: string;
  /** Initial mode value for uncontrolled usage. @default first mode */
  defaultValue?: string;
  /** Fires from a segment press or an arrow key. */
  onValueChange?: (value: string) => void;
  /** Controlled field text. */
  text?: string;
  /** Initial field text for uncontrolled usage. */
  defaultText?: string;
  /** Fires from every edit. */
  onTextChange?: (text: string) => void;
  /** Fires from Enter or the action button with the trimmed text. */
  onSubmit?: (mode: string, text: string) => void;
  /** Names the switch and, with the mode, the field. */
  label: string;
  className?: string;
};

/**
 * A segmented switch that decides what the field is for. One knob rides the
 * segments, keyed by a shared `layoutId` so the same knob travels to the
 * chosen mode on `snap` with a single crisp overshoot — a switch, so it snaps.
 * The composer beneath answers it: the placeholder cross-fades to the mode's
 * own words on a fast tween, and the control row — tool chips left, mono note
 * and action button right — cross-fades the same way, the rows sharing one
 * cell while the row's height is measured and glides on `glide` when the modes
 * differ. The action's copy swaps with the mode and the field's tint follows,
 * so the mode reads before a word is typed.
 *
 * It is a radio group with a roving tabindex: arrows move and select without
 * wrapping, Home and End jump, Space and Enter select. The field is a real
 * textarea named by the mode and the label; the inactive row is hidden and
 * inert, so only the live mode's controls are reachable. A status line
 * announces the mode on a change and the action on a submit, never per
 * keystroke. Under reduced motion the knob swaps to its segment and the rows
 * and placeholder swap on opacity alone.
 */
export function ModeSwitch({
  ref,
  modes,
  value,
  defaultValue,
  onValueChange,
  text,
  defaultText,
  onTextChange,
  onSubmit,
  label,
  className,
}: ModeSwitchProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const knobId = `${baseId}-knob`;
  const hintId = `${baseId}-hint`;
  const segmentId = (mode: ComposerMode) => `${baseId}-seg-${mode.value}`;

  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    () => defaultValue ?? modes[0]?.value ?? "",
  );
  const current = value ?? uncontrolledValue;
  const [uncontrolledText, setUncontrolledText] = React.useState(
    defaultText ?? "",
  );
  const draft = text ?? uncontrolledText;
  const [announce, setAnnounce] = React.useState("");

  const currentIndex = Math.max(
    0,
    modes.findIndex((mode) => mode.value === current),
  );
  const mode = modes[currentIndex];

  // The row's border-box height, read by the observer and never in render.
  const rowsRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = rowsRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setHeight(Math.round(node.offsetHeight)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const select = (next: ComposerMode) => {
    if (next.value === current) return;
    if (value === undefined) setUncontrolledValue(next.value);
    setAnnounce(`${next.label} mode. ${next.placeholder}. ${next.action}.`);
    onValueChange?.(next.value);
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(modes.length - 1, Math.max(0, index));
    const target = modes[clamped];
    if (!target) return;
    document.getElementById(segmentId(target))?.focus();
    select(target);
  };

  const handleSegmentKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        return;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        return;
      case "Home":
        event.preventDefault();
        focusAt(0);
        return;
      case "End":
        event.preventDefault();
        focusAt(modes.length - 1);
        return;
      case " ":
      case "Enter": {
        event.preventDefault();
        const target = modes[index];
        if (target) select(target);
        return;
      }
      default:
        return;
    }
  };

  const commitText = (next: string) => {
    if (text === undefined) setUncontrolledText(next);
    onTextChange?.(next);
  };

  const trimmed = draft.trim();
  const canSubmit = trimmed.length > 0;
  const submit = () => {
    if (!canSubmit || !mode) return;
    setAnnounce(`${mode.action}: ${trimmed.length} characters`);
    onSubmit?.(mode.value, trimmed);
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div className={cn("@container flex w-full flex-col gap-2", className)}>
      <div
        role="radiogroup"
        aria-label={label}
        className="inline-flex h-9 items-stretch self-start rounded-full border border-hairline bg-surface-2 p-1"
      >
        {modes.map((option, index) => {
          const checked = index === currentIndex;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              id={segmentId(option)}
              tabIndex={checked ? 0 : -1}
              onClick={() => select(option)}
              onKeyDown={(event) => handleSegmentKey(event, index)}
              className={cn(
                "relative flex min-w-16 flex-1 items-center justify-center rounded-full px-3 text-sm font-medium transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                checked
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {checked &&
                (motionSafe ? (
                  <motion.span
                    aria-hidden
                    layoutId={knobId}
                    transition={springs.snap}
                    className="absolute inset-0 rounded-full border border-hairline bg-surface-0 shadow-sm"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full border border-hairline bg-surface-0 shadow-sm"
                  />
                ))}
              <span className="relative">{option.label}</span>
            </button>
          );
        })}
      </div>

      <div
        className={cn(
          "flex flex-col rounded-3 border border-hairline transition-colors duration-300 focus-within:border-hairline-strong",
          mode?.tint === "wash" ? "bg-cobalt-wash" : "bg-surface-1",
        )}
      >
        <div className="relative">
          {/* The native placeholder stays for assistive technology but is
              painted transparent; the visible one is the cross-fading layer. */}
          <textarea
            ref={ref}
            value={draft}
            rows={2}
            placeholder={mode?.placeholder}
            aria-label={mode ? `${mode.label} · ${label}` : label}
            aria-describedby={hintId}
            onChange={(event) => commitText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            className="block w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-5 text-foreground outline-none placeholder:text-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 grid px-3 py-2.5 text-sm leading-5"
          >
            {modes.map((option, index) => (
              <motion.span
                key={option.value}
                initial={false}
                animate={{
                  opacity: index === currentIndex && draft === "" ? 1 : 0,
                }}
                transition={fade}
                className="col-start-1 row-start-1 truncate text-ink-3"
              >
                {option.placeholder}
              </motion.span>
            ))}
          </div>
        </div>

        <motion.div
          initial={false}
          animate={{ height: height ?? "auto" }}
          transition={
            motionSafe
              ? springs.glide
              : { duration: durations.fast, ease: easings.move }
          }
          className="overflow-hidden border-t border-hairline"
        >
          {/* The live row is in flow and measured; the others sit over it
              absolutely, so the cell is exactly as tall as the live mode. */}
          <div ref={rowsRef} className="relative">
            {modes.map((option, index) => {
              const active = index === currentIndex;
              return (
                <motion.div
                  key={option.value}
                  aria-hidden={!active}
                  inert={!active}
                  initial={false}
                  animate={{ opacity: active ? 1 : 0 }}
                  transition={fade}
                  className={cn(
                    "flex items-center justify-between gap-2 py-2 pr-2 pl-3",
                    active
                      ? "relative"
                      : "pointer-events-none absolute inset-x-0 top-0",
                  )}
                >
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {(option.tools ?? []).map((tool) => (
                      <span
                        key={tool}
                        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline-strong bg-surface-0 px-2 text-xs text-ink-2"
                      >
                        <span
                          aria-hidden
                          className="size-1.5 shrink-0 rounded-full bg-cobalt-bright"
                        />
                        {tool}
                      </span>
                    ))}
                  </div>
                  {/* The note is the first thing to give: it truncates when the
                      row is tight and leaves a narrow composer to the tools. */}
                  <div className="flex min-w-0 items-center gap-2">
                    {option.note ? (
                      <span className="hidden min-w-0 truncate font-mono text-[11px] text-ink-3 @[22rem]:inline">
                        {option.note}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      tabIndex={active ? 0 : -1}
                      aria-disabled={canSubmit ? undefined : true}
                      onClick={submit}
                      className={cn(
                        "flex h-8 shrink-0 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        !canSubmit && "opacity-40",
                      )}
                    >
                      {option.action}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>

      <span id={hintId} className="sr-only">
        Enter submits, Shift+Enter breaks the line
      </span>
      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
