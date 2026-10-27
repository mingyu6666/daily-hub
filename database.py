import sqlite3
import os
from datetime import date, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "workbench.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    c = conn.cursor()
    # 打卡记录
    c.execute("""
        CREATE TABLE IF NOT EXISTS checkins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            day TEXT NOT NULL,
            note TEXT DEFAULT '',
            calories INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            UNIQUE(task_id, day)
        )
    """)
    # 日记
    c.execute("""
        CREATE TABLE IF NOT EXISTS diaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            day TEXT UNIQUE NOT NULL,
            content TEXT DEFAULT '',
            mood TEXT DEFAULT '',
            updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    """)
    # 工作总结
    c.execute("""
        CREATE TABLE IF NOT EXISTS summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            day TEXT UNIQUE NOT NULL,
            content TEXT DEFAULT '',
            updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    """)
    # 新闻缓存
    c.execute("""
        CREATE TABLE IF NOT EXISTS news (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            day TEXT NOT NULL,
            title TEXT NOT NULL,
            link TEXT DEFAULT '',
            source TEXT DEFAULT '',
            summary TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    """)
    conn.commit()
    conn.close()


def today_str():
    return date.today().isoformat()


# ---------- 打卡 ----------
def checkin(task_id, note="", calories=0):
    conn = get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO checkins (task_id, day, note, calories, created_at) "
        "VALUES (?, ?, ?, ?, datetime('now', 'localtime'))",
        (task_id, today_str(), note, calories),
    )
    conn.commit()
    conn.close()


def cancel_checkin(task_id):
    conn = get_conn()
    conn.execute("DELETE FROM checkins WHERE task_id=? AND day=?", (task_id, today_str()))
    conn.commit()
    conn.close()


def get_today_checkins():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM checkins WHERE day=?", (today_str(),)).fetchall()
    conn.close()
    return {r["task_id"]: dict(r) for r in rows}


def get_streak(task_id):
    """连续打卡天数：从今天（若已打卡）或昨天开始往前数"""
    conn = get_conn()
    rows = conn.execute(
        "SELECT day FROM checkins WHERE task_id=? ORDER BY day DESC", (task_id,)
    ).fetchall()
    conn.close()
    days = {r["day"] for r in rows}
    streak = 0
    cursor = date.today()
    if cursor.isoformat() not in days:
        cursor -= timedelta(days=1)  # 今天还没打卡，从昨天算起
    while cursor.isoformat() in days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def get_history(days=30):
    """最近 N 天打卡历史，供统计"""
    conn = get_conn()
    since = (date.today() - timedelta(days=days - 1)).isoformat()
    rows = conn.execute(
        "SELECT day, task_id FROM checkins WHERE day>=? ORDER BY day", (since,)
    ).fetchall()
    conn.close()
    result = {}
    for r in rows:
        result.setdefault(r["day"], []).append(r["task_id"])
    return result


# ---------- 日记 / 总结 ----------
def save_diary(content, mood=""):
    conn = get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO diaries (day, content, mood, updated_at) "
        "VALUES (?, ?, ?, datetime('now', 'localtime'))",
        (today_str(), content, mood),
    )
    conn.commit()
    conn.close()


def get_diary(day=None):
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM diaries WHERE day=?", (day or today_str(),)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def save_summary(content):
    conn = get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO summaries (day, content, updated_at) "
        "VALUES (?, ?, datetime('now', 'localtime'))",
        (today_str(), content),
    )
    conn.commit()
    conn.close()


def get_summary(day=None):
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM summaries WHERE day=?", (day or today_str(),)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def list_entries(kind="diaries", limit=14):
    """最近日记/总结列表"""
    assert kind in ("diaries", "summaries")
    conn = get_conn()
    rows = conn.execute(
        f"SELECT day, substr(content, 1, 80) AS preview, updated_at FROM {kind} "
        "ORDER BY day DESC LIMIT ?",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ---------- 新闻 ----------
def save_news(items):
    conn = get_conn()
    conn.execute("DELETE FROM news WHERE day=?", (today_str(),))
    for it in items:
        conn.execute(
            "INSERT INTO news (day, title, link, source, summary) VALUES (?, ?, ?, ?, ?)",
            (today_str(), it["title"], it.get("link", ""), it.get("source", ""), it.get("summary", "")),
        )
    conn.commit()
    conn.close()


def get_today_news():
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM news WHERE day=? ORDER BY id", (today_str(),)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
