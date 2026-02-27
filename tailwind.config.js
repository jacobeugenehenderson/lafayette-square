/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Category hex colors (match src/tokens/categories.js)
        'cat-dining':    '#f97316',
        'cat-historic':  '#f59e0b',
        'cat-arts':      '#8b5cf6',
        'cat-parks':     '#10b981',
        'cat-shopping':  '#f43f5e',
        'cat-services':  '#0ea5e9',
        'cat-community': '#64748b',
        // Scene background
        'scene-bg': '#1a1a2e',
        // Design token surfaces
        'surface':                   'var(--surface)',
        'surface-glass':             'var(--surface-glass)',
        'surface-dim':               'var(--surface-dim)',
        'surface-container':         'var(--surface-container)',
        'surface-container-high':    'var(--surface-container-high)',
        'surface-container-highest': 'var(--surface-container-highest)',
        'surface-scrim':             'var(--surface-scrim)',
        // Design token on-surface (text/icons)
        'on-surface':          'var(--on-surface)',
        'on-surface-medium':   'var(--on-surface-medium)',
        'on-surface-variant':  'var(--on-surface-variant)',
        'on-surface-subtle':   'var(--on-surface-subtle)',
        'on-surface-disabled': 'var(--on-surface-disabled)',
        // Design token outlines
        'outline':         'var(--outline)',
        'outline-variant': 'var(--outline-variant)',
        // Status accents
        'status-success':     'var(--success)',
        'status-success-dim': 'var(--success-dim)',
        'status-error':       'var(--error)',
        'status-error-dim':   'var(--error-dim)',
        'status-info':        'var(--info)',
        'status-info-dim':    'var(--info-dim)',
        'status-warning':     'var(--warning)',
        'status-warning-dim': 'var(--warning-dim)',
      },
      fontSize: {
        'display':  'var(--type-display)',
        'headline': 'var(--type-headline)',
        'title':    'var(--type-title)',
        'body':     'var(--type-body)',
        'body-sm':  'var(--type-body-sm)',
        'label':    'var(--type-label)',
        'label-sm': 'var(--type-label-sm)',
        'caption':  'var(--type-caption)',
      },
      // borderRadius: static values (not CSS vars) to avoid extra compositing
      // layers on mobile. Values match design.css tokens but are inlined.
      borderRadius: {
        'sm':   '6px',
        'md':   '8px',
        'lg':   '12px',
        'xl':   '16px',
        '2xl':  '24px',
        'full': '9999px',
      },
      keyframes: {
        'ticker-in': {
          '0%':   { opacity: '0', transform: 'translateY(100%)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'ticker-in': 'ticker-in 400ms ease-out',
      },
    },
  },
  plugins: [],
}
