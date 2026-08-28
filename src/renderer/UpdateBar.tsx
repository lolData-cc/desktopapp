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
 *
 * ⚠️ It FLOATS, and it stops short of the right edge.
 *
 * It used to be a full-width band in normal flow at the bottom of the window,
 * which put its translucent green directly behind the version stamped in the
 * bottom-right corner — two things sharing one strip, neither able to be read
 * cleanly. It is now a panel that ends before that corner and leaves it alone.
 */
export default function UpdateBar({ s }: { s: AppState }) {
  const u = s.update
  if (!s.canUpdate) return null
  if (u.state === "idle" || u.state === "checking" || u.state === "current" || u.state === "failed") {
    return null
  }

  const next = "next" in u ? u.next : ""

  return (
    /**
     * ⚠️ `right-[132px]`, not `right-4`. The corner belongs to the version
     * stamp; this ends before it rather than passing behind it.
     */
    <div className="upd ds-in pointer-events-none absolute bottom-2.5 left-3 right-[132px] z-30">
      <div className="upd-frame pointer-events-auto relative flex items-center gap-3 px-4 py-2.5">
        {/* The light. No plate under it — it reaches zero inside its own box,
            so there is no edge and nothing to draw a border around. A SIBLING
            of the contents, never a parent: it is screen-blended, and a
            transform or an opacity on an ancestor would isolate the blend and
            turn projected light back into a tinted rectangle. */}
        <span aria-hidden className="upd-cast pointer-events-none absolute inset-0" />

        {/* The source: one rhombus, the same mark the rest of the app uses.
            Rotation on the <g>, scale on the <rect> — an animated transform
            REPLACES the attribute rather than composing with it, which is how
            DsPanel's diamond once became a square. */}
        <svg aria-hidden width="11" height="11" viewBox="0 0 11 11" className="upd-mark relative z-[1] shrink-0 overflow-visible">
          <g transform="rotate(45 5.5 5.5)">
            <rect className="ds-mark" x="2" y="2" width="7" height="7" fill="#00d992" />
          </g>
        </svg>

        <p className="ds-head relative z-[1] font-chakrapetch text-[13px] font-bold uppercase leading-none tracking-[0.06em] text-jade">
          version {next}
        </p>
        <p className="ds-eyebrow relative z-[1] font-jetbrains text-[8.5px] uppercase leading-none tracking-[0.24em] text-flash/30">
          you have {u.version}
        </p>

        {/* The one drawn line: it leaves the words and dies into nothing, so it
            closes the panel without boxing it in. */}
        <span aria-hidden className="upd-rail ds-rule relative z-[1] ml-1 h-px flex-1" />

        {u.state === "downloading" ? (
          <div className="relative z-[1] flex shrink-0 items-center gap-2.5">
            <span className="font-jetbrains text-[9.5px] tabular-nums text-flash/45">{u.percent}%</span>
            {/* Square ends, not a pill: the app draws progress the way it draws
                everything else. The bar is the progress; the number is there to
                be exact, not to be watched. */}
            <span className="upd-track relative block h-[3px] w-[120px] overflow-hidden">
              <span
                className="upd-fill absolute inset-y-0 left-0 transition-[width] duration-300"
                style={{ width: `${u.percent}%` }}
              />
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() =>
              u.state === "ready" ? window.desktop.installUpdate() : void window.desktop.downloadUpdate()
            }
            className="ds-late act-btn relative z-[1] h-7 shrink-0 rounded-[3px] px-3 font-chakrapetch text-[11px] font-bold uppercase tracking-[0.12em]"
          >
            {u.state === "ready" ? "restart & update" : "download"}
          </button>
        )}
      </div>
    </div>
  )
}
