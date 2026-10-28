/* 云端静态版：数据存浏览器 localStorage，新闻来自 news.json（GitHub Actions 每日更新） */
const $ = (s) => document.querySelector(s);

const TASKS = [
  { id: "words",   name: "背单词",   desc: "不背单词 50 个",                     icon: "📖" },
  { id: "game",    name: "游戏任务", desc: "完成每日游戏任务",                   icon: "🎮" },
  { id: "learn",   name: "学习新技能", desc: "学一个 Python 技巧 / 新软件 / GitHub 项目", icon: "💡" },
  { id: "fitness", name: "健身",     desc: "消耗 250-300 千卡",                  icon: "🔥" },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayOffsetStr(offset) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
  del(key) { localStorage.removeItem(key); },
};

const kCheckin = (day) => `wh_checkin_${day}`;
const kDiary = (day) => `wh_diary_${day}`;
const kSummary = (day) => `wh_summary_${day}`;

function toast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (isError ? " error" : "");
  setTimeout(() => (t.className = "toast"), 2200);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- 头部 ---------- */
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

/* ---------- 打卡 ---------- */
function getTodayCheckins() { return store.get(kCheckin(todayStr()), {}); }

function getStreak(taskId) {
  let streak = 0;
  let offset = getTodayCheckins()[taskId] ? 0 : -1; // 今天没打则从昨天算起
  while (store.get(kCheckin(dayOffsetStr(offset)), {})[taskId]) { streak++; offset--; }
  return streak;
}

function loadTasks() {
  const today = getTodayCheckins();
  const grid = $("#taskGrid");
  grid.innerHTML = "";
  let doneCount = 0;
  TASKS.forEach((t) => {
    const rec = today[t.id];
    const done = !!rec;
    if (done) doneCount++;
    const card = document.createElement("div");
    card.className = "task-card" + (done ? " done" : "");
    card.innerHTML = `
      <div class="task-icon">${t.icon}</div>
      <div class="task-name">${t.name}</div>
      <div class="task-desc">${t.desc}</div>
      ${rec && rec.note ? `<div class="task-note">📝 ${escapeHtml(rec.note)}${rec.calories ? ` · ${rec.calories} 千卡` : ""}</div>` : ""}
      <div class="task-meta">
        <span class="streak">🔥 连续 ${getStreak(t.id)} 天</span>
        <span class="task-status">${done ? "✓ 已完成" : "待打卡"}</span>
      </div>`;
    card.onclick = () => onTaskClick(t, done);
    grid.appendChild(card);
  });
  $("#doneCount").textContent = `${doneCount}/${TASKS.length}`;
}

function onTaskClick(t, done) {
  if (done) {
    if (confirm(`「${t.name}」今天已打卡，要取消吗？`)) {
      const data = getTodayCheckins();
      delete data[t.id];
      if (Object.keys(data).length) store.set(kCheckin(todayStr()), data);
      else store.del(kCheckin(todayStr()));
      toast("已取消打卡");
      loadTasks(); loadStats();
    }
    return;
  }
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
    const data = getTodayCheckins();
    data[t.id] = {
      note: $("#noteInput").value.trim(),
      calories: parseInt($("#calInput").value) || 0,
    };
    store.set(kCheckin(todayStr()), data);
    $("#noteModal").style.display = "none";
    toast(`打卡成功！连续 ${getStreak(t.id)} 天 🔥`);
    loadTasks(); loadStats();
  };
}

/* ---------- 新闻 ---------- */
async function loadNews() {
  try {
    const r = await fetch("news.json?t=" + Date.now());
    const data = await r.json();
    $("#newsDate").textContent = `更新于 ${data.date} · 每日 07:00 云端自动更新并推送微信`;
    const list = $("#newsList");
    if (!data.items || !data.items.length) {
      list.innerHTML = '<p class="empty-hint">暂无新闻</p>';
      return;
    }
    list.innerHTML = "";
    data.items.forEach((n, i) => {
      const div = document.createElement("div");
      div.className = "news-item";
      div.innerHTML = `
        <span class="news-index">${String(i + 1).padStart(2, "0")}</span>
        <div class="news-body">
          <div class="news-title"><a href="${n.link}" target="_blank" rel="noopener">${escapeHtml(n.title)}</a></div>
          ${n.summary ? `<div class="news-summary">${escapeHtml(n.summary)}</div>` : ""}
        </div>
        <span class="news-source">${escapeHtml(n.source)}</span>`;
      list.appendChild(div);
    });
  } catch {
    $("#newsList").innerHTML = '<p class="empty-hint">新闻加载失败，请刷新重试</p>';
  }
}

