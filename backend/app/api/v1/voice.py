"""语音模块 API（/api/v1/voice）

- GET  /voices        音色目录（捏人页选择/试听用）
- POST /tts           文本合成语音，返回音频文件
"""
import hashlib
import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.tts_engine import AUDIO_DIR, synthesize
from app.voice_catalog import DEFAULT_VOICE, VALID_VOICE_IDS, VOICE_CATALOG, get_voice

router = APIRouter(prefix="/voice", tags=["voice"])

# 情绪 → 语调参数（对齐技术方案「同一音色不同演绎」）
EMOTION_PROSODY: dict[str, dict[str, str]] = {
    "happy":    {"rate": "+8%",  "pitch": "+20Hz"},
    "shy":      {"rate": "-5%",  "pitch": "+30Hz"},
    "sad":      {"rate": "-12%", "pitch": "-10Hz"},
    "angry":    {"rate": "+6%",  "pitch": "-15Hz"},
    "flirty":   {"rate": "-4%",  "pitch": "+25Hz"},
    "surprise": {"rate": "+10%", "pitch": "+35Hz"},
    "neutral":  {"rate": "+0%",  "pitch": "+0Hz"},
}


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    voice: str = DEFAULT_VOICE
    emotion: str = "neutral"


@router.get("/voices")
def list_voices():
    return {"voices": VOICE_CATALOG}


@router.post("/tts")
async def tts(payload: TtsRequest):
    """合成语音。同参文本做内容寻址缓存，避免重复调用。"""
    if payload.voice not in VALID_VOICE_IDS:
        raise HTTPException(400, f"未知音色: {payload.voice}")
    prosody = EMOTION_PROSODY.get(payload.emotion, EMOTION_PROSODY["neutral"])

    cache_key = hashlib.md5(
        f"{payload.voice}|{prosody['rate']}|{prosody['pitch']}|{payload.text}".encode()
    ).hexdigest()[:16]
    out_path = AUDIO_DIR / f"{cache_key}.mp3"
    if not out_path.exists():
        try:
            await synthesize(
                _clean_text(payload.text), payload.voice,
                rate=prosody["rate"], pitch=prosody["pitch"],
                out_path=out_path,  # 直接以缓存键命名，Windows 下避免 rename 句柄问题
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(502, f"语音合成失败: {exc}") from exc

    return FileResponse(out_path, media_type="audio/mpeg", filename=f"{cache_key}.mp3")


def _clean_text(text: str) -> str:
    """去掉动作括号和多余符号，朗读更自然"""
    text = re.sub(r"[（(【\[].*?[）)】\]]", "", text)      # （小声）→ 去掉
    text = re.sub(r"[~～]+", "。", text)                    # 拖音 → 句号
    return text.strip() or "……"
