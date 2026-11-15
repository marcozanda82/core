/**
 * Muscoli e gruppi UI — Costanza Forza, versione mm-1.
 */

export const MUSCLE_MAP_VERSION = 'mm-1';

/** @type {readonly string[]} */
export const MUSCLE_IDS = Object.freeze([
  'pettorali',
  'dorsali',
  'trapezi_romboidi',
  'deltoidi_anteriori',
  'deltoidi_laterali',
  'deltoidi_posteriori',
  'bicipiti',
  'tricipiti',
  'avambracci',
  'addominali',
  'obliqui',
  'lombari',
  'glutei',
  'quadricipiti',
  'femorali',
  'adduttori',
  'polpacci',
]);

/** @type {Readonly<Record<string, string>>} */
export const MUSCLE_LABELS = Object.freeze({
  pettorali: 'Pettorali',
  dorsali: 'Dorsali',
  trapezi_romboidi: 'Trapezi / romboidi',
  deltoidi_anteriori: 'Deltoidi anteriori',
  deltoidi_laterali: 'Deltoidi laterali',
  deltoidi_posteriori: 'Deltoidi posteriori',
  bicipiti: 'Bicipiti',
  tricipiti: 'Tricipiti',
  avambracci: 'Avambracci',
  addominali: 'Addominali',
  obliqui: 'Obliqui',
  lombari: 'Lombari',
  glutei: 'Glutei',
  quadricipiti: 'Quadricipiti',
  femorali: 'Femorali',
  adduttori: 'Adduttori',
  polpacci: 'Polpacci',
});

/**
 * Gruppi UI espandibili (Costanza).
 * force-ci-1 usa solo Petto, Schiena, Spalle, Gambe, Core (non Braccia).
 * @type {readonly { id: string, label: string, muscleIds: readonly string[], forceCi: boolean }[]}
 */
export const COSTANZA_UI_GROUPS = Object.freeze([
  {
    id: 'petto',
    label: 'Petto',
    forceCi: true,
    muscleIds: Object.freeze(['pettorali']),
  },
  {
    id: 'schiena',
    label: 'Schiena',
    forceCi: true,
    muscleIds: Object.freeze(['dorsali', 'trapezi_romboidi', 'lombari']),
  },
  {
    id: 'spalle',
    label: 'Spalle',
    forceCi: true,
    muscleIds: Object.freeze(['deltoidi_anteriori', 'deltoidi_laterali', 'deltoidi_posteriori']),
  },
  {
    id: 'braccia',
    label: 'Braccia',
    forceCi: false,
    muscleIds: Object.freeze(['bicipiti', 'tricipiti', 'avambracci']),
  },
  {
    id: 'gambe',
    label: 'Gambe',
    forceCi: true,
    muscleIds: Object.freeze(['quadricipiti', 'glutei', 'femorali', 'adduttori', 'polpacci']),
  },
  {
    id: 'core',
    label: 'Core',
    forceCi: true,
    muscleIds: Object.freeze(['addominali', 'obliqui', 'lombari']),
  },
]);

/** Gruppi che entrano nel quoziente force-ci-1 (5). */
export const FORCE_CI_GROUP_IDS = Object.freeze(
  COSTANZA_UI_GROUPS.filter((g) => g.forceCi).map((g) => g.id),
);

export const DEFAULT_WEEKLY_GOAL_DAYS = 2;
export const WEEKLY_GOAL_CHOICES = Object.freeze([2, 3, 4]);
