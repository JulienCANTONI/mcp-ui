/**
 * O*NET MCP Server — demonstrates MCP-UI adapter connector integration
 *
 * Tools exposed:
 *   onet_search   – search occupations by keyword → returns MCP-UI resource
 *   onet_details  – get occupation detail by SOC code → returns MCP-UI resource
 *
 * The resources use the MCP Apps adapter connector (text/html;profile=mcp-app)
 * which is one of the two connectors integrated in the client SDK.
 *
 * Configuration (via environment variables, never hardcoded):
 *   ONET_USERNAME  – O*NET Web Services username
 *   ONET_PASSWORD  – O*NET Web Services API key
 *
 * Copy .env.example → .env and fill in your credentials.
 * The .env file is git-ignored and will never be committed.
 *
 * Run:  pnpm dev   (from this directory)
 * Port: 3002
 */

import 'dotenv/config'; // loads .env before anything else

import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createUIResource } from '@mcp-ui/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';

import { searchOccupations, getOccupation, OCCUPATIONS } from './onet-data.js';
import { liveSearch, liveOccupationSummary, type OnetReport } from './onet-client.js';
import type { OnetOccupation } from './onet-data.js';
import {
  buildSearchResultsHTML,
  buildOccupationDetailHTML,
  buildSummaryHTML,
} from './ui-templates.js';

// ---------------------------------------------------------------------------
// Credentials — read from environment, never hardcoded
// ---------------------------------------------------------------------------

/** Optional API key to protect the public MCP endpoint (set MCP_API_KEY in .env) */
const MCP_API_KEY = process.env.MCP_API_KEY ?? null;

const ONET_CREDENTIALS =
  process.env.ONET_USERNAME && process.env.ONET_PASSWORD
    ? { username: process.env.ONET_USERNAME, password: process.env.ONET_PASSWORD }
    : null;

// ---------------------------------------------------------------------------
// Map live O*NET API response → internal OnetOccupation shape
// ---------------------------------------------------------------------------
function mapLiveOccupation(
  summary: OnetReport,
  tags?: { bright_outlook?: boolean; green?: boolean },
): OnetOccupation {
  const wage = summary.wages?.wage?.[0];
  const outlookName = (summary.outlook?.category?.name ?? 'Average') as OnetOccupation['outlook'];

  // Education: pick the most-common category
  const eduCategories = summary.education?.education_usually_needed?.category ?? [];
  const topEdu = eduCategories.sort((a, b) => b.percent - a.percent)[0];

  return {
    code: summary.occupation.code,
    title: summary.occupation.title,
    description: summary.occupation.description,
    bright_outlook: tags?.bright_outlook ?? false,
    green: tags?.green ?? false,
    in_demand: false,
    tasks: [],
    skills: (summary.skills?.element ?? [])
      .slice(0, 8)
      .map((e) => ({ name: e.name, level: Math.round(e.score.value) })),
    knowledge: (summary.knowledge?.element ?? [])
      .slice(0, 6)
      .map((e) => ({ name: e.name, level: Math.round(e.score.value) })),
    work_styles: (summary.work_styles?.element ?? []).slice(0, 6).map((e) => e.name),
    education: topEdu?.name ?? 'N/A',
    median_wage: wage?.pct50 ?? 0,
    employment: wage?.employment ?? 0,
    outlook: outlookName,
    tags: [],
  };
}

const app = express();
const PORT = 3002;

app.use(cors({ origin: '*', exposedHeaders: ['Mcp-Session-Id'], allowedHeaders: ['*'] }));
app.use(express.json());

const transports: Record<string, StreamableHTTPServerTransport> = {};

