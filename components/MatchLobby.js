"use client";

import { useEffect, useRef, useState } from "react";
import MenuBackdrop from "./MenuBackdrop";
import { connectPrivateRoom } from "../lib/multiplayer/private-room";

const NETWORK_NODES = Array.from({ length: 36 }, (_, index) => {
  const inner = index >= 24;
  const ringIndex = inner ? index - 24 : index;
  const ringCount = inner ? 12 : 24;
  const angle = (ringIndex / ringCount) * Math.PI * 2 - Math.PI / 2;
  const radius = inner ? 72 : 132;
  return {
    x: 160 + Math.cos(angle) * radius,
    y: 160 + Math.sin(angle) * radius,
    inner,
  };
});

const NETWORK_EDGES = [
  ...Array.from({ length: 24 }, (_, index) => [index, (index + 1) % 24]),
  ...Array.from({ length: 12 }, (_, index) => [24 + index, 24 + ((index + 1) % 12)]),
  ...Array.from({ length: 12 }, (_, index) => [index * 2, 24 + index]),
];

export default function MatchLobby({ lobby, profile, onStart, onBack, onRoster }) {
  const [players, setPlayers] = useState(lobby.kind === "multiplayer" ? 37 : 1);
  const [privatePlayers, setPrivatePlayers] = useState([]);
  const [countdown, setCountdown] = useState(15);
  const [copied, setCopied] = useState(Boolean(lobby.copied));
  const [launching, setLaunching] = useState(false);
  const launchRef = useRef(false);
  const roomRef = useRef(null);
  const ready = lobby.kind === "multiplayer" && (players >= 100 || countdown <= 0);

  useEffect(() => {
    if (lobby.kind !== "multiplayer") return undefined;
    const joinTimer = window.setInterval(() => {
      setPlayers((current) =>
        Math.min(
          100,
          current + 4 + Math.floor(Math.random() * 8),
        ),
      );
    }, 650);
    const countdownTimer = window.setInterval(() => {
      setCountdown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => {
      window.clearInterval(joinTimer);
      window.clearInterval(countdownTimer);
    };
  }, [lobby.kind]);

  useEffect(() => {
    if (lobby.kind !== "private") return undefined;
    const connection = connectPrivateRoom({
      code: lobby.code,
      profile,
      isHost: Boolean(lobby.isHost),
      onPlayers: (roomPlayers) => {
        setPrivatePlayers(roomPlayers);
        onRoster?.(roomPlayers);
      },
      onStart: () => {
        if (launchRef.current) return;
        launchRef.current = true;
        setLaunching(true);
        window.setTimeout(onStart, 550);
      },
    });
    roomRef.current = connection;
    return () => {
      connection.dispose();
      roomRef.current = null;
    };
  }, [lobby.kind, lobby.code, lobby.isHost, profile, onRoster, onStart]);

  useEffect(() => {
    if (launchRef.current || !ready) return;
    launchRef.current = true;
    setLaunching(true);
    const timer = window.setTimeout(onStart, 700);
    return () => window.clearTimeout(timer);
  }, [ready, onStart]);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(lobby.shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function startPrivateMatch() {
    roomRef.current?.start();
  }

  const isPrivate = lobby.kind === "private";
  const playerCount = isPrivate ? Math.max(1, privatePlayers.length) : players;
  const progress = isPrivate
    ? Math.min(100, (playerCount / 12) * 100)
    : Math.min(100, players);
  const activeNodes = Math.max(
    1,
    Math.ceil((progress / 100) * NETWORK_NODES.length),
  );

  return (
    <main className="matchmaking-screen">
      <MenuBackdrop />
      <button className="lobby-back" type="button" onClick={onBack}>
        ← BACK
      </button>
      <section className={`matchmaking-card${isPrivate ? " private-matchmaking-card" : ""}`}>
        <div className="queue-network">
          <svg viewBox="0 0 320 320" aria-hidden="true">
            <circle className="network-orbit orbit-outer" cx="160" cy="160" r="132" />
            <circle className="network-orbit orbit-inner" cx="160" cy="160" r="72" />
            {NETWORK_EDGES.map(([from, to], index) => {
              const start = NETWORK_NODES[from];
              const end = NETWORK_NODES[to];
              const active = from < activeNodes && to < activeNodes;
              return (
                <line
                  className={active ? "network-edge active" : "network-edge"}
                  key={`${from}-${to}`}
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  style={{ animationDelay: `${index * -55}ms` }}
                />
              );
            })}
          </svg>
          <div className="network-node-layer" aria-hidden="true">
            {NETWORK_NODES.map((node, index) => (
              <i
                className={index < activeNodes ? "network-node active" : "network-node"}
                key={index}
                style={{
                  left: `${(node.x / 320) * 100}%`,
                  top: `${(node.y / 320) * 100}%`,
                  animationDelay: `${(index % 9) * 80}ms`,
                }}
              />
            ))}
          </div>
          <div className="queue-core">
            <strong>{isPrivate ? playerCount : Math.round(progress)}</strong>
            {!isPrivate && <span>/100</span>}
            <small>TRADERS</small>
          </div>
          <div className="join-pulse" key={playerCount} />
        </div>

        <div className="queue-kicker">
          {isPrivate ? `PRIVATE SERVER • ${lobby.code}` : "RANKED MULTIPLAYER"}
        </div>
        <h2>
          {launching
            ? "MARKET OPENING"
            : isPrivate
              ? lobby.isHost
                ? "YOUR TRADING ROOM"
                : "WAITING FOR HOST"
              : "FINDING TRADERS"}
        </h2>
        <p>
          {launching
            ? "Locking the traders and opening the market…"
            : isPrivate
              ? lobby.isHost
                ? "Share the code, watch your friends join, then start whenever you are ready."
                : "You are in. The creator will start the market when everyone is ready."
              : "The match starts when the lobby fills or the timer reaches zero."}
        </p>

        {!isPrivate && (
          <>
            <div className="queue-timer">
              <span>STARTING IN</span>
              <strong>{launching ? "GO" : countdown}</strong>
            </div>
            <div className="queue-progress">
              <div style={{ width: `${progress}%` }} />
            </div>
          </>
        )}

        {isPrivate && (
          <>
            <div className="private-roster">
              {privatePlayers.map((roomPlayer) => (
                <div className="private-player" key={roomPlayer.id}>
                  <i style={{ "--room-player-color": roomPlayer.color }}>
                    {roomPlayer.initials}
                  </i>
                  <span>
                    <strong>{roomPlayer.name}</strong>
                    <small>{roomPlayer.rating} ELO</small>
                  </span>
                  <b>{roomPlayer.isHost ? "HOST" : "READY"}</b>
                </div>
              ))}
            </div>
            <div className="invite-box">
              <div>
                <span>SERVER CODE</span>
                <strong>{lobby.code}</strong>
              </div>
              <button type="button" onClick={copyInvite}>
                {copied ? "COPIED ✓" : "COPY LINK"}
              </button>
            </div>
            {lobby.isHost ? (
              <button
                className="private-start-button"
                type="button"
                disabled={launching}
                onClick={startPrivateMatch}
              >
                {launching ? "OPENING MARKET…" : "START GAME"}
              </button>
            ) : (
              <div className="private-waiting"><i /> HOST CONTROLS THE START</div>
            )}
          </>
        )}

        <div className="queue-note">
          <span className="lobby-live-dot" />
          {isPrivate ? `${playerCount} TRADER${playerCount === 1 ? "" : "S"} READY • UNRANKED` : "Matching near your ELO"}
        </div>
      </section>
    </main>
  );
}
