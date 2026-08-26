"""记忆模块端到端独立验证脚本
用法: D:/python/python.exe tests/e2e_verify.py
前置: uvicorn app.main:app --port 8000 已启动, Ollama 可用
"""
import json
import sys

import httpx

BASE = "http://127.0.0.1:8000/api/v1/memories"
results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'} | {name}" + (f" | {detail}" if detail else ""))


def main() -> int:
    c = httpx.Client(timeout=90)

    # ---- 0. 健康检查 & 清空旧数据 ----
    r = c.get("http://127.0.0.1:8000/api/health")
    check("后端健康", r.status_code == 200)

    for m in c.get(f"{BASE}?status=all").json()["items"]:
        c.delete(f"{BASE}/{m['id']}")
    left = len(c.get(f"{BASE}?status=all").json()["items"])
    check("清空测试数据", left == 0, f"剩余 {left} 条")

    # ---- 1. 手动创建 & 列表 ----
    r = c.post(BASE, json={"content": "用户的猫叫团子", "category": "fact", "importance": 4})
    check("手动新增记忆", r.status_code == 201 and r.json()["content"] == "用户的猫叫团子")
    items = c.get(f"{BASE}?status=active").json()["items"]
    check("列表包含新记忆", any(m["content"] == "用户的猫叫团子" for m in items))

    # ---- 2. LLM 提取（正常对话）----
    r = c.post(f"{BASE}/extract", json={
        "dialogue": "用户：我这周末要去杭州出差，还要顺便去看女朋友，她下个月生日。",
        "source_msg": "我这周末要去杭州出差",
    })
    d = r.json()
    check("LLM提取入库>=1条", len(d["saved"]) >= 1,
          f"提取{d['extracted']}条: {[s['content'] for s in d['saved']]}")

    # ---- 3. 敏感信息拦截 ----
    r = c.post(f"{BASE}/extract", json={
        "dialogue": "用户：我的手机号是13812345678，密码是 abc123，帮我记一下。",
        "source_msg": "记一下手机号",
    })
    d = r.json()
    check("敏感信息(手机号/密码)不入库", len(d["saved"]) == 0,
          f"误存 {len(d['saved'])} 条")

    # ---- 4. 召回：相关命中 / 无关不拉 ----
    hits = c.get(f"{BASE}/recall", params={"q": "出差顺利吗"}).json()["items"]
    check("相关话题召回命中", len(hits) >= 1 and "杭州" in hits[0]["content"],
          f"top1={hits[0]['content'] if hits else '无'}")
    hits = c.get(f"{BASE}/recall", params={"q": "今天天气不错"}).json()["items"]
    check("无关话题不乱召回", len(hits) == 0, f"误召回 {[m['content'] for m in hits]}")

    # ---- 5. 置顶加成 ----
    mem = next(m for m in c.get(f"{BASE}?status=all").json()["items"] if "团子" in m["content"])
    c.patch(f"{BASE}/{mem['id']}", json={"pinned": True})
    items = c.get(f"{BASE}?status=active").json()["items"]
    check("置顶生效(列表置顶位)", items[0]["pinned"] is True)

    # ---- 6. 遗忘开关 ----
    top = c.get(f"{BASE}/recall", params={"q": "杭州出差"}).json()["items"][0]
    c.patch(f"{BASE}/{top['id']}", json={"forgotten": True})
    hits = c.get(f"{BASE}/recall", params={"q": "杭州出差"}).json()["items"]
    check("遗忘后不再召回", len(hits) == 0)
    archived_list = c.get(f"{BASE}?status=forgotten").json()["items"]
    check("遗忘区可见(未物理删除)", any(m["id"] == top["id"] for m in archived_list))
    c.patch(f"{BASE}/{top['id']}", json={"forgotten": False})
    hits = c.get(f"{BASE}/recall", params={"q": "杭州出差"}).json()["items"]
    check("取消遗忘恢复召回", len(hits) == 1)

    # ---- 7. 归档隔离 ----
    c.patch(f"{BASE}/{top['id']}", json={"archived": True})
    hits = c.get(f"{BASE}/recall", params={"q": "杭州出差"}).json()["items"]
    check("归档后不参与召回", len(hits) == 0)

    # ---- 8. 物理删除 ----
    before = len(c.get(f"{BASE}?status=all").json()["items"])
    c.delete(f"{BASE}/{top['id']}")
    after = len(c.get(f"{BASE}?status=all").json()["items"])
    check("物理删除生效", after == before - 1)

    # ---- 汇总 ----
    failed = [r_ for r_ in results if not r_[1]]
    print(f"\n===== {len(results) - len(failed)}/{len(results)} 通过 =====")
    if failed:
        print("失败项:", *[f"- {n}: {d}" for n, _, d in failed], sep="\n")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
