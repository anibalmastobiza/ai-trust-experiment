(function () {
  "use strict";

  var CONFIG = window.STUDY_CONFIG || { endpoint: "", studyId: "ai-trust" };
  var app = document.getElementById("app");

  // ---------- Utilities ----------
  function rnd() {
    var a = new Uint32Array(1);
    window.crypto.getRandomValues(a);
    return a[0] / 4294967296;
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function uid() {
    var a = new Uint8Array(8);
    window.crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function now() { return Date.now(); }
  function progress(frac) {
    return '<div class="progress" aria-hidden="true"><div style="width:' + Math.round(frac * 100) + '%"></div></div>';
  }
  function top() { window.scrollTo(0, 0); }

  // ---------- Design ----------
  // Block 1: 2 x 2 x 2 within-subject factorial
  // (consistency, transparency, explainability: high = 1, low = 0).
  // Between subjects: reference anchor (yes / no) x frame (accuracy / error).
  // Block 2: decoy effect, between subjects (no decoy / decoy of the target
  // option / decoy of the competitor option).

  var FEATURES = {
    consistency: {
      label: "Consistency",
      hi: "Gives the same answer to the same question (10 out of 10 repetitions identical)",
      lo: "Changes its answer to the same question (6 out of 10 repetitions identical)"
    },
    transparency: {
      label: "Transparency",
      hi: "Discloses its training data, its known limitations and who funds it",
      lo: "Does not disclose its training data, its limitations or who funds it"
    },
    explainability: {
      label: "Explainability",
      hi: "Explains each recommendation with the factors behind it",
      lo: "Gives the recommendation without explaining why"
    }
  };

  var DOMAINS = {
    health: { title: "health decisions", follow: "your health" },
    finance: { title: "personal finance", follow: "your finances" },
    career: { title: "career guidance", follow: "your career" },
    legal: { title: "legal questions", follow: "a legal matter" }
  };

  var NAMES = [
    ["VERITAS", "VRT"], ["LUMEN", "LMN"], ["ORBITA", "ORB"], ["NEXO", "NXO"],
    ["KAIRO", "KRO"], ["SENDA", "SND"], ["PRISMA", "PRS"], ["ALBOR", "ALB"]
  ];

  var cond = {
    anchor: rnd() < 0.5 ? 1 : 0,
    frame: rnd() < 0.5 ? "accuracy" : "error",
    decoy: pick(["none", "target", "competitor"]),
    featureOrder: shuffle(["consistency", "transparency", "explainability"])
  };

  var profiles = [];
  [1, 0].forEach(function (c) {
    [1, 0].forEach(function (t) {
      [1, 0].forEach(function (e) {
        profiles.push({ consistency: c, transparency: t, explainability: e });
      });
    });
  });
  profiles = shuffle(profiles);
  var names = shuffle(NAMES);
  var domains = shuffle(["health", "health", "finance", "finance", "career", "career", "legal", "legal"]);
  profiles.forEach(function (p, i) {
    p.name = names[i][0];
    p.code = names[i][1] + "-" + (2 + Math.floor(rnd() * 3)) + "." + Math.floor(rnd() * 10);
    p.version = 3 + Math.floor(rnd() * 3);
    p.domain = domains[i];
  });

  var state = {
    pid: uid(),
    tsStart: new Date().toISOString(),
    tStart: now(),
    tsConsent: "",
    cards: [],
    decoy: {},
    demo: {}
  };

  // Prolific appends these parameters to the study URL.
  var params = new URLSearchParams(window.location.search);
  function param(k) { return (params.get(k) || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64); }
  var prolific = {
    prolific_pid: param("PROLIFIC_PID"),
    prolific_study_id: param("STUDY_ID"),
    prolific_session_id: param("SESSION_ID")
  };

  var TOTAL_STEPS = profiles.length + 2;

  // ---------- Screens ----------
  function screenWelcome() {
    app.innerHTML =
      '<div class="panel">' +
      "<h1>A study on trust in artificial intelligence assistants</h1>" +
      '<p class="small">Principal investigator: Aníbal Astobiza, University of Granada (UGR), Spain. Contact: amastobiza@ugr.es</p>' +
      "<p>You are invited to take part in a study on how people evaluate artificial intelligence assistants. " +
      "You will see several product listings of hypothetical assistants and answer a few short questions. It takes about 4 to 5 minutes.</p>" +
      "<p>Participation is voluntary. The study records your Prolific ID only to process your payment; it does not record your name, your email address or your IP address. " +
      "You may stop at any time by closing this window; in that case none of your answers will be saved. " +
      "The data will be used for research purposes only and analysed in aggregate.</p>" +
      "<p>By clicking “Start the study” you confirm that you are 18 or older, that you have read this information and that you agree to take part.</p>" +
      '<button class="primary" id="go">Start the study</button>' +
      "</div>";
    document.getElementById("go").onclick = function () {
      state.tsConsent = new Date().toISOString();
      window.addEventListener("beforeunload", guardUnload);
      screenIntro();
    };
  }

  function guardUnload(e) { e.preventDefault(); e.returnValue = ""; }

  function screenIntro() {
    top();
    app.innerHTML =
      progress(0) +
      '<div class="panel">' +
      "<h1>AI assistant listings</h1>" +
      "<p>You will now see " + profiles.length + " listings of artificial intelligence assistants, similar to those in an online store. " +
      "Read each listing and answer two questions.</p>" +
      "<p>There are no right or wrong answers. We are interested in your first impression.</p>" +
      '<button class="primary" id="go">Continue</button>' +
      "</div>";
    document.getElementById("go").onclick = function () { screenCard(0); };
  }

  function metricHTML() {
    var acc = cond.frame === "accuracy";
    var lblPrev = acc ? "Accuracy of previous version" : "Error rate of previous version";
    var lblNow = acc ? "Current verified accuracy" : "Current verified error rate";
    var prev = acc ? "85.0%" : "15.0%";
    var cur = acc ? "92.0%" : "8.0%";
    var delta = acc ? "+7.0 points" : "-7.0 points";
    var tag = acc ? "7 POINTS MORE ACCURATE" : "7 POINTS FEWER ERRORS";
    var h = '<div class="metric">';
    if (cond.anchor) {
      h += '<div class="row"><span class="lbl">' + lblPrev + '</span><span class="strike">' + prev + "</span></div>" +
        '<div class="row"><span class="lbl">Improvement</span><span class="delta">' + delta + "</span></div>";
    }
    h += '<div class="row"><span class="lbl">' + lblNow + '*</span><span class="big">' + cur + "</span></div>";
    if (cond.anchor) h += '<span class="tag">' + tag + "</span>";
    h += "</div>";
    return h;
  }

  function cardHTML(p) {
    var d = DOMAINS[p.domain];
    var feats = cond.featureOrder.map(function (k) {
      var hi = p[k] === 1;
      return '<li class="' + (hi ? "hi" : "lo") + '"><span class="mark">' + (hi ? "✓" : "✗") + "</span>" +
        '<span class="k">' + FEATURES[k].label + "</span><span>" + (hi ? FEATURES[k].hi : FEATURES[k].lo) + "</span></li>";
    }).join("");
    var foot = cond.anchor
      ? "*Independent evaluation on 1,000 queries, September 1 to 30, 2026. Improvement computed against the previous version on the same queries."
      : "*Independent evaluation on 1,000 queries, September 1 to 30, 2026.";
    return '<div class="product">' +
      '<div class="brand">' + esc(p.name) + "</div>" +
      '<div class="badges"><span class="badge">AI assistant</span><span class="badge">Version ' + p.version + "</span></div>" +
      '<div class="title">' + esc(p.name.charAt(0) + p.name.slice(1).toLowerCase()) + " " + p.version + ": assistant for " + d.title + "</div>" +
      '<div class="meta">Model ' + esc(p.code) + " | Domain: " + d.title + "</div>" +
      '<div class="stars"><span>★★★★★</span> 4.6 (214 reviews)</div>' +
      metricHTML() +
      '<ul class="features">' + feats + "</ul>" +
      '<p class="small">' + foot + "</p>" +
      "</div>";
  }

  function screenCard(i) {
    top();
    var p = profiles[i];
    var t0 = now();
    var trust = null, follow = null, firstMove = null;
    app.innerHTML =
      progress((i + 1) / TOTAL_STEPS) +
      '<p class="small">Listing ' + (i + 1) + " of " + profiles.length + "</p>" +
      cardHTML(p) +
      '<div class="panel question">' +
      "<h2>How much would you trust the recommendations of this assistant?</h2>" +
      '<div class="slider-wrap">' +
      '<input type="range" min="0" max="100" step="1" value="50" class="untouched" id="trust" aria-label="Trust from 0 to 100">' +
      '<div class="slider-ends"><span>0 Not at all</span><span>100 Completely</span></div>' +
      '<div class="slider-value" id="tv">Move the slider to answer</div>' +
      "</div>" +
      '<h2 style="margin-top:16px">If it gave you a recommendation about ' + DOMAINS[p.domain].follow + ", would you follow it?</h2>" +
      '<div class="choices"><button class="choice" data-v="1">Yes</button><button class="choice" data-v="0">No</button></div>' +
      '<button class="primary" id="next" disabled>Next</button>' +
      "</div>";

    var slider = document.getElementById("trust");
    var tv = document.getElementById("tv");
    var next = document.getElementById("next");
    function check() { next.disabled = !(trust !== null && follow !== null); }
    function onSlide() {
      if (firstMove === null) firstMove = now() - t0;
      slider.classList.remove("untouched");
      trust = parseInt(slider.value, 10);
      tv.textContent = trust;
      check();
    }
    slider.addEventListener("input", onSlide);
    slider.addEventListener("change", onSlide);
    slider.addEventListener("pointerdown", function () { setTimeout(onSlide, 0); });
    Array.prototype.forEach.call(app.querySelectorAll(".choice"), function (b) {
      b.onclick = function () {
        Array.prototype.forEach.call(app.querySelectorAll(".choice"), function (x) { x.classList.remove("selected"); });
        b.classList.add("selected");
        follow = parseInt(b.getAttribute("data-v"), 10);
        check();
      };
    });
    next.onclick = function () {
      state.cards.push({
        trial: i + 1,
        name: p.name,
        domain: p.domain,
        consistency: p.consistency,
        transparency: p.transparency,
        explainability: p.explainability,
        trust: trust,
        follow: follow,
        rt_ms: now() - t0,
        first_move_ms: firstMove
      });
      if (i + 1 < profiles.length) screenCard(i + 1);
      else screenDecoy();
    };
  }

  // Choice block options. Accuracy in %; expl and transp: 1 = yes.
  var OPTIONS = {
    target: { acc: 90, expl: 1, transp: 1 },
    competitor: { acc: 95, expl: 0, transp: 0 },
    decoy_target: { acc: 87, expl: 1, transp: 0 },     // dominated only by "target"
    decoy_competitor: { acc: 92, expl: 0, transp: 0 }  // dominated only by "competitor"
  };

  function screenDecoy() {
    top();
    var keys = ["target", "competitor"];
    if (cond.decoy === "target") keys.push("decoy_target");
    if (cond.decoy === "competitor") keys.push("decoy_competitor");
    keys = shuffle(keys);
    var t0 = now();
    var chosen = null;
    var opts = keys.map(function (k, idx) {
      var o = OPTIONS[k];
      return '<button class="option" data-k="' + k + '">' +
        '<div class="name">OPTION ' + (idx + 1) + "</div>" +
        '<div class="acc">' + o.acc + '%<span class="small"> accuracy</span></div>' +
        "<ul><li>" + (o.expl ? "Explains its recommendations" : "Does not explain its recommendations") + "</li>" +
        "<li>" + (o.transp ? "Discloses its data, limitations and funding" : "Does not disclose its data, limitations or funding") + "</li></ul>" +
        "</button>";
    }).join("");
    app.innerHTML =
      progress((profiles.length + 1) / TOTAL_STEPS) +
      '<div class="panel">' +
      "<h1>Choose an assistant</h1>" +
      "<p>Imagine you have to decide between two medical treatments and you can consult one of these AI assistants. Which one would you choose?</p>" +
      '<div class="options">' + opts + "</div>" +
      '<button class="primary" id="next" disabled>Next</button>' +
      "</div>";
    var next = document.getElementById("next");
    Array.prototype.forEach.call(app.querySelectorAll(".option"), function (b) {
      b.onclick = function () {
        Array.prototype.forEach.call(app.querySelectorAll(".option"), function (x) { x.classList.remove("selected"); });
        b.classList.add("selected");
        chosen = b.getAttribute("data-k");
        next.disabled = false;
      };
    });
    next.onclick = function () {
      state.decoy = { choice: chosen, order: keys.join("|"), rt_ms: now() - t0 };
      screenDemo();
    };
  }

  function selectField(id, q, opts) {
    return '<div class="field"><label class="q" for="' + id + '">' + q + "</label>" +
      '<select id="' + id + '"><option value="">Select an option</option>' +
      opts.map(function (o) { return "<option>" + esc(o) + "</option>"; }).join("") +
      "</select></div>";
  }
  function likertField(id, q, n, lo, hi) {
    var h = '<div class="field" role="radiogroup" aria-label="' + esc(q) + '"><span class="q" style="display:block;font-weight:600;margin-bottom:6px">' + q + "</span>" +
      '<div class="likert">';
    for (var i = 1; i <= n; i++) {
      h += '<label><input type="radio" name="' + id + '" value="' + i + '">' + i + "</label>";
    }
    h += '</div><div class="slider-ends"><span>1 ' + lo + "</span><span>" + n + " " + hi + "</span></div></div>";
    return h;
  }

  function screenDemo() {
    top();
    app.innerHTML =
      progress((profiles.length + 2) / TOTAL_STEPS) +
      '<div class="panel">' +
      "<h1>About you</h1>" +
      '<div class="field"><label class="q" for="age">Age (years)</label><input type="number" id="age" min="18" max="99" inputmode="numeric"></div>' +
      selectField("gender", "Gender", ["Woman", "Man", "Non-binary", "Other", "Prefer not to say"]) +
      selectField("education", "Highest level of education completed", [
        "No formal education or primary school", "Lower secondary school", "Upper secondary school / high school",
        "Vocational training", "Bachelor's degree", "Master's degree", "Doctorate", "Prefer not to say"]) +
      '<div class="field"><label class="q" for="country">Country of residence</label><input type="text" id="country" maxlength="60" autocomplete="off"></div>' +
      selectField("ai_use", "How often do you use AI assistants (for example ChatGPT, Gemini or Claude)?", [
        "Never", "Less than once a month", "A few times a month", "A few times a week", "Daily"]) +
      likertField("ai_knowledge", "How much do you know about how artificial intelligence works?", 5, "Nothing", "A great deal") +
      likertField("tech_trust", "In general, I trust new technologies.", 7, "Strongly disagree", "Strongly agree") +
      likertField("attention", "To show that you are reading the questions, please select number 2 on this scale.", 7, "Strongly disagree", "Strongly agree") +
      '<div class="error" id="err"></div>' +
      '<button class="primary" id="next">Submit answers</button>' +
      "</div>";

    document.getElementById("next").onclick = function () {
      var err = document.getElementById("err");
      function val(id) { return document.getElementById(id).value.trim(); }
      function radio(name) {
        var r = app.querySelector('input[name="' + name + '"]:checked');
        return r ? parseInt(r.value, 10) : null;
      }
      var age = parseInt(val("age"), 10);
      var d = {
        age: age,
        gender: val("gender"),
        education: val("education"),
        country: val("country"),
        ai_use: val("ai_use"),
        ai_knowledge: radio("ai_knowledge"),
        tech_trust: radio("tech_trust"),
        attention: radio("attention")
      };
      if (!(age >= 18 && age <= 99) || !d.gender || !d.education || !d.country || !d.ai_use ||
          d.ai_knowledge === null || d.tech_trust === null || d.attention === null) {
        err.textContent = "Please answer all questions. Age must be between 18 and 99.";
        return;
      }
      state.demo = d;
      submit();
    };
  }

  function buildPayload() {
    var tEnd = now();
    var base = {
      pid: state.pid,
      prolific_pid: prolific.prolific_pid,
      cond_anchor: cond.anchor,
      cond_frame: cond.frame,
      cond_decoy: cond.decoy,
      feature_order: cond.featureOrder.join("|")
    };
    var participant = Object.assign({}, base, {
      study: CONFIG.studyId,
      prolific_study_id: prolific.prolific_study_id,
      prolific_session_id: prolific.prolific_session_id,
      ts_start: state.tsStart,
      ts_consent: state.tsConsent,
      ts_end: new Date(tEnd).toISOString(),
      duration_s: Math.round((tEnd - state.tStart) / 1000),
      choice: state.decoy.choice,
      choice_target: state.decoy.choice === "target" ? 1 : 0,
      choice_order: state.decoy.order,
      choice_rt_ms: state.decoy.rt_ms,
      age: state.demo.age,
      gender: state.demo.gender,
      education: state.demo.education,
      country: state.demo.country,
      ai_use: state.demo.ai_use,
      ai_knowledge: state.demo.ai_knowledge,
      tech_trust: state.demo.tech_trust,
      attention: state.demo.attention,
      attention_ok: state.demo.attention === 2 ? 1 : 0,
      screen: window.screen.width + "x" + window.screen.height,
      mobile: /Mobi|Android/i.test(navigator.userAgent) ? 1 : 0
    });
    state.cards.forEach(function (c) {
      participant["t" + c.trial + "_profile"] = "" + c.consistency + c.transparency + c.explainability;
      participant["t" + c.trial + "_trust"] = c.trust;
      participant["t" + c.trial + "_follow"] = c.follow;
    });
    var cards = state.cards.map(function (c) { return Object.assign({}, base, c); });
    return { participant: participant, cards: cards };
  }

  var payload = null;
  function submit() {
    top();
    if (!payload) payload = buildPayload();
    app.innerHTML = '<div class="panel"><p>Sending your answers...</p></div>';
    if (!CONFIG.endpoint) {
      window.__lastPayload = payload;
      console.log("Test mode: no endpoint configured. Data:", payload);
      done();
      return;
    }
    fetch(CONFIG.endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }).then(done, function () {
      app.innerHTML = '<div class="panel"><p>Your answers could not be sent. Please check your connection and click “Retry”.</p>' +
        '<button class="primary" id="retry">Retry</button></div>';
      document.getElementById("retry").onclick = submit;
    });
  }

  function done() {
    window.removeEventListener("beforeunload", guardUnload);
    app.innerHTML =
      '<div class="panel"><h1>Thank you for taking part</h1>' +
      "<p>Your answers have been recorded. You may now close this window.</p></div>";
  }

  screenWelcome();
})();
