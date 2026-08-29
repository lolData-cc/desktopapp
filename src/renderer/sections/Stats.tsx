import { useEffect, useMemo, useState } from "react"
import { championById } from "../../data/champions"
import { CDN, mmss, queueName, type AppState, type Match } from "../types"

/**
 * What your recent games actually say.
 *
 * ⚠️ Derived, never fetched. The match history is already in memory, so every
 * number here costs no request, needs no account and works with no network. It
 * is also a SMALL SAMPLE by nature — twenty games — and the screen says so in
 * every place it could be mistaken for a career average.
 *
 * ⚠️ Remakes are excluded everywhere. A game that ended before it counted tells
 * you nothing about a champion, and counting it as a loss is the exact bug the
 * website's season stats once shipped.
 */
type Tally = {
  championId: number
  games: number
  wins: number
  kills: number
  deaths: number
  assists: number
  cs: number
  gold: number
  vision: number
  seconds: number
  best: Match | null
}

function tally(matches: Match[]): Tally[] {
  const by = new Map<number, Tally>()
  for (const m of matches) {
    if (m.remake) continue
    const t = by.get(m.championId) ?? {
      championId: m.championId, games: 0, wins: 0, kills: 0, deaths: 0, assists: 0,
      cs: 0, gold: 0, vision: 0, seconds: 0, best: null,
    }
    t.games++
    if (m.win) t.wins++
    t.kills += m.kills
    t.deaths += m.deaths
    t.assists += m.assists
    t.cs += m.creepScore
    t.gold += m.goldEarned
    t.vision += m.visionScore
    t.seconds += m.durationSeconds
    if (!t.best || score(m) > score(t.best)) t.best = m
    by.set(m.championId, t)
  }
  return [...by.values()].sort((a, b) => b.games - a.games || b.wins / b.games - a.wins / a.games)
}

/** Which game to call the best one on a champion. Deliberately not "most
 *  kills": a 12/9 game is not better than a 7/0 one. */
const score = (m: Match) => (m.kills + m.assists) / Math.max(1, m.deaths) + (m.win ? 1.5 : 0)

