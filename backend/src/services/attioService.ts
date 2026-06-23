/**
 * Attio sync service — LATAM Deal Flow (Mexico 2026)
 *
 * Flow on completion:
 *   1. Upsert Person (match by email)
 *   2. Upsert Company (match by domain if available, else plain create)
 *   3. Link Person → Company
 *   4. Create Deal (all form fields)
 *   5. Link Deal → Company + Person
 *   6. Add Deal to "Startups Deal Flow LATAM" list (slug: startups_deal_flow_2)
 */

const ATTIO_API = 'https://api.attio.com/v2';
const ATTIO_TOKEN = process.env.ATTIO_API_KEY;

const LATAM_LIST_SLUG = 'startups_deal_flow_2';
const DEAL_STAGE_LEADS_MEXICO = 'Leads Mexico 2026';
const DEAL_OWNER_MEMBER_ID = '2f347934-032a-411c-a5ef-169cd635dd05'; // carlos@decelera.com

type AttioResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function attioFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<AttioResult<T>> {
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

// ---- Step 1: Person ----

export interface PersonInput {
  fullName: string;
  email: string;
  linkedin?: string;
}

async function upsertPerson(input: PersonInput): Promise<AttioResult<{ id: string }>> {
  const email = input.email.trim().toLowerCase();
  const nameParts = input.fullName.trim().split(' ');
  const firstName = nameParts[0] ?? '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const result = await attioFetch<{ data: { id: { record_id: string } } }>(
    '/objects/people/records?matching_attribute=email_addresses',
    {
      method: 'PUT',
      body: JSON.stringify({
        data: {
          values: {
            name: [{ first_name: firstName, last_name: lastName, full_name: input.fullName.trim() }],
            email_addresses: [{ email_address: email }],
            ...(input.linkedin ? { linkedin: [{ value: input.linkedin }] } : {}),
          },
        },
      }),
    }
  );

  if (!result.ok) return result;
  return { ok: true, data: { id: result.data.data.id.record_id } };
}

// ---- Step 2: Company ----

export interface CompanyInput {
  name: string;
  website?: string;
}

async function resolveCompany(input: CompanyInput): Promise<AttioResult<{ id: string }>> {
  const domain = input.website ? extractDomain(input.website) : null;

  if (domain) {
    const result = await attioFetch<{ data: { id: { record_id: string } } }>(
      '/objects/companies/records?matching_attribute=domains',
      {
        method: 'PUT',
        body: JSON.stringify({
          data: {
            values: {
              name: [{ value: input.name }],
              domains: [{ domain }],
            },
          },
        }),
      }
    );
    if (!result.ok) return result;
    return { ok: true, data: { id: result.data.data.id.record_id } };
  }

  const result = await attioFetch<{ data: { id: { record_id: string } } }>(
    '/objects/companies/records',
    {
      method: 'POST',
      body: JSON.stringify({
        data: {
          values: {
            name: [{ value: input.name }],
          },
        },
      }),
    }
  );
  if (!result.ok) return result;
  return { ok: true, data: { id: result.data.data.id.record_id } };
}

// ---- Step 3: Link Person → Company ----

