import type { KinetiqItem } from "./types";

/**
 * Whole page compositions, serials KP-001+. Each one assembles shipped
 * sections and primitives, and ships with a `target` so the CLI knows where
 * to write it.
 *
 * Auth pages are the exception to the compose-from-sections rule: they are
 * app surfaces built from primitives, because the wing has no auth sections
 * and inventing one to serve a single page would be the wrong shape.
 */
export const pages: KinetiqItem[] = [
  {
    name: "auth-sign-in",
    type: "registry:page",
    title: "Sign In Page",
    description:
      "Sign in with the two things most sign-in pages get wrong put right: the workspace route sits above the password rather than behind a second click, and the page says plainly what to do if you have no account instead of leaving the reader to guess whether sign-up exists.",
    files: [
      {
        path: "registry/pages/auth-sign-in/auth-sign-in.tsx",
        type: "registry:page",
        target: "app/(auth)/sign-in/page.tsx",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "trace-input", "pressure-button"],
    categories: ["auth"],
    meta: { serial: "KP-001" },
    tagline: "The workspace route above the password.",
    keywords: ["auth", "sign in", "login", "sso", "page"],
    props: [
      {
        name: "sso / onSso",
        type: "SsoProvider[] · (id) => void",
        description: "Workspace routes, offered before the password.",
      },
      {
        name: "onSubmit",
        type: "(email, password) => void",
        description:
          "Wire it to your own auth; the shell authenticates nothing.",
      },
      {
        name: "noAccountLine",
        type: "string",
        description: "What to do when sign-up is invite-only.",
      },
    ],
    usageNotes: [
      "A shell, not an auth system — never post credentials from a client component without a server action or API route behind it.",
      "Keep SSO above the fold. Hiding it costs every workspace user an extra click on every sign-in.",
      "Say what happens when there is no account; silence there reads as a broken form.",
    ],
  },
  {
    name: "auth-atlas",
    type: "registry:page",
    title: "Atlas Sign-Up Page",
    description:
      "Account creation beside a live activity map: the form says what the account creates before it creates it, and the atlas beside it \u2014 the library's point globe with a few pips and a count of crews online \u2014 says the quieter thing, that other people are already here. Validation is inline and plain, the strength line describes rather than scores, and a passkey path is offered as text instead of a wall of provider buttons.",
    files: [
      {
        path: "registry/pages/auth-atlas/auth-atlas.tsx",
        type: "registry:page",
        target: "app/(auth)/atlas/page.tsx",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "point-globe",
      "pressure-button",
      "readout",
      "status-pip",
      "trace-input",
    ],
    categories: ["auth"],
    meta: { serial: "KP-028" },
    tagline: "Other people are already here.",
    keywords: ["auth", "sign up", "register", "globe", "atlas", "page"],
    props: [
      {
        name: "pips / crews",
        type: "AtlasPip[] \u00b7 number",
        description:
          "The yards shown on the atlas and the online count it steps toward.",
      },
      {
        name: "onSubmit",
        type: "(values) => void",
        description:
          "Receives the name and email; the page never handles a password itself.",
      },
    ],
    usageNotes: [
      "A shell \u2014 wire onSubmit to your own auth and never handle credentials client-side.",
      "The globe is point-globe doing reassurance duty; it is decorative and hidden from assistive tech.",
      "Reduced motion keeps the globe's own fallback; the count still steps.",
    ],
  },
  {
    name: "auth-sign-up",
    type: "registry:page",
    title: "Sign Up Page",
    description:
      "Sign up that says what it is about to create before it creates it: the three things this account gets you, the one email that will arrive, and no trial countdown — because a page that hides the terms until after the password has already spent the goodwill it needed.",
    files: [
      {
        path: "registry/pages/auth-sign-up/auth-sign-up.tsx",
        type: "registry:page",
        target: "app/(auth)/sign-up/page.tsx",
      },
    ],
    dependencies: ["lucide-react"],
    registryDependencies: ["utils", "trace-input", "pressure-button"],
    categories: ["auth"],
    meta: { serial: "KP-002" },
    tagline: "State the bargain before the button.",
    keywords: ["auth", "sign up", "register", "onboarding", "page"],
    props: [
      {
        name: "creates",
        type: "string[]",
        description: "Exactly what this account does and does not create.",
      },
      {
        name: "nextLine",
        type: "string",
        description:
          "What lands in the inbox, said before the button is pressed.",
      },
    ],
    usageNotes: [
      "A shell — wire onSubmit to your own auth and never handle credentials client-side.",
      "The side panel is not decoration: it is where the bargain is stated, so it is read before the button rather than discovered after it.",
      "If there is a trial clock, say so here. Discovering one later is what makes people distrust everything else on the page.",
    ],
  },
  {
    name: "auth-recover",
    type: "registry:page",
    title: "Password Recovery Page",
    description:
      "Password recovery that refuses to leak. The response is identical whether or not the address has an account, and — unusually — the page says so out loud, because a reader who does not understand why they got a vague answer assumes the form is broken and tries again.",
    files: [
      {
        path: "registry/pages/auth-recover/auth-recover.tsx",
        type: "registry:page",
        target: "app/(auth)/recover/page.tsx",
      },
    ],
    dependencies: [],
    registryDependencies: [
      "utils",
      "trace-input",
      "status-seal",
      "pressure-button",
    ],
    categories: ["auth"],
    meta: { serial: "KP-003" },
    tagline: "Identical answer, and it says why.",
    keywords: ["auth", "password reset", "recovery", "forgot", "page"],
    props: [
      {
        name: "privacyNote",
        type: "string",
        description: "Why the response is the same either way.",
      },
      {
        name: "sentHeadline / sentCopy",
        type: "string",
        description:
          'The confirmed state — deliberately never "we found your account".',
      },
    ],
    usageNotes: [
      "Keep the identical response on the server too. A page careful in the UI and chatty in the API has leaked anyway.",
      "Explaining the vagueness is the point — an unexplained non-answer reads as a bug and gets retried.",
      "Never confirm or deny the address exists, including through timing or status codes.",
    ],
  },
  {
    name: "auth-second-factor",
    type: "registry:page",
    title: "Second Factor Page",
    description:
      "The second factor, with the lost-device path given the same weight as the code field. Almost every 2FA screen buries recovery in small grey text at the bottom, which is precisely where nobody looks while holding a dead phone.",
    files: [
      {
        path: "registry/pages/auth-second-factor/auth-second-factor.tsx",
        type: "registry:page",
        target: "app/(auth)/two-factor/page.tsx",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "trace-input", "pressure-button"],
    categories: ["auth"],
    meta: { serial: "KP-004" },
    tagline: "Recovery is not a footnote.",
    keywords: ["auth", "2fa", "two factor", "otp", "page"],
    props: [
      {
        name: "length",
        type: "number",
        description:
          "Digits in the code; drives the pattern and the shape check.",
      },
      {
        name: "recoveryLabel / recoveryCopy / recoveryHref",
        type: "string",
        description: "The lost-device path, at equal weight.",
      },
    ],
    usageNotes: [
      "The shape check is digits and length only. It is not verification and must never be treated as any.",
      'autoComplete="one-time-code" lets phones offer the code — dropping it costs real completions.',
      "Give recovery its own heading and box. Grey small print at the bottom of a 2FA page is unreachable by design.",
    ],
  },
  {
    name: "auth-workspace-pick",
    type: "registry:page",
    title: "Workspace Picker Page",
    description:
      'The workspace picker, which exists because "you are in more than one organisation" is a normal state most products treat as an edge case. Each row carries the role you hold there, and the account you are signed in as is stated at the top — because the commonest cause of an empty list is the wrong account.',
    files: [
      {
        path: "registry/pages/auth-workspace-pick/auth-workspace-pick.tsx",
        type: "registry:page",
        target: "app/(auth)/workspaces/page.tsx",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "status-pip"],
    categories: ["auth"],
    meta: { serial: "KP-005" },
    tagline: "Your role, before you click.",
    keywords: ["auth", "workspace", "organisation", "tenant", "page"],
    props: [
      {
        name: "workspaces",
        type: "Workspace[]",
        description:
          "Name, your role there, yard count, and whether it is live.",
      },
      {
        name: "signedInAs / missingLine",
        type: "string",
        description:
          "Which account this is, and the path when the expected workspace is absent.",
      },
    ],
    usageNotes: [
      "Print the role. Which workspace lets you do the thing you signed in for is the entire question this page answers.",
      "State the signed-in address prominently — the wrong account is the commonest cause of a missing workspace.",
      "Do not auto-forward on a single workspace without saying so; a page that vanishes is a page people cannot get back to.",
    ],
  },
  {
    name: "onboarding-first-run",
    type: "registry:page",
    title: "First Run Onboarding Page",
    description:
      "The first session, asked one question at a time, with a way out at the top. The escape hatch is the part that matters: onboarding that cannot be skipped is a wall, and the people most likely to hit it are the ones setting up their second yard who already know all the answers.",
    files: [
      {
        path: "registry/pages/onboarding-first-run/onboarding-first-run.tsx",
        type: "registry:page",
        target: "app/(onboarding)/welcome/page.tsx",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "stepform-one-question"],
    categories: ["onboarding"],
    meta: { serial: "KP-006" },
    tagline: "Always leave the door open.",
    keywords: ["onboarding", "first run", "setup", "welcome", "page"],
    props: [
      {
        name: "showPreview",
        type: "boolean",
        description: "Render the live-bound preview card beside the questions.",
      },
      {
        name: "skipLabel / skipHref",
        type: "string",
        description:
          "The escape hatch, kept at the top rather than the bottom.",
      },
      {
        name: "onDone",
        type: "(answers) => void",
        description: "Fired with everything gathered.",
      },
    ],
    usageNotes: [
      "Never remove the skip. Onboarding that cannot be skipped is a wall, and repeat users hit it hardest.",
      "The questions belong to stepform-one-question — pass it your own set rather than restyling this page.",
    ],
  },
  {
    name: "onboarding-import-or-start",
    type: "registry:page",
    title: "Import or Start Onboarding Page",
    description:
      "The fork at the start: bring something over, start clean, or look around first — each with its cost in minutes and what it needs from you. Products that force the import path lose everyone without their data to hand, and products that hide it lose everyone who has it.",
    files: [
      {
        path: "registry/pages/onboarding-import-or-start/onboarding-import-or-start.tsx",
        type: "registry:page",
        target: "app/(onboarding)/start/page.tsx",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: ["utils", "motion", "use-motion-safe", "status-seal"],
    categories: ["onboarding"],
    meta: { serial: "KP-007" },
    tagline: "Three ways in, none of them a door that locks.",
    keywords: ["onboarding", "import", "setup", "fork", "page"],
    props: [
      {
        name: "routes",
        type: "StartRoute[]",
        description:
          "Each path with its effort, prerequisites, and whether it is suggested.",
      },
      {
        name: "reversibleLine",
        type: "string",
        description: "The line that makes the choice safe to make quickly.",
      },
    ],
    usageNotes: [
      "Always offer a look-around route. Some people will not type anything until they have seen the thing work.",
      "State the minutes. A path without a cost is a path people avoid in case it is the long one.",
      "Suggest exactly one route — two suggestions is no suggestion.",
    ],
  },
  {
    name: "onboarding-invite-crew",
    type: "registry:page",
    title: "Invite Crew Onboarding Page",
    description:
      "Inviting the team, with each role's powers stated in full before anyone is added: what it can do, and — the half almost every invite screen omits — what it cannot. Permissions are the thing people get wrong at setup and discover months later.",
    files: [
      {
        path: "registry/pages/onboarding-invite-crew/onboarding-invite-crew.tsx",
        type: "registry:page",
        target: "app/(onboarding)/invite/page.tsx",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "trace-input",
      "readout",
      "status-seal",
      "pressure-button",
    ],
    categories: ["onboarding"],
    meta: { serial: "KP-008" },
    tagline: "State what a role cannot do.",
    keywords: ["onboarding", "invite", "team", "permissions", "roles", "page"],
    props: [
      {
        name: "roles",
        type: "InviteRole[]",
        description: "Each role with both its powers and its limits.",
      },
      {
        name: "onSend / whatTheyGetLine",
        type: "(invites) => void · string",
        description: "The send hook, and what the invitee actually receives.",
      },
    ],
    usageNotes: [
      "The `cannot` half is not optional — it is the only reason this screen beats a dropdown of role names.",
      "Duplicate addresses are refused with a reason rather than silently merged.",
      "Say what an invite creates and when it expires; an invite with unstated terms gets forwarded around.",
    ],
  },
  {
    name: "about-story",
    type: "registry:page",
    title: "About Story Page",
    description:
      "The about page as an argument rather than a brochure: why the product exists, who answers for it, the numbers behind the claim, and — unusually for an about page — the incidents. A company willing to put its failures on the same page as its origin story is making a claim its competitors mostly cannot copy.",
    files: [
      {
        path: "registry/pages/about-story/about-story.tsx",
        type: "registry:page",
        target: "app/(marketing)/about/page.tsx",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "content-margin-notes",
      "team-founders-note",
      "stats-impact-report",
      "trust-incident-log",
      "cta-postscript",
    ],
    categories: ["about"],
    meta: { serial: "KP-009" },
    tagline: "Failures on the same page as the origin story.",
    keywords: ["about", "company", "story", "page"],
    props: [
      {
        name: "className",
        type: "string",
        description:
          "The page composes shipped sections; pass content through each section's own props.",
      },
    ],
    usageNotes: [
      "Every section here is a shipped block. If this page needs markup a section could own, that is a missing section rather than page-local styling.",
      "The incident log is the unusual choice and the reason the page works — moving it to a separate status page loses the effect.",
      "Order matters: why, who, how much, what went wrong, what now.",
    ],
  },
  {
    name: "about-how-we-work",
    type: "registry:page",
    title: "How We Work Page",
    description:
      "The operating manual, published: the rules and what they cost, the words used carefully, where the team is and which hours that leaves uncovered, who does what during a rollout, and where the data sits. The page a careful buyer reads second — after they believe the product works and before they believe the company will still be here.",
    files: [
      {
        path: "registry/pages/about-how-we-work/about-how-we-work.tsx",
        type: "registry:page",
        target: "app/(marketing)/how-we-work/page.tsx",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "content-principles-list",
      "content-glossary",
      "team-where-we-are",
      "how-who-does-what",
      "trust-data-residency",
    ],
    categories: ["about"],
    meta: { serial: "KP-010" },
    tagline: "The operating manual, published.",
    keywords: ["about", "operations", "principles", "transparency", "page"],
    props: [
      {
        name: "className",
        type: "string",
        description:
          "Composes shipped sections; pass content through each section's props.",
      },
    ],
    usageNotes: [
      "Pair it with about-story rather than merging them — one argues why, this one argues how.",
      "Keep data residency last. It is the section people arrive looking for and the one they leave satisfied by.",
    ],
  },
  {
    name: "careers-index",
    type: "registry:page",
    title: "Careers Index Page",
    description:
      "Careers written to help the wrong people leave: the bench and its empty seats, where the team is and the hours nobody covers, the rules and what they cost, and a fit section naming who this is not for. A careers page optimised for volume produces a funnel full of people who resign in a year.",
    files: [
      {
        path: "registry/pages/careers-index/careers-index.tsx",
        type: "registry:page",
        target: "app/(marketing)/careers/page.tsx",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "team-open-bench",
      "team-where-we-are",
      "content-principles-list",
      "usecase-not-for-you",
      "cta-last-objection",
    ],
    categories: ["careers"],
    meta: { serial: "KP-011" },
    tagline: "Help the wrong people leave.",
    keywords: ["careers", "hiring", "jobs", "page"],
    props: [
      {
        name: "className",
        type: "string",
        description:
          "Composes shipped sections; pass content through each section's props.",
      },
    ],
    usageNotes: [
      "The fit and objection sections ship with marketing copy — replace their content with hiring equivalents. The shapes are the point, and both take typed props.",
      "Publishing the uncovered hours is a feature here: candidates in those timezones deserve to know before applying.",
    ],
  },
  {
    name: "careers-role",
    type: "registry:page",
    title: "Careers Role Page",
    description:
      "A single role, written so the wrong applicant can rule themselves out in ninety seconds: the pay stated, the interview loop described, what the person will actually do in their first months, and a list of what is not being asked for. That last list is why this page gets fewer, better applications.",
    files: [
      {
        path: "registry/pages/careers-role/careers-role.tsx",
        type: "registry:page",
        target: "app/(marketing)/careers/[role]/page.tsx",
      },
    ],
    dependencies: ["motion", "lucide-react"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "how-plain-steps",
      "status-seal",
      "pressure-button",
    ],
    categories: ["careers"],
    meta: { serial: "KP-012" },
    tagline: "Ninety seconds to rule yourself out.",
    keywords: ["careers", "role", "job description", "hiring", "page"],
    props: [
      {
        name: "facts / doing / notAsking",
        type: "RoleFact[] · string[]",
        description:
          "The particulars, the first ninety days, and what is not required.",
      },
      {
        name: "payLine",
        type: "string",
        description:
          "The band, stated. A role page without one wastes both sides' time.",
      },
    ],
    usageNotes: [
      "Publish the band. Every conversation that starts without it is a conversation about the wrong thing.",
      "The not-asking list is the differentiator — it is what makes the rest of the page believable.",
      "The interview loop uses how-plain-steps, so the hiring process is described in the same shape as the product's.",
    ],
  },
  {
    name: "changelog-timeline",
    type: "registry:page",
    title: "Changelog Timeline Page",
    description:
      "The changelog as a running record, filterable by what kind of change you came looking for. Most changelogs bury fixes under features; this one lets a reader ask for fixes alone, which is what someone chasing a bug they reported actually wants — and it means the fixes have to be written well enough to stand on their own.",
    files: [
      {
        path: "registry/pages/changelog-timeline/changelog-timeline.tsx",
        type: "registry:page",
        target: "app/(marketing)/changelog/page.tsx",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "segmented-control",
      "status-seal",
    ],
    categories: ["changelog"],
    meta: { serial: "KP-013" },
    tagline: "Ask for the fixes alone.",
    keywords: ["changelog", "releases", "timeline", "page"],
    props: [
      {
        name: "releases",
        type: "Release[]",
        description: "Each release with its tagged lines.",
      },
    ],
    usageNotes: [
      "Releases with nothing matching the filter drop out entirely, so the page never shows an empty release card.",
      "Write fixes to stand alone — under a fixes-only filter there is no feature copy to carry them.",
      "Dates are pre-formatted strings; the page never touches a clock.",
    ],
  },
  {
    name: "changelog-release",
    type: "registry:page",
    title: "Single Release Page",
    description:
      "One release at length, with breaking changes given their own block at the top rather than a footnote at the bottom, and the fixes listed in full. Release notes that lead with features and bury the migration note are how integrations break quietly on a Tuesday.",
    files: [
      {
        path: "registry/pages/changelog-release/changelog-release.tsx",
        type: "registry:page",
        target: "app/(marketing)/changelog/[version]/page.tsx",
      },
    ],
    dependencies: ["lucide-react"],
    registryDependencies: ["utils", "status-seal"],
    categories: ["changelog"],
    meta: { serial: "KP-014" },
    tagline: "The migration note goes first.",
    keywords: ["changelog", "release notes", "breaking changes", "page"],
    props: [
      {
        name: "breaking",
        type: "BreakingChange[]",
        description:
          "What changed and what the reader must do — rendered at the top.",
      },
      {
        name: "notes / fixes",
        type: "ReleaseNote[] · string[]",
        description: "The long-form notes and the plain fix list.",
      },
    ],
    usageNotes: [
      "Breaking changes render before the narrative. A migration note at the foot of a release is one nobody read.",
      "Every breaking entry needs an action and a date, or it is an announcement rather than a warning.",
      "List the fixes even when they are embarrassing; that is what makes the feature notes believable.",
    ],
  },
  {
    name: "changelog-compare",
    type: "registry:page",
    title: "Version Compare Page",
    description:
      "What changed between two versions, laid flat: the subject, what it was, what it is, and whether you have to do anything. Anyone upgrading across several releases has to read every note in between and hold the diff in their head; this page holds it for them, and counts the breaking rows so the size of the job is visible before they start.",
    files: [
      {
        path: "registry/pages/changelog-compare/changelog-compare.tsx",
        type: "registry:page",
        target: "app/(marketing)/changelog/compare/page.tsx",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "readout", "status-seal"],
    categories: ["changelog"],
    meta: { serial: "KP-015" },
    tagline: "See the size of the upgrade first.",
    keywords: ["changelog", "compare", "diff", "upgrade", "page"],
    props: [
      {
        name: "rows",
        type: "VersionRow[]",
        description: "Subject, before, after, and whether it needs action.",
      },
      {
        name: "versions / defaultFrom / defaultTo",
        type: "string[] · string",
        description: "The selectable versions and the opening pair.",
      },
    ],
    usageNotes: [
      "Picking a target at or behind the source is answered explicitly rather than silently showing an identical diff.",
      "The breaking count is derived from the rows — it cannot disagree with the table.",
      "Never remove a shape without a release that carries both; say so on the page.",
    ],
  },
  {
    name: "blog-index",
    type: "registry:page",
    title: "Blog Index Page",
    description:
      "The writing index, led by the post the company would rather not lead with. A blog that opens on a launch announcement tells the reader it exists to market; one that opens on a post-mortem tells them it exists to be read, and the second is the only reason anyone subscribes.",
    files: [
      {
        path: "registry/pages/blog-index/blog-index.tsx",
        type: "registry:page",
        target: "app/(marketing)/blog/page.tsx",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "newsletter-back-issues",
    ],
    categories: ["blog"],
    meta: { serial: "KP-016" },
    tagline: "Lead on the post-mortem.",
    keywords: ["blog", "writing", "index", "page"],
    props: [
      {
        name: "posts",
        type: "Post[]",
        description: "Mark exactly one as `lead`; it is set larger at the top.",
      },
    ],
    usageNotes: [
      "Lead on something that cost you something. An index that opens on a launch reads as a press page.",
      "The signup at the foot is newsletter-back-issues, so the archive is proof rather than a promise.",
      "Read times are part of the offer; publish them honestly.",
    ],
  },
  {
    name: "blog-post",
    type: "registry:page",
    title: "Blog Post Page",
    description:
      "A long-form post with the correction notice at the top rather than appended as a footnote nobody scrolls to. Everything else is deliberately plain — the reading measure, the pull quote on the balance instrument, and nothing that moves while someone is trying to read.",
    files: [
      {
        path: "registry/pages/blog-post/blog-post.tsx",
        type: "registry:page",
        target: "app/(marketing)/blog/[slug]/page.tsx",
      },
    ],
    dependencies: ["lucide-react"],
    registryDependencies: ["utils", "balance-quote", "status-seal"],
    categories: ["blog"],
    meta: { serial: "KP-017" },
    tagline: "Corrections where the error was read.",
    keywords: ["blog", "post", "article", "long form", "page"],
    props: [
      {
        name: "blocks",
        type: "PostBlock[]",
        description:
          "Paragraphs, headings, lists, and quotes in reading order.",
      },
      {
        name: "correction",
        type: "string",
        description: "Rendered at the top, not the foot.",
      },
    ],
    usageNotes: [
      "A correction at the foot is only seen by people who already finished — which is not who it is for.",
      "Pull quotes belong to balance-quote; never re-set one as styled text.",
      "Nothing animates during reading on purpose. The cascade belongs on index pages, not inside prose.",
    ],
  },
  {
    name: "blog-archive",
    type: "registry:page",
    title: "Blog Archive Page",
    description:
      "The whole archive, filterable by topic and grouped by year — the page for someone who has decided this is worth reading properly and wants the post they half-remember. Deliberately dense and deliberately still: an archive is a finding tool, and every animation between a reader and a list of titles is a tax on that.",
    files: [
      {
        path: "registry/pages/blog-archive/blog-archive.tsx",
        type: "registry:page",
        target: "app/(marketing)/blog/archive/page.tsx",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: [
      "utils",
      "motion",
      "use-motion-safe",
      "readout",
      "segmented-control",
    ],
    categories: ["blog"],
    meta: { serial: "KP-018" },
    tagline: "A finding tool, not a showcase.",
    keywords: ["blog", "archive", "index", "filter", "page"],
    props: [
      {
        name: "entries",
        type: "ArchiveEntry[]",
        description: "Every post with its year and topic.",
      },
    ],
    usageNotes: [
      "Topics and years are both derived from the entries, so filtering never strands an empty year heading.",
      "Rows only reflow on layout — an archive that animates its list fights the person scanning it.",
      "Keep everything. An archive with posts quietly removed is not an archive.",
    ],
  },
  {
    name: "error-not-found",
    type: "registry:page",
    title: "Not Found Page",
    description:
      "The 404, built on the library's own radar sweep, with somewhere to go underneath it. A 404 offering only a way home sends people to the top of a site they were already deep inside — the three most likely destinations are worth more than the front door.",
    files: [
      {
        path: "registry/pages/error-not-found/error-not-found.tsx",
        type: "registry:page",
        target: "app/not-found.tsx",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "not-found"],
    categories: ["errors"],
    meta: { serial: "KP-019" },
    tagline: "Three destinations beat one front door.",
    keywords: ["404", "not found", "error", "page"],
    props: [
      {
        name: "face",
        type: '"radar" | "shatter" | "elastic" | "echo" | "bands" | "spotlight"',
        description: "Threaded to the not-found block; radar is the default.",
      },
    ],
    usageNotes: [
      "The sweep belongs to the not-found block; this page contributes the destinations under it.",
      "Name real destinations. Generic links are the same dead end with more words.",
    ],
  },
  {
    name: "error-server-fault",
    type: "registry:page",
    title: "Server Fault Page",
    description:
      "The 500, written as a report rather than an apology: a reference code the reader can quote, a plain statement that we already know, and a link to the status page. A page that only says something went wrong tells the reader nothing they did not know and leaves them nothing to say when they write in.",
    files: [
      {
        path: "registry/pages/error-server-fault/error-server-fault.tsx",
        type: "registry:page",
        target: "app/(errors)/500/page.tsx",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "status-seal", "pressure-button"],
    categories: ["errors"],
    meta: { serial: "KP-020" },
    tagline: "Give them something to quote.",
    keywords: ["500", "error", "server", "page"],
    usageNotes: [
      "The reference is the point — without one, support conversations start with which page and roughly when.",
      "Say you already know. Most people write in only because they assume nobody noticed.",
      "Never claim data was lost or saved unless it is true; say only what you actually know.",
    ],
  },
  {
    name: "error-maintenance",
    type: "registry:page",
    title: "Maintenance Page",
    description:
      "The maintenance page, which differs from an outage page in the one way that matters: this was planned, so it can say when it ends and what still works. No countdown — a ticking clock turns a scheduled ninety minutes into an emergency in the reader's head.",
    files: [
      {
        path: "registry/pages/error-maintenance/error-maintenance.tsx",
        type: "registry:page",
        target: "app/(errors)/maintenance/page.tsx",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "status-pip"],
    categories: ["errors"],
    meta: { serial: "KP-021" },
    tagline: "Planned, so it can promise an end.",
    keywords: ["maintenance", "downtime", "planned", "page"],
    usageNotes: [
      "Deliberately no countdown. A clock ticking down reads as an emergency rather than a schedule.",
      "The still-working list is what decides whether anyone has to change their day.",
      "The window is a pre-formatted string in one stated zone; the page never reads a clock.",
    ],
  },
  {
    name: "error-offline",
    type: "registry:page",
    title: "Offline Page",
    description:
      "Offline, told from the yard's point of view: a shed with no signal is a normal Tuesday, not an error. So this page leads with what is still readable from the cache and what is being held to send later, rather than with an apology for physics.",
    files: [
      {
        path: "registry/pages/error-offline/error-offline.tsx",
        type: "registry:page",
        target: "app/(errors)/offline/page.tsx",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "status-pip", "pressure-button"],
    categories: ["errors"],
    meta: { serial: "KP-022" },
    tagline: "Lead with what they still have.",
    keywords: ["offline", "network", "cache", "page"],
    usageNotes: [
      "Lead with the cache, not the apology. Losing signal is normal where this product lives.",
      "Show the queue. People will not trust an offline write they cannot see.",
      "Cache timestamps are pre-formatted; the page never reads a clock.",
    ],
  },
  {
    name: "error-rate-limited",
    type: "registry:page",
    title: "Rate Limited Page",
    description:
      "The 429, written as a diagnosis: which limit was hit, how far over, when it resets, and — the part that actually helps — the three things that stop it happening again. A rate limit page that only says too many requests is a page the same caller will see again in sixty seconds.",
    files: [
      {
        path: "registry/pages/error-rate-limited/error-rate-limited.tsx",
        type: "registry:page",
        target: "app/(errors)/rate-limited/page.tsx",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "readout", "status-seal"],
    categories: ["errors"],
    meta: { serial: "KP-023" },
    tagline: "Stop them seeing it twice.",
    keywords: ["429", "rate limit", "api", "page"],
    usageNotes: [
      "The remedies are the page. Without them the same caller returns in a minute.",
      "State the exact limit and its scope — per token, per minute, which API.",
      "Say plainly that nothing is penalised; most people read a 429 as a ban.",
    ],
  },
  {
    name: "error-link-expired",
    type: "registry:page",
    title: "Expired Link Page",
    description:
      "An expired one-time link, which is a success rather than a failure and should read like one: the link did exactly what it was built to do. The page says which kind of link it was, why it expires, and offers a new one in a single press.",
    files: [
      {
        path: "registry/pages/error-link-expired/error-link-expired.tsx",
        type: "registry:page",
        target: "app/(errors)/link-expired/page.tsx",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "status-seal", "pressure-button"],
    categories: ["errors"],
    meta: { serial: "KP-024" },
    tagline: "The link did its job.",
    keywords: ["expired", "token", "magic link", "page"],
    usageNotes: [
      "Offer the replacement in one press. The reader is holding a dead link and wants another, not an explanation of tokens.",
      "Explain the expiry — it turns a frustration into a reassurance about their account.",
      "Name which kind of link it was, or the reader cannot tell what to ask for again.",
    ],
  },
  {
    name: "error-resource-deleted",
    type: "registry:page",
    title: "Deleted Resource Page",
    description:
      "Gone, but accounted for: what it was, who removed it, when, and whether it can still come back. A deleted resource that 404s silently makes people think the system lost it — naming the person and the moment turns a suspected bug into a decision someone made.",
    files: [
      {
        path: "registry/pages/error-resource-deleted/error-resource-deleted.tsx",
        type: "registry:page",
        target: "app/(errors)/deleted/page.tsx",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "status-seal", "pressure-button"],
    categories: ["errors"],
    meta: { serial: "KP-025" },
    tagline: "Not lost — removed, by someone, at a time.",
    keywords: ["deleted", "removed", "restore", "page"],
    usageNotes: [
      "Name who and when. Anonymous deletion reads as data loss and generates a support ticket.",
      "State the restore window explicitly, including what survives after it closes.",
      "Only offer restore when it will actually work; a dead button here is worse than none.",
    ],
  },
  {
    name: "error-browser-unsupported",
    type: "registry:page",
    title: "Unsupported Browser Page",
    description:
      "The unsupported-browser page, which names the missing capability rather than the browser. Gate screens that sniff user agents are wrong within a year and insult anyone on a browser they did not choose — a yard PC is usually locked by an IT policy the reader cannot change.",
    files: [
      {
        path: "registry/pages/error-browser-unsupported/error-browser-unsupported.tsx",
        type: "registry:page",
        target: "app/(errors)/unsupported/page.tsx",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "status-seal"],
    categories: ["errors"],
    meta: { serial: "KP-026" },
    tagline: "Name the capability, not the browser.",
    keywords: ["browser", "unsupported", "compatibility", "page"],
    usageNotes: [
      "Name the missing capability. User-agent sniffing is wrong within a year and blames the reader for an IT policy.",
      "Always offer a fallback that works anywhere — a printable view, a plain list, something.",
      "Version floors go beside each browser, or the list is not actionable.",
    ],
  },
  {
    name: "error-region-blocked",
    type: "registry:page",
    title: "Region Blocked Page",
    description:
      "Region-blocked, with the two things such pages almost always omit: what region the request appeared to come from, and what to do when that is wrong. Geolocation is routinely mistaken — a VPN, a satellite link, a ship — and a page with no correction path strands the people most likely to be misidentified.",
    files: [
      {
        path: "registry/pages/error-region-blocked/error-region-blocked.tsx",
        type: "registry:page",
        target: "app/(errors)/unavailable/page.tsx",
      },
    ],
    dependencies: [],
    registryDependencies: ["utils", "status-seal"],
    categories: ["errors"],
    meta: { serial: "KP-027" },
    tagline: "Show the detection, and how to correct it.",
    keywords: ["region", "geo", "blocked", "compliance", "page"],
    usageNotes: [
      "Show what was detected. Without it a false positive is unarguable.",
      "The correction path is the important half — geolocation is wrong often enough to strand real customers.",
      "State the reason as policy or law; unavailable in your region alone reads as arbitrary.",
    ],
  },
];
