/**
 * What each side is carrying, in gold.
 *
 * Summed from inventories the scoreboard already shows, priced with static
 * DDragon data. The game gives no team total of its own, so this is arithmetic
 * over public information rather than a number pulled out of the client.
 *
 * ⚠️ It is NOT "gold earned". Sold items, spent consumables and the gold in a
 * player's pocket are all invisible to it, so the figure is what is currently
 * ON the team, not what the team has made. Calling it the latter would be
 * wrong in a way nobody could check.
 */
import { inventoryValue } from "./itemCost"
import type { PlayerSlot } from "../live/client"

export type TeamGold = {
  ours: number
  theirs: number
  /** How many players each side's figure is actually built from — a scoreboard
   *  read mid-load can be short, and a total from six players should not be
   *  presented as if it were from ten. */
  oursCounted: number
  theirsCounted: number
}

export async function teamGold(
  players: PlayerSlot[],
  myTeam: string | null
): Promise<TeamGold | null> {
  if (!players.length || !myTeam) return null

  const out: TeamGold = { ours: 0, theirs: 0, oursCounted: 0, theirsCounted: 0 }

  for (const p of players) {
    const value = await inventoryValue(p.items ?? [])
    if (p.team === myTeam) {
      out.ours += value
      out.oursCounted++
    } else {
      out.theirs += value
      out.theirsCounted++
    }
  }

  return out
}

/** "12.4k" — a four-figure number read at a glance during a fight is a number
 *  nobody reads. Under a thousand stays exact, because early game the
 *  difference between 300 and 900 is the whole story. */
export function shortGold(n: number): string {
  if (n < 1000) return String(Math.round(n))
  return `${(n / 1000).toFixed(1)}k`
}
