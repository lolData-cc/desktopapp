import type { AppSettings, AppState } from "../types"

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
 */
export default function Preferences({ s }: { s: AppState }) {
  const set = (patch: Partial<AppSettings>) => void window.desktop.setSetting(patch)
  const v = s.settings

  const update = s.update
  const version = update?.version ?? "—"
  const checking = update?.state === "checking"
  const ready = update?.state === "ready"
  const available = update?.state === "available"

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-baseline gap-3">
        <h2 className="font-chakrapetch text-[22px] font-bold leading-none">Settings</h2>
        <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.18em] text-flash/30">
          version {version}
        </p>
      </div>

      <div className="mt-5 min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
        <Group title="in game">
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
        </Group>

        <Group title="advice">
          <Toggle
            on={v.smartBuild}
            onChange={(on) => set({ smartBuild: on })}
            label="Smart build"
            note="If you buy something that is not in a saved build, stop following it and ask what players who reached your actual inventory built next. Applies to every champion — it describes how you want to be advised, which does not change from one to another. Costs a query each time your items change."
          />
        </Group>

        <Group title="application">
          <Toggle
            on={v.launchAtLogin}
            onChange={(on) => set({ launchAtLogin: on })}
            label="Start with Windows"
            note="Opens minimised, so it is attached to the client by the time you are in champion select."
          />

          <Row
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
          </Row>

          <Row
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
          </Row>

          <Row label="Restart" note="Reopens the app, boot animation and all.">
            <button
              type="button"
              onClick={() => window.desktop.relaunch()}
              className="win-btn h-6 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/40"
            >
              restart
            </button>
          </Row>
        </Group>

        <Group title="account">
          <Row
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
          </Row>
        </Group>
      </div>
    </div>
  )
}

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section>
    <p className="mb-2 font-jetbrains text-[9.5px] uppercase tracking-[0.2em] text-flash/30">{title}</p>
    <div className="space-y-1.5">{children}</div>
  </section>
)

function Row({
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