// ---------------------------------------------------------------------------
// Session factory
// ---------------------------------------------------------------------------
function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'onet-mcp-server', version: '1.0.0' });

  // ── tool: onet_search ────────────────────────────────────────────────────
  server.registerTool(
    'onet_search',
    {
      title: 'O*NET Occupation Search',
      description:
        'Search O*NET occupational data by keyword. Returns an interactive UI listing matching ' +
        'occupations with salary, job outlook, and skills. Users can click any result to open ' +
        'the full occupation profile.',
      inputSchema: {
        keyword: z.string().describe('Job title, skill, or sector to search for'),
      },
    },
    async ({ keyword }) => {
      let results: OnetOccupation[];

      if (ONET_CREDENTIALS) {
        // ── Live O*NET API ──────────────────────────────────────────────────
        try {
          const apiResults = await liveSearch(keyword, ONET_CREDENTIALS);
          const occupations = apiResults.occupation ?? [];

          // Fetch summaries in parallel (up to 5 results)
          const summaries = await Promise.all(
            occupations.slice(0, 5).map(async (o) => {
              try {
                const summary = await liveOccupationSummary(o.code, ONET_CREDENTIALS!);
                return mapLiveOccupation(summary, o.tags);
              } catch {
                return null;
              }
            }),
          );

          results = summaries.filter((s): s is OnetOccupation => s !== null);
        } catch (err) {
          console.error('[onet] Live API error, falling back to embedded data:', err);
          results = searchOccupations(keyword);
        }
      } else {
        // ── Embedded dataset ────────────────────────────────────────────────
        results = searchOccupations(keyword);
      }

      const summaryResource = createUIResource({
        uri: `ui://onet/search-summary/${encodeURIComponent(keyword)}`,
        content: { type: 'rawHtml', htmlString: buildSummaryHTML(results) },
        encoding: 'text',
        adapters: { mcpApps: { enabled: true } },
        uiMetadata: { 'preferred-frame-size': ['100%', '280px'] },
      });

      const fullResource = createUIResource({
        uri: `ui://onet/search-full/${encodeURIComponent(keyword)}`,
        content: { type: 'rawHtml', htmlString: buildSearchResultsHTML(keyword, results) },
        encoding: 'text',
        adapters: { mcpApps: { enabled: true } },
        uiMetadata: { 'preferred-frame-size': ['100%', '600px'] },
      });

      const textSummary =
        results.length > 0
          ? `Found ${results.length} occupation(s) for "${keyword}":\n` +
            results
              .slice(0, 5)
              .map(
                (o) =>
                  `• ${o.title} (${o.code}) — $${(o.median_wage / 1000).toFixed(0)}k/yr — ${o.outlook}`,
              )
              .join('\n')
          : `No occupations found for "${keyword}". Try a broader term.`;

      return {
        content: [{ type: 'text', text: textSummary }, summaryResource, fullResource],
      };
    },
  );

  // ── tool: onet_details ───────────────────────────────────────────────────
  server.registerTool(
    'onet_details',
    {
      title: 'O*NET Occupation Details',
      description:
        'Retrieve the full O*NET profile for a specific occupation by its SOC code. ' +
        'Returns an interactive UI with tasks, skills, salary, job outlook, and education.',
      inputSchema: {
        code: z
          .string()
          .describe('O*NET / SOC occupation code, e.g. "15-1252.00" for Software Developers'),
      },
    },
    async ({ code }) => {
      let occ: OnetOccupation | undefined;

      if (ONET_CREDENTIALS) {
        // ── Live O*NET API ──────────────────────────────────────────────────
        try {
          const summary = await liveOccupationSummary(code, ONET_CREDENTIALS);
          occ = mapLiveOccupation(summary);
        } catch (err) {
          console.error(`[onet] Live API error for ${code}, trying embedded data:`, err);
          occ = getOccupation(code);
        }
      } else {
        occ = getOccupation(code);
      }

      if (!occ) {
        return {
          content: [
            {
              type: 'text',
              text:
                `Occupation code "${code}" not found.\n` +
                `Try onet_search first to get valid codes.\n` +
                `Embedded codes: ${OCCUPATIONS.map((o) => o.code).join(', ')}`,
            },
          ],
        };
      }

      const uiResource = createUIResource({
        uri: `ui://onet/occupation/${occ.code}`,
        content: { type: 'rawHtml', htmlString: buildOccupationDetailHTML(occ) },
        encoding: 'text',
        adapters: { mcpApps: { enabled: true } },
        uiMetadata: { 'preferred-frame-size': ['100%', '700px'] },
      });

      const textSummary =
        `**${occ.title}** (${occ.code})\n` +
        `${occ.description}\n\n` +
        `💰 Median wage: $${occ.median_wage.toLocaleString()}/yr\n` +
        `📈 Outlook: ${occ.outlook}\n` +
        `👷 Employment: ${occ.employment.toLocaleString()} jobs\n` +
        `🎓 Education: ${occ.education}\n` +
        `🔝 Top skills: ${occ.skills
          .slice()
          .sort((a, b) => b.level - a.level)
          .slice(0, 3)
          .map((s) => s.name)
          .join(', ')}`;

      return {
        content: [{ type: 'text', text: textSummary }, uiResource],
      };
    },
  );

  // ── tool: onet_list ──────────────────────────────────────────────────────
  server.registerTool(
    'onet_list',
    {
      title: 'List O*NET Occupations',
      description: ONET_CREDENTIALS
        ? 'List occupations from the embedded dataset (use onet_search for the full O*NET catalog).'
        : 'List all occupations in the embedded dataset.',
      inputSchema: {},
    },
    async () => {
      const lines = OCCUPATIONS.map((o) => `• ${o.code}  ${o.title}`).join('\n');
      return {
        content: [{ type: 'text', text: `Embedded occupations:\n${lines}` }],
      };
    },
  );

  return server;
}

