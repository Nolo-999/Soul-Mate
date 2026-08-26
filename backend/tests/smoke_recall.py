"""召回接口冒烟测试（绕开 git-bash 中文参数编码问题）"""
import json
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8000/api/v1/memories/recall"

for q in ["面试准备的怎么样", "今天天气不错", "我最近好紧张"]:
    url = f"{BASE}?q={urllib.parse.quote(q)}"
    with urllib.request.urlopen(url, timeout=15) as resp:
        data = json.load(resp)
    print(f"[{q}] -> {[m['content'] for m in data['items']]}")
