import { ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/ui/dropdown-menu"
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
  {
    value: "split",
    label: "Game + Discord",
    note: "Recorded apart, so the replay can turn one down without the other.",
  },
]

/**
 * How much disk the recordings may take.
 *
 * ⚠️ A SIZE, not a number of games. Nobody runs out of games, they run out of
 * disk — and a twelve-minute remake and a fifty-minute marathon are not the
 * same amount of anything except "one". This replaced a fixed last-ten rule,
 * which had to go the moment "unlimited" appeared beside it: a limit that still
 * threw away the eleventh game would have made the word a lie.
 */
const BUDGETS: { value: number | null; label: string; note: string }[] = [
  { value: 5, label: "5 GB", note: "About four games." },
  { value: 25, label: "25 GB", note: "About nineteen games." },
  {
    value: null,
    label: "No limit",
    note: "Nothing is ever discarded. Your disk fills until you delete something here.",
  },
]

/**
 * How smooth, and what it costs.
 *
 * ⚠️ Every rate here was measured on this machine before it was offered — the
 * capture pipeline hands back exactly what is asked for at 30, 60 and 120. A
 * chooser whose third option quietly produced the second would be worse than
 * having no chooser.
 *
 * 120 comes with a warning rather than being withheld. It really does ask more
 * of the GPU's encoder, which is the one budget this feature promised not to
 * spend — the point of hardware H264 was that recording must not cost the game
 * any frames. But that is a fact to state, not a reason to decide for somebody
 * who asked to choose.
 */
