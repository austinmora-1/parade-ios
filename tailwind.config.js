/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        marigold: 'hsl(var(--marigold))',
        evergreen: 'hsl(var(--evergreen))',
        chalk: 'hsl(var(--chalk))',
        butter: 'hsl(var(--butter))',
        sage: 'hsl(var(--sage))',
        ember: 'hsl(var(--ember))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          glow: 'hsl(var(--primary-glow))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        activity: {
          food: 'hsl(var(--activity-food))',
          coffee: 'hsl(var(--activity-coffee))',
          drinks: 'hsl(var(--activity-drinks))',
          workout: 'hsl(var(--activity-workout))',
          misc: 'hsl(var(--activity-misc))',
          'me-time': 'hsl(var(--activity-me-time))',
        },
        available: {
          DEFAULT: 'hsl(var(--available))',
          light: 'hsl(var(--available-light))',
        },
        partial: {
          DEFAULT: 'hsl(var(--partial))',
          light: 'hsl(var(--partial-light))',
        },
        busy: {
          DEFAULT: 'hsl(var(--busy))',
          light: 'hsl(var(--busy-light))',
        },
        away: {
          DEFAULT: 'hsl(var(--away))',
          light: 'hsl(var(--away-light))',
        },
        today: 'hsl(var(--today))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
      },
      fontFamily: {
        display: ['CormorantGaramond_500Medium', 'Georgia', 'serif'],
        sans: ['Poppins_400Regular', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
