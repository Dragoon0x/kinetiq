import type { ComponentType } from "react";

import type { TactileDemoProps, TweakSchema } from "@/registry/lib/tweaks";

/** What a Tactile demo module gives the gallery: the demo and its tweaks. */
export type TactileModule = {
  Demo: ComponentType<TactileDemoProps<TweakSchema> & { chrome?: boolean }>;
  tweaks: TweakSchema;
};

const mod = (Demo: unknown, tweaks: TweakSchema): TactileModule => ({
  Demo: Demo as TactileModule["Demo"],
  tweaks,
});

/**
 * One dynamic import per component, so /tactile ships none of them up front:
 * a card loads its own demo when it comes near the viewport. This map is the
 * only thing the gallery imports — never components/docs/demos.tsx, which
 * would pull every demo in the catalogue into the page.
 */
export const TACTILE_DEMOS: Record<string, () => Promise<TactileModule>> = {
  "gel-switch": () =>
    import("@/registry/demos/gel-switch.demo").then((m) =>
      mod(m.GelSwitchDemo, m.tweaks),
    ),
  "conjure-button": () =>
    import("@/registry/demos/conjure-button.demo").then((m) =>
      mod(m.ConjureButtonDemo, m.tweaks),
    ),
  "split-confirm": () =>
    import("@/registry/demos/split-confirm.demo").then((m) =>
      mod(m.SplitConfirmDemo, m.tweaks),
    ),
  "clicker-count": () =>
    import("@/registry/demos/clicker-count.demo").then((m) =>
      mod(m.ClickerCountDemo, m.tweaks),
    ),
  "keycap-press": () =>
    import("@/registry/demos/keycap-press.demo").then((m) =>
      mod(m.KeycapPressDemo, m.tweaks),
    ),
  "copy-slip": () =>
    import("@/registry/demos/copy-slip.demo").then((m) =>
      mod(m.CopySlipDemo, m.tweaks),
    ),
  "underline-peek": () =>
    import("@/registry/demos/underline-peek.demo").then((m) =>
      mod(m.UnderlinePeekDemo, m.tweaks),
    ),
  "edge-peek": () =>
    import("@/registry/demos/edge-peek.demo").then((m) =>
      mod(m.EdgePeekDemo, m.tweaks),
    ),
  "cross-grid": () =>
    import("@/registry/demos/cross-grid.demo").then((m) =>
      mod(m.CrossGridDemo, m.tweaks),
    ),
  "overflow-glide": () =>
    import("@/registry/demos/overflow-glide.demo").then((m) =>
      mod(m.OverflowGlideDemo, m.tweaks),
    ),
  "try-on": () =>
    import("@/registry/demos/try-on.demo").then((m) =>
      mod(m.TryOnDemo, m.tweaks),
    ),
  eyedropper: () =>
    import("@/registry/demos/eyedropper.demo").then((m) =>
      mod(m.EyedropperDemo, m.tweaks),
    ),
  "pour-hold": () =>
    import("@/registry/demos/pour-hold.demo").then((m) =>
      mod(m.PourHoldDemo, m.tweaks),
    ),
  "peek-hold": () =>
    import("@/registry/demos/peek-hold.demo").then((m) =>
      mod(m.PeekHoldDemo, m.tweaks),
    ),
  "fuse-button": () =>
    import("@/registry/demos/fuse-button.demo").then((m) =>
      mod(m.FuseButtonDemo, m.tweaks),
    ),
  "print-hold": () =>
    import("@/registry/demos/print-hold.demo").then((m) =>
      mod(m.PrintHoldDemo, m.tweaks),
    ),
  "jiggle-mode": () =>
    import("@/registry/demos/jiggle-mode.demo").then((m) =>
      mod(m.JiggleModeDemo, m.tweaks),
    ),
  "drop-pin": () =>
    import("@/registry/demos/drop-pin.demo").then((m) =>
      mod(m.DropPinDemo, m.tweaks),
    ),
  "node-wire": () =>
    import("@/registry/demos/node-wire.demo").then((m) =>
      mod(m.NodeWireDemo, m.tweaks),
    ),
  "fling-sort": () =>
    import("@/registry/demos/fling-sort.demo").then((m) =>
      mod(m.FlingSortDemo, m.tweaks),
    ),
  "sling-send": () =>
    import("@/registry/demos/sling-send.demo").then((m) =>
      mod(m.SlingSendDemo, m.tweaks),
    ),
  "snap-guides": () =>
    import("@/registry/demos/snap-guides.demo").then((m) =>
      mod(m.SnapGuidesDemo, m.tweaks),
    ),
  "meld-tags": () =>
    import("@/registry/demos/meld-tags.demo").then((m) =>
      mod(m.MeldTagsDemo, m.tweaks),
    ),
  "corner-pip": () =>
    import("@/registry/demos/corner-pip.demo").then((m) =>
      mod(m.CornerPipDemo, m.tweaks),
    ),
  "level-vial": () =>
    import("@/registry/demos/level-vial.demo").then((m) =>
      mod(m.LevelVialDemo, m.tweaks),
    ),
  "curve-slider": () =>
    import("@/registry/demos/curve-slider.demo").then((m) =>
      mod(m.CurveSliderDemo, m.tweaks),
    ),
  "ruler-tape": () =>
    import("@/registry/demos/ruler-tape.demo").then((m) =>
      mod(m.RulerTapeDemo, m.tweaks),
    ),
  "fader-sweep": () =>
    import("@/registry/demos/fader-sweep.demo").then((m) =>
      mod(m.FaderSweepDemo, m.tweaks),
    ),
  "stretch-slider": () =>
    import("@/registry/demos/stretch-slider.demo").then((m) =>
      mod(m.StretchSliderDemo, m.tweaks),
    ),
  "clip-trim": () =>
    import("@/registry/demos/clip-trim.demo").then((m) =>
      mod(m.ClipTrimDemo, m.tweaks),
    ),
  "mood-swipe": () =>
    import("@/registry/demos/mood-swipe.demo").then((m) =>
      mod(m.MoodSwipeDemo, m.tweaks),
    ),
  "day-strip": () =>
    import("@/registry/demos/day-strip.demo").then((m) =>
      mod(m.DayStripDemo, m.tweaks),
    ),
  "slot-swipe": () =>
    import("@/registry/demos/slot-swipe.demo").then((m) =>
      mod(m.SlotSwipeDemo, m.tweaks),
    ),
  "story-cube": () =>
    import("@/registry/demos/story-cube.demo").then((m) =>
      mod(m.StoryCubeDemo, m.tweaks),
    ),
  "filter-swipe": () =>
    import("@/registry/demos/filter-swipe.demo").then((m) =>
      mod(m.FilterSwipeDemo, m.tweaks),
    ),
  "gesture-player": () =>
    import("@/registry/demos/gesture-player.demo").then((m) =>
      mod(m.GesturePlayerDemo, m.tweaks),
    ),
  "hang-label": () =>
    import("@/registry/demos/hang-label.demo").then((m) =>
      mod(m.HangLabelDemo, m.tweaks),
    ),
  "roll-search": () =>
    import("@/registry/demos/roll-search.demo").then((m) =>
      mod(m.RollSearchDemo, m.tweaks),
    ),
  "sift-filter": () =>
    import("@/registry/demos/sift-filter.demo").then((m) =>
      mod(m.SiftFilterDemo, m.tweaks),
    ),
  "ratio-morph": () =>
    import("@/registry/demos/ratio-morph.demo").then((m) =>
      mod(m.RatioMorphDemo, m.tweaks),
    ),
  "seat-map": () =>
    import("@/registry/demos/seat-map.demo").then((m) =>
      mod(m.SeatMapDemo, m.tweaks),
    ),
  "tool-dock": () =>
    import("@/registry/demos/tool-dock.demo").then((m) =>
      mod(m.ToolDockDemo, m.tweaks),
    ),
  "plain-date": () =>
    import("@/registry/demos/plain-date.demo").then((m) =>
      mod(m.PlainDateDemo, m.tweaks),
    ),
  "calc-field": () =>
    import("@/registry/demos/calc-field.demo").then((m) =>
      mod(m.CalcFieldDemo, m.tweaks),
    ),
  "glide-caret": () =>
    import("@/registry/demos/glide-caret.demo").then((m) =>
      mod(m.GlideCaretDemo, m.tweaks),
    ),
  "lasso-grid": () =>
    import("@/registry/demos/lasso-grid.demo").then((m) =>
      mod(m.LassoGridDemo, m.tweaks),
    ),
  "brush-select": () =>
    import("@/registry/demos/brush-select.demo").then((m) =>
      mod(m.BrushSelectDemo, m.tweaks),
    ),
  "zone-map": () =>
    import("@/registry/demos/zone-map.demo").then((m) =>
      mod(m.ZoneMapDemo, m.tweaks),
    ),
  "pattern-lock": () =>
    import("@/registry/demos/pattern-lock.demo").then((m) =>
      mod(m.PatternLockDemo, m.tweaks),
    ),
  "stroke-command": () =>
    import("@/registry/demos/stroke-command.demo").then((m) =>
      mod(m.StrokeCommandDemo, m.tweaks),
    ),
  "guess-line": () =>
    import("@/registry/demos/guess-line.demo").then((m) =>
      mod(m.GuessLineDemo, m.tweaks),
    ),
  "loop-lift": () =>
    import("@/registry/demos/loop-lift.demo").then((m) =>
      mod(m.LoopLiftDemo, m.tweaks),
    ),
  "measure-line": () =>
    import("@/registry/demos/measure-line.demo").then((m) =>
      mod(m.MeasureLineDemo, m.tweaks),
    ),
  "scratch-card": () =>
    import("@/registry/demos/scratch-card.demo").then((m) =>
      mod(m.ScratchCardDemo, m.tweaks),
    ),
  "straighten-dial": () =>
    import("@/registry/demos/straighten-dial.demo").then((m) =>
      mod(m.StraightenDialDemo, m.tweaks),
    ),
  "vinyl-scrub": () =>
    import("@/registry/demos/vinyl-scrub.demo").then((m) =>
      mod(m.VinylScrubDemo, m.tweaks),
    ),
  "angle-pick": () =>
    import("@/registry/demos/angle-pick.demo").then((m) =>
      mod(m.AnglePickDemo, m.tweaks),
    ),
  "jog-shuttle": () =>
    import("@/registry/demos/jog-shuttle.demo").then((m) =>
      mod(m.JogShuttleDemo, m.tweaks),
    ),
  "thumb-wheel": () =>
    import("@/registry/demos/thumb-wheel.demo").then((m) =>
      mod(m.ThumbWheelDemo, m.tweaks),
    ),
  "rotary-dial": () =>
    import("@/registry/demos/rotary-dial.demo").then((m) =>
      mod(m.RotaryDialDemo, m.tweaks),
    ),
};
