/**
 * Soglie del salvavita, versione sfv-2.
 * Ogni numero sta qui, con il motivo. Il calcolo non ne inventa altri.
 * L'overreaching non usa più la fatica del motore: quella quota non sale
 * oltre circa 0,17 e la soglia 0,8 non scattava mai.
 */

export const SAFETY_VERSION = 'sfv-2';

/**
 * Quanti giorni di calendario si risale per trovare gli ultimi giorni chiusi.
 * Più indietro non sono più «gli ultimi».
 */
export const CLOSED_LOOKBACK_DAYS = 28;

/** Finestra della media energetica, del deficit ripetuto e delle proteine. */
export const ENERGY_WINDOW_DAYS = 7;

/**
 * Media dei giorni chiusi sotto questa quota dell'obiettivo: sotto osservazione.
 * 0,75 = 75%. Vale lo stretto minore.
 */
export const ENERGY_SUSTAINED_RATIO = 0.75;

/**
 * Giornata molto bassa: sotto questa quota dell'obiettivo.
 * 0,60 = 60%. Vale lo stretto minore.
 */
export const ENERGY_VERY_LOW_RATIO = 0.6;

/** Almeno tante giornate molto basse nella finestra fanno scattare il salvavita. */
export const ENERGY_VERY_LOW_DAYS = 3;

/**
 * In alternativa alle giornate al 60%: almeno tante giornate sotto il metabolismo
 * basale stimato dal profilo (Mifflin–St Jeor; un bmr già scritto nel profilo vince).
 */
export const ENERGY_UNDER_BASAL_DAYS = 2;

/** Con un act sull'energia il punteggio del giorno non supera questo valore: niente blu. */
export const ENERGY_ACT_SCORE_CAP = 0.74;

/** Il peso si legge solo con almeno tante pesate nella finestra. */
export const WEIGHT_MIN_SAMPLES = 4;

/** Finestra in cui contare le pesate. */
export const WEIGHT_SAMPLE_DAYS = 14;

/** Ogni blocco della media mobile. Due blocchi di fila fanno le due settimane. */
export const WEIGHT_BLOCK_DAYS = 7;

/**
 * Perdita oltre questa quota del blocco precedente, per due settimane di fila.
 * 0,01 = 1%. Vale lo stretto maggiore.
 */
export const WEIGHT_WEEKLY_LOSS_RATIO = 0.01;

/**
 * Proteine: la media energetica è sotto l'obiettivo di oltre questa quota
 * e, insieme, le proteine sono sotto i grammi per chilo.
 * 0,10 = oltre il 10% sotto. Vale lo stretto maggiore.
 */
export const PROTEIN_DEFICIT_RATIO = 0.1;

/** Grammi di proteine per chilo di peso. Sotto questa media, in deficit, si osserva. */
export const PROTEIN_GRAMS_PER_KG = 1.2;

/** Giorni di fila con pesi o attività vigorosa: sotto osservazione. */
export const REST_STREAK_WATCH_DAYS = 6;

/** La stessa serie, più lunga: il salvavita scatta. */
export const REST_STREAK_ACT_DAYS = 8;

/** Stesso distretto riallenato prima di questo intervallo. */
export const DISTRICT_RECOVERY_HOURS = 48;

/** Quante volte, nella finestra, il recupero è stato troppo corto. */
export const DISTRICT_SHORT_RECOVERY_TIMES = 2;

/** Finestra del distretto e della settimana di carico. */
export const TRAINING_WINDOW_DAYS = 7;

/**
 * Settimane precedenti con cui si confronta il carico.
 * Una settimana senza giorni chiusi non entra nella media: manca la base.
 */
export const LOAD_BASELINE_WEEKS = 4;

/**
 * Minuti di pesi più attività vigorosa oltre questa quota della media precedente.
 * 1,5 = 150%. Vale lo stretto maggiore. La camminata non entra.
 */
export const LOAD_SPIKE_RATIO = 1.5;

/**
 * Soglia storica della fatica sistemica. Lo sfv-2 non la usa per l'overreaching:
 * il motore recupera 0,08 a notte e sale di 0,03–0,05 a sessione, quindi resta
 * intorno a 0,17. Va ricalibrata prima di tornare a leggerla.
 */
export const FATIGUE_ACT = 0.8;

/** Notte corta: sotto queste ore. Vale lo stretto minore. */
export const SHORT_SLEEP_HOURS = 6;

/** Energia al risveglio e qualità del sonno: da qui in giù, su una scala fino a 5. */
export const LOW_MORNING_SCORE = 2;

/** Quante notti o mattine, sulle ultime tre, bastano a formare un indizio. */
export const MORNING_CLUSTER_HITS = 2;

/** Ultime mattine e ultime notti lette per il sovraccarico. */
export const MORNING_CLUSTER_DAYS = 3;

/** Quanti indizi, tra sonno corto, energia al risveglio e qualità, servono insieme alla fatica. */
export const OVERREACHING_CLUSTERS = 2;

/** Finestra del rapporto con il cibo. */
export const RESTRICTIVE_WINDOW_DAYS = 14;

/**
 * Giorni, nella finestra, sotto il 60% dell'obiettivo oppure sotto il metabolismo basale.
 * Da qui il Focus smette di mostrare i numeri.
 */
export const RESTRICTIVE_DAYS = 5;

export const SAFETY_AREAS = Object.freeze({
  energia: 'Energia',
  peso: 'Peso',
  proteine: 'Proteine',
  allenamento: 'Allenamento',
  sovraccarico: 'Sovraccarico',
  rapporto: 'Rapporto con il cibo',
});
