import requests
from datetime import date

PUSHPLUS_URL = "http://www.pushplus.plus/send"


def push_news(token, items):
    """把新闻列表通过 PushPlus 推送到微信。返回 (是否成功, 提示信息)"""
    if not token:
        return False, "未配置 pushplus_token"

    if not items:
        return False, "没有可推送的新闻"

    today = date.today().strftime("%Y-%m-%d")
    lines = [f'<h2>🌍 今日国际大事 · {today}</h2>', "<hr>", "<ol>"]
    for n in items:
        title = n["title"]
        link = n.get("link", "")
        source = n.get("source", "")
        if link:
            lines.append(f'<li><a href="{link}">{title}</a> <small>· {source}</small></li>')
        else:
            lines.append(f"<li>{title} <small>· {source}</small></li>")
    lines.append("</ol>")
    lines.append("<hr><p>📋 别忘了今天的打卡：背单词 / 学习 / 健身 / 日记 / 总结</p>")
    content = "\n".join(lines)

    try:
        resp = requests.post(PUSHPLUS_URL, json={
            "token": token,
            "title": f"🌍 今日国际大事 {today}",
            "content": content,
            "template": "html",
        }, timeout=15)
        data = resp.json()
        if data.get("code") == 200:
            return True, "推送成功"
        return False, f"PushPlus 返回错误: {data.get('msg')}"
    except Exception as e:
        return False, f"推送请求失败: {e}"


if __name__ == "__main__":
    # 测试：python push.py <token>
    import sys, json, os
    token = sys.argv[1] if len(sys.argv) > 1 else ""
    fake = [{"title": "测试新闻标题", "link": "https://example.com", "source": "测试源"}]
    print(push_news(token, fake))
