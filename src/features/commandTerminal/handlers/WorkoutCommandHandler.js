import { commandBus } from '../dispatcher/CommandBus.js';
import {
  DISPATCH_ADD_WORKOUT,
  DISPATCH_COMMAND_REJECTED,
  DISPATCH_SYSTEM_MESSAGE,
} from '../contracts/eventTypes.js';

const PROCESSED_EVENT_TTL_MS = 15000;
const processedWorkoutEventIds = new Map();

let activeWorkoutCallback = null;
let workoutSubscriptionCleanup = null;

function shouldSkipDuplicateWorkoutEvent(envelope) {
  const eventId = String(envelope?.eventId || '').trim();
  if (!eventId) return false;

  const now = Date.now();
  processedWorkoutEventIds.forEach((seenAt, key) => {
    if (now - seenAt > PROCESSED_EVENT_TTL_MS) {
      processedWorkoutEventIds.delete(key);
    }
  });

  if (processedWorkoutEventIds.has(eventId)) return true;
  processedWorkoutEventIds.set(eventId, now);
  return false;
}

function ensureWorkoutSubscription(bus = commandBus) {
  if (workoutSubscriptionCleanup) return;

  const unsubscribeAddWorkout = bus.subscribe(DISPATCH_ADD_WORKOUT, async (envelope) => {
    if (shouldSkipDuplicateWorkoutEvent(envelope)) return;

    const callback = activeWorkoutCallback;
    if (typeof callback !== 'function') return;

    try {
      const result = await callback(envelope?.payload || {}, envelope);
      if (typeof result === 'string' && result.trim()) {
        bus.publish(
          DISPATCH_SYSTEM_MESSAGE,
          { message: result.trim(), text: result.trim() },
          { source: 'WorkoutCommandHandler' },
        );
      }
    } catch (error) {
      bus.publish(
        DISPATCH_COMMAND_REJECTED,
        {
          reason: `Workout handler failure: ${error?.message || 'unknown error'}`,
          command: envelope?.payload || null,
        },
        { source: 'WorkoutCommandHandler' },
      );
    }
  });

  workoutSubscriptionCleanup = () => {
    unsubscribeAddWorkout();
    workoutSubscriptionCleanup = null;
  };
}

/**
 * Register workout domain listeners for command bus events.
 * Singleton: un solo listener attivo anche con re-mount React / HMR.
 * Returns a cleanup function to unsubscribe handlers.
 */
export function initWorkoutHandlers({
  bus = commandBus,
  onAddWorkoutCommand = null,
} = {}) {
  if (typeof onAddWorkoutCommand !== 'function') {
    throw new Error('initWorkoutHandlers requires onAddWorkoutCommand callback');
  }

  activeWorkoutCallback = onAddWorkoutCommand;
  ensureWorkoutSubscription(bus);

  return () => {
    if (activeWorkoutCallback === onAddWorkoutCommand) {
      activeWorkoutCallback = null;
    }
    if (!activeWorkoutCallback && workoutSubscriptionCleanup) {
      workoutSubscriptionCleanup();
    }
  };
}
