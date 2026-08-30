// category-glyphs.tsx — leading glyphs for the Explorer team-comp category picker.
//
// The 6 roster classes use Riot's gold class crests (CDN images). The 4 derived
// categories (AD/AP/Melee/Ranged) have no crest, so they're drawn here as FILLED
// glyphs in the SAME crest gold — a sword, a sparkle, crossed swords and a bow —
// so the picker reads as one coherent gold icon family instead of clashing the
// ornate crests with flat line icons.
import { useId, type ReactNode } from "react";
import { categoryIcon, categoryHasIcon } from "./catalog";

// Riot class-crest gold (light top → dark bottom), so the glyphs sit as peers of
// the crests. Unique gradient id per instance (useId) so multiple glyphs coexist.
function GoldSvg({ size = 18, children }: { size?: number; children: (fill: string) => ReactNode }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="12" y1="1" x2="12" y2="23" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F4E9CD" />
          <stop offset="0.5" stopColor="#C8AA6E" />
          <stop offset="1" stopColor="#7A5C2E" />
        </linearGradient>
      </defs>
      {children(`url(#${id})`)}
    </svg>
  );
}

const SwordGlyph = () => (
  <GoldSvg>{(f) => <path fill={f} d="M12 1.5 L14 6.2 L14 13.4 L10 13.4 L10 6.2 Z M7.5 13.2 H16.5 V15.6 H7.5 Z M10.8 15.6 H13.2 V19.8 H10.8 Z M10 19.5 H14 V21.4 H10 Z" />}</GoldSvg>
);
const SparkleGlyph = () => (
  <GoldSvg>{(f) => <path fill={f} d="M12 1 C12.7 7.8 16.2 11.3 23 12 C16.2 12.7 12.7 16.2 12 23 C11.3 16.2 7.8 12.7 1 12 C7.8 11.3 11.3 7.8 12 1 Z" />}</GoldSvg>
);
const SWORD_BLADE = "M10.9 2.5 H13.1 V12.5 H10.9 Z M9.2 11.8 H14.8 V13.6 H9.2 Z M10.9 13.6 H13.1 V17 H10.9 Z";
const CrossedSwordsGlyph = () => (
  <GoldSvg>{(f) => (
    <g fill={f}>
      <g transform="rotate(40 12 12)"><path d={SWORD_BLADE} /></g>
      <g transform="rotate(-40 12 12)"><path d={SWORD_BLADE} /></g>
    </g>
  )}</GoldSvg>
);
const BowGlyph = () => (
  <GoldSvg>{(f) => (
    <g fill={f}>
      <path d="M6.5 2 C 13 7, 13 17, 6.5 22 C 9.8 16, 9.8 8, 6.5 2 Z" />
      <path d="M4.5 11.1 H17 V12.9 H4.5 Z" />
      <path d="M15.2 8.5 L20.7 12 L15.2 15.5 Z" />
    </g>
  )}</GoldSvg>
);

// class crest (CDN image) for the 6 classes; gold glyph for the 4 derived ones.
export function categoryGlyph(value: string): ReactNode {
  if (!value) return null;
  if (categoryHasIcon(value))
    return (
      <img
        src={categoryIcon(value)}
        className="w-[18px] h-[18px] object-contain"
        alt=""
        draggable={false}
        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
      />
    );
  switch (value) {
    case "AD":
      return <SwordGlyph />;
    case "AP":
      return <SparkleGlyph />;
    case "Melee":
      return <CrossedSwordsGlyph />;
    case "Ranged":
      return <BowGlyph />;
    default:
      return null;
  }
}
