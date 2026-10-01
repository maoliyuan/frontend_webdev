/* 会员管理系统 · app.js
 * 纯前端 + Supabase（CDN 引入 supabase-js）
 * 后端适配层：配置了 Supabase 就走真库；没配置走「演示模式」（localStorage 模拟）
 */
(function () {
  'use strict';

  /* ================= 工具 ================= */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var toastTimer = null;
  function toast(msg, long) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, long ? 3600 : 2200);
  }
  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return String(iso);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function normPhone(s) { return String(s || '').replace(/\D+/g, ''); }
  function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function friendlyError(e) {
    var m = String((e && (e.message || e.error_description || e.msg)) || e || '未知错误');
    if (/invalid login credentials/i.test(m)) return '邮箱或密码不正确';
    if (/email not confirmed/i.test(m)) return '邮箱还没验证：去 Supabase 后台 Authentication → Users 把该用户标为已确认';
    if (/failed to fetch|networkerror|fetch failed/i.test(m)) return '网络连接失败，请检查网络后重试';
    if (/剩余次数不足/.test(m)) return m;
    if (/JWT|token/i.test(m) && /expir/i.test(m)) return '登录已过期，请重新登录';
    return m;
  }

  /* ================= 后端适配层 =================
   * 统一接口：signIn / signOut / getSession / onAuth /
   *          listMembers / saveMember / adjust / listTx / listAllTx
   */
  function demoBackend() {
    var KEY = 'member_demo_v1';
    function db() {
      try { return JSON.parse(localStorage.getItem(KEY)) || { session: null, members: [], tx: [] }; }
      catch (e) { return { session: null, members: [], tx: [] }; }
    }
    function persist(d) { localStorage.setItem(KEY, JSON.stringify(d)); }
    function emit() { if (cb) cb(db().session); }
    var cb = null;
    return {
      kind: 'demo',
      signIn: function (email, pass) {
        try {
          if (!email || !pass) throw new Error('请输入邮箱和密码');
          var d = db(); d.session = { email: email }; persist(d);
          setTimeout(emit, 0);
          return Promise.resolve();
        } catch (e) { return Promise.reject(e); }
      },
      signOut: function () { var d = db(); d.session = null; persist(d); setTimeout(emit, 0); return Promise.resolve(); },
      onAuth: function (fn) { cb = fn; setTimeout(function () { fn(db().session); }, 0); },
      listMembers: function () { return Promise.resolve(db().members.slice().sort(byUpdated)); },
      saveMember: function (data, id) {
        var d = db(), now = new Date().toISOString();
        if (id) {
          var m = d.members.filter(function (x) { return x.id === id; })[0];
          if (!m) return Promise.reject(new Error('会员不存在'));
          m.name = data.name; m.phone = data.phone; m.note = data.note;
          m.updated_at = now;
          persist(d); return Promise.resolve(m);
        }
        var nm = { id: uid(), name: data.name, phone: data.phone, remaining: data.remaining || 0,
                   note: data.note, created_at: now, updated_at: now };
        d.members.push(nm); persist(d);
        return Promise.resolve(nm);
      },
      adjust: function (memberId, delta, note) {
        var d = db(), m = d.members.filter(function (x) { return x.id === memberId; })[0];
        if (!m) return Promise.reject(new Error('会员不存在'));
        var v = m.remaining + delta;
        if (v < 0) return Promise.reject(new Error('剩余次数不足（当前 ' + m.remaining + ' 次）'));
        m.remaining = v; m.updated_at = new Date().toISOString();
        d.tx.unshift({ id: uid(), member_id: m.id, member_name: m.name, delta: delta,
                       remaining_after: v, note: note || '', created_at: new Date().toISOString() });
        persist(d); return Promise.resolve(v);
      },
      listTx: function (memberId) {
        return Promise.resolve(db().tx.filter(function (t) { return !memberId || t.member_id === memberId; }).slice(0, 200));
      },
      listAllTx: function () { return Promise.resolve(db().tx.slice(0, 5000)); }
    };
  }

  function supabaseBackend() {
    var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    function unwrap(r) {
      if (r.error) throw r.error;
      return r.data;
    }
    return {
      kind: 'supabase',
      signIn: function (email, pass) {
        return sb.auth.signInWithPassword({ email: email, password: pass }).then(function (r) {
          if (r.error) throw r.error;
        });
      },
      signOut: function () { return sb.auth.signOut().then(function () {}); },
      onAuth: function (fn) {
        sb.auth.onAuthStateChange(function (event, sess) {
          if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') fn(sess);
        });
      },
      listMembers: function () {
        return sb.from('members').select('*').order('updated_at', { ascending: false }).limit(2000).then(unwrap);
      },
      saveMember: function (data, id) {
        if (id) {
          return sb.from('members').update({ name: data.name, phone: data.phone, note: data.note })
            .eq('id', id).select().single().then(unwrap);
        }
        return sb.from('members').insert({ name: data.name, phone: data.phone, note: data.note,
          remaining: data.remaining || 0 }).select().single().then(unwrap);
      },
      adjust: function (memberId, delta, note) {
        return sb.rpc('adjust_remaining', { p_member_id: memberId, p_delta: delta, p_note: note || '' })
          .then(function (r) {
            if (r.error) throw r.error;
            return r.data;   // 最新剩余次数
          });
      },
      listTx: function (memberId) {
        var q = sb.from('transactions').select('*').order('created_at', { ascending: false }).limit(200);
        if (memberId) q = q.eq('member_id', memberId);
        return q.then(unwrap);
      },
      listAllTx: function () {
        return sb.from('transactions').select('*').order('created_at', { ascending: false }).limit(5000).then(unwrap);
      }
    };
  }

  function byUpdated(a, b) {
    return a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0;
  }

  var backend = (typeof SUPABASE_URL === 'string' && SUPABASE_URL && typeof SUPABASE_ANON_KEY === 'string' && SUPABASE_ANON_KEY)
    ? supabaseBackend() : demoBackend();

  /* ================= 状态 ================= */
  var MEMBERS = [];        // 全部会员（本地缓存，操作后即时更新）
  var curMember = null;    // 弹层当前会员
  var busy = false;        // 防双击/防并发提交
  var amountMode = 'charge';

  /* ================= 视图切换 ================= */
  function showLogin() {
    $('view-app').classList.add('hidden');
    $('view-login').classList.remove('hidden');
    $('login-err').textContent = '';
  }
  function showApp() {
    $('view-login').classList.add('hidden');
    $('view-app').classList.remove('hidden');
    if (backend.kind === 'demo') $('demo-banner').classList.remove('hidden');
    reload();
  }

  function reload() {
    $('member-list').innerHTML = '<div class="empty">加载中…</div>';
    backend.listMembers().then(function (rows) {
      MEMBERS = rows || [];
      renderList();
    }).catch(function (e) {
      $('member-list').innerHTML = '<div class="empty empty-err">' + esc(friendlyError(e)) + '</div>';
    });
  }

  /* ================= 列表 + 搜索 ================= */
  function matchQuery(m, q) {
    if (!q) return true;
    var name = String(m.name || '');
    var phone = String(m.phone || '');
    return name.indexOf(q) >= 0 || phone.indexOf(q) >= 0;
  }
  function renderList() {
    var q = $('search').value.trim();
    var list = q ? MEMBERS.filter(function (m) { return matchQuery(m, q); }) : MEMBERS;
    $('search-count').textContent = MEMBERS.length ? (list.length + '/' + MEMBERS.length) : '';
    if (!MEMBERS.length) {
      $('member-list').innerHTML = '<div class="empty">还没有会员<br>点右下角 ＋ 新增第一位</div>';
      return;
    }
    if (!list.length) {
      $('member-list').innerHTML = '<div class="empty">没找到「' + esc(q) + '」</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      html += '<div class="member-card" data-id="' + esc(m.id) + '">' +
        '<div class="mc-info">' +
          '<div class="mc-name">' + esc(m.name) + (m.note ? ' <small class="mc-note">📎</small>' : '') + '</div>' +
          '<div class="mc-phone">' + (m.phone ? esc(m.phone) : '未留手机号') + '</div>' +
        '</div>' +
        '<div class="mc-count' + (m.remaining <= 1 ? ' low' : '') + '">' + esc(m.remaining) + '<small>次</small></div>' +
      '</div>';
    }
    $('member-list').innerHTML = html;
  }
  $('search').addEventListener('input', renderList);

  /* ================= 弹层基础 ================= */
  function openMask(maskId) { $(maskId).classList.remove('hidden'); }
  function closeMask(maskId) { $(maskId).classList.add('hidden'); }
  ['mask', 'mask-amount', 'mask-form', 'mask-history', 'mask-menu'].forEach(function (id) {
    $(id).addEventListener('click', function (ev) { if (ev.target === $(id)) closeMask(id); });
  });

  function findMember(id) {
    for (var i = 0; i < MEMBERS.length; i++) if (MEMBERS[i].id === id) return MEMBERS[i];
    return null;
  }

  /* ================= 会员详情弹层 ================= */
  function renderMemberSheet() {
    if (!curMember) return;
    $('m-name').textContent = curMember.name;
    $('m-phone').textContent = curMember.phone || '未留手机号';
    $('m-note').textContent = curMember.note ? '📎 ' + curMember.note : '';
    $('m-note').classList.toggle('hidden', !curMember.note);
    $('m-count').textContent = curMember.remaining;
    $('btn-redeem-1').disabled = curMember.remaining <= 0;
    $('btn-redeem-1').textContent = curMember.remaining <= 0 ? '次数已用完' : '核销一次';
  }
  $('member-list').addEventListener('click', function (ev) {
    var card = ev.target.closest ? ev.target.closest('.member-card') : null;
    if (!card) return;
    curMember = findMember(card.getAttribute('data-id'));
    if (!curMember) return;
    renderMemberSheet();
    openMask('mask');
  });

  /* 充值/核销统一入口：delta 正负皆可 */
  function doAdjust(delta, note) {
    if (!curMember || busy) return;
    if (delta === 0) { toast('次数不能为 0'); return; }
    busy = true;
    document.body.classList.add('busy');
    var name = curMember.name, id = curMember.id;
    backend.adjust(id, delta, note || '').then(function (newVal) {
      curMember.remaining = newVal;
      curMember.updated_at = new Date().toISOString();
      MEMBERS.sort(byUpdated);
      renderList();
      renderMemberSheet();
      openMask('mask');   // 自定义金额操作后回到会员弹层，立即看到最新次数
      toast((delta > 0 ? '✅ 充值' : '✅ 核销') + ' ' + Math.abs(delta) + ' 次，' + name + ' 剩余 ' + newVal + ' 次');
    }).catch(function (e) {
      toast('❌ ' + friendlyError(e), true);
      openMask('mask');   // 失败也弹回来，方便重试
    }).then(function () {
      busy = false;
      document.body.classList.remove('busy');
    });
  }

  $('btn-redeem-1').onclick = function () { doAdjust(-1, ''); };
  $('charge-chips').addEventListener('click', function (ev) {
    var chip = ev.target.closest ? ev.target.closest('.chip') : null;
    if (!chip || busy) return;
    var d = chip.getAttribute('data-delta');
    if (d === '') { openAmount('charge'); return; }
    doAdjust(parseInt(d, 10), '');
  });
  $('btn-redeem-custom').onclick = function () { openAmount('redeem'); };
  $('btn-charge-menu').onclick = function () {
    $('charge-chips').classList.toggle('open');
  };

  /* ================= 自定义金额弹层 ================= */
  function openAmount(mode) {
    amountMode = mode;
    $('amount-title').textContent = mode === 'charge' ? '自定义充值' : '自定义核销';
    $('amount-input').value = '';
    $('amount-note').value = '';
    closeMask('mask');
    openMask('mask-amount');
    setTimeout(function () { $('amount-input').focus(); }, 60);
  }
  $('btn-amount-cancel').onclick = function () { closeMask('mask-amount'); };
  $('btn-amount-ok').onclick = function () {
    var n = parseInt($('amount-input').value, 10);
    if (!n || n <= 0) { toast('请输入正整数次数'); return; }
    var note = $('amount-note').value.trim();
    closeMask('mask-amount');
    doAdjust(amountMode === 'charge' ? n : -n, note);
  };

  /* ================= 新增/编辑表单 ================= */
  var editingId = null;
  function openForm(member) {
    editingId = member ? member.id : null;
    $('form-title').textContent = member ? '编辑会员' : '新增会员';
    $('f-name').value = member ? member.name : '';
    $('f-phone').value = member ? member.phone : '';
    $('f-init-wrap').classList.toggle('hidden', !!member);
    $('f-init').value = '';
    $('f-note').value = member ? member.note : '';
    closeMask('mask');
    openMask('mask-form');
    setTimeout(function () { $('f-name').focus(); }, 60);
  }
  $('btn-add').onclick = function () { openForm(null); };
  $('btn-edit').onclick = function () { if (curMember) openForm(curMember); };
  $('btn-form-cancel').onclick = function () { closeMask('mask-form'); };
  $('btn-form-save').onclick = function () {
    if (busy) return;
    var name = $('f-name').value.trim();
    var phone = normPhone($('f-phone').value);
    var note = $('f-note').value.trim();
    var init = parseInt($('f-init').value, 10) || 0;
    if (!name) { toast('姓名必填'); return; }
    if (phone && phone.length < 5) { toast('手机号太短了，请检查'); return; }
    var editing = !!editingId;
    busy = true;
    backend.saveMember({ name: name, phone: phone, note: note, remaining: init },
                       editing ? editingId : null)
      .then(function (saved) {
        if (editing) {
          var m = findMember(editingId);
          if (m) { m.name = saved.name; m.phone = saved.phone; m.note = saved.note; m.updated_at = saved.updated_at; }
        } else {
          MEMBERS.unshift(saved);
        }
        MEMBERS.sort(byUpdated);
        renderList();
        closeMask('mask-form');
        toast(editing ? '✅ 已保存' : '✅ 已添加 ' + saved.name);
      })
      .catch(function (e) { toast('❌ ' + friendlyError(e), true); })
      .then(function () { busy = false; });
  };

  /* ================= 变动记录 ================= */
  $('btn-history').onclick = function () {
    if (!curMember) return;
    $('history-title').textContent = curMember.name + ' 的变动记录';
    $('tx-list').innerHTML = '<div class="empty">加载中…</div>';
    closeMask('mask');
    openMask('mask-history');
    backend.listTx(curMember.id).then(function (rows) {
      renderTx(rows);
    }).catch(function (e) { $('tx-list').innerHTML = '<div class="empty empty-err">' + esc(friendlyError(e)) + '</div>'; });
  };
  $('btn-history-close').onclick = function () { closeMask('mask-history'); };
  function renderTx(rows) {
    if (!rows || !rows.length) { $('tx-list').innerHTML = '<div class="empty">还没有记录</div>'; return; }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var t = rows[i];
      var pos = t.delta > 0;
      html += '<div class="tx-row">' +
        '<div class="tx-main">' +
          '<span class="tx-delta ' + (pos ? 'pos' : 'neg') + '">' + (pos ? '＋' : '－') + Math.abs(t.delta) + '</span>' +
          '<span class="tx-after">→ ' + esc(t.remaining_after) + ' 次</span>' +
          (t.note ? '<span class="tx-note">' + esc(t.note) + '</span>' : '') +
        '</div>' +
        '<div class="tx-time">' + esc(fmtTime(t.created_at)) + '</div>' +
      '</div>';
    }
    $('tx-list').innerHTML = html;
  }

  /* ================= 菜单 / 导出 ================= */
  $('btn-menu').onclick = function () { openMask('mask-menu'); };
  $('btn-menu-close').onclick = function () { closeMask('mask-menu'); };
  $('btn-refresh').onclick = function () { closeMask('mask-menu'); reload(); toast('已刷新'); };
  $('btn-logout').onclick = function () {
    closeMask('mask-menu');
    backend.signOut().catch(function (e) { toast('❌ ' + friendlyError(e), true); });
  };

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function stamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
  }
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(head, rows) {
    var out = '\ufeff' + head.join(',') + '\r\n';   // BOM：Excel 打开中文不乱码
    rows.forEach(function (r) {
      out += r.map(csvCell).join(',') + '\r\n';
    });
    return out;
  }
  function fmtFull(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return iso || '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
           p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  $('btn-export-json').onclick = function () {
    Promise.all([backend.listMembers(), backend.listAllTx()]).then(function (r) {
      download('会员备份_' + stamp() + '.json',
        JSON.stringify({ exported_at: new Date().toISOString(), members: r[0], transactions: r[1] }, null, 2),
        'application/json');
      toast('📦 JSON 已导出');
    }).catch(function (e) { toast('❌ ' + friendlyError(e), true); });
  };
  $('btn-export-csv').onclick = function () {
    Promise.all([backend.listMembers(), backend.listAllTx()]).then(function (r) {
      download('会员_' + stamp() + '.csv', toCsv(
        ['姓名', '手机号', '剩余次数', '备注', '创建时间', '更新时间'],
        (r[0] || []).map(function (m) {
          return [m.name, m.phone, m.remaining, m.note, fmtFull(m.created_at), fmtFull(m.updated_at)];
        })), 'text/csv');
      setTimeout(function () {
        download('变动记录_' + stamp() + '.csv', toCsv(
          ['时间', '会员', '变动', '变动后剩余', '备注'],
          (r[1] || []).map(function (t) {
            return [fmtFull(t.created_at), t.member_name, t.delta, t.remaining_after, t.note];
          })), 'text/csv');
      }, 400);
      toast('📊 两个 CSV 已导出');
    }).catch(function (e) { toast('❌ ' + friendlyError(e), true); });
  };

  /* ================= 登录 ================= */
  function doLogin(email, pass) {
    var btn = $('btn-login');
    btn.disabled = true; btn.textContent = '登录中…';
    $('login-err').textContent = '';
    backend.signIn(email, pass)
      .catch(function (e) { $('login-err').textContent = friendlyError(e); })
      .then(function () { btn.disabled = false; btn.textContent = '登 录'; });
  }
  $('btn-login').onclick = function () {
    doLogin($('login-email').value.trim(), $('login-pass').value);
  };
  $('login-pass').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') doLogin($('login-email').value.trim(), $('login-pass').value);
  });
  $('btn-demo').onclick = function () { doLogin('demo@local', 'demo'); };

  /* ================= 启动 ================= */
  if (backend.kind === 'demo') {
    $('btn-demo').classList.remove('hidden');
    $('login-sub').textContent = '尚未配置 Supabase（演示模式）';
  }
  backend.onAuth(function (session) {
    if (session) showApp();
    else showLogin();
  });
})();
