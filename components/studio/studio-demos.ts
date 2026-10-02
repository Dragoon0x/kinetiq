import { mod, type TactileModule } from "@/components/tactile/demo-module";

/**
 * One dynamic import per piece, so /studio ships none of them up front: a
 * card loads its own demo when it comes near the viewport. This map is the
 * only thing the Studio gallery imports — never components/docs/demos.tsx,
 * which would pull every demo in the catalogue into the page.
 */
export const STUDIO_DEMOS: Record<string, () => Promise<TactileModule>> = {
  "follow-knot": () =>
    import("@/registry/demos/follow-knot.demo").then((m) =>
      mod(m.FollowKnotDemo, m.tweaks),
    ),
  "mute-cone": () =>
    import("@/registry/demos/mute-cone.demo").then((m) =>
      mod(m.MuteConeDemo, m.tweaks),
    ),
  "pin-press": () =>
    import("@/registry/demos/pin-press.demo").then((m) =>
      mod(m.PinPressDemo, m.tweaks),
    ),
  "privacy-blinds": () =>
    import("@/registry/demos/privacy-blinds.demo").then((m) =>
      mod(m.PrivacyBlindsDemo, m.tweaks),
    ),
  "renew-loop": () =>
    import("@/registry/demos/renew-loop.demo").then((m) =>
      mod(m.RenewLoopDemo, m.tweaks),
    ),
  "focus-moon": () =>
    import("@/registry/demos/focus-moon.demo").then((m) =>
      mod(m.FocusMoonDemo, m.tweaks),
    ),
  "repeat-coil": () =>
    import("@/registry/demos/repeat-coil.demo").then((m) =>
      mod(m.RepeatCoilDemo, m.tweaks),
    ),
  "latch-lock": () =>
    import("@/registry/demos/latch-lock.demo").then((m) =>
      mod(m.LatchLockDemo, m.tweaks),
    ),
  "eye-lid": () =>
    import("@/registry/demos/eye-lid.demo").then((m) =>
      mod(m.EyeLidDemo, m.tweaks),
    ),
  "wish-tag": () =>
    import("@/registry/demos/wish-tag.demo").then((m) =>
      mod(m.WishTagDemo, m.tweaks),
    ),
  "answer-panel": () =>
    import("@/registry/demos/answer-panel.demo").then((m) =>
      mod(m.AnswerPanelDemo, m.tweaks),
    ),
  "agent-run": () =>
    import("@/registry/demos/agent-run.demo").then((m) =>
      mod(m.AgentRunDemo, m.tweaks),
    ),
  "prompt-dock": () =>
    import("@/registry/demos/prompt-dock.demo").then((m) =>
      mod(m.PromptDockDemo, m.tweaks),
    ),
  "thread-view": () =>
    import("@/registry/demos/thread-view.demo").then((m) =>
      mod(m.ThreadViewDemo, m.tweaks),
    ),
  "usage-ledger": () =>
    import("@/registry/demos/usage-ledger.demo").then((m) =>
      mod(m.UsageLedgerDemo, m.tweaks),
    ),
  "side-by-side": () =>
    import("@/registry/demos/side-by-side.demo").then((m) =>
      mod(m.SideBySideDemo, m.tweaks),
    ),
  "artifact-pane": () =>
    import("@/registry/demos/artifact-pane.demo").then((m) =>
      mod(m.ArtifactPaneDemo, m.tweaks),
    ),
  "voice-mode": () =>
    import("@/registry/demos/voice-mode.demo").then((m) =>
      mod(m.VoiceModeDemo, m.tweaks),
    ),
  "source-search": () =>
    import("@/registry/demos/source-search.demo").then((m) =>
      mod(m.SourceSearchDemo, m.tweaks),
    ),
  "agent-inbox": () =>
    import("@/registry/demos/agent-inbox.demo").then((m) =>
      mod(m.AgentInboxDemo, m.tweaks),
    ),
  "launch-pad": () =>
    import("@/registry/demos/launch-pad.demo").then((m) =>
      mod(m.LaunchPadDemo, m.tweaks),
    ),
  "settle-button": () =>
    import("@/registry/demos/settle-button.demo").then((m) =>
      mod(m.SettleButtonDemo, m.tweaks),
    ),
  "download-tray": () =>
    import("@/registry/demos/download-tray.demo").then((m) =>
      mod(m.DownloadTrayDemo, m.tweaks),
    ),
  "bin-lid": () =>
    import("@/registry/demos/bin-lid.demo").then((m) =>
      mod(m.BinLidDemo, m.tweaks),
    ),
  "upload-orbit": () =>
    import("@/registry/demos/upload-orbit.demo").then((m) =>
      mod(m.UploadOrbitDemo, m.tweaks),
    ),
  "publish-press": () =>
    import("@/registry/demos/publish-press.demo").then((m) =>
      mod(m.PublishPressDemo, m.tweaks),
    ),
  "refresh-wind": () =>
    import("@/registry/demos/refresh-wind.demo").then((m) =>
      mod(m.RefreshWindDemo, m.tweaks),
    ),
  "gate-button": () =>
    import("@/registry/demos/gate-button.demo").then((m) =>
      mod(m.GateButtonDemo, m.tweaks),
    ),
  "rewind-undo": () =>
    import("@/registry/demos/rewind-undo.demo").then((m) =>
      mod(m.RewindUndoDemo, m.tweaks),
    ),
  "plug-in": () =>
    import("@/registry/demos/plug-in.demo").then((m) =>
      mod(m.PlugInDemo, m.tweaks),
    ),
  "app-shell": () =>
    import("@/registry/demos/app-shell.demo").then((m) =>
      mod(m.AppShellDemo, m.tweaks),
    ),
  "command-center": () =>
    import("@/registry/demos/command-center.demo").then((m) =>
      mod(m.CommandCenterDemo, m.tweaks),
    ),
  "swim-board": () =>
    import("@/registry/demos/swim-board.demo").then((m) =>
      mod(m.SwimBoardDemo, m.tweaks),
    ),
  "mail-inbox": () =>
    import("@/registry/demos/mail-inbox.demo").then((m) =>
      mod(m.MailInboxDemo, m.tweaks),
    ),
  "week-planner": () =>
    import("@/registry/demos/week-planner.demo").then((m) =>
      mod(m.WeekPlannerDemo, m.tweaks),
    ),
  "file-browser": () =>
    import("@/registry/demos/file-browser.demo").then((m) =>
      mod(m.FileBrowserDemo, m.tweaks),
    ),
  "review-thread": () =>
    import("@/registry/demos/review-thread.demo").then((m) =>
      mod(m.ReviewThreadDemo, m.tweaks),
    ),
  "notice-center": () =>
    import("@/registry/demos/notice-center.demo").then((m) =>
      mod(m.NoticeCenterDemo, m.tweaks),
    ),
  "block-editor": () =>
    import("@/registry/demos/block-editor.demo").then((m) =>
      mod(m.BlockEditorDemo, m.tweaks),
    ),
  "member-roster": () =>
    import("@/registry/demos/member-roster.demo").then((m) =>
      mod(m.MemberRosterDemo, m.tweaks),
    ),
  "data-grid": () =>
    import("@/registry/demos/data-grid.demo").then((m) =>
      mod(m.DataGridDemo, m.tweaks),
    ),
  "pulse-dashboard": () =>
    import("@/registry/demos/pulse-dashboard.demo").then((m) =>
      mod(m.PulseDashboardDemo, m.tweaks),
    ),
  "funnel-flow": () =>
    import("@/registry/demos/funnel-flow.demo").then((m) =>
      mod(m.FunnelFlowDemo, m.tweaks),
    ),
  "status-board": () =>
    import("@/registry/demos/status-board.demo").then((m) =>
      mod(m.StatusBoardDemo, m.tweaks),
    ),
  "filter-builder": () =>
    import("@/registry/demos/filter-builder.demo").then((m) =>
      mod(m.FilterBuilderDemo, m.tweaks),
    ),
  "cohort-grid": () =>
    import("@/registry/demos/cohort-grid.demo").then((m) =>
      mod(m.CohortGridDemo, m.tweaks),
    ),
  "activity-stream": () =>
    import("@/registry/demos/activity-stream.demo").then((m) =>
      mod(m.ActivityStreamDemo, m.tweaks),
    ),
  "region-map": () =>
    import("@/registry/demos/region-map.demo").then((m) =>
      mod(m.RegionMapDemo, m.tweaks),
    ),
  "tree-map": () =>
    import("@/registry/demos/tree-map.demo").then((m) =>
      mod(m.TreeMapDemo, m.tweaks),
    ),
  "chart-morph": () =>
    import("@/registry/demos/chart-morph.demo").then((m) =>
      mod(m.ChartMorphDemo, m.tweaks),
    ),
  "setup-checklist": () =>
    import("@/registry/demos/setup-checklist.demo").then((m) =>
      mod(m.SetupChecklistDemo, m.tweaks),
    ),
  "sign-in": () =>
    import("@/registry/demos/sign-in.demo").then((m) =>
      mod(m.SignInDemo, m.tweaks),
    ),
  "upgrade-wall": () =>
    import("@/registry/demos/upgrade-wall.demo").then((m) =>
      mod(m.UpgradeWallDemo, m.tweaks),
    ),
  "billing-panel": () =>
    import("@/registry/demos/billing-panel.demo").then((m) =>
      mod(m.BillingPanelDemo, m.tweaks),
    ),
  "settings-form": () =>
    import("@/registry/demos/settings-form.demo").then((m) =>
      mod(m.SettingsFormDemo, m.tweaks),
    ),
  "integration-hub": () =>
    import("@/registry/demos/integration-hub.demo").then((m) =>
      mod(m.IntegrationHubDemo, m.tweaks),
    ),
  "setup-wizard": () =>
    import("@/registry/demos/setup-wizard.demo").then((m) =>
      mod(m.SetupWizardDemo, m.tweaks),
    ),
  "feedback-widget": () =>
    import("@/registry/demos/feedback-widget.demo").then((m) =>
      mod(m.FeedbackWidgetDemo, m.tweaks),
    ),
  "help-panel": () =>
    import("@/registry/demos/help-panel.demo").then((m) =>
      mod(m.HelpPanelDemo, m.tweaks),
    ),
  "invite-flow": () =>
    import("@/registry/demos/invite-flow.demo").then((m) =>
      mod(m.InviteFlowDemo, m.tweaks),
    ),
  "profile-lift": () =>
    import("@/registry/demos/profile-lift.demo").then((m) =>
      mod(m.ProfileLiftDemo, m.tweaks),
    ),
  "pricing-plinth": () =>
    import("@/registry/demos/pricing-plinth.demo").then((m) =>
      mod(m.PricingPlinthDemo, m.tweaks),
    ),
  "place-card": () =>
    import("@/registry/demos/place-card.demo").then((m) =>
      mod(m.PlaceCardDemo, m.tweaks),
    ),
  "track-card": () =>
    import("@/registry/demos/track-card.demo").then((m) =>
      mod(m.TrackCardDemo, m.tweaks),
    ),
  "role-card": () =>
    import("@/registry/demos/role-card.demo").then((m) =>
      mod(m.RoleCardDemo, m.tweaks),
    ),
  "lesson-card": () =>
    import("@/registry/demos/lesson-card.demo").then((m) =>
      mod(m.LessonCardDemo, m.tweaks),
    ),
  "team-fan": () =>
    import("@/registry/demos/team-fan.demo").then((m) =>
      mod(m.TeamFanDemo, m.tweaks),
    ),
  "swatch-card": () =>
    import("@/registry/demos/swatch-card.demo").then((m) =>
      mod(m.SwatchCardDemo, m.tweaks),
    ),
  "review-card": () =>
    import("@/registry/demos/review-card.demo").then((m) =>
      mod(m.ReviewCardDemo, m.tweaks),
    ),
  "meeting-card": () =>
    import("@/registry/demos/meeting-card.demo").then((m) =>
      mod(m.MeetingCardDemo, m.tweaks),
    ),
  "pane-stack": () =>
    import("@/registry/demos/pane-stack.demo").then((m) =>
      mod(m.PaneStackDemo, m.tweaks),
    ),
  "float-panel": () =>
    import("@/registry/demos/float-panel.demo").then((m) =>
      mod(m.FloatPanelDemo, m.tweaks),
    ),
  "tab-strip": () =>
    import("@/registry/demos/tab-strip.demo").then((m) =>
      mod(m.TabStripDemo, m.tweaks),
    ),
  "bridge-menu": () =>
    import("@/registry/demos/bridge-menu.demo").then((m) =>
      mod(m.BridgeMenuDemo, m.tweaks),
    ),
  "list-detail": () =>
    import("@/registry/demos/list-detail.demo").then((m) =>
      mod(m.ListDetailDemo, m.tweaks),
    ),
  "push-sheet": () =>
    import("@/registry/demos/push-sheet.demo").then((m) =>
      mod(m.PushSheetDemo, m.tweaks),
    ),
  "search-expand": () =>
    import("@/registry/demos/search-expand.demo").then((m) =>
      mod(m.SearchExpandDemo, m.tweaks),
    ),
  "zoom-timeline": () =>
    import("@/registry/demos/zoom-timeline.demo").then((m) =>
      mod(m.ZoomTimelineDemo, m.tweaks),
    ),
  "snap-board": () =>
    import("@/registry/demos/snap-board.demo").then((m) =>
      mod(m.SnapBoardDemo, m.tweaks),
    ),
  "collapse-header": () =>
    import("@/registry/demos/collapse-header.demo").then((m) =>
      mod(m.CollapseHeaderDemo, m.tweaks),
    ),
  "product-detail": () =>
    import("@/registry/demos/product-detail.demo").then((m) =>
      mod(m.ProductDetailDemo, m.tweaks),
    ),
  "cart-drawer": () =>
    import("@/registry/demos/cart-drawer.demo").then((m) =>
      mod(m.CartDrawerDemo, m.tweaks),
    ),
  "checkout-flow": () =>
    import("@/registry/demos/checkout-flow.demo").then((m) =>
      mod(m.CheckoutFlowDemo, m.tweaks),
    ),
  "order-tracker": () =>
    import("@/registry/demos/order-tracker.demo").then((m) =>
      mod(m.OrderTrackerDemo, m.tweaks),
    ),
  "product-grid": () =>
    import("@/registry/demos/product-grid.demo").then((m) =>
      mod(m.ProductGridDemo, m.tweaks),
    ),
  "bundle-builder": () =>
    import("@/registry/demos/bundle-builder.demo").then((m) =>
      mod(m.BundleBuilderDemo, m.tweaks),
    ),
  "return-flow": () =>
    import("@/registry/demos/return-flow.demo").then((m) =>
      mod(m.ReturnFlowDemo, m.tweaks),
    ),
  "subscription-manager": () =>
    import("@/registry/demos/subscription-manager.demo").then((m) =>
      mod(m.SubscriptionManagerDemo, m.tweaks),
    ),
  "ratings-summary": () =>
    import("@/registry/demos/ratings-summary.demo").then((m) =>
      mod(m.RatingsSummaryDemo, m.tweaks),
    ),
  "gift-builder": () =>
    import("@/registry/demos/gift-builder.demo").then((m) =>
      mod(m.GiftBuilderDemo, m.tweaks),
    ),
};
