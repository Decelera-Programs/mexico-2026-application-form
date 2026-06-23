import type { FlowConfig, FlowStep, FlowCondition } from '../../../shared/types';

export interface HistoryEntry {
  stepId: string;
  question: string;
  answer: unknown;
  type: string;
}

function evaluateCondition(
  condition: FlowCondition,
  answers: Record<string, unknown>
): boolean {
  const value = answers[condition.fieldId];

  switch (condition.operator) {
    case 'equals':
      return String(value) === String(condition.value);
    case 'not_equals':
      return String(value) !== String(condition.value);
    case 'contains':
      return Array.isArray(value)
        ? value.includes(condition.value)
        : String(value).includes(String(condition.value));
    case 'not_contains':
      return Array.isArray(value)
        ? !value.includes(condition.value)
        : !String(value).includes(String(condition.value));
    case 'exists':
      return value !== undefined && value !== null && value !== '';
    default:
      return false;
  }
}

export function resolveNextStep(
  step: FlowStep,
  answers: Record<string, unknown>
): string | null {
  if (step.conditions) {
    for (const branch of step.conditions) {
      if (evaluateCondition(branch.if, answers)) {
        return branch.then;
      }
    }
  }
  return step.nextStep ?? null;
}

export function interpolateQuestion(
  question: string,
  answers: Record<string, unknown>
): string {
  return question.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    answers[key] !== undefined ? String(answers[key]) : `{{${key}}}`
  );
}

export function getStep(flow: FlowConfig, stepId: string): FlowStep | null {
  return flow.steps[stepId] ?? null;
}

export function buildHistory(
  flow: FlowConfig,
  answers: Record<string, unknown>
): HistoryEntry[] {
  const history: HistoryEntry[] = [];
  let currentId: string | null = flow.startStep;
  const visited = new Set<string>();

  while (currentId && currentId in answers && !visited.has(currentId)) {
    visited.add(currentId);
    const step = flow.steps[currentId];
    if (!step) break;

    history.push({
      stepId: currentId,
      question: interpolateQuestion(step.question, answers),
      answer: answers[currentId],
      type: step.type,
    });

    currentId = resolveNextStep(step, answers);
  }

  return history;
}
