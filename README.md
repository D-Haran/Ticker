# TICKER

A 100-player ranked trading battle royale built with the Next.js App Router.

The start screen offers three primary ways to play:

- **Multiplayer** enters the ranked 100-player matchmaking flow.
- **Quick Play** skips matchmaking and immediately starts a ranked battle
  against the local bot field.
- **Zen** is a solo, unranked run to $100,000 with no match timer, opponents,
  bust line, inactivity pressure, automatic sell window, strikes, or account
  floor elimination.

Private rooms remain available through the smaller Start Server and Join
Server actions below the main modes.

Each local match currently fills the lobby with 99 rating-matched bots. The
player and every bot share the same rating-scaled trade window (approximately
5.8–7.5 seconds), a 7.5% entry-relative bust line, six-loss limit, $6,500 account
floor, and staged inactivity pressure. The
first trader to reach $30,000 wins; a sole remaining trader also wins
immediately.

Rank changes are based on placement in the 100-player field:

```text
base ELO = 60% survival score + 40% Profit score
```

Positive gains receive a larger multiplier at lower ELO and are compressed
logarithmically above 1000 ELO, including the championship bonus, while losses
retain their full weight. A player must complete at least three trades to earn
positive ELO; fewer trades add a small participation penalty. The local ranked
profile is persisted in the browser.

The app now includes a full pre-game flow:

- A chart-backed start screen with Quick Play and private-server creation
- Framer Motion transitions across the streamlined start and results screens
- A 15-second matchmaking lobby that starts when 100 seats fill or time expires
- Shareable `?server=CODE` private-lobby URLs
- Persistent player profiles with username, avatar, ELO, best finish, and match history
- Clickable post-game placement and profit leaderboards
- A three-second live-market preview, fast activity feed, and escalating inactivity pressure
- An authored ten-second opening phase with directional price formation, a
  scheduled structured event, and a flat-market intervention safeguard
- Persistent market regimes with readable formation, confirmation, maturity,
  and exhaustion rather than a rapidly rerolled random drift
- Classic anchored, two-sided pricing in battle royale, with a separate,
  faster-rising fair-value path and bust-line discipline in Zen sessions
- An original generated retro-techno background loop, layered trade/result
  sound cues, and a persistent in-game mute control
- Neutral public market observations shared by human players and bots
- Rating-scaled ambiguity, timing pressure, regime duration, and trade windows
- Participation qualification after two trades held for at least 650 ms
- A compact live crowd readout for exposure, recent entries, and underwater traders
- Aggregated liquidation messages during multi-player market cascades
- Concise entry/capture feedback after each closed trade
- A champion animation for player wins
- A 2:30 hard match limit with a large final-ten market-close countdown
- Repeatable profile medals for championships, top tens, profit wins, survival,
  large profits, and active trading

The opening preview draws a live market path from the left edge to the right
edge over exactly three seconds; it does not pad the chart with flat history.
If the 2:30 deadline expires, the surviving trader with the highest live
balance wins, with qualified active traders preferred over passive unqualified
survivors. Placement ordering likewise prioritizes qualified participation.

The live market moves through consolidation, breakout, trend, and exhaustion
regimes, with occasional structured volatility events. Public observations
describe visible evidence without revealing hidden outcomes. Difficulty scales
continuously from the average lobby rating: higher-rated matches use somewhat
shorter regimes, later and more ambiguous observations, more false confirmation,
and modestly tighter trade and inactivity timing without simply adding randomness.

Inactivity pressure is staged. A short observation period is safe, followed by
a warning, then moderate account drain, and finally severe drain for continued
camping. The exact grace period scales modestly with lobby rating and match time.

Private URLs and the lobby UI work with the current local bot provider. Actual
cross-device players will require the future authoritative lobby service
described below.

## Local development

```bash
npm install
npm run dev
npm run balance
```

Open [http://localhost:3000](http://localhost:3000).

## Production

```bash
npm run build
npm run start
```

The project can be imported directly into Vercel. It currently requires no
environment variables or external services.

## Structure

- `app/` — Next.js route, layout, metadata, and global styles
- `components/` — game header, chart stage, controls, modal, and client wrapper
- `lib/trading-game.js` — game engine, bot simulation, canvas runtime, and UI binding
- `lib/ranked-system.js` — rating calculation and persisted ranked profile
- `lib/multiplayer/local-lobby.js` — local rating-matched 100-player lobby provider
- `lib/multiplayer/contracts.js` — versioned match events and public player-state contract
- `scripts/balance-sim.mjs` — deterministic multi-strategy balance regression harness
- `index.html` — preserved original single-file version for comparison

## Multiplayer path

The bot roster and wire-level match contracts are separated from the rendering
layer so a future authoritative lobby service can replace the local lobby
provider without changing the game UI. In a networked version, the server
should own price ticks, trade timestamps, eliminations, placements, and rating
updates; clients should send trade intents and render server snapshots using
the versioned events in `lib/multiplayer/contracts.js`.
