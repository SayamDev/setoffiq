import type { ReactNode } from 'react';
import styles from './ui.module.css';

export { styles as ui };

export function Card({
  children,
  quiet = false,
  as: Element = 'section',
  ...rest
}: {
  children: ReactNode;
  quiet?: boolean;
  as?: 'section' | 'article' | 'div';
} & React.HTMLAttributes<HTMLElement>): React.JSX.Element {
  return (
    <Element className={quiet ? styles.cardQuiet : styles.card} {...rest}>
      {children}
    </Element>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'good' | 'warn' | 'alert';
  children: ReactNode;
}): React.JSX.Element {
  const className = {
    neutral: styles.badgeNeutral,
    good: styles.badgeGood,
    warn: styles.badgeWarn,
    alert: styles.badgeAlert,
  }[tone];
  return <span className={className}>{children}</span>;
}

export function Callout({
  tone = 'info',
  title,
  children,
  role,
}: {
  tone?: 'info' | 'good' | 'warn' | 'alert';
  title?: string;
  children: ReactNode;
  role?: 'status' | 'alert';
}): React.JSX.Element {
  const className = {
    info: styles.calloutInfo,
    good: styles.calloutGood,
    warn: styles.calloutWarn,
    alert: styles.calloutAlert,
  }[tone];
  return (
    <div className={className} role={role}>
      {title ? <p className={styles.calloutTitle}>{title}</p> : null}
      {children}
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

const BUTTON_CLASS: Record<ButtonVariant, string> = {
  primary: styles.button!,
  secondary: styles.buttonSecondary!,
  quiet: styles.buttonQuiet!,
  danger: styles.buttonDanger!,
};

export function Button({
  variant = 'primary',
  block = false,
  className,
  ...rest
}: {
  variant?: ButtonVariant;
  block?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <button
      type="button"
      className={[BUTTON_CLASS[variant], block ? styles.buttonBlock : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
}

export function LinkButton({
  variant = 'primary',
  block = false,
  className,
  ...rest
}: {
  variant?: ButtonVariant;
  block?: boolean;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>): React.JSX.Element {
  return (
    <a
      className={[BUTTON_CLASS[variant], block ? styles.buttonBlock : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}): React.JSX.Element {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p className={styles.errorText} id={errorId}>
          <span aria-hidden="true">✕</span>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export function Skeleton({ height = '1rem', width = '100%' }: { height?: string; width?: string }) {
  return <div className={styles.skeleton} style={{ height, width }} aria-hidden="true" />;
}

export function DataPair({ term, children }: { term: string; children: ReactNode }): React.JSX.Element {
  return (
    <div>
      <dt className={styles.dataTerm}>{term}</dt>
      <dd className={styles.dataValue}>{children}</dd>
    </div>
  );
}
