/* Shared helpers used by every page. Exposed as the global `App`. */
(function () {
  "use strict";

  var PREFIX = "bb2:"; // all localStorage keys start with this

  /** Read a JSON value from localStorage; returns `fallback` if missing or unreadable. */
  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  /** Save a JSON value to localStorage. Returns false if storage is unavailable or full. */
  function save(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
  }

  /**
   * Create an element.
   *   el("p", { class: "muted", lang: "de" }, "Text", childNode, ...)
   * Attributes starting with "on" are added as event listeners. Strings become text nodes,
   * so content from the data files is never interpreted as HTML.
   */
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k.slice(0, 2) === "on") node.addEventListener(k.slice(2), v);
        else if (k === "class") node.className = v;
        else if (v === true) node.setAttribute(k, "");
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }

  function append(node, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) child.forEach(function (c) { append(node, c); });
    else node.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
  }

  /** Turn "para one\n\npara two" into <p> elements; single \n stays a line break. */
  function paragraphs(text, attrs) {
    return String(text).split(/\n\s*\n/).map(function (p) {
      return el("p", Object.assign({ class: "line" }, attrs || {}), p.trim());
    });
  }

  /** Fetch a JSON data file (path relative to the page). Rejects with a readable message. */
  function loadJSON(path) {
    return fetch(path, { cache: "no-cache" }).then(function (res) {
      if (!res.ok) throw new Error(path + " could not be loaded (HTTP " + res.status + ").");
      return res.json();
    }).catch(function (err) {
      var hint = location.protocol === "file:"
        ? " You opened the page as a file. Start a local server instead: python3 -m http.server"
        : "";
      throw new Error((err && err.message ? err.message : "Could not load " + path + ".") + hint);
    });
  }

  /** Show a loading error inside `container`. */
  function showError(container, err) {
    container.textContent = "";
    container.appendChild(el("div", { class: "error", role: "alert" },
      el("strong", null, "Something went wrong. "), err && err.message ? err.message : String(err)));
  }

  /** Offer `text` as a file download. */
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // On narrow screens the navigation scrolls sideways: keep the current page's link visible.
  document.addEventListener("DOMContentLoaded", function () {
    var nav = document.querySelector(".site-nav");
    var current = nav && nav.querySelector('[aria-current="page"]');
    if (current) nav.scrollLeft = current.offsetLeft - nav.offsetLeft - 16;
  });

  window.App = {
    load: load, save: save, remove: remove,
    el: el, paragraphs: paragraphs,
    loadJSON: loadJSON, showError: showError, download: download
  };
})();
