"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AccessRole = { id: string; label: string };

export type AccessAction = { id: string; label: string };

export type AccessGrants = Record<string, string[]>;

export type AccessMatrixProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Rows, top to bottom. */
  roles: AccessRole[];
  /** Columns, left to right. */
  actions: AccessAction[];
  /** Controlled grants: action ids per role id. */
  value?: AccessGrants;
  /** Initial grants for uncontrolled usage. */
  defaultValue?: AccessGrants;
  onValueChange?: (value: AccessGrants) => void;
  /** Visible group label. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

const NO_GRANTS: AccessGrants = {};

/** Column widths in px; the grid's min-width is built from them, so a phone
 *  scrolls the matrix instead of crushing the switches. */
const ROLE_COL = 84;
const CELL_COL = 56;

/** Arrow keys walk the matrix in two dimensions: [rowStep, columnStep]. */
const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/** 34px inside the rule, less a 14px knob and 2px of padding each side. */
const KNOB_TRAVEL = 16;

/**
 * Roles down, actions across, a switch in every cell. Flipping a row's master
 * runs its cells in order on `cascade()`, each knob sliding on `snap`: the
 * stagger is what makes a bulk change read as one act rather than five
 * simultaneous blinks, and it holds the 600ms budget however many columns you
 * pass. A column header lights its column by hover or by focus, so the
 * keyboard gets the same orientation cue as the pointer.
 *
 * The matrix is a real grid — arrow keys walk it in two dimensions, Home and
 * End jump to the ends of a row, Space and Enter toggle. Cells are switches;
 * the row master is a tri-state checkbox, because a switch may not report
 * mixed. Under reduced motion the knobs jump with no cascade.
 */
