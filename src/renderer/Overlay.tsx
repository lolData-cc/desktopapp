import { useEffect, useRef, useState, type CSSProperties } from "react"
import { abilityBox, type Ability, type HudNudge } from "../data/hud"
import { championById } from "../data/champions"
import { goldBarBox } from "../data/scoreboard"
import { shortGold, type TeamGold } from "../data/teamGold"
import { dragonIcon, dragonLabel, elementGlyph, elementName, soulLabel } from "./dragonIcon"
import { topRightBox } from "../data/topRight"
import { loadingCards } from "../data/loadingScreen"
import { soulPoint, SOUL_AT, type DragonElement, type DragonTally } from "../data/objectives"

/**
 * The notification that sits over the game.
 *
 * It is on screen for a few seconds and then gone. An overlay that lives there
 * for a whole match stops being read after the first two minutes and is in the
 * way for the other thirty-eight.
 *
 * It is still a COUNTDOWN rather than an alarm — the number keeps running while
 * the card is up, so what arrives is a reading, not a klaxon. The window
 * underneath is click-through, so none of this may look interactive.
 */
type Notice = {
  kind: "dragon" | "elder" | "item" | "boots" | "build" | "capture"
  inSeconds: number
  raisedAt: number
  /** Null until the Rift's element is knowable — see objectives.ts. */
  element: DragonElement | null
  /** Who has taken which drakes so far. */
  tally: DragonTally
  item?: {
    id: number; name: string; cost: number; index: number; total: number
    /** Worked out live from the inventory rather than read off the plan. */
    smart?: boolean
    cohort?: number
    lift?: number
  }
  boots?: { item: number; name: string; reason: string; keys: number[] }
  build?: {
    items: number[]; shapeLabel: string; cohortGames: number
    /** The plan was set aside mid-game because the actual build diverged. */
    recalibrated?: boolean
    note?: string
  }
}
type HudPlacement = { scale: number; nudge: HudNudge; topRight?: HudNudge; source: string | null }
type PlayerRank = {
  /** "DIAMOND II", ready to print. */
  label: string
  /** "diamond", for the emblem file — kept apart from the label because a
   *  Master player has no division and "master-" is not a file. */
  tier: string
  wins: number
  losses: number
}

type LoadingPlayer = {
  name: string
  championId: string | null
  championKey: number
  rank: PlayerRank | null
  /** Identity hidden by streamer mode — the account cannot be looked up. */
  hidden: boolean
  otp: boolean
  filled: boolean
  pro: string | null
}

type AppState = {
  gold: TeamGold | null
  loading: { allies: LoadingPlayer[]; enemies: LoadingPlayer[] } | null
  loadingNudge?: { x: number; y: number; scale: number }
  goldBar?: boolean
  notice: Notice | null
  levelHint: Ability | null
  hud: HudPlacement
}

