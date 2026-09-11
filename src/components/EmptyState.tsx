import type { ReactNode } from 'react';
import styles from './JourneyExtras.module.css';

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}): React.JSX.Element {
  return (
    <div className={styles.empty} role="status">
      <p className={styles.emptyTitle}>{title}</p>
      <p className={styles.emptyBody}>{children}</p>
      {action}
    </div>
  );
}
