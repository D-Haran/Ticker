export const MATCH_PROTOCOL_VERSION = 1;

export const MATCH_EVENTS = Object.freeze({
  PLAYER_JOINED: "player.joined",
  PLAYER_LEFT: "player.left",
  TRADE_OPENED: "trade.opened",
  TRADE_CLOSED: "trade.closed",
  PLAYER_ELIMINATED: "player.eliminated",
  MATCH_SNAPSHOT: "match.snapshot",
  MATCH_FINISHED: "match.finished",
});

export function createMatchEnvelope(type, payload, matchId) {
  return {
    version: MATCH_PROTOCOL_VERSION,
    type,
    matchId,
    sentAt: Date.now(),
    payload,
  };
}

export function createPublicCompetitorState(competitor) {
  return {
    id: competitor.id,
    name: competitor.name,
    rating: competitor.rating,
    balance: competitor.balance,
    strikes: competitor.losses,
    wins: competitor.wins,
    holding: competitor.holding,
    eliminated: competitor.eliminated,
  };
}