const clock = (s: number) => {
  const v = Math.max(0, Math.floor(s))
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`
}

export default function Overlay() {
  const [notice, setNotice] = useState<Notice | null>(null)
  // Kept separate from `notice` so the card can animate OUT before it is
  // unmounted; dropping it the instant state clears would make it vanish.
  const [visible, setVisible] = useState(false)
  const [hint, setHint] = useState<Ability | null>(null)
  const [hud, setHud] = useState<HudPlacement | null>(null)
  const [gold, setGold] = useState<TeamGold | null>(null)
  // Whether the Alt+O bar is being asked for. A FLAG rather than the shell
  // withholding the numbers: the top-right readout wants the same gold and is
  // not toggled, and stripping data to control presentation is what made the
  // shop notices silently unreachable earlier.
  const [goldBar, setGoldBar] = useState(false)
  const [loading, setLoading] = useState<AppState["loading"]>(null)
  const [loadNudge, setLoadNudge] = useState({ x: 0, y: 0, scale: 0 })

  useEffect(() => {
    const report = () =>
      window.desktop.report?.({
        w: window.innerWidth,
        h: window.innerHeight,
        dpr: window.devicePixelRatio,
      })
    report()
    window.addEventListener("resize", report)
    return () => window.removeEventListener("resize", report)
  }, [])

  useEffect(() => {
    const apply = (s: AppState) => {
      if (s.notice) { setNotice(s.notice); setVisible(true) }
      else setVisible(false)
      setHint(s.levelHint ?? null)
      setHud(s.hud ?? null)
      setGold(s.gold ?? null)
      setGoldBar(s.goldBar === true)
      setLoading(s.loading ?? null)
      setLoadNudge(s.loadingNudge ?? { x: 0, y: 0, scale: 0 })
    }
    void window.desktop.getState().then(apply as never)
    return window.desktop.onState(apply as never)
  }, [])

  return (
    <div className="pointer-events-none h-full w-full bg-transparent">
      {hint && hud && <AbilityOutline ability={hint} hud={hud} />}
      {gold && goldBar && <GoldBar g={gold} />}
      {gold && hud && <TopRightGold g={gold} hud={hud} />}
      {loading && <LoadingBoard board={loading} nudge={loadNudge} />}
      {/* keyed on the notice so each one ASSEMBLES; without this React would
          reuse the element and the second notification would simply appear. */}
      {notice && <Card key={notice.raisedAt} n={notice} visible={visible} />}
    </div>
  )
}

/**
 * Team gold, above the scoreboard.
 *
 * Summed from the inventories Tab already shows, priced with static DDragon
 * data — arithmetic over public information rather than a number the game
 * hands out. The game deliberately does not total this for you, which is worth
 * knowing before relying on it.
 *
 * The BAR is the reading and the numbers are there to be exact: a lead is a
 * length, and a length is read without counting digits. It fills from the
 * centre outward so an even game sits still and a growing lead pushes visibly
 * to one side.
 *
 * Says how many players it counted whenever that is not five a side. A total
 * built from six players presented as if it were from ten is a wrong number
 * nobody could check.
 */
/**
 * The loading screen, annotated.
 *
 * Thirty to sixty seconds of a fixed picture, which is the one stretch of a
 * game with nothing to distract from and everything still to decide. The cards
 * are always in the same place — the loading screen does NOT respond to the HUD
 * Scale slider, so unlike the in-game overlay this is a function of resolution
 * alone.
 *
 * ⚠️ The champion NAME is drawn on every card on purpose, and it is not
 * decoration. This feature rests on an assumption that has never been tested:
 * that the order of the client's teamOne/teamTwo lists matches the order of the
 * portraits on screen. If it does not, the name will sit over the wrong face
 * and be obvious in one glance — where a rank alone would be silently wrong,
 * which is far worse than being visibly wrong.
 *
 * Ranks arrive after the names, because they are ten network lookups.
 */
/** Our own emblems, at the CDN ROOT — not under a versioned path. The same
 *  images the summoner page uses. */
const RANKS = "https://cdn2.loldata.cc/ranks"

/**
 * A status pill, in the site's own shape — a dark plate with a coloured hairline
 * and text, never a filled block. Over splash art a solid colour reads as part
 * of the picture; a plate with an outline reads as something laid on it.
 */
function Badge({
  text,
  colour,
  size,
  solid,
}: {
  text: string
  colour: string
  /** Card height, so the pill scales with the screen like everything else. */
  size: number
  solid?: boolean
}) {
  return (
    <span
      className="whitespace-nowrap rounded-[2px] font-jetbrains font-bold uppercase leading-none tracking-[0.1em]"
      style={{
        fontSize: Math.round(size * 0.022),
        padding: `${size * 0.008}px ${size * 0.014}px`,
        color: solid ? "#040a0c" : colour,
        background: solid ? colour : "rgba(4,10,12,0.88)",
        boxShadow: solid
          ? "0 2px 7px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.75)"
          : `inset 0 0 0 1px ${colour}99, 0 2px 7px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.75)`,
      }}
    >
      {text}
    </span>
  )
}

const winrate = (r: { wins: number; losses: number }): number => {
  const total = r.wins + r.losses
  return total > 0 ? (r.wins / total) * 100 : 0
}

function LoadingBoard({
  board,
  nudge,
}: {
  board: NonNullable<AppState["loading"]>
  nudge: { x: number; y: number; scale: number }
}) {
  const [screen, setScreen] = useState({ width: window.innerWidth, height: window.innerHeight })

  useEffect(() => {
    const onResize = () => setScreen({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const boxes = loadingCards(
    screen,
    { allies: board.allies.length, enemies: board.enemies.length },
    undefined,
    nudge
  )
  const rows = [...board.allies, ...board.enemies]

  return (
    <>
      {boxes.map((box, i) => {
        const p = rows[i]
        if (!p) return null
        const accent = box.ally ? "#00d992" : "#ff6286"

        return (
          <div
            key={i}
            className="ds-in pointer-events-none absolute flex flex-col items-center justify-center"
            style={{
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              animationDelay: `${i * 40}ms`,
            }}
          >
            {/* TWO grounds, because one layer cannot do both jobs. The wide
                one takes the whole card down a stop so the splash stops
                competing; the tight one sits under the emblem and text, where
                the contrast actually has to be won. Both reach zero inside the
                card, so no edge is drawn over the art. */}
            <span
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(72% 60% at 50% 50%," +
                  " rgba(4,10,12,0.62) 0%, rgba(4,10,12,0.48) 44%," +
                  " rgba(4,10,12,0.24) 70%, rgba(4,10,12,0) 92%)",
              }}
            />
            <span
              className="absolute"
              style={{
                left: "2%",
                right: "2%",
                top: "16%",
                bottom: "16%",
                background:
                  "radial-gradient(56% 48% at 50% 48%," +
                  " rgba(4,10,12,0.93) 0%, rgba(4,10,12,0.86) 30%," +
                  " rgba(4,10,12,0.62) 52%, rgba(4,10,12,0.28) 70%," +
                  " rgba(4,10,12,0) 88%)",
              }}
            />

            {/* ⚠️ OUR emblem, from our own CDN at /ranks — the same image and
                the same path the summoner page uses. Not the client's mini
                crest and not a community mirror: one rank should not look like
                two different things across our own products. */}
            {/* ⚠️ A real drop shadow under the emblem, not a glow. These sit
                over splash art that is bright in places and black in others,
                and a coloured glow vanishes against the bright half. A dark
                shadow works against both. */}
            {p.rank ? (
              <img
                src={`${RANKS}/${p.rank.tier}.png`}
                alt=""
                className="relative"
                style={{
                  width: box.width * 0.46,
                  height: box.width * 0.46,
                  objectFit: "contain",
                  filter:
                    "drop-shadow(0 2px 5px rgba(0,0,0,1))" +
                    " drop-shadow(0 4px 12px rgba(0,0,0,0.95))" +
                    " drop-shadow(0 0 22px rgba(0,0,0,0.85))",
                }}
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.visibility = "hidden"
                }}
              />
            ) : (
              // No emblem request for a player without one: cdn2/ranks has no
              // unranked.png — the site uses a local file — so asking would be
              // a guaranteed 404 on every card of every hidden account.
              <span
                aria-hidden
                className="relative rotate-45"
                style={{
                  width: box.width * 0.1,
                  height: box.width * 0.1,
                  boxShadow: `inset 0 0 0 1px ${accent}55`,
                  filter: "drop-shadow(0 2px 6px rgba(0,0,0,1)) drop-shadow(0 0 14px rgba(0,0,0,0.8))",
                }}
              />
            )}

            <div
              className="relative flex flex-col items-center"
              style={{
                // Three shadows, tight to wide: definition, weight, and a
                // halo that keeps a thin letter legible over bright armour.
                // Four, tight to wide. Over splash art one shadow either hugs
                // the glyph and leaves it swimming, or spreads and leaves the
                // edges soft; stacking them does both.
                textShadow:
                  "0 0 2px rgba(0,0,0,1), 0 1px 3px rgba(0,0,0,1)," +
                  " 0 3px 9px rgba(0,0,0,0.95), 0 0 22px rgba(0,0,0,0.9)",
                marginTop: box.height * 0.008,
              }}
            >
              {/* ⚠️ Streamer mode is not "unranked". The account cannot be
                  looked up at all, so we know nothing about them — and saying
                  UNRANKED would be a claim we have no basis for. */}
              {p.hidden ? (
                <p
                  className="whitespace-nowrap font-jetbrains font-bold uppercase leading-none tracking-[0.16em]"
                  style={{ fontSize: Math.round(box.height * 0.028), color: "#c98bff" }}
                >
                  streamer mode
                </p>
              ) : (
                <p
                  className="whitespace-nowrap font-chakrapetch font-bold uppercase leading-none tracking-[0.08em]"
                  style={{ fontSize: Math.round(box.height * 0.048), color: accent }}
                >
                  {p.rank?.label ?? "unranked"}
                </p>
              )}

              {p.rank && p.rank.wins + p.rank.losses > 0 && (
                <>
                  <p
                    className="whitespace-nowrap font-jetbrains uppercase leading-none tracking-[0.14em] text-flash/55"
                    style={{ fontSize: Math.round(box.height * 0.027), marginTop: box.height * 0.018 }}
                  >
                    {p.rank.wins + p.rank.losses} games
                  </p>
                  <p
                    className="whitespace-nowrap font-chakrapetch font-bold leading-none tabular-nums"
                    style={{ fontSize: Math.round(box.height * 0.036), marginTop: box.height * 0.012 }}
                  >
                    <span style={{ color: "#00d992" }}>{p.rank.wins}W</span>
                    <span className="text-flash/30"> · </span>
                    <span style={{ color: "#ff6286" }}>{p.rank.losses}L</span>
                    <span className="text-flash/30"> · </span>
                    <span
                      style={{
                        color:
                          winrate(p.rank) >= 55 ? "#00d992"
                          : winrate(p.rank) >= 48 ? "#d7d8d9"
                          : "#ff6286",
                      }}
                    >
                      {winrate(p.rank).toFixed(0)}%
                    </span>
                  </p>
                </>
              )}

              {/* The badges: only what is TRUE of this player, never a row of
                  empty slots. A pro is named, because the name is the point. */}
              {(p.pro || p.otp || p.filled) && (
                <span
                  className="flex items-center gap-1"
                  style={{ marginTop: box.height * 0.022 }}
                >
                  {p.pro && (
                    <Badge text={p.pro} colour="#FFB615" size={box.height} solid />
                  )}
                  {p.otp && <Badge text="OTP" colour="#00d992" size={box.height} />}
                  {p.filled && <Badge text="FILLED" colour="#FFB615" size={box.height} />}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}

/**
 * The gold lead, as one more field of the game's own top-right strip.
 *
 * Sits to the LEFT of the kill counter, at the same height and with the same
 * gap the game leaves between its own fields, so it reads as part of the row
 * rather than as something laid over it. The strip's own translucent ground is
 * continued leftwards underneath, fading out, because a readout with no ground
 * under it would float.
 *
 * Deliberately just a chevron and a number. The row it joins is four terse
 * fields; a fifth one that explained itself would be the loud one.
 *
 * Not toggled by Alt+O — that summons the wide bar over the scoreboard. This is
 * meant to be permanent and unnoticed, which is why it says so little.
 */
function TopRightGold({ g, hud }: { g: TeamGold; hud: HudPlacement }) {
  const [screen, setScreen] = useState({ width: window.innerWidth, height: window.innerHeight })

  useEffect(() => {
    const onResize = () => setScreen({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const lead = g.ours - g.theirs
  // Its OWN nudge: hud.nudge aligns the ability outline at the bottom of the
  // screen and has nothing to do with this corner.
  const box = topRightBox(screen, { scale: hud.scale, nudge: hud.topRight })

  // Level is not "ahead by nothing" — it is its own reading, and an arrow
  // pointing either way would be a lie about a tie.
  const even = Math.abs(lead) < 100
  const ahead = lead > 0
  const colour = even ? "rgba(215,216,217,0.55)" : ahead ? "#00d992" : "#FFB615"

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
    >
      <div
        className="absolute inset-0 flex items-center justify-end gap-[0.14em]"
        style={{
          color: colour,
          fontSize: box.height * 0.44,
          // No ground behind it, so the text carries its own legibility. Two
          // shadows: a tight dark one for edge definition against bright
          // terrain, and a wider soft one so it does not shimmer when the
          // camera moves over grass.
          textShadow: "0 1px 2px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.75)",
        }}
      >
        {!even && (
          <svg
            width={box.height * 0.38}
            height={box.height * 0.38}
            viewBox="0 0 10 10"
            className="shrink-0"
            style={{
              transform: ahead ? undefined : "rotate(180deg)",
              // text-shadow does not reach an SVG, so it gets its own — without
              // this the chevron is the one element with no contrast behind it.
              filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.95))",
            }}
          >
            <path d="M 1.5 6.5 L 5 3 L 8.5 6.5" fill="none" stroke={colour} strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        <span className="font-chakrapetch font-bold leading-none tabular-nums">
          {even ? "0" : shortGold(Math.abs(lead))}
        </span>
      </div>
    </div>
  )
}

function GoldBar({ g }: { g: TeamGold }) {
  const [screen, setScreen] = useState({ width: window.innerWidth, height: window.innerHeight })

  useEffect(() => {
    const onResize = () => setScreen({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const box = goldBarBox(screen)
  const total = g.ours + g.theirs
  // An empty scoreboard is 50/50 rather than a divide by zero.
  const share = total > 0 ? g.ours / total : 0.5
  const lead = g.ours - g.theirs
  const partial = g.oursCounted !== 5 || g.theirsCounted !== 5

  const ahead = lead > 0
  const accent = ahead ? "#00d992" : "#FFB615"

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{ left: box.left, top: box.top, width: box.width }}
    >
      {/* Feathered ground, reaching zero inside its own box so no edge shows
          over the game — the same treatment the side notification uses. */}
      <span
        className="pointer-events-none absolute -inset-x-8 -inset-y-5 blur-[8px]"
        style={{
          background:
            "radial-gradient(60% 66% at 50% 50%," +
            " rgba(4,10,12,0.86) 0%, rgba(4,10,12,0.55) 34%," +
            " rgba(4,10,12,0.22) 50%, rgba(4,10,12,0) 64%)",
        }}
      />

      <p className="relative mb-1.5 text-center font-jetbrains text-[11px] font-bold uppercase tracking-[0.2em]">
        {lead === 0 ? (
          <span className="text-flash/45">even</span>
        ) : (
          <span style={{ color: accent }}>
            {/* the number keeps its case — the label's uppercase was turning
                2.5k into 2.5K while the totals above still said k */}
            <span className="normal-case">
              {ahead ? "+" : "−"}
              {shortGold(Math.abs(lead))}
            </span>{" "}
            {ahead ? "ahead" : "behind"}
          </span>
        )}
        {partial && (
          <span className="text-[9px] font-normal text-flash/30">
            {" · "}
            {g.oursCounted}v{g.theirsCounted} counted
          </span>
        )}
      </p>

      <div className="relative flex items-center gap-2.5" style={{ textShadow: "0 1px 5px rgba(0,0,0,0.95)" }}>
        <span className="w-[52px] shrink-0 text-right font-chakrapetch text-[15px] font-bold tabular-nums text-jade">
          {shortGold(g.ours)}
        </span>

        <span className="relative h-[5px] min-w-0 flex-1 overflow-hidden rounded-[2px] bg-flash/[0.07]">
          <span
            className="absolute inset-y-0 left-0 rounded-[2px] transition-[width] duration-500 ease-out"
            style={{ width: `${share * 100}%`, background: "rgba(0,217,146,0.75)" }}
          />
          <span
            className="absolute inset-y-0 right-0 rounded-[2px] transition-[width] duration-500 ease-out"
            style={{ width: `${(1 - share) * 100}%`, background: "rgba(255,182,21,0.6)" }}
          />
          {/* the halfway mark, so a lead is measured against something */}
          <span className="absolute inset-y-[-2px] left-1/2 w-px bg-liquirice/80" />
        </span>

        <span className="w-[52px] shrink-0 font-chakrapetch text-[15px] font-bold tabular-nums text-citrine">
          {shortGold(g.theirs)}
        </span>
      </div>

      <Frame />
    </div>
  )
}

/**
 * The shoulder below the gold bar.
 *
 * BOTTOM only. There is nothing above because the assembly hangs UNDER the
 * scoreboard: the ornament closes it off downwards, and a second rule on top
 * would draw a line through the thing it is meant to sit against.
 *
 * Drawn once and mirrored on Y rather than re-authored upside down, so the two
 * orientations cannot drift apart. The mirror sits on the row, never on the
 * text — flipping the whole assembly would leave the numbers upside down.
 *
 * One continuous profile per side: a low tail outside, a diagonal rise, then a
 * plateau running toward the centre, mirrored, with the break in the middle
 * where the numbers live.
 *
 * The difference between a hairline and an ornament is LAYERS. A single stroke
 * is a divider; this is a primary profile, a dimmer secondary running under the
 * plateau, ticks hanging from it, a filled node where the geometry turns, and a
 * cap closing the tail. Each one marks something real about the shape rather
 * than decorating it.
 *
 * ⚠️ Only the plateau stretches. The shoulder is fixed-size because a path
 * scaled with preserveAspectRatio="none" distorts its diagonals, and this bar's
 * width follows the screen. The plateau's ticks are a repeating gradient for
 * the same reason — a pattern repeats at any length, where a drawn one would
 * smear.
 */
function Frame() {
  const line = "rgba(0,217,146,0.6)"
  const dim = "rgba(0,217,146,0.26)"

  const shoulder = (mirror: boolean) => (
    <svg width="66" height="22" viewBox="0 0 66 22" aria-hidden
         className="shrink-0 overflow-visible"
         style={mirror ? { transform: "scaleX(-1)" } : undefined}>
      {/* the profile */}
      <path d="M 4 16.5 L 18 16.5 L 33 3.5 L 66 3.5"
            fill="none" stroke={line} strokeWidth="1.2"
            strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {/* a second run under the plateau, stopping short — a parallel that goes
          the whole way reads as a mistake rather than as depth */}
      <path d="M 40 8 L 66 8" fill="none" stroke={dim} strokeWidth="1"
            vectorEffect="non-scaling-stroke" />
      {/* ticks hanging from it */}
      <path d="M 46 8 L 46 11 M 54 8 L 54 10" fill="none" stroke={dim}
            strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {/* the node where the rise meets the plateau — the one place the shape
          changes its mind, so the one place worth marking */}
      <rect x="30.5" y="1" width="5" height="5" fill={line}
            transform="rotate(45 33 3.5)" />
      {/* the tail closes rather than fading out */}
      <path d="M 4 13 L 4 20" fill="none" stroke={line} strokeWidth="1.2"
            vectorEffect="non-scaling-stroke" />
    </svg>
  )

  /* the stretching half: the plateau, its dim parallel, and repeating ticks */
  const plateau = () => (
    <span className="relative h-[22px] min-w-0 flex-1">
      <span className="absolute left-0 right-0 top-[3px] h-px" style={{ background: line }} />
      <span className="absolute left-0 right-0 top-[7.5px] h-px" style={{ background: dim }} />
      <span
        className="absolute left-0 right-0 top-[8px] h-[3px]"
        style={{
          background: `repeating-linear-gradient(90deg, ${dim} 0 1px, transparent 1px 14px)`,
        }}
      />
    </span>
  )

  return (
    <div
      aria-hidden
      className="relative mt-1 flex h-[22px] items-start"
      style={{ transform: "scaleY(-1)" }}
    >
      {shoulder(false)}
      {plateau()}
      {/* the break the numbers sit in */}
      <span className="w-[76px] shrink-0" />
      {plateau()}
      {shoulder(true)}
    </div>
  )
}

/**
 * The ring around the ability to level.
 *
 * Static advice: which ability comes next is the skill order we already publish
 * for this champion, known before the game began. It marks a button the player
 * is already looking at rather than telling them something about the match.
 *
 * Drawn as a frame with corner ticks rather than a filled highlight — the icon
 * underneath has to stay readable, and a wash over it would fight the art.
 */
function AbilityOutline({ ability, hud }: { ability: Ability; hud: HudPlacement }) {
  const [screen, setScreen] = useState({ width: window.innerWidth, height: window.innerHeight })

  useEffect(() => {
    const onResize = () => setScreen({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const box = abilityBox(ability, screen, hud)
  const pad = 3 // sit just outside the icon, not on top of its edge

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: box.left - pad,
        top: box.top - pad,
        width: box.size + pad * 2,
        height: box.size + pad * 2,
      }}
    >
      <span
        className="absolute inset-0 rounded-[3px]"
        style={{
          border: "2px solid #00d992",
          boxShadow: "0 0 14px rgba(0,217,146,0.75), inset 0 0 10px rgba(0,217,146,0.25)",
          animation: "abilityPulse 1.6s ease-in-out infinite",
        }}
      />
      {/* corner ticks, the same mark the app's panels use */}
      {[
        "top-[-3px] left-[-3px] border-t-2 border-l-2",
        "top-[-3px] right-[-3px] border-t-2 border-r-2",
        "bottom-[-3px] left-[-3px] border-b-2 border-l-2",
        "bottom-[-3px] right-[-3px] border-b-2 border-r-2",
      ].map((cls) => (
        <span key={cls} className={`absolute h-2.5 w-2.5 border-jade ${cls}`} />
      ))}
    </div>
  )
}

/**
 * One team's drakes, as four slots rather than a number.
 *
 * Four because that is the soul, so the empty slots carry the information a
 * bare count does not: how close either side is to ending the dragon game. The
 * filled ones use the element SYMBOLS — at this size a portrait is a smudge.
 *
 * Ours reads in jade, theirs in plain grey. No light outlines anywhere: the
 * slots are fills, which is also what keeps them legible over bright terrain.
 */
function TeamTally({
  label,
  taken,
  ours = false,
  accent,
}: {
  label: string
  taken: DragonElement[]
  ours?: boolean
  /** Set when THIS team is one drake from the soul; marks the slot that ends it. */
  accent?: string
}) {
  const plate = ours ? "bg-jade/[0.10]" : "bg-flash/[0.07]"
  const empty = ours ? "bg-jade/[0.05]" : "bg-flash/[0.035]"
  const decisive = accent ? taken.length : -1
  // The slots land one after another, our side first — and leave in the exact
  // reverse: last to arrive is first to go. Two delays per slot, picked by the
  // direction, because one element cannot carry two animation-delays.
  const step = (i: number) =>
    ({
      "--in-delay": `${(ours ? 430 : 505) + i * 32}ms`,
      "--out-delay": `${(ours ? 70 : 0) + (SOUL_AT - 1 - i) * 22}ms`,
    }) as CSSProperties

  return (
    <span className="flex items-center gap-1.5">
      <span className="ds-late font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/30">
        {label}
      </span>
      <span
        className={`ds-late font-chakrapetch text-[15px] font-bold leading-none tabular-nums ${
          ours ? "text-jade" : "text-flash/70"
        }`}
      >
        {taken.length}
      </span>
      <span className="ml-0.5 flex items-center gap-[3px]">
        {Array.from({ length: SOUL_AT }, (_, i) => {
          const el = taken[i]
          return el ? (
            <span key={i} className={`ds-slot grid h-[19px] w-[19px] place-items-center rounded-[2px] ${plate}`} style={step(i)}>
              <img src={elementGlyph(el)} alt={elementName(el)} title={elementName(el)} className="h-[15px] w-[15px]" />
            </span>
          ) : i === decisive ? (
            // The one that would end it. A fill and a ring, never a pale
            // outline — this has to hold up over a bright dragon pit.
            <span
              key={i}
              className="ds-slot h-[19px] w-[19px] rounded-[2px]"
              style={{ ...step(i), background: `${accent}22`, boxShadow: `inset 0 0 0 1px ${accent}` }}
            >
              {/* the pulse rides an inner element so its opacity animation does
                  not fight the slot's own arrival */}
              <span className="soul-pulse block h-full w-full rounded-[2px]" style={{ background: `${accent}18` }} />
            </span>
          ) : (
            <span key={i} className={`ds-slot h-[19px] w-[19px] rounded-[2px] ${empty}`} style={step(i)} />
          )
        })}
      </span>
    </span>
  )
}

/**
 * A number that LANDS rather than appears.
 *
 * Death Stranding's readouts churn for a moment and resolve left to right, so
 * the value arrives as a result rather than as a label. Only digits churn — the
 * colon holds, keeping the clock's shape stable while its contents settle.
 *
 * Keyed on the notice, deliberately NOT on the value: the countdown reissues
 * four times a second, and re-settling on every tick would be a slot machine
 * rather than an arrival.
 */
function Digits({ value, settleKey }: { value: string; settleKey: number }) {
  const [churn, setChurn] = useState<string | null>(null)
  const latest = useRef(value)
  latest.current = value

  useEffect(() => {
    const started = Date.now()
    let raf = 0
    const tick = () => {
      const p = (Date.now() - started) / 420
      if (p >= 1) return setChurn(null)
      const chars = latest.current.split("")
      // resolves a little faster than time passes, so the last digit is not
      // still spinning as the animation ends
      const settled = Math.floor(p * chars.length * 1.35)
      setChurn(
        chars
          .map((c, i) => (i < settled || !/\d/.test(c) ? c : String(Math.floor(Math.random() * 10))))
          .join("")
      )
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [settleKey])

  return <>{churn ?? value}</>
}

/** A champion's face from its numeric key — the notice carries keys, and the
 *  icon path wants the slug. Renders nothing rather than a broken image while
 *  the lookup is in flight or if it fails. */
function ChampFace({ champKey }: { champKey: number }) {
  const [slug, setSlug] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void championById(champKey).then((c) => { if (alive) setSlug(c?.slug ?? null) }).catch(() => undefined)
    return () => { alive = false }
  }, [champKey])

  if (!slug) return null
  return (
    <img
      src={`https://cdn2.loldata.cc/16.16.1/img/champion/${slug}.png`}
      alt=""
      className="h-6 w-6 rounded-[2px] ring-1 ring-citrine/30"
    />
  )
}

