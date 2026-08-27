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

# 语义重排（优化#1）：让"面试"能召回"求职"这类不同词同义的记忆
RERANK_PROMPT = """判断每条记忆与查询的相关性。输出 JSON 数组，每项 {{"id": 序号, "score": 0到10的整数}}。
判定标准：话题相同或语义相关才给高分；仅共享一个常见字词算低分。只输出 JSON。

查询：{query}
记忆列表：
{lines}"""

# 矛盾检测（优化#2）：用户改口时新记忆覆盖旧的。
# 逐条询问式：一次只判一条新记忆（7B 小模型对复杂多对象输出容易失手），
# 新旧配对由代码构造，天然无歧义
CONFLICT_PROMPT = """判断「新记忆」是否与某条旧记忆互相矛盾（同一事实前后不一致：改口味、换计划、状态反转等）。
只是相关或可以共存的都不算矛盾。矛盾则输出矛盾的旧记忆编号数组（如 [3]），不矛盾输出 []。只输出 JSON。

新记忆：{new_text}

旧记忆：
{old_lines}"""

OLLAMA_RERANK_TIMEOUT = 45  # 重排/冲突判定输入较大，放宽超时；超时走降级不影响主流程
RECALL_MIN_SCORE = 4        # 语义重排的相关性阈值（0~10）：低于视为不相关，直接不召回


async def _ollama_generate(prompt: str, timeout: int = OLLAMA_TIMEOUT) -> str | None:
    """调 Ollama 生成文本；任何失败返回 None（调用方自行零风险降级）。"""
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{OLLAMA_BASE}/api/generate",
                json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False,
                      "options": {"temperature": 0.1}},
            )
            resp.raise_for_status()
            return resp.json().get("response", "")
    except Exception as exc:  # noqa: BLE001 —— 降级是设计行为
        logger.warning("ollama call skipped: %s", exc)
        return None


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
    raw = await _ollama_generate(prompt)
    if not raw:
        return []

    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if not match:
        return []
    try:
        items = json.loads(match.group())
    except json.JSONDecodeError:
        logger.warning("extract output is not valid JSON")
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
    """召回：关键词粗筛 → 时间/重要性/置顶加权 → LLM 语义重排（失败自动退回纯关键词序）"""
    q_tokens = tokenize(query)
    all_active = (
        db.query(MemoryUnit)
        .filter(MemoryUnit.forgotten.is_(False), MemoryUnit.archived.is_(False))
        .all()
    )
    if not all_active:
        return []

    if len(all_active) <= 30:
        # 小规模库：跳过关键词门槛，全量交给 LLM 语义重排（同义词也能召回）
        scored = [(_base_weight(m), m) for m in all_active]
    else:
        # 大规模库：先用关键词粗筛压缩候选池
        scored = []
        for mem in all_active:
            overlap = len(q_tokens & tokenize(mem.content))
            if overlap == 0:
                continue
            scored.append((overlap * _base_weight(mem), mem))

    if not scored:
        return []

    scored.sort(key=lambda pair: pair[0], reverse=True)
    rough = [mem for _, mem in scored[:max(top_k * 3, 6)]]  # 粗筛候选池

    # LLM 语义重排（优化#1）：失败则保持粗筛顺序，零风险降级
    reranked = _rerank_sync(query, rough)
    return reranked[:top_k]


def _base_weight(mem: MemoryUnit) -> float:
    """与关键词无关的权重：置顶 × 时间衰减 × 重要性

    时间衰减（优化#4 细化）：
    - day 类（生日/纪念日）永不淡忘
    - 置顶记忆衰减减半（用户在乎的事记得更牢）
    - 下限 0.15，老朋友的事不会彻底消失
    """
    decay = max(0.0, 1.0 - 0.05 * days_since(mem.created_at))
    if mem.category != "day":
        if mem.pinned:
            decay = max(decay, 0.5)
        else:
            decay = max(0.15, decay)
    else:
        decay = 1.0
    return (2.0 if mem.pinned else 1.0) * decay * (0.8 + 0.1 * mem.importance)


def _rerank_sync(query: str, candidates: list[MemoryUnit]) -> list[MemoryUnit]:
    """同步封装的语义重排；Ollama 不可用时原样返回候选。"""
    import asyncio

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # 在事件循环内被调用时退化为线程执行，避免嵌套 await
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, _rerank(query, candidates)).result(timeout=40)
    return asyncio.run(_rerank(query, candidates))


