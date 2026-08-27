"""预设音色目录（方案①：Edge-TTS 中文音色库）

分组面向「捏恋人」场景；后续 CosyVoice/克隆音色追加到对应分组即可。
"""

VOICE_CATALOG: list[dict] = [
    # ---- 女声 ----
    {"id": "zh-CN-XiaoyiNeural",       "name": "晓伊",   "gender": "女", "style": "元气少女", "desc": "活泼甜美，年轻有活力"},
    {"id": "zh-CN-XiaoxiaoNeural",     "name": "晓晓",   "gender": "女", "style": "温暖治愈", "desc": "温柔亲和，最百搭的女声"},
    {"id": "zh-CN-liaoning-XiaobeiNeural", "name": "小北", "gender": "女", "style": "东北直爽", "desc": "东北口音，幽默接地气"},
    {"id": "zh-TW-HsiaoChenNeural",    "name": "小陈",   "gender": "女", "style": "台湾腔", "desc": "温软台普，偶像剧感"},
    {"id": "zh-CN-shaanxi-XiaoniNeural", "name": "小妮", "gender": "女", "style": "陕韵俏皮", "desc": "陕西口音，俏皮可爱"},
    # ---- 男声 ----
    {"id": "zh-CN-YunxiNeural",        "name": "云希",   "gender": "男", "style": "清爽少年", "desc": "清亮干净，少年感十足"},
    {"id": "zh-CN-YunjianNeural",      "name": "云健",   "gender": "男", "style": "沉稳低音", "desc": "磁性强，成熟可靠"},
    {"id": "zh-CN-YunyangNeural",      "name": "云扬",   "gender": "男", "style": "播音质感", "desc": "标准好听，新闻主播感"},
    {"id": "zh-CN-YunyeNeural",         "name": "云野",  "gender": "男", "style": "慵懒随性", "desc": "松弛慵懒，文艺青年"},
    # ---- 中性/特殊 ----
    {"id": "zh-CN-YunzeNeural",        "name": "云泽",   "gender": "中性", "style": "冷静知性", "desc": "中性平和，理性温柔"},
]

VALID_VOICE_IDS = {v["id"] for v in VOICE_CATALOG}

DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"


def get_voice(voice_id: str) -> dict | None:
    return next((v for v in VOICE_CATALOG if v["id"] == voice_id), None)
