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
 * Run:  pnpm dev   (from this directory)
 * Port: 3002
 */

import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createUIResource } from '@mcp-ui/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';

import { searchOccupations, getOccupation, OCCUPATIONS } from './onet-data.js';
import {
  buildSearchResultsHTML,
  buildOccupationDetailHTML,
  buildSummaryHTML,
} from './ui-templates.js';

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
      const results = searchOccupations(keyword);

      // Build two resources:
      //   1. A compact summary card (inline in chat)
      //   2. A full search results page

      const summaryResource = createUIResource({
        uri: `ui://onet/search-summary/${encodeURIComponent(keyword)}`,
        content: { type: 'rawHtml', htmlString: buildSummaryHTML(results) },
        encoding: 'text',
        // MCP Apps SEP adapter connector — produces text/html;profile=mcp-app
        adapters: { mcpApps: { enabled: true } },
        uiMetadata: { 'preferred-frame-size': ['100%', '280px'] },
      });

      const fullResource = createUIResource({
        uri: `ui://onet/search-full/${encodeURIComponent(keyword)}`,
        content: { type: 'rawHtml', htmlString: buildSearchResultsHTML(keyword, results) },
        encoding: 'text',
        // MCP Apps SEP adapter connector
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
        content: [
          { type: 'text', text: textSummary },
          summaryResource,
          fullResource,
        ],
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
      const occ = getOccupation(code);

      if (!occ) {
        return {
          content: [
            {
              type: 'text',
              text:
                `Occupation code "${code}" not found in the local dataset.\n` +
                `Available codes: ${OCCUPATIONS.map((o) => o.code).join(', ')}`,
            },
          ],
        };
      }

      const uiResource = createUIResource({
        uri: `ui://onet/occupation/${occ.code}`,
        content: { type: 'rawHtml', htmlString: buildOccupationDetailHTML(occ) },
        encoding: 'text',
        // MCP Apps SEP adapter connector
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
      title: 'List all O*NET Occupations',
      description: 'List all occupations available in this demo dataset.',
      inputSchema: {},
    },
    async () => {
      const lines = OCCUPATIONS.map((o) => `• ${o.code}  ${o.title}`).join('\n');
      return {
        content: [{ type: 'text', text: `Available occupations:\n${lines}` }],
      };
    },
  );

  return server;
}

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

// Health check
app.get('/', (_req, res) => {
  res.json({
    name: 'O*NET MCP Server',
    version: '1.0.0',
    tools: ['onet_search', 'onet_details', 'onet_list'],
    endpoint: `http://localhost:${PORT}/mcp`,
    description:
      'MCP server exposing O*NET occupational data via MCP-UI with the MCP Apps adapter connector.',
  });
});

app.listen(PORT, () => {
  console.log(`\n🏷️  O*NET MCP Server running at http://localhost:${PORT}`);
  console.log(`   MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`\n   Tools available:`);
  console.log(`   • onet_search  — search by keyword (e.g. "developer", "nurse")`);
  console.log(`   • onet_details — get details by SOC code (e.g. "15-1252.00")`);
  console.log(`   • onet_list    — list all occupations in the dataset`);
  console.log(`\n   Adapter connector: MCP Apps SEP (text/html;profile=mcp-app)\n`);
});
