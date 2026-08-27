"""记忆单元表（对齐技术方案 4.3 memory_unit 设计）"""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from app.database import Base


class MemoryUnit(Base):
    __tablename__ = "memory_unit"

    id = Column(Integer, primary_key=True, autoincrement=True)
    content = Column(Text, nullable=False)                # 一句话记忆
    category = Column(String(20), default="fact")         # fact/preference/event/day/emotion
    importance = Column(Integer, default=3)               # 1~5
    pinned = Column(Boolean, default=False)               # 用户置顶
    archived = Column(Boolean, default=False)             # 归档：保留但不再召回
    forgotten = Column(Boolean, default=False)            # 遗忘开关：永不召回
    source_msg = Column(Text, default="")                 # 来源消息摘录
    superseded_by = Column(Integer, nullable=True)         # 被哪条新记忆覆盖（矛盾更新时回填）
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
