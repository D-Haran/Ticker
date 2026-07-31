export default function MenuBackdrop() {
  return (
    <div className="menu-backdrop" aria-hidden="true">
      <div className="menu-grid" />
      <svg viewBox="0 0 1000 600" preserveAspectRatio="none">
        <defs>
          <linearGradient id="menuChartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#17d67f" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#17d67f" stopOpacity="0" />
          </linearGradient>
          <filter id="menuGlow">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          className="menu-chart-area"
          d="M0 470 L70 450 L125 462 L185 398 L240 420 L300 330 L360 365 L420 285 L485 310 L545 225 L610 260 L675 178 L735 210 L790 118 L850 150 L915 72 L1000 105 L1000 600 L0 600 Z"
        />
        <path
          className="menu-chart-line"
          filter="url(#menuGlow)"
          d="M0 470 L70 450 L125 462 L185 398 L240 420 L300 330 L360 365 L420 285 L485 310 L545 225 L610 260 L675 178 L735 210 L790 118 L850 150 L915 72 L1000 105"
        />
      </svg>
      <div className="menu-chart-ticker ticker-one">+$1,284</div>
      <div className="menu-chart-ticker ticker-two">BUY</div>
      <div className="menu-chart-ticker ticker-three">+$742</div>
    </div>
  );
}
