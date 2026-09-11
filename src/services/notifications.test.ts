import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showNotification } from './notifications';

const notification = { id: 'n1', journeyId: 'j1', at: 0, title: 'Leave at 07:40', body: 'The flight moved.' };

describe('showNotification', () => {
  let constructed: string[];

  beforeEach(() => {
    constructed = [];
    class FakeNotification {
      static permission = 'granted';
      constructor(title: string) {
        constructed.push(title);
      }
    }
    vi.stubGlobal('Notification', FakeNotification);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  // Android Chrome throws on `new Notification()`, so the worker must come first.
  it('shows through the service worker when one is registered', async () => {
    const showFromWorker = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: () => Promise.resolve({ showNotification: showFromWorker }) },
    });

    await expect(showNotification(notification)).resolves.toBe(true);
    expect(showFromWorker).toHaveBeenCalledWith(
      'Leave at 07:40',
      expect.objectContaining({ tag: 'setoffiq-j1', data: { journeyId: 'j1' } }),
    );
    expect(constructed).toEqual([]);
  });

  it('falls back to a page notification when no worker is registered', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: () => Promise.resolve(undefined) },
    });

    await expect(showNotification(notification)).resolves.toBe(true);
    expect(constructed).toEqual(['Leave at 07:40']);
  });

  it('reports failure rather than pretending, when neither path works', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: () => Promise.reject(new Error('no worker')) },
    });
    vi.stubGlobal(
      'Notification',
      class {
        static permission = 'granted';
        constructor() {
          throw new TypeError('Illegal constructor');
        }
      },
    );

    await expect(showNotification(notification)).resolves.toBe(false);
  });
});
