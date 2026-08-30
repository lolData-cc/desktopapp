// GlowEdge.tsx — luminous bezier wire: a fat jade glow stroke + a thin animated
// dashed core flowing toward the target.

import { getBezierPath, type EdgeProps } from "@xyflow/react";

export function GlowEdge({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });
  return (
    <>
      <path d={path} fill="none" stroke="rgba(0,217,146,0.18)" strokeWidth={7} strokeLinecap="round" />
      <path
        d={path}
        fill="none"
        stroke="#00d992"
        strokeWidth={2}
        strokeLinecap="round"
        style={{ filter: "drop-shadow(0 0 4px rgba(0,217,146,0.85))" }}
      />
      <path d={path} fill="none" stroke="#c8ffe2" strokeWidth={1} strokeDasharray="4 12" className="explorer-edge-flow" />
      {/* one-shot ignition flash — renders last (on top), plays once on connect */}
      <path d={path} fill="none" stroke="#eafff5" strokeWidth={2.5} pathLength={1} className="explorer-edge-ignite" />
    </>
  );
}

export const edgeTypes = { glow: GlowEdge };
