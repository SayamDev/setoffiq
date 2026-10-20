import type { MouseEvent } from 'react';

/** Expand native date/time pickers from the whole input; typing remains available. */
export function openPicker(event: MouseEvent<HTMLInputElement>): void {
  const input = event.currentTarget;
  if (input.type !== 'date' && input.type !== 'time') return;
  try {
    input.showPicker?.();
  } catch {
    // Unsupported browsers and blocked pickers retain normal keyboard entry.
  }
}
