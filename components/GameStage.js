import GameModal from "./GameModal";
import LobbyStrip from "./LobbyStrip";

export default function GameStage() {
  return (
    <main className="chart-wrap" id="chartWrap">
      <button className="sound-toggle" id="soundToggle" type="button" aria-label="Mute game audio">
        <span>♫</span><b>SOUND</b>
      </button>
      <canvas id="chart" />
      <canvas id="fx" />
      <div className="flash" id="flash" />
      <div className="danger-vignette" id="dangerVignette" />

      <LobbyStrip />
      <div className="activity-feed" id="activityFeed" />
      <div className="market-observation" id="marketObservation" aria-live="polite">
        <span>MARKET OBSERVATION</span>
        <strong id="marketObservationText">Trading activity is balanced</strong>
      </div>
      <div className="bot-marker-layer" id="botMarkerLayer" aria-hidden="true" />
      <div className="market-countdown show" id="marketCountdown">
        <strong id="marketCountdownValue">3</strong>
        <span>READ THE TREND</span>
      </div>

      <div className="match-reveal" id="matchReveal" aria-live="assertive">
        <div className="reveal-rings"><i /><i /><i /></div>
        <span id="revealEyebrow">RISK LIMIT BREACHED</span>
        <strong id="revealTitle">LIQUIDATED</strong>
        <b id="revealDetail">BUST LINE HIT</b>
      </div>

      <div className="winner-cinematic" id="winnerCinematic" aria-live="assertive">
        <div className="cinematic-depth-grid" />
        <div className="cinematic-orbits"><i /><i /><i /></div>
        <div className="cinematic-winner-avatar" id="cinematicWinnerAvatar">T</div>
        <span>MARKET CHAMPION</span>
        <strong id="cinematicWinnerName">TRADER WINS</strong>
        <b id="cinematicWinnerDetail">FIRST TO THE TARGET</b>
        <em id="cinematicSecondPenalty">SECOND PLACE • PENALTY APPLIED</em>
      </div>

      <aside className="spectator-hud" id="spectatorHud">
        <div className="spectator-live"><i /> SPECTATING LIVE</div>
        <div className="spectator-summary">
          <div><span>FIELD</span><strong id="spectatorAlive">99</strong></div>
          <div><span>LEADER</span><strong id="spectatorLeader">—</strong></div>
          <div><span>CLOSE</span><strong id="spectatorTime">2:30</strong></div>
        </div>
        <div className="spectator-actions">
          <button id="spectatorStandingsBtn" type="button">STANDINGS</button>
          <button id="spectatorExitBtn" type="button">PLAY AGAIN</button>
        </div>
      </aside>

      <div className="achievement-toast" id="achievementToast">
        <div className="ach-icon" id="achIcon">
          🏆
        </div>
        <div className="ach-text">
          <div className="ach-title" id="achTitle">
            Achievement
          </div>
          <div className="ach-desc" id="achDesc">
            Description
          </div>
          <div className="ach-reward" id="achReward">
            +$100 ACCOUNT BONUS
          </div>
        </div>
      </div>

      <div className="loss-warning" id="lossWarning" aria-live="assertive">
        <div className="loss-warning-mark">×</div>
        <div>
          <span id="lossWarningLabel">LOSING TRADE</span>
          <strong id="lossesRemaining">9 LOSSES LEFT</strong>
        </div>
        <div className="strike-pips" id="strikePips">
          {Array.from({ length: 6 }, (_, index) => <i key={index} />)}
        </div>
      </div>

      <div className="pnl-callout" id="pnlCallout">
        <div className="pnl-callout-text" id="pnlCalloutText">
          +$0
        </div>
        <div className="pnl-callout-detail" id="pnlCalloutDetail" />
      </div>

      <div className="idle-ambient" aria-hidden="true">
        <span>YOU ARE LOSING MONEY</span>
        <strong>MAKE A TRADE</strong>
      </div>

      <div className="price-badge">
        <div className="p" id="priceVal">
          $100.00
        </div>
        <div className="delta" id="priceDelta">
          +0.00%
        </div>
      </div>

      <div className="position-tag" id="positionTag" />
      <div className="trade-timer" id="tradeTimer" aria-live="polite">
        <div className="trade-timer-row">
          <span>TRADE WINDOW</span>
          <strong id="autoSellText">AUTO-SELL 5.0s</strong>
        </div>
        <div className="trade-timer-track">
          <div className="trade-timer-fill" id="tradeTimerFill" />
        </div>
      </div>

      <GameModal />
    </main>
  );
}
