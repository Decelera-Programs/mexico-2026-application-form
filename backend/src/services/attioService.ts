/**
 * Attio sync — LATAM Deal Flow (Mexico 2026)
 *
 * Flow:
 *   1. Upsert Person (match by email)
 *   2. Upsert Company (match by domain if available, else by name)
 *   3. Link Person → Company
 *   4. Create Deal (all form fields, linked to Person + Company)
 *   5. Add Deal to "Startups Deal Flow LATAM" list with initial entry values
 */

const ATTIO_API  = 'https://api.attio.com/v2';
const ATTIO_TOKEN = process.env.ATTIO_API_KEY;

const LATAM_LIST_SLUG          = 'startups_deal_flow_2';
const DEAL_STAGE               = 'Leads Mexico 2026';
const DEAL_OWNER_MEMBER_ID     = '2f347934-032a-411c-a5ef-169cd635dd05'; // carlos@decelera.com

// ── Value translators ────────────────────────────────────────────────────────
// Form label → Attio option title (only for fields where they differ)

const T_DEFENSIBILITY: Record<string, string> = {
  'Data moat — proprietary/exclusive/longitudinal data improving with use': 'Data Moat',
  'Network effects':                              'Network Effects',
  'Deep integration / high switching costs':      'Deep Integration',
  'Hard-to-replicate technical edge':             'Hard Technical Edge',
  'Regulation / licenses':                        'Regulation-Licenses',
  'Brand / GTM':                                  'Brand-GTM',
  'None clearly yet':                             'None yet',
};

const T_THIRD_PARTY: Record<string, string> = {
  'Independent — used for non-core tasks, the core is ours':              "Independent: We use them for non-core tasks, but our 'magic' is ours.",
  'Hybrid — we enhance third-party models with our own data / fine-tuning': 'Hybrid: We enhance 3rd party models with our own proprietary datasets/fine-tuning.',
  'Dependent — a superior layer / UX on top of existing APIs':            'Dependent: We provide a superior layer/UX on top of existing powerful APIs.',
};

const T_WHY_NOW: Record<string, string> = {
  'New mandated compliance — buyers now legally forced to adopt': 'New Mandated Compliance/Reporting: (Companies are now legally forced to buy a solution like yours)',
  'Extreme supply/demand imbalance':                             'Extreme Supply/Demand Imbalance: (e.g., severe labor shortages, energy crisis, or massive infrastructure gaps).',
  'Generative AI / large-scale automation — 10x cost cut or new capability': 'Generative AI / Large Scale Automation: (Enabling a 10x cost reduction or a new capability)',
  'Platform shift, e.g. on-prem → cloud':                       'Platform Shift: (e.g. transition from legacy On-Premise to Cloud-native or Hardware to Software-defined)',
  'None / general growth':                                       'None / General Market Growth: (Standard organic growth).',
};

const T_TEAM_MILESTONE: Record<string, string> = {
  'Serial founder, exit >€10M':                   'Serial founder exit +10M',
  'Serial founder, exit <€10M':                   'Serial founder exit -10M',
  'Serial founder, no exit':                      'Serial founder no exit',
  'Early employee (<20) at a unicorn / scale-up': 'Early employee Unicorn-Scaleup',
  'PhD or senior researcher in the area':         'PhD or Senior Investigator',
  'Senior corporate, 10y+ in sector':             'Senior Corporate +10y',
  'First-time founder':                           'First-time founder',
};

const T_MILESTONE: Record<string, string> = {
  'Built and launched the MVP with no external funding / 3rd-party devs': 'Built and launched the MVP without external funding or 3rd party devs.',
  'Convinced a Tier-1 senior to leave their job for min salary':           'Convinced a Tier 1 Senior profile to leave their job and join as Co-founder/Early hire (minimum salary).',
  'Secured 3+ LOIs or pilots before a finished product':                   'Secured 3+ LOIs or Pilot agreements before having a finished product.',
  '€5k+ MRR (or equivalent usage) within 12 weeks of launch':             'Reached +€5k MRR (or equivalent usage) within the first 12 weeks of launch.',
  'None yet':                                                               'None of the above yet.',
};

const T_SECTOR_EXP: Record<string, string> = {
  '0–2 years':   '0 - 2 years',
  '2–5 years':   '2 - 5 years',
  '6–12 years':  '6 - 12 years',
  '12+ years':   '+12 years',
};

const T_MOM_GROWTH: Record<string, string> = {
  '>20%':                          '>20%',
  '10–20%':                        '10-20%',
  '5–10%':                         '5-10%',
  '<5% or N/A — building / pivoting': 'NA (building/pivoting)',
};

