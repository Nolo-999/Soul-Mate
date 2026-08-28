"""记忆引擎：GLM-5.2 抽取 + NVIDIA embedding + Milvus 向量检索 + Neo4j 图谱

替换原版：Ollama 本地抽取 → OpenRouter GLM-5.2 云端抽取
新增：向量化写入 Milvus，三元组写入 Neo4j，混合召回
降级策略保持不变：任何外部服务不可用 → 静默降级，绝不影响聊天。
"""
import logging
import re
from datetime import datetime

from sqlalchemy.orm import Session

from app.config import EMBED_DIM
from app.models import MemoryUnit

logger = logging.getLogger("soulmate.memory")

VALID_CATEGORIES = {"fact", "preference", "event", "day", "emotion"}

# ─── 敏感信息过滤（保留原版正则）────
SENSITIVE_PATTERNS = [
    re.compile(r"\b\d{17}[\dXx]\b"),          # 身份证（18位）
    re.compile(r"\b\d{15}\b"),                # 旧版15位身份证
    re.compile(r"\b(?:1[3-9]\d)\d{8}\b"),     # 手机号（11位）
    re.compile(r"(?:密码|password|账号|卡号|cvv|验证码)", re.IGNORECASE),
]


# ═══════════════════════════════════════════════════════════════
# 提取 Prompt（GLM-5.2 升级：同时输出记忆 + 知识三元组）
# ═══════════════════════════════════════════════════════════════

EXTRACT_PROMPT = """你是记忆提取助手。从下面的对话里提取「值得长期记住的用户信息」，输出 JSON 对象，包含两部分。

输出格式：
{
  "memories": [
    {"content": "一句话，第三人称描述用户", "category": "类型", "importance": 1到5}
  ],
  "triples": [
    {"subject": "用户", "relation": "关系", "object": "实体"}
  ]
}

记忆类型（category）：
- fact: 客观事实（职业/城市/家庭/身体等）
- preference: 喜好或讨厌（食物/爱好/雷点）
- event: 近期发生的事/计划（面试/考试/旅行）
- day: 重要日子（生日/纪念日/截止日期）
- emotion: 强烈的情绪状态（持续低落/焦虑）

三元组规则（triples）：
- subject 一律写"用户"
- relation 用简短中文（就职于/喜欢/不喜欢/居住在/朋友/参加 等）
- object 是具体实体（公司名/食物名/地名/人名 等）
- 只提取对话中明确提到的，不推测

规则：日常寒暄不要提；单条不超过40字；最多提取5条记忆和5个三元组；只输出 JSON 不要解释。

对话：
{dialogue}"""

# 语义重排 Prompt（保留兼容性，Milvus 主力检索时作为辅助）
RERANK_PROMPT = """判断每条记忆与查询的相关性。输出 JSON 数组，每项 {{"id": 序号, "score": 0到10的整数}}。
判定标准：话题相同或语义相关才给高分；仅共享一个常见字词算低分。只输出 JSON。

查询：{query}
记忆列表：
{lines}"""

# 矛盾检测 Prompt（GLM-5.2 比 7B 更准）
CONFLICT_PROMPT = """判断「新记忆」是否与某条旧记忆互相矛盾（同一事实前后不一致：改口味、换计划、状态反转等）。
只是相关或可以共存的都不算矛盾。矛盾则输出矛盾的旧记忆编号数组（如 [3]），不矛盾输出 []。只输出 JSON。

新记忆：{new_text}

旧记忆：
{old_lines}"""

OLLAMA_RERANK_TIMEOUT = 45
RECALL_MIN_SCORE = 4


# ═══════════════════════════════════════════════════════════════
# 核心函数
# ═══════════════════════════════════════════════════════════════


def contains_sensitive(text: str) -> bool:
    """命中敏感信息 → 不落库"""
    return any(p.search(text) for p in SENSITIVE_PATTERNS)


async def extract_memories(dialogue: str) -> tuple[list[dict], list[dict]]:
    """GLM-5.2 抽取记忆 + 三元组。

    Returns:
        (memories, triples) 两个列表；任何失败返回 ([], [])
    """
    from app.llm_client import extract_json_object, llm_generate

    prompt = EXTRACT_PROMPT.format(dialogue=dialogue[-2000:])  # GLM-5.2 上下文大，多给一些
    raw = await llm_generate(prompt)
    if not raw:
        return [], []

    data = extract_json_object(raw)
    if not data:
        return [], []

    memories = _clean_memories(data.get("memories", []))
    triples = _clean_triples(data.get("triples", []))
    return memories, triples


def _clean_memories(items: list) -> list[dict]:
    """清洗并过滤提取出的记忆列表。"""
    cleaned: list[dict] = []
    for item in items[:5]:
        if not isinstance(item, dict):
            continue
        content = str(item.get("content", "")).strip()
        category = str(item.get("category", "fact")).strip()
        importance = int(item.get("importance", 3))

        if not content or len(content) > 80:
            continue
        if category not in VALID_CATEGORIES:
            category = "fact"
        importance = max(1, min(5, importance))
        if contains_sensitive(content):
            continue
        cleaned.append({"content": content, "category": category, "importance": importance})
    return cleaned


def _clean_triples(items: list) -> list[dict]:
    """清洗三元组列表。"""
    cleaned: list[dict] = []
    for item in items[:5]:
        if not isinstance(item, dict):
            continue
        subject = str(item.get("subject", "")).strip()
        relation = str(item.get("relation", "")).strip()
        obj = str(item.get("object", "")).strip()
        if not all([subject, relation, obj]):
            continue
        if contains_sensitive(obj):
            continue
        cleaned.append({"subject": subject, "relation": relation, "object": obj})
    return cleaned


