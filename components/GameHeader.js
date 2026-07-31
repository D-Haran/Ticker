export default function GameHeader() {
  return (
    <header className="header">
      <div className="header-top">
        <div className="brand">
          <div className="brand-dot" />
          <div className="brand-text">TICKER</div>
          <div className="session-clock" id="clock">
            0:00
          </div>
        </div>

        <div className="header-pnl-card" id="livePnlCard">
          <span><i /> MY P&amp;L</span>
          <strong id="livePnlValue">$0</strong>
          <b id="livePnlPulse">LIVE</b>
        </div>

        <div className="goal-tag">
          <div className="label">Goal</div>
          <div className="value" id="goalValue">
            $30,000
          </div>
          <div className="sub">first to target • or last standing</div>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat balance-stat">
          <div className="k">Balance</div>
          <div className="v" id="equityVal">
            $10,000
          </div>
        </div>
        <div className="stat trades-stat">
          <div className="k">Trades</div>
          <div className="v" id="tradesVal">
            0
          </div>
        </div>
        <div className="stat wins-stat">
          <div className="k">Wins</div>
          <div className="v" id="winsVal">
            0
          </div>
        </div>
        <div className="stat strikes-stat">
          <div className="k">Strikes</div>
          <div className="v" id="strikesVal">
            0 / 6
          </div>
        </div>
        <div className="stat streak-stat">
          <div className="k">Streak</div>
          <div className="v" id="streakVal">
            —
          </div>
        </div>
      </div>

      <div className="progress-wrap">
        <div className="progress-bar" id="progressBar" />
      </div>
    </header>
  );
}