async def _rerank(query: str, candidates: list[MemoryUnit]) -> list[MemoryUnit]:
    """qwen 给每条候选打相关性分（0~10），按分排序。"""
    lines = "\n".join(f"{i}. {m.content}" for i, m in enumerate(candidates))
    raw = await _ollama_generate(
        RERANK_PROMPT.format(query=query[:200], lines=lines),
        timeout=OLLAMA_RERANK_TIMEOUT,
    )
    if not raw:
        return candidates  # 降级：保持粗筛顺序

    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if not match:
        return candidates
    try:
        scores = json.loads(match.group())
    except json.JSONDecodeError:
        return candidates

    score_map: dict[int, int] = {}
    for item in scores:
        if isinstance(item, dict) and "id" in item:
            try:
                idx = int(item["id"])
                score_map[idx] = max(0, min(10, int(item.get("score", 0))))
            except (TypeError, ValueError):
                continue

    ranked = sorted(
        range(len(candidates)),
        key=lambda i: score_map.get(i, 0),
        reverse=True,
    )
    # 相关性阈值过滤（优化#1）：低分尾巴不召回，避免无关查询硬凑结果
    return [candidates[i] for i in ranked if score_map.get(i, 0) >= RECALL_MIN_SCORE]


async def save_extracted(db: Session, items: list[dict], source_msg: str):
    """候选入库 + 矛盾覆盖。

    流程：先对全量候选做矛盾判定（改口即使措辞相似也不是"重复"，必须参与比对），
    再对未产生冲突覆盖的候选做精确去重入库。
    返回 (保存的新记忆列表, 被覆盖的旧记忆id列表)。
    """
    conflicts = await detect_conflicts(items, db)  # {旧记忆id: 新记忆序号}
    logger.warning("save_extracted: items=%r conflicts=%r", [i["content"] for i in items], conflicts)

    existing = {re.sub(r"\s+", "", m.content) for m in db.query(MemoryUnit).all()}
    saved: list[tuple[int, MemoryUnit]] = []
    superseded_ids: list[int] = []
    covered_new_idx: set[int] = set(conflicts.values())

    for idx, item in enumerate(items):
        key = re.sub(r"\s+", "", item["content"])
        # 精确重复跳过；但如果它是覆盖旧记忆的那条新认知，即使近似重复也要入库
        if key in existing and idx not in covered_new_idx:
            continue
        mem = MemoryUnit(**item, source_msg=source_msg[:200])
        db.add(mem)
        db.flush()  # 拿到自增 id，供 superseded_by 回填
        existing.add(key)
        saved.append((idx, mem))

    for old_id, new_idx in conflicts.items():
        old = db.get(MemoryUnit, old_id)
        new_mem = (
            next((m for i, m in saved if i == new_idx), None)
            if new_idx is not None else None
        )
        if old and not old.forgotten:
            old.archived = True          # 不物理删除，可追溯
            if new_mem:
                old.superseded_by = new_mem.id
            superseded_ids.append(old_id)

    if saved or superseded_ids:
        db.commit()
    return [m for _, m in saved], superseded_ids


async def detect_conflicts(new_items: list[dict], db: Session) -> dict[int, int | None]:
    """LLM 判断新旧记忆是否互相矛盾（优化#2，逐条询问式）。
    返回 {被覆盖的旧记忆id: 覆盖它的新记忆序号或None}；Ollama 不可用返回空。"""
    if not new_items:
        return {}
    actives = (
        db.query(MemoryUnit)
        .filter(MemoryUnit.forgotten.is_(False))
        .order_by(MemoryUnit.created_at.desc())
        .limit(30)  # 控制比对规模
        .all()
    )
    if not actives:
        return {}

    old_lines = "\n".join(f"{m.id}. {m.content}" for m in actives)
    result: dict[int, int | None] = {}
    for idx, item in enumerate(new_items):
        raw = await _ollama_generate(
            CONFLICT_PROMPT.format(new_text=item["content"], old_lines=old_lines),
            timeout=OLLAMA_RERANK_TIMEOUT,
        )
        if not raw:
            continue
        logger.warning("conflict-detect[%s] raw: %r", item["content"], raw[:120])
        match = re.search(r"\[[^\]]*\]", raw, re.DOTALL)
        if not match:
            logger.warning("conflict-detect: no JSON array: %r", raw[:120])
            continue
        try:
            ids = json.loads(match.group())
        except json.JSONDecodeError:
            logger.warning("conflict-detect: invalid JSON: %r", raw[:120])
            continue
        if not isinstance(ids, list):
            continue
        for old_id in ids:
            try:
                oid = int(old_id)
            except (TypeError, ValueError):
                continue
            if oid in {m.id for m in actives} and oid not in result:
                result[oid] = idx  # 新记忆序号由代码构造，无歧义
    return result
