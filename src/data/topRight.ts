/**
 * Where the game's top-right strip is — the one carrying kills, KDA, CS and the
 * clock.
 *
 * The readout we add continues that strip leftwards: same height, same gap
 * between components, so it reads as one more field of the game's own HUD
 * rather than as something sitting on top of it. That is the whole design
 * constraint, and it is why this is a MODEL and not a pair of coordinates —
 * getting the gap wrong by three pixels is what would make it look stuck on.
 *
 * ⚠️ The numbers below are estimated from a 1920x1080 capture, NOT measured at
 * both ends of the HUD slider the way the ability bar was. They are a starting
 * position expected to be nudged once, and the nudge is logged so an alignment
 * done by eye can be folded back in here as a real default.
 *
 * The strip is pinned to the TOP-RIGHT corner and grows with the HUD slider, so
 * every distance is expressed in strip HEIGHTS and measured from the right edge
 * of the screen.
 */
import type { HudNudge } from "./hud"

export type TopRightModel = {
  /** Strip height as a fraction of screen height, slider at 0 and at 1. */
  heightAt0: number
  heightAt1: number
  /**
   * Distance from the screen's right edge to the LEFT edge of the kill counter
   * ("0 vs 0"), in strip heights. Our readout's right edge goes there, less one
   * gap.
   */
  killsLeftInHeights: number
  /** The gap the game leaves between two components, in strip heights. */
  gapInHeights: number
  /** How far our own readout is, in strip heights — chevron plus four digits. */
  widthInHeights: number
  /** How far the extended background reaches left of the readout, fading out. */
  fadeInHeights: number
}

export const DEFAULT_TOP_RIGHT: TopRightModel = {
  heightAt0: 26 / 1080,
  heightAt1: 38 / 1080,
  killsLeftInHeights: 8.9,
  gapInHeights: 0.34,
  widthInHeights: 2.5,
  fadeInHeights: 4.5,
}

/** Strip height in pixels for a given slider position. Linear between the ends,
 *  exactly as the ability bar's box size is. */
export function stripHeight(
  scale: number,
  screenHeight: number,
  model: TopRightModel = DEFAULT_TOP_RIGHT
): number {
  const s = Math.min(1, Math.max(0, scale))
  return (model.heightAt0 + s * (model.heightAt1 - model.heightAt0)) * screenHeight
}

export type TopRightBox = {
  /** Left edge of the readout, in pixels from the left of the screen. */
  left: number
  top: number
  width: number
  height: number
  /** Where the fade starts, left of the readout — the extended background. */
  fadeLeft: number
  fadeWidth: number
}

/**
 * The rectangle our readout occupies, and the background that carries it.
 *
 * Everything hangs off the right edge, because that is what the strip is pinned
 * to: at any resolution the clock stays put and the row grows leftwards.
 */
export function topRightBox(
  screen: { width: number; height: number },
  hud: { scale: number; nudge?: HudNudge },
  model: TopRightModel = DEFAULT_TOP_RIGHT
): TopRightBox {
  const nudge = hud.nudge ?? { x: 0, y: 0, size: 0 }
  const height = stripHeight(hud.scale, screen.height, model) * (1 + nudge.size)

  const width = model.widthInHeights * height
  // The kill counter's left edge, then back off one gap so the spacing matches
  // the gaps the game leaves between its own fields.
  const killsLeft = screen.width - model.killsLeftInHeights * height
  const right = killsLeft - model.gapInHeights * height

  const left = right - width + nudge.x * screen.width
  const fadeWidth = model.fadeInHeights * height

  return {
    left,
    top: nudge.y * screen.height,
    width,
    height,
    fadeLeft: left - fadeWidth,
    fadeWidth: fadeWidth + width,
  }
}
