# -*- coding: utf-8 -*-
"""把三科大纲和人工关键词合并成手机版 data.js。"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SRC = ROOT / "陪读" / "大纲"
KEYS_PATH = HERE / "keys.json"
OUT = HERE / "data.js"

FILES = ["地理-八上期中.json", "生物-八上期中.json", "历史-八上期中.json"]


def main():
    keys = json.loads(KEYS_PATH.read_text(encoding="utf-8"))
    subjects = []
    missing = []
    for fn in FILES:
        d = json.loads((SRC / fn).read_text(encoding="utf-8"))
        points = []
        for p in d["points"]:
            k = keys.get(p["id"], [])
            if not k:
                missing.append(p["id"])
            points.append({
                "id": p["id"],
                "chapter": p.get("chapter", ""),
                "text": p.get("text", ""),
                "star": p.get("star", 2),
                "type": p.get("type", "记忆"),
                "note": p.get("note", ""),
                "source": p.get("source", ""),
                "keys": k,
            })
        subjects.append({
            "name": d["subject"],
            "exam": d.get("exam", ""),
            "examDate": d.get("exam_date", ""),
            "points": points,
        })

    payload = {"generated": "2026-11-07", "subjects": subjects}
    js = "window.PEIDU_DATA = " + json.dumps(payload, ensure_ascii=False, indent=1) + ";\n"
    OUT.write_text(js, encoding="utf-8")

    for s in subjects:
        print(f"{s['name']}: {len(s['points'])} 个考点")
    if missing:
        print("缺关键词:", "、".join(missing))
    else:
        print("关键词齐全")
    print("已生成", OUT)


if __name__ == "__main__":
    main()
