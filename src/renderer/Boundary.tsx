import { Component, type ErrorInfo, type ReactNode } from "react"

/**
 * A section that throws should not take the window with it.
 *
 * ⚠️ Added after a hook-order mistake in the recap unmounted the entire tree
 * and left a black, frozen window — with no message, nothing in the main
 * process log, and no way to tell a crash from a hang. That is the worst
 * failure an app can have: it is indistinguishable from being broken beyond
 * repair, so the player force-quits instead of clicking away.
 *
 * There is a second reason. This app renders a WebGL scene, and a driver fault
 * or a malformed model can throw from deep inside a loader at any time. A
 * canvas without a boundary around it is a canvas that can blank the app.
 *
 * It resets on `resetKey`, so moving to another section clears a fault rather
 * than leaving it stuck — a boundary that latches is a boundary that turns one
 * bad render into a dead app until restart.
 *
 * ⚠️ One fault it cannot clear by itself: a section that FAILS TO LOAD. The
 * sections are fetched on first use, by a filename carrying a hash of their
 * contents, and an index page that has outlived its chunks will ask for files
 * that are no longer there — every time, in every section, until the page is
 * read again. Switching away and back does nothing, which is exactly the
 * advice the message above gives. So that case is named and given the one
 * thing that fixes it.
 */
type Props = { children: ReactNode; resetKey?: string | number }
type State = { error: Error | null }

export default class Boundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // To the renderer console, which is where a developer will look, and with
    // the component stack — the message alone rarely says which screen it was.
    console.error("[boundary]", error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    // A chunk that would not load. The message differs by engine, so this
    // matches on what they all say rather than on one wording.
    const stale = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(
      this.state.error.message
    )

    if (stale) {
      return (
        <div className="grid h-full place-items-center px-8">
          <div className="max-w-[48ch] text-center">
            <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.28em] text-citrine/60">
              this section could not be loaded
            </p>
            <p className="mt-2 font-chakrapetch text-[13px] leading-relaxed text-flash/40">
              The app was updated underneath itself, so the window is asking for files
              that have been replaced. Reloading reads the new ones — nothing is lost.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="act-btn mt-4 h-9 rounded-[3px] px-6 font-chakrapetch text-[12px] font-bold uppercase tracking-[0.16em]"
            >
              reload
            </button>
            <p className="mt-3 break-words font-jetbrains text-[9px] leading-relaxed text-flash/20">
              {this.state.error.message}
            </p>
          </div>
        </div>
      )
    }

    return (
      <div className="grid h-full place-items-center px-8">
        <div className="max-w-[46ch] text-center">
          <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.28em] text-citrine/60">
            this screen stopped
          </p>
          <p className="mt-2 font-chakrapetch text-[13px] leading-relaxed text-flash/40">
            Something in here threw. The rest of the app is fine — pick another section
            and come back.
          </p>
          <p className="mt-3 break-words font-jetbrains text-[9px] leading-relaxed text-flash/20">
            {this.state.error.message}
          </p>
        </div>
      </div>
    )
  }
}
