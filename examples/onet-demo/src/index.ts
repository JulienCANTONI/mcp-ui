/**
 * O*NET MCP Server — demonstrates MCP-UI adapter connector integration
 *
 * Context strategy (two layers):
 *
 *   1. MCP Apps hosts (Claude.ai, VS Code Copilot):
 *      Tools registered with _meta.ui.resourceUri pointing to
 *      ui://onet/search/current / ui://onet/occupation/current.
 *      Claude.ai fetches the resource via resources/read OUT-OF-BAND —
 *      the HTML never enters the LLM context window.
 *
 *   2. Legacy MCP-UI hosts (Nanobot, etc.):
 *      Tool response also includes an externalUrl resource as fallback.
 *      Only the URL (~100 chars) goes into the LLM context.
 *
 * Configuration (via environment variables, never hardcoded):
 *   ONET_USERNAME  – O*NET Web Services username
 *   ONET_PASSWORD  – O*NET Web Services API key
 *
 * Run:  pnpm dev   (from this directory)
 * Port: 3002
 */

import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createUIResource, wrapHtmlWithAdapters } from '@mcp-ui/server';
import { registerAppTool, registerAppResource } from '@modelcontextprotocol/ext-apps/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';

import { searchOccupations, getOccupation, OCCUPATIONS } from './onet-data.js';
import { liveSearch, liveOccupationSummary, type OnetReport } from './onet-client.js';
import type { OnetOccupation } from './onet-data.js';
import { buildSearchResultsHTML, buildOccupationDetailHTML } from './ui-templates.js';

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Shared caches — populated by tools, read by Express routes and resource handlers
// ---------------------------------------------------------------------------
const searchCache = new Map<string, OnetOccupation[]>();
const occupationCache = new Map<string, OnetOccupation>();

const app = express();
const PORT = 3002;

app.use(cors({ origin: '*', exposedHeaders: ['Mcp-Session-Id'], allowedHeaders: ['*'] }));
app.use(express.json());

const transports: Record<string, StreamableHTTPServerTransport> = {};

// ---------------------------------------------------------------------------
// HTML routes — serve pages for externalUrl (legacy host fallback)
// ---------------------------------------------------------------------------

app.get('/ui/search', (req, res) => {
  const keyword = (req.query.keyword as string) ?? '';
  const results = searchCache.get(keyword) ?? [];
  const html = buildSearchResultsHTML(keyword, results);
  const htmlWithAdapter = wrapHtmlWithAdapters(html, { mcpApps: { enabled: true } });
  res.setHeader('Content-Type', 'text/html');
  res.send(htmlWithAdapter);
});

app.get('/ui/occupation/:code', (req, res) => {
  const code = req.params.code;
  const occ = occupationCache.get(code);
  if (!occ) {
    res.status(404).send('Occupation not found — try calling onet_details again.');
    return;
  }
  const html = buildOccupationDetailHTML(occ);
  const htmlWithAdapter = wrapHtmlWithAdapters(html, { mcpApps: { enabled: true } });
  res.setHeader('Content-Type', 'text/html');
  res.send(htmlWithAdapter);
});

