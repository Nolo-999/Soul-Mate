"""数据库连接（初版 SQLite，接口保持与 MySQL 迁移兼容）"""
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# soulmate.db 固定放在 backend/ 目录下，不受启动 cwd 影响
DB_PATH = Path(__file__).resolve().parent.parent / "soulmate.db"

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI 依赖：请求级会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_schema() -> None:
    """建表 + 轻量列迁移（SQLite ALTER ADD COLUMN，已存在则跳过）"""
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(memory_unit)")}
        if "superseded_by" not in cols:
            conn.exec_driver_sql("ALTER TABLE memory_unit ADD COLUMN superseded_by INTEGER")
