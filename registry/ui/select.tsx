"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";
import { ChevronDown } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SelectOption = {
  value: string;
  label: React.ReactNode;
  description?: string;
  disabled?: boolean;
};

export type SelectGroup = {
  label: string;
  options: SelectOption[];
};

export type SelectItem = SelectOption | SelectGroup;

export type SelectProps = {
  /** Flat options, labeled groups, or a mix of both. */
  items: SelectItem[];
  /** Controlled selected value. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  /** Pins a filter input to the top of the panel. */
  searchable?: boolean;
  /** Visible label rendered above the trigger and wired via ids. */
  label?: string;
  disabled?: boolean;
  /** Renders a hidden input so the value submits with forms. */
  name?: string;
  className?: string;
};

function isGroup(item: SelectItem): item is SelectGroup {
  return "options" in item;
}

/** Text used for filtering and typeahead; ReactNode labels fall back to value. */
function optionText(option: SelectOption): string {
  const label = typeof option.label === "string" ? option.label : option.value;
  return option.description ? `${label} ${option.description}` : label;
}

const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_");

type OptionEntry = { option: SelectOption; index: number };
type Section =
  | { kind: "option"; entry: OptionEntry }
  | { kind: "group"; label: string; id: string; entries: OptionEntry[] };

/**
 * A single-select combobox that unfolds from where you asked: the panel
 * scales 0.96→1 from the trigger's top edge on `snap`, options cascade in
 * with a 24ms stagger, and a single highlight bar glides between options on
 * `glide`. Choosing draws a check tick on `flick`, then the panel fades out
 * at 0.6× via `exitFor`. Under reduced motion everything is a plain fade and
 * the highlight repositions instantly.
 *
 * The panel renders in place (absolutely positioned inside the component, no
 * portal), so an ancestor with `overflow: hidden` will clip it — give the
 * select room below, or lift it out of clipped containers.
 */
