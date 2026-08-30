// catalog.ts — pickable entities for the EXPLORER nodes.
//
// v1 ships a curated meta set (enough to feel the UX + cover the examples);
// later we can swap CHAMPIONS/ITEMS for the full live ddragon lists. Names
// match `participants.champion_name`; item icons key off the numeric id.

import { cdnBaseUrl, normalizeChampName } from "@/config";
import { itemDisplayName } from "@/hooks/useItems";

export const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Mid",
  BOTTOM: "Bot",
  UTILITY: "Support",
};

// champion classes (Riot Data Dragon `tags`) — usable as Explorer category filters
// ("enemy team has ≥N Assassins") and as the basis of the conditional item-strength
// analysis. The backend derives each champion's classes from the same source.
// The 6 roster classes (Riot Data Dragon `tags`) — these have CDN icons.
export const CHAMP_CLASSES = ["Assassin", "Fighter", "Mage", "Marksman", "Support", "Tank"] as const;
// Full set of pickable champion categories: the 6 classes + damage profile (AD/AP)
// + attack type (Melee/Ranged). The backend champClass helper maps every champion
// to all of these — for team-comp filters ("enemy ≥3 AD") and item-strength buckets.
export const CATEGORIES = [...CHAMP_CLASSES, "AD", "AP", "Melee", "Ranged"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  Assassin: "Assassin",
  Fighter: "Fighter",
  Mage: "Mage",
  Marksman: "Marksman",
  Support: "Support",
  Tank: "Tank",
  AD: "AD",
  AP: "AP",
  Melee: "Melee",
  Ranged: "Ranged",
};
// Grouped for the picker dropdown: damage profile first, then the 6 roster
// classes, then attack range — so the 10 categories read as 3 short labelled
// sections instead of one long pile.
export const CATEGORY_GROUPS: { label: string; members: Category[] }[] = [
  { label: "Damage", members: ["AD", "AP"] },
  { label: "Class", members: [...CHAMP_CLASSES] },
  { label: "Range", members: ["Melee", "Ranged"] },
];
// Only the 6 roster classes have CDN icons; AD/AP/Melee/Ranged render as text badges.
export const categoryHasIcon = (cls: string) => (CHAMP_CLASSES as readonly string[]).includes(cls);
// class icons live on the un-versioned CDN path, the same assets the champion-page
// guides tab + rune editor use. Only meaningful for the 6 classes (see categoryHasIcon).
export const categoryIcon = (cls: string) =>
  `https://cdn2.loldata.cc/img/class/${cls.toLowerCase()}.png`;

// championName keys exactly as Riot's match-v5 returns them.
export const CHAMPIONS: string[] = [
  "Aatrox", "Ahri", "Akali", "Akshan", "Ashe", "AurelionSol", "Aurora", "Briar",
  "Caitlyn", "Camille", "Darius", "Diana", "Draven", "Ekko", "Elise", "Ezreal",
  "Fiora", "Garen", "Gnar", "Gragas", "Graves", "Gwen", "Hwei", "Irelia",
  "Janna", "Jax", "Jhin", "Jinx", "Kaisa", "Karma", "Katarina", "Kayn",
  "Khazix", "Kindred", "LeeSin", "Leona", "Lulu", "Lux", "Malphite", "Maokai",
  "Mel", "MissFortune", "Mordekaiser", "Nami", "Nautilus", "Neeko", "Nocturne",
  "Orianna", "Pantheon", "Rakan", "Rell", "Renekton", "Renata", "Riven", "Samira",
  "Senna", "Seraphine", "Sett", "Smolder", "Sona", "Soraka", "Swain", "Sylas",
  "Thresh", "TwistedFate", "Varus", "Vayne", "Vex", "Vi", "Viego", "Viktor",
  "Volibear", "Xayah", "Yasuo", "Yone", "Yunara", "Zed", "Zeri", "Ziggs", "Zyra",
];

export type Item = { id: number; name: string };
export const ITEMS: Item[] = [
  // ADC
  { id: 6672, name: "Kraken Slayer" },
  { id: 3031, name: "Infinity Edge" },
  { id: 3072, name: "Bloodthirster" },
  { id: 6676, name: "The Collector" },
  { id: 3036, name: "Lord Dominik's Regards" },
  { id: 6675, name: "Navori Quickblades" },
  { id: 3094, name: "Rapid Firecannon" },
  { id: 3046, name: "Phantom Dancer" },
  { id: 3153, name: "Blade of the Ruined King" },
  { id: 3124, name: "Guinsoo's Rageblade" },
  // AD assassin / bruiser
  { id: 6692, name: "Eclipse" },
  { id: 6691, name: "Duskblade" },
  { id: 3142, name: "Youmuu's Ghostblade" },
  { id: 6610, name: "Sundered Sky" },
  { id: 3074, name: "Ravenous Hydra" },
  // AP
  { id: 6655, name: "Luden's Companion" },
  { id: 6653, name: "Liandry's Torment" },
  { id: 4645, name: "Shadowflame" },
  { id: 3089, name: "Rabadon's Deathcap" },
  { id: 3157, name: "Zhonya's Hourglass" },
  { id: 3115, name: "Nashor's Tooth" },
  { id: 6657, name: "Rod of Ages" },
  // Support / enchanter
  { id: 6617, name: "Moonstone Renewer" },
  { id: 3504, name: "Ardent Censer" },
  { id: 2065, name: "Shurelya's Battlesong" },
  { id: 3190, name: "Locket of the Iron Solari" },
  { id: 3222, name: "Mikael's Blessing" },
  // Tank
  { id: 3068, name: "Sunfire Aegis" },
  { id: 3075, name: "Thornmail" },
  { id: 3110, name: "Frozen Heart" },
  { id: 3143, name: "Randuin's Omen" },
  // Boots
  { id: 3006, name: "Berserker's Greaves" },
  { id: 3047, name: "Plated Steelcaps" },
  { id: 3020, name: "Sorcerer's Shoes" },
  { id: 3111, name: "Mercury's Treads" },
];

// keystone rune id → label (a handful of the common ones for v1)
export const KEYSTONES: { id: number; name: string }[] = [
  { id: 8005, name: "Press the Attack" },
  { id: 8008, name: "Lethal Tempo" },
  { id: 8021, name: "Fleet Footwork" },
  { id: 8010, name: "Conqueror" },
  { id: 8112, name: "Electrocute" },
  { id: 8124, name: "Predator" },
  { id: 8128, name: "Dark Harvest" },
  { id: 9923, name: "Hail of Blades" },
  { id: 8214, name: "Summon Aery" },
  { id: 8229, name: "Arcane Comet" },
  { id: 8230, name: "Phase Rush" },
  { id: 8437, name: "Grasp of the Undying" },
  { id: 8439, name: "Aftershock" },
  { id: 8465, name: "Guardian" },
  { id: 8351, name: "Glacial Augment" },
  { id: 8360, name: "Unsealed Spellbook" },
  { id: 8369, name: "First Strike" },
];

export const champIcon = (name: string) =>
  `${cdnBaseUrl()}/img/champion/${normalizeChampName(name)}.png`;
export const itemIcon = (id: number) => `${cdnBaseUrl()}/img/item/${id}.png`;
// live name (from item.json) first, then the static fallback, then a bare id
export const itemName = (id: number) => itemDisplayName(id) ?? ITEMS.find((i) => i.id === id)?.name ?? `Item ${id}`;
