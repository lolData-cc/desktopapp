/**
 * MVP or ACE, pinned to the corner of a champion portrait.
 *
 * ⚠️ Ours, and it says so.
 *
 * The client shows this badge on its end screen, does not publish the score
 * behind it, and does not expose the result in match history. So it is our own
 * reckoning — best on the winning side, best on the losing side — and the
 * tooltip says whose opinion it is rather than borrowing the authority of the
 * game's own badge.
 *
 * ⚠️ Positioned ABSOLUTELY: it expects a `relative` portrait around it, and it
 * belongs to that portrait rather than to the row. A badge floating at the end
 * of a line of numbers is a fact about the row; one pinned to the face is a
 * fact about the player, which is what it is.
 */
export default function Honour({ kind, small }: { kind: "mvp" | "ace"; small?: boolean }) {
  return (
    <span
      title={`${kind === "mvp" ? "Best on the winning team" : "Best on the losing team"} — our reckoning, not the client's badge`}
      className="absolute -left-[4px] -top-[4px] grid place-items-center font-jetbrains font-bold uppercase leading-none tracking-[0.06em]"
      style={{
        height: small ? 14 : 16,
        fontSize: small ? 7 : 8,
        padding: `0 ${small ? 3 : 4}px`,
        paddingBottom: 3,
        background: kind === "mvp" ? "#FFB615" : "rgba(215,216,217,0.85)",
        color: "#040A0C",
        clipPath: "polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%)",
      }}
    >
      {kind}
    </span>
  )
}
