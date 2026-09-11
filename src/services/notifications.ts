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
 * Show a notification if we are allowed to. Returns whether it was shown, so
 * the caller can fall back to the in-page alert rather than assuming.
 */
export function showNotification(notification: AppNotification): boolean {
  if (notificationSupport() !== 'granted') return false;
  try {
    new Notification(notification.title, {
      body: notification.body,
      tag: `setoffiq-${notification.journeyId}`,
      // Replacing the previous notification for this journey rather than
      // stacking them is the difference between useful and spam.
      renotify: false,
    } as NotificationOptions);
    return true;
  } catch {
    return false;
  }
}
