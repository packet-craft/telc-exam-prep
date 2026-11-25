/* Flashcard trainer page. Needs common.js (App) and srs.js (SRS).
   Deck: data/deck.json. Progress: localStorage key "bb2:srs". */
(function () {
  "use strict";

  var el = App.el;
  var root = document.getElementById("app");

  // What the learner is asked on the front of each card type.
  var QUESTIONS = {
    "verb-prep": "Which preposition and case?",
    "noun-prep": "Which preposition and case?",
    "adj-prep": "Which preposition and case?",
    "verb-case": "Dativ, Akkusativ or both?",
    "reflexive": "Is „sich“ Akkusativ or Dativ? What else does the verb need?",
    "nvv": "Which verb completes the phrase?",
    "noun": "Article and plural?",
    "connector": "Main clause or subordinate clause? Where does the verb go?",
    "prep-case": "Which case?",
    "phrase": "Complete the phrase."
  };

  var deck = null;      // loaded deck file
  var data = null;      // saved progress (see defaults below)
  var current = null;   // card being shown
  var flipped = false;
  var filters = App.load("srs-filters", { topic: "", type: "" });

  function defaults() {
    return {
      cards: {},                       // card id -> SRS state
      settings: { newPerDay: 20 },
      daily: { date: today(), newSeen: 0 }
    };
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  function persist() {
    if (!App.save("srs", data)) {
      alert("Your progress could not be saved. Browser storage may be disabled or full.");
    }
  }

  // ---------- queue ----------

  function visibleCards() {
    return deck.cards.filter(function (c) {
      return (!filters.topic || c.topic === filters.topic) && (!filters.type || c.type === filters.type);
    });
  }

  /** Pick the next card: due reviews first, then new cards (up to the daily limit),
      then cards still being learned in this session even if their short delay is not over. */
  function nextCard() {
    var now = Date.now();
    var cards = visibleCards();
    var due = [], waiting = [], fresh = [];
    cards.forEach(function (c) {
      var s = data.cards[c.id];
      if (!s) fresh.push(c);
      else if (s.due <= now) due.push(c);
      else if (s.interval === 0) waiting.push(c);
    });
    var byDue = function (a, b) { return data.cards[a.id].due - data.cards[b.id].due; };
    if (due.length) return due.sort(byDue)[0];
    if (fresh.length && data.daily.newSeen < data.settings.newPerDay) return fresh[0];
    if (waiting.length) return waiting.sort(byDue)[0];
    return null;
  }

  function counts() {
    var now = Date.now();
    var c = { total: 0, fresh: 0, learning: 0, mature: 0, due: 0 };
    visibleCards().forEach(function (card) {
      var s = data.cards[card.id];
      c.total += 1;
      var st = SRS.stage(s);
      if (st === "new") c.fresh += 1; else c[st] += 1;
      if (s && (s.due <= now || s.interval === 0)) c.due += 1;
    });
    return c;
  }

  // ---------- actions ----------

  function rate(rating) {
    if (!current || !flipped) return;
    var wasNew = !data.cards[current.id];
    data.cards[current.id] = SRS.schedule(data.cards[current.id], rating);
    if (wasNew) data.daily.newSeen += 1;
    persist();
    showNext();
  }

  function flip() {
    if (!current || flipped) return;
    flipped = true;
    render();
    var first = root.querySelector(".ratings .btn.good");
    if (first) first.focus();
  }

  function showNext() {
    current = nextCard();
    flipped = false;
    render();
  }

  function resetProgress() {
    if (!confirm("Delete all flashcard progress on this device? This cannot be undone.")) return;
    var settings = data.settings;
    data = defaults();
    data.settings = settings;
    persist();
    showNext();
  }

  function exportProgress() {
    App.download("beruf-b2-progress.json", JSON.stringify(data, null, 2), "application/json");
  }

  function importProgress(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed.cards !== "object") throw new Error("not a progress file");
        if (!confirm("Replace the progress on this device with the imported file?")) return;
        data = Object.assign(defaults(), parsed);
        persist();
        showNext();
      } catch (e) {
        alert("This file is not a valid progress export.");
      }
    };
    reader.readAsText(file);
  }

  /** Build a tab-separated file Anki can import directly (File > Import). */
  function exportAnki() {
    var clean = function (s) { return String(s).replace(/[\t\r\n]+/g, " ").replace(/</g, "&lt;"); };
    var lines = ["#separator:tab", "#html:true", "#tags column:3"];
    deck.cards.forEach(function (c) {
      var front = clean(c.front) + "<br><small>" + clean(QUESTIONS[c.type] || "") + "</small>";
      var back = "<b>" + clean(c.back) + "</b><br>" + clean(c.translation) +
        "<br><br><i>" + clean(c.example) + "</i><br>" + clean(c.exampleTranslation);
      lines.push([front, back, "berufb2 " + c.type + " " + c.topic].join("\t"));
    });
    App.download("beruf-b2-deck.txt", lines.join("\n") + "\n");
  }

  // ---------- rendering ----------

  function selectFor(name, labels, allLabel) {
    var select = el("select", {
      id: "filter-" + name,
      onchange: function () {
        filters[name] = select.value;
        App.save("srs-filters", filters);
        showNext();
      }
    }, el("option", { value: "" }, allLabel));
    Object.keys(labels).forEach(function (k) {
      select.appendChild(el("option", { value: k, selected: filters[name] === k }, labels[k]));
    });
    return el("div", null, el("label", { for: "filter-" + name }, name === "topic" ? "Topic" : "Card type"), select);
  }

  function renderCard() {
    if (!current) {
      var c = counts();
      var limitReached = c.fresh > 0 && data.daily.newSeen >= data.settings.newPerDay;
      return el("div", { class: "card" },
        el("h2", null, "Nothing due right now"),
        el("p", null, limitReached
          ? "You have reached today’s limit of " + data.settings.newPerDay + " new cards. Come back tomorrow, or raise the limit below."
          : c.total === 0 ? "No cards match this filter." : "You have reviewed every card that is due in this selection."));
    }
    var card = el("div", {
      class: "flashcard", tabindex: "0", role: "button",
      "aria-label": flipped ? "Card, answer shown" : "Card, press to show the answer",
      onclick: flip
    },
      el("div", { class: "meta" },
        el("span", { class: "badge" }, deck.types[current.type] || current.type),
        el("span", { class: "badge" }, deck.topics[current.topic] || current.topic)),
      el("div", { class: "front", lang: "de" }, current.front));

    if (!flipped) {
      card.appendChild(el("div", { class: "ask" }, QUESTIONS[current.type] || ""));
      card.appendChild(el("div", { class: "small muted" }, "Tap, click or press ", el("kbd", null, "Space"), " to flip"));
      return card;
    }
    card.appendChild(el("hr"));
    card.appendChild(el("div", { class: "back", lang: "de" }, current.back));
    card.appendChild(el("div", { class: "muted" }, current.translation));
    card.appendChild(el("div", { class: "example", lang: "de" }, current.example));
    card.appendChild(el("div", { class: "small muted" }, current.exampleTranslation));

    var state = data.cards[current.id];
    var labels = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" };
    var ratings = el("div", { class: "ratings", role: "group", "aria-label": "How well did you know it?" },
      SRS.RATINGS.map(function (r, i) {
        return el("button", { class: "btn " + r, type: "button", onclick: function () { rate(r); } },
          el("span", null, labels[r] + " ", el("kbd", null, String(i + 1))),
          el("small", null, SRS.preview(state, r)));
      }));
    return [card, ratings];
  }

  function render() {
    var c = counts();
    var pct = function (n) { return c.total ? (100 * n / c.total) + "%" : "0%"; };
    root.textContent = "";

    root.appendChild(el("div", { class: "filters" },
      selectFor("topic", deck.topics, "All topics"),
      selectFor("type", deck.types, "All card types")));

    root.appendChild(el("div", { class: "stats", "aria-live": "polite" },
      el("div", { class: "stat" }, el("b", null, c.due), el("span", null, "Due now")),
      el("div", { class: "stat" }, el("b", null, c.fresh), el("span", null, "New")),
      el("div", { class: "stat" }, el("b", null, c.learning), el("span", null, "Learning")),
      el("div", { class: "stat" }, el("b", null, c.mature), el("span", null, "Mature"))));
    root.appendChild(el("div", { class: "progress", role: "img",
      "aria-label": c.mature + " mature and " + c.learning + " learning of " + c.total + " cards" },
      el("i", { class: "p-mature", style: "width:" + pct(c.mature) }),
      el("i", { class: "p-learning", style: "width:" + pct(c.learning) })));
    root.appendChild(el("p", { class: "small muted" },
      c.total + " cards in this selection · " + data.daily.newSeen + " of " + data.settings.newPerDay + " new cards seen today"));

    [].concat(renderCard()).forEach(function (n) { root.appendChild(n); });

    // Settings, backup and Anki export
    var limit = el("input", {
      type: "number", id: "new-limit", min: "0", max: "500", value: String(data.settings.newPerDay),
      onchange: function () {
        var v = Math.max(0, Math.min(500, parseInt(limit.value, 10) || 0));
        data.settings.newPerDay = v;
        persist();
        showNext();
      }
    });
    var file = el("input", { type: "file", accept: "application/json,.json", hidden: true,
      onchange: function () { if (file.files[0]) importProgress(file.files[0]); file.value = ""; } });

    root.appendChild(el("details", null,
      el("summary", null, "Settings, backup and Anki export"),
      el("p", null, el("label", { for: "new-limit" }, "New cards per day "), limit),
      el("div", { class: "btn-row" },
        el("button", { class: "btn", type: "button", onclick: exportAnki }, "Download for Anki (.txt)"),
        el("button", { class: "btn", type: "button", onclick: exportProgress }, "Export progress"),
        el("button", { class: "btn", type: "button", onclick: function () { file.click(); } }, "Import progress"),
        el("button", { class: "btn danger", type: "button", onclick: resetProgress }, "Reset progress"),
        file),
      el("p", { class: "small muted" },
        "Progress is stored only in this browser. Export it to back it up or move it to another device. " +
        "The Anki file contains the whole deck; import it in Anki with File → Import.")));
  }

  // ---------- keyboard ----------

  document.addEventListener("keydown", function (e) {
    if (!deck || e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea" || tag === "summary") return;
    if (e.key === " " || e.key === "Enter") {
      if (tag === "button" && !e.target.classList.contains("flashcard")) return; // let buttons work normally
      if (!flipped && current) { e.preventDefault(); flip(); }
    } else if (flipped && e.key >= "1" && e.key <= "4") {
      e.preventDefault();
      rate(SRS.RATINGS[Number(e.key) - 1]);
    }
  });

  // ---------- start ----------

  App.loadJSON("data/deck.json").then(function (loaded) {
    deck = loaded;
    data = Object.assign(defaults(), App.load("srs", {}));
    data.settings = Object.assign(defaults().settings, data.settings);
    if (!data.daily || data.daily.date !== today()) data.daily = { date: today(), newSeen: 0 };
    if (filters.topic && !deck.topics[filters.topic]) filters.topic = "";
    if (filters.type && !deck.types[filters.type]) filters.type = "";
    showNext();
  }).catch(function (err) { App.showError(root, err); });
})();
