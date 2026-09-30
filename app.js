/* ===== 拼豆小店 · 像素风房间视图 v3 =====
   猫=批量开桌  狗=批量结账  点有人座位=换座
   计费：按分钟线性，每人保底 minStartMin，提前走不退保底 */
(function () {
  'use strict';

  /* ================= 店面布局配置 ================= */
  /* 真实店面：靠墙一排 6 个单人桌 + 两大排 2×6 长桌 = 30 个位置 */
  var ROOM_W = 416, ROOM_H = 304;

  var FURNITURE = [
    { img: 'shelf.png', x: 0, y: 16, w: 416, h: 20 },          // 豆仓货架墙
    // 靠墙单人桌 ×6（与长桌同跨度 276：x=70 起，桌距 50，缝隙 24）
    { img: 'desk_single.png', x: 70, y: 40, w: 26, h: 22 },
    { img: 'desk_single.png', x: 120, y: 40, w: 26, h: 22 },
    { img: 'desk_single.png', x: 170, y: 40, w: 26, h: 22 },
    { img: 'desk_single.png', x: 220, y: 40, w: 26, h: 22 },
    { img: 'desk_single.png', x: 270, y: 40, w: 26, h: 22 },
    { img: 'desk_single.png', x: 320, y: 40, w: 26, h: 22 },
    // 两排 2×6 白色塑料长桌（跨度与单人桌排一致）
    { img: 'table_long.png', x: 70, y: 120, w: 276, h: 28 },
    { img: 'table_long.png', x: 70, y: 216, w: 276, h: 28 },
    { img: 'plant.png', x: 8, y: 268, w: 16, h: 20 },
    { img: 'plant.png', x: 390, y: 268, w: 16, h: 20 },
    { img: 'mat.png', x: 192, y: 286, w: 32, h: 12 }
  ];

  var SEATS = [];
  var i;
  // 靠墙单人桌 ×6（面朝北，看到背影），座位居中于各自桌面（桌 x=70+i*50）
  for (i = 0; i < 6; i++) {
    SEATS.push({ id: 'S' + (i + 1), name: '单' + (i + 1), zone: '靠墙单人桌',
      x: 75 + i * 50, y: 66, w: 16, h: 16, dir: 'n', stool: true, plaqueDy: -34 });
  }
  // 大桌第一排 A1-A6 北侧(面朝南) / A7-A12 南侧(面朝北)
  var rowX = [100, 140, 180, 220, 260, 300];
  for (i = 0; i < 6; i++) {
    SEATS.push({ id: 'A' + (i + 1), name: '1排' + (i + 1), zone: '大桌第一排',
      x: rowX[i], y: 96, w: 16, h: 16, dir: 's', table: 't1' });
    SEATS.push({ id: 'A' + (i + 7), name: '1排' + (i + 7), zone: '大桌第一排',
      x: rowX[i], y: 156, w: 16, h: 16, dir: 'n', table: 't1' });
  }
  // 大桌第二排
  for (i = 0; i < 6; i++) {
    SEATS.push({ id: 'B' + (i + 1), name: '2排' + (i + 1), zone: '大桌第二排',
      x: rowX[i], y: 192, w: 16, h: 16, dir: 's', table: 't2' });
    SEATS.push({ id: 'B' + (i + 7), name: '2排' + (i + 7), zone: '大桌第二排',
      x: rowX[i], y: 252, w: 16, h: 16, dir: 'n', table: 't2' });
  }
  function seatById(id) { return SEATS.find(function (s) { return s.id === id; }); }

  /* ================= 营业规则 ================= */
  var MIN_DUR_MIN = 60;    // 开桌时长下限（分钟）= 1 小时
  var MAX_DUR_MIN = 840;   // 开桌时长上限（分钟）= 14 小时

  /* ================= 数据层 ================= */
  var STORE_KEY = 'beadshop_v4';

  function migrate(d) {
    // v3 -> v4：批次统一 end 拆到每个成员（支持逐人不同时长）
    if (d && d.batches) {
      Object.keys(d.batches).forEach(function (bid) {
        var b = d.batches[bid];
        if (b.end != null) {
          Object.keys(b.members || {}).forEach(function (pid) {
            var m = b.members[pid];
            if (m.end == null) m.end = b.end;
          });
          delete b.end;
        }
      });
    }
    // v4 -> v5：开桌时长限定 1~14 小时（存量最小时间 120 一律降到 60）；默认店名换成「魔法菠萝」
    if (d && !d.cfgV5) {
      d.cfgV5 = 1;
      if (d.minStartMin == null || d.minStartMin > MIN_DUR_MIN) d.minStartMin = MIN_DUR_MIN;
      if (!d.shopName || d.shopName === '拼豆小店') d.shopName = '魔法菠萝 Magic Pineapple';
    }
    if (d && d.soundVol == null) d.soundVol = 100;   // v5.1：音量条（幂等）
    return d;
  }
  function defaultData() {
    return {
      shopName: '魔法菠萝 Magic Pineapple',
      pricePerHour: 20,
      minStartMin: 60,      // 最小开桌时间（分钟），提前走不退
      minExtendMin: 30,     // 加钟最小单位（分钟）
      sound: null,          // 自定义到时提示音 {name,size,url}，null=内置「叮咚」
      soundVol: 100,        // 响铃音量 0~100
      seats: {},            // seatId -> {pid, bid}
      batches: {},          // bid -> {id,note,start,members:{pid:{id,gender,variant,seatId,status,paid,fee,leftAt,end}}}
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
      if (d && d.batches) return migrate(d);
    } catch (e) {}
    try {   // 兼容旧版数据
      var old = JSON.parse(localStorage.getItem('beadshop_v3'));
      if (old && old.batches) return migrate(old);
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
  /* 批次最近到点（活跃成员里最小的 end）与最远到点 */
  function batchNearEnd(b) {
    var e = Infinity;
    activeMembers(b).forEach(function (m) { if (m.end < e) e = m.end; });
    return e === Infinity ? 0 : e;
  }
  function batchFarEnd(b) {
    var e = 0;
    activeMembers(b).forEach(function (m) { if (m.end > e) e = m.end; });
    return e;
  }
  /* 费用：按实际占用分钟线性计，保底 minStartMin */
  function feeOf(m, b, now) {
    var t = (m.status === 'active' ? now : m.leftAt) - b.start;
    var bill = Math.max(t, DB.minStartMin * 60000);
    return Math.round(DB.pricePerHour * bill / 3600000);
  }
  function batchList() {
    return Object.keys(DB.batches).map(function (k) { return DB.batches[k]; })
      .sort(function (a, b) { return batchNearEnd(a) - batchNearEnd(b); });
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
      var chairImg = s.dir === 's' ? 'chair_s.png' : 'chair_n.png';
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
    // 每人一块小钟：无文字只显示进度，锚在小人头左上方；点人弹出具体剩余时间
    batchList().forEach(function (b) {
      activeMembers(b).forEach(function (m) {
        var s = seatById(m.seatId);
        if (!s) return;
        var remain = m.end - now;
        var frac = Math.max(0, Math.min(1, remain / (m.end - b.start)));
        var cls2 = remain <= 0 ? 'over' : (remain < 15 * 60000 ? 'warn' : 'ok');
        var px = s.x + s.w / 2 - 16, py = s.y - 17;
        html += '<div class="plaque mini ' + cls2 + '" data-bid="' + b.id + '" data-frac="' + frac +
          '" style="left:' + pctX(px) + ';top:' + pctY(py) + '">' +
          '<canvas class="clk" width="16" height="16"></canvas></div>';
      });
    });
    layer.innerHTML = html;
    // 画时钟
    layer.querySelectorAll('.plaque').forEach(function (p) {
      drawClock(p.querySelector('canvas'), parseFloat(p.dataset.frac), p.classList.contains('over') ? 'over' : p.classList.contains('warn') ? 'warn' : 'ok');
    });
    checkAlarms(now);
    updateSoundHint();
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
      var nearEnd = batchNearEnd(b), farEnd = batchFarEnd(b);
      var remain = nearEnd - now;
      var cls = remain <= 0 ? 'over' : (remain < 15 * 60000 ? 'warn' : '');
      var name = b.note || (seatById(act[0].seatId) || {}).zone || '批次';
      var seatNames = act.map(function (m) { var s = seatById(m.seatId); return s ? s.name : ''; }).join(' ');
      var durTxt = (nearEnd === farEnd)
        ? ('共' + fmtDurCN(farEnd - b.start))
        : ('最长' + fmtDurCN(farEnd - b.start) + ' · 最短' + fmtDurCN(nearEnd - b.start));
      return '<div class="group-card" data-bid="' + b.id + '">' +
        '<div class="g-name"><span>' + esc(name) + ' × ' + act.length + '人</span><span>' + esc(seatNames) + '</span></div>' +
        '<div class="g-count ' + cls + '">' + (remain <= 0 ? '已到时!' : '剩 ' + fmtRemain(remain)) + '</div>' +
        '<div class="g-sub">' + fmtHM(b.start) + ' 开始' +
        ' · ' + durTxt + ' · 已营业 ' + fmtRemain(now - b.start) + '</div>' +
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

  /* ================= 座位气泡（点人显示他的剩余时间） ================= */
  var seatTip = null, seatTipTimer = null;
  function showSeatTip(s, text) {
    if (!seatTip) {   // buildRoom 会清空 #room，所以首次使用时再挂
      seatTip = document.createElement('div');
      seatTip.className = 'seat-tip';
      room.appendChild(seatTip);
    }
    seatTip.textContent = text;
    seatTip.style.left = pctX(s.x + s.w / 2);
    seatTip.style.top = pctY(s.y - 20);
    seatTip.style.display = 'block';
    clearTimeout(seatTipTimer);
    seatTipTimer = setTimeout(function () { seatTip.style.display = 'none'; }, 2600);
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
      var srcSeat = seatById(swapSrc);
      if (busy) {   // 互换（弹确认防误点）
        confirmModal('确认换座', '把 ' + srcSeat.name + ' 和 ' + seat.name + ' 的客人互换吗？', function () {
          var dstOcc = occ;
          var db2 = DB.batches[dstOcc.bid];
          DB.seats[swapSrc] = { pid: dstOcc.pid, bid: dstOcc.bid };
          DB.seats[seat.id] = { pid: srcOcc.pid, bid: srcOcc.bid };
          if (sb && sb.members[srcOcc.pid]) sb.members[srcOcc.pid].seatId = seat.id;
          if (db2 && db2.members[dstOcc.pid]) db2.members[dstOcc.pid].seatId = swapSrc;
          save(); setMode(null);
          toast('已互换座位');
        });
      } else {      // 挪到空位（弹确认防误点）
        confirmModal('确认换座', '把 ' + srcSeat.name + ' 的客人换到 ' + seat.name + ' 吗？', function () {
          delete DB.seats[swapSrc];
          DB.seats[seat.id] = { pid: srcOcc.pid, bid: srcOcc.bid };
          if (sb && sb.members[srcOcc.pid]) sb.members[srcOcc.pid].seatId = seat.id;
          save(); setMode(null);
          toast('已换到 ' + seat.name);
        });
      }
    } else {
      if (busy) {
        var bb2 = DB.batches[occ.bid];
        var mm = bb2 && bb2.members[occ.pid];
        if (mm) {
          var rm = mm.end - Date.now();
          showSeatTip(seat, rm <= 0 ? '已到时！' : '剩 ' + fmtRemain(rm));
        }
        mode = 'swap'; swapSrc = seat.id; banner.classList.remove('hidden');
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
    var defMin = Math.max(DB.minStartMin, 120);
    var presetH = [];
    [1, 2, 3, 4, 5, 6, 8, 10, 12, 14].forEach(function (h) {
      if (h * 60 >= DB.minStartMin && h * 60 <= MAX_DUR_MIN) presetH.push(h);
    });
    if (!presetH.length) presetH.push(Math.ceil(DB.minStartMin / 60));
    function durOptions(selMin) {
      var o = presetH.map(function (h) {
        return '<option value="' + h * 60 + '"' + (h * 60 === selMin ? ' selected' : '') + '>' + h + '小时</option>';
      }).join('');
      o += '<option value="custom">自定义…</option>';
      return o;
    }
    var rows = seatIds.map(function (id) {
      var s = seatById(id);
      return '<div class="assign-row" data-sid="' + id + '">' +
        '<span class="seat-cell"><img class="person-prev" src="assets/p_b0_front.png">' + esc(s.name) + '</span>' +
        '<span class="gender-pick"><button class="pbtn pbtn-sm g-b pbtn-gold" data-g="b">男</button>' +
        '<button class="pbtn pbtn-sm g-g" data-g="g">女</button></span>' +
        '<select class="dur-sel">' + durOptions(defMin) + '</select></div>';
    }).join('');
    var body =
      '<p class="hint">点每个人的时长可以单独设置，每个人的时间可以不一样</p>' +
      '<div class="assign-list">' + rows + '</div>' +
      '<div class="field"><span>统一设为（一键应用到所有人）</span><div class="dur-grid">' +
      presetH.map(function (h) { return '<button class="pbtn pbtn-sm" data-all="' + h * 60 + '">' + h + '小时</button>'; }).join('') +
      '</div></div>' +
      '<label class="field"><span>批次备注（方便认人，可空）</span><input type="text" id="ot-note" placeholder="例如：红衣服 / 拼单"></label>' +
      '<p class="hint">' + DB.pricePerHour + ' 元/人/小时 · 保底 ' + fmtDurCN(DB.minStartMin * 60000) +
      ' · 时长 1~14 小时 · 现在开始（' + fmtHM(Date.now()) + '）</p>';

    openModal('开桌 · ' + seatIds.length + ' 个座位', body, [
      { text: '取消', onClick: closeModal },
      { text: '确定开桌', cls: 'pbtn-gold', onClick: function () { doOpen(seatIds); } }
    ]);
    modalBody.querySelectorAll('.gender-pick button').forEach(function (b) {
      b.onclick = function () {
        var row = b.closest('.assign-row');
        row.querySelectorAll('.gender-pick button').forEach(function (x) { x.classList.remove('pbtn-gold'); });
        b.classList.add('pbtn-gold');
        row.querySelector('.person-prev').src = 'assets/p_' + b.dataset.g + '0_front.png';
      };
    });
    modalBody.querySelectorAll('.dur-sel').forEach(function (sel) {
      sel.onchange = function () { if (sel.value === 'custom') sel.replaceWith(mkDurInput()); };
    });
    modalBody.querySelectorAll('button[data-all]').forEach(function (b) {
      b.onclick = function () {
        var v = parseInt(b.dataset.all, 10);
        modalBody.querySelectorAll('.assign-row').forEach(function (row) {
          var sel = row.querySelector('.dur-sel');
          if (sel) { sel.value = v; }
          else {
            var inp = row.querySelector('.dur-inp');
            var ns = document.createElement('select');
            ns.className = 'dur-sel';
            ns.innerHTML = durOptions(v);
            ns.value = v;
            ns.onchange = sel_onchange;
            inp.replaceWith(ns);
          }
        });
        toast('已统一设为 ' + fmtDurCN(v * 60000));
      };
    });
    function mkDurInput() {   // 自定义时长输入框：1~14 小时（分钟）
      var inp = document.createElement('input');
      inp.type = 'number';
      inp.min = Math.max(MIN_DUR_MIN, DB.minStartMin);
      inp.max = MAX_DUR_MIN;
      inp.placeholder = '分钟';
      inp.value = defMin;
      inp.className = 'dur-inp';
      return inp;
    }
    function sel_onchange() {
      if (this.value === 'custom') this.replaceWith(mkDurInput());
    }
  }

  function doOpen(seatIds) {
    var now = Date.now();
    var bid = uid('b');
    var note = document.getElementById('ot-note').value.trim();
    var batch = { id: bid, note: note, start: now, members: {} };
    seatIds.forEach(function (id, idx) {
      var row = modalBody.querySelector('.assign-row[data-sid="' + id + '"]');
      var gbtn = row.querySelector('.gender-pick .pbtn-gold');
      var gender = gbtn ? gbtn.dataset.g : (idx % 2 ? 'g' : 'b');
      var sel = row.querySelector('.dur-sel');
      var mins;
      if (sel) mins = parseInt(sel.value, 10);
      else mins = parseInt(row.querySelector('.dur-inp').value, 10);
      var lo = Math.max(MIN_DUR_MIN, DB.minStartMin);
      if (!mins || mins < lo) mins = lo;
      if (mins > MAX_DUR_MIN) mins = MAX_DUR_MIN;
      var pid = uid('p');
      batch.members[pid] = {
        id: pid, gender: gender, variant: Math.floor(Math.random() * 10),
        seatId: id, status: 'active', paid: false, fee: 0, leftAt: null,
        end: now + mins * 60000
      };
      DB.seats[id] = { pid: pid, bid: bid };
    });
    DB.batches[bid] = batch;
    save(); setMode(null); closeModal();
    toast('开桌成功，' + seatIds.length + ' 人');
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
    var nearEnd = batchNearEnd(b), farEnd = batchFarEnd(b);
    var remain = nearEnd - now;
    var act = activeMembers(b);
    var pct = Math.max(0, Math.round(remain / (nearEnd - b.start) * 100));
    var personLines = act.map(function (m) {
      var s = seatById(m.seatId);
      var mr = m.end - now;
      return '<div class="bill-line"><span>' + (s ? esc(s.name) : '') + '（' + (m.gender === 'g' ? '女' : '男') + '）</span>' +
        '<span>' + (mr <= 0 ? '到时!' : fmtRemain(mr)) + ' · ' + fmtHM(m.end) + '止</span></div>';
    }).join('');
    var body =
      '<div class="bill-line"><span>剩余时间</span><span>' + (remain <= 0 ? '已到时!' : fmtRemain(remain) + '（' + pct + '%）') + '</span></div>' +
      '<div class="bill-line"><span>开始时间</span><span>' + fmtHM(b.start) + '</span></div>' +
      '<div class="bill-line"><span>已营业</span><span>' + fmtRemain(now - b.start) + '</span></div>' +
      '<div class="bill-line"><span>在店人数</span><span>' + act.length + ' 人</span></div>' +
      (b.note ? '<div class="bill-line"><span>备注</span><span>' + esc(b.note) + '</span></div>' : '') +
      '<p class="hint" style="margin-top:6px">每个人的时间：</p>' + personLines;
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
      '<p class="hint">当前最近到点 ' + fmtHM(batchNearEnd(b)) + ' · 整批所有人一起加，各自时长差保持不变</p>';
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
      activeMembers(b).forEach(function (m) { m.end += mins * 60000; });
      save(); renderSeats(); closeModal();
      toast('已加钟 ' + fmtDurCN(mins * 60000) + '，最近到点 ' + fmtHM(batchNearEnd(b)));
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
  // 预约/豆仓板块暂时下线，tabNames 同步移除（恢复时把 index.html 注释去掉并加回这两项）
  var tabNames = ['seats', 'settings'];
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
  var btnAddReserve = document.getElementById('btn-add-reserve');   // 板块下线时为 null
  if (btnAddReserve) btnAddReserve.onclick = function () {
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
  var reserveList = document.getElementById('reserve-list');
  if (reserveList) reserveList.addEventListener('click', function (e) {
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
  var btnAddStock = document.getElementById('btn-add-stock');       // 板块下线时为 null
  if (btnAddStock) btnAddStock.onclick = function () {
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
  var stockList = document.getElementById('stock-list');
  if (stockList) stockList.addEventListener('click', function (e) {
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
    renderSoundStatus();
    renderVol();
  }
  function bindNum(id, key, lo, hi) {
    document.getElementById(id).addEventListener('change', function () {
      var v = parseFloat(this.value);
      if (isNaN(v)) return;
      if (lo != null && v < lo) v = lo;      // 越界自动夹回范围
      if (hi != null && v > hi) v = hi;
      DB[key] = v; save(); toast('设置已更新'); renderSettings();
    });
  }
  bindNum('set-price', 'pricePerHour');
  bindNum('set-min-start', 'minStartMin', MIN_DUR_MIN, MAX_DUR_MIN);
  bindNum('set-min-extend', 'minExtendMin');
  document.getElementById('set-shop-name').addEventListener('change', function () {
    DB.shopName = this.value.trim() || '魔法菠萝 Magic Pineapple';
    save();
    document.getElementById('shop-title').textContent = DB.shopName;
    document.title = DB.shopName + ' · 座位管理';
  });
  document.getElementById('btn-export').onclick = function () {
    var d = JSON.parse(JSON.stringify(DB));
    delete d.sound;   // 提示音是本机设置（可能好几 MB），不进备份文件
    var blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
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
        d.sound = DB.sound;   // 保留本机的提示音设置
        DB = migrate(d); save(); renderSeats(); renderSettings();
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

  /* ================= 到时提示音 ================= */
  /* 纯静态站也能响：默认走 Web Audio 现场合成「叮咚」声（不依赖任何音频文件）；
     想换成自己的声音：设置里上传音频，以 base64 存进 localStorage（本机有效，刷新不丢） */
  var SOUND_MAX_BYTES = 2 * 1024 * 1024;
  var ALARM_RING_MS = 60000;     // 到时后持续响 1 分钟自动停
  var RING_GAP_MS = 2000;        // 播完一遍后隔 2 秒从头再播
  var CHIME_MS = 1200;           // 内置「叮咚」时长
  var audioCtx = null, audioUnlocked = false;
  var alarmedEnd = {};   // pid -> 已响过铃的 end；加钟后 end 变了会再响
  var ringUntil = 0;

  function getCtx() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { try { audioCtx = new AC(); } catch (e) {} }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  /* 浏览器规定：用户先和页面有过交互才允许出声（开桌、点按钮都算交互） */
  function unlockAudio() {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (audioUnlocked) return;
    audioUnlocked = true;
    var el = document.getElementById('sound-hint');
    if (el) el.classList.add('hidden');
  }
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  document.addEventListener('keydown', unlockAudio, { passive: true });

  /* 音量：100 = 原始音量；滑块最高 200，超过 100 的部分走 Web Audio 放大 */
  function ringGain() { return (DB.soundVol == null ? 100 : DB.soundVol) / 100; }
  /* 自定义音频出声：≤100% 直接用元素音量；>100% 接进 Web Audio 做增益放大 + 压限防爆音 */
  function playCustomAudio(a, gain) {
    if (gain <= 1) { a.volume = gain; return; }
    var ctx = getCtx(), src = null;
    try { src = ctx && ctx.createMediaElementSource(a); } catch (e) {}
    if (!src) { a.volume = 1; return; }
    var g = ctx.createGain();
    g.gain.value = gain;
    var comp = ctx.createDynamicsCompressor();
    src.connect(g); g.connect(comp); comp.connect(ctx.destination);
  }
  /* 内置「叮咚」：两个带衰减的正弦音（峰值 0.9，音量旋钮在其后放大） */
  function playChime() {
    var gain = ringGain();
    if (gain <= 0) return;
    var ctx = getCtx();
    if (!ctx || ctx.state !== 'running') return;
    var master = ctx.createGain();
    master.gain.value = gain;
    var comp = ctx.createDynamicsCompressor();   // 超 100% 时压住峰值，防爆音
    master.connect(comp); comp.connect(ctx.destination);
    var t0 = ctx.currentTime + 0.03;
    function note(freq, at, dur) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.9, at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g); g.connect(master);
      o.start(at); o.stop(at + dur + 0.05);
    }
    note(1046.5, t0, 0.5);          // 叮
    note(783.99, t0 + 0.28, 0.85);  // 咚
  }
  function playAlert() {
    var gain = ringGain();
    if (gain <= 0) return;
    if (DB.sound && DB.sound.url) {
      try {
        var a = new Audio(DB.sound.url);
        playCustomAudio(a, gain);
        a.play().catch(function () {});
      } catch (e) {}
    } else playChime();
  }
  /* 刷新页面时就已经到时的客人不补响，只对之后「刚刚到时」的响一次 */
  function initAlarmed() {
    Object.keys(DB.batches).forEach(function (bid) {
      activeMembers(DB.batches[bid]).forEach(function (m) {
        if (m.end <= Date.now()) alarmedEnd[m.id] = m.end;
      });
    });
  }
  /* 还有没有到时未处理的活跃客人（都处理完就提前停铃） */
  function anyOverdue(now) {
    var has = false;
    Object.keys(DB.batches).forEach(function (bid) {
      activeMembers(DB.batches[bid]).forEach(function (m) { if (m.end <= now) has = true; });
    });
    return has;
  }
  function checkAlarms(now) {
    var names = [];
    Object.keys(DB.batches).forEach(function (bid) {
      activeMembers(DB.batches[bid]).forEach(function (m) {
        if (m.end <= now && alarmedEnd[m.id] !== m.end) {
          alarmedEnd[m.id] = m.end;
          ringUntil = Math.max(ringUntil, m.end + ALARM_RING_MS);
          var s = seatById(m.seatId);
          if (s) names.push(s.name);
        }
      });
    });
    if (names.length) {
      startRingLoop();
      toast('⏰ 到时啦！' + names.join(' ') + '（' + names.length + ' 人）');
      return;
    }
    // 响铃窗口结束或客人都处理完 → 立即停铃（含掐断正在播的长音频）
    if (ringLoopOn && (now >= ringUntil || !anyOverdue(now))) stopRingLoop();
  }

  /* ---- 响铃循环：音频播完一遍 → 等 2 秒 → 从头再播，直到到时后 1 分钟或客人处理完 ---- */
  var ringLoopOn = false, ringTimer = null, curRingAudio = null;
  function stopRingLoop() {
    ringLoopOn = false;
    clearTimeout(ringTimer);
    if (curRingAudio) { try { curRingAudio.pause(); } catch (e) {} curRingAudio = null; }
  }
  function startRingLoop() {
    if (ringLoopOn) return;
    ringLoopOn = true;
    ringStep();
  }
  function ringStep() {
    if (!ringLoopOn) return;
    if (Date.now() >= ringUntil || !anyOverdue(Date.now())) { stopRingLoop(); return; }
    if (DB.sound && DB.sound.url) {
      var a = null;
      try { a = new Audio(DB.sound.url); } catch (e) {}
      if (a) {
        playCustomAudio(a, ringGain());
        curRingAudio = a;
        var ended = false;
        function next() {   // 播完（或被拦/出错）→ 隔 2 秒从头再来
          if (ended) return;
          ended = true;
          if (curRingAudio === a) curRingAudio = null;
          ringTimer = setTimeout(ringStep, RING_GAP_MS);
        }
        a.onended = next;
        a.onerror = next;
        a.ontimeupdate = function () {   // 音频比 1 分钟长：只播前 60 秒
          if (a.currentTime >= 60) { try { a.pause(); } catch (e) {} next(); }
        };
        var p = a.play();
        if (p && p.catch) p.catch(next);   // 还没解锁出声会被拦，2 秒后自动再试
        return;
      }
    }
    playChime();
    ringTimer = setTimeout(ringStep, CHIME_MS + RING_GAP_MS);   // 内置音按同样规则循环
  }
  /* 有客人在店、但声音还没解锁时，挂一条提示（点一下页面就好） */
  function updateSoundHint() {
    if (audioUnlocked) return;
    var el = document.getElementById('sound-hint');
    if (!el) return;
    var n = 0;
    Object.keys(DB.batches).forEach(function (bid) { n += activeMembers(DB.batches[bid]).length; });
    el.classList.toggle('hidden', n === 0);
  }

  /* ---- 设置里的提示音上传/试听 ---- */
  function renderSoundStatus() {
    var el = document.getElementById('sound-status');
    el.innerHTML = DB.sound
      ? '当前自定义提示音：' + esc(DB.sound.name) + '（' + Math.round((DB.sound.size || 0) / 1024) + 'KB）'
      : '当前是内置「叮咚」声；上传音频可换成自己的提示音（建议 mp3，2MB 以内）';
  }
  document.getElementById('btn-sound-pick').onclick = function () { document.getElementById('sound-file').click(); };
  document.getElementById('sound-file').addEventListener('change', function () {
    var f = this.files[0];
    this.value = '';
    if (!f) return;
    if (f.size > SOUND_MAX_BYTES) { toast('音频太大了，请压缩到 2MB 以内'); return; }
    var rd = new FileReader();
    rd.onload = function () {
      var prev = DB.sound;
      DB.sound = { name: f.name, size: f.size, url: rd.result };
      try { save(); }
      catch (e) { DB.sound = prev; toast('浏览器存不下这个音频，换个小点的试试'); return; }
      renderSoundStatus();
      playAlert();
      toast('提示音已保存，刚才就是它的声音');
    };
    rd.readAsDataURL(f);
  });
  document.getElementById('btn-sound-test').onclick = function () { playAlert(); };
  document.getElementById('btn-sound-clear').onclick = function () {
    if (!DB.sound) { toast('现在用的就是内置音效'); return; }
    DB.sound = null; save(); renderSoundStatus();
    toast('已恢复内置「叮咚」声');
  };

  /* ---- 音量条 ---- */
  var volInp = document.getElementById('set-sound-vol');
  function renderVol() {
    volInp.value = DB.soundVol == null ? 100 : DB.soundVol;
    document.getElementById('vol-num').textContent = volInp.value + '%';
  }
  volInp.addEventListener('input', function () {
    document.getElementById('vol-num').textContent = this.value + '%';
  });
  volInp.addEventListener('change', function () {
    DB.soundVol = parseInt(this.value, 10);
    save(); renderVol();
    playAlert();   // 松手就试听一下新音量
  });

  /* ================= 演示数据（?demo=1） ================= */
  if (/[?&]demo=1/.test(location.search)) {
    var n = Date.now(), H = 3600000, M = 60000;
    DB = defaultData();
    function mkBatch(seatIds, startAgo, total, note, goneSpec, durs) {
      var bid = uid('b');
      var b = { id: bid, note: note, start: n - startAgo, members: {} };
      seatIds.forEach(function (id, idx) {
        var pid = uid('p');
        var dur = (durs && durs[idx] != null) ? durs[idx] : total;   // 支持逐人不同时长
        b.members[pid] = { id: pid, gender: idx % 2 ? 'g' : 'b', variant: Math.floor(Math.random() * 10),
          seatId: id, status: 'active', paid: false, fee: 0, leftAt: null,
          end: n - startAgo + dur };
        DB.seats[id] = { pid: pid, bid: bid };
      });
      if (goneSpec) {   // 一个提前走、未付钱的人
        var pid2 = uid('p');
        var leftAt = n - goneSpec.leftAgo;
        b.members[pid2] = { id: pid2, gender: 'b', variant: 3, seatId: null,
          status: 'gone', paid: false, fee: 0, leftAt: leftAt, end: n - startAgo + total };
        b.members[pid2].fee = (function () {
          var bill = Math.max(leftAt - b.start, DB.minStartMin * 60000);
          return Math.round(DB.pricePerHour * bill / 3600000);
        })();
      }
      DB.batches[bid] = b;
    }
    mkBatch(['A1', 'A2', 'A7', 'A8'], 1.5 * H, 4 * H, '红衣服', { leftAgo: 0.5 * H }, [4 * H, 4 * H, 4 * H, 2 * H]);
    mkBatch(['A11', 'A12'], 36 * M, 60 * M, '');
    mkBatch(['S3'], 0.8 * H, 2 * H, '');
    mkBatch(['B1', 'B3'], 2 * H, 4.5 * H, '情侣', null, [4.5 * H, 3 * H]);
    mkBatch(['B12'], 3 * H, 2 * H, '常客');   // 已到时
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
      } else if (shot === 'swap2') {   // 换座确认弹窗
        clickSeat('A1'); clickSeat('A3');
      } else if (shot === 'tip') {     // 点人显示剩余时间气泡
        clickSeat('A1');
      }
    }, 300);
  }

  /* ================= 启动 ================= */
  document.getElementById('shop-title').textContent = DB.shopName;
  document.title = DB.shopName + ' · 座位管理';
  initAlarmed();
  buildRoom();
  renderSeats();
  setInterval(renderSeats, 1000);
})();
