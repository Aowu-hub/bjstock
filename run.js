/* bjstock run.js — the GitHub website's link to the Stock Master V2 data (13/11/2026 b).
   • router: index.html?page=… → the right page file (same addresses as the Apps Script web app)
   • google.script.run stand-in: every call → POST {api, args, kh} (text/plain JSON) to the /exec link
   • 🔑 company key: typed once per device; it unlocks link.json (PBKDF2-SHA256 150k → AES-GCM 256). The device keeps
     {u, kh} in localStorage, so the key is never asked again unless the key changes or the browser data is cleared. */
(function () {
  'use strict';
  var BASE = location.pathname.replace(/[^/]*$/, ''), ROOT = location.origin + BASE, LS = 'bjstock.unlock.v1';
  var FILE = { stock: 'stock.html', view: 'stock.html', sheets: 'stock.html', map: 'stock.html', users: 'stock.html', out: 'stock.html', links: 'stock.html', photos: 'view.html', admin: 'admin.html' };
  var here = location.pathname.slice(BASE.length) || 'index.html', P = new URLSearchParams(location.search), pg = P.get('page');
  // 🛡 Super Admin on the installed app (13/11/2026 d): the app always starts at /bjstock/ without ?admin=…, so a device that
  // once opened an &admin= link remembers it and puts it back; ?admin=off forgets it (the server still checks the key every call)
  (function () {
    var AK = 'bjstock.admin.v1', a = P.get('admin'), sv = null;
    try { sv = localStorage.getItem(AK); } catch (e) {}
    if (a === 'off') { try { localStorage.removeItem(AK); } catch (e) {} P.delete('admin'); }
    else if (a) { if (a !== sv) try { localStorage.setItem(AK, a); } catch (e) {} return; }
    else if (sv) P.set('admin', sv);
    else return;
    var q = P.toString(); history.replaceState(history.state, '', location.pathname + (q ? '?' + q : '') + location.hash);
  })();
  if ((here === 'index.html' || here === '') && pg) {          // the page's own scripts must not start while we leave
    var noop = new Proxy(function () {}, { get: function (t, k) { return k === 'then' ? undefined : noop; }, apply: function () { return noop; } });
    window.google = { script: { run: noop, url: { getLocation: function () {} }, host: noop } };
    location.replace(BASE + (FILE[pg] || 'view.html') + location.search + location.hash); return;
  }
  window.SMV2_APP_URL = ROOT;
  window.BJSTOCK = { root: ROOT };

  function load() { try { var v = JSON.parse(localStorage.getItem(LS) || 'null'); return v && v.u && v.kh && /\/exec$/.test(v.u) ? v : null; } catch (e) { return null; } }
  function keep(v) { try { if (v) localStorage.setItem(LS, JSON.stringify(v)); else localStorage.removeItem(LS); } catch (e) {} }
  var st = load(), waiters = [];
  function ready() { return st ? Promise.resolve(st) : new Promise(function (res) { waiters.push(res); askKey(); }); }
  function unlocked(v) { st = v; keep(v); var w = waiters; waiters = []; w.forEach(function (f) { f(v); }); }

  /* ---------- 🔑 company key screen ---------- */
  function norm(k) { return String(k || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function sha(t) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)).then(function (h) { return Array.from(new Uint8Array(h)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join(''); }); }
  function open(key, lk) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(key), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(lk.salt), iterations: lk.iter || 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    }).then(function (k) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(lk.iv) }, k, unb64(lk.ct)); })
      .then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); });
  }
  var box = null;
  function askKey(msg) {
    var show = function () {
      if (box) { if (msg) box.querySelector('.bjkErr').textContent = msg; return; }
      box = document.createElement('div'); box.className = 'bjKey'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
      box.innerHTML = '<form class="bjkCard" autocomplete="off"><div class="bjkIc">🔑</div><h2>รหัสบริษัท • Company key</h2>' +
        '<p>ใส่ครั้งเดียว เครื่องนี้จะจำไว้ • Type it once — this device remembers it.</p>' +
        '<input class="bjkIn" type="password" autocomplete="current-password" aria-label="รหัสบริษัท • Company key" placeholder="รหัสบริษัท • company key">' +
        '<p class="bjkErr" role="alert">' + (msg || '') + '</p><button type="submit" class="bjkGo">ปลดล็อก • Unlock</button></form>';
      document.body.appendChild(box);
      var f = box.querySelector('form'), inp = box.querySelector('.bjkIn'), err = box.querySelector('.bjkErr'), go = box.querySelector('.bjkGo');
      setTimeout(function () { inp.focus(); }, 50);
      f.addEventListener('submit', function (e) {
        e.preventDefault(); var k = norm(inp.value); if (!k) { err.textContent = '✕ ใส่รหัส • Type the key'; return; }
        go.disabled = true; go.textContent = '… กำลังตรวจ • Checking'; err.textContent = '';
        fetch(BASE + 'link.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('NOLINK'); return r.json(); })
          .then(function (lk) { return open(k, lk); })
          .then(function (obj) { if (!/\/exec$/.test(String(obj && obj.u || ''))) throw new Error('OLDLINK'); return obj; })
          .then(function (obj) { return sha('bjstock-site:' + k).then(function (kh) { box.remove(); box = null; unlocked({ u: obj.u, kh: kh, at: new Date().toISOString() }); }); })
          .catch(function (er) {
            go.disabled = false; go.textContent = 'ปลดล็อก • Unlock';
             var em = String(er && er.message);
            err.textContent = em === 'OLDLINK' ? '✕ ลิงก์ในเว็บเก่า แจ้งผู้ดูแลให้ตั้งรหัสใหม่ • The website link is outdated — ask the admin to set the key again' : em === 'NOLINK' ? '✕ เว็บยังไม่ได้ตั้งรหัส แจ้งผู้ดูแล • The website is not set up yet — ask the admin' : '✕ รหัสไม่ถูกต้อง • Wrong key';
            inp.select();
          });
      });
    };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
  }

  /* ---------- calls ---------- */
  var READ = /^smv2_(get|check|list|linkReview|linkCatalogue|whOutData|whOutHistory|whOutCargo$|whRoomLoad|whGetCardLines|whOutMatch)/;
  function post(st2, api, args) {
    return fetch(st2.u, { method: 'POST', body: JSON.stringify({ api: api, args: args, kh: st2.kh }), credentials: 'omit', redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (t) { try { return JSON.parse(t); } catch (e) { var x = new Error('NET'); x.body = String(t || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160); throw x; } });
  }
  function call(api, args) {
    if (api === 'smv2_getAppUrl') return Promise.resolve(ROOT);
    return ready().then(function (s) {
      var once = function () { return post(s, api, args); };
      return once().catch(function (e) { if (READ.test(api)) return new Promise(function (r) { setTimeout(r, 800); }).then(once); throw e; })
        .catch(function (e) { netCard(api, e); throw new Error('ติดต่อเซิร์ฟเวอร์ไม่ได้ • Cannot reach the server (' + (e && e.message || e) + ')'); })
        .then(function (j) {
          if (j && j.ok) return j.data;
          var m = String((j && j.error) || 'error');
          if (/^SITE_KEY\b/.test(m) && !/NOT_SET/.test(m)) { keep(null); st = null; askKey('🔑 รหัสถูกเปลี่ยน ใส่รหัสใหม่ • The key was changed — type the new one'); return call(api, args); }
          throw new Error(m);
        });
    });
  }
  var cardShown = false;
  function netCard(api, e) {
    try { console.warn('[bjstock] door', api, e && e.message, e && e.body || ''); } catch (x) {}
    if (cardShown || !document.body) return; cardShown = true;
    var why = String(api || '') + ' · ' + String((e && e.message) || e || '') + (e && e.body ? ' · ' + e.body : '');
    var c = document.createElement('div'); c.className = 'bjNet'; c.setAttribute('role', 'alert');
    c.innerHTML = '<b>⚠ ติดต่อเซิร์ฟเวอร์ไม่ได้ • Can\'t reach the server</b><span>ตรวจเน็ตแล้วลองใหม่ • Check the internet and try again</span>' +
      '<small class="bjNetWhy"></small><div><button type="button" class="bjNetGo">⟳ ลองใหม่ • Try again</button>' + (st ? '<a target="_top" href="' + st.u + location.search.replace(/"/g, '') + '">เปิดหน้าเดิม • Open the old page</a>' : '') + '</div>';
    c.querySelector('.bjNetWhy').textContent = why;
    document.body.appendChild(c);
    c.querySelector('.bjNetGo').onclick = function () { location.reload(); };
  }
  function runner() {
    var ok = null, bad = null, uo, h = {};
    var p = new Proxy(h, { get: function (t, k) {
      if (k === 'then') return undefined;
      if (k === 'withSuccessHandler') return function (f) { ok = f; return p; };
      if (k === 'withFailureHandler') return function (f) { bad = f; return p; };
      if (k === 'withUserObject') return function (o) { uo = o; return p; };
      if (typeof k !== 'string') return undefined;
      return function () { var a = Array.prototype.slice.call(arguments);
        call(k, a).then(function (d) { if (ok) ok(d, uo); }, function (e) { if (bad) bad(e, uo); else if (window.console) console.warn(k, e); }); };
    } });
    return p;
  }
  var g = window.google = window.google || {};
  g.script = g.script || {};
  g.script.run = new Proxy({}, { get: function (t, k) { if (k === 'then') return undefined; return runner()[k]; } });
  g.script.url = { getLocation: function (cb) { var o = {}, os = {}; P.forEach(function (v, k) { if (!(k in o)) o[k] = v; (os[k] = os[k] || []).push(v); }); setTimeout(function () { cb({ parameter: o, parameters: os, hash: location.hash.replace(/^#/, '') }); }, 0); } };
  g.script.host = { close: function () {}, setHeight: function () {}, setWidth: function () {}, editor: { focus: function () {} } };
  if (!st && document.readyState !== 'loading') askKey(); else if (!st) document.addEventListener('DOMContentLoaded', function () { if (!st) askKey(); });
  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register(BASE + 'sw.js').catch(function () {}); });
})();
