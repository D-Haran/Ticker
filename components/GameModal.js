"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export default function GameModal() {
  const backdropRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const backdrop = backdropRef.current;
    if (!backdrop) return undefined;
    const syncVisibility = () => setVisible(backdrop.classList.contains("show"));
    syncVisibility();
    const observer = new MutationObserver(syncVisibility);
    observer.observe(backdrop, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="modal-backdrop" id="modalBackdrop" ref={backdropRef}>
      <motion.div
        className="modal results-modal"
        animate={visible
          ? { opacity: 1, y: 0, scale: 1 }
          : { opacity: 0, y: 18, scale: 0.985 }}
        transition={{ type: "spring", stiffness: 190, damping: 24 }}
      >
        <button
          className="results-back-button"
          id="backLobbyBtn"
          type="button"
        >
          ← LOBBY
        </button>
        <div className="results-hero">
          <motion.div
            className="icon"
            id="modalIcon"
            animate={visible ? { scale: [0.8, 1.08, 1], rotate: [0, -4, 0] } : { scale: 0.8 }}
            transition={{ duration: 0.45, delay: 0.08 }}
          >
            🏁
          </motion.div>
          <div>
            <div className="results-kicker" id="resultsKicker">
              FINAL STANDINGS
            </div>
            <h2 id="modalTitle">Match complete</h2>
            <p id="modalDesc">The lobby results are in.</p>
          </div>
        </div>
        <div className="your-result" id="modalRank">
          <div className="result-podium-stat placement">
            <span>PLACEMENT</span>
            <strong id="modalPlacementRank">#1</strong>
          </div>
          <div className="result-podium-stat pnl">
            <span>P&amp;L RANK</span>
            <strong id="modalPnlRank">#1</strong>
          </div>
        </div>
        <section className="reward-panel" id="rewardPanel">
          <div className="reward-head">
            <span id="rewardMode">LIVE MATCH REWARDS</span>
          </div>
          <div className="reward-progression-grid">
            <div className="ranked-result progression-card" id="rankedResult">
              <div className="progression-label">RANKED ELO</div>
              <div className="progression-impact">
                <span className="progression-trend" id="ratingTrend">▲</span>
                <strong className="reel-number" id="ratingAfter">1000</strong>
              </div>
              <div className="progression-change">
                <span id="ratingBefore">1000</span>
                <i>→</i>
                <b id="ratingDelta">PENDING</b>
              </div>
            </div>
            <div className="progression-card wallet-progression" id="walletProgression">
              <div className="progression-label">ACCOUNT BALANCE</div>
              <div className="progression-impact">
                <span className="progression-trend" id="walletTrend">▲</span>
                <strong className="reel-number" id="rewardWalletTotal">$0</strong>
              </div>
              <div className="progression-change">
                <span id="rewardWalletBefore">$0</span>
                <i>→</i>
                <b id="rewardContribution">+$0</b>
              </div>
              <div className="reward-breakdown">
                <div><span>TRADING P&amp;L</span><strong id="rewardPnl">$0</strong></div>
                <div><span>ACHIEVEMENTS</span><strong id="rewardBonus">+$0</strong></div>
                <div><span>FINISH MODIFIER</span><strong id="rewardPlacement">$0</strong></div>
              </div>
            </div>
          </div>
          <span className="reward-wallet-after" id="rewardWalletAfter">$0 ACCOUNT</span>
        </section>
        <div className="leaderboard-tabs">
          <button
            className="active"
            id="placementTab"
            type="button"
          >
            PLACEMENT
          </button>
          <button id="pnlTab" type="button">
            P&amp;L
          </button>
        </div>
        <div className="leaderboard" id="leaderboardList" />
        <div className="ranked-formula" id="rankedFormula">
          #1 BOOSTED • #2 PUNISHED • 3 TRADE MINIMUM
        </div>
        <div className="results-meta">
          <div className="stat">
            <div className="k">Win condition</div>
            <div className="v results-condition" id="modalCondition">
              Profit target
            </div>
          </div>
          <div className="stat">
            <div className="k">Time</div>
            <div className="v" id="modalTime">
              0:00
            </div>
          </div>
        </div>
        <motion.button className="modal-btn" id="modalBtn" type="button" whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }}>
          Play again
        </motion.button>
        <motion.button className="spectate-btn" id="spectateBtn" type="button" whileTap={{ scale: 0.99 }}>
          ◉ SPECTATE MATCH
        </motion.button>
      </motion.div>
    </div>
  );
}
