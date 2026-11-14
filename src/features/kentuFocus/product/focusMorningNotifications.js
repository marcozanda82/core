/**
 * Notifica locale del Focus, solo sull'app Android.
 * Il permesso di sistema si chiede dopo la prima apertura del Focus.
 */

import { Capacitor } from '@capacitor/core';
import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { morningNotification, notificationClock, shouldSendNotification } from './morningFocus.js';
import { patchMorningState, readMorningState } from './morningFocusStore.js';

const TITLE = 'Kentu Focus';

export function isAndroidApp() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export async function requestFocusNotificationPermission() {
  if (!isAndroidApp()) return 'unknown';
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const result = await LocalNotifications.requestPermissions();
    const permission = result?.display === 'granted' ? 'granted' : 'denied';
    patchMorningState({ permission });
    return permission;
  } catch {
    patchMorningState({ permission: 'denied' });
    return 'denied';
  }
}

/** Annulla la notifica di oggi: il Focus è già stato aperto. */
export async function cancelTodayFocusNotification(today) {
  if (!isAndroidApp() || !isIsoDateString(today)) return;
  patchMorningState({ focusOpenedOn: today });
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: [{ id: notificationId(today) }] });
  } catch {
    /* il plugin non è disponibile nel browser */
  }
}

/**
 * Riprogramma i prossimi giorni. Se l'orario non è stato scelto a mano,
 * usa la mediana dei risvegli passata dal chiamante.
 */
export async function scheduleFocusNotifications({ wakeHours, today } = {}) {
  if (!isAndroidApp() || !isIsoDateString(today)) return;
  const state = readMorningState();
  const enabled = state.notification.enabled !== false;
  const clock = notificationClock({ wakeHours, override: state.notification.time });
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const pending = [];
    for (let offset = 0; offset < 8; offset += 1) {
      const date = addCalendarDays(today, offset);
      pending.push({ id: notificationId(date) });
    }
    await LocalNotifications.cancel({ notifications: pending });
    if (!enabled) return;
    const permission = await LocalNotifications.checkPermissions();
    if (permission?.display !== 'granted') return;
    const notifications = [];
    for (let offset = 0; offset < 8; offset += 1) {
      const date = addCalendarDays(today, offset);
      if (!shouldSendNotification({
        enabled,
        focusOpenedOn: offset === 0 ? state.focusOpenedOn : null,
        today: date,
      })) continue;
      const at = new Date(`${date}T${clock}:00`);
      if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) continue;
      const note = morningNotification(date);
      notifications.push({
        id: notificationId(date),
        title: TITLE,
        body: note.text,
        schedule: { at, allowWhileIdle: true },
        extra: { period: note.periodId },
      });
    }
    if (notifications.length > 0) {
      await LocalNotifications.schedule({ notifications });
    }
  } catch {
    /* fuori da Android */
  }
}

let listening = false;

export function listenForFocusNotificationOpen() {
  if (listening || !isAndroidApp()) return;
  listening = true;
  import('@capacitor/local-notifications')
    .then(({ LocalNotifications }) => LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (event) => {
        const period = event?.notification?.extra?.period;
        const allowed = period === 'settimana' || period === 'mese' ? period : 'ieri';
        window.location.assign(`/kentu-focus?period=${allowed}&from=notifica`);
      },
    ))
    .catch(() => {
      listening = false;
    });
}

function notificationId(iso) {
  return 610000 + Number(iso.slice(5, 7)) * 100 + Number(iso.slice(8, 10));
}
