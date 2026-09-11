import type { AppNotification } from '../domain/types';

/**
 * Browser notifications only. No SMS, no email, no third-party push service —
 * all of those cost money and none of them are needed for a browser app that
 * is already open.
 */
export type NotificationPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

export function notificationSupport(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotificationPermissionState;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (notificationSupport() === 'unsupported') return 'unsupported';
  try {
    return (await Notification.requestPermission()) as NotificationPermissionState;
  } catch {
    return 'denied';
  }
}

/**
 * Show a notification if we are allowed to. Resolves to whether it was shown,
 * so the caller can fall back to the in-page alert rather than assuming.
 *
 * The service worker's showNotification comes first. Chrome on Android refuses
 * `new Notification()` outright ("Illegal constructor"), so a page-constructed
 * notification silently never appears there. The constructor remains as the
 * fallback for when no worker is registered — development builds, or the first
 * visit before it installs.
 */
export async function showNotification(notification: AppNotification): Promise<boolean> {
  if (notificationSupport() !== 'granted') return false;

  const options = {
    body: notification.body,
    tag: `setoffiq-${notification.journeyId}`,
    // Replacing the previous notification for this journey rather than
    // stacking them is the difference between useful and spam.
    renotify: false,
    data: { journeyId: notification.journeyId },
  } as NotificationOptions;

  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(notification.title, options);
      return true;
    }
  } catch {
    // Fall through to a page notification.
  }

  try {
    new Notification(notification.title, options);
    return true;
  } catch {
    return false;
  }
}
