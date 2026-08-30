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
import { championById } from "../../data/champions"

const API = "https://api2.loldata.cc"

/** Our own emblems, at the CDN ROOT rather than under a patch. The same image
 *  and the same path the overlay and the summoner page use — one rank must not
 *  look like two different things across our own products. */
const RANKS = `${CDN}/ranks`

/** Answers keyed by riot id, because clicking back and forth between two
 *  players must not re-ask for either of them. */
/** ⚠️ Versioned. Bumping this retires every entry written by an older
 *  shape, which is what a module-level cache surviving a reload cannot do on
 *  its own. */
const PROFILE_SHAPE = 2
const profileCache = new Map<string, Profile | null>()

type Recent = { champion: string; win: boolean }

type Profile = {
  name: string
  tag: string
  rank: string | null
  lp: number | null
  wins: number
  losses: number
  profileIconId: number | null
  /** Their last ranked games, newest first. Solo and flex only — a normal game
   *  says nothing about the player you are reading a ranked scoreboard for. */
  recent: Recent[]
}


/**
 * ids → ddragon slugs, for the whole board at once.
 *
 * ⚠️ Champion pictures live under a PATCH and are keyed by slug:
 * `/<patch>/img/champion/Lillia.png`. Both charts here asked for
 * `/img/champion/<numeric id>.png`, which is not a path this CDN has — every
 * icon 404'd and `onError` hid the evidence, so the bars simply had no
 * champions and nothing said why. The join has to happen before the request.
 */
