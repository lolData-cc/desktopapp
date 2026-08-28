import { Suspense, lazy, useEffect, useRef, useState } from "react"
import { CDN, CDRAGON, isPremium, planBadge, type AppState } from "./types"
import { Attached, Waiting } from "./sections/Overview"
/**
 * ⚠️ Everything except the Overview is fetched when it is first opened.
 *
 * They were all imported eagerly, so every section — the build editor, the
 * settings, the AI chat, the match list — was compiled and held on launch, for
 * a window that opens on one of them. Sessions that only ever glance at the
 * Overview paid for all six.
 *
 * The Overview stays eager because it is what the window opens on, and a
 * spinner on the first frame of an app is a worse trade than the memory.
 */
const Matches = lazy(() => import("./sections/Matches"))
const Stats = lazy(() => import("./sections/Stats"))
const AiChat = lazy(() => import("./sections/AiChat"))
const Builds = lazy(() => import("./sections/Builds"))
const BuildEditor = lazy(() => import("./sections/BuildEditor"))
const Preferences = lazy(() => import("./sections/Preferences"))
import CyberBackdrop from "./CyberBackdrop"
import Boundary from "./Boundary"
import Recap, { isPostGame } from "./sections/Recap"
import Settings from "./sections/Settings"
import UpdateButton from "./UpdateButton"
import logo from "../assets/logo.png"

/**
 * The window.
 *
 * A rail on the left, one section at a time on the right, the account top
 * right. The rail is numbered because Death Stranding's interface numbers
 * things — but the numbers are also true here: they are the order, and the
 * order is the order you use them in during a game.
 *
 * Sections that leave the app (Discord) are separated from sections that are
 * the app, because a menu that mixes navigation with departure makes you read
 * every item before clicking.
 */
type SectionId = "overview" | "build" | "matches" | "stats" | "ai" | "settings"

/**
 * The rail, and what is no longer on it.
 *
 * ⚠️ Four entries, because four is what there is. It had seven, and two of
 * them were not places:
 *
 * - **Capture** was a tab for a feature, not for a thing you go and look at.
 *   Its recordings ARE your games, so they live on the games — a row in
 *   Matches with a way to watch it. Its switches live in Settings, where every
 *   other switch already lives.
 * - **Patch** is gone entirely.
 *
 * lolData AI is deliberately NOT in this list. It sits apart, below, marked as
 * the paid thing it is — a rail where the one item behind a subscription looks
 * identical to the four that are not is a rail that sells by ambush.
 */
const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "build", label: "Build" },
  { id: "matches", label: "Matches" },
  { id: "stats", label: "Stats" },
]

const DISCORD = "https://discord.gg/loldata"

/** Phases that mean the next game has genuinely started, and the last one's
 *  recap should stand down. */
const NEW_GAME = new Set(["ChampSelect", "GameStart", "InProgress", "Reconnect"])

