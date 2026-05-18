/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Outfit', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
            },
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",

                // Material Design 3 Contextual Colors
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                    container: "hsl(var(--primary-container))",
                    "on-container": "hsl(var(--on-primary-container))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                    container: "hsl(var(--secondary-container))",
                    "on-container": "hsl(var(--on-secondary-container))",
                },
                tertiary: {
                    DEFAULT: "hsl(var(--tertiary))",
                    foreground: "hsl(var(--tertiary-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },

                // Specific Brand Aliases
                'gable-green': '#00FFA3',
                'deep-space': '#0A0B10', // Surface 0
                'slate-steel': '#161821', // Surface 1
                'surface-2': '#1E2029',   // Surface 2 (Cards)
                'surface-3': '#252836',   // Surface 3 (Modals)
                'safety-red': '#F43F5E',
                'blueprint-blue': '#38BDF8'
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
                'xl': '1.5rem', // MD3 Large (24dp)
                '2xl': '2rem',  // MD3 Extra Large (32dp)
            },
            boxShadow: {
                'elevation-1': '0px 1px 2px rgba(0, 0, 0, 0.3), 0px 1px 3px 1px rgba(0, 0, 0, 0.15)',
                'elevation-2': '0px 1px 2px rgba(0, 0, 0, 0.3), 0px 2px 6px 2px rgba(0, 0, 0, 0.15)',
                'elevation-3': '0px 1px 3px rgba(0, 0, 0, 0.3), 0px 4px 8px 3px rgba(0, 0, 0, 0.15)',
                'glow': '0 0 15px rgba(0, 255, 163, 0.3)',
                'glow-strong': '0 0 25px rgba(0, 255, 163, 0.5)',
            },
            animation: {
                'fade-in': 'fadeIn 0.3s cubic-bezier(0.2, 0.0, 0, 1.0)', // Emphasized easing
                'slide-up': 'slideUp 0.4s cubic-bezier(0.2, 0.0, 0, 1.0)',
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'shimmer': 'shimmer 2s linear infinite',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { transform: 'translateY(10px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
                shimmer: {
                    '0%': { backgroundPosition: '-1000px 0' },
                    '100%': { backgroundPosition: '1000px 0' }
                }
            }
        }
    },
}
