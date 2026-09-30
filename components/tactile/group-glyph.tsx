import {
  Bell,
  Hand,
  Image,
  Layers,
  LayoutGrid,
  LoaderCircle,
  Menu,
  MousePointer2,
  MoveHorizontal,
  Move,
  PenLine,
  Pilcrow,
  Pointer,
  RotateCw,
  SlidersHorizontal,
  Smartphone,
  SquareCheck,
  TextCursorInput,
  Ticket,
  Type,
  type LucideIcon,
} from "lucide-react";

/** Every room's groups: Tactile's verbs and Atelier's sets. Slugs never clash. */
const GLYPH: Record<string, LucideIcon> = {
  // tactile
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
  // atelier
  notices: Bell,
  fields: TextCursorInput,
  menus: Menu,
  words: Pilcrow,
  glyphs: LoaderCircle,
  pictures: Image,
  widgets: LayoutGrid,
  keepsakes: Ticket,
  frames: Smartphone,
  backdrops: Layers,
};

/** The small mark each group wears on its chip and its cards. Decorative. */
export function GroupGlyph({
  group,
  className,
}: {
  group: string;
  className?: string;
}) {
  const Icon = GLYPH[group] ?? LayoutGrid;
  return <Icon aria-hidden className={className} strokeWidth={1.75} />;
}
