/**
 * O*NET Web Services client — API v2.0
 * Reference: https://services.onetcenter.org/reference/
 *
 * Auth: HTTP Basic (username = account, password = API key).
 * NOTE: API v2 requires a separate key from v1.
 *
 * Endpoints covered:
 *
 * MNM (My Next Move):
 *   /mnm/search                          keyword search
 *   /mnm/careers/{code}/report           full career report
 *   /mnm/careers/{code}/outlook          salary + outlook
 *   /mnm/careers/{code}/explore          related careers
 *   /mnm/listings/bright                 Bright Outlook careers
 *   /mnm/listings/apprenticeships        Registered Apprenticeships
 *   /mnm/browse/                         industry list
 *   /mnm/browse/{industry}               careers in industry
 *   /mnm/interestprofiler/questions_30   Mini-IP 30 questions
 *   /mnm/interestprofiler/careers        career matches
 *
 * O*NET OnLine (granular/research-grade):
 *   /online/occupations/{code}/details/tasks
 *   /online/occupations/{code}/details/detailed_work_activities  (DWA)
 *   /online/occupations/{code}/details/work_activities           (GWA)
 *   /online/occupations/{code}/details/work_context
 *   /online/occupations/{code}/details/skills
 *   /online/occupations/{code}/details/knowledge
 *   /online/occupations/{code}/details/abilities
 *   /online/occupations/{code}/details/interests                 (RIASEC)
 *   /online/occupations/{code}/details/education
 *   /online/occupations/{code}/details/job_zone
 *   /online/occupations/{code}/details/technology_skills         (hot tech)
 *   /online/occupations/{code}/details/tools_and_technologies
 *   /online/occupations/{code}/related/occupations
 *   /online/occupations/{code}/related/alternate_titles
 *   /online/hot_technology
 *
 * Legacy (v1-compat):
 *   /occupations/{code}/summary
 *   /occupations/{code}
 */

const BASE_URL = 'https://services.onetcenter.org/ws';

export interface OnetCredentials {
  username: string;
  password: string;
}

// ── Shared primitives ─────────────────────────────────────────────────────

export interface ScoredElement {
  id?: string;
  name: string;
  description?: string;
  score?: { value: number; scale?: { id?: string; minimum?: number; maximum?: number } };
}

export interface OccupationRef {
  code: string;
  title: string;
  tags?: { bright_outlook?: boolean; green?: boolean; in_demand?: boolean };
}

// ── MNM types ─────────────────────────────────────────────────────────────

export interface OnetSearchResponse {
  occupation?: OccupationRef[];
  total?: number;
  keyword?: string;
}

export interface MnmCareerReport {
  occupation: { code: string; title: string; description: string };
  tags?: { bright_outlook?: boolean; green?: boolean; in_demand?: boolean };
  also_called?: { title?: string[] };
  on_the_job?: { task?: Array<{ id?: string; statement: string; emerging?: boolean }> };
  knowledge?: { element?: ScoredElement[] };
  skills?: { element?: ScoredElement[] };
  abilities?: { element?: ScoredElement[] };
  personality?: { element?: Array<{ id?: string; name: string; description?: string }> };
  technology?: {
    item?: Array<{ name: string; category?: string; hot_technology?: boolean; in_demand?: boolean }>;
  };
  education?: {
    education_usually_needed?: { category?: Array<{ name: string; percent: number }> };
  };
  job_outlook?: {
    bright_outlook?: boolean;
    in_demand?: boolean;
    apprenticeship?: boolean;
    category?: { title?: string; description?: string };
    salary?: {
      annual_median?: number;
      annual_10th?: number;
      annual_90th?: number;
      hourly_median?: number;
    };
  };
}

export interface MnmOutlook {
  occupation?: { code: string; title: string };
  bright_outlook?: boolean;
  in_demand?: boolean;
  apprenticeship?: boolean;
  category?: { title?: string; description?: string };
  salary?: { annual_median?: number; annual_10th?: number; annual_90th?: number };
}

export interface MnmExplore {
  career?: OccupationRef[];
}

export interface MnmListings {
  occupation?: OccupationRef[];
  total?: number;
  start?: number;
  end?: number;
}

export interface MnmBrowseIndustries {
  industry?: Array<{ code: string; title: string; total?: number }>;
}

export interface MnmBrowseIndustry {
  industry?: { code: string; title: string };
  most?: { career?: OccupationRef[] };
  some?: { career?: OccupationRef[] };
}

// ── OnLine — Tasks ────────────────────────────────────────────────────────

export interface OnlineTask {
  id?: string;
  name?: string;
  statement?: string;
  category?: string;
  emerging?: boolean;
  importance?: number;
}

export interface OnlineTasksResponse {
  task?: OnlineTask[];
  total?: number;
}

// ── OnLine — DWA ──────────────────────────────────────────────────────────

export interface DetailedWorkActivity {
  id?: string;
  activity: string;
  work_activity?: string; // parent GWA
}

