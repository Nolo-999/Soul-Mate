"""统一配置：所有 API key、端口、模型名集中管理"""
import os


# ─── OpenRouter (GLM-5.2 记忆抽取) ───
OPENROUTER_BASE = "https://openrouter.ai/api/v1"
OPENROUTER_KEY = os.getenv(
    "SOULMATE_OPENROUTER_KEY",
    "sk-or-v1-placeholder",  # 主人填入真实 key
)
LLM_MODEL = "z-ai/glm-5.2"
LLM_TIMEOUT = 60  # 秒
LLM_MAX_TOKENS = 2048

# ─── NVIDIA (Embedding 向量化) ───
NVIDIA_BASE = "https://integrate.api.nvidia.com/v1"
NVIDIA_KEY = os.getenv(
    "SOULMATE_NVIDIA_KEY",
    "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",
)
EMBED_MODEL = "nvidia/llama-nemotron-embed-vl-1b-v2"
EMBED_DIM = 2048
EMBED_BATCH_SIZE = 32  # 单次最多编码条数
EMBED_TIMEOUT = 30

# ─── Milvus 向量库 ───
MILVUS_HOST = os.getenv("SOULMATE_MILVUS_HOST", "127.0.0.1")
MILVUS_PORT = int(os.getenv("SOULMATE_MILVUS_PORT", "19530"))
MILVUS_COLLECTION = "soulemate_memories"

# ─── Neo4j 图库 ───
NEO4J_URI = os.getenv("SOULMATE_NEO4J_URI", "bolt://127.0.0.1:7687")
NEO4J_USER = os.getenv("SOULMATE_NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("SOULMATE_NEO4J_PASSWORD", "soulemate_neo4j")

# ─── SQLite (元数据层，保持不变) ───
# 由 database.py 管理，此处不重复定义
