import { useEffect, useRef, useState } from "react"
import { isPremium, type AppState, type ChatMessage } from "../types"

/**
 * lolData AI.
 *
 * The token never comes near this component. It asks the shell, the shell holds
 * the credential and makes the call — so the chat cannot leak a session even if
 * something on this side goes wrong.
 *
 * The gate is drawn from what we know, and the API is still the authority: a
 * tier read at sign-in can be stale, so a refusal from the server is shown as
 * it comes rather than second-guessed. The four reasons it can refuse need four
 * different answers — sign in, upgrade, wait, retry — and lumping them into one
 * error would leave the player guessing which.
 */
export default function AiChat({ s }: { s: AppState }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<{ reason: string; message: string } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages.length, busy])

  const signedIn = !!s.account
  const premium = isPremium(s.account?.tier)

  const send = async () => {
    const text = draft.trim()
    if (!text || busy) return

    const next: ChatMessage[] = [...messages, { role: "user", content: text }]
    setMessages(next)
    setDraft("")
    setBusy(true)
    setRefusal(null)

    const result = await window.desktop.askAi(next).catch(() => null)
    setBusy(false)

    if (!result) return setRefusal({ reason: "failed", message: "Could not reach lolData." })
    if (result.ok) setMessages([...next, { role: "assistant", content: result.reply }])
    else setRefusal({ reason: result.reason, message: result.message })
  }

  if (!signedIn) {
    return (
      <Gate
        title="Sign in to use lolData AI"
        body="It answers from the same data the site runs on — your games, your champions, the current patch. Signing in happens in your browser."
        action={{ label: "sign in", onClick: () => window.desktop.signIn() }}
      />
    )
  }

  if (!premium) {
    return (
      <Gate
        title="lolData AI is part of premium"
        body="Your account is signed in but on the free plan. Premium includes AI credits every month."
        action={{ label: "see plans", onClick: () => window.desktop.openExternal("https://loldata.cc/pricing") }}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-baseline gap-3">
        <h2 className="font-chakrapetch text-[22px] font-bold leading-none">lolData AI</h2>
        <p className="font-jetbrains text-[9.5px] uppercase tracking-[0.18em] text-flash/30">
          {s.account?.tier ?? "premium"} · one credit per question
        </p>
      </div>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="space-y-2 pt-6">
            <p className="font-jetbrains text-[9px] uppercase tracking-[0.2em] text-flash/25">try asking</p>
            {[
              "What should I build into a fed Darius?",
              "Why am I losing on Lillia this patch?",
              "Is Conqueror still better than Dark Harvest for me?",
            ].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setDraft(q)}
                className="win-btn block w-full rounded-[3px] px-3 py-2 text-left font-chakrapetch text-[13px] text-flash/45"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <Bubble key={i} m={m} />
        ))}

        {busy && (
          <p className="beat font-jetbrains text-[9px] uppercase tracking-[0.2em] text-jade/60">thinking</p>
        )}
        {refusal && (
          <p className="font-jetbrains text-[10px] leading-relaxed text-citrine/80">
            {refusal.message}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="mt-3 flex shrink-0 items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); void send() }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about your games, a matchup, a build…"
          className="h-9 min-w-0 flex-1 rounded-[3px] bg-flash/[0.04] px-3 font-chakrapetch text-[13px] text-flash placeholder:text-flash/25 focus:outline-none"
          style={{ boxShadow: "inset 2px 0 0 0 rgba(0,217,146,0.4)" }}
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="act-btn h-9 w-[92px] shrink-0 rounded-[3px] font-chakrapetch text-[12px] font-bold uppercase tracking-[0.12em]"
        >
          ask
        </button>
      </form>
    </div>
  )
}

function Bubble({ m }: { m: ChatMessage }) {
  const mine = m.role === "user"
  return (
    <div
      className="ds-row rounded-[3px] px-3 py-2"
      style={{
        background: mine ? "rgba(0,217,146,0.06)" : "rgba(215,216,217,0.03)",
        boxShadow: `inset 2px 0 0 0 ${mine ? "rgba(0,217,146,0.55)" : "rgba(215,216,217,0.18)"}`,
      }}
    >
      <p className="font-jetbrains text-[8.5px] uppercase tracking-[0.2em] text-flash/25">
        {mine ? "you" : "loldata ai"}
      </p>
      <p className="mt-1 whitespace-pre-wrap font-chakrapetch text-[13px] leading-relaxed text-flash/85">
        {m.content}
      </p>
    </div>
  )
}

function Gate({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action: { label: string; onClick: () => void }
}) {
  return (
    <div className="grid h-full place-items-center px-8">
      <div className="hud relative max-w-[420px] px-8 py-9 text-center">
        <p className="font-jetbrains text-[9px] uppercase tracking-[0.3em] text-jade/50">loldata ai</p>
        <h3 className="mt-3 font-chakrapetch text-[21px] font-bold leading-tight">{title}</h3>
        <p className="mx-auto mt-3 max-w-[38ch] font-chakrapetch text-[13px] leading-relaxed text-flash/40">
          {body}
        </p>
        <button
          type="button"
          onClick={action.onClick}
          className="act-btn mx-auto mt-6 block h-9 w-[132px] rounded-[3px] font-chakrapetch text-[12px] font-bold uppercase tracking-[0.12em]"
        >
          {action.label}
        </button>
      </div>
    </div>
  )
}
