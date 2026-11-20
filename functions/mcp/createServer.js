import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { MCP_INSTRUCTIONS } from './instructions.js';
import { toolGetDay, toolGetPeriod, toolGetEvenings, toolSearchFood } from './tools.js';
import {
  DRAFT_ID_RE,
  IDEMPOTENCY_KEY_RE,
  MEAL_DRAFT_LIMITS,
  MEAL_DRAFT_SLOTS,
  MEAL_DRAFT_STATUSES,
  McpToolError,
  TIME_HHMM_RE,
  toolCreateMealDraft,
  toolDeleteDraft,
  toolListDrafts,
} from './mealDrafts.js';

const READ_ONLY = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

const DAY_REF_RE = /^(today|yesterday|\d{4}-\d{2}-\d{2})$/;

function jsonResult(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

/** Errori attesi (permesso, limite, formato) come risultato leggibile da Claude, non come 500. */
async function guarded(run) {
  try {
    return jsonResult(await run());
  } catch (error) {
    if (error instanceof McpToolError) {
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: error.code, message: error.message }) }],
      };
    }
    throw error;
  }
}

/**
 * @param {{
 *   uid: string,
 *   db: import('firebase-admin/database').Database,
 *   tokenId?: string,
 *   scopes?: string[],
 * }} deps
 */
export function createKentuMcpServer({ uid, db, tokenId = '', scopes = ['read'] }) {
  const ctx = { uid, tokenId, scopes };
  const L = MEAL_DRAFT_LIMITS;
  const server = new McpServer(
    {
      name: 'kentu',
      version: '1.1.0',
    },
    {
      instructions: MCP_INSTRUCTIONS,
    },
  );

  server.registerTool(
    'kentu_get_day',
    {
      description:
        'Legge un giorno Kentu (kds-5): pilastri, pasti dettagliati (orario, grammi, kcal, P/C/F, fibre, sodio), '
        + 'liquidi/alcol con orario, caffeina se presente, notte (letto, sveglia, durata, stelle, note), salvavita e azione. '
        + 'Parametro date: "today", "yesterday" oppure YYYY-MM-DD (Europe/Rome). Sola lettura.',
      inputSchema: {
        date: z.string().describe('today | yesterday | YYYY-MM-DD'),
      },
      annotations: READ_ONLY,
    },
    async ({ date }) => jsonResult(await toolGetDay(db, uid, date)),
  );

  server.registerTool(
    'kentu_get_evenings',
    {
      description:
        'Serie compatta sera→notte (max 90 giorni): ultimo pasto, ore prima del sonno, cena (kcal/grammi), '
        + 'sodio serale, liquidi dopo le 18, alcol, caffeina dopo le 14, esito notte (durata, stelle, note). '
        + 'from/to in YYYY-MM-DD (Europe/Rome). Sola lettura. Un episodio è un’ipotesi, non una prova.',
      inputSchema: {
        from: z.string().describe('YYYY-MM-DD inizio (incluso)'),
        to: z.string().describe('YYYY-MM-DD fine (incluso)'),
      },
      annotations: READ_ONLY,
    },
    async ({ from, to }) => jsonResult(await toolGetEvenings(db, uid, { from, to })),
  );

  server.registerTool(
    'kentu_get_period',
    {
      description:
        'Aggregati Focus su una settimana o un mese: copertura, pilastri, scie/buchi, salvavita e azione. '
        + 'Parametro period: this_week | last_week | this_month | last_month (Europe/Rome). Sola lettura.',
      inputSchema: {
        period: z.string().describe('this_week | last_week | this_month | last_month'),
      },
      annotations: READ_ONLY,
    },
    async ({ period }) => jsonResult(await toolGetPeriod(db, uid, period)),
  );

  server.registerTool(
    'kentu_search_food',
    {
      description:
        'Cerca alimenti nei cataloghi Kentu e nel DB personale. Restituisce nome, matchQuality e kcal/100g. Sola lettura.',
      inputSchema: {
        query: z.string().describe('Testo di ricerca (almeno 2 caratteri)'),
      },
      annotations: READ_ONLY,
    },
    async ({ query }) => jsonResult(await toolSearchFood(db, uid, query)),
  );

  server.registerTool(
    'kentu_create_meal_draft',
    {
      description:
        'Crea una BOZZA di pasto in Kentu, da convalidare dall’utente nell’app. Non scrive nel diario e non cambia '
        + 'i punteggi. Prima di chiamarlo: chiedi quantità e condimenti mancanti, mostra un riepilogo e attendi conferma. '
        + 'Richiede il permesso "drafts:write" sul gettone. Limite: 10 scritture/ora, 30/giorno. '
        + 'Ripetere con la stessa idempotencyKey non crea doppioni.',
      inputSchema: {
        date: z.string().trim().regex(DAY_REF_RE)
          .describe(`today | yesterday | YYYY-MM-DD (Europe/Rome, entro ${L.dateWindowDays} giorni da oggi)`),
        slot: z.enum(MEAL_DRAFT_SLOTS).describe('colazione | snack | pranzo | cena'),
        time: z.string().trim().regex(TIME_HHMM_RE).describe('Orario del pasto HH:MM'),
        items: z.array(z.strictObject({
          name: z.string().trim().min(L.nameMin).max(L.nameMax)
            .describe('Nome alimento come l’ha detto l’utente (es. "pasta integrale")'),
          grams: z.number().int().min(L.gramsMin).max(L.gramsMax).nullable().optional()
            .describe('Grammi se noti; null se l’utente non li sa'),
          note: z.string().trim().max(L.noteMax).optional()
            .describe('Nota breve (es. "condita con 1 cucchiaio d’olio")'),
        })).min(1).max(L.maxItems),
        originalText: z.string().trim().min(1).max(L.rawTextMax)
          .describe('Il testo originale scritto dall’utente, senza riformularlo'),
        idempotencyKey: z.string().trim().regex(IDEMPOTENCY_KEY_RE)
          .describe('Chiave anti-doppione stabile per questo pasto (8–128 caratteri: lettere, cifre, . _ : -)'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => guarded(() => toolCreateMealDraft(db, ctx, args)),
  );

  server.registerTool(
    'kentu_list_drafts',
    {
      description:
        'Elenca le bozze pasto create da Claude (non quelle create dall’utente in Kentu): stato pending '
        + '(da convalidare), consumed (convalidata), deleted. Filtri facoltativi status e date. Sola lettura.',
      inputSchema: {
        status: z.enum(MEAL_DRAFT_STATUSES).optional().describe('pending | consumed | deleted'),
        date: z.string().trim().regex(DAY_REF_RE).optional().describe('today | yesterday | YYYY-MM-DD'),
      },
      annotations: READ_ONLY,
    },
    async (args) => guarded(() => toolListDrafts(db, ctx, args)),
  );

  server.registerTool(
    'kentu_delete_draft',
    {
      description:
        'Elimina una bozza pasto creata da Claude e ancora in attesa (pending). Non tocca bozze già convalidate, '
        + 'bozze create dall’utente né il diario. Richiede il permesso "drafts:write".',
      inputSchema: {
        draftId: z.string().trim().regex(DRAFT_ID_RE).describe('draftId restituito da kentu_create_meal_draft'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => guarded(() => toolDeleteDraft(db, ctx, args)),
  );

  return server;
}
