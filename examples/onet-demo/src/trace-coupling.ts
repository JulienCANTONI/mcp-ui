/**
 * Trace the full coupling: O*NET API → mapLiveOccupation() → createUIResource()
 *
 * Run: vite-node src/trace-coupling.ts
 */

import 'dotenv/config';
import { createUIResource } from '@mcp-ui/server';
import { liveSearch, liveOccupationSummary } from './onet-client.js';
import { searchOccupations } from './onet-data.js';
import { buildOccupationDetailHTML, buildSearchResultsHTML } from './ui-templates.js';
import type { OnetOccupation } from './onet-data.js';
import type { OnetReport } from './onet-client.js';

const CREDS =
  process.env.ONET_USERNAME && process.env.ONET_PASSWORD
    ? { username: process.env.ONET_USERNAME, password: process.env.ONET_PASSWORD }
    : null;

const KEYWORD = process.argv[2] ?? 'developer';
const SEPARATOR = '─'.repeat(60);

function section(title: string) {
  console.log(`\n${SEPARATOR}`);
  console.log(`  ${title}`);
  console.log(SEPARATOR);
}

// ── Step 1: Raw O*NET API call ──────────────────────────────────────────────

section('STEP 1 — O*NET API response (raw JSON)');

let rawSearchResponse: unknown;
let rawSummary: OnetReport | null = null;
let occupation: OnetOccupation;

if (CREDS) {
  console.log(`Mode: LIVE (user=${CREDS.username})`);
  console.log(`GET https://services.onetcenter.org/ws/mnm/search?keyword=${KEYWORD}\n`);

  try {
    rawSearchResponse = await liveSearch(KEYWORD, CREDS);
    console.log(JSON.stringify(rawSearchResponse, null, 2).slice(0, 1200));

    const hits = (rawSearchResponse as { occupation?: Array<{ code: string; title: string; tags?: unknown }> }).occupation ?? [];
    const first = hits[0];

    if (first) {
      section(`STEP 1b — O*NET occupation summary for ${first.code}`);
      console.log(`GET https://services.onetcenter.org/ws/occupations/${first.code}/summary\n`);
      rawSummary = await liveOccupationSummary(first.code, CREDS);
      console.log(JSON.stringify({
        occupation: rawSummary.occupation,
        skills: { element: rawSummary.skills?.element?.slice(0, 3) },
        wages: rawSummary.wages,
        outlook: rawSummary.outlook,
      }, null, 2));
    }
  } catch (err) {
    console.log(`⚠️  Live API unreachable — using embedded dataset\n   ${err}`);
  }
}

if (!rawSummary) {
  console.log('Mode: EMBEDDED dataset');
  const results = searchOccupations(KEYWORD);
  console.log(JSON.stringify(results.slice(0, 1).map(o => ({
    code: o.code, title: o.title, median_wage: o.median_wage, outlook: o.outlook,
    skills: o.skills.slice(0, 3),
  })), null, 2));
  occupation = results[0]!;
} else {
  // ── Step 2: Transform raw API → OnetOccupation ────────────────────────────
  section('STEP 2 — mapLiveOccupation() transforms raw API data');

  const wage = rawSummary.wages?.wage?.[0];
  occupation = {
    code: rawSummary.occupation.code,
    title: rawSummary.occupation.title,
    description: rawSummary.occupation.description,
    bright_outlook: false,
    green: false,
    in_demand: false,
    tasks: [],
    skills: (rawSummary.skills?.element ?? []).slice(0, 5)
      .map(e => ({ name: e.name, level: Math.round(e.score.value) })),
    knowledge: (rawSummary.knowledge?.element ?? []).slice(0, 4)
      .map(e => ({ name: e.name, level: Math.round(e.score.value) })),
    work_styles: (rawSummary.work_styles?.element ?? []).slice(0, 4).map(e => e.name),
    education: rawSummary.education?.education_usually_needed?.category?.[0]?.name ?? 'N/A',
    median_wage: wage?.pct50 ?? 0,
    employment: wage?.employment ?? 0,
    outlook: (rawSummary.outlook?.category?.name ?? 'Average') as OnetOccupation['outlook'],
    tags: [],
  };

  console.log('Mapped occupation:');
  console.log(JSON.stringify({
    code: occupation.code,
    title: occupation.title,
    median_wage: occupation.median_wage,
    outlook: occupation.outlook,
    education: occupation.education,
    skills: occupation.skills.slice(0, 3),
  }, null, 2));
}

