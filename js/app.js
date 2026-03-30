// BCBS Home State Identifier — Application Logic
// v2.3 — multi-row Availity table + prefix modal via API
const API = 'https://project-1.arcaneowl.workers.dev';

window.addEventListener('scroll', function () {
  document.getElementById('gtt').style.display = window.scrollY > 300 ? 'flex' : 'none';
});

function sw(t) {
  ['sub', 'dir', 'pfx'].forEach(function (x) {
    document.getElementById('p-' + x).classList.toggle('hd', x !== t);
    document.getElementById('t-' + x).classList.toggle('on', x === t);
  });
  if (t === 'dir') fd();
}

function badge(v, label, isAt) {
  if (isAt) return v ? '<span class="at">' + label + '</span>' : '<span class="no">' + label + '</span>';
  return v ? '<span class="ok">' + label + '</span>' : '<span class="no">' + label + '</span>';
}

function icon(v, isAt) {
  if (v && isAt) return '<span class="ic-at">✓</span>';
  if (v)         return '<span class="ic-ok">✓</span>';
  return         '<span class="ic-no">✗</span>';
}

function avail(v, isAt) {
  if (v && isAt) return '<span class="at">Available</span>';
  if (v)         return '<span class="ok">Available</span>';
  return         '<span class="no">Not Available</span>';
}

function txBadges(t) {
  var h = '';
  h += badge(t.eligibility_270   || t.has_270,    '270');
  h += badge(t.pa_inpatient_278  || t.has_pa_in,  '278 IP');
  h += badge(t.pa_outpatient_278 || t.has_pa_out, '278 OP');
  h += badge(t.referral_278      || t.has_ref,     'Ref');
  h += badge(t.attachments_275   || t.has_275,     '275', true);
  return h;
}

var VALID_PFX  = /^[A-Z2-9]{3}$/;
var HAS_INVALID = /[^A-Za-z2-9]/;
var HAS_01      = /[01]/;

function vi() {
  var el  = document.getElementById('vm');
  var raw = document.getElementById('sId').value.trim();
  if (!raw) { el.innerHTML = ''; return; }
  if (raw.length < 3) { el.innerHTML = '<div class="vm vm-w">Enter at least 3 characters</div>'; return; }
  var pfx = raw.substring(0, 3).toUpperCase();
  if (HAS_INVALID.test(pfx)) { el.innerHTML = '<div class="vm vm-e">✗ BCBS prefixes contain only letters (A-Z) and digits (2-9).</div>'; return; }
  if (HAS_01.test(pfx))      { el.innerHTML = '<div class="vm vm-e">✗ BCBS prefixes do not use digits 0 or 1.</div>'; return; }
  if (!VALID_PFX.test(pfx))  { el.innerHTML = '<div class="vm vm-e">✗ Not a valid BCBS prefix format.</div>'; return; }
  el.innerHTML = '';
}

function lu() {
  var raw = document.getElementById('sId').value.trim().replace(/\s+/g, '');
  var el  = document.getElementById('sr');
  if (raw.length < 3) { el.innerHTML = '<div class="al al-e">Enter at least 3 characters.</div>'; return; }
  var pfx = raw.substring(0, 3).toUpperCase();
  if (HAS_INVALID.test(pfx) || HAS_01.test(pfx) || !VALID_PFX.test(pfx)) {
    el.innerHTML = '<div class="al al-e">Not a valid BCBS prefix format. Use letters A-Z and digits 2-9 (no 0 or 1).</div>'; return;
  }
  el.innerHTML = '<div class="al al-i">Looking up <strong>' + pfx + '</strong>...</div>';
  document.getElementById('vm').innerHTML = '';

  fetch(API + '/lookup?prefix=' + pfx)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.error) { el.innerHTML = '<div class="al al-e">✗ ' + data.error + '</div>'; return; }
      var t = data.transactions;
      var h = '<div class="rc">';
      h += '<div class="fl row" style="gap:12px;margin-bottom:14px">';
      h += '<div class="pb"><div class="l">Prefix</div><div class="v">' + data.prefix + '</div></div>';
      h += '<div style="font-size:20px;color:var(--s)">→</div>';
      h += '<div style="flex:1;min-width:0">';
      h += '<div style="font-size:19px;font-weight:800;color:var(--pd)">' + data.plan_name + '</div>';
      h += '<div style="font-size:13px;color:var(--s);margin-top:3px">';
      h += 'Home State: <strong>' + data.state + '</strong>';
      h += ' &bull; <a href="javascript:void(0)" onclick="showPfxModal(\'' + encodeURIComponent(data.plan_name) + '\',' + data.prefix_count + ')" style="text-decoration:none;border-bottom:1px dashed var(--p)">' + data.prefix_count + ' prefixes</a>';
      h += ' &bull; <a href="' + data.website_url + '" target="_blank">Website ↗</a>';
      h += '</div></div></div>';
      h += '<div class="fl row" style="gap:5px;flex-wrap:wrap;margin-bottom:14px">' + txBadges(t) + '</div>';
      h += avDetailTable(data);
      h += '<div class="al al-i mt">All PA and Referral submissions for this member must be directed to <strong>' + data.plan_name + '</strong> (' + data.state + ').</div>';
      h += '<div style="margin-top:12px;text-align:right">';
      h += '<button class="btn" style="background:#6b7280;font-size:12px;padding:6px 14px" onclick="openFeedback(\'' + data.prefix + '\',\'' + data.plan_name.replace(/'/g, "\\'") + '\')">⚑ Flag incorrect data</button>';
      h += '</div></div>';
      el.innerHTML = h;
    })
    .catch(function () { el.innerHTML = '<div class="al al-e">Network error. Please try again.</div>'; });
}

