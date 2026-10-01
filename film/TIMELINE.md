# Kinetiq — launch film · timeline

30 seconds · 1920×1080 · 30 fps · 112.5 BPM (one beat = 16 frames, one bar = 64).
Frame numbers below are the ones in the code (`f(n)` in `film/shots/*`).

## Thesis

Kinetiq's claim is not "beautiful components". It is that motion can be
**calibrated**: five measured springs — flick, snap, glide, drift, recoil —
shared by 1,129 instruments, so everything you ship moves with one physics.
The film is made of that system, literally:

- **Nothing in it is a screenshot.** Every product frame is the live library,
  operated by a real pointer, rendered frame by frame under a controlled clock.
- **It moves on Kinetiq's springs.** Every camera move, mask and type entrance
  is the closed-form solution of one of the five springs in
  `registry/lib/motion.ts`.
- **It sounds like Kinetiq.** Every click, tick, scratch and droplet is the
  component's own synthesized voice (`registry/lib/tactile-sound.ts`),
  captured into the soundtrack on the frame it played. The five springs'
  arrival times are the film's sonic signature.

Arc: *what is this?* (an abstract liquid) → *it's a switch* → *five springs, one
language* → *tune it, own it, feel it, your agent knows it* → *1,129 of them* →
*Motion, calibrated.*

## Shots

| # | Frames | Time | Purpose | Picture & camera | Copy | Interaction (real input) | In → out | Sound |
|---|---|---|---|---|---|---|---|---|
| 1 | 0–33 | 0:00.0–0:01.1 | Hook: stop the scroll | Extreme macro (×27→31, slow push) on a grey droplet. Almost still, then it reaches: the metaball neck stretches, the camera tracks on **drift** | — | Gel Switch pressed at f21 (tuned: viscosity .8, stretch .95, wobble .9) | Cold open → hard cut on the pinch | Air, a low D, a drawn breath; the droplet's own *blup* |
| 2 | 33–62 | 0:01.1–0:02.1 | Interruption | Locked-off macro (×44→47) on the landing: colour floods to cobalt, the drop jiggles | — | — | Hard cut → pull-back | Sub hit on the cut |
| 3 | 62–128 | 0:02.1–0:04.3 | First reveal | Pull-back on **drift** in log-zoom (×47→2.5), the knob tracked to rest: it is a settings switch on a Round-ups card | **It's a switch.** (+ `KQ-1097 · GEL/SWITCH`) | — | Line exits through its mask; the knob is kept | Air sweep out; tick |
| 4 | 128–192 | 0:04.3–0:06.4 | The idea | The frame clears around the knob; it glides onto a hairline track, four more unfold (**snap**, 50 ms cascade): a calibration sheet. f160 all five released — each dot runs its own spring; documented settle times light up as each settles | **Five springs.** · flick · snap · glide · drift · recoil (ζ, role) | — | Persistent shape (the knob) → tracks fold into cards | Detent, unfold ticks; **five arrival notes** (D maj add9, in arrival order) |
| 5 | 192–288 | 0:06.4–0:09.6 | Product proof | Each track folds into a specimen card (**glide**); its dot becomes the card's status light. Five live components fire on their spring: Checkbox (flick), Breaker Switch (snap), Gantry Tabs (glide), Lava Drift (drift), Telemetry Toast (recoil). f272 all five lights blink together | **One language.** | — | Hard cut | The pulse starts (kick, rim, hats); tick, clack, swish, pop; a chord on the unison |
| 6 | 288–400 | 0:09.6–0:13.3 | Feature 01 — tune | Macro on the real TweakPanel's Wobble bar, riding with the hand; pull-back to the stage; lean in (**drift**) for the landing | **Tune the feel.** | Drag Wobble 0.50→1.00 (f293–321); the code rewrites to `<GelSwitch wobble={1} />`; press the switch at f347 — it lands with all that wobble | Camera glides to the code | A detent per step; the switch's own sounds |
| 7 | 400–496 | 0:13.3–0:16.5 | Feature 02 — own | The code, copied; the code block opens (**glide**) into the whole frame as a terminal; one command; the shadcn CLI's output with every file | **Own the code.** | Copy pressed at f419 | Whip (**snap**): the terminal pushed out left | Copy tick, a key per character, enter, plips, a chime on the component file |
| 8 | 496–592 | 0:16.5–0:19.7 | Feature 03 — feel | Rotary Dial (×2.7→2.95) wound to the stop and released; cut on the beat to Vinyl Scrub (×3.15→3.35) scratched | **Components you can feel.** (holds across the cut) | Hole 7 wound 240° (f514–532), let go; the record scratched back/forth (f553–574) | Line exits → hard cut | The dial's ratchet as it winds back; the record's whir and scratch, pitched by the hand |
| 9 | 592–672 | 0:19.7–0:22.4 | Larger workflow | An agent asked for "a settings toggle that feels like liquid" searches the catalog through Kinetiq's MCP server (`search_components`, `get_install_command`), finds KQ-1097 and installs it | **Your agent already knows it.** | — | Hard cut on the bar | Half time; typing; a note when the serial is found |
| 10 | 672–768 | 0:22.4–0:25.6 | Acceleration | Eleven live specimens, cut on the eighths and quickening (10→4 frames), then a ferrofluid crown rising to the hand (16 frames). A frame that never moves: crop marks, the serial, LIVE, and the catalog's own Readout rolling 0000→1129 | (serials only) | The hand across each: koi scatter, glass lit, ink combed, focus racked, the ferro pool pulsed | Impact cut | Four on the floor, sixteenths, a riser and a doubling roll; a tick per cut |
| 11 | 768–832 | 0:25.6–0:27.7 | Payoff | Impact on the KQ-1097 card (×10.5); pull-back on **drift** to the whole catalog — 1,129 cards whose text recedes with distance until each is only its calibration light | **1,129 instruments.** | — | The wall goes out | Impact: sub, air, D maj9 left ringing |
| 12 | 832–900 | 0:27.7–0:30.0 | Close | One light left (**flick**); it travels to where the mark will stand, and the Kinetiq mark assembles around it — the stem on **snap**, the arm on **glide**, the leg on **recoil**; the wordmark rises; hold | **Kinetiq** · **Motion, calibrated.** · **kinetiqui.com** | — | Hold | The five-note signature again, softer; a low D |

