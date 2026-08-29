import { API_BASE, JSON_HEADERS, handle } from './client';
import type { ReplyStyle } from '../stores/settings';
import type { ChatEmotion } from '../constants/chat';

const BASE = `${API_BASE}/chat`;

export interface AgentReplyRequest {
  message: string;
  intimacy: number;
  personaName: string;
  personaSetting: string;
  replyStyle: ReplyStyle;
  history: { role: 'user' | 'ai'; content: string }[];
}

export interface AgentReply {
  reply: string;
  emotion: ChatEmotion;
  intimacyDelta: number;
  usedFallback: boolean;
}

export async function requestAgentReply(payload: AgentReplyRequest): Promise<AgentReply> {
  const data = await handle<{
    reply: string;
    emotion: ChatEmotion;
    intimacy_delta: number;
    used_fallback: boolean;
  }>(
    await fetch(`${BASE}/reply`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        message: payload.message,
        intimacy: payload.intimacy,
        persona_name: payload.personaName,
        persona_setting: payload.personaSetting,
        reply_style: payload.replyStyle,
        history: payload.history,
      }),
    }),
    '关系 Agent',
  );
  return {
    reply: data.reply,
    emotion: data.emotion,
    intimacyDelta: data.intimacy_delta,
    usedFallback: data.used_fallback,
  };
}
