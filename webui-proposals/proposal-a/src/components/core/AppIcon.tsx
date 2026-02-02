import { onCleanup } from 'solid-js';
import { getPackagesIcons } from '../../lib/ksuApi';
import './AppIcon.css';

interface AppIconProps {
  packageName: string;
  source: 'file' | 'ksu';
  size?: number;
  appName?: string;
}

const ksuIconCache = new Map<string, string>();
const FALLBACK_PATH = 'M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z';

function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 50%, 40%)`;
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function showFallback(img: HTMLImageElement) {
  img.style.display = 'none';
  const container = img.parentElement;
  if (!container) return;
  // Prefer initials fallback if it exists
  const initials = container.querySelector('.app-icon__initials') as HTMLElement | null;
  if (initials && initials.textContent) {
    initials.style.display = 'flex';
    return;
  }
  const svg = container.querySelector('.app-icon__fallback') as HTMLElement | null;
  if (svg) svg.style.display = 'block';
}

function setImgSrc(img: HTMLImageElement, src: string) {
  img.onload = () => { img.style.opacity = '1'; };
  img.onerror = () => showFallback(img);
  img.src = src;
}

function setupKsuIcon(container: HTMLElement, packageName: string, isDisposed: () => boolean): IntersectionObserver | null {
  const img = container.querySelector('img') as HTMLImageElement | null;
  if (!img) return null;

  if (ksuIconCache.has(packageName)) {
    setImgSrc(img, ksuIconCache.get(packageName)!);
    return null;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.disconnect();

      // Re-check after scroll (another instance may have loaded while off-screen)
      if (ksuIconCache.has(packageName)) {
        setImgSrc(img, ksuIconCache.get(packageName)!);
        return;
      }

      getPackagesIcons([packageName], 100).then((icons) => {
        if (isDisposed()) return;
        const dataUri = icons[0]?.icon;
        if (dataUri) {
          ksuIconCache.set(packageName, dataUri);
          setImgSrc(img, dataUri);
        } else {
          showFallback(img);
        }
      }).catch(() => showFallback(img));
    }
  }, { rootMargin: '100px', threshold: 0.1 });

  observer.observe(container);
  return observer;
}

export function AppIcon(props: AppIconProps) {
  const sz = () => props.size || 40;
  let observer: IntersectionObserver | null = null;
  let disposed = false;

  onCleanup(() => { disposed = true; observer?.disconnect(); observer = null; });

  const initials = () => props.appName ? getInitials(props.appName) : '';
  const bgColor = () => hashColor(props.packageName);
  const fontSize = () => Math.round((sz() - 8) * 0.45);

  return (
    <div
      class={`app-icon ${sz() === 36 ? 'app-icon--36' : 'app-icon--40'}`}
      ref={(el) => {
        if (!el) return;
        const img = el.querySelector('img') as HTMLImageElement | null;
        if (props.source === 'file' && img) {
          setImgSrc(img, `icons/${props.packageName}.png`);
        } else {
          observer = setupKsuIcon(el, props.packageName, () => disposed);
        }
      }}
    >
      <img
        width={sz() - 8}
        height={sz() - 8}
        class="app-icon__img"
        style="opacity: 0;"
        onError={(e) => showFallback(e.target as HTMLImageElement)}
      />
      <div
        class="app-icon__initials"
        style={`background:${bgColor()};font-size:${fontSize()}px;width:${sz() - 4}px;height:${sz() - 4}px;`}
      >
        {initials()}
      </div>
      <svg
        width={sz() - 12}
        height={sz() - 12}
        viewBox="0 0 24 24"
        fill="var(--text-tertiary)"
        class="app-icon__fallback"
      >
        <path d={FALLBACK_PATH} />
      </svg>
    </div>
  );
}
