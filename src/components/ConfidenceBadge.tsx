import { Badge } from './ui';
import type { ConfidenceAssessment } from '../domain/types';
import styles from './ConfidenceBadge.module.css';

const WORDING: Record<
  ConfidenceAssessment['level'],
  { tone: 'good' | 'warn' | 'alert'; filled: number; summary: string }
> = {
  high: {
    tone: 'good',
    filled: 3,
    summary: 'Current flight, journey and weather information were all available.',
  },
  medium: {
    tone: 'warn',
    filled: 2,
    summary: 'Some of this recommendation is estimated rather than measured.',
  },
  low: {
    tone: 'alert',
    filled: 1,
    summary: 'Key information is missing or out of date. Allow extra time.',
  },
};

/**
 * Confidence as a word, a fill level and a sentence — never colour alone,
 * which would leave colour-blind users with nothing to read.
 */
export function ConfidenceBadge({
  confidence,
  showSummary = false,
}: {
  confidence: ConfidenceAssessment;
  showSummary?: boolean;
}): React.JSX.Element {
  const { tone, filled, summary } = WORDING[confidence.level];

  return (
    <span className={styles.wrapper}>
      <Badge tone={tone}>
        <span className={styles.marks} aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span key={index} className={index < filled ? styles.markOn : styles.mark} />
          ))}
        </span>
        {confidence.level} confidence
      </Badge>
      {showSummary ? <span className={styles.summary}>{summary}</span> : null}
    </span>
  );
}
