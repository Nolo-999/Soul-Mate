"""SoulMate 后端入口

启动：D:/python/python.exe -m uvicorn app.main:app --port 8000（在 backend/ 目录下）
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.memories import router as memories_router
from app.api.v1.voice import router as voice_router
from app.database import ensure_schema


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_schema()  # 建表 + 轻量列迁移；正式迁移用 alembic（后续）
    yield


app = FastAPI(title="SoulMate Backend", version="0.1.0", lifespan=lifespan)

# 前端 dev 端口跨域放行
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(memories_router, prefix="/api/v1")
app.include_router(voice_router, prefix="/api/v1")


@app.get("/api/health")
def health():
    return {"status": "ok"}
