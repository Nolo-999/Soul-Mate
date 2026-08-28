"""LLM 统一调用层（NVIDIA API · DeepSeek-V4-Pro）

降级策略：任何异常返回 None，绝不影响聊天。
DeepSeek-V4-Pro 是推理模型，生成较慢，timeout 设 120s。
"""
import json
import logging
import re

import httpx

from app.config import NVIDIA_BASE, NVIDIA_KEY, LLM_MAX_TOKENS, LLM_MODEL

logger = logging.getLogger("soulmate.llm")

# 推理模型生成慢，给足时间
LLM_TIMEOUT = 120


async def llm_generate(prompt: str, *, temperature: float = 0.1,
                       max_tokens: int = LLM_MAX_TOKENS,
                       timeout: int = LLM_TIMEOUT) -> str | None:
    """调 NVIDIA API DeepSeek-V4-Pro 生成文本；失败返回 None（零风险降级）。"""
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{NVIDIA_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {NVIDIA_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": LLM_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": temperature,
                    "top_p": 0.95,
                    "max_tokens": max_tokens,
                },
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
    except Exception as exc:
        logger.debug("llm call failed: %s", exc)
        return None


def extract_json_object(text: str) -> dict | None:
    """从 LLM 输出中容错提取 JSON 对象（支持 markdown 代码块包裹）。"""
    cleaned = re.sub(r"```(?:json)?\s*", "", text).strip()
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        return None
    try:
        result = json.loads(match.group())
        return result if isinstance(result, dict) else None
    except json.JSONDecodeError:
        return None


def extract_json_array(text: str) -> list | None:
    """从 LLM 输出中容错提取 JSON 数组（支持 markdown 代码块包裹）。"""
    cleaned = re.sub(r"```(?:json)?\s*", "", text).strip()
    match = re.search(r"\[.*\]", cleaned, re.DOTALL)
    if not match:
        return None
    try:
        result = json.loads(match.group())
        return result if isinstance(result, list) else None
    except json.JSONDecodeError:
        return None
