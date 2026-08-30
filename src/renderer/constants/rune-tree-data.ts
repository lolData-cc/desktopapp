// Full rune tree data for the visual rune editor
// Each tree has: keystones (row 0), and 3 rows of minor runes (rows 1-3)
// IDs match Riot's perk IDs

import { PERK_CDN } from "@/config"

export type RuneInfo = {
  id: number
  name: string
  icon: string // path relative to perk CDN
}

export type RuneTree = {
  id: number
  name: string
  icon: string
  color: string // tailwind color for accents
  keystones: RuneInfo[]
  rows: RuneInfo[][] // 3 rows of 3 runes each
}

const P = (path: string) => `${PERK_CDN}/${path}`

export const RUNE_TREES: RuneTree[] = [
  {
    id: 8000, name: "Precision", icon: "Styles/7201_Precision.png",
    color: "amber-400",
    keystones: [
      { id: 8005, name: "Press the Attack", icon: "Styles/Precision/PressTheAttack/PressTheAttack.png" },
      { id: 8008, name: "Lethal Tempo", icon: "Styles/Precision/LethalTempo/LethalTempoTemp.png" },
      { id: 8021, name: "Fleet Footwork", icon: "Styles/Precision/FleetFootwork/FleetFootwork.png" },
      { id: 8010, name: "Conqueror", icon: "Styles/Precision/Conqueror/Conqueror.png" },
    ],
    rows: [
      [
        { id: 9101, name: "Absorb Life", icon: "Styles/Precision/AbsorbLife/AbsorbLife.png" },
        { id: 9111, name: "Triumph", icon: "Styles/Precision/Triumph.png" },
        { id: 8009, name: "Presence of Mind", icon: "Styles/Precision/PresenceOfMind/PresenceOfMind.png" },
      ],
      [
        { id: 9104, name: "Legend: Alacrity", icon: "Styles/Precision/LegendAlacrity/LegendAlacrity.png" },
        { id: 9105, name: "Legend: Haste", icon: "Styles/Precision/LegendHaste/LegendHaste.png" },
        { id: 9103, name: "Legend: Bloodline", icon: "Styles/Precision/LegendBloodline/LegendBloodline.png" },
      ],
      [
        { id: 8014, name: "Coup de Grace", icon: "Styles/Precision/CoupDeGrace/CoupDeGrace.png" },
        { id: 8017, name: "Cut Down", icon: "Styles/Precision/CutDown/CutDown.png" },
        { id: 8299, name: "Last Stand", icon: "Styles/Sorcery/LastStand/LastStand.png" },
      ],
    ],
  },
  {
    id: 8100, name: "Domination", icon: "Styles/7200_Domination.png",
    color: "red-400",
    keystones: [
      { id: 8112, name: "Electrocute", icon: "Styles/Domination/Electrocute/Electrocute.png" },
      { id: 8128, name: "Dark Harvest", icon: "Styles/Domination/DarkHarvest/DarkHarvest.png" },
      { id: 9923, name: "Hail of Blades", icon: "Styles/Domination/HailOfBlades/HailOfBlades.png" },
    ],
    rows: [
      [
        { id: 8126, name: "Cheap Shot", icon: "Styles/Domination/CheapShot/CheapShot.png" },
        { id: 8139, name: "Taste of Blood", icon: "Styles/Domination/TasteOfBlood/GreenTerror_TasteOfBlood.png" },
        { id: 8143, name: "Sudden Impact", icon: "Styles/Domination/SuddenImpact/SuddenImpact.png" },
      ],
      [
        { id: 8136, name: "Zombie Ward", icon: "Styles/Domination/ZombieWard/ZombieWard.png" },
        { id: 8120, name: "Ghost Poro", icon: "Styles/Domination/GhostPoro/GhostPoro.png" },
        { id: 8138, name: "Eyeball Collection", icon: "Styles/Domination/EyeballCollection/EyeballCollection.png" },
      ],
      [
        { id: 8135, name: "Treasure Hunter", icon: "Styles/Domination/TreasureHunter/TreasureHunter.png" },
        { id: 8134, name: "Ingenious Hunter", icon: "Styles/Domination/IngeniousHunter/IngeniousHunter.png" },
        { id: 8105, name: "Relentless Hunter", icon: "Styles/Domination/RelentlessHunter/RelentlessHunter.png" },
      ],
    ],
  },
  {
    id: 8200, name: "Sorcery", icon: "Styles/7202_Sorcery.png",
    color: "sky-400",
    keystones: [
      { id: 8214, name: "Summon Aery", icon: "Styles/Sorcery/SummonAery/SummonAery.png" },
      { id: 8229, name: "Arcane Comet", icon: "Styles/Sorcery/ArcaneComet/ArcaneComet.png" },
      { id: 8230, name: "Phase Rush", icon: "Styles/Sorcery/PhaseRush/PhaseRush.png" },
    ],
    rows: [
      [
        { id: 8224, name: "Nullifying Orb", icon: "Styles/Sorcery/NullifyingOrb/Pokeshield.png" },
        { id: 8226, name: "Manaflow Band", icon: "Styles/Sorcery/ManaflowBand/ManaflowBand.png" },
        { id: 8275, name: "Nimbus Cloak", icon: "Styles/Sorcery/NimbusCloak/6361.png" },
      ],
      [
        { id: 8210, name: "Transcendence", icon: "Styles/Sorcery/Transcendence/Transcendence.png" },
        { id: 8234, name: "Celerity", icon: "Styles/Sorcery/Celerity/CelerityTemp.png" },
        { id: 8233, name: "Absolute Focus", icon: "Styles/Sorcery/AbsoluteFocus/AbsoluteFocus.png" },
      ],
      [
        { id: 8237, name: "Scorch", icon: "Styles/Sorcery/Scorch/Scorch.png" },
        { id: 8232, name: "Waterwalking", icon: "Styles/Sorcery/Waterwalking/Waterwalking.png" },
        { id: 8236, name: "Gathering Storm", icon: "Styles/Sorcery/GatheringStorm/GatheringStorm.png" },
      ],
    ],
  },
  {
    id: 8400, name: "Resolve", icon: "Styles/7204_Resolve.png",
    color: "emerald-400",
    keystones: [
      { id: 8437, name: "Grasp of the Undying", icon: "Styles/Resolve/GraspOfTheUndying/GraspOfTheUndying.png" },
      { id: 8439, name: "Aftershock", icon: "Styles/Resolve/VeteranAftershock/VeteranAftershock.png" },
      { id: 8465, name: "Guardian", icon: "Styles/Resolve/Guardian/Guardian.png" },
    ],
    rows: [
      [
        { id: 8446, name: "Demolish", icon: "Styles/Resolve/Demolish/Demolish.png" },
        { id: 8463, name: "Font of Life", icon: "Styles/Resolve/FontOfLife/FontOfLife.png" },
        { id: 8401, name: "Shield Bash", icon: "Styles/Resolve/MirrorShell/MirrorShell.png" },
      ],
      [
        { id: 8429, name: "Conditioning", icon: "Styles/Resolve/Conditioning/Conditioning.png" },
        { id: 8444, name: "Second Wind", icon: "Styles/Resolve/SecondWind/SecondWind.png" },
        { id: 8473, name: "Bone Plating", icon: "Styles/Resolve/BonePlating/BonePlating.png" },
      ],
      [
        { id: 8451, name: "Overgrowth", icon: "Styles/Resolve/Overgrowth/Overgrowth.png" },
        { id: 8453, name: "Revitalize", icon: "Styles/Resolve/Revitalize/Revitalize.png" },
        { id: 8242, name: "Unflinching", icon: "Styles/Resolve/Unflinching/Unflinching.png" },
      ],
    ],
  },
  {
    id: 8300, name: "Inspiration", icon: "Styles/7203_Whimsy.png",
    color: "purple-400",
    keystones: [
      { id: 8351, name: "Glacial Augment", icon: "Styles/Inspiration/GlacialAugment/GlacialAugment.png" },
      { id: 8360, name: "Unsealed Spellbook", icon: "Styles/Inspiration/UnsealedSpellbook/UnsealedSpellbook.png" },
      { id: 8369, name: "First Strike", icon: "Styles/Inspiration/FirstStrike/FirstStrike.png" },
    ],
    rows: [
      [
        { id: 8306, name: "Hextech Flashtraption", icon: "Styles/Inspiration/HextechFlashtraption/HextechFlashtraption.png" },
        { id: 8304, name: "Magical Footwear", icon: "Styles/Inspiration/MagicalFootwear/MagicalFootwear.png" },
        { id: 8313, name: "Triple Tonic", icon: "Styles/Inspiration/PerfectTiming/PerfectTiming.png" },
      ],
      [
        { id: 8321, name: "Future's Market", icon: "Styles/Inspiration/FuturesMarket/FuturesMarket.png" },
        { id: 8316, name: "Minion Dematerializer", icon: "Styles/Inspiration/MinionDematerializer/MinionDematerializer.png" },
        { id: 8345, name: "Biscuit Delivery", icon: "Styles/Inspiration/BiscuitDelivery/BiscuitDelivery.png" },
      ],
      [
        { id: 8347, name: "Cosmic Insight", icon: "Styles/Inspiration/CosmicInsight/CosmicInsight.png" },
        { id: 8410, name: "Approach Velocity", icon: "Styles/Inspiration/ApproachVelocity/ApproachVelocity.png" },
        { id: 8352, name: "Time Warp Tonic", icon: "Styles/Inspiration/TimeWarpTonic/TimeWarpTonic.png" },
      ],
    ],
  },
]

export function getRuneTree(treeId: number): RuneTree | undefined {
  return RUNE_TREES.find(t => t.id === treeId)
}

export function getRuneIcon(runeId: number): string | null {
  for (const tree of RUNE_TREES) {
    for (const ks of tree.keystones) if (ks.id === runeId) return `${PERK_CDN}/${ks.icon}`
    for (const row of tree.rows) for (const r of row) if (r.id === runeId) return `${PERK_CDN}/${r.icon}`
  }
  return null
}

export function getRuneName(runeId: number): string | null {
  for (const tree of RUNE_TREES) {
    for (const ks of tree.keystones) if (ks.id === runeId) return ks.name
    for (const row of tree.rows) for (const r of row) if (r.id === runeId) return r.name
  }
  return null
}
