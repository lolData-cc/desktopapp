import { useEffect, useState } from "react"
import { CDN, CDRAGON, isPremium, planBadge, type AppState } from "./types"
import { Attached, Waiting } from "./sections/Overview"
import Matches from "./sections/Matches"
import Champions from "./sections/Champions"
import AiChat from "./sections/AiChat"
import Patch from "./sections/Patch"
import Builds from "./sections/Builds"
import BuildEditor from "./sections/BuildEditor"
import Preferences from "./sections/Preferences"
import Capture from "./sections/Capture"
import CyberBackdrop from "./CyberBackdrop"
import Boundary from "./Boundary"
import Recap, { isPostGame } from "./sections/Recap"
import Settings from "./sections/Settings"
import UpdateBar from "./UpdateBar"
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
type SectionId = "overview" | "builds" | "matches" | "champions" | "patch" | "ai" | "capture" | "settings"

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "builds", label: "Builds" },
  { id: "matches", label: "Matches" },
  { id: "champions", label: "Champions" },
  { id: "patch", label: "Patch" },
  { id: "ai", label: "lolData AI" },
  { id: "capture", label: "Capture" },
]

const DISCORD = "https://discord.gg/loldata"

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
   * ⚠️ Cleared when the PHASE leaves post-game, not keyed on the match id. The
   * client writes history late, so a dismissal keyed on `matches[0]` would be
   * keyed on the PREVIOUS game — and the recap would pop straight back up the
   * moment the real one arrived, having just been dismissed.
   */
  const [dismissed, setDismissed] = useState(false)
  // Which past game the recap is being previewed over, or null for off. An
  // INDEX rather than a match, so the button can step through recent games and
  // the framing can be checked on champions of different sizes.
  const [preview, setPreview] = useState<number | null>(null)

  useEffect(() => {
    void window.desktop.getState().then(setS)
    return window.desktop.onState(setS)
  }, [])

  const post = isPostGame(s?.phase ?? null)

  useEffect(() => {
    if (!post) setDismissed(false)
  }, [post])

  // Something to show: the champion from the game we just watched, or failing
  // that whatever history has.
  const previewMatch = preview !== null ? (s?.matches?.[preview] ?? null) : null
  const showRecap =
    !!previewMatch || (post && !dismissed && (!!s?.lastPlayed || !!s?.matches?.length))

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
            section === "overview" ? "px-7" : "pl-[210px] pr-7"
          }`}
        >
          {/* Only on the Overview, and only when there is no live board: over
              ten rows of numbers this would be noise, and the board is the one
              screen already full. */}
          {section === "overview" && !s?.scoreboard && !showRecap && <CyberBackdrop />}
          {/* One section throwing must not blank the window. Keyed on the
              section so leaving a broken screen clears the fault instead of
              latching it until restart. */}
          <Boundary resetKey={`${section}:${editing ?? ""}:${preview ?? ""}`}>
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
          ) : !s ? null : section === "builds" ? (
            editing ? (
              <BuildEditor s={s} championId={editing} onBack={() => setEditing(null)} />
            ) : (
              <Builds s={s} onOpen={setEditing} />
            )
          ) : section === "matches" ? (
            <Matches s={s} />
          ) : section === "champions" ? (
            <Champions s={s} />
          ) : section === "patch" ? (
            <Patch s={s} />
          ) : section === "capture" ? (
            <Capture s={s} />
          ) : section === "settings" ? (
            <Preferences s={s} />
          ) : (
            <AiChat s={s} />
          )}
          </div>
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

      {s && <UpdateBar s={s} />}
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

/* ── chrome ──────────────────────────────────────────────────────────────── */

function TitleBar({ s }: { s: AppState | null }) {
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
        <Account s={s} />

        <button
          type="button"
          onClick={() => window.desktop.minimise()}
          aria-label="Minimise"
          className="win-btn ml-1 grid h-11 w-11 place-items-center text-flash/40"
        >
          <span className="block h-px w-[11px] bg-current" />
        </button>
        <button
          type="button"
          onClick={() => window.desktop.close()}
          aria-label="Close"
          className="win-btn danger grid h-11 w-11 place-items-center text-flash/40"
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
function Account({ s }: { s: AppState | null }) {
  const [open, setOpen] = useState(false)
  const summoner = s?.summoner
  const account = s?.account
  const patch = s?.patch ?? "16.16.1"
  const badge = planBadge(account?.tier)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="win-btn flex h-8 items-center gap-2 rounded-[3px] pl-1 pr-2.5"
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
          badge={sec.id === "ai" && !premium ? "pro" : undefined}
          /* A recording running is worth seeing from every section, not only
             from the one that started it. */
          live={sec.id === "capture" && recording}
        />
      ))}

      <Plate
        className="mt-6"
        label="Discord"
        onClick={() => window.desktop.openExternal(DISCORD)}
        glyph={<DiscordMark />}
        trailing="↗"
      />

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
    </nav>
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
