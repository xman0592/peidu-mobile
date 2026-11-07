/* 陪读手机版 · 语音问答（纯前端） */
(function () {
  "use strict";

  const STORE_KEY = "peidu-mobile-v1";
  const ROUND_SIZE = 10;
  const VERDICTS = {
    "掌握": { icon: "✅", cls: "good" },
    "模糊": { icon: "🟡", cls: "hot" },
    "半对": { icon: "🟠", cls: "hot" },
    "错": { icon: "❌", cls: "bad" },
  };
  const TYPE_PREFIX = { "记忆": "请说出：", "理解": "请解释：", "应用": "请回答：" };

  const $ = (id) => document.getElementById(id);
  const data = window.PEIDU_DATA || { subjects: [] };
  let subjectName = data.subjects[0] ? data.subjects[0].name : "";
  let queue = [];
  let qIndex = 0;
  let answerText = "";
  let currentVerdict = "";
  let recog = null;
  let recognizing = false;
  let lastSpoken = "";
  let lastInterim = "";
  let recogTimer = null;

  /* ---------- 存储 ---------- */
  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { subjects: {} }; }
    catch (e) { return { subjects: {} }; }
  }
  function saveStore(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function subjectState(store) {
    store.subjects[subjectName] = store.subjects[subjectName] || { points: {} };
    return store.subjects[subjectName];
  }
  function pointState(store, id) {
    const ss = subjectState(store);
    ss.points[id] = ss.points[id] || { asked: 0, wrong: 0, status: "", due: "", last: "" };
    return ss.points[id];
  }
  function getSubject() {
    return data.subjects.find((s) => s.name === subjectName) || data.subjects[0];
  }

  /* ---------- 工具 ---------- */
  function todayStr(offsetDays) {
    const d = new Date();
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function norm(s) {
    return (s || "").toLowerCase().replace(/[\s，。、；：,.;:!?！？"'“”‘’（）()\[\]【】—\-·~～]/g, "");
  }
  function toast(msg, ms) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), ms || 2200);
  }

  /* ---------- 语音合成 ---------- */
  let voices = [];
  function refreshVoices() {
    if (!("speechSynthesis" in window)) return;
    voices = speechSynthesis.getVoices() || [];
  }
  if ("speechSynthesis" in window) {
    refreshVoices();
    speechSynthesis.onvoiceschanged = refreshVoices;
  }
  function speak(text) {
    if (!("speechSynthesis" in window) || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      u.rate = 0.95;
      u.pitch = 1;
      const zh = voices.filter((v) => /^zh/i.test(v.lang));
      if (zh.length) {
        u.voice = zh.find((v) => /Xiaoxiao|晓晓|Ting|婷婷|Huihui|慧慧|Mei|美|女/i.test(v.name)) || zh[0];
      }
      speechSynthesis.speak(u);
      lastSpoken = text;
    } catch (e) {}
  }
  function stopSpeak() {
    if ("speechSynthesis" in window) {
      try { speechSynthesis.cancel(); } catch (e) {}
    }
  }

  /* ---------- 语音识别 ---------- */
  function initRecog() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.lang = "zh-CN";
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;

    r.onresult = function (e) {
      let interim = "", final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += txt;
        else interim += txt;
      }
      if (final) answerText = (answerText + final).trim();
      lastInterim = interim;
      showAnswer(answerText + (interim ? interim : ""));
    };
    r.onerror = function (e) {
      const map = {
        "not-allowed": "麦克风权限被拒绝，请在浏览器设置里允许",
        "service-not-allowed": "语音识别服务不可用，改用输入框",
        "network": "语音识别连不上网，改用输入框的语音键",
        "no-speech": "没听到声音，再说一次",
        "aborted": "",
      };
      const msg = map[e.error] !== undefined ? map[e.error] : "语音识别出错：" + e.error;
      finishListening(msg);
      if (e.error === "network" || e.error === "service-not-allowed" || e.error === "not-allowed") {
        showInputFallback();
      }
    };
    r.onend = function () {
      // 兜底：有些安卓浏览器 onend 不触发，这里和手动停止都会收尾
      finishListening("");
    };
    return r;
  }

  function setRecordBtn(on) {
    const b = $("btnRecord");
    b.classList.toggle("recording", on);
    if (on) b.textContent = "正在听…点一下停";
    else b.textContent = recog ? "开始回答" : "用键盘语音输入";
  }

  function showAnswer(text) {
    const box = $("answerBox");
    box.textContent = text || "等待回答…";
    box.classList.toggle("empty", !text);
  }

  function showInputFallback() {
    const input = $("answerInput");
    const box = $("answerBox");
    box.style.display = "none";
    input.style.display = "block";
    input.value = answerText;
    input.focus();
    $("qHint").textContent = "浏览器语音识别不可用：点键盘上的麦克风键说话，或直接打字。";
    input.oninput = function () {
      answerText = input.value;
      if (answerText.trim()) showSubmitRow();
    };
  }

  function showSubmitRow() {
    $("rowSubmit").style.display = "flex";
  }
  function hideSubmitRow() {
    $("rowSubmit").style.display = "none";
  }

  /* ---------- 答题流程 ---------- */
  function buildQueue() {
    const store = loadStore();
    const today = todayStr();
    const pts = getSubject().points.map((p) => {
      const s = pointState(store, p.id);
      let score = 0;
      if (s.status === "错") score += 100;
      else if (s.status === "半对") score += 85;
      else if (s.status === "模糊") score += 65;
      if (s.status && s.due && s.due <= today) score += 40;
      if (!s.asked) score += p.star === 3 ? 38 : p.star === 2 ? 22 : 10;
      score += Math.random() * 6;
      return { p, score };
    });
    pts.sort((a, b) => b.score - a.score);
    let list = pts.slice(0, ROUND_SIZE).map((x) => x.p);

    // 前两题热身：把最容易的提到前面
    const easy = list.filter((p) => {
      const s = loadStore().subjects[subjectName]?.points?.[p.id] || {};
      return p.star === 1 || s.status === "掌握";
    });
    if (easy.length) {
      const rest = list.filter((p) => easy.indexOf(p) === -1);
      const warm = easy.slice(0, 2);
      list = warm.concat(rest);
      list = list.filter((p, i) => list.indexOf(p) === i).slice(0, ROUND_SIZE);
    }
    return list;
  }

  function startRound() {
    queue = buildQueue();
    if (!queue.length) { toast("这个科目还没有考点"); return; }
    qIndex = 0;
    showScreen("quiz");
    renderQuestion();
  }

  function showScreen(name) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $("screen" + name[0].toUpperCase() + name.slice(1)).classList.add("active");
  }

  function renderQuestion() {
    const p = queue[qIndex];
    if (!p) { finishRound(); return; }

    answerText = "";
    currentVerdict = "";
    hideSubmitRow();
    $("verdictCard").classList.remove("show");
    $("answerBox").style.display = "block";
    $("answerInput").style.display = "none";
    $("answerInput").value = "";
    showAnswer("");
    $("qHint").textContent = "点「开始回答」，说完会自动停。";
    $("btnRecord").disabled = false;

    $("qMeta").innerHTML =
      '<span class="pill">' + escapeHtml(p.chapter || "") + "</span>" +
      '<span class="pill ' + (p.star === 3 ? "hot" : "") + '">' + (p.star === 3 ? "必考" : p.star === 2 ? "常考" : "了解") + "</span>" +
      '<span class="pill">' + escapeHtml(p.type || "") + "</span>";

    const prefix = TYPE_PREFIX[p.type] || "请回答：";
    $("qText").textContent = prefix + p.text + (p.text.match(/[？?]$/) ? "" : "。");

    const total = queue.length;
    $("progressText").textContent = (qIndex + 1) + " / " + total;
    $("progressBar").style.width = ((qIndex) / total * 100) + "%";

    speak($("qText").textContent);
  }

  function finishListening(msg) {
    if (recogTimer) { clearTimeout(recogTimer); recogTimer = null; }
    recognizing = false;
    setRecordBtn(false);
    if (!answerText.trim() && lastInterim.trim()) answerText = lastInterim.trim();
    lastInterim = "";
    if (answerText.trim()) {
      showAnswer(answerText);
      showSubmitRow();
    } else if (msg) {
      toast(msg, 2400);
    }
  }

  function stopRecognizing(msg) {
    const was = recognizing;
    if (recogTimer) { clearTimeout(recogTimer); recogTimer = null; }
    recognizing = false;
    setRecordBtn(false);
    if (was && recog) { try { recog.abort(); } catch (e) {} }
    finishListening(msg || "");
  }

  function startAnswer() {
    stopSpeak();
    if (recognizing) { stopRecognizing(); return; }
    if (!recog) { showInputFallback(); return; }
    answerText = "";
    lastInterim = "";
    showAnswer("");
    hideSubmitRow();
    $("answerBox").style.display = "block";
    $("answerInput").style.display = "none";
    try {
      recog.start();
      recognizing = true;
      setRecordBtn(true);
      if (recogTimer) clearTimeout(recogTimer);
      // 有些浏览器一直不结束，20 秒强制收尾
      recogTimer = setTimeout(function () {
        if (recognizing) stopRecognizing("识别超时，请再试一次");
      }, 20000);
    } catch (e) {
      recognizing = false;
      setRecordBtn(false);
      showInputFallback();
    }
  }

  function judge(text, keys) {
    const a = norm(text);
    const normKeys = keys.map((k) => ({ raw: k, n: norm(k) })).filter((k) => k.n.length >= 2);
    let hit = 0;
    const hitKeys = [], missKeys = [];
    for (const k of normKeys) {
      if (a.includes(k.n)) { hit++; hitKeys.push(k.raw); }
      else missKeys.push(k.raw);
    }
    let verdict;
    if (!normKeys.length) {
      verdict = a ? "模糊" : "错";
    } else if (normKeys.length <= 3) {
      verdict = hit === normKeys.length ? "掌握" : hit >= 2 ? "模糊" : hit === 1 ? "半对" : "错";
    } else {
      const r = hit / normKeys.length;
      verdict = r >= 0.8 ? "掌握" : r >= 0.6 ? "模糊" : r >= 0.35 ? "半对" : "错";
    }
    if (!a) verdict = "错";
    return { verdict, hit, total: normKeys.length, hitKeys, missKeys };
  }

  function submitAnswer() {
    if (!answerText.trim() && $("answerInput").style.display !== "none") {
      answerText = $("answerInput").value;
    }
    if (!answerText.trim()) { toast("还没听到回答"); return; }
    const p = queue[qIndex];
    const result = judge(answerText, p.keys || []);
    currentVerdict = result.verdict;
    renderVerdict(p, result);
    recordResult(p, answerText, result.verdict);
  }

  function renderVerdict(p, r) {
    const v = VERDICTS[r.verdict] || VERDICTS["模糊"];
    $("verdictHead").innerHTML = v.icon + " " + r.verdict;
    $("verdictText").textContent =
      r.total ? "命中 " + r.hit + " / " + r.total + " 个要点" : "这题没有关键词，请对照参考答案";
    $("keyList").innerHTML =
      r.hitKeys.map((k) => '<span class="key hit">' + escapeHtml(k) + "</span>").join("") +
      r.missKeys.map((k) => '<span class="key miss">' + escapeHtml(k) + "</span>").join("");
    $("answerRef").innerHTML = "<b>参考答案：</b><br>" + escapeHtml(p.note || "（无）");
    $("verdictCard").classList.add("show");
    $("verdictCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
    markOverride(r.verdict);
  }

  function markOverride(v) {
    document.querySelectorAll("#overrideRow button").forEach((b) => {
      b.classList.toggle("on", b.dataset.v === v);
    });
  }

  function overrideVerdict(v) {
    if (!queue[qIndex]) return;
    const p = queue[qIndex];
    const store = loadStore();
    const s = pointState(store, p.id);
    s.status = v;
    const addDays = v === "掌握" ? 7 : v === "模糊" ? 3 : v === "半对" ? 1 : 0;
    s.due = todayStr(addDays);
    saveStore(store);
    currentVerdict = v;
    const meta = VERDICTS[v] || VERDICTS["模糊"];
    $("verdictHead").innerHTML = meta.icon + " " + v;
    markOverride(v);
    toast("已改为「" + v + "」", 1400);
  }

  function recordResult(p, answer, verdict) {
    const store = loadStore();
    const s = pointState(store, p.id);
    s.asked = (s.asked || 0) + 1;
    if (verdict === "错" || verdict === "半对") s.wrong = (s.wrong || 0) + 1;
    s.status = verdict;
    s.last = todayStr();
    s.lastAnswer = answer.slice(0, 300);
    const addDays = verdict === "掌握" ? 7 : verdict === "模糊" ? 3 : verdict === "半对" ? 1 : 0;
    s.due = todayStr(addDays);
    saveStore(store);
  }

  function nextQuestion() {
    qIndex++;
    if (qIndex >= queue.length) finishRound();
    else renderQuestion();
  }

  function finishRound() {
    const store = loadStore();
    let ok = 0, blur = 0, half = 0, bad = 0;
    queue.forEach((p) => {
      const s = store.subjects[subjectName]?.points?.[p.id] || {};
      if (s.status === "掌握") ok++;
      else if (s.status === "模糊") blur++;
      else if (s.status === "半对") half++;
      else bad++;
    });
    showScreen("start");
    $("startTitle").textContent = "本轮结束";
    $("startDesc").textContent =
      "掌握 " + ok + " 题，模糊 " + blur + " 题，半对 " + half + " 题，错 " + bad + " 题。" +
      (bad + half ? "错题和半对的已安排下次先复习。" : "状态不错，下次继续。");
    refreshStats();
    speak("本轮结束。掌握" + ok + "题，错和半对共" + (bad + half) + "题。");
  }

  function refreshStats() {
    const store = loadStore();
    const ss = store.subjects[subjectName] || { points: {} };
    const pts = getSubject() ? getSubject().points : [];
    const today = todayStr();
    let asked = 0, ok = 0, due = 0;
    pts.forEach((p) => {
      const s = ss.points[p.id];
      if (!s || !s.asked) return;
      asked++;
      if (s.status === "掌握") ok++;
      if (s.status && s.due && s.due <= today && s.status !== "掌握") due++;
    });
    $("statAsked").textContent = "已练 " + asked + " 题";
    $("statOk").textContent = "掌握 " + ok;
    $("statDue").textContent = "待复习 " + due;
  }

  /* ---------- 初始化 ---------- */
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderSubjects() {
    const bar = $("subjectBar");
    bar.innerHTML = "";
    data.subjects.forEach((s) => {
      const b = document.createElement("button");
      b.textContent = s.name;
      b.className = s.name === subjectName ? "active" : "";
      b.onclick = function () {
        if (recognizing) return;
        subjectName = s.name;
        queue = [];
        qIndex = 0;
        renderSubjects();
        $("examBadge").textContent = s.exam || "期中";
        $("startTitle").textContent = s.name + " · " + (s.exam || "");
        $("startDesc").textContent = "共 " + s.points.length + " 个考点。系统念题，姐姐口头回答，自动判分。每轮 " + ROUND_SIZE + " 题。";
        refreshStats();
        showScreen("start");
      };
      bar.appendChild(b);
    });
  }

  function init() {
    if (!data.subjects || !data.subjects.length) {
      document.body.innerHTML = '<p style="padding:40px;text-align:center">没有考点数据，请先生成 data.js</p>';
      return;
    }
    recog = initRecog();
    renderSubjects();

    const first = getSubject();
    $("examBadge").textContent = first.exam || "期中";
    $("startTitle").textContent = first.name + " · " + (first.exam || "");
    $("startDesc").textContent = "共 " + first.points.length + " 个考点。系统念题，姐姐口头回答，自动判分。每轮 " + ROUND_SIZE + " 题。";

    if (!recog) {
      $("speechWarn").classList.add("show");
      $("speechWarn").textContent =
        "当前浏览器不支持语音识别（建议安卓用 Edge 或 Chrome）。仍可正常使用：点「开始回答」后，用键盘上的麦克风键说话。";
      $("deviceNote").textContent = "提示：装 Edge 浏览器，语音识别成功率最高。";
    } else {
      $("deviceNote").textContent = "语音识别已就绪。房间保持安静，离手机近一点。";
    }

    $("btnStart").onclick = startRound;
    $("btnRecord").onclick = startAnswer;
    $("btnReplay").onclick = function () { speak($("qText").textContent); };
    $("btnSubmit").onclick = submitAnswer;
    $("btnRetry").onclick = function () {
      answerText = "";
      showAnswer("");
      hideSubmitRow();
      startAnswer();
    };
    $("btnNext").onclick = nextQuestion;
    $("overrideRow").onclick = function (e) {
      const v = e.target.dataset && e.target.dataset.v;
      if (v) overrideVerdict(v);
    };
    refreshStats();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
