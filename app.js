// =============================================
// 設定
// =============================================
const STAFF_PASSWORD = 'darukan2024';
const FIXED_PRICE = 300;
const DEADLINE_HOUR = 17;

const GAS_URL = 'https://script.google.com/macros/s/AKfycbztMyX037dOql-HbWy41bCP-KRFh0rlsAirbeRNCSkUTpCWa_4q2JPWc-GgZJKm6vFN/exec';

const DAY_NAMES = ['日','月','火','水','木','金','土'];
const DAY_CLASSES = ['day-sun','day-mon','day-tue','day-wed','day-thu','day-fri','day-sat'];

let currentMode = 'user';
let currentWeekOffset = 0;
let currentPattern = 'single';
let menuCache = {};
let orderCache = {};
let userCache = [];
let deleteTargetName = '';

// =============================================
// 日付ユーティリティ
// =============================================

function getWeekMonday(offset) {
  offset = offset || 0;
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getWeekDates(offset) {
  offset = offset || 0;
  const monday = getWeekMonday(offset);
  return Array.from({ length: 6 }, function(_, i) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function formatDateLabel(date) {
  return (date.getMonth() + 1) + '月' + date.getDate() + '日（' + DAY_NAMES[date.getDay()] + '）';
}

function weekRangeLabel(offset) {
  const monday = getWeekMonday(offset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 5);
  return (monday.getMonth() + 1) + '/' + monday.getDate() + ' 〜 ' + (sunday.getMonth() + 1) + '/' + sunday.getDate();
}

function weekPrefix(offset) {
  const monday = getWeekMonday(offset);
  return monday.getFullYear() + '-' + String(monday.getMonth() + 1).padStart(2, '0');
}

// =============================================
// API通信
// =============================================

function apiGet(params) {
  const query = Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  return fetch(GAS_URL + '?' + query).then(function(r) { return r.json(); });
}

function apiPost(data) {
  return fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify(data)
  }).then(function(r) { return r.json(); });
}

// =============================================
// データ取得
// =============================================

function loadMenus() {
  showLoading(true, '献立を読み込み中...');
  return apiGet({ action: 'getMenus' }).then(function(data) {
    menuCache = data;
    showLoading(false);
  }).catch(function() {
    showToast('献立の読み込みに失敗しました', 'error');
    showLoading(false);
  });
}

function loadOrders() {
  showLoading(true, '注文データを読み込み中...');
  return apiGet({ action: 'getOrders', week: weekPrefix(currentWeekOffset) }).then(function(data) {
    orderCache = data;
    showLoading(false);
  }).catch(function() {
    showToast('注文データの読み込みに失敗しました', 'error');
    showLoading(false);
  });
}

function loadUsers() {
  return apiGet({ action: 'getUsers' }).then(function(data) {
    userCache = data;
    updateNameSelects();
  }).catch(function() {
    showToast('利用者データの読み込みに失敗しました', 'error');
  });
}

function getMenu(dateStr) { return menuCache[dateStr] || null; }
function getOrdersForDate(dateStr) { return orderCache[dateStr] || []; }

// =============================================
// 名前プルダウン更新
// =============================================

function updateNameSelects() {
  const selects = ['order-name', 'myorder-name'];
  selects.forEach(function(id) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">名前を選んでください</option>';
    userCache.forEach(function(u) {
      const opt = document.createElement('option');
      opt.value = u.name;
      opt.textContent = u.name + (u.group ? '（' + u.group + '）' : '');
      if (u.name === currentVal) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}

// =============================================
// パスワード認証
// =============================================

function toggleMode() {
  if (currentMode === 'user') {
    document.getElementById('pw-input').value = '';
    document.getElementById('pw-error').style.display = 'none';
    document.getElementById('pw-modal').classList.add('open');
    setTimeout(function() { document.getElementById('pw-input').focus(); }, 100);
  } else {
    switchToUser();
  }
}

function checkPassword() {
  const input = document.getElementById('pw-input').value;
  if (input === STAFF_PASSWORD) {
    closePwModal();
    switchToStaff();
  } else {
    document.getElementById('pw-error').style.display = 'block';
    document.getElementById('pw-input').value = '';
    document.getElementById('pw-input').focus();
  }
}

function closePwModal() { document.getElementById('pw-modal').classList.remove('open'); }

function switchToStaff() {
  currentMode = 'staff';
  document.getElementById('mode-toggle-btn').textContent = '👤 利用者に戻る';
  document.getElementById('mode-toggle-btn').classList.add('staff-mode');
  document.getElementById('mode-label').textContent = 'スタッフモード';
  document.getElementById('user-tabs').style.display = 'none';
  document.getElementById('staff-tabs').style.display = 'flex';
  showPanel('edit-tab');
  document.getElementById('staff-tabs').querySelectorAll('.tab-btn').forEach(function(b, i) {
    b.classList.toggle('active', i === 0);
  });
  refreshAll();
}

function switchToUser() {
  currentMode = 'user';
  document.getElementById('mode-toggle-btn').textContent = '⚙ スタッフ';
  document.getElementById('mode-toggle-btn').classList.remove('staff-mode');
  document.getElementById('mode-label').textContent = '利用者モード';
  document.getElementById('user-tabs').style.display = 'flex';
  document.getElementById('staff-tabs').style.display = 'none';
  showPanel('menu-tab');
  document.getElementById('user-tabs').querySelectorAll('.tab-btn').forEach(function(b, i) {
    b.classList.toggle('active', i === 0);
  });
  refreshAll();
}

// =============================================
// タブ・パネル
// =============================================

function showPanel(panelId) {
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
  document.getElementById(panelId).classList.add('active');
}

function switchTab(panelId, btn) {
  showPanel(panelId);
  btn.closest('.tab-nav').querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  if (panelId === 'order-tab')   renderOrderPreview();
  if (panelId === 'check-tab')   loadOrders().then(renderOrderCheck);
  if (panelId === 'edit-tab')    renderMenuEdit();
  if (panelId === 'user-tab')    renderUserList();
  if (panelId === 'myorder-tab') {
    document.getElementById('week-label-myorder').textContent = weekRangeLabel(currentWeekOffset);
    document.getElementById('myorder-result').innerHTML = '';
  }
}

function changeWeek(delta) {
  currentWeekOffset += delta;
  refreshAll();
}

function showLoading(flag, msg) {
  document.getElementById('loading-overlay').style.display = flag ? 'flex' : 'none';
  if (msg) document.getElementById('loading-msg').textContent = msg;
}

// =============================================
// 締切バナー
// =============================================

function renderDeadlineBanner() {
  const banner = document.getElementById('deadline-banner');
  if (!banner || currentWeekOffset !== 0) { if (banner) banner.innerHTML = ''; return; }

  const now = new Date();
  const dates = getWeekDates(0);
  const lastDeadline = new Date(dates[5]);
  lastDeadline.setDate(dates[5].getDate() - 1);
  lastDeadline.setHours(DEADLINE_HOUR, 0, 0, 0);

  if (now > lastDeadline) {
    banner.innerHTML = '<div class="deadline-banner danger">⛔ 今週の注文受付は終了しました</div>';
    return;
  }

  let nextDeadlineDate = null;
  for (let i = 0; i < dates.length; i++) {
    const dl = new Date(dates[i]);
    dl.setDate(dates[i].getDate() - 1);
    dl.setHours(DEADLINE_HOUR, 0, 0, 0);
    if (now <= dl) { nextDeadlineDate = { date: dates[i], deadline: dl }; break; }
  }

  if (!nextDeadlineDate) { banner.innerHTML = ''; return; }

  const diffMs = nextDeadlineDate.deadline - now;
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffH / 24);
  let cls, msg;

  if (diffH < 3) {
    cls = 'danger';
    msg = '⚠️ まもなく締切！' + formatDateLabel(nextDeadlineDate.date) + 'の注文は' + diffH + '時間以内に！';
  } else if (diffD < 1) {
    cls = 'warning';
    msg = '🕐 ' + formatDateLabel(nextDeadlineDate.date) + 'の締切は本日' + DEADLINE_HOUR + '時です';
  } else {
    cls = 'safe';
    msg = '📅 今週の注文受付中（各日とも前日' + DEADLINE_HOUR + '時まで）';
  }
  banner.innerHTML = '<div class="deadline-banner ' + cls + '">' + msg + '</div>';
}

// =============================================
// 献立グリッド
// =============================================

function renderMenuGrid() {
  document.getElementById('week-label').textContent = weekRangeLabel(currentWeekOffset);
  renderDeadlineBanner();
  document.getElementById('menu-grid').innerHTML = getWeekDates(currentWeekOffset).map(function(d) {
    const key = dateKey(d);
    const menu = getMenu(key);
    const dayIdx = d.getDay();
    if (!menu) {
      return '<div class="menu-card no-menu"><div class="menu-card-header">' +
        '<div class="menu-date-badge"><div class="menu-date-day ' + DAY_CLASSES[dayIdx] + '">' + DAY_NAMES[dayIdx] + '</div><div class="menu-date-num">' + d.getDate() + '</div></div>' +
        '<div class="menu-info"><div class="menu-name" style="color:var(--text-light)">献立未登録</div></div>' +
        '</div></div>';
    }
    const noteTag = menu.note ? '<div class="menu-card-body"><span class="menu-note">📌 ' + menu.note + '</span></div>' : '';
    return '<div class="menu-card" onclick="selectDate(\'' + key + '\')">' +
      '<div class="select-indicator">✓ 選択中</div>' +
      '<div class="menu-card-header">' +
        '<div class="menu-date-badge"><div class="menu-date-day ' + DAY_CLASSES[dayIdx] + '">' + DAY_NAMES[dayIdx] + '</div><div class="menu-date-num">' + d.getDate() + '</div></div>' +
        '<div class="menu-info"><div class="menu-name">' + menu.name + '</div><div class="menu-sub">' + formatDateLabel(d) + '</div></div>' +
      '</div>' + noteTag + '</div>';
  }).join('');
}

function selectDate(key) {
  showPanel('order-tab');
  document.getElementById('user-tabs').querySelectorAll('.tab-btn').forEach(function(b, i) { b.classList.toggle('active', i === 1); });
  selectPattern('single', document.querySelectorAll('.pattern-btn')[0]);
  setTimeout(function() { document.getElementById('single-date').value = key; renderOrderPreview(); }, 50);
}

// =============================================
// 注文フォーム
// =============================================

function updateSingleDateSelect() {
  const sel = document.getElementById('single-date');
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">日付を選んでください</option>';
  getWeekDates(currentWeekOffset).forEach(function(d) {
    const key = dateKey(d);
    const menu = getMenu(key);
    if (menu) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = formatDateLabel(d) + '　' + menu.name;
      if (key === currentVal) opt.selected = true;
      sel.appendChild(opt);
    }
  });
}

function selectPattern(pattern, btn) {
  currentPattern = pattern;
  document.querySelectorAll('.pattern-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  document.getElementById('single-date-wrap').style.display = pattern === 'single' ? 'block' : 'none';
  document.getElementById('custom-days-wrap').style.display = pattern === 'custom' ? 'block' : 'none';
  renderOrderPreview();
}

function getOrderDates() {
  const dates = getWeekDates(currentWeekOffset);
  if (currentPattern === 'single') {
    const key = document.getElementById('single-date').value;
    return key ? dates.filter(function(d) { return dateKey(d) === key; }) : [];
  }
  if (currentPattern === 'weekdays')     return dates.filter(function(d) { return d.getDay() >= 1 && d.getDay() <= 5; });
  if (currentPattern === 'weekdays-sat') return dates.filter(function(d) { return d.getDay() >= 1 && d.getDay() <= 6; });
  if (currentPattern === 'custom') {
    const checked = Array.from(document.querySelectorAll('.weekday-check:checked')).map(function(c) { return parseInt(c.value); });
    return dates.filter(function(d) { return checked.includes(d.getDay()); });
  }
  return [];
}

function renderOrderPreview() {
  const targetDates = getOrderDates().filter(function(d) { return getMenu(dateKey(d)); });
  const preview = document.getElementById('order-preview');
  if (targetDates.length === 0) { preview.innerHTML = ''; return; }
  preview.innerHTML = '<div class="section-title" style="margin-bottom:10px">📋 注文対象の献立</div>' +
    '<div class="menu-grid">' + targetDates.map(function(d) {
      const key = dateKey(d);
      const menu = getMenu(key);
      const dayIdx = d.getDay();
      return '<div class="menu-card selected" style="cursor:default">' +
        '<div class="select-indicator">対象</div>' +
        '<div class="menu-card-header">' +
          '<div class="menu-date-badge"><div class="menu-date-day ' + DAY_CLASSES[dayIdx] + '">' + DAY_NAMES[dayIdx] + '</div><div class="menu-date-num">' + d.getDate() + '</div></div>' +
          '<div class="menu-info"><div class="menu-name">' + menu.name + '</div><div class="menu-sub">' + formatDateLabel(d) + '</div></div>' +
        '</div></div>';
    }).join('') + '</div>';
}

function submitOrder() {
  const name = document.getElementById('order-name').value;
  if (!name) { showToast('名前を選んでください', 'error'); return; }
  const targetDates = getOrderDates().filter(function(d) { return getMenu(dateKey(d)); });
  if (targetDates.length === 0) { showToast('注文する日を選んでください', 'error'); return; }
  const isOrder = document.getElementById('status-yes').checked;
  const riceEl = document.querySelector('input[name="rice"]:checked');
  const rice = isOrder ? (riceEl ? riceEl.value : '普通') : '';
  const note = document.getElementById('order-note').value.trim();

  showLoading(true, '注文を送信中...');
  Promise.all(targetDates.map(function(d) {
    return apiPost({ action: 'saveOrder', date: dateKey(d), name: name, status: isOrder ? '注文する' : '注文しない', rice: rice, note: note });
  })).then(function() {
    showLoading(false);
    showToast(targetDates.length + '日分の注文を登録しました ✓', 'success');
    renderOrderPreview();
    document.getElementById('myorder-name').value = name;
  }).catch(function() {
    showLoading(false);
    showToast('注文の登録に失敗しました', 'error');
  });
}

// =============================================
// 自分の注文確認
// =============================================

function searchMyOrders() {
  const name = document.getElementById('myorder-name').value;
  if (!name) { showToast('名前を選んでください', 'error'); return; }

  showLoading(true, '注文を検索中...');
  apiGet({ action: 'getOrders', week: weekPrefix(currentWeekOffset) }).then(function(data) {
    showLoading(false);
    const result = document.getElementById('myorder-result');
    const dates = getWeekDates(currentWeekOffset);
    const found = [];
    dates.forEach(function(d) {
      const key = dateKey(d);
      const orders = data[key] || [];
      const myOrder = orders.find(function(o) { return o.name === name; });
      if (myOrder) found.push({ date: d, order: myOrder });
    });

    if (found.length === 0) {
      result.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>「' + name + '」さんの注文が見つかりませんでした</p></div>';
      return;
    }

    result.innerHTML = '<div class="section-title" style="margin-bottom:12px">📋 ' + name + ' さんの注文</div>' +
      found.map(function(item) {
        const d = item.date;
        const o = item.order;
        const dayIdx = d.getDay();
        const menu = getMenu(dateKey(d));
        return '<div class="myorder-card">' +
          '<div class="myorder-header">' +
            '<div class="menu-date-badge"><div class="menu-date-day ' + DAY_CLASSES[dayIdx] + '">' + DAY_NAMES[dayIdx] + '</div><div class="menu-date-num">' + d.getDate() + '</div></div>' +
            '<div class="menu-info"><div class="menu-name">' + (menu ? menu.name : formatDateLabel(d)) + '</div><div class="menu-sub">' + formatDateLabel(d) + '</div></div>' +
            '<span class="order-row-badge ' + (o.status === '注文する' ? 'badge-yes' : 'badge-no') + '">' + o.status + '</span>' +
          '</div>' +
          '<div class="myorder-body">' +
            (o.status === '注文する' ? '<div class="myorder-row"><span class="myorder-label">ご飯の量</span><span>🍚 ' + (o.rice || '普通') + '</span></div>' : '') +
            (o.note ? '<div class="myorder-row"><span class="myorder-label">備考</span><span>📝 ' + o.note + '</span></div>' : '') +
          '</div></div>';
      }).join('');
  }).catch(function() {
    showLoading(false);
    showToast('検索に失敗しました', 'error');
  });
}

// =============================================
// スタッフ：献立編集
// =============================================

function renderMenuEdit() {
  document.getElementById('week-label-staff').textContent = weekRangeLabel(currentWeekOffset);
  document.getElementById('menu-edit-list').innerHTML = getWeekDates(currentWeekOffset).map(function(d) {
    const key = dateKey(d);
    const menu = getMenu(key) || { name: '', note: '' };
    const dayIdx = d.getDay();
    return '<div class="menu-edit-card" id="edit-card-' + key + '">' +
      '<div class="edit-date-label"><span class="menu-date-day ' + DAY_CLASSES[dayIdx] + '" style="padding:3px 8px;border-radius:6px;font-size:12px">' + DAY_NAMES[dayIdx] + '</span>' + formatDateLabel(d) + '</div>' +
      '<div class="edit-fields">' +
        '<div><label class="edit-inner-label">メニュー名</label><input class="form-input" type="text" id="edit-name-' + key + '" value="' + menu.name + '" placeholder="メニュー名" oninput="markEdited(\'' + key + '\')"></div>' +
        '<div><label class="edit-inner-label">備考</label><input class="form-input" type="text" id="edit-note-' + key + '" value="' + menu.note + '" placeholder="特記事項" oninput="markEdited(\'' + key + '\')"></div>' +
        '<button class="save-btn" onclick="saveMenuSingle(\'' + key + '\')">💾 この日だけ保存</button>' +
      '</div></div>';
  }).join('');
}

function markEdited(key) { document.getElementById('edit-card-' + key).classList.add('edited'); }

function saveMenuSingle(key) {
  const name = document.getElementById('edit-name-' + key).value.trim();
  const note = document.getElementById('edit-note-' + key).value.trim();
  if (!name) { showToast('メニュー名を入力してください', 'error'); return; }
  showLoading(true, '保存中...');
  apiPost({ action: 'saveMenu', date: key, name: name, price: FIXED_PRICE, note: note }).then(function() {
    menuCache[key] = { name: name, price: FIXED_PRICE, note: note };
    document.getElementById('edit-card-' + key).classList.remove('edited');
    showLoading(false);
    showToast(formatDateLabel(new Date(key + 'T00:00:00')) + ' の献立を保存しました ✓', 'success');
    updateSingleDateSelect();
    renderMenuGrid();
  }).catch(function() { showLoading(false); showToast('保存に失敗しました', 'error'); });
}

function copyLastWeek() {
  const thisDates = getWeekDates(currentWeekOffset);
  const lastDates = getWeekDates(currentWeekOffset - 1);
  let copied = 0;
  thisDates.forEach(function(d, i) {
    const lastKey = dateKey(lastDates[i]);
    const thisKey = dateKey(d);
    const lastMenu = menuCache[lastKey];
    if (lastMenu) {
      const nameEl = document.getElementById('edit-name-' + thisKey);
      const noteEl = document.getElementById('edit-note-' + thisKey);
      if (nameEl) nameEl.value = lastMenu.name;
      if (noteEl) noteEl.value = lastMenu.note;
      markEdited(thisKey);
      copied++;
    }
  });
  if (copied > 0) {
    showToast(copied + '日分をコピーしました（まだ保存されていません）', 'success');
  } else {
    showToast('前の週の献立データがありません', 'error');
  }
}

function saveMenuBulk() {
  const dates = getWeekDates(currentWeekOffset);
  const menus = dates.map(function(d) {
    const key = dateKey(d);
    return { date: key, name: (document.getElementById('edit-name-' + key) || {}).value || '', price: FIXED_PRICE, note: (document.getElementById('edit-note-' + key) || {}).value || '' };
  }).filter(function(m) { return m.name.trim() !== ''; });

  if (menus.length === 0) { showToast('メニュー名が入力されていません', 'error'); return; }
  showLoading(true, '1週間分を保存中...');
  apiPost({ action: 'saveMenuBulk', menus: menus }).then(function() {
    menus.forEach(function(m) {
      menuCache[m.date] = { name: m.name, price: FIXED_PRICE, note: m.note };
      var card = document.getElementById('edit-card-' + m.date);
      if (card) card.classList.remove('edited');
    });
    showLoading(false);
    showToast(menus.length + '日分をまとめて保存しました ✓', 'success');
    updateSingleDateSelect();
    renderMenuGrid();
  }).catch(function() { showLoading(false); showToast('保存に失敗しました', 'error'); });
}

// =============================================
// スタッフ：注文確認＋集計
// =============================================

function renderOrderCheck() {
  document.getElementById('week-label-check').textContent = weekRangeLabel(currentWeekOffset);
  const dates = getWeekDates(currentWeekOffset);
  let totalOrders = 0;
  const peopleSet = {};
  let daysWithOrders = 0;

  // 曜日別・利用者別カウント
  const weekdayCounts = {};
  const userCounts = {};

  const html = dates.map(function(d) {
    const key = dateKey(d);
    const menu = getMenu(key);
    const orders = getOrdersForDate(key);
    const yesOrders = orders.filter(function(o) { return o.status === '注文する'; });
    if (orders.length === 0 && !menu) return '';

    if (yesOrders.length > 0) {
      daysWithOrders++;
      totalOrders += yesOrders.length;
      const dayName = DAY_NAMES[d.getDay()];
      weekdayCounts[dayName] = (weekdayCounts[dayName] || 0) + yesOrders.length;
      yesOrders.forEach(function(o) {
        peopleSet[o.name] = true;
        userCounts[o.name] = (userCounts[o.name] || 0) + 1;
      });
    }

    const dayIdx = d.getDay();
    const menuName = menu ? '　<span style="font-size:12px;color:var(--text-light)">' + menu.name + '</span>' : '';
    const rows = orders.length === 0
      ? '<div style="padding:12px 14px;font-size:13px;color:var(--text-light)">注文データなし</div>'
      : orders.map(function(o) {
          return '<div class="order-row">' +
            '<div class="order-row-name">' + o.name + '</div>' +
            '<span class="order-row-badge ' + (o.status === '注文する' ? 'badge-yes' : 'badge-no') + '">' + o.status + '</span>' +
            (o.rice ? '<span class="order-row-rice">🍚' + o.rice + '</span>' : '') +
            (o.note ? '<div class="order-row-note" title="' + o.note + '">📝' + o.note + '</div>' : '') +
          '</div>';
        }).join('');

    return '<div class="order-day-block">' +
      '<div class="order-day-header" onclick="toggleDayBody(this)">' +
        '<div class="order-day-title"><span class="menu-date-day ' + DAY_CLASSES[dayIdx] + '" style="padding:2px 7px;border-radius:5px;font-size:12px;margin-right:6px">' + DAY_NAMES[dayIdx] + '</span>' + formatDateLabel(d) + menuName + '</div>' +
        '<span class="order-day-count">' + yesOrders.length + '人</span>' +
      '</div>' +
      '<div class="order-day-body">' + rows + '</div>' +
    '</div>';
  }).filter(Boolean).join('');

  document.getElementById('order-check-list').innerHTML = html ||
    '<div class="empty-state"><div class="icon">📭</div><p>この週の注文データはありません</p></div>';
  document.getElementById('stat-total').textContent = totalOrders;
  document.getElementById('stat-people').textContent = Object.keys(peopleSet).length;
  document.getElementById('stat-days').textContent = daysWithOrders;

  // 曜日別集計レンダリング
  const weekdayOrder = ['月','火','水','木','金','土'];
  document.getElementById('weekday-stats').innerHTML = weekdayOrder.map(function(day, i) {
    const count = weekdayCounts[day] || 0;
    const dayClass = ['day-mon','day-tue','day-wed','day-thu','day-fri','day-sat'][i];
    return '<div class="weekday-stat-card">' +
      '<div class="weekday-stat-day ' + dayClass + '">' + day + '</div>' +
      '<div class="weekday-stat-num">' + count + '</div>' +
      '<div class="weekday-stat-label">人</div>' +
    '</div>';
  }).join('');

  // 利用者別集計レンダリング
  const maxCount = Math.max.apply(null, Object.values(userCounts).concat([1]));
  const userRows = Object.keys(userCounts).sort(function(a, b) {
    return userCounts[b] - userCounts[a];
  });

  if (userRows.length === 0) {
    document.getElementById('user-stats').innerHTML = '<div style="padding:16px;color:var(--text-light);font-size:13px;text-align:center">注文データがありません</div>';
  } else {
    document.getElementById('user-stats').innerHTML = '<div class="user-stats">' +
      userRows.map(function(name) {
        const count = userCounts[name];
        const user = userCache.find(function(u) { return u.name === name; });
        const group = user ? user.group : '';
        const pct = Math.round(count / maxCount * 100);
        return '<div class="user-stat-row">' +
          '<div style="flex:1">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
              '<span class="user-stat-name">' + name + '</span>' +
              (group ? '<span class="user-stat-group">' + group + '</span>' : '') +
            '</div>' +
            '<div class="user-stat-bar"><div class="user-stat-bar-fill" style="width:' + pct + '%"></div></div>' +
          '</div>' +
          '<div class="user-stat-count">' + count + '回</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }
}

function toggleDayBody(header) {
  const body = header.nextElementSibling;
  body.style.display = body.style.display === 'none' ? 'block' : 'none';
}

// =============================================
// スタッフ：利用者管理
// =============================================

function renderUserList() {
  const list = document.getElementById('user-list');
  if (userCache.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="icon">👥</div><p>利用者が登録されていません</p></div>';
    return;
  }
  list.innerHTML = '<div class="user-list-card">' +
    userCache.map(function(u) {
      return '<div class="user-list-row">' +
        '<div class="user-list-name">' + u.name + '</div>' +
        (u.group ? '<span class="user-list-group">' + u.group + '</span>' : '') +
        '<button class="user-delete-btn" onclick="openDeleteModal(\'' + u.name + '\')">削除</button>' +
      '</div>';
    }).join('') +
  '</div>';
}

function addUser() {
  const name = document.getElementById('new-user-name').value.trim();
  const group = document.getElementById('new-user-group').value.trim();
  if (!name) { showToast('氏名を入力してください', 'error'); return; }

  showLoading(true, '追加中...');
  apiPost({ action: 'saveUser', name: name, group: group }).then(function() {
    showLoading(false);
    document.getElementById('new-user-name').value = '';
    document.getElementById('new-user-group').value = '';
    showToast(name + ' さんを追加しました ✓', 'success');
    return loadUsers();
  }).then(function() {
    renderUserList();
  }).catch(function() {
    showLoading(false);
    showToast('追加に失敗しました', 'error');
  });
}

function openDeleteModal(name) {
  deleteTargetName = name;
  document.getElementById('delete-modal-body').textContent = '「' + name + '」さんを削除しますか？';
  document.getElementById('delete-modal').classList.add('open');
}

function closeDeleteModal() {
  document.getElementById('delete-modal').classList.remove('open');
  deleteTargetName = '';
}

function confirmDeleteUser() {
  if (!deleteTargetName) return;
  showLoading(true, '削除中...');
  apiPost({ action: 'deleteUser', name: deleteTargetName }).then(function() {
    showLoading(false);
    closeDeleteModal();
    showToast('削除しました', 'success');
    return loadUsers();
  }).then(function() {
    renderUserList();
  }).catch(function() {
    showLoading(false);
    showToast('削除に失敗しました', 'error');
  });
}

// =============================================
// リセット・モーダル
// =============================================

function confirmReset() { document.getElementById('modal').classList.add('open'); }
function closeModal()    { document.getElementById('modal').classList.remove('open'); }

function resetOrders() {
  const dates = getWeekDates(currentWeekOffset).map(dateKey);
  showLoading(true, '削除中...');
  apiPost({ action: 'resetOrders', dates: dates }).then(function() {
    orderCache = {};
    showLoading(false);
    closeModal();
    renderOrderCheck();
    showToast('注文データをリセットしました', 'success');
  }).catch(function() { showLoading(false); showToast('リセットに失敗しました', 'error'); });
}

// =============================================
// トースト
// =============================================

let toastTimer;
function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { t.className = 'toast'; }, 3500);
}

// =============================================
// 全体リフレッシュ・初期化
// =============================================

function refreshAll() {
  const label = weekRangeLabel(currentWeekOffset);
  ['week-label','week-label-staff','week-label-check','week-label-myorder'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  });
  loadMenus().then(function() {
    renderMenuGrid();
    updateSingleDateSelect();
    renderOrderPreview();
    if (currentMode === 'staff') {
      renderMenuEdit();
      loadOrders().then(renderOrderCheck);
    }
  });
}

document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('input[name="order-status"]').forEach(function(r) {
    r.addEventListener('change', function() {
      document.getElementById('rice-row').style.display =
        document.getElementById('status-yes').checked ? 'block' : 'none';
      renderOrderPreview();
    });
  });
  document.getElementById('single-date').addEventListener('change', renderOrderPreview);
  document.querySelectorAll('.weekday-check').forEach(function(cb) {
    cb.addEventListener('change', renderOrderPreview);
  });
  document.getElementById('modal').addEventListener('click', function(e) { if (e.target === this) closeModal(); });
  document.getElementById('pw-modal').addEventListener('click', function(e) { if (e.target === this) closePwModal(); });
  document.getElementById('delete-modal').addEventListener('click', function(e) { if (e.target === this) closeDeleteModal(); });
  document.getElementById('myorder-name').addEventListener('change', function() {
    if (this.value) searchMyOrders();
  });

  loadUsers().then(function() {
    refreshAll();
  });
});