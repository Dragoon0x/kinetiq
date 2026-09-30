import {
  Hand,
  MousePointer2,
  MoveHorizontal,
  Move,
  PenLine,
  Pointer,
  RotateCw,
  SlidersHorizontal,
  SquareCheck,
  Type,
  type LucideIcon,
} from "lucide-react";

import type { TactileVerb } from "@/content/tactile";

const GLYPH: Record<TactileVerb, LucideIcon> = {
  hover: MousePointer2,
  press: Pointer,
  hold: Hand,
  drag: Move,
  slide: SlidersHorizontal,
  swipe: MoveHorizontal,
  type: Type,
  select: SquareCheck,
  draw: PenLine,
  spin: RotateCw,
};

/** The small mark each verb wears on its chip and its cards. Decorative. */
export function VerbGlyph({
  verb,
  className,
}: {
  verb: TactileVerb;
  className?: string;
}) {
  const Icon = GLYPH[verb];
  return <Icon aria-hidden className={className} strokeWidth={1.75} />;
}