function useSlugs(ids: number[]): Map<number, string> {
  const [slugs, setSlugs] = useState<Map<number, string>>(new Map())
  const key = ids.join(",")

  useEffect(() => {
    let alive = true
    void Promise.all(
      ids.map((id) =>
        championById(id)
          .then((c) => [id, c?.slug] as const)
          .catch(() => [id, undefined] as const)
      )
    ).then((pairs) => {
      if (!alive) return
      setSlugs(new Map(pairs.filter((p): p is readonly [number, string] => !!p[1])))
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return slugs
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
    <div className="match-stage-band mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <Bars board={board} chosen={chosen} patch={patch} label="damage dealt" pick={(p) => p.damage} />
      <Bars board={board} chosen={chosen} patch={patch} label="damage taken" pick={(p) => p.damageTaken} />
      {/* The profile takes the third column. Gold was the weakest of the three
          charts — it tracks damage and CS closely enough to be a third drawing
          of the same thing — and a card about the player is worth more there. */}
      <ProfileCard chosen={chosen} patch={patch} />

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
  solid = false,
  behind,
}: {
  label: React.ReactNode
  children: React.ReactNode
  className?: string
  /** An opaque plate instead of the translucent one — for the one card that
   *  carries artwork of its own and would otherwise show the page through it. */
  solid?: boolean
  /** Painted under the contents, inside the clip. */
  behind?: React.ReactNode
}) {
  return (
    <section
      className={`relative overflow-hidden rounded-[3px] px-4 pb-4 pt-3.5 ${
        solid ? "bg-[#050b0d]" : "bg-[rgba(6,12,14,0.42)]"
      } ${className}`}
    >
      {behind}
      <div className="relative flex items-center gap-2">
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
      <div className="relative">{children}</div>
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
  patch,
  label,
  pick,
}: {
  board: MatchPlayer[]
  chosen: MatchPlayer | null
  patch: string
  label: string
  pick: (p: MatchPlayer) => number
}) {
  const slugs = useSlugs(board.map((p) => p.championId))
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
              {/* Drawn as an empty square until the slug is known, so the ten
                  bars do not shift sideways the moment the names arrive. */}
              {slugs.get(p.championId) ? (
                <img
                  src={`${CDN}/${patch}/img/champion/${slugs.get(p.championId)}.png`}
                  alt=""
                  loading="lazy"
                  className="h-[18px] w-[18px] shrink-0 rounded-[2px]"
                />
              ) : (
                <span className="h-[18px] w-[18px] shrink-0 rounded-[2px] bg-flash/[0.04]" />
              )}
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

function ProfileCard({ chosen, patch }: { chosen: MatchPlayer | null; patch: string }) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const riot = chosen?.riotId ?? null
  const slug = useSlugs(chosen ? [chosen.championId] : []).get(chosen?.championId ?? 0)

  useEffect(() => {
    if (!riot) return setProfile(undefined)
    const hit = profileCache.get(`${PROFILE_SHAPE}:${riot}`)
    if (hit !== undefined) return setProfile(hit)

    let alive = true
    setProfile(undefined)
    // ⚠️ A riotId WITHOUT a tag cannot be looked up. The client builds it as
    // `${game}#${tag}` only when it has both and falls back to the bare name
    // otherwise (src/lcu/history.ts), so half of these ids arrive tagless — and
    // firing the request anyway sends `tag: undefined` and gets a card that
    // silently stays empty instead of one that says why.
    const [name, tag] = riot.split("#")
    if (!tag) {
      profileCache.set(`${PROFILE_SHAPE}:${riot}`, null)
      setProfile(null)
      return
    }
    // Two requests, one card. The profile answers "who is this" and the history
    // answers "what have they been playing"; neither endpoint carries the other.
    void Promise.all([
      fetch(`${API}/api/summoner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, tag, region: "euw" }),
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${API}/api/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, tag, region: "euw", offset: 0, limit: 20 }),
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([d, h]: any[]) => {
        // ⚠️ Solo and flex only. A normal or an ARAM says nothing about the
        // player whose ranked scoreboard you are reading, and mixing them in
        // would make the row of champions answer a different question.
        const recent: Recent[] = ((h?.matches ?? []) as any[])
          .filter((m) => [420, 440].includes(m?.match?.info?.queueId))
          .slice(0, 10)
          .map((m) => ({ champion: String(m.championName ?? ""), win: m.win === true }))
          .filter((r) => r.champion)

        const p: Profile | null = d?.summoner
          ? {
              name: d.summoner.name,
              tag: d.summoner.tag,
              rank: d.summoner.rank ?? null,
              lp: typeof d.summoner.lp === "number" ? d.summoner.lp : null,
              wins: Number(d.summoner.wins) || 0,
              losses: Number(d.summoner.losses) || 0,
              profileIconId: d.summoner.profileIconId ?? null,
              recent,
            }
          : null
        profileCache.set(`${PROFILE_SHAPE}:${riot}`, p)
        if (alive) setProfile(p)
      })
      .catch(() => {
        profileCache.set(`${PROFILE_SHAPE}:${riot}`, null)
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
  if (profile === undefined)
    return (
      <Card slug={slug} label="the player">
        <Waiting name={chosen.name} />
      </Card>
    )
  if (!profile) return <Empty title={chosen.name}>No profile for this account.</Empty>

  const games = profile.wins + profile.losses
  const wr = games ? Math.round((profile.wins / games) * 1000) / 10 : null

  // "DIAMOND II" -> "diamond", which is the emblem's filename. WARNING: the
  // tier is taken apart from the division on purpose - Master has no division,
  // so the label and the file cannot be the same string.
  const tier =
    profile.rank && !/unranked/i.test(profile.rank)
      ? (profile.rank.trim().split(/\s+/)[0] ?? "").toLowerCase()
      : null

  return (
    <Card slug={slug} label="the player">
      <p className="mt-3 truncate font-chakrapetch text-[19px] font-bold leading-none text-flash/90">
        {profile.name}
        <span className="text-flash/35">#{profile.tag}</span>
      </p>

      {/* The rank, as a shape before it is a word. WARNING: no request for a
          player without one - cdn2/ranks has no unranked.png, so asking would
          be a guaranteed 404 on every hidden account. */}
      <div className="mt-3.5 flex items-center gap-2.5">
        {tier ? (
          <img
            src={`${RANKS}/${tier}.png`}
            alt=""
            className="h-10 w-10 shrink-0 object-contain"
            style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.85))" }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden" }}
          />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center">
            <span aria-hidden className="block h-2 w-2 rotate-45 bg-flash/10" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-chakrapetch text-[15px] font-bold uppercase leading-none tracking-wide text-flash/85">
            {profile.rank ?? "unranked"}
          </p>
          <p className="mt-1.5 font-jetbrains text-[9px] uppercase tracking-[0.2em] text-flash/30">
            {profile.lp !== null && tier ? `${profile.lp} LP` : "no ranked ladder"}
          </p>
        </div>
      </div>

      {/* WARNING: the win rate is the headline, not a cell in a grid. It was
          one of four equal facts and could not be found at a glance, which is
          the only reason anybody reads this card. The rest is its caption. */}
      <div className="mt-4 border-t border-flash/[0.06] pt-3.5">
        {wr === null ? (
          <p className="font-chakrapetch text-[13px] text-flash/35">No ranked games this season.</p>
        ) : (
          <>
            <div className="flex items-baseline gap-2.5">
              <p
                className="font-chakrapetch text-[34px] font-bold leading-none tabular-nums"
                style={{ color: wr >= 50 ? "#00d992" : "#ff6286" }}
              >
                {wr}
                <span className="text-[17px]">%</span>
              </p>
              <p className="font-jetbrains text-[9px] uppercase tracking-[0.22em] text-flash/30">
                win rate
              </p>
              <span className="ml-auto whitespace-nowrap font-jetbrains text-[10px] tabular-nums">
                <span className="text-jade/85">{profile.wins}W</span>
                <span className="text-flash/20"> · </span>
                <span className="text-[#ff6286]/85">{profile.losses}L</span>
              </span>
            </div>

            {/* The same number as a length, so it reads without being parsed. */}
            <span className="mt-2.5 block h-[5px] overflow-hidden rounded-[1px] bg-[#ff6286]/25">
              <span className="block h-full rounded-[1px] bg-jade" style={{ width: `${wr}%` }} />
            </span>

            {/* WARNING: ranked season totals, which is what the endpoint
                returns - NOT "last 10 games". Saying the wrong thing about a
                real number is worse than saying less about it. */}
            <p className="mt-2 font-jetbrains text-[8.5px] uppercase tracking-[0.2em] text-flash/25">
              {games} ranked games this season
            </p>
          </>
        )}
      </div>

      {/* Their last ranked games, newest first. The border carries the result,
          so the row reads as a streak at a glance rather than as ten pictures
          that each have to be decoded. */}
      {/* WARNING: defensive on `recent`. The cache is module-level and outlives
          a hot reload, so an entry written before this field existed comes back
          without it - and `undefined.length` throws, taking the whole card down
          rather than just the row. */}
      {(profile.recent?.length ?? 0) > 0 && (
        <div className="mt-4 border-t border-flash/[0.06] pt-3">
          <p className="font-jetbrains text-[8.5px] uppercase tracking-[0.2em] text-flash/25">
            last {profile.recent!.length} ranked
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {profile.recent!.map((r, i) => (
              <img
                key={`${r.champion}-${i}`}
                src={`${CDN}/${patch}/img/champion/${r.champion}.png`}
                alt={r.champion}
                title={`${r.champion} — ${r.win ? "win" : "loss"}`}
                loading="lazy"
                className="h-7 w-7 rounded-[3px] border object-cover"
                style={{
                  borderColor: r.win ? "rgba(0,217,146,0.75)" : "rgba(255,98,134,0.7)",
                  // A hairline of the same colour outside the border, so the
                  // result reads at a glance without thickening the frame.
                  boxShadow: r.win
                    ? "0 0 0 1px rgba(0,217,146,0.16)"
                    : "0 0 0 1px rgba(255,98,134,0.16)",
                }}
                onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden" }}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

/**
 * The player's plate: opaque, with the champion they played standing in it.
 *
 * WARNING: SOLID, unlike its two neighbours. The other cards are translucent
 * because there is nothing behind them worth seeing; this one has artwork of
 * its own, and a translucent plate would let the page show through the picture
 * and turn both into noise.
 *
 * WARNING: the art is a WATERMARK, which means it has to lose every argument
 * with the text. It sits at the right, is masked away toward the words, and is
 * held far enough down in opacity that it reads as the card's material rather
 * than as an image placed on it - splash art is bright in places and black in
 * others, and either extreme will eat a label that shares its space.
 */
const Card = ({
  slug,
  label,
  children,
}: {
  slug: string | undefined
  label: string
  children: React.ReactNode
}) => (
  <Panel
    label={label}
    solid
    behind={
      slug ? (
        <span aria-hidden className="pointer-events-none absolute inset-0">
          <img
            src={`${CDN}/img/champion/centered/${slug}_0.jpg`}
            alt=""
            className="absolute inset-y-0 right-0 h-full w-[78%] object-cover"
            style={{
              opacity: 0.24,
              maskImage: "linear-gradient(90deg, transparent 0%, #000 55%)",
              WebkitMaskImage: "linear-gradient(90deg, transparent 0%, #000 55%)",
            }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden" }}
          />
          {/* The plate's own colour, brought back up over the art from the
              left, so the column of numbers never sits on a bright patch. */}
          <span
            className="absolute inset-0"
            style={{ background: "linear-gradient(90deg, #050b0d 34%, rgba(5,11,13,0) 100%)" }}
          />
        </span>
      ) : null
    }
  >
    {children}
  </Panel>
)

/**
 * The card while it is being read.
 *
 * WARNING: this is built to the SAME height as the finished card, block for
 * block - a name, a rank, a headline number with its bar, and the strip of
 * recent games. Before, it was a spinner in an otherwise empty card, so the
 * card grew the instant a profile arrived and the champion painted behind it,
 * drawn at the card's full height, visibly zoomed on every click.
 *
 * The circle stays: it is the one thing that says "this is not the answer yet".
 * The blocks underneath are inert placeholders and are never mistaken for data
 * because none of them carries a number.
 */
const Waiting = ({ name }: { name: string }) => (
  <div className="cy-wait">
    <p className="mt-3 font-chakrapetch text-[19px] font-bold leading-none text-transparent">
      <span className="rounded-[2px] bg-flash/[0.07]">reading account</span>
    </p>

    <div className="mt-3.5 flex items-center gap-2.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center">
        <Spinner />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-chakrapetch text-[15px] font-bold uppercase leading-none tracking-wide text-transparent">
          <span className="rounded-[2px] bg-flash/[0.07]">rank</span>
        </p>
        <p className="mt-1.5 truncate font-jetbrains text-[9px] uppercase tracking-[0.2em] text-flash/25">
          reading {name}
        </p>
      </div>
    </div>

    <div className="mt-4 border-t border-flash/[0.06] pt-3.5">
      <div className="flex items-baseline gap-2.5">
        <p className="font-chakrapetch text-[34px] font-bold leading-none text-transparent">
          <span className="rounded-[2px] bg-flash/[0.07]">00.0%</span>
        </p>
        <p className="font-jetbrains text-[9px] uppercase tracking-[0.22em] text-transparent">
          <span className="rounded-[2px] bg-flash/[0.05]">win rate</span>
        </p>
      </div>
      <span className="mt-2.5 block h-[5px] rounded-[1px] bg-flash/[0.05]" />
      <p className="mt-2 font-jetbrains text-[8.5px] uppercase tracking-[0.2em] text-transparent">
        <span className="rounded-[2px] bg-flash/[0.05]">000 ranked games this season</span>
      </p>
    </div>

    <div className="mt-4 border-t border-flash/[0.06] pt-3">
      <p className="font-jetbrains text-[8.5px] uppercase tracking-[0.2em] text-transparent">
        <span className="rounded-[2px] bg-flash/[0.05]">last 10 ranked</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="block h-7 w-7 rounded-[3px] bg-flash/[0.05]" />
        ))}
      </div>
    </div>
  </div>
)

/**
 * The loading circle: an arc that runs, not a solid ring that spins.
 *
 * A full circle turning reads as a generic spinner from any other program. An
 * arc with a lit head is the same figure the rest of this app draws — light
 * that travels and dies — and it belongs here without needing a library.
 */
const Spinner = () => (
  <span aria-hidden className="cy-spin relative block h-8 w-8">
    <svg viewBox="0 0 36 36" className="h-full w-full">
      <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(0,217,146,0.12)" strokeWidth="1.5" />
      <circle
        cx="18" cy="18" r="15.5" fill="none"
        stroke="#00d992" strokeWidth="1.5" strokeLinecap="round"
        pathLength={100} strokeDasharray="26 74"
      />
    </svg>
  </span>
)

/* ── shared bits ─────────────────────────────────────────────────────────── */

const Empty = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Panel label={title}>
    <p className="mt-3 font-chakrapetch text-[12.5px] leading-relaxed text-flash/30">{children}</p>
  </Panel>
)
