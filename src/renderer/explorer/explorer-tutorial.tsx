// A cinematic "what's that?" tutorial for the Explorer. Dim backdrop + faint
// grid, an Orbitron EXPLORER title, then 3 squared glass dialogs (same shell as
// the summoner main box — no outline, inset hairline) that reveal one-at-a-time.
// The mockups reuse the REAL Explorer vocabulary: typed nodes (MODULE_GLYPH +
// accent headers) wired with GlowEdge-style luminous bezier wires. A "DIVE INTO
// IT" button appears after the three.

import { useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { cdnBaseUrl, normalizeChampName } from "@/config"
import { MODULE_GLYPH } from "@/explorer/module-icons"

const EASE = [0.22, 1, 0.36, 1] as const

// the summoner page's main-box glass — squared, NO outline, inset hairline.
// (over the dimmed backdrop a real backdrop-blur is invisible AND stacking many
// of them hangs the GPU, so we use an opaque dark fill + the same inset hairline.)
const glassBox = cn(
  "relative overflow-hidden rounded-md",
  "bg-[#0a0f12]/95 saturate-150",
  "shadow-[0_14px_40px_rgba(var(--c-shadow),0.6),inset_0_0_0_0.5px_rgba(255,255,255,0.10),inset_0_1px_0_rgba(255,255,255,0.05)]"
)

const ACCENT: Record<string, string> = {
  subject: "#00d992", ally: "#36d3ff", enemy: "#ff6286", item: "#FFB615", output: "#00d992",
}

const container = { hidden: {}, show: { transition: { staggerChildren: 0.7, delayChildren: 0.4 } } }
const cardV = {
  hidden: { opacity: 0, y: 30, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.65, ease: EASE } },
}

// ── a faithful mini Explorer node (accent header + glyph + body) ─────────────
function NodeChip({ type, label, glow = false, className, style, children }: {
  type: keyof typeof ACCENT
  label: string
  glow?: boolean
  className?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}) {
  const accent = ACCENT[type]
  const Glyph = (MODULE_GLYPH as any)[type]
  return (
    <div
      className={cn("rounded-[6px] border bg-[rgba(8,14,16,0.97)]", className)}
      style={{
        borderColor: `${accent}44`,
        boxShadow: glow ? `0 0 0 1px ${accent}, 0 8px 26px rgba(0,0,0,.5), 0 0 20px ${accent}33` : "0 6px 18px rgba(0,0,0,.45)",
        ...style,
      }}
    >
      <div
        className="flex items-center gap-1.5 rounded-t-[6px] px-2 py-1"
        style={{ background: `linear-gradient(90deg, ${accent}26, transparent)`, borderBottom: `1px solid ${accent}33` }}
      >
        {Glyph && <Glyph size={11} style={{ color: accent }} />}
        <span className="font-chakrapetch text-[9px] font-bold tracking-[0.16em]" style={{ color: accent }}>{label}</span>
      </div>
      {children}
    </div>
  )
}

function StepCard({ index, title, desc, children }: { index: number; title: string; desc: string; children: React.ReactNode }) {
  return (
    <motion.div variants={cardV} className={cn(glassBox, "flex w-full flex-col p-5 sm:w-[330px]")}>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-[4px] bg-jade font-chakrapetch text-[14px] font-black text-black shadow-[0_0_16px_rgba(0,217,146,0.5)]">
          {index}
        </span>
        <span className="font-chakrapetch text-[13px] font-bold uppercase tracking-[0.16em] text-flash/95">{title}</span>
      </div>
      <div className="mb-4 grid h-[150px] place-items-center overflow-hidden rounded-[4px] bg-[#05090b]">
        {children}
      </div>
      <p className="font-chakrapetch text-[13px] leading-relaxed text-flash/65">{desc}</p>
    </motion.div>
  )
}

// ── mockups (faithful to the Explorer) ───────────────────────────────────────
function SubjectMock({ champion }: { champion: string }) {
  return (
    <NodeChip type="subject" label="SUBJECT" glow className="w-[150px] pb-2.5">
      <div className="flex items-center gap-2.5 px-2.5 pt-2.5">
        <img
          src={`${cdnBaseUrl()}/img/champion/${normalizeChampName(champion)}.png`}
          alt=""
          className="h-9 w-9 rounded-[4px] ring-1 ring-jade/40"
          onError={(e) => (e.currentTarget.style.opacity = "0.3")}
        />
        <div className="flex flex-col gap-1">
          <span className="rounded-[3px] border border-jade/30 bg-jade/10 px-1.5 py-[2px] text-center font-chakrapetch text-[9px] font-bold text-jade/90">{champion}</span>
          <span className="rounded-[3px] bg-filmdark/45 px-1.5 py-[2px] text-center font-chakrapetch text-[8px] font-bold uppercase tracking-wider text-flash/50">Middle</span>
        </div>
      </div>
    </NodeChip>
  )
}