function avDetailTable(data) {
  var t    = data.transactions;
  var pids = data.availity_payer_ids || '';
  if (!pids && !t.eligibility_270 && !t.pa_inpatient_278 && !t.pa_outpatient_278 && !t.referral_278 && !t.attachments_275) {
    return '<div class="al al-w" style="margin-top:8px">Not supported via Availity REST API. Submit via <a href="' + data.website_url + '" target="_blank">payer portal ↗</a>.</div>';
  }
  var pidList = pids ? pids.split(',') : ['—'];
  var h = '<table class="avtbl"><tr><th>Availity ID</th><th>270 Elig</th><th>278 Inpatient</th><th>278 Outpatient</th><th>278 Referral</th><th>275 Attach</th></tr>';
  pidList.forEach(function (pid) {
    h += '<tr>';
    h += '<td class="mono" style="font-size:14px;font-weight:700">' + pid.trim() + '</td>';
    h += '<td>' + avail(t.eligibility_270) + '</td>';
    h += '<td>' + avail(t.pa_inpatient_278) + '</td>';
    h += '<td>' + avail(t.pa_outpatient_278) + '</td>';
    h += '<td>' + avail(t.referral_278) + '</td>';
    h += '<td>' + avail(t.attachments_275, true) + '</td>';
    h += '</tr>';
  });
  h += '</table>';
  return h;
}

// ── Plan Directory ────────────────────────────────────────────────────────

