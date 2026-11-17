import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { MCP_INSTRUCTIONS } from './instructions.js';
import { toolGetDay, toolGetPeriod, toolSearchFood } from './tools.js';

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
        'Legge lo stato di un giorno Kentu: punteggio kds-5 (batteria movimento), pilastri, pasti (kcal), sonno, salvavita e azione. '
        + 'Parametro date: "today", "yesterday" oppure YYYY-MM-DD (fuso Europe/Rome). Sola lettura.',
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
