"use client";

import * as React from "react";

import { PanelLeft } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/registry/ui/drawer";
import { WorkbenchRail } from "@/registry/ui/workbench-rail";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DrawerPane = {
  id: string;
  title: string;
  copy: string;
};

export type WorkroomDrawerProps = {
  workspace?: string;
  panes?: DrawerPane[];
  threads?: { id: string; label: string }[];
  className?: string;
};

const DEFAULT_PANES: DrawerPane[] = [
  {
    id: "home",
    title: "This morning",
    copy: "The board cut itself at 05:12. Two changes since, both propagated to every crew that shares the constraint.",
  },
  {
    id: "boards",
    title: "Boards",
    copy: "Four boards live. The gate board is the one the crews actually read, so it goes first when anything changes.",
  },
  {
    id: "exports",
    title: "Exports",
    copy: "Everything that left the room this week, signed and dated. An audit is answered from here, not from memory.",
  },
];

const DEFAULT_THREADS = [
  { id: "t1", label: "Crane 2 hold, this morning" },
  { id: "t2", label: "Reorder list for the stores" },
];

/**
 * The workroom for narrow surfaces: the rail steps off-canvas into a drawer
 * and the content keeps the full width. The drawer primitive owns everything
 * hard — focus trap, Escape, backdrop, the edge drag — and the rail owns its
 * own furniture; this block contributes only the bar, the seating, and the
 * rule that picking a destination closes the drawer, because on a phone the
 * menu is a hallway, not a room you stay in.
 */
export function WorkroomDrawer({
  workspace = "North Basin Ops",
  panes = DEFAULT_PANES,
  threads = DEFAULT_THREADS,
  className,
}: WorkroomDrawerProps) {
  const motionSafe = useMotionSafe();
  const [open, setOpen] = React.useState(false);
  const [activeId, setActiveId] = React.useState(panes[0]?.id ?? "home");

  const pane = panes.find((p) => p.id === activeId) ?? panes[0];

  return (
    <section className={cn("relative bg-surface-0", className)}>
      <div className="mx-auto w-full max-w-md px-6 py-16 sm:py-20">
        {/* The narrow surface, framed like the phone it stands in for. The
            drawer is contained (portal={false}) so the block owns its stage. */}
        <div className="relative min-h-[440px] overflow-hidden rounded-4 border border-hairline bg-surface-1 shadow-raised">
          <Drawer
            open={open}
            onOpenChange={setOpen}
            side="left"
            portal={false}
          >
            <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
              <DrawerTrigger
                aria-label="Open the workspace menu"
                className={cn(
                  "rounded-2 border border-hairline bg-surface-0 p-1.5 text-ink-2 transition-colors hover:text-ink",
                  "focus-visible:ring-2 focus-visible:ring-[var(--focus,var(--primary))] focus-visible:outline-none",
                )}
              >
                <PanelLeft className="size-4" aria-hidden />
              </DrawerTrigger>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-ink">
                {workspace}
              </p>
            </div>

            <div className="relative p-5">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={pane?.id}
                  initial={motionSafe ? { opacity: 0 } : { opacity: 1 }}
                  animate={{ opacity: 1 }}
                  exit={{
                    opacity: 0,
                    transition: {
                      duration: motionSafe ? durations.fast : 0,
                      ease: easings.exit,
                    },
                  }}
                  transition={{
                    duration: durations.base,
                    ease: easings.enter,
                  }}
                >
                  <h3 className="text-lg font-semibold tracking-tight text-ink">
                    {pane?.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-2">
                    {pane?.copy}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            <DrawerContent className="bg-surface-1">
              <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
                <DrawerTitle className="text-sm">Workspace</DrawerTitle>
                <DrawerClose
                  aria-label="Close the workspace menu"
                  className={cn(
                    "rounded-2 p-1 text-ink-3 transition-colors hover:text-ink",
                    "focus-visible:ring-2 focus-visible:ring-[var(--focus,var(--primary))] focus-visible:outline-none",
                  )}
                />
              </div>
              <WorkbenchRail
                workspace={workspace}
                threads={threads}
                activeId={activeId}
                onSelect={(id) => {
                  setActiveId(id);
                  setOpen(false);
                }}
                className="border-0"
              />
            </DrawerContent>
          </Drawer>
        </div>
      </div>
    </section>
  );
}
