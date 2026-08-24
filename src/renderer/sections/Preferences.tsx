import { useEffect, useState } from "react"
import { CDN, type AppSettings, type AppState, type Recording } from "../types"

/**
 * Settings.
 *
 * Named Preferences in the file so it is not confused with the overlay's debug
 * strip, which was already called Settings and is a different thing: that one
 * is for inspecting the overlay while working on it, this one is for the person
 * using the app.
 *
 * Each switch says what it DOES, not what it is called. "Smart build" means
 * nothing on its own; "re-ask the data when you depart from the plan" is the
 * thing you are deciding about.
 *
 * ⚠️ Divided into sections rather than run down one column. It had grown past
 * a screenful, which turns every visit into a scroll and a scan — and the
 * capture settings that arrived with recording would have made it worse, being
 * the longest group and the least often changed. Four names on a rail beats
 * four headings you have to find.
 */
type TabId = "game" | "capture" | "app" | "account"

const TABS: { id: TabId; label: string }[] = [
  { id: "game", label: "In game" },
  { id: "capture", label: "Capture" },
  { id: "app", label: "Application" },
  { id: "account", label: "Account" },
]

export default function Preferences({ s }: { s: AppState }) {
  const set = (patch: Partial<AppSettings>) => void window.desktop.setSetting(patch)
  const v = s.settings
  const [tab, setTab] = useState<TabId>("game")

  const version = s.update?.version ?? "—"

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-baseline gap-3">
        <h2 className="font-chakrapetch text-[22px] font-bold leading-none">Settings</h2>
        <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.18em] text-flash/30">
          version {version}
        </p>
        {s.recording && (
          <span className="flex items-center gap-1.5 font-jetbrains text-[9.5px] uppercase tracking-[0.18em] text-jade">
            <span className="beat block h-[7px] w-[7px] rounded-full bg-jade" />
            recording now
          </span>
        )}
      </div>

      <div className="mt-4 flex shrink-0 gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 font-chakrapetch text-[12.5px] font-bold transition-colors ${
              tab === t.id ? "text-flash" : "text-flash/35 hover:text-flash/70"
            }`}
            style={{
              background: tab === t.id ? "rgba(0,217,146,0.06)" : "transparent",
              boxShadow: tab === t.id ? "inset 0 -2px 0 0 #00d992" : "inset 0 -1px 0 0 rgba(215,216,217,0.08)",
            }}
          >
            {t.label}
          </button>
        ))}
        <span className="flex-1" style={{ boxShadow: "inset 0 -1px 0 0 rgba(215,216,217,0.08)" }} />
      </div>

      <div key={tab} className="ds-enter mt-5 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {tab === "game" && <InGame v={v} set={set} />}
        {tab === "capture" && <CaptureTab s={s} v={v} set={set} />}
        {tab === "app" && <Application s={s} />}
        {tab === "account" && <Account s={s} />}
      </div>
    </div>
  )
}

/* ── in game ─────────────────────────────────────────────────────────────── */

function InGame({ v, set }: { v: AppSettings; set: (p: Partial<AppSettings>) => void }) {
  return (
    <>
      <Toggle
        on={v.goldReadout}
        onChange={(on) => set({ goldReadout: on })}
        label="Gold lead in the top-right strip"
        note="A chevron and a number beside the kill counter, in the game's own HUD row. Alt+O still summons the wider bar over the scoreboard."
      />
      <Toggle
        on={v.loadingBoard}
        onChange={(on) => set({ loadingBoard: on })}
        label="Ranks on the loading screen"
        note="The rank of all ten players over their cards while the game loads — pre-game information, on the one screen where there is time to read it."
      />
      <Toggle
        on={v.objectiveNotices}
        onChange={(on) => set({ objectiveNotices: on })}
        label="Dragon and Baron warnings"
        note="A notice 90 seconds before a spawn, with who has taken which drakes so far."
      />
      <Toggle
        on={v.buildNotices}
        onChange={(on) => set({ buildNotices: on })}
        label="Build notices"
        note="The opening build, boots advice for the enemy comp, and “X is purchasable” once you can actually afford it."
      />
      <Toggle
        on={v.smartBuild}
        onChange={(on) => set({ smartBuild: on })}
        label="Smart build"
        note="If you buy something that is not in a saved build, stop following it and ask what players who reached your actual inventory built next. Applies to every champion — it describes how you want to be advised, which does not change from one to another. Costs a query each time your items change."
      />
    </>
  )
}

/* ── capture ─────────────────────────────────────────────────────────────── */

const AUDIO: { value: AppSettings["captureAudio"]; label: string; note: string }[] = [
  { value: "none", label: "None", note: "Video only." },
  {
    value: "system",
    label: "System",
    note: "Everything the machine plays — game, Discord, music — as one track.",
  },
  { value: "mic", label: "Microphone", note: "Your voice only." },
  { value: "both", label: "Both", note: "System and microphone, mixed." },
]

/**
 * Recording, and the library behind it.
 *
 * ⚠️ The switch is OFF until the player turns it on, and the app says so in
 * game every time it records. Recording someone's screen is not a feature you
 * enable on their behalf, and a program that captures without announcing it is
 * spyware whatever it does with the file.
 *
 * ⚠️ This is the LIBRARY, not the viewer. Watching a recording happens on the
 * game it belongs to, over in Matches; what is here is the housekeeping —
 * what exists, what it costs, what to keep and what to throw away. It also
 * catches the recordings no match claims, which would otherwise be invisible
 * and undeletable.
 */
function CaptureTab({
  s,
  v,
  set,
}: {
  s: AppState
  v: AppSettings
  set: (p: Partial<AppSettings>) => void
}) {
  useEffect(() => { void window.desktop.listRecordings() }, [])

  const kept = s.recordings.filter((r) => r.kept).length
  const automatic = s.recordings.length - kept

  return (
    <div className="space-y-6">
      {s.captureError && (
        <p
          className="rounded-[3px] px-3.5 py-2.5 font-chakrapetch text-[12px] text-citrine/80"
          style={{ background: "rgba(255,182,21,0.07)" }}
        >
          {s.captureError}
        </p>
      )}

      <Toggle
        on={v.capture}
        onChange={(on) => set({ capture: on })}
        label="Record my games"
        note="Records the League window only — never your whole screen, and nothing else you have open. Starts when the game does and stops when it ends, and the overlay says so every time; that notice cannot be switched off. Around 1.3 GB per game at 1080p, so a full library of ten is roughly 13 GB."
      />

      {v.capture && (
        <section>
          <p className="mb-2 font-jetbrains text-[9.5px] uppercase tracking-[0.2em] text-flash/30">audio</p>
          <div className="grid grid-cols-2 gap-1.5">
            {AUDIO.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => set({ captureAudio: a.value })}
                className="rounded-[3px] px-3.5 py-2.5 text-left transition"
                style={{
                  background:
                    v.captureAudio === a.value ? "rgba(0,217,146,0.06)" : "rgba(215,216,217,0.022)",
                  boxShadow:
                    v.captureAudio === a.value ? "inset 2px 0 0 0 rgba(0,217,146,0.5)" : undefined,
                }}
              >
                <span
                  className={`block font-chakrapetch text-[13px] font-bold ${
                    v.captureAudio === a.value ? "text-flash" : "text-flash/55"
                  }`}
                >
                  {a.label}
                </span>
                <span className="mt-0.5 block font-chakrapetch text-[11px] leading-snug text-flash/30">
                  {a.note}
                </span>
              </button>
            ))}
          </div>

          {/* ⚠️ Said plainly rather than left to be discovered. Splitting the
              game from Discord needs Windows' per-process loopback through a
              native module; the audio Chromium exposes is one mix. A "game
              only" option here would be a switch that quietly did something
              else. */}
          <p className="mt-2.5 max-w-[70ch] font-chakrapetch text-[11.5px] leading-snug text-flash/25">
            Game and Discord audio cannot be separated — Windows hands out one mixed
            track, and splitting it is not something this app can do today.
          </p>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-baseline gap-3">
          <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.2em] text-flash/30">library</p>
          <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.16em] text-flash/25">
            {automatic} of 10 automatic{kept > 0 ? ` · ${kept} kept` : ""} · {gb(s.libraryBytes)}
          </p>
        </div>

        {s.recordings.length === 0 ? (
          <p className="max-w-[60ch] font-chakrapetch text-[12.5px] leading-snug text-flash/30">
            {v.capture
              ? "Nothing recorded yet. The next game you play lands here, and on the game itself over in Matches."
              : "Recording is off. Turn it on and your games are kept here — the last ten, with the oldest dropped as new ones arrive."}
          </p>
        ) : (
          <>
            <p className="mb-2 max-w-[60ch] font-chakrapetch text-[11.5px] leading-snug text-flash/25">
              Watch them on the game they belong to, in Matches. This is what exists
              and what it costs — keeping one takes it out of the ten, so the limit
              can never delete something you asked to save.
            </p>
            <div className="space-y-1.5">
              {s.recordings.map((r, i) => (
                <Row key={r.id} r={r} patch={s.patch ?? "16.16.1"} index={i} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function Row({ r, patch, index }: { r: Recording; patch: string; index: number }) {
  const kills = r.highlights.filter((h) => h.kind === "kill").length
  const deaths = r.highlights.filter((h) => h.kind === "death").length

  return (
    <div
      className="ds-row flex items-center gap-3 rounded-[3px] py-2 pl-3 pr-2.5"
      style={{
        background: r.kept ? "rgba(0,217,146,0.05)" : "rgba(215,216,217,0.022)",
        boxShadow: r.kept ? "inset 2px 0 0 0 rgba(0,217,146,0.5)" : undefined,
        animationDelay: `${Math.min(index, 12) * 28}ms`,
      }}
    >
      {r.championId ? (
        <img
          src={`${CDN}/${patch}/img/champion/${r.championId}.png`}
          alt=""
          className="h-9 w-9 shrink-0 rounded-[3px] ring-1 ring-jade/15"
        />
      ) : (
        <span className="block h-9 w-9 shrink-0 rounded-[3px] bg-flash/[0.05]" />
      )}

      <div className="w-[120px] shrink-0">
        <p className="truncate font-chakrapetch text-[13px] font-bold leading-tight">
          {r.championName ?? "Game"}
        </p>
        <p className="font-jetbrains text-[9px] uppercase tracking-[0.14em] text-flash/25">
          {r.win === null ? "—" : r.win ? "win" : "loss"} · {mins(r.durationMs)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <Tally n={kills} label="kills" colour="#00d992" />
        <Tally n={deaths} label="deaths" colour="#ff6286" />
      </div>

      <span className="ml-auto shrink-0 font-jetbrains text-[9px] uppercase tracking-[0.14em] text-flash/25">
        {gb(r.bytes)}
      </span>

      <button
        type="button"
        onClick={() => void window.desktop.keepRecording(r.id, !r.kept)}
        title={
          r.kept
            ? "Let this one age out with the rest"
            : "Keep this one — the ten-game limit stops counting it"
        }
        className={`win-btn h-6 shrink-0 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] ${
          r.kept ? "bg-jade/15 text-jade" : "text-flash/30"
        }`}
      >
        {r.kept ? "kept" : "keep"}
      </button>

      <button
        type="button"
        onClick={() => void window.desktop.revealRecording(r.id)}
        className="win-btn h-6 shrink-0 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/30"
      >
        show
      </button>

      <button
        type="button"
        onClick={() => void window.desktop.deleteRecording(r.id)}
        className="win-btn danger h-6 shrink-0 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/25"
      >
        delete
      </button>
    </div>
  )
}

const Tally = ({ n, label, colour }: { n: number; label: string; colour: string }) => (
  <div className="w-[38px] text-right">
    <p
      className="font-chakrapetch text-[13px] font-bold leading-none tabular-nums"
      style={{ color: n ? colour : "rgba(215,216,217,0.2)" }}
    >
      {n}
    </p>
    <p className="font-jetbrains text-[8px] uppercase tracking-[0.12em] text-flash/20">{label}</p>
  </div>
)

const mins = (ms: number) => `${Math.max(1, Math.round(ms / 60000))} min`

const gb = (bytes: number) =>
  bytes >= 1_073_741_824
    ? `${(bytes / 1_073_741_824).toFixed(1)} GB`
    : `${Math.round(bytes / 1_048_576)} MB`

/* ── application ─────────────────────────────────────────────────────────── */

function Application({ s }: { s: AppState }) {
  const set = (patch: Partial<AppSettings>) => void window.desktop.setSetting(patch)
  const update = s.update
  const checking = update?.state === "checking"
  const ready = update?.state === "ready"
  const available = update?.state === "available"

  return (
    <>
      <Toggle
        on={s.settings.launchAtLogin}
        onChange={(on) => set({ launchAtLogin: on })}
        label="Start with Windows"
        note="Opens minimised, so it is attached to the client by the time you are in champion select."
      />

      <SettingRow
        label="Updates"
        note={
          ready
            ? "An update is downloaded and will apply on restart."
            : available
              ? "An update is available."
              : checking
                ? "Checking…"
                : "Nothing downloads on its own; the check is automatic, the install is a button."
        }
      >
        <button
          type="button"
          disabled={checking}
          onClick={() => void window.desktop.checkUpdate()}
          className="win-btn h-6 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/40"
        >
          {checking ? "checking" : "check now"}
        </button>
        {available && (
          <button
            type="button"
            onClick={() => void window.desktop.downloadUpdate()}
            className="act-btn h-6 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em]"
          >
            download
          </button>
        )}
        {ready && (
          <button
            type="button"
            onClick={() => window.desktop.installUpdate()}
            className="act-btn h-6 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em]"
          >
            restart &amp; update
          </button>
        )}
      </SettingRow>

      <SettingRow
        label="Saved data"
        note="Your builds, rune choices and these settings, in one file. Nothing is sent anywhere."
      >
        <button
          type="button"
          onClick={() => void window.desktop.revealSettings()}
          className="win-btn h-6 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/40"
        >
          show file
        </button>
      </SettingRow>

      <SettingRow label="Restart" note="Reopens the app, boot animation and all.">
        <button
          type="button"
          onClick={() => window.desktop.relaunch()}
          className="win-btn h-6 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/40"
        >
          restart
        </button>
      </SettingRow>
    </>
  )
}

/* ── account ─────────────────────────────────────────────────────────────── */

function Account({ s }: { s: AppState }) {
  return (
    <SettingRow
      label={s.account?.email ?? "Not signed in"}
      note={
        s.account
          ? `${(s.account.tier ?? "free").toUpperCase()} · signing in happens in your browser, never in this window.`
          : "Sign in on the website; the session is handed back to the app. This window has no field that could take a password."
      }
    >
      {s.account ? (
        <button
          type="button"
          onClick={() => void window.desktop.signOut()}
          className="win-btn danger h-6 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/40"
        >
          sign out
        </button>
      ) : (
        <button
          type="button"
          onClick={() => window.desktop.signIn()}
          className="act-btn h-6 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em]"
        >
          sign in
        </button>
      )}
    </SettingRow>
  )
}

/* ── the pieces ──────────────────────────────────────────────────────────── */

function SettingRow({
  label,
  note,
  children,
}: {
  label: string
  note: string
  children: React.ReactNode
}) {
  return (
    <div
      className="flex items-start gap-4 rounded-[3px] px-3.5 py-3"
      style={{ background: "rgba(215,216,217,0.022)" }}
    >
      <div className="min-w-0 flex-1">
        <p className="font-chakrapetch text-[13px] font-bold leading-tight">{label}</p>
        <p className="mt-0.5 max-w-[68ch] font-chakrapetch text-[11.5px] leading-snug text-flash/30">{note}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 pt-0.5">{children}</div>
    </div>
  )
}

export function Toggle({
  on,
  onChange,
  label,
  note,
}: {
  on: boolean
  onChange: (on: boolean) => void
  label: string
  note: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex w-full items-start gap-3.5 rounded-[3px] px-3.5 py-3 text-left transition"
      style={{
        background: on ? "rgba(0,217,146,0.05)" : "rgba(215,216,217,0.022)",
        boxShadow: on ? "inset 2px 0 0 0 rgba(0,217,146,0.5)" : undefined,
      }}
    >
      <span
        className="mt-[3px] grid h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition"
        style={{ background: on ? "rgba(0,217,146,0.32)" : "rgba(215,216,217,0.10)" }}
      >
        <span
          className="h-4 w-4 rounded-full transition-transform"
          style={{
            background: on ? "#00d992" : "rgba(215,216,217,0.35)",
            transform: on ? "translateX(16px)" : "translateX(0)",
          }}
        />
      </span>
      <span className="min-w-0">
        <span className="block font-chakrapetch text-[13px] font-bold leading-tight">{label}</span>
        <span className="mt-0.5 block max-w-[70ch] font-chakrapetch text-[11.5px] leading-snug text-flash/30">
          {note}
        </span>
      </span>
    </button>
  )
}
