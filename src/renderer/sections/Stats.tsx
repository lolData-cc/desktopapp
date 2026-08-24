import { useEffect, useMemo, useState } from "react"
import { championById } from "../../data/champions"
import { CDN, type AppState, type Match } from "../types"

/**
 * Who you have actually been playing, from the games already in memory.
 *
 * Derived rather than fetched: the match history is here, so this costs no
 * request and works with no account. It is a small sample by nature — twenty
 * games — so it says the sample size beside every number rather than dressing
 * three games up as a win rate.
 *
 * Remakes are excluded entirely. A game that ended before it counted tells you
 * nothing about a champion.
 */
type Tally = {
  championId: number
  games: number
  wins: number
  kills: number
  deaths: number
  assists: number
  cs: number
  seconds: number
}

function tally(matches: Match[]): Tally[] {
  const by = new Map<number, Tally>()
  for (const m of matches) {
    if (m.remake) continue
    const t =
      by.get(m.championId) ??
      { championId: m.championId, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, cs: 0, seconds: 0 }
    t.games++
    if (m.win) t.wins++
    t.kills += m.kills
    t.deaths += m.deaths
    t.assists += m.assists
    t.cs += m.creepScore
    t.seconds += m.durationSeconds
    by.set(m.championId, t)
  }
  // Most played first, and by win rate within that — the ordering people expect.
  return [...by.values()].sort((a, b) => b.games - a.games || b.wins / b.games - a.wins / a.games)
}

export default function Stats({ s }: { s: AppState }) {
  const rows = useMemo(() => tally(s.matches ?? []), [s.matches])

  if (!s.matches) {
    return <Note>Reading your match history…</Note>
  }
  if (!rows.length) {
    return <Note>No completed games yet — remakes do not count towards this.</Note>
  }

  const games = rows.reduce((n, r) => n + r.games, 0)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline gap-3">
        <h2 className="font-chakrapetch text-[22px] font-bold leading-none">Stats</h2>
        <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.18em] text-flash/30">
          from your last {games} completed {games === 1 ? "game" : "games"}
        </p>
      </div>

      <div className="mt-4 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {rows.map((r, i) => (
          <Row key={r.championId} t={r} patch={s.patch} index={i} />
        ))}
      </div>

      <p className="mt-3 shrink-0 font-jetbrains text-[9px] leading-relaxed text-flash/25">
        A handful of games is not a win rate. For a real one, the site has every
        game we have ever seen.
      </p>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center px-8 text-center">
      <p className="max-w-[42ch] font-jetbrains text-[10px] uppercase leading-relaxed tracking-[0.18em] text-flash/25">
        {children}
      </p>
    </div>
  )
}

function Row({ t, patch, index }: { t: Tally; patch: string | null; index: number }) {
  const [name, setName] = useState<{ slug: string; name: string } | null>(null)
  const v = patch ?? "16.16.1"

  useEffect(() => {
    let alive = true
    void championById(t.championId)
      .then((c) => { if (alive && c) setName({ slug: c.slug, name: c.name }) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [t.championId])

  const wr = (t.wins / t.games) * 100
  const kda = t.deaths === 0 ? t.kills + t.assists : (t.kills + t.assists) / t.deaths
  const csPerMin = t.seconds > 0 ? (t.cs / (t.seconds / 60)) : 0

  return (
    <div
      className="ds-row flex items-center gap-3 rounded-[3px] bg-flash/[0.02] py-2 pl-3 pr-3"
      style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}
    >
      {name ? (
        <img src={`${CDN}/${v}/img/champion/${name.slug}.png`} alt="" className="h-9 w-9 shrink-0 rounded-[3px] ring-1 ring-jade/15" />
      ) : (
        <span className="h-9 w-9 shrink-0 rounded-[3px] bg-flash/[0.04]" />
      )}

      <div className="w-[112px] shrink-0">
        <p className="truncate font-chakrapetch text-[13px] font-bold leading-tight">{name?.name ?? "…"}</p>
        <p className="font-jetbrains text-[9px] uppercase tracking-[0.14em] text-flash/25">
          {t.games} {t.games === 1 ? "game" : "games"}
        </p>
      </div>

      {/* The bar IS the win rate; the number is there to be precise, not to be
          found. Split at the middle so above and below 50% read instantly. */}
      <div className="min-w-0 flex-1">
        <div className="relative h-[6px] w-full overflow-hidden rounded-[2px] bg-flash/[0.05]">
          <span
            className="absolute inset-y-0 left-0 rounded-[2px]"
            style={{ width: `${wr}%`, background: wr >= 50 ? "#00d992" : "#FFB615", opacity: 0.75 }}
          />
          <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-liquirice/80" />
        </div>
        <p className="mt-1 font-jetbrains text-[9px] tabular-nums text-flash/30">
          {t.wins}W {t.games - t.wins}L
        </p>
      </div>

      <p className={`w-[52px] shrink-0 text-right font-chakrapetch text-[15px] font-bold tabular-nums ${wr >= 50 ? "text-jade" : "text-citrine"}`}>
        {wr.toFixed(0)}%
      </p>

      <div className="w-[80px] shrink-0 text-right">
        <p className="font-chakrapetch text-[12px] tabular-nums leading-tight text-flash/70">{kda.toFixed(1)} kda</p>
        <p className="font-jetbrains text-[9px] tabular-nums text-flash/25">{csPerMin.toFixed(1)} cs/m</p>
      </div>
    </div>
  )
}
