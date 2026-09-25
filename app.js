/* ===== 拼豆小店 · 像素风房间视图 v3 =====
   猫=批量开桌  狗=批量结账  点有人座位=换座
   计费：按分钟线性，每人保底 minStartMin，提前走不退保底 */
(function () {
  'use strict';

  /* ================= 店面布局配置 ================= */
  var ROOM_W = 416, ROOM_H = 304;

  var FURNITURE = [
    { img: 'counter.png', x: 32, y: 20, w: 144, h: 20 },
    { img: 'rug.png', x: 216, y: 104, w: 128, h: 80 },
    { img: 'table_big.png', x: 232, y: 120, w: 96, h: 48 },
    { img: 'table_small.png', x: 48, y: 104, w: 32, h: 32 },
    { img: 'table_small.png', x: 48, y: 192, w: 32, h: 32 },
    { img: 'table_small.png', x: 336, y: 104, w: 32, h: 32 },
    { img: 'table_small.png', x: 336, y: 192, w: 32, h: 32 },
    { img: 'plant.png', x: 8, y: 248, w: 16, h: 20 },
    { img: 'plant.png', x: 390, y: 248, w: 16, h: 20 },
    { img: 'mat.png', x: 192, y: 286, w: 32, h: 12 }
  ];

  var SEATS = [];
  var i;
  var counterX = [42, 74, 106, 138];
  for (i = 0; i < 4; i++) {
    SEATS.push({ id: 'C' + (i + 1), name: '窗边' + (i + 1), zone: '窗边I人区',
      x: counterX[i], y: 48, w: 12, h: 12, dir: 'n', stool: true });
  }
  var bigX = [236, 258, 280, 302];
  for (i = 0; i < 4; i++) {
    SEATS.push({ id: 'A' + (i + 1), name: '大桌' + (i + 1), zone: '大桌',
      x: bigX[i], y: 98, w: 16, h: 16, dir: 's', table: 'big' });
    SEATS.push({ id: 'A' + (i + 5), name: '大桌' + (i + 5), zone: '大桌',
      x: bigX[i], y: 172, w: 16, h: 16, dir: 'n', table: 'big' });
  }
  var smallTables = [
    { t: 's1', x: 56, y: 104 }, { t: 's2', x: 56, y: 192 },
    { t: 's3', x: 344, y: 104 }, { t: 's4', x: 344, y: 192 }
  ];
  smallTables.forEach(function (st, k) {
    SEATS.push({ id: 'B' + (k * 2 + 1), name: '小桌' + (k + 1) + '上', zone: '小桌',
      x: st.x, y: st.y - 24, w: 16, h: 16, dir: 's', table: st.t });
    SEATS.push({ id: 'B' + (k * 2 + 2), name: '小桌' + (k + 1) + '下', zone: '小桌',
      x: st.x, y: st.y + 40, w: 16, h: 16, dir: 'n', table: st.t });
  });
  function seatById(id) { return SEATS.find(function (s) { return s.id === id; }); }

  /* ================= 数据层 ================= */
  var STORE_KEY = 'beadshop_v3';

  function defaultData() {
    return {
      shopName: '拼豆小店',
      pricePerHour: 20,
      minStartMin: 120,     // 最小开桌时间（分钟），提前走不退
      minExtendMin: 30,     // 加钟最小单位（分钟）
      seats: {},            // seatId -> {pid, bid}
      batches: {},          // bid -> {id,note,start,end,members:{pid:{...}}}
      reservations: [],
      stock: [
        { id: 'b1', name: '白色豆豆', qty: 50 },
        { id: 'b2', name: '黑色豆豆', qty: 50 },
        { id: 'b3', name: '混色豆豆', qty: 30 }
      ]
    };
  }
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(STORE_KEY));
      if (d && d.batches) return d;
    } catch (e) {}
    return defaultData();
  }
  function save() { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }
  var DB = load();

  var uidC = 0;
  function uid(p) { return (p || 'x') + Date.now().toString(36) + (uidC++); }

  function activeMembers(b) {
    return Object.keys(b.members).map(function (k) { return b.members[k]; })
      .filter(function (m) { return m.status === 'active'; });
  }
  function goneUnpaid(b) {
    return Object.keys(b.members).map(function (k) { return b.members[k]; })
      .filter(function (m) { return m.status === 'gone' && !m.paid; });
  }
  /* 费用：按实际占用分钟线性计，保底 minStartMin */
  function feeOf(m, b, now) {
    var t = (m.status === 'active' ? now : m.leftAt) - b.start;
    var bill = Math.max(t, DB.minStartMin * 60000);
    return Math.round(DB.pricePerHour * bill / 3600000);
  }
  function batchList() {
    return Object.keys(DB.batches).map(function (k) { return DB.batches[k]; })
      .sort(function (a, b) { return a.end - b.end; });
  }

  /* ================= 时间工具 ================= */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtHM(ts) { var d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  /* 剩余时长：上取整到分钟，H:MM */
  function fmtRemain(ms) {
    if (ms <= 0) return '0:00';
    var mins = Math.ceil(ms / 60000);
    return Math.floor(mins / 60) + ':' + pad(mins % 60);
  }
  function fmtDurCN(ms) {
    if (ms < 0) ms = 0;
    var mins = Math.round(ms / 60000), h = Math.floor(mins / 60), m = mins % 60;
    if (h && m) return h + '小时' + m + '分钟';
    if (h) return h + '小时';
    return m + '分钟';
  }
  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ================= 模式状态 ================= */
  var mode = null;        // null | 'open' | 'close' | 'swap'
  var sel = {};           // 选中的 seatId
  var swapSrc = null;

  var banner = document.getElementById('mode-banner');
  var modeHint = document.getElementById('mode-hint');

  function selCount() { return Object.keys(sel).length; }

  function setMode(m) {
    mode = m; sel = {}; swapSrc = null;
    document.getElementById('btn-cat').classList.toggle('mode-on', m === 'open');
    document.getElementById('btn-dog').classList.toggle('mode-on', m === 'close');
    if (!m) { banner.classList.add('hidden'); }
    else {
      banner.classList.remove('hidden');
      modeHint.textContent = m === 'open' ? '开桌模式：点选空座位（可多选），选好点「确定开桌」'
        : m === 'close' ? '结账模式：点选要走的人（可多选），选好点「结算」'
        : '换座：再点一个座位（空位=挪过去，有人=互换）';
      document.getElementById('mode-ok').textContent = m === 'open' ? '确定开桌' : m === 'close' ? '结算' : '完成';
    }
    renderSeats();
  }

  document.getElementById('btn-cat').onclick = function () { setMode(mode === 'open' ? null : 'open'); };
  document.getElementById('btn-dog').onclick = function () { setMode(mode === 'close' ? null : 'close'); };
  document.getElementById('mode-cancel').onclick = function () { setMode(null); };
  document.getElementById('mode-ok').onclick = function () {
    if (mode === 'open') {
      if (!selCount()) { toast('先点选空座位'); return; }
      openTableModal(Object.keys(sel));
    } else if (mode === 'close') {
      if (!selCount()) { toast('先点选要走的人'); return; }
      checkoutModal(Object.keys(sel));
    } else setMode(null);
  };

  /* ================= 房间渲染 ================= */
  var room = document.getElementById('room');
  function pctX(v) { return (v / ROOM_W * 100) + '%'; }
  function pctY(v) { return (v / ROOM_H * 100) + '%'; }

  function buildRoom() {
    room.style.paddingTop = (ROOM_H / ROOM_W * 100) + '%';
    var html =
      '<div class="floor-bg" style="background:url(assets/floor.png);background-size:' + (16 / ROOM_W * 100) + '% ' + (16 / ROOM_H * 100) + '%"></div>' +
      '<div class="floor-bg" style="height:' + (16 / ROOM_H * 100) + '%;background:url(assets/wall.png) repeat-x;background-size:auto ' + (16 / ROOM_H * 100) + '%;bottom:auto"></div>';
    FURNITURE.forEach(function (f) {
      html += '<img class="spr" src="assets/' + f.img + '" style="left:' + pctX(f.x) + ';top:' + pctY(f.y) +
        ';width:' + pctX(f.w) + ';height:' + pctY(f.h) + '">';
    });
    room.innerHTML = html;
    var layer = document.createElement('div');
    layer.id = 'seat-layer';
    layer.style.cssText = 'position:absolute;inset:0';
    room.appendChild(layer);
  }

  function renderSeats() {
    var now = Date.now();
    var layer = document.getElementById('seat-layer');
    var html = '';
    SEATS.forEach(function (s) {
      var occ = DB.seats[s.id];
      var busy = !!(occ && occ.pid);
      var cls = 'seat-hit';
      if (mode === 'open' && sel[s.id]) cls += ' sel-open';
      if (mode === 'close' && sel[s.id]) cls += ' sel-close';
      if (mode === 'swap' && swapSrc === s.id) cls += ' swap-src';
      var chairImg = s.stool ? 'stool.png' : (s.dir === 's' ? 'chair_s.png' : 'chair_n.png');
      html += '<div class="' + cls + '" data-id="' + s.id + '" style="left:' + pctX(s.x - 4) + ';top:' + pctY(s.y - 4) +
        ';width:' + pctX(s.w + 8) + ';height:' + pctY(s.h + 8) + '">' +
        '<span class="hl"></span>' +
        '<img class="spr" src="assets/' + chairImg + '" style="left:' + (4 / (s.w + 8) * 100) + '%;top:' + (4 / (s.h + 8) * 100) +
        '%;width:' + (s.w / (s.w + 8) * 100) + '%;height:' + (s.h / (s.h + 8) * 100) + '%">';
      if (busy) {
        var m = DB.batches[occ.bid] && DB.batches[occ.bid].members[occ.pid];
        if (m) {
          var pImg = 'p_' + m.gender + m.variant + (s.dir === 's' ? '_front' : '_back') + '.png';
          var pw = 20, ph = 20;
          html += '<img class="spr" src="assets/' + pImg + '" style="left:' + ((s.w + 8 - pw) / 2 / (s.w + 8) * 100) +
            '%;top:' + ((s.h - ph + 3) / (s.h + 8) * 100) + '%;width:' + (pw / (s.w + 8) * 100) +
            '%;height:' + (ph / (s.h + 8) * 100) + '%">';
        }
      }
      html += '</div>';
    });
    // 每批一个时钟牌（锚在活跃成员座位中心）
    batchList().forEach(function (b) {
      var act = activeMembers(b);
      if (!act.length) return;
      var cx = 0, cy = 0, n = 0;
      act.forEach(function (m) {
        var s = seatById(m.seatId);
        if (!s) return;
        cx += s.x + s.w / 2; cy += s.y + s.h / 2; n++;
      });
      if (!n) return;
      cx /= n; cy /= n;
      var remain = b.end - now;
      var frac = Math.max(0, Math.min(1, remain / (b.end - b.start)));
      var cls2 = remain <= 0 ? 'over' : (remain < 15 * 60000 ? 'warn' : 'ok');
      var stool = !!seatById(act[0].seatId).stool;
      var topY = stool ? cy + 16 : cy - 28;
      html += '<div class="plaque ' + cls2 + '" data-bid="' + b.id + '" data-frac="' + frac +
        '" style="left:' + pctX(cx) + ';top:' + pctY(topY) + '">' +
        '<canvas class="clk" width="16" height="16"></canvas>' +
        '<span>' + (remain <= 0 ? '到时!' : fmtRemain(remain)) + '</span></div>';
    });
    layer.innerHTML = html;
    // 画时钟
    layer.querySelectorAll('.plaque').forEach(function (p) {
      drawClock(p.querySelector('canvas'), parseFloat(p.dataset.frac), p.classList.contains('over') ? 'over' : p.classList.contains('warn') ? 'warn' : 'ok');
    });
    renderGroups(now);
  }

  /* 指针式时钟：扇形+指针表示剩余百分比 */
  function drawClock(cv, frac, cls) {
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#3a2313';
    ctx.beginPath(); ctx.arc(8, 8, 7.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff8e6';
    ctx.beginPath(); ctx.arc(8, 8, 6, 0, 7); ctx.fill();
    if (frac > 0) {
      ctx.fillStyle = cls === 'over' ? '#d84040' : cls === 'warn' ? '#e8930c' : '#50b050';
      ctx.beginPath();
      ctx.moveTo(8, 8);
      ctx.arc(8, 8, 6, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.closePath(); ctx.fill();
    }
    // 指针指向剩余边界
    var a = -Math.PI / 2 + frac * Math.PI * 2;
    ctx.strokeStyle = '#3a2313'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(8, 8);
    ctx.lineTo(8 + Math.cos(a) * 5.5, 8 + Math.sin(a) * 5.5); ctx.stroke();
    ctx.fillStyle = '#3a2313';
    ctx.fillRect(7, 7, 2, 2);
  }

  /* ================= 侧栏 ================= */
  function renderGroups(now) {
    now = now || Date.now();
    var box = document.getElementById('group-list');
    var bs = batchList();
    if (!bs.length) {
      box.innerHTML = '<div class="side-empty">现在店里没人<br>点右上角猫咪开桌</div>';
      return;
    }
    box.innerHTML = bs.map(function (b) {
      var act = activeMembers(b);
      if (!act.length) {
        var owe = goneUnpaid(b).reduce(function (t, m) { return t + m.fee; }, 0);
        return '<div class="group-card cleared" data-bid="' + b.id + '">' +
          '<div class="g-name"><span>' + esc(b.note || '批次') + '（已离店）</span></div>' +
          '<div class="g-sub">还有尾款没结清</div>' +
          '<div class="g-ops"><button class="pbtn pbtn-sm pbtn-gold" data-op="settle" data-owe="' + owe + '">收尾款 ¥' + owe + '</button></div></div>';
      }
      var remain = b.end - now;
      var cls = remain <= 0 ? 'over' : (remain < 15 * 60000 ? 'warn' : '');
      var name = b.note || (seatById(act[0].seatId) || {}).zone || '批次';
      var seatNames = act.map(function (m) { var s = seatById(m.seatId); return s ? s.name : ''; }).join(' ');
      return '<div class="group-card" data-bid="' + b.id + '">' +
        '<div class="g-name"><span>' + esc(name) + ' × ' + act.length + '人</span><span>' + esc(seatNames) + '</span></div>' +
        '<div class="g-count ' + cls + '">' + (remain <= 0 ? '已到时!' : '剩 ' + fmtRemain(remain)) + '</div>' +
        '<div class="g-sub">' + fmtHM(b.start) + ' - ' + fmtHM(b.end) +
        ' · 共' + fmtDurCN(b.end - b.start) + ' · 已营业 ' + fmtRemain(now - b.start) + '</div>' +
        '<div class="g-ops"><button class="pbtn pbtn-sm" data-op="extend">加钟</button></div></div>';
    }).join('');
  }

  document.getElementById('group-list').addEventListener('click', function (e) {
    var card = e.target.closest('.group-card');
    if (!card) return;
    var b = DB.batches[card.dataset.bid];
    if (!b) return;
    var btn = e.target.closest('button');
    if (btn && btn.dataset.op === 'extend') return extendModal(b);
    if (btn && btn.dataset.op === 'settle') {
      return confirmModal('收尾款', '这批客人还有 ¥' + btn.dataset.owe + ' 未付，现在收齐了吗？', function () {
        goneUnpaid(b).forEach(function (m) { m.paid = true; });
        delete DB.batches[b.id];
        save(); renderSeats();
        toast('尾款已结清');
      }, '已收款');
    }
    flashSeats(b);
  });

  function flashSeats(b) {
    activeMembers(b).forEach(function (m) {
      var el = document.querySelector('.seat-hit[data-id="' + m.seatId + '"]');
      if (el) { el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 2400); }
    });
  }

  /* ================= 座位点击 ================= */
  room.addEventListener('click', function (e) {
    var plq = e.target.closest('.plaque');
    if (plq) { var b = DB.batches[plq.dataset.bid]; if (b) batchDetailModal(b); return; }
    var hit = e.target.closest('.seat-hit');
    if (!hit) return;
    var seat = seatById(hit.dataset.id);
    var occ = DB.seats[seat.id];
    var busy = !!(occ && occ.pid);

    if (mode === 'open') {
      if (busy) { toast('这个位置有人了'); return; }
      sel[seat.id] ? delete sel[seat.id] : sel[seat.id] = 1;
      renderSeats();
    } else if (mode === 'close') {
      if (!busy) { toast('这个位置没人'); return; }
      sel[seat.id] ? delete sel[seat.id] : sel[seat.id] = 1;
      renderSeats();
    } else if (mode === 'swap') {
      if (seat.id === swapSrc) { setMode(null); return; }
      var srcOcc = DB.seats[swapSrc];
      if (!srcOcc || !srcOcc.pid) { setMode(null); return; }
      var sb = DB.batches[srcOcc.bid];
      if (busy) {   // 互换
        var dstOcc = occ;
        var db2 = DB.batches[dstOcc.bid];
        DB.seats[swapSrc] = { pid: dstOcc.pid, bid: dstOcc.bid };
        DB.seats[seat.id] = { pid: srcOcc.pid, bid: srcOcc.bid };
        if (sb && sb.members[srcOcc.pid]) sb.members[srcOcc.pid].seatId = seat.id;
        if (db2 && db2.members[dstOcc.pid]) db2.members[dstOcc.pid].seatId = swapSrc;
        toast('已互换座位');
      } else {      // 挪到空位
        delete DB.seats[swapSrc];
        DB.seats[seat.id] = { pid: srcOcc.pid, bid: srcOcc.bid };
        if (sb && sb.members[srcOcc.pid]) sb.members[srcOcc.pid].seatId = seat.id;
        toast('已换到 ' + seat.name);
      }
      save(); setMode(null);
    } else {
      if (busy) { mode = 'swap'; swapSrc = seat.id; banner.classList.remove('hidden');
        modeHint.textContent = '换座：再点一个座位（空位=挪过去，有人=互换）';
        document.getElementById('mode-ok').textContent = '完成';
        renderSeats(); }
      else toast('空座位：点右上角猫咪开桌');
    }
  });

  /* ================= 弹窗框架 ================= */
  var mask = document.getElementById('modal-mask');
  var modalTitle = document.getElementById('modal-title');
  var modalBody = document.getElementById('modal-body');
  var modalActions = document.getElementById('modal-actions');

  function openModal(title, bodyHTML, actions) {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHTML;
    modalActions.innerHTML = '';
    actions.forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'pbtn ' + (a.cls || 'pbtn-cream');
      b.textContent = a.text;
      b.onclick = function () { a.onClick && a.onClick(); };
      modalActions.appendChild(b);
    });
    mask.classList.remove('hidden');
  }
  function closeModal() { mask.classList.add('hidden'); }
  mask.addEventListener('click', function (e) { if (e.target === mask) closeModal(); });

  function confirmModal(title, text, onYes, yesText) {
    openModal(title, '<p>' + text + '</p>', [
      { text: '取消', onClick: closeModal },
      { text: yesText || '确定', cls: 'pbtn-danger', onClick: function () { closeModal(); onYes(); } }
    ]);
  }

  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 2200);
  }

  /* ================= 开桌（猫） ================= */
  function openTableModal(seatIds) {
    var minH = DB.minStartMin / 60;
    var presetH = [];
    [2, 3, 4, 5, 8].forEach(function (h) { if (h * 60 >= DB.minStartMin) presetH.push(h); });
    if (!presetH.length) presetH.push(Math.ceil(minH));
    var rows = seatIds.map(function (id) {
      var s = seatById(id);
      return '<div class="assign-row" data-sid="' + id + '"><span>' + esc(s.name) + '</span>' +
        '<span class="gender-pick"><button class="pbtn pbtn-sm g-b pbtn-gold" data-g="b">男生</button>' +
        '<button class="pbtn pbtn-sm g-g" data-g="g">女生</button></span></div>';
    }).join('');
    var body =
      '<div class="assign-list">' + rows + '</div>' +
      '<div class="dur-grid">' +
      presetH.map(function (h) { return '<button class="pbtn pbtn-sm" data-h="' + h + '">' + h + '小时</button>'; }).join('') +
      '</div>' +
      '<label class="field"><span>自定义时长（分钟，至少 ' + DB.minStartMin + '）</span>' +
      '<input type="number" id="ot-min" min="' + DB.minStartMin + '" placeholder="例如 150"></label>' +
      '<label class="field"><span>批次备注（方便认人，可空）</span><input type="text" id="ot-note" placeholder="例如：红衣服 / 拼单"></label>' +
      '<p class="hint">' + DB.pricePerHour + ' 元/人/小时 · 保底 ' + fmtDurCN(DB.minStartMin * 60000) + ' · 现在开始（' + fmtHM(Date.now()) + '）</p>';

    openModal('开桌 · ' + seatIds.length + ' 个座位', body, [
      { text: '取消', onClick: closeModal },
      {
        text: '自定义开桌', cls: 'pbtn-gold', onClick: function () {
          var mins = parseInt(document.getElementById('ot-min').value, 10);
          if (!mins || mins < DB.minStartMin) { toast('时长不能低于保底 ' + DB.minStartMin + ' 分钟'); return; }
          doOpen(seatIds, mins); closeModal();
        }
      }
    ]);
    modalBody.querySelectorAll('.gender-pick button').forEach(function (b) {
      b.onclick = function () {
        b.parentNode.querySelectorAll('button').forEach(function (x) { x.classList.remove('pbtn-gold'); });
        b.classList.add('pbtn-gold');
      };
    });
    modalBody.querySelectorAll('button[data-h]').forEach(function (b) {
      b.onclick = function () { doOpen(seatIds, parseInt(b.dataset.h, 10) * 60); closeModal(); };
    });
  }

  function doOpen(seatIds, mins) {
    var now = Date.now();
    var bid = uid('b');
    var note = document.getElementById('ot-note').value.trim();
    var batch = { id: bid, note: note, start: now, end: now + mins * 60000, members: {} };
    seatIds.forEach(function (id, idx) {
      var gbtn = modalBody.querySelector('.assign-row[data-sid="' + id + '"] .gender-pick .pbtn-gold');
      var gender = gbtn ? gbtn.dataset.g : (idx % 2 ? 'g' : 'b');
      var pid = uid('p');
      batch.members[pid] = {
        id: pid, gender: gender, variant: Math.floor(Math.random() * 10),
        seatId: id, status: 'active', paid: false, fee: 0, leftAt: null
      };
      DB.seats[id] = { pid: pid, bid: bid };
    });
    DB.batches[bid] = batch;
    save(); setMode(null); closeModal();
    toast('开桌成功，' + seatIds.length + ' 人，到点 ' + fmtHM(batch.end));
  }

  /* ================= 结账（狗） ================= */
  function checkoutModal(seatIds) {
    var now = Date.now();
    var lines = '', total = 0, items = [];
    var batchIds = {};
    seatIds.forEach(function (id) {
      var occ = DB.seats[id];
      if (!occ || !occ.pid) return;
      var b = DB.batches[occ.bid];
      var m = b.members[occ.pid];
      var fee = feeOf(m, b, now);
      var used = now - b.start;
      items.push({ seatId: id, b: b, m: m, fee: fee });
      batchIds[b.id] = b;
      lines += '<div class="bill-line"><span>' + esc(seatById(id).name) + '（' + (m.gender === 'g' ? '女' : '男') + '）</span>' +
        '<span>' + fmtDurCN(used) + ' → ¥' + fee + '</span></div>';
      total += fee;
    });
    // 整批走完 → 把该批之前未付的也收上，且最后一批人不允许赊账离开
    var extra = 0, extraLines = '', canDefer = true;
    Object.keys(batchIds).forEach(function (bid) {
      var b = batchIds[bid];
      var actLeft = activeMembers(b).filter(function (m) { return seatIds.indexOf(m.seatId) < 0; });
      if (!actLeft.length) canDefer = false;   // 这批要走完
      if (actLeft.length) return;   // 这批还有人留下，不收旧账
      var unpaid = goneUnpaid(b);
      if (unpaid.length) {
        var s = unpaid.reduce(function (t, m) { return t + m.fee; }, 0);
        extra += s;
        extraLines += '<div class="bill-line"><span>该批此前 ' + unpaid.length + ' 人未付</span><span>¥' + s + '</span></div>';
      }
    });
    var body = lines + extraLines +
      '<div class="bill-line total"><span>应收合计</span><span>¥ ' + (total + extra) + '</span></div>' +
      (extra ? '<p class="hint">已含此前离店未付的尾款</p>' : '') +
      (canDefer
        ? '<p class="hint">「先记账离开」= 这次不付钱，尾款记在这批头上，全桌走完前需结清</p>'
        : '<p class="hint">这批人就全走了，须结清所有费用（含此前未付）才能离开</p>');

    var actions = [{ text: '取消', onClick: closeModal }];
    if (canDefer) {
      actions.push({
        text: '先记账离开', onClick: function () {
          items.forEach(function (it) { leave(it, false, now); });
          afterLeave(items, now);
          toast('已离店，费用记账中');
        }
      });
    }
    actions.push({
      text: '结账离开 ¥' + (total + extra), cls: 'pbtn-danger', onClick: function () {
        items.forEach(function (it) { leave(it, true, now); });
        // 收齐旧账
        Object.keys(batchIds).forEach(function (bid) {
          var b = DB.batches[bid];
          if (b) goneUnpaid(b).forEach(function (m) { m.paid = true; });
        });
        afterLeave(items, now);
        toast('收款 ¥' + (total + extra) + '，座位已释放');
      }
    });
    openModal('结账下桌 · ' + items.length + ' 人', body, actions);

    function leave(it, paid, now) {
      it.m.status = 'gone';
      it.m.paid = paid;
      it.m.fee = it.fee;
      it.m.leftAt = now;
      it.m.seatId = null;
      delete DB.seats[it.seatId];
    }
    function afterLeave(items, now) {
      var bids = {};
      items.forEach(function (it) { bids[it.b.id] = it.b; });
      Object.keys(bids).forEach(function (bid) {
        var b = DB.batches[bid];
        if (!b) return;
        if (!activeMembers(b).length && !goneUnpaid(b).length) delete DB.batches[bid];
      });
      save(); setMode(null); closeModal();
    }
  }

  /* ================= 批次详情（点时钟） ================= */
  function batchDetailModal(b) {
    var now = Date.now();
    var remain = b.end - now;
    var act = activeMembers(b);
    var pct = Math.max(0, Math.round(remain / (b.end - b.start) * 100));
    var body =
      '<div class="bill-line"><span>剩余时间</span><span>' + (remain <= 0 ? '已到时!' : fmtRemain(remain) + '（' + pct + '%）') + '</span></div>' +
      '<div class="bill-line"><span>时间段</span><span>' + fmtHM(b.start) + ' - ' + fmtHM(b.end) + '</span></div>' +
      '<div class="bill-line"><span>已购时长</span><span>' + fmtDurCN(b.end - b.start) + '</span></div>' +
      '<div class="bill-line"><span>已营业</span><span>' + fmtRemain(now - b.start) + '</span></div>' +
      '<div class="bill-line"><span>在店人数</span><span>' + act.length + ' 人</span></div>' +
      (b.note ? '<div class="bill-line"><span>备注</span><span>' + esc(b.note) + '</span></div>' : '');
    openModal('批次详情', body, [
      { text: '关闭', onClick: closeModal },
      { text: '加钟', cls: 'pbtn-gold', onClick: function () { extendModal(b); } }
    ]);
  }

  /* ================= 加钟 ================= */
  function extendModal(b) {
    var u = DB.minExtendMin;
    var body =
      '<div class="dur-grid">' +
      '<button class="pbtn pbtn-sm" data-m="' + u + '">+' + fmtDurCN(u * 60000) + '</button>' +
      '<button class="pbtn pbtn-sm" data-m="' + u * 2 + '">+' + fmtDurCN(u * 2 * 60000) + '</button>' +
      '<button class="pbtn pbtn-sm" data-m="' + u * 4 + '">+' + fmtDurCN(u * 4 * 60000) + '</button>' +
      '</div>' +
      '<label class="field"><span>自定义加钟（分钟，至少 ' + u + '）</span><input type="number" id="ext-min" min="' + u + '"></label>' +
      '<p class="hint">当前结束时间 ' + fmtHM(b.end) + ' · 整批一起加</p>';
    openModal('加钟', body, [
      { text: '取消', onClick: closeModal },
      {
        text: '自定义加钟', cls: 'pbtn-gold', onClick: function () {
          var mins = parseInt(document.getElementById('ext-min').value, 10);
          if (!mins || mins < u) { toast('加钟至少 ' + u + ' 分钟'); return; }
          doExtend(b, mins);
        }
      }
    ]);
    modalBody.querySelectorAll('button[data-m]').forEach(function (x) {
      x.onclick = function () { doExtend(b, parseInt(x.dataset.m, 10)); };
    });
    function doExtend(b, mins) {
      b.end += mins * 60000;
      save(); renderSeats(); closeModal();
      toast('已加钟 ' + fmtDurCN(mins * 60000) + '，到点 ' + fmtHM(b.end));
    }
  }

  /* ================= 一键清座 ================= */
  document.getElementById('btn-clear-all').onclick = function () {
    var n = 0;
    batchList().forEach(function (b) { n += activeMembers(b).length; });
    if (!n) { toast('现在没有营业中的座位'); return; }
    confirmModal('一键清座', '确定让 ' + n + ' 个人全部下桌吗？（不结账直接清空，慎用）', function () {
      DB.seats = {};
      DB.batches = {};
      save(); renderSeats();
      toast('已全部清座');
    }, '全部下桌');
  };

  /* ================= 页签 ================= */
  var tabNames = ['seats', 'reserve', 'stock', 'settings'];
  document.getElementById('tabs').addEventListener('click', function (e) {
    var t = e.target.closest('.tab');
    if (!t) return;
    document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
    t.classList.add('active');
    tabNames.forEach(function (n) {
      document.getElementById('page-' + n).classList.toggle('hidden', n !== t.dataset.tab);
    });
    document.getElementById('sidebar').classList.toggle('hidden', t.dataset.tab !== 'seats');
    if (t.dataset.tab === 'reserve') renderReserve();
    if (t.dataset.tab === 'stock') renderStock();
    if (t.dataset.tab === 'settings') renderSettings();
  });

  /* ================= 预约 ================= */
  function renderReserve() {
    var box = document.getElementById('reserve-list');
    if (!DB.reservations.length) {
      box.innerHTML = '<div class="empty-hint">暂无预约，点「新增预约」登记</div>';
      return;
    }
    box.innerHTML = DB.reservations.map(function (r) {
      return '<div class="list-card" data-id="' + r.id + '">' +
        '<div class="info">' + esc(r.name) + ' · ' + esc(r.time) +
        '<div class="sub">' + esc(r.note || '') + '</div></div>' +
        '<button class="pbtn pbtn-sm pbtn-danger" data-op="del">取消预约</button></div>';
    }).join('');
  }
  document.getElementById('btn-add-reserve').onclick = function () {
    openModal('新增预约',
      '<label class="field"><span>客人称呼</span><input type="text" id="rsv-name"></label>' +
      '<label class="field"><span>到店时间</span><input type="text" id="rsv-time" placeholder="例如 今天 15:00"></label>' +
      '<label class="field"><span>备注</span><input type="text" id="rsv-note" placeholder="人数/座位偏好"></label>',
      [{ text: '取消', onClick: closeModal },
       { text: '保存', cls: 'pbtn-gold', onClick: function () {
          var name = document.getElementById('rsv-name').value.trim();
          var time = document.getElementById('rsv-time').value.trim();
          if (!name || !time) return;
          DB.reservations.push({ id: uid('r'), name: name, time: time,
            note: document.getElementById('rsv-note').value.trim() });
          save(); renderReserve(); closeModal();
        } }]);
  };
  document.getElementById('reserve-list').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-op="del"]');
    if (!b) return;
    var id = b.closest('.list-card').dataset.id;
    DB.reservations = DB.reservations.filter(function (r) { return r.id !== id; });
    save(); renderReserve();
  });

  /* ================= 豆仓 ================= */
  function renderStock() {
    var box = document.getElementById('stock-list');
    if (!DB.stock.length) {
      box.innerHTML = '<div class="empty-hint">豆仓空空，点「添加品类」</div>';
      return;
    }
    box.innerHTML = DB.stock.map(function (b) {
      return '<div class="list-card" data-id="' + b.id + '">' +
        '<div class="info">' + esc(b.name) + '</div>' +
        '<div class="qty-ctrl">' +
        '<button class="pbtn pbtn-sm" data-op="dec">−</button>' +
        '<span class="qty-num">' + b.qty + '</span>' +
        '<button class="pbtn pbtn-sm" data-op="inc">＋</button>' +
        '<button class="pbtn pbtn-sm pbtn-danger" data-op="del">删除</button>' +
        '</div></div>';
    }).join('');
  }
  document.getElementById('btn-add-stock').onclick = function () {
    openModal('添加品类',
      '<label class="field"><span>品类名称</span><input type="text" id="stk-name" placeholder="例如 透明豆豆"></label>' +
      '<label class="field"><span>初始数量</span><input type="number" id="stk-qty" min="0" value="10"></label>',
      [{ text: '取消', onClick: closeModal },
       { text: '添加', cls: 'pbtn-gold', onClick: function () {
          var name = document.getElementById('stk-name').value.trim();
          if (!name) return;
          DB.stock.push({ id: uid('s'), name: name, qty: parseInt(document.getElementById('stk-qty').value, 10) || 0 });
          save(); renderStock(); closeModal();
        } }]);
  };
  document.getElementById('stock-list').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-op]');
    if (!b) return;
    var id = b.closest('.list-card').dataset.id;
    var item = DB.stock.find(function (x) { return x.id === id; });
    if (!item) return;
    var op = b.dataset.op;
    if (op === 'inc') item.qty++;
    else if (op === 'dec') { if (item.qty > 0) item.qty--; }
    else if (op === 'del') DB.stock = DB.stock.filter(function (x) { return x.id !== id; });
    save(); renderStock();
  });

  /* ================= 设置 ================= */
  function renderSettings() {
    document.getElementById('set-price').value = DB.pricePerHour;
    document.getElementById('set-shop-name').value = DB.shopName;
    document.getElementById('set-min-start').value = DB.minStartMin;
    document.getElementById('set-min-extend').value = DB.minExtendMin;
  }
  function bindNum(id, key) {
    document.getElementById(id).addEventListener('change', function () {
      var v = parseFloat(this.value);
      if (!isNaN(v) && v >= 0) { DB[key] = v; save(); toast('设置已更新'); renderSettings(); }
    });
  }
  bindNum('set-price', 'pricePerHour');
  bindNum('set-min-start', 'minStartMin');
  bindNum('set-min-extend', 'minExtendMin');
  document.getElementById('set-shop-name').addEventListener('change', function () {
    DB.shopName = this.value.trim() || '拼豆小店';
    save();
    document.getElementById('shop-title').textContent = DB.shopName;
    document.title = DB.shopName + ' · 座位管理';
  });
  document.getElementById('btn-export').onclick = function () {
    var blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'beadshop-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  document.getElementById('btn-import').onclick = function () { document.getElementById('import-file').click(); };
  document.getElementById('import-file').addEventListener('change', function () {
    var f = this.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var d = JSON.parse(reader.result);
        if (!d.batches) throw 0;
        DB = d; save(); renderSeats(); renderSettings();
        toast('导入成功');
      } catch (e) { toast('文件格式不对'); }
    };
    reader.readAsText(f);
    this.value = '';
  });
  document.getElementById('btn-reset').onclick = function () {
    confirmModal('清空所有数据', '批次、座位状态、预约、豆仓都会恢复默认，确定吗？', function () {
      DB = defaultData(); save(); renderSeats(); renderSettings();
      toast('已恢复默认');
    }, '全部清空');
  };

  /* ================= 演示数据（?demo=1） ================= */
  if (/[?&]demo=1/.test(location.search)) {
    var n = Date.now(), H = 3600000, M = 60000;
    DB = defaultData();
    function mkBatch(seatIds, startAgo, total, note, goneSpec) {
      var bid = uid('b');
      var b = { id: bid, note: note, start: n - startAgo, end: n - startAgo + total, members: {} };
      seatIds.forEach(function (id, idx) {
        var pid = uid('p');
        b.members[pid] = { id: pid, gender: idx % 2 ? 'g' : 'b', variant: Math.floor(Math.random() * 10),
          seatId: id, status: 'active', paid: false, fee: 0, leftAt: null };
        DB.seats[id] = { pid: pid, bid: bid };
      });
      if (goneSpec) {   // 一个提前走、未付钱的人
        var pid2 = uid('p');
        var leftAt = n - goneSpec.leftAgo;
        b.members[pid2] = { id: pid2, gender: 'b', variant: 3, seatId: null,
          status: 'gone', paid: false, fee: 0, leftAt: leftAt };
        b.members[pid2].fee = (function () {
          var bill = Math.max(leftAt - b.start, DB.minStartMin * 60000);
          return Math.round(DB.pricePerHour * bill / 3600000);
        })();
      }
      DB.batches[bid] = b;
    }
    mkBatch(['A1', 'A2', 'A5', 'A6'], 1.5 * H, 4 * H, '红衣服', { leftAgo: 0.5 * H });
    mkBatch(['A7', 'A8'], 36 * M, 60 * M, '');
    mkBatch(['B1', 'B2'], 2 * H, 4.5 * H, '情侣');
    mkBatch(['C1'], 0.8 * H, 2 * H, '');
    mkBatch(['C3'], 3 * H, 2 * H, '常客');   // 已到时
    save();
    // 截图自检钩子（仅 demo 模式）
    var shot = (location.search.match(/shot=(\w+)/) || [])[1];
    if (shot) setTimeout(function () {
      function clickSeat(id) { document.querySelector('.seat-hit[data-id="' + id + '"]').click(); }
      if (shot === 'cat') {
        document.getElementById('btn-cat').click(); clickSeat('B5'); clickSeat('B6'); clickSeat('B7');
        document.getElementById('mode-ok').click();
      } else if (shot === 'dog') {
        document.getElementById('btn-dog').click(); clickSeat('A7'); clickSeat('A8');
        document.getElementById('mode-ok').click();
      } else if (shot === 'dog2') {   // 整批走完（含未付尾款）
        document.getElementById('btn-dog').click(); clickSeat('A1'); clickSeat('A2'); clickSeat('A5'); clickSeat('A6');
        document.getElementById('mode-ok').click();
      } else if (shot === 'plaque') {
        document.querySelector('.plaque').click();
      } else if (shot === 'swap') {
        clickSeat('A1');
      }
    }, 300);
  }

  /* ================= 启动 ================= */
  document.getElementById('shop-title').textContent = DB.shopName;
  document.title = DB.shopName + ' · 座位管理';
  buildRoom();
  renderSeats();
  setInterval(renderSeats, 1000);
})();
