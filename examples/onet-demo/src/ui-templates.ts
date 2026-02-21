import type {
  MnmCareerReport,
  MnmListings,
  MnmBrowseIndustries,
  MnmBrowseIndustry,
  OnlineDWAResponse,
  OnlineGWAResponse,
  OnlineWorkContextResponse,
  OnlineScoredResponse,
  OnlineInterestsResponse,
  OnlineEducationResponse,
  OnlineJobZoneResponse,
  OnlineTechSkillsResponse,
  OnlineToolsResponse,
  OnlineRelatedOccupations,
  ScoredElement,
  TechSkillItem,
  RiasecArea,
  WorkContextItem,
  DetailedWorkActivity,
} from './onet-client.js';
import type { OnetOccupation } from './onet-data.js';

// ── Shared CSS ─────────────────────────────────────────────────────────────

const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;color:#1a1a2e;font-size:14px;line-height:1.5}
  h1{font-size:1.4rem;font-weight:700}h2{font-size:1.1rem;font-weight:600;margin-bottom:8px}h3{font-size:.95rem;font-weight:600;margin-bottom:6px}
  .card{background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08);padding:16px;margin-bottom:12px}
  .card-sm{background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.07);padding:12px;margin-bottom:8px}
  .row{display:flex;align-items:center;padding:10px 12px;border-radius:8px;cursor:pointer;transition:background .15s;gap:8px}
  .row:hover{background:#f0f4ff}
  .badge{display:inline-flex;align-items:center;gap:3px;font-size:.7rem;font-weight:600;padding:2px 7px;border-radius:20px;white-space:nowrap}
  .badge-green{background:#d1fae5;color:#065f46}.badge-blue{background:#dbeafe;color:#1e40af}
  .badge-yellow{background:#fef3c7;color:#92400e}.badge-gray{background:#f3f4f6;color:#4b5563}
  .badge-orange{background:#ffedd5;color:#c2410c}.badge-purple{background:#ede9fe;color:#5b21b6}
  .tag{display:inline-block;font-size:.72rem;padding:2px 8px;border-radius:20px;background:#e5e7eb;color:#374151;margin:2px}
  .bar-wrap{background:#e5e7eb;border-radius:6px;height:8px;overflow:hidden;flex:1}
  .bar-fill{height:100%;border-radius:6px;background:linear-gradient(90deg,#3b82f6,#6366f1);transition:width .4s}
  .bar-fill-green{background:linear-gradient(90deg,#10b981,#059669)}
  .bar-fill-orange{background:linear-gradient(90deg,#f97316,#ea580c)}
  .btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:8px;border:none;cursor:pointer;font-size:.85rem;font-weight:600;transition:all .15s}
  .btn-primary{background:#3b82f6;color:#fff}.btn-primary:hover{background:#2563eb}
  .btn-secondary{background:#f3f4f6;color:#374151}.btn-secondary:hover{background:#e5e7eb}
  .btn-sm{padding:5px 10px;font-size:.78rem}
  .section{margin-bottom:20px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .flex{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .skill-row{display:flex;align-items:center;gap:8px;margin-bottom:6px}
  .skill-label{font-size:.82rem;width:160px;flex-shrink:0;color:#374151}
  .skill-val{font-size:.78rem;color:#6b7280;width:32px;text-align:right}
  .header-grad{background:linear-gradient(135deg,#1e3a5f,#3b5998);color:#fff;border-radius:12px;padding:20px;margin-bottom:12px}
  .wage{font-size:1.6rem;font-weight:800;color:#fbbf24}
  .muted{color:#6b7280;font-size:.82rem}
  .divider{border:none;border-top:1px solid #e5e7eb;margin:12px 0}
  .input-row{display:flex;gap:8px;margin-bottom:16px}
  .input-row input{flex:1;padding:9px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:.9rem;outline:none}
  .input-row input:focus{border-color:#3b82f6}
  .occ-title{font-weight:600;font-size:.9rem;flex:1}
  .occ-code{font-size:.75rem;color:#9ca3af;font-family:monospace}
  .emerging{display:inline-flex;align-items:center;gap:3px;font-size:.68rem;font-weight:700;padding:1px 6px;border-radius:12px;background:#d1fae5;color:#065f46;margin-left:6px}
  a{color:#3b82f6;text-decoration:none}.a:hover{text-decoration:underline}
  .jz-pip{display:inline-block;width:28px;height:28px;border-radius:50%;background:#e5e7eb;line-height:28px;text-align:center;font-weight:700;font-size:.85rem;margin-right:4px}
  .jz-pip.active{background:#3b82f6;color:#fff}
  .riasec-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
  .riasec-cell{border-radius:10px;padding:10px;text-align:center;border:2px solid #e5e7eb}
  .riasec-cell.top{border-color:#3b82f6;background:#eff6ff}
  .riasec-letter{font-size:1.5rem;font-weight:800}
  .riasec-name{font-size:.72rem;color:#6b7280}
  .riasec-score{font-size:1rem;font-weight:700;color:#3b82f6}
  .prog-bar{background:#e5e7eb;border-radius:6px;height:6px;overflow:hidden;margin-top:4px}
  .prog-fill{height:100%;background:#3b82f6;transition:width .4s}
  .context-group{margin-bottom:10px}
  .context-group h4{font-size:.78rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
  .action-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
  .ip-q{padding:10px 0;border-bottom:1px solid #f3f4f6}
  .ip-q:last-child{border-bottom:none}
  .ip-q-text{margin-bottom:6px;font-size:.9rem}
  .ip-btns{display:flex;gap:6px}
  .ip-btn{padding:4px 12px;border-radius:6px;border:1.5px solid #d1d5db;cursor:pointer;font-size:.78rem;font-weight:600;background:#fff;transition:all .15s}
  .ip-btn.sel-like{background:#d1fae5;border-color:#10b981;color:#065f46}
  .ip-btn.sel-unsure{background:#fef3c7;border-color:#f59e0b;color:#92400e}
  .ip-btn.sel-dislike{background:#fee2e2;border-color:#ef4444;color:#991b1b}
  .progress-bar{background:#e5e7eb;border-radius:6px;height:8px;margin-bottom:16px;overflow:hidden}
  .progress-fill{height:100%;background:linear-gradient(90deg,#10b981,#3b82f6);transition:width .3s}
`;

// ── Helpers ────────────────────────────────────────────────────────────────

const wrap = (css: string, body: string) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;

const fmt$ = (n?: number) =>
  n != null ? `$${n.toLocaleString('en-US')}` : '—';

const scoreBar = (level: number, cls = '') =>
  `<div class="bar-wrap"><div class="bar-fill ${cls}" style="width:${Math.min(level, 100)}%"></div></div>`;

const skillRows = (items: Array<{ name: string; level: number }>, colorCls = '') =>
  items.map(s => `<div class="skill-row">
    <span class="skill-label">${esc(s.name)}</span>
    ${scoreBar(s.level, colorCls)}
    <span class="skill-val">${s.level}</span>
  </div>`).join('');

const scoredRows = (els: ScoredElement[], max = 100, colorCls = '') =>
  els.map(e => {
    const v = e.score?.value ?? 0;
    const pct = Math.round((v / max) * 100);
    return `<div class="skill-row">
      <span class="skill-label">${esc(e.name)}</span>
      ${scoreBar(pct, colorCls)}
      <span class="skill-val">${v.toFixed(1)}</span>
    </div>`;
  }).join('');

const toolCall = (toolName: string, params: Record<string, unknown>) =>
  `window.parent.postMessage({type:'tool',payload:{toolName:'${toolName}',params:${JSON.stringify(params)}}}, '*')`;

const esc = (s?: string | null) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const outlookBadge = (o: string) => {
  const cls = o.includes('Much') ? 'badge-green' : o.includes('Faster') ? 'badge-blue' : 'badge-gray';
  return `<span class="badge ${cls}">${esc(o)}</span>`;
};

const tagBadges = (occ: { bright_outlook?: boolean; green?: boolean; in_demand?: boolean }) => [
  occ.bright_outlook ? '<span class="badge badge-green">&#9728; Bright Outlook</span>' : '',
  occ.green ? '<span class="badge badge-green">&#9675; Green</span>' : '',
  occ.in_demand ? '<span class="badge badge-blue">&#9670; In Demand</span>' : '',
].filter(Boolean).join(' ');

// ── 1. Search Results ──────────────────────────────────────────────────────

export function buildSearchResultsHTML(keyword: string, results: OnetOccupation[]): string {
  const rows = results.length
    ? results.map(o => `
      <div class="row" onclick="${toolCall('onet_details', { code: o.code })}">
        <div style="flex:1">
          <div class="occ-title">${esc(o.title)}</div>
          <div class="flex" style="margin-top:4px">
            <span class="occ-code">${esc(o.code)}</span>
            ${outlookBadge(o.outlook)}
            ${tagBadges(o)}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-weight:700;color:#1e3a5f">${fmt$(o.median_wage)}</div>
          <div class="muted">median / yr</div>
        </div>
      </div>`).join('')
    : '<div class="card" style="text-align:center;color:#6b7280;padding:32px">No results found for &ldquo;' + esc(keyword) + '&rdquo;</div>';

  return wrap(BASE_CSS, `
    <div style="padding:16px">
      <div class="input-row">
        <input id="kw" type="text" placeholder="Search occupations…" value="${esc(keyword)}">
        <button class="btn btn-primary" onclick="${toolCall('onet_search', { keyword: "(document.getElementById('kw').value)" })}; event.preventDefault(); window.parent.postMessage({type:'tool',payload:{toolName:'onet_search',params:{keyword:document.getElementById('kw').value}}}, '*')">Search</button>
      </div>
      <div class="muted" style="margin-bottom:10px">${results.length} result${results.length !== 1 ? 's' : ''} for &ldquo;${esc(keyword)}&rdquo;</div>
      ${rows}
    </div>
    <script>
      document.querySelector('input').addEventListener('keydown', e => {
        if(e.key === 'Enter') window.parent.postMessage({type:'tool',payload:{toolName:'onet_search',params:{keyword:e.target.value}}}, '*');
      });
    </script>`);
}

// ── 2. Occupation Detail ───────────────────────────────────────────────────

export function buildOccupationDetailHTML(occ: OnetOccupation): string {
  const buttons = [
    { label: '&#128203; Career Report', tool: 'onet_career_report', params: { code: occ.code } },
    { label: '&#127959; Work Profile', tool: 'onet_work_profile', params: { code: occ.code } },
    { label: '&#128187; Tech Stack', tool: 'onet_tech_stack', params: { code: occ.code } },
    { label: '&#128279; Related', tool: 'onet_related', params: { code: occ.code } },
    { label: '&#10024; Interests', tool: 'onet_interests_education', params: { code: occ.code } },
  ].map(b => `<button class="btn btn-secondary btn-sm" onclick="${toolCall(b.tool, b.params)}">${b.label}</button>`).join('');

  const tasks = occ.tasks.map(t =>
    `<li style="margin-bottom:4px">${esc(t)}</li>`).join('');

  const styles = occ.work_styles.map(ws =>
    `<span class="tag">${esc(ws)}</span>`).join('');

  return wrap(BASE_CSS, `
    <div style="padding:16px">
      <div class="header-grad">
        <div class="flex" style="margin-bottom:8px">${tagBadges(occ)}</div>
        <h1>${esc(occ.title)}</h1>
        <div class="occ-code" style="color:#93c5fd;margin:4px 0 12px">${esc(occ.code)}</div>
        <div class="wage">${fmt$(occ.median_wage)} <span style="font-size:.9rem;font-weight:400;color:#e5e7eb">/ yr</span></div>
        <div style="color:#93c5fd;font-size:.82rem;margin-top:2px">
          ${esc(occ.outlook)} &bull; ${occ.employment.toLocaleString()} employed
        </div>
      </div>
      <div class="action-bar">${buttons}</div>
      <div class="card">
        <p style="color:#374151;line-height:1.7">${esc(occ.description)}</p>
        <hr class="divider">
        <div class="muted">Education: <strong>${esc(occ.education)}</strong></div>
      </div>
      <div class="grid2">
        <div class="card">
          <h3>Top Skills</h3>
          ${skillRows(occ.skills)}
        </div>
        <div class="card">
          <h3>Knowledge Areas</h3>
          ${skillRows(occ.knowledge, 'bar-fill-green')}
        </div>
      </div>
      <div class="card">
        <h3>Core Tasks</h3>
        <ul style="padding-left:18px;color:#374151">${tasks}</ul>
      </div>
      <div class="card">
        <h3>Work Styles</h3>
        <div>${styles}</div>
      </div>
    </div>`);
}

// ── 3. Career Report (MNM) ─────────────────────────────────────────────────

export function buildCareerReportHTML(report: MnmCareerReport): string {
  const occ = report.occupation;
  const sal = report.job_outlook?.salary;
  const tags = report.tags ?? {};

  const techItems = (report.technology?.item ?? []).map(t => {
    const cls = t.hot_technology ? 'badge-orange' : t.in_demand ? 'badge-blue' : 'badge-gray';
    const icon = t.hot_technology ? '&#128293; ' : t.in_demand ? '&#128640; ' : '';
    return `<span class="badge ${cls}">${icon}${esc(t.name)}</span>`;
  }).join(' ');

  const tasks = (report.on_the_job?.task ?? []).map(t =>
    `<li style="margin-bottom:5px">${esc(t.statement)}${t.emerging ? '<span class="emerging">&#9889; Emerging</span>' : ''}</li>`
  ).join('');

  const eduCats = (report.education?.education_usually_needed?.category ?? []).map(c =>
    `<div class="skill-row"><span class="skill-label">${esc(c.name)}</span>${scoreBar(c.percent)}<span class="skill-val">${c.percent}%</span></div>`
  ).join('');

  const styles = (report.personality?.element ?? []).map(e =>
    `<span class="tag">${esc(e.name)}</span>`).join('');

  return wrap(BASE_CSS, `
    <div style="padding:16px">
      <div class="header-grad">
        <div class="flex" style="margin-bottom:8px">${tagBadges(tags)}</div>
        <h1>${esc(occ.title)}</h1>
        <div class="occ-code" style="color:#93c5fd">${esc(occ.code)}</div>
        ${sal ? `<div class="wage" style="margin-top:10px">${fmt$(sal.annual_median)}<span style="font-size:.85rem;font-weight:400;color:#e5e7eb"> / yr median</span></div>
        <div style="color:#93c5fd;font-size:.8rem">${fmt$(sal.annual_10th)} &ndash; ${fmt$(sal.annual_90th)} range</div>` : ''}
        ${report.job_outlook?.category ? `<div style="color:#fbbf24;font-size:.85rem;margin-top:6px;font-weight:600">${esc(report.job_outlook.category.title)}</div>` : ''}
      </div>
      <div class="card"><p>${esc(occ.description)}</p></div>
      ${tasks ? `<div class="card"><h3>On the Job</h3><ul style="padding-left:18px">${tasks}</ul></div>` : ''}
      <div class="grid2">
        ${report.skills?.element?.length ? `<div class="card"><h3>Skills</h3>${scoredRows(report.skills.element, 7)}</div>` : ''}
        ${report.knowledge?.element?.length ? `<div class="card"><h3>Knowledge</h3>${scoredRows(report.knowledge.element, 7, 'bar-fill-green')}</div>` : ''}
      </div>
      ${report.abilities?.element?.length ? `<div class="card"><h3>Abilities</h3>${scoredRows(report.abilities.element, 7)}</div>` : ''}
      ${styles ? `<div class="card"><h3>Work Styles</h3>${styles}</div>` : ''}
      ${eduCats ? `<div class="card"><h3>Education Usually Needed</h3>${eduCats}</div>` : ''}
      ${techItems ? `<div class="card"><h3>Technology</h3><div class="flex" style="margin-top:6px">${techItems}</div></div>` : ''}
    </div>`);
}

// ── 4. Work Profile ────────────────────────────────────────────────────────

export function buildWorkProfileHTML(
  code: string, title: string,
  data: { dwa: OnlineDWAResponse; gwa: OnlineGWAResponse; workContext: OnlineWorkContextResponse; abilities: OnlineScoredResponse }
): string {
  const gwaMap = new Map((data.gwa.element ?? []).map(g => [g.name, g]));

  const dwaGrouped = new Map<string, DetailedWorkActivity[]>();
  for (const d of (data.dwa.detailed_work_activity ?? [])) {
    const parent = d.work_activity ?? 'Other';
    if (!dwaGrouped.has(parent)) dwaGrouped.set(parent, []);
    dwaGrouped.get(parent)!.push(d);
  }

  const dwaHTML = [...dwaGrouped.entries()].map(([gwa, dwas]) => {
    const g = gwaMap.get(gwa);
    const score = g?.score?.value;
    return `<div class="card-sm">
      <div class="skill-row" style="margin-bottom:6px">
        <span style="font-weight:600;font-size:.85rem;flex:1">${esc(gwa)}</span>
        ${score != null ? `${scoreBar(Math.round((score / 7) * 100))}<span class="skill-val">${score.toFixed(1)}</span>` : ''}
      </div>
      <ul style="padding-left:16px;color:#4b5563">
        ${dwas.map(d => `<li style="font-size:.82rem;margin-bottom:2px">${esc(d.activity)}</li>`).join('')}
      </ul>
    </div>`;
  }).join('');

  const ctxGroups: Record<string, WorkContextItem[]> = { Physical: [], Social: [], Structural: [] };
  const physKeywords = ['Physical', 'Outdoor', 'Hazard', 'Protective', 'Radiation', 'Contaminant', 'Minor Burns'];
  const socKeywords = ['Contact', 'Work With', 'Deal', 'Coordinate', 'Responsibility', 'Conflict'];
  for (const c of (data.workContext.element ?? [])) {
    const n = c.name;
    if (physKeywords.some(k => n.includes(k))) ctxGroups.Physical.push(c);
    else if (socKeywords.some(k => n.includes(k))) ctxGroups.Social.push(c);
    else ctxGroups.Structural.push(c);
  }

  const ctxHTML = Object.entries(ctxGroups).filter(([, items]) => items.length).map(([grp, items]) =>
    `<div class="context-group"><h4>${grp}</h4>
    ${items.map(c => `<div class="skill-row">
      <span class="skill-label">${esc(c.name)}</span>
      ${c.score ? `${scoreBar(Math.round((c.score.value / 5) * 100))}<span class="skill-val">${c.score.value.toFixed(1)}</span>` : `<span class="muted">${esc(c.response ?? '')}</span>`}
    </div>`).join('')}
    </div>`).join('');

  const abilitiesHTML = scoredRows(data.abilities.element ?? [], 7);

  return wrap(BASE_CSS, `
    <div style="padding:16px">
      <div class="flex" style="margin-bottom:16px">
        <div>
          <h1>${esc(title)}</h1>
          <div class="occ-code">${esc(code)}</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="${toolCall('onet_details', { code })}" style="margin-left:auto">&#8592; Back</button>
      </div>
      <div class="card"><h2>Detailed Work Activities</h2>${dwaHTML}</div>
      <div class="card"><h2>Work Context</h2>${ctxHTML}</div>
      ${abilitiesHTML ? `<div class="card"><h2>Abilities</h2>${abilitiesHTML}</div>` : ''}
    </div>`);
}

// ── 5. Tech Stack ──────────────────────────────────────────────────────────

export function buildTechStackHTML(code: string, title: string, techSkills: OnlineTechSkillsResponse, tools: OnlineToolsResponse): string {
  const renderTech = (items: TechSkillItem[]) => {
    const hot = items.filter(t => t.hot_technology);
    const demand = items.filter(t => t.in_demand && !t.hot_technology);
    const rest = items.filter(t => !t.hot_technology && !t.in_demand);

    const catGroups = new Map<string, TechSkillItem[]>();
    for (const t of rest) {
      const c = t.category ?? 'Other';
      if (!catGroups.has(c)) catGroups.set(c, []);
      catGroups.get(c)!.push(t);
    }

    return `
      ${hot.length ? `<div style="margin-bottom:12px"><div class="muted" style="margin-bottom:6px;font-weight:600">&#128293; Hot Technology</div>
        <div class="flex">${hot.map(t => `<span class="badge badge-orange" style="font-size:.8rem;padding:4px 10px">${esc(t.name)}</span>`).join('')}</div></div>` : ''}
      ${demand.length ? `<div style="margin-bottom:12px"><div class="muted" style="margin-bottom:6px;font-weight:600">&#128640; In Demand</div>
        <div class="flex">${demand.map(t => `<span class="badge badge-blue" style="font-size:.8rem;padding:4px 10px">${esc(t.name)}</span>`).join('')}</div></div>` : ''}
      ${[...catGroups.entries()].map(([cat, ts]) =>
        `<div style="margin-bottom:10px"><div class="muted" style="margin-bottom:4px">${esc(cat)}</div>
        <div class="flex">${ts.map(t => `<span class="tag">${esc(t.name)}</span>`).join('')}</div></div>`
      ).join('')}`;
  };

  const toolsHTML = (tools.tools_used ?? []).map(t =>
    `<div class="row" style="cursor:default"><span style="flex:1">${esc(t.name)}</span><span class="badge badge-gray">${esc(t.category ?? '')}</span></div>`
  ).join('');

  return wrap(BASE_CSS, `
    <div style="padding:16px">
      <div class="flex" style="margin-bottom:16px">
        <div><h1>${esc(title)}</h1><div class="occ-code">${esc(code)}</div></div>
        <button class="btn btn-secondary btn-sm" onclick="${toolCall('onet_details', { code })}" style="margin-left:auto">&#8592; Back</button>
      </div>
      <div class="card"><h2>Technology Skills</h2>${renderTech(techSkills.technology_skills ?? [])}</div>
      ${toolsHTML ? `<div class="card"><h2>Tools &amp; Equipment</h2>${toolsHTML}</div>` : ''}
    </div>`);
}

// ── 6. Interests + Education ───────────────────────────────────────────────

export function buildInterestsEducationHTML(
  code: string, title: string,
  interests: OnlineInterestsResponse,
  education: OnlineEducationResponse,
  jobZone: OnlineJobZoneResponse
): string {
  const areas = (interests.area ?? []).sort((a, b) => (b.score?.value ?? 0) - (a.score?.value ?? 0));
  const hp = interests.high_point_code ?? '';
  const riasecOrder = ['R', 'I', 'A', 'S', 'E', 'C'];
  const areaMap = new Map<string, RiasecArea>(areas.map(a => [a.id?.toUpperCase() ?? '', a]));

  const riasecCells = riasecOrder.map(letter => {
    const a = areaMap.get(letter);
    const score = a?.score?.value ?? 0;
    const isTop = hp.toUpperCase().includes(letter);
    return `<div class="riasec-cell${isTop ? ' top' : ''}">
      <div class="riasec-letter" style="color:${isTop ? '#3b82f6' : '#6b7280'}">${letter}</div>
      <div class="riasec-name">${esc(a?.name ?? letter)}</div>
      ${a ? `<div class="riasec-score">${score.toFixed(0)}</div>
      <div class="prog-bar"><div class="prog-fill" style="width:${score}%"></div></div>` : ''}
    </div>`;
  }).join('');

  const jz = jobZone.job_zone;
  const pips = jz ? [1, 2, 3, 4, 5].map(i =>
    `<span class="jz-pip${i <= jz.value ? ' active' : ''}">${i}</span>`).join('') : '';

  const eduCats = (education.education_usually_needed?.category ?? []).map(c =>
    `<div class="skill-row"><span class="skill-label">${esc(c.name)}</span>${scoreBar(c.percent)}<span class="skill-val">${c.percent}%</span></div>`
  ).join('');

  return wrap(BASE_CSS, `
    <div style="padding:16px">
      <div class="flex" style="margin-bottom:16px">
        <div><h1>${esc(title)}</h1><div class="occ-code">${esc(code)}</div></div>
        <button class="btn btn-secondary btn-sm" onclick="${toolCall('onet_details', { code })}" style="margin-left:auto">&#8592; Back</button>
      </div>
      <div class="card">
        <h2>Holland RIASEC Interests</h2>
        ${hp ? `<div style="margin-bottom:10px">High-Point Code: <strong style="font-size:1.1rem;color:#3b82f6">${esc(hp)}</strong></div>` : ''}
        <div class="riasec-grid">${riasecCells}</div>
      </div>
      ${jz ? `<div class="card">
        <h2>Job Zone ${jz.value}: ${esc(jz.title ?? '')}</h2>
        <div style="margin-bottom:10px">${pips}</div>
        <p style="color:#374151;margin-bottom:8px">${esc(jz.description ?? '')}</p>
        ${jz.education ? `<div class="muted"><strong>Education:</strong> ${esc(jz.education)}</div>` : ''}
        ${jz.related_experience ? `<div class="muted"><strong>Experience:</strong> ${esc(jz.related_experience)}</div>` : ''}
      </div>` : ''}
      ${eduCats ? `<div class="card"><h2>Education Usually Needed</h2>${eduCats}</div>` : ''}
    </div>`);
}

// ── 7. Related Occupations ─────────────────────────────────────────────────

export function buildRelatedHTML(code: string, title: string, related: OnlineRelatedOccupations): string {
  const rows = (related.occupation ?? []).map(o => {
    const lvlBadge = o.related_level != null
      ? `<span class="badge badge-purple">Level ${o.related_level}</span>`
      : '';
    return `<div class="row" onclick="${toolCall('onet_details', { code: o.code })}">
      <div style="flex:1">
        <div class="occ-title">${esc(o.title)}</div>
        <div class="occ-code">${esc(o.code)}</div>
      </div>
      ${lvlBadge}
      ${tagBadges(o.tags ?? {})}
    </div>`;
  }).join('');

  return wrap(BASE_CSS, `
    <div style="padding:16px">
      <div class="flex" style="margin-bottom:16px">
        <div><h1>Related Occupations</h1><div class="muted">${esc(title)}</div></div>
        <button class="btn btn-secondary btn-sm" onclick="${toolCall('onet_details', { code })}" style="margin-left:auto">&#8592; Back</button>
      </div>
      <div class="card">${rows || '<div class="muted" style="text-align:center;padding:20px">No related occupations found.</div>'}</div>
    </div>`);
}

// ── 8. Bright Outlook Listings ─────────────────────────────────────────────

export function buildBrightOutlookHTML(listings: MnmListings): string {
  const rows = (listings.occupation ?? []).map(o =>
    `<div class="row" onclick="${toolCall('onet_career_report', { code: o.code })}">
      <div style="flex:1">
        <div class="occ-title">${esc(o.title)}</div>
        <div class="occ-code">${esc(o.code)}</div>
      </div>
      ${tagBadges(o.tags ?? {})}
    </div>`).join('');

  return wrap(BASE_CSS, `
    <div style="padding:16px">
      <div class="header-grad" style="margin-bottom:16px">
        <h1>&#9728; Bright Outlook Careers</h1>
        <div style="color:#93c5fd;margin-top:4px">${listings.total ?? 0} occupations with strong projected growth</div>
      </div>
      <div class="card">${rows || '<div class="muted" style="text-align:center;padding:20px">No listings found.</div>'}</div>
    </div>`);
}

// ── 9. Browse Industries ───────────────────────────────────────────────────

export function buildBrowseHTML(industries: MnmBrowseIndustries | null, industry: MnmBrowseIndustry | null): string {
  if (industry) {
    const makeRows = (careers: Array<{ code: string; title: string; tags?: { bright_outlook?: boolean; green?: boolean; in_demand?: boolean } }> = []) =>
      careers.map(c =>
        `<div class="row" onclick="${toolCall('onet_career_report', { code: c.code })}">
          <div style="flex:1"><div class="occ-title">${esc(c.title)}</div><div class="occ-code">${esc(c.code)}</div></div>
          ${tagBadges(c.tags ?? {})}
        </div>`).join('');

    return wrap(BASE_CSS, `
      <div style="padding:16px">
        <div class="flex" style="margin-bottom:16px">
          <div>
            <h1>${esc(industry.industry?.title ?? 'Industry')}</h1>
            <div class="muted">Careers in this industry</div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="${toolCall('onet_browse', {})}" style="margin-left:auto">&#8592; All Industries</button>
        </div>
        ${(industry.most?.career ?? []).length ? `<div class="card"><h2>Most In This Industry</h2>${makeRows(industry.most!.career)}</div>` : ''}
        ${(industry.some?.career ?? []).length ? `<div class="card"><h2>Some Work In This Industry</h2>${makeRows(industry.some!.career)}</div>` : ''}
      </div>`);
  }

  const indRows = (industries?.industry ?? []).map(i =>
    `<div class="row" onclick="${toolCall('onet_browse', { industry_code: i.code })}">
      <div style="flex:1"><div class="occ-title">${esc(i.title)}</div></div>
      <span class="badge badge-gray">${i.total ?? ''} careers</span>
    </div>`).join('');

  return wrap(BASE_CSS, `
    <div style="padding:16px">
      <div class="header-grad" style="margin-bottom:16px">
        <h1>&#127963; Browse by Industry</h1>
        <div style="color:#93c5fd;margin-top:4px">Select an industry to explore careers</div>
      </div>
      <div class="card">${indRows || '<div class="muted" style="text-align:center;padding:20px">Loading…</div>'}</div>
    </div>`);
}

// ── 10. Interest Profiler Questions ────────────────────────────────────────

export function buildInterestProfilerHTML(questions: {
  question?: Array<{ id?: string | number; text: string; area?: string }>;
  total?: number;
}): string {
  const qs = questions.question ?? [];
  const total = questions.total ?? qs.length;

  const qHTML = qs.map((q, i) => {
    const qId = q.id ?? i + 1;
    return `<div class="ip-q" id="q-${qId}">
      <div class="ip-q-text"><strong>${i + 1}.</strong> ${esc(q.text)}</div>
      <div class="ip-btns">
        ${(['Like', 'Unsure', 'Dislike'] as const).map(opt =>
          `<button class="ip-btn" data-qid="${qId}" data-val="${opt.toLowerCase()}"
            onclick="selectAnswer('${qId}', '${opt.toLowerCase()}', this)">${opt}</button>`
        ).join('')}
      </div>
    </div>`;
  }).join('');

  return wrap(BASE_CSS, `
    <div style="padding:16px">
      <div class="card" style="margin-bottom:16px">
        <h1 style="margin-bottom:4px">&#127775; Interest Profiler</h1>
        <div class="muted">Answer all ${total} questions to find matching careers</div>
        <div style="margin-top:10px">
          <div class="flex" style="margin-bottom:4px">
            <span class="muted" id="progress-label">0 of ${total} answered</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
        </div>
      </div>
      <div class="card">${qHTML}</div>
      <div id="submit-wrap" style="display:none;margin-top:8px">
        <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="submitAnswers()">
          &#127919; Find Matching Careers
        </button>
      </div>
    </div>
    <script>
      const answers = {};
      const total = ${total};
      function selectAnswer(qid, val, btn) {
        answers[qid] = val;
        const btns = btn.parentElement.querySelectorAll('.ip-btn');
        btns.forEach(b => b.className = 'ip-btn');
        const cls = val === 'like' ? 'sel-like' : val === 'unsure' ? 'sel-unsure' : 'sel-dislike';
        btn.className = 'ip-btn ' + cls;
        const answered = Object.keys(answers).length;
        document.getElementById('progress-label').textContent = answered + ' of ' + total + ' answered';
        document.getElementById('progress-fill').style.width = Math.round((answered / total) * 100) + '%';
        if (answered >= total) document.getElementById('submit-wrap').style.display = 'block';
      }
      function submitAnswers() {
        const result = Object.entries(answers).map(([id, v]) => id + ':' + v).join(',');
        window.parent.postMessage({type:'tool',payload:{toolName:'onet_interest_match',params:{answers: result}}}, '*');
      }
    </script>`);
}

// ── 11. Interest Match Results ─────────────────────────────────────────────

export function buildInterestMatchHTML(careers: {
  career?: Array<{ code: string; title: string; fit?: string; tags?: { bright_outlook?: boolean } }>;
  area?: Array<{ id: string; description: string; score?: number }>;
}): string {
  const riasecOrder = ['R', 'I', 'A', 'S', 'E', 'C'];
  const areaMap = new Map((careers.area ?? []).map(a => [a.id.toUpperCase(), a]));

  const riasecCells = riasecOrder.map(letter => {
    const a = areaMap.get(letter);
    const score = a?.score ?? 0;
    return `<div class="riasec-cell${score > 50 ? ' top' : ''}">
      <div class="riasec-letter" style="color:${score > 50 ? '#3b82f6' : '#9ca3af'}">${letter}</div>
      <div class="prog-bar"><div class="prog-fill" style="width:${score}%"></div></div>
      <div style="font-size:.72rem;font-weight:700;margin-top:2px">${score}</div>
    </div>`;
  }).join('');

  const careerRows = (careers.career ?? []).map(c => {
    const fitBadge = c.fit === 'Best' ? 'badge-green' : c.fit === 'Great' ? 'badge-blue' : 'badge-gray';
    return `<div class="row" onclick="${toolCall('onet_career_report', { code: c.code })}">
      <div style="flex:1">
        <div class="occ-title">${esc(c.title)}</div>
        <div class="occ-code">${esc(c.code)}</div>
      </div>
      ${c.fit ? `<span class="badge ${fitBadge}">${esc(c.fit)} Fit</span>` : ''}
      ${c.tags?.bright_outlook ? '<span class="badge badge-green">&#9728; Bright</span>' : ''}
    </div>`;
  }).join('');

  return wrap(BASE_CSS, `
    <div style="padding:16px">
      <div class="header-grad" style="margin-bottom:16px">
        <h1>&#127775; Your Career Matches</h1>
        <div style="color:#93c5fd;margin-top:4px">${(careers.career ?? []).length} careers match your interests</div>
      </div>
      ${careers.area?.length ? `<div class="card"><h2>Your Interest Profile</h2><div class="riasec-grid">${riasecCells}</div></div>` : ''}
      <div class="card">${careerRows || '<div class="muted" style="text-align:center;padding:20px">No matches found.</div>'}</div>
    </div>`);
}

// ── 12. Placeholder ────────────────────────────────────────────────────────

export function buildOccupationPlaceholderHTML(): string {
  const quickLinks = [
    { label: '&#9728; Bright Outlook Careers', tool: 'onet_bright_outlook', params: {} },
    { label: '&#127963; Browse by Industry', tool: 'onet_browse', params: {} },
    { label: '&#127775; Interest Profiler', tool: 'onet_interest_profiler', params: {} },
  ].map(l => `<button class="btn btn-secondary" style="width:100%;justify-content:center;margin-bottom:8px" onclick="${toolCall(l.tool, l.params)}">${l.label}</button>`).join('');

  return wrap(BASE_CSS, `
    <div style="padding:16px">
      <div class="header-grad" style="text-align:center;padding:32px 20px">
        <div style="font-size:3rem;margin-bottom:12px">&#128269;</div>
        <h1 style="font-size:1.6rem;margin-bottom:8px">O*NET Career Explorer</h1>
        <p style="color:#93c5fd">Search for any occupation to explore skills, wages, outlook, and more</p>
      </div>
      <div class="card">
        <h2 style="margin-bottom:12px">Search Occupations</h2>
        <div class="input-row">
          <input id="kw" type="text" placeholder="e.g. Software Developer, Nurse, Data Analyst…">
          <button class="btn btn-primary" id="search-btn">Search</button>
        </div>
        <div class="muted" style="text-align:center;margin-bottom:12px">— or explore —</div>
        ${quickLinks}
      </div>
      <div class="card" style="background:linear-gradient(135deg,#f0f9ff,#e0f2fe)">
        <h3 style="margin-bottom:8px">&#128161; What you can explore</h3>
        <div class="grid2">
          ${[['&#128203;', 'Career Reports', 'Salary, outlook, tasks'], ['&#127959;', 'Work Profiles', 'DWA, GWA, context'], ['&#128187;', 'Tech Stacks', 'Hot tech, tools'], ['&#127775;', 'Interest Match', 'RIASEC profiler']].map(([icon, ttl, desc]) =>
            `<div style="padding:8px;border-radius:8px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.06)">
              <div style="font-size:1.3rem">${icon}</div>
              <div style="font-weight:600;font-size:.85rem">${ttl}</div>
              <div class="muted">${desc}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>
    <script>
      function doSearch() {
        const kw = document.getElementById('kw').value.trim();
        if (kw) window.parent.postMessage({type:'tool',payload:{toolName:'onet_search',params:{keyword:kw}}}, '*');
      }
      document.getElementById('search-btn').onclick = doSearch;
      document.getElementById('kw').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    </script>`);
}
