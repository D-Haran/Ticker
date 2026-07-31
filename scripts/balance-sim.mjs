// Lightweight deterministic balance harness for the market-design rules. It is
// intentionally DOM-free so hundreds of 2:30 matches can run during tuning.
const TICKS = 3000;
const START = 10000;
const FLOOR = 6500;
const LEGITIMATE_TICKS = 13;
const MAX_HOLD_TICKS = 130;
const OPENING_TICKS = 200;
const OPENING_WINDOW_TICKS = 40;
const OPENING_RANGE_THRESHOLD = 0.014;
const OPENING_FLAT_TICKS = 50;

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function gaussian(random) {
  const u = 1 - random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function generateMarket(seed) {
  const random = seeded(seed);
  const prices = [100];
  const observations = Array(TICKS).fill(0);
  let direction = random() < 0.5 ? -1 : 1;
  let type = random() < 0.52
    ? "breakout"
    : direction > 0 ? "trend_up" : "trend_down";
  let remaining = 100 + Math.floor(random() * 80);
  let total = remaining;
  let openingRegime = true;
  let openingDrift = 0.00055 + random() * 0.00035;
  let openingVolatility = 0.0028 + random() * 0.0022;
  let openingFlatTicks = 0;
  let openingIntervened = false;
  let noise = 0;
  let nextEvent = 70 + Math.floor(random() * 70);
  let event = null;
  for (let tick = 1; tick < TICKS; tick += 1) {
    if (--remaining <= 0) {
      openingRegime = false;
      if (type === "consolidation") type = "breakout";
      else if (type === "breakout") type = direction > 0 ? "trend_up" : "trend_down";
      else if (type.startsWith("trend")) type = "exhaustion";
      else if (random() < 0.48) {
        direction *= -1;
        type = direction > 0 ? "trend_up" : "trend_down";
      } else type = "consolidation";
      const seconds = type === "breakout" ? 2 + random() * 3
        : type === "consolidation" ? 4 + random() * 5
          : type === "exhaustion" ? 3 + random() * 4 : 7 + random() * 7;
      total = remaining = Math.round(seconds * 20);
    }
    const progress = 1 - remaining / total;
    if (Math.abs(progress - 0.28) < 0.006) {
      const intended = type === "exhaustion" ? -direction
        : type === "consolidation" ? 0 : direction;
      observations[tick] = random() < 0.72 ? intended : -intended;
    } else observations[tick] = observations[tick - 1] * 0.992;

    if (!event && --nextEvent <= 0) {
      const surprise = random() < 0.15;
      const eventDirection = random() < 0.5 ? -1 : 1;
      event = { direction: eventDirection, remaining: 24 + Math.floor(random() * 34), magnitude: surprise ? 0.025 : 0.035 + random() * 0.035 };
      if (!surprise) observations[tick] = eventDirection;
    }
    const retention = openingRegime && tick <= OPENING_TICKS
      ? 0.7 + random() * 0.1
      : type === "consolidation" ? 0.5 : 0.68;
    noise = noise * retention + gaussian(random) * Math.sqrt(1 - retention ** 2);
    const envelope = progress < 0.18 ? 0.45 + progress / 0.18 * 0.33
      : progress < 0.68 ? 0.78 + (progress - 0.18) / 0.5 * 0.22
        : 1 - (progress - 0.68) / 0.32 * 0.72;
    const drift = openingRegime && tick <= OPENING_TICKS
      ? direction * openingDrift * Math.max(0.78, envelope)
      : type === "consolidation" ? 0
        : direction * (type === "breakout" ? 0.00082 : type === "exhaustion" ? 0.0002 : 0.00044) * envelope;
    const volatility = openingRegime && tick <= OPENING_TICKS
      ? openingVolatility
      : type === "consolidation" ? 0.0012 : type === "breakout" ? 0.0028 : 0.0021;
    let eventMove = 0;
    if (event) {
      eventMove = event.direction * event.magnitude / event.remaining * 0.65;
      if (--event.remaining <= 0) {
        event = null;
        nextEvent = 300 + Math.floor(random() * 320);
      }
    }
    const meanReversion =
      ((100 - prices[tick - 1]) / prices[tick - 1]) * 0.00008;
    prices.push(Math.max(
      3,
      prices[tick - 1] *
        (1 + drift + noise * volatility + eventMove + meanReversion),
    ));
    if (tick >= OPENING_WINDOW_TICKS && tick <= OPENING_TICKS && !openingIntervened) {
      const window = prices.slice(-OPENING_WINDOW_TICKS);
      const range = (Math.max(...window) - Math.min(...window)) / window[0];
      openingFlatTicks = range < OPENING_RANGE_THRESHOLD
        ? openingFlatTicks + 1
        : 0;
      if (openingFlatTicks >= OPENING_FLAT_TICKS) {
        const move = window[window.length - 1] - window[0];
        direction = Math.abs(move / window[0]) >= OPENING_RANGE_THRESHOLD * 0.2
          ? Math.sign(move)
          : random() < 0.5 ? -1 : 1;
        type = "breakout";
        total = remaining = 100 + Math.floor(random() * 80);
        openingRegime = true;
        openingDrift = 0.00055 + random() * 0.00035;
        openingVolatility = 0.0028 + random() * 0.0022;
        noise = direction * Math.max(0.8, Math.abs(noise));
        nextEvent = Math.min(nextEvent, 15);
        openingIntervened = true;
      }
    }
  }
  const openingPrices = prices.slice(0, OPENING_TICKS + 1);
  const openingRange =
    (Math.max(...openingPrices) - Math.min(...openingPrices)) /
    openingPrices[0];
  return { prices, observations, openingRange };
}

function trend(prices, tick, lookback) {
  const start = prices[Math.max(0, tick - lookback)];
  return (prices[tick] - start) / start;
}

function simulateStrategy(market, strategy, seed) {
  const random = seeded(seed);
  let cash = START;
  let entry = 0;
  let enteredAt = 0;
  let holding = false;
  let lastLegitimate = 0;
  let legitimateTrades = 0;
  let losses = 0;
  for (let tick = 30; tick < TICKS && cash > FLOOR && losses < 6; tick += 1) {
    const price = market.prices[tick];
    const short = trend(market.prices, tick, 8);
    const medium = trend(market.prices, tick, 24);
    const signal = market.observations[tick];
    const held = tick - enteredAt;
    let buy = false;
    let sell = false;
    if (strategy === "random") {
      buy = random() < 0.012;
      sell = held >= LEGITIMATE_TICKS && random() < 0.035;
    } else if (strategy === "momentum") {
      buy = medium > 0.004;
      sell = short < -0.002;
    } else if (strategy === "signal") {
      buy = signal > 0.35;
      sell = signal < -0.35 || short < -0.006;
    } else if (strategy === "combined") {
      const overcrowded = medium > 0.035 && short < medium / 3;
      buy = medium > 0.002 && short > 0 && signal >= -0.1 && !overcrowded;
      sell = short < -0.0015 || signal < -0.3 || (medium > 0.025 && short < 0.001);
    } else if (strategy === "spam") {
      buy = true;
      sell = held >= 2;
    } else if (strategy === "idle_edge") {
      buy = tick - lastLegitimate >= 185 && short > -0.004;
      sell = held >= LEGITIMATE_TICKS;
    }
    if (!holding && buy) {
      holding = true;
      entry = price;
      enteredAt = tick;
    } else if (holding && (sell || held >= MAX_HOLD_TICKS)) {
      const before = cash;
      cash *= price / entry;
      if (cash < before) losses += 1;
      holding = false;
      if (held >= LEGITIMATE_TICKS) {
        legitimateTrades += 1;
        lastLegitimate = tick;
      }
    }
    if (!holding) {
      const idle = tick - lastLegitimate;
      if (idle > 340) cash *= 1 - 0.028 / 20;
      else if (idle > 260) cash *= 1 - 0.011 / 20;
    }
  }
  return { balance: cash, qualified: legitimateTrades >= 2 };
}

const strategies = ["random", "momentum", "signal", "combined", "camper", "spam", "idle_edge"];
const totals = Object.fromEntries(strategies.map((name) => [name, { balance: 0, qualified: 0 }]));
const RUNS = 240;
let flatOpenings = 0;
for (let run = 1; run <= RUNS; run += 1) {
  const market = generateMarket(run * 7919);
  if (market.openingRange < OPENING_RANGE_THRESHOLD) flatOpenings += 1;
  for (const [index, strategy] of strategies.entries()) {
    const result = simulateStrategy(market, strategy, run * 104729 + index);
    totals[strategy].balance += result.balance;
    totals[strategy].qualified += Number(result.qualified);
  }
}

console.log(`opening    flat ${flatOpenings}/${RUNS} under ${(OPENING_RANGE_THRESHOLD * 100).toFixed(1)}% range`);

for (const strategy of strategies) {
  const result = totals[strategy];
  console.log(`${strategy.padEnd(10)} avg $${Math.round(result.balance / RUNS).toLocaleString()} | qualified ${Math.round(result.qualified / RUNS * 100)}%`);
}

const average = (name) => totals[name].balance / RUNS;
if (flatOpenings > RUNS * 0.05 || average("combined") <= average("random") || average("camper") >= FLOOR || totals.spam.qualified > 0) {
  throw new Error("Balance targets failed: skilled edge, camper pressure, or spam qualification regressed.");
}