async function linkPersonToCompany(personId: string, companyId: string): Promise<AttioResult<void>> {
  const result = await attioFetch<unknown>(
    `/objects/people/records/${personId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          values: {
            company: [{ target_object: 'companies', target_record_id: companyId }],
          },
        },
      }),
    }
  );
  if (!result.ok) return result;
  return { ok: true, data: undefined };
}

// ---- Step 4: Deal ----

async function createDeal(
  companyId: string,
  personId: string,
  answers: Record<string, unknown>
): Promise<AttioResult<{ id: string }>> {
  const a = answers;

  const values: Record<string, unknown> = {
    name:  [{ value: String(a.startup_name ?? 'Unnamed startup') }],
    stage: [{ status: DEAL_STAGE_LEADS_MEXICO }],
    owner: [{ referenced_actor_type: 'workspace-member', referenced_actor_id: DEAL_OWNER_MEMBER_ID }],
  };

  const addText = (slug: string, val: unknown) => {
    if (val) values[slug] = [{ value: String(val) }];
  };
  const addSelect = (slug: string, val: unknown) => {
    if (val) values[slug] = String(val);
  };
  const addBool = (slug: string, val: unknown) => {
    if (val !== undefined && val !== null) values[slug] = val ? 'Yes' : 'No';
  };
  const addMultiSelect = (slug: string, val: unknown) => {
    if (Array.isArray(val) && val.length > 0) values[slug] = val.map(String);
    else if (val) values[slug] = [String(val)];
  };
  const addNumber = (slug: string, val: unknown) => {
    const n = Number(val);
    if (!isNaN(n) && val !== '' && val !== null && val !== undefined) values[slug] = n;
  };

  // Step 1 — La empresa
  addText('problem', a.problem);
  addText('demo', a.demo_url);
  addSelect('defensibility_4', a.defensibility);
  addSelect('sector', a.sector);
  addSelect('business_model', a.business_model);
  addNumber('potential_clients', a.potential_clients);
  addSelect('external_tailwind', a.why_now_select);
  addText('why_now_validation', a.why_now_validation);

  // Step 2 — Los founders
  addBool('full_time_cto', a.technical_cofounder);
  addSelect('number_of_founders', a.number_of_founders);
  addText('linkedin_1', a.founder_linkedin);

  // Step 3 — Tracción
  addText('north_star', a.north_star);
  addSelect('mom_growth', a.mom_growth);
  addSelect('net_burn_avg_monthly_4', a.net_burn);
  addSelect('churn_avg_last_3_months', a.churn);
  addSelect('organic_users', a.acquisition_channel);

  // Step 4 — Equity & ronda
  addSelect('constitution_company', a.incorporation_location);
  addMultiSelect('operations_location', a.operations_location);
  addNumber('constitution_year', a.company_start_year);
  addSelect('equity', a.founding_equity);
  addSelect('raised', a.total_raised);
  addNumber('acv', a.round_size);
  addSelect('round_committed', a.round_committed);
  if (a.pre_money_valuation !== undefined && a.pre_money_valuation !== null && a.pre_money_valuation !== '')
    values['pre_money_valuation_7'] = [{ value: String(a.pre_money_valuation) }];
  addSelect('runway', a.runway);
  addText('deck_url', a.pitch_deck_url);

  // Step 5 — Cierre
  addSelect('reference_3', a.how_heard);
  addText('referral', a.referral_name);

  const result = await attioFetch<{ data: { id: { record_id: string } } }>(
    '/objects/deals/records',
    {
      method: 'POST',
      body: JSON.stringify({ data: { values } }),
    }
  );

  if (!result.ok) return result;
  return { ok: true, data: { id: result.data.data.id.record_id } };
}

// ---- Step 5: Link Deal → Company + Person ----

async function linkDealToCompanyAndPerson(dealId: string, companyId: string, personId: string): Promise<AttioResult<void>> {
  const result = await attioFetch<unknown>(
    `/objects/deals/records/${dealId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          values: {
            associated_company: [{ target_object: 'companies', target_record_id: companyId }],
            associated_people:  [{ target_object: 'people',    target_record_id: personId }],
            person:             [{ target_object: 'people',    target_record_id: personId }],
          },
        },
      }),
    }
  );
  if (!result.ok) return result;
  return { ok: true, data: undefined };
}

// ---- Step 6: Add deal to LATAM list ----

async function addDealToLatamList(dealId: string): Promise<AttioResult<void>> {
  const result = await attioFetch<unknown>(
    `/lists/${LATAM_LIST_SLUG}/entries`,
    {
      method: 'POST',
      body: JSON.stringify({
        data: {
          parent_record_id: dealId,
          parent_object: 'deals',
          entry_values: {},
        },
      }),
    }
  );

  if (!result.ok) return result;
  return { ok: true, data: undefined };
}

// ---- Public API ----

export interface SyncResult {
  personId: string;
  companyId: string;
  dealId: string;
  addedToList: boolean;
}

export async function syncSessionToAttio(
  answers: Record<string, unknown>
): Promise<AttioResult<SyncResult>> {

  if (!answers.founder_email) {
    return { ok: false, error: 'Missing founder email — cannot sync to Attio' };
  }

  const fullName = String(answers.founder_full_name ?? '').trim() || 'Unknown';
  const email    = String(answers.founder_email).trim().toLowerCase();

  const personResult = await upsertPerson({
    fullName,
    email,
    linkedin: answers.founder_linkedin ? String(answers.founder_linkedin) : undefined,
  });
  if (!personResult.ok) return personResult;
  const personId = personResult.data.id;

  const companyResult = await resolveCompany({
    name:    String(answers.startup_name ?? 'Unnamed startup'),
    website: answers.demo_url ? String(answers.demo_url) : undefined,
  });
  if (!companyResult.ok) return companyResult;
  const companyId = companyResult.data.id;

  const linkPersonResult = await linkPersonToCompany(personId, companyId);
  if (!linkPersonResult.ok) {
    console.warn(`[Attio] Person-company link failed: ${linkPersonResult.error}`);
  }

  const dealResult = await createDeal(companyId, personId, answers);
  if (!dealResult.ok) return dealResult;
  const dealId = dealResult.data.id;

  const linkDealResult = await linkDealToCompanyAndPerson(dealId, companyId, personId);
  if (!linkDealResult.ok) {
    console.warn(`[Attio] Deal-company link failed: ${linkDealResult.error}`);
  }

  const listResult = await addDealToLatamList(dealId);
  if (!listResult.ok) {
    console.warn(`[Attio] Deal created but failed to add to LATAM list: ${listResult.error}`);
  }

  return {
    ok: true,
    data: {
      personId,
      companyId,
      dealId,
      addedToList: listResult.ok,
    },
  };
}
