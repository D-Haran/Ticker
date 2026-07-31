import {
  applyRankedResult,
  loadRankedProfile,
  rankedDeltaForPerformance,
} from "./ranked-system";
import { createLocalBattleRoyaleLobby } from "./multiplayer/local-lobby";

export function startTradingGame(root, options = {}) {
  if (!root) return () => {};

  // ---------- CONFIG ----------
  const START_CASH = 10000;
  const GOAL_BALANCE = 30000;
  const ZEN_GOAL_BALANCE = 100000;
  const MAX_LOSSES = 6;
  // The primary knockout line sits 7.5% below entry. Damaged accounts can get
  // an even tighter line through the account-floor calculation below.
  const TRADE_BUST_DROP = 0.075;
  const ACCOUNT_FLOOR = 6500;
  const START_PRICE = 100;
  const TICK_MS = 50;
  const HISTORY_LEN = 220;
  const PLAYER_COUNT = 100;
  const PRESTART_MS = 3000;
  const PRESTART_TICKS = Math.round(PRESTART_MS / TICK_MS);
  const MATCH_DURATION_MS = 150000;
  const PREVIEW_MOMENTUM_RETENTION = 0.82;
  const MARKET_BALANCE = Object.freeze({
    qualificationTrades: 2,
    legitimateHoldMs: 650,
    tradeWindowLowMs: 7500,
    tradeWindowHighMs: 5800,
    idleGraceLowMs: 10000,
    idleGraceHighMs: 7000,
    idleWarningMs: 3000,
    idleModerateMs: 4000,
    idleModerateDrainLow: 0.007,
    idleModerateDrainHigh: 0.014,
    idleSevereDrainLow: 0.022,
    idleSevereDrainHigh: 0.035,
    trendDriftMin: 0.0003,
    trendDriftMax: 0.00058,
    normalVolMin: 0.0015,
    normalVolMax: 0.0029,
    momentumMin: 0.64,
    momentumMax: 0.73,
    eventGapMinTicks: 300,
    eventGapMaxTicks: 620,
    battleMeanReversion: 0.00008,
    zenLongTermGrowthPerTick: 0.000095,
    zenFairValueReversion: 0.00016,
    observationLifetimeMs: 4200,
    eliminationAggregateMs: 700,
  });
  const OPENING_BALANCE = Object.freeze({
    phaseDurationMs: 10000,
    driftMin: 0.00055,
    driftRange: 0.00035,
    volatilityMin: 0.0028,
    volatilityRange: 0.0022,
    regimeTicksMin: 100,
    regimeTicksRange: 80,
    eventDelayMinMs: 3500,
    eventDelayMaxMs: 7000,
    flatDetectionWindowTicks: 40,
    flatRangeThreshold: 0.014,
    flatTicksBeforeIntervention: 50,
  });

  let rankedProfile = loadRankedProfile();
  const gameMode = options.mode || "quick";
  const isZenMode = gameMode === "zen";
  const isRankedMatch = !isZenMode && options.isRanked !== false;
  let localLobby = null;
  let lobbyDifficulty = 0;
  // Supplying options.random enables deterministic market simulations without
  // coupling cosmetic effects or bot personality to the price sequence.
  const marketRandom = options.random || Math.random;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const randomBetween = (min, max) => min + marketRandom() * (max - min);

  function tradeWindowMs() {
    return lerp(
      MARKET_BALANCE.tradeWindowLowMs,
      MARKET_BALANCE.tradeWindowHighMs,
      lobbyDifficulty,
    );
  }

  function idleGraceMs() {
    const matchProgress = state?.marketOpen
      ? 1 - matchRemaining() / MATCH_DURATION_MS
      : 0;
    return lerp(
      MARKET_BALANCE.idleGraceLowMs,
      MARKET_BALANCE.idleGraceHighMs,
      lobbyDifficulty,
    ) - matchProgress * 900;
  }

  function currentGoal() {
    return isZenMode ? ZEN_GOAL_BALANCE : GOAL_BALANCE;
  }

  // ---------- STATE ----------
  let state = null;

  function freshState() {
    const now = performance.now();
    const marketOpensAt = now + PRESTART_MS;
    return {
      cash: START_CASH,
      shares: 0,
      entryPrice: 0,
      entryValue: 0,
      bustPrice: 0,
      autoSellAt: 0,
      price: START_PRICE,
      fairValue: START_PRICE,
      history: [START_PRICE],
      holding: false,
      trades: 0,
      wins: 0,
      losses: 0,
      regime: null,
      noiseMomentum: 0,
      openingTicksElapsed: 0,
      openingFlatTicks: 0,
      openingIntervened: false,
      marketEvent: null,
      nextEventIn: 180,
      publicObservation: null,
      observationHistory: [],
      running: true,
      startTime: marketOpensAt,
      marketOpensAt,
      marketOpen: false,
      deadlineAt: isZenMode
        ? Number.POSITIVE_INFINITY
        : marketOpensAt + MATCH_DURATION_MS,
      lastClosingSecond: null,
      gameOver: false,
      streak: 0,
      lowestBalance: START_CASH,
      peakBalance: START_CASH,
      boughtOnSignal: false,
      tradeEntryRegime: null,
      tradeEntryObservation: null,
      tradeEnteredDuringSurprise: false,
      unlocked: {},
      achievementBonus: 0,
      idleLost: 0,
      tradeRedSince: 0,
      tradeRedForThreeSeconds: false,
      tradeMinPnlPct: 0,
      tradePeakPnl: 0,
      tradeMarkers: [],
      activeTradeMarkerId: null,
      nextTradeMarkerId: 1,
      eliminated: false,
      eliminatedAt: 0,
      lastLeaderboardUpdate: 0,
      lastTradeAt: marketOpensAt,
      legitimateTrades: 0,
      qualified: false,
      tradeEnteredAt: 0,
      tradeStartIndex: 0,
      recentEntries: [],
      recentLiquidations: [],
      eliminationBatch: [],
      eliminationBatchTimer: null,
      finalPlacement: null,
      finalPnlPlacement: null,
      winnerId: null,
      ratingApplied: false,
      ratingResult: null,
      rewardAnimationPlayed: false,
      rating: rankedProfile.rating,
      eliminationCondition: null,
    };
  }

  function freshBots() {
    if (isZenMode) {
      localLobby = null;
      lobbyDifficulty = 0;
      return [];
    }
    const now = performance.now();
    localLobby = createLocalBattleRoyaleLobby({
      playerRating: rankedProfile.rating,
      playerCount: PLAYER_COUNT,
    });
    const averageLobbyElo = (
      rankedProfile.rating +
      localLobby.bots.reduce((sum, bot) => sum + bot.rating, 0)
    ) / PLAYER_COUNT;
    lobbyDifficulty = clamp((averageLobbyElo - 800) / 1200, 0, 1);
    return localLobby.bots.map((profile, index) => ({
      ...profile,
      cash: START_CASH,
      shares: 0,
      entryPrice: 0,
      entryValue: 0,
      bustPrice: 0,
      entryIndex: 0,
      autoSellAt: 0,
      holding: false,
      trades: 0,
      wins: 0,
      losses: 0,
      streak: 0,
      eliminated: false,
      eliminatedAt: 0,
      lastTradeAt: now,
      markerBusted: false,
      nextDecisionAt: now + 350 + (index % 20) * 110 + Math.random() * 900,
      legitimateTrades: 0,
      qualified: false,
      tradeEnteredAt: 0,
    }));
  }

  let bots = [];

  // ---------- DOM ----------
  const byId = (id) => root.querySelector(`#${id}`);
  const chartCanvas = byId("chart");
  const fxCanvas = byId("fx");
  const chartCtx = chartCanvas.getContext("2d");
  const fxCtx = fxCanvas.getContext("2d");
  const chartWrap = byId("chartWrap");

  const buyBtn = byId("buyBtn");
  const sellBtn = byId("sellBtn");
  const soundToggle = byId("soundToggle");
  const flashEl = byId("flash");
  const positionTag = byId("positionTag");
  const dangerVignette = byId("dangerVignette");
  const streakVal = byId("streakVal");
  const achievementToast = byId("achievementToast");
  const achIcon = byId("achIcon");
  const achTitle = byId("achTitle");
  const achDesc = byId("achDesc");
  const achReward = byId("achReward");
  const pnlCalloutText = byId("pnlCalloutText");
  const pnlCalloutDetail = byId("pnlCalloutDetail");
  const lossWarning = byId("lossWarning");
  const lossWarningLabel = byId("lossWarningLabel");
  const lossesRemaining = byId("lossesRemaining");
  const strikePips = byId("strikePips");

  const equityVal = byId("equityVal");
  const tradesVal = byId("tradesVal");
  const winsVal = byId("winsVal");
  const strikesVal = byId("strikesVal");
  const progressBar = byId("progressBar");
  const priceVal = byId("priceVal");
  const priceDelta = byId("priceDelta");
  const clockEl = byId("clock");
  const goalValue = byId("goalValue");
  const tradeTimer = byId("tradeTimer");
  const tradeTimerFill = byId("tradeTimerFill");
  const autoSellText = byId("autoSellText");
  const botMarkerLayer = byId("botMarkerLayer");
  const aliveCount = byId("aliveCount");
  const currentRank = byId("currentRank");
  const livePnlCard = byId("livePnlCard");
  const livePnlValue = byId("livePnlValue");
  const livePnlPulse = byId("livePnlPulse");
  const idleWarning = byId("idleWarning");
  const idleWarningText = byId("idleWarningText");
  const activityFeed = byId("activityFeed");
  const marketObservation = byId("marketObservation");
  const marketObservationText = byId("marketObservationText");
  const qualificationStatus = byId("qualificationStatus");
  const qualificationValue = byId("qualificationValue");
  const crowdExposed = byId("crowdExposed");
  const crowdRecent = byId("crowdRecent");
  const crowdUnderwater = byId("crowdUnderwater");
  const marketCountdown = byId("marketCountdown");
  const marketCountdownValue = byId("marketCountdownValue");
  const matchReveal = byId("matchReveal");
  const revealEyebrow = byId("revealEyebrow");
  const revealTitle = byId("revealTitle");
  const revealDetail = byId("revealDetail");
  const winnerCinematic = byId("winnerCinematic");
  const cinematicWinnerAvatar = byId("cinematicWinnerAvatar");
  const cinematicWinnerName = byId("cinematicWinnerName");
  const cinematicWinnerDetail = byId("cinematicWinnerDetail");
  const cinematicSecondPenalty = byId("cinematicSecondPenalty");
  const spectatorHud = byId("spectatorHud");
  const spectatorAlive = byId("spectatorAlive");
  const spectatorLeader = byId("spectatorLeader");
  const spectatorTime = byId("spectatorTime");
  const spectatorStandingsBtn = byId("spectatorStandingsBtn");
  const spectatorExitBtn = byId("spectatorExitBtn");

  const modalBackdrop = byId("modalBackdrop");
  const resultsKicker = byId("resultsKicker");
  const modalIcon = byId("modalIcon");
  const modalTitle = byId("modalTitle");
  const modalDesc = byId("modalDesc");
  const modalRank = byId("modalRank");
  const modalPlacementRank = byId("modalPlacementRank");
  const modalPnlRank = byId("modalPnlRank");
  const placementTab = byId("placementTab");
  const pnlTab = byId("pnlTab");
  const rankedResult = byId("rankedResult");
  const rankedFormula = byId("rankedFormula");
  const ratingBefore = byId("ratingBefore");
  const ratingDelta = byId("ratingDelta");
  const ratingAfter = byId("ratingAfter");
  const ratingTrend = byId("ratingTrend");
  const leaderboardList = byId("leaderboardList");
  const modalCondition = byId("modalCondition");
  const modalTime = byId("modalTime");
  const modalBtn = byId("modalBtn");
  const spectateBtn = byId("spectateBtn");
  const backLobbyBtn = byId("backLobbyBtn");
  const rewardMode = byId("rewardMode");
  const rewardWalletAfter = byId("rewardWalletAfter");
  const rewardWalletBefore = byId("rewardWalletBefore");
  const rewardContribution = byId("rewardContribution");
  const rewardWalletTotal = byId("rewardWalletTotal");
  const walletProgression = byId("walletProgression");
  const walletTrend = byId("walletTrend");
  const rewardPnl = byId("rewardPnl");
  const rewardBonus = byId("rewardBonus");
  const rewardPlacement = byId("rewardPlacement");
  const botMarkers = new Map();
  let leaderboardMode = "placement";
  let chartViewMin = null;
  let chartViewMax = null;
  let revealToken = 0;
  let progressionAnimationToken = 0;

  let disposed = false;
  let tickInterval = null;
  let clockInterval = null;
  let animationFrame = null;
  let lastRenderAt = 0;
  let lastMarkerRenderAt = 0;
  let viewportWidth = 1;
  let viewportHeight = 1;
  let compactRender = false;
  let lastRankUpdateAt = 0;
  let lastSpectatorHudAt = 0;
  let lastActivityPushAt = 0;
  let fxWasActive = false;
  const pendingTimeouts = new Set();

  function later(callback, delay) {
    const timeout = window.setTimeout(() => {
      pendingTimeouts.delete(timeout);
      if (!disposed) callback();
    }, delay);
    pendingTimeouts.add(timeout);
    return timeout;
  }

  function buildBotMarkers() {
    botMarkerLayer.replaceChildren();
    botMarkers.clear();
    bots.forEach((profile) => {
      const marker = document.createElement("div");
      marker.className = "bot-marker";
      marker.dataset.botId = profile.id;
      marker.style.setProperty("--bot-color", profile.color);

      const avatar = document.createElement("div");
      avatar.className = "bot-marker-avatar";
      avatar.textContent = profile.initials;

      const name = document.createElement("div");
      name.className = "bot-marker-name";
      name.textContent = profile.name;

      marker.append(avatar, name);
      marker._renderState = {
        visible: false,
        x: Number.NaN,
        y: Number.NaN,
        timer: Number.NaN,
        mix: Number.NaN,
        glow: Number.NaN,
        profit: null,
      };
      botMarkerLayer.appendChild(marker);
      botMarkers.set(profile.id, marker);
    });
  }

  // ---------- HELPERS ----------
  function fmtMoney(n) {
    const sign = n < 0 ? "-" : "";
    return (
      sign +
      "$" +
      Math.abs(n).toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
    );
  }

  function fmtMoney2(n) {
    const sign = n < 0 ? "-" : "";
    return (
      sign +
      "$" +
      Math.abs(n).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  function fmtTime(ms) {
    if (!Number.isFinite(ms)) return "∞";
    const s = Math.floor(Math.max(0, ms) / 1000);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return m + ":" + String(rem).padStart(2, "0");
  }

  function matchRemaining() {
    if (isZenMode) return Number.POSITIVE_INFINITY;
    if (!state.marketOpen) return MATCH_DURATION_MS;
    return Math.max(0, state.deadlineAt - performance.now());
  }

  function liveBalance() {
    return state.cash + state.shares * state.price;
  }

  function settledBalance() {
    return state.holding ? state.entryValue : state.cash;
  }

  function calculateBustPrice(entryPrice, shares) {
    const adaptiveBust = Math.max(
      entryPrice * (1 - TRADE_BUST_DROP),
      ACCOUNT_FLOOR / shares,
    );
    return Math.min(entryPrice * 0.99, adaptiveBust);
  }

  function botLiveBalance(bot) {
    return bot.cash + bot.shares * state.price;
  }

  function updateLobbyStrip() {
    if (isZenMode) return;
    const now = performance.now();
    if (now - lastRankUpdateAt < 160) return;
    lastRankUpdateAt = now;
    aliveCount.textContent = activeCompetitors().length;
    const ranked = competitorsForPnl();
    const placement =
      ranked.findIndex((competitor) => competitor.id === "player") + 1;
    currentRank.textContent = `#${placement}`;
    currentRank.classList.toggle("out", state.eliminated);
  }

  function idlePressure(idleFor) {
    const grace = idleGraceMs();
    const moderateStarts = grace + MARKET_BALANCE.idleWarningMs;
    const severeStarts = moderateStarts + MARKET_BALANCE.idleModerateMs;
    if (idleFor < moderateStarts) return { stage: "warning", rate: 0 };
    if (idleFor < severeStarts) {
      const progress = (idleFor - moderateStarts) / MARKET_BALANCE.idleModerateMs;
      return {
        stage: "moderate",
        rate: lerp(
          MARKET_BALANCE.idleModerateDrainLow,
          MARKET_BALANCE.idleModerateDrainHigh,
          progress,
        ),
      };
    }
    return {
      stage: "severe",
      rate: lerp(
        MARKET_BALANCE.idleSevereDrainLow,
        MARKET_BALANCE.idleSevereDrainHigh,
        clamp((idleFor - severeStarts) / 6000, 0, 1),
      ),
    };
  }

  function updateIdleWarning() {
    if (isZenMode) {
      idleWarning.classList.remove("show", "danger");
      root.classList.remove("idle-tax-active");
      return;
    }
    if (
      !state.marketOpen ||
      state.holding ||
      state.eliminated ||
      state.gameOver
    ) {
      idleWarning.classList.remove("show", "danger");
      root.classList.remove("idle-tax-active");
      return;
    }

    const idleFor = performance.now() - state.lastTradeAt;
    const grace = idleGraceMs();
    const remaining = grace - idleFor;
    const pressure = idlePressure(idleFor);
    idleWarning.classList.add("show");
    root.classList.remove("idle-tax-active");
    if (remaining > 0) {
      idleWarning.classList.remove("danger");
      idleWarningText.textContent = `PRESSURE IN ${(remaining / 1000).toFixed(1)}s`;
    } else if (pressure.rate === 0) {
      idleWarning.classList.remove("danger");
      idleWarningText.textContent = "ACTIVITY REQUIRED SOON";
    } else {
      idleWarning.classList.add("danger");
      root.classList.add("idle-tax-active");
      const rate = pressure.rate * 100;
      idleWarningText.textContent =
        `${pressure.stage.toUpperCase()} PRESSURE • −${rate.toFixed(1)}% / SEC`;
    }
  }

  function applyIdlePressure() {
    if (isZenMode) return;
    const tickSeconds = TICK_MS / 1000;
    const now = performance.now();

    if (
      !state.holding &&
      !state.eliminated &&
      now - state.lastTradeAt > idleGraceMs()
    ) {
      const rate = idlePressure(now - state.lastTradeAt).rate;
      const beforeDrain = state.cash;
      state.cash *= 1 - rate * tickSeconds;
      state.idleLost += beforeDrain - state.cash;
    }

    bots.forEach((bot) => {
      if (
        !bot.holding &&
        !bot.eliminated &&
        now - bot.lastTradeAt > idleGraceMs()
      ) {
        const rate = idlePressure(now - bot.lastTradeAt).rate;
        bot.cash *= 1 - rate * tickSeconds;
        if (bot.cash <= ACCOUNT_FLOOR) eliminateBot(bot, "zone");
      }
    });
  }

  function pushActivity(text, type = "profit") {
    if (!activityFeed) return;
    const now = performance.now();
    if (!text.startsWith("YOU") && now - lastActivityPushAt < 90) return;
    lastActivityPushAt = now;
    const item = document.createElement("div");
    item.className = `activity-item ${type}`;
    item.textContent = text;
    activityFeed.prepend(item);
    while (activityFeed.children.length > 5) {
      activityFeed.lastElementChild?.remove();
    }
    later(() => item.classList.add("leaving"), 2200);
    later(() => item.remove(), 2800);
  }

  function queueBotElimination(bot, reason) {
    const now = performance.now();
    state.eliminationBatch.push({ bot, reason, at: now });
    state.recentLiquidations.push(now);
    if (state.eliminationBatchTimer) return;
    state.eliminationBatchTimer = later(() => {
      const batch = state.eliminationBatch.splice(0);
      state.eliminationBatchTimer = null;
      if (!batch.length) return;
      const liquidationCount = batch.filter(({ reason: itemReason }) =>
        itemReason === "knockout" || itemReason === "floor"
      ).length;
      if (batch.length === 1) {
        pushActivity(`${batch[0].bot.name} OUT`, batch[0].reason === "strikes" ? "strike" : "out");
      } else if (liquidationCount >= 12) {
        pushActivity(`MARKET CASCADE • ${batch.length} OUT`, "out");
      } else if (liquidationCount >= 5) {
        pushActivity(`${batch.length} PLAYERS LIQUIDATED`, "out");
      } else {
        pushActivity(`${batch.length} PLAYERS OUT`, "out");
      }
    }, MARKET_BALANCE.eliminationAggregateMs);
  }

  function updateMarketCountdown() {
    if (isZenMode && state.marketOpen) {
      marketCountdown.classList.remove("show", "closing", "go");
      return;
    }
    if (state.marketOpen && !state.gameOver) {
      const remaining = matchRemaining();
      if (remaining <= 10000 && remaining > 0) {
        const second = Math.max(1, Math.ceil(remaining / 1000));
        marketCountdownValue.textContent = second;
        marketCountdown.querySelector("span").textContent =
          "MARKET CLOSE";
        marketCountdown.classList.remove("go");
        marketCountdown.classList.add("show", "closing");
        if (state.lastClosingSecond !== second) {
          state.lastClosingSecond = second;
          beep(second <= 3 ? 220 : 130, 0.11, "sine");
        }
        return;
      }
      if (!marketCountdown.classList.contains("go")) {
        marketCountdown.classList.remove("show", "closing");
      }
      return;
    }
    if (state.gameOver) {
      marketCountdown.classList.remove("show", "closing", "go");
      return;
    }
    const remaining = state.marketOpensAt - performance.now();
    marketCountdownValue.textContent = Math.max(
      1,
      Math.ceil(remaining / 1000),
    );
    marketCountdown.querySelector("span").textContent =
      "READ THE TREND";
    marketCountdown.classList.remove("closing");
    marketCountdown.classList.add("show");
  }

  function openMarket() {
    if (state.marketOpen) return;
    const now = performance.now();
    state.marketOpen = true;
    state.startTime = now;
    state.deadlineAt = isZenMode
      ? Number.POSITIVE_INFINITY
      : now + MATCH_DURATION_MS;
    state.lastTradeAt = now;
    const openingDirection = marketRandom() < 0.5 ? -1 : 1;
    // The preview is deliberately cinematic. Keep only a small trace of it,
    // then give the authored opening its own directional impulse.
    state.noiseMomentum = state.noiseMomentum * 0.1 +
      openingDirection * randomBetween(0.2, 0.45);
    state.openingTicksElapsed = 0;
    state.openingFlatTicks = 0;
    state.openingIntervened = false;
    state.marketEvent = null;
    state.regime = createOpeningRegime(openingDirection);
    state.nextEventIn = Math.round(randomBetween(
      OPENING_BALANCE.eventDelayMinMs,
      OPENING_BALANCE.eventDelayMaxMs,
    ) / TICK_MS);
    bots.forEach((bot, index) => {
      bot.lastTradeAt = now;
      bot.nextDecisionAt =
        now + 350 + (index % 20) * 110 + Math.random() * 900;
    });
    marketCountdownValue.textContent = "GO";
    marketCountdown.classList.add("go");
    later(() => {
      marketCountdown.classList.remove("show", "go");
    }, 520);
    playSfx("open");
  }

  function gaussianRandom() {
    const u = 1 - marketRandom();
    const v = marketRandom();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function flash(color) {
    flashEl.className = "flash " + color;
    void flashEl.offsetWidth;
    flashEl.classList.add("play");
  }

  // ---------- ACHIEVEMENTS ----------
  let achQueue = [];
  let achShowing = false;

  function unlock(id, icon, title, desc, reward = 100) {
    if (state.unlocked[id]) return;
    state.unlocked[id] = true;
    state.achievementBonus += reward;
    achQueue.push({ icon, title, desc, reward });
    if (modalBackdrop.classList.contains("show")) updateRewardPanel();
    processAchQueue();
  }

  function processAchQueue() {
    if (achShowing || achQueue.length === 0) return;
    achShowing = true;
    const achievement = achQueue.shift();
    achIcon.textContent = achievement.icon;
    achTitle.textContent = achievement.title;
    achDesc.textContent = achievement.desc;
    achReward.textContent = achievement.reward > 0
      ? `+$${achievement.reward.toLocaleString("en-US")} ACCOUNT BONUS`
      : "MEDAL UNLOCKED";
    achievementToast.classList.add("show");
    beep(660, 0.09, "triangle");
    later(() => beep(990, 0.1, "triangle"), 100);
    later(() => {
      achievementToast.classList.remove("show");
      later(() => {
        achShowing = false;
        processAchQueue();
      }, 400);
    }, 2600);
  }

  function checkProgressAchievements(settled, equity) {
    if (settled >= 15000) {
      unlock(
        "half",
        "🚀",
        "Money Maker",
        "Closed your way to a $15,000 balance.",
      );
    }
    if (settled >= 20000) {
      unlock(
        "double",
        "💎",
        "Double Up",
        "Closed your way to a $20,000 balance.",
      );
    }
    if (state.trades >= 3) {
      unlock(
        "trades3",
        "📊",
        "Market Regular",
        "Completed three trades in one match.",
      );
    }
    if (state.trades >= 10) {
      unlock(
        "trades10",
        "🎟️",
        "Regular Trader",
        "You've made 10 trades.",
      );
    }
    if (state.wins >= 5) {
      unlock(
        "wins5",
        "🎯",
        "Sharpshooter",
        "Closed five profitable trades.",
      );
    }
    const alive = activeCompetitors().length;
    if (!isZenMode && !state.eliminated && state.qualified && state.marketOpen && alive <= 50) {
      unlock(
        "top50",
        "⚔️",
        "Half the Field",
        "Survived into the top 50.",
      );
    }
    if (!isZenMode && !state.eliminated && state.qualified && state.marketOpen && alive <= 10) {
      unlock(
        "top10",
        "🏅",
        "Final Ten",
        "Survived into the final ten.",
      );
    }
    if (
      !state.holding &&
      state.lowestBalance <= 8000 &&
      equity >= START_CASH
    ) {
      unlock(
        "comeback",
        "🪽",
        "The Comeback",
        "Recovered from below $8,000 back to even.",
      );
    }
  }

  // ---------- AUDIO ----------
  let audioCtx = window.__tickerAudioContext || null;
  let themeTimer = null;
  let themeStep = 0;
  let soundEnabled = true;
  try {
    soundEnabled = window.localStorage.getItem("ticker-sound-enabled") !== "false";
  } catch {}

  function ensureAudio() {
    try {
      if (!audioCtx || audioCtx.state === "closed") {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        window.__tickerAudioContext = audioCtx;
      }
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
      return audioCtx;
    } catch {
      return null;
    }
  }

  function tone(freq, dur, type = "triangle", volume = 0.09, delay = 0) {
    if (!soundEnabled) return;
    const context = ensureAudio();
    if (!context) return;
    try {
      const startsAt = context.currentTime + delay;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startsAt);
      gain.gain.setValueAtTime(Math.max(0.0001, volume), startsAt);
      gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + dur);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(startsAt);
      osc.stop(startsAt + dur);
    } catch {}
  }

  function beep(freq, dur, type) {
    tone(freq, dur, type || "triangle", 0.085);
  }

  function playSfx(name) {
    const cues = {
      buy: [[392, 0], [523.25, 0.055], [659.25, 0.11]],
      profit: [[523.25, 0], [659.25, 0.07], [783.99, 0.14]],
      loss: [[261.63, 0], [196, 0.08], [146.83, 0.16]],
      open: [[329.63, 0], [493.88, 0.07], [659.25, 0.14]],
    };
    (cues[name] || []).forEach(([frequency, delay], index) => {
      tone(frequency, 0.13 + index * 0.015, index === 2 ? "square" : "triangle", 0.055, delay);
    });
  }

  function updateSoundToggle() {
    if (!soundToggle) return;
    soundToggle.classList.toggle("muted", !soundEnabled);
    soundToggle.querySelector("span").textContent = soundEnabled ? "♫" : "×";
    soundToggle.querySelector("b").textContent = soundEnabled ? "SOUND" : "MUTED";
    soundToggle.setAttribute("aria-label", soundEnabled ? "Mute game audio" : "Enable game audio");
  }

  function stopTheme() {
    if (themeTimer) window.clearTimeout(themeTimer);
    themeTimer = null;
  }

  function themeMood() {
    const equity = state ? liveBalance() : START_CASH;
    const reference = state?.holding ? state.entryValue : START_CASH;
    return clamp((equity - reference) / Math.max(1, reference * 0.12), -1, 1);
  }

  function startTheme() {
    stopTheme();
    if (!soundEnabled) return;
    ensureAudio();
    const bass = [82.41, 98, 110, 123.47, 98, 130.81, 123.47, 110];
    const lead = [329.63, 392, 493.88, 587.33, 523.25, 440, 392, 493.88];
    const pulse = () => {
      const step = themeStep % 32;
      const mood = themeMood();
      // Winning raises the melody into a bright register. Drawdown keeps the
      // same urgent tempo but drops it into a heavier, lower register.
      const pitchScale = lerp(0.68, 1.48, (mood + 1) / 2);
      if (step % 4 === 0) {
        tone(bass[(step / 4) % bass.length] * pitchScale, 0.14, "square", 0.014);
      }
      if (![7, 15, 23, 31].includes(step)) {
        tone(lead[(step + Math.floor(step / 8)) % lead.length] * pitchScale, 0.065, "triangle", 0.0085);
      }
      if (step % 2 === 1) tone(1100 * Math.max(0.82, pitchScale), 0.018, "square", 0.0035);
      themeStep += 1;
      themeTimer = window.setTimeout(pulse, 104 - Math.abs(mood) * 10);
    };
    pulse();
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    try {
      window.localStorage.setItem("ticker-sound-enabled", String(soundEnabled));
    } catch {}
    updateSoundToggle();
    if (soundEnabled) {
      playSfx("open");
      startTheme();
    } else {
      stopTheme();
    }
  }

  // ---------- PRICE ENGINE ----------
  const OBSERVATION_TEXT = {
    buying: ["Institutional buying accelerates", "Buyers reject lower prices", "Price holds despite selling pressure"],
    selling: ["Large sell orders enter the market", "Sellers absorb repeated rallies", "Buying slows near the session high"],
    breakout_up: ["Price breaks above the recent range", "Trading activity rises above the recent range"],
    breakout_down: ["Price breaks below the recent range", "Selling expands below the recent range"],
    exhaustion_up: ["Trading volume falls near recent highs", "Buying slows near the session high"],
    exhaustion_down: ["Selling slows near the session low", "Buyers reject lower prices"],
    volatility: ["Trading activity rises sharply", "Liquidity thins near market price", "Options activity rises ahead of an announcement"],
    failed: ["Breakout loses participation", "Price returns inside the recent range"],
    balanced: ["Trading activity is balanced", "Price holds inside the recent range"],
  };

  function pick(values) {
    return values[Math.floor(marketRandom() * values.length)];
  }

  function regimeDurationTicks() {
    return Math.round(randomBetween(80, 220));
  }

  function createRegime(type, direction = 0) {
    const resolvedDirection = type === "trend_up"
      ? 1
      : type === "trend_down"
        ? -1
        : direction || (marketRandom() < 0.5 ? -1 : 1);
    const totalTicks = regimeDurationTicks();
    const isTrend = type === "trend_up" || type === "trend_down";
    const drift = isTrend
      ? randomBetween(MARKET_BALANCE.trendDriftMin, MARKET_BALANCE.trendDriftMax)
      : type === "breakout"
        ? randomBetween(0.00065, 0.00105)
        : type === "exhaustion"
          ? randomBetween(0.00012, 0.00028)
          : randomBetween(-0.00008, 0.00008);
    return {
      type,
      direction: resolvedDirection,
      drift,
      volatility: type === "consolidation"
        ? randomBetween(0.0009, 0.0015)
        : type === "breakout"
          ? randomBetween(0.0022, 0.0038)
          : randomBetween(MARKET_BALANCE.normalVolMin, MARKET_BALANCE.normalVolMax),
      momentumRetention: type === "consolidation"
        ? randomBetween(0.42, 0.58)
        : randomBetween(MARKET_BALANCE.momentumMin, MARKET_BALANCE.momentumMax),
      totalTicks,
      ticksRemaining: totalTicks,
      observationPublished: false,
    };
  }

  function createOpeningRegime(direction) {
    const type = marketRandom() < 0.52
      ? "breakout"
      : direction > 0 ? "trend_up" : "trend_down";
    const totalTicks = Math.round(
      OPENING_BALANCE.regimeTicksMin +
      marketRandom() * OPENING_BALANCE.regimeTicksRange,
    );
    return {
      type,
      direction,
      drift: OPENING_BALANCE.driftMin +
        marketRandom() * OPENING_BALANCE.driftRange,
      volatility: OPENING_BALANCE.volatilityMin +
        marketRandom() * OPENING_BALANCE.volatilityRange,
      momentumRetention: randomBetween(
        MARKET_BALANCE.momentumMin + 0.04,
        Math.min(0.82, MARKET_BALANCE.momentumMax + 0.07),
      ),
      totalTicks,
      ticksRemaining: totalTicks,
      observationPublished: false,
      opening: true,
    };
  }

  function openingPhaseActive() {
    return state.openingTicksElapsed <
      Math.round(OPENING_BALANCE.phaseDurationMs / TICK_MS);
  }

  function maybeInterveneInFlatOpening() {
    if (
      !openingPhaseActive() ||
      state.openingIntervened ||
      state.openingTicksElapsed < OPENING_BALANCE.flatDetectionWindowTicks
    ) return;

    const window = state.history.slice(
      -OPENING_BALANCE.flatDetectionWindowTicks,
    );
    const low = Math.min(...window);
    const high = Math.max(...window);
    const range = (high - low) / Math.max(1, window[0]);
    if (range >= OPENING_BALANCE.flatRangeThreshold) {
      state.openingFlatTicks = 0;
      return;
    }

    state.openingFlatTicks += 1;
    if (
      state.openingFlatTicks < OPENING_BALANCE.flatTicksBeforeIntervention
    ) return;

    const windowMove = window[window.length - 1] - window[0];
    const direction = Math.abs(windowMove / window[0]) >=
      OPENING_BALANCE.flatRangeThreshold * 0.2
      ? Math.sign(windowMove)
      : marketRandom() < 0.5 ? -1 : 1;
    state.openingIntervened = true;
    state.regime = createOpeningRegime(direction);
    state.noiseMomentum = direction * Math.max(
      0.8,
      Math.abs(state.noiseMomentum),
    );
    // Bring the already-authored opening event forward instead of creating an
    // extra random shock outside the normal event system.
    state.nextEventIn = Math.min(
      state.nextEventIn,
      Math.round(750 / TICK_MS),
    );
  }

  function transitionRegime() {
    const current = state.regime;
    let nextType;
    let direction = current?.direction || (marketRandom() < 0.5 ? -1 : 1);
    if (!current || current.type === "consolidation") {
      nextType = "breakout";
      direction = marketRandom() < 0.5 ? -1 : 1;
    } else if (current.type === "breakout") {
      const falseBreakoutChance = lerp(0.05, 0.24, lobbyDifficulty);
      if (marketRandom() < falseBreakoutChance) {
        nextType = "trend_" + (direction > 0 ? "down" : "up");
        direction *= -1;
        publishObservation("failed", 0, 1, 0.75);
      } else {
        nextType = direction > 0 ? "trend_up" : "trend_down";
      }
    } else if (current.type === "trend_up" || current.type === "trend_down") {
      nextType = "exhaustion";
    } else {
      const roll = marketRandom();
      if (roll < 0.46) {
        direction *= -1;
        nextType = direction > 0 ? "trend_up" : "trend_down";
      } else if (roll < 0.78) {
        nextType = "consolidation";
      } else {
        nextType = direction > 0 ? "trend_up" : "trend_down";
      }
    }
    state.regime = createRegime(nextType, direction);
  }

  function publishObservation(category, direction, reliability, strength, leadTimeMs = 0) {
    const visibleDirection = marketRandom() <= reliability ? direction : -direction;
    let textCategory = category;
    if (category === "directional") {
      textCategory = visibleDirection > 0 ? "buying" : "selling";
    } else if (category === "breakout_up" || category === "breakout_down") {
      textCategory = visibleDirection > 0 ? "breakout_up" : "breakout_down";
    } else if (category === "exhaustion_up" || category === "exhaustion_down") {
      textCategory = visibleDirection > 0 ? "exhaustion_down" : "exhaustion_up";
    }
    const observation = {
      category: textCategory,
      direction: visibleDirection,
      reliability,
      strength,
      leadTimeMs,
      expiresAt: performance.now() + MARKET_BALANCE.observationLifetimeMs,
      text: pick(OBSERVATION_TEXT[textCategory] || OBSERVATION_TEXT.balanced),
    };
    state.publicObservation = observation;
    state.observationHistory.push(observation);
    if (state.observationHistory.length > 12) state.observationHistory.shift();
    marketObservationText.textContent = observation.text;
    marketObservation.className = "market-observation show " +
      (visibleDirection > 0 ? "positive" : visibleDirection < 0 ? "negative" : "");
  }

  function maybePublishRegimeObservation(progress) {
    const regime = state.regime;
    if (regime.observationPublished || progress < lerp(0.2, 0.36, lobbyDifficulty)) return;
    regime.observationPublished = true;
    const reliability = lerp(0.82, 0.63, lobbyDifficulty);
    if (regime.type === "breakout") {
      publishObservation(regime.direction > 0 ? "breakout_up" : "breakout_down", regime.direction, reliability, 0.8);
    } else if (regime.type === "exhaustion") {
      publishObservation(regime.direction > 0 ? "exhaustion_up" : "exhaustion_down", -regime.direction, reliability, 0.62);
    } else if (regime.type === "consolidation") {
      publishObservation("balanced", 0, 1, 0.4);
    } else {
      publishObservation("directional", regime.direction, reliability, 0.65);
    }
  }

  const EVENT_TYPES = [
    "bull_trap", "bear_trap", "liquidity_cascade", "squeeze",
    "panic_selloff", "recovery_rally", "false_breakout",
    "volatility_burst", "double_reversal",
  ];

  function startMarketEvent() {
    const surpriseShare = lerp(0.05, 0.225, lobbyDifficulty);
    const informationRoll = marketRandom();
    const information = informationRoll < surpriseShare
      ? "surprise"
      : informationRoll < surpriseShare + 0.25
        ? "ambiguous"
        : "readable";
    const type = pick(EVENT_TYPES);
    const defaultDirection = ["panic_selloff", "bear_trap"].includes(type) ? -1
      : ["squeeze", "recovery_rally", "bull_trap"].includes(type) ? 1
        : state.regime.direction;
    const direction = type === "volatility_burst" || type === "double_reversal"
      ? (marketRandom() < 0.5 ? -1 : 1)
      : defaultDirection;
    const buildupTicks = information === "surprise" ? 4 : Math.round(randomBetween(16, 42));
    const activeTicks = Math.round(randomBetween(20, 58));
    const magnitude = randomBetween(
      information === "surprise" ? 0.018 : 0.035,
      information === "surprise" ? 0.035 : 0.085,
    );
    state.marketEvent = {
      type,
      direction,
      information,
      phase: "buildup",
      buildupTicks,
      activeTicks,
      ticksRemaining: buildupTicks,
      magnitude,
      publicSignalIssued: false,
    };
  }

  function stepMarketEvent() {
    const event = state.marketEvent;
    if (!event) return 0;
    if (event.phase === "buildup") {
      if (!event.publicSignalIssued && event.information !== "surprise") {
        event.publicSignalIssued = true;
        const reliability = lerp(0.84, 0.68, lobbyDifficulty);
        if (event.information === "readable") {
          publishObservation("directional", event.direction, reliability, event.magnitude / 0.085, event.ticksRemaining * TICK_MS);
        } else {
          publishObservation("volatility", 0, 1, event.magnitude / 0.085, event.ticksRemaining * TICK_MS);
        }
      }
      event.ticksRemaining -= 1;
      if (event.ticksRemaining <= 0) {
        event.phase = "active";
        event.ticksRemaining = event.activeTicks;
      }
      const buildupDirection = ["bull_trap", "bear_trap", "false_breakout"].includes(event.type)
        ? event.direction
        : event.direction * 0.35;
      return buildupDirection * event.magnitude / Math.max(1, event.buildupTicks) * 0.18;
    }
    const activeProgress = 1 - event.ticksRemaining / event.activeTicks;
    let direction = event.direction;
    if (["bull_trap", "bear_trap", "false_breakout"].includes(event.type)) direction *= -1;
    if (event.type === "double_reversal" && activeProgress > 0.5) direction *= -1;
    const envelope = Math.sin(Math.PI * clamp(activeProgress, 0.05, 0.95));
    const delta = direction * event.magnitude / event.activeTicks * (0.55 + envelope * 0.8);
    event.ticksRemaining -= 1;
    if (event.ticksRemaining <= 0) {
      state.marketEvent = null;
      state.nextEventIn = Math.round(randomBetween(
        MARKET_BALANCE.eventGapMinTicks,
        MARKET_BALANCE.eventGapMaxTicks,
      ));
    }
    return delta;
  }

  function regimeEnvelope(progress) {
    if (progress < 0.18) return lerp(0.45, 0.78, progress / 0.18);
    if (progress < 0.68) return lerp(0.78, 1, (progress - 0.18) / 0.5);
    return lerp(1, 0.28, (progress - 0.68) / 0.32);
  }

  function previewPriceChange() {
    const g = gaussianRandom();
    state.noiseMomentum = state.noiseMomentum * PREVIEW_MOMENTUM_RETENTION +
      g * Math.sqrt(1 - PREVIEW_MOMENTUM_RETENTION ** 2);
    return state.noiseMomentum * 0.0045 + Math.sin(state.history.length / 15) * 0.0008;
  }

  function stepPrice() {
    if (!state.marketOpen) {
      return commitPriceChange(previewPriceChange());
    }
    if (!state.regime || state.regime.ticksRemaining <= 0) transitionRegime();
    const regime = state.regime;
    const progress = 1 - regime.ticksRemaining / regime.totalTicks;
    maybePublishRegimeObservation(progress);
    state.nextEventIn -= 1;
    if (!state.marketEvent && state.nextEventIn <= 0) startMarketEvent();

    const g = gaussianRandom();
    const noiseMultiplier = lerp(0.85, 1.12, lobbyDifficulty);
    state.noiseMomentum = state.noiseMomentum * regime.momentumRetention +
      g * Math.sqrt(1 - regime.momentumRetention ** 2);
    const maturityEnvelope = regimeEnvelope(progress);
    const directionalDrift = regime.direction * regime.drift *
      (regime.opening && openingPhaseActive()
        ? Math.max(0.78, maturityEnvelope)
        : maturityEnvelope);
    const longTermGrowth = isZenMode
      ? MARKET_BALANCE.zenLongTermGrowthPerTick
      : 0;
    if (isZenMode) state.fairValue *= 1 + longTermGrowth;
    const meanReversion = isZenMode
      ? ((state.fairValue - state.price) / state.price) *
        MARKET_BALANCE.zenFairValueReversion
      : ((START_PRICE - state.price) / state.price) *
        MARKET_BALANCE.battleMeanReversion;
    const pctChange = directionalDrift +
      state.noiseMomentum * regime.volatility * noiseMultiplier +
      stepMarketEvent() + longTermGrowth + meanReversion;
    regime.ticksRemaining -= 1;
    const prevPrice = commitPriceChange(pctChange);
    if (openingPhaseActive()) {
      state.openingTicksElapsed += 1;
      maybeInterveneInFlatOpening();
    }
    return prevPrice;
  }

  function commitPriceChange(pctChange) {

    const prevPrice = state.price;
    state.price = Math.max(3, state.price * (1 + pctChange));
    state.history.push(state.price);
    if (state.history.length > HISTORY_LEN) {
      state.history.shift();
      bots.forEach((bot) => {
        if (bot.holding || bot.markerBusted) bot.entryIndex -= 1;
      });
      state.tradeMarkers.forEach((marker) => {
        marker.index -= 1;
      });
      state.tradeMarkers = state.tradeMarkers.filter(
        (marker) => marker.index >= 0,
      );
    }

    return prevPrice;
  }

  // ---------- CENTER PNL CALLOUT ----------
  function showPnlCallout(amount, isBig, detail = "") {
    pnlCalloutText.textContent =
      (amount >= 0 ? "+" : "") + fmtMoney(amount);
    pnlCalloutText.style.color =
      amount >= 0
        ? isBig
          ? "var(--gold)"
          : "var(--green)"
        : "var(--red)";
    pnlCalloutText.classList.remove("show");
    pnlCalloutDetail.classList.remove("show");
    void pnlCalloutText.offsetWidth;
    pnlCalloutText.classList.add("show");
    pnlCalloutDetail.textContent = detail;
    pnlCalloutDetail.classList.add("show");
  }

  function showLossWarning(penalty = 1, label = "LOSING TRADE") {
    const remaining = Math.max(0, MAX_LOSSES - state.losses);
    lossWarningLabel.textContent =
      penalty > 1 ? `${label} • +${penalty} LOSSES` : label;
    lossesRemaining.textContent =
      remaining === 1 ? "1 LOSS LEFT" : `${remaining} LOSSES LEFT`;
    Array.from(strikePips.children).forEach((pip, index) => {
      pip.classList.toggle("spent", index < state.losses);
    });
    lossWarning.classList.remove("show");
    void lossWarning.offsetWidth;
    lossWarning.classList.add("show");
    root.classList.add("loss-impact");
    later(() => root.classList.remove("loss-impact"), 520);
    later(() => lossWarning.classList.remove("show"), 2500);
    beep(135, 0.2, "sawtooth");
    later(() => beep(105, 0.26, "sine"), 120);
  }

  const CONFETTI_COLORS = ["#17d67f", "#f4b740", "#6fd7e8", "#ffffff"];

  function burstConfetti(count = 18, epic = false) {
    for (let i = 0; i < count; i += 1) {
      const piece = document.createElement("div");
      piece.className =
        "confetti-piece" + (epic ? " victory-confetti" : "");
      const angle = Math.random() * Math.PI * 2;
      const dist = epic
        ? 130 + Math.random() * 380
        : 60 + Math.random() * 110;
      piece.style.setProperty("--cx", Math.cos(angle) * dist + "px");
      piece.style.setProperty(
        "--cy",
        Math.sin(angle) * dist - 20 + "px",
      );
      piece.style.background =
        CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      piece.style.animationDelay = Math.random() * 0.08 + "s";
      chartWrap.appendChild(piece);
      later(() => piece.remove(), 1100);
    }
  }

  function triggerVictoryAnimation() {
    root.classList.add("victory-mode");
    modalBackdrop.classList.add("victory");
    burstConfetti(90, true);
    later(() => burstConfetti(65, true), 320);
    later(() => burstConfetti(45, true), 680);
    [
      [523, 0],
      [659, 110],
      [784, 220],
      [1047, 350],
    ].forEach(([frequency, delay]) => {
      later(() => beep(frequency, 0.18, "triangle"), delay);
    });
    later(() => root.classList.remove("victory-mode"), 3200);
  }

  function playWinnerCinematic(winner, detail, secondPlaceFinish, onComplete) {
    const token = ++revealToken;
    matchReveal.className = "match-reveal";
    cinematicWinnerAvatar.textContent = winner.initials;
    cinematicWinnerName.textContent = `${winner.name} WINS`;
    cinematicWinnerDetail.textContent = detail;
    cinematicSecondPenalty.textContent = secondPlaceFinish
      ? "YOU PLACED SECOND • −$10,000 • −40 ELO MINIMUM"
      : "";
    winnerCinematic.style.setProperty("--winner-color", winner.color);
    winnerCinematic.className =
      "winner-cinematic" + (secondPlaceFinish ? " second-place" : "");
    root.classList.add("winner-cinematic-active");
    void winnerCinematic.offsetWidth;
    winnerCinematic.classList.add("show");
    beep(92, 0.34, "sine");
    later(() => {
      if (token !== revealToken) return;
      winnerCinematic.classList.add("launch");
      beep(310, 0.28, "sawtooth");
    }, 620);
    later(() => {
      if (token !== revealToken) return;
      winnerCinematic.classList.add("announce");
      beep(secondPlaceFinish ? 165 : 760, 0.3, "triangle");
    }, 1450);
    later(() => {
      if (token !== revealToken) return;
      winnerCinematic.classList.add("exit");
    }, 2750);
    later(() => {
      if (token !== revealToken) return;
      winnerCinematic.className = "winner-cinematic";
      root.classList.remove("winner-cinematic-active");
      onComplete?.();
    }, 3200);
  }

  // ---------- FLOATING POPUPS ----------
  let popups = [];

  function drawCanvasBotMarkers() {
    const hist = state.history;
    const n = hist.length;
    if (n < 2) return;
    const min = chartViewMin ?? Math.min(...hist);
    const max = chartViewMax ?? Math.max(...hist);
    const plotW = viewportWidth - 16;
    const plotH = viewportHeight - 40;
    const now = performance.now();
    const radius = 9.5;
    const visibleBotIds = new Set(
      bots
        .filter((bot) => bot.holding && !bot.eliminated)
        .sort((a, b) => b.entryIndex - a.entryIndex)
        .slice(0, 32)
        .map((bot) => bot.id),
    );

    bots.forEach((bot, index) => {
      const busted = bot.markerBusted;
      if (
        (!bot.holding && !busted) ||
        (bot.holding && !visibleBotIds.has(bot.id)) ||
        (bot.eliminated && !busted) ||
        bot.entryIndex < 0
      ) return;

      const x = Math.max(
        22,
        Math.min(viewportWidth - 22, 8 + (bot.entryIndex / (n - 1)) * plotW),
      );
      const baseY = 20 + (1 - (bot.entryPrice - min) / (max - min)) * plotH;
      const y = Math.max(
        18,
        Math.min(viewportHeight - 48, baseY + ((index % 7) - 3) * 2),
      );
      const pnlPct = (state.price - bot.entryPrice) / bot.entryPrice;
      const intensity = Math.max(0, Math.min(1, Math.abs(pnlPct) / 0.08));
      const color = busted ? "#89919d" : pnlPct >= 0 ? "#17d67f" : "#ff4d5e";
      const timer = busted
        ? 1
        : Math.max(0, Math.min(1, (bot.autoSellAt - now) / tradeWindowMs()));
      const bustedLife = busted
        ? Math.max(0, 1 - (now - bot.eliminatedAt) / 2600)
        : 1;

      fxCtx.save();
      fxCtx.globalAlpha = busted ? bustedLife * 0.72 : 1;
      fxCtx.translate(x, y);
      fxCtx.shadowColor = color;
      fxCtx.shadowBlur = busted ? 4 : 4 + intensity * 13;
      fxCtx.lineWidth = 2.5;
      fxCtx.strokeStyle = "rgba(255,255,255,.12)";
      fxCtx.beginPath();
      fxCtx.arc(0, 0, radius - 1.25, 0, Math.PI * 2);
      fxCtx.stroke();
      fxCtx.strokeStyle = color;
      fxCtx.beginPath();
      fxCtx.arc(
        0,
        0,
        radius - 1.25,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * timer,
      );
      fxCtx.stroke();
      fxCtx.shadowBlur = 0;
      fxCtx.fillStyle = "#111820";
      fxCtx.beginPath();
      fxCtx.arc(0, 0, radius - 3, 0, Math.PI * 2);
      fxCtx.fill();
      fxCtx.fillStyle = hexToRgba(color, busted ? 0.45 : 0.18 + intensity * 0.7);
      fxCtx.fill();
      fxCtx.fillStyle = "#fff";
      fxCtx.font = `${busted ? 800 : 700} ${busted ? 13 : 6}px JetBrains Mono, monospace`;
      fxCtx.textAlign = "center";
      fxCtx.textBaseline = "middle";
      fxCtx.fillText(busted ? "×" : bot.initials, 0, busted ? -0.5 : 0);
      fxCtx.restore();
    });
  }

  function drawFxLayer() {
    if (
      !compactRender &&
      popups.length === 0 &&
      state.tradeMarkers.length === 0
    ) {
      if (fxWasActive) fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
      fxWasActive = false;
      return;
    }
    fxWasActive = true;
    fxCtx.clearRect(0, 0, viewportWidth, viewportHeight);
    if (compactRender) drawCanvasBotMarkers();
    drawPlayerTradeMarkerOverlay();
    popups.forEach((popup) => {
      popup.y -= 0.6;
      popup.life -= 0.014;
      fxCtx.save();
      fxCtx.globalAlpha = Math.max(popup.life, 0);
      fxCtx.font = "800 26px Inter, sans-serif";
      fxCtx.fillStyle = popup.color;
      fxCtx.textAlign = "center";
      fxCtx.shadowColor = popup.color;
      fxCtx.shadowBlur = 14;
      fxCtx.fillText(popup.text, popup.x, popup.y);
      fxCtx.restore();
    });
    popups = popups.filter((popup) => popup.life > 0);
  }

  // ---------- CANVAS SIZING ----------
  function resizeCanvases() {
    const rect = chartWrap.getBoundingClientRect();
    viewportWidth = rect.width;
    viewportHeight = rect.height;
    compactRender = viewportWidth < 600;
    botMarkerLayer.classList.toggle("canvas-mode", compactRender);
    const dpr = Math.max(
      1,
      Math.min(compactRender ? 1.5 : 2, window.devicePixelRatio || 1),
    );
    [chartCanvas, fxCanvas].forEach((canvas) => {
      canvas.width = viewportWidth * dpr;
      canvas.height = viewportHeight * dpr;
      canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  }

  // ---------- CHART DRAW ----------
  function traceSmoothPricePath(context, hist, xAt, yAt, tension) {
    const n = hist.length;
    if (n === 0) return;
    context.moveTo(xAt(0), yAt(hist[0]));
    if (n === 1) return;

    for (let i = 0; i < n - 1; i += 1) {
      const p0 = hist[Math.max(0, i - 1)];
      const p1 = hist[i];
      const p2 = hist[i + 1];
      const p3 = hist[Math.min(n - 1, i + 2)];
      const x1 = xAt(i);
      const x2 = xAt(i + 1);
      const segmentWidth = x2 - x1;
      context.bezierCurveTo(
        x1 + segmentWidth * tension,
        yAt(p1 + (p2 - p0) * tension),
        x2 - segmentWidth * tension,
        yAt(p2 - (p3 - p1) * tension),
        x2,
        yAt(p2),
      );
    }
  }

  function drawChart() {
    const W = viewportWidth;
    const H = viewportHeight;
    const desktopScale =
      W >= 768 ? Math.min(1.55, 1 + (W - 768) / 1800) : 1;
    chartCtx.clearRect(0, 0, W, H);

    const hist = state.history;
    const n = hist.length;
    let min = Math.min(...hist);
    let max = Math.max(...hist);
    let showBustLine = false;
    if (state.holding) {
      min = Math.min(min, state.entryPrice);
      max = Math.max(max, state.entryPrice);
      // Keep the risk boundary visible for the entire trade. Previously it was
      // hidden until price was already well on the way to liquidation.
      showBustLine = true;
      if (showBustLine) min = Math.min(min, state.bustPrice);
    }
    const pad = (max - min) * 0.18 || 1;
    const targetMin = min - pad;
    const targetMax = max + pad;
    if (chartViewMin === null || chartViewMax === null) {
      chartViewMin = targetMin;
      chartViewMax = targetMax;
    } else {
      const expandEase = state.marketOpen ? 0.34 : 0.2;
      const contractEase = state.marketOpen ? 0.085 : 0.045;
      const minEase =
        targetMin < chartViewMin ? expandEase : contractEase;
      const maxEase =
        targetMax > chartViewMax ? expandEase : contractEase;
      chartViewMin += (targetMin - chartViewMin) * minEase;
      chartViewMax += (targetMax - chartViewMax) * maxEase;
    }
    min = chartViewMin;
    max = chartViewMax;

    const padTop = 20;
    const padBottom = 20;
    const padLeft = 8;
    const padRight = 8;
    const plotH = H - padTop - padBottom;
    const plotW = W - padLeft - padRight;

    function xAt(i) {
      const denominator = state.marketOpen
        ? Math.max(1, n - 1)
        : PRESTART_TICKS;
      return padLeft + (i / denominator) * plotW;
    }

    function yAt(price) {
      return padTop + (1 - (price - min) / (max - min)) * plotH;
    }

    chartCtx.strokeStyle = "rgba(255,255,255,0.045)";
    chartCtx.lineWidth = 1;
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i += 1) {
      const y = padTop + (plotH / gridLines) * i;
      chartCtx.beginPath();
      chartCtx.moveTo(0, y);
      chartCtx.lineTo(W, y);
      chartCtx.stroke();
    }

    if (state.holding) {
      const ey = yAt(state.entryPrice);
      chartCtx.save();
      chartCtx.setLineDash([4, 5]);
      chartCtx.strokeStyle = "rgba(244,183,64,0.55)";
      chartCtx.lineWidth = 1.5 * desktopScale;
      chartCtx.beginPath();
      chartCtx.moveTo(0, ey);
      chartCtx.lineTo(W, ey);
      chartCtx.stroke();
      chartCtx.restore();

      chartCtx.font =
        `600 ${Math.round(10 * desktopScale)}px JetBrains Mono, monospace`;
      chartCtx.fillStyle = "rgba(244,183,64,0.8)";
      chartCtx.fillText(
        "ENTRY " + fmtMoney2(state.entryPrice),
        padLeft + 4,
        ey - 5,
      );

      if (showBustLine) {
        const bustPrice = state.bustPrice;
        const by = yAt(bustPrice);
        const inView = by >= padTop && by <= H - padBottom;
        if (inView) {
          chartCtx.save();
          chartCtx.setLineDash([2, 5]);
          chartCtx.strokeStyle = "rgba(255,77,94,0.76)";
          chartCtx.lineWidth = 1.5 * desktopScale;
          chartCtx.beginPath();
          chartCtx.moveTo(0, by);
          chartCtx.lineTo(W, by);
          chartCtx.stroke();
          chartCtx.restore();

          chartCtx.font =
            `700 ${Math.round(10 * desktopScale)}px JetBrains Mono, monospace`;
          chartCtx.fillStyle = "rgba(255,77,94,0.92)";
          chartCtx.fillText(
            "BUST " + fmtMoney2(bustPrice),
            padLeft + 4,
            by - 5,
          );
        }
      }
    }

    let lineColor = "#6fd7e8";
    if (state.holding) {
      lineColor = state.price >= state.entryPrice ? "#17d67f" : "#ff4d5e";
    }

    const grad = chartCtx.createLinearGradient(0, padTop, 0, H);
    grad.addColorStop(0, hexToRgba(lineColor, 0.22));
    grad.addColorStop(1, hexToRgba(lineColor, 0));

    const curveTension = state.marketOpen ? 0.09 : 0.18;
    chartCtx.beginPath();
    traceSmoothPricePath(chartCtx, hist, xAt, yAt, curveTension);
    chartCtx.lineTo(xAt(n - 1), H);
    chartCtx.lineTo(xAt(0), H);
    chartCtx.closePath();
    chartCtx.fillStyle = grad;
    chartCtx.fill();

    chartCtx.beginPath();
    traceSmoothPricePath(chartCtx, hist, xAt, yAt, curveTension);
    chartCtx.strokeStyle = lineColor;
    chartCtx.lineWidth = 2.4 * desktopScale;
    chartCtx.shadowColor = lineColor;
    chartCtx.shadowBlur = 12;
    chartCtx.lineJoin = "round";
    chartCtx.lineCap = "round";
    chartCtx.stroke();
    chartCtx.shadowBlur = 0;

    const lastX = xAt(n - 1);
    const lastY = yAt(hist[n - 1]);
    const pulse = 3 + Math.sin(performance.now() / 200) * 1.5;
    chartCtx.beginPath();
    chartCtx.arc(
      lastX,
      lastY,
      (4 + pulse * 0.4) * desktopScale,
      0,
      Math.PI * 2,
    );
    chartCtx.fillStyle = hexToRgba(lineColor, 0.25);
    chartCtx.fill();
    chartCtx.beginPath();
    chartCtx.arc(lastX, lastY, 4 * desktopScale, 0, Math.PI * 2);
    chartCtx.fillStyle = lineColor;
    chartCtx.shadowColor = lineColor;
    chartCtx.shadowBlur = 10;
    chartCtx.fill();
    chartCtx.shadowBlur = 0;
  }

  function drawPlayerTradeMarkers(context, xAt, yAt, scale = 1) {
    if (!state.tradeMarkers.length) return;
    const visible = state.tradeMarkers.slice(-18);
    const entries = new Map();

    visible.forEach((marker) => {
      if (marker.kind === "entry") entries.set(marker.tradeId, marker);
      if (marker.kind !== "exit") return;
      const entry = entries.get(marker.tradeId) ||
        state.tradeMarkers.find(
          (candidate) =>
            candidate.tradeId === marker.tradeId && candidate.kind === "entry",
        );
      if (!entry || entry.index < 0) return;
      context.save();
      context.setLineDash([3, 5]);
      context.lineWidth = 1;
      context.strokeStyle = marker.pnl >= 0
        ? "rgba(23,214,127,.28)"
        : "rgba(255,77,94,.3)";
      context.beginPath();
      context.moveTo(xAt(entry.index), yAt(entry.price));
      context.lineTo(xAt(marker.index), yAt(marker.price));
      context.stroke();
      context.restore();
    });

    visible.forEach((marker) => {
      if (marker.index < 0 || marker.index >= state.history.length) return;
      const x = xAt(marker.index);
      const y = yAt(marker.price);
      const isEntry = marker.kind === "entry";
      const color = isEntry
        ? "#f4b740"
        : marker.pnl >= 0
          ? "#17d67f"
          : "#ff4d5e";
      const radius = (isEntry ? 6 : 6.5) * scale;
      const stemDirection = isEntry ? 1 : -1;

      context.save();
      context.strokeStyle = color;
      context.lineWidth = 1.5 * scale;
      context.shadowColor = color;
      context.shadowBlur = 8 * scale;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x, y + stemDirection * 14 * scale);
      context.stroke();
      context.fillStyle = "rgba(8,12,17,.94)";
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      context.stroke();
      context.fillStyle = color;
      context.font = `900 ${Math.round(7 * scale)}px JetBrains Mono, monospace`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(isEntry ? "B" : "S", x, y + 0.5);
      context.font = `800 ${Math.round(7 * scale)}px JetBrains Mono, monospace`;
      context.textBaseline = stemDirection > 0 ? "top" : "bottom";
      context.fillText(
        isEntry ? "BUY" : marker.pnl >= 0 ? `+${fmtMoney(marker.pnl)}` : fmtMoney(marker.pnl),
        x,
        y + stemDirection * 17 * scale,
      );
      context.restore();
    });
  }

  function drawPlayerTradeMarkerOverlay() {
    if (!state.tradeMarkers.length || state.history.length < 2) return;
    const historyLength = state.history.length;
    const min = chartViewMin ?? Math.min(...state.history);
    const max = chartViewMax ?? Math.max(...state.history);
    const plotW = viewportWidth - 16;
    const plotH = viewportHeight - 40;
    const xAt = (index) =>
      8 + (index / Math.max(1, historyLength - 1)) * plotW;
    const yAt = (price) =>
      20 + (1 - (price - min) / (max - min)) * plotH;
    const scale = viewportWidth >= 768
      ? Math.min(1.55, 1 + (viewportWidth - 768) / 1800)
      : 1;
    drawPlayerTradeMarkers(fxCtx, xAt, yAt, scale);
  }

  function drawBotMarkers() {
    const W = viewportWidth;
    const H = viewportHeight;
    const hist = state.history;
    const n = hist.length;
    let min = chartViewMin ?? Math.min(...hist);
    let max = chartViewMax ?? Math.max(...hist);

    const padTop = 20;
    const padBottom = 20;
    const padLeft = 8;
    const padRight = 8;
    const plotH = H - padTop - padBottom;
    const plotW = W - padLeft - padRight;

    const now = performance.now();
    const visibleBotIds = new Set(
      bots
        .filter((bot) => bot.holding && !bot.eliminated)
        .sort((a, b) => b.entryIndex - a.entryIndex)
        .slice(0, 54)
        .map((bot) => bot.id),
    );
    bots.forEach((bot, index) => {
      const marker = botMarkers.get(bot.id);
      if (!marker) return;
      const renderState = marker._renderState;
      if (
        (!bot.holding && !bot.markerBusted) ||
        (bot.holding && !visibleBotIds.has(bot.id)) ||
        (bot.eliminated && !bot.markerBusted) ||
        bot.entryIndex < 0
      ) {
        if (renderState.visible) {
          marker.classList.remove("show");
          renderState.visible = false;
        }
        return;
      }

      const x = padLeft + (bot.entryIndex / (n - 1)) * plotW;
      const baseY =
        padTop + (1 - (bot.entryPrice - min) / (max - min)) * plotH;
      const markerLaneOffset = ((index % 7) - 3) * 2;
      const y = Math.max(
        18,
        Math.min(H - 48, baseY + markerLaneOffset),
      );
      const remaining = Math.max(0, bot.autoSellAt - now);
      const timerAngle =
        Math.max(0, Math.min(1, remaining / tradeWindowMs())) * 360;
      const markerX = Math.max(22, Math.min(W - 22, x));
      if (
        !Number.isFinite(renderState.x) ||
        Math.abs(markerX - renderState.x) >= 0.35
      ) {
        renderState.x = markerX;
        marker.style.setProperty("--marker-x", `${markerX.toFixed(1)}px`);
      }
      if (
        !Number.isFinite(renderState.y) ||
        Math.abs(y - renderState.y) >= 0.35
      ) {
        renderState.y = y;
        marker.style.setProperty("--marker-y", `${y.toFixed(1)}px`);
      }
      if (!bot.markerBusted) {
        const pnlPct = (state.price - bot.entryPrice) / bot.entryPrice;
        const pnlIntensity = Math.max(
          0,
          Math.min(1, Math.abs(pnlPct) / 0.08),
        );
        const pnlColor = pnlPct >= 0 ? "#17d67f" : "#ff4d5e";
        // A few stable intensity bands look identical at avatar size and avoid
        // forcing 100 gradients and shadows to repaint for microscopic moves.
        const colorMix = Math.round((18 + pnlIntensity * 70) / 4) * 4;
        const timerStep = Math.round(timerAngle / 4) * 4;
        const glow = Math.round(4 + pnlIntensity * 13);
        if (timerStep !== renderState.timer) {
          renderState.timer = timerStep;
          marker.style.setProperty("--timer-angle", `${timerStep}deg`);
        }
        if (colorMix !== renderState.mix) {
          renderState.mix = colorMix;
          marker.style.setProperty("--pnl-mix", `${colorMix}%`);
        }
        if (glow !== renderState.glow) {
          renderState.glow = glow;
          marker.style.setProperty("--pnl-glow", `${glow}px`);
        }
        const isProfit = pnlPct >= 0;
        if (isProfit !== renderState.profit) {
          renderState.profit = isProfit;
          marker.style.setProperty("--pnl-color", pnlColor);
          marker.classList.toggle("profit", isProfit);
          marker.classList.toggle("loss", !isProfit);
        }
      }
      if (!renderState.visible) {
        marker.classList.add("show");
        renderState.visible = true;
      }
    });
  }

  function hexToRgba(hex, alpha) {
    const color = hex.replace("#", "");
    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // ---------- DANGER VIGNETTE ----------
  function updateDanger() {
    if (!state.holding || state.shares <= 0) {
      dangerVignette.style.opacity = 0;
      dangerVignette.classList.remove("pulse");
      return;
    }
    const bustPrice = state.bustPrice;
    const zoneTop =
      bustPrice + (state.entryPrice - bustPrice) * 0.55;
    if (state.price >= zoneTop) {
      dangerVignette.style.opacity = 0;
      dangerVignette.classList.remove("pulse");
      return;
    }
    const proximity = Math.max(
      0,
      Math.min(1, (zoneTop - state.price) / (zoneTop - bustPrice)),
    );
    dangerVignette.style.setProperty(
      "--danger-opacity",
      (proximity * 0.55).toFixed(2),
    );
    dangerVignette.style.opacity = 1;
    if (proximity > 0.55) dangerVignette.classList.add("pulse");
    else dangerVignette.classList.remove("pulse");
    if (proximity > 0.75 && Math.random() < 0.025) {
      beep(85, 0.18, "sine");
    }
  }

  // ---------- UI UPDATE ----------
  function updateMarketHud() {
    const now = performance.now();
    if (state.publicObservation && now >= state.publicObservation.expiresAt) {
      state.publicObservation = null;
      marketObservation.className = "market-observation";
    }
    if (!state.publicObservation) marketObservation.className = "market-observation";
    const remaining = Math.max(
      0,
      MARKET_BALANCE.qualificationTrades - state.legitimateTrades,
    );
    qualificationStatus.classList.toggle("qualified", state.qualified);
    qualificationValue.textContent = state.qualified ? "ACTIVE" : remaining;
    qualificationStatus.querySelector("span").textContent = state.qualified
      ? "QUALIFIED"
      : "TO QUALIFY";

    state.recentEntries = state.recentEntries.filter((entry) => now - entry.at < 3000);
    state.recentLiquidations = state.recentLiquidations.filter((at) => now - at < 4000);
    const exposedBots = bots.filter((bot) => bot.holding && !bot.eliminated);
    const exposed = exposedBots.length + (state.holding ? 1 : 0);
    const underwater = exposedBots.filter((bot) => state.price < bot.entryPrice).length +
      (state.holding && state.price < state.entryPrice ? 1 : 0);
    crowdExposed.textContent = exposed;
    crowdRecent.textContent = state.recentEntries.length;
    crowdUnderwater.textContent = underwater;
  }

  function updateUI(prevPrice) {
    const equity = liveBalance();
    const settled = settledBalance();
    const matchPnl = equity - START_CASH;
    state.lowestBalance = Math.min(state.lowestBalance, equity);
    state.peakBalance = Math.max(state.peakBalance, equity);

    equityVal.textContent = fmtMoney2(equity);
    equityVal.className =
      "v " +
      (equity >= START_CASH
        ? "up"
        : equity < START_CASH
          ? "down"
          : "");
    tradesVal.textContent = state.trades;
    winsVal.textContent = state.wins;
    strikesVal.textContent = state.losses + " / " + MAX_LOSSES;
    strikesVal.className = "v " + (state.losses > 0 ? "down" : "");

    goalValue.textContent = fmtMoney2(currentGoal());

    livePnlValue.textContent =
      `${matchPnl >= 0 ? "+" : ""}${fmtMoney2(matchPnl)}`;
    livePnlCard.className =
      "header-pnl-card " + (matchPnl > 0 ? "up" : matchPnl < 0 ? "down" : "flat");
    livePnlPulse.textContent = state.holding
      ? "IN TRADE"
      : state.idleLost > 0 && performance.now() - state.lastTradeAt > idleGraceMs()
        ? "IDLE LOSS"
        : "LIVE";

    const progress = Math.max(
      0,
      Math.min(
        1,
        (settled - START_CASH) / (currentGoal() - START_CASH),
      ),
    );
    progressBar.style.width = progress * 100 + "%";

    priceVal.textContent = fmtMoney2(state.price);
    const delta = ((state.price - prevPrice) / prevPrice) * 100;
    priceDelta.textContent =
      (delta >= 0 ? "+" : "") + delta.toFixed(2) + "%";
    priceDelta.style.color =
      delta >= 0 ? "var(--green)" : "var(--red)";

    if (state.holding) {
      const pnl = (state.price - state.entryPrice) * state.shares;
      const pnlPct =
        ((state.price - state.entryPrice) / state.entryPrice) * 100;
      const pnlRatio = pnlPct / 100;
      state.tradeMinPnlPct = Math.min(state.tradeMinPnlPct, pnlRatio);
      state.tradePeakPnl = Math.max(state.tradePeakPnl, pnl);
      if (pnl < 0) {
        if (!state.tradeRedSince) state.tradeRedSince = performance.now();
        if (performance.now() - state.tradeRedSince >= 3000) {
          state.tradeRedForThreeSeconds = true;
        }
      }
      positionTag.innerHTML = `<b>${state.shares.toFixed(2)} sh</b> @ ${fmtMoney2(state.entryPrice)} &nbsp;•&nbsp; profit <b style="color:${pnl >= 0 ? "var(--green)" : "var(--red)"}">${pnl >= 0 ? "+" : ""}${fmtMoney2(pnl)} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%)</b>`;
      positionTag.classList.add("show");

      if (isZenMode) {
        tradeTimer.classList.remove("show");
      } else {
        const remaining = Math.max(
          0,
          state.autoSellAt - performance.now(),
        );
        const remainingPct = Math.max(
          0,
          Math.min(1, remaining / tradeWindowMs()),
        );
        autoSellText.textContent =
          "AUTO-SELL " + (remaining / 1000).toFixed(1) + "s";
        tradeTimerFill.style.width = remainingPct * 100 + "%";
        tradeTimerFill.style.background =
          remaining <= 2000
            ? "var(--red)"
            : remaining <= 3500
              ? "var(--gold)"
              : "var(--green)";
        tradeTimer.classList.add("show");
      }
    } else {
      positionTag.classList.remove("show");
      tradeTimer.classList.remove("show");
    }

    if (state.streak >= 2) {
      streakVal.innerHTML = `🔥 x${state.streak}`;
      streakVal.className = "v streak-fire";
    } else {
      streakVal.textContent = "—";
      streakVal.className = "v";
    }

    buyBtn.disabled =
      !state.marketOpen ||
      state.holding ||
      state.gameOver ||
      state.eliminated;
    sellBtn.disabled =
      !state.marketOpen ||
      !state.holding ||
      state.gameOver ||
      state.eliminated;

    clockEl.textContent = fmtTime(matchRemaining());

    checkProgressAchievements(settled, equity);
    updateLobbyStrip();
    updateMarketHud();
    updateIdleWarning();
    updateMarketCountdown();
    updateSpectatorHud();
    if (modalBackdrop.classList.contains("show")) updateRewardPanel();
  }

  // ---------- BOT TRADERS ----------
  function recentTrend(lookback = 10) {
    const history = state.history;
    const start = history[Math.max(0, history.length - 1 - lookback)];
    return (state.price - start) / start;
  }

  function scheduleBotDecision(bot) {
    const skill = clamp((bot.rating - 700) / 1500, 0, 1);
    bot.nextDecisionAt =
      performance.now() + (lerp(850, 420, skill) + Math.random() * lerp(1500, 850, skill)) * bot.pace;
  }

  function botShouldBuy(bot) {
    const trend = recentTrend();
    const skill = clamp((bot.rating - 700) / 1500, 0, 1);
    const observation = state.publicObservation?.expiresAt > performance.now()
      ? state.publicObservation
      : null;
    const exposed = bots.filter((candidate) => candidate.holding && !candidate.eliminated).length;
    const crowdRisk = exposed / PLAYER_COUNT;
    const lateTrend = Math.abs(recentTrend(30)) > 0.025;
    if (skill > 0.45 && observation?.direction < 0) return false;
    if (skill > 0.6 && crowdRisk > 0.58 && lateTrend) return false;
    if (bot.strategy === "momentum") {
      return trend > lerp(0.0035, 0.0018, skill) ||
        Math.random() < lerp(0.2, 0.07, skill);
    }
    if (bot.strategy === "signal") {
      return Boolean(observation?.direction > 0 &&
        (trend > -0.003 || skill < 0.45)) || Math.random() < lerp(0.22, 0.06, skill);
    }
    if (bot.strategy === "aggressive") {
      return Math.random() < lerp(0.7, 0.42, skill);
    }
    if (bot.strategy === "dip") {
      return (trend < -0.004 && observation?.direction >= 0) ||
        Math.random() < lerp(0.25, 0.08, skill);
    }
    return (
      Math.abs(trend) < 0.008 && crowdRisk < 0.5 &&
      Math.random() < lerp(0.28, 0.12, skill)
    );
  }

  function botShouldSell(bot) {
    const skill = clamp((bot.rating - 700) / 1500, 0, 1);
    const heldFor = performance.now() - bot.tradeEnteredAt;
    if (heldFor < MARKET_BALANCE.legitimateHoldMs) return false;
    const pnlPct = (state.price - bot.entryPrice) / bot.entryPrice;
    const shortTrend = recentTrend(8);
    const observation = state.publicObservation?.expiresAt > performance.now()
      ? state.publicObservation
      : null;
    if (skill > 0.4 && observation?.direction < 0 && shortTrend < 0) return true;
    if (pnlPct > lerp(0.022, 0.012, skill) && shortTrend < 0) return true;
    if (skill > 0.58 && pnlPct < -0.02 && shortTrend < -0.004) return true;
    return false;
  }

  function botBuy(bot) {
    if (bot.eliminated || bot.holding || bot.cash <= 0) return;
    bot.entryValue = bot.cash;
    bot.shares = bot.entryValue / state.price;
    bot.entryPrice = state.price;
    bot.entryIndex = state.history.length - 1;
    bot.bustPrice = calculateBustPrice(bot.entryPrice, bot.shares);
    bot.autoSellAt = performance.now() + tradeWindowMs();
    bot.cash = 0;
    bot.holding = true;
    bot.trades += 1;
    bot.tradeEnteredAt = performance.now();
    state.recentEntries.push({ at: bot.tradeEnteredAt, id: bot.id });
  }

  function eliminateBot(bot, reason) {
    if (bot.eliminated) return;
    const marker = botMarkers.get(bot.id);
    if (bot.holding) {
      if (performance.now() - bot.tradeEnteredAt >= MARKET_BALANCE.legitimateHoldMs) {
        bot.legitimateTrades += 1;
        bot.qualified = bot.legitimateTrades >= MARKET_BALANCE.qualificationTrades;
      }
      bot.cash = bot.shares * state.price;
      bot.shares = 0;
      bot.holding = false;
    }
    bot.eliminated = true;
    bot.eliminatedAt = performance.now();
    bot.eliminationReason = reason;
    bot.markerBusted = true;
    if (marker) {
      marker.style.setProperty("--pnl-color", "#89919d");
      marker.style.setProperty("--pnl-mix", "54%");
      marker.style.setProperty("--timer-angle", "360deg");
      marker.style.filter = "grayscale(1) drop-shadow(0 0 6px #89919d)";
      marker.querySelector(".bot-marker-avatar").textContent = "×";
      marker.querySelector(".bot-marker-name").textContent = `${bot.name} OUT`;
      marker.classList.remove("profit", "loss");
      marker.classList.add("show", "busted");
      later(() => {
        bot.markerBusted = false;
        marker.classList.remove("show", "busted");
      }, 2600);
    }
    queueBotElimination(bot, reason);
    checkLastStanding();
  }

  function botSell(bot) {
    if (!bot.holding || bot.eliminated) return;
    const proceeds = bot.shares * state.price;
    const rawPnl = proceeds - bot.entryValue;
    bot.shares = 0;
    bot.holding = false;
    bot.autoSellAt = 0;
    bot.bustPrice = 0;
    bot.cash = proceeds;
    const closedAt = performance.now();
    if (closedAt - bot.tradeEnteredAt >= MARKET_BALANCE.legitimateHoldMs) {
      bot.legitimateTrades += 1;
      bot.qualified = bot.legitimateTrades >= MARKET_BALANCE.qualificationTrades;
      bot.lastTradeAt = closedAt;
    }

    if (rawPnl > 0) {
      bot.wins += 1;
      bot.streak += 1;
      pushActivity(
        `${bot.name} +${fmtMoney(rawPnl)}`,
        "profit",
      );
    } else if (rawPnl < 0) {
      bot.losses += 1;
      bot.streak = 0;
    }

    botMarkers.get(bot.id)?.classList.remove("show");

    if (bot.losses >= MAX_LOSSES) {
      eliminateBot(bot, "strikes");
      return;
    }
    if (bot.cash <= ACCOUNT_FLOOR) {
      eliminateBot(bot, "floor");
      return;
    }
    if (bot.cash >= currentGoal()) {
      endMatch(bot.id, "profit-target");
      return;
    }
    scheduleBotDecision(bot);
  }

  function updateBots() {
    const now = performance.now();
    bots.forEach((bot) => {
      if (bot.eliminated || state.gameOver) return;
      if (bot.holding) {
        if (state.price <= bot.bustPrice) {
          eliminateBot(bot, "knockout");
        } else if (botShouldSell(bot) || now >= bot.autoSellAt) {
          botSell(bot);
        }
      } else if (now >= bot.nextDecisionAt) {
        if (botShouldBuy(bot)) botBuy(bot);
        else scheduleBotDecision(bot);
      }
    });
  }

  // ---------- GAME ACTIONS ----------
  function tradeFeedback(rawPnl) {
    const segment = state.history.slice(Math.max(0, state.tradeStartIndex));
    const high = Math.max(state.entryPrice, ...segment);
    const low = Math.min(state.entryPrice, ...segment);
    const available = Math.max(0.0001, high - state.entryPrice);
    const captured = clamp((state.price - state.entryPrice) / available, 0, 1);
    const range = Math.max(0.0001, high - low);
    const entryScore = clamp(1 - (state.entryPrice - low) / range, 0, 1);
    const entryGrade = entryScore > 0.82 ? "A" : entryScore > 0.65 ? "B+" : entryScore > 0.45 ? "B" : "C";
    let label = rawPnl > 0 && captured >= 0.78 ? "CLEAN EXIT" : "";
    if (!label && state.tradeEnteredDuringSurprise && rawPnl < 0) label = "UNLUCKY SHOCK";
    if (!label && state.tradeEntryRegime === "exhaustion") label = "BOUGHT INTO EXHAUSTION";
    if (!label && state.tradePeakPnl > 150 && rawPnl < 0) label = "HELD THROUGH REVERSAL";
    if (!label && rawPnl > 0 && captured < 0.38) label = "EARLY EXIT";
    const metric = rawPnl > 0
      ? `ENTRY ${entryGrade} • CAPTURED ${Math.round(captured * 100)}%`
      : `ENTRY ${entryGrade}`;
    return label ? `${metric} • ${label}` : metric;
  }

  function doBuy() {
    if (
      state.holding ||
      !state.marketOpen ||
      state.gameOver ||
      state.eliminated ||
      state.cash <= 0
    )
      return;
    state.entryValue = state.cash;
    state.shares = state.entryValue / state.price;
    state.entryPrice = state.price;
    state.bustPrice = calculateBustPrice(state.entryPrice, state.shares);
    state.autoSellAt = isZenMode
      ? Number.POSITIVE_INFINITY
      : performance.now() + tradeWindowMs();
    state.cash = 0;
    state.holding = true;
    state.trades += 1;
    state.tradeEnteredAt = performance.now();
    state.tradeStartIndex = state.history.length - 1;
    state.tradeEntryRegime = state.regime?.type || null;
    state.tradeEntryObservation = state.publicObservation;
    state.tradeEnteredDuringSurprise = state.marketEvent?.information === "surprise";
    state.recentEntries.push({ at: state.tradeEnteredAt, id: "player" });
    state.boughtOnSignal = Boolean(
      state.publicObservation &&
      state.publicObservation.expiresAt > performance.now() &&
      state.publicObservation.direction > 0,
    );
    state.tradeRedSince = 0;
    state.tradeRedForThreeSeconds = false;
    state.tradeMinPnlPct = 0;
    state.tradePeakPnl = 0;
    const tradeId = state.nextTradeMarkerId;
    state.nextTradeMarkerId += 1;
    state.activeTradeMarkerId = tradeId;
    state.tradeMarkers.push({
      tradeId,
      kind: "entry",
      index: state.history.length - 1,
      price: state.price,
    });
    flash("green");
    playSfx("buy");
  }

  function doSell(reason) {
    if (!state.holding || state.gameOver || state.eliminated) return;
    const proceeds = state.shares * state.price;
    const rawPnl = proceeds - state.entryValue;
    const wasOnSignal = state.boughtOnSignal;
    const recoveredAfterThreeSeconds = state.tradeRedForThreeSeconds;
    const tradeMinPnlPct = state.tradeMinPnlPct;
    const tradePeakPnl = state.tradePeakPnl;
    const heldFor = performance.now() - state.tradeEnteredAt;
    const feedback = tradeFeedback(rawPnl);
    if (state.activeTradeMarkerId !== null) {
      state.tradeMarkers.push({
        tradeId: state.activeTradeMarkerId,
        kind: "exit",
        index: state.history.length - 1,
        price: state.price,
        pnl: rawPnl,
        reason,
      });
      state.activeTradeMarkerId = null;
    }
    state.shares = 0;
    state.holding = false;
    state.boughtOnSignal = false;
    state.autoSellAt = 0;
    state.bustPrice = 0;
    if (heldFor >= MARKET_BALANCE.legitimateHoldMs) {
      state.legitimateTrades += 1;
      state.qualified = state.legitimateTrades >= MARKET_BALANCE.qualificationTrades;
      state.lastTradeAt = performance.now();
      state.idleLost = 0;
    }

    if (rawPnl > 0) {
      state.wins += 1;
      state.streak += 1;
      state.cash = proceeds;
      flash("green");
      playSfx("profit");
      pushActivity(`YOU +${fmtMoney(rawPnl)}`, "profit");
    } else if (rawPnl < 0) {
      state.losses += 1;
      state.streak = 0;
      state.cash = proceeds;
      flash("red");
      playSfx("loss");
      showLossWarning();
    } else {
      state.cash = proceeds;
    }

    const isBig = Math.abs(rawPnl) >= 500;
    showPnlCallout(rawPnl, isBig, feedback);
    if (rawPnl > 0 && isBig) {
      burstConfetti();
    }
    if (state.wins === 1) {
      unlock(
        "firstProfit",
        "💰",
        "First Profit",
        "You closed your first winning trade.",
      );
    }
    if (state.streak === 3) {
      unlock(
        "streak3",
        "🔥",
        "Heating Up",
        "3 winning trades in a row.",
      );
    }
    if (state.streak >= 5) {
      unlock(
        "streak5",
        "🌋",
        "On Fire!",
        "5+ winning trades in a row.",
      );
    }
    if (rawPnl >= 1000) {
      unlock(
        "bigWin",
        "💎",
        "Big Win",
        "Closed a single trade worth $1,000+.",
      );
    }
    if (wasOnSignal && rawPnl > 0) {
      unlock(
        "signalReader",
        "📡",
        "Signal Reader",
        "Bought right on a breaking headline and profited.",
      );
    }
    if (recoveredAfterThreeSeconds && rawPnl > 0) {
      unlock(
        "redToGreen",
        "🛟",
        "Red to Green",
        "Spent 3 seconds in loss, then closed in profit.",
        250,
      );
    }
    if (tradeMinPnlPct <= -0.05 && rawPnl > 0) {
      unlock(
        "deepRecovery",
        "🪽",
        "Deep Recovery",
        "Recovered a 5% trade drawdown into profit.",
        300,
      );
    }
    if (rawPnl >= 200 && tradePeakPnl > 0 && rawPnl >= tradePeakPnl * 0.9) {
      unlock(
        "cleanExit",
        "🎯",
        "Clean Exit",
        "Closed within 10% of your trade's peak profit.",
        175,
      );
    }

    state.tradeRedSince = 0;
    state.tradeRedForThreeSeconds = false;
    state.tradeMinPnlPct = 0;
    state.tradePeakPnl = 0;

    checkEndConditions();
  }

  function checkEndConditions() {
    if (state.eliminated || state.gameOver) return;
    if (isZenMode) {
      if (state.holding && state.price <= state.bustPrice) {
        doSell("zen-bust");
        return;
      }
      if (!state.holding && state.cash >= currentGoal()) {
        endMatch("player", "profit-target");
      }
      return;
    }
    const equity = liveBalance();
    if (state.holding && state.price <= state.bustPrice) {
      const pnlBeforeLiquidation = equity - START_CASH;
      if (performance.now() - state.tradeEnteredAt >= MARKET_BALANCE.legitimateHoldMs) {
        state.legitimateTrades += 1;
        state.qualified = state.legitimateTrades >= MARKET_BALANCE.qualificationTrades;
      }
      if (state.activeTradeMarkerId !== null) {
        state.tradeMarkers.push({
          tradeId: state.activeTradeMarkerId,
          kind: "exit",
          index: state.history.length - 1,
          price: state.price,
          pnl: state.shares * state.price - state.entryValue,
          reason: "liquidation",
        });
        state.activeTradeMarkerId = null;
      }
      state.cash = Math.max(
        0,
        START_CASH - Math.abs(pnlBeforeLiquidation),
      );
      state.shares = 0;
      state.holding = false;
      state.losses = Math.min(MAX_LOSSES, state.losses + 2);
      showLossWarning(2, "LIQUIDATION PENALTY");
      eliminatePlayer("knockout");
    } else if (!state.holding && state.losses >= MAX_LOSSES) {
      eliminatePlayer("strikes");
    } else if (!state.holding && state.cash >= currentGoal()) {
      endMatch("player", "profit-target");
    } else if (equity <= ACCOUNT_FLOOR) {
      eliminatePlayer("floor");
    }
  }

  function playMatchReveal(
    { eyebrow, title, detail, tone = "bust", duration = 2050 },
    onComplete,
  ) {
    const token = ++revealToken;
    revealEyebrow.textContent = eyebrow;
    revealTitle.textContent = title;
    revealDetail.textContent = detail;
    matchReveal.className =
      "match-reveal" + (tone === "bust" ? "" : ` ${tone}`);
    void matchReveal.offsetWidth;
    matchReveal.classList.add("show");
    beep(tone === "bust" ? 78 : 115, 0.35, "sine");
    later(() => {
      if (token !== revealToken) return;
      matchReveal.classList.add("reveal");
      flash(tone === "win" ? "green" : tone === "bust" ? "red" : "green");
      beep(tone === "bust" ? 155 : 620, 0.22, "sawtooth");
    }, 620);
    later(() => {
      if (token !== revealToken) return;
      matchReveal.classList.remove("show", "reveal");
      onComplete?.();
    }, duration);
  }

  function updateSpectatorHud() {
    if (!state.eliminated || state.gameOver) return;
    const now = performance.now();
    if (now - lastSpectatorHudAt < 200) return;
    lastSpectatorHudAt = now;
    const leader = competitorsForPnl()[0];
    spectatorAlive.textContent = activeCompetitors().length;
    spectatorLeader.textContent = leader?.name || "—";
    spectatorTime.textContent = fmtTime(matchRemaining());
  }

  function showSpectatingMode() {
    if (!state.eliminated || state.gameOver) return;
    modalBackdrop.classList.remove("show");
    spectatorHud.classList.add("show");
    updateSpectatorHud();
  }

  function showSpectatorStandings() {
    if (!state.eliminated || state.gameOver) return;
    spectatorHud.classList.remove("show");
    renderLeaderboard(null);
    modalBackdrop.classList.add("show", "spectating");
  }

  function exitSpectatingMode() {
    if (!state.eliminated || state.gameOver) return;
    spectatorHud.classList.remove("show");
    resetGame();
  }

  function eliminatePlayer(condition) {
    if (state.eliminated || state.gameOver) return;
    state.eliminated = true;
    state.eliminatedAt = performance.now();
    state.eliminationCondition = condition;
    state.finalPlacement = competitorsForLeaderboard(null).findIndex(
      (competitor) => competitor.id === "player",
    ) + 1;
    state.finalPnlPlacement =
      competitorsForPnl().findIndex(
        (competitor) => competitor.id === "player",
      ) + 1;
    state.autoSellAt = 0;
    state.bustPrice = 0;
    pushActivity("YOU ARE OUT", "out");
    applyPlayerRankedResult(
      state.finalPlacement,
      state.finalPnlPlacement,
      condition,
    );

    modalIcon.textContent = "💥";
    resultsKicker.textContent = "MATCH RESULT";
    modalTitle.textContent = "YOU'RE OUT";
    modalTitle.className = "lose";
    modalCondition.textContent = "SPECTATING";
    modalBtn.disabled = false;
    modalBtn.textContent = "PLAY AGAIN";

    if (condition === "strikes") {
      modalDesc.textContent =
        "Six losing trades ended your run. The remaining traders are still live.";
    } else if (condition === "knockout") {
      modalDesc.textContent =
        "Price hit your entry-based bust line. Liquidation added two losses: the losing trade plus one extra penalty.";
    } else {
      modalDesc.textContent =
        "Your balance hit the account floor. The remaining traders are still live.";
    }

    if (state.finalPlacement === 2) {
      modalCondition.textContent = "SECOND PLACE PENALTY";
      modalDesc.textContent =
        "Second is the cruelest finish: −$10,000 from your account and at least −40 ranked ELO.";
    }

    renderLeaderboard(null);
    modalTime.textContent = fmtTime(performance.now() - state.startTime);
    modalBackdrop.classList.remove("victory");
    modalBackdrop.classList.add("spectating");
    modalBackdrop.classList.remove("show");
    spectatorHud.classList.remove("show");
    const revealBalance = liveBalance();
    playMatchReveal(
      {
        eyebrow:
          condition === "knockout"
            ? "BUST LINE BREACHED"
            : condition === "strikes"
              ? "RISK LIMIT REACHED"
              : "ACCOUNT FLOOR BREACHED",
        title: condition === "knockout" ? "LIQUIDATED" : "YOU'RE OUT",
        detail: condition === "knockout"
          ? `+2 LOSSES  •  PLACEMENT #${state.finalPlacement}`
          : `${fmtMoney2(revealBalance)}  •  PLACEMENT #${state.finalPlacement}`,
        tone: "bust",
      },
      () => {
        modalBackdrop.classList.add("show", "spectating");
        animateProgressionResult(state.ratingResult);
      },
    );
    checkLastStanding();
  }

  function applyPlayerRankedResult(
    placement,
    pnlPlacement,
    condition,
  ) {
    if (state.ratingApplied) return state.ratingResult;
    const balance = liveBalance();
    const result = applyRankedResult(
      rankedProfile,
      placement,
      PLAYER_COUNT,
      {
        id: localLobby?.id,
        playedAt: Date.now(),
        balance,
        pnl: balance - START_CASH,
        pnlPlacement,
        trades: state.trades,
        condition,
        ranked: isRankedMatch,
        achievementBonus: state.achievementBonus,
      },
    );
    rankedProfile = {
      username: result.username,
      avatarColor: result.avatarColor,
      rating: result.rating,
      wallet: result.wallet,
      games: result.games,
      bestFinish: result.bestFinish,
      history: result.history,
      medals: result.medals,
    };
    state.ratingApplied = true;
    state.ratingResult = result;
    state.rating = result.rating;
    renderRatingResult();
    options.onProfileUpdated?.({ ...rankedProfile });
    const medalDetails = {
      champion: ["👑", "Champion Medal", "Finished first overall."],
      topTen: ["🏅", "Top Ten Medal", "Placed inside the top ten."],
      pnlKing: ["💰", "profit King", "Finished first on the profit board."],
      survivor: ["🛡️", "Last One Standing", "Outlasted the entire lobby."],
      bigBag: ["💎", "Big Bag Medal", "Finished with $5,000+ profit."],
      activeTrader: ["⚡", "Floor Trader", "Completed 10+ trades."],
    };
    result.earnedMedals.forEach((key) => {
      const [icon, title, description] = medalDetails[key];
      unlock(`medal-${key}`, icon, title, description, 0);
    });
    return result;
  }

  function renderRatingResult() {
    const result = state.ratingResult;
    if (!result) {
      ratingBefore.textContent = rankedProfile.rating;
      if (!isRankedMatch) {
        rankedResult.className = "ranked-result progression-card pending unranked";
        ratingTrend.textContent = "◆";
        ratingDelta.textContent = "UNRANKED";
        ratingAfter.textContent = rankedProfile.rating;
        return;
      }
      const placement =
        state.finalPlacement ||
        competitorsForLeaderboard(null).findIndex(
          (competitor) => competitor.id === "player",
        ) + 1;
      const pnlPlacement =
        competitorsForPnl().findIndex(
          (competitor) => competitor.id === "player",
        ) + 1;
      const projection = rankedDeltaForPerformance({
        rating: rankedProfile.rating,
        placement,
        pnlPlacement,
        trades: state.trades,
        fieldSize: PLAYER_COUNT,
      });
      rankedResult.className =
        "ranked-result progression-card pending " +
        (projection.delta >= 0 ? "gain" : "loss");
      ratingTrend.textContent = "▲";
      ratingDelta.textContent =
        `${projection.delta >= 0 ? "+" : ""}${projection.delta}`;
      ratingAfter.textContent =
        Math.max(0, rankedProfile.rating + projection.delta);
      return;
    }

    if (!result.ranked) {
      rankedResult.className = "ranked-result progression-card unranked settled";
      ratingTrend.textContent = "◆";
      ratingBefore.textContent = result.previousRating;
      ratingDelta.textContent = "PRIVATE";
      ratingAfter.textContent = result.rating;
      updateRewardPanel();
      if (modalBackdrop.classList.contains("show")) {
        animateProgressionResult(result);
      }
      return;
    }

    rankedResult.className =
      "ranked-result progression-card settled " + (result.delta >= 0 ? "gain" : "loss");
    ratingTrend.textContent = "▲";
    ratingBefore.textContent = result.previousRating;
    ratingDelta.textContent =
      (result.delta >= 0 ? "+" : "") + result.delta;
    ratingAfter.textContent = result.rating;
    if (modalBackdrop.classList.contains("show")) updateRewardPanel();
    if (modalBackdrop.classList.contains("show")) {
      animateProgressionResult(result);
    }
  }

  function updateRewardPanel() {
    if (!state || !rewardMode) return;
    const result = state.ratingResult;
    const pnl = result ? result.history[0].pnl : liveBalance() - START_CASH;
    const bonus = result ? result.achievementBonus : state.achievementBonus;
    const placementBonus = result ? result.placementBalanceBonus : 0;
    const walletBefore = result
      ? result.walletBefore
      : Number(rankedProfile.wallet || 0);
    const rawContribution = pnl + bonus + placementBonus;
    const walletTotal = result
      ? result.wallet
      : Math.round(walletBefore + rawContribution);
    const appliedContribution = walletTotal - walletBefore;

    rewardMode.textContent = result
      ? result.ranked
        ? "REWARDS BANKED • RANKED"
        : "REWARDS BANKED • PRIVATE / UNRANKED"
      : isRankedMatch
        ? "LIVE MATCH REWARDS • ELO PENDING"
        : "LIVE MATCH REWARDS • ELO DISABLED";
    rewardWalletAfter.textContent = `${fmtMoney(walletTotal)} ACCOUNT`;
    rewardWalletBefore.textContent = fmtMoney(walletBefore);
    rewardContribution.textContent =
      `${appliedContribution >= 0 ? "+" : ""}${fmtMoney(appliedContribution)}`;
    rewardContribution.className = appliedContribution >= 0 ? "gain" : "loss";
    rewardWalletTotal.textContent = fmtMoney(walletTotal);
    walletProgression.className =
      "progression-card wallet-progression " +
      (appliedContribution > 0 ? "gain" : appliedContribution < 0 ? "loss" : "flat");
    walletTrend.textContent = appliedContribution === 0 ? "◆" : "▲";
    rewardPnl.textContent = `${pnl >= 0 ? "+" : ""}${fmtMoney(pnl)}`;
    rewardPnl.className = pnl >= 0 ? "gain" : "loss";
    rewardBonus.textContent = `+${fmtMoney(bonus)}`;
    rewardPlacement.textContent =
      `${placementBonus > 0 ? "+" : ""}${fmtMoney(placementBonus)}`;
    rewardPlacement.className =
      placementBonus > 0 ? "gain" : placementBonus < 0 ? "loss" : "";
  }

  function animateProgressionResult(result) {
    if (state.rewardAnimationPlayed) return;
    state.rewardAnimationPlayed = true;
    const animationToken = ++progressionAnimationToken;
    rankedResult.classList.remove("elo-impact", "reward-slam");
    walletProgression.classList.remove("reward-slam");
    rewardWalletTotal.classList.remove("digit-tick", "number-land");
    ratingAfter.classList.remove("digit-tick", "number-land");
    const steps = 22;
    for (let step = 0; step <= steps; step += 1) {
      later(() => {
        if (animationToken !== progressionAnimationToken) return;
        const progress = step / steps;
        const eased = 1 - (1 - progress) ** 3;
        const walletValue = Math.round(
          result.walletBefore + (result.wallet - result.walletBefore) * eased,
        );
        rewardWalletAfter.textContent = `${fmtMoney(walletValue)} ACCOUNT`;
        rewardWalletTotal.textContent = fmtMoney(walletValue);
        if (result.ranked) {
          const eloValue = Math.round(
            result.previousRating +
              (result.rating - result.previousRating) * eased,
          );
          ratingAfter.textContent = eloValue;
        }
        if (step === steps) {
          rewardWalletTotal.classList.add("number-land");
          ratingAfter.classList.add("number-land");
          walletProgression.classList.add("reward-slam");
          rankedResult.classList.add("reward-slam");
          beep(result.delta >= 0 ? 880 : 190, 0.2, "triangle");
        }
      }, step * 48);
    }
  }

  function settleProgressionAnimation() {
    progressionAnimationToken += 1;
    const result = state.ratingResult;
    if (!result) return;
    rewardWalletTotal.textContent = fmtMoney(result.wallet);
    rewardWalletAfter.textContent = `${fmtMoney(result.wallet)} ACCOUNT`;
    ratingAfter.textContent = result.rating;
    [rewardWalletTotal, ratingAfter].forEach((number) => {
      number.classList.remove("digit-tick", "number-land");
    });
    rankedResult.classList.remove("elo-impact", "reward-slam");
    walletProgression.classList.remove("reward-slam");
  }

  function activeCompetitors() {
    const active = [];
    if (!state.eliminated) active.push("player");
    bots.forEach((bot) => {
      if (!bot.eliminated) active.push(bot.id);
    });
    return active;
  }

  function checkLastStanding() {
    if (state.gameOver) return;
    const active = activeCompetitors();
    if (active.length === 1) {
      const survivorId = active[0];
      const survivorQualified = survivorId === "player"
        ? state.qualified
        : bots.find((bot) => bot.id === survivorId)?.qualified;
      if (survivorQualified) endMatch(survivorId, "last-standing");
    }
  }

  function finishTimeLimit() {
    if (state.gameOver) return;
    const competitors = competitorsForLeaderboard(null);
    const active = competitors.filter(
      (competitor) => !competitor.eliminated,
    );
    const qualifiedActive = active.filter((competitor) => competitor.qualified);
    const pool = qualifiedActive.length > 0
      ? qualifiedActive
      : active.length > 0 ? active : competitors;
    const winner = pool.reduce((leader, competitor) =>
      competitor.balance > leader.balance ? competitor : leader,
    );
    endMatch(winner.id, "time-limit");
  }

  function competitorsForLeaderboard(winnerId) {
    const competitors = [
      {
        id: "player",
        name: rankedProfile.username,
        initials: "YOU",
        color: rankedProfile.avatarColor,
        rating: rankedProfile.rating,
        history: rankedProfile.history,
        medals: rankedProfile.medals,
        balance: liveBalance(),
        trades: state.trades,
        wins: state.wins,
        losses: state.losses,
        holding: state.holding,
        tradePnl: state.holding
          ? state.shares * state.price - state.entryValue
          : 0,
        eliminated: state.eliminated,
        eliminatedAt: state.eliminatedAt,
        qualified: state.qualified,
      },
      ...bots.map((bot) => ({
        id: bot.id,
        name: bot.name,
        initials: bot.initials,
        color: bot.color,
        rating: bot.rating,
        history: bot.history,
        medals: bot.medals,
        balance: botLiveBalance(bot),
        trades: bot.trades,
        wins: bot.wins,
        losses: bot.losses,
        holding: bot.holding,
        tradePnl: bot.holding
          ? bot.shares * state.price - bot.entryValue
          : 0,
        eliminated: bot.eliminated,
        eliminatedAt: bot.eliminatedAt,
        qualified: bot.qualified,
      })),
    ];

    return competitors.sort((a, b) => {
      if (a.id === winnerId) return -1;
      if (b.id === winnerId) return 1;
      // Participation outranks passive survival: qualified survivors, qualified
      // eliminations, then unqualified survivors and eliminations.
      const group = (competitor) => competitor.qualified
        ? competitor.eliminated ? 1 : 0
        : competitor.eliminated ? 3 : 2;
      if (group(a) !== group(b)) return group(a) - group(b);
      if (a.eliminated && b.eliminated && a.eliminatedAt !== b.eliminatedAt) {
        return b.eliminatedAt - a.eliminatedAt;
      }
      if (b.balance !== a.balance) return b.balance - a.balance;
      return b.wins - a.wins;
    });
  }

  function competitorsForPnl() {
    return competitorsForLeaderboard(null).sort((a, b) => {
      if (b.balance !== a.balance) return b.balance - a.balance;
      if (a.eliminated !== b.eliminated) {
        return a.eliminated ? 1 : -1;
      }
      return b.wins - a.wins;
    });
  }

  function renderLeaderboard(winnerId, mode = leaderboardMode) {
    leaderboardMode = mode;
    placementTab.classList.toggle("active", mode === "placement");
    pnlTab.classList.toggle("active", mode === "pnl");
    const ranked =
      mode === "pnl"
        ? competitorsForPnl()
        : competitorsForLeaderboard(winnerId);
    const previousScroll = leaderboardList.scrollTop;
    leaderboardList.replaceChildren();

    const playerIndex = ranked.findIndex(
      (competitor) => competitor.id === "player",
    );
    const compactResults = window.innerHeight <= 700;
    const leaderCount = compactResults ? 3 : 5;
    const nearbyRadius = compactResults ? 1 : 2;
    const visibleIndexes = new Set();
    for (
      let index = 0;
      index < Math.min(leaderCount, ranked.length);
      index += 1
    ) {
      visibleIndexes.add(index);
    }
    for (
      let index = Math.max(0, playerIndex - nearbyRadius);
      index <=
      Math.min(ranked.length - 1, playerIndex + nearbyRadius);
      index += 1
    ) {
      visibleIndexes.add(index);
    }

    const leaderboardWindow = [...visibleIndexes]
      .sort((a, b) => a - b)
      .reduce((entries, index, position, indexes) => {
        if (position > 0 && index - indexes[position - 1] > 1) {
          entries.push({ gap: true });
        }
        entries.push({ racer: ranked[index], index });
        return entries;
      }, []);

    leaderboardWindow.forEach(({ racer, index, gap }) => {
      if (gap) {
        const gapRow = document.createElement("div");
        gapRow.className = "leaderboard-gap";
        gapRow.textContent = "•••";
        leaderboardList.appendChild(gapRow);
        return;
      }

      const row = document.createElement("div");
      const boardWinner =
        mode === "pnl" ? index === 0 : racer.id === winnerId;
      row.className =
        "leaderboard-row profile-clickable" +
        (racer.id === "player" ? " you" : "") +
        (boardWinner ? " winner" : "");
      row.style.setProperty("--racer-color", racer.color);
      row.title = `View ${racer.name}'s profile`;
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.setAttribute("aria-label", `View ${racer.name}'s profile`);

      const rank = document.createElement("div");
      rank.className = "leaderboard-rank";
      rank.textContent =
        boardWinner ? "🏆" : `#${index + 1}`;

      const avatar = document.createElement("div");
      avatar.className = "leaderboard-avatar";
      avatar.textContent = racer.initials;

      const name = document.createElement("div");
      name.className = "leaderboard-name";
      const nameText = document.createElement("strong");
      nameText.textContent = racer.name;
      const nameRating = document.createElement("span");
      nameRating.textContent =
        `${racer.rating} ELO` +
        (racer.id === "player" ? " • YOU" : "");
      name.append(nameText, nameRating);

      const balance = document.createElement("div");
      balance.className = "leaderboard-balance";
      const racerPnl = racer.balance - START_CASH;
      balance.textContent =
        mode === "pnl"
          ? `${racerPnl >= 0 ? "+" : ""}${fmtMoney2(racerPnl)}`
          : fmtMoney2(racer.balance);

      const status = document.createElement("div");
      const isWinner = boardWinner;
      const isOut = racer.eliminated;
      const isGreen = racer.holding && racer.tradePnl >= 0;
      const isRed = racer.holding && racer.tradePnl < 0;
      status.className =
        "leaderboard-status" +
        (isWinner
          ? " winner"
          : isOut
            ? " out"
            : isGreen
              ? " profit"
              : isRed
                ? " loss"
                : "");
      status.textContent = isWinner
        ? mode === "pnl"
          ? "profit KING"
          : "WINNER"
        : isOut
          ? "OUT"
          : isGreen
            ? "GREEN"
            : isRed
              ? "RED"
              : !winnerId && index === 0
                ? "LEADER"
                : "ACTIVE";

      row.append(rank, avatar, name, balance, status);
      const openProfile = () => {
        const placement =
          competitorsForLeaderboard(state.winnerId).findIndex(
            (competitor) => competitor.id === racer.id,
          ) + 1;
        const pnlPlacement =
          competitorsForPnl().findIndex(
            (competitor) => competitor.id === racer.id,
          ) + 1;
        const performance = rankedDeltaForPerformance({
          rating: racer.rating,
          placement,
          pnlPlacement,
          trades: racer.id === "player" ? state.trades : racer.trades,
          fieldSize: PLAYER_COUNT,
        });
        const currentRecord = {
          id: localLobby?.id || `match-${Date.now()}`,
          playedAt: Date.now(),
          placement,
          pnlPlacement,
          pnl: racer.balance - START_CASH,
          balance: racer.balance,
          ratingDelta: performance.delta,
          trades: racer.id === "player" ? state.trades : racer.trades,
        };
        const history =
          racer.id === "player"
            ? racer.history || []
            : [currentRecord, ...(racer.history || [])];
        options.onProfileOpen?.({
          id: racer.id,
          username: racer.name,
          initials: racer.initials,
          avatarColor: racer.color,
          rating: racer.rating,
          wallet: racer.id === "player" ? rankedProfile.wallet : 0,
          games: history.length,
          bestFinish:
            history.length > 0
              ? Math.min(
                  ...history.map((game) => game.placement),
                )
              : null,
          history,
          medals: racer.medals || {},
          isYou: racer.id === "player",
        });
      };
      row.addEventListener("click", openProfile);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openProfile();
        }
      });
      leaderboardList.appendChild(row);
    });

    const playerRank =
      state.finalPlacement ||
      competitorsForLeaderboard(winnerId).findIndex(
        (competitor) => competitor.id === "player",
      ) + 1;
    const livePlayerPnlRank =
      competitorsForPnl().findIndex(
        (competitor) => competitor.id === "player",
      ) + 1;
    const playerPnlRank =
      state.gameOver && state.finalPnlPlacement
        ? state.finalPnlPlacement
        : livePlayerPnlRank;
    modalPlacementRank.textContent = `#${playerRank}`;
    modalPnlRank.textContent = `#${playerPnlRank}`;
    modalRank.className =
      "your-result " +
      (playerRank === 1 ? "champion" : playerRank === 2 ? "runner-up" : "");
    updateRewardPanel();
    if (!state.ratingApplied && state.eliminated) {
      renderRatingResult();
    }
    leaderboardList.scrollTop = previousScroll;
  }

  function endMatch(winnerId, condition) {
    if (state.gameOver) return;
    state.gameOver = true;
    state.running = false;
    state.winnerId = winnerId;
    marketCountdown.classList.remove("show", "closing", "go");

    const botWinner = bots.find((bot) => bot.id === winnerId);
    const playerWon = winnerId === "player";
    modalBackdrop.classList.remove("show", "spectating", "victory");
    spectatorHud.classList.remove("show");
    modalBtn.disabled = false;
    modalBtn.textContent = "Play again";
    backLobbyBtn.disabled = false;
    if (isZenMode) {
      state.finalPlacement = 1;
      state.finalPnlPlacement = 1;
      state.ratingApplied = true;
    } else if (!state.ratingApplied) {
      const finalRanked = competitorsForLeaderboard(winnerId);
      state.finalPlacement =
        finalRanked.findIndex(
          (competitor) => competitor.id === "player",
        ) + 1;
      state.finalPnlPlacement =
        competitorsForPnl().findIndex(
          (competitor) => competitor.id === "player",
        ) + 1;
      applyPlayerRankedResult(
        state.finalPlacement,
        state.finalPnlPlacement,
        condition,
      );
    }
    resultsKicker.textContent = isZenMode ? "ZEN SESSION COMPLETE" : "FINAL STANDINGS";
    modalIcon.textContent = playerWon ? "👑" : winnerId ? "🏁" : "💥";
    modalTitle.textContent = playerWon
      ? isZenMode ? "TARGET REACHED" : "YOU WIN!"
      : botWinner
        ? `${botWinner.name} WINS`
        : "YOU'RE OUT";
    modalTitle.className = playerWon ? "win" : "lose";

    if (condition === "profit-target") {
      modalCondition.textContent = `${fmtMoney(currentGoal()).replace(",000", "K")} TARGET`;
      modalDesc.textContent = playerWon
        ? isZenMode
          ? "You reached $100,000 at your own pace."
          : "You were first to reach the $30,000 target."
        : `${botWinner?.name || "A rival"} reached ${fmtMoney(currentGoal())} first.`;
    } else if (condition === "last-standing") {
      modalCondition.textContent = "LAST STANDING";
      modalDesc.textContent = playerWon
        ? "Every rival was eliminated. You own the lobby."
        : `${botWinner?.name || "A rival"} is the last trader standing.`;
    } else if (condition === "time-limit") {
      modalCondition.textContent = "MARKET CLOSE";
      modalDesc.textContent = playerWon
        ? "Time expired and you held the highest balance among the surviving traders."
        : `Time expired. ${botWinner?.name || "A rival"} held the highest surviving balance.`;
    } else if (condition === "strikes") {
      modalCondition.textContent = "SIX STRIKES";
      modalDesc.textContent =
        "Six losing trades ended your run. Check the final order.";
    } else if (condition === "knockout") {
      modalCondition.textContent = "KNOCKOUT";
      modalDesc.textContent =
        "Price hit your entry-based bust line before you got out.";
    } else {
      modalCondition.textContent = "ACCOUNT FLOOR";
      modalDesc.textContent =
        "Your balance hit the account floor. Check the final order.";
    }

    if (!playerWon && state.finalPlacement === 2) {
      modalCondition.textContent = "SECOND PLACE PENALTY";
      modalDesc.textContent =
        "Second is the cruelest finish: −$10,000 account balance and at least −40 ELO.";
    }

    renderLeaderboard(winnerId);
    modalTime.textContent = fmtTime(performance.now() - state.startTime);
    const secondPlaceFinish = !playerWon && state.finalPlacement === 2;
    const revealDetail = secondPlaceFinish
      ? "−$10,000  •  −40 ELO MINIMUM"
      :
      condition === "profit-target"
        ? isZenMode
          ? "ZEN TARGET • $100,000"
          : "FIRST TO $30,000"
        : condition === "last-standing"
          ? "LAST TRADER STANDING"
          : "MARKET CLOSE LEADER";
    const winnerVisual = playerWon
      ? {
          name: rankedProfile.username,
          initials: rankedProfile.username
            .split(/[_\s]+/)
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase(),
          color: rankedProfile.avatarColor,
        }
      : {
          name: botWinner?.name || "MARKET LEADER",
          initials: botWinner?.initials || "#1",
          color: botWinner?.color || "#f4b740",
        };
    playWinnerCinematic(
      winnerVisual,
      revealDetail,
      secondPlaceFinish,
      () => {
        modalBackdrop.classList.add("show");
        if (state.ratingResult) animateProgressionResult(state.ratingResult);
        if (playerWon) triggerVictoryAnimation();
      },
    );
  }

  function resetGame() {
    settleProgressionAnimation();
    if (options.onPlayAgain) {
      options.onPlayAgain();
      return;
    }
    if (state.eliminationBatchTimer) {
      window.clearTimeout(state.eliminationBatchTimer);
      pendingTimeouts.delete(state.eliminationBatchTimer);
    }
    state = freshState();
    bots = freshBots();
    leaderboardMode = "placement";
    chartViewMin = null;
    chartViewMax = null;
    buildBotMarkers();
    modalBackdrop.classList.remove("show", "spectating", "victory");
    spectatorHud.classList.remove("show");
    revealToken += 1;
    matchReveal.className = "match-reveal";
    winnerCinematic.className = "winner-cinematic";
    root.classList.remove("winner-cinematic-active");
    root.classList.remove("victory-mode");
    positionTag.classList.remove("show");
    achievementToast.classList.remove("show");
    pnlCalloutText.classList.remove("show");
    pnlCalloutDetail.textContent = "";
    pnlCalloutDetail.classList.remove("show");
    marketObservation.className = "market-observation";
    tradeTimer.classList.remove("show");
    dangerVignette.style.opacity = 0;
    dangerVignette.classList.remove("pulse");
    activityFeed.replaceChildren();
    marketCountdown.classList.add("show");
    marketCountdown.classList.remove("go", "closing");
    marketCountdownValue.textContent = "3";
    marketCountdown.querySelector("span").textContent =
      "READ THE TREND";
    achQueue = [];
    achShowing = false;
    popups = [];
    root
      .querySelectorAll(".confetti-piece")
      .forEach((element) => element.remove());
    updateUI(state.price);
  }

  function handleKeydown(event) {
    if (event.key === "b" || event.key === "B") doBuy();
    if (event.key === "s" || event.key === "S") doSell();
  }

  function showPlacementLeaderboard() {
    renderLeaderboard(state.winnerId, "placement");
  }

  function showPnlLeaderboard() {
    renderLeaderboard(state.winnerId, "pnl");
  }

  function backToLobby() {
    if (options.onBackToLobby) {
      options.onBackToLobby();
    } else if (options.onPlayAgain) {
      options.onPlayAgain();
    }
  }

  function handleModalAction() {
    resetGame();
  }

  // ---------- MAIN LOOP ----------
  function tick() {
    if (state.running && !state.gameOver) {
      const prevPrice = stepPrice();
      if (!state.marketOpen) {
        if (performance.now() >= state.marketOpensAt) {
          openMarket();
        }
        updateUI(prevPrice);
        return;
      }
      updateBots();
      applyIdlePressure();
      checkEndConditions();
      if (
        !isZenMode &&
        state.running &&
        state.holding &&
        performance.now() >= state.autoSellAt
      ) {
        doSell("timeout");
      }
      if (!isZenMode && state.running && matchRemaining() <= 0) {
        finishTimeLimit();
      }
      updateUI(prevPrice);
      updateDanger();
      if (
        state.eliminated &&
        !state.gameOver &&
        modalBackdrop.classList.contains("show") &&
        performance.now() - state.lastLeaderboardUpdate >= 200
      ) {
        state.lastLeaderboardUpdate = performance.now();
        renderLeaderboard(null);
        modalTime.textContent = fmtTime(
          performance.now() - state.startTime,
        );
      }
    }
  }

  function renderLoop(now = performance.now()) {
    if (disposed) return;
    const frameInterval = compactRender ? 1000 / 30 : 1000 / 60;
    if (now - lastRenderAt >= frameInterval) {
      lastRenderAt = now;
      drawChart();
      drawFxLayer();
    }
    // DOM markers are composited separately from the canvas. Updating their
    // conic timers at the simulation's native 20 Hz keeps the rings fluid and
    // prevents crowded mobile rounds from bunching style work into one frame.
    const markerInterval = compactRender ? TICK_MS : frameInterval;
    if (!compactRender && now - lastMarkerRenderAt >= markerInterval) {
      lastMarkerRenderAt = now;
      drawBotMarkers();
    }
    animationFrame = window.requestAnimationFrame(renderLoop);
  }

  // ---------- INIT ----------
  function init() {
    resizeCanvases();
    root.classList.toggle("zen-mode", isZenMode);
    state = freshState();
    bots = freshBots();
    buildBotMarkers();
    activityFeed.replaceChildren();
    marketCountdown.classList.add("show");
    marketCountdown.classList.remove("go", "closing");
    marketCountdownValue.textContent = "3";
    marketCountdown.querySelector("span").textContent =
      "READ THE TREND";
    const goalSubtitle = root.querySelector(".goal-tag .sub");
    if (goalSubtitle) {
      goalSubtitle.textContent = isZenMode
        ? "zen mode • no time limit"
        : "first to target • or last standing";
    }
    winnerCinematic.querySelector("span").textContent = isZenMode
      ? "ZEN TARGET COMPLETE"
      : "MARKET CHAMPION";
    backLobbyBtn.textContent = isZenMode ? "← MENU" : "← LOBBY";
    rankedFormula.textContent = isZenMode
      ? "ZEN MODE • NO ELO • NO TIME LIMIT"
      : isRankedMatch
        ? "#1: +$15K / BONUS ELO • #2: −$10K / −40 ELO MINIMUM"
        : "PRIVATE SERVER • ELO DOES NOT CHANGE";
    updateSoundToggle();
    startTheme();
    updateUI(state.price);
    tickInterval = window.setInterval(tick, TICK_MS);
    animationFrame = window.requestAnimationFrame(renderLoop);
    clockInterval = window.setInterval(() => {
      clockEl.textContent = fmtTime(matchRemaining());
    }, 500);
    later(resizeCanvases, 50);
  }

  buyBtn.addEventListener("click", doBuy);
  sellBtn.addEventListener("click", doSell);
  modalBtn.addEventListener("click", handleModalAction);
  spectateBtn.addEventListener("click", showSpectatingMode);
  spectatorStandingsBtn.addEventListener("click", showSpectatorStandings);
  spectatorExitBtn.addEventListener("click", exitSpectatingMode);
  backLobbyBtn.addEventListener("click", backToLobby);
  placementTab.addEventListener("click", showPlacementLeaderboard);
  pnlTab.addEventListener("click", showPnlLeaderboard);
  soundToggle.addEventListener("click", toggleSound);
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("resize", resizeCanvases);

  init();

  return () => {
    disposed = true;
    window.clearInterval(tickInterval);
    window.clearInterval(clockInterval);
    window.cancelAnimationFrame(animationFrame);
    pendingTimeouts.forEach((timeout) => window.clearTimeout(timeout));
    pendingTimeouts.clear();
    buyBtn.removeEventListener("click", doBuy);
    sellBtn.removeEventListener("click", doSell);
    modalBtn.removeEventListener("click", handleModalAction);
    spectateBtn.removeEventListener("click", showSpectatingMode);
    spectatorStandingsBtn.removeEventListener(
      "click",
      showSpectatorStandings,
    );
    spectatorExitBtn.removeEventListener("click", exitSpectatingMode);
    backLobbyBtn.removeEventListener("click", backToLobby);
    placementTab.removeEventListener(
      "click",
      showPlacementLeaderboard,
    );
    pnlTab.removeEventListener("click", showPnlLeaderboard);
    soundToggle.removeEventListener("click", toggleSound);
    window.removeEventListener("keydown", handleKeydown);
    window.removeEventListener("resize", resizeCanvases);
    root
      .querySelectorAll(".confetti-piece")
      .forEach((element) => element.remove());
    root.classList.remove("victory-mode");
    stopTheme();
  };
}
