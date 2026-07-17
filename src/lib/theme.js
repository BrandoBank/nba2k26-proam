// Design system — Next Up Series
// Sporty NBA aesthetic: heavy type, orange/gold/white on black

export const colors = {
  bg: '#000',
  surface: '#0a0a0a',
  surfaceHover: '#111',
  border: '#1a1a1a',
  borderStrong: '#2a2a2a',

  // Brand
  orange: '#f4701b',
  orangeDim: '#7a3800',
  orangeGlow: 'rgba(244,112,27,0.12)',
  gold: '#d4a017',
  goldDim: '#6a5000',
  blue: '#1d6ef5',
  blueDim: '#0a1a3a',

  // Tier colors
  elite: '#9333ea',
  eliteBg: 'rgba(147,51,234,0.08)',
  strong: '#2563eb',
  strongBg: 'rgba(37,99,235,0.08)',
  solid: '#16a34a',
  solidBg: 'rgba(22,163,74,0.08)',
  gTier: '#dc2626',
  gTierBg: 'rgba(220,38,38,0.08)',

  // Text
  textPrimary: '#fff',
  textSecondary: '#aaa',
  textMuted: '#555',
  textDim: '#333',

  // Stat colors
  statGreen: '#22c55e',
  statGold: '#eab308',
  statRed: '#ef4444',

  // Team
  teamOur: '#3b82f6',
  teamOpp: '#ef4444',
}

export const fonts = {
  display: "'Segoe UI', system-ui, -apple-system, sans-serif",
  mono: "'SF Mono', 'Fira Code', monospace",
}

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
}

// Stat cell color helper
export function statColor(value, type) {
  if (value === null || value === undefined) return colors.textMuted
  if (type === 'fg' || type === '3p') {
    if (value >= 60) return colors.statGreen
    if (value >= 50) return colors.statGold
    return colors.statRed
  }
  if (type === 'tov') {
    if (value <= 0.8) return colors.statGreen
    if (value <= 1.9) return colors.statGold
    return colors.statRed
  }
  if (type === 'apg' && value >= 8) return colors.statGreen
  if (type === 'spg' && value >= 2) return colors.statGreen
  if (type === 'bpg' && value >= 1.5) return colors.statGreen
  return colors.textSecondary
}