// ---------------------------------------------------------------------------
// Optional API key middleware (for public deployments)
// ---------------------------------------------------------------------------
function checkApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!MCP_API_KEY) return next(); // no key required in dev mode
  const provided =
    req.headers['x-api-key'] ??
    req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (provided !== MCP_API_KEY) {
    res.status(401).json({ error: { message: 'Unauthorized: invalid API key' } });
    return;
  }
  next();
}

app.use('/mcp', checkApiKey);

// ---------------------------------------------------------------------------
// HTTP transport
// ---------------------------------------------------------------------------
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports[sid] = transport;
        console.log(`[onet] Session initialized: ${sid}`);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
        console.log(`[onet] Session closed: ${transport.sessionId}`);
      }
    };

    const server = createMcpServer();
    await server.connect(transport);
  } else {
    res.status(400).json({ error: { message: 'Bad Request: missing session' } });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

const handleSession = async (req: express.Request, res: express.Response) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(404).send('Session not found');
    return;
  }
  await transports[sessionId].handleRequest(req, res);
};

app.get('/mcp', handleSession);
app.delete('/mcp', handleSession);

// Health check (public, no auth required)
app.get('/', (_req, res) => {
  res.json({
    name: 'O*NET MCP Server',
    version: '1.0.0',
    mode: ONET_CREDENTIALS ? 'live' : 'embedded',
    auth: MCP_API_KEY ? 'api-key' : 'open',
    tools: ['onet_search', 'onet_details', 'onet_list'],
    endpoint: '/mcp',
    docs: 'Set X-Api-Key or Authorization: Bearer <key> header to authenticate',
  });
});

app.listen(PORT, () => {
  console.log(`\n🏷️  O*NET MCP Server running at http://localhost:${PORT}`);
  console.log(`   MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`\n   Tools: onet_search | onet_details | onet_list`);
  console.log(`\n   Adapter connector: MCP Apps SEP (text/html;profile=mcp-app)`);
  if (ONET_CREDENTIALS) {
    console.log(`\n   ✅ Live mode — calling services.onetcenter.org (user: ${ONET_CREDENTIALS.username})`);
  } else {
    console.log(`\n   ℹ️  Embedded mode — copy .env.example → .env to enable live API`);
  }
  if (MCP_API_KEY) {
    console.log(`   🔒 API key protection enabled (X-Api-Key or Authorization: Bearer)`);
  } else {
    console.log(`   ⚠️  No MCP_API_KEY set — endpoint is open (fine for local dev)`);
  }
  console.log();
});
