"""GitHub Actions 每日任务：抓新闻 → 更新 docs/news.json → PushPlus 推送微信"""
import json
import os
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from news import fetch_news
from push import push_news

BJT = timezone(timedelta(hours=8))
DOCS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs")


def main():
    today = datetime.now(BJT).date().isoformat()
    print(f"[daily] {today} 抓取新闻...")
    items = fetch_news(10)
    if not items:
        print("[daily] 抓取失败，保留旧数据，跳过")
        return

    payload = {"date": today, "items": items}
    out = os.path.join(DOCS_DIR, "news.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"[daily] 已写入 {out}，共 {len(items)} 条")

    token = os.environ.get("PUSHPLUS_TOKEN", "").strip()
    if token:
        ok, msg = push_news(token, items)
        print(f"[daily] 微信推送: {ok}, {msg}")
    else:
        print("[daily] 未配置 PUSHPLUS_TOKEN，跳过微信推送")


if __name__ == "__main__":
    main()
