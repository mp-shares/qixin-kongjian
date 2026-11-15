/* 空间主理各页共用脚本（kongjian.core.js）
   职责：拉六张表 → 派生索引 → 保存/删除 → 照片 → 通用弹窗表单 → 四个编辑器（物料/移位/收纳区/预约/借还）。各页独立，不放页间页签；入口以后由首页统一给。
   每页只写自己的渲染与事件：
     <link rel="stylesheet" href="kongjian.css">
     <script src="kongjian.config.js"></script><script src="gate.js"></script><script src="kongjian.core.js"></script>
     KJC.start({ render: function () { … }, allowPublic: true });   // 数据到齐/每次保存后都会调 render
   模式：有口令 = 'edit'（全功能）；allowPublic 且没口令 = 'public'（只读：走 public 动作拿裁剪过的表，<html data-mode="public">，.edit-only 元素隐藏）。
   页面上可选的元素：#st/#stt（连接状态）、#btn-reload、#btn-logout、#btn-enter（只读时显示，点了弹口令门）。弹窗/灯箱/提示条/datalist 由本脚本注入。 */
window.KJC = (function () {
  'use strict';
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var T = { '库存': [], '收纳区': [], '借还': [], '看板': [], '品类映射': [], '产品库': [], '周期事项': [] };
  var CLASS_ORDER = ['活动物料', '禅修物料', '美学物料', '结缘文创', '生活物料', '日常工具用品', '家电设备', '工程物料', '待分类'];
  var SCENE_ORDER = ['茶会', '初级茶课', '煮茶观心', '读书会', '抄经', '静心插花', '正念课', '养生按导', '市集', '结缘', '学堂', '活动', '空间布置', '日常运营', '通用'];
  var LEVELS = ['分区', '收纳体', '格'];
  var today = function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  var split = function (s) { return String(s || '').split(/[\/、,，;\n]/).map(function (x) { return x.trim(); }).filter(Boolean); };
  var natCmp = function (a, b) { return String(a).localeCompare(String(b), 'zh', { numeric: true }); };
  var toast = function (m) { var t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, 1800); };
  var setStatus = function (cls, text) { var s = $('#st'); if (!s) return; s.className = 'status ' + cls; $('#stt').textContent = text; };

  /* ---------- 派生 ---------- */
  var prodByName = {}, cmap = {}, zmap = {};
  function derive() {
    prodByName = {}; cmap = {}; zmap = {};
    T['产品库'].slice().sort(function (a, b) { return (a['来源'] === 'DC' ? 0 : 1) - (b['来源'] === 'DC' ? 0 : 1); }).forEach(function (p) { if (!prodByName[p['物料名称']]) prodByName[p['物料名称']] = p; });
    T['品类映射'].forEach(function (m) { cmap[m['品类']] = m; });
    T['收纳区'].forEach(function (z) { zmap[z['编号']] = z; });
  }
  function pinOf(r) { var p = prodByName[(r['对照产品库'] || '').trim()]; return p ? p['品类'] : '未对照'; }
  function classOf(r) { var m = cmap[pinOf(r)] || cmap['未对照']; return m ? m['管理类'] : '待分类'; }
  function defaultZone(r) { var m = cmap[pinOf(r)]; return m ? m['默认收纳区'] : ''; }
  function isTemple(r) { return String(r['归属'] || '').indexOf('小院公共') === 0; }
  function locs(r) { return split(r['存放位置']); }
  function levelOf(z) { if (LEVELS.indexOf(z['层级']) >= 0) return z['层级']; var c = z['编号'] || ''; return /^[A-Z]$/.test(c) ? '分区' : /^[A-Z]\d+$/.test(c) ? '收纳体' : '格'; }
  function parentOf(z) { if (z['上级'] && zmap[z['上级']]) return zmap[z['上级']]; var c = z['编号'] || ''; var m = /^(.+)-\d+$/.exec(c) || /^([A-Z])\d+$/.exec(c); return m && zmap[m[1]] ? zmap[m[1]] : null; }
  function areaOf(code) { var z = zmap[code], guard = 0; while (z && levelOf(z) !== '分区' && guard++ < 6) z = parentOf(z); return z ? z['名称'] : (zmap[code] ? zmap[code]['所在分区'] : ''); }
  function pathOf(code) { var out = [], z = zmap[code], guard = 0; while (z && guard++ < 6) { out.unshift(z['名称']); z = parentOf(z); } return out.join(' › ') || code; }
  function children(code) { return T['收纳区'].filter(function (z) { var p = parentOf(z); return p && p['编号'] === code; }).sort(function (a, b) { return natCmp(a['编号'], b['编号']); }); }
  function areas() { return T['收纳区'].filter(function (z) { return levelOf(z) === '分区'; }).sort(function (a, b) { return natCmp(a['编号'], b['编号']); }); }
  function photos(z) { return split(z['照片']); }
  function openLoans() { return T['借还'].filter(function (l) { return l['类别'] === '借出' && l['状态'] !== '已还'; }); }
  function loanedQty(name) { return openLoans().filter(function (l) { return l['物料名称'] === name; }).map(function (l) { return l['数量']; }).join('+'); }
  function sortClass(a, b) { var i = CLASS_ORDER.indexOf(a), j = CLASS_ORDER.indexOf(b); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j); }
  function sortScene(a, b) { var i = SCENE_ORDER.indexOf(a), j = SCENE_ORDER.indexOf(b); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j); }
  function locHtml(r) { var L = locs(r); if (!L.length) return '<span class="loc none">未定位</span>'; return L.map(function (c) { return '<span class="loc" title="' + esc(pathOf(c)) + '">' + esc(c) + '</span>'; }).join(''); }
  function nextCode(level, parent) {
    var used = T['收纳区'].map(function (z) { return z['编号']; });
    if (level === '分区') { for (var i = 0; i < 26; i++) { var L = String.fromCharCode(65 + i); if (used.indexOf(L) < 0) return L; } return ''; }
    if (!parent) return '';
    var sep = level === '格' ? '-' : '', n = 1;
    while (used.indexOf(parent + sep + n) >= 0) n++;
    return parent + sep + n;
  }
  function zonesForPlacing() { return T['收纳区'].filter(function (z) { return levelOf(z) !== '分区'; }).sort(function (a, b) { return natCmp(a['编号'], b['编号']); }); }

  // 周期事项：上次完成 + 周期 → 下次到期（没做过 = 今天到期）；每次活动后 不算日期
  var PERIOD_DAYS = { '每周': 7, '每月': 30, '每季': 91, '每年': 365 };
  function nextDue(z) {
    var d = PERIOD_DAYS[z['周期']]; if (!d) return '';
    if (!/^\d{4}-\d{2}-\d{2}/.test(z['上次完成'] || '')) return today();
    var t = new Date(z['上次完成'].slice(0, 10) + 'T00:00:00'); t.setDate(t.getDate() + d);
    return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);
  }
  function dueState(z) { var n = nextDue(z); if (!n) return ''; var td = today(); if (n < td) return 'over'; var soon = new Date(td + 'T00:00:00'); soon.setDate(soon.getDate() + 3); return n <= soon.toISOString().slice(0, 10) ? 'due' : ''; }

  /* ---------- 数据 ---------- */
  var renderFns = [], mode = 'edit';
  function canEdit() { return mode === 'edit'; }
  function setMode(m) {
    mode = m; document.documentElement.setAttribute('data-mode', m);
    var en = $('#btn-enter'), lo = $('#btn-logout'); if (en) en.hidden = m !== 'public'; if (lo) lo.hidden = m === 'public';
  }
  function renderAll() { renderLists(); renderFns.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }
  function load() {
    setStatus('', '读取中…');
    return KJ.api(mode === 'public' ? 'public' : 'all').then(function (r) {
      if (!r || !r.ok) throw new Error(r && r.error || '读取失败');
      Object.keys(T).forEach(function (k) { T[k] = r.tables[k] || []; });
      derive(); renderAll();
      setStatus('on', (mode === 'public' ? '只读 · ' : '') + '已连接 · ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
    }).catch(function (e) { setStatus('err', '读取失败：' + e.message); });
  }
  var KEYS = { '库存': 'id', '收纳区': '编号', '借还': 'id', '看板': 'id', '周期事项': 'id' };
  function byId(t, id) { var k = KEYS[t]; return T[t].filter(function (x) { return x[k] === id; })[0]; }
  function putLocal(table, row) { var k = KEYS[table], arr = T[table], i = arr.findIndex(function (x) { return x[k] === row[k]; }); if (i >= 0) arr[i] = row; else arr.push(row); derive(); }
  function save(table, row, quiet) {
    return KJ.api('set', { table: table, row: row }).then(function (r) {
      if (!r || !r.ok) throw new Error(r && r.error || '保存失败');
      putLocal(table, r.row); if (!quiet) { renderAll(); toast('已保存'); } return r.row;
    }).catch(function (e) { toast(e.message); throw e; });
  }
  function remove(table, id) {
    return KJ.api('delete', { table: table, id: id }).then(function (r) {
      if (!r || !r.ok) throw new Error(r && r.error || '删除失败');
      T[table] = T[table].filter(function (x) { return x[KEYS[table]] !== id; });
      derive(); renderAll(); toast('已删除');
    }).catch(function (e) { toast(e.message); throw e; });
  }
  function renderLists() {
    $('#dl-items').innerHTML = T['库存'].map(function (r) { return r['物料名称']; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
    $('#dl-zones').innerHTML = zonesForPlacing().map(function (z) { return '<option value="' + esc(z['编号']) + '">' + esc(pathOf(z['编号'])) + '</option>'; }).join('');
    $('#dl-prod').innerHTML = Object.keys(prodByName).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
  }

  /* ---------- 照片 ---------- */
  var photoCache = {};
  function fetchPhoto(fid) {
    if (photoCache[fid]) return photoCache[fid];
    photoCache[fid] = KJ.api('photo', { fileId: fid }).then(function (r) { if (!r || !r.ok) throw new Error(r && r.error || '取图失败'); return r.dataUrl; }).catch(function (e) { delete photoCache[fid]; throw e; });
    return photoCache[fid];
  }
  function hydratePhotos(root) {
    (root || document).querySelectorAll('img[data-fid]:not([src])').forEach(function (img) {
      var fid = img.dataset.fid;
      fetchPhoto(fid).then(function (u) { img.src = u; }).catch(function () { img.alt = '✕'; });
    });
  }
  function phHtml(z, size) { var P = photos(z); if (!P.length) return ''; return '<div class="ph' + (size === 'lg' ? ' lg' : '') + '">' + P.map(function (f) { return '<img data-fid="' + esc(f) + '" alt="' + esc(z['名称']) + '" loading="lazy">'; }).join('') + '</div>'; }
  function shrink(file) {   // 长边 1600 · JPEG 0.82 → {name,type,data}
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var MAX = 1600, w = img.width, h = img.height, s = Math.min(1, MAX / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        res({ name: file.name, type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.82) });
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('读不了这张图')); };
      img.src = url;
    });
  }

  function addPhotos(table, id, fileList) {   // 直接给某行挂照片：压缩 → photo_add → 本地更新 → 重绘
    var fs = Array.prototype.slice.call(fileList || []); if (!fs.length) return Promise.resolve();
    toast('上传中…');
    return Promise.all(fs.map(shrink)).then(function (arr) { return KJ.api('photo_add', { table: table, id: id, files: arr }); })
      .then(function (r) { if (!r || !r.ok) throw new Error(r && r.error || '照片上传失败'); putLocal(table, r.row); renderAll(); toast('照片已上传'); })
      .catch(function (e) { toast(e.message); });
  }

  /* ---------- 页面骨架注入：弹窗 / 灯箱 / 提示条 / datalist ---------- */
  function mountChrome() {
    var frag = document.createElement('div');
    frag.innerHTML = '<datalist id="dl-items"></datalist><datalist id="dl-zones"></datalist><datalist id="dl-prod"></datalist>' +
      '<dialog id="dlg"><div class="dh" id="dlg-h"></div><div class="db"><form class="form" id="dlg-f"></form></div><div class="df"><button class="btn danger" id="dlg-del" type="button">删除</button><span style="flex:1"></span><button class="btn" id="dlg-x" type="button">取消</button><button class="btn primary" id="dlg-ok" type="button">保存</button></div></dialog>' +
      '<dialog id="lb"><img alt=""></dialog><div class="toast" id="toast"></div>';
    while (frag.firstChild) document.body.appendChild(frag.firstChild);
    document.addEventListener('click', function (e) {
      var img = e.target.closest('.ph img[src]'); if (!img || e.target.closest('dialog#dlg')) return;
      $('#lb img').src = img.src; $('#lb').showModal();
    });
    $('#lb').addEventListener('click', function () { $('#lb').close(); });
    var rl = $('#btn-reload'), lo = $('#btn-logout'), en = $('#btn-enter');
    if (rl) rl.onclick = load; if (lo) lo.onclick = function () { KJ.logout(); };
    if (en) en.onclick = function () { KJ.enter().then(function (m) { if (m === 'edit') { setMode('edit'); load(); } }); };
    bindDialog();
  }

  /* ---------- 通用弹窗表单 ---------- */
  var dlg, dlgF, dlgCb = null;
  function bindDialog() {
    dlg = $('#dlg'); dlgF = $('#dlg-f');
    $('#dlg-x').onclick = function () { dlg.close(); };
    $('#dlg-ok').onclick = function () {
      if (!dlgF.reportValidity()) return;
      var b = $('#dlg-ok'); b.disabled = true; b.textContent = '保存中…';
      Promise.resolve(dlgCb.save(formValues())).then(function () { dlg.close(); }).catch(function () {}).then(function () { b.disabled = false; b.textContent = '保存'; });
    };
    $('#dlg-del').onclick = function () { if (confirm('确定删除这一条？')) { Promise.resolve(dlgCb.del()).then(function () { dlg.close(); }).catch(function () {}); } };
    dlgF.addEventListener('submit', function (e) { e.preventDefault(); $('#dlg-ok').click(); });
  }
  function openForm(title, fields, values, onSave, onDelete, extra) {
    $('#dlg-h').textContent = title; dlgF.innerHTML = '';
    var grid = null;
    fields.forEach(function (f) {
      var lab = document.createElement('label'); lab.textContent = f.label || f.k;
      var el;
      if (f.type === 'select') { el = document.createElement('select'); (f.options || []).forEach(function (o) { var op = document.createElement('option'); op.value = typeof o === 'string' ? o : o.v; op.textContent = typeof o === 'string' ? (o || '（空）') : o.t; el.appendChild(op); }); }
      else if (f.type === 'textarea') { el = document.createElement('textarea'); el.rows = 2; }
      else { el = document.createElement('input'); el.type = f.type || 'text'; if (f.list) el.setAttribute('list', f.list); el.autocomplete = 'off'; }
      el.name = f.k; el.value = values[f.k] == null || values[f.k] === '' ? (f.def || '') : values[f.k]; if (f.required) el.required = true; if (f.ph) el.placeholder = f.ph; if (f.ro) el.readOnly = true;
      if (f.onchange) el.addEventListener('change', f.onchange); if (f.oninput) el.addEventListener('input', f.oninput);
      lab.appendChild(el);
      if (f.half) { if (!grid) { grid = document.createElement('div'); grid.className = 'row2'; dlgF.appendChild(grid); } grid.appendChild(lab); if (grid.children.length === 2) grid = null; }
      else { grid = null; dlgF.appendChild(lab); }
    });
    if (extra) dlgF.appendChild(extra);
    $('#dlg-del').style.display = onDelete ? '' : 'none';
    dlgCb = { save: onSave, del: onDelete };
    dlg.showModal();
    setTimeout(function () { var first = dlgF.querySelector('input:not([readonly]),select,textarea'); first && first.focus(); }, 30);
  }
  function formValues() { var o = {}; Array.prototype.forEach.call(dlgF.elements, function (el) { if (el.name && el.type !== 'file') o[el.name] = el.value.trim(); }); return o; }

  /* ---------- 编辑器：物料 ---------- */
  function editItem(r) {
    var isNew = !r; r = r || {};
    openForm(isNew ? '新增物料' : '编辑 · ' + r['物料名称'], [
      { k: '物料名称', label: '物料名称', required: true },
      { k: '数量', label: '数量（带单位，如 10套）', required: true, half: true },
      { k: '状态', label: '状态', type: 'select', options: ['在库', '借出', '结缘', '报损', '待处理'], half: true },
      { k: '存放位置', label: '存放位置（编号，多处用 / 分隔）', list: 'dl-zones', ph: defaultZone(r) ? '建议 ' + defaultZone(r) : 'A1 或 D1-2' },
      { k: '对照产品库', label: '对照产品库（决定品类/管理类）', list: 'dl-prod', half: true },
      { k: '归属', label: '归属', type: 'select', options: ['小院公共', '小院公共·供养', '个人请购'], half: true },
      { k: '批次', label: '批次', half: true }, { k: '单价(元)', label: '单价(元)', half: true },
      { k: '渠道', label: '渠道', half: true }, { k: '备注', label: '备注', half: true }
    ], r, function (v) { v.id = r.id || ''; return save('库存', v); }, isNew ? null : function () { return remove('库存', r.id); });
  }
  function moveItem(r) {
    openForm('移动 · ' + r['物料名称'], [{ k: '存放位置', label: '存放位置（编号，多处用 / 分隔）', list: 'dl-zones', required: true, def: defaultZone(r) }], r,
      function (v) { return save('库存', Object.assign({}, r, v)); });
  }

  /* ---------- 编辑器：收纳区（树 + 照片） ---------- */
  function editZone(z, preset) {
    var isNew = !z; z = z || {}; preset = preset || {};
    var level = z['层级'] || preset['层级'] || (isNew ? '收纳体' : levelOf(z));
    var parent = z['上级'] || preset['上级'] || (isNew ? '' : (parentOf(z) ? parentOf(z)['编号'] : ''));
    var codeTouched = !isNew;
    var pending = [], drops = [];
    function parentOptions(lv) {
      var want = lv === '收纳体' ? '分区' : lv === '格' ? ['收纳体', '格'] : null;
      if (!want) return [{ v: '', t: '（分区没有上级）' }];
      return T['收纳区'].filter(function (x) { return x['编号'] !== z['编号'] && (Array.isArray(want) ? want.indexOf(levelOf(x)) >= 0 : levelOf(x) === want); })
        .sort(function (a, b) { return natCmp(a['编号'], b['编号']); }).map(function (x) { return { v: x['编号'], t: x['编号'] + ' ' + pathOf(x['编号']) }; });
    }
    function refillParent() {
      var lv = dlgF.elements['层级'].value, sel = dlgF.elements['上级'];
      sel.innerHTML = ''; parentOptions(lv).forEach(function (o) { var op = document.createElement('option'); op.value = o.v; op.textContent = o.t; sel.appendChild(op); });
      sel.disabled = lv === '分区'; if (lv !== '分区' && parent && [].some.call(sel.options, function (o) { return o.value === parent; })) sel.value = parent;
      refillCode();
    }
    function refillCode() { if (codeTouched) return; var lv = dlgF.elements['层级'].value; dlgF.elements['编号'].value = nextCode(lv, dlgF.elements['上级'].value); }
    var panel = document.createElement('div'); panel.className = 'photos';
    function drawPanel() {
      var P = photos(z).filter(function (f) { return drops.indexOf(f) < 0; });
      panel.innerHTML = '<div>照片 <span class="mut">（整体一张、细节一张；最多 6 张，自动压缩）</span></div>' +
        '<div class="ph">' + P.map(function (f) { return '<span class="pw"><img data-fid="' + esc(f) + '" alt=""><button type="button" data-drop="' + esc(f) + '" title="移除">×</button></span>'; }).join('') +
        pending.map(function (p, i) { return '<span class="pw"><img src="' + p.data + '" alt=""><button type="button" data-undo="' + i + '" title="取消">×</button></span>'; }).join('') + '</div>' +
        '<div class="up"><input type="file" accept="image/*" multiple capture="environment" id="ph-in"><span class="mut">手机上会直接调相机</span></div>';
      hydratePhotos(panel);
      $('#ph-in', panel).addEventListener('change', function () {
        var fs = Array.prototype.slice.call(this.files || []);
        Promise.all(fs.map(shrink)).then(function (arr) { pending = pending.concat(arr); drawPanel(); }).catch(function (e) { toast(e.message); });
      });
    }
    panel.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.drop) drops.push(b.dataset.drop); else if (b.dataset.undo) pending.splice(+b.dataset.undo, 1);
      drawPanel();
    });
    drawPanel();
    openForm(isNew ? '新增' + level : level + ' · ' + z['编号'] + ' ' + z['名称'], [
      { k: '层级', label: '层级', type: 'select', options: LEVELS, def: level, half: true, onchange: refillParent },
      { k: '上级', label: '上级', type: 'select', options: parentOptions(level), def: parent, half: true, onchange: refillCode },
      { k: '编号', label: '编号（自动，可改）', required: true, half: true, ro: !isNew, oninput: function () { codeTouched = true; } },
      { k: '名称', label: '名称（如 书柜一 / 架第2层）', required: true, half: true },
      { k: '类型', label: '类型（书柜/边柜/货架/开放架/层/筐/箱…）', half: true },
      { k: '存放类别', label: '放什么（类别描述，给标签用）', half: true },
      { k: '标签文字', label: '标签文字（空=用名称）', half: true },
      { k: '状态', label: '状态', type: 'select', options: ['拟定', '启用', '停用'], half: true },
      { k: '说明', label: '说明（位置、取用注意…）', type: 'textarea' },
      { k: '备注', label: '备注' }
    ], z, function (v) {
      if (v['层级'] === '分区') { v['上级'] = ''; v['所在分区'] = v['名称']; } else { v['所在分区'] = areaOf(v['上级']) || ''; }
      v['照片'] = photos(z).filter(function (f) { return drops.indexOf(f) < 0; }).join(',');
      return save('收纳区', v, true).then(function (row) {
        var p = Promise.resolve(row);
        drops.forEach(function (f) { p = p.then(function () { return KJ.api('photo_del', { table: '收纳区', id: row['编号'], fileId: f }); }); });
        if (pending.length) p = p.then(function () { return KJ.api('photo_add', { table: '收纳区', id: row['编号'], files: pending }).then(function (r) { if (!r || !r.ok) throw new Error(r && r.error || '照片上传失败'); putLocal('收纳区', r.row); }); });
        return p.then(function () { renderAll(); toast('已保存'); }).catch(function (e) { renderAll(); toast(e.message); throw e; });
      });
    }, isNew ? null : function () {
      if (children(z['编号']).length) { toast('先处理它下面的收纳体/格'); return Promise.reject(); }
      if (T['库存'].some(function (r) { return locs(r).indexOf(z['编号']) >= 0; })) { toast('里面还有物料，先移走'); return Promise.reject(); }
      return remove('收纳区', z['编号']);
    }, panel);
    if (isNew) refillParent();
  }

  /* ---------- 编辑器：看板 / 借还 ---------- */
  function editBook(b) {
    var isNew = !b; b = b || {};
    openForm(isNew ? '新预约' : '预约 · ' + b['活动主题'], [
      { k: '活动主题', label: '活动主题', required: true },
      { k: '日期', label: '日期（YYYY-MM-DD，常设写「每周一」）', required: true, half: true, def: today() },
      { k: '时段', label: '时段（如 14:00–17:00）', half: true },
      { k: '类型', label: '类型', type: 'select', options: ['传灯', '内部', '专项', '常设', '其他'], half: true },
      { k: '预约人', label: '预约人 / 责任人', required: true, half: true },
      { k: '人数', label: '人数', half: true }, { k: '分区', label: '使用分区', half: true, def: '茶席·活动区' },
      { k: '设备/物料', label: '设备 / 物料需求' },
      { k: '状态', label: '状态', type: 'select', options: ['已约', '已办', '已验收', '取消'], half: true }, { k: '备注', label: '备注 / 验收情况', half: true }
    ], b, function (v) { v.id = b.id || ''; return save('看板', v); }, isNew ? null : function () { return remove('看板', b.id); });
  }
  function editLoan(l) {
    openForm('记录 · ' + l['物料名称'], [
      { k: '物料名称', label: '物料', list: 'dl-items', required: true }, { k: '数量', label: '数量', half: true, required: true },
      { k: '类别', label: '类别', type: 'select', options: ['借出', '结缘', '报损'], half: true },
      { k: '借用人/去向', label: '借用人 / 去向', half: true }, { k: '用途/活动', label: '用途 / 活动', half: true },
      { k: '日期', label: '日期', type: 'date', half: true }, { k: '预计归还', label: '预计归还', type: 'date', half: true },
      { k: '归还日期', label: '归还日期', type: 'date', half: true },
      { k: '状态', label: '状态', type: 'select', options: ['借出', '已还', '已结缘', '已报损'], half: true },
      { k: '经手人', label: '经手人', half: true }, { k: '备注', label: '备注', half: true }
    ], l, function (v) { v.id = l.id; return save('借还', v); }, function () { return remove('借还', l.id); });
  }

  /* ---------- 启动 ---------- */
  function start(opt) {
    opt = opt || {};
    mountChrome();
    if (opt.render) renderFns.push(opt.render);
    if (!KJ.hasApi) { setStatus('err', '未配置接口：填 kongjian.config.js'); return; }
    KJ.ready({ allowPublic: !!opt.allowPublic }).then(function (m) { if (!m) return; setMode(m); load(); });
  }

  return {
    $: $, esc: esc, T: T, LEVELS: LEVELS, CLASS_ORDER: CLASS_ORDER, SCENE_ORDER: SCENE_ORDER,
    today: today, split: split, natCmp: natCmp, toast: toast, setStatus: setStatus,
    zmap: function () { return zmap; }, prodByName: function () { return prodByName; }, cmap: function () { return cmap; },
    pinOf: pinOf, classOf: classOf, defaultZone: defaultZone, isTemple: isTemple, locs: locs, levelOf: levelOf, parentOf: parentOf,
    areaOf: areaOf, pathOf: pathOf, children: children, areas: areas, photos: photos, openLoans: openLoans, loanedQty: loanedQty,
    sortClass: sortClass, sortScene: sortScene, locHtml: locHtml, nextCode: nextCode, zonesForPlacing: zonesForPlacing,
    load: load, save: save, remove: remove, byId: byId, renderAll: renderAll, canEdit: canEdit, nextDue: nextDue, dueState: dueState,
    hydratePhotos: hydratePhotos, phHtml: phHtml, addPhotos: addPhotos, openForm: openForm,
    editItem: editItem, moveItem: moveItem, editZone: editZone, editBook: editBook, editLoan: editLoan,
    start: start
  };
})();
