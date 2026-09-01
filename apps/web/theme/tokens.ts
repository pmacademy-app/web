/**
 * Centralized Design System Tokens
 * Source of truth for theme colors, typography, and styling used in compiler and UI.
 */
export const TOKENS = {
  colors: {
    primary: '#1F6B4E',
    primaryForeground: '#FFFFFF',
    accent: '#D98B24',
    accentForeground: '#211204',
    background: '#FBFAF6',
    foreground: '#171A17',
    surface: '#FFFFFF',
    surfaceMuted: '#F2EFE7',
    border: '#DED8CB',
    borderStrong: '#BDB4A2',
    purple: '#7C3AED',
    textMuted: '#70685A',
    cream: '#FFD9A0',
    mint: '#EAF5EF',
    dark: {
      primary: '#66D6A3',
      accent: '#FFB454',
      background: '#0E1110',
      foreground: '#F4F1E8',
      surface: '#161A18',
      surfaceMuted: '#202520',
      border: '#343A34',
      purple: '#A78BFA',
      textMuted: '#9EA59D',
    },
    /**
     * Admin Panel — premium dark SaaS palette (Phase 1).
     * Scoped to the admin console via the `.admin-console` class in globals.css.
     * Brand-derived: navy foundation (#011229 family) + green accent (#019E75).
     */
    admin: {
      background: '#050B14',
      surface: '#0A1426',
      surfaceRaised: '#0F1C33',
      border: 'rgba(255, 255, 255, 0.08)',
      borderStrong: 'rgba(255, 255, 255, 0.14)',
      foreground: '#F3F4F6',
      muted: '#9CA3AF',
      subtle: '#6B7684',
      accent: '#019E75',
      accentForeground: '#FFFFFF',
      accentSoft: 'rgba(1, 158, 117, 0.12)',
      success: '#4ADE80',
      successSoft: 'rgba(74, 222, 128, 0.12)',
      warning: '#FACC15',
      warningSoft: 'rgba(250, 204, 21, 0.12)',
      danger: '#FB7185',
      dangerSoft: 'rgba(251, 113, 133, 0.12)',
      info: '#60A5FA',
      infoSoft: 'rgba(96, 165, 250, 0.12)',
      neutral: '#94A3B8',
    },
  },
  typography: {
    sans: 'var(--font-inter), system-ui, -apple-system, sans-serif',
    display: 'var(--font-inter), system-ui, -apple-system, sans-serif',
  },
  borderRadius: {
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
  },
} as const

export type ThemeTokens = typeof TOKENS
