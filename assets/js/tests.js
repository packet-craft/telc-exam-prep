/* Model tests page. Needs common.js (App).
   Without ?test=...   shows the list from data/tests/index.json.
   With ?test=test-1   runs data/tests/test-1.json.
   Answers and results are saved in localStorage ("bb2:test:<id>", "bb2:results"). */
(function () {
  "use strict";

  var el = App.el;
  var root = document.getElementById("app");

  // Official point values. Only these sections are scored automatically.
  var SCORING = {
    "lesen": { skill: "Lesen", points: 3 },
    "lesen-schreiben": { skill: "Lesen", points: 3 },
    "hoeren": { skill: "Hören", points: 3 },
    "hoeren-schreiben": { skill: "Hören", points: 3 },
    "sprachbausteine-schreiben": { skill: "Sprachbausteine", points: 0.5 }
  };
  var MAX = { "Lesen": 60, "Hören": 60, "Sprachbausteine": 6 };
  var PASS_SHARE = 0.6;

  var test = null;      // loaded test file
  var state = null;     // { answers: {n: value}, texts: {key: string}, checked: {sectionId: true}, section: id }
  var timers = {};      // sectionId -> { left: seconds, handle }

  function saveState() { App.save("test:" + test.id, state); }

  // =====================================================================
  // Test list
  // =====================================================================

  function showList() {
    App.loadJSON("data/tests/index.json").then(function (index) {
      var results = App.load("results", {});
      root.textContent = "";
      root.appendChild(el("h1", null, "Model tests"));
      root.appendChild(el("p", null,
        "Each test follows the official structure: 58 items in six parts. Reading, listening and the " +
        "Sprachbausteine are checked automatically; writing and speaking come with model answers for self-assessment."));
      var list = el("div", { class: "test-list" });
      index.tests.forEach(function (t) {
        var id = t.file.replace(/\.json$/, "");
        var r = results[id];
        list.appendChild(el("div", { class: "card" },
          el("div", null,
            el("h2", null, t.title),
            el("p", { class: "muted small" }, r
              ? "Last result (" + r.date + "): Lesen " + r.scores["Lesen"] + "/60 · Hören " + r.scores["Hören"] +
                "/60 · Sprachbausteine " + r.scores["Sprachbausteine"] + "/6"
              : "Not taken yet")),
          el("a", { class: "btn primary", href: "tests.html?test=" + encodeURIComponent(id) }, r ? "Open" : "Start")));
      });
      root.appendChild(list);
    }).catch(function (err) { App.showError(root, err); });
  }

  // =====================================================================
  // Listening: audio file if the data names one, otherwise speech synthesis
  // =====================================================================

  var synth = window.speechSynthesis || null;
  var playingBtn = null;

  function germanVoices() {
    if (!synth) return [];
    return synth.getVoices().filter(function (v) { return /^de([-_]|$)/i.test(v.lang); });
  }

  function stopSpeech() {
    if (synth) synth.cancel();
    if (playingBtn) { playingBtn.textContent = "▶ Play"; playingBtn = null; }
  }

  /** Read a transcript aloud. Each speaker gets their own voice where the device has several
      German voices, and a different pitch otherwise. */
  function speak(transcript, button) {
    stopSpeech();
    stopAudio();
    var voices = germanVoices();
    var speakers = [];
    transcript.forEach(function (l) { if (speakers.indexOf(l.speaker) < 0) speakers.push(l.speaker); });
    playingBtn = button;
    button.textContent = "■ Stop";
    var queue = [];
    transcript.forEach(function (line) {
      // Short utterances: some browsers cut off long ones.
      (line.text.match(/[^.!?]+[.!?]*["“]?\s*/g) || [line.text]).forEach(function (sentence) {
        if (!sentence.trim()) return;
        var u = new SpeechSynthesisUtterance(sentence.trim());
        var idx = speakers.indexOf(line.speaker);
        u.lang = "de-DE";
        if (voices.length) u.voice = voices[idx % voices.length];
        u.pitch = (line.voice === "f" ? 1.15 : 0.8) + (voices.length > 1 ? 0 : 0.08 * (idx % 3));
        u.rate = 0.95;
        queue.push(u);
      });
    });
    queue[queue.length - 1].onend = function () { if (playingBtn === button) stopSpeech(); };
    queue.forEach(function (u) { synth.speak(u); });
  }

  // ---------- recordings (MP3) ----------
  // One shared audio element, so only one recording plays at a time.
  var audio = new Audio();
  var audioKey = null;   // which clip is loaded
  var audioUi = null;    // { update, fail } of the player showing that clip

  function stopAudio() {
    audio.pause();
    audio.removeAttribute("src");
    audioKey = null;
    if (audioUi) { var ui = audioUi; audioUi = null; ui.update(); }
  }

  function stopAll() { stopSpeech(); stopAudio(); }

  ["timeupdate", "ended", "pause", "play", "loadedmetadata"].forEach(function (name) {
    audio.addEventListener(name, function () { if (audioUi) audioUi.update(name); });
  });
  audio.addEventListener("error", function () {
    if (!audioUi) return;
    var ui = audioUi; audioKey = null; audioUi = null; ui.fail();
  });

  function clock(sec) {
    if (!isFinite(sec)) return "0:00";
    var s = Math.floor(sec % 60);
    return Math.floor(sec / 60) + ":" + (s < 10 ? "0" : "") + s;
  }

  /** Exam mode is on by default and switches itself off for a part once its answers are checked. */
  function examAudio(checked) { return state.examAudio !== false && !checked; }

  /**
   * Player for one recording.
   * Exam mode: one button, the recording plays once and cannot be paused or rewound.
   * Practice mode: play/pause and a slider to jump back and forth.
   */
  function recordingPlayer(stim, key, checked, onFail) {
    var exam = examAudio(checked);
    var mine = function () { return audioKey === key; };
    var btn = el("button", { class: "btn primary", type: "button" });
    var bar = exam
      ? el("progress", { class: "audio-progress", max: "1", value: "0", "aria-label": "Playback progress" })
      : el("input", { class: "audio-progress", type: "range", min: "0", max: "1", step: "0.001", value: "0",
          "aria-label": "Position in the recording" });
    var time = el("span", { class: "small muted audio-time" }, "");
    var ui = {
      update: function (event) {
        var playing = mine() && !audio.paused && !audio.ended;
        if (event === "ended" && mine()) { audioKey = null; audioUi = null; playing = false; }
        var active = mine();
        var played = !!state.played[key];
        if (exam) {
          btn.textContent = playing ? "Playing\u2026" : played ? "Played" : "\u25b6 Play once";
          btn.disabled = playing || played;
          btn.classList.toggle("primary", !played && !playing);
        } else {
          btn.textContent = playing ? "\u23f8 Pause" : "\u25b6 Play";
        }
        if (active && isFinite(audio.duration) && audio.duration > 0) {
          bar.value = String(audio.currentTime / audio.duration);
          time.textContent = clock(audio.currentTime) + " / " + clock(audio.duration);
        } else if (!active) {
          bar.value = exam && played ? "1" : "0";
          time.textContent = exam && played ? "Heard once, as in the exam." : "";
        }
      },
      fail: function () { onFail(); }
    };
    var start = function () {
      stopAll();
      audioKey = key; audioUi = ui;
      audio.src = stim.audio;
      if (exam) { state.played[key] = true; saveState(); }   // starting counts as the one hearing
      var p = audio.play();
      if (p && p.catch) p.catch(function () { /* the error event shows the fallback */ });
      ui.update();
    };
    btn.addEventListener("click", function () {
      if (exam) { start(); return; }
      if (!mine()) start();
      else if (audio.paused) audio.play();
      else audio.pause();
    });
    if (!exam) {
      bar.addEventListener("input", function () {
        if (mine() && isFinite(audio.duration)) audio.currentTime = Number(bar.value) * audio.duration;
      });
    }
    ui.update();
    return [btn, bar, time];
  }

  function renderAudio(stim, sectionId, partId) {
    var box = el("div", { class: "stimulus" });
    if (stim.title) box.appendChild(el("h4", { lang: "de" }, stim.title));
    var checked = !!state.checked[sectionId];
    var transcript = el("div", { class: "transcript", lang: "de", hidden: !checked },
      stim.transcript.map(function (l) { return el("p", null, el("strong", null, l.speaker + ": "), l.text); }));
    var controls = el("div", { class: "audio-box" });

    // Computer voice: used when the data names no recording, or the recording cannot be loaded.
    var addSpeechControls = function () {
      if (!synth) { warn.hidden = false; show.hidden = checked; return; }
      var btn = el("button", { class: "btn", type: "button", onclick: function () {
        if (playingBtn === btn) { stopSpeech(); return; }
        if (!germanVoices().length) { warn.hidden = false; show.hidden = checked; }
        speak(stim.transcript, btn);
      } }, "\u25b6 Play");
      controls.appendChild(btn);
      controls.appendChild(el("span", { class: "small muted" }, "Computer voice. In the exam you hear each recording once."));
    };
    var warn = el("p", { class: "small note", hidden: true },
      "No German voice is available in this browser, so playback may not work or may sound wrong. You can read the transcript instead.");
    var show = el("button", { class: "btn", type: "button", hidden: true,
      onclick: function () { transcript.hidden = false; show.hidden = true; } }, "Show transcript");

    if (stim.audio) {
      recordingPlayer(stim, partId + "/" + stim.id, checked,
        function () { controls.textContent = ""; addSpeechControls(); })
        .forEach(function (node) { controls.appendChild(node); });
    } else {
      addSpeechControls();
    }
    box.appendChild(controls);
    box.appendChild(warn);
    box.appendChild(show);
    box.appendChild(transcript);
    return box;
  }

  // =====================================================================
  // Rendering a test
  // =====================================================================

  function renderText(stim) {
    return el("div", { class: "stimulus", lang: "de" },
      stim.title ? el("h4", null, stim.title) : null, App.paragraphs(stim.body));
  }

  function optionLabel(part, key) {
    if (key === "x") return "x – keine passende Antwort";
    var o = part.options.filter(function (x) { return x.key === key; })[0];
    if (!o) return key;
    var label = part.gapText ? o.text : (o.title || o.text);
    if (label.length > 60) label = label.slice(0, 57) + "…";
    return key + " – " + label;
  }

  function answerText(part, item, value) {
    if (value === undefined || value === null || value === "") return "no answer";
    if (item.type === "tf") return value ? "richtig" : "falsch";
    if (item.type === "mc") return value + ") " + item.options[value];
    return optionLabel(part, value);
  }

  function renderItem(part, item, sectionId) {
    var checked = !!state.checked[sectionId];
    var given = state.answers[item.n];
    var name = "q" + item.n;
    var box = el("div", { class: "item", id: "item-" + item.n });
    var setAnswer = function (v) { state.answers[item.n] = v; saveState(); };
    var legend = [el("span", { class: "n" }, item.n + "."), " ",
      el("span", { lang: "de", class: (item.prompt || "").length > 110 ? "long" : null }, item.prompt || "")];

    if (item.type === "match") {
      var select = el("select", { id: name, disabled: checked, "aria-label": "Answer for item " + item.n,
        onchange: function () { setAnswer(select.value); } }, el("option", { value: "" }, "– choose –"));
      var keys = part.options.map(function (o) { return o.key; });
      if (part.allowNone) keys.push("x");
      keys.forEach(function (k) {
        select.appendChild(el("option", { value: k, selected: given === k }, optionLabel(part, k)));
      });
      box.appendChild(el("label", { class: "prompt", for: name }, legend));
      box.appendChild(select);
    } else {
      var choices = item.type === "tf"
        ? [[true, "richtig"], [false, "falsch"]]
        : ["a", "b", "c"].map(function (k) { return [k, k + ") " + item.options[k]]; });
      var fs = el("fieldset", null, el("legend", null, legend));
      choices.forEach(function (c) {
        fs.appendChild(el("label", { class: "choice", lang: "de" },
          el("input", { type: "radio", name: name, checked: given === c[0], disabled: checked,
            onchange: function () { setAnswer(c[0]); } }), c[1]));
      });
      box.appendChild(fs);
    }

    if (checked) {
      var ok = given === item.answer;
      box.classList.add(ok ? "correct" : "wrong");
      box.appendChild(el("div", { class: "feedback" },
        el("b", { class: ok ? "ok" : "no" }, ok ? "Correct. " : "Not correct. "),
        ok ? null : ["Correct answer: ", el("span", { lang: "de" }, answerText(part, item, item.answer)), ". "],
        item.explanation));
    }
    return box;
  }

  /** Gap text with [[n]] placeholders. Each gap is a drop-down, so the learner answers inside the text. */
  function renderGapText(part, sectionId) {
    var checked = !!state.checked[sectionId];
    var box = el("div", { class: "gap-text", lang: "de" });
    part.gapText.split(/\n\s*\n/).forEach(function (paragraph) {
      var p = el("p");
      paragraph.split(/(\[\[\d+\]\])/).forEach(function (chunk) {
        var m = chunk.match(/^\[\[(\d+)\]\]$/);
        if (!m) { p.appendChild(document.createTextNode(chunk)); return; }
        var n = Number(m[1]);
        var item = (part.items || []).filter(function (it) { return it.n === n; })[0];
        if (!item) { p.appendChild(document.createTextNode("(" + n + ")")); return; }
        var select = el("select", { class: "gap-select", "data-gap": n, disabled: checked, "aria-label": "Gap " + n,
          onchange: function () { state.answers[n] = select.value; saveState(); } },
          el("option", { value: "" }, "(" + n + ")"));
        var choices = item.type === "mc"
          ? ["a", "b", "c"].map(function (k) { return [k, item.options[k]]; })
          : part.options.map(function (o) { return [o.key, o.text]; });
        choices.forEach(function (c) { select.appendChild(el("option", { value: c[0] }, c[1])); });
        select.value = state.answers[n] || "";
        if (checked) select.classList.add(state.answers[n] === item.answer ? "correct" : "wrong");
        p.appendChild(select);
      });
      box.appendChild(p);
    });
    return box;
  }

  function findItem(n) {
    var found = null;
    test.sections.forEach(function (s) {
      s.parts.forEach(function (p) {
        (p.items || []).forEach(function (it) { if (it.n === n) found = { part: p, item: it, section: s }; });
      });
    });
    return found;
  }

  function textField(key, attrs, multiline) {
    var input = el(multiline ? "textarea" : "input", Object.assign({ lang: "de",
      oninput: function () { state.texts[key] = input.value; saveState(); if (attrs.oncount) attrs.oncount(input.value); } },
      multiline ? {} : { type: "text" }, attrs));
    input.value = state.texts[key] || "";
    return input;
  }

  function checklist(criteria) {
    return el("ul", { class: "checklist" }, criteria.map(function (c) {
      return el("li", null, el("label", null, el("input", { type: "checkbox" }), c));
    }));
  }

  function renderWriting(w) {
    var count = el("span", { class: "small muted" });
    var words = function (v) { count.textContent = (v.trim() ? v.trim().split(/\s+/).length : 0) + " words"; };
    var area = textField("w" + w.n, { id: "w" + w.n, oncount: words, spellcheck: "true" }, true);
    words(area.value);
    return el("div", { class: "item" },
      el("label", { class: "prompt", for: "w" + w.n }, el("span", { class: "n" }, w.n + "."), " Schreiben"),
      App.paragraphs(w.task, { lang: "de" }),
      w.points && w.points.length ? el("ul", { lang: "de" }, w.points.map(function (p) { return el("li", null, p); })) : null,
      w.wordHint ? el("p", { class: "small muted", lang: "de" }, w.wordHint) : null,
      area, count,
      el("details", null, el("summary", null, "Model answer and self-check"),
        el("div", { class: "model", lang: "de" }, w.modelAnswer),
        el("p", null, "Check your text against these points:"), checklist(w.criteria)));
  }

  function renderNotes(part, sectionId) {
    var checked = !!state.checked[sectionId];
    return el("div", { class: "item" },
      el("div", { class: "prompt" }, "Telefonnotiz"),
      part.notes.map(function (n) {
        return el("div", { class: "note-field" },
          el("label", { for: "n" + n.n, lang: "de" }, n.n + ". " + n.label),
          textField("n" + n.n, { id: "n" + n.n }),
          checked ? el("div", { class: "expected", lang: "de" }, el("strong", null, "Expected: "), n.expected) : null);
      }),
      checked ? el("p", { class: "small muted" }, "Compare your notes with the expected content. This part is not scored automatically.") : null);
  }

  function renderSpeaking(sp) {
    return el("div", { class: "item" },
      App.paragraphs(sp.task, { lang: "de" }),
      el("ul", { lang: "de" }, sp.prompts.map(function (p) { return el("li", null, p); })),
      el("details", null, el("summary", null, "Useful phrases"),
        el("ul", { lang: "de" }, sp.phrases.map(function (p) { return el("li", null, p); }))),
      el("details", null, el("summary", null, "Sample answer and self-check"),
        el("div", { class: "model", lang: "de" }, sp.modelAnswer),
        sp.criteria && sp.criteria.length ? [el("p", null, "Record yourself, then check:"), checklist(sp.criteria)] : null));
  }

  function renderOptions(part) {
    return el("ul", { class: "options" + (part.gapText ? " words" : ""), lang: "de" }, part.options.map(function (o) {
      return el("li", null, el("span", { class: "key" }, o.key),
        o.title ? el("strong", null, o.title) : null, o.title ? el("br") : null, o.text);
    }));
  }

  /**
   * Matching task (people or questions on one side, texts on the other).
   * Pick an item, then press "Choose" on the text that fits. The drop-down in each item still works
   * and shows the same answer. On wide screens the two lists sit side by side; on phones the item
   * being matched stays pinned to the top while you scroll through the texts.
   */
  function renderMatch(part, sectionId) {
    var checked = !!state.checked[sectionId];
    var items = part.items;
    var unanswered = function () { return items.filter(function (it) { return !state.answers[it.n]; })[0] || null; };
    var active = checked ? null : unanswered();
    var boxes = {}, cards = {};
    var bar = el("div", { class: "match-bar", "aria-live": "polite" });
    var itemList = el("div", { class: "match-items" });
    var optionList = el("div", { class: "match-options" }, checked ? null : bar);

    var choose = function (key) {
      if (!active) return;
      // Each text can be used once: free it if another item had it.
      if (key !== "x") items.forEach(function (it) { if (it !== active && state.answers[it.n] === key) state.answers[it.n] = ""; });
      state.answers[active.n] = state.answers[active.n] === key ? "" : key;
      saveState();
      active = state.answers[active.n] ? unanswered() : active;
      refresh();
    };

    var refresh = function () {
      items.forEach(function (it) {
        boxes[it.n].classList.toggle("active", it === active);
        var select = boxes[it.n].querySelector("select");
        if (select) select.value = state.answers[it.n] || "";
      });
      part.options.forEach(function (o) {
        var card = cards[o.key];
        var users = items.filter(function (it) { return state.answers[it.n] === o.key; });
        card.badge.textContent = users.length ? "Chosen for " + users.map(function (it) { return it.n; }).join(", ") : "";
        card.node.classList.toggle("used", users.length > 0);
        if (card.btn) {
          card.btn.hidden = !active;
          var isMine = active && state.answers[active.n] === o.key;
          card.btn.textContent = active ? (isMine ? "\u2713 Chosen for " + active.n + " (undo)" : "Choose for " + active.n) : "";
          card.btn.classList.toggle("primary", !!active && !isMine);
        }
      });
      if (checked) return;
      bar.textContent = "";
      if (active) {
        bar.appendChild(el("span", null, el("strong", null, "Matching " + active.n + ": "),
          el("span", { lang: "de" }, active.prompt.length > 90 ? active.prompt.slice(0, 87) + "\u2026" : active.prompt)));
        if (part.allowNone) {
          bar.appendChild(el("button", { class: "btn", type: "button", onclick: function () { choose("x"); } },
            state.answers[active.n] === "x" ? "\u2713 No text fits (undo)" : "No text fits (x)"));
        }
      } else {
        bar.appendChild(el("span", null, "All items are matched. Select an item to change its answer."));
      }
    };

    items.forEach(function (it) {
      var box = renderItem(part, it, sectionId);
      boxes[it.n] = box;
      if (!checked) {
        box.classList.add("selectable");
        box.addEventListener("click", function (e) {
          if (e.target.tagName === "SELECT" || e.target.tagName === "OPTION") return;
          active = it; refresh();
        });
        box.addEventListener("change", function () { active = it; refresh(); });
      }
      itemList.appendChild(box);
    });
    part.options.forEach(function (o) {
      var badge = el("span", { class: "badge match-badge" });
      var btn = checked ? null : el("button", { class: "btn", type: "button", onclick: function () { choose(o.key); } });
      var node = el("div", { class: "match-card", lang: "de" },
        el("div", { class: "match-card-head" }, el("span", { class: "key" }, o.key), o.title ? el("strong", null, o.title) : null, badge),
        el("div", null, o.text), btn ? el("div", { class: "match-card-foot", lang: "en" }, btn) : null);
      cards[o.key] = { node: node, badge: badge, btn: btn };
      optionList.appendChild(node);
    });
    refresh();
    return el("div", { class: "match" }, itemList, optionList);
  }

  function renderPart(part, sectionId) {
    var box = el("section", { class: "part" },
      el("h3", { lang: "de" }, part.title),
      part.goal ? el("div", { class: "small muted", lang: "de" }, part.goal) : null,
      el("p", { class: "instructions", lang: "de" }, part.instructions));
    var items = part.items || [];
    var stimuli = part.stimuli || [];
    var itemNode = function (it) { return renderItem(part, it, sectionId); };
    var loose = items.filter(function (it) { return !it.stimulus; });

    if (part.gapText) {
      box.appendChild(renderGapText(part, sectionId));
      // Gaps are answered inside the text; the item list appears after checking, with the explanations.
      if (!state.checked[sectionId]) loose = [];
      if (part.options) box.appendChild(renderOptions(part));
    } else if (part.options && stimuli.length) {
      box.appendChild(renderOptions(part));   // e.g. statements to read before listening
    }
    stimuli.forEach(function (s) {
      box.appendChild(s.kind === "audio" ? renderAudio(s, sectionId, part.id) : renderText(s));
      items.filter(function (it) { return it.stimulus === s.id; }).forEach(function (it) { box.appendChild(itemNode(it)); });
    });
    if (part.options && !part.gapText && !stimuli.length) {
      box.appendChild(renderMatch(part, sectionId));   // items and the texts to match, side by side
    } else {
      loose.forEach(function (it) { box.appendChild(itemNode(it)); });
    }
    if (part.notes) box.appendChild(renderNotes(part, sectionId));
    if (part.writing) box.appendChild(renderWriting(part.writing));
    if (part.speaking) box.appendChild(renderSpeaking(part.speaking));
    return box;
  }

  // ---------- timer ----------

  function formatTime(sec) {
    var m = Math.floor(Math.abs(sec) / 60), s = Math.abs(sec) % 60;
    return (sec < 0 ? "+" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function renderTimer(section) {
    var t = timers[section.id];
    var display = el("span", { class: "timer" + (t && t.left <= 0 ? " over" : ""), role: "timer" },
      t ? formatTime(t.left) : section.minutes + " min");
    var btn = el("button", { class: "btn", type: "button", onclick: function () {
      if (timers[section.id]) { clearInterval(timers[section.id].handle); delete timers[section.id]; render(); return; }
      var timer = timers[section.id] = { left: section.minutes * 60 };
      timer.handle = setInterval(function () {
        timer.left -= 1;
        var d = root.querySelector(".timer");
        if (!d || state.section !== section.id) return;
        d.textContent = formatTime(timer.left) + (timer.left <= 0 ? " – time is up" : "");
        if (timer.left <= 0) d.classList.add("over");
      }, 1000);
      render();
    } }, t ? "Stop timer" : "Start timer");
    return el("div", { class: "btn-row" }, display, btn);
  }

  // ---------- scoring ----------

  function scores() {
    var out = { "Lesen": 0, "Hören": 0, "Sprachbausteine": 0 };
    test.sections.forEach(function (s) {
      var rule = SCORING[s.id];
      if (!rule) return;
      s.parts.forEach(function (p) {
        (p.items || []).forEach(function (it) {
          if (state.answers[it.n] === it.answer) out[rule.skill] += rule.points;
        });
      });
    });
    return out;
  }

  function allChecked() {
    return test.sections.every(function (s) { return !SCORING[s.id] || state.checked[s.id]; });
  }

  function renderResult() {
    var sc = scores();
    var done = allChecked();
    var box = el("div", { class: "card result" }, el("h2", null, done ? "Your result" : "Score so far"));
    var grid = el("div", { class: "scores" });
    Object.keys(MAX).forEach(function (skill) {
      var pass = sc[skill] >= MAX[skill] * PASS_SHARE;
      grid.appendChild(el("div", { class: "score " + (done ? (pass ? "pass" : "fail") : "") },
        el("div", { class: "small muted" }, skill), el("b", null, sc[skill] + " / " + MAX[skill]),
        done ? el("div", { class: "small" }, pass ? "60 % reached" : "below 60 %") : null));
    });
    box.appendChild(grid);
    box.appendChild(el("p", { class: "small muted" },
      "Only automatically checked items are counted, with the official points (3 per reading and listening item, " +
      "0.5 per Sprachbausteine item). Writing, the phone note and speaking are not included: compare them with the " +
      "model answers. In the real exam you need 60 % overall and in at least three of the four skills."));
    return box;
  }

  function hasRecordings(section) {
    return section.parts.some(function (p) {
      return (p.stimuli || []).some(function (st) { return st.kind === "audio" && st.audio; });
    });
  }

  function checkSection(section) {
    var open = (section.parts || []).reduce(function (n, p) {
      return n + (p.items || []).filter(function (it) {
        var v = state.answers[it.n];
        return v === undefined || v === "" || v === null;
      }).length;
    }, 0);
    if (open && !confirm(open + " item(s) in this part are unanswered. Check anyway?")) return;
    stopAll();
    state.checked[section.id] = true;
    saveState();
    if (allChecked()) {
      var results = App.load("results", {});
      results[test.id] = { date: new Date().toISOString().slice(0, 10), scores: scores() };
      App.save("results", results);
    }
    render();
    window.scrollTo(0, 0);
  }

  function resetTest() {
    if (!confirm("Clear all your answers for this test?")) return;
    stopAll();
    Object.keys(timers).forEach(function (k) { clearInterval(timers[k].handle); });
    timers = {};
    state = { answers: {}, texts: {}, checked: {}, played: {}, section: test.sections[0].id };
    saveState();
    render();
  }

  // ---------- page ----------

  function render() {
    var section = test.sections.filter(function (s) { return s.id === state.section; })[0] || test.sections[0];
    root.textContent = "";
    root.appendChild(el("p", null, el("a", { href: "tests.html" }, "← All tests")));
    root.appendChild(el("h1", null, test.title));
    if (Object.keys(state.checked).length) root.appendChild(renderResult());

    root.appendChild(el("div", { class: "tabs", role: "tablist", "aria-label": "Test parts" },
      test.sections.map(function (s) {
        return el("button", { type: "button", role: "tab", "aria-selected": s.id === section.id ? "true" : "false",
          onclick: function () { stopAll(); state.section = s.id; saveState(); render(); window.scrollTo(0, 0); } },
          s.title + (state.checked[s.id] ? " ✓" : ""));
      })));

    var scored = !!SCORING[section.id];
    var checked = !!state.checked[section.id];
    var panel = el("div", { role: "tabpanel" },
      el("div", { class: "section-head" }, el("h2", { lang: "de" }, section.title), renderTimer(section)),
      section.id === "sprechen" ? el("p", { class: "info" },
        "The oral exam is taken in pairs with two examiners and has no preparation time. Practise aloud with a partner, or record yourself.") : null,
      hasRecordings(section) && !checked ? el("label", { class: "choice exam-switch" },
        el("input", { type: "checkbox", checked: state.examAudio !== false, onchange: function (e) {
          stopAll(); state.examAudio = e.target.checked; saveState(); render();
        } }),
        el("span", null, el("strong", null, "Exam mode. "),
          "Each recording plays once and cannot be paused or rewound. Switch off to practise with replays.")) : null,
      section.parts.map(function (p) { return renderPart(p, section.id); }),
      el("div", { class: "btn-row" },
        scored ? el("button", { class: "btn primary", type: "button", disabled: checked,
          onclick: function () { checkSection(section); } }, checked ? "Checked" : "Check answers for this part") : null,
        el("button", { class: "btn danger", type: "button", onclick: resetTest }, "Reset whole test")));
    root.appendChild(panel);
    // On narrow screens the part buttons scroll sideways: keep the current one visible.
    var active = root.querySelector('.tabs [aria-selected="true"]');
    var strip = root.querySelector(".tabs");
    if (active && strip) strip.scrollLeft = active.offsetLeft - strip.offsetLeft - 16;
  }

  function showTest(id) {
    if (!/^[a-z0-9-]+$/i.test(id)) { App.showError(root, new Error("Unknown test.")); return; }
    App.loadJSON("data/tests/" + id + ".json").then(function (loaded) {
      test = loaded;
      document.title = test.title + " – Beruf B2 exam prep";
      state = Object.assign({ answers: {}, texts: {}, checked: {}, played: {}, section: test.sections[0].id },
        App.load("test:" + test.id, {}));
      render();
    }).catch(function (err) { App.showError(root, err); });
  }

  window.addEventListener("pagehide", stopAll);
  if (synth && synth.addEventListener) synth.addEventListener("voiceschanged", function () { /* voices are read on play */ });

  var id = new URLSearchParams(location.search).get("test");
  if (id) showTest(id); else showList();
})();
