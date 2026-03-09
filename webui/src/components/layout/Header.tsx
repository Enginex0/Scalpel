import './Header.css';
import { ICONS } from '../../lib/icons';

export function Header() {
  return (
    <header class="header">
      <div class="header__content">
        <div class="blade-mark-wrapper header__blade">
          <svg viewBox="0 0 24 24" width="24" height="24" class="header__blade-svg">
            <defs>
              <linearGradient id="blade-grad-header" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" style={`stop-color: var(--text-accent)`} />
                <stop offset="100%" style="stop-color: rgba(var(--accent-rgb), 0.6)" />
              </linearGradient>
            </defs>
            <path d={ICONS.scalpelBlade} fill="url(#blade-grad-header)" />
          </svg>
        </div>
        <div class="header__text">
          <h1 class="header__title gradient-text">SCALPEL</h1>
          <span class="header__subtitle">surgical debloat</span>
        </div>
      </div>
      <div class="incision-line" />
    </header>
  );
}
