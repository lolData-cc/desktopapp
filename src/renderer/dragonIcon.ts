/**
 * The dragon's own artwork, per element.
 *
 * Riot's scoreboard icons, bundled rather than fetched: an overlay that has to
 * reach the network to draw a 3KB image mid-match will eventually draw nothing.
 * Imported as modules so Vite emits them with correct RELATIVE paths — the
 * overlay window is loaded from file://, where an absolute "/img/..." resolves
 * to the root of the DISK and silently fails to load.
 */
import type { DragonElement } from "../data/objectives"

import generic from "../assets/dragons/dragon.png"
import infernal from "../assets/dragons/infernaldrake.png"
import mountain from "../assets/dragons/mountaindrake.png"
import ocean from "../assets/dragons/oceandrake.png"
import cloud from "../assets/dragons/clouddrake.png"
import hextech from "../assets/dragons/hextechdrake.png"
import chemtech from "../assets/dragons/chemtechdrake.png"
import elder from "../assets/dragons/elderdrake.png"

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
export function dragonIcon(kind: "dragon" | "elder", element: DragonElement | null): string {
  if (kind === "elder") return elder
  return element ? BY_ELEMENT[element] : generic
}

/** "Infernal Drake" once known, plain "Drake" while it is not. */
export function dragonLabel(kind: "dragon" | "elder", element: DragonElement | null): string {
  if (kind === "elder") return "Elder Dragon"
  return element ? LABEL[element] : "Drake"
}
