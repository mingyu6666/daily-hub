import json
import os
from datetime import date

from flask import Flask, jsonify, request, send_from_directory
from apscheduler.schedulers.background import BackgroundScheduler

import database as db
from news import fetch_news
from push import push_news

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")

app = Flask(__name__, static_folder="static", static_url_path="")


def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


# ---------- 每日任务：抓新闻 + 推送 ----------
def daily_news_job(push=True):
    cfg = load_config()
    items = fetch_news(cfg.get("news_count", 10))
    if items:
        db.save_news(items)
    if push:
        ok, msg = push_news(cfg.get("pushplus_token", ""), items)
        print(f"[scheduler] 新闻推送: {ok}, {msg}")
    return items


def setup_scheduler():
    cfg = load_config()
    hour, minute = cfg.get("push_time", "07:00").split(":")
    scheduler = BackgroundScheduler()
    scheduler.add_job(daily_news_job, "cron", hour=int(hour), minute=int(minute),
                      id="daily_news", replace_existing=True)
    scheduler.start()
    print(f"[scheduler] 每日新闻推送任务已启动，时间 {hour}:{minute}")
    return scheduler


# ---------- 页面 ----------
@app.route("/")
def index():
    return send_from_directory("static", "index.html")


# ---------- 配置 ----------
@app.route("/api/config", methods=["GET"])
def get_config():
    cfg = load_config()
    # token 只返回是否已配置，不返回明文
    cfg["pushplus_token_set"] = bool(cfg.get("pushplus_token"))
    cfg.pop("pushplus_token", None)
    return jsonify(cfg)


@app.route("/api/config", methods=["POST"])
def update_config():
    cfg = load_config()
    data = request.json or {}
    if "pushplus_token" in data:
        cfg["pushplus_token"] = data["pushplus_token"].strip()
    if "push_time" in data:
        cfg["push_time"] = data["push_time"]
    save_config(cfg)
    # 重新设置定时任务
    global scheduler
    scheduler.shutdown(wait=False)
    setup_scheduler_safe()
    return jsonify({"ok": True})


# ---------- 新闻 ----------
@app.route("/api/news")
def api_news():
    news = db.get_today_news()
    return jsonify({"news": news, "day": date.today().isoformat()})


@app.route("/api/news/refresh", methods=["POST"])
def api_news_refresh():
    items = daily_news_job(push=False)
    return jsonify({"ok": True, "count": len(items)})


@app.route("/api/news/push", methods=["POST"])
def api_news_push():
    cfg = load_config()
    news = db.get_today_news()
    ok, msg = push_news(cfg.get("pushplus_token", ""), news)
    return jsonify({"ok": ok, "msg": msg})


# ---------- 打卡 ----------
@app.route("/api/checkins", methods=["GET"])
def api_checkins():
    cfg = load_config()
    tasks = cfg["tasks"]
    today = db.get_today_checkins()
    result = []
    for t in tasks:
        done = t["id"] in today
        result.append({
            **t,
            "done": done,
            "note": today[t["id"]]["note"] if done else "",
            "calories": today[t["id"]]["calories"] if done else 0,
            "streak": db.get_streak(t["id"]),
        })
    return jsonify({"tasks": result, "day": date.today().isoformat()})


@app.route("/api/checkin", methods=["POST"])
def api_checkin():
    data = request.json or {}
    task_id = data.get("task_id")
    if not task_id:
        return jsonify({"ok": False, "msg": "缺少 task_id"}), 400
    if data.get("cancel"):
        db.cancel_checkin(task_id)
    else:
        db.checkin(task_id, data.get("note", ""), int(data.get("calories") or 0))
    return jsonify({"ok": True, "streak": db.get_streak(task_id)})


# ---------- 日记 ----------
@app.route("/api/diary", methods=["GET"])
def api_get_diary():
    day = request.args.get("day")
    entry = db.get_diary(day)
    return jsonify({"diary": entry, "history": db.list_entries("diaries")})


@app.route("/api/diary", methods=["POST"])
def api_save_diary():
    data = request.json or {}
    db.save_diary(data.get("content", ""), data.get("mood", ""))
    return jsonify({"ok": True})


# ---------- 工作总结 ----------
@app.route("/api/summary", methods=["GET"])
def api_get_summary():
    day = request.args.get("day")
    entry = db.get_summary(day)
    return jsonify({"summary": entry, "history": db.list_entries("summaries")})


@app.route("/api/summary", methods=["POST"])
def api_save_summary():
    data = request.json or {}
    db.save_summary(data.get("content", ""))
    return jsonify({"ok": True})


# ---------- 统计 ----------
@app.route("/api/stats")
def api_stats():
    cfg = load_config()
    history = db.get_history(30)
    task_ids = [t["id"] for t in cfg["tasks"]]
    days = sorted(history.keys(), reverse=True)
    table = []
    for d in days:
        done = history[d]
        table.append({
            "day": d,
            "done": done,
            "count": len([t for t in task_ids if t in done]),
            "total": len(task_ids),
        })
    # 本周完成率
    today = date.today()
    week_start = today - __import__("datetime").timedelta(days=today.weekday())
    week_days = [(week_start + __import__("datetime").timedelta(days=i)).isoformat()
                 for i in range(7) if week_start + __import__("datetime").timedelta(days=i) <= today]
    week_done = sum(len([t for t in task_ids if t in history.get(d, [])]) for d in week_days)
    week_rate = round(week_done / (len(week_days) * len(task_ids)) * 100) if week_days else 0
    return jsonify({"table": table, "week_rate": week_rate})


def setup_scheduler_safe():
    global scheduler
    try:
        scheduler = setup_scheduler()
    except Exception as e:
        print(f"[scheduler] 启动失败: {e}")
        scheduler = None


scheduler = None

if __name__ == "__main__":
    db.init_db()
    # 启动时若今天还没有新闻，先抓一次（不推送）
    if not db.get_today_news():
        print("[startup] 抓取今日新闻...")
        try:
            daily_news_job(push=False)
        except Exception as e:
            print(f"[startup] 新闻抓取失败: {e}")
    setup_scheduler_safe()
    print("=" * 50)
    print("工作台已启动: http://localhost:5000")
    print("=" * 50)
    app.run(host="0.0.0.0", port=5000, debug=False)
