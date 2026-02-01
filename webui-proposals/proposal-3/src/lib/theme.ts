export const accentPresets: Record<string, { name: string; rgb: string; hex: string }> = {
  indigo:  { name: 'Indigo',  rgb: '99, 102, 241',  hex: '#6366F1' },
  emerald: { name: 'Emerald', rgb: '16, 185, 129',  hex: '#10B981' },
  rose:    { name: 'Rose',    rgb: '244, 63, 94',    hex: '#F43F5E' },
  amber:   { name: 'Amber',   rgb: '245, 158, 11',   hex: '#F59E0B' },
  sky:     { name: 'Sky',     rgb: '14, 165, 233',   hex: '#0EA5E9' },
  violet:  { name: 'Violet',  rgb: '139, 92, 246',   hex: '#8B5CF6' },
};

export const lightColors = {
  bg: '#F8F7F4',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceHover: 'rgba(0, 0, 0, 0.04)',
  text: '#1C1917',
  textSecondary: '#78716C',
  textTertiary: '#A8A29E',
  border: 'rgba(0, 0, 0, 0.08)',
  glassBg: 'rgba(255, 255, 255, 0.85)',
  glassBorder: 'rgba(0, 0, 0, 0.06)',
  shadow: 'rgba(0, 0, 0, 0.06)',
};

export const darkColors = {
  bg: '#1C1917',
  surface: '#292524',
  surfaceElevated: '#292524',
  surfaceHover: 'rgba(255, 255, 255, 0.06)',
  text: '#F5F5F4',
  textSecondary: '#A8A29E',
  textTertiary: '#78716C',
  border: 'rgba(255, 255, 255, 0.08)',
  glassBg: 'rgba(255, 255, 255, 0.04)',
  glassBorder: 'rgba(255, 255, 255, 0.06)',
  shadow: 'rgba(0, 0, 0, 0.3)',
};

export const amoledColors = {
  ...darkColors,
  bg: '#000000',
  surface: '#0A0A0A',
  surfaceElevated: '#141414',
  glassBg: 'rgba(255, 255, 255, 0.03)',
};

export type ThemeColors = typeof lightColors;

export function getColors(theme: 'light' | 'dark' | 'amoled' | 'auto'): ThemeColors {
  if (theme === 'light') return lightColors;
  if (theme === 'amoled') return amoledColors;
  if (theme === 'auto') {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? darkColors : lightColors;
  }
  return darkColors;
}

export function applyThemeVars(colors: ThemeColors, accent: string) {
  const root = document.documentElement;
  const a = accentPresets[accent] || accentPresets.indigo;
  root.style.setProperty('--bg', colors.bg);
  root.style.setProperty('--surface', colors.surface);
  root.style.setProperty('--surface-elevated', colors.surfaceElevated);
  root.style.setProperty('--surface-hover', colors.surfaceHover);
  root.style.setProperty('--text', colors.text);
  root.style.setProperty('--text-secondary', colors.textSecondary);
  root.style.setProperty('--text-tertiary', colors.textTertiary);
  root.style.setProperty('--border', colors.border);
  root.style.setProperty('--glass-bg', colors.glassBg);
  root.style.setProperty('--glass-border', colors.glassBorder);
  root.style.setProperty('--shadow-color', colors.shadow);
  root.style.setProperty('--accent', a.hex);
  root.style.setProperty('--accent-rgb', a.rgb);
  root.style.setProperty('--success', '#10B981');
  root.style.setProperty('--danger', '#EF4444');
  root.style.setProperty('--warning', '#F59E0B');
  root.style.setProperty('--info', '#0EA5E9');
}
