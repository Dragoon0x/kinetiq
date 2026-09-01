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
import { ShadowScriptDemo } from "@/registry/demos/shadow-script.demo";
import { PunchTypeDemo } from "@/registry/demos/punch-type.demo";
import { HelixIndexDemo } from "@/registry/demos/helix-index.demo";
import { SwingDoorDemo } from "@/registry/demos/swing-door.demo";
import { HatchBoardDemo } from "@/registry/demos/hatch-board.demo";
import { GearTrainDemo } from "@/registry/demos/gear-train.demo";
import { CommitLeverDemo } from "@/registry/demos/commit-lever.demo";
import { CrankReelDemo } from "@/registry/demos/crank-reel.demo";
import { PulleyLiftDemo } from "@/registry/demos/pulley-lift.demo";
import { ComboDialsDemo } from "@/registry/demos/combo-dials.demo";
import { ZipperSeamDemo } from "@/registry/demos/zipper-seam.demo";
import { TrapdoorDropDemo } from "@/registry/demos/trapdoor-drop.demo";
import { DrawbridgeDemo } from "@/registry/demos/drawbridge.demo";
import { PopBookDemo } from "@/registry/demos/pop-book.demo";
import { IsoBlocksDemo } from "@/registry/demos/iso-blocks.demo";
import { LiftTrayDemo } from "@/registry/demos/lift-tray.demo";
import { ShakerDomeDemo } from "@/registry/demos/shaker-dome.demo";
import { DaylightDialDemo } from "@/registry/demos/daylight-dial.demo";
import { CutoutTownDemo } from "@/registry/demos/cutout-town.demo";
import { TransitWindowDemo } from "@/registry/demos/transit-window.demo";
import { SpotlightStageDemo } from "@/registry/demos/spotlight-stage.demo";
import { PullShelfDemo } from "@/registry/demos/pull-shelf.demo";
import { TurnModelDemo } from "@/registry/demos/turn-model.demo";
import { DollyFrameDemo } from "@/registry/demos/dolly-frame.demo";
import { OrbitStageDemo } from "@/registry/demos/orbit-stage.demo";
import { TunnelDiveDemo } from "@/registry/demos/tunnel-dive.demo";
import { PanWindowDemo } from "@/registry/demos/pan-window.demo";
import { ZoomAtlasDemo } from "@/registry/demos/zoom-atlas.demo";
import { CraneScrollDemo } from "@/registry/demos/crane-scroll.demo";
import { LookRoomDemo } from "@/registry/demos/look-room.demo";
import { CameraRailDemo } from "@/registry/demos/camera-rail.demo";
import { PivotGridDemo } from "@/registry/demos/pivot-grid.demo";
import { ElevatorNavDemo } from "@/registry/demos/elevator-nav.demo";
import { TerrainReliefDemo } from "@/registry/demos/terrain-relief.demo";
import { ArcRoutesDemo } from "@/registry/demos/arc-routes.demo";
import { CompassNeedleDemo } from "@/registry/demos/compass-needle.demo";
import { SectionCutDemo } from "@/registry/demos/section-cut.demo";
import { BlueprintRiseDemo } from "@/registry/demos/blueprint-rise.demo";
import { ExplodeViewDemo } from "@/registry/demos/explode-view.demo";
import { RadarScopeDemo } from "@/registry/demos/radar-scope.demo";
import { MatrixRiseDemo } from "@/registry/demos/matrix-rise.demo";
import { LittlePlanetDemo } from "@/registry/demos/little-planet.demo";
import { FisheyeGridDemo } from "@/registry/demos/fisheye-grid.demo";
import { StarWarpDemo } from "@/registry/demos/star-warp.demo";
import { DepthFogDemo } from "@/registry/demos/depth-fog.demo";
import { EmberColumnDemo } from "@/registry/demos/ember-column.demo";
import { ConstellationMapDemo } from "@/registry/demos/constellation-map.demo";
import { RainPaneDemo } from "@/registry/demos/rain-pane.demo";
import { SunShaftDemo } from "@/registry/demos/sun-shaft.demo";
import { FireflyFieldDemo } from "@/registry/demos/firefly-field.demo";
import { VaporRingDemo } from "@/registry/demos/vapor-ring.demo";
import { GravityWellDemo } from "@/registry/demos/gravity-well.demo";
import { PaperFlightDemo } from "@/registry/demos/paper-flight.demo";
import { ChipCloudDemo } from "@/registry/demos/chip-cloud.demo";
import { RatingArcDemo } from "@/registry/demos/rating-arc.demo";
import { SwatchLockDemo } from "@/registry/demos/swatch-lock.demo";
import { SkeletonWeaveDemo } from "@/registry/demos/skeleton-weave.demo";
import { StageProgressDemo } from "@/registry/demos/stage-progress.demo";
import { AlertBarDemo } from "@/registry/demos/alert-bar.demo";
import { StatusPipDemo } from "@/registry/demos/status-pip.demo";
import { RetryPulseDemo } from "@/registry/demos/retry-pulse.demo";
import { TypeOnDemo } from "@/registry/demos/type-on.demo";
import { HighlightSweepDemo } from "@/registry/demos/highlight-sweep.demo";
import { GradientTitleDemo } from "@/registry/demos/gradient-title.demo";
import { RedactRevealDemo } from "@/registry/demos/redact-reveal.demo";
import { BalanceQuoteDemo } from "@/registry/demos/balance-quote.demo";
import { SplitPaneDemo } from "@/registry/demos/split-pane.demo";
import { MasonryFlowDemo } from "@/registry/demos/masonry-flow.demo";
import { ExpanderTreeDemo } from "@/registry/demos/expander-tree.demo";
import { StickyStackDemo } from "@/registry/demos/sticky-stack.demo";
import { CursorLensDemo } from "@/registry/demos/cursor-lens.demo";
import { ListboxRosterDemo } from "@/registry/demos/listbox-roster.demo";
import { TriToggleDemo } from "@/registry/demos/tri-toggle.demo";
import { CursorLabelDemo } from "@/registry/demos/cursor-label.demo";
import { TrailInkDemo } from "@/registry/demos/trail-ink.demo";
import { RevealStaggerDemo } from "@/registry/demos/reveal-stagger.demo";
import { MarqueeSwapDemo } from "@/registry/demos/marquee-swap.demo";
import { ProgressScrubDemo } from "@/registry/demos/progress-scrub.demo";
import { StickyRevealDemo } from "@/registry/demos/sticky-reveal.demo";
import { ConfettiPopDemo } from "@/registry/demos/confetti-pop.demo";
import { SoundToggleDemo } from "@/registry/demos/sound-toggle.demo";
import { StickerPeelDemo } from "@/registry/demos/sticker-peel.demo";
import { BoopMascotDemo } from "@/registry/demos/boop-mascot.demo";
import { BubblePopDemo } from "@/registry/demos/bubble-pop.demo";
import { PokePuddingDemo } from "@/registry/demos/poke-pudding.demo";
import { StampPadDemo } from "@/registry/demos/stamp-pad.demo";
import { CookieBiteDemo } from "@/registry/demos/cookie-bite.demo";
import { HatchlingDemo } from "@/registry/demos/hatchling.demo";
import { YoYoDropDemo } from "@/registry/demos/yo-yo-drop.demo";
import { SoapBubbleDemo } from "@/registry/demos/soap-bubble.demo";
import { ApplauseHoldDemo } from "@/registry/demos/applause-hold.demo";
import { TeaDunkDemo } from "@/registry/demos/tea-dunk.demo";
import { BalloonPumpDemo } from "@/registry/demos/balloon-pump.demo";
import { TopSpinDemo } from "@/registry/demos/top-spin.demo";
import { ClackBeadsDemo } from "@/registry/demos/clack-beads.demo";
import { PinwheelBreezeDemo } from "@/registry/demos/pinwheel-breeze.demo";
import { KiteTugDemo } from "@/registry/demos/kite-tug.demo";
import { PaperPlaneDemo } from "@/registry/demos/paper-plane.demo";
import { CrankTuneDemo } from "@/registry/demos/crank-tune.demo";
import { GumballRunDemo } from "@/registry/demos/gumball-run.demo";
import { ToastPopDemo } from "@/registry/demos/toast-pop.demo";
import { PullCordDemo } from "@/registry/demos/pull-cord.demo";
import { DominoRunDemo } from "@/registry/demos/domino-run.demo";
import { GooglyEyesDemo } from "@/registry/demos/googly-eyes.demo";
import { DucklingTrailDemo } from "@/registry/demos/duckling-trail.demo";
import { TailWagDemo } from "@/registry/demos/tail-wag.demo";
import { CritterChoirDemo } from "@/registry/demos/critter-choir.demo";
import { LittleDoorDemo } from "@/registry/demos/little-door.demo";
import { PinataTapDemo } from "@/registry/demos/pinata-tap.demo";
import { GiftUnwrapDemo } from "@/registry/demos/gift-unwrap.demo";
import { MedalSwingDemo } from "@/registry/demos/medal-swing.demo";
import { HighFiveDemo } from "@/registry/demos/high-five.demo";
import { LevelChimeDemo } from "@/registry/demos/level-chime.demo";
import { StreakFlameDemo } from "@/registry/demos/streak-flame.demo";
import { GlintTrophyDemo } from "@/registry/demos/glint-trophy.demo";
import { FortuneCrackDemo } from "@/registry/demos/fortune-crack.demo";
import { SparkJarDemo } from "@/registry/demos/spark-jar.demo";
import { GrowSproutDemo } from "@/registry/demos/grow-sprout.demo";
import { DodgeButtonDemo } from "@/registry/demos/dodge-button.demo";
import { OracleOrbDemo } from "@/registry/demos/oracle-orb.demo";
import { MoodGemDemo } from "@/registry/demos/mood-gem.demo";
import { DiscoFloorDemo } from "@/registry/demos/disco-floor.demo";
import { DrumPadsDemo } from "@/registry/demos/drum-pads.demo";
import { SnowShakeDemo } from "@/registry/demos/snow-shake.demo";
import { ZenRakeDemo } from "@/registry/demos/zen-rake.demo";
import { WindChimesDemo } from "@/registry/demos/wind-chimes.demo";
import { FerrisGlowDemo } from "@/registry/demos/ferris-glow.demo";
import { SkyBloomDemo } from "@/registry/demos/sky-bloom.demo";
import { MailFoldDemo } from "@/registry/demos/mail-fold.demo";
import { FridgePoetryDemo } from "@/registry/demos/fridge-poetry.demo";
import { JuggleLoopDemo } from "@/registry/demos/juggle-loop.demo";
import { RocketDrillDemo } from "@/registry/demos/rocket-drill.demo";
import { ClawDropDemo } from "@/registry/demos/claw-drop.demo";
import { QuestLogDemo } from "@/registry/demos/quest-log.demo";
import { SkillTreeDemo } from "@/registry/demos/skill-tree.demo";
import { RankInsigniaDemo } from "@/registry/demos/rank-insignia.demo";
import { ComboMeterDemo } from "@/registry/demos/combo-meter.demo";
import { DailyCheckDemo } from "@/registry/demos/daily-check.demo";
import { LootChestDemo } from "@/registry/demos/loot-chest.demo";
import { PrizeWheelDemo } from "@/registry/demos/prize-wheel.demo";
import { PackTearDemo } from "@/registry/demos/pack-tear.demo";
import { GachaCapsuleDemo } from "@/registry/demos/gacha-capsule.demo";
import { RewardTrackDemo } from "@/registry/demos/reward-track.demo";
import { LeaderboardClimbDemo } from "@/registry/demos/leaderboard-climb.demo";
import { VersusBarDemo } from "@/registry/demos/versus-bar.demo";
import { BracketRunDemo } from "@/registry/demos/bracket-run.demo";
import { ScoreTickDemo } from "@/registry/demos/score-tick.demo";
import { PodiumRiseDemo } from "@/registry/demos/podium-rise.demo";
import { TimingBarDemo } from "@/registry/demos/timing-bar.demo";
import { RhythmTapDemo } from "@/registry/demos/rhythm-tap.demo";
import { AccuracyRingDemo } from "@/registry/demos/accuracy-ring.demo";
import { PowerGaugeDemo } from "@/registry/demos/power-gauge.demo";
import { ReflexLightDemo } from "@/registry/demos/reflex-light.demo";
import { PopoverMenuDemo } from "@/registry/demos/popover-menu.demo";
import { ContextMenuDemo } from "@/registry/demos/context-menu.demo";
import { HoverCardDemo } from "@/registry/demos/hover-card.demo";
import { SpotlightTourDemo } from "@/registry/demos/spotlight-tour.demo";
import { GaugeClusterDemo } from "@/registry/demos/gauge-cluster.demo";
import { BarRaceDemo } from "@/registry/demos/bar-race.demo";
import { DonutBreakdownDemo } from "@/registry/demos/donut-breakdown.demo";
import { HeatCalendarDemo } from "@/registry/demos/heat-calendar.demo";
import { BreadcrumbTrailDemo } from "@/registry/demos/breadcrumb-trail.demo";
import { PaginationRailDemo } from "@/registry/demos/pagination-rail.demo";
import { StepperFlowDemo } from "@/registry/demos/stepper-flow.demo";
import { NewtonCradleDemo } from "@/registry/demos/newton-cradle.demo";
import { GooeyBlobDemo } from "@/registry/demos/gooey-blob.demo";
import { PlinkoDropDemo } from "@/registry/demos/plinko-drop.demo";
import { RangeDualDemo } from "@/registry/demos/range-dual.demo";
import { StepperNumberDemo } from "@/registry/demos/stepper-number.demo";
import { TagFieldDemo } from "@/registry/demos/tag-field.demo";
import { GradientDriftDemo } from "@/registry/demos/gradient-drift.demo";
import { ParticleNetworkDemo } from "@/registry/demos/particle-network.demo";
import { FlowFieldDemo } from "@/registry/demos/flow-field.demo";
import { CodeLatheDemo } from "@/registry/demos/code-lathe.demo";
import { PromptWellDemo } from "@/registry/demos/prompt-well.demo";
import { VolleyThreadDemo } from "@/registry/demos/volley-thread.demo";
import { HeroConsoleDriftDemo } from "@/registry/demos/hero-console-drift.demo";
import { HeroLaunchBeaconDemo } from "@/registry/demos/hero-launch-beacon.demo";
import { HeroSplitLedgerDemo } from "@/registry/demos/hero-split-ledger.demo";
import { FooterDriftMarkDemo } from "@/registry/demos/footer-drift-mark.demo";
import { FooterTerraceDemo } from "@/registry/demos/footer-terrace.demo";
import { NavDockPillDemo } from "@/registry/demos/nav-dock-pill.demo";
import { NavGlassRailDemo } from "@/registry/demos/nav-glass-rail.demo";
import { FeaturesBentoFieldDemo } from "@/registry/demos/features-bento-field.demo";
import { FeaturesLedgerRowsDemo } from "@/registry/demos/features-ledger-rows.demo";
import { FeaturesRelayTabsDemo } from "@/registry/demos/features-relay-tabs.demo";
import { PricingMeridianTiersDemo } from "@/registry/demos/pricing-meridian-tiers.demo";
import { PricingOpenLedgerDemo } from "@/registry/demos/pricing-open-ledger.demo";
import { PricingUsageDialDemo } from "@/registry/demos/pricing-usage-dial.demo";
import { LogoMarqueeHallDemo } from "@/registry/demos/logo-marquee-hall.demo";
import { StatsImpactReportDemo } from "@/registry/demos/stats-impact-report.demo";
import { StatsSignalBandDemo } from "@/registry/demos/stats-signal-band.demo";
import { CtaLaunchWindowDemo } from "@/registry/demos/cta-launch-window.demo";
import { CtaTerminalCloseDemo } from "@/registry/demos/cta-terminal-close.demo";
import { TestimonialDispatchWallDemo } from "@/registry/demos/testimonial-dispatch-wall.demo";
import { TestimonialStandingDeskDemo } from "@/registry/demos/testimonial-standing-desk.demo";
import { AnnounceLaunchRailDemo } from "@/registry/demos/announce-launch-rail.demo";
import { EmptyFirstLightDemo } from "@/registry/demos/empty-first-light.demo";
import { FaqCounterDeskDemo } from "@/registry/demos/faq-counter-desk.demo";
import { FaqSplitRegistryDemo } from "@/registry/demos/faq-split-registry.demo";
import { ContactRoutingDeskDemo } from "@/registry/demos/contact-routing-desk.demo";
import { NewsletterPressroomDemo } from "@/registry/demos/newsletter-pressroom.demo";
import { StepformGatehouseDemo } from "@/registry/demos/stepform-gatehouse.demo";
import { TeamBenchRosterDemo } from "@/registry/demos/team-bench-roster.demo";
import { ContentFieldPassageDemo } from "@/registry/demos/content-field-passage.demo";
import { HowStationLineDemo } from "@/registry/demos/how-station-line.demo";
import { ProofEvidenceBandDemo } from "@/registry/demos/proof-evidence-band.demo";
import { UsecaseShiftCardsDemo } from "@/registry/demos/usecase-shift-cards.demo";
import { ComparisonCapabilityBoardDemo } from "@/registry/demos/comparison-capability-board.demo";
import { DatatableOpsDeskDemo } from "@/registry/demos/datatable-ops-desk.demo";
import { GalleryPlateRailDemo } from "@/registry/demos/gallery-plate-rail.demo";
import { IntegrationsPatchBayDemo } from "@/registry/demos/integrations-patch-bay.demo";
import { TrustVaultBriefDemo } from "@/registry/demos/trust-vault-brief.demo";
import { FeaturesFlowAtlasDemo } from "@/registry/demos/features-flow-atlas.demo";
import { FeaturesProofStripDemo } from "@/registry/demos/features-proof-strip.demo";
import { HeroFirstLightDemo } from "@/registry/demos/hero-first-light.demo";
import { HeroSignalRidgeDemo } from "@/registry/demos/hero-signal-ridge.demo";
import { CtaLedgerCloseDemo } from "@/registry/demos/cta-ledger-close.demo";
import { CtaSplitDoorsDemo } from "@/registry/demos/cta-split-doors.demo";
import { PricingSingleLineDemo } from "@/registry/demos/pricing-single-line.demo";
import { PricingUpgradeGateDemo } from "@/registry/demos/pricing-upgrade-gate.demo";
import { AnnounceFirstLightStripDemo } from "@/registry/demos/announce-first-light-strip.demo";
import { StatsHeatYearDemo } from "@/registry/demos/stats-heat-year.demo";
import { StatsShareDialDemo } from "@/registry/demos/stats-share-dial.demo";
import { TestimonialFocusTurnDemo } from "@/registry/demos/testimonial-focus-turn.demo";
import { ContactDirectLinesDemo } from "@/registry/demos/contact-direct-lines.demo";
import { FooterQuietCloseDemo } from "@/registry/demos/footer-quiet-close.demo";
import { GalleryCoverShelfDemo } from "@/registry/demos/gallery-cover-shelf.demo";
import { NewsletterLedgerNoteDemo } from "@/registry/demos/newsletter-ledger-note.demo";
import { FaqRibbonTabsDemo } from "@/registry/demos/faq-ribbon-tabs.demo";
import { LogoProofGridDemo } from "@/registry/demos/logo-proof-grid.demo";
import { NavAtlasPanelDemo } from "@/registry/demos/nav-atlas-panel.demo";
import { NavSplitDeskDemo } from "@/registry/demos/nav-split-desk.demo";
import { FeaturesGaugeRowDemo } from "@/registry/demos/features-gauge-row.demo";
import { FeaturesSpecSheetDemo } from "@/registry/demos/features-spec-sheet.demo";
import { HeroAgentBenchDemo } from "@/registry/demos/hero-agent-bench.demo";
import { HeroQuietWordDemo } from "@/registry/demos/hero-quiet-word.demo";
import { CtaPostscriptDemo } from "@/registry/demos/cta-postscript.demo";
import { CtaSignatureLineDemo } from "@/registry/demos/cta-signature-line.demo";
import { FaqLastWordDemo } from "@/registry/demos/faq-last-word.demo";
import { PricingSeatCounterDemo } from "@/registry/demos/pricing-seat-counter.demo";
import { HowDayClockDemo } from "@/registry/demos/how-day-clock.demo";
import { HowExchangeScriptDemo } from "@/registry/demos/how-exchange-script.demo";
import { UsecaseScaleLadderDemo } from "@/registry/demos/usecase-scale-ladder.demo";
import { UsecaseTwoMorningsDemo } from "@/registry/demos/usecase-two-mornings.demo";
import { EmptyClearedDeskDemo } from "@/registry/demos/empty-cleared-desk.demo";
import { StepformOneQuestionDemo } from "@/registry/demos/stepform-one-question.demo";
import { TeamOpenBenchDemo } from "@/registry/demos/team-open-bench.demo";
import { TestimonialCaseColumnDemo } from "@/registry/demos/testimonial-case-column.demo";
import { ContentMarginNotesDemo } from "@/registry/demos/content-margin-notes.demo";
import { DatatableRunHistoryDemo } from "@/registry/demos/datatable-run-history.demo";
import { IntegrationsTwoWayDemo } from "@/registry/demos/integrations-two-way.demo";
import { ProofLiveFloorDemo } from "@/registry/demos/proof-live-floor.demo";
import { FeaturesPersonaSwitchDemo } from "@/registry/demos/features-persona-switch.demo";
import { FeaturesPinnedScrollDemo } from "@/registry/demos/features-pinned-scroll.demo";
import { FeaturesQuietGridDemo } from "@/registry/demos/features-quiet-grid.demo";
import { HeroCompareWipeDemo } from "@/registry/demos/hero-compare-wipe.demo";
import { HeroGalleryWallDemo } from "@/registry/demos/hero-gallery-wall.demo";
import { HeroPriceForwardDemo } from "@/registry/demos/hero-price-forward.demo";
import { CtaBookSlotDemo } from "@/registry/demos/cta-book-slot.demo";
import { CtaLastObjectionDemo } from "@/registry/demos/cta-last-objection.demo";
import { PricingCreditPacksDemo } from "@/registry/demos/pricing-credit-packs.demo";
import { PricingWhereItGoesDemo } from "@/registry/demos/pricing-where-it-goes.demo";
import { StatsRankRaceDemo } from "@/registry/demos/stats-rank-race.demo";
import { StatsRingSetDemo } from "@/registry/demos/stats-ring-set.demo";
import { HowPlainStepsDemo } from "@/registry/demos/how-plain-steps.demo";
import { HowWhoDoesWhatDemo } from "@/registry/demos/how-who-does-what.demo";
import { TrustDataResidencyDemo } from "@/registry/demos/trust-data-residency.demo";
import { TrustIncidentLogDemo } from "@/registry/demos/trust-incident-log.demo";
import { UsecaseJobStoriesDemo } from "@/registry/demos/usecase-job-stories.demo";
import { UsecaseNotForYouDemo } from "@/registry/demos/usecase-not-for-you.demo";
import { AnnounceScheduledWindowDemo } from "@/registry/demos/announce-scheduled-window.demo";
import { AnnounceShipNoteDemo } from "@/registry/demos/announce-ship-note.demo";
import { EmptyNeedsAccessDemo } from "@/registry/demos/empty-needs-access.demo";
import { EmptyNoMatchesDemo } from "@/registry/demos/empty-no-matches.demo";
import { LogoReceiptWallDemo } from "@/registry/demos/logo-receipt-wall.demo";
import { LogoSegmentShelfDemo } from "@/registry/demos/logo-segment-shelf.demo";
import { ContentGlossaryDemo } from "@/registry/demos/content-glossary.demo";
import { ContentPrinciplesListDemo } from "@/registry/demos/content-principles-list.demo";
import { StepformBranchingIntakeDemo } from "@/registry/demos/stepform-branching-intake.demo";
import { StepformResumeLaterDemo } from "@/registry/demos/stepform-resume-later.demo";
import { TeamFoundersNoteDemo } from "@/registry/demos/team-founders-note.demo";
import { TeamWhereWeAreDemo } from "@/registry/demos/team-where-we-are.demo";
import { DatatableGroupedRollupDemo } from "@/registry/demos/datatable-grouped-rollup.demo";
import { DatatableInlineEditDemo } from "@/registry/demos/datatable-inline-edit.demo";
import { IntegrationsBuildYourOwnDemo } from "@/registry/demos/integrations-build-your-own.demo";
import { IntegrationsConnectTimeDemo } from "@/registry/demos/integrations-connect-time.demo";
import { TestimonialTwoDatesDemo } from "@/registry/demos/testimonial-two-dates.demo";
import { ContactOpenHoursDemo } from "@/registry/demos/contact-open-hours.demo";
import { GalleryContactSheetDemo } from "@/registry/demos/gallery-contact-sheet.demo";
import { NewsletterBackIssuesDemo } from "@/registry/demos/newsletter-back-issues.demo";
import { ProofUnpromptedDemo } from "@/registry/demos/proof-unprompted.demo";
import { AuthRecoverDemo } from "@/registry/demos/auth-recover.demo";
import { AuthSecondFactorDemo } from "@/registry/demos/auth-second-factor.demo";
import { AuthSignInDemo } from "@/registry/demos/auth-sign-in.demo";
import { AuthSignUpDemo } from "@/registry/demos/auth-sign-up.demo";
import { AuthWorkspacePickDemo } from "@/registry/demos/auth-workspace-pick.demo";
import { AboutHowWeWorkDemo } from "@/registry/demos/about-how-we-work.demo";
import { AboutStoryDemo } from "@/registry/demos/about-story.demo";
import { CareersIndexDemo } from "@/registry/demos/careers-index.demo";
import { CareersRoleDemo } from "@/registry/demos/careers-role.demo";
import { OnboardingFirstRunDemo } from "@/registry/demos/onboarding-first-run.demo";
import { OnboardingImportOrStartDemo } from "@/registry/demos/onboarding-import-or-start.demo";
import { OnboardingInviteCrewDemo } from "@/registry/demos/onboarding-invite-crew.demo";
import { BlogArchiveDemo } from "@/registry/demos/blog-archive.demo";
import { BlogIndexDemo } from "@/registry/demos/blog-index.demo";
import { BlogPostDemo } from "@/registry/demos/blog-post.demo";
import { ChangelogCompareDemo } from "@/registry/demos/changelog-compare.demo";
import { ChangelogReleaseDemo } from "@/registry/demos/changelog-release.demo";
import { ChangelogTimelineDemo } from "@/registry/demos/changelog-timeline.demo";
import { ErrorBrowserUnsupportedDemo } from "@/registry/demos/error-browser-unsupported.demo";
import { ErrorLinkExpiredDemo } from "@/registry/demos/error-link-expired.demo";
import { ErrorMaintenanceDemo } from "@/registry/demos/error-maintenance.demo";
import { ErrorNotFoundDemo } from "@/registry/demos/error-not-found.demo";
import { ErrorOfflineDemo } from "@/registry/demos/error-offline.demo";
import { ErrorRateLimitedDemo } from "@/registry/demos/error-rate-limited.demo";
import { ErrorRegionBlockedDemo } from "@/registry/demos/error-region-blocked.demo";
import { ErrorResourceDeletedDemo } from "@/registry/demos/error-resource-deleted.demo";
import { ErrorServerFaultDemo } from "@/registry/demos/error-server-fault.demo";
import { TemplateAgentDemo } from "@/registry/demos/template-agent.demo";
import { TemplateFieldDemo } from "@/registry/demos/template-field.demo";
import { TemplateSignatureDemo } from "@/registry/demos/template-signature.demo";
import { TemplateCausewayDemo } from "@/registry/demos/template-causeway.demo";
import { TemplateInstrumentDemo } from "@/registry/demos/template-instrument.demo";
import { TemplateLaunchDemo } from "@/registry/demos/template-launch.demo";
import { TemplateLedgerDemo } from "@/registry/demos/template-ledger.demo";
import { TemplateStudioDemo } from "@/registry/demos/template-studio.demo";
import { CountersignDemo } from "@/registry/demos/countersign.demo";
import { SourceStreamDemo } from "@/registry/demos/source-stream.demo";
import { TrainOfThoughtDemo } from "@/registry/demos/train-of-thought.demo";
import { WorkLampDemo } from "@/registry/demos/work-lamp.demo";
import { CounselCardDemo } from "@/registry/demos/counsel-card.demo";
import { RunSheetDemo } from "@/registry/demos/run-sheet.demo";
import { SourceShelfDemo } from "@/registry/demos/source-shelf.demo";
import { ToolTraceDemo } from "@/registry/demos/tool-trace.demo";
import { ContactLedgerDemo } from "@/registry/demos/contact-ledger.demo";
import { RedlineTableDemo } from "@/registry/demos/redline-table.demo";
import { SieveTableDemo } from "@/registry/demos/sieve-table.demo";
import { BluePencilDemo } from "@/registry/demos/blue-pencil.demo";
import { InsightReelDemo } from "@/registry/demos/insight-reel.demo";
import { SwitchyardDemo } from "@/registry/demos/switchyard.demo";
import { TrimPanelDemo } from "@/registry/demos/trim-panel.demo";
import { AgentDeskDemo } from "@/registry/demos/agent-desk.demo";
import { CalendarWorkroomDemo } from "@/registry/demos/calendar-workroom.demo";
import { WorkroomShellDemo } from "@/registry/demos/workroom-shell.demo";
import { WorkroomDrawerDemo } from "@/registry/demos/workroom-drawer.demo";
import { WorkbenchRailDemo } from "@/registry/demos/workbench-rail.demo";
import { VignetteAppWindowDemo } from "@/registry/demos/vignette-app-window.demo";
import { VignetteExchangeDemo } from "@/registry/demos/vignette-exchange.demo";
import { VignetteHandsetDemo } from "@/registry/demos/vignette-handset.demo";
import { VignetteSearchLensDemo } from "@/registry/demos/vignette-search-lens.demo";
import { VignetteVoiceNoteDemo } from "@/registry/demos/vignette-voice-note.demo";
import { VignetteFileRunDemo } from "@/registry/demos/vignette-file-run.demo";
import { VignetteHubDemo } from "@/registry/demos/vignette-hub.demo";
import { VignetteStageRailDemo } from "@/registry/demos/vignette-stage-rail.demo";
import { VignetteIconReelDemo } from "@/registry/demos/vignette-icon-reel.demo";
import { VignetteArcGalleryDemo } from "@/registry/demos/vignette-arc-gallery.demo";
import { VignetteCopresenceDemo } from "@/registry/demos/vignette-copresence.demo";
import { VignetteDistillDemo } from "@/registry/demos/vignette-distill.demo";
import { VignetteIsoFloorDemo } from "@/registry/demos/vignette-iso-floor.demo";
import { VignetteIsoStackDemo } from "@/registry/demos/vignette-iso-stack.demo";
import { VignetteWaveMeterDemo } from "@/registry/demos/vignette-wave-meter.demo";
import { FolioTableDemo } from "@/registry/demos/folio-table.demo";
import { HoverSwapDemo } from "@/registry/demos/hover-swap.demo";
import { RelayTipDemo } from "@/registry/demos/relay-tip.demo";
import { FaqHelpDeskDemo } from "@/registry/demos/faq-help-desk.demo";
import { OfferLedgerDemo } from "@/registry/demos/offer-ledger.demo";
import { OfferTriptychDemo } from "@/registry/demos/offer-triptych.demo";
import { OfferWindowDemo } from "@/registry/demos/offer-window.demo";

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
  "shadow-script": ShadowScriptDemo,
  "punch-type": PunchTypeDemo,
  "helix-index": HelixIndexDemo,
  "swing-door": SwingDoorDemo,
  "hatch-board": HatchBoardDemo,
  "gear-train": GearTrainDemo,
  "commit-lever": CommitLeverDemo,
  "crank-reel": CrankReelDemo,
  "pulley-lift": PulleyLiftDemo,
  "combo-dials": ComboDialsDemo,
  "zipper-seam": ZipperSeamDemo,
  "trapdoor-drop": TrapdoorDropDemo,
  drawbridge: DrawbridgeDemo,
  "pop-book": PopBookDemo,
  "iso-blocks": IsoBlocksDemo,
  "lift-tray": LiftTrayDemo,
  "shaker-dome": ShakerDomeDemo,
  "daylight-dial": DaylightDialDemo,
  "cutout-town": CutoutTownDemo,
  "transit-window": TransitWindowDemo,
  "spotlight-stage": SpotlightStageDemo,
  "pull-shelf": PullShelfDemo,
  "turn-model": TurnModelDemo,
  "dolly-frame": DollyFrameDemo,
  "orbit-stage": OrbitStageDemo,
  "tunnel-dive": TunnelDiveDemo,
  "pan-window": PanWindowDemo,
  "zoom-atlas": ZoomAtlasDemo,
  "crane-scroll": CraneScrollDemo,
  "look-room": LookRoomDemo,
  "camera-rail": CameraRailDemo,
  "pivot-grid": PivotGridDemo,
  "elevator-nav": ElevatorNavDemo,
  "terrain-relief": TerrainReliefDemo,
  "arc-routes": ArcRoutesDemo,
  "compass-needle": CompassNeedleDemo,
  "section-cut": SectionCutDemo,
  "blueprint-rise": BlueprintRiseDemo,
  "explode-view": ExplodeViewDemo,
  "radar-scope": RadarScopeDemo,
  "matrix-rise": MatrixRiseDemo,
  "little-planet": LittlePlanetDemo,
  "fisheye-grid": FisheyeGridDemo,
  "star-warp": StarWarpDemo,
  "depth-fog": DepthFogDemo,
  "ember-column": EmberColumnDemo,
  "constellation-map": ConstellationMapDemo,
  "rain-pane": RainPaneDemo,
  "sun-shaft": SunShaftDemo,
  "firefly-field": FireflyFieldDemo,
  "vapor-ring": VaporRingDemo,
  "gravity-well": GravityWellDemo,
  "paper-flight": PaperFlightDemo,
  "chip-cloud": ChipCloudDemo,
  "rating-arc": RatingArcDemo,
  "swatch-lock": SwatchLockDemo,
  "skeleton-weave": SkeletonWeaveDemo,
  "stage-progress": StageProgressDemo,
  "alert-bar": AlertBarDemo,
  "status-pip": StatusPipDemo,
  "retry-pulse": RetryPulseDemo,
  "type-on": TypeOnDemo,
  "highlight-sweep": HighlightSweepDemo,
  "gradient-title": GradientTitleDemo,
  "redact-reveal": RedactRevealDemo,
  "balance-quote": BalanceQuoteDemo,
  "split-pane": SplitPaneDemo,
  "masonry-flow": MasonryFlowDemo,
  "expander-tree": ExpanderTreeDemo,
  "sticky-stack": StickyStackDemo,
  "cursor-lens": CursorLensDemo,
  "listbox-roster": ListboxRosterDemo,
  "tri-toggle": TriToggleDemo,
  "cursor-label": CursorLabelDemo,
  "trail-ink": TrailInkDemo,
  "reveal-stagger": RevealStaggerDemo,
  "marquee-swap": MarqueeSwapDemo,
  "progress-scrub": ProgressScrubDemo,
  "sticky-reveal": StickyRevealDemo,
  "confetti-pop": ConfettiPopDemo,
  "sound-toggle": SoundToggleDemo,
  "sticker-peel": StickerPeelDemo,
  "boop-mascot": BoopMascotDemo,
  "bubble-pop": BubblePopDemo,
  "poke-pudding": PokePuddingDemo,
  "stamp-pad": StampPadDemo,
  "cookie-bite": CookieBiteDemo,
  hatchling: HatchlingDemo,
  "yo-yo-drop": YoYoDropDemo,
  "soap-bubble": SoapBubbleDemo,
  "applause-hold": ApplauseHoldDemo,
  "tea-dunk": TeaDunkDemo,
  "balloon-pump": BalloonPumpDemo,
  "top-spin": TopSpinDemo,
  "clack-beads": ClackBeadsDemo,
  "pinwheel-breeze": PinwheelBreezeDemo,
  "kite-tug": KiteTugDemo,
  "paper-plane": PaperPlaneDemo,
  "crank-tune": CrankTuneDemo,
  "gumball-run": GumballRunDemo,
  "toast-pop": ToastPopDemo,
  "pull-cord": PullCordDemo,
  "domino-run": DominoRunDemo,
  "googly-eyes": GooglyEyesDemo,
  "duckling-trail": DucklingTrailDemo,
  "tail-wag": TailWagDemo,
  "critter-choir": CritterChoirDemo,
  "little-door": LittleDoorDemo,
  "pinata-tap": PinataTapDemo,
  "gift-unwrap": GiftUnwrapDemo,
  "medal-swing": MedalSwingDemo,
  "high-five": HighFiveDemo,
  "level-chime": LevelChimeDemo,
  "streak-flame": StreakFlameDemo,
  "glint-trophy": GlintTrophyDemo,
  "fortune-crack": FortuneCrackDemo,
  "spark-jar": SparkJarDemo,
  "grow-sprout": GrowSproutDemo,
  "dodge-button": DodgeButtonDemo,
  "oracle-orb": OracleOrbDemo,
  "mood-gem": MoodGemDemo,
  "disco-floor": DiscoFloorDemo,
  "drum-pads": DrumPadsDemo,
  "snow-shake": SnowShakeDemo,
  "zen-rake": ZenRakeDemo,
  "wind-chimes": WindChimesDemo,
  "ferris-glow": FerrisGlowDemo,
  "sky-bloom": SkyBloomDemo,
  "mail-fold": MailFoldDemo,
  "fridge-poetry": FridgePoetryDemo,
  "juggle-loop": JuggleLoopDemo,
  "rocket-drill": RocketDrillDemo,
  "claw-drop": ClawDropDemo,
  "quest-log": QuestLogDemo,
  "skill-tree": SkillTreeDemo,
  "rank-insignia": RankInsigniaDemo,
  "combo-meter": ComboMeterDemo,
  "daily-check": DailyCheckDemo,
  "loot-chest": LootChestDemo,
  "prize-wheel": PrizeWheelDemo,
  "pack-tear": PackTearDemo,
  "gacha-capsule": GachaCapsuleDemo,
  "reward-track": RewardTrackDemo,
  "leaderboard-climb": LeaderboardClimbDemo,
  "versus-bar": VersusBarDemo,
  "bracket-run": BracketRunDemo,
  "score-tick": ScoreTickDemo,
  "podium-rise": PodiumRiseDemo,
  "timing-bar": TimingBarDemo,
  "rhythm-tap": RhythmTapDemo,
  "accuracy-ring": AccuracyRingDemo,
  "power-gauge": PowerGaugeDemo,
  "reflex-light": ReflexLightDemo,
  "popover-menu": PopoverMenuDemo,
  "context-menu": ContextMenuDemo,
  "hover-card": HoverCardDemo,
  "spotlight-tour": SpotlightTourDemo,
  "gauge-cluster": GaugeClusterDemo,
  "bar-race": BarRaceDemo,
  "donut-breakdown": DonutBreakdownDemo,
  "heat-calendar": HeatCalendarDemo,
  "breadcrumb-trail": BreadcrumbTrailDemo,
  "pagination-rail": PaginationRailDemo,
  "stepper-flow": StepperFlowDemo,
  "newton-cradle": NewtonCradleDemo,
  "volley-thread": VolleyThreadDemo,
  "prompt-well": PromptWellDemo,
  "code-lathe": CodeLatheDemo,
  "hero-split-ledger": HeroSplitLedgerDemo,
  "hero-launch-beacon": HeroLaunchBeaconDemo,
  "hero-console-drift": HeroConsoleDriftDemo,
  "nav-glass-rail": NavGlassRailDemo,
  "nav-dock-pill": NavDockPillDemo,
  "footer-terrace": FooterTerraceDemo,
  "footer-drift-mark": FooterDriftMarkDemo,
  "features-bento-field": FeaturesBentoFieldDemo,
  "features-ledger-rows": FeaturesLedgerRowsDemo,
  "features-relay-tabs": FeaturesRelayTabsDemo,
  "pricing-meridian-tiers": PricingMeridianTiersDemo,
  "pricing-usage-dial": PricingUsageDialDemo,
  "pricing-open-ledger": PricingOpenLedgerDemo,
  "stats-signal-band": StatsSignalBandDemo,
  "stats-impact-report": StatsImpactReportDemo,
  "logo-marquee-hall": LogoMarqueeHallDemo,
  "testimonial-dispatch-wall": TestimonialDispatchWallDemo,
  "testimonial-standing-desk": TestimonialStandingDeskDemo,
  "cta-launch-window": CtaLaunchWindowDemo,
  "cta-terminal-close": CtaTerminalCloseDemo,
  "faq-split-registry": FaqSplitRegistryDemo,
  "faq-counter-desk": FaqCounterDeskDemo,
  "announce-launch-rail": AnnounceLaunchRailDemo,
  "empty-first-light": EmptyFirstLightDemo,
  "stepform-gatehouse": StepformGatehouseDemo,
  "newsletter-pressroom": NewsletterPressroomDemo,
  "contact-routing-desk": ContactRoutingDeskDemo,
  "team-bench-roster": TeamBenchRosterDemo,
  "usecase-shift-cards": UsecaseShiftCardsDemo,
  "how-station-line": HowStationLineDemo,
  "content-field-passage": ContentFieldPassageDemo,
  "proof-evidence-band": ProofEvidenceBandDemo,
  "integrations-patch-bay": IntegrationsPatchBayDemo,
  "datatable-ops-desk": DatatableOpsDeskDemo,
  "comparison-capability-board": ComparisonCapabilityBoardDemo,
  "trust-vault-brief": TrustVaultBriefDemo,
  "gallery-plate-rail": GalleryPlateRailDemo,
  "hero-signal-ridge": HeroSignalRidgeDemo,
  "hero-first-light": HeroFirstLightDemo,
  "features-proof-strip": FeaturesProofStripDemo,
  "features-flow-atlas": FeaturesFlowAtlasDemo,
  "pricing-single-line": PricingSingleLineDemo,
  "pricing-upgrade-gate": PricingUpgradeGateDemo,
  "cta-ledger-close": CtaLedgerCloseDemo,
  "cta-split-doors": CtaSplitDoorsDemo,
  "stats-share-dial": StatsShareDialDemo,
  "stats-heat-year": StatsHeatYearDemo,
  "testimonial-focus-turn": TestimonialFocusTurnDemo,
  "announce-first-light-strip": AnnounceFirstLightStripDemo,
  "footer-quiet-close": FooterQuietCloseDemo,
  "newsletter-ledger-note": NewsletterLedgerNoteDemo,
  "contact-direct-lines": ContactDirectLinesDemo,
  "gallery-cover-shelf": GalleryCoverShelfDemo,
  "nav-split-desk": NavSplitDeskDemo,
  "nav-atlas-panel": NavAtlasPanelDemo,
  "faq-ribbon-tabs": FaqRibbonTabsDemo,
  "logo-proof-grid": LogoProofGridDemo,
  "hero-quiet-word": HeroQuietWordDemo,
  "hero-agent-bench": HeroAgentBenchDemo,
  "features-spec-sheet": FeaturesSpecSheetDemo,
  "features-gauge-row": FeaturesGaugeRowDemo,
  "cta-signature-line": CtaSignatureLineDemo,
  "cta-postscript": CtaPostscriptDemo,
  "pricing-seat-counter": PricingSeatCounterDemo,
  "faq-last-word": FaqLastWordDemo,
  "usecase-two-mornings": UsecaseTwoMorningsDemo,
  "usecase-scale-ladder": UsecaseScaleLadderDemo,
  "how-day-clock": HowDayClockDemo,
  "how-exchange-script": HowExchangeScriptDemo,
  "empty-cleared-desk": EmptyClearedDeskDemo,
  "stepform-one-question": StepformOneQuestionDemo,
  "team-open-bench": TeamOpenBenchDemo,
  "testimonial-case-column": TestimonialCaseColumnDemo,
  "content-margin-notes": ContentMarginNotesDemo,
  "proof-live-floor": ProofLiveFloorDemo,
  "integrations-two-way": IntegrationsTwoWayDemo,
  "datatable-run-history": DatatableRunHistoryDemo,
  "hero-compare-wipe": HeroCompareWipeDemo,
  "hero-gallery-wall": HeroGalleryWallDemo,
  "hero-price-forward": HeroPriceForwardDemo,
  "features-pinned-scroll": FeaturesPinnedScrollDemo,
  "features-quiet-grid": FeaturesQuietGridDemo,
  "features-persona-switch": FeaturesPersonaSwitchDemo,
  "pricing-credit-packs": PricingCreditPacksDemo,
  "pricing-where-it-goes": PricingWhereItGoesDemo,
  "cta-book-slot": CtaBookSlotDemo,
  "cta-last-objection": CtaLastObjectionDemo,
  "stats-rank-race": StatsRankRaceDemo,
  "stats-ring-set": StatsRingSetDemo,
  "trust-incident-log": TrustIncidentLogDemo,
  "trust-data-residency": TrustDataResidencyDemo,
  "usecase-not-for-you": UsecaseNotForYouDemo,
  "usecase-job-stories": UsecaseJobStoriesDemo,
  "how-who-does-what": HowWhoDoesWhatDemo,
  "how-plain-steps": HowPlainStepsDemo,
  "logo-segment-shelf": LogoSegmentShelfDemo,
  "logo-receipt-wall": LogoReceiptWallDemo,
  "announce-ship-note": AnnounceShipNoteDemo,
  "announce-scheduled-window": AnnounceScheduledWindowDemo,
  "empty-no-matches": EmptyNoMatchesDemo,
  "empty-needs-access": EmptyNeedsAccessDemo,
  "stepform-branching-intake": StepformBranchingIntakeDemo,
  "stepform-resume-later": StepformResumeLaterDemo,
  "team-founders-note": TeamFoundersNoteDemo,
  "team-where-we-are": TeamWhereWeAreDemo,
  "content-principles-list": ContentPrinciplesListDemo,
  "content-glossary": ContentGlossaryDemo,
  "integrations-connect-time": IntegrationsConnectTimeDemo,
  "integrations-build-your-own": IntegrationsBuildYourOwnDemo,
  "datatable-grouped-rollup": DatatableGroupedRollupDemo,
  "datatable-inline-edit": DatatableInlineEditDemo,
  "testimonial-two-dates": TestimonialTwoDatesDemo,
  "proof-unprompted": ProofUnpromptedDemo,
  "newsletter-back-issues": NewsletterBackIssuesDemo,
  "contact-open-hours": ContactOpenHoursDemo,
  "gallery-contact-sheet": GalleryContactSheetDemo,

  // Agent wing (KQ-214+)
  "work-lamp": WorkLampDemo,
  "train-of-thought": TrainOfThoughtDemo,
  "source-stream": SourceStreamDemo,
  countersign: CountersignDemo,
  "tool-trace": ToolTraceDemo,
  "run-sheet": RunSheetDemo,
  "counsel-card": CounselCardDemo,
  "source-shelf": SourceShelfDemo,
  "redline-table": RedlineTableDemo,
  "sieve-table": SieveTableDemo,
  "contact-ledger": ContactLedgerDemo,
  switchyard: SwitchyardDemo,
  "insight-reel": InsightReelDemo,
  "trim-panel": TrimPanelDemo,
  "blue-pencil": BluePencilDemo,
  "workbench-rail": WorkbenchRailDemo,

  // Vignettes (KQ-230+)
  "vignette-app-window": VignetteAppWindowDemo,
  "vignette-handset": VignetteHandsetDemo,
  "vignette-exchange": VignetteExchangeDemo,
  "vignette-voice-note": VignetteVoiceNoteDemo,
  "vignette-search-lens": VignetteSearchLensDemo,
  "vignette-hub": VignetteHubDemo,
  "vignette-stage-rail": VignetteStageRailDemo,
  "vignette-icon-reel": VignetteIconReelDemo,
  "vignette-arc-gallery": VignetteArcGalleryDemo,
  "vignette-copresence": VignetteCopresenceDemo,
  "vignette-distill": VignetteDistillDemo,
  "vignette-file-run": VignetteFileRunDemo,
  "vignette-wave-meter": VignetteWaveMeterDemo,
  "vignette-iso-stack": VignetteIsoStackDemo,
  "vignette-iso-floor": VignetteIsoFloorDemo,
  "offer-window": OfferWindowDemo,
  "offer-ledger": OfferLedgerDemo,
  "offer-triptych": OfferTriptychDemo,
  "faq-help-desk": FaqHelpDeskDemo,
  "hover-swap": HoverSwapDemo,
  "relay-tip": RelayTipDemo,
  "folio-table": FolioTableDemo,
  "agent-desk": AgentDeskDemo,
  "workroom-drawer": WorkroomDrawerDemo,
  "workroom-shell": WorkroomShellDemo,
  "calendar-workroom": CalendarWorkroomDemo,

  // Pages (KP-###)
  "auth-sign-in": AuthSignInDemo,
  "auth-sign-up": AuthSignUpDemo,
  "auth-recover": AuthRecoverDemo,
  "auth-second-factor": AuthSecondFactorDemo,
  "auth-workspace-pick": AuthWorkspacePickDemo,
  "onboarding-first-run": OnboardingFirstRunDemo,
  "onboarding-import-or-start": OnboardingImportOrStartDemo,
  "onboarding-invite-crew": OnboardingInviteCrewDemo,
  "about-story": AboutStoryDemo,
  "about-how-we-work": AboutHowWeWorkDemo,
  "careers-index": CareersIndexDemo,
  "careers-role": CareersRoleDemo,
  "changelog-timeline": ChangelogTimelineDemo,
  "changelog-release": ChangelogReleaseDemo,
  "changelog-compare": ChangelogCompareDemo,
  "blog-index": BlogIndexDemo,
  "blog-post": BlogPostDemo,
  "blog-archive": BlogArchiveDemo,
  "error-not-found": ErrorNotFoundDemo,
  "error-server-fault": ErrorServerFaultDemo,
  "error-maintenance": ErrorMaintenanceDemo,
  "error-offline": ErrorOfflineDemo,
  "error-rate-limited": ErrorRateLimitedDemo,
  "error-link-expired": ErrorLinkExpiredDemo,
  "error-resource-deleted": ErrorResourceDeletedDemo,
  "error-browser-unsupported": ErrorBrowserUnsupportedDemo,
  "error-region-blocked": ErrorRegionBlockedDemo,

  // Templates (KT-###)
  "template-instrument": TemplateInstrumentDemo,
  "template-launch": TemplateLaunchDemo,
  "template-agent": TemplateAgentDemo,
  "template-studio": TemplateStudioDemo,
  "template-ledger": TemplateLedgerDemo,
  "template-field": TemplateFieldDemo,
  "template-signature": TemplateSignatureDemo,
  "template-causeway": TemplateCausewayDemo,
  "gooey-blob": GooeyBlobDemo,
  "plinko-drop": PlinkoDropDemo,
  "range-dual": RangeDualDemo,
  "stepper-number": StepperNumberDemo,
  "tag-field": TagFieldDemo,
  "gradient-drift": GradientDriftDemo,
  "particle-network": ParticleNetworkDemo,
  "flow-field": FlowFieldDemo,
};