const T_NET_BURN: Record<string, string> = {
  '<€10k':    '<10k €',
  '€10–25k':  '10k-25k €',
  '€25–50k':  '25k-50k €',
  '€50–100k': '50 - 100k €',
  '>€100k':   '+100k €',
};

const T_CHURN: Record<string, string> = {
  '<2%':   '<2%',
  '2–5%':  '2-5%',
  '5–10%': '5-10%',
  '>10%':  '>10%',
};

const T_ACQ_CHANNEL: Record<string, string> = {
  '>80% organic — word-of-mouth / SEO / loops': '>80% come via word-of-mouth, SEO, or organic loops.',
  '50–80% organic, rest paid':                  '50-80% organic, the rest is paid/outbound',
  '<50% organic — heavy ads / sales':           '<50% organic; we rely heavily on Ads/Sales teams.',
};

const T_INCORPORATION: Record<string, string> = {
  'Spain': 'Spain', 'Portugal': 'Portugal', 'France': 'France', 'Italy': 'Italy',
  'UK': 'U.K.', 'EU': 'E.U.', 'LATAM': 'LATAM', 'Brazil': 'Other', 'Other': 'Other',
};

const T_OPS_LOCATION: Record<string, string> = {
  'Mexico': 'LATAM', 'Colombia': 'LATAM', 'Chile': 'LATAM', 'Argentina': 'LATAM',
  'Peru': 'LATAM', 'Uruguay': 'LATAM', 'Central America & Caribbean': 'LATAM',
  'USA': 'U.S.A.', 'Brazil': 'LATAM', 'Other LATAM': 'LATAM', 'Europe': 'E.U.',
};

const T_EQUITY: Record<string, string> = {
  '>80%': '> 80%', '60–80%': '60% - 80%', '40–60%': '40% - 60%', '<40%': '< 40%',
};

const T_RAISED: Record<string, string> = {
  '<€500k': '< 500k', '€500k–1.5M': '500k - 1.5M', '€1.5M–2.5M': '1.5M - 2.5M', '>€2.5M': '> 2.5M',
};

const T_ROUND_COMMITTED: Record<string, string> = {
  '0–25%': '0 - 25%', '25–50%': '25% - 50%', '50–75%': '50% - 75%', '75%+': '75%',
};

const T_RUNWAY: Record<string, string> = {
  '0–2 months': '0 - 2 Months', '2–5 months': '2 - 5 Months',
  '6–12 months': '6 - 12 Months', '12+ months': '12+ Months',
};

const T_HOW_HEARD: Record<string, string> = {
  'LinkedIn': 'Social media (LinkedIn, X, Instagram...)',
  'Referral': 'Referral', 'Event': 'Event', 'Press': 'Press', 'Other': 'Other',
};

// ── Attio API helpers ────────────────────────────────────────────────────────

type AttioResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function attioFetch<T>(path: string, options: RequestInit = {}): Promise<AttioResult<T>> {
  try {
    const res = await fetch(`${ATTIO_API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${ATTIO_TOKEN}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Attio ${res.status} on ${path}: ${body}` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// Attio value builders per type
const txt    = (v: string) => [{ value: v }];
const num    = (v: number) => [{ value: v }];
const opt    = (v: string) => [{ option: v }];
const opts   = (vs: string[]) => vs.map(v => ({ option: v }));
const status = (v: string) => [{ status: v }];
const date   = (v: string) => [{ value: v }];

function translate(map: Record<string, string>, raw: unknown): string | null {
  const s = String(raw ?? '');
  return map[s] ?? null;
}

function translateMany(map: Record<string, string>, raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const mapped = arr.map(v => map[String(v)]).filter(Boolean) as string[];
  return [...new Set(mapped)]; // deduplicate (e.g. multiple LATAM countries → one "LATAM")
}

function extractDomain(url: string): string | null {
  try {
    const trimmed = url.trim();
    if (!trimmed) return null;
    const u = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    return host.includes('.') ? host : null;
  } catch {
    return null;
  }
}

// ── Step 1: Upsert Person ────────────────────────────────────────────────────

async function upsertPerson(
  fullName: string,
  email: string,
  linkedin?: string
): Promise<AttioResult<{ id: string }>> {
  const nameParts = fullName.trim().split(' ');
  const firstName = nameParts[0] ?? '';
  const lastName  = nameParts.slice(1).join(' ') || '';

  const values: Record<string, unknown> = {
    name:            [{ first_name: firstName, last_name: lastName, full_name: fullName.trim() }],
    email_addresses: [{ email_address: email.trim().toLowerCase() }],
  };
  if (linkedin) values['linkedin'] = txt(linkedin);

  const r = await attioFetch<{ data: { id: { record_id: string } } }>(
    '/objects/people/records?matching_attribute=email_addresses',
    { method: 'PUT', body: JSON.stringify({ data: { values } }) }
  );
  if (!r.ok) return r;
  return { ok: true, data: { id: r.data.data.id.record_id } };
}

// ── Step 2: Upsert Company ───────────────────────────────────────────────────

async function upsertCompany(
  name: string,
  website?: string
): Promise<AttioResult<{ id: string }>> {
  const domain = website ? extractDomain(website) : null;

  if (domain) {
    const r = await attioFetch<{ data: { id: { record_id: string } } }>(
      '/objects/companies/records?matching_attribute=domains',
      {
        method: 'PUT',
        body: JSON.stringify({ data: { values: { name: txt(name), domains: [{ domain }] } } }),
      }
    );
    if (!r.ok) return r;
    return { ok: true, data: { id: r.data.data.id.record_id } };
  }

  const r = await attioFetch<{ data: { id: { record_id: string } } }>(
    '/objects/companies/records?matching_attribute=name',
    {
      method: 'PUT',
      body: JSON.stringify({ data: { values: { name: txt(name) } } }),
    }
  );
  if (!r.ok) return r;
  return { ok: true, data: { id: r.data.data.id.record_id } };
}

// ── Step 3: Link Person → Company ───────────────────────────────────────────

async function linkPersonToCompany(personId: string, companyId: string): Promise<AttioResult<void>> {
  const r = await attioFetch<unknown>(`/objects/people/records/${personId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: { values: { company: [{ target_object: 'companies', target_record_id: companyId }] } },
    }),
  });
  if (!r.ok) return r;
  return { ok: true, data: undefined };
}

// ── Step 4: Create Deal ──────────────────────────────────────────────────────

async function createDeal(
  companyId: string,
  personId: string,
  a: Record<string, unknown>
): Promise<AttioResult<{ id: string }>> {
  const v: Record<string, unknown> = {
    name:               txt(String(a.startup_name ?? 'Unnamed startup')),
    stage:              status(DEAL_STAGE),
    owner:              [{ referenced_actor_type: 'workspace-member', referenced_actor_id: DEAL_OWNER_MEMBER_ID }],
    associated_company: [{ target_object: 'companies', target_record_id: companyId }],
    associated_people:  [{ target_object: 'people',    target_record_id: personId  }],
    person:             [{ target_object: 'people',    target_record_id: personId  }],
  };

  const addText = (slug: string, val: unknown) => {
    if (val !== undefined && val !== null && val !== '') v[slug] = txt(String(val));
  };
  const addNum = (slug: string, val: unknown) => {
    const n = Number(val);
    if (!isNaN(n) && val !== '' && val !== null && val !== undefined) v[slug] = num(n);
  };
  const addOpt = (slug: string, map: Record<string, string>, val: unknown) => {
    const t = translate(map, val);
    if (t) v[slug] = opt(t);
  };
  const addOpts = (slug: string, map: Record<string, string>, val: unknown) => {
    const ts = translateMany(map, val);
    if (ts.length) v[slug] = opts(ts);
  };
  // For fields where form options already match Attio exactly (no translation needed)
  const addOptDirect = (slug: string, val: unknown) => {
    if (val !== undefined && val !== null && val !== '') v[slug] = opt(String(val));
  };
  const addOptsDirect = (slug: string, val: unknown) => {
    const arr = Array.isArray(val) ? val.filter(Boolean) : (val ? [val] : []);
    if (arr.length) v[slug] = opts(arr.map(String));
  };

  // ── Block 2: The company
  addText('problem',          a.problem);
  addText('demo',             a.demo_url);
  addText('the_secret',       a.industry_insight);
  addOpts('defensibility_4',  T_DEFENSIBILITY,  a.defensibility);      // multiselect
  addOpt ('uniqueness_ip',    T_THIRD_PARTY,    a.third_party_dependence);
  addOptsDirect('sector',     a.sector);                                // multiselect, exact Attio titles
  addOptsDirect('business_model', a.business_model);                    // multiselect, exact Attio titles
  addNum ('potential_clients', a.potential_clients);
  addOpt ('external_tailwind', T_WHY_NOW,        a.why_now_select);
  addText('why_now_validation', a.why_now_validation);

  // ── Block 3: The founders
  if (a.technical_cofounder !== undefined && a.technical_cofounder !== null)
    v['full_time_cto'] = opt(a.technical_cofounder ? 'Yes' : 'No');
  addOptDirect('number_of_founders',        a.number_of_founders);
  addText('linkedin_1',                     a.founder_linkedin);
  addOpts('collective_milestones',          T_TEAM_MILESTONE, a.team_milestone);  // multiselect
  addText('relevant_experience_explanation', a.team_milestone_detail);
  addOpt ('experience_in_sector',           T_SECTOR_EXP,    a.sector_experience);
  addOpts('most_significant_milestone_6',   T_MILESTONE,     a.most_significant_milestone); // multiselect

  // ── Block 4: Traction
  addText('north_star',           a.north_star);
  addOpt ('mom_growth',           T_MOM_GROWTH,   a.mom_growth);
  addOpt ('net_burn_avg_monthly_4', T_NET_BURN,   a.net_burn);
  addOpt ('churn_avg_last_3_months', T_CHURN,     a.churn);
  addOpt ('organic_users',        T_ACQ_CHANNEL,  a.acquisition_channel);

  // ── Block 5: Equity & the round
  addOpt ('constitution_company', T_INCORPORATION,    a.incorporation_location);
  addOpts('operations_location',  T_OPS_LOCATION,     a.operations_location);  // multiselect + dedup
  addNum ('constitution_year',    a.company_start_year);
  addOpt ('equity',               T_EQUITY,           a.founding_equity);
  addOpt ('raised',               T_RAISED,           a.total_raised);
  addNum ('raise',                a.round_size);
  addOpt ('stage_round',          T_ROUND_COMMITTED,  a.round_committed);
  if (a.pre_money_valuation !== undefined && a.pre_money_valuation !== null && a.pre_money_valuation !== '')
    v['pre_money_valuation_7'] = txt(String(a.pre_money_valuation));
  addOpt ('runway',               T_RUNWAY,           a.runway);
  addText('deck_url',             a.pitch_deck_url);

  // ── Block 6: Wrap-up
  addOpt ('reference_3',  T_HOW_HEARD, a.how_heard);
  addText('referral',              a.referral_name);
  addText('added_comments',        a.additional_comments);

  const r = await attioFetch<{ data: { id: { record_id: string } } }>(
    '/objects/deals/records',
    { method: 'POST', body: JSON.stringify({ data: { values: v } }) }
  );
  if (!r.ok) return r;
  return { ok: true, data: { id: r.data.data.id.record_id } };
}

// ── Step 5: Add Deal to LATAM list ──────────────────────────────────────────

async function addDealToLatamList(dealId: string): Promise<AttioResult<void>> {
  const today = new Date().toISOString().split('T')[0];

  const r = await attioFetch<unknown>(`/lists/${LATAM_LIST_SLUG}/entries`, {
    method: 'POST',
    body: JSON.stringify({
      data: {
        parent_record_id: dealId,
        parent_object:    'deals',
        entry_values: {
          fund:         opt('LATAM'),
          date_sourced: date(today),
          status:       status('Contacted'),
        },
      },
    }),
  });
  if (!r.ok) return r;
  return { ok: true, data: undefined };
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface SyncResult {
  personId:    string;
  companyId:   string;
  dealId:      string;
  addedToList: boolean;
}

export async function syncSessionToAttio(
  answers: Record<string, unknown>
): Promise<AttioResult<SyncResult>> {
  if (!answers.founder_email) {
    return { ok: false, error: 'Missing founder email' };
  }

  const fullName = String(answers.founder_full_name ?? '').trim() || 'Unknown';
  const email    = String(answers.founder_email).trim().toLowerCase();

  const personR = await upsertPerson(
    fullName, email,
    answers.founder_linkedin ? String(answers.founder_linkedin) : undefined
  );
  if (!personR.ok) return personR;
  const personId = personR.data.id;

  const companyR = await upsertCompany(
    String(answers.startup_name ?? 'Unnamed startup'),
    answers.demo_url ? String(answers.demo_url) : undefined
  );
  if (!companyR.ok) return companyR;
  const companyId = companyR.data.id;

  const linkR = await linkPersonToCompany(personId, companyId);
  if (!linkR.ok) console.warn(`[Attio] person-company link: ${linkR.error}`);

  const dealR = await createDeal(companyId, personId, answers);
  if (!dealR.ok) return dealR;
  const dealId = dealR.data.id;

  const listR = await addDealToLatamList(dealId);
  if (!listR.ok) console.warn(`[Attio] list add failed: ${listR.error}`);

  return { ok: true, data: { personId, companyId, dealId, addedToList: listR.ok } };
}
