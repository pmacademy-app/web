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
