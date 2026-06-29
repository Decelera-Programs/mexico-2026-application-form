/**
 * Scoring engine — Mexico 2026 application form.
 * Based strictly on Application_Form_Menorca2026_Spec_v2 explicit flags only.
 *
 * Green flags (explicitly marked "green" / "GREEN" in spec):
 *   Q6  Data moat or network effects
 *   Q22 Churn <2%
 *   Q23 >80% organic acquisition
 *   Q27 Founders >80% equity
 *   Q35 Referred by Decelera network
 *
 * Yellow flags (explicitly marked "watch" or "alert" in spec):
 *   Q7  Dependent on 3rd-party APIs ("wrapper alert")
 *   Q13 No technical co-founder
 *   Q20 MoM growth <5% or N/A
 *   Q21 Monthly burn €50–100k
 *
 * Block score = peak per question (max of selected options, never sum).
 *
 * Max points: 85 pts
 *   Product  20  (Q6 defensibility 10 + Q7 third-party 10)
 *   Market   10  (Q11 tailwind 10)
 *   Team     35  (Q15 milestone 15 + Q17 sector exp 10 + Q18 sig milestone 10)
 *   Traction 20  (Q20 MoM 10 + Q22 churn 5 + Q23 acquisition 5)
 */

export interface ScoreResult {
  total:          number;
  productScore:   number;
  marketScore:    number;
  teamScore:      number;
  tractionScore:  number;
  greenFlags:     string;
  yellowFlags:    string;
  redFlags:       string;
  summary:        string;
  tier:           'Tier 1' | 'Tier 2' | 'Tier 3';
}

function peak(map: Record<string, number>, val: unknown): number {
  const arr = Array.isArray(val) ? val : (val != null && val !== '' ? [val] : []);
  return Math.max(0, ...arr.map(v => map[String(v)] ?? 0));
}

function single(map: Record<string, number>, val: unknown): number {
  return map[String(val ?? '')] ?? 0;
}

function includes(val: unknown, item: string): boolean {
  return Array.isArray(val) ? val.includes(item) : val === item;
}

// ── Scoring tables ────────────────────────────────────────────────────────────

const DEFENSIBILITY: Record<string, number> = {
  'Data moat — proprietary/exclusive/longitudinal data improving with use': 10,
  'Network effects':                           10,
  'Deep integration / high switching costs':   5,
  'Hard-to-replicate technical edge':          5,
  'Regulation / licenses':                     5,
  'Brand / GTM':                               0,
  'None clearly yet':                          0,
};

const THIRD_PARTY: Record<string, number> = {
  'Independent — used for non-core tasks, the core is ours':               10,
  'Hybrid — we enhance third-party models with our own data / fine-tuning': 5,
  'Dependent — a superior layer / UX on top of existing APIs':               0,
};

const WHY_NOW: Record<string, number> = {
  'New mandated compliance — buyers now legally forced to adopt':            10,
  'Extreme supply/demand imbalance':                                          8,
  'Generative AI / large-scale automation — 10x cost cut or new capability': 5,
  'Platform shift, e.g. on-prem → cloud':                                    3,
  'None / general growth':                                                    0,
};

const TEAM_MILESTONE: Record<string, number> = {
  'Serial founder, exit >$10M':                   15,
  'Serial founder, exit <$10M':                   10,
  'Serial founder, no exit':                       7,
  'Early employee (<20) at a unicorn / scale-up':  7,
  'PhD or senior researcher in the area':          7,
  'Senior corporate, 10y+ in sector':              4,
  'First-time founder':                             0,
};

const SECTOR_EXP: Record<string, number> = {
  '0–2 years':   0,
  '2–5 years':   0,
  '6–12 years':  7,
  '12+ years':  10,
};

const SIG_MILESTONE: Record<string, number> = {
  'Built and launched the MVP with no external funding / 3rd-party devs': 10,
  'Convinced a Tier-1 senior to leave their job for min salary':          10,
  'Secured 3+ LOIs or pilots before a finished product':                   8,
  '$5k+ MRR (or equivalent usage) within 12 weeks of launch':             7,
  'None yet':                                                               0,
};

const MOM_GROWTH: Record<string, number> = {
  '>20%':                              10,
  '10–20%':                             5,
  '5–10%':                              2,
  '<5% or N/A — building / pivoting':  0,
};

