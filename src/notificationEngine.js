const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {object} input
 * @param {object | null | undefined} input.plan
 * @param {number | null | undefined} input.lastNotificationAt
 * @param {string | null | undefined} input.lastDecision
 * @param {number} [input.nowMs]
 * @returns {{
 *   shouldNotify: boolean,
 *   type: 'decision' | 'correction' | 'hold' | null,
 *   message: string
 * }}
 */
export function computeMetabolicNotification(input) {
  const plan = input?.plan;
  const nowMs = Number.isFinite(Number(input?.nowMs)) ? Number(input.nowMs) : Date.now();
  const lastNotificationAt = Number(input?.lastNotificationAt);
  const lastDecision = input?.lastDecision ?? null;

  if (plan?.status == null) {
    return { shouldNotify: false, type: null, message: '' };
  }

  if (Number.isFinite(lastNotificationAt) && nowMs - lastNotificationAt < ONE_DAY_MS) {
    return { shouldNotify: false, type: null, message: '' };
  }

  if (plan.status === 'hold') {
    if (plan.holdReason === 'low_adherence') {
      return {
        shouldNotify: true,
        type: 'hold',
        message: 'Segui il piano con più costanza.',
      };
    }
    return { shouldNotify: false, type: null, message: '' };
  }

  const decision = plan.decision;
  const confidence = plan?.coach?.confidence;
  const rawMessage = String(plan?.coach?.primary_action || '').trim();
  const firstSentence = rawMessage.split(/[.!?]/).map((s) => s.trim()).filter(Boolean)[0] || '';
  const message = firstSentence ? `${firstSentence}.` : '';

  if (decision === 'keep') return { shouldNotify: false, type: null, message: '' };
  if (confidence !== 'high') return { shouldNotify: false, type: null, message: '' };
  if (!message) return { shouldNotify: false, type: null, message: '' };
  if (decision === lastDecision) return { shouldNotify: false, type: null, message: '' };

  return {
    shouldNotify: true,
    type: 'decision',
    message: message.length > 140 ? `${message.slice(0, 137)}...` : message,
  };
}
