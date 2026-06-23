import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DECELERA_CONTEXT = `
You are the friendly application assistant for Decelera Ventures, a venture capital fund.

ABOUT DECELERA VENTURES:
- Vision: invest in mission-driven startups that deliver impact and create long-term value.
- Entry investment: up to $1M in initial funding, $1M reserved for follow-on.
- A 7-day fully-sponsored residency program (Playa del Carmen, Mexico).
- Number of companies invested in: 50+
- Decelera Ventures is managed by Decelera LLC, which oversees a portfolio spanning Europe and LATAM.

HOW WE INVEST — 5 PHASES:
1. Selection (up to 3 months): A rigorous process with 70+ industry experts and a top-tier investment team.
2. Decelera Program (7 days): Selected startups join a 7-day immersive program in Playa del Carmen, Mexico.
3. Final Decision (avg. 2 months): Final Due Diligence.
4. Investment: Companies where we find a clear match receive seed funding.
5. Post-investment: We act as a fourth founder with follow-on investments of up to $1M for top performers.

IMPORTANT RULES FOR ANSWERING:
- Be warm, concise, and encouraging — 2 to 4 sentences max.
- Always answer in the same language the user is writing in (Spanish or English).
- If you don't know something specific, say so honestly and suggest they email hola@decelera.com.
- After answering, gently nudge the applicant to continue with the form.
- Never make up numbers, dates, or details not listed above.
- Never use markdown formatting. No **bold**, no *italics*, no bullet points. Plain text only.
`;

export async function askDecelera(
  userMessage: string,
  context: { currentQuestion?: string; answeredCount?: number }
): Promise<string> {
  const systemPrompt = `${DECELERA_CONTEXT}

CURRENT CONTEXT:
- The applicant is filling out the Decelera LATAM 2026 application form.
- They are currently on the question: "${context.currentQuestion ?? 'the application form'}"
- They have answered ${context.answeredCount ?? 0} questions so far.`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 350,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const block = response.content[0];
  return block.type === 'text'
    ? block.text
    : 'No pude generar una respuesta. Continúa con el formulario cuando quieras.';
}

export interface ChatFormResult {
  isAnswer: boolean;
  extractedValue: unknown;
  ackMessage: string;
}

export async function chatFormTurn(
  userMessage: string,
  step: { id: string; question: string; type: string; options?: string[] },
  _answers: Record<string, unknown>,
  progress: { answered: number; total: number }
): Promise<ChatFormResult> {
  const optionsList = step.options?.length
    ? `Valid options are EXACTLY: ${step.options.map(o => `"${o}"`).join(', ')}. You MUST pick one of these exactly.`
    : '';

  const system = `You are a form assistant for Decelera Ventures' LATAM 2026 application form.
Your job: extract a structured answer from the user's free-form text for the current question.

CURRENT QUESTION: "${step.question}"
FIELD TYPE: ${step.type}
${optionsList}

RULES:
- If the user's text contains a valid answer to the question, extract it and return JSON with isAnswer=true.
- If the user is asking a question or saying something unrelated, return isAnswer=false with a helpful ackMessage.
- For select fields, the extracted value MUST be one of the valid options listed above.
- For number fields, extract only the numeric value (no currency symbols).
- For boolean fields, return true or false.
- The ackMessage should be warm and brief (1-2 sentences), confirming the answer or redirecting.
- Always respond in Spanish.
- Progress: ${progress.answered}/${progress.total} questions answered.

Respond with ONLY valid JSON: { "isAnswer": boolean, "extractedValue": any, "ackMessage": string }`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system,
    messages: [{ role: 'user', content: userMessage }],
  });

  const block = response.content[0];
  if (block.type !== 'text') {
    return { isAnswer: false, extractedValue: null, ackMessage: 'No pude procesar tu respuesta. Inténtalo de nuevo.' };
  }

  try {
    const jsonMatch = block.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const parsed = JSON.parse(jsonMatch[0]) as { isAnswer: boolean; extractedValue: unknown; ackMessage: string };
    return {
      isAnswer: Boolean(parsed.isAnswer),
      extractedValue: parsed.extractedValue ?? null,
      ackMessage: String(parsed.ackMessage ?? ''),
    };
  } catch {
    return { isAnswer: false, extractedValue: null, ackMessage: 'No pude entender tu respuesta. Por favor, usa las opciones del formulario.' };
  }
}
