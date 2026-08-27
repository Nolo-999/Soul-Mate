/** 后端 API 基础地址（唯一出处，改端口只动这里） */
export const API_BASE = 'http://127.0.0.1:8000/api/v1';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** 统一响应检查：非 2xx 抛错，2xx 返回解析后的 JSON */
export async function handle<T>(resp: Response, label: string): Promise<T> {
  if (!resp.ok) throw new Error(`${label} ${resp.status}`);
  return resp.json() as Promise<T>;
}

export { JSON_HEADERS };
