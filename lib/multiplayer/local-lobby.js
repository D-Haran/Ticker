import { createMatchedRating } from "../ranked-system";

const FIRST_NAMES = [
  "NOVA",
  "BYTE",
  "REX",
  "MIKA",
  "ZEN",
  "ECHO",
  "VOLT",
  "LUX",
  "ONYX",
  "KAI",
  "JINX",
];

const LAST_NAMES = [
  "7",
  "X",
  "PRIME",
  "ZERO",
  "ACE",
  "FLUX",
  "RUSH",
  "WAVE",
  "CORE",
];

const STRATEGIES = [
  "momentum",
  "signal",
  "aggressive",
  "dip",
  "patient",
];

function createMatchId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createBotHistory(index, rating) {
  return Array.from({ length: 5 }, (_, gameIndex) => {
    const placement = 1 + ((index * 19 + gameIndex * 23) % 100);
    const pnlPlacement =
      1 + ((index * 31 + gameIndex * 17) % 100);
    const pnl =
      ((index * 977 + gameIndex * 613) % 7600) - 2800;
    return {
      id: `bot-history-${index}-${gameIndex}`,
      playedAt: Date.now() - (gameIndex + 1) * 86400000,
      placement,
      pnlPlacement,
      pnl,
      balance: 10000 + pnl,
      ratingDelta: 50 - placement,
      trades: 4 + ((index + gameIndex) % 9),
      rating,
    };
  });
}

export function createLocalBattleRoyaleLobby({
  playerRating,
  playerCount = 100,
  random = Math.random,
}) {
  const botCount = Math.max(0, playerCount - 1);
  const bots = Array.from({ length: botCount }, (_, index) => {
    const first = FIRST_NAMES[index % FIRST_NAMES.length];
    const last =
      LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
    const name = `${first} ${last}`;
    const hue = Math.round((index * 137.508) % 360);

    const rating = createMatchedRating(playerRating, random);

    return {
      id: `bot-${String(index + 1).padStart(3, "0")}`,
      name,
      initials:
        index < FIRST_NAMES.length
          ? first.slice(0, 1)
          : `${first[0]}${last[0]}`.slice(0, 2),
      color: `hsl(${hue} 78% 62%)`,
      strategy: STRATEGIES[index % STRATEGIES.length],
      pace: 0.72 + random() * 0.7,
      rating,
      history: createBotHistory(index, rating),
      medals: {
        champion: index % 7,
        topTen: 4 + (index % 18),
        pnlKing: index % 5,
        survivor: index % 3,
        bigBag: 2 + (index % 11),
        activeTrader: 6 + (index % 24),
      },
    };
  });

  return {
    id: createMatchId(),
    mode: "local-bots",
    playerCount,
    createdAt: Date.now(),
    bots,
  };
}
