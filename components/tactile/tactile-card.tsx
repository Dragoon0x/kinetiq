"use client";

import * as React from "react";

import { Maximize2 } from "lucide-react";
import { motion } from "motion/react";

import type { TactileAspect, TactileVerb } from "@/content/tactile";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

import { useMountWindow } from "./use-mount-window";
import { useTactileModule } from "./use-tactile-module";
import { VerbGlyph } from "./verb-glyph";

export type TactileItem = {
  name: string;
  title: string;
  tagline: string;
  serial: string;
  verb: TactileVerb;
  verbLabel: string;
  aspect: TactileAspect;
  exportName: string;
  isNew: boolean;
};

/**
 * On hover the card's glyph acts out its verb once: a press dips, a spin
 * turns, a drag nudges. A hint, not a loop — it plays when the pointer
 * arrives and then keeps still.
 */
const HINT: Record<TactileVerb, Record<string, number[]>> = {
  hover: { x: [0, 2, 0], y: [0, -1, 0] },
  press: { scale: [1, 0.78, 1] },
  hold: { scale: [1, 0.84, 0.84, 1] },
  drag: { x: [0, 3, 0], y: [0, -1, 0] },
  slide: { x: [0, -2, 2, 0] },
  swipe: { x: [0, 4, 0], opacity: [1, 0.35, 1] },
  type: { opacity: [1, 0.2, 1, 0.2, 1] },
  select: { scale: [1, 1.2, 1] },
  draw: { rotate: [0, -14, 0] },
  spin: { rotate: [0, 360] },
};

const SPAN: Record<TactileAspect, string> = {
  square: "",
  wide: "sm:col-span-2",
  tall: "row-span-2",
};

/**
 * One live component in the gallery. The demo mounts only while the card is
 * near the viewport and is fully interactive in place; the corner button and
 * the title open it on the stage. Until the demo arrives the card shows its
 * verb, so the grid never jumps when a demo lands.
 *
 * Memoised: the gallery re-renders on every tweak made on the stage, and a
 * wall of live demos must not re-render underneath each one.
 */
export const TactileCard = React.memo(function TactileCard({
  item,
  sound,
  onOpen,
}: {
  item: TactileItem;
  sound: boolean;
  onOpen: (item: TactileItem, from: HTMLElement) => void;
}) {
  const motionSafe = useMotionSafe();
  const [node, setNode] = React.useState<HTMLElement | null>(null);
  const near = useMountWindow(node);
  const loadedModule = useTactileModule(item.name, near);
  const Demo = near ? loadedModule?.Demo : undefined;
  const titleId = `tactile-title-${item.name}`;

  const open = () => {
    if (node) onOpen(item, node);
  };

  return (
    <motion.article
      ref={setNode}
      id={`tactile-card-${item.name}`}
      aria-labelledby={titleId}
      layout={motionSafe ? "position" : false}
      initial={motionSafe ? { opacity: 0, scale: 0.98 } : false}
      animate={{ opacity: 1, scale: 1 }}
      exit={
        motionSafe
          ? {
              opacity: 0,
              scale: 0.98,
              transition: { duration: durations.fast, ease: easings.exit },
            }
          : { opacity: 0, transition: { duration: 0 } }
      }
      transition={motionSafe ? springs.glide : { duration: 0 }}
      whileHover={motionSafe ? "hint" : undefined}
      className={cn(
        "group relative flex min-w-0 flex-col overflow-clip rounded-4 border border-hairline bg-surface-1 transition-colors [contain:paint] hover:border-hairline-strong",
        SPAN[item.aspect],
      )}
    >
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 pr-2 pl-4">
        <span className="inline-flex min-w-0 items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          <motion.span
            aria-hidden
            className="inline-flex shrink-0"
            variants={{
              hint: {
                ...HINT[item.verb],
                transition: { duration: 0.55, ease: easings.move },
              },
            }}
          >
            <VerbGlyph verb={item.verb} className="size-3.5" />
          </motion.span>
          <span className="truncate">{item.verbLabel}</span>
          {item.isNew ? (
            <span className="rounded-full bg-cobalt-wash px-1.5 py-0.5 text-cobalt-bright">
              New
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={open}
          aria-label={`Open ${item.title} on the stage`}
          className="inline-flex size-8 items-center justify-center rounded-2 text-ink-3 transition-colors outline-none group-hover:text-ink-2 hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Maximize2 aria-hidden className="size-4" />
        </button>
      </div>

      <div
        data-tactile-card-stage=""
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-clip px-5 [contain:paint]"
      >
        {Demo ? (
          <motion.div
            className="flex w-full items-center justify-center"
            initial={motionSafe ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.base, ease: easings.enter }}
          >
            <Demo chrome={false} sound={sound} />
          </motion.div>
        ) : (
          <div
            aria-hidden
            className="flex size-14 items-center justify-center rounded-full border border-hairline text-ink-3"
          >
            <VerbGlyph verb={item.verb} className="size-5" />
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 pt-2 pb-4">
        <h3 id={titleId} className="text-sm font-medium text-foreground">
          <button
            type="button"
            onClick={open}
            className="rounded-1 text-left outline-none hover:text-cobalt-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {item.title}
          </button>
        </h3>
        <p className="mt-0.5 truncate text-xs text-ink-3">{item.tagline}</p>
      </div>
    </motion.article>
  );
});
