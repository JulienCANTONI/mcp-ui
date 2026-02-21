/**
 * O*NET MCP Server — demonstrates MCP-UI adapter connector integration
 *
 * Tools exposed:
 *   onet_search   – search occupations by keyword → returns MCP-UI resource
 *   onet_details  – get occupation detail by SOC code → returns MCP-UI resource
 *
 * Resources use externalUrl (not rawHtml) so the HTML is served by Express
 * on demand and only a short URL goes into the LLM context (~100 chars vs ~32 KB).
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
import { createUIResource, wrapHtmlWithAdapters } from '@mcp-ui/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';

import { searchOccupations, getOccupation, OCCUPATIONS } from './onet-data.js';
import { liveSearch, liveOccupationSummary, type OnetReport } from './onet-client.js';
import type { OnetOccupation } from './onet-data.js';
import { buildSearchResultsHTML, buildOccupationDetailHTML } from './ui-templates.js';

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

// ---------------------------------------------------------------------------
// In-memory caches (keyword → results, code → occupation)
// These are populated by the MCP tools and read by the HTML routes.
// ---------------------------------------------------------------------------
const searchCache = new Map<string, OnetOccupation[]>();
const occupationCache = new Map<string, OnetOccupation>();

const app = express();
const PORT = 3002;

app.use(cors({ origin: '*', exposedHeaders: ['Mcp-Session-Id'], allowedHeaders: ['*'] }));
app.use(express.json());

const transports: Record<string, StreamableHTTPServerTransport> = {};

// ---------------------------------------------------------------------------
// HTML routes — serve pages for externalUrl resources
// The adapter script is injected here so only a URL goes into LLM context.
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
// Session factory — receives the base URL so tools can build externalUrl links
// ---------------------------------------------------------------------------
function createMcpServer(baseUrl: string): McpServer {
  const server = new McpServer({ name: 'onet-mcp-server', version: '1.0.0' });

  // ── tool: use_space ───────────────────────────────────────────────────────
  // Claude.ai calls this tool before using other tools in a "space" connector.
  server.registerTool(
    'use_space',
    {
      title: 'Use O*NET UI Space',
      description: 'Initialize the O*NET UI space. Call this before using other O*NET tools.',
      inputSchema: {
        space_id: z.string().optional().describe('Space identifier'),
      },
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

      // Cache results so the /ui/search route can serve them
      searchCache.set(keyword, results);

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

      // externalUrl: only the URL goes into the LLM context (~80 chars, not ~32 KB)
      const uiResource = createUIResource({
        uri: `ui://onet/search/${encodeURIComponent(keyword)}`,
        content: {
          type: 'externalUrl',
          iframeUrl: `${baseUrl}/ui/search?keyword=${encodeURIComponent(keyword)}`,
        },
        encoding: 'text',
        uiMetadata: { 'preferred-frame-size': ['100%', '500px'] },
      });

      return {
        content: [{ type: 'text', text: textSummary }, uiResource],
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

      // Cache occupation so the /ui/occupation/:code route can serve it
      occupationCache.set(occ.code, occ);

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

      // externalUrl: only the URL goes into the LLM context (~80 chars, not ~16 KB)
      const uiResource = createUIResource({
        uri: `ui://onet/occupation/${occ.code}`,
        content: {
          type: 'externalUrl',
          iframeUrl: `${baseUrl}/ui/occupation/${encodeURIComponent(occ.code)}`,
        },
        encoding: 'text',
        uiMetadata: { 'preferred-frame-size': ['100%', '700px'] },
      });

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

    // Detect base URL from the incoming request so externalUrl links work in
    // both local dev (http://localhost:3002) and remote environments (Codespaces, etc.)
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
  console.log(`\n   UI resources use externalUrl — HTML served on demand, not embedded in context`);
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
