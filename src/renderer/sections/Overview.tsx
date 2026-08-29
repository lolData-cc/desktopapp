import { useEffect, useRef, useState } from "react"
import { resolvePage, type Perk, type Style } from "../../data/perks"
import { CDN, type AppState } from "../types"
import Scoreboard from "./Scoreboard"

/** Our own emblems, at the CDN ROOT — the same path the summoner page uses. */
const RANKS = "https://cdn2.loldata.cc/ranks"

/** What the client's phase means to a person. The raw names are Riot's
 *  vocabulary; nobody outside the codebase should have to read "PreEndOfGame". */
const PHASE_COPY: Record<string, { title: string; sub: string }> = {
  None:            { title: "Standing by",     sub: "no game in progress" },
  Lobby:           { title: "In the lobby",    sub: "waiting for the queue" },
  Matchmaking:     { title: "In queue",        sub: "looking for a match" },
  ReadyCheck:      { title: "Match found",     sub: "accept to continue" },
  ChampSelect:     { title: "Champion select", sub: "picking" },
  GameStart:       { title: "Loading in",      sub: "the game is starting" },
  InProgress:      { title: "In game",         sub: "match under way" },
  Reconnect:       { title: "Reconnecting",    sub: "rejoining the match" },
  WaitingForStats: { title: "Game over",       sub: "waiting on the result" },
  PreEndOfGame:    { title: "Game over",       sub: "wrapping up" },
  EndOfGame:       { title: "Game over",       sub: "reading the result" },
}

/**
 * The client is not running.
 *
 * This screen used to be a card in the middle of a dark rectangle, apologising.
 * It is a DOCUMENT now: one lit spine down the left, and a short manifest of
 * what this installation will do the moment League opens — each line true of
 * the app right now, each with the one control that changes it.
 *
 * The reasoning, because it is the third attempt and the first two were wrong:
 *
 * ⚠️ There is no panel. DsPanel has no plate — a soft radial glow, two
 * hairlines and a rhombus, "no edge to notice, because there is no edge" — so
 * anything placed behind it shows through and competes with its light. That was
 * attempt one (a screen-sized word behind it) and attempt two (a light sweeping
 * inside it). The fix here is structural rather than compositional: nothing is
 * behind anything, because there is nothing to be behind.
 *
 * ⚠️ Every row is a promise about the NEXT game, read off state the app really
 * holds with the client shut. Nothing is invented and no number is a
 * placeholder: the HUD scale is parsed from League's on-disk config at launch,
 * the recording settings and library are local, the build profiles are on disk.
 * When `s` is null — the moment before the first state arrives — the rows are
 * not rendered at all, because unread state must never be printed as fact.
 *
 * ⚠️ The rows are READ, not pressed. An earlier version hung a control off
 * each one — preview the overlay, run a 15-second test recording, jump to
 * settings — and that is a developer's console, not a shipped app's empty
 * state. The only buttons left are the two things a person genuinely does here
 * and nowhere else: install a waiting update, and sign in. Everything else is
 * one click away in the navigation already.
 *
 * ⚠️ At most ONE citrine mark on the screen, chosen by a single expression. Two
 * would make a manifest read as a fault screen, which is the opposite of what
 * this is.
 */
