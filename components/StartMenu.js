"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import MenuBackdrop from "./MenuBackdrop";
import { ratingPercentile } from "../lib/ranked-system";

function ordinal(value) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}TH`;
  return `${value}${value % 10 === 1 ? "ST" : value % 10 === 2 ? "ND" : value % 10 === 3 ? "RD" : "TH"}`;
}

function accountMoney(value) {
  const amount = Math.round(Number(value) || 0);
  return `${amount < 0 ? "−" : ""}$${Math.abs(amount).toLocaleString("en-US")}`;
}

export default function StartMenu({
  profile,
  onMultiplayer,
  onQuickPlay,
  onZen,
  onCreateServer,
  onJoinServer,
}) {
  const percentile = ratingPercentile(profile.rating);
  const [joining, setJoining] = useState(false);
  const [serverCode, setServerCode] = useState("");
  const [joinError, setJoinError] = useState("");

  function submitJoin(event) {
    event.preventDefault();
    const code = serverCode.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (code.length < 4) {
      setJoinError("ENTER A VALID SERVER CODE");
      return;
    }
    setJoinError("");
    onJoinServer(code);
  }
  return (
    <motion.main
      className="start-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45 }}
    >
      <MenuBackdrop />
      <motion.section
        className="start-card"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 150, damping: 20, delay: 0.08 }}
      >
        <motion.div
          className="start-hero"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.07 } },
          }}
        >
          <motion.div className="start-eyebrow" variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}>
            <span className="lobby-live-dot" />
            LIVE MARKET BATTLE ROYALE
          </motion.div>
          <motion.h1 variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}>TICKER</motion.h1>
          <motion.p className="start-tagline" variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}>
            Read the move. Take the trade.
          </motion.p>

          <motion.div className="home-account-strip" variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
            <div className="home-rating">
              <span>RATING</span>
              <strong>{profile.rating}</strong>
              <i>ELO</i>
              <b>{ordinal(percentile)} PERCENTILE</b>
            </div>
            <div className="home-wallet">
              <span>ACCOUNT</span>
              <strong className={(profile.wallet || 0) < 0 ? "negative" : "positive"}>
                {accountMoney(profile.wallet)}
              </strong>
            </div>
          </motion.div>
        </motion.div>

        <div className="start-actions">
          <div className="main-mode-actions">
            <motion.button
              className="menu-action primary multiplayer-action"
              type="button"
              onClick={onMultiplayer}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.985 }}
            >
              <span className="menu-action-icon">🌐</span>
              <span>
                <strong>MULTIPLAYER</strong>
                <small>Enter ranked 100-player matchmaking</small>
              </span>
              <b>→</b>
            </motion.button>
            <motion.button
              className="menu-action primary quick-action"
              type="button"
              onClick={onQuickPlay}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.985 }}
            >
              <span className="menu-action-icon">🤖</span>
              <span>
                <strong>QUICK PLAY</strong>
                <small>Jump straight into a ranked bot battle</small>
              </span>
              <b>→</b>
            </motion.button>
            <motion.button
              className="menu-action primary zen-action"
              type="button"
              onClick={onZen}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.985 }}
            >
              <span className="menu-action-icon">◯</span>
              <span>
                <strong>ZEN</strong>
                <small>Solo free play • no pressure • reach $100K</small>
              </span>
              <b>→</b>
            </motion.button>
          </div>

          <div className="server-action-label">PRIVATE SERVERS</div>
          <div className="server-actions">
            <motion.button
              className="menu-action secondary compact"
              type="button"
              onClick={onCreateServer}
              whileHover={{ backgroundColor: "rgba(255,255,255,0.045)" }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="menu-action-icon">⌁</span>
              <span>
                <strong>START SERVER</strong>
                <small>Create a room</small>
              </span>
              <b>＋</b>
            </motion.button>
            <motion.button
              className="menu-action secondary compact join-action"
              type="button"
              onClick={() => setJoining((current) => !current)}
              whileHover={{ backgroundColor: "rgba(255,255,255,0.045)" }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="menu-action-icon">#</span>
              <span>
                <strong>JOIN SERVER</strong>
                <small>Enter a code</small>
              </span>
              <b>{joining ? "−" : "→"}</b>
            </motion.button>
          </div>
          <AnimatePresence initial={false}>
          {joining && (
            <motion.form
              className="join-server-form"
              onSubmit={submitJoin}
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -6 }}
              transition={{ duration: 0.2 }}
            >
              <label htmlFor="serverCode">SERVER CODE</label>
              <div>
                <input
                  id="serverCode"
                  value={serverCode}
                  onChange={(event) => {
                    setServerCode(
                      event.target.value
                        .replace(/[^a-z0-9]/gi, "")
                        .toUpperCase()
                        .slice(0, 8),
                    );
                    setJoinError("");
                  }}
                  placeholder="ABC123"
                  autoCapitalize="characters"
                  autoComplete="off"
                  inputMode="text"
                />
                <button type="submit">JOIN</button>
              </div>
              {joinError && <small>{joinError}</small>}
            </motion.form>
          )}
          </AnimatePresence>
        </div>

        <div className="start-rules">
          <span>3 GAME MODES</span>
          <i />
          <span>BUY / SELL</span>
          <i />
          <span>READ THE MARKET</span>
        </div>
      </motion.section>
    </motion.main>
  );
}
