(function () {
  'use strict';

  /* ================= Config & helpers ================= */
  var STORAGE_KEY = 'quizState.v1';
  var THEME_KEY = 'quizTheme.v1';
  var PRESET_COUNTS = [5, 10, 20, 30, 50];
  var MAX_LINK_IDS = 1000;
  var SHARE_TEXT = 'Uite testul pe care l-am generat:';

  var byId = new Map();
  questions.forEach(function (q) { byId.set(q.id, q); });
  var chapterCounts = new Map();
  questions.forEach(function (q) { chapterCounts.set(q.chapter, (chapterCounts.get(q.chapter) || 0) + 1); });

  function $(id) { return document.getElementById(id); }
  var el = {};
  ['screen-home', 'screen-test', 'screen-done', 'screen-error', 'chapter-list', 'ch-all', 'ch-none', 'chapter-summary', 'count-chips', 'custom-wrap',
    'custom-count', 'available-hint', 'home-error', 'generate-btn', 'test-scope', 'test-sub', 'share-btn',
    'new-test-btn', 'progress-text', 'progress', 'progress-fill', 'shared-banner', 'q-chapter', 'q-num', 'q-text',
    'options', 'prev-btn', 'next-btn', 'finish-btn-main', 'finish-btn', 'navigator', 'navigator-summary', 'qgrid',
    'review-btn', 'done-new-btn', 'error-title', 'error-text', 'error-partial-btn', 'error-home-btn',
    'share-dialog', 'share-url', 'copy-btn', 'wa-btn', 'share-close', 'copy-feedback', 'file-warning',
    'confirm-dialog', 'confirm-title', 'confirm-text', 'confirm-ok', 'confirm-cancel', 'theme-toggle', 'brand-link',
    'question-card', 'copy-link-btn', 'review-list'
  ].forEach(function (id) { el[id] = $(id); });

  /* ---------- storage (cu try/catch) ---------- */
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignorat */ } }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignorat */ } }

  /* ---------- random: Fisher-Yates cu index uniform ---------- */
  function randInt(max) {
    if (window.crypto && window.crypto.getRandomValues) {
      var range = 4294967296;
      var limit = range - (range % max);
      var buf = new Uint32Array(1), x;
      do { window.crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
      return x % max;
    }
    return Math.floor(Math.random() * max);
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = randInt(i + 1);
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ================= Stare ================= */
  // state = { ids: [...], answers: { id: ['a','c'] }, current: 0, finished: false, shared: false }
  var state = null;
  var selectedCodes = new Set();
  var selectedCount = 10;   // număr preset sau 'custom'
  var errorPartialIds = null;

  function saveState() {
    if (!state) { lsDel(STORAGE_KEY); return; }
    lsSet(STORAGE_KEY, JSON.stringify(state));
  }
  function loadState() {
    var raw = lsGet(STORAGE_KEY);
    if (!raw) return null;
    try {
      var s = JSON.parse(raw);
      if (!s || !Array.isArray(s.ids) || !s.ids.length) return null;
      var ids = s.ids.filter(function (id) { return typeof id === 'string' && byId.has(id); });
      if (ids.length !== s.ids.length) return null; // testul salvat nu mai corespunde bazei de date
      var answers = {};
      if (s.answers && typeof s.answers === 'object') {
        ids.forEach(function (id) {
          var a = s.answers[id];
          if (Array.isArray(a)) {
            var clean = a.filter(function (k) { return byId.get(id).options[k] !== undefined; });
            if (clean.length) answers[id] = clean;
          }
        });
      }
      var cur = parseInt(s.current, 10);
      if (!(cur >= 0 && cur < ids.length)) cur = 0;
      return { ids: ids, answers: answers, current: cur, finished: !!s.finished, shared: !!s.shared };
    } catch (e) { return null; }
  }
  function hasAnswers(s) { return !!s && Object.keys(s.answers).some(function (k) { return s.answers[k].length; }); }
  function sameIds(a, b) { return a.length === b.length && a.every(function (v, i) { return v === b[i]; }); }
  function newState(ids, shared) { return { ids: ids, answers: {}, current: 0, finished: false, shared: !!shared }; }

  /* ================= URL ================= */
  function baseUrl() { return window.location.href.split('#')[0].split('?')[0]; }
  function clearUrlParam() {
    try { window.history.replaceState(null, '', baseUrl()); } catch (e) { /* ex. file:// în unele browsere */ }
  }
  function readSharedParam() {
    var raw = null;
    try {
      var sp = new URLSearchParams(window.location.search);
      if (sp.has('t')) raw = sp.get('t');
    } catch (e) { /* ignorat */ }
    if (raw === null && window.location.hash) {
      var m = /^#t=(.*)$/.exec(window.location.hash);
      if (m) { try { raw = decodeURIComponent(m[1]); } catch (e2) { raw = m[1]; } }
    }
    return raw;
  }
  function buildShareUrl() { return baseUrl() + '?t=' + state.ids.join(','); }

  /* ================= Ecrane ================= */
  var SCREENS = ['screen-home', 'screen-test', 'screen-done', 'screen-error'];
  function showScreen(id) {
    SCREENS.forEach(function (s) { el[s].hidden = (s !== id); });
    window.scrollTo(0, 0);
  }

  function showHome() {
    state = null;
    errorPartialIds = null;
    updateAvailability();
    showScreen('screen-home');
  }

  function showError(title, text, partialIds) {
    el['error-title'].textContent = title;
    el['error-text'].textContent = text;
    errorPartialIds = partialIds && partialIds.length ? partialIds : null;
    if (errorPartialIds) {
      el['error-partial-btn'].textContent = 'Deschide cele ' + errorPartialIds.length + ' întrebări găsite';
      el['error-partial-btn'].hidden = false;
    } else {
      el['error-partial-btn'].hidden = true;
    }
    showScreen('screen-error');
  }

  /* ================= Pagina principală ================= */
  function buildHome() {
    var list = el['chapter-list'];
    list.innerHTML = '';
    chapters.forEach(function (c) {
      selectedCodes.add(c.code);
      var label = document.createElement('label');
      label.className = 'ch-item';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.value = c.code;
      input.checked = true;
      input.addEventListener('change', function () {
        if (input.checked) selectedCodes.add(c.code); else selectedCodes.delete(c.code);
        updateAvailability();
      });
      var name = document.createElement('span');
      name.className = 'ch-name';
      name.textContent = c.name;
      var cnt = document.createElement('span');
      cnt.className = 'ch-count';
      cnt.textContent = String(chapterCounts.get(c.name) || 0);
      label.appendChild(input);
      label.appendChild(name);
      label.appendChild(cnt);
      list.appendChild(label);
    });
    function setAll(on) {
      selectedCodes.clear();
      Array.prototype.forEach.call(list.querySelectorAll('input'), function (i) {
        i.checked = on;
        if (on) selectedCodes.add(i.value);
      });
      updateAvailability();
    }
    el['ch-all'].addEventListener('click', function () { setAll(true); });
    el['ch-none'].addEventListener('click', function () { setAll(false); });

    var box = el['count-chips'];
    box.innerHTML = '';
    PRESET_COUNTS.concat(['custom']).forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.value = String(v);
      b.textContent = v === 'custom' ? 'Personalizat' : String(v);
      b.addEventListener('click', function () {
        selectedCount = v;
        refreshChips();
        if (v === 'custom') el['custom-count'].focus();
        updateAvailability();
      });
      box.appendChild(b);
    });
    refreshChips();

    el['custom-count'].addEventListener('input', updateAvailability);
    el['generate-btn'].addEventListener('click', onGenerate);
    el['custom-count'].addEventListener('keydown', function (e) { if (e.key === 'Enter') onGenerate(); });
  }

  function refreshChips() {
    Array.prototype.forEach.call(el['count-chips'].children, function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.value === String(selectedCount)));
    });
    el['custom-wrap'].hidden = (selectedCount !== 'custom');
  }

  function currentPool() {
    var names = {};
    chapters.forEach(function (c) { if (selectedCodes.has(c.code)) names[c.name] = true; });
    return questions.filter(function (q) { return names[q.chapter]; });
  }

  function requestedCount() {
    if (selectedCount !== 'custom') return selectedCount;
    var raw = el['custom-count'].value.trim();
    if (raw === '') return NaN;
    return Number(raw);
  }

  function validateRequest() {
    var pool = currentPool();
    var n = requestedCount();
    if (!selectedCodes.size) return { error: 'Alege cel puțin un capitol.' };
    if (!pool.length) return { error: 'Nu există întrebări pentru selecția aleasă.' };
    if (!isFinite(n) || n !== Math.floor(n) || n < 1) {
      return { error: 'Introdu un număr întreg de întrebări, de cel puțin 1.' };
    }
    if (n > pool.length) {
      return { error: 'Ai cerut ' + n + ' întrebări, dar pentru selecția aleasă sunt disponibile doar ' + pool.length + '. Alege un număr mai mic sau alt capitol.' };
    }
    return { pool: pool, n: n };
  }

  function updateAvailability() {
    var pool = currentPool();
    el['chapter-summary'].textContent = selectedCodes.size === chapters.length
      ? 'Toate capitolele selectate'
      : selectedCodes.size + (selectedCodes.size === 1 ? ' capitol selectat' : ' capitole selectate');
    el['available-hint'].textContent = 'Întrebări disponibile pentru selecția aleasă: ' + pool.length;
    el['custom-count'].max = String(pool.length);
    el['home-error'].hidden = true;
  }

  function onGenerate() {
    var v = validateRequest();
    if (v.error) {
      el['home-error'].textContent = v.error;
      el['home-error'].hidden = false;
      return;
    }
    el['home-error'].hidden = true;
    var picked = shuffle(v.pool).slice(0, v.n); // fără duplicate: elementele sunt unice în pool
    clearUrlParam();
    state = newState(picked.map(function (q) { return q.id; }), false);
    saveState();
    renderTest();
  }

  /* ================= Testul ================= */
  function scopeLabel(ids) {
    var names = [];
    ids.forEach(function (id) {
      var n = byId.get(id).chapter;
      if (names.indexOf(n) === -1) names.push(n);
    });
    if (names.length === 1) return { short: names[0], full: names[0] };
    var full = names.join(' • ');
    if (names.length === chapters.length) return { short: 'Toate capitolele', full: full };
    if (names.length <= 3) return { short: full, full: full };
    return { short: names.length + ' capitole', full: full };
  }

  function renderTest() {
    if (!state) { showHome(); return; }
    if (state.finished) { renderReview(); showScreen('screen-done'); return; }
    showScreen('screen-test');
    var sc = scopeLabel(state.ids);
    el['test-scope'].textContent = sc.short;
    el['test-scope'].title = sc.full;
    el['test-sub'].textContent = state.ids.length + (state.ids.length === 1 ? ' întrebare' : ' întrebări');
    el['shared-banner'].hidden = !state.shared;
    renderGrid();
    renderQuestion();
  }

  function optionLabel(q, key, idx) {
    return q.numberedOptions ? String(idx + 1) : key.toUpperCase();
  }

  function renderQuestion() {
    var total = state.ids.length;
    var i = state.current;
    var q = byId.get(state.ids[i]);

    el['progress-text'].textContent = 'Întrebarea ' + (i + 1) + ' / ' + total;
    var pct = Math.round(((i + 1) / total) * 100);
    el['progress-fill'].style.width = pct + '%';
    el['progress'].setAttribute('aria-valuenow', String(pct));

    el['q-chapter'].textContent = q.chapter;
    el['q-num'].textContent = q.originalNumber + '.';   // numărul ORIGINAL
    el['q-text'].textContent = q.question;

    var box = el['options'];
    box.innerHTML = '';
    var selected = state.answers[q.id] || [];
    var keys = Object.keys(q.options).sort();
    keys.forEach(function (key, idx) {
      var label = document.createElement('label');
      label.className = 'opt' + (selected.indexOf(key) !== -1 ? ' selected' : '');
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.value = key;
      input.checked = selected.indexOf(key) !== -1;
      input.addEventListener('change', function () { onToggle(q.id, key, input.checked, label); });
      var mark = document.createElement('span');
      mark.className = 'box';
      mark.textContent = optionLabel(q, key, idx);
      var txt = document.createElement('span');
      txt.className = 'txt';
      txt.textContent = q.options[key];
      label.appendChild(input);
      label.appendChild(mark);
      label.appendChild(txt);
      box.appendChild(label);
    });

    var last = (i === total - 1);
    el['prev-btn'].disabled = (i === 0);
    el['next-btn'].hidden = last;
    el['finish-btn-main'].hidden = !last;
    updateGrid();
  }

  function onToggle(id, key, checked, labelEl) {
    var list = (state.answers[id] || []).slice();
    var pos = list.indexOf(key);
    if (checked && pos === -1) list.push(key);
    if (!checked && pos !== -1) list.splice(pos, 1);
    list.sort();
    if (list.length) state.answers[id] = list; else delete state.answers[id];
    labelEl.classList.toggle('selected', checked);
    saveState();
    updateGrid();
  }

  function renderGrid() {
    var grid = el['qgrid'];
    grid.innerHTML = '';
    state.ids.forEach(function (id, idx) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'qchip';
      b.textContent = String(idx + 1);
      b.title = 'Întrebarea ' + (idx + 1) + ' (nr. original ' + byId.get(id).originalNumber + ')';
      b.addEventListener('click', function () { goTo(idx); });
      grid.appendChild(b);
    });
  }

  function updateGrid() {
    var answered = 0;
    Array.prototype.forEach.call(el['qgrid'].children, function (b, idx) {
      var id = state.ids[idx];
      var has = !!(state.answers[id] && state.answers[id].length);
      if (has) answered++;
      b.classList.toggle('answered', has);
      b.classList.toggle('current', idx === state.current);
      if (idx === state.current) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    el['navigator-summary'].textContent = 'Toate întrebările (' + answered + ' / ' + state.ids.length + ' cu răspuns selectat)';
  }

  function goTo(i) {
    if (!state || i < 0 || i >= state.ids.length) return;
    state.current = i;
    saveState();
    renderQuestion();
    var head = document.querySelector('.test-head');
    var top = el['question-card'].getBoundingClientRect().top + window.pageYOffset - (head ? head.offsetHeight + 16 : 16);
    window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
  }

  function renderReview() {
    var box = el['review-list'];
    box.innerHTML = '';
    state.ids.forEach(function (id, idx) {
      var q = byId.get(id);
      var sel = state.answers[id] || [];
      var item = document.createElement('article');
      item.className = 'review-item';
      var head = document.createElement('div');
      head.className = 'review-head';
      var qbox = document.createElement('div');
      qbox.className = 'review-q';
      var ch = document.createElement('span');
      ch.className = 'review-chapter';
      ch.textContent = 'Întrebarea ' + (idx + 1) + ' / ' + state.ids.length + ' • ' + q.chapter;
      var num = document.createElement('span');
      num.className = 'q-num';
      num.textContent = q.originalNumber + '.';
      qbox.appendChild(ch);
      qbox.appendChild(num);
      qbox.appendChild(document.createTextNode(q.question));
      var edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn small';
      edit.textContent = 'Modifică';
      edit.addEventListener('click', function () {
        state.finished = false;
        state.current = idx;
        saveState();
        renderTest();
      });
      head.appendChild(qbox);
      head.appendChild(edit);
      item.appendChild(head);
      var ul = document.createElement('ul');
      ul.className = 'review-opts';
      Object.keys(q.options).sort().forEach(function (key, oi) {
        var li = document.createElement('li');
        var on = sel.indexOf(key) !== -1;
        if (on) li.className = 'selected';
        var k = document.createElement('span');
        k.className = 'k';
        k.textContent = (on ? '✓ ' : '') + optionLabel(q, key, oi);
        var t = document.createElement('span');
        t.textContent = q.options[key];
        li.appendChild(k);
        li.appendChild(t);
        ul.appendChild(li);
      });
      item.appendChild(ul);
      if (!sel.length) {
        var none = document.createElement('p');
        none.className = 'review-none';
        none.textContent = 'Niciun răspuns selectat.';
        item.appendChild(none);
      }
      box.appendChild(item);
    });
  }

  function copyToClipboard(text) {
    return new Promise(function (resolve) {
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var okc = false;
        try { okc = document.execCommand('copy'); } catch (e) { okc = false; }
        document.body.removeChild(ta);
        resolve(okc);
      }
      if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { resolve(true); }, fallback);
      } else { fallback(); }
    });
  }

  var copyBtnTimer = null;
  function copyLinkQuick() {
    if (!state) return;
    var url = buildShareUrl();
    var btn = el['copy-link-btn'];
    copyToClipboard(url).then(function (okc) {
      btn.textContent = okc ? 'Link copiat ✓' : 'Copiere eșuată';
      if (!okc) openShareDialog(url);
      clearTimeout(copyBtnTimer);
      copyBtnTimer = setTimeout(function () { btn.textContent = 'Copiază linkul'; }, 2000);
    });
  }

  /* ================= Dialoguri ================= */
  function openDialog(d) {
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); }
    else { d.setAttribute('open', ''); }
  }
  function closeDialog(d) {
    if (typeof d.close === 'function') { if (d.open) d.close(); }
    else { d.removeAttribute('open'); }
  }

  var confirmResolve = null;
  function confirmBox(title, text, okLabel) {
    return new Promise(function (resolve) {
      el['confirm-title'].textContent = title;
      el['confirm-text'].textContent = text;
      el['confirm-ok'].textContent = okLabel || 'Continuă';
      confirmResolve = resolve;
      openDialog(el['confirm-dialog']);
    });
  }
  function settleConfirm(val) {
    var r = confirmResolve; confirmResolve = null;
    closeDialog(el['confirm-dialog']);
    if (r) r(val);
  }

  /* ================= Partajare ================= */
  function shareTest() {
    if (!state) return;
    var url = buildShareUrl();
    var data = { title: 'Test grile', text: SHARE_TEXT, url: url };
    var canNative = typeof navigator.share === 'function' && (typeof navigator.canShare !== 'function' || navigator.canShare(data));
    if (canNative) {
      navigator.share(data).catch(function (err) {
        if (err && err.name === 'AbortError') return; // utilizatorul a închis fereastra de partajare
        openShareDialog(url);
      });
      return;
    }
    openShareDialog(url);
  }

  function openShareDialog(url) {
    el['share-url'].value = url;
    el['copy-feedback'].textContent = '';
    el['file-warning'].hidden = (window.location.protocol !== 'file:');
    el['wa-btn'].href = 'https://wa.me/?text=' + encodeURIComponent(SHARE_TEXT + '\n' + url);
    openDialog(el['share-dialog']);
  }

  function copyLink() {
    var url = el['share-url'].value;
    function ok() { el['copy-feedback'].textContent = 'Link copiat în clipboard.'; }
    function fallback() {
      try {
        el['share-url'].focus();
        el['share-url'].select();
        el['share-url'].setSelectionRange(0, url.length);
        if (document.execCommand('copy')) { ok(); return; }
      } catch (e) { /* ignorat */ }
      el['copy-feedback'].textContent = 'Nu am putut copia automat. Selectează linkul și copiază-l manual.';
    }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(ok, fallback);
    } else {
      fallback();
    }
  }

  /* ================= Test partajat (din link) ================= */
  function handleSharedParam(raw) {
    var tokens = (raw || '').split(/[,\s;]+/).filter(function (t) { return t.length > 0; });
    if (!tokens.length) {
      showError('Link invalid', 'Linkul nu conține nicio întrebare. Cere persoanei care ți l-a trimis să genereze și să partajeze din nou testul.');
      return;
    }
    if (tokens.length > MAX_LINK_IDS) {
      showError('Link invalid', 'Linkul conține prea multe întrebări și nu poate fi deschis.');
      return;
    }
    var seen = {}, valid = [], invalid = [];
    tokens.forEach(function (t) {
      if (seen[t]) return;       // dublurile din link sunt ignorate
      seen[t] = true;
      if (byId.has(t)) valid.push(t); else invalid.push(t);
    });
    if (invalid.length) {
      var sample = invalid.slice(0, 3).map(function (s) { return s.length > 24 ? s.slice(0, 24) + '…' : s; }).join(', ');
      var msg = invalid.length + (invalid.length === 1 ? ' întrebare din link nu există' : ' întrebări din link nu există') +
        ' în această versiune a site-ului (ex.: ' + sample + '). Linkul poate fi vechi, incomplet sau modificat.';
      if (!valid.length) msg += ' Nu am găsit nicio întrebare validă.';
      showError('Link de test invalid', msg, valid);
      return;
    }
    openSharedIds(valid);
  }

  function openSharedIds(ids) {
    var saved = loadState();
    if (saved && sameIds(saved.ids, ids)) {          // același test: păstrez răspunsurile proprii
      saved.shared = true;
      state = saved;
      saveState();
      renderTest();
      return;
    }
    if (hasAnswers(saved) && !saved.finished) {
      confirmBox('Ai un test început',
        'Deschizând testul primit prin link, testul curent și răspunsurile lui vor fi înlocuite.',
        'Deschide testul din link').then(function (yes) {
        if (yes) { state = newState(ids, true); saveState(); renderTest(); }
        else { state = saved; clearUrlParam(); renderTest(); }
      });
      return;
    }
    state = newState(ids, true);
    saveState();
    renderTest();
  }

  /* ================= Acțiuni ================= */
  function askNewTest() {
    var go = function () { state = null; saveState(); clearUrlParam(); showHome(); };
    if (state && hasAnswers(state) && !state.finished) {
      confirmBox('Test nou', 'Testul curent și răspunsurile selectate vor fi șterse de pe acest dispozitiv.', 'Test nou')
        .then(function (yes) { if (yes) go(); });
    } else { go(); }
  }

  function askFinish() {
    var unanswered = state.ids.filter(function (id) { return !(state.answers[id] && state.answers[id].length); }).length;
    var doFinish = function () { state.finished = true; saveState(); renderTest(); };
    if (unanswered > 0) {
      confirmBox('Finalizezi testul?',
        'Pentru ' + unanswered + (unanswered === 1 ? ' întrebare' : ' întrebări') + ' nu ai selectat niciun răspuns.',
        'Finalizează testul').then(function (yes) { if (yes) doFinish(); });
    } else { doFinish(); }
  }

  function bind() {
    el['share-btn'].addEventListener('click', shareTest);
    el['copy-link-btn'].addEventListener('click', copyLinkQuick);
    el['new-test-btn'].addEventListener('click', askNewTest);
    el['done-new-btn'].addEventListener('click', askNewTest);
    el['prev-btn'].addEventListener('click', function () { goTo(state.current - 1); });
    el['next-btn'].addEventListener('click', function () { goTo(state.current + 1); });
    el['finish-btn'].addEventListener('click', askFinish);
    el['finish-btn-main'].addEventListener('click', askFinish);
    el['review-btn'].addEventListener('click', function () { state.finished = false; state.current = 0; saveState(); renderTest(); });
    el['error-home-btn'].addEventListener('click', function () { state = null; clearUrlParam(); showHome(); });
    el['error-partial-btn'].addEventListener('click', function () {
      var ids = errorPartialIds; errorPartialIds = null;
      clearUrlParam();
      state = newState(ids, true); saveState(); renderTest();
    });
    el['brand-link'].addEventListener('click', function (e) {
      e.preventDefault();
      if (state && !state.finished) askNewTest(); else { clearUrlParam(); showHome(); }
    });

    el['copy-btn'].addEventListener('click', copyLink);
    el['share-close'].addEventListener('click', function () { closeDialog(el['share-dialog']); });
    el['share-url'].addEventListener('focus', function () { el['share-url'].select(); });

    el['confirm-ok'].addEventListener('click', function () { settleConfirm(true); });
    el['confirm-cancel'].addEventListener('click', function () { settleConfirm(false); });
    el['confirm-dialog'].addEventListener('cancel', function (e) { e.preventDefault(); settleConfirm(false); });

    document.addEventListener('keydown', function (e) {
      if (!state || state.finished || el['screen-test'].hidden) return;
      if (el['share-dialog'].open || el['confirm-dialog'].open) return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' && e.target.type !== 'checkbox') return;
      if (e.key === 'ArrowRight' && state.current < state.ids.length - 1) goTo(state.current + 1);
      if (e.key === 'ArrowLeft' && state.current > 0) goTo(state.current - 1);
    });

    el['theme-toggle'].addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      var next = cur === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      lsSet(THEME_KEY, next);
    });
  }

  /* ================= Inițializare ================= */
  function init() {
    var theme = lsGet(THEME_KEY);
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
    el['navigator'].open = window.matchMedia && window.matchMedia('(min-width: 720px)').matches;

    if (!Array.isArray(questions) || !questions.length) {
      showError('Baza de întrebări este goală', 'Fișierul data.js nu conține întrebări.');
      return;
    }
    buildHome();
    bind();

    var shared = readSharedParam();
    if (shared !== null) { handleSharedParam(shared); return; }

    var saved = loadState();
    if (saved) { state = saved; renderTest(); }
    else { showHome(); }
  }

  init();
})();
