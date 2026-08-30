export const UI_PREFS_KEYS = {
  disableBorderBeams: "lolData:disableBorderBeams",
  disableTechBackground: "lolData:disableTechBackground",
  disableMatchTransition: "lolData:disableMatchTransition",
  disableMatchGrouping: "lolData:disableMatchGrouping",
  enableColoredMatchBg: "lolData:enableColoredMatchBg",
  enableMatchCentering: "lolData:enableMatchCentering",
  hideRemakeMatches: "lolData:hideRemakeMatches",
  showRanked5: "lolData:showRanked5",
  hideStatsBar: "lolData:hideStatsBar",
  statsBarVisibleStats: "lolData:statsBarVisibleStats",
  useContextMenuActions: "lolData:useContextMenuActions",
  clickToExpandMatch: "lolData:clickToExpandMatch",
  quickSlots: "lolData:quickSlots",
  blueWinTint: "lolData:blueWinTint",
  legacyRankIcons: "lolData:legacyRankIcons",
  ambientLight: "lolData:ambientLight",
  theme: "lolData:theme",
} as const;

export type ThemeMode = "dark" | "light";

function safeWindow() {
  return typeof window !== "undefined" ? window : null;
}

export function getDisableBorderBeams(): boolean {
  const w = safeWindow();
  if (!w) return false; // default: beams attivi
  return w.localStorage.getItem(UI_PREFS_KEYS.disableBorderBeams) === "1";
}

export function setDisableBorderBeams(value: boolean) {
  const w = safeWindow();
  if (!w) return;

  w.localStorage.setItem(UI_PREFS_KEYS.disableBorderBeams, value ? "1" : "0");
  w.dispatchEvent(new Event("lolData:uiPrefsChanged"));
}

export function getDisableTechBackground(): boolean {
  const w = safeWindow();
  if (!w) return true; // default: tech bg disabled for new users
  const val = w.localStorage.getItem(UI_PREFS_KEYS.disableTechBackground);
  if (val === null) return true; // first visit: disabled by default
  return val === "1";
}

export function setDisableTechBackground(value: boolean) {
  const w = safeWindow();
  if (!w) return;

  w.localStorage.setItem(UI_PREFS_KEYS.disableTechBackground, value ? "1" : "0");
  w.dispatchEvent(new Event("lolData:uiPrefsChanged"));
}

export function getDisableMatchTransition(): boolean {
  const w = safeWindow();
  if (!w) return false;
  return w.localStorage.getItem(UI_PREFS_KEYS.disableMatchTransition) === "1";
}

export function setDisableMatchTransition(value: boolean) {
  const w = safeWindow();
  if (!w) return;

  w.localStorage.setItem(UI_PREFS_KEYS.disableMatchTransition, value ? "1" : "0");
  w.dispatchEvent(new Event("lolData:uiPrefsChanged"));
}

export function getDisableMatchGrouping(): boolean {
  const w = safeWindow();
  if (!w) return true; // default: grouping disabled
  const val = w.localStorage.getItem(UI_PREFS_KEYS.disableMatchGrouping);
  if (val === null) return true; // first visit: day-grouping off by default
  return val === "1";
}

export function setDisableMatchGrouping(value: boolean) {
  const w = safeWindow();
  if (!w) return;

  w.localStorage.setItem(UI_PREFS_KEYS.disableMatchGrouping, value ? "1" : "0");
  w.dispatchEvent(new Event("lolData:uiPrefsChanged"));
}

export function getEnableColoredMatchBg(): boolean {
  const w = safeWindow();
  if (!w) return true; // default: on
  const val = w.localStorage.getItem(UI_PREFS_KEYS.enableColoredMatchBg);
  if (val === null) return true; // first visit: enabled by default
  return val === "1";
}

export function setEnableColoredMatchBg(value: boolean) {
  const w = safeWindow();
  if (!w) return;

  w.localStorage.setItem(UI_PREFS_KEYS.enableColoredMatchBg, value ? "1" : "0");
  w.dispatchEvent(new Event("lolData:uiPrefsChanged"));
}

export function getEnableMatchCentering(): boolean {
  const w = safeWindow();
  if (!w) return false; // default: off
  return w.localStorage.getItem(UI_PREFS_KEYS.enableMatchCentering) === "1";
}

