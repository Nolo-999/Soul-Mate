"""GLM-5.2 统一调用层（via OpenRouter）

替换原 memory_engine 中的 _ollama_generate，
降级策略不变：任何异常返回 None，绝不影响聊天。
"""
import json
import logging
import re

import httpx

from app.config import (
    OPENROUTER_BASE as LLM_BASE,
    OPENROUTER_KEY as LLM_KEY, LLM_MAX_TOKENS,
    LLM_MODEL, LLM_TIMEOUT,
)

logger = logging.getLogger("soulmate.llm")


async def llm_generate(prompt: str, *, temperature: float = 0.1,
                       max_tokens: int = LLM_MAX_TOKENS,
                       timeout: int = LLM_TIMEOUT) -> str | None:
    """调 OpenRouter GLM-5.2 生成文本；失败返回 None（零风险降级）。"""
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{LLM_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {LLM_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": LLM_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
    except Exception as exc:
        logger.debug("llm call skipped: %s", exc)
        return None


def extract_json_array(text: str) -> list | None:
    """从 LLM 输出中容错提取 JSON 数组。"""
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if not match:
        return None
    try:
        result = json.loads(match.group())
        return result if isinstance(result, list) else None
    except json.JSONDecodeError:
        return None


def extract_json_object(text: str) -> dict | None:
    """从 LLM 输出中容错提取 JSON 对象。"""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        result = json.loads(match.group())
        return result if isinstance(result, dict) else None
    except json.JSONDecodeError:
        return None
