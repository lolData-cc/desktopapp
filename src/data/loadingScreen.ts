/**
 * Where the ten cards sit on the loading screen.
 *
 * ⚠️ Far simpler than the in-game HUD, and for a reason worth stating: the
 * loading screen does NOT respond to the HUD Scale slider. The ability outline
 * needed a two-parameter model measured at both ends of that slider; this is a
 * function of resolution alone, so one calibration serves every configuration.
 *
 * ⚠️ Measured from a single 1920x1080 capture, by eye. That is one source and
 * an imprecise one — the numbers below are a starting position with a nudge,
 * exactly as the scoreboard anchor is, not a survey. They are expressed as
 * fractions so they at least scale correctly while being wrong.
 *
 * Two rows of five, centred horizontally. Allies on top, enemies below — which
 * is the order the client's own session lists them in, and the assumption this
 * whole feature rests on. It is checked at runtime rather than trusted: see the
 * champion name drawn on each box.
 */
export type LoadingModel = {
  /** Card width, as a fraction of screen width. */
  width: number
  /** Left-edge to left-edge spacing, as a fraction of screen width. */
  pitch: number
  /** Card height, as a fraction of screen height. */
  height: number
  /** Top edge of the ally row, as a fraction of screen height. */
  topRow: number
  /** Top edge of the enemy row. */
  bottomRow: number
}

export const DEFAULT_LOADING: LoadingModel = {
  width: 270 / 1920,
  pitch: 296 / 1920,
  height: 468 / 1080,
  topRow: 60 / 1080,
  bottomRow: 583 / 1080,
}

export type CardBox = {
  left: number
  top: number
  width: number
  height: number
  /** 0-4 across the row. */
  index: number
  ally: boolean
}

export type LoadingNudge = { x: number; y: number; scale: number }
export const NO_LOADING_NUDGE: LoadingNudge = { x: 0, y: 0, scale: 0 }

/**
 * The boxes, in the client's own order: allies first, then enemies.
 *
 * ⚠️ Each row is centred on ITS OWN COUNT, not on five. The game centres the
 * row it actually draws, so a practice tool with one player puts that single
 * card in the middle of the screen — where a fixed five-slot layout would put
 * it far left and every label would land on empty background. Custom games and
 * bot lobbies with uneven teams have the same shape.
 *
 * Centred rather than measured from an edge, because the game centres it: an
 * anchor on the left would make the error grow with resolution instead of
 * staying put.
 */
export function loadingCards(
  screen: { width: number; height: number },
  counts: { allies: number; enemies: number } = { allies: 5, enemies: 5 },
  model: LoadingModel = DEFAULT_LOADING,
  nudge: LoadingNudge = NO_LOADING_NUDGE
): CardBox[] {
  const scale = 1 + nudge.scale
  const w = model.width * screen.width * scale
  const pitch = model.pitch * screen.width * scale
  const h = model.height * screen.height * scale

  const rows: { top: number; ally: boolean; count: number }[] = [
    {
      top: model.topRow * screen.height + nudge.y * screen.height,
      ally: true,
      count: Math.max(0, counts.allies),
    },
    {
      top: model.bottomRow * screen.height + nudge.y * screen.height,
      ally: false,
      count: Math.max(0, counts.enemies),
    },
  ]

  const out: CardBox[] = []
  for (const row of rows) {
    if (!row.count) continue
    const rowWidth = pitch * (row.count - 1) + w
    const left0 = (screen.width - rowWidth) / 2 + nudge.x * screen.width

    for (let i = 0; i < row.count; i++) {
      out.push({ left: left0 + i * pitch, top: row.top, width: w, height: h, index: i, ally: row.ally })
    }
  }
  return out
}