// SUBJECT in the centre, ALLY + ITEM feeding it, OUTPUT downstream — wired with
// GlowEdge-style luminous bezier wires that flow toward the target.
function ConnectMock() {
  const Wire = ({ d, delay = 0 }: { d: string; delay?: number }) => (
    <g>
      <path d={d} fill="none" stroke="rgba(0,217,146,0.16)" strokeWidth={6} strokeLinecap="round" />
      <path d={d} fill="none" stroke="#00d992" strokeWidth={1.6} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 3px rgba(0,217,146,0.8))" }} />
      <path d={d} fill="none" stroke="#c8ffe2" strokeWidth={1} strokeDasharray="3 11" className="ait-edge" style={{ animationDelay: `${delay}s` }} />
    </g>
  )
  return (
    <div className="relative h-full w-full">
      <svg viewBox="0 0 300 150" className="absolute inset-0 h-full w-full">
        <Wire d="M86 38 C 130 38, 120 75, 150 75" />
        <Wire d="M86 112 C 130 112, 120 75, 150 75" delay={-0.5} />
        <Wire d="M214 75 C 236 75, 236 75, 252 75" delay={-0.9} />
      </svg>
      <div className="absolute left-[10px] top-[20px]"><NodeChip type="ally" label="ALLY" /></div>
      <div className="absolute left-[10px] bottom-[20px]"><NodeChip type="item" label="ITEM" /></div>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"><NodeChip type="subject" label="SUBJECT" glow /></div>
      <div className="absolute right-[8px] top-1/2 -translate-y-1/2"><NodeChip type="output" label="OUT" /></div>
    </div>
  )
}

function OutputMock() {
  const rows = [
    { w: "94%", v: "57.4%" },
    { w: "76%", v: "54.1%" },
    { w: "60%", v: "52.8%" },
  ]
  return (
    <NodeChip type="output" label="OUTPUT" glow className="w-[180px] pb-2">
      <div className="flex flex-col gap-1.5 px-2.5 pt-2.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="h-4 w-4 shrink-0 rounded-[3px] bg-flash/[0.14]" />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-flash/10">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-jade/50 to-jade"
                initial={{ width: 0 }}
                animate={{ width: r.w }}
                transition={{ duration: 0.9, ease: EASE, delay: 2.1 + i * 0.18 }}
              />
            </div>
            <span className="w-9 shrink-0 text-right font-chakrapetch text-[9px] font-semibold tabular-nums text-jade/85">{r.v}</span>
          </div>
        ))}
      </div>
    </NodeChip>
  )
}

export function ExplorerTutorial({ open, champion, onClose, onDive }: {
  open: boolean
  champion: string
  onClose: () => void
  onDive: () => void
}) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto px-4 py-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          onClick={onClose}
        >
          {/* cinematic backdrop: deep dim + a jade core glow */}
          <div className="absolute inset-0" style={{ background: "rgba(2,7,6,0.86)", backdropFilter: "blur(10px)" }} />
          <div className="pointer-events-none absolute left-1/2 top-[22%] h-[320px] w-[620px] -translate-x-1/2 rounded-full bg-jade/15 blur-[90px]" />

          <style>{`
            @keyframes aitEdge { to { stroke-dashoffset: -28; } }
            .ait-edge { animation: aitEdge 0.9s linear infinite; }
          `}</style>

          <motion.div
            className="relative w-full max-w-5xl"
            initial={{ scale: 0.97, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.97, y: 16 }}
            transition={{ duration: 0.45, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* close — borderless text affordance tucked into the corner */}
            <button
              type="button"
              onClick={onClose}
              className="group/close absolute right-0 top-0 z-10 inline-flex items-center gap-1.5 font-chakrapetch text-[10px] font-bold uppercase tracking-[0.22em] text-flash/40 transition-colors hover:text-jade cursor-clicker"
              aria-label="Close tutorial"
            >
              Close
              <X className="h-3.5 w-3.5 transition-transform group-hover/close:rotate-90" />
            </button>

            {/* cinematic title */}
            <motion.div className="text-center" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
              <div className="mb-2 font-jetbrains text-[11px] uppercase tracking-[0.5em] text-jade/70">How it works</div>
              <h2
                className="font-orbitron text-5xl font-black uppercase tracking-[0.18em] text-flash sm:text-6xl"
                style={{ textShadow: "0 0 32px rgba(0,217,146,0.45), 0 0 4px rgba(0,217,146,0.6)" }}
              >
                Explorer
              </h2>
              <div className="mx-auto mt-3 h-px w-40 bg-gradient-to-r from-transparent via-jade/60 to-transparent" />
            </motion.div>

            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="mt-10 flex flex-col items-stretch justify-center gap-5 sm:flex-row"
            >
              <StepCard
                index={1}
                title="Define your subject"
                desc="Drop a Subject node — the champion and role you're studying. It's the root every module branches off, so the whole query answers questions about it."
              >
                <SubjectMock champion={champion} />
              </StepCard>
              <StepCard
                index={2}
                title="Wire up the modules"
                desc="Snap modules onto the subject — allies, enemies, items, runes, filters. Each wire adds a condition (e.g. 'with this ally', 'building this item'), then feeds an Output."
              >
                <ConnectMock />
              </StepCard>
              <StepCard
                index={3}
                title="Read the output"
                desc="The engine compiles the graph live and ranks the results — win-rate-weighted, computed on real ranked games that match every condition you wired up."
              >
                <OutputMock />
              </StepCard>
            </motion.div>

            <motion.div variants={container} initial="hidden" animate="show" className="mt-9 flex justify-center">
              <motion.button
                variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { delay: 2.7, duration: 0.55, ease: EASE } } }}
                type="button"
                onClick={onDive}
                className="group inline-flex items-center gap-2.5 rounded-md border border-jade/45 bg-jade/20 px-7 py-3 font-chakrapetch text-[14px] font-bold uppercase tracking-[0.2em] text-jade shadow-[0_0_36px_rgba(0,217,146,0.32)] transition-colors hover:bg-jade/30 cursor-clicker"
              >
                Dive into it
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </motion.button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
