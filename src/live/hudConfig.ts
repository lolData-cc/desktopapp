/**
 * Reading the player's HUD scale out of the game's own settings.
 *
 * League writes it to Config/game.cfg under [HUD] as GlobalScale, a value the
 * in-game slider controls. That single number is why a hardcoded overlay
 * position is wrong for most people: the ability bar grows and shrinks with it.
 *
 * Reading it turns per-user calibration from a requirement into a fallback —
 * we compute where the bar is for THEIR settings instead of asking them to drag
 * a box onto it.
 */
import { readFile } from "node:fs/promises"

const CONFIG_PATHS = [
  "C:/Riot Games/League of Legends/Config/game.cfg",
  "C:/Program Files/Riot Games/League of Legends/Config/game.cfg",
  "C:/Program Files (x86)/Riot Games/League of Legends/Config/game.cfg",
  "D:/Riot Games/League of Legends/Config/game.cfg",
]

export type HudSettings = {
  /** The [HUD] GlobalScale slider, typically 0..1. */
  globalScale: number
  /** Where it was read from, or null when we fell back to a default. */
  source: string | null
}

export const DEFAULT_HUD_SCALE = 1

/**
 * Null-safe: a missing config is not an error. Some installs live elsewhere,
 * and the file does not exist until the game has run once — in which case the
 * caller keeps its default and the calibration controls remain available.
 */
export async function readHudSettings(): Promise<HudSettings> {
  for (const path of CONFIG_PATHS) {
    let text: string
    try {
      text = await readFile(path, "utf8")
    } catch {
      continue
    }

    // The file is INI-shaped; GlobalScale also appears under other sections in
    // some versions, so anchor on the [HUD] block rather than the first match.
    const hud = text.split(/^\[/m).find((block) => block.startsWith("HUD]"))
    const scope = hud ?? text
    const match = scope.match(/^GlobalScale\s*=\s*([\d.]+)/m)
    if (!match?.[1]) continue

    const value = Number(match[1])
    if (!Number.isFinite(value) || value <= 0) continue
    return { globalScale: value, source: path }
  }

  return { globalScale: DEFAULT_HUD_SCALE, source: null }
}
