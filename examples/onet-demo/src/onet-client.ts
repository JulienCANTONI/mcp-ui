/**
 * Live O*NET Web Services client.
 * Docs: https://services.onetcenter.org/reference/
 *
 * Uses HTTP Basic Auth (username = account name, password = API key).
 * Falls back to the embedded dataset when no credentials are set.
 */

const BASE_URL = 'https://services.onetcenter.org/ws';

export interface OnetCredentials {
  username: string;
  password: string;
}

// ── Types matching the O*NET Web Services JSON responses ──────────────────

export interface OnetSearchResult {
  code: string;
  title: string;
  tags?: { bright_outlook?: boolean; green?: boolean };
}

export interface OnetSearchResponse {
  occupation?: OnetSearchResult[];
  total?: number;
  keyword?: string;
}

export interface OnetOccupationDetail {
  code: string;
  title: string;
  description: string;
  tags?: { bright_outlook?: boolean; green?: boolean };
  also_called?: { title?: string[] };
}

export interface OnetReport {
  occupation: {
    code: string;
    title: string;
    description: string;
  };
  skills?: {
    element?: Array<{ name: string; score: { value: number } }>;
  };
  knowledge?: {
    element?: Array<{ name: string; score: { value: number } }>;
  };
  work_styles?: {
    element?: Array<{ name: string; score: { value: number } }>;
  };
  education?: {
    education_usually_needed?: {
      category?: Array<{ name: string; percent: number }>;
    };
  };
  wages?: {
    wage?: Array<{
      pct50?: number;
      employment?: number;
    }>;
  };
  outlook?: {
    category?: { name: string };
    description?: string;
  };
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
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${auth}`,
    },
  });

  if (!res.ok) {
    throw new Error(`O*NET API error ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<T>;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Search occupations by keyword.
 * Endpoint: GET /mnm/search?keyword=...
 */
export async function liveSearch(
  keyword: string,
  creds: OnetCredentials,
): Promise<OnetSearchResponse> {
  return onetFetch<OnetSearchResponse>('/mnm/search', creds, { keyword, end: '20' });
}

/**
 * Get the summary report for a specific occupation (skills, wages, outlook…).
 * Endpoint: GET /occupations/{code}/summary
 */
export async function liveOccupationSummary(
  code: string,
  creds: OnetCredentials,
): Promise<OnetReport> {
  return onetFetch<OnetReport>(`/occupations/${code}/summary`, creds);
}

/**
 * Get occupation details (description, also-called titles…).
 * Endpoint: GET /occupations/{code}
 */
export async function liveOccupationDetails(
  code: string,
  creds: OnetCredentials,
): Promise<OnetOccupationDetail> {
  return onetFetch<OnetOccupationDetail>(`/occupations/${code}`, creds);
}