const RATES: { value: number; label: string; note: string }[] = [
  { value: 30, label: "30 fps", note: "Smooth enough to read a fight, and the smallest files." },
  { value: 60, label: "60 fps", note: "Matches most monitors. Twice the file." },
  { value: 120, label: "120 fps", note: "Four times the file, and the only setting here that can cost you frames in game." },
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
  const sum = (want: boolean) =>
    s.recordings.filter((r) => r.kept === want).reduce((n, r) => n + r.bytes, 0)
  const keptBytes = sum(true)
  const autoBytes = sum(false)

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
          <MicSettings v={v} set={set} />

          {/* ⚠️ Said plainly, and said DIFFERENTLY on a machine that cannot do
              it. The capture underneath is Windows 11's per-process loopback;
              no consumer Windows 10 build has the API. An option that is
              offered and then silently downgraded is worse than one that says
              why it is not available. */}
          <p className="mt-2.5 max-w-[70ch] font-chakrapetch text-[11.5px] leading-snug text-flash/25">
            Game + Discord needs Windows 11, and both of them running when the game
            starts. When either is missing the recording falls back to one mixed
            track — you get the game, just not the two of them apart.
          </p>
        </section>
      )}

      {v.capture && (
        <section>
          <p className="mb-2 font-jetbrains text-[9.5px] uppercase tracking-[0.2em] text-flash/30">
            frame rate
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {RATES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => set({ captureFps: r.value })}
                className="rounded-[3px] px-3.5 py-2.5 text-left transition"
                style={{
                  background: v.captureFps === r.value ? "rgba(0,217,146,0.06)" : "rgba(215,216,217,0.022)",
                  boxShadow: v.captureFps === r.value ? "inset 2px 0 0 0 rgba(0,217,146,0.5)" : undefined,
                }}
              >
                <span
                  className={`block font-chakrapetch text-[13px] font-bold ${
                    v.captureFps === r.value ? "text-flash" : "text-flash/55"
                  }`}
                >
                  {r.label}
                </span>
                <span className="mt-0.5 block font-chakrapetch text-[11px] leading-snug text-flash/30">
                  {r.note}
                </span>
              </button>
            ))}
          </div>
          {/* ⚠️ The bitrate follows the frame rate. The same bits spread over
              twice as many frames is half the detail in each one, so 60 at a 30
              bitrate would look WORSE than 30 did — the opposite of what
              choosing it asks for. */}
          <p className="mt-2.5 max-w-[70ch] font-chakrapetch text-[11.5px] leading-snug text-flash/25">
            The quality follows the rate, so 60 fps really is about twice the file —
            roughly 2.6 GB for a half-hour game instead of 1.3. Each recording says
            what it actually captured at, below, rather than what was asked for.
          </p>
        </section>
      )}

      {v.capture && (
        <section>
          <p className="mb-2 font-jetbrains text-[9.5px] uppercase tracking-[0.2em] text-flash/30">
            how much to keep
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {BUDGETS.map((b) => (
              <button
                key={b.label}
                type="button"
                onClick={() => set({ captureBudgetGb: b.value })}
                className="rounded-[3px] px-3.5 py-2.5 text-left transition"
                style={{
                  background:
                    v.captureBudgetGb === b.value ? "rgba(0,217,146,0.06)" : "rgba(215,216,217,0.022)",
                  boxShadow:
                    v.captureBudgetGb === b.value ? "inset 2px 0 0 0 rgba(0,217,146,0.5)" : undefined,
                }}
              >
                <span
                  className={`block font-chakrapetch text-[13px] font-bold ${
                    v.captureBudgetGb === b.value ? "text-flash" : "text-flash/55"
                  }`}
                >
                  {b.label}
                </span>
                <span className="mt-0.5 block font-chakrapetch text-[11px] leading-snug text-flash/30">
                  {b.note}
                </span>
              </button>
            ))}
          </div>

          {/* ⚠️ Said, not implied. Lowering this deletes files, and finding that
              out afterwards is the wrong moment. */}
          <p className="mt-2.5 max-w-[70ch] font-chakrapetch text-[11.5px] leading-snug text-flash/25">
            The oldest go first, and lowering this takes effect immediately.
            Anything you have kept is outside the limit and is never discarded —
            the newest recording is too, however large it is.
          </p>
        </section>
      )}

      {/**
        * ⚠️ Three numbers, not one, because they obey three different rules.
        * The automatic recordings are what the size limit governs; the kept
        * ones are deliberately outside it; the clips are cuts that can always
        * be made again. A single "storage used" would hide the only one you can
        * act on.
        */}
      <section>
        <p className="mb-2 font-jetbrains text-[9.5px] uppercase tracking-[0.2em] text-flash/30">
          disk used
        </p>
        <div className="space-y-1.5">
          <Line
            label="Recordings"
            note={`${automatic} game${automatic === 1 ? "" : "s"} under the size limit`}
            bytes={s.storage.recordings}
            action={automatic > 0 ? "empty" : null}
            disabled={s.recording}
            onAction={() => void window.desktop.emptyRecordings(false)}
          />
          {kept > 0 && (
            <Line
              label="Kept recordings"
              note="Outside the limit — never discarded on their own"
              bytes={s.storage.kept}
              action="delete these too"
              disabled={s.recording}
              onAction={() => void window.desktop.emptyRecordings(true)}
            />
          )}
          <Line
            label="Shared clips"
            note={`${s.storage.clipCount} cut to send · the recordings they came from are untouched`}
            bytes={s.storage.clips}
            action={s.storage.clipCount > 0 ? "empty" : null}
            onAction={() => void window.desktop.emptyClips()}
            onShow={() => void window.desktop.revealClipFolder()}
          />
          <div className="flex items-center gap-3 px-3.5 pt-1">
            <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.16em] text-flash/30">
              total on disk
            </p>
            <p className="ml-auto font-chakrapetch text-[14px] font-bold tabular-nums text-flash/80">
              {gb(s.storage.recordings + s.storage.kept + s.storage.clips)}
            </p>
          </div>
        </div>
        {s.recording && (
          <p className="mt-2 font-chakrapetch text-[11.5px] text-citrine/60">
            A game is being recorded — nothing can be deleted until it finishes.
          </p>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-baseline gap-3">
          <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.2em] text-flash/30">library</p>
          {/* ⚠️ The two totals apart, because they obey different rules. One is
              spending the budget; the other is not in it at all. */}
          <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.16em] text-flash/25">
            {gb(autoBytes)} automatic
            {v.captureBudgetGb === null ? " · no limit" : ` of ${v.captureBudgetGb} GB`}
            {kept > 0 ? ` · ${gb(keptBytes)} kept` : ""}
            {" · "}{automatic + kept} game{automatic + kept === 1 ? "" : "s"}
          </p>
        </div>

        {s.recordings.length === 0 ? (
          <p className="max-w-[60ch] font-chakrapetch text-[12.5px] leading-snug text-flash/30">
            {v.capture
              ? "Nothing recorded yet. The next game you play lands here, and on the game itself over in Matches."
              : "Recording is off. Turn it on and your games are kept here, up to the size you choose, with the oldest dropped as new ones arrive."}
          </p>
        ) : (
          <>
            <p className="mb-2 max-w-[60ch] font-chakrapetch text-[11.5px] leading-snug text-flash/25">
              Watch them on the game they belong to, in Matches. This is what exists
              and what it costs — keeping one takes it out of the budget, so the
              limit can never delete something you asked to save.
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
          {r.fps > 0 && ` · ${r.fps}fps`}
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
            : "Keep this one — the size limit stops counting it, so it is never discarded"
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

/**
 * One thing taking up disk, with what it costs and how to be rid of it.
 *
 * ⚠️ The button says what it does — "empty", "delete these too" — and the
 * confirmation is a native dialog raised by the shell, naming the exact count
 * and size. Deleting video has no undo and no recycle bin; a button that only
 * says "clear" is a button people press without reading.
 */
function Line({
  label,
  note,
  bytes,
  action,
  disabled,
  onAction,
  onShow,
}: {
  label: string
  note: string
  bytes: number
  action: string | null
  disabled?: boolean
  onAction: () => void
  onShow?: () => void
}) {
  return (
    <div className="flex items-center gap-4 rounded-[3px] px-3.5 py-2.5" style={{ background: "rgba(215,216,217,0.022)" }}>
      <div className="min-w-0 flex-1">
        <p className="font-chakrapetch text-[13px] font-bold leading-tight">{label}</p>
        <p className="mt-0.5 font-chakrapetch text-[11.5px] leading-snug text-flash/30">{note}</p>
      </div>
      <p className="shrink-0 font-chakrapetch text-[14px] font-bold tabular-nums text-flash/75">{gb(bytes)}</p>
      {onShow && (
        <button
          type="button"
          onClick={onShow}
          className="win-btn h-6 shrink-0 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/35"
        >
          show
        </button>
      )}
      {action && (
        <button
          type="button"
          onClick={onAction}
          disabled={disabled}
          className="win-btn danger h-6 shrink-0 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/40 disabled:opacity-30"
        >
          {action}
        </button>
      )}
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

      {/* ⚠️ Says what STAYS. An uninstaller removes the program; the
          recordings live in your own AppData and are not its business, so
          anybody uninstalling to reclaim disk has to be told they will still
          be there — and pointed at the tab that empties them. */}
      <SettingRow
        label="Uninstall"
        note="Opens the uninstaller. Your recordings and clips are not removed with it — they live in your own folder, and the Capture tab above can empty them first."
      >
        <button
          type="button"
          onClick={() => void window.desktop.uninstall()}
          className="win-btn danger h-6 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/40"
        >
          uninstall
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

/**
 * Which microphone, in this app's own clothes.
 *
 * ⚠️ NOT a native <select>. On Windows that is a white system menu with a
 * white field, and it landed in the middle of a dark panel looking like a
 * dialog from another program. The site solves the same problem in its player
 * search — the region switcher — and this is that control: a quiet trigger that
 * lights on hover, a chevron that turns, and a dark sheet with a jade tick down
 * the left of the chosen row.
 *
 * ⚠️ The tick is a BORDER, not only a tint. A colour alone is the one thing a
 * red-green colourblind player cannot read, and this app has a lot of both.
 */
function MicPicker({
  devices,
  chosen,
  onPick,
}: {
  devices: MediaDeviceInfo[]
  chosen: string | null
  onPick: (id: string | null) => void
}) {
  const name = (d: MediaDeviceInfo, i: number) => d.label || `Input ${i + 1}`
  const here = devices.findIndex((d) => d.deviceId === chosen)
  const label = chosen && here >= 0 ? name(devices[here]!, here) : "System default"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="group flex w-full items-center gap-2 rounded-[3px] px-2.5 py-2 text-left outline-none transition-colors"
        style={{ background: "rgba(215,216,217,0.03)", boxShadow: "inset 0 0 0 1px rgba(0,217,146,0.14)" }}
      >
        <span className="min-w-0 flex-1 truncate font-chakrapetch text-[12.5px] text-flash/75 transition-colors group-hover:text-flash">
          {label}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 text-flash/40 transition-transform duration-200 group-data-[state=open]:rotate-180 group-data-[state=open]:text-jade" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="max-h-[260px] min-w-[240px] overflow-y-auto rounded-md border border-jade/20 bg-black/90 p-1 backdrop-blur-xl"
      >
        {/* The default is a real choice, and the only one that survives the
            device being unplugged — so it is first and it is named. */}
        <MicRow label="System default" active={!chosen} onPick={() => onPick(null)} />
        {devices.map((d, i) => (
          <MicRow
            key={d.deviceId}
            label={name(d, i)}
            active={d.deviceId === chosen}
            onPick={() => onPick(d.deviceId)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const MicRow = ({
  label,
  active,
  onPick,
}: {
  label: string
  active: boolean
  onPick: () => void
}) => (
  <DropdownMenuItem
    onClick={onPick}
    className={`cursor-pointer truncate rounded-[3px] border-l-2 px-3 py-1.5 font-chakrapetch text-[11.5px] transition-colors focus:bg-jade/10 focus:text-jade ${
      active ? "border-jade bg-jade/[0.08] text-jade" : "border-transparent text-flash/55 hover:border-jade/30"
    }`}
  >
    {label}
  </DropdownMenuItem>
)

/**
 * The microphone: whether, which one, and how loud.
 *
 * ⚠️ SEPARATE FROM THE LIST ABOVE, and that is the fix rather than the feature.
 * The voice used to be two members of that list — "Microphone" and "Both" — so
 * "record my voice" and "record the machine" were one question, and the answer
 * that meant BOTH of them and kept Discord separate did not exist. Choosing
 * "Game + Discord" silently dropped the player's own voice.
 */
function MicSettings({
  v,
  set,
}: {
  v: AppSettings
  set: (patch: Partial<AppSettings>) => void
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [asked, setAsked] = useState(false)

  useEffect(() => {
    if (!v.captureMic) return
    let alive = true

    const list = async () => {
      const all = await navigator.mediaDevices.enumerateDevices().catch(() => [])
      const ins = all.filter((d) => d.kind === "audioinput")
      if (alive) setDevices(ins)
      return ins
    }

    void list().then(async (ins) => {
      /**
       * ⚠️ Device LABELS are empty until microphone permission has been granted
       * once — the list comes back with ids and blank names, which is a dropdown
       * of indistinguishable rows. Asking for a stream and immediately stopping
       * it is what unlocks them, and it is done once, only after the player has
       * turned the microphone on: opening a settings page should not take a
       * microphone.
       */
      if (asked || ins.some((d) => d.label)) return
      setAsked(true)
      const s = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null)
      s?.getTracks().forEach((t) => t.stop())
      if (alive) void list()
    })

    return () => { alive = false }
  }, [v.captureMic, asked])

  return (
    <div className="mt-3">
      <Toggle
        on={!!v.captureMic}
        onChange={(on) => set({ captureMic: on })}
        label="Record my microphone"
        note="Mixed into the recording alongside whatever the machine plays. Your voice is captured only while a game is being recorded, and never on its own."
      />

      {v.captureMic && (
        // ⚠️ Side by side, half each. Stacked, the device sat on a full-width
        // row it did not need — a name is short — while the level got a strip
        // so wide that a five-percent step moved the handle a hair.
        <div className="mt-3 grid grid-cols-2 gap-4 pl-1">
          <div className="min-w-0">
            <p className="mb-1.5 font-jetbrains text-[9px] uppercase tracking-[0.2em] text-flash/30">
              device
            </p>
            <MicPicker
              devices={devices}
              chosen={v.captureMicDevice ?? null}
              onPick={(id) => set({ captureMicDevice: id })}
            />
          </div>

          <div className="min-w-0">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <p className="font-jetbrains text-[9px] uppercase tracking-[0.2em] text-flash/30">
                level
              </p>
              {/* ⚠️ Says what it IS, not where the handle is. Above 100% is
                  amplification, and a headset mic against game audio very often
                  needs it — so the scale goes there and admits it. */}
              <p className="font-jetbrains text-[10px] tabular-nums text-flash/45">
                {Math.round((v.captureMicVolume ?? 1) * 100)}%
              </p>
            </div>
            {/* ⚠️ The track is DRAWN, because this app strips `appearance` from
                every input in its base layer — which is what the Explorer
                needed and what left this control as a bare handle floating on
                nothing. The jade run is a gradient stop at the current value,
                since a range input has no fill of its own. */}
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={v.captureMicVolume ?? 1}
              aria-label="Microphone level"
              onChange={(e) => set({ captureMicVolume: Number(e.target.value) })}
              className="mic-level w-full"
              style={{
                background: `linear-gradient(90deg, #00d992 0%, #00d992 ${
                  ((v.captureMicVolume ?? 1) / 2) * 100
                }%, rgba(215,216,217,0.14) ${((v.captureMicVolume ?? 1) / 2) * 100}%, rgba(215,216,217,0.14) 100%)`,
              }}
            />
            {/* 100% is the only number on this scale with a meaning of its own:
                everything above it is amplification. */}
            <div className="mt-1 flex justify-between font-jetbrains text-[8px] uppercase tracking-[0.14em] text-flash/20">
              <span>off</span>
              <span>100%</span>
              <span>200%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

