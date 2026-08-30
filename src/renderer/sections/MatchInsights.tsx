/**
 * What sat under the recording: nothing.
 *
 * With the window maximised the picture and the scoreboard are the same height
 * now, and everything below them was empty. This fills it with the three things
 * the data already in hand can honestly say — how the ten players compare, who
 * the one you clicked actually is, and how they did on that champion against how
 * the champion usually goes.
 *
 * ⚠️ Nothing here is invented. The bars come from the board the app already
 * read; the profile and the champion averages are two real endpoints. Where a
 * number is missing the panel says so instead of drawing a zero — a zero is a
 * measurement, and printing one we do not have is the app lying quietly.
 */
import { useEffect, useState } from "react"
import { CDN, type MatchPlayer } from "../types"

const API = "https://api2.loldata.cc"

/** Answers keyed by riot id, because clicking back and forth between two
 *  players must not re-ask for either of them. */
const profileCache = new Map<string, Profile | null>()
const champCache = new Map<string, ChampCore | null>()

type Profile = {
  name: string
  tag: string
  rank: string | null
  lp: number | null
  wins: number
  losses: number
  profileIconId: number | null
}

type ChampCore = {
  avgKDA: number
  avgCS: number
  avgDamage: number
  avgGold: number
  winrate: number
  gamesAnalyzed: number
}

export default function MatchInsights({
  board,
  chosen,
  patch,
}: {
  board: MatchPlayer[] | null
  chosen: MatchPlayer | null
  patch: string
}) {
  if (!board?.length) return null

  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <Bars board={board} chosen={chosen} label="damage dealt" pick={(p) => p.damage} />
      <Bars board={board} chosen={chosen} label="damage taken" pick={(p) => p.damageTaken} />
      <Bars board={board} chosen={chosen} label="gold earned" pick={(p) => p.goldEarned} />

      <div className="xl:col-span-2">
        <ChampionCard chosen={chosen} patch={patch} />
      </div>
      <ProfileCard chosen={chosen} />
    </div>
  )
}

/**
 * The shell every card here wears: a mark, a label, and one rule that leaves the
 * words and dies into nothing.
 *
 * ⚠️ Not a bordered box. Four borders around each of five cards is a grid of
 * boxes, and the eye has to enter every one of them; the rule and the mark say
 * "a new thing starts here" with a tenth of the ink. The same figure the panels
 * elsewhere in this app are built from.
 */
function Panel({
  label,
  children,
  className = "",
}: {
  label: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`relative rounded-[3px] bg-[rgba(6,12,14,0.42)] px-4 pb-4 pt-3.5 ${className}`}>
      <div className="flex items-center gap-2">
        <svg aria-hidden width="7" height="7" viewBox="0 0 7 7" className="shrink-0 overflow-visible">
          <g transform="rotate(45 3.5 3.5)">
            <rect x="0.8" y="0.8" width="5.4" height="5.4" fill="#00d992" opacity="0.85" />
          </g>
        </svg>
        <p className="whitespace-nowrap font-jetbrains text-[9px] uppercase tracking-[0.24em] text-flash/35">
          {label}
        </p>
        <span
          aria-hidden
          className="h-px flex-1"
          style={{ background: "linear-gradient(90deg, rgba(0,217,146,0.28), rgba(0,217,146,0))" }}
        />
      </div>
      {children}
    </section>
  )
}

/* ── the three charts ────────────────────────────────────────────────────── */

/**
 * Ten bars, both teams, sorted by the value.
 *
 * ⚠️ Scaled to the BIGGEST in this game, not to a fixed ceiling. A game where
 * nobody broke 20k and one where the top did 60k are different games, and a
 * shared scale would make the first look like everybody failed.
 */
