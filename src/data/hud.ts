/**
 * Where the ability bar is on screen, for ANY player's HUD scale.
 *
 * Riot publishes nothing about HUD geometry, so this is measured — but measured
 * as a MODEL rather than as a set of coordinates. Two full-screen 1920x1080
 * captures at the extremes of the in-game HUD SCALE slider (0 and 100):
 *
 *              scale 0    scale 100
 *   box edge     ~35px       ~53px
 *   pitch        ~44px       ~66px
 *   Q left,    -148px      -227px      (from the centre of the screen)
 *
 * Re-expressed in units of the box itself, the two columns collapse into one:
 *
 *   pitch / box      1.26        1.25
 *   Q offset / box  -4.23       -4.28
 *
 * That agreement is the whole finding. The bar scales RIGIDLY about the screen's
 * horizontal centre, so only the box size tracks the slider and every other
 * distance follows from it. One linear fit, and the layout is solved for
 * everyone instead of for one machine.
 *
 * Size is a fraction of screen HEIGHT (the HUD grows with vertical space) and
 * the vertical anchor is the SCREEN BOTTOM, which is what the HUD is pinned to.
 */
import type { HudSettings } from "../live/hudConfig"

export const ABILITIES = ["Q", "W", "E", "R"] as const
export type Ability = (typeof ABILITIES)[number]

export type HudModel = {
  /** Box edge as a fraction of screen height, with the slider at 0 and at 1. */
  sizeAt0: number
  sizeAt1: number
  /** Q's left edge as an offset from the screen centre, in box widths. */
  qOffsetInBoxes: number
  /** Left-edge to left-edge spacing between abilities, in box widths. */
  pitchInBoxes: number
  /** Gap under the boxes to the screen bottom, in box widths. */
  bottomInBoxes: number
}

export const DEFAULT_MODEL: HudModel = {
  sizeAt0: 35 / 1080, // 0.0324
  sizeAt1: 53 / 1080, // 0.0491
  qOffsetInBoxes: -4.25,
  pitchInBoxes: 1.25,
  bottomInBoxes: 1.4,
}

/**
 * A residual nudge, in box widths, on top of the model.
 *
 * Scale-relative rather than in pixels, so a correction made on one screen at
 * one HUD scale stays correct on every other. Zero means the model is trusted
 * as-is; this exists for the cases the model cannot see — a non-standard
 * aspect ratio, or a config file we failed to read.
 */
export type HudNudge = { x: number; y: number; size: number }
export const NO_NUDGE: HudNudge = { x: 0, y: 0, size: 0 }

/** Box edge in pixels for a given slider position. Linear between the two ends. */
export function boxSize(scale: number, height: number, model: HudModel = DEFAULT_MODEL): number {
  const s = Math.min(1, Math.max(0, scale))
  return (model.sizeAt0 + s * (model.sizeAt1 - model.sizeAt0)) * height
}

/** Pixel rectangle for one ability box. */
export function abilityBox(
  ability: Ability,
  screen: { width: number; height: number },
  hud: { scale: number; nudge?: HudNudge; model?: HudModel }
): { left: number; top: number; size: number } {
  const model = hud.model ?? DEFAULT_MODEL
  const nudge = hud.nudge ?? NO_NUDGE

  const size = boxSize(hud.scale, screen.height, model) * (1 + nudge.size)
  const index = ABILITIES.indexOf(ability)

  return {
    size,
    // Anchored to the centre horizontally and to the bottom vertically, which
    // is how the HUD itself is pinned — so this survives a resolution change.
    left: screen.width / 2 + (model.qOffsetInBoxes + model.pitchInBoxes * index + nudge.x) * size,
    top: screen.height - (model.bottomInBoxes + 1 + nudge.y) * size,
  }
}

/** The slider value to lay out with, defaulting when no config could be read. */
export function scaleFrom(settings: HudSettings | null): number {
  return settings ? settings.globalScale : 1
}
