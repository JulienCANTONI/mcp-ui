/**
 * O*NET MCP Server — demonstrates MCP-UI adapter connector integration
 *
 * Context strategy (two layers):
 *
 *   1. MCP Apps hosts (Claude.ai, VS Code Copilot):
 *      Tools registered with _meta.ui.resourceUri pointing to
 *      ui://onet/{feature}/current URIs.
 *      The client fetches the resource via resources/read OUT-OF-BAND —
 *      the HTML never enters the LLM context window.
 *
 *   2. Legacy MCP-UI hosts (Nanobot, etc.):
 *      Tool response also includes an externalUrl resource as fallback.
 *      Only the URL (~100 chars) goes into the LLM context.
 *
 * Configuration (via environment variables, never hardcoded):
 *   ONET_USERNAME  – O*NET Web Services username
 *   ONET_PASSWORD  – O*NET Web Services API key
 *   MCP_API_KEY    – optional bearer token to protect the /mcp endpoint
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
import type { OnetOccupation } from './onet-data.js';
import {
  liveSearch,
  liveCareerReport,
  liveOccupationSummary,
  liveDetailedWorkActivities,
  liveWorkActivities,
  liveWorkContext,
  liveOccupationAbilities,
  liveOccupationInterests,
  liveOccupationEducation,
  liveOccupationJobZone,
  liveOccupationTechSkills,
  liveOccupationTools,
  liveRelatedOccupations,
  liveBrightOutlook,
  liveBrowseIndustries,
  liveBrowseIndustry,
  liveInterestProfilerQuestions,
  liveInterestProfilerCareers,
  type OnetReport,
  type MnmCareerReport,
  type MnmListings,
  type MnmBrowseIndustries,
  type MnmBrowseIndustry,
  type OnlineDWAResponse,
  type OnlineGWAResponse,
  type OnlineWorkContextResponse,
  type OnlineScoredResponse,
  type OnlineInterestsResponse,
  type OnlineEducationResponse,
  type OnlineJobZoneResponse,
  type OnlineTechSkillsResponse,
  type OnlineToolsResponse,
  type OnlineRelatedOccupations,
} from './onet-client.js';
import {
  buildSearchResultsHTML,
  buildOccupationDetailHTML,
  buildCareerReportHTML,
  buildWorkProfileHTML,
  buildTechStackHTML,
  buildInterestsEducationHTML,
  buildRelatedHTML,
  buildBrightOutlookHTML,
  buildBrowseHTML,
  buildInterestProfilerHTML,
  buildInterestMatchHTML,
  buildOccupationPlaceholderHTML,
} from './ui-templates.js';

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
  tags?: { bright_outlook?: boolean; green?: boolean; in_demand?: boolean },
): OnetOccupation {
  const wage = summary.wages?.wage?.[0];
  const outlookName = (summary.outlook?.category?.name ?? 'Average') as OnetOccupation['outlook'];
  const eduCategories = summary.education?.education_usually_needed?.category ?? [];
  const topEdu = [...eduCategories].sort((a, b) => b.percent - a.percent)[0];

  return {
    code: summary.occupation.code,
    title: summary.occupation.title,
    description: summary.occupation.description,
    bright_outlook: tags?.bright_outlook ?? false,
    green: tags?.green ?? false,
    in_demand: tags?.in_demand ?? false,
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
const careerReportCache = new Map<string, MnmCareerReport>();
const workProfileCache = new Map<string, { dwa: OnlineDWAResponse; gwa: OnlineGWAResponse; workContext: OnlineWorkContextResponse; abilities: OnlineScoredResponse }>();
const techStackCache = new Map<string, { techSkills: OnlineTechSkillsResponse; tools: OnlineToolsResponse }>();
const interestsCache = new Map<string, { interests: OnlineInterestsResponse; education: OnlineEducationResponse; jobZone: OnlineJobZoneResponse }>();
const relatedCache = new Map<string, OnlineRelatedOccupations>();
const brightOutlookCache = { listings: null as MnmListings | null };
const browseIndustriesCache = { data: null as MnmBrowseIndustries | null };
const browseIndustryCache = new Map<string, MnmBrowseIndustry>();
const profilerQuestionsCache = { data: null as { question?: Array<{ id?: string | number; text: string; area?: string }>; total?: number } | null };
const interestMatchCache = { data: null as { career?: Array<{ code: string; title: string; fit?: string; tags?: { bright_outlook?: boolean } }>; area?: Array<{ id: string; description: string; score?: number }> } | null };

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
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

app.get('/ui/career-report/:code', (req, res) => {
  const code = req.params.code;
  const report = careerReportCache.get(code);
  if (!report) {
    res.status(404).send('Career report not found — try calling onet_career_report again.');
    return;
  }
  const html = buildCareerReportHTML(report);
  const htmlWithAdapter = wrapHtmlWithAdapters(html, { mcpApps: { enabled: true } });
  res.setHeader('Content-Type', 'text/html');
  res.send(htmlWithAdapter);
});

app.get('/ui/work-profile/:code', (req, res) => {
  const code = req.params.code;
  const data = workProfileCache.get(code);
  const occ = occupationCache.get(code);
  if (!data || !occ) {
    res.status(404).send('Work profile not found — try calling onet_work_profile again.');
    return;
  }
  const html = buildWorkProfileHTML(code, occ.title, data);
  const htmlWithAdapter = wrapHtmlWithAdapters(html, { mcpApps: { enabled: true } });
  res.setHeader('Content-Type', 'text/html');
  res.send(htmlWithAdapter);
});

app.get('/ui/tech-stack/:code', (req, res) => {
  const code = req.params.code;
  const data = techStackCache.get(code);
  const occ = occupationCache.get(code);
  if (!data || !occ) {
    res.status(404).send('Tech stack not found — try calling onet_tech_stack again.');
    return;
  }
  const html = buildTechStackHTML(code, occ.title, data.techSkills, data.tools);
  const htmlWithAdapter = wrapHtmlWithAdapters(html, { mcpApps: { enabled: true } });
  res.setHeader('Content-Type', 'text/html');
  res.send(htmlWithAdapter);
});

app.get('/ui/interests/:code', (req, res) => {
  const code = req.params.code;
  const data = interestsCache.get(code);
  const occ = occupationCache.get(code);
  if (!data || !occ) {
    res.status(404).send('Interests/education data not found — try calling onet_interests_education again.');
    return;
  }
  const html = buildInterestsEducationHTML(code, occ.title, data.interests, data.education, data.jobZone);
  const htmlWithAdapter = wrapHtmlWithAdapters(html, { mcpApps: { enabled: true } });
  res.setHeader('Content-Type', 'text/html');
  res.send(htmlWithAdapter);
});

app.get('/ui/related/:code', (req, res) => {
  const code = req.params.code;
  const data = relatedCache.get(code);
  const occ = occupationCache.get(code);
  if (!data || !occ) {
    res.status(404).send('Related occupations not found — try calling onet_related again.');
    return;
  }
  const html = buildRelatedHTML(code, occ.title, data);
  const htmlWithAdapter = wrapHtmlWithAdapters(html, { mcpApps: { enabled: true } });
  res.setHeader('Content-Type', 'text/html');
  res.send(htmlWithAdapter);
});

app.get('/ui/bright-outlook', (_req, res) => {
  const listings = brightOutlookCache.listings;
  if (!listings) {
    res.status(404).send('Bright Outlook data not found — try calling onet_bright_outlook again.');
    return;
  }
  const html = buildBrightOutlookHTML(listings);
  const htmlWithAdapter = wrapHtmlWithAdapters(html, { mcpApps: { enabled: true } });
  res.setHeader('Content-Type', 'text/html');
  res.send(htmlWithAdapter);
});

app.get('/ui/browse', (req, res) => {
  const industryCode = req.query.code as string | undefined;
  const industries = browseIndustriesCache.data;
  const industry = industryCode ? (browseIndustryCache.get(industryCode) ?? null) : null;
  const html = buildBrowseHTML(industries, industry);
  const htmlWithAdapter = wrapHtmlWithAdapters(html, { mcpApps: { enabled: true } });
  res.setHeader('Content-Type', 'text/html');
  res.send(htmlWithAdapter);
});

app.get('/ui/profiler', (_req, res) => {
  const data = profilerQuestionsCache.data;
  if (!data) {
    res.status(404).send('Interest profiler questions not found — try calling onet_interest_profiler again.');
    return;
  }
  const html = buildInterestProfilerHTML(data);
  const htmlWithAdapter = wrapHtmlWithAdapters(html, { mcpApps: { enabled: true } });
  res.setHeader('Content-Type', 'text/html');
  res.send(htmlWithAdapter);
});

app.get('/ui/matches', (_req, res) => {
  const data = interestMatchCache.data;
  if (!data) {
    res.status(404).send('Interest match results not found — try calling onet_match_careers again.');
    return;
  }
  const html = buildInterestMatchHTML(data);
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
  let lastCareerReportCode: string | null = null;
  let lastWorkProfileCode: string | null = null;
  let lastTechStackCode: string | null = null;
  let lastInterestsCode: string | null = null;
  let lastRelatedCode: string | null = null;
  let lastBrowseCode: string | undefined;
  let lastInterestAnswers: string | null = null;

  // ── MCP Apps resources (out-of-band, never in LLM context) ───────────────

  registerAppResource(server, 'onet_search_ui', 'ui://onet/search/current', { _meta: { ui: {} } }, async () => {
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

  registerAppResource(server, 'onet_occupation_ui', 'ui://onet/occupation/current', { _meta: { ui: {} } }, async () => {
    const code = lastOccupationCode ?? '';
    const occ = code ? occupationCache.get(code) : undefined;
    const html = occ ? buildOccupationDetailHTML(occ) : buildOccupationPlaceholderHTML();
    const occUI = createUIResource({
      uri: 'ui://onet/occupation/current',
      content: { type: 'rawHtml', htmlString: html },
      encoding: 'text',
      adapters: { mcpApps: { enabled: true } },
    });
    return { contents: [occUI.resource] };
  });

  registerAppResource(server, 'onet_career_report_ui', 'ui://onet/career-report/current', { _meta: { ui: {} } }, async () => {
    const code = lastCareerReportCode ?? '';
    const report = code ? careerReportCache.get(code) : undefined;
    const html = report ? buildCareerReportHTML(report) : buildOccupationPlaceholderHTML();
    const ui = createUIResource({
      uri: 'ui://onet/career-report/current',
      content: { type: 'rawHtml', htmlString: html },
      encoding: 'text',
      adapters: { mcpApps: { enabled: true } },
    });
    return { contents: [ui.resource] };
  });

  registerAppResource(server, 'onet_work_profile_ui', 'ui://onet/work-profile/current', { _meta: { ui: {} } }, async () => {
    const code = lastWorkProfileCode ?? '';
    const data = code ? workProfileCache.get(code) : undefined;
    const occ = code ? occupationCache.get(code) : undefined;
    const html = data && occ
      ? buildWorkProfileHTML(code, occ.title, data)
      : buildOccupationPlaceholderHTML();
    const ui = createUIResource({
      uri: 'ui://onet/work-profile/current',
      content: { type: 'rawHtml', htmlString: html },
      encoding: 'text',
      adapters: { mcpApps: { enabled: true } },
    });
    return { contents: [ui.resource] };
  });

  registerAppResource(server, 'onet_tech_stack_ui', 'ui://onet/tech-stack/current', { _meta: { ui: {} } }, async () => {
    const code = lastTechStackCode ?? '';
    const data = code ? techStackCache.get(code) : undefined;
    const occ = code ? occupationCache.get(code) : undefined;
    const html = data && occ
      ? buildTechStackHTML(code, occ.title, data.techSkills, data.tools)
      : buildOccupationPlaceholderHTML();
    const ui = createUIResource({
      uri: 'ui://onet/tech-stack/current',
      content: { type: 'rawHtml', htmlString: html },
      encoding: 'text',
      adapters: { mcpApps: { enabled: true } },
    });
    return { contents: [ui.resource] };
  });

  registerAppResource(server, 'onet_interests_ui', 'ui://onet/interests/current', { _meta: { ui: {} } }, async () => {
    const code = lastInterestsCode ?? '';
    const data = code ? interestsCache.get(code) : undefined;
    const occ = code ? occupationCache.get(code) : undefined;
    const html = data && occ
      ? buildInterestsEducationHTML(code, occ.title, data.interests, data.education, data.jobZone)
      : buildOccupationPlaceholderHTML();
    const ui = createUIResource({
      uri: 'ui://onet/interests/current',
      content: { type: 'rawHtml', htmlString: html },
      encoding: 'text',
      adapters: { mcpApps: { enabled: true } },
    });
    return { contents: [ui.resource] };
  });

  registerAppResource(server, 'onet_related_ui', 'ui://onet/related/current', { _meta: { ui: {} } }, async () => {
    const code = lastRelatedCode ?? '';
    const data = code ? relatedCache.get(code) : undefined;
    const occ = code ? occupationCache.get(code) : undefined;
    const html = data && occ
      ? buildRelatedHTML(code, occ.title, data)
      : buildOccupationPlaceholderHTML();
    const ui = createUIResource({
      uri: 'ui://onet/related/current',
      content: { type: 'rawHtml', htmlString: html },
      encoding: 'text',
      adapters: { mcpApps: { enabled: true } },
    });
    return { contents: [ui.resource] };
  });

  registerAppResource(server, 'onet_bright_outlook_ui', 'ui://onet/bright-outlook/current', { _meta: { ui: {} } }, async () => {
    const listings = brightOutlookCache.listings;
    const html = listings ? buildBrightOutlookHTML(listings) : buildOccupationPlaceholderHTML();
    const ui = createUIResource({
      uri: 'ui://onet/bright-outlook/current',
      content: { type: 'rawHtml', htmlString: html },
      encoding: 'text',
      adapters: { mcpApps: { enabled: true } },
    });
    return { contents: [ui.resource] };
  });

  registerAppResource(server, 'onet_browse_ui', 'ui://onet/browse/current', { _meta: { ui: {} } }, async () => {
    const industries = browseIndustriesCache.data;
    const industry = lastBrowseCode ? (browseIndustryCache.get(lastBrowseCode) ?? null) : null;
    const html = buildBrowseHTML(industries, industry);
    const ui = createUIResource({
      uri: 'ui://onet/browse/current',
      content: { type: 'rawHtml', htmlString: html },
      encoding: 'text',
      adapters: { mcpApps: { enabled: true } },
    });
    return { contents: [ui.resource] };
  });

  registerAppResource(server, 'onet_profiler_ui', 'ui://onet/profiler/current', { _meta: { ui: {} } }, async () => {
    const data = profilerQuestionsCache.data;
    const html = data ? buildInterestProfilerHTML(data) : buildOccupationPlaceholderHTML();
    const ui = createUIResource({
      uri: 'ui://onet/profiler/current',
      content: { type: 'rawHtml', htmlString: html },
      encoding: 'text',
      adapters: { mcpApps: { enabled: true } },
    });
    return { contents: [ui.resource] };
  });

  registerAppResource(server, 'onet_matches_ui', 'ui://onet/matches/current', { _meta: { ui: {} } }, async () => {
    const data = interestMatchCache.data;
    const html = data ? buildInterestMatchHTML(data) : buildOccupationPlaceholderHTML();
    const ui = createUIResource({
      uri: 'ui://onet/matches/current',
      content: { type: 'rawHtml', htmlString: html },
      encoding: 'text',
      adapters: { mcpApps: { enabled: true } },
    });
    return { contents: [ui.resource] };
  });

  // ── tool: use_space ───────────────────────────────────────────────────────
  server.registerTool(
    'use_space',
    {
      title: 'Use O*NET UI Space',
      description: 'Initialize the O*NET career exploration space. Call this before using other O*NET tools.',
      inputSchema: { space_id: z.string().optional().describe('Space identifier') },
    },
    async () => ({
      content: [
        {
          type: 'text',
          text:
            'O*NET UI space ready.\n\n' +
            'Available tools:\n' +
            '• onet_search <keyword>          — search occupations with interactive UI\n' +
            '• onet_career_report <code>      — full career report (MNM)\n' +
            '• onet_work_profile <code>       — work activities, context, abilities\n' +
            '• onet_tech_stack <code>         — technology skills and tools\n' +
            '• onet_interests_education <code>— RIASEC interests, education, job zone\n' +
            '• onet_related <code>            — related occupations\n' +
            '• onet_bright_outlook            — Bright Outlook career listings\n' +
            '• onet_browse [code]             — browse careers by industry\n' +
            '• onet_interest_profiler         — take the Interest Profiler\n' +
            '• onet_match_careers <answers>   — match careers to Interest Profiler answers\n' +
            '• onet_details <code>            — full occupation profile (legacy)',
        },
      ],
    }),
  );

  // ── tool: onet_search ─────────────────────────────────────────────────────
  registerAppTool(
    server,
    'onet_search',
    {
      description:
        'Search O*NET occupational data by keyword. Returns an interactive UI listing matching ' +
        'occupations with salary, job outlook, and skills.',
      inputSchema: {
        keyword: z.string().min(1).describe('Job title, skill, or sector to search for'),
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

  // ── tool: onet_career_report ──────────────────────────────────────────────
  registerAppTool(
    server,
    'onet_career_report',
    {
      description:
        'Retrieve a full MNM career report for a specific occupation by its SOC code. ' +
        'Includes tasks, skills, technology, salary outlook, and education requirements.',
      inputSchema: {
        code: z.string().min(1).describe('O*NET / SOC occupation code, e.g. "15-1252.00"'),
      },
      _meta: { ui: { resourceUri: 'ui://onet/career-report/current' } },
    },
    async ({ code }) => {
      if (!ONET_CREDENTIALS) {
        lastCareerReportCode = null;
        const uiResource = createUIResource({
          uri: `ui://onet/career-report/${encodeURIComponent(code)}`,
          content: {
            type: 'externalUrl',
            iframeUrl: `${baseUrl}/ui/career-report/${encodeURIComponent(code)}`,
          },
          encoding: 'text',
          uiMetadata: { 'preferred-frame-size': ['100%', '600px'] },
        });
        return {
          content: [
            {
              type: 'text',
              text: 'O*NET credentials not configured. Set ONET_USERNAME and ONET_PASSWORD in .env to enable live data.',
            },
            uiResource,
          ],
        };
      }

      let report: MnmCareerReport;
      try {
        report = await liveCareerReport(code, ONET_CREDENTIALS);
      } catch (err) {
        console.error(`[onet] Career report error for ${code}:`, err);
        return {
          content: [{ type: 'text', text: `Failed to load career report for "${code}". Check the occupation code.` }],
        };
      }

      lastCareerReportCode = report.occupation.code;
      careerReportCache.set(report.occupation.code, report);

      const salary = report.job_outlook?.salary;
      const textSummary =
        `**${report.occupation.title}** (${report.occupation.code})\n` +
        `${report.occupation.description}\n\n` +
        (salary?.annual_median ? `Median annual salary: $${salary.annual_median.toLocaleString()}\n` : '') +
        (report.tags?.bright_outlook ? 'Bright Outlook occupation.\n' : '');

      const uiResource = createUIResource({
        uri: `ui://onet/career-report/${encodeURIComponent(code)}`,
        content: {
          type: 'externalUrl',
          iframeUrl: `${baseUrl}/ui/career-report/${encodeURIComponent(report.occupation.code)}`,
        },
        encoding: 'text',
        uiMetadata: { 'preferred-frame-size': ['100%', '600px'] },
      });

      return { content: [{ type: 'text', text: textSummary }, uiResource] };
    },
  );

  // ── tool: onet_work_profile ───────────────────────────────────────────────
  registerAppTool(
    server,
    'onet_work_profile',
    {
      description:
        'Get work activities, context, and abilities for an occupation. ' +
        'Includes detailed work activities (DWA), general work activities (GWA), work context, and abilities.',
      inputSchema: {
        code: z.string().min(1).describe('O*NET / SOC occupation code, e.g. "15-1252.00"'),
      },
      _meta: { ui: { resourceUri: 'ui://onet/work-profile/current' } },
    },
    async ({ code }) => {
      if (!ONET_CREDENTIALS) {
        lastWorkProfileCode = null;
        const uiResource = createUIResource({
          uri: `ui://onet/work-profile/${encodeURIComponent(code)}`,
          content: {
            type: 'externalUrl',
            iframeUrl: `${baseUrl}/ui/work-profile/${encodeURIComponent(code)}`,
          },
          encoding: 'text',
          uiMetadata: { 'preferred-frame-size': ['100%', '600px'] },
        });
        return {
          content: [
            {
              type: 'text',
              text: 'O*NET credentials not configured. Set ONET_USERNAME and ONET_PASSWORD in .env to enable live data.',
            },
            uiResource,
          ],
        };
      }

      let dwa: OnlineDWAResponse;
      let gwa: OnlineGWAResponse;
      let workContext: OnlineWorkContextResponse;
      let abilities: OnlineScoredResponse;

      try {
        [dwa, gwa, workContext, abilities] = await Promise.all([
          liveDetailedWorkActivities(code, ONET_CREDENTIALS),
          liveWorkActivities(code, ONET_CREDENTIALS),
          liveWorkContext(code, ONET_CREDENTIALS),
          liveOccupationAbilities(code, ONET_CREDENTIALS),
        ]);
      } catch (err) {
        console.error(`[onet] Work profile error for ${code}:`, err);
        return {
          content: [{ type: 'text', text: `Failed to load work profile for "${code}". Check the occupation code.` }],
        };
      }

      // Ensure the occupation is in the cache with at least a minimal entry
      if (!occupationCache.has(code)) {
        try {
          const summary = await liveOccupationSummary(code, ONET_CREDENTIALS);
          occupationCache.set(code, mapLiveOccupation(summary));
        } catch {
          occupationCache.set(code, {
            code,
            title: code,
            description: '',
            bright_outlook: false,
            green: false,
            in_demand: false,
            tasks: [],
            skills: [],
            knowledge: [],
            work_styles: [],
            education: 'N/A',
            median_wage: 0,
            employment: 0,
            outlook: 'Average',
            tags: [],
          });
        }
      }

      lastWorkProfileCode = code;
      workProfileCache.set(code, { dwa, gwa, workContext, abilities });

      const occ = occupationCache.get(code)!;
      const dwaCount = dwa.detailed_work_activity?.length ?? 0;
      const gwaCount = gwa.element?.length ?? 0;
      const textSummary =
        `**Work Profile: ${occ.title}** (${code})\n` +
        `Detailed work activities: ${dwaCount}\n` +
        `General work activities: ${gwaCount}\n` +
        `Top abilities: ${(abilities.element ?? []).slice(0, 3).map((e) => e.name).join(', ')}`;

      const uiResource = createUIResource({
        uri: `ui://onet/work-profile/${encodeURIComponent(code)}`,
        content: {
          type: 'externalUrl',
          iframeUrl: `${baseUrl}/ui/work-profile/${encodeURIComponent(code)}`,
        },
        encoding: 'text',
        uiMetadata: { 'preferred-frame-size': ['100%', '600px'] },
      });

      return { content: [{ type: 'text', text: textSummary }, uiResource] };
    },
  );

  // ── tool: onet_tech_stack ─────────────────────────────────────────────────
  registerAppTool(
    server,
    'onet_tech_stack',
    {
      description:
        'Get technology skills and tools used in a specific occupation.',
      inputSchema: {
        code: z.string().min(1).describe('O*NET / SOC occupation code, e.g. "15-1252.00"'),
      },
      _meta: { ui: { resourceUri: 'ui://onet/tech-stack/current' } },
    },
    async ({ code }) => {
      if (!ONET_CREDENTIALS) {
        lastTechStackCode = null;
        const uiResource = createUIResource({
          uri: `ui://onet/tech-stack/${encodeURIComponent(code)}`,
          content: {
            type: 'externalUrl',
            iframeUrl: `${baseUrl}/ui/tech-stack/${encodeURIComponent(code)}`,
          },
          encoding: 'text',
          uiMetadata: { 'preferred-frame-size': ['100%', '600px'] },
        });
        return {
          content: [
            {
              type: 'text',
              text: 'O*NET credentials not configured. Set ONET_USERNAME and ONET_PASSWORD in .env to enable live data.',
            },
            uiResource,
          ],
        };
      }

      let techSkills: OnlineTechSkillsResponse;
      let tools: OnlineToolsResponse;

      try {
        [techSkills, tools] = await Promise.all([
          liveOccupationTechSkills(code, ONET_CREDENTIALS),
          liveOccupationTools(code, ONET_CREDENTIALS),
        ]);
      } catch (err) {
        console.error(`[onet] Tech stack error for ${code}:`, err);
        return {
          content: [{ type: 'text', text: `Failed to load tech stack for "${code}". Check the occupation code.` }],
        };
      }

      if (!occupationCache.has(code)) {
        try {
          const summary = await liveOccupationSummary(code, ONET_CREDENTIALS);
          occupationCache.set(code, mapLiveOccupation(summary));
        } catch {
          occupationCache.set(code, {
            code,
            title: code,
            description: '',
            bright_outlook: false,
            green: false,
            in_demand: false,
            tasks: [],
            skills: [],
            knowledge: [],
            work_styles: [],
            education: 'N/A',
            median_wage: 0,
            employment: 0,
            outlook: 'Average',
            tags: [],
          });
        }
      }

      lastTechStackCode = code;
      techStackCache.set(code, { techSkills, tools });

      const occ = occupationCache.get(code)!;
      const techCount = techSkills.technology_skills?.length ?? 0;
      const toolCount = (tools.technology_skills?.length ?? 0) + (tools.tools_used?.length ?? 0);
      const textSummary =
        `**Tech Stack: ${occ.title}** (${code})\n` +
        `Technology skills: ${techCount}\n` +
        `Tools and technologies: ${toolCount}`;

      const uiResource = createUIResource({
        uri: `ui://onet/tech-stack/${encodeURIComponent(code)}`,
        content: {
          type: 'externalUrl',
          iframeUrl: `${baseUrl}/ui/tech-stack/${encodeURIComponent(code)}`,
        },
        encoding: 'text',
        uiMetadata: { 'preferred-frame-size': ['100%', '600px'] },
      });

      return { content: [{ type: 'text', text: textSummary }, uiResource] };
    },
  );

  // ── tool: onet_interests_education ────────────────────────────────────────
  registerAppTool(
    server,
    'onet_interests_education',
    {
      description:
        'Get RIASEC interest profile, education requirements, and job zone for an occupation.',
      inputSchema: {
        code: z.string().min(1).describe('O*NET / SOC occupation code, e.g. "15-1252.00"'),
      },
      _meta: { ui: { resourceUri: 'ui://onet/interests/current' } },
    },
    async ({ code }) => {
      if (!ONET_CREDENTIALS) {
        lastInterestsCode = null;
        const uiResource = createUIResource({
          uri: `ui://onet/interests/${encodeURIComponent(code)}`,
          content: {
            type: 'externalUrl',
            iframeUrl: `${baseUrl}/ui/interests/${encodeURIComponent(code)}`,
          },
          encoding: 'text',
          uiMetadata: { 'preferred-frame-size': ['100%', '600px'] },
        });
        return {
          content: [
            {
              type: 'text',
              text: 'O*NET credentials not configured. Set ONET_USERNAME and ONET_PASSWORD in .env to enable live data.',
            },
            uiResource,
          ],
        };
      }

      let interests: OnlineInterestsResponse;
      let education: OnlineEducationResponse;
      let jobZone: OnlineJobZoneResponse;

      try {
        [interests, education, jobZone] = await Promise.all([
          liveOccupationInterests(code, ONET_CREDENTIALS),
          liveOccupationEducation(code, ONET_CREDENTIALS),
          liveOccupationJobZone(code, ONET_CREDENTIALS),
        ]);
      } catch (err) {
        console.error(`[onet] Interests/education error for ${code}:`, err);
        return {
          content: [{ type: 'text', text: `Failed to load interests/education for "${code}". Check the occupation code.` }],
        };
      }

      if (!occupationCache.has(code)) {
        try {
          const summary = await liveOccupationSummary(code, ONET_CREDENTIALS);
          occupationCache.set(code, mapLiveOccupation(summary));
        } catch {
          occupationCache.set(code, {
            code,
            title: code,
            description: '',
            bright_outlook: false,
            green: false,
            in_demand: false,
            tasks: [],
            skills: [],
            knowledge: [],
            work_styles: [],
            education: 'N/A',
            median_wage: 0,
            employment: 0,
            outlook: 'Average',
            tags: [],
          });
        }
      }

      lastInterestsCode = code;
      interestsCache.set(code, { interests, education, jobZone });

      const occ = occupationCache.get(code)!;
      const topAreas = (interests.area ?? [])
        .sort((a, b) => (b.score?.value ?? 0) - (a.score?.value ?? 0))
        .slice(0, 3)
        .map((a) => a.id)
        .join(', ');
      const textSummary =
        `**Interests & Education: ${occ.title}** (${code})\n` +
        (topAreas ? `Top RIASEC areas: ${topAreas}\n` : '') +
        (jobZone.job_zone?.title ? `Job Zone: ${jobZone.job_zone.title}\n` : '');

      const uiResource = createUIResource({
        uri: `ui://onet/interests/${encodeURIComponent(code)}`,
        content: {
          type: 'externalUrl',
          iframeUrl: `${baseUrl}/ui/interests/${encodeURIComponent(code)}`,
        },
        encoding: 'text',
        uiMetadata: { 'preferred-frame-size': ['100%', '600px'] },
      });

      return { content: [{ type: 'text', text: textSummary }, uiResource] };
    },
  );

  // ── tool: onet_related ───────────────────────────────────────────────────
  registerAppTool(
    server,
    'onet_related',
    {
      description: 'Get occupations related to a specific O*NET occupation code.',
      inputSchema: {
        code: z.string().min(1).describe('O*NET / SOC occupation code, e.g. "15-1252.00"'),
      },
      _meta: { ui: { resourceUri: 'ui://onet/related/current' } },
    },
    async ({ code }) => {
      if (!ONET_CREDENTIALS) {
        lastRelatedCode = null;
        const uiResource = createUIResource({
          uri: `ui://onet/related/${encodeURIComponent(code)}`,
          content: {
            type: 'externalUrl',
            iframeUrl: `${baseUrl}/ui/related/${encodeURIComponent(code)}`,
          },
          encoding: 'text',
          uiMetadata: { 'preferred-frame-size': ['100%', '500px'] },
        });
        return {
          content: [
            {
              type: 'text',
              text: 'O*NET credentials not configured. Set ONET_USERNAME and ONET_PASSWORD in .env to enable live data.',
            },
            uiResource,
          ],
        };
      }

      let related: OnlineRelatedOccupations;
      try {
        related = await liveRelatedOccupations(code, ONET_CREDENTIALS);
      } catch (err) {
        console.error(`[onet] Related occupations error for ${code}:`, err);
        return {
          content: [{ type: 'text', text: `Failed to load related occupations for "${code}". Check the occupation code.` }],
        };
      }

      if (!occupationCache.has(code)) {
        try {
          const summary = await liveOccupationSummary(code, ONET_CREDENTIALS);
          occupationCache.set(code, mapLiveOccupation(summary));
        } catch {
          occupationCache.set(code, {
            code,
            title: code,
            description: '',
            bright_outlook: false,
            green: false,
            in_demand: false,
            tasks: [],
            skills: [],
            knowledge: [],
            work_styles: [],
            education: 'N/A',
            median_wage: 0,
            employment: 0,
            outlook: 'Average',
            tags: [],
          });
        }
      }

      lastRelatedCode = code;
      relatedCache.set(code, related);

      const occ = occupationCache.get(code)!;
      const count = related.occupation?.length ?? 0;
      const textSummary =
        `**Related Occupations: ${occ.title}** (${code})\n` +
        `Found ${count} related occupation(s).\n` +
        (related.occupation ?? [])
          .slice(0, 5)
          .map((o) => `• ${o.title} (${o.code})`)
          .join('\n');

      const uiResource = createUIResource({
        uri: `ui://onet/related/${encodeURIComponent(code)}`,
        content: {
          type: 'externalUrl',
          iframeUrl: `${baseUrl}/ui/related/${encodeURIComponent(code)}`,
        },
        encoding: 'text',
        uiMetadata: { 'preferred-frame-size': ['100%', '500px'] },
      });

      return { content: [{ type: 'text', text: textSummary }, uiResource] };
    },
  );

  // ── tool: onet_bright_outlook ─────────────────────────────────────────────
  registerAppTool(
    server,
    'onet_bright_outlook',
    {
      description: 'Browse Bright Outlook occupations — careers with faster than average growth, many job openings, or new and emerging opportunities.',
      inputSchema: {},
      _meta: { ui: { resourceUri: 'ui://onet/bright-outlook/current' } },
    },
    async () => {
      if (!ONET_CREDENTIALS) {
        const uiResource = createUIResource({
          uri: 'ui://onet/bright-outlook/current',
          content: {
            type: 'externalUrl',
            iframeUrl: `${baseUrl}/ui/bright-outlook`,
          },
          encoding: 'text',
          uiMetadata: { 'preferred-frame-size': ['100%', '600px'] },
        });
        return {
          content: [
            {
              type: 'text',
              text: 'O*NET credentials not configured. Set ONET_USERNAME and ONET_PASSWORD in .env to enable live data.',
            },
            uiResource,
          ],
        };
      }

      let listings: MnmListings;
      try {
        listings = await liveBrightOutlook(ONET_CREDENTIALS);
      } catch (err) {
        console.error('[onet] Bright Outlook error:', err);
        return {
          content: [{ type: 'text', text: 'Failed to load Bright Outlook careers.' }],
        };
      }

      brightOutlookCache.listings = listings;

      const count = listings.occupation?.length ?? 0;
      const textSummary =
        `**Bright Outlook Careers**\n` +
        `Found ${count} occupation(s) with bright job outlook.\n` +
        (listings.occupation ?? [])
          .slice(0, 5)
          .map((o) => `• ${o.title} (${o.code})`)
          .join('\n');

      const uiResource = createUIResource({
        uri: 'ui://onet/bright-outlook/current',
        content: {
          type: 'externalUrl',
          iframeUrl: `${baseUrl}/ui/bright-outlook`,
        },
        encoding: 'text',
        uiMetadata: { 'preferred-frame-size': ['100%', '600px'] },
      });

      return { content: [{ type: 'text', text: textSummary }, uiResource] };
    },
  );

  // ── tool: onet_browse ─────────────────────────────────────────────────────
  registerAppTool(
    server,
    'onet_browse',
    {
      description:
        'Browse occupations by industry. Omit code to see all industries; provide a code to see careers in a specific industry.',
      inputSchema: {
        code: z.string().optional().describe('Industry code to browse (omit to list all industries)'),
      },
      _meta: { ui: { resourceUri: 'ui://onet/browse/current' } },
    },
    async ({ code }) => {
      if (!ONET_CREDENTIALS) {
        lastBrowseCode = code;
        const uiResource = createUIResource({
          uri: 'ui://onet/browse/current',
          content: {
            type: 'externalUrl',
            iframeUrl: `${baseUrl}/ui/browse${code ? `?code=${encodeURIComponent(code)}` : ''}`,
          },
          encoding: 'text',
          uiMetadata: { 'preferred-frame-size': ['100%', '600px'] },
        });
        return {
          content: [
            {
              type: 'text',
              text: 'O*NET credentials not configured. Set ONET_USERNAME and ONET_PASSWORD in .env to enable live data.',
            },
            uiResource,
          ],
        };
      }

      try {
        if (!browseIndustriesCache.data) {
          browseIndustriesCache.data = await liveBrowseIndustries(ONET_CREDENTIALS);
        }
        if (code) {
          const industry = await liveBrowseIndustry(code, ONET_CREDENTIALS);
          browseIndustryCache.set(code, industry);
        }
      } catch (err) {
        console.error('[onet] Browse error:', err);
        return {
          content: [{ type: 'text', text: `Failed to load industry browse data.` }],
        };
      }

      lastBrowseCode = code;

      const industries = browseIndustriesCache.data;
      const industry = code ? (browseIndustryCache.get(code) ?? null) : null;

      let textSummary: string;
      if (industry) {
        const mostCareers = industry.most?.career ?? [];
        const someCareers = industry.some?.career ?? [];
        const count = mostCareers.length + someCareers.length;
        textSummary =
          `**Industry: ${industry.industry?.title ?? code}**\n` +
          `${count} occupation(s) in this industry.\n` +
          [...mostCareers, ...someCareers]
            .slice(0, 5)
            .map((o) => `• ${o.title} (${o.code})`)
            .join('\n');
      } else {
        const count = industries?.industry?.length ?? 0;
        textSummary =
          `**Browse by Industry**\n` +
          `${count} industries available.\n` +
          (industries?.industry ?? [])
            .slice(0, 5)
            .map((i) => `• ${i.title} (${i.code})`)
            .join('\n');
      }

      const uiResource = createUIResource({
        uri: 'ui://onet/browse/current',
        content: {
          type: 'externalUrl',
          iframeUrl: `${baseUrl}/ui/browse${code ? `?code=${encodeURIComponent(code)}` : ''}`,
        },
        encoding: 'text',
        uiMetadata: { 'preferred-frame-size': ['100%', '600px'] },
      });

      return { content: [{ type: 'text', text: textSummary }, uiResource] };
    },
  );

  // ── tool: onet_interest_profiler ──────────────────────────────────────────
  registerAppTool(
    server,
    'onet_interest_profiler',
    {
      description:
        'Load the O*NET Interest Profiler Mini questionnaire (30 questions). ' +
        'After answering, use onet_match_careers with the answers to find matching careers.',
      inputSchema: {},
      _meta: { ui: { resourceUri: 'ui://onet/profiler/current' } },
    },
    async () => {
      if (!ONET_CREDENTIALS) {
        const uiResource = createUIResource({
          uri: 'ui://onet/profiler/current',
          content: {
            type: 'externalUrl',
            iframeUrl: `${baseUrl}/ui/profiler`,
          },
          encoding: 'text',
          uiMetadata: { 'preferred-frame-size': ['100%', '700px'] },
        });
        return {
          content: [
            {
              type: 'text',
              text: 'O*NET credentials not configured. Set ONET_USERNAME and ONET_PASSWORD in .env to enable live data.',
            },
            uiResource,
          ],
        };
      }

      let questions: { question?: Array<{ id?: string | number; text: string; area?: string }>; total?: number };
      try {
        questions = await liveInterestProfilerQuestions(ONET_CREDENTIALS);
      } catch (err) {
        console.error('[onet] Interest profiler error:', err);
        return {
          content: [{ type: 'text', text: 'Failed to load Interest Profiler questions.' }],
        };
      }

      profilerQuestionsCache.data = questions;

      const total = questions.total ?? questions.question?.length ?? 0;
      const textSummary =
        `**O*NET Interest Profiler**\n` +
        `${total} questions loaded. Answer each with: L (Like), + (Unsure), or D (Dislike).\n` +
        `After answering all questions, call onet_match_careers with your answers string.`;

      const uiResource = createUIResource({
        uri: 'ui://onet/profiler/current',
        content: {
          type: 'externalUrl',
          iframeUrl: `${baseUrl}/ui/profiler`,
        },
        encoding: 'text',
        uiMetadata: { 'preferred-frame-size': ['100%', '700px'] },
      });

      return { content: [{ type: 'text', text: textSummary }, uiResource] };
    },
  );

  // ── tool: onet_match_careers ──────────────────────────────────────────────
  registerAppTool(
    server,
    'onet_match_careers',
    {
      description:
        'Match careers to Interest Profiler answers. Provide the 30-character answers string ' +
        '(one character per question: L=Like, +=Unsure, D=Dislike).',
      inputSchema: {
        answers: z.string().min(1).describe('Interest Profiler answers string (e.g. "LLDD+LLD...")'),
      },
      _meta: { ui: { resourceUri: 'ui://onet/matches/current' } },
    },
    async ({ answers }) => {
      if (!ONET_CREDENTIALS) {
        lastInterestAnswers = answers;
        const uiResource = createUIResource({
          uri: 'ui://onet/matches/current',
          content: {
            type: 'externalUrl',
            iframeUrl: `${baseUrl}/ui/matches`,
          },
          encoding: 'text',
          uiMetadata: { 'preferred-frame-size': ['100%', '600px'] },
        });
        return {
          content: [
            {
              type: 'text',
              text: 'O*NET credentials not configured. Set ONET_USERNAME and ONET_PASSWORD in .env to enable live data.',
            },
            uiResource,
          ],
        };
      }

      let careers: {
        career?: Array<{ code: string; title: string; fit?: string; tags?: { bright_outlook?: boolean } }>;
        area?: Array<{ id: string; description: string; score?: number }>;
      };
      try {
        careers = await liveInterestProfilerCareers(answers, ONET_CREDENTIALS);
      } catch (err) {
        console.error('[onet] Interest match error:', err);
        return {
          content: [{ type: 'text', text: 'Failed to load career matches. Check your answers string format.' }],
        };
      }

      lastInterestAnswers = answers;
      interestMatchCache.data = careers;

      const count = careers.career?.length ?? 0;
      const topAreas = (careers.area ?? [])
        .slice(0, 3)
        .map((a) => `${a.id} (${a.score ?? 0})`)
        .join(', ');
      const textSummary =
        `**Career Matches**\n` +
        `Found ${count} matching career(s).\n` +
        (topAreas ? `Top interest areas: ${topAreas}\n` : '') +
        (careers.career ?? [])
          .slice(0, 5)
          .map((c) => `• ${c.title} (${c.code}) — fit: ${c.fit ?? 'N/A'}`)
          .join('\n');

      const uiResource = createUIResource({
        uri: 'ui://onet/matches/current',
        content: {
          type: 'externalUrl',
          iframeUrl: `${baseUrl}/ui/matches`,
        },
        encoding: 'text',
        uiMetadata: { 'preferred-frame-size': ['100%', '600px'] },
      });

      return { content: [{ type: 'text', text: textSummary }, uiResource] };
    },
  );

  // ── tool: onet_details (legacy) ───────────────────────────────────────────
  registerAppTool(
    server,
    'onet_details',
    {
      description:
        'Retrieve the full O*NET profile for a specific occupation by its SOC code. ' +
        'Returns an interactive UI with skills, salary, job outlook, and education.',
      inputSchema: {
        code: z.string().min(1).describe('O*NET / SOC occupation code, e.g. "15-1252.00"'),
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

  return server;
}

// ---------------------------------------------------------------------------
// Optional API key middleware
// ---------------------------------------------------------------------------
function checkApiKey(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!MCP_API_KEY) {
    next();
    return;
  }
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
    res.status(400).json({ error: { message: 'Bad Request: missing or invalid session' } });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

const handleSession = async (req: express.Request, res: express.Response): Promise<void> => {
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
    tools: [
      'use_space',
      'onet_search',
      'onet_career_report',
      'onet_work_profile',
      'onet_tech_stack',
      'onet_interests_education',
      'onet_related',
      'onet_bright_outlook',
      'onet_browse',
      'onet_interest_profiler',
      'onet_match_careers',
      'onet_details',
    ],
    endpoint: '/mcp',
  });
});

app.listen(PORT, () => {
  console.log(`\nO*NET MCP Server running at http://localhost:${PORT}`);
  console.log(`   MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`\n   Context strategy:`);
  console.log(`   - MCP Apps hosts (Claude.ai, VS Code): HTML out-of-band via resources/read`);
  console.log(`   - Legacy hosts: externalUrl - URL in context only`);
  if (ONET_CREDENTIALS) {
    console.log(`\n   Live mode (user: ${ONET_CREDENTIALS.username})`);
  } else {
    console.log(`\n   Embedded mode - copy .env.example -> .env to enable live API`);
  }
  console.log();
});
