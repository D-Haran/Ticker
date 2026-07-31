export default function GameControls() {
  return (
    <footer className="controls">
      <button className="btn btn-sell" id="sellBtn" type="button" disabled>
        SELL ▼ <span className="key">S</span>
      </button>
      <button className="btn btn-buy" id="buyBtn" type="button">
        BUY ▲ <span className="key">B</span>
      </button>
    </footer>
  );
}
