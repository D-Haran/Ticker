const PROFILE_KEY = "ticker-ranked-profile-v1";

export const DEFAULT_RATING = 1000;
export const MATCHMAKING_SPREAD = 175;

const DEFAULT_MEDALS = Object.freeze({
  champion: 0,
  topTen: 0,
  pnlKing: 0,
  survivor: 0,
  bigBag: 0,
  activeTrader: 0,
});

function createDefaultUsername() {
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `TRADER_${suffix}`;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(0, 20).map((game) => ({
    id: String(game?.id || `match-${Date.now()}`),
    playedAt: Number.isFinite(game?.playedAt)
      ? game.playedAt
      : Date.now(),
    placement: Number.isFinite(game?.placement)
      ? game.placement
      : 100,
    pnlPlacement: Number.isFinite(game?.pnlPlacement)
      ? game.pnlPlacement
      : game?.placement || 100,
    pnl: Number.isFinite(game?.pnl) ? game.pnl : 0,
    balance: Number.isFinite(game?.balance)
      ? game.balance
      : 10000,
    ratingDelta: Number.isFinite(game?.ratingDelta)
      ? game.ratingDelta
      : 0,
    trades: Number.isFinite(game?.trades) ? game.trades : 0,
    ranked: game?.ranked !== false,
    achievementBonus: Number.isFinite(game?.achievementBonus)
      ? game.achievementBonus
      : 0,
    placementBalanceBonus: Number.isFinite(game?.placementBalanceBonus)
      ? game.placementBalanceBonus
      : 0,
    walletDelta: Number.isFinite(game?.walletDelta)
      ? game.walletDelta
      : Number.isFinite(game?.pnl)
        ? game.pnl
        : 0,
  }));
}

function normalizeProfile(saved = {}) {
  return {
    username:
      typeof saved.username === "string" && saved.username.trim()
        ? saved.username.trim().slice(0, 18)
        : createDefaultUsername(),
    avatarColor:
      typeof saved.avatarColor === "string"
        ? saved.avatarColor
        : "#17d67f",
    rating: Number.isFinite(saved.rating)
      ? Math.max(0, Math.round(saved.rating))
      : DEFAULT_RATING,
    wallet: Number.isFinite(saved.wallet)
      ? Math.round(saved.wallet)
      : 0,
    games: Number.isFinite(saved.games) ? Math.max(0, saved.games) : 0,
    bestFinish: Number.isFinite(saved.bestFinish)
      ? saved.bestFinish
      : null,
    history: normalizeHistory(saved.history),
    medals: Object.fromEntries(
      Object.keys(DEFAULT_MEDALS).map((key) => [
        key,
        Number.isFinite(saved.medals?.[key])
          ? Math.max(0, Math.floor(saved.medals[key]))
          : 0,
      ]),
    ),
  };
}

export function ratingPercentile(rating) {
  const normalized = (rating - DEFAULT_RATING) / 260;
  const percentile = 100 / (1 + Math.exp(-normalized));
  return Math.max(1, Math.min(99, Math.round(percentile)));
}

export function ratingDeltaForPlacement(placement, fieldSize = 100) {
  const medianPlacement = Math.ceil(fieldSize / 2);
  return medianPlacement - placement;
}

export function ratingGainMultiplier(rating) {
  const normalizedRating = Math.max(0, Number.isFinite(rating) ? rating : DEFAULT_RATING);
  if (normalizedRating <= DEFAULT_RATING) {
    // New and lower-rated players climb faster; the boost smoothly tapers from
    // 1.45x at 0 Elo to 1.30x at the default 1000 Elo.
    return 1.45 - (normalizedRating / DEFAULT_RATING) * 0.15;
  }
  // Above 1000, logarithmic compression makes each additional Elo band harder
  // to cross while preserving a positive reward for strong finishes.
  const ratingDistance = (normalizedRating - DEFAULT_RATING) / 450;
  return 1.3 / (1 + Math.log1p(ratingDistance));
}

export function rankedDeltaForPerformance({
  rating,
  placement,
  pnlPlacement,
  trades,
  fieldSize = 100,
}) {
  const survivalScore = ratingDeltaForPlacement(
    placement,
    fieldSize,
  );
  const pnlScore = ratingDeltaForPlacement(
    pnlPlacement,
    fieldSize,
  );
  const baseDelta = Math.round(
    survivalScore * 0.6 + pnlScore * 0.4,
  );

  const gainMultiplier = ratingGainMultiplier(rating);
  let delta = baseDelta > 0
    ? Math.max(1, Math.round(baseDelta * gainMultiplier))
    : baseDelta;

  const requiredTrades = 3;
  if (trades < requiredTrades) {
    const participationPenalty = (requiredTrades - trades) * 3;
    delta = Math.min(0, delta) - participationPenalty;
  }

  return {
    delta,
    baseDelta,
    survivalScore,
    pnlScore,
    gainMultiplier,
  };
}

