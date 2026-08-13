import { ApplyFormData, IdentityVerifyData } from '../types/apply';

export const PROTOCOL_TAG = 'RHF-SUBMIT-V1';
export const PROTOCOL_BEGIN = `===${PROTOCOL_TAG}-BEGIN===`;
export const PROTOCOL_END = `===${PROTOCOL_TAG}-END===`;

export interface SubmitPayload {
  submitId: string;
  serviceType: string;
  formData: ApplyFormData;
  verifyData: IdentityVerifyData;
  attachmentNames: {
    applicationForm?: string;
    disclaimer?: string;
    businessLicense?: string;
    identityCard?: string;
  };
  submittedAt: string;
}

export function buildSubmitSubject(payload: SubmitPayload): string {
  return `【客户服务申请】${payload.submitId} - ${payload.serviceType}`;
}

export function encodeSubmitBody(payload: SubmitPayload): string {
  const cleaned = { ...payload, attachmentNames: payload.attachmentNames || {} };
  return `${PROTOCOL_BEGIN}\n${JSON.stringify(cleaned)}\n${PROTOCOL_END}`;
}

export function parseSubmitBody(body: string): SubmitPayload | null {
  const begin = body.indexOf(PROTOCOL_BEGIN);
  const end = body.indexOf(PROTOCOL_END);
  if (begin === -1 || end === -1 || end <= begin) return null;
  const json = body.slice(begin + PROTOCOL_BEGIN.length, end).trim();
  try {
    const parsed = JSON.parse(json);
    if (!parsed.submitId || !parsed.serviceType || !parsed.formData) return null;
    return parsed as SubmitPayload;
  } catch {
    return null;
  }
}

export function extractSubmitIdFromSubject(subject: string): string | null {
  const m = subject.match(/RHF-\d{8}-\d{4}/);
  return m ? m[0] : null;
}

export function generateSubmitId(): string {
  return `RHF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
}
