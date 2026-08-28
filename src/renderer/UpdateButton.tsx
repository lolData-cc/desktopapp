import type { AppState } from "./types"

/**
 * The one place the app asks for something, as a control in the title bar.
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
 * ⚠️ It MUST be rendered inside the title bar's `no-drag` group.
 *
 * The header is `-webkit-app-region: drag`. A button placed anywhere else in it
 * is not clickable at all — the drag region takes the press and moves the window
 * instead of firing the click — and it fails silently: the button looks entirely
 * normal, hovers, and simply never does anything.
 *
 * This was a floating panel at the bottom of the window before. It moved because
 * an update is something you DO, so it belongs beside the account with the rest
 * of the things you can act on, rather than sitting on top of the content.
 */
export default function UpdateButton({
  s,
  /**
   * The account button's width, measured by TitleBar, so the two controls are
   * the same size and read as a pair.
   *
   * ⚠️ Applied as a MINIMUM, not as a fixed width, and the difference is
   * load-bearing. The account is only as wide as the summoner name, and a Riot
   * ID can be three characters: at that size the account measures ~92px, which
   * leaves 51px for a word that needs 55, and "RESTART" comes out cut in half.
   * As a minimum the two are identical at every realistic name length (~5
   * characters and up) and the button quietly outgrows it rather than
   * mutilating the label.
   *
   * This is also why the version number is NOT on the face: spelled out, the
   * three states are 126, 57 and 132px wide, and the widest would force that
   * overflow constantly. The version lives in the tooltip, where it gets to be
   * a whole sentence instead of a fragment.
   */
  width,
}: {
  s: AppState | null
  width?: number | null
}) {
  const u = s?.update
  if (!s?.canUpdate || !u) return null
  if (u.state === "idle" || u.state === "checking" || u.state === "current" || u.state === "failed") {
    return null
  }

  const next = "next" in u ? u.next : ""
  const sized = width ? { minWidth: width } : undefined

  /**
   * The source of the light: the same rhombus the rest of the app uses.
   *
   * ⚠️ The rotation is on the <g> and any animated scale is on the <rect>. An
   * animated transform REPLACES the attribute rather than composing with it,
   * which is how DsPanel's diamond once turned back into a square.
   */
  const mark = (
    <svg
      aria-hidden
      width="9"
      height="9"
      viewBox="0 0 11 11"
      className="upd-mark relative z-[1] shrink-0 overflow-visible"
    >
      <g transform="rotate(45 5.5 5.5)">
        <rect className="ds-mark" x="2" y="2" width="7" height="7" fill="#00d992" />
      </g>
    </svg>
  )

  /**
   * Downloading is a status, not a control. It is deliberately not a <button>:
   * there is nothing to press while it runs, and a disabled button would still
   * read as an affordance that has been taken away.
   */
  if (u.state === "downloading") {
    return (
      <div
        style={sized}
        className="upd-btn upd-static ds-in relative flex h-8 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-[3px] px-3"
        title={`Downloading version ${next}`}
        aria-label={`Downloading version ${next}, ${u.percent} percent complete`}
      >
        {mark}
        <span className="relative z-[1] font-jetbrains text-[10px] leading-none tabular-nums text-jade/85">
          {u.percent}%
        </span>
        {/* Along the bottom edge of the button itself: at this size a separate
            track would be more chrome than information. */}
        <span
          aria-hidden
          className="upd-fill absolute bottom-0 left-0 z-[2] h-px transition-[width] duration-300"
          style={{ width: `${u.percent}%` }}
        />
      </div>
    )
  }

  const ready = u.state === "ready"

  return (
    <button
      type="button"
      style={sized}
      onClick={() =>
        ready ? window.desktop.installUpdate() : void window.desktop.downloadUpdate()
      }
      title={
        ready
          ? `Version ${next} is downloaded — restart to install it`
          : `Version ${next} is available. You have ${u.version}.`
      }
      className="upd-btn act-btn ds-in relative flex h-8 shrink-0 items-center justify-center gap-2 rounded-[3px] px-3 font-chakrapetch text-[11px] font-bold uppercase leading-none tracking-[0.1em]"
    >
      {mark}
      {/* truncate rather than clip: if the account is ever narrower than the
          word, a cut-off label is still readable and the button keeps its
          shape, where overflow would slice the glyphs off square. */}
      <span className="relative z-[1] min-w-0 truncate">{ready ? "restart" : "update"}</span>
    </button>
  )
}
