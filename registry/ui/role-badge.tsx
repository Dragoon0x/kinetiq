"use client";

import * as React from "react";

import { AnimatePresence, animate, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Role = {
  value: string;
  /** The word on the pill. */
  label: string;
  /** Higher is more authority; the step's sign is what glints or dims. */
  rank: number;
  /** One short line under the option in the list. */
  description?: string;
};

export type RoleChange = {
  value: string;
  label: string;
  direction: "promoted" | "demoted" | "changed";
};

export type RoleBadgeProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled role value. */
  value?: string;
  /** Initial role for uncontrolled use. @default the first role */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Fires with the direction of the step as well as the role. */
  onRoleChange?: (change: RoleChange) => void;
  /** The ladder, lowest rank first. */
  roles?: Role[];
  /** The member's name, shown and spoken. */
  name: string;
  /** The member's handle, shown under the name. */
  handle?: string;
  /** False renders the pill as a label with no list and no tab stop. @default true */
  editable?: boolean;
  /** Holds the pill; the role still reads. @default false */
  disabled?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

const DEFAULT_ROLES: Role[] = [
  { value: "guest", label: "Guest", rank: 0, description: "Reads the room" },
  { value: "member", label: "Member", rank: 1, description: "Posts here" },
  { value: "moderator", label: "Mod", rank: 2, description: "Hides and warns" },
  { value: "admin", label: "Admin", rank: 3, description: "Invites anyone" },
];

const FADE = { duration: durations.fast, ease: easings.enter } as const;

/** The pill's ink by step on the ladder, capped so a longer ladder still reads. */
const INKS = [
  "border-hairline bg-surface-2 text-ink-3",
  "border-hairline bg-surface-2 text-ink-2",
  "border-transparent bg-cobalt-wash text-cobalt-bright",
  "border-transparent bg-signal/15 text-signal",
] as const;

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

/** One glyph per step: outline, dot, shield, filled shield. */
function RoleGlyph({ step }: { step: number }) {
  const clamped = Math.min(3, Math.max(0, step));
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      {clamped === 0 ? (
        <circle cx="8" cy="8" r="4.5" strokeDasharray="2.4 2.4" />
      ) : clamped === 1 ? (
        <circle cx="8" cy="8" r="4" fill="currentColor" stroke="none" />
      ) : (
        <path
          d="M8 2.2 13 4.4v3.4c0 2.6-2 4.7-5 6.1-3-1.4-5-3.5-5-6.1V4.4z"
          fill={clamped === 3 ? "currentColor" : "none"}
        />
      )}
    </svg>
  );
}

/**
 * Admin, mod, member. The pill beside a member's name morphs when their role
 * changes: the glyph and the word are stacked in one grid cell and cross-fade,
 * the incoming glyph arriving from 0.6 on `snap`, while the pill's ink
 * transitions on a colour tween — the same element carrying a new meaning
 * rather than one badge blinking out and another blinking in. A pill this small
 * is not given a `layout` width animation on purpose: scale-correcting a 70px
 * capsule buys distortion, not grace.
 *
 * Direction is the mechanic. A **promotion glints** — a narrow sheen sweeps the
 * pill once on a `slow` tween while the pill lands from 1.06 back to rest on
 * `recoil`, driven imperatively because a spring takes exactly two keyframes and
 * anything between them is silently dropped. A **demotion dims** — to 0.35 and
 * back on a tween, with no scale and no bounce, because a demotion never
 * celebrates. A lateral move does neither.
 *
 * The pill is the control: it opens the ladder as a real `listbox` in flow
 * underneath the row, never floating over what the host wrote below, in a
 * ResizeObserver-measured height that glides open and shut. Arrows move the
 * active option, Home and End jump, Enter and Space choose, Escape closes and
 * returns focus to the pill it rose from. A polite status line speaks the new
 * role and its direction once. Under reduced motion nothing sweeps or bounces,
 * but a promotion still flashes its ink and a demotion still dims, because the
 * direction of the change is information the badge owes the reader.
 */