export function setEnableMatchCentering(value: boolean) {
  const w = safeWindow();
  if (!w) return;

  w.localStorage.setItem(UI_PREFS_KEYS.enableMatchCentering, value ? "1" : "0");
  w.dispatchEvent(new Event("lolData:uiPrefsChanged"));
}

/**
 * Ranked 5s on a profile. Default OFF.
 *
 * ⚠️ Opt-IN, so the absent key must read as false. It is a weekend-only queue
 * on a separate ladder, and showing it unasked put a permanently "Unranked"
 * third card beside the two ranks people actually came to read.
 */
export function getShowRanked5(): boolean {
  const w = safeWindow();
  if (!w) return false; // default: hidden
  return w.localStorage.getItem(UI_PREFS_KEYS.showRanked5) === "1";
}

export function setShowRanked5(value: boolean) {
  const w = safeWindow();
  if (!w) return;

  w.localStorage.setItem(UI_PREFS_KEYS.showRanked5, value ? "1" : "0");
  w.dispatchEvent(new Event("lolData:uiPrefsChanged"));
}

export function getHideRemakeMatches(): boolean {
  const w = safeWindow();
  if (!w) return false; // default: show remakes
  return w.localStorage.getItem(UI_PREFS_KEYS.hideRemakeMatches) === "1";
}

export function setHideRemakeMatches(value: boolean) {
  const w = safeWindow();
  if (!w) return;

  w.localStorage.setItem(UI_PREFS_KEYS.hideRemakeMatches, value ? "1" : "0");
  w.dispatchEvent(new Event("lolData:uiPrefsChanged"));
}

// ── Stats Bar ──

export const STATS_BAR_STAT_KEYS = ["kda", "kp", "csm", "dmg", "vis"] as const;
export type StatsBarStatKey = (typeof STATS_BAR_STAT_KEYS)[number];

const DEFAULT_VISIBLE_STATS: Record<StatsBarStatKey, boolean> = {
  kda: true, kp: true, csm: true, dmg: true, vis: true,
};

export function getHideStatsBar(): boolean {
  const w = safeWindow();
  if (!w) return true; // default: hidden
  const val = w.localStorage.getItem(UI_PREFS_KEYS.hideStatsBar);
  if (val === null) return true; // first visit: stats summary bar hidden by default
  return val === "1";
}

export function setHideStatsBar(value: boolean) {
  const w = safeWindow();
  if (!w) return;
  w.localStorage.setItem(UI_PREFS_KEYS.hideStatsBar, value ? "1" : "0");
  w.dispatchEvent(new Event("lolData:uiPrefsChanged"));
}

export function getStatsBarVisibleStats(): Record<StatsBarStatKey, boolean> {
  const w = safeWindow();
  if (!w) return { ...DEFAULT_VISIBLE_STATS };
  const raw = w.localStorage.getItem(UI_PREFS_KEYS.statsBarVisibleStats);
  if (!raw) return { ...DEFAULT_VISIBLE_STATS };
  try {
    return { ...DEFAULT_VISIBLE_STATS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_VISIBLE_STATS };
  }
}

export function setStatsBarVisibleStats(stats: Record<StatsBarStatKey, boolean>) {
  const w = safeWindow();
  if (!w) return;
  w.localStorage.setItem(UI_PREFS_KEYS.statsBarVisibleStats, JSON.stringify(stats));
  w.dispatchEvent(new Event("lolData:uiPrefsChanged"));
}

// ── Context Menu Actions (right-click on match) ──

export function getUseContextMenuActions(): boolean {
  const w = safeWindow();
  if (!w) return false; // default: off (hover collapse mode)
  return w.localStorage.getItem(UI_PREFS_KEYS.useContextMenuActions) === "1";
}

export function setUseContextMenuActions(value: boolean) {
  const w = safeWindow();
  if (!w) return;
  w.localStorage.setItem(UI_PREFS_KEYS.useContextMenuActions, value ? "1" : "0");
  w.dispatchEvent(new Event("lolData:uiPrefsChanged"));
}

// ── Click to Expand Match ──

