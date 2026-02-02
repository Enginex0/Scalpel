// Detects text overflow and adds horizontal scroll animation via CSS custom properties.
// Pattern adapted from systemapp_nuker's util.js overflow detection.

export function setupTextScroll(el: HTMLElement) {
  requestAnimationFrame(() => {
    const parent = el.parentElement;
    if (!parent) return;

    const scrollAmount = el.scrollWidth - parent.clientWidth;
    if (scrollAmount <= 0) return;

    const adjustedScroll = scrollAmount + 10;
    const scrollTime = Math.max(3, adjustedScroll / 15);

    el.style.setProperty('--scroll-distance', `-${adjustedScroll}px`);
    el.style.setProperty('--scroll-time', `${scrollTime}s`);
    el.classList.add('text-scroll');
  });
}