export interface OnlineDWAResponse {
  detailed_work_activity?: DetailedWorkActivity[];
  total?: number;
}

// ── OnLine — GWA ──────────────────────────────────────────────────────────

export interface OnlineGWAResponse {
  element?: ScoredElement[];
  total?: number;
}

// ── OnLine — Work Context ─────────────────────────────────────────────────

export interface WorkContextItem {
  id?: string;
  name: string;
  category?: string;
  score?: { value: number };
  response?: string;
}

export interface OnlineWorkContextResponse {
  element?: WorkContextItem[];
  total?: number;
}

// ── OnLine — Skills / Knowledge / Abilities ───────────────────────────────

export interface OnlineScoredResponse {
  element?: ScoredElement[];
  total?: number;
}

// ── OnLine — Interests (RIASEC) ───────────────────────────────────────────

export interface RiasecArea {
  id: string;
  name: string;
  description?: string;
  score?: { value: number };
}

export interface OnlineInterestsResponse {
  area?: RiasecArea[];
  high_point_code?: string;
  total?: number;
}

// ── OnLine — Education ────────────────────────────────────────────────────

export interface OnlineEducationResponse {
  education_usually_needed?: { category?: Array<{ name: string; percent: number }> };
  education_required_by_employers?: { category?: Array<{ name: string; percent: number }> };
  required_skills?: { skill?: Array<{ name: string }> };
  apprenticeship?: { registered?: boolean; title?: string[] };
}

// ── OnLine — Job Zone ─────────────────────────────────────────────────────

export interface OnlineJobZoneResponse {
  job_zone?: {
    value: number;
    title?: string;
    description?: string;
    education?: string;
    related_experience?: string;
    on_site_training?: string;
    on_the_job_training?: string;
    examples?: Array<{ code: string; title: string }>;
  };
}

// ── OnLine — Technology Skills ────────────────────────────────────────────

export interface TechSkillItem {
  name: string;
  category?: string;
  category_code?: string;
  hot_technology?: boolean;
  in_demand?: boolean;
}

export interface OnlineTechSkillsResponse {
  technology_skills?: TechSkillItem[];
  total?: number;
}

export interface OnlineToolsResponse {
  technology_skills?: TechSkillItem[];
  tools_used?: Array<{ name: string; category?: string }>;
  total?: number;
}

// ── OnLine — Related / Alternate titles ───────────────────────────────────

export interface OnlineRelatedOccupations {
  occupation?: Array<OccupationRef & { related_level?: number }>;
  total?: number;
}

export interface OnlineAlternateTitles {
  alternate_title?: Array<{ title: string; source?: string }>;
  total?: number;
}

// ── OnLine — Hot Technology listing ──────────────────────────────────────

export interface HotTechnologyItem {
  name: string;
  category?: string;
  occupations?: number;
}

export interface OnlineHotTechResponse {
  technology?: HotTechnologyItem[];
  total?: number;
}

// ── Legacy ────────────────────────────────────────────────────────────────

export interface OnetOccupationDetail {
  code: string;
  title: string;
  description: string;
  tags?: { bright_outlook?: boolean; green?: boolean };
  also_called?: { title?: string[] };
}

export interface OnetReport {
  occupation: { code: string; title: string; description: string };
  skills?: { element?: Array<{ name: string; score: { value: number } }> };
  knowledge?: { element?: Array<{ name: string; score: { value: number } }> };
  work_styles?: { element?: Array<{ name: string; score: { value: number } }> };
  education?: {
    education_usually_needed?: { category?: Array<{ name: string; percent: number }> };
  };
  wages?: { wage?: Array<{ pct50?: number; employment?: number }> };
  outlook?: { category?: { name: string }; description?: string };
}

// ── Fetch helper ───────────────────────────────────────────────────────────