// ---------------------------------------------------------------------------
// Session factory
// ---------------------------------------------------------------------------
function createMcpServer(baseUrl: string): McpServer {
  const server = new McpServer({ name: 'onet-mcp-server', version: '1.0.0' });

  // Per-session state: tracks the last result so the out-of-band resource
  // handler always serves the correct HTML for this session.
  let lastSearchKeyword: string | null = null;
  let lastOccupationCode: string | null = null;

  // ── MCP Apps resources (out-of-band, never in LLM context) ───────────────

  registerAppResource(server, 'onet_search_ui', 'ui://onet/search/current', {}, async () => {
    const keyword = lastSearchKeyword ?? '';
    const results = keyword ? (searchCache.get(keyword) ?? []) : [];
    const searchUI = createUIResource({
      uri: 'ui://onet/search/current',
      content: { type: 'rawHtml', htmlString: buildSearchResultsHTML(keyword, results) },
      encoding: 'text',
      adapters: { mcpApps: { enabled: true } },
    });
    return { contents: [searchUI.resource] };
  });

  registerAppResource(server, 'onet_occupation_ui', 'ui://onet/occupation/current', {}, async () => {
    const code = lastOccupationCode ?? '';
    const occ = code ? occupationCache.get(code) : undefined;
    const html = occ
      ? buildOccupationDetailHTML(occ)
      : '<html><body style="font-family:sans-serif;padding:20px"><p>Call onet_details first.</p></body></html>';
    const occUI = createUIResource({
      uri: 'ui://onet/occupation/current',
      content: { type: 'rawHtml', htmlString: html },
      encoding: 'text',
      adapters: { mcpApps: { enabled: true } },
    });
    return { contents: [occUI.resource] };
  });

  // ── tool: use_space ───────────────────────────────────────────────────────
  server.registerTool(
    'use_space',
    {
      title: 'Use O*NET UI Space',
      description: 'Initialize the O*NET UI space. Call this before using other O*NET tools.',
      inputSchema: { space_id: z.string().optional().describe('Space identifier') },
    },
    async () => ({
      content: [
        {
          type: 'text',
          text:
            'O*NET UI space ready.\n\n' +
            'Available tools:\n' +
            '• onet_search <keyword> — search occupations with interactive UI\n' +
            '• onet_details <code>  — full occupation profile with interactive UI\n' +
            '• onet_list            — list embedded occupations',
        },
      ],
    }),
  );

  // ── tool: onet_search ────────────────────────────────────────────────────
  // _meta.ui.resourceUri → Claude.ai/VS Code fetch HTML out-of-band (zero context cost)
  // externalUrl in response → fallback for legacy hosts
  registerAppTool(
    server,
    'onet_search',
    {
      description:
        'Search O*NET occupational data by keyword. Returns an interactive UI listing matching ' +
        'occupations with salary, job outlook, and skills.',
      inputSchema: {
        keyword: z.string().describe('Job title, skill, or sector to search for'),
      },
      _meta: { ui: { resourceUri: 'ui://onet/search/current' } },
    },
    async ({ keyword }) => {
      let results: OnetOccupation[];

      if (ONET_CREDENTIALS) {
        try {
          const apiResults = await liveSearch(keyword, ONET_CREDENTIALS);
          const occupations = apiResults.occupation ?? [];
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
        results = searchOccupations(keyword);
      }

      lastSearchKeyword = keyword;
      searchCache.set(keyword, results);

      const textSummary =
        results.length > 0
          ? `Found ${results.length} occupation(s) for "${keyword}":\n` +
            results
              .slice(0, 5)
              .map((o) => `• ${o.title} (${o.code}) — $${(o.median_wage / 1000).toFixed(0)}k/yr — ${o.outlook}`)
              .join('\n')
          : `No occupations found for "${keyword}". Try a broader term.`;

      // Legacy fallback: externalUrl (URL only in context, ~100 chars)
      const uiResource = createUIResource({
        uri: `ui://onet/search/${encodeURIComponent(keyword)}`,
        content: {
          type: 'externalUrl',
          iframeUrl: `${baseUrl}/ui/search?keyword=${encodeURIComponent(keyword)}`,
        },
        encoding: 'text',
        uiMetadata: { 'preferred-frame-size': ['100%', '500px'] },
      });

      return { content: [{ type: 'text', text: textSummary }, uiResource] };
    },
  );

  // ── tool: onet_details ───────────────────────────────────────────────────
  registerAppTool(
    server,
    'onet_details',
    {
      description:
        'Retrieve the full O*NET profile for a specific occupation by its SOC code. ' +
        'Returns an interactive UI with skills, salary, job outlook, and education.',
      inputSchema: {
        code: z.string().describe('O*NET / SOC occupation code, e.g. "15-1252.00"'),
      },
      _meta: { ui: { resourceUri: 'ui://onet/occupation/current' } },
    },
    async ({ code }) => {
      let occ: OnetOccupation | undefined;

      if (ONET_CREDENTIALS) {
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

      lastOccupationCode = occ.code;
      occupationCache.set(occ.code, occ);

      const textSummary =
        `**${occ.title}** (${occ.code})\n` +
        `${occ.description}\n\n` +
        `Median wage: $${occ.median_wage.toLocaleString()}/yr | Outlook: ${occ.outlook} | Education: ${occ.education}\n` +
        `Top skills: ${occ.skills
          .slice()
          .sort((a, b) => b.level - a.level)
          .slice(0, 3)
          .map((s) => s.name)
          .join(', ')}`;

      // Legacy fallback
      const uiResource = createUIResource({
        uri: `ui://onet/occupation/${occ.code}`,
        content: {
          type: 'externalUrl',
          iframeUrl: `${baseUrl}/ui/occupation/${encodeURIComponent(occ.code)}`,
        },
        encoding: 'text',
        uiMetadata: { 'preferred-frame-size': ['100%', '700px'] },
      });

      return { content: [{ type: 'text', text: textSummary }, uiResource] };
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
      return { content: [{ type: 'text', text: `Embedded occupations:\n${lines}` }] };
    },
  );

  return server;
}

// ---------------------------------------------------------------------------
// Optional API key middleware
// ---------------------------------------------------------------------------
function checkApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!MCP_API_KEY) return next();
  const provided =
    req.headers['x-api-key'] ?? req.headers.authorization?.replace(/^Bearer\s+/i, '');
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

    const protocol =
      (req.headers['x-forwarded-proto'] as string | undefined) ??
      (req.secure ? 'https' : 'http');
    const host = req.headers.host ?? `localhost:${PORT}`;
    const baseUrl = `${protocol}://${host}`;

    const server = createMcpServer(baseUrl);
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

app.get('/', (_req, res) => {
  res.json({
    name: 'O*NET MCP Server',
    version: '1.0.0',
    mode: ONET_CREDENTIALS ? 'live' : 'embedded',
    auth: MCP_API_KEY ? 'api-key' : 'open',
    tools: ['onet_search', 'onet_details', 'onet_list'],
    endpoint: '/mcp',
  });
});

app.listen(PORT, () => {
  console.log(`\n🏷️  O*NET MCP Server running at http://localhost:${PORT}`);
  console.log(`   MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`\n   Context strategy:`);
  console.log(`   • MCP Apps hosts (Claude.ai, VS Code): HTML out-of-band via resources/read`);
  console.log(`   • Legacy hosts: externalUrl — URL in context only`);
  if (ONET_CREDENTIALS) {
    console.log(`\n   ✅ Live mode (user: ${ONET_CREDENTIALS.username})`);
  } else {
    console.log(`\n   ℹ️  Embedded mode — copy .env.example → .env to enable live API`);
  }
  console.log();
});
