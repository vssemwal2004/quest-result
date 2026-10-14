/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#020a24', 900: '#041445', 800: '#072065', 700: '#0a2a85' },
        royal: { 700: '#0b3bb3', 600: '#1446d6', 500: '#1f5eff', 400: '#4d7dff' },
        electric: '#00c2ff',
        'cyan-glow': '#38e1ff',
        gold: { 200: '#fff1a8', 300: '#ffe066', 400: '#ffd23f', 500: '#fbbf24', 600: '#f59e0b', 700: '#c77d0a' },
        silver: '#d7dee8',
        bronze: '#d9822b',
      },
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
        display: ['Montserrat', 'Poppins', 'system-ui', 'sans-serif'],
        script: ['Caveat', 'cursive'],
        tech: ['Orbitron', 'Montserrat', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(56,225,255,.45), 0 0 64px rgba(31,94,255,.35)',
        'glow-gold': '0 0 24px rgba(255,210,63,.55), 0 0 72px rgba(245,158,11,.35)',
        glass: 'inset 0 1px 0 rgba(255,255,255,.12), 0 10px 40px rgba(2,10,36,.55)',
      },
      backgroundImage: {
        'quest-gradient': 'radial-gradient(1200px 800px at 50% 30%, #1446d6 0%, #0a2a85 40%, #041445 75%, #020a24 100%)',
        'gold-gradient': 'linear-gradient(180deg, #fff1a8 0%, #ffd23f 35%, #fbbf24 60%, #f59e0b 100%)',
        'ai-gradient': 'linear-gradient(180deg, #8fe9ff 0%, #38e1ff 30%, #1f5eff 70%, #0b3bb3 100%)',
      },
      keyframes: {
        shimmer: { '0%': { transform: 'translateX(-120%)' }, '100%': { transform: 'translateX(120%)' } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        'pulse-ring': { '0%': { transform: 'scale(.9)', opacity: '.8' }, '100%': { transform: 'scale(1.6)', opacity: '0' } },
      },
      animation: {
        shimmer: 'shimmer 2.4s ease-in-out infinite',
        floaty: 'floaty 5s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(.2,.6,.3,1) infinite',
      },
    },
  },
  plugins: [],
}
