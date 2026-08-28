"""统一配置：所有 API key、端口、模型名集中管理

优先从 .env 文件加载；未设置时使用默认值（降级模式，不报错）。
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# 加载 backend/.env
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
else:
    load_dotenv()  # 尝试从 cwd/.env 加载

# ─── NVIDIA API（DeepSeek-V4-Pro 抽取 + Embedding 向量化）───
NVIDIA_BASE = "https://integrate.api.nvidia.com/v1"
NVIDIA_KEY = os.getenv("SOULMATE_NVIDIA_KEY", "")

# Chat（记忆抽取）
LLM_MODEL = "deepseek-ai/deepseek-v4-pro-0813"
LLM_MAX_TOKENS = 4096

# Embedding（向量化）
EMBED_MODEL = "nvidia/llama-nemotron-embed-vl-1b-v2"
EMBED_DIM = 2048
EMBED_BATCH_SIZE = 32
EMBED_TIMEOUT = 30

# ─── Milvus 向量库 ───
MILVUS_HOST = os.getenv("SOULMATE_MILVUS_HOST", "127.0.0.1")
MILVUS_PORT = int(os.getenv("SOULMATE_MILVUS_PORT", "19530"))
MILVUS_COLLECTION = "soulemate_memories"

# ─── Neo4j 图库 ───
NEO4J_URI = os.getenv("SOULMATE_NEO4J_URI", "bolt://127.0.0.1:7687")
NEO4J_USER = os.getenv("SOULMATE_NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("SOULMATE_NEO4J_PASSWORD", "soulemate_neo4j")
