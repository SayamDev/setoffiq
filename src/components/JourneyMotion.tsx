import { useEffect, useRef } from 'react';

/** A small, lazy animation: speech bars settle into a steady row.
 * It illustrates the guide, never claims to measure the visitor's microphone. */
export function JourneyMotion({
  beat = 0,
}: {
  beat?: number;
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let animation: import('lottie-web').AnimationItem | undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    void import('lottie-web/build/player/lottie_light').then(
      ({ default: lottie }) => {
        if (disposed || !host.current) return;
        animation = lottie.loadAnimation({
          container: host.current,
          renderer: 'svg',
          loop: false,
          autoplay: !reduced?.matches,
          path: `${import.meta.env.BASE_URL}projects/voice-guide/scene-1/lottie.json`,
          rendererSettings: { progressiveLoad: true },
        });
        animation.addEventListener('DOMLoaded', () => {
          if (reduced?.matches) animation?.goToAndStop(71, true);
        });
      },
    ).catch(() => { /* The guide remains usable if optional motion fails to load. */ });
    const changed = () => {
      if (reduced?.matches) animation?.goToAndStop(71, true);
    };
    reduced?.addEventListener('change', changed);
    return () => {
      disposed = true;
      animation?.destroy();
      reduced?.removeEventListener('change', changed);
    };
  }, [beat]);
  return (
    <div ref={host} aria-hidden="true" style={{ width: 128, height: 72 }} />
  );
}
