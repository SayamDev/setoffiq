import { Badge } from './ui';
import type { ConfidenceAssessment } from '../domain/types';
import styles from './ConfidenceBadge.module.css';

const WORDING: Record<ConfidenceAssessment['level'], { tone: 'good' | 'warn' | 'alert'; summary: string }> = {
  high: { tone: 'good', summary: 'Current flight, journey and weather information were all available.' },
  medium: { tone: 'warn', summary: 'Some of this recommendation is estimated rather than measured.' },
  low: { tone: 'alert', summary: 'Key information is missing or out of date. Allow extra time.' },
};

/**
 * Confidence is shown as a word, an icon and a sentence — never colour alone,
 * which would leave colour-blind users with no signal at all.
 */
export function ConfidenceBadge({
  confidence,
  showSummary = false,
}: {
  confidence: ConfidenceAssessment;
  showSummary?: boolean;
}): React.JSX.Element {
  const { tone, summary } = WORDING[confidence.level];
  const symbol = confidence.level === 'high' ? '●●●' : confidence.level === 'medium' ? '●●○' : '●○○';

  return (
    <span className={styles.wrapper}>
      <Badge tone={tone}>
        <span aria-hidden="true" className={styles.dots}>
          {symbol}
        </span>
        {confidence.level} confidence
      </Badge>
      {showSummary ? <span className={styles.summary}>{summary}</span> : null}
    </span>
  );
}
