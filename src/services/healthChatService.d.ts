/**
 * Tipi pubblici del motore AI diabete (healthChatService).
 * Specchio TypeScript delle strutture JSON estratte dall'assistente.
 */

export type MomentoGiornata = 'colazione' | 'pranzo' | 'cena' | null;
export type ContestoGlicemia = 'pre-prandiale' | 'post-prandiale' | null;

export interface DiarioSalutePayload {
  momento_giornata: MomentoGiornata;
  alimenti_consumati: string | null;
  valore_glicemia: number | null;
  contesto_glicemia: ContestoGlicemia;
}

export interface EccezioneTerapiaPayload {
  tipo_eccezione: string;
  nota_originale: string;
}

export interface HealthChatAiResponse {
  diario_salute: DiarioSalutePayload;
  eccezione_terapia: EccezioneTerapiaPayload | null;
  risposta_utente: string;
}

export interface HealthChatPersistResult {
  diarioSaluteId: string | null;
  eccezioneTerapiaId: string | null;
}

export interface HealthChatResult {
  risposta_utente: string;
  data: HealthChatAiResponse;
  saved: HealthChatPersistResult;
}

export declare const HEALTH_CHAT_SYSTEM_PROMPT: string;
export declare const HEALTH_CHAT_RESPONSE_SCHEMA: Record<string, unknown>;
export declare const COLLECTION_DIARIO_SALUTE: 'diario_salute';
export declare const COLLECTION_ECCEZIONI_TERAPIA: 'eccezioni_terapia';

export declare function normalizeHealthChatAiResponse(raw: unknown): HealthChatAiResponse;
export declare function parseHealthChatAiJson(rawText: string): HealthChatAiResponse;
export declare function hasDiarioSaluteValues(diario: DiarioSalutePayload | null | undefined): boolean;
export declare function saveDiarioSaluteDoc(uid: string, diario: DiarioSalutePayload): Promise<string>;
export declare function saveEccezioneTerapiaDoc(uid: string, eccezione: EccezioneTerapiaPayload): Promise<string>;
export declare function persistHealthChatExtractions(
  uid: string,
  data: HealthChatAiResponse,
): Promise<HealthChatPersistResult>;
export declare function processHealthChatMessage(
  userMessage: string,
  options?: {
    uid?: string | null;
    signal?: AbortSignal | null;
    temperature?: number;
  },
): Promise<HealthChatResult>;
