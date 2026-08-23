import { useEffect, useState } from "react"
import { CDN, CDRAGON, isPremium, type AppState } from "./types"
import { Attached, Waiting } from "./sections/Overview"
import Matches from "./sections/Matches"
import Champions from "./sections/Champions"
import AiChat from "./sections/AiChat"
import Settings from "./sections/Settings"
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
type SectionId = "overview" | "matches" | "champions" | "ai"

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "matches", label: "Matches" },
  { id: "champions", label: "Champions" },
  { id: "ai", label: "lolData AI" },
]

const DISCORD = "https://discord.gg/loldata"

export default function App() {
  const [s, setS] = useState<AppState | null>(null)
  const [section, setSection] = useState<SectionId>("overview")
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    void window.desktop.getState().then(setS)
    return window.desktop.onState(setS)
  }, [])

  return (
    <div className="relative flex h-full flex-col bg-liquirice text-flash">
      <div aria-hidden className="dot-field pointer-events-none absolute inset-0" />

      <TitleBar s={s} />

      <div className="relative z-10 flex min-h-0 flex-1">
        <Rail
          section={section}
          onSection={setSection}
          settingsOpen={showSettings}
          onSettings={() => setShowSettings((v) => !v)}
          premium={isPremium(s?.account?.tier)}
        />

        {/* Keyed on the section so each one ASSEMBLES rather than swapping. */}
        <main key={section} className="ds-enter min-h-0 flex-1 overflow-hidden px-7 py-6">
          {section === "overview" ? (
            s?.client === "attached" ? <Attached s={s} /> : <Waiting />
          ) : !s ? null : section === "matches" ? (
            <Matches s={s} />
          ) : section === "champions" ? (
            <Champions s={s} />
          ) : (
            <AiChat s={s} />
          )}
        </main>
      </div>

      {showSettings && s && <Settings s={s} />}
      <StatusStrip s={s} />
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
        {account && (
          <span
            className={`rounded-[2px] px-1 font-jetbrains text-[8px] uppercase tracking-[0.14em] ${
              isPremium(account.tier) ? "bg-jade/15 text-jade" : "bg-flash/[0.07] text-flash/40"
            }`}
          >
            {account.tier ?? "free"}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="hud absolute right-0 top-[calc(100%+6px)] z-40 w-[248px] px-4 py-4">
            <span className="tick-b" />

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
              <p className="mt-1 truncate font-chakrapetch text-[13px] text-flash/70">
                {account?.email ?? (account ? "signed in" : "signed out")}
              </p>

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

function Rail({
  section,
  onSection,
  settingsOpen,
  onSettings,
  premium,
}: {
  section: SectionId
  onSection: (id: SectionId) => void
  settingsOpen: boolean
  onSettings: () => void
  premium: boolean
}) {
  return (
    <nav className="flex w-[188px] shrink-0 flex-col border-r border-jade/[0.10] px-3 py-5">
      {SECTIONS.map((sec, i) => {
        const active = sec.id === section
        return (
          <button
            key={sec.id}
            type="button"
            onClick={() => onSection(sec.id)}
            className="group relative flex items-center gap-2.5 rounded-[3px] px-2.5 py-2 text-left transition-colors"
            style={{
              background: active ? "rgba(0,217,146,0.08)" : undefined,
              boxShadow: active ? "inset 2px 0 0 0 #00d992" : undefined,
            }}
          >
            <span
              className={`font-jetbrains text-[9px] tabular-nums tracking-[0.1em] ${
                active ? "text-jade/70" : "text-flash/20"
              }`}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span
              className={`font-chakrapetch text-[13px] font-bold tracking-wide ${
                active ? "text-flash" : "text-flash/45 group-hover:text-flash/70"
              }`}
            >
              {sec.label}
            </span>
            {sec.id === "ai" && !premium && (
              <span className="ml-auto font-jetbrains text-[8px] uppercase tracking-[0.14em] text-citrine/50">
                pro
              </span>
            )}
          </button>
        )
      })}

      <span aria-hidden className="my-4 h-px bg-jade/[0.10]" />

      {/* Leaving the app, kept apart from moving within it. */}
      <button
        type="button"
        onClick={() => window.desktop.openExternal(DISCORD)}
        className="group flex items-center gap-2.5 rounded-[3px] px-2.5 py-2 text-left"
      >
        <DiscordMark />
        <span className="font-chakrapetch text-[13px] font-bold tracking-wide text-flash/45 group-hover:text-flash/70">
          Discord
        </span>
        <span className="ml-auto font-jetbrains text-[10px] text-flash/20">↗</span>
      </button>

      <button
        type="button"
        onClick={onSettings}
        className="group mt-auto flex items-center gap-2.5 rounded-[3px] px-2.5 py-2 text-left"
      >
        <span className={`h-[7px] w-[7px] rotate-45 ${settingsOpen ? "bg-jade" : "bg-flash/25"}`} />
        <span
          className={`font-chakrapetch text-[13px] font-bold tracking-wide ${
            settingsOpen ? "text-flash" : "text-flash/45 group-hover:text-flash/70"
          }`}
        >
          Overlay
        </span>
      </button>
    </nav>
  )
}

function DiscordMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden className="shrink-0 fill-flash/30 group-hover:fill-flash/55">
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4a15 15 0 0 1 4.3 2.2 18.6 18.6 0 0 0-15 0A15 15 0 0 1 8.8 3.4L8.6 3a19.8 19.8 0 0 0-4.9 1.4C.7 8.9-.1 13.2.3 17.5a19.9 19.9 0 0 0 6 3l.7-1.1a13 13 0 0 1-2-1c.2-.1.3-.2.5-.3a14.2 14.2 0 0 0 12.1 0l.5.3a13 13 0 0 1-2 1l.7 1.1a19.9 19.9 0 0 0 6-3c.5-5-.8-9.2-2.5-13.1ZM8.1 14.9c-1.2 0-2.1-1.1-2.1-2.4 0-1.3 1-2.4 2.1-2.4 1.2 0 2.2 1.1 2.2 2.4 0 1.3-1 2.4-2.2 2.4Zm7.8 0c-1.2 0-2.1-1.1-2.1-2.4 0-1.3.9-2.4 2.1-2.4 1.2 0 2.2 1.1 2.2 2.4 0 1.3-1 2.4-2.2 2.4Z" />
    </svg>
  )
}

function StatusStrip({ s }: { s: AppState | null }) {
  const attached = s?.client === "attached"
  return (
    <footer className="relative z-10 flex h-8 shrink-0 items-center gap-3 border-t border-jade/[0.10] px-3.5 font-jetbrains text-[9.5px] uppercase tracking-[0.16em]">
      <span className={`h-[6px] w-[6px] rounded-full ${attached ? "bg-jade beat" : "bg-flash/25"}`} />
      <span className={attached ? "text-jade/80" : "text-flash/30"}>
        {attached ? "client attached" : "waiting for client"}
      </span>

      {s?.phase && <span className="text-flash/25">{s.phase}</span>}

      <span className="ml-auto text-flash/20">{s?.patch ? `patch ${s.patch}` : ""}</span>
    </footer>
  )
}
