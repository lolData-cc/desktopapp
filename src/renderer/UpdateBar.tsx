import type { AppState } from "./types"

/**
 * The one place the app asks for something.
 *
 * It appears only when there IS a newer version, and it never acts on its own:
 * downloading takes a press, restarting takes another. An app that decides by
 * itself to close and reinstall — during champion select, say — is an app people
 * uninstall.
 *
 * A failed check shows nothing at all. The feed being unreachable is not the
 * player's problem and does not stop anything working; a red banner about it
 * would be noise about our infrastructure, in their window.
 */
export default function UpdateBar({ s }: { s: AppState }) {
  const u = s.update
  if (!s.canUpdate) return null
  if (u.state === "idle" || u.state === "checking" || u.state === "current" || u.state === "failed") {
    return null
  }

  const next = "next" in u ? u.next : ""

  return (
    <div
      className="ds-enter relative z-10 flex shrink-0 items-center gap-3 px-3.5 py-2"
      style={{
        background: "rgba(0,217,146,0.06)",
        boxShadow: "inset 0 1px 0 0 rgba(0,217,146,0.18)",
      }}
    >
      <span aria-hidden className="h-[7px] w-[7px] rotate-45 bg-jade" style={{ boxShadow: "0 0 8px #00d992" }} />

      <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.2em] text-jade/70">
        version {next} available
      </p>
      <p className="font-jetbrains text-[9.5px] tabular-nums text-flash/30">
        you have {u.version}
      </p>

      {u.state === "downloading" ? (
        <div className="ml-auto flex items-center gap-2.5">
          <span className="font-jetbrains text-[9.5px] tabular-nums text-flash/40">
            {u.percent}%
          </span>
          {/* The bar is the progress; the number is there to be exact, not to
              be watched. */}
          <span className="relative block h-[3px] w-[120px] overflow-hidden rounded-full bg-flash/[0.08]">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-jade transition-[width] duration-300"
              style={{ width: `${u.percent}%` }}
            />
          </span>
        </div>
      ) : u.state === "ready" ? (
        <button
          type="button"
          onClick={() => window.desktop.installUpdate()}
          className="act-btn ml-auto h-7 rounded-[3px] px-3 font-chakrapetch text-[11px] font-bold uppercase tracking-[0.12em]"
        >
          restart &amp; update
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void window.desktop.downloadUpdate()}
          className="act-btn ml-auto h-7 rounded-[3px] px-3 font-chakrapetch text-[11px] font-bold uppercase tracking-[0.12em]"
        >
          download
        </button>
      )}
    </div>
  )
}