export default function Stats({ s }: { s: AppState }) {
  const matches = useMemo(() => (s.matches ?? []).filter((m) => !m.remake), [s.matches])
  const rows = useMemo(() => tally(s.matches ?? []), [s.matches])
  const [open, setOpen] = useState<number | null>(null)

  /**
   * How many accounts this machine has seen, and how far back it goes.
   *
   * These figures are the COMPUTER's, not an account's — every account signed
   * in here contributes, and the record starts when the app was installed
   * because that is the first game it could witness. Saying so is the point:
   * a win rate over an unstated set of games is a number nobody can check.
   */
  const scope = useMemo(() => {
    const accounts = new Set(matches.map((m) => m.account?.puuid).filter(Boolean)).size
    const oldest = matches.length ? Math.min(...matches.map((m) => m.playedAt)) : 0
    return { accounts, oldest }
  }, [matches])

  if (!s.matches) return <Note>Reading your match history…</Note>
  if (!rows.length) return <Note>No completed games yet — remakes do not count towards this.</Note>

  const games = matches.length
  const wins = matches.filter((m) => m.win).length
  const mins = matches.reduce((n, m) => n + m.durationSeconds, 0) / 60
  const k = matches.reduce((n, m) => n + m.kills, 0)
  const d = matches.reduce((n, m) => n + m.deaths, 0)
  const a = matches.reduce((n, m) => n + m.assists, 0)
  const cs = matches.reduce((n, m) => n + m.creepScore, 0)
  const vision = matches.reduce((n, m) => n + m.visionScore, 0)

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-baseline gap-3">
        <h2 className="font-chakrapetch text-[22px] font-bold leading-none">Stats</h2>
        <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.18em] text-flash/30">
          {games} completed {games === 1 ? "game" : "games"} on this pc
          {scope.accounts > 1 ? ` · ${scope.accounts} accounts` : ""}
          {scope.oldest ? ` · since ${new Date(scope.oldest).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {/* ── the shape of the run ─────────────────────────────────────── */}
        <div className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-5">
          <Big
            value={`${Math.round((wins / games) * 100)}%`}
            label="win rate"
            sub={`${wins}W ${games - wins}L`}
          />
          <Big
            value={(d === 0 ? k + a : (k + a) / d).toFixed(2)}
            label="kda"
            sub={`${(k / games).toFixed(1)} / ${(d / games).toFixed(1)} / ${(a / games).toFixed(1)} a game`}
          />
          <Big value={(cs / mins).toFixed(1)} label="cs a minute" sub={`${Math.round(cs / games)} a game`} />
          <Big value={(vision / mins).toFixed(2)} label="vision a minute" sub={`${Math.round(vision / games)} a game`} />
          <Big value={fmtHours(mins)} label="played" sub={`${Math.round(mins / games)} min a game`} />

          {/* ⚠️ The run in order, oldest on the left. A win rate says how often;
              this says WHEN, and a streak reads at a glance where a percentage
              never could. */}
          <div className="ml-auto">
            <p className="mb-2 text-right font-jetbrains text-[9px] uppercase tracking-[0.2em] text-flash/30">
              the run
            </p>
            <div className="flex items-end gap-[3px]">
              {[...matches].reverse().map((m, i) => (
                <span
                  key={i}
                  title={`${m.win ? "win" : "loss"} · ${queueName(m.queueId, m.gameMode)} · ${mmss(m.durationSeconds)}`}
                  className="block w-[7px]"
                  style={{
                    height: m.win ? 26 : 16,
                    background: m.win ? "#00d992" : "rgba(255,182,21,0.55)",
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── by champion ──────────────────────────────────────────────── */}
        <p className="mb-2 mt-8 font-jetbrains text-[9px] uppercase tracking-[0.2em] text-flash/30">
          by champion
        </p>
        <div className="space-y-1">
          {rows.map((r, i) => (
            <Champ
              key={r.championId}
              t={r}
              patch={s.patch}
              index={i}
              most={rows[0]?.games ?? 1}
              open={open === r.championId}
              onOpen={() => setOpen(open === r.championId ? null : r.championId)}
            />
          ))}
        </div>

        <p className="mt-4 max-w-[70ch] font-chakrapetch text-[11.5px] leading-snug text-flash/25">
          Twenty games is not a win rate — it is a run of form. Nothing on this page
          is a career average, and three games on a champion will read as brilliant
          or hopeless for reasons that have nothing to do with the champion. The site
          has every game we have ever seen, which is where the real numbers live.
        </p>
      </div>
    </div>
  )
}

const Big = ({ value, label, sub }: { value: string; label: string; sub: string }) => (
  <div>
    <p className="font-chakrapetch text-[30px] font-bold leading-none tabular-nums text-flash">{value}</p>
    <p className="mt-1.5 font-jetbrains text-[9px] uppercase tracking-[0.2em] text-jade/60">{label}</p>
    <p className="font-jetbrains text-[9px] tabular-nums text-flash/25">{sub}</p>
  </div>
)

const Note = ({ children }: { children: React.ReactNode }) => (
  <div className="grid h-full place-items-center">
    <p className="max-w-[44ch] text-center font-chakrapetch text-[13px] leading-snug text-flash/35">{children}</p>
  </div>
)

/* ── one champion ────────────────────────────────────────────────────────── */

function Champ({
  t,
  patch,
  index,
  most,
  open,
  onOpen,
}: {
  t: Tally
  patch: string | null
  index: number
  most: number
  open: boolean
  onOpen: () => void
}) {
  const [slug, setSlug] = useState<string | null>(null)
  const [name, setName] = useState<string | null>(null)
  const v = patch ?? "16.16.1"

  useEffect(() => {
    let alive = true
    void championById(t.championId)
      .then((c) => { if (alive) { setSlug(c?.slug ?? null); setName(c?.name ?? null) } })
      .catch(() => undefined)
    return () => { alive = false }
  }, [t.championId])

  const wr = (t.wins / t.games) * 100
  const kda = t.deaths === 0 ? t.kills + t.assists : (t.kills + t.assists) / t.deaths
  const mins = t.seconds / 60

  return (
    <div className="ds-row" style={{ animationDelay: `${Math.min(index, 12) * 26}ms` }}>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3.5 py-2.5 pl-3.5 pr-3 text-left"
        style={{ background: "rgba(215,216,217,0.022)", cursor: "pointer" }}
      >
        {slug ? (
          <img src={`${CDN}/${v}/img/champion/${slug}.png`} alt="" className="h-10 w-10 shrink-0 rounded-[3px] ring-1 ring-jade/15" />
        ) : (
          <span className="h-10 w-10 shrink-0 rounded-[3px] bg-flash/[0.04]" />
        )}

        <div className="w-[120px] shrink-0">
          <p className="truncate font-chakrapetch text-[13.5px] font-bold leading-tight">{name ?? slug ?? "—"}</p>
          {/* ⚠️ The bar is the SAMPLE, not the win rate — how much of your
              recent play this champion is. Two rows with the same percentage
              are not the same fact if one of them is nine games and the other
              is two. */}
          <div className="mt-1 h-[3px] w-[104px]" style={{ background: "rgba(215,216,217,0.08)" }}>
            <span className="block h-full" style={{ width: `${(t.games / most) * 100}%`, background: "rgba(0,217,146,0.5)" }} />
          </div>
        </div>

        <div className="w-[92px] shrink-0">
          <p className="font-chakrapetch text-[15px] font-bold tabular-nums leading-tight" style={{ color: wrColour(wr, t.games) }}>
            {Math.round(wr)}%
          </p>
          <p className="font-jetbrains text-[9px] tabular-nums text-flash/25">
            {t.wins}W {t.games - t.wins}L
          </p>
        </div>

        <div className="w-[104px] shrink-0">
          <p className="font-chakrapetch text-[13px] font-bold tabular-nums leading-tight text-flash/80">
            {kda.toFixed(2)} <span className="font-jetbrains text-[8.5px] font-normal text-flash/25">kda</span>
          </p>
          <p className="font-jetbrains text-[9px] tabular-nums text-flash/25">
            {(t.kills / t.games).toFixed(1)} / {(t.deaths / t.games).toFixed(1)} / {(t.assists / t.games).toFixed(1)}
          </p>
        </div>

        <div className="hidden w-[80px] shrink-0 lg:block">
          <p className="font-chakrapetch text-[13px] font-bold tabular-nums leading-tight text-flash/70">
            {(t.cs / mins).toFixed(1)} <span className="font-jetbrains text-[8.5px] font-normal text-flash/25">cs/m</span>
          </p>
          <p className="font-jetbrains text-[9px] tabular-nums text-flash/25">{Math.round(t.cs / t.games)} a game</p>
        </div>

        <div className="hidden w-[80px] shrink-0 lg:block">
          <p className="font-chakrapetch text-[13px] font-bold tabular-nums leading-tight text-flash/70">
            {short(t.gold / mins)} <span className="font-jetbrains text-[8.5px] font-normal text-flash/25">g/m</span>
          </p>
          <p className="font-jetbrains text-[9px] tabular-nums text-flash/25">{(t.vision / mins).toFixed(2)} vis/m</p>
        </div>

        <span className="ml-auto shrink-0 font-jetbrains text-[9px] uppercase tracking-[0.14em] text-flash/25">
          {t.games} {t.games === 1 ? "game" : "games"}
        </span>

        <span
          aria-hidden
          className="shrink-0 font-jetbrains text-[9px] text-flash/25 transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        >
          ▸
        </span>
      </button>

      {open && t.best && (
        <div className="ds-enter flex flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3.5" style={{ background: "rgba(215,216,217,0.02)" }}>
          <div>
            <p className="font-jetbrains text-[9px] uppercase tracking-[0.2em] text-flash/30">best game</p>
            <p className="mt-1 font-chakrapetch text-[14px] font-bold tabular-nums">
              {t.best.kills} / {t.best.deaths} / {t.best.assists}
              <span className="ml-2 font-jetbrains text-[9.5px] font-normal uppercase tracking-[0.14em]" style={{ color: t.best.win ? "#00d992" : "rgba(255,182,21,0.7)" }}>
                {t.best.win ? "win" : "loss"}
              </span>
            </p>
            <p className="font-jetbrains text-[9px] tabular-nums text-flash/25">
              {queueName(t.best.queueId, t.best.gameMode)} · {mmss(t.best.durationSeconds)} · {t.best.creepScore} cs
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-[3px]">
            {t.best.items.filter(Boolean).map((id, i) => (
              <img key={`${id}-${i}`} src={`${CDN}/${v}/img/item/${id}.png`} alt="" className="h-[22px] w-[22px] rounded-[2px]" />
            ))}
          </div>

          {/* ⚠️ Stated whenever the sample is too small to mean anything, on the
              row where the tempting number is. A 100% win rate from two games
              is the single most misleading thing this page can print. */}
          {t.games < 4 && (
            <p className="ml-auto max-w-[36ch] font-chakrapetch text-[11.5px] leading-snug text-citrine/50">
              {t.games} {t.games === 1 ? "game" : "games"} — far too few for that win
              rate to mean anything.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * ⚠️ Grey until the sample can carry a colour.
 *
 * Painting a 100% win rate green when it came from two games is the page
 * asserting something it cannot know, in the most persuasive way it has.
 */
const wrColour = (wr: number, games: number) => {
  if (games < 4) return "rgba(215,216,217,0.55)"
  return wr >= 60 ? "#00d992" : wr >= 45 ? "rgba(215,216,217,0.9)" : "rgba(255,182,21,0.8)"
}

const short = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)))

const fmtHours = (mins: number) =>
  mins >= 60 ? `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m` : `${Math.round(mins)}m`
