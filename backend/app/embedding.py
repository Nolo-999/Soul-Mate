"""Embedding 封装（NVIDIA llama-nemotron-embed-vl-1b-v2）

非对称模型：
  - 存储时 input_type=passage
  - 查询时 input_type=query
降级策略：embedding 失败时返回空列表，不影响主流程。
"""
import logging

import httpx

from app.config import EMBED_BATCH_SIZE, EMBED_DIM, EMBED_MODEL, EMBED_TIMEOUT, NVIDIA_BASE, NVIDIA_KEY

logger = logging.getLogger("soulmate.embed")

# ─── 单例 HTTP 客户端（复用连接，避免每次新建） ───
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=EMBED_TIMEOUT)
    return _client


async def embed_texts(texts: list[str], *, input_type: str = "passage") -> list[list[float]]:
    """批量编码文本为向量。失败返回空列表（零风险降级）。

    Args:
        texts: 待编码文本列表
        input_type: "passage"（存储）或 "query"（检索）
    Returns:
        与 texts 等长的向量列表；失败时返回 [[]]
    """
    if not texts:
        return []

    all_vectors: list[list[float]] = []
    try:
        client = _get_client()
        # 分批编码，避免单次请求过大
        for i in range(0, len(texts), EMBED_BATCH_SIZE):
            batch = texts[i : i + EMBED_BATCH_SIZE]
            resp = await client.post(
                f"{NVIDIA_BASE}/embeddings",
                headers={
                    "Authorization": f"Bearer {NVIDIA_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": EMBED_MODEL,
                    "input": batch,
                    "input_type": input_type,
                },
            )
            resp.raise_for_status()
            data = resp.json()["data"]
            # 按 index 排序，确保顺序与输入一致
            all_vectors.extend([item["embedding"] for item in sorted(data, key=lambda x: x["index"])])
        return all_vectors
    except Exception as exc:
        logger.debug("embed call skipped: %s", exc)
        return []


async def embed_one(text: str, *, input_type: str = "passage") -> list[float]:
    """单条编码（便捷封装）。"""
    results = await embed_texts([text], input_type=input_type)
    return results[0] if results else []
