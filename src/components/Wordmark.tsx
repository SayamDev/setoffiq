import styles from './Wordmark.module.css';

/**
 * The brand, defined once.
 *
 * It was previously written out as plain text in the hero and as marked-up
 * text in the masthead, so the two disagreed about whether the IQ was green.
 * Anywhere the name appears as a mark rather than as prose should use this.
 *
 * The "o" of "off" is the app icon's clock dial, and the whole of "off" leans
 * forward: the moment you set off. Because the dial is a drawing rather than a
 * letter, the mark is exposed as a single image named "SetoffIQ" — otherwise a
 * screen reader would announce "Set", then nothing, then "ffIQ".
 */
export function Wordmark({ as: Element = 'span' }: { as?: 'span' | 'h1' }): React.JSX.Element {
  return (
    <Element className={styles.wordmark}>
      <span role="img" aria-label="SetoffIQ">
        Set
        <span className={styles.off}>
          <span className={styles.dial}>
            <svg viewBox="0 0 20 20" focusable="false">
              <circle className={styles.ring} cx="10" cy="10" r="7.9" />
              <path className={styles.hand} d="M10 5.2V10l3.6 2.2" />
            </svg>
          </span>
          ff
        </span>
        <span className={styles.mark}>IQ</span>
      </span>
    </Element>
  );
}
