import type { ComponentType } from "react";

import { AccessPanelDemo } from "@/registry/demos/access-panel.demo";
import { ActionRelayDemo } from "@/registry/demos/action-relay.demo";
import { BalanceCardDemo } from "@/registry/demos/balance-card.demo";
import { BeaconDemo } from "@/registry/demos/beacon.demo";
import { FieldReportDemo } from "@/registry/demos/field-report.demo";
import { BottomSheetDemo } from "@/registry/demos/bottom-sheet.demo";
import { ExchangePanelDemo } from "@/registry/demos/exchange-panel.demo";
import { BreakerSwitchDemo } from "@/registry/demos/breaker-switch.demo";
import { DrawerDemo } from "@/registry/demos/drawer.demo";
import { IrisMenuDemo } from "@/registry/demos/iris-menu.demo";
import { OverflowRailDemo } from "@/registry/demos/overflow-rail.demo";
import { PhaseSwitchDemo } from "@/registry/demos/phase-switch.demo";
import { CommandDeckDemo } from "@/registry/demos/command-deck.demo";
import { CaliperSliderDemo } from "@/registry/demos/caliper-slider.demo";
import { CalloutDemo } from "@/registry/demos/callout.demo";
import { CheckboxDemo } from "@/registry/demos/checkbox.demo";
import { CipherTextDemo } from "@/registry/demos/cipher-text.demo";
import { CodeCellsDemo } from "@/registry/demos/code-cells.demo";
import { CheckoutReceiptDemo } from "@/registry/demos/checkout-receipt.demo";
import { IntakeTrayDemo } from "@/registry/demos/intake-tray.demo";
import { ReadoutGridDemo } from "@/registry/demos/readout-grid.demo";
import { ConveyorListDemo } from "@/registry/demos/conveyor-list.demo";
import { MagnetDockDemo } from "@/registry/demos/magnet-dock.demo";
import { MediaConsoleDemo } from "@/registry/demos/media-console.demo";
import { SignalCenterDemo } from "@/registry/demos/signal-center.demo";
import { DrawerAccordionDemo } from "@/registry/demos/drawer-accordion.demo";
import { FlapboardDemo } from "@/registry/demos/flapboard.demo";
import { FluxCanvasDemo } from "@/registry/demos/flux-canvas.demo";
import { FocusTextDemo } from "@/registry/demos/focus-text.demo";
import { ForecastCardDemo } from "@/registry/demos/forecast-card.demo";
import { GantryTabsDemo } from "@/registry/demos/gantry-tabs.demo";
import { GyroCardDemo } from "@/registry/demos/gyro-card.demo";
import { ScopeScrubberDemo } from "@/registry/demos/scope-scrubber.demo";
import { SelectDemo } from "@/registry/demos/select.demo";
import { SlipstreamDemo } from "@/registry/demos/slipstream.demo";
import { StatusSealDemo } from "@/registry/demos/status-seal.demo";
import { MetronomeLoaderDemo } from "@/registry/demos/metronome-loader.demo";
import { MorphDialogDemo } from "@/registry/demos/morph-dialog.demo";
import { NotFoundDemo } from "@/registry/demos/not-found.demo";
import { TelemetryToastDemo } from "@/registry/demos/telemetry-toast.demo";
import { LaunchChecklistDemo } from "@/registry/demos/launch-checklist.demo";
import { LedgerDemo } from "@/registry/demos/ledger.demo";
import { PressureButtonDemo } from "@/registry/demos/pressure-button.demo";
import { RadioGroupDemo } from "@/registry/demos/radio-group.demo";
import { ReadoutDemo } from "@/registry/demos/readout.demo";
import { ScanRevealDemo } from "@/registry/demos/scan-reveal.demo";
import { TickerTapeDemo } from "@/registry/demos/ticker-tape.demo";
import { TraceInputDemo } from "@/registry/demos/trace-input.demo";
import { WavefieldDemo } from "@/registry/demos/wavefield.demo";
import { ZoetropeDemo } from "@/registry/demos/zoetrope.demo";
import { KineticGalleryDemo } from "@/registry/demos/kinetic-gallery.demo";
import { TileGridDemo } from "@/registry/demos/tile-grid.demo";
import { SegmentedControlDemo } from "@/registry/demos/segmented-control.demo";
import { TriageDeckDemo } from "@/registry/demos/triage-deck.demo";
import { SparkChartDemo } from "@/registry/demos/spark-chart.demo";
import { RadialBarsDemo } from "@/registry/demos/radial-bars.demo";
import { CoverflowDemo } from "@/registry/demos/coverflow.demo";
import { ParallaxSceneDemo } from "@/registry/demos/parallax-scene.demo";
import { TetherRopeDemo } from "@/registry/demos/tether-rope.demo";
import { PendulumWaveDemo } from "@/registry/demos/pendulum-wave.demo";
import { RubberSheetDemo } from "@/registry/demos/rubber-sheet.demo";
import { IronFilingsDemo } from "@/registry/demos/iron-filings.demo";
import { SwarmFieldDemo } from "@/registry/demos/swarm-field.demo";
import { MagneticCursorDemo } from "@/registry/demos/magnetic-cursor.demo";
import { AuroraRibbonDemo } from "@/registry/demos/aurora-ribbon.demo";
import { PointGlobeDemo } from "@/registry/demos/point-globe.demo";
import { VoronoiShatterDemo } from "@/registry/demos/voronoi-shatter.demo";
import { CometCursorDemo } from "@/registry/demos/comet-cursor.demo";
import { RippleSurfaceDemo } from "@/registry/demos/ripple-surface.demo";
import { FlowDiagramDemo } from "@/registry/demos/flow-diagram.demo";
import { TimelineSpineDemo } from "@/registry/demos/timeline-spine.demo";
import { PullToRefreshDemo } from "@/registry/demos/pull-to-refresh.demo";
import { OrbitMenuDemo } from "@/registry/demos/orbit-menu.demo";
import { SparkBurstDemo } from "@/registry/demos/spark-burst.demo";
import { HeartTapDemo } from "@/registry/demos/heart-tap.demo";
import { ReactionFlyDemo } from "@/registry/demos/reaction-fly.demo";
import { FacetCubeDemo } from "@/registry/demos/facet-cube.demo";
import { PrismFlipDemo } from "@/registry/demos/prism-flip.demo";
import { CoinToggleDemo } from "@/registry/demos/coin-toggle.demo";
import { DiceRollDemo } from "@/registry/demos/dice-roll.demo";
import { GimbalDialDemo } from "@/registry/demos/gimbal-dial.demo";
import { RolodexListDemo } from "@/registry/demos/rolodex-list.demo";
import { WheelPickerDemo } from "@/registry/demos/wheel-picker.demo";
import { FlipMosaicDemo } from "@/registry/demos/flip-mosaic.demo";
import { OrreryDemo } from "@/registry/demos/orrery.demo";
import { BalanceMobileDemo } from "@/registry/demos/balance-mobile.demo";
import { RingDialDemo } from "@/registry/demos/ring-dial.demo";
import { ZAccordionDemo } from "@/registry/demos/z-accordion.demo";
import { DepthMenuDemo } from "@/registry/demos/depth-menu.demo";
import { StageTabsDemo } from "@/registry/demos/stage-tabs.demo";
import { CardFanDemo } from "@/registry/demos/card-fan.demo";
import { HallwayMenuDemo } from "@/registry/demos/hallway-menu.demo";
import { DeckSwitcherDemo } from "@/registry/demos/deck-switcher.demo";
import { FlyoverMapDemo } from "@/registry/demos/flyover-map.demo";
import { GateStepperDemo } from "@/registry/demos/gate-stepper.demo";
import { HingeNavDemo } from "@/registry/demos/hinge-nav.demo";
import { DepthStackDemo } from "@/registry/demos/depth-stack.demo";
import { PeekPortalDemo } from "@/registry/demos/peek-portal.demo";
import { StrataScrollDemo } from "@/registry/demos/strata-scroll.demo";
import { HoverReliefDemo } from "@/registry/demos/hover-relief.demo";
import { FocusRackDemo } from "@/registry/demos/focus-rack.demo";
import { LayerPeelDemo } from "@/registry/demos/layer-peel.demo";
import { SliceCompareDemo } from "@/registry/demos/slice-compare.demo";
import { DepthLensDemo } from "@/registry/demos/depth-lens.demo";
import { AltitudeListDemo } from "@/registry/demos/altitude-list.demo";
import { HorizonRiseDemo } from "@/registry/demos/horizon-rise.demo";
import { GlassPaneDemo } from "@/registry/demos/glass-pane.demo";
import { FoilCardDemo } from "@/registry/demos/foil-card.demo";
import { SlatWallDemo } from "@/registry/demos/slat-wall.demo";
import { FoldOutDemo } from "@/registry/demos/fold-out.demo";
import { CurtainLiftDemo } from "@/registry/demos/curtain-lift.demo";
import { MirrorHallDemo } from "@/registry/demos/mirror-hall.demo";
import { HeightFieldDemo } from "@/registry/demos/height-field.demo";
import { FrostWipeDemo } from "@/registry/demos/frost-wipe.demo";
import { CrumpleSheetDemo } from "@/registry/demos/crumple-sheet.demo";
import { LenticularCardDemo } from "@/registry/demos/lenticular-card.demo";
import { VanishTypeDemo } from "@/registry/demos/vanish-type.demo";
import { ExtrudeTitleDemo } from "@/registry/demos/extrude-title.demo";
import { OrbitTagsDemo } from "@/registry/demos/orbit-tags.demo";
import { PathTypeDemo } from "@/registry/demos/path-type.demo";
import { BillboardRunDemo } from "@/registry/demos/billboard-run.demo";
import { TurnWordDemo } from "@/registry/demos/turn-word.demo";
import { ConvergeQuoteDemo } from "@/registry/demos/converge-quote.demo";

