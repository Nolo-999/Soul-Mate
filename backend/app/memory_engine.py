"""记忆提取引擎：Ollama 本地抽取 + 敏感过滤 + 去重

降级策略：Ollama 不可用 / 超时 / 输出异常 → 返回空列表，绝不抛错影响聊天。
"""
import json
import logging
import re
from datetime import datetime

import httpx
from sqlalchemy.orm import Session

from app.models import MemoryUnit

logger = logging.getLogger("soulmate.memory")

OLLAMA_BASE = "http://127.0.0.1:11434"
OLLAMA_MODEL = "qwen2.5:7b"
OLLAMA_TIMEOUT = 30  # 秒；7B 模型 CPU 也可能跑，放宽一点

VALID_CATEGORIES = {"fact", "preference", "event", "day", "emotion"}

# ---- 敏感信息过滤（初版正则；优化路线 #8 后续加 LLM 复核）----
SENSITIVE_PATTERNS = [
    re.compile(r"\b\d{17}[\dXx]\b"),          # 身份证（18位）
    re.compile(r"\b\d{15}\b"),                # 旧版15位身份证
    re.compile(r"\b(?:1[3-9]\d)\d{8}\b"),     # 手机号（11位）
    re.compile(r"(?:密码|password|账号|卡号|cvv|验证码)", re.IGNORECASE),
]

EXTRACT_PROMPT = """你是记忆提取助手。从下面的对话里提取「值得长期记住的用户信息」，输出 JSON 数组，没有就输出 []。

只提取这几类：
- fact: 客观事实（职业/城市/家庭/身体等）
- preference: 喜好或讨厌（食物/爱好/雷点）
- event: 近期发生的事/计划（面试/考试/旅行）
- day: 重要日子（生日/纪念日/截止日期）
- emotion: 强烈的情绪状态（持续低落/焦虑）

每条格式：{{"content": "一句话，第三人称描述用户", "category": "类型", "importance": 1到5}}
规则：日常寒暄不要提；单条不超过40字；最多5条；只输出 JSON 不要解释。

对话：
{dialogue}"""


def contains_sensitive(text: str) -> bool:
    """命中敏感信息（身份证/手机号/密码类词）→ 不落库"""
    return any(p.search(text) for p in SENSITIVE_PATTERNS)


def _dedupe_texts(texts: list[str]) -> list[str]:
    seen, out = set(), []
    for t in texts:
        key = re.sub(r"\s+", "", t)
        if key and key not in seen:
            seen.add(key)
            out.append(t)
    return out


async def extract_memories(dialogue: str) -> list[dict]:
    """调 Ollama 抽取候选记忆。任何失败 → 空列表（静默降级）。"""
    prompt = EXTRACT_PROMPT.format(dialogue=dialogue[-1500:])  # 截断防超长
    try:
        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
            resp = await client.post(
                f"{OLLAMA_BASE}/api/generate",
                json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False,
                      "options": {"temperature": 0.1}},
            )
            resp.raise_for_status()
        raw = resp.json().get("response", "")
        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if not match:
            return []
        items = json.loads(match.group())
    except Exception as exc:  # noqa: BLE001 —— 降级是设计行为
        logger.warning("memory extraction skipped: %s", exc)
        return []

    cleaned: list[dict] = []
    for item in items[:5]:
        if not isinstance(item, dict):
            continue
        content = str(item.get("content", "")).strip()[:120]
        if len(content) < 2 or contains_sensitive(content) or contains_sensitive(dialogue):
            continue
        category = str(item.get("category", "fact"))
        if category not in VALID_CATEGORIES:
            category = "fact"
        try:
            importance = max(1, min(5, int(item.get("importance", 3))))
        except (TypeError, ValueError):
            importance = 3
        cleaned.append({"content": content, "category": category, "importance": importance})
    return _dedupe_dicts(cleaned)


def _dedupe_dicts(items: list[dict]) -> list[dict]:
    seen, out = set(), []
    for it in items:
        key = re.sub(r"\s+", "", it["content"])
        if key not in seen:
            seen.add(key)
            out.append(it)
    return out


# ---- 召回 ----

STOPWORDS = {"的", "了", "吗", "呢", "啊", "我", "你", "他", "她", "在",
             "有", "和", "是", "就", "不", "都", "一", "一个", "什么"}


def tokenize(text: str) -> set[str]:
    """初版分词：去停用词的 2-gram + 数字/字母串（优化路线 #1 换语义检索）"""
    text = re.sub(r"[^\w\u4e00-\u9fff]", " ", text.lower())
    tokens: set[str] = set()
    for chunk in text.split():
        if chunk.isdigit() or chunk.isascii():
            tokens.add(chunk)
        elif len(chunk) >= 2:
            tokens.update(chunk[i:i + 2] for i in range(len(chunk) - 1))
    return {t for t in tokens if t not in STOPWORDS}


def days_since(dt: datetime) -> float:
    return (datetime.now() - dt).total_seconds() / 86400


def recall_memories(db: Session, query: str, top_k: int = 3) -> list[MemoryUnit]:
    """召回：关键词重合 × 置顶加成 × 时间衰减（优化路线 #4 的初版形态）"""
    q_tokens = tokenize(query)
    candidates = (
        db.query(MemoryUnit)
        .filter(MemoryUnit.forgotten.is_(False), MemoryUnit.archived.is_(False))
        .all()
    )
    scored: list[tuple[float, MemoryUnit]] = []
    for mem in candidates:
        overlap = len(q_tokens & tokenize(mem.content))
        if overlap == 0:
            continue
        score = overlap * (2.0 if mem.pinned else 1.0)
        score *= max(0.3, 1.0 - 0.05 * days_since(mem.created_at))  # 越久越淡
        score *= 0.8 + 0.1 * mem.importance
        scored.append((score, mem))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [mem for _, mem in scored[:top_k]]


def save_extracted(db: Session, items: list[dict], source_msg: str) -> list[MemoryUnit]:
    """候选入库：与已有记忆内容相同则跳过（简单去重；优化路线 #2 矛盾覆盖后续做）"""
    saved = []
    existing = {re.sub(r"\s+", "", m.content) for m in db.query(MemoryUnit).all()}
    for item in items:
        key = re.sub(r"\s+", "", item["content"])
        if key in existing:
            continue
        mem = MemoryUnit(**item, source_msg=source_msg[:200])
        db.add(mem)
        existing.add(key)
        saved.append(mem)
    if saved:
        db.commit()
    return saved