function fd() {
  var s  = document.getElementById('ds').value.toLowerCase().trim();
  var st = document.getElementById('df').value;
  var dr = document.getElementById('dr');
  var dd = document.getElementById('dd');
  var f270  = document.getElementById('f270').checked;
  var f278i = document.getElementById('f278i').checked;
  var f278o = document.getElementById('f278o').checked;
  var fRef  = document.getElementById('fRef').checked;
  var f275  = document.getElementById('f275').checked;

  dd.textContent = 'Loading...';
  dr.innerHTML   = '<div class="al al-i">Fetching plans...</div>';

  var params = [];
  if (st) params.push('state=' + encodeURIComponent(st));
  if (s)  params.push('search=' + encodeURIComponent(s));
  var qs = params.length ? '?' + params.join('&') : '';

  fetch(API + '/plans' + qs)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var plans = data.plans || [];
      if (f270)  plans = plans.filter(function(p){ return p.has_270; });
      if (f278i) plans = plans.filter(function(p){ return p.has_pa_in; });
      if (f278o) plans = plans.filter(function(p){ return p.has_pa_out; });
      if (fRef)  plans = plans.filter(function(p){ return p.has_ref; });
      if (f275)  plans = plans.filter(function(p){ return p.has_275; });

      dd.textContent = plans.length + ' plan' + (plans.length !== 1 ? 's' : '');
      var h = '';
      plans.forEach(function (p, i) {
        var id   = 'ac' + i;
        var t    = { has_270: p.has_270, has_pa_in: p.has_pa_in, has_pa_out: p.has_pa_out, has_ref: p.has_ref, has_275: p.has_275 };
        var pids = p.availity_payer_ids || '';
        var pidList = pids ? pids.split(',') : [];
        h += '<div class="pr">';
        h += '<div class="acc-toggle fl row" style="justify-content:space-between;gap:12px" onclick="ta(\'' + id + '\')">';
        h += '<div style="min-width:0">';
        h += '<div style="font-size:15px;font-weight:700">' + p.plan_name + '</div>';
        h += '<div style="font-size:12px;color:var(--s);margin-top:2px">' + p.state;
        h += ' &bull; <a href="javascript:void(0)" onclick="event.stopPropagation();showPfxModal(\'' + encodeURIComponent(p.plan_name) + '\',' + p.prefix_count + ')" style="text-decoration:none;border-bottom:1px dashed var(--p)">' + p.prefix_count + ' prefixes</a>';
        if (pids) h += ' &bull; <span class="mono" style="font-size:11px">' + pids + '</span>';
        h += '</div></div>';
        h += '<div class="fl row" style="gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">' + txBadges(t) + '</div></div>';
        h += '<div class="acc-body" id="' + id + '">';
        if (!pids && !p.has_270 && !p.has_pa_in && !p.has_pa_out) {
          h += '<div class="al al-w" style="margin-top:8px">Not supported via Availity REST API. <a href="' + p.website_url + '" target="_blank">Payer portal ↗</a></div>';
        } else {
          h += '<table class="avtbl"><tr><th>Availity ID</th><th>270 Elig</th><th>278 IP</th><th>278 OP</th><th>Ref</th><th>275 Attach</th></tr>';
          if (pidList.length) {
            pidList.forEach(function(pid) {
              h += '<tr><td class="mono" style="font-size:13px;font-weight:700">' + pid.trim() + '</td>';
              h += '<td>' + avail(p.has_270) + '</td><td>' + avail(p.has_pa_in) + '</td>';
              h += '<td>' + avail(p.has_pa_out) + '</td><td>' + avail(p.has_ref) + '</td>';
              h += '<td>' + avail(p.has_275, true) + '</td></tr>';
            });
          } else {
            h += '<tr><td class="mono">—</td>';
            h += '<td>' + avail(p.has_270) + '</td><td>' + avail(p.has_pa_in) + '</td>';
            h += '<td>' + avail(p.has_pa_out) + '</td><td>' + avail(p.has_ref) + '</td>';
            h += '<td>' + avail(p.has_275, true) + '</td></tr>';
          }
          h += '</table>';
        }
        h += '</div></div>';
      });
      dr.innerHTML = h || '<div class="al al-w">No plans match the selected filters.</div>';
    })
    .catch(function () {
      dr.innerHTML = '<div class="al al-e">Network error loading plans.</div>';
      dd.textContent = '';
    });
}

function ta(id) { document.getElementById(id).classList.toggle('open'); }

// ── Prefix count modal — fetches from API ─────────────────────────────────

function showPfxModal(encodedPlan, count) {
  var planName = decodeURIComponent(encodedPlan);
  var title    = document.getElementById('pfxModalTitle');
  var body     = document.getElementById('pfxModalBody');
  title.textContent = planName + ' — Prefixes';
  body.innerHTML = '<div class="al al-i">Loading ' + count + ' prefixes...</div>';
  document.getElementById('pfxModal').classList.add('open');
  document.body.style.overflow = 'hidden';

  fetch(API + '/prefixes?plan=' + encodeURIComponent(planName))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var prefixes = data.prefixes || [];
      if (!prefixes.length) { body.innerHTML = '<div class="al al-w">No prefixes found.</div>'; return; }

      // Group by first character
      var groups = {};
      prefixes.forEach(function (p) {
        var k = p[0];
        if (!groups[k]) groups[k] = [];
        groups[k].push(p);
      });

      var h = '<div style="font-size:13px;color:var(--s);margin-bottom:12px">Total: <strong>' + prefixes.length + '</strong> prefixes</div>';
      Object.keys(groups).sort().forEach(function (letter) {
        var list = groups[letter];
        h += '<div class="pfx-group">';
        h += '<div class="pfx-letter">' + letter + ' <span class="pfx-count">(' + list.length + ')</span></div>';
        h += '<div class="pfx-grid">';
        list.forEach(function (p) { h += '<span class="pfx-tag">' + p + '</span>'; });
        h += '</div></div>';
      });
      body.innerHTML = h;
    })
    .catch(function () { body.innerHTML = '<div class="al al-e">Failed to load prefixes.</div>'; });
}

function closePfx() {
  document.getElementById('pfxModal').classList.remove('open');
  document.body.style.overflow = '';
}

// ── Prefix Search — triggers at exactly 3 chars ───────────────────────────

