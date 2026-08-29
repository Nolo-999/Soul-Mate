"""受 RelationshipAgent 管理的对话 API。"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.relationship_agent import AgentTurnRequest, AgentTurnResponse, reply_to_user

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/reply", response_model=AgentTurnResponse)
async def reply(payload: AgentTurnRequest, db: Session = Depends(get_db)) -> AgentTurnResponse:
    return await reply_to_user(payload, db)
