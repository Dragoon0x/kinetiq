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
];
