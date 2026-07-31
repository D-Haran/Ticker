"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { startTradingGame } from "../lib/trading-game";
import { loadRankedProfile } from "../lib/ranked-system";
import GameControls from "./GameControls";
import GameHeader from "./GameHeader";
import GameStage from "./GameStage";
import MatchLobby from "./MatchLobby";
import ProfileButton from "./ProfileButton";
import ProfilePanel from "./ProfilePanel";
import StartMenu from "./StartMenu";

const INITIAL_PROFILE = {
  username: "TRADER",
  avatarColor: "#17d67f",
  rating: 1000,
  wallet: 0,
  games: 0,
  bestFinish: null,
  history: [],
  medals: {},
};

function createServerCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
}

function primeGameAudio() {
  if (typeof window === "undefined") return;
  try {
    if (!window.__tickerAudioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) window.__tickerAudioContext = new AudioContext();
    }
    window.__tickerAudioContext?.resume?.();
  } catch {}
}

export default function TradingGame() {
  const appRef = useRef(null);
  const [screen, setScreen] = useState("home");
  const [profile, setProfile] = useState(INITIAL_PROFILE);
  const [profileView, setProfileView] = useState(null);
  const [lobby, setLobby] = useState(null);
  const [gameKey, setGameKey] = useState(0);
  const [zenIntroOpen, setZenIntroOpen] = useState(false);

  useEffect(() => {
    setProfile(loadRankedProfile());
    const url = new URL(window.location.href);
    const serverCode = url.searchParams.get("server");
    if (serverCode) {
      setLobby({
        kind: "private",
        code: serverCode.toUpperCase().slice(0, 8),
        shareUrl: url.toString(),
        copied: false,
        isHost: false,
        roster: [],
      });
      setScreen("lobby");
    }
  }, []);

  const enterMultiplayer = useCallback(() => {
    primeGameAudio();
    try {
      window.history.replaceState({}, "", window.location.pathname);
    } catch {}
    setLobby({ kind: "multiplayer" });
    setScreen("lobby");
  }, []);

  const enterQuickPlay = useCallback(() => {
    primeGameAudio();
    try {
      window.history.replaceState({}, "", window.location.pathname);
    } catch {}
    setLobby({ kind: "quick" });
    setGameKey((current) => current + 1);
    setScreen("game");
  }, []);

  const enterZen = useCallback(() => {
    primeGameAudio();
    setZenIntroOpen(true);
  }, []);

  const startZen = useCallback(() => {
    try {
      window.history.replaceState({}, "", window.location.pathname);
    } catch {}
    setZenIntroOpen(false);
    setLobby({ kind: "zen" });
    setGameKey((current) => current + 1);
    setScreen("game");
  }, []);

  const returnHome = useCallback(() => {
    window.history.replaceState({}, "", window.location.pathname);
    setProfileView(null);
    setLobby(null);
    setScreen("home");
  }, []);

  const startMatch = useCallback(() => {
    setProfileView(null);
    setGameKey((current) => current + 1);
    setScreen("game");
  }, []);

  const updateRoster = useCallback((roster) => {
    setLobby((current) => current?.kind === "private"
      ? { ...current, roster }
      : current);
  }, []);

  const playAgain = useCallback(() => {
    if (lobby?.kind === "zen" || lobby?.kind === "quick") {
      setGameKey((current) => current + 1);
      setScreen("game");
      return;
    }
    setScreen("lobby");
  }, [lobby?.kind]);

  useEffect(() => {
    if (screen !== "game" || !appRef.current) return undefined;
    return startTradingGame(appRef.current, {
      onProfileUpdated: setProfile,
      onProfileOpen: setProfileView,
      onPlayAgain: playAgain,
      onBackToLobby: returnHome,
      isRanked: lobby?.kind !== "private" && lobby?.kind !== "zen",
      mode: lobby?.kind,
    });
  }, [screen, gameKey, playAgain, returnHome, lobby?.kind]);

  async function createServer() {
    primeGameAudio();
    const code = createServerCode();
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("server", code);
    window.history.replaceState({}, "", url);
    let copied = false;
    try {
      await navigator.clipboard.writeText(url.toString());
      copied = true;
    } catch {}
    setLobby({
      kind: "private",
      code,
      shareUrl: url.toString(),
      copied,
      isHost: true,
      roster: [],
    });
    setScreen("lobby");
  }

  function joinServer(code) {
    primeGameAudio();
    const normalized = String(code)
      .replace(/[^a-z0-9]/gi, "")
      .toUpperCase()
      .slice(0, 8);
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("server", normalized);
    window.history.replaceState({}, "", url);
    setLobby({
      kind: "private",
      code: normalized,
      shareUrl: url.toString(),
      copied: false,
      isHost: false,
      roster: [],
    });
    setScreen("lobby");
  }

  function openOwnProfile() {
    setProfileView({
      ...profile,
      initials: "YOU",
      isYou: true,
    });
  }

  return (
    <div className="game-root">
      {screen === "home" && (
        <StartMenu
          profile={profile}
          onMultiplayer={enterMultiplayer}
          onQuickPlay={enterQuickPlay}
          onZen={enterZen}
          onCreateServer={createServer}
          onJoinServer={joinServer}
        />
      )}

      {screen === "lobby" && lobby && (
        <MatchLobby
          key={`${lobby.kind}-${lobby.code || "quick"}`}
          lobby={lobby}
          profile={profile}
          onStart={startMatch}
          onBack={returnHome}
          onRoster={updateRoster}
        />
      )}

      {screen === "game" && (
        <div className="app" key={gameKey} ref={appRef}>
          <GameHeader />
          <GameStage />
          <GameControls />
        </div>
      )}

      <AnimatePresence>
        {zenIntroOpen && (
          <motion.div
            className="zen-intro-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
            onClick={() => setZenIntroOpen(false)}
          >
            <motion.section
              className="zen-intro-card"
              initial={{ opacity: 0, y: 22, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="zenIntroTitle"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="zen-intro-icon">◎</div>
              <span>ZEN SESSION</span>
              <h2 id="zenIntroTitle">Study until you hit $100K.</h2>
              <p>
                No timer and no opponents. Keep this market beside your work,
                protect each position from the bust line, and let the session run.
              </p>
              <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} onClick={startZen}>
                START FOCUS SESSION
              </motion.button>
              <button className="zen-intro-cancel" onClick={() => setZenIntroOpen(false)}>
                NOT NOW
              </button>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      {!profileView && (
        <ProfileButton profile={profile} onClick={openOwnProfile} />
      )}

      {profileView && (
        <ProfilePanel
          profile={profileView}
          onBack={() => setProfileView(null)}
        />
      )}
    </div>
  );
}
