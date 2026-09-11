import styles from './Wordmark.module.css';

/**
 * The brand, defined once.
 *
 * It was previously written out as plain text in the hero and as marked-up
 * text in the masthead, so the two disagreed about whether the IQ was green.
 * Anywhere the name appears as a mark rather than as prose should use this.
 */
export function Wordmark({ as: Element = 'span' }: { as?: 'span' | 'h1' }): React.JSX.Element {
  return (
    <Element className={styles.wordmark}>
      Setoff<span className={styles.mark}>IQ</span>
    </Element>
  );
}
