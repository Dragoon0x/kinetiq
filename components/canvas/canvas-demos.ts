import { mod, type TactileModule } from "@/components/tactile/demo-module";

/**
 * One dynamic import per piece, so /canvas ships none of them up front: a
 * card loads its own demo when it comes near the viewport. This map is the
 * only thing the Canvas gallery imports — never components/docs/demos.tsx,
 * which would pull every demo in the catalogue into the page.
 */
export const CANVAS_DEMOS: Record<string, () => Promise<TactileModule>> = {
  "tune-in": () =>
    import("@/registry/demos/tune-in.demo").then((m) =>
      mod(m.TuneInDemo, m.tweaks),
    ),
  "drum-words": () =>
    import("@/registry/demos/drum-words.demo").then((m) =>
      mod(m.DrumWordsDemo, m.tweaks),
    ),
  "tide-mask": () =>
    import("@/registry/demos/tide-mask.demo").then((m) =>
      mod(m.TideMaskDemo, m.tweaks),
    ),
  "grain-gather": () =>
    import("@/registry/demos/grain-gather.demo").then((m) =>
      mod(m.GrainGatherDemo, m.tweaks),
    ),
  "depot-board": () =>
    import("@/registry/demos/depot-board.demo").then((m) =>
      mod(m.DepotBoardDemo, m.tweaks),
    ),
  "lens-warp": () =>
    import("@/registry/demos/lens-warp.demo").then((m) =>
      mod(m.LensWarpDemo, m.tweaks),
    ),
  "pen-outline": () =>
    import("@/registry/demos/pen-outline.demo").then((m) =>
      mod(m.PenOutlineDemo, m.tweaks),
    ),
  "stack-extrude": () =>
    import("@/registry/demos/stack-extrude.demo").then((m) =>
      mod(m.StackExtrudeDemo, m.tweaks),
    ),
  "paper-crease": () =>
    import("@/registry/demos/paper-crease.demo").then((m) =>
      mod(m.PaperCreaseDemo, m.tweaks),
    ),
  "after-image": () =>
    import("@/registry/demos/after-image.demo").then((m) =>
      mod(m.AfterImageDemo, m.tweaks),
    ),
  "cascade-split": () =>
    import("@/registry/demos/cascade-split.demo").then((m) =>
      mod(m.CascadeSplitDemo, m.tweaks),
    ),
  "cipher-wheel": () =>
    import("@/registry/demos/cipher-wheel.demo").then((m) =>
      mod(m.CipherWheelDemo, m.tweaks),
    ),
  "word-bracket": () =>
    import("@/registry/demos/word-bracket.demo").then((m) =>
      mod(m.WordBracketDemo, m.tweaks),
    ),
  "buoyant-line": () =>
    import("@/registry/demos/buoyant-line.demo").then((m) =>
      mod(m.BuoyantLineDemo, m.tweaks),
    ),
  "read-along": () =>
    import("@/registry/demos/read-along.demo").then((m) =>
      mod(m.ReadAlongDemo, m.tweaks),
    ),
  "char-cast": () =>
    import("@/registry/demos/char-cast.demo").then((m) =>
      mod(m.CharCastDemo, m.tweaks),
    ),
  "scramble-brush": () =>
    import("@/registry/demos/scramble-brush.demo").then((m) =>
      mod(m.ScrambleBrushDemo, m.tweaks),
    ),
  "stamp-cycle": () =>
    import("@/registry/demos/stamp-cycle.demo").then((m) =>
      mod(m.StampCycleDemo, m.tweaks),
    ),
  "datamosh-type": () =>
    import("@/registry/demos/datamosh-type.demo").then((m) =>
      mod(m.DatamoshTypeDemo, m.tweaks),
    ),
  "speed-banner": () =>
    import("@/registry/demos/speed-banner.demo").then((m) =>
      mod(m.SpeedBannerDemo, m.tweaks),
    ),
  "breath-type": () =>
    import("@/registry/demos/breath-type.demo").then((m) =>
      mod(m.BreathTypeDemo, m.tweaks),
    ),
  "tally-roll": () =>
    import("@/registry/demos/tally-roll.demo").then((m) =>
      mod(m.TallyRollDemo, m.tweaks),
    ),
  "depth-of-field": () =>
    import("@/registry/demos/depth-of-field.demo").then((m) =>
      mod(m.DepthOfFieldDemo, m.tweaks),
    ),
  "orbit-script": () =>
    import("@/registry/demos/orbit-script.demo").then((m) =>
      mod(m.OrbitScriptDemo, m.tweaks),
    ),
  "caption-live": () =>
    import("@/registry/demos/caption-live.demo").then((m) =>
      mod(m.CaptionLiveDemo, m.tweaks),
    ),
  "deck-shuffle": () =>
    import("@/registry/demos/deck-shuffle.demo").then((m) =>
      mod(m.DeckShuffleDemo, m.tweaks),
    ),
  "foil-sheen": () =>
    import("@/registry/demos/foil-sheen.demo").then((m) =>
      mod(m.FoilSheenDemo, m.tweaks),
    ),
  "weight-field": () =>
    import("@/registry/demos/weight-field.demo").then((m) =>
      mod(m.WeightFieldDemo, m.tweaks),
    ),
  "contour-marquee": () =>
    import("@/registry/demos/contour-marquee.demo").then((m) =>
      mod(m.ContourMarqueeDemo, m.tweaks),
    ),
  "static-fuzz": () =>
    import("@/registry/demos/static-fuzz.demo").then((m) =>
      mod(m.StaticFuzzDemo, m.tweaks),
    ),
  "pigment-flow": () =>
    import("@/registry/demos/pigment-flow.demo").then((m) =>
      mod(m.PigmentFlowDemo, m.tweaks),
    ),
  "letter-rain": () =>
    import("@/registry/demos/letter-rain.demo").then((m) =>
      mod(m.LetterRainDemo, m.tweaks),
    ),
  "type-trail": () =>
    import("@/registry/demos/type-trail.demo").then((m) =>
      mod(m.TypeTrailDemo, m.tweaks),
    ),
  "glass-orb": () =>
    import("@/registry/demos/glass-orb.demo").then((m) =>
      mod(m.GlassOrbDemo, m.tweaks),
    ),
  "live-wire-mark": () =>
    import("@/registry/demos/live-wire-mark.demo").then((m) =>
      mod(m.LiveWireMarkDemo, m.tweaks),
    ),
  "dither-curtain": () =>
    import("@/registry/demos/dither-curtain.demo").then((m) =>
      mod(m.DitherCurtainDemo, m.tweaks),
    ),
  "lantern-cursor": () =>
    import("@/registry/demos/lantern-cursor.demo").then((m) =>
      mod(m.LanternCursorDemo, m.tweaks),
    ),
  "scroll-unfold": () =>
    import("@/registry/demos/scroll-unfold.demo").then((m) =>
      mod(m.ScrollUnfoldDemo, m.tweaks),
    ),
  "drop-ripple": () =>
    import("@/registry/demos/drop-ripple.demo").then((m) =>
      mod(m.DropRippleDemo, m.tweaks),
    ),
  "cloth-grid": () =>
    import("@/registry/demos/cloth-grid.demo").then((m) =>
      mod(m.ClothGridDemo, m.tweaks),
    ),
  murmuration: () =>
    import("@/registry/demos/murmuration.demo").then((m) =>
      mod(m.MurmurationDemo, m.tweaks),
    ),
  "halftone-wake": () =>
    import("@/registry/demos/halftone-wake.demo").then((m) =>
      mod(m.HalftoneWakeDemo, m.tweaks),
    ),
  "mosaic-flip": () =>
    import("@/registry/demos/mosaic-flip.demo").then((m) =>
      mod(m.MosaicFlipDemo, m.tweaks),
    ),
  "dot-lens": () =>
    import("@/registry/demos/dot-lens.demo").then((m) =>
      mod(m.DotLensDemo, m.tweaks),
    ),
  "enter-stage": () =>
    import("@/registry/demos/enter-stage.demo").then((m) =>
      mod(m.EnterStageDemo, m.tweaks),
    ),
  "haze-fade": () =>
    import("@/registry/demos/haze-fade.demo").then((m) =>
      mod(m.HazeFadeDemo, m.tweaks),
    ),
  "arc-border": () =>
    import("@/registry/demos/arc-border.demo").then((m) =>
      mod(m.ArcBorderDemo, m.tweaks),
    ),
  "moon-ring": () =>
    import("@/registry/demos/moon-ring.demo").then((m) =>
      mod(m.MoonRingDemo, m.tweaks),
    ),
  "block-dissolve": () =>
    import("@/registry/demos/block-dissolve.demo").then((m) =>
      mod(m.BlockDissolveDemo, m.tweaks),
    ),
  "sheen-glass": () =>
    import("@/registry/demos/sheen-glass.demo").then((m) =>
      mod(m.SheenGlassDemo, m.tweaks),
    ),
  "float-field": () =>
    import("@/registry/demos/float-field.demo").then((m) =>
      mod(m.FloatFieldDemo, m.tweaks),
    ),
  "logo-parade": () =>
    import("@/registry/demos/logo-parade.demo").then((m) =>
      mod(m.LogoParadeDemo, m.tweaks),
    ),
  "lock-on": () =>
    import("@/registry/demos/lock-on.demo").then((m) =>
      mod(m.LockOnDemo, m.tweaks),
    ),
  "halo-rings": () =>
    import("@/registry/demos/halo-rings.demo").then((m) =>
      mod(m.HaloRingsDemo, m.tweaks),
    ),
  "laser-sheet": () =>
    import("@/registry/demos/laser-sheet.demo").then((m) =>
      mod(m.LaserSheetDemo, m.tweaks),
    ),
  "forge-flow": () =>
    import("@/registry/demos/forge-flow.demo").then((m) =>
      mod(m.ForgeFlowDemo, m.tweaks),
    ),
  "dune-gradient": () =>
    import("@/registry/demos/dune-gradient.demo").then((m) =>
      mod(m.DuneGradientDemo, m.tweaks),
    ),
  "dew-web": () =>
    import("@/registry/demos/dew-web.demo").then((m) =>
      mod(m.DewWebDemo, m.tweaks),
    ),
  "survey-contours": () =>
    import("@/registry/demos/survey-contours.demo").then((m) =>
      mod(m.SurveyContoursDemo, m.tweaks),
    ),
  "light-corridor": () =>
    import("@/registry/demos/light-corridor.demo").then((m) =>
      mod(m.LightCorridorDemo, m.tweaks),
    ),
  "sliced-horizon": () =>
    import("@/registry/demos/sliced-horizon.demo").then((m) =>
      mod(m.SlicedHorizonDemo, m.tweaks),
    ),
  "pulse-tiles": () =>
    import("@/registry/demos/pulse-tiles.demo").then((m) =>
      mod(m.PulseTilesDemo, m.tweaks),
    ),
  "scan-bed": () =>
    import("@/registry/demos/scan-bed.demo").then((m) =>
      mod(m.ScanBedDemo, m.tweaks),
    ),
  "iron-sand": () =>
    import("@/registry/demos/iron-sand.demo").then((m) =>
      mod(m.IronSandDemo, m.tweaks),
    ),
  "glow-rain": () =>
    import("@/registry/demos/glow-rain.demo").then((m) =>
      mod(m.GlowRainDemo, m.tweaks),
    ),
  "aether-swirl": () =>
    import("@/registry/demos/aether-swirl.demo").then((m) =>
      mod(m.AetherSwirlDemo, m.tweaks),
    ),
  "prism-spill": () =>
    import("@/registry/demos/prism-spill.demo").then((m) =>
      mod(m.PrismSpillDemo, m.tweaks),
    ),
  "peel-label": () =>
    import("@/registry/demos/peel-label.demo").then((m) =>
      mod(m.PeelLabelDemo, m.tweaks),
    ),
  "mosaic-trail": () =>
    import("@/registry/demos/mosaic-trail.demo").then((m) =>
      mod(m.MosaicTrailDemo, m.tweaks),
    ),
  "cube-field": () =>
    import("@/registry/demos/cube-field.demo").then((m) =>
      mod(m.CubeFieldDemo, m.tweaks),
    ),
  "molten-mark": () =>
    import("@/registry/demos/molten-mark.demo").then((m) =>
      mod(m.MoltenMarkDemo, m.tweaks),
    ),
  "film-grain": () =>
    import("@/registry/demos/film-grain.demo").then((m) =>
      mod(m.FilmGrainDemo, m.tweaks),
    ),
  "chevron-tide": () =>
    import("@/registry/demos/chevron-tide.demo").then((m) =>
      mod(m.ChevronTideDemo, m.tweaks),
    ),
  "louver-light": () =>
    import("@/registry/demos/louver-light.demo").then((m) =>
      mod(m.LouverLightDemo, m.tweaks),
    ),
  "shape-swell": () =>
    import("@/registry/demos/shape-swell.demo").then((m) =>
      mod(m.ShapeSwellDemo, m.tweaks),
    ),
  "glass-drift": () =>
    import("@/registry/demos/glass-drift.demo").then((m) =>
      mod(m.GlassDriftDemo, m.tweaks),
    ),
  "fiber-mist": () =>
    import("@/registry/demos/fiber-mist.demo").then((m) =>
      mod(m.FiberMistDemo, m.tweaks),
    ),
  "tube-glow": () =>
    import("@/registry/demos/tube-glow.demo").then((m) =>
      mod(m.TubeGlowDemo, m.tweaks),
    ),
  "night-veil": () =>
    import("@/registry/demos/night-veil.demo").then((m) =>
      mod(m.NightVeilDemo, m.tweaks),
    ),
  "beacon-pillar": () =>
    import("@/registry/demos/beacon-pillar.demo").then((m) =>
      mod(m.BeaconPillarDemo, m.tweaks),
    ),
  "drape-silk": () =>
    import("@/registry/demos/drape-silk.demo").then((m) =>
      mod(m.DrapeSilkDemo, m.tweaks),
    ),
  "drift-lines": () =>
    import("@/registry/demos/drift-lines.demo").then((m) =>
      mod(m.DriftLinesDemo, m.tweaks),
    ),
  "window-shafts": () =>
    import("@/registry/demos/window-shafts.demo").then((m) =>
      mod(m.WindowShaftsDemo, m.tweaks),
    ),
  "crown-rays": () =>
    import("@/registry/demos/crown-rays.demo").then((m) =>
      mod(m.CrownRaysDemo, m.tweaks),
    ),
  "pixel-bloom": () =>
    import("@/registry/demos/pixel-bloom.demo").then((m) =>
      mod(m.PixelBloomDemo, m.tweaks),
    ),
  "color-fold": () =>
    import("@/registry/demos/color-fold.demo").then((m) =>
      mod(m.ColorFoldDemo, m.tweaks),
    ),
  "iris-watch": () =>
    import("@/registry/demos/iris-watch.demo").then((m) =>
      mod(m.IrisWatchDemo, m.tweaks),
    ),
  "harp-strings": () =>
    import("@/registry/demos/harp-strings.demo").then((m) =>
      mod(m.HarpStringsDemo, m.tweaks),
    ),
  "sweep-scope": () =>
    import("@/registry/demos/sweep-scope.demo").then((m) =>
      mod(m.SweepScopeDemo, m.tweaks),
    ),
  "polar-glow": () =>
    import("@/registry/demos/polar-glow.demo").then((m) =>
      mod(m.PolarGlowDemo, m.tweaks),
    ),
  "compass-field": () =>
    import("@/registry/demos/compass-field.demo").then((m) =>
      mod(m.CompassFieldDemo, m.tweaks),
    ),
  "phantom-cursor": () =>
    import("@/registry/demos/phantom-cursor.demo").then((m) =>
      mod(m.PhantomCursorDemo, m.tweaks),
    ),
  "edge-haze": () =>
    import("@/registry/demos/edge-haze.demo").then((m) =>
      mod(m.EdgeHazeDemo, m.tweaks),
    ),
  "click-bloom": () =>
    import("@/registry/demos/click-bloom.demo").then((m) =>
      mod(m.ClickBloomDemo, m.tweaks),
    ),
  lodestone: () =>
    import("@/registry/demos/lodestone.demo").then((m) =>
      mod(m.LodestoneDemo, m.tweaks),
    ),
  "kelp-strands": () =>
    import("@/registry/demos/kelp-strands.demo").then((m) =>
      mod(m.KelpStrandsDemo, m.tweaks),
    ),
  "soft-shape": () =>
    import("@/registry/demos/soft-shape.demo").then((m) =>
      mod(m.SoftShapeDemo, m.tweaks),
    ),
  "sight-lines": () =>
    import("@/registry/demos/sight-lines.demo").then((m) =>
      mod(m.SightLinesDemo, m.tweaks),
    ),
  "photo-scatter": () =>
    import("@/registry/demos/photo-scatter.demo").then((m) =>
      mod(m.PhotoScatterDemo, m.tweaks),
    ),
  "silk-ribbons": () =>
    import("@/registry/demos/silk-ribbons.demo").then((m) =>
      mod(m.SilkRibbonsDemo, m.tweaks),
    ),
  "ink-splash": () =>
    import("@/registry/demos/ink-splash.demo").then((m) =>
      mod(m.InkSplashDemo, m.tweaks),
    ),
  "lava-blobs": () =>
    import("@/registry/demos/lava-blobs.demo").then((m) =>
      mod(m.LavaBlobsDemo, m.tweaks),
    ),
  "jelly-cursor": () =>
    import("@/registry/demos/jelly-cursor.demo").then((m) =>
      mod(m.JellyCursorDemo, m.tweaks),
    ),
  "comet-border": () =>
    import("@/registry/demos/comet-border.demo").then((m) =>
      mod(m.CometBorderDemo, m.tweaks),
    ),
  "aurora-curtain": () =>
    import("@/registry/demos/aurora-curtain.demo").then((m) =>
      mod(m.AuroraCurtainDemo, m.tweaks),
    ),
  "plasma-bloom": () =>
    import("@/registry/demos/plasma-bloom.demo").then((m) =>
      mod(m.PlasmaBloomDemo, m.tweaks),
    ),
  "plasma-ribbon": () =>
    import("@/registry/demos/plasma-ribbon.demo").then((m) =>
      mod(m.PlasmaRibbonDemo, m.tweaks),
    ),
  "dust-motes": () =>
    import("@/registry/demos/dust-motes.demo").then((m) =>
      mod(m.DustMotesDemo, m.tweaks),
    ),
  "shutter-glow": () =>
    import("@/registry/demos/shutter-glow.demo").then((m) =>
      mod(m.ShutterGlowDemo, m.tweaks),
    ),
  "grain-mesh": () =>
    import("@/registry/demos/grain-mesh.demo").then((m) =>
      mod(m.GrainMeshDemo, m.tweaks),
    ),
  "horizon-grid": () =>
    import("@/registry/demos/horizon-grid.demo").then((m) =>
      mod(m.HorizonGridDemo, m.tweaks),
    ),
  "stage-beams": () =>
    import("@/registry/demos/stage-beams.demo").then((m) =>
      mod(m.StageBeamsDemo, m.tweaks),
    ),
  "pixel-snowfall": () =>
    import("@/registry/demos/pixel-snowfall.demo").then((m) =>
      mod(m.PixelSnowfallDemo, m.tweaks),
    ),
  "storm-front": () =>
    import("@/registry/demos/storm-front.demo").then((m) =>
      mod(m.StormFrontDemo, m.tweaks),
    ),
  "spectrum-burst": () =>
    import("@/registry/demos/spectrum-burst.demo").then((m) =>
      mod(m.SpectrumBurstDemo, m.tweaks),
    ),
  "star-spiral": () =>
    import("@/registry/demos/star-spiral.demo").then((m) =>
      mod(m.StarSpiralDemo, m.tweaks),
    ),
  "dither-dunes": () =>
    import("@/registry/demos/dither-dunes.demo").then((m) =>
      mod(m.DitherDunesDemo, m.tweaks),
    ),
  "relay-terminal": () =>
    import("@/registry/demos/relay-terminal.demo").then((m) =>
      mod(m.RelayTerminalDemo, m.tweaks),
    ),
  "ripple-lattice": () =>
    import("@/registry/demos/ripple-lattice.demo").then((m) =>
      mod(m.RippleLatticeDemo, m.tweaks),
    ),
  "pollen-flow": () =>
    import("@/registry/demos/pollen-flow.demo").then((m) =>
      mod(m.PollenFlowDemo, m.tweaks),
    ),
  "dot-tide": () =>
    import("@/registry/demos/dot-tide.demo").then((m) =>
      mod(m.DotTideDemo, m.tweaks),
    ),
  "thread-drift": () =>
    import("@/registry/demos/thread-drift.demo").then((m) =>
      mod(m.ThreadDriftDemo, m.tweaks),
    ),
  "night-drive": () =>
    import("@/registry/demos/night-drive.demo").then((m) =>
      mod(m.NightDriveDemo, m.tweaks),
    ),
  "oil-film": () =>
    import("@/registry/demos/oil-film.demo").then((m) =>
      mod(m.OilFilmDemo, m.tweaks),
    ),
  "tide-lines": () =>
    import("@/registry/demos/tide-lines.demo").then((m) =>
      mod(m.TideLinesDemo, m.tweaks),
    ),
  "bend-grid": () =>
    import("@/registry/demos/bend-grid.demo").then((m) =>
      mod(m.BendGridDemo, m.tweaks),
    ),
  "bead-pit": () =>
    import("@/registry/demos/bead-pit.demo").then((m) =>
      mod(m.BeadPitDemo, m.tweaks),
    ),
  "glow-orb": () =>
    import("@/registry/demos/glow-orb.demo").then((m) =>
      mod(m.GlowOrbDemo, m.tweaks),
    ),
  "letter-field": () =>
    import("@/registry/demos/letter-field.demo").then((m) =>
      mod(m.LetterFieldDemo, m.tweaks),
    ),
  "tile-drift": () =>
    import("@/registry/demos/tile-drift.demo").then((m) =>
      mod(m.TileDriftDemo, m.tweaks),
    ),
  "shape-lattice": () =>
    import("@/registry/demos/shape-lattice.demo").then((m) =>
      mod(m.ShapeLatticeDemo, m.tweaks),
    ),
  "chrome-pool": () =>
    import("@/registry/demos/chrome-pool.demo").then((m) =>
      mod(m.ChromePoolDemo, m.tweaks),
    ),
  "paint-vortex": () =>
    import("@/registry/demos/paint-vortex.demo").then((m) =>
      mod(m.PaintVortexDemo, m.tweaks),
    ),
  "strip-shred": () =>
    import("@/registry/demos/strip-shred.demo").then((m) =>
      mod(m.StripShredDemo, m.tweaks),
    ),
  "paper-ball": () =>
    import("@/registry/demos/paper-ball.demo").then((m) =>
      mod(m.PaperBallDemo, m.tweaks),
    ),
  "stub-tear": () =>
    import("@/registry/demos/stub-tear.demo").then((m) =>
      mod(m.StubTearDemo, m.tweaks),
    ),
  "turnover-card": () =>
    import("@/registry/demos/turnover-card.demo").then((m) =>
      mod(m.TurnoverCardDemo, m.tweaks),
    ),
  "branch-out": () =>
    import("@/registry/demos/branch-out.demo").then((m) =>
      mod(m.BranchOutDemo, m.tweaks),
    ),
  "folder-fan": () =>
    import("@/registry/demos/folder-fan.demo").then((m) =>
      mod(m.FolderFanDemo, m.tweaks),
    ),
  "crop-marks": () =>
    import("@/registry/demos/crop-marks.demo").then((m) =>
      mod(m.CropMarksDemo, m.tweaks),
    ),
  "think-thread": () =>
    import("@/registry/demos/think-thread.demo").then((m) =>
      mod(m.ThinkThreadDemo, m.tweaks),
    ),
  "talk-pill": () =>
    import("@/registry/demos/talk-pill.demo").then((m) =>
      mod(m.TalkPillDemo, m.tweaks),
    ),
  "tank-level": () =>
    import("@/registry/demos/tank-level.demo").then((m) =>
      mod(m.TankLevelDemo, m.tweaks),
    ),
  "ask-bar": () =>
    import("@/registry/demos/ask-bar.demo").then((m) =>
      mod(m.AskBarDemo, m.tweaks),
    ),
  "flick-note": () =>
    import("@/registry/demos/flick-note.demo").then((m) =>
      mod(m.FlickNoteDemo, m.tweaks),
    ),
  slingshot: () =>
    import("@/registry/demos/slingshot.demo").then((m) =>
      mod(m.SlingshotDemo, m.tweaks),
    ),
  "chime-bell": () =>
    import("@/registry/demos/chime-bell.demo").then((m) =>
      mod(m.ChimeBellDemo, m.tweaks),
    ),
  "line-chip": () =>
    import("@/registry/demos/line-chip.demo").then((m) =>
      mod(m.LineChipDemo, m.tweaks),
    ),
  "verdict-mark": () =>
    import("@/registry/demos/verdict-mark.demo").then((m) =>
      mod(m.VerdictMarkDemo, m.tweaks),
    ),
  "rail-select": () =>
    import("@/registry/demos/rail-select.demo").then((m) =>
      mod(m.RailSelectDemo, m.tweaks),
    ),
  "ledger-swipe": () =>
    import("@/registry/demos/ledger-swipe.demo").then((m) =>
      mod(m.LedgerSwipeDemo, m.tweaks),
    ),
  "goo-radio": () =>
    import("@/registry/demos/goo-radio.demo").then((m) =>
      mod(m.GooRadioDemo, m.tweaks),
    ),
  "comet-knob": () =>
    import("@/registry/demos/comet-knob.demo").then((m) =>
      mod(m.CometKnobDemo, m.tweaks),
    ),
  "wake-range": () =>
    import("@/registry/demos/wake-range.demo").then((m) =>
      mod(m.WakeRangeDemo, m.tweaks),
    ),
  "pin-slots": () =>
    import("@/registry/demos/pin-slots.demo").then((m) =>
      mod(m.PinSlotsDemo, m.tweaks),
    ),
  "shy-label": () =>
    import("@/registry/demos/shy-label.demo").then((m) =>
      mod(m.ShyLabelDemo, m.tweaks),
    ),
  "lattice-wait": () =>
    import("@/registry/demos/lattice-wait.demo").then((m) =>
      mod(m.LatticeWaitDemo, m.tweaks),
    ),
  "drag-number": () =>
    import("@/registry/demos/drag-number.demo").then((m) =>
      mod(m.DragNumberDemo, m.tweaks),
    ),
  "fuse-confirm": () =>
    import("@/registry/demos/fuse-confirm.demo").then((m) =>
      mod(m.FuseConfirmDemo, m.tweaks),
    ),
  "ember-tip": () =>
    import("@/registry/demos/ember-tip.demo").then((m) =>
      mod(m.EmberTipDemo, m.tweaks),
    ),
  "slide-seal": () =>
    import("@/registry/demos/slide-seal.demo").then((m) =>
      mod(m.SlideSealDemo, m.tweaks),
    ),
  "stretch-tabs": () =>
    import("@/registry/demos/stretch-tabs.demo").then((m) =>
      mod(m.StretchTabsDemo, m.tweaks),
    ),
  "beat-like": () =>
    import("@/registry/demos/beat-like.demo").then((m) =>
      mod(m.BeatLikeDemo, m.tweaks),
    ),
  "tick-spring": () =>
    import("@/registry/demos/tick-spring.demo").then((m) =>
      mod(m.TickSpringDemo, m.tweaks),
    ),
  "star-peek": () =>
    import("@/registry/demos/star-peek.demo").then((m) =>
      mod(m.StarPeekDemo, m.tweaks),
    ),
  "heat-hold": () =>
    import("@/registry/demos/heat-hold.demo").then((m) =>
      mod(m.HeatHoldDemo, m.tweaks),
    ),
  "squash-switch": () =>
    import("@/registry/demos/squash-switch.demo").then((m) =>
      mod(m.SquashSwitchDemo, m.tweaks),
    ),
  "satin-rake": () =>
    import("@/registry/demos/satin-rake.demo").then((m) =>
      mod(m.SatinRakeDemo, m.tweaks),
    ),
  "thread-hourglass": () =>
    import("@/registry/demos/thread-hourglass.demo").then((m) =>
      mod(m.ThreadHourglassDemo, m.tweaks),
    ),
  "sea-level": () =>
    import("@/registry/demos/sea-level.demo").then((m) =>
      mod(m.SeaLevelDemo, m.tweaks),
    ),
  "dust-devil": () =>
    import("@/registry/demos/dust-devil.demo").then((m) =>
      mod(m.DustDevilDemo, m.tweaks),
    ),
  "star-geode": () =>
    import("@/registry/demos/star-geode.demo").then((m) =>
      mod(m.StarGeodeDemo, m.tweaks),
    ),
  "tidal-pair": () =>
    import("@/registry/demos/tidal-pair.demo").then((m) =>
      mod(m.TidalPairDemo, m.tweaks),
    ),
  "beach-scrawl": () =>
    import("@/registry/demos/beach-scrawl.demo").then((m) =>
      mod(m.BeachScrawlDemo, m.tweaks),
    ),
  "log-rain": () =>
    import("@/registry/demos/log-rain.demo").then((m) =>
      mod(m.LogRainDemo, m.tweaks),
    ),
  "ascii-hearth": () =>
    import("@/registry/demos/ascii-hearth.demo").then((m) =>
      mod(m.AsciiHearthDemo, m.tweaks),
    ),
  "banded-giant": () =>
    import("@/registry/demos/banded-giant.demo").then((m) =>
      mod(m.BandedGiantDemo, m.tweaks),
    ),
  "echo-sounder": () =>
    import("@/registry/demos/echo-sounder.demo").then((m) =>
      mod(m.EchoSounderDemo, m.tweaks),
    ),
  "taffy-pull": () =>
    import("@/registry/demos/taffy-pull.demo").then((m) =>
      mod(m.TaffyPullDemo, m.tweaks),
    ),
  "bulb-marquee": () =>
    import("@/registry/demos/bulb-marquee.demo").then((m) =>
      mod(m.BulbMarqueeDemo, m.tweaks),
    ),
  "reed-type": () =>
    import("@/registry/demos/reed-type.demo").then((m) =>
      mod(m.ReedTypeDemo, m.tweaks),
    ),
  "incense-script": () =>
    import("@/registry/demos/incense-script.demo").then((m) =>
      mod(m.IncenseScriptDemo, m.tweaks),
    ),
  "cutout-letters": () =>
    import("@/registry/demos/cutout-letters.demo").then((m) =>
      mod(m.CutoutLettersDemo, m.tweaks),
    ),
  "bookend-type": () =>
    import("@/registry/demos/bookend-type.demo").then((m) =>
      mod(m.BookendTypeDemo, m.tweaks),
    ),
  "letter-dice": () =>
    import("@/registry/demos/letter-dice.demo").then((m) =>
      mod(m.LetterDiceDemo, m.tweaks),
    ),
  "anagram-sort": () =>
    import("@/registry/demos/anagram-sort.demo").then((m) =>
      mod(m.AnagramSortDemo, m.tweaks),
    ),
  "caustic-type": () =>
    import("@/registry/demos/caustic-type.demo").then((m) =>
      mod(m.CausticTypeDemo, m.tweaks),
    ),
  "armillary-words": () =>
    import("@/registry/demos/armillary-words.demo").then((m) =>
      mod(m.ArmillaryWordsDemo, m.tweaks),
    ),
  "blade-type": () =>
    import("@/registry/demos/blade-type.demo").then((m) =>
      mod(m.BladeTypeDemo, m.tweaks),
    ),
  "crest-reader": () =>
    import("@/registry/demos/crest-reader.demo").then((m) =>
      mod(m.CrestReaderDemo, m.tweaks),
    ),
  "bunting-line": () =>
    import("@/registry/demos/bunting-line.demo").then((m) =>
      mod(m.BuntingLineDemo, m.tweaks),
    ),
  "pleat-field": () =>
    import("@/registry/demos/pleat-field.demo").then((m) =>
      mod(m.PleatFieldDemo, m.tweaks),
    ),
  "limb-dawn": () =>
    import("@/registry/demos/limb-dawn.demo").then((m) =>
      mod(m.LimbDawnDemo, m.tweaks),
    ),
  "ratio-loop": () =>
    import("@/registry/demos/ratio-loop.demo").then((m) =>
      mod(m.RatioLoopDemo, m.tweaks),
    ),
  "seam-light": () =>
    import("@/registry/demos/seam-light.demo").then((m) =>
      mod(m.SeamLightDemo, m.tweaks),
    ),
  "facet-laser": () =>
    import("@/registry/demos/facet-laser.demo").then((m) =>
      mod(m.FacetLaserDemo, m.tweaks),
    ),
  "hex-coffers": () =>
    import("@/registry/demos/hex-coffers.demo").then((m) =>
      mod(m.HexCoffersDemo, m.tweaks),
    ),
  "fluted-tumbler": () =>
    import("@/registry/demos/fluted-tumbler.demo").then((m) =>
      mod(m.FlutedTumblerDemo, m.tweaks),
    ),
  "fibre-lamp": () =>
    import("@/registry/demos/fibre-lamp.demo").then((m) =>
      mod(m.FibreLampDemo, m.tweaks),
    ),
  "moire-band": () =>
    import("@/registry/demos/moire-band.demo").then((m) =>
      mod(m.MoireBandDemo, m.tweaks),
    ),
  "block-horizon": () =>
    import("@/registry/demos/block-horizon.demo").then((m) =>
      mod(m.BlockHorizonDemo, m.tweaks),
    ),
  "trace-current": () =>
    import("@/registry/demos/trace-current.demo").then((m) =>
      mod(m.TraceCurrentDemo, m.tweaks),
    ),
  "pocket-sky": () =>
    import("@/registry/demos/pocket-sky.demo").then((m) =>
      mod(m.PocketSkyDemo, m.tweaks),
    ),
  "optical-mix": () =>
    import("@/registry/demos/optical-mix.demo").then((m) =>
      mod(m.OpticalMixDemo, m.tweaks),
    ),
  "steam-words": () =>
    import("@/registry/demos/steam-words.demo").then((m) =>
      mod(m.SteamWordsDemo, m.tweaks),
    ),
  "word-hunt": () =>
    import("@/registry/demos/word-hunt.demo").then((m) =>
      mod(m.WordHuntDemo, m.tweaks),
    ),
  "salon-walk": () =>
    import("@/registry/demos/salon-walk.demo").then((m) =>
      mod(m.SalonWalkDemo, m.tweaks),
    ),
  "formation-flight": () =>
    import("@/registry/demos/formation-flight.demo").then((m) =>
      mod(m.FormationFlightDemo, m.tweaks),
    ),
  "cyclorama-room": () =>
    import("@/registry/demos/cyclorama-room.demo").then((m) =>
      mod(m.CycloramaRoomDemo, m.tweaks),
    ),
  "paternoster-cards": () =>
    import("@/registry/demos/paternoster-cards.demo").then((m) =>
      mod(m.PaternosterCardsDemo, m.tweaks),
    ),
  "celluloid-coil": () =>
    import("@/registry/demos/celluloid-coil.demo").then((m) =>
      mod(m.CelluloidCoilDemo, m.tweaks),
    ),
  "prism-gate": () =>
    import("@/registry/demos/prism-gate.demo").then((m) =>
      mod(m.PrismGateDemo, m.tweaks),
    ),
  "petal-gallery": () =>
    import("@/registry/demos/petal-gallery.demo").then((m) =>
      mod(m.PetalGalleryDemo, m.tweaks),
    ),
  "crate-dig": () =>
    import("@/registry/demos/crate-dig.demo").then((m) =>
      mod(m.CrateDigDemo, m.tweaks),
    ),
  "yearbook-grid": () =>
    import("@/registry/demos/yearbook-grid.demo").then((m) =>
      mod(m.YearbookGridDemo, m.tweaks),
    ),
  "pause-bloom": () =>
    import("@/registry/demos/pause-bloom.demo").then((m) =>
      mod(m.PauseBloomDemo, m.tweaks),
    ),
  "bevel-gauge": () =>
    import("@/registry/demos/bevel-gauge.demo").then((m) =>
      mod(m.BevelGaugeDemo, m.tweaks),
    ),
  "bead-fountain": () =>
    import("@/registry/demos/bead-fountain.demo").then((m) =>
      mod(m.BeadFountainDemo, m.tweaks),
    ),
  "leaf-dapple": () =>
    import("@/registry/demos/leaf-dapple.demo").then((m) =>
      mod(m.LeafDappleDemo, m.tweaks),
    ),
  "gold-mend": () =>
    import("@/registry/demos/gold-mend.demo").then((m) =>
      mod(m.GoldMendDemo, m.tweaks),
    ),
  "light-wand": () =>
    import("@/registry/demos/light-wand.demo").then((m) =>
      mod(m.LightWandDemo, m.tweaks),
    ),
  "shutter-spill": () =>
    import("@/registry/demos/shutter-spill.demo").then((m) =>
      mod(m.ShutterSpillDemo, m.tweaks),
    ),
  "book-spines": () =>
    import("@/registry/demos/book-spines.demo").then((m) =>
      mod(m.BookSpinesDemo, m.tweaks),
    ),
  "lens-turret": () =>
    import("@/registry/demos/lens-turret.demo").then((m) =>
      mod(m.LensTurretDemo, m.tweaks),
    ),
  "bokeh-orbit": () =>
    import("@/registry/demos/bokeh-orbit.demo").then((m) =>
      mod(m.BokehOrbitDemo, m.tweaks),
    ),
  "seedhead-gallery": () =>
    import("@/registry/demos/seedhead-gallery.demo").then((m) =>
      mod(m.SeedheadGalleryDemo, m.tweaks),
    ),
  "gate-rings": () =>
    import("@/registry/demos/gate-rings.demo").then((m) =>
      mod(m.GateRingsDemo, m.tweaks),
    ),
  "plankton-wake": () =>
    import("@/registry/demos/plankton-wake.demo").then((m) =>
      mod(m.PlanktonWakeDemo, m.tweaks),
    ),
  "impasto-knife": () =>
    import("@/registry/demos/impasto-knife.demo").then((m) =>
      mod(m.ImpastoKnifeDemo, m.tweaks),
    ),
  "plasma-lamp": () =>
    import("@/registry/demos/plasma-lamp.demo").then((m) =>
      mod(m.PlasmaLampDemo, m.tweaks),
    ),
  "dart-cursor": () =>
    import("@/registry/demos/dart-cursor.demo").then((m) =>
      mod(m.DartCursorDemo, m.tweaks),
    ),
  "magpie-cursor": () =>
    import("@/registry/demos/magpie-cursor.demo").then((m) =>
      mod(m.MagpieCursorDemo, m.tweaks),
    ),
  "board-tiles": () =>
    import("@/registry/demos/board-tiles.demo").then((m) =>
      mod(m.BoardTilesDemo, m.tweaks),
    ),
  "serpentine-pop": () =>
    import("@/registry/demos/serpentine-pop.demo").then((m) =>
      mod(m.SerpentinePopDemo, m.tweaks),
    ),
  "flipbook-path": () =>
    import("@/registry/demos/flipbook-path.demo").then((m) =>
      mod(m.FlipbookPathDemo, m.tweaks),
    ),
  "gel-cling": () =>
    import("@/registry/demos/gel-cling.demo").then((m) =>
      mod(m.GelClingDemo, m.tweaks),
    ),
  "mica-drift": () =>
    import("@/registry/demos/mica-drift.demo").then((m) =>
      mod(m.MicaDriftDemo, m.tweaks),
    ),
  "bow-ribbon": () =>
    import("@/registry/demos/bow-ribbon.demo").then((m) =>
      mod(m.BowRibbonDemo, m.tweaks),
    ),
  "branch-draft": () =>
    import("@/registry/demos/branch-draft.demo").then((m) =>
      mod(m.BranchDraftDemo, m.tweaks),
    ),
  "melt-swap": () =>
    import("@/registry/demos/melt-swap.demo").then((m) =>
      mod(m.MeltSwapDemo, m.tweaks),
    ),
  "avatar-jar": () =>
    import("@/registry/demos/avatar-jar.demo").then((m) =>
      mod(m.AvatarJarDemo, m.tweaks),
    ),
  "field-loupe": () =>
    import("@/registry/demos/field-loupe.demo").then((m) =>
      mod(m.FieldLoupeDemo, m.tweaks),
    ),
  "burning-glass": () =>
    import("@/registry/demos/burning-glass.demo").then((m) =>
      mod(m.BurningGlassDemo, m.tweaks),
    ),
  "liquify-print": () =>
    import("@/registry/demos/liquify-print.demo").then((m) =>
      mod(m.LiquifyPrintDemo, m.tweaks),
    ),
  "lantern-rise": () =>
    import("@/registry/demos/lantern-rise.demo").then((m) =>
      mod(m.LanternRiseDemo, m.tweaks),
    ),
  "ring-shepherd": () =>
    import("@/registry/demos/ring-shepherd.demo").then((m) =>
      mod(m.RingShepherdDemo, m.tweaks),
    ),
  "rubber-belt": () =>
    import("@/registry/demos/rubber-belt.demo").then((m) =>
      mod(m.RubberBeltDemo, m.tweaks),
    ),
  "hand-set": () =>
    import("@/registry/demos/hand-set.demo").then((m) =>
      mod(m.HandSetDemo, m.tweaks),
    ),
  "off-register": () =>
    import("@/registry/demos/off-register.demo").then((m) =>
      mod(m.OffRegisterDemo, m.tweaks),
    ),
  "plumb-cursor": () =>
    import("@/registry/demos/plumb-cursor.demo").then((m) =>
      mod(m.PlumbCursorDemo, m.tweaks),
    ),
  "river-script": () =>
    import("@/registry/demos/river-script.demo").then((m) =>
      mod(m.RiverScriptDemo, m.tweaks),
    ),
  "notepad-flip": () =>
    import("@/registry/demos/notepad-flip.demo").then((m) =>
      mod(m.NotepadFlipDemo, m.tweaks),
    ),
  "firefly-letters": () =>
    import("@/registry/demos/firefly-letters.demo").then((m) =>
      mod(m.FireflyLettersDemo, m.tweaks),
    ),
  "break-shot": () =>
    import("@/registry/demos/break-shot.demo").then((m) =>
      mod(m.BreakShotDemo, m.tweaks),
    ),
  "crease-swap": () =>
    import("@/registry/demos/crease-swap.demo").then((m) =>
      mod(m.CreaseSwapDemo, m.tweaks),
    ),
  "capillary-cursor": () =>
    import("@/registry/demos/capillary-cursor.demo").then((m) =>
      mod(m.CapillaryCursorDemo, m.tweaks),
    ),
  "margin-pencil": () =>
    import("@/registry/demos/margin-pencil.demo").then((m) =>
      mod(m.MarginPencilDemo, m.tweaks),
    ),
  "night-side": () =>
    import("@/registry/demos/night-side.demo").then((m) =>
      mod(m.NightSideDemo, m.tweaks),
    ),
  "turnstile-cards": () =>
    import("@/registry/demos/turnstile-cards.demo").then((m) =>
      mod(m.TurnstileCardsDemo, m.tweaks),
    ),
  "wrap-wall": () =>
    import("@/registry/demos/wrap-wall.demo").then((m) =>
      mod(m.WrapWallDemo, m.tweaks),
    ),
  "band-compare": () =>
    import("@/registry/demos/band-compare.demo").then((m) =>
      mod(m.BandCompareDemo, m.tweaks),
    ),
  "sand-furrow": () =>
    import("@/registry/demos/sand-furrow.demo").then((m) =>
      mod(m.SandFurrowDemo, m.tweaks),
    ),
  "sweep-studio": () =>
    import("@/registry/demos/sweep-studio.demo").then((m) =>
      mod(m.SweepStudioDemo, m.tweaks),
    ),
  "drum-plotter": () =>
    import("@/registry/demos/drum-plotter.demo").then((m) =>
      mod(m.DrumPlotterDemo, m.tweaks),
    ),
  "steel-card": () =>
    import("@/registry/demos/steel-card.demo").then((m) =>
      mod(m.SteelCardDemo, m.tweaks),
    ),
  "table-spinner": () =>
    import("@/registry/demos/table-spinner.demo").then((m) =>
      mod(m.TableSpinnerDemo, m.tweaks),
    ),
  "glass-trio": () =>
    import("@/registry/demos/glass-trio.demo").then((m) =>
      mod(m.GlassTrioDemo, m.tweaks),
    ),
  "ambient-spill": () =>
    import("@/registry/demos/ambient-spill.demo").then((m) =>
      mod(m.AmbientSpillDemo, m.tweaks),
    ),
  "year-rings": () =>
    import("@/registry/demos/year-rings.demo").then((m) =>
      mod(m.YearRingsDemo, m.tweaks),
    ),
  "burner-card": () =>
    import("@/registry/demos/burner-card.demo").then((m) =>
      mod(m.BurnerCardDemo, m.tweaks),
    ),
  "curtain-count": () =>
    import("@/registry/demos/curtain-count.demo").then((m) =>
      mod(m.CurtainCountDemo, m.tweaks),
    ),
  "word-window": () =>
    import("@/registry/demos/word-window.demo").then((m) =>
      mod(m.WordWindowDemo, m.tweaks),
    ),
  "envelope-modal": () =>
    import("@/registry/demos/envelope-modal.demo").then((m) =>
      mod(m.EnvelopeModalDemo, m.tweaks),
    ),
  "fovea-image": () =>
    import("@/registry/demos/fovea-image.demo").then((m) =>
      mod(m.FoveaImageDemo, m.tweaks),
    ),
  "dealt-feed": () =>
    import("@/registry/demos/dealt-feed.demo").then((m) =>
      mod(m.DealtFeedDemo, m.tweaks),
    ),
  "shop-light": () =>
    import("@/registry/demos/shop-light.demo").then((m) =>
      mod(m.ShopLightDemo, m.tweaks),
    ),
  "shadow-box": () =>
    import("@/registry/demos/shadow-box.demo").then((m) =>
      mod(m.ShadowBoxDemo, m.tweaks),
    ),
  "droplet-swap": () =>
    import("@/registry/demos/droplet-swap.demo").then((m) =>
      mod(m.DropletSwapDemo, m.tweaks),
    ),
  "pin-depth": () =>
    import("@/registry/demos/pin-depth.demo").then((m) =>
      mod(m.PinDepthDemo, m.tweaks),
    ),
  "graph-horizon": () =>
    import("@/registry/demos/graph-horizon.demo").then((m) =>
      mod(m.GraphHorizonDemo, m.tweaks),
    ),
  "snow-drive": () =>
    import("@/registry/demos/snow-drive.demo").then((m) =>
      mod(m.SnowDriveDemo, m.tweaks),
    ),
  "harmonic-bands": () =>
    import("@/registry/demos/harmonic-bands.demo").then((m) =>
      mod(m.HarmonicBandsDemo, m.tweaks),
    ),
  "pendant-drop": () =>
    import("@/registry/demos/pendant-drop.demo").then((m) =>
      mod(m.PendantDropDemo, m.tweaks),
    ),
  "rain-lamp": () =>
    import("@/registry/demos/rain-lamp.demo").then((m) =>
      mod(m.RainLampDemo, m.tweaks),
    ),
  "redshift-jump": () =>
    import("@/registry/demos/redshift-jump.demo").then((m) =>
      mod(m.RedshiftJumpDemo, m.tweaks),
    ),
  "bistable-sea": () =>
    import("@/registry/demos/bistable-sea.demo").then((m) =>
      mod(m.BistableSeaDemo, m.tweaks),
    ),
  "singing-bowl": () =>
    import("@/registry/demos/singing-bowl.demo").then((m) =>
      mod(m.SingingBowlDemo, m.tweaks),
    ),
  "crest-fringe": () =>
    import("@/registry/demos/crest-fringe.demo").then((m) =>
      mod(m.CrestFringeDemo, m.tweaks),
    ),
  "beadwork-loom": () =>
    import("@/registry/demos/beadwork-loom.demo").then((m) =>
      mod(m.BeadworkLoomDemo, m.tweaks),
    ),
  "cyclone-jar": () =>
    import("@/registry/demos/cyclone-jar.demo").then((m) =>
      mod(m.CycloneJarDemo, m.tweaks),
    ),
  "mercury-gate": () =>
    import("@/registry/demos/mercury-gate.demo").then((m) =>
      mod(m.MercuryGateDemo, m.tweaks),
    ),
  "lumen-chorus": () =>
    import("@/registry/demos/lumen-chorus.demo").then((m) =>
      mod(m.LumenChorusDemo, m.tweaks),
    ),
  "agate-slice": () =>
    import("@/registry/demos/agate-slice.demo").then((m) =>
      mod(m.AgateSliceDemo, m.tweaks),
    ),
  "willow-shell": () =>
    import("@/registry/demos/willow-shell.demo").then((m) =>
      mod(m.WillowShellDemo, m.tweaks),
    ),
  "play-parachute": () =>
    import("@/registry/demos/play-parachute.demo").then((m) =>
      mod(m.PlayParachuteDemo, m.tweaks),
    ),
  "shower-radiant": () =>
    import("@/registry/demos/shower-radiant.demo").then((m) =>
      mod(m.ShowerRadiantDemo, m.tweaks),
    ),
  "tube-rack": () =>
    import("@/registry/demos/tube-rack.demo").then((m) =>
      mod(m.TubeRackDemo, m.tweaks),
    ),
  "forecast-glow": () =>
    import("@/registry/demos/forecast-glow.demo").then((m) =>
      mod(m.ForecastGlowDemo, m.tweaks),
    ),
  "anaglyph-card": () =>
    import("@/registry/demos/anaglyph-card.demo").then((m) =>
      mod(m.AnaglyphCardDemo, m.tweaks),
    ),
  "pole-trails": () =>
    import("@/registry/demos/pole-trails.demo").then((m) =>
      mod(m.PoleTrailsDemo, m.tweaks),
    ),
  "ghosting-lcd": () =>
    import("@/registry/demos/ghosting-lcd.demo").then((m) =>
      mod(m.GhostingLcdDemo, m.tweaks),
    ),
  "heading-glyphs": () =>
    import("@/registry/demos/heading-glyphs.demo").then((m) =>
      mod(m.HeadingGlyphsDemo, m.tweaks),
    ),
  "sea-printout": () =>
    import("@/registry/demos/sea-printout.demo").then((m) =>
      mod(m.SeaPrintoutDemo, m.tweaks),
    ),
  "dendrite-reach": () =>
    import("@/registry/demos/dendrite-reach.demo").then((m) =>
      mod(m.DendriteReachDemo, m.tweaks),
    ),
  "torus-puzzle": () =>
    import("@/registry/demos/torus-puzzle.demo").then((m) =>
      mod(m.TorusPuzzleDemo, m.tweaks),
    ),
  "condenser-coil": () =>
    import("@/registry/demos/condenser-coil.demo").then((m) =>
      mod(m.CondenserCoilDemo, m.tweaks),
    ),
  "corner-tide": () =>
    import("@/registry/demos/corner-tide.demo").then((m) =>
      mod(m.CornerTideDemo, m.tweaks),
    ),
  "pastel-band": () =>
    import("@/registry/demos/pastel-band.demo").then((m) =>
      mod(m.PastelBandDemo, m.tweaks),
    ),
  "bullseye-panes": () =>
    import("@/registry/demos/bullseye-panes.demo").then((m) =>
      mod(m.BullseyePanesDemo, m.tweaks),
    ),
  "colonnade-pass": () =>
    import("@/registry/demos/colonnade-pass.demo").then((m) =>
      mod(m.ColonnadePassDemo, m.tweaks),
    ),
  "smoke-tunnel": () =>
    import("@/registry/demos/smoke-tunnel.demo").then((m) =>
      mod(m.SmokeTunnelDemo, m.tweaks),
    ),
  "root-exchange": () =>
    import("@/registry/demos/root-exchange.demo").then((m) =>
      mod(m.RootExchangeDemo, m.tweaks),
    ),
  "ice-cube": () =>
    import("@/registry/demos/ice-cube.demo").then((m) =>
      mod(m.IceCubeDemo, m.tweaks),
    ),
  "catseye-marble": () =>
    import("@/registry/demos/catseye-marble.demo").then((m) =>
      mod(m.CatseyeMarbleDemo, m.tweaks),
    ),
  "event-lens": () =>
    import("@/registry/demos/event-lens.demo").then((m) =>
      mod(m.EventLensDemo, m.tweaks),
    ),
  "gel-scroller": () =>
    import("@/registry/demos/gel-scroller.demo").then((m) =>
      mod(m.GelScrollerDemo, m.tweaks),
    ),
  "desk-spike": () =>
    import("@/registry/demos/desk-spike.demo").then((m) =>
      mod(m.DeskSpikeDemo, m.tweaks),
    ),
  "flambe-pan": () =>
    import("@/registry/demos/flambe-pan.demo").then((m) =>
      mod(m.FlambePanDemo, m.tweaks),
    ),
  "mitre-joint": () =>
    import("@/registry/demos/mitre-joint.demo").then((m) =>
      mod(m.MitreJointDemo, m.tweaks),
    ),
  "swatch-ladder": () =>
    import("@/registry/demos/swatch-ladder.demo").then((m) =>
      mod(m.SwatchLadderDemo, m.tweaks),
    ),
  "spiral-engraving": () =>
    import("@/registry/demos/spiral-engraving.demo").then((m) =>
      mod(m.SpiralEngravingDemo, m.tweaks),
    ),
  "pinscreen-swell": () =>
    import("@/registry/demos/pinscreen-swell.demo").then((m) =>
      mod(m.PinscreenSwellDemo, m.tweaks),
    ),
  "ice-floes": () =>
    import("@/registry/demos/ice-floes.demo").then((m) =>
      mod(m.IceFloesDemo, m.tweaks),
    ),
  "streak-pager": () =>
    import("@/registry/demos/streak-pager.demo").then((m) =>
      mod(m.StreakPagerDemo, m.tweaks),
    ),
  "acrylic-pour": () =>
    import("@/registry/demos/acrylic-pour.demo").then((m) =>
      mod(m.AcrylicPourDemo, m.tweaks),
    ),
  "vantage-cube": () =>
    import("@/registry/demos/vantage-cube.demo").then((m) =>
      mod(m.VantageCubeDemo, m.tweaks),
    ),
  "pillow-print": () =>
    import("@/registry/demos/pillow-print.demo").then((m) =>
      mod(m.PillowPrintDemo, m.tweaks),
    ),
  "graded-wash": () =>
    import("@/registry/demos/graded-wash.demo").then((m) =>
      mod(m.GradedWashDemo, m.tweaks),
    ),
  "fog-cloche": () =>
    import("@/registry/demos/fog-cloche.demo").then((m) =>
      mod(m.FogClocheDemo, m.tweaks),
    ),
  "text-bottle": () =>
    import("@/registry/demos/text-bottle.demo").then((m) =>
      mod(m.TextBottleDemo, m.tweaks),
    ),
  "folded-steel": () =>
    import("@/registry/demos/folded-steel.demo").then((m) =>
      mod(m.FoldedSteelDemo, m.tweaks),
    ),
  "tilled-horizon": () =>
    import("@/registry/demos/tilled-horizon.demo").then((m) =>
      mod(m.TilledHorizonDemo, m.tweaks),
    ),
  "pulled-sugar": () =>
    import("@/registry/demos/pulled-sugar.demo").then((m) =>
      mod(m.PulledSugarDemo, m.tweaks),
    ),
  "spin-art": () =>
    import("@/registry/demos/spin-art.demo").then((m) =>
      mod(m.SpinArtDemo, m.tweaks),
    ),
  "lanyard-badge": () =>
    import("@/registry/demos/lanyard-badge.demo").then((m) =>
      mod(m.LanyardBadgeDemo, m.tweaks),
    ),
  "etched-bricks": () =>
    import("@/registry/demos/etched-bricks.demo").then((m) =>
      mod(m.EtchedBricksDemo, m.tweaks),
    ),
  "flip-sequins": () =>
    import("@/registry/demos/flip-sequins.demo").then((m) =>
      mod(m.FlipSequinsDemo, m.tweaks),
    ),
  "catenary-glow": () =>
    import("@/registry/demos/catenary-glow.demo").then((m) =>
      mod(m.CatenaryGlowDemo, m.tweaks),
    ),
  "bias-stripes": () =>
    import("@/registry/demos/bias-stripes.demo").then((m) =>
      mod(m.BiasStripesDemo, m.tweaks),
    ),
  "interlace-load": () =>
    import("@/registry/demos/interlace-load.demo").then((m) =>
      mod(m.InterlaceLoadDemo, m.tweaks),
    ),
  "carriage-windows": () =>
    import("@/registry/demos/carriage-windows.demo").then((m) =>
      mod(m.CarriageWindowsDemo, m.tweaks),
    ),
  "dichroic-wall": () =>
    import("@/registry/demos/dichroic-wall.demo").then((m) =>
      mod(m.DichroicWallDemo, m.tweaks),
    ),
  "buoy-tags": () =>
    import("@/registry/demos/buoy-tags.demo").then((m) =>
      mod(m.BuoyTagsDemo, m.tweaks),
    ),
  "night-facade": () =>
    import("@/registry/demos/night-facade.demo").then((m) =>
      mod(m.NightFacadeDemo, m.tweaks),
    ),
  "guest-pointers": () =>
    import("@/registry/demos/guest-pointers.demo").then((m) =>
      mod(m.GuestPointersDemo, m.tweaks),
    ),
  "mangle-press": () =>
    import("@/registry/demos/mangle-press.demo").then((m) =>
      mod(m.ManglePressDemo, m.tweaks),
    ),
  "petri-stack": () =>
    import("@/registry/demos/petri-stack.demo").then((m) =>
      mod(m.PetriStackDemo, m.tweaks),
    ),
  "geodesic-spin": () =>
    import("@/registry/demos/geodesic-spin.demo").then((m) =>
      mod(m.GeodesicSpinDemo, m.tweaks),
    ),
  "slow-sync": () =>
    import("@/registry/demos/slow-sync.demo").then((m) =>
      mod(m.SlowSyncDemo, m.tweaks),
    ),
  "marsh-light": () =>
    import("@/registry/demos/marsh-light.demo").then((m) =>
      mod(m.MarshLightDemo, m.tweaks),
    ),
  "pace-board": () =>
    import("@/registry/demos/pace-board.demo").then((m) =>
      mod(m.PaceBoardDemo, m.tweaks),
    ),
  "eaves-drip": () =>
    import("@/registry/demos/eaves-drip.demo").then((m) =>
      mod(m.EavesDripDemo, m.tweaks),
    ),
  "card-stunt": () =>
    import("@/registry/demos/card-stunt.demo").then((m) =>
      mod(m.CardStuntDemo, m.tweaks),
    ),
  "sand-portrait": () =>
    import("@/registry/demos/sand-portrait.demo").then((m) =>
      mod(m.SandPortraitDemo, m.tweaks),
    ),
  "headwind-cards": () =>
    import("@/registry/demos/headwind-cards.demo").then((m) =>
      mod(m.HeadwindCardsDemo, m.tweaks),
    ),
  "cartwheel-deck": () =>
    import("@/registry/demos/cartwheel-deck.demo").then((m) =>
      mod(m.CartwheelDeckDemo, m.tweaks),
    ),
  "freight-sidings": () =>
    import("@/registry/demos/freight-sidings.demo").then((m) =>
      mod(m.FreightSidingsDemo, m.tweaks),
    ),
  "core-plane": () =>
    import("@/registry/demos/core-plane.demo").then((m) =>
      mod(m.CorePlaneDemo, m.tweaks),
    ),
  "node-leap": () =>
    import("@/registry/demos/node-leap.demo").then((m) =>
      mod(m.NodeLeapDemo, m.tweaks),
    ),
  "ant-column": () =>
    import("@/registry/demos/ant-column.demo").then((m) =>
      mod(m.AntColumnDemo, m.tweaks),
    ),
  "readout-skew": () =>
    import("@/registry/demos/readout-skew.demo").then((m) =>
      mod(m.ReadoutSkewDemo, m.tweaks),
    ),
  "fascicle-run": () =>
    import("@/registry/demos/fascicle-run.demo").then((m) =>
      mod(m.FascicleRunDemo, m.tweaks),
    ),
  "tidal-bore": () =>
    import("@/registry/demos/tidal-bore.demo").then((m) =>
      mod(m.TidalBoreDemo, m.tweaks),
    ),
  "drip-clock": () =>
    import("@/registry/demos/drip-clock.demo").then((m) =>
      mod(m.DripClockDemo, m.tweaks),
    ),
  "lotus-beads": () =>
    import("@/registry/demos/lotus-beads.demo").then((m) =>
      mod(m.LotusBeadsDemo, m.tweaks),
    ),
  "table-spread": () =>
    import("@/registry/demos/table-spread.demo").then((m) =>
      mod(m.TableSpreadDemo, m.tweaks),
    ),
  "glassine-album": () =>
    import("@/registry/demos/glassine-album.demo").then((m) =>
      mod(m.GlassineAlbumDemo, m.tweaks),
    ),
  "coaster-track": () =>
    import("@/registry/demos/coaster-track.demo").then((m) =>
      mod(m.CoasterTrackDemo, m.tweaks),
    ),
  "heat-putty": () =>
    import("@/registry/demos/heat-putty.demo").then((m) =>
      mod(m.HeatPuttyDemo, m.tweaks),
    ),
  "picket-arc": () =>
    import("@/registry/demos/picket-arc.demo").then((m) =>
      mod(m.PicketArcDemo, m.tweaks),
    ),
  "passing-cumulus": () =>
    import("@/registry/demos/passing-cumulus.demo").then((m) =>
      mod(m.PassingCumulusDemo, m.tweaks),
    ),
  "flute-bubbles": () =>
    import("@/registry/demos/flute-bubbles.demo").then((m) =>
      mod(m.FluteBubblesDemo, m.tweaks),
    ),
  "quilted-fields": () =>
    import("@/registry/demos/quilted-fields.demo").then((m) =>
      mod(m.QuiltedFieldsDemo, m.tweaks),
    ),
  "rack-aisle": () =>
    import("@/registry/demos/rack-aisle.demo").then((m) =>
      mod(m.RackAisleDemo, m.tweaks),
    ),
  "nacreous-sky": () =>
    import("@/registry/demos/nacreous-sky.demo").then((m) =>
      mod(m.NacreousSkyDemo, m.tweaks),
    ),
  "spooled-prints": () =>
    import("@/registry/demos/spooled-prints.demo").then((m) =>
      mod(m.SpooledPrintsDemo, m.tweaks),
    ),
  "skyline-brush": () =>
    import("@/registry/demos/skyline-brush.demo").then((m) =>
      mod(m.SkylineBrushDemo, m.tweaks),
    ),
  "flicker-prints": () =>
    import("@/registry/demos/flicker-prints.demo").then((m) =>
      mod(m.FlickerPrintsDemo, m.tweaks),
    ),
  "filing-tray": () =>
    import("@/registry/demos/filing-tray.demo").then((m) =>
      mod(m.FilingTrayDemo, m.tweaks),
    ),
  "thumb-flipbook": () =>
    import("@/registry/demos/thumb-flipbook.demo").then((m) =>
      mod(m.ThumbFlipbookDemo, m.tweaks),
    ),
  "counter-dive": () =>
    import("@/registry/demos/counter-dive.demo").then((m) =>
      mod(m.CounterDiveDemo, m.tweaks),
    ),
  "peg-migration": () =>
    import("@/registry/demos/peg-migration.demo").then((m) =>
      mod(m.PegMigrationDemo, m.tweaks),
    ),
  "second-contact": () =>
    import("@/registry/demos/second-contact.demo").then((m) =>
      mod(m.SecondContactDemo, m.tweaks),
    ),
  "raking-light": () =>
    import("@/registry/demos/raking-light.demo").then((m) =>
      mod(m.RakingLightDemo, m.tweaks),
    ),
  "monospace-pond": () =>
    import("@/registry/demos/monospace-pond.demo").then((m) =>
      mod(m.MonospacePondDemo, m.tweaks),
    ),
  "tally-facets": () =>
    import("@/registry/demos/tally-facets.demo").then((m) =>
      mod(m.TallyFacetsDemo, m.tweaks),
    ),
  "sieve-stack": () =>
    import("@/registry/demos/sieve-stack.demo").then((m) =>
      mod(m.SieveStackDemo, m.tweaks),
    ),
  "prose-filter": () =>
    import("@/registry/demos/prose-filter.demo").then((m) =>
      mod(m.ProseFilterDemo, m.tweaks),
    ),
  "saved-lenses": () =>
    import("@/registry/demos/saved-lenses.demo").then((m) =>
      mod(m.SavedLensesDemo, m.tweaks),
    ),
  "brushed-windows": () =>
    import("@/registry/demos/brushed-windows.demo").then((m) =>
      mod(m.BrushedWindowsDemo, m.tweaks),
    ),
  "wing-scales": () =>
    import("@/registry/demos/wing-scales.demo").then((m) =>
      mod(m.WingScalesDemo, m.tweaks),
    ),
  "hanging-scroll": () =>
    import("@/registry/demos/hanging-scroll.demo").then((m) =>
      mod(m.HangingScrollDemo, m.tweaks),
    ),
  "drying-line": () =>
    import("@/registry/demos/drying-line.demo").then((m) =>
      mod(m.DryingLineDemo, m.tweaks),
    ),
  "fresnel-sheet": () =>
    import("@/registry/demos/fresnel-sheet.demo").then((m) =>
      mod(m.FresnelSheetDemo, m.tweaks),
    ),
  "theatre-scrims": () =>
    import("@/registry/demos/theatre-scrims.demo").then((m) =>
      mod(m.TheatreScrimsDemo, m.tweaks),
    ),
  "slate-courses": () =>
    import("@/registry/demos/slate-courses.demo").then((m) =>
      mod(m.SlateCoursesDemo, m.tweaks),
    ),
  "room-within": () =>
    import("@/registry/demos/room-within.demo").then((m) =>
      mod(m.RoomWithinDemo, m.tweaks),
    ),
  "zellige-wall": () =>
    import("@/registry/demos/zellige-wall.demo").then((m) =>
      mod(m.ZelligeWallDemo, m.tweaks),
    ),
  "thought-avalanche": () =>
    import("@/registry/demos/thought-avalanche.demo").then((m) =>
      mod(m.ThoughtAvalancheDemo, m.tweaks),
    ),
  "planetarium-roof": () =>
    import("@/registry/demos/planetarium-roof.demo").then((m) =>
      mod(m.PlanetariumRoofDemo, m.tweaks),
    ),
  "slot-canyon": () =>
    import("@/registry/demos/slot-canyon.demo").then((m) =>
      mod(m.SlotCanyonDemo, m.tweaks),
    ),
  "switchback-trails": () =>
    import("@/registry/demos/switchback-trails.demo").then((m) =>
      mod(m.SwitchbackTrailsDemo, m.tweaks),
    ),
  "hover-forecast": () =>
    import("@/registry/demos/hover-forecast.demo").then((m) =>
      mod(m.HoverForecastDemo, m.tweaks),
    ),
  "paint-matrix": () =>
    import("@/registry/demos/paint-matrix.demo").then((m) =>
      mod(m.PaintMatrixDemo, m.tweaks),
    ),
  "veto-chips": () =>
    import("@/registry/demos/veto-chips.demo").then((m) =>
      mod(m.VetoChipsDemo, m.tweaks),
    ),
  "nested-ticks": () =>
    import("@/registry/demos/nested-ticks.demo").then((m) =>
      mod(m.NestedTicksDemo, m.tweaks),
    ),
  "drill-columns": () =>
    import("@/registry/demos/drill-columns.demo").then((m) =>
      mod(m.DrillColumnsDemo, m.tweaks),
    ),
  "space-reclaim": () =>
    import("@/registry/demos/space-reclaim.demo").then((m) =>
      mod(m.SpaceReclaimDemo, m.tweaks),
    ),
  "revision-reel": () =>
    import("@/registry/demos/revision-reel.demo").then((m) =>
      mod(m.RevisionReelDemo, m.tweaks),
    ),
  "name-clash": () =>
    import("@/registry/demos/name-clash.demo").then((m) =>
      mod(m.NameClashDemo, m.tweaks),
    ),
  "incident-bridge": () =>
    import("@/registry/demos/incident-bridge.demo").then((m) =>
      mod(m.IncidentBridgeDemo, m.tweaks),
    ),
  "blast-radius": () =>
    import("@/registry/demos/blast-radius.demo").then((m) =>
      mod(m.BlastRadiusDemo, m.tweaks),
    ),
  "tripwire-tuner": () =>
    import("@/registry/demos/tripwire-tuner.demo").then((m) =>
      mod(m.TripwireTunerDemo, m.tweaks),
    ),
  "rack-elevation": () =>
    import("@/registry/demos/rack-elevation.demo").then((m) =>
      mod(m.RackElevationDemo, m.tweaks),
    ),
  "heartbeat-ledger": () =>
    import("@/registry/demos/heartbeat-ledger.demo").then((m) =>
      mod(m.HeartbeatLedgerDemo, m.tweaks),
    ),
  "exception-triage": () =>
    import("@/registry/demos/exception-triage.demo").then((m) =>
      mod(m.ExceptionTriageDemo, m.tweaks),
    ),
  "probe-relay": () =>
    import("@/registry/demos/probe-relay.demo").then((m) =>
      mod(m.ProbeRelayDemo, m.tweaks),
    ),
  "status-dispatch": () =>
    import("@/registry/demos/status-dispatch.demo").then((m) =>
      mod(m.StatusDispatchDemo, m.tweaks),
    ),
  "ghost-baseline": () =>
    import("@/registry/demos/ghost-baseline.demo").then((m) =>
      mod(m.GhostBaselineDemo, m.tweaks),
    ),
  "pager-rota": () =>
    import("@/registry/demos/pager-rota.demo").then((m) =>
      mod(m.PagerRotaDemo, m.tweaks),
    ),
  "ghost-rows": () =>
    import("@/registry/demos/ghost-rows.demo").then((m) =>
      mod(m.GhostRowsDemo, m.tweaks),
    ),
  "open-day": () =>
    import("@/registry/demos/open-day.demo").then((m) =>
      mod(m.OpenDayDemo, m.tweaks),
    ),
  "empty-room": () =>
    import("@/registry/demos/empty-room.demo").then((m) =>
      mod(m.EmptyRoomDemo, m.tweaks),
    ),
  "offline-shelf": () =>
    import("@/registry/demos/offline-shelf.demo").then((m) =>
      mod(m.OfflineShelfDemo, m.tweaks),
    ),
  "first-event": () =>
    import("@/registry/demos/first-event.demo").then((m) =>
      mod(m.FirstEventDemo, m.tweaks),
    ),
  "theme-fitting": () =>
    import("@/registry/demos/theme-fitting.demo").then((m) =>
      mod(m.ThemeFittingDemo, m.tweaks),
    ),
  "ping-matrix": () =>
    import("@/registry/demos/ping-matrix.demo").then((m) =>
      mod(m.PingMatrixDemo, m.tweaks),
    ),
  "hazard-shelf": () =>
    import("@/registry/demos/hazard-shelf.demo").then((m) =>
      mod(m.HazardShelfDemo, m.tweaks),
    ),
  "chord-recorder": () =>
    import("@/registry/demos/chord-recorder.demo").then((m) =>
      mod(m.ChordRecorderDemo, m.tweaks),
    ),
  "format-sampler": () =>
    import("@/registry/demos/format-sampler.demo").then((m) =>
      mod(m.FormatSamplerDemo, m.tweaks),
    ),
  "token-locker": () =>
    import("@/registry/demos/token-locker.demo").then((m) =>
      mod(m.TokenLockerDemo, m.tweaks),
    ),
  "address-cascade": () =>
    import("@/registry/demos/address-cascade.demo").then((m) =>
      mod(m.AddressCascadeDemo, m.tweaks),
    ),
  "mend-list": () =>
    import("@/registry/demos/mend-list.demo").then((m) =>
      mod(m.MendListDemo, m.tweaks),
    ),
  "attendee-rows": () =>
    import("@/registry/demos/attendee-rows.demo").then((m) =>
      mod(m.AttendeeRowsDemo, m.tweaks),
    ),
  "thread-fields": () =>
    import("@/registry/demos/thread-fields.demo").then((m) =>
      mod(m.ThreadFieldsDemo, m.tweaks),
    ),
  "receipt-reader": () =>
    import("@/registry/demos/receipt-reader.demo").then((m) =>
      mod(m.ReceiptReaderDemo, m.tweaks),
    ),
  "draft-keeper": () =>
    import("@/registry/demos/draft-keeper.demo").then((m) =>
      mod(m.DraftKeeperDemo, m.tweaks),
    ),
  "twin-preview": () =>
    import("@/registry/demos/twin-preview.demo").then((m) =>
      mod(m.TwinPreviewDemo, m.tweaks),
    ),
  "margin-help": () =>
    import("@/registry/demos/margin-help.demo").then((m) =>
      mod(m.MarginHelpDemo, m.tweaks),
    ),
  "check-answers": () =>
    import("@/registry/demos/check-answers.demo").then((m) =>
      mod(m.CheckAnswersDemo, m.tweaks),
    ),
  "mixed-values": () =>
    import("@/registry/demos/mixed-values.demo").then((m) =>
      mod(m.MixedValuesDemo, m.tweaks),
    ),
  "parcel-spec": () =>
    import("@/registry/demos/parcel-spec.demo").then((m) =>
      mod(m.ParcelSpecDemo, m.tweaks),
    ),
  "site-assessment": () =>
    import("@/registry/demos/site-assessment.demo").then((m) =>
      mod(m.SiteAssessmentDemo, m.tweaks),
    ),
  "share-perimeter": () =>
    import("@/registry/demos/share-perimeter.demo").then((m) =>
      mod(m.SharePerimeterDemo, m.tweaks),
    ),
  "destination-picker": () =>
    import("@/registry/demos/destination-picker.demo").then((m) =>
      mod(m.DestinationPickerDemo, m.tweaks),
    ),
  "leave-guard": () =>
    import("@/registry/demos/leave-guard.demo").then((m) =>
      mod(m.LeaveGuardDemo, m.tweaks),
    ),
  "quick-capture": () =>
    import("@/registry/demos/quick-capture.demo").then((m) =>
      mod(m.QuickCaptureDemo, m.tweaks),
    ),
  "batch-runner": () =>
    import("@/registry/demos/batch-runner.demo").then((m) =>
      mod(m.BatchRunnerDemo, m.tweaks),
    ),
  "plate-picker": () =>
    import("@/registry/demos/plate-picker.demo").then((m) =>
      mod(m.PlatePickerDemo, m.tweaks),
    ),
  "export-recipe": () =>
    import("@/registry/demos/export-recipe.demo").then((m) =>
      mod(m.ExportRecipeDemo, m.tweaks),
    ),
  "sender-stacks": () =>
    import("@/registry/demos/sender-stacks.demo").then((m) =>
      mod(m.SenderStacksDemo, m.tweaks),
    ),
  "errand-toasts": () =>
    import("@/registry/demos/errand-toasts.demo").then((m) =>
      mod(m.ErrandToastsDemo, m.tweaks),
    ),
  "wayfinding-dots": () =>
    import("@/registry/demos/wayfinding-dots.demo").then((m) =>
      mod(m.WayfindingDotsDemo, m.tweaks),
    ),
  "moving-day": () =>
    import("@/registry/demos/moving-day.demo").then((m) =>
      mod(m.MovingDayDemo, m.tweaks),
    ),
  "practice-run": () =>
    import("@/registry/demos/practice-run.demo").then((m) =>
      mod(m.PracticeRunDemo, m.tweaks),
    ),
  "name-plate": () =>
    import("@/registry/demos/name-plate.demo").then((m) =>
      mod(m.NamePlateDemo, m.tweaks),
    ),
  "goal-weave": () =>
    import("@/registry/demos/goal-weave.demo").then((m) =>
      mod(m.GoalWeaveDemo, m.tweaks),
    ),
  "shortcut-drills": () =>
    import("@/registry/demos/shortcut-drills.demo").then((m) =>
      mod(m.ShortcutDrillsDemo, m.tweaks),
    ),
  "last-slot": () =>
    import("@/registry/demos/last-slot.demo").then((m) =>
      mod(m.LastSlotDemo, m.tweaks),
    ),
  "teaser-lens": () =>
    import("@/registry/demos/teaser-lens.demo").then((m) =>
      mod(m.TeaserLensDemo, m.tweaks),
    ),
  "trial-recap": () =>
    import("@/registry/demos/trial-recap.demo").then((m) =>
      mod(m.TrialRecapDemo, m.tweaks),
    ),
  "add-on-tray": () =>
    import("@/registry/demos/add-on-tray.demo").then((m) =>
      mod(m.AddOnTrayDemo, m.tweaks),
    ),
  "pause-instead": () =>
    import("@/registry/demos/pause-instead.demo").then((m) =>
      mod(m.PauseInsteadDemo, m.tweaks),
    ),
  "credit-refill": () =>
    import("@/registry/demos/credit-refill.demo").then((m) =>
      mod(m.CreditRefillDemo, m.tweaks),
    ),
  "upgrade-request": () =>
    import("@/registry/demos/upgrade-request.demo").then((m) =>
      mod(m.UpgradeRequestDemo, m.tweaks),
    ),
  "passkey-enrol": () =>
    import("@/registry/demos/passkey-enrol.demo").then((m) =>
      mod(m.PasskeyEnrolDemo, m.tweaks),
    ),
  "inbox-wait": () =>
    import("@/registry/demos/inbox-wait.demo").then((m) =>
      mod(m.InboxWaitDemo, m.tweaks),
    ),
  "workspace-lobby": () =>
    import("@/registry/demos/workspace-lobby.demo").then((m) =>
      mod(m.WorkspaceLobbyDemo, m.tweaks),
    ),
  "org-discovery": () =>
    import("@/registry/demos/org-discovery.demo").then((m) =>
      mod(m.OrgDiscoveryDemo, m.tweaks),
    ),
  "recovery-route": () =>
    import("@/registry/demos/recovery-route.demo").then((m) =>
      mod(m.RecoveryRouteDemo, m.tweaks),
    ),
  "spare-keys": () =>
    import("@/registry/demos/spare-keys.demo").then((m) =>
      mod(m.SpareKeysDemo, m.tweaks),
    ),
  "authenticator-pair": () =>
    import("@/registry/demos/authenticator-pair.demo").then((m) =>
      mod(m.AuthenticatorPairDemo, m.tweaks),
    ),
  "step-up-check": () =>
    import("@/registry/demos/step-up-check.demo").then((m) =>
      mod(m.StepUpCheckDemo, m.tweaks),
    ),
  "session-lapse": () =>
    import("@/registry/demos/session-lapse.demo").then((m) =>
      mod(m.SessionLapseDemo, m.tweaks),
    ),
  "invite-accept": () =>
    import("@/registry/demos/invite-accept.demo").then((m) =>
      mod(m.InviteAcceptDemo, m.tweaks),
    ),
  "cooling-lock": () =>
    import("@/registry/demos/cooling-lock.demo").then((m) =>
      mod(m.CoolingLockDemo, m.tweaks),
    ),
  "number-match": () =>
    import("@/registry/demos/number-match.demo").then((m) =>
      mod(m.NumberMatchDemo, m.tweaks),
    ),
};
