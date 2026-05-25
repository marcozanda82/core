const DEFAULT_DEDUPE_WINDOW_MS = 1200;
const MAX_HISTORY_SIZE = 300;

function createEventId() {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function stableSerialize(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`);
  return `{${pairs.join(',')}}`;
}

class CommandBus {
  constructor() {
    this.listeners = new Map();
    this.eventHistory = [];
    this.lastEventByFingerprint = new Map();
  }

  subscribe(eventType, handler) {
    if (typeof handler !== 'function') {
      throw new Error('CommandBus.subscribe requires a function handler');
    }
    const type = String(eventType || '').trim();
    if (!type) throw new Error('CommandBus.subscribe requires an eventType');
    const current = this.listeners.get(type) || new Set();
    current.add(handler);
    this.listeners.set(type, current);
    return () => this.unsubscribe(type, handler);
  }

  unsubscribe(eventType, handler) {
    const type = String(eventType || '').trim();
    if (!type) return;
    const current = this.listeners.get(type);
    if (!current) return;
    current.delete(handler);
    if (current.size === 0) this.listeners.delete(type);
  }

  publish(eventType, payload = {}, meta = {}) {
    const type = String(eventType || '').trim();
    if (!type) throw new Error('CommandBus.publish requires an eventType');
    const now = Date.now();
    const dedupeWindowMs = Number.isFinite(Number(meta.dedupeWindowMs))
      ? Number(meta.dedupeWindowMs)
      : DEFAULT_DEDUPE_WINDOW_MS;
    const fingerprint =
      meta.eventId ||
      `${type}:${stableSerialize(payload)}:${stableSerialize(meta.dedupeKey || null)}`;
    const duplicateInfo = this.lastEventByFingerprint.get(fingerprint);
    if (
      duplicateInfo &&
      dedupeWindowMs > 0 &&
      now - duplicateInfo.timestamp <= dedupeWindowMs
    ) {
      return {
        skipped: true,
        reason: 'duplicate',
        duplicateOf: duplicateInfo.eventId,
      };
    }

    const envelope = Object.freeze({
      eventId: meta.eventId || createEventId(),
      eventType: type,
      payload,
      meta: {
        source: meta.source || 'unknown',
        correlationId: meta.correlationId || null,
        dedupeWindowMs,
        timestamp: now,
      },
    });

    this.lastEventByFingerprint.set(fingerprint, {
      eventId: envelope.eventId,
      timestamp: now,
    });
    this.eventHistory.push(envelope);
    if (this.eventHistory.length > MAX_HISTORY_SIZE) this.eventHistory.shift();
    this.cleanupDedupeCache(now, dedupeWindowMs);

    const subscribers = Array.from(this.listeners.get(type) || []);
    subscribers.forEach((handler) => {
      try {
        handler(envelope);
      } catch (error) {
        // Errors are isolated per subscriber to avoid stopping dispatch chain.
        console.error('[CommandBus] subscriber error', {
          eventType: type,
          eventId: envelope.eventId,
          error,
        });
      }
    });
    return {
      skipped: false,
      eventId: envelope.eventId,
      deliveredTo: subscribers.length,
    };
  }

  cleanupDedupeCache(now = Date.now(), dedupeWindowMs = DEFAULT_DEDUPE_WINDOW_MS) {
    if (dedupeWindowMs <= 0) return;
    this.lastEventByFingerprint.forEach((value, key) => {
      if (!value || now - value.timestamp > dedupeWindowMs * 5) {
        this.lastEventByFingerprint.delete(key);
      }
    });
  }

  getHistory(limit = 50) {
    const max = Number.isFinite(Number(limit)) ? Number(limit) : 50;
    if (max <= 0) return [];
    return this.eventHistory.slice(-max);
  }

  clearHistory() {
    this.eventHistory = [];
  }
}

const commandBus = new CommandBus();

export { CommandBus, commandBus };