export function loadRankedProfile() {
  if (typeof window === "undefined") {
    return normalizeProfile({ username: "TRADER" });
  }

  try {
    const saved = JSON.parse(window.localStorage.getItem(PROFILE_KEY));
    const profile = normalizeProfile(saved || {});
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return profile;
  } catch {
    return normalizeProfile({});
  }
}

export function applyRankedResult(
  profile,
  placement,
  fieldSize = 100,
  match = {},
) {
  const pnlPlacement = Number.isFinite(match.pnlPlacement)
    ? match.pnlPlacement
    : placement;
  const trades = Number.isFinite(match.trades) ? match.trades : 0;
  const performance = rankedDeltaForPerformance({
    rating: profile.rating,
    placement,
    pnlPlacement,
    trades,
    fieldSize,
  });
  const ranked = match.ranked !== false;
  const championEloBonus = placement === 1
    ? Math.max(8, Math.round(30 * ratingGainMultiplier(profile.rating)))
    : 0;
  const secondPlaceEloPenalty = placement === 2 ? 40 : 0;
  const liquidationPenalty =
    match.condition === "knockout"
      ? Math.max(20, Math.round(17 + profile.rating / 260))
      : 0;
  let rankedDelta = performance.delta + championEloBonus;
  if (
    placement <= Math.ceil(fieldSize / 2) &&
    placement !== 2 &&
    (placement === 3 || trades >= 3) &&
    liquidationPenalty === 0
  ) {
    rankedDelta = Math.max(1, rankedDelta);
  }
  if (secondPlaceEloPenalty > 0) {
    rankedDelta = Math.min(-40, rankedDelta - secondPlaceEloPenalty);
  }
  if (liquidationPenalty > 0) {
    rankedDelta = Math.min(-20, rankedDelta - liquidationPenalty);
  }
  const delta = ranked ? rankedDelta : 0;
  const achievementBonus = Number.isFinite(match.achievementBonus)
    ? Math.max(0, Math.round(match.achievementBonus))
    : 0;
  const placementBalanceBonus = ranked
    ? placement === 1
      ? 15000
      : placement === 2
        ? -10000
        : 0
    : 0;
  const matchRecord = {
    id: String(match.id || `match-${Date.now()}`),
    playedAt: Number.isFinite(match.playedAt)
      ? match.playedAt
      : Date.now(),
    placement,
    pnlPlacement,
    pnl: Number.isFinite(match.pnl) ? match.pnl : 0,
    balance: Number.isFinite(match.balance)
      ? match.balance
      : 10000 + (Number.isFinite(match.pnl) ? match.pnl : 0),
    ratingDelta: delta,
    trades,
    ranked,
    achievementBonus,
    placementBalanceBonus,
    condition:
      typeof match.condition === "string"
        ? match.condition
        : "ranked",
  };
  const walletBefore = Number.isFinite(profile.wallet)
    ? profile.wallet
    : 0;
  const walletDelta =
    matchRecord.pnl + achievementBonus + placementBalanceBonus;
  const wallet = Math.round(walletBefore + walletDelta);
  matchRecord.walletDelta = wallet - walletBefore;
  const medals = {
    ...DEFAULT_MEDALS,
    ...(profile.medals || {}),
  };
  const earnedMedals = [];
  const awardMedal = (key, condition) => {
    if (!condition) return;
    medals[key] += 1;
    earnedMedals.push(key);
  };
  awardMedal("champion", placement === 1);
  awardMedal("topTen", placement <= 10);
  awardMedal("pnlKing", pnlPlacement === 1);
  awardMedal(
    "survivor",
    placement === 1 && match.condition === "last-standing",
  );
  awardMedal("bigBag", matchRecord.pnl >= 5000);
  awardMedal("activeTrader", trades >= 10);
  const updated = {
    username: profile.username,
    avatarColor: profile.avatarColor,
    rating: Math.max(0, profile.rating + delta),
    wallet,
    games: profile.games + 1,
    bestFinish:
      profile.bestFinish === null
        ? placement
        : Math.min(profile.bestFinish, placement),
    history: [matchRecord, ...(profile.history || [])].slice(0, 20),
    medals,
  };

  if (typeof window !== "undefined") {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
  }

  return {
    ...updated,
    previousRating: profile.rating,
    walletBefore,
    walletDelta: wallet - walletBefore,
    rawWalletDelta: walletDelta,
    achievementBonus,
    placementBalanceBonus,
    championEloBonus: ranked ? championEloBonus : 0,
    secondPlaceEloPenalty: ranked ? secondPlaceEloPenalty : 0,
    liquidationPenalty,
    ranked,
    ...performance,
    delta,
    placement,
    pnlPlacement,
    earnedMedals,
  };
}

export function createMatchedRating(
  playerRating,
  random = Math.random,
  spread = MATCHMAKING_SPREAD,
) {
  const offset = Math.round((random() * 2 - 1) * spread);
  return Math.max(0, playerRating + offset);
}