## On-screen copy (28 words)

1. It's a switch.
2. Five springs.
3. One language.
4. Tune the feel.
5. Own the code.
6. Components you can feel.
7. Your agent already knows it.
8. 1,129 instruments.
9. Kinetiq — Motion, calibrated. — kinetiqui.com

Everything else on screen is the product's own text: serials, spring names,
the tweak panel, the code, the CLI's output, the components' labels.

## Motion system

- **Springs** (`film/core/spring.ts`): the library's five, evaluated in closed
  form. Pull-backs and reveals on *drift*; type on *snap*; folds, docks and
  camera travel on *glide*; the last light on *flick*.
- **Type** rises into its own mask and leaves through it (`MaskLine`). Nothing
  fades in.
- **Camera**: zoom is interpolated in log space so speed reads evenly at every
  scale; pull-backs track their subject across the frame instead of sweeping.
- **Contrast**: still openings (shot 1, the five-spring sheet before release),
  hard cuts on beats, then spring-driven moves.
- **Motion blur**: eight sub-frames per frame, six averaged (a 270° shutter).

## Sound

- UI voices: the components' own synthesis, captured live (`film/core/audio-capture.ts`).
- Cues placed by the edit use the same kit (`playTone`): the spring notes, typing, copy, the signature.
- Score (`film/sound/score.ts`): oscillators, seeded noise, filters and a
  generated room — no samples. Hook: air and a low D. 0:06.4 pulse (kick, rim,
  hats, bass, a D maj9 → B m9 → G maj7♯11 → A 6/9 pad). 0:19.2 half time. 0:22.4
  four on the floor, riser, roll. 0:25.6 impact. 0:27.7 drums out, signature.
- Master: loudness-normalised to −14 LUFS integrated, −1.5 dBTP, 48 kHz.
