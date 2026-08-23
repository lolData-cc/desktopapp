/**
 * The dragon's own artwork, per element.
 *
 * Riot's own dragon PORTRAITS — the character icons, not the scoreboard glyphs.
 * The scoreboard set was the wrong art: its "infernal" is a flame symbol and its
 * generic is a flat head, which at 44px read as emoji rather than as a dragon.
 *
 * Bundled rather than fetched: an overlay that has to reach the network to draw
 * an image mid-match will eventually draw nothing.
 * Imported as modules so Vite emits them with correct RELATIVE paths — the
 * overlay window is loaded from file://, where an absolute "/img/..." resolves
 * to the root of the DISK and silently fails to load.
 */
import type { DragonElement } from "../data/objectives"

import generic from "../assets/dragons/generic.png"
import infernal from "../assets/dragons/fire.png"
import mountain from "../assets/dragons/earth.png"
import ocean from "../assets/dragons/water.png"
import cloud from "../assets/dragons/air.png"
import hextech from "../assets/dragons/hextech.png"
import chemtech from "../assets/dragons/chemtech.png"
import elder from "../assets/dragons/elder.png"

// The element SYMBOLS, a different asset for a different job: the portraits
// above are unreadable at tally size, and these flat glyphs are exactly what
// Riot draws them for.
import gFire from "../assets/dragons/glyph/fire.png"
import gEarth from "../assets/dragons/glyph/earth.png"
import gWater from "../assets/dragons/glyph/water.png"
import gAir from "../assets/dragons/glyph/air.png"
import gHextech from "../assets/dragons/glyph/hextech.png"
import gChemtech from "../assets/dragons/glyph/chemtech.png"

const GLYPH: Record<DragonElement, string> = {
  Fire: gFire,
  Earth: gEarth,
  Water: gWater,
  Air: gAir,
  Hextech: gHextech,
  Chemtech: gChemtech,
}

/** The small element symbol, for counting rather than for identifying. */
export const elementGlyph = (e: DragonElement): string => GLYPH[e]

/** "Infernal", "Ocean" — the element on its own, without "Drake". */
export const elementName = (e: DragonElement): string => LABEL[e].replace(" Drake", "")

/** Keyed by the element names the live API uses in DragonKill.DragonType. */
const BY_ELEMENT: Record<DragonElement, string> = {
  Fire: infernal,
  Earth: mountain,
  Water: ocean,
  Air: cloud,
  Hextech: hextech,
  Chemtech: chemtech,
}

const LABEL: Record<DragonElement, string> = {
  Fire: "Infernal Drake",
  Earth: "Mountain Drake",
  Water: "Ocean Drake",
  Air: "Cloud Drake",
  Hextech: "Hextech Drake",
  Chemtech: "Chemtech Drake",
}

/**
 * The plain dragon is the answer for the first two spawns, and it is the
 * correct one: their element is random and nothing exposes it, so a specific
 * icon would be a confident guess that is wrong most of the time.
 */
/** `kind` is the notice kind, which now includes non-dragon notices. Anything
 *  that is not an elder falls to the plain dragon rather than being refused —
 *  the caller that passes "item" never renders the result. */
export function dragonIcon(kind: string, element: DragonElement | null): string {
  if (kind === "elder") return elder
  return element ? BY_ELEMENT[element] : generic
}

/** "Infernal Drake" once known, plain "Drake" while it is not. */
export function dragonLabel(kind: string, element: DragonElement | null): string {
  if (kind === "elder") return "Elder Dragon"
  return element ? LABEL[element] : "Drake"
}

/** "Cloud Soul" — the game's own name for what the fourth drake grants. */
export function soulLabel(element: DragonElement | null): string {
  return element ? `${elementName(element)} Soul` : "Soul"
}
