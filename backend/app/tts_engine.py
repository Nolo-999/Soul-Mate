"""TTS 引擎抽象层

初版：edge-tts 预设音色（免费云端，零显卡占用）
后续：CosyVoice 本地情感TTS / GPT-SoVITS 声音克隆，实现同一接口即可替换
"""
import asyncio
import logging
import tempfile
from pathlib import Path

import edge_tts

logger = logging.getLogger("soulmate.tts")

# 合成音频存放目录：backend/static/tts/
AUDIO_DIR = Path(__file__).resolve().parent.parent / "static" / "tts"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)


async def synthesize(text: str, voice: str, rate: str = "+0%", pitch: str = "+0Hz",
                     out_path: Path | None = None) -> Path:
    """合成语音到指定路径（未给路径则生成临时文件），返回 mp3 路径。失败抛异常由 API 层处理。"""
    if out_path is None:
        fd, out_path_str = tempfile.mkstemp(suffix=".mp3", dir=AUDIO_DIR)
        out_path = Path(out_path_str)
        import os
        os.close(fd)  # 关闭句柄，Windows 下 edge-tts 打开文件需要
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    try:
        await asyncio.wait_for(communicate.save(str(out_path)), timeout=30)
    except Exception:
        if not out_path.exists() or out_path.stat().st_size == 0:
            out_path.unlink(missing_ok=True)
        raise
    return out_path