export function RoleBadge({
  ref,
  value,
  defaultValue,
  onValueChange,
  onRoleChange,
  roles = DEFAULT_ROLES,
  name,
  handle,
  editable = true,
  disabled = false,
  open,
  defaultOpen = false,
  onOpenChange,
  className,
}: RoleBadgeProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const listId = `${baseId}-list`;

  const first = roles[0];
  const [uncontrolled, setUncontrolled] = React.useState<string>(
    defaultValue ?? first?.value ?? "",
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;

  const [openState, setOpenState] = React.useState(defaultOpen);
  const openControlled = open !== undefined;
  const isOpen = editable && !disabled && (openControlled ? open : openState);

  const index = roles.findIndex((role) => role.value === current);
  const role = roles[index] ?? first;
  const step = index < 0 ? 0 : index;
  const ink = INKS[Math.min(INKS.length - 1, step)] ?? INKS[0];

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const pillRef = React.useRef<HTMLSpanElement | null>(null);

  // The step's sign, frozen at the moment the role changed, so the glint, the
  // dim and the spoken sentence all belong to the change that caused them.
  const [seen, setSeen] = React.useState(() => ({
    value: current,
    label: role?.label ?? current,
    id: 0,
    direction: "changed" as RoleChange["direction"],
    text: "",
  }));
  if (seen.value !== current) {
    const before = roles.find((item) => item.value === seen.value)?.rank ?? 0;
    const after = role?.rank ?? 0;
    const direction =
      after > before ? "promoted" : after < before ? "demoted" : "changed";
    setSeen({
      value: current,
      label: role?.label ?? current,
      id: seen.id + 1,
      direction,
      text: `${name} is now ${role?.label ?? current}, ${direction}`,
    });
  }

  // Read through a ref so the change below depends on the change alone:
  // toggling the motion preference must not replay a step that already ran.
  const latest = React.useRef({ onRoleChange, motionSafe });
  React.useEffect(() => {
    latest.current = { onRoleChange, motionSafe };
  });

  // Promotion lands, demotion dims — imperatively, two keyframes each, which is
  // all a spring can carry — and the host hears about the step once, after the
  // state that caused it has settled.
  React.useEffect(() => {
    if (seen.id === 0) return;
    const { onRoleChange: notify, motionSafe: safe } = latest.current;
    notify?.({
      value: seen.value,
      label: seen.label,
      direction: seen.direction,
    });
    const node = pillRef.current;
    if (!node) return;
    if (seen.direction === "changed") return;
    const controls =
      seen.direction === "demoted"
        ? animate(
            node,
            { opacity: [0.35, 1] },
            { duration: durations.slow, ease: easings.enter },
          )
        : safe
          ? animate(node, { scale: [1.06, 1] }, springs.recoil)
          : animate(
              node,
              { opacity: [0.5, 1] },
              { duration: durations.base, ease: easings.enter },
            );
    return () => controls.stop();
  }, [seen]);

  const setOpen = (next: boolean) => {
    if (!openControlled) setOpenState(next);
    onOpenChange?.(next);
  };

  // Opening always seeds the active option from the role in force.
  const [nav, setNav] = React.useState({ open: isOpen, value: current });
  if (nav.open !== isOpen) setNav({ open: isOpen, value: current });
  const activeValue = nav.value;
  const activeIndex = Math.max(
    0,
    roles.findIndex((item) => item.value === activeValue),
  );

  React.useEffect(() => {
    if (isOpen) listRef.current?.focus();
  }, [isOpen]);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  };

  const select = (next: string) => {
    if (next !== current) {
      if (!isControlled) setUncontrolled(next);
      onValueChange?.(next);
    }
    close(true);
  };

  const moveTo = (nextIndex: number) => {
    const clamped = Math.min(roles.length - 1, Math.max(0, nextIndex));
    const option = roles[clamped];
    if (option) setNav({ open: true, value: option.value });
  };

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const pill = (
    <span
      ref={pillRef}
      className={cn(
        "relative flex h-7 items-center gap-1.5 overflow-hidden rounded-full border px-2.5 transition-colors",
        ink,
      )}
    >
      {/* Both readings share one grid cell, so the outgoing pair cross-fades
          under the incoming one instead of pushing it sideways. */}
      <span className="grid">
        <AnimatePresence initial={false}>
          <motion.span
            key={current}
            initial={motionSafe ? { opacity: 0, scale: 0.6 } : { opacity: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={motionSafe ? { ...springs.snap, opacity: FADE } : FADE}
            style={{ originX: 0.5, originY: 0.5 }}
            className="col-start-1 row-start-1 flex items-center gap-1.5 text-[11px] font-semibold whitespace-nowrap"
          >
            <RoleGlyph step={step} />
            {role?.label ?? current}
          </motion.span>
        </AnimatePresence>
      </span>

      <AnimatePresence>
        {motionSafe && seen.direction === "promoted" && seen.id > 0 ? (
          <motion.span
            key={seen.id}
            aria-hidden
            initial={{ x: "-140%" }}
            animate={{ x: "140%" }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.slow, ease: easings.move }}
            className="pointer-events-none absolute inset-y-0 w-8 skew-x-12 bg-current opacity-25"
          />
        ) : null}
      </AnimatePresence>
    </span>
  );

  return (
    <div ref={ref} className={cn("flex w-full flex-col", className)}>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-cobalt-wash text-[11px] font-semibold text-cobalt-bright"
        >
          {initialsOf(name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm leading-snug font-medium">
            {name}
          </span>
          {handle ? (
            <span className="truncate text-[11px] leading-snug text-ink-3">
              @{handle}
            </span>
          ) : null}
        </span>

        {editable ? (
          <button
            ref={buttonRef}
            type="button"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-controls={listId}
            aria-label={`Role: ${role?.label ?? current}. Change role`}
            onClick={() => setOpen(!isOpen)}
            className={cn(
              "shrink-0 rounded-full outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              disabled ? "opacity-50" : "hover:brightness-105",
            )}
          >
            {pill}
          </button>
        ) : (
          // A label on a plain span is ignored by assistive technology, so the
          // word "Role" is read out of the flow instead and the pill's own text
          // finishes the sentence.
          <span className="shrink-0">
            <span className="sr-only">Role </span>
            {pill}
          </span>
        )}
      </div>

      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={innerRef}>
          {isOpen ? (
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-label={`Role for ${name}`}
              aria-activedescendant={`${baseId}-opt-${activeValue}`}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  moveTo(activeIndex + 1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  moveTo(activeIndex - 1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  moveTo(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  moveTo(roles.length - 1);
                } else if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  select(roles[activeIndex]?.value ?? current);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  close(true);
                }
              }}
              className="mt-2 flex flex-col rounded-3 border border-hairline bg-surface-1 p-1 outline-none"
            >
              {roles.map((option, optionIndex) => (
                <li
                  key={option.value}
                  id={`${baseId}-opt-${option.value}`}
                  role="option"
                  aria-selected={option.value === current}
                  onClick={() => select(option.value)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-2 px-2 py-1.5",
                    option.value === activeValue && "bg-accent",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full",
                      INKS[Math.min(INKS.length - 1, optionIndex)],
                    )}
                  >
                    <RoleGlyph step={optionIndex} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xs leading-snug font-medium">
                      {option.label}
                    </span>
                    {option.description ? (
                      <span className="truncate text-[10px] leading-snug text-ink-3">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  {option.value === current ? (
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-3.5 shrink-0 text-cobalt-bright"
                    >
                      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                    </svg>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </motion.div>

      <span role="status" aria-live="polite" aria-atomic className="sr-only">
        {seen.text}
      </span>
    </div>
  );
}