export default function App() {
  const [s, setS] = useState<AppState | null>(null)
  const [section, setSection] = useState<SectionId>("overview")
  const [showSettings, setShowSettings] = useState(false)
  // Which profile is open for editing. Held here rather than inside Builds so
  // that leaving the section closes the editor instead of hiding it.
  const [editing, setEditing] = useState<string | null>(null)
  /**
   * Waved away for this game.
   *
   * ⚠️ Cleared when a NEW GAME BEGINS, not keyed on the match id. The client
   * writes history late, so a dismissal keyed on `matches[0]` would be keyed
   * on the PREVIOUS game — and the recap would pop straight back up the moment
   * the real one arrived, having just been dismissed.
   */
  const [dismissed, setDismissed] = useState(false)

  /**
   * The recap has opened, and it STAYS OPEN until CONTINUE.
   *
   * ⚠️ Latched rather than derived from the phase. The client runs through
   * WaitingForStats, PreEndOfGame and EndOfGame in a few seconds and is back in
   * the Lobby before anyone has alt-tabbed — so a recap that existed only while
   * the phase said "post-game" appeared for about a second and was gone. This
   * is the screen that summarises the last twenty minutes; it does not get to
   * decide on its own when you have finished reading it.
   */
  const [latched, setLatched] = useState(false)
  // Which past game the recap is being previewed over, or null for off. An
  // INDEX rather than a match, so the button can step through recent games and
  // the framing can be checked on champions of different sizes.
  const [preview, setPreview] = useState<number | null>(null)

  useEffect(() => {
    void window.desktop.getState().then(setS)
    return window.desktop.onState(setS)
  }, [])

  const post = isPostGame(s?.phase ?? null)
  const phase = s?.phase ?? null
  const haveGame = !!s?.lastPlayed || !!s?.matches?.length

  useEffect(() => {
    if (post && haveGame) setLatched(true)
  }, [post, haveGame])

  /**
   * A new game clears it — and only a new game.
   *
   * ⚠️ Queuing does NOT count. Lobby and Matchmaking come straight after the
   * end screen, so treating them as "moved on" would take the recap away from
   * someone who pressed "find match" and then went back to read it. Champion
   * select is where the next game genuinely starts and the screen has to be
   * about that instead.
   */
  useEffect(() => {
    if (phase && NEW_GAME.has(phase)) {
      setLatched(false)
      setDismissed(false)
    }
  }, [phase])

  // Something to show: the champion from the game we just watched, or failing
  // that whatever history has.
  const previewMatch = preview !== null ? (s?.matches?.[preview] ?? null) : null
  const showRecap = !!previewMatch || (latched && !dismissed)

  /**
   * Whether the Overview is being a SCENE right now.
   *
   * ⚠️ The full width belongs to the scene, not to the section. The Overview
   * is two different things wearing one name: a totem over a watermark the
   * size of the window, which is composed against the whole thing and would be
   * knocked off-centre by a menu column — and, once a game starts, ten rows of
   * numbers, which is a document like every other section and belongs beside
   * the menu rather than under it. The recap is a document too.
   */
  const scene = section === "overview" && !s?.scoreboard && !showRecap

  return (
    <div className="relative flex h-full flex-col bg-liquirice text-flash">
      <div aria-hidden className="dot-field pointer-events-none absolute inset-0" />

      <TitleBar s={s} />

      {/* ⚠️ The nav OVERLAYS the scene; it does not take a column from it.
          As a flex sibling it stole 196px from every screen and the Overview
          composed itself in what was left — so the totem sat off-centre in the
          window and the watermark was cropped by a menu. The scene now owns
          the full width and the plates float on top of it, which is what
          makes them read as UI over a scene rather than as a sidebar. */}
      <div className="relative z-10 min-h-0 flex-1">
        {/* Keyed on the section so each one ASSEMBLES rather than swapping.
            Only the sections that are DOCUMENTS are inset past the nav; the
            Overview is a scene and is composed against the whole window. */}
        <main
          key={`${section}:${editing ?? ""}`}
          className={`ds-enter absolute inset-0 overflow-hidden py-6 ${
            scene ? "px-7" : "pl-[210px] pr-7"
          }`}
        >
          {/* Only on the Overview, and only when there is no live board: over
              ten rows of numbers this would be noise, and the board is the one
              screen already full. */}
          {scene && <CyberBackdrop />}
          {/* One section throwing must not blank the window. Keyed on the
              section so leaving a broken screen clears the fault instead of
              latching it until restart. */}
          <Boundary resetKey={`${section}:${editing ?? ""}:${preview ?? ""}`}>
          <Suspense fallback={<Loading />}>
          <div className="relative h-full">
          {section === "overview" ? (
            s?.client === "attached" ? (
              showRecap ? (
                <Recap
                  s={s}
                  preview={previewMatch}
                  onClose={() => (previewMatch ? setPreview(null) : setDismissed(true))}
                />
              ) : (
                <Attached s={s} />
              )
            ) : (
              <Waiting />
            )
          ) : !s ? null : section === "build" ? (
            editing ? (
              <BuildEditor s={s} championId={editing} onBack={() => setEditing(null)} />
            ) : (
              <Builds s={s} onOpen={setEditing} />
            )
          ) : section === "matches" ? (
            <Matches s={s} />
          ) : section === "stats" ? (
            <Stats s={s} />
          ) : section === "settings" ? (
            <Preferences s={s} />
          ) : (
            <AiChat s={s} />
          )}
          </div>
          </Suspense>
          </Boundary>
        </main>

        {/* Above the scene, and last in the DOM so it takes the clicks. */}
        <Rail
          section={section}
          onSection={(id) => {
            setEditing(null)
            setSection(id)
          }}
          settingsOpen={showSettings}
          onSettings={() => setShowSettings((v) => !v)}
          premium={isPremium(s?.account?.tier)}
          recording={s?.recording === true}
        />
      </div>

      {showSettings && s && (
        <Settings
          s={s}
          preview={preview}
          onPreview={(i) => {
            setPreview(i)
            // Stepping into the recap from another section would leave the
            // player looking at a panel they cannot see.
            if (i !== null) setSection("overview")
          }}
        />
      )}
      {/* ⚠️ The status strip is gone. It reported the client state and the
          patch on a permanent bar — two facts the player either already knows
          or does not need, holding a full row of the window for the whole
          session. The client state is now the WATERMARK on the Overview, at
          the size of the screen, which is a better home for it than a
          footnote. What is left is the version, because it is the one thing
          someone reads out when something is wrong. */}
      <Version s={s} />
    </div>
  )
}

