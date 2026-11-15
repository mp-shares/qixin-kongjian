/* 主理口令门 + 接口助手（空间主理页）
   用法：<script src="kongjian.config.js"></script><script src="gate.js"></script>
         await KJ.ready();                        // 没口令就弹输入框，验证通过才继续 → 'edit'
         await KJ.ready({ allowPublic: true });   // 没口令不弹门，直接 'public'（只读）；有口令 'edit'
         await KJ.enter();                        // 只读页上点「进入维护」：弹门，通过 'edit'，点「先只看看」回 false
         const r = await KJ.api('all');           // POST {action, key}，口令错了自动清掉并重新弹门
*/
window.KJ = (function () {
  var API = (window.KONGJIAN_API || '').trim(), KEY = 'qx-space-key';
  function getKey() { try { return localStorage.getItem(KEY) || ''; } catch (_) { return ''; } }
  function setKey(k) { try { k ? localStorage.setItem(KEY, k) : localStorage.removeItem(KEY); } catch (_) {} }
  function post(body) {
    return fetch(API, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); });
  }
  var gateP = null;
  function showGate(msg, cancellable) {
    if (gateP) return gateP;
    gateP = new Promise(function (resolve) {
      var css = '#kj-gate{position:fixed;inset:0;z-index:999;display:grid;place-items:center;background:var(--bg,#f3f4f1);color:var(--fg,#1f2a26);font-family:system-ui,-apple-system,"PingFang SC","Hiragino Sans GB",sans-serif;padding:24px}' +
        '#kj-gate .box{width:min(360px,100%);background:var(--paper,#fff);border:1px solid var(--line,#d3d9d3);border-radius:16px;padding:26px 24px;display:grid;gap:12px;box-shadow:0 20px 60px rgba(0,0,0,.12)}' +
        '#kj-gate .eb{font-size:12px;letter-spacing:.14em;color:var(--fg-2,#5a6660);text-transform:uppercase}' +
        '#kj-gate h1{font-family:"Noto Serif SC","Songti SC",serif;font-size:24px;margin:0 0 4px;font-weight:700}' +
        '#kj-gate p{margin:0;font-size:13.5px;color:var(--fg-2,#5a6660);line-height:1.5}' +
        '#kj-gate input{font:inherit;font-size:18px;letter-spacing:.08em;padding:11px 12px;border:1px solid var(--line,#d3d9d3);border-radius:10px;background:transparent;color:inherit;width:100%}' +
        '#kj-gate button{font:inherit;font-size:15px;font-weight:600;padding:11px;border:0;border-radius:10px;background:var(--accent,#2f6b5a);color:#fff;cursor:pointer}' +
        '#kj-gate button:disabled{opacity:.6}#kj-gate .err{font-size:13px;color:#b4552a;min-height:1.2em}' +
        '#kj-gate input:focus-visible,#kj-gate button:focus-visible{outline:2px solid var(--accent,#2f6b5a);outline-offset:2px}';
      var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
      var el = document.createElement('div'); el.id = 'kj-gate';
      el.innerHTML = '<form class="box"><div class="eb">MindfulPeace · 栖心小院</div><h1>主理口令</h1><p>本页供空间主理人与护持义工使用。输入主理人发的口令，本机会记住。</p>' +
        '<input type="text" id="kj-key" name="kj-space-code" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore placeholder="主理口令" autofocus><div class="err" id="kj-err">' + (msg || '') + '</div><button type="submit" id="kj-go">进入</button>' + (cancellable ? '<button type="button" id="kj-cancel" style="background:transparent;color:var(--fg-2,#5a6660);border:1px solid var(--line,#d3d9d3)">先只看看</button>' : '') + '</form>';
      document.body.appendChild(el);
      var inp = el.querySelector('#kj-key'), err = el.querySelector('#kj-err'), btn = el.querySelector('#kj-go');
      setTimeout(function () { inp.focus(); }, 50);
      var cancel = el.querySelector('#kj-cancel'); if (cancel) cancel.onclick = function () { el.remove(); st.remove(); gateP = null; resolve(false); };
      el.querySelector('form').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var k = inp.value.trim(); if (!k) { err.textContent = '请输入口令'; return; }
        btn.disabled = true; btn.textContent = '验证中…'; err.textContent = '';
        post({ action: 'ping', key: k }).then(function (r) {
          if (r && r.ok && r.auth) { setKey(k); el.remove(); st.remove(); gateP = null; resolve(true); }
          else { err.textContent = '口令不对，请再试一次'; btn.disabled = false; btn.textContent = '进入'; inp.select(); }
        }).catch(function () { err.textContent = '连不上服务器，请稍后再试'; btn.disabled = false; btn.textContent = '进入'; });
      });
    });
    return gateP;
  }
  function api(action, extra) {
    var body = Object.assign({ action: action, key: getKey() }, extra || {});
    return post(body).then(function (r) {
      if (r && !r.ok && /口令/.test(r.error || '')) {
        setKey(''); return showGate('口令已失效，请重新输入').then(function () { return api(action, extra); });
      }
      return r;
    });
  }
  function ready(opts) {
    opts = opts || {};
    if (!API) return Promise.resolve(false);
    if (getKey()) return Promise.resolve('edit');
    if (opts.allowPublic) return Promise.resolve('public');
    return showGate().then(function () { return 'edit'; });
  }
  function enter() { return showGate('', true).then(function (ok) { return ok ? 'edit' : false; }); }
  function logout() { setKey(''); location.reload(); }
  return { api: api, ready: ready, enter: enter, getKey: getKey, logout: logout, hasApi: !!API };
})();