function Bars({
  board,
  chosen,
  label,
  pick,
}: {
  board: MatchPlayer[]
  chosen: MatchPlayer | null
  label: string
  pick: (p: MatchPlayer) => number
}) {
  const rows = [...board].sort((a, b) => pick(b) - pick(a))
  const top = pick(rows[0] ?? ({ damage: 0 } as MatchPlayer)) || 1

  return (
    <Panel label={label}>
      <div className="mt-3.5 space-y-[6px]">
        {rows.map((p) => {
          const v = pick(p)
          const mine = chosen ? p.participantId === chosen.participantId : p.isMe
          return (
            <div key={p.participantId} className="flex items-center gap-2">
              <img
                src={`${CDN}/img/champion/${p.championId}.png`}
                alt=""
                loading="lazy"
                className="h-[18px] w-[18px] shrink-0 rounded-[2px]"
                onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden" }}
              />
              <span className="relative block h-[10px] flex-1 overflow-hidden rounded-[1px] bg-flash/[0.05]">
                <span
                  className="absolute inset-y-0 left-0 rounded-[1px]"
                  style={{
                    width: `${Math.max(2, (v / top) * 100)}%`,
                    // The clicked player in jade, their side of the game in a
                    // dimmer version of it, the other side neutral: the chart
                    // answers "how did THEY do" first and "who won" second.
                    background: mine
                      ? "#00d992"
                      : p.win
                        ? "rgba(0,217,146,0.30)"
                        : "rgba(215,216,217,0.16)",
                  }}
                />
              </span>
              <span
                className={`w-[62px] shrink-0 text-right font-jetbrains text-[10px] tabular-nums ${
                  mine ? "text-jade" : "text-flash/40"
                }`}
              >
                {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
              </span>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

/* ── who you clicked ─────────────────────────────────────────────────────── */

function ProfileCard({ chosen }: { chosen: MatchPlayer | null }) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const riot = chosen?.riotId ?? null

  useEffect(() => {
    if (!riot) return setProfile(undefined)
    const hit = profileCache.get(riot)
    if (hit !== undefined) return setProfile(hit)

    let alive = true
    setProfile(undefined)
    const [name, tag] = riot.split("#")
    void fetch(`${API}/api/summoner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, tag, region: "euw" }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => {
        const p: Profile | null = d?.summoner
          ? {
              name: d.summoner.name,
              tag: d.summoner.tag,
              rank: d.summoner.rank ?? null,
              lp: typeof d.summoner.lp === "number" ? d.summoner.lp : null,
              wins: Number(d.summoner.wins) || 0,
              losses: Number(d.summoner.losses) || 0,
              profileIconId: d.summoner.profileIconId ?? null,
            }
          : null
        profileCache.set(riot, p)
        if (alive) setProfile(p)
      })
      .catch(() => {
        profileCache.set(riot, null)
        if (alive) setProfile(null)
      })

    return () => { alive = false }
  }, [riot])

  if (!chosen) return <Empty title="player">Click a row to read that player.</Empty>
  // ⚠️ No riot id is a DIFFERENT state from "still loading", and it used to be
  // shown as the latter — a card that says "reading their profile" forever.
  // Riot withholds the identity of some players entirely; that is the answer,
  // not a delay.
  if (!riot) return <Empty title={chosen.name}>Riot does not publish this account.</Empty>
  if (profile === undefined) return <Empty title={chosen.name}>Reading their profile…</Empty>
  if (!profile) return <Empty title={chosen.name}>No profile for this account.</Empty>

  const games = profile.wins + profile.losses
  const wr = games ? Math.round((profile.wins / games) * 1000) / 10 : null

  return (
    <Panel label="the player">
      <p className="mt-3 truncate font-chakrapetch text-[19px] font-bold leading-none text-flash/90">
        {profile.name}
        <span className="text-flash/35">#{profile.tag}</span>
      </p>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <Fact label="rank">
          {profile.rank ?? "unranked"}
          {profile.lp !== null && profile.rank ? (
            <span className="ml-1.5 font-jetbrains text-[10px] text-flash/40">{profile.lp} LP</span>
          ) : null}
        </Fact>
        {/* ⚠️ Ranked season totals, which is what the endpoint returns — not
            "last 10 games". Saying the wrong thing about a real number is
            worse than saying less about it. */}
        <Fact label="ranked this season">
          {games ? `${games} games` : "none"}
        </Fact>
        <Fact label="win rate">
          {wr === null ? "—" : <span className={wr >= 50 ? "text-jade" : "text-[#ff6286]"}>{wr}%</span>}
        </Fact>
        <Fact label="record">
          {games ? (
            <>
              <span className="text-jade/80">{profile.wins}W</span>
              <span className="text-flash/30"> · </span>
              <span className="text-[#ff6286]/80">{profile.losses}L</span>
            </>
          ) : (
            "—"
          )}
        </Fact>
      </div>
    </Panel>
  )
}

/* ── how that game went, for that champion ───────────────────────────────── */

function ChampionCard({ chosen, patch }: { chosen: MatchPlayer | null; patch: string }) {
  void patch
  const [core, setCore] = useState<ChampCore | null | undefined>(undefined)
  const key = chosen ? `${chosen.championId}:${chosen.role ?? ""}` : null

  useEffect(() => {
    if (!chosen || !key) return setCore(undefined)
    const hit = champCache.get(key)
    if (hit !== undefined) return setCore(hit)

    let alive = true
    setCore(undefined)
    void fetch(`${API}/api/champion/stats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        championId: chosen.championId,
        champion: undefined,
        queueId: 420,
        role: chosen.role === "SUPPORT" ? "UTILITY" : chosen.role,
        patch: null,
        region: null,
        tier: null,
        opponents: null,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => {
        const c: ChampCore | null = d?.core
          ? {
              avgKDA: Number(d.core.avgKDA) || 0,
              avgCS: Number(d.core.avgCS) || 0,
              avgDamage: Number(d.core.avgDamage) || 0,
              avgGold: Number(d.core.avgGold) || 0,
              winrate: Number(d.core.winrate) || 0,
              gamesAnalyzed: Number(d.core.gamesAnalyzed) || 0,
            }
          : null
        champCache.set(key, c)
        if (alive) setCore(c)
      })
      .catch(() => {
        champCache.set(key, null)
        if (alive) setCore(null)
      })

    return () => { alive = false }
  }, [key])

  if (!chosen) return <Empty title="champion">Click a row to compare that game.</Empty>

  const kda = chosen.deaths > 0 ? (chosen.kills + chosen.assists) / chosen.deaths : chosen.kills + chosen.assists

  return (
    <Panel label="this game vs the champion's average">
      <div className="mt-3.5 flex items-center gap-2.5">
        <img
          src={`${CDN}/img/champion/${chosen.championId}.png`}
          alt=""
          className="h-8 w-8 rounded-[2px] ring-1 ring-inset ring-jade/15"
          onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden" }}
        />
        <div className="min-w-0">
          <p className="truncate font-chakrapetch text-[15px] font-bold leading-tight text-flash/85">
            {chosen.name}
            {chosen.role ? <span className="text-flash/35"> · {chosen.role.toLowerCase()}</span> : null}
          </p>
        </div>
      </div>

      {core === undefined ? (
        <p className="mt-4 font-jetbrains text-[10px] uppercase tracking-[0.18em] text-flash/25">
          reading the champion's numbers…
        </p>
      ) : !core ? (
        <p className="mt-4 font-jetbrains text-[10px] uppercase tracking-[0.18em] text-flash/25">
          no aggregate for this champion and role
        </p>
      ) : (
        <div className="mt-4 space-y-2.5">
          {/* ⚠️ A row is drawn only when there IS an average to draw it against.
              The endpoint returns 0 for measures it has not aggregated for a
              champion and role, and 0.00 rendered as "the average" is a number
              the app does not have, printed as though it did. */}
          <Against label="kda" mine={kda} avg={core.avgKDA} fmt={(n) => n.toFixed(2)} />
          <Against label="cs" mine={chosen.creepScore} avg={core.avgCS} fmt={(n) => String(Math.round(n))} />
          <Against label="damage" mine={chosen.damage} avg={core.avgDamage} fmt={(n) => `${(n / 1000).toFixed(1)}k`} />
          <Against label="gold" mine={chosen.goldEarned} avg={core.avgGold} fmt={(n) => `${(n / 1000).toFixed(1)}k`} />
          <p className="pt-1 font-jetbrains text-[8.5px] uppercase tracking-[0.18em] text-flash/20">
            average over {core.gamesAnalyzed.toLocaleString()} games · {core.winrate.toFixed(1)}% win rate
          </p>
        </div>
      )}
    </Panel>
  )
}

/**
 * One measure against the champion's average.
 *
 * ⚠️ The bar is the RATIO, capped at twice the average. Without a cap one
 * forty-minute game makes every other row a stub; with one, "twice the average"
 * is simply where the bar ends and the number still says the truth.
 */
function Against({
  label,
  mine,
  avg,
  fmt,
}: {
  label: string
  mine: number
  avg: number
  fmt: (n: number) => string
}) {
  // Nothing to compare against: the row does not appear at all.
  if (!(avg > 0)) return null

  const ratio = mine / avg
  const pct = Math.min(100, (ratio / 2) * 100)
  const better = ratio >= 1

  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[52px] shrink-0 font-jetbrains text-[9px] uppercase tracking-[0.18em] text-flash/30">
        {label}
      </span>
      <span className="relative block h-[10px] flex-1 overflow-hidden rounded-[1px] bg-flash/[0.05]">
        {/* Where the average sits, so the bar has something to be measured
            against rather than being a length on its own. */}
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-flash/20" />
        <span
          className="absolute inset-y-0 left-0 rounded-[1px]"
          style={{
            width: `${Math.max(2, pct)}%`,
            background: better ? "rgba(0,217,146,0.55)" : "rgba(215,216,217,0.22)",
          }}
        />
      </span>
      <span className={`w-[54px] shrink-0 text-right font-jetbrains text-[10px] tabular-nums ${better ? "text-jade" : "text-flash/45"}`}>
        {fmt(mine)}
      </span>
      <span className="w-[54px] shrink-0 text-right font-jetbrains text-[9px] tabular-nums text-flash/25">
        {fmt(avg)}
      </span>
    </div>
  )
}

/* ── shared bits ─────────────────────────────────────────────────────────── */

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="font-jetbrains text-[8.5px] uppercase tracking-[0.2em] text-flash/25">{label}</p>
    <p className="mt-1 font-chakrapetch text-[13px] font-bold leading-none text-flash/80">{children}</p>
  </div>
)

const Empty = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Panel label={title}>
    <p className="mt-3 font-chakrapetch text-[12.5px] leading-relaxed text-flash/30">{children}</p>
  </Panel>
)