export function AccessMatrix({
  ref,
  roles,
  actions,
  value,
  defaultValue,
  onValueChange,
  label,
  className,
  "aria-label": ariaLabel,
}: AccessMatrixProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<AccessGrants>(
    defaultValue ?? NO_GRANTS,
  );
  const isControlled = value !== undefined;
  const grants = isControlled ? value : uncontrolled;

  // Column 0 is the row master, so a row holds actions.length + 1 controls.
  const columns = actions.length + 1;
  const cellRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const [focused, setFocused] = React.useState(0);
  const [hoverColumn, setHoverColumn] = React.useState<number | null>(null);
  const [inside, setInside] = React.useState(false);

  // Set by a master, cleared by any single toggle: no stale cascade delay.
  const [cascadingRole, setCascadingRole] = React.useState<string | null>(null);
  const step = cascade(actions.length);

  const at = (row: number, column: number) => row * columns + column;
  const focusedColumn = focused % columns;
  // The focused column lights too, but only while focus is inside the matrix.
  const litColumn =
    hoverColumn ?? (inside && focusedColumn > 0 ? focusedColumn : null);

  const commit = (next: AccessGrants) => {
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  const grantedIn = (roleId: string) => grants[roleId] ?? [];

  const toggleCell = (roleId: string, actionId: string) => {
    const held = grantedIn(roleId);
    const next = held.includes(actionId)
      ? held.filter((id) => id !== actionId)
      : [...held, actionId];
    setCascadingRole(null);
    commit({ ...grants, [roleId]: next });
  };

  const toggleRow = (roleId: string) => {
    const held = grantedIn(roleId);
    const full = held.length === actions.length;
    setCascadingRole(roleId);
    commit({
      ...grants,
      [roleId]: full ? [] : actions.map((action) => action.id),
    });
  };

  const moveTo = (row: number, column: number) => {
    const clampedRow = Math.min(roles.length - 1, Math.max(0, row));
    const clampedColumn = Math.min(columns - 1, Math.max(0, column));
    const index = at(clampedRow, clampedColumn);
    setFocused(index);
    cellRefs.current[index]?.focus();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent,
    row: number,
    column: number,
    toggle: () => void,
  ) => {
    const move = ARROWS[event.key];
    if (move) {
      event.preventDefault();
      moveTo(row + move[0], column + move[1]);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      moveTo(row, event.key === "Home" ? 0 : columns - 1);
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggle();
    }
  };

  // Fades show only where there is more to reach. The observer fires once on
  // observe, so the first paint is measured rather than guessed.
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = React.useState({ start: false, end: false });

  React.useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const measure = () => {
      const overflow = node.scrollWidth - node.clientWidth;
      setEdges({
        start: node.scrollLeft > 1,
        end: node.scrollLeft < overflow - 1,
      });
    };
    node.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  const rowTemplate = {
    gridTemplateColumns: `${ROLE_COL}px repeat(${columns}, minmax(${CELL_COL}px, 1fr))`,
  };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      {label ? (
        <div id={labelId} className="text-sm font-semibold">
          {label}
        </div>
      ) : null}

      <div className="relative">
        <div ref={scrollerRef} className="overflow-x-auto">
          <div
            role="grid"
            aria-labelledby={label ? labelId : undefined}
            aria-label={label ? undefined : ariaLabel}
            onFocus={() => setInside(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setInside(false);
              }
            }}
            className="flex flex-col gap-1.5"
            style={{ minWidth: ROLE_COL + columns * CELL_COL }}
          >
            <div role="row" className="grid gap-1.5" style={rowTemplate}>
              <div
                role="columnheader"
                className="sticky left-0 z-10 flex h-6 items-center bg-surface-1"
              >
                <span className="sr-only">Role</span>
              </div>
              <div
                role="columnheader"
                className="flex h-6 items-center justify-center text-[10px] font-medium tracking-[0.06em] text-ink-3 uppercase"
              >
                All
              </div>
              {actions.map((action, index) => (
                <div
                  key={action.id}
                  role="columnheader"
                  onMouseEnter={() => setHoverColumn(index + 1)}
                  onMouseLeave={() => setHoverColumn(null)}
                  className={cn(
                    "flex h-6 items-center justify-center rounded-1 text-[10px] font-medium tracking-[0.06em] uppercase transition-colors duration-150",
                    litColumn === index + 1
                      ? "bg-cobalt-wash text-cobalt-bright"
                      : "text-ink-3",
                  )}
                >
                  {action.label}
                </div>
              ))}
            </div>

            {roles.map((role, row) => {
              const held = grantedIn(role.id);
              const all = held.length === actions.length && actions.length > 0;
              const mixed = held.length > 0 && !all;
              return (
                <div
                  key={role.id}
                  role="row"
                  className="grid gap-1.5"
                  style={rowTemplate}
                >
                  <div
                    role="rowheader"
                    className="sticky left-0 z-10 flex h-9 items-center bg-surface-1 pr-2 text-xs font-medium text-foreground"
                  >
                    {role.label}
                  </div>

                  <div
                    role="gridcell"
                    className="flex items-center justify-center"
                  >
                    <button
                      ref={(node) => {
                        cellRefs.current[at(row, 0)] = node;
                      }}
                      type="button"
                      role="checkbox"
                      aria-checked={mixed ? "mixed" : all}
                      aria-label={`All actions for ${role.label}`}
                      tabIndex={focused === at(row, 0) ? 0 : -1}
                      onFocus={() => setFocused(at(row, 0))}
                      onClick={() => toggleRow(role.id)}
                      onKeyDown={(event) =>
                        handleKeyDown(event, row, 0, () => toggleRow(role.id))
                      }
                      className={cn(
                        "flex size-5 items-center justify-center rounded-1 border transition-colors duration-150 outline-none",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        all || mixed
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-hairline-strong hover:border-cobalt-bright/60",
                      )}
                    >
                      {all ? (
                        <svg
                          viewBox="0 0 16 16"
                          className="size-3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                        </svg>
                      ) : mixed ? (
                        <span
                          aria-hidden
                          className="h-0.5 w-2.5 rounded-full bg-primary-foreground"
                        />
                      ) : null}
                    </button>
                  </div>

                  {actions.map((action, column) => {
                    const on = held.includes(action.id);
                    const index = at(row, column + 1);
                    const delay =
                      motionSafe && cascadingRole === role.id
                        ? column * step
                        : 0;
                    return (
                      <div
                        key={action.id}
                        role="gridcell"
                        className={cn(
                          "flex items-center justify-center rounded-1 transition-colors duration-150",
                          litColumn === column + 1 && "bg-cobalt-wash",
                        )}
                      >
                        <button
                          ref={(node) => {
                            cellRefs.current[index] = node;
                          }}
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={`${action.label} for ${role.label}`}
                          tabIndex={focused === index ? 0 : -1}
                          onFocus={() => setFocused(index)}
                          onClick={() => toggleCell(role.id, action.id)}
                          onKeyDown={(event) =>
                            handleKeyDown(event, row, column + 1, () =>
                              toggleCell(role.id, action.id),
                            )
                          }
                          className={cn(
                            "relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-150 outline-none",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                            on
                              ? "border-primary bg-primary"
                              : "border-hairline-strong bg-surface-2 hover:border-cobalt-bright/60",
                          )}
                        >
                          <motion.span
                            aria-hidden
                            className={cn(
                              "absolute top-0.5 left-0.5 size-3.5 rounded-full transition-colors duration-150",
                              on ? "bg-primary-foreground" : "bg-ink-3",
                            )}
                            animate={{ x: on ? KNOB_TRAVEL : 0 }}
                            transition={
                              motionSafe
                                ? { ...springs.snap, delay }
                                : { duration: 0 }
                            }
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* The start fade begins past the pinned role column, so it veils the
            scrolling actions and never the labels that stay put. */}
        {(["start", "end"] as const).map((side) =>
          edges[side] ? (
            <span
              key={side}
              aria-hidden
              style={side === "start" ? { left: ROLE_COL } : { right: 0 }}
              className={cn(
                "pointer-events-none absolute inset-y-0 w-6 from-surface-1 to-surface-1/0",
                side === "start" ? "bg-linear-to-r" : "bg-linear-to-l",
              )}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}
