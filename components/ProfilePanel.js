function initialsFor(profile) {
  if (profile.initials && profile.initials !== "YOU") {
    return profile.initials;
  }
  return (profile.username || "TRADER")
    .split(/[_\s]+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function money(value) {
  const amount = Number(value) || 0;
  return `${amount >= 0 ? "+" : "−"}$${Math.abs(amount).toLocaleString(
    "en-US",
    { maximumFractionDigits: 0 },
  )}`;
}

const MEDAL_DEFINITIONS = [
  { key: "champion", icon: "👑", label: "TOP 1" },
  { key: "topTen", icon: "🏅", label: "TOP 10" },
  { key: "pnlKing", icon: "💰", label: "profit KING" },
  { key: "survivor", icon: "🛡️", label: "SURVIVOR" },
  { key: "bigBag", icon: "💎", label: "BIG BAG" },
  { key: "activeTrader", icon: "⚡", label: "10+ TRADES" },
];

export default function ProfilePanel({ profile, onBack }) {
  const history = profile.history || [];
  const medals = profile.medals || {};

  return (
    <div className="profile-overlay">
      <section className="profile-panel">
        <button
          className="profile-back"
          type="button"
          onClick={onBack}
        >
          ← BACK
        </button>

        <div className="profile-hero">
          <div
            className="profile-avatar"
            style={{ "--profile-color": profile.avatarColor }}
          >
            {initialsFor(profile)}
            <i />
          </div>
          <div>
            <span className="profile-label">
              {profile.isYou ? "YOUR PROFILE" : "TRADER PROFILE"}
            </span>
            <h2>{profile.username}</h2>
            <div className="profile-rank">
              <strong>{profile.rating}</strong> ELO
            </div>
          </div>
        </div>

        <div className="profile-stats">
          <div>
            <span>ACCOUNT</span>
            <strong className={(profile.wallet || 0) < 0 ? "negative" : "positive"}>
              {money(profile.wallet || 0)}
            </strong>
          </div>
          <div>
            <span>GAMES</span>
            <strong>{profile.games || history.length}</strong>
          </div>
          <div>
            <span>BEST FINISH</span>
            <strong>
              {profile.bestFinish ? `#${profile.bestFinish}` : "—"}
            </strong>
          </div>
          <div>
            <span>AVG profit</span>
            <strong
              className={
                history.reduce((sum, game) => sum + game.pnl, 0) >= 0
                  ? "positive"
                  : "negative"
              }
            >
              {history.length
                ? money(
                    history.reduce(
                      (sum, game) => sum + game.pnl,
                      0,
                    ) / history.length,
                  )
                : "—"}
            </strong>
          </div>
        </div>

        <div className="medal-section">
          <div className="match-history-head">
            <span>MEDAL CABINET</span>
            <span>
              {Object.values(medals).reduce(
                (sum, count) => sum + count,
                0,
              )}{" "}
              EARNED
            </span>
          </div>
          <div className="medal-grid">
            {MEDAL_DEFINITIONS.map((medal) => {
              const count = medals[medal.key] || 0;
              return (
                <div
                  className={`medal-card ${count === 0 ? "locked" : ""}`}
                  key={medal.key}
                >
                  <span>{medal.icon}</span>
                  <div>
                    <strong>{medal.label}</strong>
                    <small>×{count}</small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="match-history-head">
          <span>PREVIOUS GAMES</span>
          <span>LAST {Math.min(20, history.length)}</span>
        </div>
        <div className="match-history">
          {history.length === 0 ? (
            <div className="history-empty">
              <b>NO RACES YET</b>
              <span>Your first result will appear here.</span>
            </div>
          ) : (
            history.map((game) => (
              <div className="history-row" key={game.id}>
                <div
                  className={`history-place ${
                    game.placement === 1 ? "first" : ""
                  }`}
                >
                  #{game.placement}
                </div>
                <div className="history-game">
                  <strong>
                    {game.placement === 1
                      ? "VICTORY"
                      : game.ranked === false
                        ? "PRIVATE BR"
                        : "RANKED BR"}
                  </strong>
                  <span>
                    P&amp;L #{game.pnlPlacement || game.placement} •{" "}
                    {new Date(game.playedAt).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric" },
                    )}
                  </span>
                </div>
                <div
                  className={`history-pnl ${
                    game.pnl >= 0 ? "positive" : "negative"
                  }`}
                >
                  <strong>{money(game.pnl)}</strong>
                  <span>
                    {game.ranked === false
                      ? "UNRANKED"
                      : `${game.ratingDelta >= 0 ? "+" : ""}${game.ratingDelta} ELO`}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