function sp() {
  var input = document.getElementById('pi');
  input.value = input.value.toUpperCase().replace(/[^A-Z2-9]/g, '');
  var v  = input.value;
  var el = document.getElementById('px');
  var st = document.getElementById('pst');

  if (v.length < 3) {
    el.innerHTML = '';
    st.textContent = v.length > 0 ? 'Enter ' + (3 - v.length) + ' more character' + (3 - v.length > 1 ? 's' : '') : '';
    return;
  }

  st.textContent = 'Searching...';
  fetch(API + '/prefix-search?q=' + encodeURIComponent(v))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var results = data.prefixes || [];
      st.textContent = results.length + ' prefix' + (results.length !== 1 ? 'es' : '') + ' found' + (results.length === 200 ? ' (showing first 200)' : '');
      if (!results.length) { el.innerHTML = '<div class="al al-w">No prefixes found starting with <strong>' + v + '</strong>.</div>'; return; }
      var h = '<table class="ptbl"><tr><th>Prefix</th><th>BCBS Plan</th><th>State</th><th>Availity ID</th><th>270</th><th>278 IP</th><th>278 OP</th><th>Ref</th><th>275</th></tr>';
      results.forEach(function (x) {
        h += '<tr>';
        h += '<td class="mono" style="font-weight:700">' + x.alpha_prefix + '</td>';
        h += '<td>' + x.plan_name + '</td>';
        h += '<td>' + x.state + '</td>';
        h += '<td class="mono" style="font-size:12px">' + (x.availity_payer_ids || '—') + '</td>';
        h += '<td>' + icon(x.has_270) + '</td>';
        h += '<td>' + icon(x.has_pa_in) + '</td>';
        h += '<td>' + icon(x.has_pa_out) + '</td>';
        h += '<td>' + icon(x.has_ref) + '</td>';
        h += '<td>' + icon(x.has_275, true) + '</td>';
        h += '</tr>';
      });
      h += '</table>';
      el.innerHTML = h;
    })
    .catch(function () { st.textContent = 'Network error.'; el.innerHTML = ''; });
}

// ── Feedback modal ────────────────────────────────────────────────────────

function openFeedback(prefix, planName) {
  document.getElementById('fbPrefix').value  = prefix;
  document.getElementById('fbPlan').value    = planName;
  document.getElementById('fbCorrect').value = '';
  document.getElementById('fbDesc').value    = '';
  document.getElementById('fbResult').innerHTML = '';
  var btn = document.getElementById('fbSubmitBtn');
  btn.disabled    = false;
  btn.textContent = 'Send Feedback';
  document.getElementById('feedbackModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeFeedback() {
  document.getElementById('feedbackModal').classList.remove('open');
  document.body.style.overflow = '';
}

function submitFeedback() {
  var prefix  = document.getElementById('fbPrefix').value;
  var plan    = document.getElementById('fbPlan').value;
  var correct = document.getElementById('fbCorrect').value.trim();
  var desc    = document.getElementById('fbDesc').value.trim();
  var btn     = document.getElementById('fbSubmitBtn');
  var result  = document.getElementById('fbResult');

  if (!desc && !correct) {
    result.innerHTML = '<span style="color:var(--et);font-size:13px">Please describe the issue or provide the correct plan name.</span>';
    return;
  }
  btn.disabled    = true;
  btn.textContent = 'Sending...';
  result.innerHTML = '';

  fetch(API + '/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alpha_prefix: prefix, reported_plan: plan, correct_plan: correct, issue_description: desc })
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.success) {
        result.innerHTML = '<span style="color:var(--ok);font-size:13px;font-weight:700">✓ Feedback sent. Thank you!</span>';
        btn.textContent  = 'Sent ✓';
        setTimeout(closeFeedback, 2000);
      } else {
        result.innerHTML = '<span style="color:var(--et);font-size:13px">Submission failed. Please try again.</span>';
        btn.disabled    = false;
        btn.textContent = 'Send Feedback';
      }
    })
    .catch(function () {
      result.innerHTML = '<span style="color:var(--et);font-size:13px">Network error. Please try again.</span>';
      btn.disabled    = false;
      btn.textContent = 'Send Feedback';
    });
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') { closeFeedback(); closePfx(); }
});

// ── State dropdown ────────────────────────────────────────────────────────
(function () {
  var states = ["AL","AR","AZ","CA","CO","CT","DC/MD/VA","DE","FL","GA","HI","IA","ID","IL","IN","INTL","KS","KY","LA","MA","ME","MI","MN","MO","MS","MT","MULTI","NC","ND","NE","NH","NJ","NM","NV","NY","OH","OK","OR","PA","PR","RI","SC","SD","TN","TX","UT","VA","VT","WA","WI","WV","WY"];
  var sel = document.getElementById('df');
  states.forEach(function (s) {
    var o = document.createElement('option');
    o.value = s; o.textContent = s;
    sel.appendChild(o);
  });
})();
