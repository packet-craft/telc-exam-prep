/* Player for recordings the visitor downloaded themselves (official.html).
   Files are played straight from the device with object URLs; nothing is uploaded. */
(function () {
  "use strict";

  var el = App.el;
  var input = document.getElementById("files");
  var examMode = document.getElementById("exam-mode");
  var list = document.getElementById("tracks");
  var tracks = [];      // { name, url, played }
  var audio = new Audio();
  var current = null;   // track being played in exam mode

  function time(sec) {
    if (!isFinite(sec)) return "0:00";
    var s = Math.floor(sec % 60);
    return Math.floor(sec / 60) + ":" + (s < 10 ? "0" : "") + s;
  }

  function stop() {
    audio.pause();
    audio.removeAttribute("src");
    current = null;
  }

  function render() {
    list.textContent = "";
    if (!tracks.length) {
      list.appendChild(el("p", { class: "muted" }, "No files chosen yet."));
      return;
    }
    tracks.forEach(function (t) {
      var row = el("div", { class: "item" }, el("div", { class: "prompt" }, t.name));
      if (examMode.checked) {
        var playing = current === t;
        row.appendChild(el("div", { class: "audio-box" },
          el("button", { class: "btn" + (playing || t.played ? "" : " primary"), type: "button", disabled: playing || t.played,
            onclick: function () { play(t); } }, playing ? "Playing…" : t.played ? "Played" : "▶ Play once"),
          el("span", { class: "small muted", "data-time": t.name }, playing ? "" : t.played ? "Heard once, as in the exam." : "")));
      } else {
        row.appendChild(el("audio", { controls: true, preload: "metadata", src: t.url }));
      }
      list.appendChild(row);
    });
    if (examMode.checked && tracks.some(function (t) { return t.played; })) {
      list.appendChild(el("button", { class: "btn", type: "button", onclick: function () {
        stop();
        tracks.forEach(function (t) { t.played = false; });
        render();
      } }, "Reset: allow all tracks again"));
    }
  }

  function play(track) {
    stop();
    current = track;
    audio.src = track.url;
    audio.play().catch(function () {
      current = null;
      alert("This file could not be played. Check that it is an MP3 audio file.");
      render();
    });
    render();
  }

  audio.addEventListener("timeupdate", function () {
    if (!current) return;
    var label = list.querySelector('[data-time="' + current.name.replace(/"/g, '\\"') + '"]');
    if (label) label.textContent = time(audio.currentTime) + " / " + time(audio.duration);
  });
  audio.addEventListener("ended", function () {
    if (current) current.played = true;
    current = null;
    render();
  });

  input.addEventListener("change", function () {
    stop();
    tracks.forEach(function (t) { URL.revokeObjectURL(t.url); });
    tracks = Array.prototype.slice.call(input.files)
      .sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); })
      .map(function (f) { return { name: f.name, url: URL.createObjectURL(f), played: false }; });
    render();
  });
  examMode.addEventListener("change", function () { stop(); render(); });
})();
