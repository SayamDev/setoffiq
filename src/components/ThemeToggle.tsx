import type { ThemeChoice } from '../storage/settings';
import styles from './ThemeToggle.module.css';

const ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

const LABEL: Record<ThemeChoice, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

/**
 * Cycles system → light → dark. Three states rather than two, because
 * following the operating system is a legitimate preference and silently
 * dropping it the first time someone taps a toggle is a small betrayal.
 */
export function ThemeToggle({
  theme,
  onChange,
}: {
  theme: ThemeChoice;
  onChange: (theme: ThemeChoice) => void;
}): React.JSX.Element {
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={() => onChange(next)}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next]}.`}
      title={`Theme: ${LABEL[theme]}`}
    >
      <span className={styles.text}>{LABEL[theme]}</span>
    </button>
  );
}
