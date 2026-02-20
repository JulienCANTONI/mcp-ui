import type { OnetOccupation } from './onet-data.js';

/** Shared CSS injected into every page */
const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;color:#1e293b;min-height:100vh}
  .page{max-width:720px;margin:0 auto;padding:20px}
  h1{font-size:1.5rem;font-weight:700;color:#0f172a}
  h2{font-size:1.1rem;font-weight:600;color:#334155;margin-bottom:12px}
  .badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:.4px;text-transform:uppercase}
  .badge-green{background:#dcfce7;color:#166534}
  .badge-blue{background:#dbeafe;color:#1e40af}
  .badge-yellow{background:#fef9c3;color:#854d0e}
  .badge-gray{background:#f1f5f9;color:#475569}
  .card{background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
  .bar-wrap{background:#e2e8f0;border-radius:4px;height:8px;overflow:hidden;margin-top:4px}
  .bar{height:8px;border-radius:4px;background:linear-gradient(90deg,#3b82f6,#06b6d4)}
  .row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f1f5f9}
  .row:last-child{border-bottom:none}
  .label{font-size:13px;color:#64748b}
  .value{font-size:13px;font-weight:600;color:#0f172a}
  button{cursor:pointer;border:none;border-radius:8px;font-weight:600;font-size:14px;padding:10px 18px;transition:.2s}
  .btn-primary{background:#3b82f6;color:#fff}
  .btn-primary:hover{background:#2563eb}
  .btn-secondary{background:#f1f5f9;color:#334155}
  .btn-secondary:hover{background:#e2e8f0}
  .tag{display:inline-block;background:#eff6ff;color:#3b82f6;font-size:11px;padding:2px 8px;border-radius:4px;margin:2px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  input[type=text]{width:100%;padding:10px 14px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;outline:none}
  input[type=text]:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.15)}
  .search-row{display:flex;gap:8px;margin-bottom:16px}
  ul{padding-left:18px}
  li{font-size:13px;color:#475569;margin-bottom:4px}
`;

/** Outlook badge CSS class */
function outlookClass(outlook: OnetOccupation['outlook']) {
  if (outlook === 'Much faster than average') return 'badge-green';
  if (outlook === 'Faster than average') return 'badge-blue';
  if (outlook === 'Average') return 'badge-yellow';
  return 'badge-gray';
}

/** Skill bar row */
function skillBar(name: string, level: number): string {
  return `
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span style="font-size:13px;color:#334155">${name}</span>
        <span style="font-size:12px;color:#64748b">${level}/100</span>
      </div>
      <div class="bar-wrap"><div class="bar" style="width:${level}%"></div></div>
    </div>`;
}

/** Search results page — lists matching occupations */
export function buildSearchResultsHTML(
  keyword: string,
  results: OnetOccupation[],
): string {
  const items = results.length
    ? results
        .map(
          (o) => `
        <div class="card" style="cursor:pointer" onclick="selectOccupation('${o.code}')">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-weight:700;font-size:15px;color:#0f172a">${o.title}</div>
              <div style="font-size:12px;color:#94a3b8;margin:2px 0 6px">${o.code}</div>
              <div style="font-size:13px;color:#64748b;line-height:1.5">${o.description.slice(0, 130)}…</div>
            </div>
            <div style="flex-shrink:0;margin-left:12px;text-align:right">
              <span class="badge ${outlookClass(o.outlook)}">${o.outlook}</span>
              <div style="font-size:13px;font-weight:600;color:#0f172a;margin-top:6px">
                $${o.median_wage.toLocaleString()}
              </div>
              <div style="font-size:11px;color:#94a3b8">median / yr</div>
            </div>
          </div>
          <div style="margin-top:8px">
            ${o.tags.map((t) => `<span class="tag">${t}</span>`).join('')}
            ${o.bright_outlook ? `<span class="badge badge-green" style="margin:2px">✨ Bright Outlook</span>` : ''}
            ${o.in_demand ? `<span class="badge badge-blue" style="margin:2px">🔥 In Demand</span>` : ''}
          </div>
        </div>`,
        )
        .join('')
    : `<div class="card" style="text-align:center;color:#94a3b8;padding:40px">
         No occupations found for "<strong>${keyword}</strong>".<br>Try a broader term.
       </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>O*NET Search — ${keyword}</title>
  <style>${BASE_CSS}</style>
</head>
<body>
<div class="page">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
    <div style="font-size:24px">🔍</div>
    <div>
      <h1>O*NET Occupation Search</h1>
      <p style="font-size:13px;color:#64748b">
        ${results.length} result${results.length !== 1 ? 's' : ''} for "<strong>${keyword}</strong>"
      </p>
    </div>
  </div>

  <div class="card">
    <div class="search-row">
      <input type="text" id="q" value="${keyword}" placeholder="Search occupations…" onkeydown="if(event.key==='Enter') doSearch()">
      <button class="btn-primary" onclick="doSearch()">Search</button>
    </div>
  </div>

  ${items}
</div>
<script>
  function doSearch() {
    const q = document.getElementById('q').value.trim();
    if (!q) return;
    window.parent.postMessage({
      type: 'tool',
      payload: { toolName: 'onet_search', params: { keyword: q } }
    }, '*');
  }

  function selectOccupation(code) {
    window.parent.postMessage({
      type: 'tool',
      payload: { toolName: 'onet_details', params: { code } }
    }, '*');
  }

  // Acknowledge response
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'ui-message-received') {
      document.title = '⏳ ' + document.title;
    }
  });
</script>
</body>
</html>`;
}

/** Occupation detail page */
export function buildOccupationDetailHTML(occ: OnetOccupation): string {
  const topSkills = occ.skills
    .slice()
    .sort((a, b) => b.level - a.level)
    .slice(0, 5);

  const topKnowledge = occ.knowledge
    .slice()
    .sort((a, b) => b.level - a.level)
    .slice(0, 4);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${occ.title} — O*NET</title>
  <style>${BASE_CSS}</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="card" style="background:linear-gradient(135deg,#1e40af 0%,#0891b2 100%);color:#fff">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:12px;opacity:.75;margin-bottom:4px">${occ.code}</div>
        <h1 style="color:#fff;font-size:1.4rem">${occ.title}</h1>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
          <span class="badge ${outlookClass(occ.outlook)}">${occ.outlook}</span>
          ${occ.bright_outlook ? `<span class="badge badge-green">✨ Bright Outlook</span>` : ''}
          ${occ.in_demand ? `<span class="badge badge-blue">🔥 In Demand</span>` : ''}
          ${occ.green ? `<span class="badge badge-green">🌿 Green Occupation</span>` : ''}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:1.6rem;font-weight:800">$${(occ.median_wage / 1000).toFixed(0)}k</div>
        <div style="font-size:11px;opacity:.75">median / yr</div>
        <div style="font-size:12px;opacity:.8;margin-top:4px">${occ.employment.toLocaleString()} jobs</div>
      </div>
    </div>
  </div>

  <!-- Description -->
  <div class="card">
    <h2>📋 Description</h2>
    <p style="font-size:14px;line-height:1.7;color:#475569">${occ.description}</p>
  </div>

  <!-- Stats -->
  <div class="grid2">
    <div class="card">
      <h2>🎓 Education</h2>
      <p style="font-size:13px;color:#475569">${occ.education}</p>
    </div>
    <div class="card">
      <h2>📈 Job Outlook</h2>
      <p style="font-size:13px;color:#475569">${occ.outlook}</p>
    </div>
  </div>

  <!-- Top Tasks -->
  <div class="card">
    <h2>⚙️ Key Tasks</h2>
    <ul>
      ${occ.tasks.map((t) => `<li>${t}</li>`).join('')}
    </ul>
  </div>

  <!-- Skills -->
  <div class="card">
    <h2>💡 Top Skills</h2>
    ${topSkills.map((s) => skillBar(s.name, s.level)).join('')}
  </div>

  <!-- Knowledge -->
  <div class="card">
    <h2>📚 Knowledge Areas</h2>
    ${topKnowledge.map((k) => skillBar(k.name, k.level)).join('')}
  </div>

  <!-- Work Styles -->
  <div class="card">
    <h2>🧠 Work Styles</h2>
    <div>${occ.work_styles.map((s) => `<span class="tag">${s}</span>`).join('')}</div>
  </div>

  <!-- Actions -->
  <div class="card">
    <h2>🚀 Explore More</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn-primary" onclick="searchRelated()">🔍 Find Similar Occupations</button>
      <button class="btn-secondary" onclick="shareOccupation()">📤 Share</button>
    </div>
  </div>

</div>
<script>
  function searchRelated() {
    const tag = ${JSON.stringify(occ.tags[0] ?? occ.title.split(' ')[0])};
    window.parent.postMessage({
      type: 'tool',
      payload: { toolName: 'onet_search', params: { keyword: tag } }
    }, '*');
  }

  function shareOccupation() {
    window.parent.postMessage({
      type: 'prompt',
      payload: { prompt: 'Tell me more about the ${occ.title} occupation (O*NET ${occ.code}).' }
    }, '*');
  }

  // Response handler
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'ui-message-received') {
      document.title = '⏳ Loading…';
    }
  });
</script>
</body>
</html>`;
}

/** Summary card — compact view returned inline in chat */
export function buildSummaryHTML(results: OnetOccupation[]): string {
  const rows = results
    .slice(0, 5)
    .map(
      (o) => `
      <div class="row" onclick="selectOccupation('${o.code}')" style="cursor:pointer">
        <div>
          <div style="font-size:13px;font-weight:600">${o.title}</div>
          <div style="font-size:11px;color:#94a3b8">${o.code}</div>
        </div>
        <div style="text-align:right">
          <span class="badge ${outlookClass(o.outlook)}" style="font-size:10px">${o.outlook.replace(' than average', '')}</span>
          <div style="font-size:12px;font-weight:600;color:#0f172a;margin-top:2px">$${(o.median_wage / 1000).toFixed(0)}k</div>
        </div>
      </div>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    ${BASE_CSS}
    body{background:#fff}
    .page{padding:12px;max-width:100%}
  </style>
</head>
<body>
<div class="page">
  <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:8px">
    🏷️ O*NET Occupations
  </div>
  ${rows}
</div>
<script>
  function selectOccupation(code) {
    window.parent.postMessage({
      type: 'tool',
      payload: { toolName: 'onet_details', params: { code } }
    }, '*');
  }
</script>
</body>
</html>`;
}