/* ---------- 日记 / 总结 ---------- */
let mood = "";
$("#moodPicker").addEventListener("click", (e) => {
  if (e.target.dataset.mood) {
    mood = e.target.dataset.mood;
    document.querySelectorAll("#moodPicker span").forEach((s) =>
      s.classList.toggle("active", s.dataset.mood === mood));
  }
});

function loadDiary(day) {
  const d = day || todayStr();
  const entry = store.get(kDiary(d), null);
  $("#diaryInput").value = entry ? entry.content : "";
  mood = entry ? entry.mood || "" : "";
  document.querySelectorAll("#moodPicker span").forEach((s) =>
    s.classList.toggle("active", s.dataset.mood === mood));
  renderHistory("#diaryHistory", kDiary, loadDiary);
}

function loadSummary(day) {
  const d = day || todayStr();
  const entry = store.get(kSummary(d), null);
  $("#summaryInput").value = entry ? entry.content : "";
  renderHistory("#summaryHistory", kSummary, loadSummary);
}

$("#btnSaveDiary").onclick = () => {
  const content = $("#diaryInput").value.trim();
  if (!content) return toast("日记内容不能为空", true);
  store.set(kDiary(todayStr()), { content, mood });
  $("#diaryStatus").textContent = "已保存 " + new Date().toLocaleTimeString("zh-CN");
  toast("日记已保存 ✅");
  renderHistory("#diaryHistory", kDiary, loadDiary);
};

$("#btnSaveSummary").onclick = () => {
  const content = $("#summaryInput").value.trim();
  if (!content) return toast("总结内容不能为空", true);
  store.set(kSummary(todayStr()), { content });
  $("#summaryStatus").textContent = "已保存 " + new Date().toLocaleTimeString("zh-CN");
  toast("总结已保存 ✅");
  renderHistory("#summaryHistory", kSummary, loadSummary);
};

function renderHistory(sel, keyFn, loader) {
  const el = $(sel);
  const days = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const prefix = keyFn("").slice(0, -1); // wh_diary_
    if (k && k.startsWith(prefix)) days.push(k.slice(prefix.length));
  }
  days.sort().reverse();
  const recent = days.slice(0, 14);
  el.innerHTML = recent.length ? "<div class='hint' style='margin-bottom:4px'>历史记录：</div>" : "";
  recent.forEach((day) => {
    const entry = store.get(keyFn(day), {});
    const d = document.createElement("div");
    d.className = "history-item";
    d.innerHTML = `<b>${day}</b>${escapeHtml((entry.content || "").slice(0, 80))}`;
    d.onclick = () => { loader(day); toast("已加载 " + day + "（保存将写回今天）"); };
    el.appendChild(d);
  });
}

/* ---------- 统计 ---------- */
function loadStats() {
  const rows = [];
  for (let i = -29; i <= 0; i++) {
    const day = dayOffsetStr(i);
    const data = store.get(kCheckin(day), null);
    if (data && Object.keys(data).length) rows.push({ day, done: Object.keys(data) });
  }
  rows.reverse();
  let html = `<tr><th>日期</th>${TASKS.map((t) => `<th>${t.icon} ${t.name}</th>`).join("")}<th>完成</th></tr>`;
  rows.forEach((row) => {
    const full = row.done.length === TASKS.length;
    html += `<tr><td>${row.day}</td>` +
      TASKS.map((t) => `<td><span class="dot ${row.done.includes(t.id) ? "on" : ""}"></span></td>`).join("") +
      `<td><span class="rate-pill ${full ? "full" : ""}">${row.done.length}/${TASKS.length}</span></td></tr>`;
  });
  if (!rows.length) html += '<tr><td colspan="6" class="empty-hint">暂无打卡记录</td></tr>';
  $("#statsTable").innerHTML = html;

  // 本周完成率
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 周一=0
  let doneCnt = 0;
  for (let i = 0; i <= dow; i++) {
    const data = store.get(kCheckin(dayOffsetStr(-dow + i)), {});
    doneCnt += TASKS.filter((t) => data[t.id]).length;
  }
  $("#weekRate").textContent = `本周 ${Math.round(doneCnt / ((dow + 1) * TASKS.length) * 100)}%`;
}

/* ---------- 弹窗通用 ---------- */
$("#noteCancel").onclick = () => ($("#noteModal").style.display = "none");
document.querySelectorAll(".modal-mask").forEach((m) =>
  m.addEventListener("click", (e) => { if (e.target === m) m.style.display = "none"; }));

/* ---------- 启动 ---------- */
renderHeader();
loadTasks();
loadNews();
loadDiary();
loadSummary();
loadStats();