async function onetFetch<T>(
  path: string,
  creds: OnetCredentials,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const auth = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`O*NET API ${res.status} — ${path}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ── MNM ───────────────────────────────────────────────────────────────────

export const liveSearch = (keyword: string, creds: OnetCredentials) =>
  onetFetch<OnetSearchResponse>('/mnm/search', creds, { keyword, end: '20' });

export const liveCareerReport = (code: string, creds: OnetCredentials) =>
  onetFetch<MnmCareerReport>(`/mnm/careers/${code}/report`, creds);

export const liveCareerOutlook = (code: string, creds: OnetCredentials) =>
  onetFetch<MnmOutlook>(`/mnm/careers/${code}/outlook`, creds);

export const liveExploreRelated = (code: string, creds: OnetCredentials) =>
  onetFetch<MnmExplore>(`/mnm/careers/${code}/explore`, creds);

export const liveBrightOutlook = (creds: OnetCredentials, start = 1, end = 40) =>
  onetFetch<MnmListings>('/mnm/listings/bright', creds, {
    start: String(start),
    end: String(end),
  });

export const liveApprenticeships = (creds: OnetCredentials) =>
  onetFetch<MnmListings>('/mnm/listings/apprenticeships', creds);

export const liveBrowseIndustries = (creds: OnetCredentials) =>
  onetFetch<MnmBrowseIndustries>('/mnm/browse/', creds);

export const liveBrowseIndustry = (industryCode: string, creds: OnetCredentials) =>
  onetFetch<MnmBrowseIndustry>(`/mnm/browse/${industryCode}`, creds);

export const liveInterestProfilerQuestions = (creds: OnetCredentials) =>
  onetFetch<{ question?: Array<{ id?: string | number; text: string; area?: string }>; total?: number }>(
    '/mnm/interestprofiler/questions_30',
    creds,
  );

export const liveInterestProfilerCareers = (answers: string, creds: OnetCredentials) =>
  onetFetch<{
    career?: Array<{ code: string; title: string; fit?: string; tags?: { bright_outlook?: boolean } }>;
    area?: Array<{ id: string; description: string; score?: number }>;
  }>('/mnm/interestprofiler/careers', creds, { answers });

// ── O*NET OnLine — detail endpoints ───────────────────────────────────────

/** Tasks — includes `emerging: true` flag for new/future tasks */
export const liveOccupationTasks = (code: string, creds: OnetCredentials) =>
  onetFetch<OnlineTasksResponse>(`/online/occupations/${code}/details/tasks`, creds);

/** DWAs — ~2 000 cross-occupational Detailed Work Activities */
export const liveDetailedWorkActivities = (code: string, creds: OnetCredentials) =>
  onetFetch<OnlineDWAResponse>(
    `/online/occupations/${code}/details/detailed_work_activities`,
    creds,
  );

/** GWAs — General Work Activities, scored by importance */
export const liveWorkActivities = (code: string, creds: OnetCredentials) =>
  onetFetch<OnlineGWAResponse>(`/online/occupations/${code}/details/work_activities`, creds);

/** Work Context — physical/social environment (noise, outdoors, time pressure…) */
export const liveWorkContext = (code: string, creds: OnetCredentials) =>
  onetFetch<OnlineWorkContextResponse>(`/online/occupations/${code}/details/work_context`, creds);

export const liveOccupationSkills = (code: string, creds: OnetCredentials) =>
  onetFetch<OnlineScoredResponse>(`/online/occupations/${code}/details/skills`, creds);

export const liveOccupationKnowledge = (code: string, creds: OnetCredentials) =>
  onetFetch<OnlineScoredResponse>(`/online/occupations/${code}/details/knowledge`, creds);

export const liveOccupationAbilities = (code: string, creds: OnetCredentials) =>
  onetFetch<OnlineScoredResponse>(`/online/occupations/${code}/details/abilities`, creds);

/** RIASEC interests + high-point code (e.g. "ICA") */
export const liveOccupationInterests = (code: string, creds: OnetCredentials) =>
  onetFetch<OnlineInterestsResponse>(`/online/occupations/${code}/details/interests`, creds);

export const liveOccupationEducation = (code: string, creds: OnetCredentials) =>
  onetFetch<OnlineEducationResponse>(`/online/occupations/${code}/details/education`, creds);

export const liveOccupationJobZone = (code: string, creds: OnetCredentials) =>
  onetFetch<OnlineJobZoneResponse>(`/online/occupations/${code}/details/job_zone`, creds);

/** Tech skills — hot_technology + in_demand flags per occupation */
export const liveOccupationTechSkills = (code: string, creds: OnetCredentials) =>
  onetFetch<OnlineTechSkillsResponse>(
    `/online/occupations/${code}/details/technology_skills`,
    creds,
  );

/** Full tools & technologies list (tech skills + physical tools) */
export const liveOccupationTools = (code: string, creds: OnetCredentials) =>
  onetFetch<OnlineToolsResponse>(
    `/online/occupations/${code}/details/tools_and_technologies`,
    creds,
  );

export const liveRelatedOccupations = (code: string, creds: OnetCredentials) =>
  onetFetch<OnlineRelatedOccupations>(`/online/occupations/${code}/related/occupations`, creds);

export const liveAlternateTitles = (code: string, creds: OnetCredentials) =>
  onetFetch<OnlineAlternateTitles>(`/online/occupations/${code}/related/alternate_titles`, creds);

/** Hot Technology listing — most in-demand software across all job postings */
export const liveHotTechnologies = (creds: OnetCredentials, start = 1, end = 40) =>
  onetFetch<OnlineHotTechResponse>('/online/hot_technology', creds, {
    start: String(start),
    end: String(end),
  });

// ── Legacy ────────────────────────────────────────────────────────────────

export const liveOccupationSummary = (code: string, creds: OnetCredentials) =>
  onetFetch<OnetReport>(`/occupations/${code}/summary`, creds);

export const liveOccupationDetails = (code: string, creds: OnetCredentials) =>
  onetFetch<OnetOccupationDetail>(`/occupations/${code}`, creds);