export function Waiting({ s }: { s: AppState | null }) {
  // The library reports 0 bytes until it is asked. The same one-liner Matches,
  // Preferences and Recap all use.
  useEffect(() => {
    void window.desktop.listRecordings()
  }, [])

  const u = s?.update
  const updating =
    s?.canUpdate && u && (u.state === "available" || u.state === "downloading" || u.state === "ready")
      ? u
      : null

  /**
   * ⚠️ One expression, not three conditions. Citrine is this app's warning
   * colour, and a page wearing it twice reads as broken rather than as ready.
   */
  const alert: "capture" | "update" | null = s?.captureError
    ? "capture"
    : updating && updating.state !== "downloading"
      ? "update"
      : null

  const armed = s?.builds.filter((b) => b.enabled).length ?? 0

  return (
    <div className="standby ds-in relative flex h-full flex-col pl-[26px]">
      {/* ── the head: DsPanel's corner, mirrored. The rule arrives along the
             top and turns DOWN into the spine, so the page has a source rather
             than a frame. ⚠️ Fixed 60x14 and never stretched. */}
      <svg
        aria-hidden
        width="60"
        height="14"
        viewBox="0 0 60 14"
        className="absolute left-0 top-0 overflow-visible"
        style={{ filter: "drop-shadow(0 0 6px #00d99255)" }}
      >
        <path
          className="ds-rail"
          d="M 60 2 L 12 2 L 1 13"
          pathLength={1}
          strokeDasharray={1}
          fill="none"
          stroke="#00d992"
          strokeWidth="1"
          strokeLinejoin="round"
          opacity="0.75"
        />
        {/* Rotation on the <g>, scale on the <rect>: an animated transform
            REPLACES the attribute rather than composing with it. */}
        <g transform="rotate(45 12 2)">
          <rect className="ds-mark" x="8.5" y="-1.5" width="7" height="7" fill="#00d992" opacity="0.9" />
        </g>
      </svg>

      {/* The long run, dying before the right edge: a line that terminates in
          nothing cannot read as the top of a box. */}
      <span
        aria-hidden
        className="standby-run absolute left-[60px] right-0 top-[2px] h-px"
        style={{ background: "linear-gradient(90deg, rgba(0,217,146,0.50), rgba(0,217,146,0))" }}
      />

      {/* The spine, and the poll made visible: a bead leaves the mark every two
          seconds — the real retry interval — runs down, and gets no answer. */}
      <span aria-hidden className="standby-spine absolute bottom-0 left-0 top-[14px] w-px">
        <span className="standby-ping" />
      </span>

      <div className="pt-[18px]">
        <p className="ds-eyebrow font-jetbrains text-[9.5px] uppercase tracking-[0.3em] text-jade/50">
          no client · retrying every 2s
        </p>
        <h1 className="ds-head mt-2 font-chakrapetch text-[30px] font-bold leading-none tracking-tight text-flash/90">
          Ready when League is
        </h1>
      </div>

      {s && (
        <>
          {/* The frame that makes every row below honest: these are promises
              about the next game, not a report on this one. */}
          <p className="ds-late mt-8 font-jetbrains text-[9px] uppercase tracking-[0.28em] text-flash/25">
            when the game starts
          </p>

          <div className="mt-4 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {updating && (
              <Line
                i={0}
                mark={updating.state === "downloading" ? "standing" : alert === "update" ? "alert" : "on"}
                title={
                  updating.state === "ready"
                    ? `v${updating.next} is waiting to install`
                    : updating.state === "downloading"
                      ? `v${updating.next} is downloading`
                      : `v${updating.next} is ready to download`
                }
                truth={
                  updating.state === "ready"
                    ? "restarting now costs nothing — no game is running"
                    : updating.state === "downloading"
                      ? `${updating.percent}%`
                      : `you have v${updating.version}`
                }
                citrine={alert === "update"}
              >
                {/* Downloading gets no control: a status is not something to
                    press, and a disabled button still reads as one taken away. */}
                {updating.state === "ready" && (
                  <Act onClick={() => window.desktop.installUpdate()}>restart</Act>
                )}
                {updating.state === "available" && (
                  <Act onClick={() => void window.desktop.downloadUpdate()}>download</Act>
                )}
              </Line>
            )}

            {!s.account && (
              <Line
                i={1}
                mark="standing"
                title="lolData account"
                truth="signed out · sign in to use lolData AI and your plan"
                note="Opens your browser. This app never asks for a password."
              >
                <Act onClick={() => void window.desktop.signIn()}>sign in</Act>
              </Line>
            )}

            <Line
              i={2}
              mark={s.hud.source ? "on" : "standing"}
              title="Notices land on your HUD"
              truth={
                s.hud.source
                  ? `scale ${s.hud.scale.toFixed(2)} · read from your client config`
                  : "default scale · no client config found yet"
              }
            />

            <Line
              i={3}
              mark={s.captureError ? "alert" : s.settings.capture ? "on" : "standing"}
              title="Your games record themselves"
              truth={
                s.captureError
                  ? s.captureError
                  : s.settings.capture
                    ? `on · ${s.settings.captureFps} fps · ${gbOf(s.storage.recordings)} kept${
                        s.settings.captureBudgetGb === null ? " · no limit" : ` of ${s.settings.captureBudgetGb} GB`
                      }`
                    : "off · nothing is recorded"
              }
              citrine={!!s.captureError}
            />

            <Line
              i={4}
              mark={s.builds.length ? "on" : "standing"}
              title={`Item notices for ${s.builds.length} champion${s.builds.length === 1 ? "" : "s"}`}
              truth={
                s.builds.length
                  ? `${armed} armed · ${s.builds.length - armed} muted`
                  : "nothing saved yet · import from the site, or lock a champion in"
              }
            />
          </div>
        </>
      )}

      <div className="relative mt-auto shrink-0 pt-8">
        {/* DsPanel's descending ticks stood on their end, so the spine visibly
            runs out instead of stopping. */}
        <svg aria-hidden width="9" height="34" className="ds-late absolute -left-[26px] top-8">
          <path
            d="M 0.5 0 L 5 0 M 0.5 14 L 3.5 14 M 0.5 28 L 2.5 28"
            stroke="rgba(0,217,146,0.15)"
            strokeWidth="1"
            fill="none"
          />
        </svg>
        <p className="ds-late max-w-[54ch] font-chakrapetch text-[13px] leading-relaxed text-flash/35">
          The League client is not running. The app attaches by itself the moment it is — you do not
          have to come back here.
        </p>
      </div>
    </div>
  )
}

