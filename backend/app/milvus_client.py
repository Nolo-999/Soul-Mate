"""Milvus 向量库客户端

负责：
  - Collection 创建（首次自动建）
  - 向量写入（upsert）
  - 向量检索（余弦相似度 Top-K）
  - 向量删除
降级策略：Milvus 不可用时所有操作静默失败，不影响聊天。
"""
import logging
from datetime import datetime

from app.config import EMBED_DIM, MILVUS_COLLECTION, MILVUS_HOST, MILVUS_PORT

logger = logging.getLogger("soulmate.milvus")

# ─── 懒加载连接 ───
_connector = None


def _get_connector():
    """首次调用时连接 Milvus；失败则 logger.warning 并返回 None。"""
    global _connector
    if _connector is not None:
        return _connector
    try:
        from pymilvus import connections
        connections.connect(alias="default", host=MILVUS_HOST, port=MILVUS_PORT)
        _connector = connections
        logger.info("Milvus connected: %s:%s", MILVUS_HOST, MILVUS_PORT)
        return _connector
    except Exception as exc:
        logger.debug("Milvus unavailable: %s", exc)
        return None


def ensure_collection():
    """确保 Milvus collection 存在；不存在则自动创建。"""
    conn = _get_connector()
    if conn is None:
        return False
    try:
        from pymilvus import Collection, CollectionSchema, DataType, FieldSchema
        if MILVUS_COLLECTION in [c.name for c in conn.list_collections()]:
            return True
        fields = [
            FieldSchema("id", DataType.INT64, is_primary=True, auto_id=True),
            FieldSchema("memory_id", DataType.INT64),
            FieldSchema("content", DataType.VARCHAR, max_length=500),
            FieldSchema("category", DataType.VARCHAR, max_length=20),
            FieldSchema("created_at", DataType.INT64),
            FieldSchema("embedding", DataType.FLOAT_VECTOR, dim=EMBED_DIM),
        ]
        schema = CollectionSchema(fields, description="SoulMate memory vectors")
        col = Collection(MILVUS_COLLECTION, schema)
        # 创建 IVF_FLAT 索引（余弦相似度）
        col.create_index(
            "embedding",
            {"index_type": "IVF_FLAT", "metric_type": "COSINE", "params": {"nlist": 128}},
        )
        logger.info("Milvus collection created: %s", MILVUS_COLLECTION)
        return True
    except Exception as exc:
        logger.debug("ensure_collection failed: %s", exc)
        return False


def upsert_memory(memory_id: int, content: str, category: str,
                  created_at: datetime | None, embedding: list[float]) -> bool:
    """写入单条记忆向量。成功返回 True。"""
    conn = _get_connector()
    if conn is None:
        return False
    try:
        from pymilvus import Collection
        col = Collection(MILVUS_COLLECTION)
        ts = int(created_at.timestamp()) if created_at else int(datetime.now().timestamp())
        col.insert([[memory_id], [content], [category], [ts], [embedding]])
        return True
    except Exception as exc:
        logger.debug("upsert_memory failed: %s", exc)
        return False


def search_similar(query_embedding: list[float], *, top_k: int = 10,
                   category_filter: str | None = None) -> list[dict]:
    """向量相似度检索。返回 [{memory_id, content, category, score}]。"""
    conn = _get_connector()
    if conn is None:
        return []
    try:
        from pymilvus import Collection
        col = Collection(MILVUS_COLLECTION)
        col.load()
        params = {"metric_type": "COSINE", "params": {"nprobe": 16}}
        expr = f'category == "{category_filter}"' if category_filter else None
        results = col.search(
            data=[query_embedding],
            anns_field="embedding",
            param=params,
            limit=top_k,
            expr=expr,
            output_fields=["memory_id", "content", "category", "created_at"],
        )
        hits = []
        for hit in results[0]:
            hits.append({
                "memory_id": hit.entity.get("memory_id"),
                "content": hit.entity.get("content"),
                "category": hit.entity.get("category"),
                "created_at": hit.entity.get("created_at"),
                "score": hit.score,
            })
        return hits
    except Exception as exc:
        logger.debug("search_similar failed: %s", exc)
        return []


def delete_memory(memory_id: int) -> bool:
    """删除单条记忆向量。"""
    conn = _get_connector()
    if conn is None:
        return False
    try:
        from pymilvus import Collection
        col = Collection(MILVUS_COLLECTION)
        col.delete(f'memory_id == {memory_id}')
        return True
    except Exception as exc:
        logger.debug("delete_memory failed: %s", exc)
        return False
