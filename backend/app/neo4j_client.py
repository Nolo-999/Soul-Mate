"""Neo4j 图库客户端

负责：
  - 用户/实体节点创建
  - 关系写入（三元组）
  - 图谱查询（2跳内邻居）
降级策略：Neo4j 不可用时所有操作静默失败，不影响聊天。
"""
import logging

from app.config import NEO4J_PASSWORD, NEO4J_URI, NEO4J_USER

logger = logging.getLogger("soulmate.neo4j")

# ─── 懒加载驱动 ───
_driver = None


def _get_driver():
    """首次调用时创建 Neo4j driver；失败返回 None。"""
    global _driver
    if _driver is not None:
        return _driver
    try:
        from neo4j import GraphDatabase
        _driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        _driver.verify_connectivity()
        logger.info("Neo4j connected: %s", NEO4J_URI)
        return _driver
    except Exception as exc:
        logger.debug("Neo4j unavailable: %s", exc)
        return None


def ensure_user_node(user_id: str, name: str) -> bool:
    """确保用户节点存在。"""
    driver = _get_driver()
    if driver is None:
        return False
    try:
        with driver.session() as session:
            session.run(
                "MERGE (u:User {id: $id}) SET u.name = $name",
                id=user_id, name=name,
            )
        return True
    except Exception as exc:
        logger.debug("ensure_user_node failed: %s", exc)
        return False


def upsert_triple(user_id: str, subject: str, relation: str, obj: str) -> bool:
    """写入一个三元组（用户→关系→实体）。

    关系类型由 relation 字符串映射为 Neo4j 大写蛇形标签。
    未知关系统一用 RELATED_TO。
    """
    driver = _get_driver()
    if driver is None:
        return False

    # 标准化关系名
    rel_type = _normalize_relation(relation)
    query = f"""
        MERGE (u:User {{id: $user_id}})
        MERGE (e:Entity {{name: $obj}})
        MERGE (u)-[r:{rel_type}]->(e)
        SET r.evidence = $relation, r.updated_at = timestamp()
    """
    try:
        with driver.session() as session:
            session.run(query, user_id=user_id, obj=obj, relation=relation)
        return True
    except Exception as exc:
        logger.debug("upsert_triple failed: %s", exc)
        return False


def get_neighbors(user_id: str, *, max_hops: int = 2, limit: int = 20) -> list[dict]:
    """查询用户图谱中 2 跳内的实体邻居。

    返回 [{entity, relation, evidence, depth}]
    """
    driver = _get_driver()
    if driver is None:
        return []
    try:
        query = f"""
            MATCH path = (u:User {{id: $user_id}})-[*1..{max_hops}]-(e:Entity)
            WITH path, relationships(path) AS rels, nodes(path) AS ns
            RETURN
                e.name AS entity,
                [r IN rels | type(r)] AS rel_types,
                [r IN rels | coalesce(r.evidence, '')] AS evidences,
                length(path) AS depth
            LIMIT $limit
        """
        with driver.session() as session:
            result = session.run(query, user_id=user_id, limit=limit)
            neighbors = []
            for record in result:
                neighbors.append({
                    "entity": record["entity"],
                    "relations": record["rel_types"],
                    "evidences": record["evidences"],
                    "depth": record["depth"],
                })
            return neighbors
    except Exception as exc:
        logger.debug("get_neighbors failed: %s", exc)
        return []


def get_entity_memories(user_id: str, entity_name: str, limit: int = 5) -> list[str]:
    """查询与某实体直接相关的所有证据（用于图谱辅助召回）。"""
    driver = _get_driver()
    if driver is None:
        return []
    try:
        query = """
            MATCH (u:User {id: $user_id})-[r]-(e:Entity {name: $entity})
            RETURN r.evidence AS evidence
            LIMIT $limit
        """
        with driver.session() as session:
            result = session.run(query, user_id=user_id, entity=entity_name, limit=limit)
            return [record["evidence"] for record in result if record["evidence"]]
    except Exception as exc:
        logger.debug("get_entity_memories failed: %s", exc)
        return []


def _normalize_relation(relation: str) -> str:
    """将中文/自由格式的关系转为 Neo4j 标签名。"""
    mapping = {
        "就职于": "WORKS_AT", "工作在": "WORKS_AT",
        "居住在": "LIVES_IN", "住在": "LIVES_IN",
        "喜欢": "LIKES", "爱": "LIKES",
        "不喜欢": "DISLIKES", "讨厌": "DISLIKES",
        "朋友": "FRIENDS_WITH", "认识": "KNOWS",
        "参加": "ATTENDED", "去了": "ATTENDED",
    }
    return mapping.get(relation, "RELATED_TO").upper()