const CHURN: Record<string, number> = {
  '<2%':   5,
  '2–5%':  5,
  '5–10%': 0,
  '>10%':  0,
};

const ACQ_CHANNEL: Record<string, number> = {
  '>80% organic — word-of-mouth / SEO / loops': 5,
  '50–80% organic, rest paid':                  0,
  '<50% organic — heavy ads / sales':           0,
};

// ── Main scoring function ─────────────────────────────────────────────────────

export function scoreAnswers(a: Record<string, unknown>): ScoreResult {
  let productScore  = 0;
  let marketScore   = 0;
  let teamScore     = 0;
  let tractionScore = 0;
  const green:  string[] = [];
  const yellow: string[] = [];

  // ── Product (20 pts) ──────────────────────────────────────────────────────

  // Q6 Defensibility — PEAK (multiselect)
  productScore += peak(DEFENSIBILITY, a.defensibility);
  if (includes(a.defensibility, 'Data moat — proprietary/exclusive/longitudinal data improving with use') ||
      includes(a.defensibility, 'Network effects'))
    green.push('🟢 Data moat or network effects — strongest defensibility signal');

  // Q7 Third-party dependence
  productScore += single(THIRD_PARTY, a.third_party_dependence);
  if (a.third_party_dependence === 'Dependent — a superior layer / UX on top of existing APIs')
    yellow.push('🟡 Dependent on 3rd-party APIs — wrapper risk');

  // ── Market (10 pts) ───────────────────────────────────────────────────────

  // Q11 External tailwind
  marketScore += single(WHY_NOW, a.why_now_select);

  // ── Team (35 pts) ─────────────────────────────────────────────────────────

  // Q13 Technical co-founder
  if (a.technical_cofounder === false)
    yellow.push('🟡 No technical co-founder');

  // Q15 Collective milestone — PEAK (multiselect)
  teamScore += peak(TEAM_MILESTONE, a.team_milestone);

  // Q17 Sector experience
  teamScore += single(SECTOR_EXP, a.sector_experience);

  // Q18 Most significant milestone — PEAK (multiselect)
  teamScore += peak(SIG_MILESTONE, a.most_significant_milestone);

  // ── Traction (20 pts) ─────────────────────────────────────────────────────

  // Q20 MoM growth
  tractionScore += single(MOM_GROWTH, a.mom_growth);
  if (a.mom_growth === '<5% or N/A — building / pivoting')
    yellow.push('🟡 MoM growth <5% or N/A');

  // Q21 Net burn — flags only, not scored
  if (a.net_burn === '$50k - $100k')
    yellow.push('🟡 Monthly burn $50k-$100k');

  // Q22 Churn
  tractionScore += single(CHURN, a.churn);
  if (a.churn === '<2%')
    green.push('🟢 Churn <2% — excellent retention');

  // Q23 Acquisition channel
  tractionScore += single(ACQ_CHANNEL, a.acquisition_channel);
  if (a.acquisition_channel === '>80% organic — word-of-mouth / SEO / loops')
    green.push('🟢 >80% organic acquisition');

  // ── Equity flags ──────────────────────────────────────────────────────────

  // Q27 Founding equity
  if (a.founding_equity === '>80%')
    green.push('🟢 Founders hold >80% equity');

  // ── Network flag ──────────────────────────────────────────────────────────

  // Q35 Decelera network contact
  if (a.network_contact === true)
    green.push('🟢 Referred by Decelera network');

  // ── Total & tier ──────────────────────────────────────────────────────────

  const total = productScore + marketScore + teamScore + tractionScore;

  let tier: ScoreResult['tier'];
  if      (total >= 55) tier = 'Tier 1';
  else if (total >= 30) tier = 'Tier 2';
  else                  tier = 'Tier 3';

  const summary = [
    `Team:     ${teamScore} / 35`,
    `Market:   ${marketScore} / 10`,
    `Product:  ${productScore} / 20`,
    `Traction: ${tractionScore} / 20`,
    `──────────────────`,
    `Total:    ${total} / 85`,
    `Tier:     ${tier}`,
  ].join('\n');

  return {
    total,
    productScore,
    marketScore,
    teamScore,
    tractionScore,
    greenFlags:  green.join('\n'),
    yellowFlags: yellow.join('\n'),
    redFlags:    '',
    summary,
    tier,
  };
}
