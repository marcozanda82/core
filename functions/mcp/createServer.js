import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { MCP_INSTRUCTIONS } from './instructions.js';
import { toolGetDay, toolGetPeriod, toolGetEvenings, toolSearchFood } from './tools.js';

/**
 * @param {{ uid: string, db: import('firebase-admin/database').Database }} deps
 */
export function createKentuMcpServer({ uid, db }) {
  const server = new McpServer(
    {
      name: 'kentu',
      version: '1.0.0',
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
    },
    async ({ date }) => {
      const payload = await toolGetDay(db, uid, date);
      return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
      };
    },
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
    },
    async ({ from, to }) => {
      const payload = await toolGetEvenings(db, uid, { from, to });
      return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
      };
    },
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
    },
    async ({ period }) => {
      const payload = await toolGetPeriod(db, uid, period);
      return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
      };
    },
  );

  server.registerTool(
    'kentu_search_food',
    {
      description:
        'Cerca alimenti nei cataloghi Kentu e nel DB personale. Restituisce nome, matchQuality e kcal/100g. Sola lettura.',
      inputSchema: {
        query: z.string().describe('Testo di ricerca (almeno 2 caratteri)'),
      },
    },
    async ({ query }) => {
      const payload = await toolSearchFood(db, uid, query);
      return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
      };
    },
  );

  return server;
}
