import { useThemeStore } from '../store/themeStore';

const ThemeToggle = () => {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Light mode yoqish' : 'Dark mode yoqish'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      className={`group relative h-10 w-[82px] shrink-0 overflow-hidden rounded-full border shadow-sm transition-all duration-300 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-primary/20 ${
        isDark
          ? 'border-outline-variant bg-surface-dim shadow-[0_12px_26px_rgba(0,0,0,0.32)]'
          : 'border-primary/15 bg-primary-fixed shadow-[0_10px_22px_rgba(0,108,73,0.16)]'
      }`}
    >
      <span
        className={`absolute inset-0 transition-opacity duration-300 ${
          isDark ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <span className="absolute left-3 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full bg-white shadow-[0_2px_8px_rgba(255,255,255,0.45)]" />
        <span className="absolute right-4 top-2 h-2.5 w-2.5 rounded-full bg-white/95" />
        <span className="absolute right-8 top-[18px] h-1.5 w-1.5 rounded-full bg-white/90" />
      </span>

      <span
        className={`absolute inset-0 transition-opacity duration-300 ${
          isDark ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="absolute left-4 top-3 h-2.5 w-2.5 rotate-45 rounded-[3px] bg-white shadow-[0_0_10px_rgba(255,255,255,0.45)]" />
        <span className="absolute left-8 top-5 h-1.5 w-1.5 rounded-full bg-white/90" />
        <span className="absolute left-11 top-2.5 h-1.5 w-1.5 rounded-full bg-white/90" />
        <span className="absolute right-4 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.38)]" />
        <span className="absolute right-7 top-1/2 h-7 w-7 -translate-y-[55%] rounded-full bg-surface-dim" />
      </span>

      <span
        className={`absolute inset-0 rounded-full bg-white/0 transition-colors duration-300 group-hover:bg-white/10 ${
          isDark ? 'group-hover:bg-white/8' : ''
        }`}
      />
    </button>
  );
};

export default ThemeToggle;
