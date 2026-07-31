export default function LobbyStrip() {
  return (
    <div className="center-hud">
      <div className="lobby-strip battle-royale-strip">
        <div className="battle-stat battle-primary">
          <strong id="aliveCount">100</strong>
          <span>PLAYERS LEFT</span>
        </div>
        <div className="battle-divider" />
        <div className="battle-stat battle-primary">
          <strong id="currentRank">#1</strong>
          <span>P&amp;L RANK</span>
        </div>
        <div className="battle-divider" />
        <div className="battle-stat battle-qualification" id="qualificationStatus">
          <strong id="qualificationValue">2</strong>
          <span>TO QUALIFY</span>
        </div>
      </div>
      <div className="crowd-strip" id="crowdStrip">
        <span>EXPOSED <strong id="crowdExposed">0</strong></span>
        <span>RECENT <strong id="crowdRecent">0</strong></span>
        <span>UNDERWATER <strong id="crowdUnderwater">0</strong></span>
      </div>
      <div className="idle-warning" id="idleWarning">
        <span>⚡</span>
        <strong id="idleWarningText">TRADE IN 6.5s</strong>
      </div>
    </div>
  );
}