export function getClickToExpandMatch(): boolean {
  const w = safeWindow();
  if (!w) return true; // default: click mode
  const val = w.localStorage.getItem(UI_PREFS_KEYS.clickToExpandMatch);
  if (val === null) return true; // first visit: click mode by default
  return val === "1";
}

export function setClickToExpandMatch(value: boolean) {
  const w = safeWindow();
  if (!w) return;
  w.localStorage.setItem(UI_PREFS_KEYS.clickToExpandMatch, value ? "1" : "0");
  w.dispatchEvent(new Event("lolData:uiPrefsChanged"));
}

// ── Quick Slots (floating shortcut rail) ──

export function getQuickSlotsEnabled(): boolean {
  const w = safeWindow();
  if (!w) return false; // default: off — opt-in from Preferences → Customizations
  return w.localStorage.getItem(UI_PREFS_KEYS.quickSlots) === "1";
}

export function setQuickSlotsEnabled(value: boolean) {
  const w = safeWindow();
  if (!w) return;
  w.localStorage.setItem(UI_PREFS_KEYS.quickSlots, value ? "1" : "0");
  w.dispatchEvent(new Event("lolData:uiPrefsChanged"));
}

export function getBlueWinTint(): boolean {
  const w = safeWindow();
  if (!w) return false; // default: green wins
  return w.localStorage.getItem(UI_PREFS_KEYS.blueWinTint) === "1";
}

export function setBlueWinTint(value: boolean) {
  const w = safeWindow();
  if (!w) return;
  w.localStorage.setItem(UI_PREFS_KEYS.blueWinTint, value ? "1" : "0");
  w.dispatchEvent(new Event("lolData:uiPrefsChanged"));
}

export function getLegacyRankIcons(): boolean {
  const w = safeWindow();
  if (!w) return false;
  return w.localStorage.getItem(UI_PREFS_KEYS.legacyRankIcons) === "1";
}

export function setLegacyRankIcons(value: boolean) {
  const w = safeWindow();
  if (!w) return;
  w.localStorage.setItem(UI_PREFS_KEYS.legacyRankIcons, value ? "1" : "0");
  w.dispatchEvent(new Event("lolData:uiPrefsChanged"));
}

/** Ambient light intensity: 0 (off) to 100 (max). Default 0. */
export function getAmbientLight(): number {
  const w = safeWindow();
  if (!w) return 0;
  const val = w.localStorage.getItem(UI_PREFS_KEYS.ambientLight);
  return val ? Number(val) : 0;
}

export function setAmbientLight(value: number) {
  const w = safeWindow();
  if (!w) return;
  w.localStorage.setItem(UI_PREFS_KEYS.ambientLight, String(Math.max(0, Math.min(100, Math.round(value)))));
  w.dispatchEvent(new Event("lolData:uiPrefsChanged"));
}

/** Feature gate — the light theme is not shipped yet (COMING SOON). While this
    is false the site is dark-only: getTheme forces dark and setTheme refuses
    "light". Flip to true (+ restore the index.html boot script) to re-enable. */
export const LIGHT_THEME_ENABLED = false;

/** Colour theme. Default dark. While light is gated, always dark. */
export function getTheme(): ThemeMode {
  if (!LIGHT_THEME_ENABLED) return "dark";
  const w = safeWindow();
  if (!w) return "dark";
  return w.localStorage.getItem(UI_PREFS_KEYS.theme) === "light" ? "light" : "dark";
}

/** Persist the theme, broadcast the change, and flip the <html> class so the
    CSS variable set swaps immediately (single source of truth for the DOM). */
export function setTheme(value: ThemeMode) {
  const w = safeWindow();
  if (!w) return;
  if (value === "light" && !LIGHT_THEME_ENABLED) return; // gated — light coming soon
  w.localStorage.setItem(UI_PREFS_KEYS.theme, value);
  applyThemeClass(value);
  w.dispatchEvent(new Event("lolData:uiPrefsChanged"));
}

/** Set `light`/`dark` on <html> (mutually exclusive). Safe to call anywhere. */
export function applyThemeClass(value: ThemeMode) {
  const d = typeof document !== "undefined" ? document.documentElement : null;
  if (!d) return;
  d.classList.toggle("light", value === "light");
  d.classList.toggle("dark", value === "dark");
}