/**
 * slug → live preview component. Every catalog item registers its demo here;
 * the docs template renders it inside a SpecimenPlate.
 */
export const demos: Record<string, ComponentType> = {
  "pressure-button": PressureButtonDemo,
  "action-relay": ActionRelayDemo,
  "status-seal": StatusSealDemo,
  "trace-input": TraceInputDemo,
  "breaker-switch": BreakerSwitchDemo,
  checkbox: CheckboxDemo,
  "radio-group": RadioGroupDemo,
  "code-cells": CodeCellsDemo,
  "caliper-slider": CaliperSliderDemo,
  "gantry-tabs": GantryTabsDemo,
  select: SelectDemo,
  "scope-scrubber": ScopeScrubberDemo,
  "gyro-card": GyroCardDemo,
  "magnet-dock": MagnetDockDemo,
  "conveyor-list": ConveyorListDemo,
  "drawer-accordion": DrawerAccordionDemo,
  drawer: DrawerDemo,
  "bottom-sheet": BottomSheetDemo,
  "phase-switch": PhaseSwitchDemo,
  ledger: LedgerDemo,
  zoetrope: ZoetropeDemo,
  wavefield: WavefieldDemo,
  "flux-canvas": FluxCanvasDemo,
  callout: CalloutDemo,
  readout: ReadoutDemo,
  "focus-text": FocusTextDemo,
  slipstream: SlipstreamDemo,
  "cipher-text": CipherTextDemo,
  flapboard: FlapboardDemo,
  "metronome-loader": MetronomeLoaderDemo,
  "morph-dialog": MorphDialogDemo,
  "telemetry-toast": TelemetryToastDemo,
  "ticker-tape": TickerTapeDemo,
  "scan-reveal": ScanRevealDemo,
  "command-deck": CommandDeckDemo,
  "access-panel": AccessPanelDemo,
  "iris-menu": IrisMenuDemo,
  "overflow-rail": OverflowRailDemo,
  "signal-center": SignalCenterDemo,
  "media-console": MediaConsoleDemo,
  beacon: BeaconDemo,
  "field-report": FieldReportDemo,
  "not-found": NotFoundDemo,
  "forecast-card": ForecastCardDemo,
  "balance-card": BalanceCardDemo,
  "exchange-panel": ExchangePanelDemo,
  "checkout-receipt": CheckoutReceiptDemo,
  "intake-tray": IntakeTrayDemo,
  "readout-grid": ReadoutGridDemo,
  "launch-checklist": LaunchChecklistDemo,
  "kinetic-gallery": KineticGalleryDemo,
  "tile-grid": TileGridDemo,
  "segmented-control": SegmentedControlDemo,
  "triage-deck": TriageDeckDemo,
  "spark-chart": SparkChartDemo,
  "radial-bars": RadialBarsDemo,
  coverflow: CoverflowDemo,
  "parallax-scene": ParallaxSceneDemo,
  "tether-rope": TetherRopeDemo,
  "pendulum-wave": PendulumWaveDemo,
  "rubber-sheet": RubberSheetDemo,
  "iron-filings": IronFilingsDemo,
  "swarm-field": SwarmFieldDemo,
  "magnetic-cursor": MagneticCursorDemo,
  "aurora-ribbon": AuroraRibbonDemo,
  "point-globe": PointGlobeDemo,
  "voronoi-shatter": VoronoiShatterDemo,
  "comet-cursor": CometCursorDemo,
  "ripple-surface": RippleSurfaceDemo,
  "flow-diagram": FlowDiagramDemo,
  "timeline-spine": TimelineSpineDemo,
  "pull-to-refresh": PullToRefreshDemo,
  "orbit-menu": OrbitMenuDemo,
  "spark-burst": SparkBurstDemo,
  "heart-tap": HeartTapDemo,
  "reaction-fly": ReactionFlyDemo,
  "facet-cube": FacetCubeDemo,
  "prism-flip": PrismFlipDemo,
  "coin-toggle": CoinToggleDemo,
  "dice-roll": DiceRollDemo,
  "gimbal-dial": GimbalDialDemo,
  "rolodex-list": RolodexListDemo,
  "wheel-picker": WheelPickerDemo,
  "flip-mosaic": FlipMosaicDemo,
  orrery: OrreryDemo,
  "balance-mobile": BalanceMobileDemo,
  "ring-dial": RingDialDemo,
  "z-accordion": ZAccordionDemo,
  "depth-menu": DepthMenuDemo,
  "stage-tabs": StageTabsDemo,
  "card-fan": CardFanDemo,
  "hallway-menu": HallwayMenuDemo,
  "deck-switcher": DeckSwitcherDemo,
  "flyover-map": FlyoverMapDemo,
  "gate-stepper": GateStepperDemo,
  "hinge-nav": HingeNavDemo,
  "depth-stack": DepthStackDemo,
  "peek-portal": PeekPortalDemo,
  "strata-scroll": StrataScrollDemo,
  "hover-relief": HoverReliefDemo,
  "focus-rack": FocusRackDemo,
  "layer-peel": LayerPeelDemo,
  "slice-compare": SliceCompareDemo,
  "depth-lens": DepthLensDemo,
  "altitude-list": AltitudeListDemo,
  "horizon-rise": HorizonRiseDemo,
  "glass-pane": GlassPaneDemo,
  "foil-card": FoilCardDemo,
  "slat-wall": SlatWallDemo,
  "fold-out": FoldOutDemo,
  "curtain-lift": CurtainLiftDemo,
  "mirror-hall": MirrorHallDemo,
  "height-field": HeightFieldDemo,
  "frost-wipe": FrostWipeDemo,
  "crumple-sheet": CrumpleSheetDemo,
  "lenticular-card": LenticularCardDemo,
  "vanish-type": VanishTypeDemo,
  "extrude-title": ExtrudeTitleDemo,
  "orbit-tags": OrbitTagsDemo,
  "path-type": PathTypeDemo,
  "billboard-run": BillboardRunDemo,
  "turn-word": TurnWordDemo,
  "converge-quote": ConvergeQuoteDemo,
};
