# -*- coding: utf-8 -*-
"""模拟 app.js 的关键词判分，验证阈值是否合理。"""
import json, re
from pathlib import Path

HERE = Path(__file__).resolve().parent
keys = json.loads((HERE / "keys.json").read_text(encoding="utf-8"))
PUNC = r"[\s，。、；：,.;:!?！？\"'“”‘’（）()\[\]【】—\-·~～]"


def norm(s):
    return re.sub(PUNC, "", (s or "").lower())


def judge(text, ks):
    a = norm(text)
    nk = [k for k in ks if len(norm(k)) >= 2]
    hits = [k for k in nk if norm(k) in a]
    miss = [k for k in nk if norm(k) not in a]
    if not nk:
        v = "模糊" if a else "错"
    elif len(nk) <= 3:
        h = len(hits)
        v = "掌握" if h == len(nk) else "模糊" if h >= 2 else "半对" if h == 1 else "错"
    else:
        r = len(hits) / len(nk)
        v = "掌握" if r >= 0.8 else "模糊" if r >= 0.6 else "半对" if r >= 0.35 else "错"
    if not a:
        v = "错"
    return v, hits, miss


cases = [
    ("G01", "最北漠河，最南曾母暗沙，最东乌苏里江，最西帕米尔高原，陆上邻国十四个，濒临渤海黄海东海南海"),
    ("G01", "最北漠河，最南曾母暗沙，最东乌苏里江，最西帕米尔高原"),
    ("G01", "不知道"),
    ("G05", "东西走向有天山、阴山、昆仑山、秦岭、南岭，东北西南有大兴安岭、太行山、武夷山"),
    ("G05", "天山山脉"),
    ("G06", "青藏高原、内蒙古高原、黄土高原、云贵高原，塔里木盆地、柴达木盆地、四川盆地，东北平原、华北平原、长江中下游平原"),
    ("G11", "秦岭淮河是800毫米年等降水量线，以北半湿润，以南湿润"),
    ("B12", "生长激素由垂体分泌，幼年不足侏儒症，过多巨人症；甲状腺激素幼年不足呆小症，成年过多甲亢；胰岛素不足糖尿病"),
    ("B14", "由病原体引起，有传染性和流行性，三个环节是传染源、传播途径、易感人群"),
    ("B19", "处方药和非处方药，心肺复苏按压30次人工呼吸2次，动脉出血近心端止血"),
    ("H01", "根本原因是英国打开中国市场，直接原因是林则徐虎门销烟，关天培三元里抗英"),
    ("H02", "割香港岛，赔2100万银元，五口通商，协定关税，中国开始沦为半殖民地半封建社会"),
    ("H12", "鸦片战争南京条约开始沦为，第二次鸦片战争北京条约进一步加深，甲午战争马关条约大大加深，八国联军辛丑条约完全陷入"),
    ("H19", "导火线是巴黎和会外交失败，口号外争主权内除国贼，后来上海工人阶级成为主力，是新民主主义革命的开端"),
]

for pid, ans in cases:
    v, hit, miss = judge(ans, keys[pid])
    print(f"{pid} [{v}] 命中{len(hit)}/{len(hit)+len(miss)}  漏:{'、'.join(miss) if miss else '无'}")
    print(f"    答案: {ans[:40]}…")