# ═══════════════════════════════════════════════════════════════
# 保存 + 矛盾检测
# ═══════════════════════════════════════════════════════════════


async def detect_conflicts(new_items: list[dict], db: Session) -> dict[int, int | None]:
    """新旧矛盾检测。返回 {旧记忆id: 新记忆序号}。"""
    from app.llm_client import extract_json_array, llm_generate

    actives = (
        db.query(MemoryUnit)
        .filter(MemoryUnit.forgotten.is_(False), MemoryUnit.archived.is_(False))
        .order_by(MemoryUnit.created_at.desc())
        .limit(20)
        .all()
    )
    if not actives:
        return {}

    old_lines = "\n".join(f"{m.id}. {m.content}" for m in actives)
    result: dict[int, int | None] = {}
    for idx, item in enumerate(new_items):
        raw = await llm_generate(
            CONFLICT_PROMPT.format(new_text=item["content"], old_lines=old_lines),
        )
        if not raw:
            continue
        logger.debug("conflict-detect[%s] raw: %r", item["content"], raw[:120])
        ids = extract_json_array(raw)
        if ids is None:
            continue
        for old_id in ids:
            try:
                oid = int(old_id)
            except (TypeError, ValueError):
                continue
            if oid in {m.id for m in actives} and oid not in result:
                result[oid] = idx
    return result


async def save_extracted(db: Session, items: list[dict], source_msg: str = "",
                         triples: list[dict] | None = None) -> tuple[list[MemoryUnit], list[int]]:
    """保存提取的记忆（SQLite + Milvus + Neo4j），并处理矛盾覆盖。

    Returns:
        (新保存的记忆列表, 被覆盖的旧记忆id列表)
    """
    from datetime import datetime as _dt

    from app.embedding import embed_one
    from app.milvus_client import upsert_memory as milvus_upsert

    if not items:
        return [], []

    conflicts = await detect_conflicts(items, db)
    logger.debug("save_extracted: items=%r conflicts=%r", [i["content"] for i in items], conflicts)

    existing = {re.sub(r"\s+", "", m.content) for m in db.query(MemoryUnit).all()}
    saved: list[MemoryUnit] = []
    superseded_ids: list[int] = []

    for item in items:
        key = re.sub(r"\s+", "", item["content"])
        if key in existing:
            continue

        mem = MemoryUnit(
            content=item["content"],
            category=item["category"],
            importance=item["importance"],
            source_msg=source_msg,
        )
        db.add(mem)
        db.flush()  # 拿到 mem.id

        # 写入 Milvus 向量
        try:
            embedding = await embed_one(item["content"], input_type="passage")
            if embedding:
                milvus_upsert(
                    memory_id=mem.id,
                    content=item["content"],
                    category=item["category"],
                    created_at=mem.created_at,
                    embedding=embedding,
                )
        except Exception as exc:
            logger.debug("milvus upsert skipped: %s", exc)

        saved.append(mem)
        existing.add(key)

    # 处理矛盾覆盖
    for old_id, new_idx in conflicts.items():
        old_mem = db.get(MemoryUnit, old_id)
        if old_mem and old_mem not in saved:
            old_mem.superseded_by = saved[new_idx].id if new_idx is not None and new_idx < len(saved) else None
            superseded_ids.append(old_id)

    # 写入 Neo4j 三元组
    if triples:
        try:
            from app.neo4j_client import ensure_user_node, upsert_triple
            ensure_user_node("default", "用户")
            for t in triples:
                upsert_triple("default", t["subject"], t["relation"], t["object"])
        except Exception as exc:
            logger.debug("neo4j upsert skipped: %s", exc)

    db.commit()
    return saved, superseded_ids


# ═══════════════════════════════════════════════════════════════
# 召回（Milvus 向量为主 + SQLite 时序兜底）
# ═══════════════════════════════════════════════════════════════


def recall_memories(db: Session, query: str, top_k: int = 3) -> list[MemoryUnit]:
    """混合召回：Milvus 向量检索 → SQLite 时序兜底。

    向量检索不可用时自动降级为纯 SQLite 召回（和原版一致）。
    """
    # 优先尝试 Milvus 向量检索
    vector_ids = _recall_vector(query, top_k=top_k)
    if vector_ids:
        mems = db.query(MemoryUnit).filter(MemoryUnit.id.in_(vector_ids)).all()
        if mems:
            # 保持向量检索的排序
            id_order = {mid: i for i, mid in enumerate(vector_ids)}
            mems.sort(key=lambda m: id_order.get(m.id, 999))
            return mems

    # 降级：SQLite 时序召回（和原版逻辑一致）
    return _recall_sqlite_fallback(db, top_k)


def _recall_vector(query: str, top_k: int = 10) -> list[int]:
    """Milvus 向量检索，返回 memory_id 列表。"""
    try:
        from app.embedding import embed_one
        from app.milvus_client import search_similar

        query_vec = embed_one(query, input_type="query")
        if not query_vec:
            return []

        hits = search_similar(query_vec, top_k=top_k)
        return [h["memory_id"] for h in hits if h.get("memory_id") is not None]
    except Exception as exc:
        logger.debug("vector recall failed: %s", exc)
        return []


def _recall_sqlite_fallback(db: Session, top_k: int) -> list[MemoryUnit]:
    """SQLite 时序召回兜底（置顶优先 + 时间衰减）。"""
    return (
        db.query(MemoryUnit)
        .filter(MemoryUnit.forgotten.is_(False), MemoryUnit.archived.is_(False))
        .order_by(MemoryUnit.pinned.desc(), MemoryUnit.created_at.desc())
        .limit(top_k)
        .all()
    )
