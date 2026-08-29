"""RelationshipAgent 离线回退与关系边界验证。"""
import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal
from app.relationship_agent import AgentTurnRequest, reply_to_user


async def main() -> None:
    db = SessionLocal()
    try:
        with (
            patch("app.relationship_agent.recall_memories", new_callable=AsyncMock, return_value=[]),
            patch("app.relationship_agent.llm_generate", new_callable=AsyncMock, return_value=None),
        ):
            low = await reply_to_user(
                AgentTurnRequest(message="I love you", intimacy=2),
                db,
            )
            normal = await reply_to_user(
                AgentTurnRequest(message="I had a difficult day", intimacy=60),
                db,
            )
        assert low.used_fallback and low.intimacy_delta == 0
        assert normal.used_fallback and -3 <= normal.intimacy_delta <= 3
        print("relationship agent fallback boundary: PASS")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
