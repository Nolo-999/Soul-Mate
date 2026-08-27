/**
 * 记忆模块 API 客户端
 * 对应 backend /api/v1/memories
 */
import { API_BASE, JSON_HEADERS, handle } from './client';

const BASE = `${API_BASE}/memories`;

export interface MemoryItem {
  id: number;
  content: string;
  category: 'fact' | 'preference' | 'event' | 'day' | 'emotion';
  importance: number;
  pinned: boolean;
  archived: boolean;
  forgotten: boolean;
  source_msg: string;
  created_at: string | null;
}

/** 记忆列表（status: active/archived/forgotten/all） */
export async function listMemories(status: 'active' | 'archived' | 'forgotten' | 'all' = 'active'): Promise<MemoryItem[]> {
  const data = await handle<{ items: MemoryItem[] }>(
    await fetch(`${BASE}?status=${status}`), '记忆列表',
  );
  return data.items;
}

/** 召回与查询相关的 Top-K 记忆 */
export async function recallMemories(q: string, topK = 3): Promise<MemoryItem[]> {
  const data = await handle<{ items: MemoryItem[] }>(
    await fetch(`${BASE}/recall?q=${encodeURIComponent(q)}&top_k=${topK}`), '记忆召回',
  );
  return data.items;
}

/** 从对话文本提取记忆（fire-and-forget 用，失败静默） */
export async function extractMemories(dialogue: string, sourceMsg: string): Promise<void> {
  try {
    await fetch(`${BASE}/extract`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ dialogue, source_msg: sourceMsg }),
    });
  } catch {
    // 提取失败不影响聊天体验
  }
}

/** 手动新增 */
export async function createMemory(content: string): Promise<MemoryItem> {
  return handle<MemoryItem>(
    await fetch(BASE, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ content }) }), '记忆新增',
  );
}

/** 置顶/归档/遗忘/编辑 */
export async function patchMemory(id: number, patch: Partial<Pick<MemoryItem, 'pinned' | 'archived' | 'forgotten' | 'content'>>): Promise<void> {
  await handle(
    await fetch(`${BASE}/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(patch) }), '记忆更新',
  );
}

/** 物理删除 */
export async function deleteMemory(id: number): Promise<void> {
  await handle(await fetch(`${BASE}/${id}`, { method: 'DELETE' }), '记忆删除');
}