export function Select({
  items,
  value: controlledValue,
  defaultValue,
  onValueChange,
  placeholder = "Select…",
  searchable = false,
  label,
  disabled = false,
  name,
  className,
}: SelectProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const triggerId = `${baseId}-trigger`;
  const listboxId = `${baseId}-listbox`;
  const valueId = `${baseId}-value`;

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlighted, setHighlighted] = React.useState<string | null>(null);
  const [uncontrolledValue, setUncontrolledValue] = React.useState<
    string | undefined
  >(defaultValue);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolledValue;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const optionRefs = React.useRef(new Map<string, HTMLDivElement>());
  const closeTimer = React.useRef(0);
  const typeahead = React.useRef({ buffer: "", timer: 0 });
  // True only for the render burst right after opening; later mounts
  // (filtering) skip the stagger so typing never feels laggy.
  const [cascading, setCascading] = React.useState(false);

  const allOptions = React.useMemo(
    () => items.flatMap((item) => (isGroup(item) ? item.options : [item])),
    [items],
  );
  const selectedOption = allOptions.find((option) => option.value === value);

  const normalizedQuery = searchable ? query.trim().toLowerCase() : "";
  const matches = React.useCallback(
    (option: SelectOption) =>
      normalizedQuery === "" ||
      optionText(option).toLowerCase().includes(normalizedQuery),
    [normalizedQuery],
  );

  const { sections, visibleOptions } = React.useMemo(() => {
    let index = 0;
    const built: Section[] = [];
    const visible: SelectOption[] = [];
    const take = (option: SelectOption): OptionEntry => {
      visible.push(option);
      return { option, index: index++ };
    };
    items.forEach((item, itemIndex) => {
      if (isGroup(item)) {
        const entries = item.options.filter(matches).map(take);
        if (entries.length > 0) {
          built.push({
            kind: "group",
            label: item.label,
            id: `${baseId}-group-${itemIndex}`,
            entries,
          });
        }
      } else if (matches(item)) {
        built.push({ kind: "option", entry: take(item) });
      }
    });
    return { sections: built, visibleOptions: visible };
  }, [items, matches, baseId]);

  const optionDomId = (optionValue: string) =>
    `${baseId}-option-${safeId(optionValue)}`;
  const activeDescendant =
    open && highlighted !== null ? optionDomId(highlighted) : undefined;

  const scrollHighlightIntoView = (optionValue: string) => {
    requestAnimationFrame(() => {
      optionRefs.current
        .get(optionValue)
        ?.scrollIntoView({ block: "nearest" });
    });
  };

  const openPanel = () => {
    if (disabled) return;
    setQuery("");
    const enabled = allOptions.filter((option) => !option.disabled);
    const initial =
      enabled.find((option) => option.value === value) ?? enabled[0];
    setHighlighted(initial ? initial.value : null);
    setCascading(true);
    setOpen(true);
  };

  const close = (focusTrigger: boolean) => {
    window.clearTimeout(closeTimer.current);
    setOpen(false);
    setQuery("");
    if (focusTrigger) triggerRef.current?.focus();
  };

  const choose = (option: SelectOption) => {
    if (option.disabled) return;
    if (!isControlled) setUncontrolledValue(option.value);
    onValueChange?.(option.value);
    setHighlighted(option.value);
    window.clearTimeout(closeTimer.current);
    if (motionSafe) {
      // Let the tick draw (flick settles ~120ms) before the panel fades out.
      closeTimer.current = window.setTimeout(() => close(true), 120);
    } else {
      close(true);
    }
  };

  const moveHighlight = (direction: 1 | -1) => {
    const enabled = visibleOptions.filter((option) => !option.disabled);
    if (enabled.length === 0) return;
    const currentIndex = enabled.findIndex(
      (option) => option.value === highlighted,
    );
    const next =
      currentIndex === -1
        ? enabled[direction === 1 ? 0 : enabled.length - 1]
        : enabled[(currentIndex + direction + enabled.length) % enabled.length];
    if (!next) return;
    setHighlighted(next.value);
    scrollHighlightIntoView(next.value);
  };

  const highlightEdge = (edge: "first" | "last") => {
    const enabled = visibleOptions.filter((option) => !option.disabled);
    const next = edge === "first" ? enabled[0] : enabled[enabled.length - 1];
    if (!next) return;
    setHighlighted(next.value);
    scrollHighlightIntoView(next.value);
  };

  const runTypeahead = (character: string) => {
    const state = typeahead.current;
    window.clearTimeout(state.timer);
    state.buffer += character.toLowerCase();
    state.timer = window.setTimeout(() => {
      state.buffer = "";
    }, 500);
    const match = visibleOptions.find(
      (option) =>
        !option.disabled &&
        optionText(option).toLowerCase().startsWith(state.buffer),
    );
    if (match) {
      setHighlighted(match.value);
      scrollHighlightIntoView(match.value);
    }
  };

  const handleOpenKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveHighlight(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveHighlight(-1);
        break;
      case "Home":
        if (!searchable) {
          event.preventDefault();
          highlightEdge("first");
        }
        break;
      case "End":
        if (!searchable) {
          event.preventDefault();
          highlightEdge("last");
        }
        break;
      case "Enter":
      case " ": {
        if (event.key === " " && searchable) break;
        event.preventDefault();
        const option = visibleOptions.find(
          (candidate) => candidate.value === highlighted,
        );
        if (option) choose(option);
        break;
      }
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
      default:
        if (
          !searchable &&
          event.key.length === 1 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey
        ) {
          event.preventDefault();
          runTypeahead(event.key);
        }
    }
  };

  const handleTriggerKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openPanel();
      }
      return;
    }
    handleOpenKeyDown(event);
  };

  // Click-outside closes without stealing focus.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const highlightedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    highlightedRef.current = highlighted;
  });

  // On open: move focus into the filter (searchable) and reveal the highlight.
  React.useEffect(() => {
    if (!open) return;
    if (searchable) searchRef.current?.focus();
    const current = highlightedRef.current;
    if (current !== null) {
      optionRefs.current.get(current)?.scrollIntoView({ block: "nearest" });
    }
  }, [open, searchable]);

  // The cascade plays once per open; anything mounted later appears plainly.
  React.useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setCascading(false), 100);
    return () => window.clearTimeout(timer);
  }, [open]);

  React.useEffect(
    () => () => {
      window.clearTimeout(closeTimer.current);
      window.clearTimeout(typeahead.current.timer);
    },
    [],
  );

  // Highlight bar: measured from the highlighted option, glides on `glide`.
  // Runs after every render (guarded); drives only motion values, no state.
  const barTop = useMotionValue(0);
  const barHeight = useMotionValue(0);
  const barOpacity = useMotionValue(0);
  const barTarget = React.useRef<{ top: number; height: number } | null>(null);
  React.useEffect(() => {
    const element =
      open && highlighted !== null
        ? optionRefs.current.get(highlighted)
        : undefined;
    if (!element) {
      barTarget.current = null;
      barOpacity.jump(0);
      return;
    }
    const top = element.offsetTop;
    const height = element.offsetHeight;
    const previous = barTarget.current;
    if (previous && previous.top === top && previous.height === height) return;
    if (motionSafe && previous) {
      animate(barTop, top, { ...springs.glide });
      animate(barHeight, height, { ...springs.glide });
    } else {
      barTop.jump(top);
      barHeight.jump(height);
    }
    barTarget.current = { top, height };
    animate(barOpacity, 1, { duration: durations.blink });
  });

  const renderOption = ({ option, index }: OptionEntry) => {
    const isSelected = option.value === value;
    const isHighlighted = option.value === highlighted;
    const delay = motionSafe && cascading ? Math.min(index, 10) * 0.024 : 0;
    return (
      <motion.div
        key={option.value}
        ref={(element) => {
          if (element) optionRefs.current.set(option.value, element);
          else optionRefs.current.delete(option.value);
        }}
        id={optionDomId(option.value)}
        role="option"
        aria-selected={isSelected}
        aria-disabled={option.disabled || undefined}
        data-highlighted={isHighlighted || undefined}
        initial={
          motionSafe ? { opacity: 0, y: distances.nudge } : { opacity: 0 }
        }
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? {
                y: { ...springs.flick, delay },
                opacity: { duration: durations.fast, ease: easings.enter, delay },
              }
            : { duration: durations.fast }
        }
        onClick={() => choose(option)}
        onPointerMove={() => {
          if (!option.disabled && highlighted !== option.value) {
            setHighlighted(option.value);
          }
        }}
        className={cn(
          "relative z-10 flex cursor-pointer items-start gap-2 rounded-1 px-2 py-1.5",
          option.disabled && "cursor-default opacity-50",
        )}
      >
        <svg viewBox="0 0 12 12" aria-hidden className="mt-1 size-3 shrink-0">
          <motion.path
            d="M2.5 6.5 L5 9 L9.5 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{
              pathLength: isSelected ? 1 : 0,
              opacity: isSelected ? 1 : 0,
            }}
            transition={
              motionSafe
                ? { pathLength: { ...springs.flick }, opacity: { duration: 0 } }
                : { duration: 0 }
            }
          />
        </svg>
        <span className="min-w-0">
          <span className="block truncate text-sm">{option.label}</span>
          {option.description && (
            <span className="text-muted-foreground block truncate text-xs">
              {option.description}
            </span>
          )}
        </span>
      </motion.div>
    );
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {label && (
        <label
          id={labelId}
          htmlFor={triggerId}
          className="mb-1.5 block text-sm font-medium"
        >
          {label}
        </label>
      )}

      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-labelledby={label ? `${labelId} ${valueId}` : undefined}
        aria-activedescendant={!searchable ? activeDescendant : undefined}
        disabled={disabled}
        onClick={() => {
          if (open) close(false);
          else openPanel();
        }}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          "border-input hover:bg-accent flex h-9 w-full items-center justify-between gap-2 rounded-2 border bg-transparent px-3 text-left text-sm transition-colors",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        <span
          id={valueId}
          className={cn("truncate", !selectedOption && "text-muted-foreground")}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <motion.span
          aria-hidden
          className="text-muted-foreground shrink-0"
          initial={false}
          animate={{ rotate: open ? 180 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        >
          <ChevronDown className="size-4" />
        </motion.span>
      </button>

      {name && <input type="hidden" name={name} value={value ?? ""} />}

      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={
              motionSafe ? { opacity: 0, scale: 0.96 } : { opacity: 0 }
            }
            animate={{ opacity: 1, scale: 1 }}
            exit={{
              opacity: 0,
              transition: motionSafe
                ? exitFor(durations.fast)
                : { duration: durations.fast },
            }}
            transition={
              motionSafe
                ? {
                    scale: { ...springs.snap },
                    opacity: { duration: durations.fast, ease: easings.enter },
                  }
                : { duration: durations.fast }
            }
            style={{ transformOrigin: "top" }}
            className="border-border bg-popover text-popover-foreground absolute inset-x-0 top-full z-50 mt-1 flex flex-col overflow-hidden rounded-3 border shadow-lg"
          >
            {searchable && (
              <div className="border-border border-b p-1">
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(event) => {
                    const nextQuery = event.target.value;
                    setQuery(nextQuery);
                    const lowered = nextQuery.trim().toLowerCase();
                    const first = allOptions.find(
                      (option) =>
                        !option.disabled &&
                        (lowered === "" ||
                          optionText(option).toLowerCase().includes(lowered)),
                    );
                    setHighlighted(first ? first.value : null);
                  }}
                  onKeyDown={handleOpenKeyDown}
                  placeholder="Filter…"
                  aria-label={label ? `Filter ${label}` : "Filter options"}
                  aria-controls={listboxId}
                  aria-activedescendant={activeDescendant}
                  aria-autocomplete="list"
                  autoComplete="off"
                  spellCheck={false}
                  className="placeholder:text-muted-foreground h-8 w-full rounded-1 bg-transparent px-2 text-sm"
                />
              </div>
            )}

            <div
              id={listboxId}
              role="listbox"
              aria-labelledby={label ? labelId : undefined}
              className="relative max-h-60 overflow-y-auto p-1"
            >
              <motion.div
                aria-hidden
                className="bg-accent pointer-events-none absolute inset-x-1 rounded-1"
                style={{ top: barTop, height: barHeight, opacity: barOpacity }}
              />
              {sections.map((section) =>
                section.kind === "option" ? (
                  renderOption(section.entry)
                ) : (
                  <div
                    key={section.id}
                    role="group"
                    aria-labelledby={section.id}
                  >
                    <div
                      id={section.id}
                      role="presentation"
                      className="text-muted-foreground px-2 pt-1.5 pb-1 text-xs font-medium"
                    >
                      {section.label}
                    </div>
                    {section.entries.map(renderOption)}
                  </div>
                ),
              )}
              {visibleOptions.length === 0 && (
                <div className="text-muted-foreground px-2 py-6 text-center text-sm">
                  No matches
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <span role="status" className="sr-only">
        {open && searchable
          ? `${visibleOptions.length} ${visibleOptions.length === 1 ? "option" : "options"} available`
          : ""}
      </span>
    </div>
  );
}
