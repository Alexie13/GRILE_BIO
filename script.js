(function (root) {
  "use strict";

  /* ---------- Logică pură (testabilă) ---------- */
  function randInt(n) {
    if (root.crypto && root.crypto.getRandomValues) {
      var a = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n;
      do { root.crypto.getRandomValues(a); } while (a[0] >= lim);
      return a[0] % n;
    }
    return Math.floor(Math.random() * n);
  }
  function shuffle(arr) { // Fisher-Yates
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = randInt(i + 1), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function filterQuestions(all, chapterTitles) {
    if (!chapterTitles) return all.slice();
    return all.filter(function (q) { return chapterTitles.indexOf(q.chapter) !== -1; });
  }
  function pickQuestions(all, chapterTitles, count) {
    var pool = filterQuestions(all, chapterTitles);
    if (!(count >= 1) || count > pool.length) return null;
    return shuffle(pool).slice(0, count);
  }
  var Logic = { shuffle: shuffle, filterQuestions: filterQuestions, pickQuestions: pickQuestions };
  root.QuizLogic = Logic;
  if (typeof module !== "undefined" && module.exports) module.exports = Logic;
  if (typeof document === "undefined") return;

  /* ---------- Interfața ---------- */
  var QS = typeof questions !== "undefined" ? questions : [];
  var CH = typeof chapters !== "undefined" ? chapters : [];
  var $ = function (id) { return document.getElementById(id); };
  var LS_CFG = "bioquiz:config", LS_LAST = "bioquiz:last";
  var PRESETS = ["5", "10", "20", "30", "50", "custom"];

  var state = { quiz: [], idx: 0, answers: {}, cfg: null };

  function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
  function show(id) {
    ["home", "quiz", "result"].forEach(function (v) { $(v).hidden = v !== id; });
    window.scrollTo(0, 0);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ----- Pagina principală ----- */
  var cfgSaved = load(LS_CFG) || {};
  var selChapters = Array.isArray(cfgSaved.chapters) ? cfgSaved.chapters.filter(function (id) {
    return CH.some(function (c) { return c.id === id; });
  }) : CH.map(function (c) { return c.id; });
  if (!selChapters.length) selChapters = CH.map(function (c) { return c.id; });
  var selCount = PRESETS.indexOf(cfgSaved.count) !== -1 ? cfgSaved.count : "10";
  var customVal = cfgSaved.custom || "";

  function chapterTitlesSelected() {
    return CH.filter(function (c) { return selChapters.indexOf(c.id) !== -1; }).map(function (c) { return c.title; });
  }
  function availableCount() {
    return filterQuestions(QS, chapterTitlesSelected()).length;
  }

  function renderStats() {
    var box = $("stats"); box.innerHTML = "";
    var items = [[QS.length, "întrebări disponibile"], [CH.length, "capitole"]];
    var last = load(LS_LAST);
    if (last) {
      var d = new Date(last.date);
      items.push([last.answered + " / " + last.total, "răspunsuri date în ultimul test (" + d.toLocaleDateString("ro-RO") + ")"]);
    }
    items.forEach(function (it) {
      var s = el("div", "stat"); s.appendChild(el("b", null, String(it[0]))); s.appendChild(el("span", null, it[1])); box.appendChild(s);
    });
  }

  function renderChapters() {
    var list = $("chapterList"); list.innerHTML = "";
    CH.forEach(function (c) {
      var lab = el("label", "check");
      var inp = document.createElement("input"); inp.type = "checkbox"; inp.value = c.id; inp.checked = selChapters.indexOf(c.id) !== -1;
      inp.addEventListener("change", function () {
        selChapters = CH.filter(function (x) {
          var cb = list.querySelector('input[value="' + x.id + '"]'); return cb.checked;
        }).map(function (x) { return x.id; });
        syncMaster(); updateHint();
      });
      lab.appendChild(inp); lab.appendChild(el("span", "box"));
      lab.appendChild(el("span", "txt", c.title)); lab.appendChild(el("span", "badge", c.count + " întrebări"));
      list.appendChild(lab);
    });
    $("allCount").textContent = QS.length + " întrebări";
    syncMaster();
  }
  function syncMaster() {
    var m = $("allChapters");
    m.checked = selChapters.length === CH.length;
    m.indeterminate = selChapters.length > 0 && selChapters.length < CH.length;
  }
  $("allChapters").addEventListener("change", function () {
    selChapters = this.checked ? CH.map(function (c) { return c.id; }) : [];
    document.querySelectorAll("#chapterList input").forEach(function (cb) { cb.checked = selChapters.indexOf(cb.value) !== -1; });
    syncMaster(); updateHint();
  });

  function renderChips() {
    var box = $("countChips"); box.innerHTML = "";
    PRESETS.forEach(function (p) {
      var lab = el("label", "chip");
      var inp = document.createElement("input"); inp.type = "radio"; inp.name = "count"; inp.value = p; inp.checked = selCount === p;
      inp.addEventListener("change", function () { selCount = p; $("customWrap").hidden = p !== "custom"; updateHint(); });
      lab.appendChild(inp); lab.appendChild(el("span", null, p === "custom" ? "Personalizat" : p));
      box.appendChild(lab);
    });
    $("customWrap").hidden = selCount !== "custom";
    $("customCount").value = customVal;
  }
  $("customCount").addEventListener("input", function () { customVal = this.value; updateHint(); });

  function wantedCount() {
    if (selCount === "custom") {
      var raw = String($("customCount").value).trim();
      if (!/^\d+$/.test(raw)) return NaN;
      return parseInt(raw, 10);
    }
    return parseInt(selCount, 10);
  }
  function updateHint() {
    var n = availableCount();
    $("availHint").textContent = "Disponibile în selecția curentă: " + n + " întrebări.";
    $("configError").hidden = true;
  }
  function showError(msg) { var e = $("configError"); e.textContent = msg; e.hidden = false; }

  $("configForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!selChapters.length) return showError("Selectează cel puțin un capitol.");
    var avail = availableCount(), n = wantedCount();
    if (!(n >= 1)) return showError("Introdu un număr valid de întrebări (minim 1).");
    if (n > avail) return showError("Ai cerut " + n + " întrebări, dar în selecția curentă sunt disponibile doar " + avail + ".");
    state.cfg = { chapters: selChapters.slice(), count: selCount, custom: customVal };
    save(LS_CFG, state.cfg);
    startQuiz(pickQuestions(QS, chapterTitlesSelected(), n));
  });

  /* ----- Quiz ----- */
  function startQuiz(list) {
    state.quiz = list; state.idx = 0; state.answers = {};
    show("quiz"); renderQuestion();
  }
  function answered(id) { return (state.answers[id] || []).length > 0; }
  function answeredCount() { return state.quiz.filter(function (q) { return answered(q.id); }).length; }

  function renderQuestion() {
    var q = state.quiz[state.idx], total = state.quiz.length;
    var card = $("questionCard"); card.innerHTML = "";
    card.appendChild(el("p", "meta", q.chapter));
    card.appendChild(el("h2", null, "Întrebarea " + q.originalNumber));
    card.appendChild(el("p", "qtext", q.question));
    card.appendChild(el("p", "multi-note", "Poți selecta unul sau mai multe răspunsuri. Apasă din nou pentru a deselecta."));
    var wrap = el("div", "opts"); wrap.setAttribute("role", "group"); wrap.setAttribute("aria-label", "Variante de răspuns");
    var sel = state.answers[q.id] || [];
    Object.keys(q.options).forEach(function (k) {
      var b = el("button", "opt"); b.type = "button"; b.dataset.key = k;
      b.setAttribute("aria-pressed", sel.indexOf(k) !== -1 ? "true" : "false");
      b.appendChild(el("span", "box")); b.appendChild(el("span", "lt", k + "."));
      b.appendChild(el("span", "ot", q.options[k]));
      b.addEventListener("click", function () { toggle(q.id, k); });
      wrap.appendChild(b);
    });
    card.appendChild(wrap);
    $("posText").textContent = (state.idx + 1) + " / " + total;
    $("barFill").style.width = ((state.idx + 1) / total * 100) + "%";
    $("bar").setAttribute("aria-valuenow", String(Math.round((state.idx + 1) / total * 100)));
    $("prevBtn").disabled = state.idx === 0;
    var last = state.idx === total - 1;
    $("nextBtn").hidden = last; $("finishBtn").hidden = !last;
    renderMeta();
  }
  function renderMeta() {
    var total = state.quiz.length, a = answeredCount();
    $("doneText").textContent = "Completate: " + a + " din " + total + " · Rămase: " + (total - a);
    var d = $("dots"); d.innerHTML = "";
    state.quiz.forEach(function (q, i) {
      var b = el("button", "dot" + (answered(q.id) ? " answered" : "") + (i === state.idx ? " current" : ""), String(i + 1));
      b.type = "button";
      b.setAttribute("aria-label", "Poziția " + (i + 1) + " (întrebarea " + q.originalNumber + ")" + (answered(q.id) ? ", completată" : ", necompletată"));
      b.addEventListener("click", function () { state.idx = i; renderQuestion(); });
      d.appendChild(b);
    });
  }
  function toggle(id, k) {
    var s = (state.answers[id] || []).slice(), i = s.indexOf(k);
    if (i === -1) s.push(k); else s.splice(i, 1);
    s.sort();
    if (s.length) state.answers[id] = s; else delete state.answers[id];
    var btns = $("questionCard").querySelectorAll(".opt");
    btns.forEach(function (b) { b.setAttribute("aria-pressed", s.indexOf(b.dataset.key) !== -1 ? "true" : "false"); });
    renderMeta();
  }
  $("prevBtn").addEventListener("click", function () { if (state.idx > 0) { state.idx--; renderQuestion(); } });
  $("nextBtn").addEventListener("click", function () { if (state.idx < state.quiz.length - 1) { state.idx++; renderQuestion(); } });
  $("finishBtn").addEventListener("click", finish);
  $("finishBtn2").addEventListener("click", finish);
  $("quitBtn").addEventListener("click", function () {
    if (answeredCount() === 0 || confirm("Ieși din test? Răspunsurile selectate se vor pierde.")) goHome();
  });
  document.addEventListener("keydown", function (e) {
    if ($("quiz").hidden || e.target.tagName === "INPUT" || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "ArrowLeft") $("prevBtn").click();
    else if (e.key === "ArrowRight") $("nextBtn").click();
    else if (/^[a-e]$/i.test(e.key)) {
      var q = state.quiz[state.idx], k = e.key.toLowerCase();
      if (q.options[k] !== undefined) toggle(q.id, k);
    }
  });

  function finish() {
    var total = state.quiz.length, a = answeredCount();
    if (a < total && !confirm("Ai " + (total - a) + " întrebări fără răspuns. Finalizezi testul?")) return;
    save(LS_LAST, { date: Date.now(), total: total, answered: a });
    renderResult(); show("result");
  }

  /* ----- Rezultat (fără corectare) ----- */
  function renderResult() {
    var total = state.quiz.length, a = answeredCount();
    $("doneLine").textContent = "Ai răspuns la " + a + " din " + total + " întrebări.";
    var list = $("summaryList"); list.innerHTML = "";
    state.quiz.forEach(function (q, i) {
      var li = el("li"), b = el("button"); b.type = "button";
      b.appendChild(el("span", "qn", "Întrebarea " + q.originalNumber));
      li.appendChild(b);
      var s = state.answers[q.id] || [];
      li.appendChild(el("span", "sel" + (s.length ? "" : " none"), s.length ? s.join(", ") : "fără răspuns"));
      b.addEventListener("click", function () { state.idx = i; show("quiz"); renderQuestion(); });
      list.appendChild(li);
    });
  }
  $("reviewBtn").addEventListener("click", function () { state.idx = 0; show("quiz"); renderQuestion(); });
  $("retakeBtn").addEventListener("click", function () { startQuiz(state.quiz.slice()); });
  $("newBtn").addEventListener("click", function () {
    var n = state.quiz.length, titles = chapterTitlesSelected();
    var fresh = pickQuestions(QS, titles, n) || pickQuestions(QS, titles, availableCount());
    if (fresh) startQuiz(fresh); else goHome();
  });
  $("homeBtn").addEventListener("click", goHome);
  $("brandLink").addEventListener("click", function (e) {
    e.preventDefault();
    if (!$("quiz").hidden && answeredCount() > 0 && !confirm("Ieși din test? Răspunsurile selectate se vor pierde.")) return;
    goHome();
  });
  function goHome() { renderStats(); updateHint(); show("home"); }

  renderStats(); renderChapters(); renderChips(); updateHint();
})(typeof window !== "undefined" ? window : globalThis);
