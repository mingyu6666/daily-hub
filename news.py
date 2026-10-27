import re
import feedparser
import requests

# 多个国际新闻 RSS 源，抓取时按顺序混合，任一源失败自动跳过
RSS_SOURCES = [
    ("联合早报·国际", "https://www.zaobao.com/rss/realtime/world"),
    ("FT中文网", "http://www.ftchinese.com/rss/news"),
    ("BBC中文", "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml"),
    ("RFI中文", "https://www.rfi.fr/cn/rss"),
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}


def _clean(text, limit=120):
    """去掉 HTML 标签，截断摘要"""
    text = re.sub(r"<[^>]+>", "", text or "")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit] + ("…" if len(text) > limit else "")


def fetch_news(count=10):
    """从多个 RSS 源抓取国际新闻，去重后返回 count 条"""
    seen = set()
    items = []
    per_source = max(4, count // 2)  # 每个源最多取这么多，保证来源多样

    for source_name, url in RSS_SOURCES:
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            resp.raise_for_status()
            feed = feedparser.parse(resp.content)
            taken = 0
            for entry in feed.entries:
                title = _clean(getattr(entry, "title", ""), 200)
                if not title or title in seen:
                    continue
                seen.add(title)
                items.append({
                    "title": title,
                    "link": getattr(entry, "link", ""),
                    "source": source_name,
                    "summary": _clean(getattr(entry, "summary", "")),
                })
                taken += 1
                if taken >= per_source:
                    break
        except Exception as e:
            print(f"[news] 源 {source_name} 抓取失败: {e}")
            continue
        if len(items) >= count:
            break

    return items[:count]


if __name__ == "__main__":
    for i, n in enumerate(fetch_news(), 1):
        print(f"{i}. [{n['source']}] {n['title']}")
