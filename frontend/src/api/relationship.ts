import { API_BASE, JSON_HEADERS, handle } from './client';

const BASE = `${API_BASE}/relationship`;

export interface ProactiveDecisionRequest {
  intimacy: number;
  personaSetting: string;
  recentMessages: { role: 'user' | 'ai'; content: string }[];
  idleSeconds: number;
}

export interface ProactiveDecision {
  shouldInitiate: boolean;
  tone: 'reserved' | 'gentle' | 'warm';
  reason: string;
}

export async function decideProactiveMessage(payload: ProactiveDecisionRequest): Promise<ProactiveDecision> {
  return handle<ProactiveDecision>(
    await fetch(`${BASE}/proactive-decision`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        intimacy: payload.intimacy,
        persona_setting: payload.personaSetting,
        recent_messages: payload.recentMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        idle_seconds: payload.idleSeconds,
      }),
    }),
    '主动联系判定',
  );
}
