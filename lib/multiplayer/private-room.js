const ROOM_CHANNEL_PREFIX = "ticker-private-room-v1:";

function sessionPlayerId() {
  const key = "ticker-private-player-id";
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID?.() ||
      `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(key, id);
    return id;
  } catch {
    return `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function publicPlayer(profile, isHost) {
  const name = profile?.username || "TRADER";
  return {
    id: sessionPlayerId(),
    name,
    initials: name.slice(0, 2).toUpperCase(),
    color: profile?.avatarColor || "#17d67f",
    rating: profile?.rating || 1000,
    isHost,
    joinedAt: Date.now(),
  };
}

export function connectPrivateRoom({
  code,
  profile,
  isHost,
  onPlayers,
  onStart,
}) {
  const roomCode = String(code || "").toUpperCase();
  const me = publicPlayer(profile, isHost);
  const players = new Map([[me.id, { ...me, seenAt: Date.now() }]]);
  const channel = typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(`${ROOM_CHANNEL_PREFIX}${roomCode}`)
    : null;
  let disposed = false;

  const visiblePlayers = () =>
    Array.from(players.values())
      .sort((a, b) => Number(b.isHost) - Number(a.isHost) || a.joinedAt - b.joinedAt)
      .map(({ seenAt: _seenAt, ...player }) => player);

  const emit = () => onPlayers?.(visiblePlayers());
  const send = (message) => channel?.postMessage({
    ...message,
    roomCode,
    senderId: me.id,
    sentAt: Date.now(),
  });
  const sendSnapshot = () => {
    if (!isHost) return;
    send({ type: "room.snapshot", players: visiblePlayers() });
  };

  if (channel) {
    channel.onmessage = ({ data }) => {
      if (disposed || !data || data.roomCode !== roomCode) return;
      if (isHost && (data.type === "room.join" || data.type === "room.heartbeat")) {
        const incoming = data.player;
        if (!incoming?.id) return;
        const existing = players.get(incoming.id);
        players.set(incoming.id, {
          ...existing,
          ...incoming,
          isHost: false,
          seenAt: Date.now(),
        });
        emit();
        sendSnapshot();
        return;
      }
      if (isHost && data.type === "room.leave") {
        players.delete(data.senderId);
        emit();
        sendSnapshot();
        return;
      }
      if (!isHost && data.type === "room.snapshot") {
        players.clear();
        (data.players || []).forEach((player) => {
          players.set(player.id, { ...player, seenAt: Date.now() });
        });
        if (!players.has(me.id)) players.set(me.id, { ...me, seenAt: Date.now() });
        emit();
        return;
      }
      if (!isHost && data.type === "room.start") onStart?.();
    };
  }

  emit();
  send({ type: "room.join", player: me });

  const heartbeat = window.setInterval(() => {
    if (disposed) return;
    if (isHost) {
      const cutoff = Date.now() - 6000;
      let changed = false;
      players.forEach((player, id) => {
        if (!player.isHost && player.seenAt < cutoff) {
          players.delete(id);
          changed = true;
        }
      });
      if (changed) emit();
      sendSnapshot();
    } else {
      send({ type: "room.heartbeat", player: me });
    }
  }, 1800);

  return {
    start() {
      if (!isHost || disposed) return;
      send({ type: "room.start" });
      onStart?.();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.clearInterval(heartbeat);
      send({ type: "room.leave" });
      channel?.close();
    },
  };
}