/** A section on its way in. Deliberately quiet: these arrive in a few
 *  milliseconds from disk, and a spinner would flash rather than inform. */
const Loading = () => (
  <div className="grid h-full place-items-center">
    <p className="font-jetbrains text-[10px] uppercase tracking-[0.2em] text-flash/20">…</p>
  </div>
)

/* ── chrome ──────────────────────────────────────────────────────────────── */

function TitleBar({ s }: { s: AppState | null }) {
  /**
   * The update takes the account's width exactly, so the two read as a pair
   * instead of as two unrelated sizes.
   *
   * Measured rather than declared, because the account's own width follows
   * the summoner name — which changes when the player signs into a different
   * account, and again when a plan badge appears beside it.
   *
   * It also settles something the fixed width was not asked to fix: the
   * update is 126, 57 and 132px wide across its three states, so the whole
   * right-hand group used to shift under the pointer as a download ran.
   */
  const accountRef = useRef<HTMLDivElement>(null)
  const [accountWidth, setAccountWidth] = useState<number | null>(null)
  useEffect(() => {
    const el = accountRef.current
    if (!el) return
    // ⚠️ Not rounded. The account's width is fractional, and rounding it made
    // the update a pixel wider than the thing it is supposed to match.
    const measure = () => setAccountWidth(el.getBoundingClientRect().width)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <header className="drag relative z-20 flex h-11 shrink-0 items-center gap-2.5 border-b border-jade/[0.10] px-3">
      <img src={logo} alt="" className="h-[18px] w-[18px] rounded-[3px]" />
      <span className="font-chakrapetch text-[13px] font-bold tracking-[0.16em] text-flash/85">
        lolData
      </span>
      <span className="font-jetbrains text-[9px] uppercase tracking-[0.24em] text-flash/25">
        desktop
      </span>

      <div className="no-drag ml-auto flex items-center gap-1">
        {/* Left of the account, and inside no-drag: the header is a drag
            region, so a button placed outside this group would silently
            never fire — the press moves the window instead. */}
        <UpdateButton s={s} width={accountWidth} />
        <Account s={s} ref={accountRef} />

        <button
          type="button"
          onClick={() => window.desktop.minimise()}
          aria-label="Minimise"
          className="win-btn bare ml-1 grid h-11 w-11 place-items-center text-flash/40"
        >
          <span className="block h-px w-[11px] bg-current" />
        </button>
        <button
          type="button"
          onClick={() => window.desktop.close()}
          aria-label="Close"
          className="win-btn bare danger grid h-11 w-11 place-items-center text-flash/40"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
            <path d="M1 1 L10 10 M10 1 L1 10" stroke="currentColor" strokeWidth="1.3" fill="none" />
          </svg>
        </button>
      </div>
    </header>
  )
}

/**
 * Two identities live here and they are NOT the same thing: the League account
 * the client is signed into, and the lolData account that pays for premium.
 * They are shown together but labelled apart, because conflating them is how
 * someone ends up wondering why signing into League did not unlock the AI.
 */
function Account({ s, ref }: { s: AppState | null; ref?: React.Ref<HTMLDivElement> }) {
  const [open, setOpen] = useState(false)
  const summoner = s?.summoner
  const account = s?.account
  const patch = s?.patch ?? "16.16.1"
  const badge = planBadge(account?.tier)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="win-btn bare flex h-8 items-center gap-2 rounded-[3px] pl-1 pr-2.5"
      >
        {summoner ? (
          <img
            src={`${CDN}/${patch}/img/profileicon/${summoner.iconId}.png`}
            alt=""
            className="h-6 w-6 rounded-[3px] ring-1 ring-jade/20"
          />
        ) : (
          <span className="h-6 w-6 rounded-[3px] bg-flash/[0.06]" />
        )}
        <span className="max-w-[130px] truncate font-chakrapetch text-[12px] font-bold text-flash/75">
          {summoner?.name ?? "Not signed in"}
        </span>
        {/* The crest rather than the word. It is the same badge the site puts
            on a premium profile, and it reads at a glance where a four-letter
            word had to be parsed. Free shows nothing — the menu says it. */}
        {badge && (
          <img
            src={badge}
            alt={account?.tier ?? ""}
            title={`${account?.tier} plan`}
            className="h-[19px] w-auto shrink-0"
            style={{ filter: "drop-shadow(0 0 6px rgba(0,217,146,0.35))" }}
          />
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            /* An arrow, not the hand preflight gives every button: this
               covers the whole window, and a pointer over every pixel would
               claim the entire screen is clickable. */
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="hud absolute right-0 top-[calc(100%+6px)] z-40 w-[248px] px-4 py-4">

            <p className="font-jetbrains text-[8.5px] uppercase tracking-[0.24em] text-flash/25">
              league account
            </p>
            <p className="mt-1 font-chakrapetch text-[14px] font-bold leading-tight">
              {summoner ? (
                <>
                  {summoner.name}
                  <span className="text-flash/30">#{summoner.tag}</span>
                </>
              ) : (
                <span className="text-flash/35">client not running</span>
              )}
            </p>
            {summoner && (
              <p className="font-jetbrains text-[9px] uppercase tracking-[0.14em] text-flash/25">
                level {summoner.level}
              </p>
            )}

            {s?.ranked && <Rank r={s.ranked} />}

            <div className="mt-4 border-t border-jade/[0.12] pt-3">
              <p className="font-jetbrains text-[8.5px] uppercase tracking-[0.24em] text-flash/25">
                loldata account
              </p>
              <div className="mt-1 flex items-center gap-2">
                {badge && <img src={badge} alt="" className="h-[22px] w-auto shrink-0" />}
                <p className="min-w-0 truncate font-chakrapetch text-[13px] text-flash/70">
                  {account?.email ?? (account ? "signed in" : "signed out")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  if (account) void window.desktop.signOut()
                  else window.desktop.signIn()
                }}
                className="act-btn mt-3 h-8 w-full rounded-[3px] font-chakrapetch text-[11px] font-bold uppercase tracking-[0.12em]"
              >
                {account ? "sign out" : "sign in"}
              </button>
              {!account && (
                <p className="mt-2 font-jetbrains text-[8.5px] leading-relaxed text-flash/25">
                  Opens your browser. This app never asks for a password.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Rank({ r }: { r: AppState["ranked"] }) {
  if (!r?.tier) return null
  const games = r.wins + r.losses
  return (
    <div className="mt-3 flex items-center gap-2.5">
      <img
        src={`${CDRAGON}/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${r.tier.toLowerCase()}.svg`}
        alt=""
        className="h-8 w-8"
      />
      <div>
        <p className="font-chakrapetch text-[13px] font-bold capitalize leading-tight">
          {r.tier.toLowerCase()} {r.division ?? ""}{" "}
          <span className="tabular-nums text-jade">{r.leaguePoints} LP</span>
        </p>
        <p className="font-jetbrains text-[9px] tabular-nums text-flash/25">
          {r.wins}W {r.losses}L
          {games > 0 && ` · ${Math.round((r.wins / games) * 100)}%`}
        </p>
      </div>
    </div>
  )
}

/* ── the rail ────────────────────────────────────────────────────────────── */

/** Angular rather than the usual cogwheel: everything else in this rail is
 *  built from straight lines and a rotated square, and a soft round gear would
 *  be the one shape from a different set. */
const Gear = ({ active }: { active: boolean }) => (
  <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden className="shrink-0">
    <path
      d="M8 1.6 L10 3 L12.4 2.6 L13.4 4.9 L15 6.6 L14.2 8 L15 9.4 L13.4 11.1 L12.4 13.4 L10 13 L8 14.4 L6 13 L3.6 13.4 L2.6 11.1 L1 9.4 L1.8 8 L1 6.6 L2.6 4.9 L3.6 2.6 L6 3 Z"
      fill="none"
      stroke={active ? "#00d992" : "rgba(215,216,217,0.28)"}
      strokeWidth="1.1"
      strokeLinejoin="round"
    />
    <circle cx="8" cy="8" r="2.1" fill="none" stroke={active ? "#00d992" : "rgba(215,216,217,0.28)"} strokeWidth="1.1" />
  </svg>
)

/**
 * The navigation, as game UI rather than as a sidebar.
 *
 * ⚠️ No panel, no border, no divider. A sidesheet is a CONTAINER — it says
 * "these live in a box on the left", which is the vocabulary of every
 * dashboard ever built. Death Stranding's menus are not boxes: they are
 * plates floating against the scene, cut at one corner, that take focus by
 * lighting an edge rather than by filling in.
 *
 * The sections are separated by SPACE, never by a rule. A divider would put
 * the box straight back.
 */
const PLATE = "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)"

function Rail({
  section,
  onSection,
  settingsOpen,
  onSettings,
  premium,
  recording,
}: {
  section: SectionId
  onSection: (id: SectionId) => void
  settingsOpen: boolean
  onSettings: () => void
  premium: boolean
  recording: boolean
}) {
  return (
    <nav className="pointer-events-none absolute inset-y-0 left-0 z-20 flex w-[196px] flex-col gap-[3px] py-5 pl-3 pr-2">
      {SECTIONS.map((sec, i) => (
        <Plate
          key={sec.id}
          index={i + 1}
          label={sec.label}
          active={sec.id === section}
          onClick={() => onSection(sec.id)}
          /* A recording running is worth seeing from every section, not only
             from the one it belongs to. Matches is where it will land. */
          live={sec.id === "matches" && recording}
        />
      ))}

      {/* ⚠️ Apart, and marked. This is the one thing on the rail behind a
          subscription, and a paid item dressed identically to four free ones
          is a rail that sells by ambush — you find out what it costs after
          reaching for it. The separation is the honesty; the crest is the
          shorthand. */}
      <AiPlate active={section === "ai"} premium={premium} onClick={() => onSection("ai")} />

      <Plate
        className="mt-auto"
        label="Settings"
        active={section === "settings"}
        onClick={() => onSection("settings")}
        glyph={<Gear active={section === "settings"} />}
      />

      <Plate
        label="Overlay"
        active={settingsOpen}
        onClick={onSettings}
        glyph={
          <span className={`block h-[7px] w-[7px] rotate-45 ${settingsOpen ? "bg-jade" : "bg-flash/25"}`} />
        }
      />

      {/* ⚠️ Not a plate. Discord LEAVES the app, and giving it the same shape
          as the places you stay makes you read every item before clicking. A
          departure should look like one. */}
      <button
        type="button"
        onClick={() => window.desktop.openExternal(DISCORD)}
        className="pointer-events-auto mt-2 flex items-center gap-2 pl-3 pr-2 py-1.5 text-left opacity-40 transition-opacity hover:opacity-90"
      >
        <DiscordMark />
        <span className="font-jetbrains text-[9px] uppercase tracking-[0.18em] text-flash/70">
          discord
        </span>
        <span className="font-jetbrains text-[9px] text-flash/40">↗</span>
      </button>
    </nav>
  )
}

/**
 * lolData AI, set apart from the rail proper.
 *
 * A rule above it rather than a gap alone: the gap says "later in the list",
 * the rule says "a different kind of thing". Which it is — everything above is
 * reading what already happened, and this is asking a question of it, on a
 * plan.
 */
function AiPlate({
  active,
  premium,
  onClick,
}: {
  active: boolean
  premium: boolean
  onClick: () => void
}) {
  return (
    <div className="mt-5 pt-4">
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 right-2 -mt-4 block h-px"
        style={{ background: "linear-gradient(90deg, rgba(0,217,146,0.35), rgba(0,217,146,0))" }}
      />
      <button
        type="button"
        onClick={onClick}
        className={`plate group pointer-events-auto relative flex w-full items-center gap-2.5 py-2 pl-3 pr-2.5 text-left ${
          active ? "plate-on" : ""
        }`}
        style={{
          clipPath: PLATE,
          background: active ? "rgba(0,217,146,0.10)" : "rgba(0,217,146,0.045)",
        }}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[2px] transition-colors"
          style={{ background: active ? "#00d992" : "rgba(0,217,146,0.45)" }}
        />
        <span className="grid w-[13px] shrink-0 place-items-center">
          <span className="block h-[7px] w-[7px] rotate-45" style={{ background: active ? "#00d992" : "rgba(0,217,146,0.6)" }} />
        </span>
        <span
          className={`font-chakrapetch text-[13px] font-bold tracking-wide transition-colors ${
            active ? "text-flash" : "text-flash/70 group-hover:text-flash"
          }`}
        >
          lolData AI
        </span>
        {/* What it costs, before you press it — not after. */}
        <span
          className="ml-auto font-jetbrains text-[8px] uppercase tracking-[0.16em]"
          style={{ color: premium ? "rgba(0,217,146,0.75)" : "rgba(255,182,21,0.75)" }}
        >
          {premium ? "on" : "premium"}
        </span>
      </button>
    </div>
  )
}

function Plate({
  index,
  label,
  active,
  onClick,
  badge,
  live,
  glyph,
  trailing,
  className = "",
}: {
  index?: number
  label: string
  active?: boolean
  onClick: () => void
  badge?: string
  /** A recording is running: a dot that beats, wherever you are in the app. */
  live?: boolean
  glyph?: React.ReactNode
  trailing?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`plate group pointer-events-auto relative flex items-center gap-2.5 py-2 pl-3 pr-2.5 text-left ${
        active ? "plate-on" : ""
      } ${className}`}
      style={{ clipPath: PLATE }}
    >
      {/* The leading edge carries the state on its own. One lit line beats a
          filled plate: it marks the choice without turning the item into a
          block of colour the eye has to read past. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2px] transition-colors"
        style={{ background: active ? "#00d992" : "rgba(215,216,217,0.10)" }}
      />

      {glyph ? (
        <span className="grid w-[13px] shrink-0 place-items-center">{glyph}</span>
      ) : (
        <span
          className={`w-[13px] shrink-0 font-jetbrains text-[9px] tabular-nums tracking-[0.1em] ${
            active ? "text-jade/70" : "text-flash/20"
          }`}
        >
          {String(index).padStart(2, "0")}
        </span>
      )}

      <span
        className={`font-chakrapetch text-[13px] font-bold tracking-wide transition-colors ${
          active ? "text-flash" : "text-flash/45 group-hover:text-flash/75"
        }`}
      >
        {label}
      </span>

      {live && <span className="beat ml-auto block h-[7px] w-[7px] rounded-full bg-jade" />}
      {badge && (
        <span className="ml-auto font-jetbrains text-[8px] uppercase tracking-[0.14em] text-citrine/50">
          {badge}
        </span>
      )}
      {trailing && <span className="ml-auto font-jetbrains text-[10px] text-flash/20">{trailing}</span>}
    </button>
  )
}

function DiscordMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden className="shrink-0 fill-flash/30 group-hover:fill-flash/55">
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4a15 15 0 0 1 4.3 2.2 18.6 18.6 0 0 0-15 0A15 15 0 0 1 8.8 3.4L8.6 3a19.8 19.8 0 0 0-4.9 1.4C.7 8.9-.1 13.2.3 17.5a19.9 19.9 0 0 0 6 3l.7-1.1a13 13 0 0 1-2-1c.2-.1.3-.2.5-.3a14.2 14.2 0 0 0 12.1 0l.5.3a13 13 0 0 1-2 1l.7 1.1a19.9 19.9 0 0 0 6-3c.5-5-.8-9.2-2.5-13.1ZM8.1 14.9c-1.2 0-2.1-1.1-2.1-2.4 0-1.3 1-2.4 2.1-2.4 1.2 0 2.2 1.1 2.2 2.4 0 1.3-1 2.4-2.2 2.4Zm7.8 0c-1.2 0-2.1-1.1-2.1-2.4 0-1.3.9-2.4 2.1-2.4 1.2 0 2.2 1.1 2.2 2.4 0 1.3-1 2.4-2.2 2.4Z" />
    </svg>
  )
}

/**
 * The app's version, floating in a corner.
 *
 * Not a bar: a bar claims a row of the window for the whole session, and this
 * earns a corner.
 */
function Version({ s }: { s: AppState | null }) {
  const v = s?.update?.version
  if (!v) return null

  return (
    <span className="pointer-events-none absolute bottom-3 right-4 z-20 font-jetbrains text-[9px] uppercase tracking-[0.2em] text-flash/[0.18]">
      v{v}
    </span>
  )
}
