/* ---------- 工具 ---------- */
const $ = (s) => document.querySelector(s);
const api = (url, opts) => fetch(url, opts).then((r) => r.json());
const post = (url, data) =>
  api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

function toast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (isError ? " error" : "");
  setTimeout(() => (t.className = "toast"), 2200);
}

/* ---------- 日期问候 ---------- */
function renderHeader() {
  const now = new Date();
  const week = ["日", "一", "二", "三", "四", "五", "六"];
  $("#todayDate").textContent =
    `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日 · 星期${week[now.getDay()]}`;
  const h = now.getHours();
  $("#greeting").textContent =
    h < 6 ? "夜深了" : h < 9 ? "早上好，新的一天开始了" : h < 12 ? "上午好" :
    h < 14 ? "中午好" : h < 18 ? "下午好" : "晚上好，记得写总结";
}

/* ---------- 任务打卡 ---------- */
let tasksCache = [];

async function loadTasks() {
  const { tasks } = await api("/api/checkins");
  tasksCache = tasks;
  const grid = $("#taskGrid");
  grid.innerHTML = "";
  tasks.forEach((t) => {
    const card = document.createElement("div");
    card.className = "task-card" + (t.done ? " done" : "");
    card.innerHTML = `
      <div class="task-icon">${t.icon}</div>
      <div class="task-name">${t.name}</div>
      <div class="task-desc">${t.desc}</div>
      ${t.note ? `<div class="task-note">📝 ${escapeHtml(t.note)}${t.calories ? ` · ${t.calories} 千卡` : ""}</div>` : ""}
      <div class="task-meta">
        <span class="streak">🔥 连续 ${t.streak} 天</span>
        <span class="task-status">${t.done ? "✓ 已完成" : "待打卡"}</span>
      </div>`;
    card.onclick = () => onTaskClick(t);
    grid.appendChild(card);
  });
  updateRing(tasks);
}

function updateRing(tasks) {
  const done = tasks.filter((t) => t.done).length;
  $("#doneCount").textContent = `${done}/${tasks.length}`;
}

function onTaskClick(t) {
  if (t.done) {
    if (confirm(`「${t.name}」今天已打卡，要取消吗？`)) {
      post("/api/checkin", { task_id: t.id, cancel: true }).then(() => {
        toast("已取消打卡");
        loadTasks();
        loadStats();
      });
    }
    return;
  }
  // 弹备注框
  $("#noteModalTitle").textContent = `${t.icon} ${t.name} · 打卡`;
  $("#noteInput").value = "";
  $("#calInput").value = "";
  $("#calRow").style.display = t.id === "fitness" ? "flex" : "none";
  $("#noteInput").placeholder =
    t.id === "learn" ? "今天学了什么？（如：FastAPI、Docker）" :
    t.id === "words" ? "备注（可选）" :
    t.id === "game" ? "游戏任务备注（可选）" : "健身内容（如：跑步 5 公里）";
  $("#noteModal").style.display = "flex";
  $("#noteConfirm").onclick = () => {
    post("/api/checkin", {
      task_id: t.id,
      note: $("#noteInput").value.trim(),
      calories: parseInt($("#calInput").value) || 0,
    }).then((r) => {
      $("#noteModal").style.display = "none";
      toast(`打卡成功！连续 ${r.streak} 天 🔥`);
      loadTasks();
      loadStats();
    });
  };
}

/* ---------- 新闻 ---------- */
async function loadNews() {
  const { news } = await api("/api/news");
  const list = $("#newsList");
  if (!news.length) {
    list.innerHTML = '<p class="muted" style="padding:18px">今天还没有新闻，点「刷新」抓取。</p>';
    return;
  }
  list.innerHTML = "";
  news.forEach((n, i) => {
    const div = document.createElement("div");
    div.className = "news-item";
    div.innerHTML = `
      <span class="news-index">${i + 1}</span>
      <div class="news-body">
        <div class="news-title"><a href="${n.link}" target="_blank" rel="noopener">${escapeHtml(n.title)}</a></div>
        ${n.summary ? `<div class="news-summary">${escapeHtml(n.summary)}</div>` : ""}
      </div>
      <span class="news-source">${escapeHtml(n.source)}</span>`;
    list.appendChild(div);
  });
}

$("#btnRefreshNews").onclick = async () => {
  toast("正在抓取新闻…");
  const r = await post("/api/news/refresh");
  toast(r.ok ? `抓到 ${r.count} 条新闻` : "抓取失败", !r.ok);
  loadNews();
};

$("#btnPushNews").onclick = async () => {
  const r = await post("/api/news/push");
  toast(r.ok ? "已推送到微信 ✅" : "推送失败：" + r.msg, !r.ok);
};