// ── Step 3: buildOccupationDetailHTML → HTML string ───────────────────────
section('STEP 3 — buildOccupationDetailHTML() → HTML string');

const htmlString = buildOccupationDetailHTML(occupation);
console.log(`HTML length: ${htmlString.length} chars`);
console.log(`Excerpt (title area):`);
const titleMatch = htmlString.match(/<h1[^>]*>(.*?)<\/h1>/s);
const wageMatch = htmlString.match(/\$[\d,.]+k/);
console.log(`  <h1> = "${titleMatch?.[1]?.replace(/<[^>]+>/g, '') ?? ''}"`);
console.log(`  wage = "${wageMatch?.[0] ?? ''}"`);

// ── Step 4: createUIResource → MCP content item ───────────────────────────
section('STEP 4 — createUIResource() wraps HTML with MCP Apps adapter');

const resource = createUIResource({
  uri: `ui://onet/occupation/${occupation.code}`,
  content: { type: 'rawHtml', htmlString },
  encoding: 'text',
  adapters: { mcpApps: { enabled: true } },
  uiMetadata: { 'preferred-frame-size': ['100%', '700px'] },
});

console.log('MCP content item (resource field):');
const r = resource as { type: string; resource: { uri: string; mimeType: string; text?: string; _meta?: unknown } };
console.log(JSON.stringify({
  type: r.resource ? 'resource' : 'unknown',
  uri: r.resource.uri,
  mimeType: r.resource.mimeType,
  _meta: r.resource._meta,
  text_length: r.resource.text?.length,
  adapter_injected: r.resource.text?.includes('initAdapter') ?? false,
}, null, 2));

// ── Step 5: Full tool response ─────────────────────────────────────────────
section('STEP 5 — Final MCP tool response (what the client receives)');

const toolResponse = {
  content: [
    {
      type: 'text',
      text: `**${occupation.title}** (${occupation.code})\n💰 $${occupation.median_wage.toLocaleString()}/yr | 📈 ${occupation.outlook}`,
    },
    resource,
  ],
};

console.log('content[0] (text):', toolResponse.content[0]);
console.log('content[1] (resource):');
console.log(JSON.stringify({
  type: 'resource',
  uri: r.resource.uri,
  mimeType: r.resource.mimeType,
  _meta: r.resource._meta,
}, null, 2));

section('COUPLING SUMMARY');
console.log(`
  O*NET API (/ws/mnm/search + /ws/occupations/{code}/summary)
       │
       ▼ HTTP Basic Auth (user: ${CREDS?.username ?? 'embedded'})
  Raw JSON response
       │
       ▼ mapLiveOccupation()
  OnetOccupation { title, skills[], median_wage, outlook, ... }
       │
       ▼ buildOccupationDetailHTML()
  HTML string (${htmlString.length} chars, interactive UI with skill bars)
       │
       ▼ createUIResource({ adapters: { mcpApps: { enabled: true } } })
  MCP content item {
    type: "resource",
    uri:  "ui://onet/occupation/${occupation.code}",
    mimeType: "text/html;profile=mcp-app",    ← connector activated
    _meta: { "mcpui.dev/ui-preferred-frame-size": ["100%", "700px"] }
  }
       │
       ▼ MCP client (e.g. Claude Desktop)
  Renders iframe via MCP Apps adapter connector
`);
