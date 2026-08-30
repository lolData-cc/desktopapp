// module-icons.tsx — bespoke glyphs for the Explorer modules.
//
// A cohesive, hand-drawn line-art set in the loldata cyber language (hexagon /
// diamond motifs, thin strokes, round joins) instead of generic stock icons.
// Each draws with `currentColor`, so the module's accent flows straight through.

import type { CSSProperties, ComponentType, ReactNode } from "react";

export type ModuleIconProps = { size?: number; className?: string; style?: CSSProperties };
export type ModuleIcon = ComponentType<ModuleIconProps>;

function Svg({ size = 16, className, style, children }: ModuleIconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {children}
    </svg>
  );
}

// Subject — the focal champion: a hex lock with a solid core
const SubjectGlyph: ModuleIcon = (p) => (
  <Svg {...p}>
    <polygon points="12,2.6 20.3,7.3 20.3,16.7 12,21.4 3.7,16.7 3.7,7.3" />
    <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
  </Svg>
);

// Ally — two linked nodes (alongside)
const AllyGlyph: ModuleIcon = (p) => (
  <Svg {...p}>
    <circle cx="8" cy="12" r="3.1" />
    <circle cx="16" cy="12" r="3.1" />
    <line x1="11.1" y1="12" x2="12.9" y2="12" />
  </Svg>
);

// Enemy — two opposing brackets (clash / vs)
const EnemyGlyph: ModuleIcon = (p) => (
  <Svg {...p}>
    <polyline points="6,5 11,12 6,19" />
    <polyline points="18,5 13,12 18,19" />
  </Svg>
);

// Item — a faceted gem
const ItemGlyph: ModuleIcon = (p) => (
  <Svg {...p}>
    <polygon points="12,2.6 20,9 12,21.4 4,9" />
    <line x1="4" y1="9" x2="20" y2="9" />
    <line x1="12" y1="2.6" x2="9" y2="9" />
    <line x1="12" y1="2.6" x2="15" y2="9" />
  </Svg>
);

// Rune — a keystone: hexagon within a hexagon
const RuneGlyph: ModuleIcon = (p) => (
  <Svg {...p}>
    <polygon points="12,2.6 20.3,7.3 20.3,16.7 12,21.4 3.7,16.7 3.7,7.3" />
    <polygon points="12,7.6 16.1,9.9 16.1,14.1 12,16.4 7.9,14.1 7.9,9.9" />
  </Svg>
);

// Filter — narrowing rails
const FilterGlyph: ModuleIcon = (p) => (
  <Svg {...p}>
    <line x1="3.5" y1="7" x2="20.5" y2="7" />
    <line x1="6.5" y1="12" x2="17.5" y2="12" />
    <line x1="9.5" y1="17" x2="14.5" y2="17" />
  </Svg>
);

// Output — ascending result bars
const OutputGlyph: ModuleIcon = (p) => (
  <Svg {...p}>
    <line x1="6" y1="20" x2="6" y2="13.5" strokeWidth={2.2} />
    <line x1="12" y1="20" x2="12" y2="7.5" strokeWidth={2.2} />
    <line x1="18" y1="20" x2="18" y2="11" strokeWidth={2.2} />
  </Svg>
);

// Exclude — a hex "no entry": the module motif struck through
const ExcludeGlyph: ModuleIcon = (p) => (
  <Svg {...p}>
    <polygon points="12,2.6 20.3,7.3 20.3,16.7 12,21.4 3.7,16.7 3.7,7.3" />
    <line x1="6.9" y1="6.9" x2="17.1" y2="17.1" />
  </Svg>
);

export const MODULE_GLYPH: Record<string, ModuleIcon> = {
  subject: SubjectGlyph,
  ally: AllyGlyph,
  enemy: EnemyGlyph,
  item: ItemGlyph,
  rune: RuneGlyph,
  filter: FilterGlyph,
  output: OutputGlyph,
  exclude: ExcludeGlyph,
};