function Card({ n, visible }: { n: Notice; visible: boolean }) {
  const [left, setLeft] = useState(n.inSeconds)
  const base = useRef({ at: n.raisedAt, value: n.inSeconds })

  useEffect(() => {
    base.current = { at: n.raisedAt, value: n.inSeconds }
    setLeft(n.inSeconds)
  }, [n.raisedAt, n.inSeconds])

  useEffect(() => {
    const id = setInterval(() => {
      setLeft(base.current.value - (Date.now() - base.current.at) / 1000)
    }, 250)
    return () => clearInterval(id)
  }, [])

  // An item notice borrows the card and replaces its contents: same arrival,
  // same rail, different thing being said.
  const shopping = n.kind === "item" && !!n.item
  const boots = n.kind === "boots" && !!n.boots
  const opening = n.kind === "build" && !!n.build
  // ⚠️ Its own kind, borrowing nothing. Every other notice is advice; this one
  // is a DISCLOSURE, and it must not look like a tip about dragons.
  const capturing = n.kind === "capture"
  const CDN = "https://cdn2.loldata.cc/16.16.1"
  const elder = n.kind === "elder"

  // At three, the next drake is not one of four — it is the last one, and that
  // changes the decision rather than the description. Citrine when the enemy
  // can end it, because then the reading is "stop them", not "go get it".
  const soul = n.kind === "dragon" ? soulPoint(n.tally) : null
  const accent = elder || (soul && soul !== "ours") ? "#FFB615" : "#00d992"

  // Riot's base dragon portrait is a dark red head with a glowing mouth — all
  // but identical to the Infernal one. Drawn as-is it makes "we do not know yet"
  // look exactly like one of the six specific answers, which is worse than
  // saying nothing. Colour means the element is known; grey means it is not.
  const unknownElement = n.kind === "dragon" && !n.element

  return (
    <div className={`absolute right-0 top-[13%] w-[440px] ${visible ? "ds-in" : "ds-out"}`}>
      {/* Feathered darkening rather than a plate: its alpha reaches zero well
          inside its own box, so there is no edge to notice over the art. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-x-12 -inset-y-10 blur-[10px]"
        style={{
          background:
            "radial-gradient(58% 62% at 54% 50%," +
            " rgba(4,10,12,0.90) 0%," +
            " rgba(4,10,12,0.66) 24%," +
            " rgba(4,10,12,0.36) 40%," +
            " rgba(4,10,12,0.13) 52%," +
            " rgba(4,10,12,0) 62%)",
        }}
      />

      {/* the rail, running in off the right edge */}
      <svg
        aria-hidden
        viewBox="0 0 440 12"
        preserveAspectRatio="none"
        className="absolute inset-x-0 top-0 h-[12px] w-full overflow-visible"
        style={{ filter: `drop-shadow(0 0 5px ${accent}88)` }}
      >
        {/* pathLength=1 so the draw is expressed in fractions, not in the user
            units of a viewBox that gets stretched */}
        <path
          className="ds-rail"
          d="M 2 11 L 11 2 L 440 2"
          fill="none"
          stroke={accent}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          opacity="0.9"
          pathLength={1}
          strokeDasharray={1}
        />
        {/* The rotation lives on the group and the scale on the rect. Put both
            on one element and the animated transform replaces the attribute —
            which is how the diamond became a square once it landed. */}
        <g transform="rotate(45 362.5 2)">
          <rect className="ds-mark" x="358" y="-2.5" width="9" height="9" fill={accent} />
        </g>
      </svg>

      <div
        className="relative pl-5 pr-3 pt-[15px]"
        style={{ textShadow: "0 1px 6px rgba(0,0,0,0.95), 0 0 18px rgba(0,0,0,0.85)" }}
      >
        <div className="flex items-center gap-3.5">
          {/* ⚠️ A DRAWN mark, not an image with an empty src. Every other
              notice has a portrait to show; this one is about the app itself,
              and a recording dot is the one symbol nobody has to be taught. */}
          {capturing ? (
            <span
              className="ds-icon grid h-11 w-11 shrink-0 place-items-center rounded-[3px] ring-1 ring-jade/25"
              style={{ background: "rgba(4,10,12,0.9)", boxShadow: `0 0 14px ${accent}33` }}
            >
              <span
                className="beat block h-[13px] w-[13px] rounded-full"
                style={{ background: accent, boxShadow: `0 0 12px ${accent}` }}
              />
            </span>
          ) : (
          <img
            src={
              shopping
                ? `${CDN}/img/item/${n.item!.id}.png`
                : boots
                  ? `${CDN}/img/item/${n.boots!.item}.png`
                  : opening
                    ? `${CDN}/img/item/${n.build!.items[0]}.png`
                    : dragonIcon(n.kind, n.element)
            }
            alt=""
            // A solid portrait now, not a transparent glyph, so it takes the
            // squared corner and hairline the rest of the app uses.
            className="ds-icon block h-11 w-11 shrink-0 rounded-[3px] ring-1 ring-jade/25"
            style={{
              boxShadow: `0 0 14px ${accent}33, 0 2px 8px rgba(0,0,0,0.9)`,
              filter: unknownElement ? "grayscale(1) brightness(1.12) contrast(0.92)" : undefined,
            }}
          />
          )}

          <div className="min-w-0">
            <p
              className={`ds-eyebrow font-jetbrains text-[9px] uppercase tracking-[0.28em] ${soul ? "soul-pulse" : ""}`}
              style={{ color: accent }}
            >
              {capturing
                ? "recording"
                : boots
                ? "boots · this matchup"
                : opening
                  ? n.build!.recalibrated
                    ? `recalibrated · ${n.build!.cohortGames.toLocaleString()} games`
                    : `build · ${n.build!.cohortGames.toLocaleString()} games`
                  : shopping
                ? n.item!.smart
                  // A live answer, not a line of the plan — and it says how many
                  // games it came from, because "smart" on its own is a claim.
                  ? `smart pick · ${(n.item!.cohort ?? 0).toLocaleString()} games`
                  : `next item · ${n.item!.index} of ${n.item!.total}`
                : soul === "ours"
                  ? "soul point · yours"
                  : soul === "theirs"
                    ? "soul point · enemy"
                    : soul === "both"
                      ? "soul point · contested"
                      : "lolData"}
            </p>
            <p className="ds-head whitespace-nowrap font-chakrapetch text-[19px] font-bold leading-tight text-flash">
              {capturing ? (
                <>
                  lolData is <span style={{ color: accent }}>recording</span> your screen
                </>
              ) : boots ? (
                <>
                  {n.boots!.name}{" "}
                  <span style={{ color: accent }}>recommended</span>
                </>
              ) : opening ? (
                n.build!.recalibrated ? (
                  <>
                    Build{" "}
                    <span style={{ color: accent }}>recalibrated</span>
                  </>
                ) : (
                  <>
                    Build for{" "}
                    <span style={{ color: accent }}>this comp</span>
                  </>
                )
              ) : shopping ? (
                <>
                  {n.item!.name} is{" "}
                  <span style={{ color: accent }}>purchasable</span>
                </>
              ) : (
                <>
                  {soul ? soulLabel(n.element) : dragonLabel(n.kind, n.element)} is spawning in{" "}
                  <span className="tabular-nums" style={{ color: accent }}>
                    <Digits value={clock(left)} settleKey={n.raisedAt} />
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {boots ? (
          <div className="relative mt-3 flex items-center gap-2.5 pt-2.5">
            <span aria-hidden className="ds-rule absolute inset-x-0 top-0 h-px bg-jade/[0.18]" />
            <span className="ds-late max-w-[190px] font-chakrapetch text-[12px] leading-tight text-flash/55">
              {n.boots!.reason}
            </span>
            {/* the faces it is talking about, so the reason can be checked */}
            <span className="ds-late ml-auto flex items-center gap-1">
              {n.boots!.keys.slice(0, 5).map((k) => (
                <ChampFace key={k} champKey={k} />
              ))}
            </span>
          </div>
        ) : opening && n.build!.recalibrated ? (
          <div className="relative mt-3 flex items-center gap-3 pt-2.5">
            <span aria-hidden className="ds-rule absolute inset-x-0 top-0 h-px bg-jade/[0.18]" />
            <span className="ds-late font-jetbrains text-[9px] uppercase tracking-[0.22em] text-flash/35">
              read off
            </span>
            <span className="ds-late font-chakrapetch text-[13px] font-bold text-flash/70">
              {n.build!.shapeLabel}
            </span>
            {n.build!.note && (
              <span
                className="ds-late ml-auto font-chakrapetch text-[15px] font-bold tabular-nums"
                style={{ color: accent }}
              >
                {n.build!.note}
              </span>
            )}
          </div>
        ) : opening ? (
          <div className="relative mt-3 flex items-center gap-2 pt-2.5">
            <span aria-hidden className="ds-rule absolute inset-x-0 top-0 h-px bg-jade/[0.18]" />
            {n.build!.items.map((id, i) => (
              <span key={`${id}-${i}`} className="ds-late relative">
                <img src={`${CDN}/img/item/${id}.png`} alt="" className="block h-8 w-8 rounded-[3px] ring-1 ring-jade/20" />
                <span className="absolute -bottom-[3px] -right-[3px] rounded-[2px] bg-liquirice px-[3px] font-jetbrains text-[8px] font-bold leading-[12px] text-jade">
                  {i + 1}
                </span>
              </span>
            ))}
            <span className="ds-late ml-auto max-w-[120px] text-right font-jetbrains text-[8.5px] uppercase leading-tight tracking-[0.14em] text-flash/25">
              {n.build!.shapeLabel}
            </span>
          </div>
        ) : shopping ? (
          <div className="relative mt-3 flex items-center gap-3 pt-2.5">
            <span aria-hidden className="ds-rule absolute inset-x-0 top-0 h-px bg-jade/[0.18]" />
            <span className="ds-late font-jetbrains text-[9px] uppercase tracking-[0.22em] text-flash/35">
              cost
            </span>
            <span className="ds-late font-chakrapetch text-[15px] font-bold tabular-nums" style={{ color: accent }}>
              {n.item!.cost.toLocaleString()}
            </span>
            {/* Says what is still owed, not the shelf price — the components
                already carried have been taken off it. */}
            <span className="ds-late font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/25">
              remaining
            </span>
          </div>
        ) : (
        <div className="relative mt-3 flex items-center gap-3 pt-2.5">
          <span aria-hidden className="ds-rule absolute inset-x-0 top-0 h-px bg-jade/[0.18]" />
          <span className="ds-late font-jetbrains text-[9px] uppercase tracking-[0.22em] text-flash/35">
            drakes
          </span>
          <TeamTally
            label="you"
            taken={n.tally.ours}
            ours
            accent={soul === "ours" || soul === "both" ? accent : undefined}
          />
          <span aria-hidden className="h-5 w-px bg-jade/15" />
          <TeamTally
            label="enemy"
            taken={n.tally.theirs}
            accent={soul === "theirs" || soul === "both" ? accent : undefined}
          />
        </div>
        )}

      </div>
    </div>
  )
}
