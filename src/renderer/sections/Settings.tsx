import { ABILITIES, type HudNudge } from "../../data/hud"
import type { AppState } from "../types"

export default function Settings({ s }: { s: AppState }) {
  // A tenth of a box width per press, so a correction means the same thing on
  // any screen at any HUD scale — which is the point of nudging in box units.
  const step = 0.1
  const nudge = (patch: Partial<HudNudge>) => window.desktop.calibrate(patch)
  const { scale, nudge: n, source } = s.hud

  const Btn = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className="win-btn grid h-6 w-6 place-items-center rounded-[3px] font-jetbrains text-[11px] text-flash/45"
    >
      {label}
    </button>
  )

  return (
    <div className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-jade/[0.10] px-3.5 py-2">
      {/* The overlay behaves as a notification; these two exist to inspect it
          without waiting for a dragon. */}
      <button
        type="button"
        onClick={() => window.desktop.pinOverlay(!s.pinned)}
        className={`win-btn h-6 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] ${
          s.pinned ? "bg-jade/15 text-jade" : "text-flash/30"
        }`}
      >
        always on {s.pinned ? "· on" : "· off"}
      </button>
      <button
        type="button"
        onClick={() => window.desktop.demoOverlay()}
        className="win-btn h-6 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/30"
      >
        show 5s
      </button>

      {/* The notice least likely to turn up by accident: it needs a smart
          profile AND a game you departed from. */}
      <button
        type="button"
        onClick={() => window.desktop.demoRecal()}
        title="Preview the smart-build recalibration notice"
        className="win-btn h-6 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/30"
      >
        recalibration
      </button>

      {/* Steps through the bar's four readings — ahead, behind, level, and a
          short scoreboard — because one fixed pair of numbers would only ever
          show that it draws. */}
      <button
        type="button"
        onClick={() => window.desktop.demoGold()}
        title="Step through the gold bar's readings with made-up numbers"
        className={`win-btn h-6 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] ${
          s.gold ? "bg-jade/15 text-jade" : "text-flash/30"
        }`}
      >
        gold {s.gold ? `· ${s.gold.ours > s.gold.theirs ? "ahead" : s.gold.ours < s.gold.theirs ? "behind" : "even"}` : "· off"}
      </button>

      {/* Restarts the process — nothing is replaced and nothing is installed.
          It exists because the boot animation is otherwise only watchable by
          closing the app and starting it from a terminal. */}
      <button
        type="button"
        onClick={() => window.desktop.relaunch()}
        title="Quit and start again — the boot animation plays on the way back"
        className="win-btn h-6 rounded-[3px] px-2.5 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/30"
      >
        restart
      </button>

      <span className="ml-1 font-jetbrains text-[9px] uppercase tracking-[0.2em] text-flash/25">
        outline
      </span>

      <div className="flex items-center gap-1">
        {ABILITIES.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => window.desktop.hint(s.levelHint === a ? null : a)}
            className={`win-btn h-6 w-7 rounded-[3px] font-chakrapetch text-[11px] font-bold ${
              s.levelHint === a ? "bg-jade/15 text-jade" : "text-flash/30"
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <Btn label="←" onClick={() => nudge({ x: n.x - step })} />
        <Btn label="→" onClick={() => nudge({ x: n.x + step })} />
        <Btn label="↑" onClick={() => nudge({ y: n.y + step })} />
        <Btn label="↓" onClick={() => nudge({ y: n.y - step })} />
        <span className="ml-2 font-jetbrains text-[9px] uppercase tracking-[0.16em] text-flash/25">size</span>
        <Btn label="−" onClick={() => nudge({ size: n.size - 0.02 })} />
        <Btn label="+" onClick={() => nudge({ size: n.size + 0.02 })} />
        <Btn label="⟲" onClick={() => nudge({ x: 0, y: 0, size: 0 })} />
      </div>

      {/* The read-out is the honest part: it says whether the placement was
          DERIVED from the player's own settings or fell back to a guess. */}
      <span className="ml-auto font-jetbrains text-[9px] tabular-nums text-flash/20">
        {source ? `hud scale ${Math.round(scale * 100)}` : "hud scale unknown"}
        {(n.x || n.y || n.size) ? ` · ${n.x.toFixed(1)} ${n.y.toFixed(1)} ${n.size.toFixed(2)}` : ""}
      </span>
    </div>
  )
}
