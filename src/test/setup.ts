import '@testing-library/jest-dom/vitest';

import { vi } from 'vitest';
// jsdom has no top-layer implementation or canvas renderer. Browser checks cover both.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
vi.mock('lottie-web/build/player/lottie_light', () => ({ default: { loadAnimation: () => ({ destroy() {}, goToAndStop() {}, addEventListener() {} }) } }));
