/* Spaced-repetition scheduler: a simplified SM-2, the algorithm family Anki uses.
   Pure functions, no DOM and no storage, so it is easy to change or test.
   Exposed as the global `SRS`.

   State kept per card:
     reps      number of successful reviews in a row (0 = new or being relearned)
     interval  days until the next review (0 while the card is still being learned)
     ease      growth factor for the interval (starts at 2.5, never below 1.3)
     due       timestamp in ms when the card should be shown again
     lapses    how often the card was forgotten after it had been learned
*/
(function () {
  "use strict";

  var MIN = 60 * 1000;
  var DAY = 24 * 60 * MIN;

  // Tune the scheduler here.
  var CONFIG = {
    startEase: 2.5,
    minEase: 1.3,
    againDelay: 1 * MIN,      // "Again": show once more in this session
    hardLearnDelay: 6 * MIN,  // "Hard" on a card that is still being learned
    firstGood: 1,             // days after the first "Good"
    firstEasy: 4,             // days after "Easy" on a new card
    hardFactor: 1.2,          // interval multiplier for "Hard" on a review card
    easyBonus: 1.3,           // extra multiplier for "Easy"
    matureDays: 21            // a card with at least this interval counts as mature
  };

  var RATINGS = ["again", "hard", "good", "easy"];

  function fresh() {
    return { reps: 0, interval: 0, ease: CONFIG.startEase, due: 0, lapses: 0 };
  }

  /** Return the new state after rating a card. Does not modify `state`. */
  function schedule(state, rating, now) {
    var s = Object.assign(fresh(), state || {});
    now = now || Date.now();
    var learning = s.reps === 0;

    if (rating === "again") {
      if (!learning) s.lapses += 1;
      s.reps = 0;
      s.interval = 0;
      s.ease = Math.max(CONFIG.minEase, s.ease - 0.2);
      s.due = now + CONFIG.againDelay;
    } else if (rating === "hard") {
      if (learning) {
        s.due = now + CONFIG.hardLearnDelay;
      } else {
        s.interval = Math.max(s.interval + 1, Math.round(s.interval * CONFIG.hardFactor));
        s.ease = Math.max(CONFIG.minEase, s.ease - 0.15);
        s.reps += 1;
        s.due = now + s.interval * DAY;
      }
    } else if (rating === "good") {
      s.interval = learning ? CONFIG.firstGood : Math.max(s.interval + 1, Math.round(s.interval * s.ease));
      s.reps += 1;
      s.due = now + s.interval * DAY;
    } else if (rating === "easy") {
      // Always at least one day longer than "Good" would give.
      s.interval = learning ? CONFIG.firstEasy : Math.max(s.interval + 2, Math.round(s.interval * s.ease) + 1, Math.round(s.interval * s.ease * CONFIG.easyBonus));
      s.ease += 0.15;
      s.reps += 1;
      s.due = now + s.interval * DAY;
    }
    return s;
  }

  /** Human-readable time until the card returns for a given rating, e.g. "1 min", "3 d", "2 mo". */
  function preview(state, rating, now) {
    now = now || Date.now();
    return formatDelay(schedule(state, rating, now).due - now);
  }

  function formatDelay(ms) {
    if (ms < 60 * MIN) return Math.max(1, Math.round(ms / MIN)) + " min";
    var days = Math.round(ms / DAY);
    if (days < 1) return Math.round(ms / (60 * MIN)) + " h";
    if (days < 31) return days + " d";
    if (days < 365) return (days / 30).toFixed(1).replace(".0", "") + " mo";
    return (days / 365).toFixed(1).replace(".0", "") + " y";
  }

  /** "new" (never seen), "learning" (seen, interval below matureDays) or "mature". */
  function stage(state) {
    if (!state) return "new";
    return state.interval >= CONFIG.matureDays ? "mature" : "learning";
  }

  window.SRS = { CONFIG: CONFIG, RATINGS: RATINGS, schedule: schedule, preview: preview, stage: stage, DAY: DAY };
})();
