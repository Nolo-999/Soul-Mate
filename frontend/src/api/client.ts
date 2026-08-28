/** 后端 API 基础地址（开发环境走 Vite 代理，部署环境默认同源） */
const configuredApiBase = import.meta.env.VITE_API_BASE?.trim();
export const API_BASE = (configuredApiBase || '/api/v1').replace(/\/$/, '');

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** 统一响应检查：非 2xx 抛错，2xx 返回解析后的 JSON */
export async function handle<T>(resp: Response, label: string): Promise<T> {
  if (!resp.ok) throw new Error(`${label} ${resp.status}`);
  return resp.json() as Promise<T>;
}

export { JSON_HEADERS };
