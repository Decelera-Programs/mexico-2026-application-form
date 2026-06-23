// Shared types between frontend and backend

export type FieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'url'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'boolean'
  | 'statement';

export interface FlowCondition {
  fieldId: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'exists';
  value?: string | string[];
}

export interface FlowStep {
  id: string;
  type: FieldType;
  question: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  nextStep?: string | null;
  maxLength?: number;
  conditions?: {
    if: FlowCondition;
    then: string;
  }[];
  attioField?: string;
  attioObject?: 'people' | 'companies' | 'deals';
}

export interface FlowConfig {
  id: string;
  version: string;
  title: string;
  welcomeMessage: string;
  completionMessage: string;
  declineMessage: string;
  startStep: string;
  steps: Record<string, FlowStep>;
}

export interface ApplicationSession {
  id: string;
  flowId: string;
  flowVersion: string;
  currentStepId: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  answers: Record<string, unknown>;
  attioPersonId?: string;
  attioCompanyId?: string;
  syncedToAttio: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitAnswerPayload {
  sessionId: string;
  stepId: string;
  answer: unknown;
}

export interface SubmitAnswerResponse {
  nextStepId: string | null;
  session: ApplicationSession;
}
