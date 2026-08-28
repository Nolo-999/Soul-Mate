"""记忆模块 API（/api/v1/memories）"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.memory_engine import extract_memories, recall_memories, save_extracted
from app.models import MemoryUnit

router = APIRouter(prefix="/memories", tags=["memories"])


class MemoryCreate(BaseModel):
    content: str = Field(min_length=1, max_length=200)
    category: str = "fact"
    importance: int = Field(default=3, ge=1, le=5)


class MemoryPatch(BaseModel):
    content: str | None = Field(default=None, max_length=200)
    pinned: bool | None = None
    archived: bool | None = None
    forgotten: bool | None = None


class ExtractRequest(BaseModel):
    dialogue: str = Field(min_length=1, max_length=4000)
    source_msg: str = ""


def _serialize(mem: MemoryUnit) -> dict:
    return {
        "id": mem.id,
        "content": mem.content,
        "category": mem.category,
        "importance": mem.importance,
        "pinned": bool(mem.pinned),
        "archived": bool(mem.archived),
        "forgotten": bool(mem.forgotten),
        "source_msg": mem.source_msg,
        "created_at": mem.created_at.isoformat() if mem.created_at else None,
    }


@router.get("")
def list_memories(status: str = "active", db: Session = Depends(get_db)):
    query = db.query(MemoryUnit)
    if status == "active":
        query = query.filter(MemoryUnit.forgotten.is_(False), MemoryUnit.archived.is_(False))
    elif status == "archived":
        query = query.filter(MemoryUnit.archived.is_(True))
    elif status == "forgotten":
        query = query.filter(MemoryUnit.forgotten.is_(True))
    items = query.order_by(
        MemoryUnit.pinned.desc(), MemoryUnit.created_at.desc()
    ).all()
    return {"items": [_serialize(m) for m in items]}


@router.post("", status_code=201)
def create_memory(payload: MemoryCreate, db: Session = Depends(get_db)):
    mem = MemoryUnit(**payload.model_dump())
    db.add(mem)
    db.commit()
    db.refresh(mem)
    return _serialize(mem)


@router.patch("/{memory_id}")
def patch_memory(memory_id: int, payload: MemoryPatch, db: Session = Depends(get_db)):
    mem = db.get(MemoryUnit, memory_id)
    if not mem:
        raise HTTPException(404, "记忆不存在")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(mem, field, value)
    mem.updated_at = datetime.now()
    db.commit()
    db.refresh(mem)
    return _serialize(mem)


@router.delete("/{memory_id}")
def delete_memory(memory_id: int, db: Session = Depends(get_db)):
    mem = db.get(MemoryUnit, memory_id)
    if not mem:
        raise HTTPException(404, "记忆不存在")
    db.delete(mem)
    db.commit()
    return {"ok": True}


@router.post("/extract")
async def extract(payload: ExtractRequest, db: Session = Depends(get_db)):
    """从对话文本提取记忆+三元组。Ollama/GLM 不可用时静默返回空，不影响聊天。"""
    memories, triples = await extract_memories(payload.dialogue)
    saved, superseded_ids = await save_extracted(db, memories, payload.source_msg, triples=triples)
    return {
        "extracted": len(memories),
        "saved": [_serialize(m) for m in saved],
        "superseded_ids": superseded_ids,
        "triples": len(triples),
    }


@router.get("/recall")
def recall(q: str, top_k: int = 3, db: Session = Depends(get_db)):
    """按查询召回相关记忆（置顶优先 + 时间衰减）"""
    items = recall_memories(db, q, top_k=top_k)
    return {"items": [_serialize(m) for m in items]}
