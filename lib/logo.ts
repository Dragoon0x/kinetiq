/**
 * The Kinetiq mark: a K cut from three pieces - the stem, the arm, and a leg
 * that sweeps off one long arc - parted by a single spring-like gap. Drawn on
 * a 68 by 57.75 grid; every surface that shows the mark (header, footer,
 * favicon, home-screen icon, share cards, the launch film) reads it from
 * here, so it can never drift between them.
 *
 * Kept ASCII-only: the OG card renderer imports it.
 */
export const LOGO_WIDTH = 68;
export const LOGO_HEIGHT = 57.75;
export const LOGO_VIEWBOX = `0 0 ${LOGO_WIDTH} ${LOGO_HEIGHT}`;

/** The three pieces, in the order they are drawn: stem, arm, leg. */
export const LOGO_PIECES = [
  // The stem: chamfered at the top left, its foot cut by the arc.
  "M8.2 0H21.25V25.84A55.4 55.4 0 0 0 0 30.94V8.2Z",
  // The arm: a parallelogram up and to the right, its foot on the same arc.
  "M43.5 0H67.35L45.68 30.52A55.4 55.4 0 0 0 25.16 25.83Z",
  // The leg: the stem's lower half and the sweep, one shape under the arc.
  "M0 57.75V36.51A50.4 50.4 0 0 1 67.91 57.75H45.84A27 27 0 0 0 21.25 39.52V57.75Z",
] as const;

/** The whole mark as one path. */
export const LOGO_PATH = LOGO_PIECES.join("");