/* ---------- 日记 ---------- */
let mood = "";
$("#moodPicker").addEventListener("click", (e) => {
  if (e.target.dataset.mood) {
    mood = e.target.dataset.mood;
    document.querySelectorAll("#moodPicker span").forEach((s) =>
      s.classList.toggle("active", s.dataset.mood === mood));
  }
});

async function loadDiary() {
  const { diary, history } = await api("/api/diary");
  $("#diaryInput").value = diary ? diary.content : "";
  if (diary && diary.mood) {
    mood = diary.mood;
    document.querySelectorAll("#moodPicker span").forEach((s) =>
      s.classList.toggle("active", s.dataset.mood === mood));
  }
  renderHistory("#diaryHistory", history, (day) =>
    api("/api/diary?day=" + day).then((r) => {
      if (r.diary) { $("#diaryInput").value = r.diary.content; toast("已加载 " + day + " 的日记（保存将写回今天）"); }
    }));
}

$("#btnSaveDiary").onclick = async () => {
  const content = $("#diaryInput").value.trim();
  if (!content) return toast("日记内容不能为空", true);
  await post("/api/diary", { content, mood });
  $("#diaryStatus").textContent = "已保存 " + new Date().toLocaleTimeString("zh-CN");
  toast("日记已保存 ✅");
  loadDiary();
};

/* ---------- 工作总结 ---------- */
async function loadSummary() {
  const { summary, history } = await api("/api/summary");
  $("#summaryInput").value = summary ? summary.content : "";
  renderHistory("#summaryHistory", history, (day) =>
    api("/api/summary?day=" + day).then((r) => {
      if (r.summary) { $("#summaryInput").value = r.summary.content; toast("已加载 " + day + " 的总结（保存将写回今天）"); }
    }));
}

$("#btnSaveSummary").onclick = async () => {
  const content = $("#summaryInput").value.trim();
  if (!content) return toast("总结内容不能为空", true);
  await post("/api/summary", { content });
  $("#summaryStatus").textContent = "已保存 " + new Date().toLocaleTimeString("zh-CN");
  toast("总结已保存 ✅");
  loadSummary();
};

function renderHistory(sel, list, onClick) {
  const el = $(sel);
  el.innerHTML = list.length ? "<div class='muted' style='margin-bottom:4px'>历史记录：</div>" : "";
  list.forEach((h) => {
    const d = document.createElement("div");
    d.className = "history-item";
    d.innerHTML = `<b>${h.day}</b>${escapeHtml(h.preview || "")}`;
    d.onclick = () => onClick(h.day);
    el.appendChild(d);
  });
}

/* ---------- 统计 ---------- */
async function loadStats() {
  const { table, week_rate } = await api("/api/stats");
  $("#weekRate").textContent = `本周完成率 ${week_rate}%`;
  const cfg = await api("/api/config");
  const tbl = $("#statsTable");
  let html = `<tr><th>日期</th>${cfg.tasks.map((t) => `<th>${t.icon} ${t.name}</th>`).join("")}<th>完成</th></tr>`;
  table.forEach((row) => {
    const full = row.count === row.total;
    html += `<tr><td>${row.day}</td>` +
      cfg.tasks.map((t) => `<td><span class="dot ${row.done.includes(t.id) ? "on" : ""}"></span></td>`).join("") +
      `<td><span class="rate-pill ${full ? "full" : ""}">${row.count}/${row.total}</span></td></tr>`;
  });
  tbl.innerHTML = html || '<tr><td class="muted" style="padding:18px">暂无记录</td></tr>';
}

/* ---------- 设置 ---------- */
$("#btnSettings").onclick = async () => {
  const cfg = await api("/api/config");
  $("#pushTimeInput").value = cfg.push_time || "07:00";
  $("#tokenInput").value = "";
  $("#tokenInput").placeholder = cfg.pushplus_token_set ? "已配置（重新粘贴可修改）" : "粘贴你的 PushPlus Token";
  $("#settingsModal").style.display = "flex";
};
$("#settingsCancel").onclick = () => ($("#settingsModal").style.display = "none");
$("#settingsSave").onclick = async () => {
  const data = { push_time: $("#pushTimeInput").value };
  if ($("#tokenInput").value.trim()) data.pushplus_token = $("#tokenInput").value.trim();
  await post("/api/config", data);
  $("#settingsModal").style.display = "none";
  toast("设置已保存 ✅");
};
$("#noteCancel").onclick = () => ($("#noteModal").style.display = "none");
document.querySelectorAll(".modal-mask").forEach((m) =>
  m.addEventListener("click", (e) => { if (e.target === m) m.style.display = "none"; }));

/* ---------- 工具函数 ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- 启动 ---------- */
renderHeader();
loadTasks();
loadNews();
loadDiary();
loadSummary();
loadStats();
