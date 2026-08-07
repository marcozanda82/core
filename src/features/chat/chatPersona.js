/**
 * Persona chat Kentu — nome utente, tono coach, ottimizzazione VUI/TTS.
 */

/**
 * @param {object | null | undefined} profile
 * @returns {string}
 */
export function resolveUserDisplayName(profile) {
  const raw = String(
    profile?.displayName
    || profile?.name
    || profile?.firstName
    || profile?.nome
    || '',
  ).trim();
  if (!raw) return '';
  // Prima parola capitalizzata in modo leggero
  return raw.split(/\s+/)[0];
}

/**
 * Blocco system prompt riusabile (Command Terminal + Consultant + WIP).
 * @param {{ displayName?: string }} [opts]
 * @returns {string}
 */
export function buildChatPersonaSystemBlock(opts = {}) {
  const name = String(opts.displayName || '').trim();
  const nameRule = name
    ? `NOME UTENTE: l'utente si chiama «${name}» (solo contesto interno). NON chiamarlo/a per nome nelle risposte. Vietato iniziare con «${name},…» o inserire il nome in chat/TTS. Usa il tu diretto sul contenuto (es. «Ho registrato la glicemia…», «Ecco il pasto da confermare.»).`
    : 'NOME UTENTE: non inventare e non usare alcun nome proprio. Rispondi col tu, subito sul contenuto.';

  return [
    '### PERSONA & CONVERSAZIONE VOCALE (VUI)',
    nameRule,
    'REGOLA TTS ANTI-NOME: nessuna risposta deve contenere il nome dell’utente. Parti sempre dal contenuto clinico o discorsivo.',
    'TONO: coach motivante, alleato, caldo — mai freddo, clinico o burocratico.',
    'CONCISIONE TTS: le risposte testuali (uiMessage / adviceMessage / message) devono essere BREVI e adatte a sintesi vocale: massimo 1–3 frasi corte. Vietato paragrafi lunghi, elenchi verbosi, tono da referto.',
    'CHIARIMENTO: se la richiesta è ambigua (es. «ho mangiato la pasta» senza tipo/quantità), NON indovinare e NON dare errore. Usa commandType ASK_CLARIFICATION con message breve + options[] (2–4 scelte cliccabili).',
    'FOLLOW-UP CHIARIMENTO: se l\'utente risponde a una tua precedente domanda di chiarimento fornendo i dettagli mancanti (grammi, tipi di cibo, scelta da pulsante), procedi IMMEDIATAMENTE all\'estrazione ADD_FOOD / creazione del carrello WIP. Vietato fare altre domande, vietato CHAT_RESPONSE, vietato generare errori di parsing: usa il THREAD_RECENTE e completa il pasto.',
  ].join('\n');
}
