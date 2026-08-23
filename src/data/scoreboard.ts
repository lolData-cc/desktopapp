/**
 * Where the Tab scoreboard's top edge is.
 *
 * Riot publishes nothing about this — same as the ability bar — so it is a
 * model with a nudge rather than a fixed coordinate. The scoreboard is centred
 * horizontally and hangs from near the top, so the bar sits above it by
 * anchoring to the TOP edge and the horizontal centre.
 *
 * ⚠️ The default below is a starting position, not a measurement. The ability
 * bar's numbers came from two captures at the extremes of the HUD slider; there
 * is no equivalent capture for the scoreboard yet, so this is placed by
 * reasoning and expected to be nudged once.
 *
 * There is also no way to know when Tab is HELD: no endpoint reports it, and
 * reading keystrokes from another process is not something this app will ever
 * do. So the bar is simply always there, small, at the top — where it reads as
 * part of the scoreboard when one is open and as a thin strip when one is not.
 */
export type ScoreboardAnchor = {
  /** Distance from the top of the screen to the bar, as a fraction of height. */
  top: number
  /** Bar width, as a fraction of screen width. */
  width: number
}

export const DEFAULT_ANCHOR: ScoreboardAnchor = {
  top: 0.075,
  width: 0.30,
}

/** In box widths of its own height, so a correction holds at any resolution. */
export type AnchorNudge = { x: number; y: number }
export const NO_ANCHOR_NUDGE: AnchorNudge = { x: 0, y: 0 }

export function goldBarBox(
  screen: { width: number; height: number },
  anchor: ScoreboardAnchor = DEFAULT_ANCHOR,
  nudge: AnchorNudge = NO_ANCHOR_NUDGE
): { left: number; top: number; width: number } {
  const width = anchor.width * screen.width
  return {
    width,
    // Centred, like the scoreboard it sits above.
    left: (screen.width - width) / 2 + nudge.x * screen.width,
    top: (anchor.top + nudge.y) * screen.height,
  }
}