/** Bytes as the library reports them. Mirrors the formatter Preferences uses. */
const gbOf = (bytes: number) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`

/** One promise about the next game, hanging off the spine. */
function Line({
  i,
  mark,
  title,
  truth,
  note,
  citrine,
  children,
}: {
  i: number
  mark: "on" | "standing" | "alert"
  title: string
  truth: string
  note?: string
  citrine?: boolean
  children?: React.ReactNode
}) {
  const colour = mark === "alert" ? "#FFB615" : "#00d992"
  return (
    <div
      className="ds-row relative grid min-h-[70px] grid-cols-[1fr_auto] items-center gap-6"
      style={{ animationDelay: `${420 + Math.min(i, 6) * 45}ms` }}
    >
      {/* The branch off the spine. Rows are separated by SPACE, never a rule —
          a rule between them would draw the box this page does not have. */}
      <span aria-hidden className="absolute -left-[26px] top-1/2 h-px w-[12px] bg-jade/25" />
      <svg
        aria-hidden
        width="12"
        height="12"
        className="absolute -left-[13px] top-1/2 -mt-[6px] overflow-visible"
        style={mark === "standing" ? undefined : { filter: `drop-shadow(0 0 6px ${colour}73)` }}
      >
        <g transform="rotate(45 6 6)">
          <rect
            x="2.5"
            y="2.5"
            width="7"
            height="7"
            fill={mark === "standing" ? "none" : colour}
            stroke={mark === "standing" ? "rgba(0,217,146,0.40)" : undefined}
            strokeWidth={mark === "standing" ? 1 : undefined}
          />
        </g>
      </svg>

      <div className="min-w-0">
        <p className="font-chakrapetch text-[15px] font-bold leading-tight text-flash/85">{title}</p>
        <p
          className={`mt-1 truncate font-jetbrains text-[9.5px] uppercase tracking-[0.16em] ${
            citrine ? "text-citrine/70" : "text-flash/35"
          }`}
          title={truth}
        >
          {truth}
        </p>
        {note && (
          <p className="mt-1 font-jetbrains text-[8.5px] leading-relaxed text-flash/25">{note}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </div>
  )
}


/** The loud one. ⚠️ At most one of these on the screen at a time. */
const Act = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className="act-btn h-7 shrink-0 rounded-[3px] px-3 font-jetbrains text-[9px] uppercase tracking-[0.16em]"
  >
    {children}
  </button>
)

/** "DIAMOND" -> "Diamond". The API shouts its tiers; a card should not. */
const title = (t: string) => t.charAt(0) + t.slice(1).toLowerCase()

/**
 * A single word, the size of the screen, behind everything.
 *
 * The client's state as a film title: outlined rather than filled, because a
 * solid word that size fights the card in front of it while an outline reads
 * as depth. It is the ONLY thing on this screen that says what the client is
 * doing, which is why it can afford to be enormous — there is nothing for it
 * to compete with.
 *
 * ⚠️ Sized in viewport units with a cap, not in pixels. "STANDING BY" and
 * "CHAMPION SELECT" are twice the length of "IN GAME", so a fixed size either
 * wraps the long ones or leaves the short ones small; the length is folded in.
 */
function Watermark({ text }: { text: string }) {
  const word = text.toUpperCase()
  // Longer words get proportionally smaller, so every state fills the same
  // width rather than the same letter height.
  const size = Math.min(150, Math.max(52, 1150 / Math.max(6, word.length)))

  return (
    <p
      aria-hidden
      key={word}
      className="wm pointer-events-none absolute inset-x-0 top-1/2 select-none text-center font-chakrapetch font-bold leading-none"
      style={{
        fontSize: size,
        letterSpacing: "0.06em",
        transform: "translateY(-56%)",
        color: "transparent",
        WebkitTextStroke: "1px rgba(0,217,146,0.16)",
        textShadow: "0 0 60px rgba(0,217,146,0.05)",
      }}
    >
      {word}
    </p>
  )
}

export function Attached({ s }: { s: AppState }) {
  const copy = PHASE_COPY[s.phase ?? "None"] ?? { title: s.phase ?? "Unknown", sub: "" }
  const sel = s.select

  // In a game, the board IS the overview: a card saying "In game" next to ten
  // live rows would be describing what the reader is already looking at.
  if (s.scoreboard) return <Scoreboard s={s} />

  const patch = s.patch ?? "16.16.1"
  const r = s.ranked

  // The one irreversible moment champ select has. A hovered champion fills in
  // `champion` too, which is why that cannot stand in for this.
  const locked = !!sel?.champion && sel.lockedIn

  return (
    // ⚠️ .lock-stage carries the perspective, and .lock-recede below must stay
    //    its DIRECT child or the recession flattens into a scale().
    <div className="lock-stage relative grid h-full place-items-center">
      {/* The screen-sized word stops being a phase label and becomes the
          champion you can no longer un-pick. The largest element on screen
          turns into information, and it costs one expression — Watermark is
          already keyed on its own text, so its arrival re-fires by itself. */}
      <Watermark text={locked && sel?.champion ? sel.champion.name : copy.title} />

      {/* The totem: who you are, and nothing else.
          ⚠️ No DsPanel here on purpose. That frame — rails, ticks, a shoulder,
          an eyebrow — is right on a card that has to hold its own against the
          game, and it is noise in front of a word the size of the screen. The
          watermark is the ornament on this screen; a second one competes with
          it. A plate and a hairline are enough to lift the card off the word.

          ⚠️ The recede lives on the WRAPPER and never on .totem. .totem runs
          totem-float, and an animation's transform beats a transitioned one —
          on the card itself the translate3d would be overwritten every frame.
          The wrapper owns depth; the card keeps its own breathing, paused from
          there. */}
      <div className={`lock-recede ${locked ? "lock-back" : ""}`}>
      <div
        className="totem metal relative flex w-[186px] flex-col items-center rounded-[6px] px-5 py-10"
      >
        {/* A short rule above and below the contents. A totem is a vertical
            thing, and the fastest way to say so is to put the vertical axis on
            the card itself rather than only in its proportions. */}
        <span aria-hidden className="absolute left-1/2 top-0 z-[1] h-5 w-px -translate-x-1/2 bg-jade/25" />
        {/* The lower rule was always the emitter mouth — it was simply dark.
            ⚠️ A colour change ONLY. .metal is `overflow: hidden`, so a slit
            grown past the card's bottom edge would be cut off and its glow
            clipped to the card body. The light leaves at the rhombus, outside
            the card; this is the last lit inch before it. */}
        <span
          aria-hidden
          className={`lock-mouth absolute bottom-0 left-1/2 z-[1] h-5 w-px -translate-x-1/2 ${
            locked ? "bg-jade/[0.55]" : "bg-jade/15"
          }`}
        />

        {/* ⚠️ Above the specular sweep. That highlight is an ::after, so it
            paints OVER the children by default — a reflection passing across a
            face is right for metal and wrong for a name you have to read. The
            light stays on the plate; the contents sit on top of it. */}
        <div className="relative z-[1] flex flex-col items-center">
        {s.summoner ? (
          <img
            src={`${CDN}/${patch}/img/profileicon/${s.summoner.iconId}.png`}
            alt=""
            className="h-[74px] w-[74px] rounded-full ring-1 ring-jade/25"
            onError={(e) => {
              // An icon we cannot fetch leaves the frame, not a broken glyph.
              ;(e.currentTarget as HTMLImageElement).style.visibility = "hidden"
            }}
          />
        ) : (
          <div className="h-[76px] w-[76px] rounded-full bg-jade/[0.05] ring-1 ring-jade/15" />
        )}

        <p className="mt-6 max-w-full truncate font-chakrapetch text-[19px] font-bold leading-none">
          {s.summoner?.name ?? "—"}
        </p>

        {r?.tier && (
          <div className="mt-7 flex flex-col items-center gap-2">
            <img
              src={`${RANKS}/${r.tier.toLowerCase()}.png`}
              alt=""
              className="h-11 w-11"
              onError={(e) => {
                ;(e.currentTarget as HTMLImageElement).style.visibility = "hidden"
              }}
            />
            <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.2em] text-flash/45">
              {title(r.tier)}
              {r.division ? ` ${r.division}` : ""}
            </p>
          </div>
        )}
        </div>
      </div>
      </div>

      {/* Champion select still gets its own room, below the totem — in champ
          select the page has a job beyond saying who you are.
          ⚠️ The menu deliberately does NOT dock upward on lock. All of the
          throw distance comes from the totem's 34px of lift; lifting here as
          well collides with the receded card at the window's own minHeight. */}
      {sel?.champion && (
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto w-full max-w-[560px]">
            <RunePanel s={s} locked={locked} />
            <RuneImportNotice imp={s.runeImport} />
          </div>
        </div>
      )}
      {!sel?.champion && (
        <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[560px]">
          <RuneImportNotice imp={s.runeImport} />
        </div>
      )}
    </div>
  )
}

/**
 * What came of the last import, wherever it was started from.
 *
 * Separate from the rune panel on purpose: a link from the website can arrive
 * while the app is sitting on any screen at all, and a result that only renders
 * inside champ select would mean the website's button silently did nothing most
 * of the time.
 */

function RuneImportNotice({ imp }: { imp: AppState["runeImport"] }) {
  if (imp.state === "idle" || imp.state === "working") return null

  return (
    <p className="rise mt-5 max-w-[440px] font-jetbrains text-[9.5px] leading-relaxed text-flash/40">
      {imp.state === "done" ? (
        <>
          saved as <span className="text-jade">{imp.name}</span>
          {imp.replaced ? " · replaced the previous loldata page" : ""}
        </>
      ) : imp.state === "build-saved" ? (
        <>
          <span className="text-jade">{imp.champion}</span> build saved · {imp.items} item
          {imp.items === 1 ? "" : "s"} · notices will follow it in game
        </>
      ) : imp.state === "no-room" ? (
        <>
          <span className="text-citrine">no free rune page slot.</span> delete one in the client
          and try again — we will not remove a page you made.
        </>
      ) : (
        <span className="text-citrine">{imp.message}</span>
      )}
    </p>
  )
}

/**
 * The page loldata would run, and one button to put it in the client.
 *
 * The numbers are the site's, from the same endpoint the Build tab reads, so
 * the app is not a second opinion — it is the site with a shorter path to the
 * client.
 *
 * It says POPULAR rather than BEST, because that is what the data is: the page
 * most people play. Those are often the same and sometimes not, and the label
 * should not quietly claim the stronger one.
 */

function RunePanel({ s, locked }: { s: AppState; locked: boolean }) {
  const r = s.runes
  const v = r?.variants[r.chosen]
  const [art, setArt] = useState<{ perks: (Perk | null)[]; primary: Style | null; secondary: Style | null } | null>(null)
  const chosenRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!v) return setArt(null)
    let alive = true
    const ids = [...v.page.primary, ...v.page.secondary, ...v.page.shards]
    void resolvePage(ids, v.page.primaryStyle, v.page.subStyle)
      .then((a) => { if (alive) setArt(a) })
      .catch(() => { if (alive) setArt(null) })
    return () => { alive = false }
  }, [v?.page.keystone, v?.label])

  /**
   * The art for all FIVE, not only the chosen one.
   *
   * Each option is a keystone now rather than a word, so every variant needs
   * its own icon. `load()` inside resolvePage is module-cached, so five calls
   * cost one fetch and five map lookups — not five round trips.
   *
   * ⚠️ Keyed on the keystones themselves, not on `r.variants`. The state is
   * pushed from the shell on every tick and arrives as a fresh array each time,
   * so an identity dependency would re-resolve forever.
   */
  const keystoneKey = r?.variants.map((x) => x.page.keystone).join(",") ?? ""
  const [tiles, setTiles] = useState<{ keystone: Perk | null; sub: Style | null }[]>([])
  useEffect(() => {
    if (!r) return setTiles([])
    let alive = true
    void Promise.all(
      r.variants.map((x) => resolvePage([x.page.keystone], x.page.primaryStyle, x.page.subStyle))
    )
      .then((list) => {
        if (alive) setTiles(list.map((a) => ({ keystone: a.perks[0] ?? null, sub: a.secondary })))
      })
      .catch(() => { if (alive) setTiles([]) })
    return () => { alive = false }
  }, [keystoneKey])

  /**
   * "The focus moves onto it" made true of the machine, not only of the picture.
   *
   * ⚠️ Guarded twice, and the guards ARE the feature. During champ select the
   * player is nearly always in the League client, not in this window — a
   * companion app that yanks focus mid-pick is a bug with a nice animation on
   * it. So: only when this window already has focus, and only when nothing in
   * it is focused already. Otherwise the visual shift stands on its own and the
   * first Tab lands here anyway.
   *
   * The delay lets the arrival finish; focusing a button mid-animation scrolls
   * and fights the transform.
   */
  useEffect(() => {
    if (!locked) return
    if (!document.hasFocus()) return
    if (document.activeElement && document.activeElement !== document.body) return
    const id = window.setTimeout(() => chosenRef.current?.focus({ preventScroll: true }), 700)
    return () => window.clearTimeout(id)
  }, [locked])

  /**
   * No pages for the lane that was actually picked.
   *
   * ⚠️ This says so instead of borrowing another lane's runes. The version
   * before this fell back to the champion's pages across every role, and the
   * first real pick it met was Twisted Fate TOP — whose sample is zero, so it
   * offered his 399,190 MID games and recommended Arcane Comet to somebody about
   * to play top. A rune page is advice you act on; a quiet provenance label at
   * the bottom of the card cannot carry that.
   */
  if (!r || !v) {
    if (!s.runeGap) return null
    return (
      <div className={locked ? "" : "mt-6 border-t border-jade/[0.12] pt-5"}>
        <p className="font-jetbrains text-[8.5px] uppercase tracking-[0.28em] text-citrine/60">
          runes · no {s.runeGap.toLowerCase()} data
        </p>
        <p className="mt-2 max-w-[46ch] font-chakrapetch text-[12px] leading-relaxed text-flash/45">
          Nobody plays {s.select?.champion?.name ?? "this champion"} here often enough to read a
          page from. We will not hand you another lane's runes — they would be wrong in a way
          that costs you the game.
        </p>
      </div>
    )
  }
  const imp = s.runeImport

  const body = (
    <>
      {/* Only once it is a projection: the word this panel's doc comment argues
          for — POPULAR rather than BEST — was never actually on screen. */}
      {locked && (
        <p className="ds-eyebrow font-jetbrains text-[8.5px] uppercase tracking-[0.28em] text-jade/60">
          runes · popular
        </p>
      )}

      {/* The same five the site offers, in the same order and the same words.
          Knowing only the most played page is what let champ select overwrite a
          choice made on the website.
          ⚠️ The brighter unchosen label is conditional on the lock, not global:
          it pays for the contrast lost with the ground, and there is still a
          ground before the lock. */}
      {/* ⚠️ A five-column GRID, not a wrapping flex row.
          The options used to be text-only buttons that each sized to their own
          label — measured at 60, 47.5, 47.5, 60 and 66.3px, five different
          widths in a row, which is what made them read as debris rather than as
          a set. A grid makes the five columns equal by construction, so no
          label length can ever break the rank again.

          Each option is the keystone it actually is, with the secondary tree
          small beside it and the words underneath. A rune page is a picture in
          the client and on the website; it was a word only here. */}
      <div className={`grid grid-cols-5 gap-1.5 ${locked ? "mt-3" : ""}`}>
        {r.variants.map((variant, i) => {
          const tile = tiles[i]
          const chosen = i === r.chosen
          return (
            <button
              key={variant.label}
              ref={chosen ? chosenRef : undefined}
              type="button"
              onClick={() => window.desktop.chooseRunes(i)}
              style={{ ["--in-delay" as string]: `${300 + i * 40}ms` }}
              className={`ds-slot win-btn flex flex-col items-center gap-1.5 rounded-[3px] px-1 py-2 ${chosen ? "bg-jade/[0.13]" : ""}`}
            >
              {/* The keystone large, the secondary tree small: the same
                  hierarchy the client draws, so the page is recognised rather
                  than read. */}
              <span className="flex items-center gap-1">
                {tile?.keystone ? (
                  <img
                    src={tile.keystone.icon}
                    alt=""
                    title={tile.keystone.name}
                    className={`h-8 w-8 shrink-0 ${chosen ? "" : "opacity-55"}`}
                  />
                ) : (
                  /* A held space, not nothing: the row must not resettle when
                     the icons arrive a frame later. */
                  <span aria-hidden className="h-8 w-8 shrink-0 rounded-full bg-flash/[0.05]" />
                )}
                {tile?.sub ? (
                  <img
                    src={tile.sub.icon}
                    alt=""
                    title={tile.sub.name}
                    className={`h-3.5 w-3.5 shrink-0 ${chosen ? "opacity-90" : "opacity-40"}`}
                  />
                ) : (
                  <span aria-hidden className="h-3.5 w-3.5 shrink-0" />
                )}
              </span>

              {/* Centred, and allowed to wrap: the grid equalises the row's
                  height, so a two-line label costs alignment nothing — where
                  truncating would cost the word. */}
              <span
                className={`block text-center font-jetbrains text-[8.5px] uppercase leading-[1.35] tracking-[0.12em] ${
                  chosen ? "text-jade" : locked ? "text-flash/45" : "text-flash/30"
                }`}
              >
                {variant.label}
              </span>
              <span
                className={`block font-chakrapetch text-[11px] font-bold tabular-nums ${
                  chosen ? "text-flash/85" : locked ? "text-flash/45" : "text-flash/40"
                }`}
              >
                {variant.winrate.toFixed(1)}%
              </span>
            </button>
          )
        })}
      </div>

      {/* Furthest from the source, so faintest — a projection dims as it
          travels, and the ranking of the type says which end it is at. */}
      <p className="ds-late mt-3 font-jetbrains text-[9px] tabular-nums text-flash/30">
        {r.remembered && r.chosen !== 0 && <span className="text-jade/70">your last choice · </span>}
        {v.share >= 1 ? `${Math.round(v.share)}% of games` : "rarely played"} · {v.games.toLocaleString()} games
      </p>

      <div className="mt-3 flex items-center gap-4">
        {/* .ds-icon on each group and on the separator: one class, one timing,
            so the nine icons land as a SET rather than as a sequence. */}
        <div className="ds-icon flex items-center gap-1.5">
          {art?.primary && <img src={art.primary.icon} alt={art.primary.name} title={art.primary.name} className="h-5 w-5 opacity-70" />}
          {art?.perks.slice(0, 4).map((p, i) => (
            <img
              key={p?.id ?? i}
              src={p?.icon}
              alt={p?.name ?? ""}
              title={p?.name ?? ""}
              // the keystone is the decision; the rest are the consequences
              className={i === 0 ? "h-8 w-8" : "h-[22px] w-[22px] opacity-85"}
            />
          ))}
        </div>

        <span aria-hidden className="ds-icon h-6 w-px bg-jade/12" />

        <div className="ds-icon flex items-center gap-1.5">
          {art?.secondary && <img src={art.secondary.icon} alt={art.secondary.name} title={art.secondary.name} className="h-5 w-5 opacity-70" />}
          {art?.perks.slice(4, 6).map((p, i) => (
            <img key={p?.id ?? i} src={p?.icon} alt={p?.name ?? ""} title={p?.name ?? ""} className="h-[22px] w-[22px] opacity-85" />
          ))}
          {/* ⚠️ The index is part of the key, not a fallback for a missing id.
              Shards REPEAT by design — two Adaptive Force slots are both 5008 —
              so keying on the id alone gives React duplicate keys and licence to
              drop or reorder one of them. */}
          {art?.perks.slice(6, 9).map((p, i) => (
            <img key={`${p?.id ?? "s"}-${i}`} src={p?.icon} alt={p?.name ?? ""} title={p?.name ?? ""} className="ml-0.5 h-[15px] w-[15px] opacity-70" />
          ))}
        </div>

        {/* The second solid thing on the screen, and the last to arrive: the
            action lands after the thing it acts on. .lock-last moves only its
            delay — see the longhand-not-shorthand warning in index.css. */}
        <button
          type="button"
          disabled={imp.state === "working"}
          onClick={() => void window.desktop.importRunes()}
          className="act-btn ds-late lock-last ml-auto h-8 w-[112px] shrink-0 rounded-[3px] font-chakrapetch text-[12px] font-bold uppercase tracking-[0.12em]"
        >
          {imp.state === "working" ? "setting" : imp.state === "done" ? "imported" : "import"}
        </button>
      </div>
    </>
  )

  // Before the lock: exactly today's panel. Nothing changes until the decision
  // becomes irreversible. The ds-* classes on the contents are inert until an
  // ancestor carries .ds-in, so this renders as it always did.
  if (!locked) {
    return <div className="rise mt-6 border-t border-jade/[0.12] pt-5">{body}</div>
  }

  return (
    // ⚠️ .ds-in is here purely as the TRIGGER for its staggered child rules;
    //    index.css cancels its own slide-in by name. This element must keep NO
    //    transform, filter or opacity of its own — any of them creates a
    //    stacking context and would isolate .lock-cast's blending from the
    //    watermark, which is the single detail proving this is projected light
    //    rather than a tinted panel.
    // ⚠️ The top hairline is gone. `border-t` is the flat strip's edge, and an
    //    edge is the one thing a projection does not have.
    <div
      className="lock-projection ds-in relative mt-6 pt-6"
      role="group"
      aria-label={`Runes for ${s.select?.champion?.name ?? "your champion"}`}
    >
      {/* The light it throws. No edge, because it reaches zero inside its own
          box; additive, so what it crosses brightens.
          ⚠️ A SIBLING of .lock-plane, never a child — .lock-plane is
          transformed during its arrival, and a transform isolates blending. */}
      <span aria-hidden className="lock-cast pointer-events-none absolute -inset-x-10 -top-3 bottom-[-26px]" />

      {/* The source. One rhombus, on the totem's own vertical axis.
          ⚠️ Rotation on the <g>, scale on the <rect> (.ds-mark → ds-snap): an
          animated transform REPLACES the attribute rather than composing with
          it, which is how DsPanel's diamond once became a square. */}
      <svg
        aria-hidden
        width="12"
        height="12"
        viewBox="0 0 12 12"
        className="lock-source absolute left-1/2 top-0 z-[1] -ml-[6px] -mt-[6px] overflow-visible"
      >
        <g transform="rotate(45 6 6)">
          <rect className="ds-mark" x="2.5" y="2.5" width="7" height="7" fill="#00d992" />
        </g>
      </svg>

      {/* The only drawn line: it starts at the mark and dies into nothing. One
          side only — a mirrored pair reads as a border. */}
      <span aria-hidden className="lock-rail ds-rule absolute right-0 top-0 h-px" />

      {/* The image: it lands keystoned and corrects itself in 340ms, ending on
          transform: none so the type rasterises normally from then on. */}
      <div className="lock-plane relative">{body}</div>
    </div>
  )
}

