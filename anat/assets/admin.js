(function () {
  const S = window.AnatStore;
  let db = S.load();
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DAY = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const DAY_S = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  const MON = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const STATUS = { pending: 'ממתין לאישור', approved: 'מאושר', done: 'הושלם', rejected: 'נדחה', cancelled: 'בוטל' };
  const METHODS = [['אשראי', '💳'], ['ביט', '📱'], ['מזומן', '💵'], ['פייבוקס', '🔷']];
  const ils = n => '₪' + Math.round(n).toLocaleString('he-IL');
  const today = () => S.iso(new Date());
  const d = s => new Date(s + 'T00:00:00');
  const fmt = s => { const x = d(s); return `${DAY_S[x.getDay()]} ${x.getDate()}/${x.getMonth() + 1}`; };
  const fmtLong = s => { const x = d(s); return `יום ${DAY[x.getDay()]}, ${x.getDate()} ב${MON[x.getMonth()]} ${x.getFullYear()}`; };
  const svc = id => db.services.find(s => s.id === id) || { name: id, price: 0, duration: 60 };
  const badge = st => `<span class="badge st-${st}">${STATUS[st]}</span>`;
  const initials = n => n.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('');
  const paidOf = b => db.payments.filter(p => p.bookingId === b.id).reduce((a, p) => a + (p.type === 'refund' ? -p.amount : p.amount), 0);
  const save = () => { S.save(); render(); };

  /* ===== toast & modal ===== */
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = msg;
    $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3200);
  }
  function modal(title, body, foot) {
    $('#modal').innerHTML = `<div class="modal-hd"><h3>${title}</h3><button class="x" data-close>✕</button></div><div class="modal-bd">${body}</div>${foot ? `<div class="modal-ft">${foot}</div>` : ''}`;
    $('#modalBg').classList.add('open');
    $$('[data-close]').forEach(b => b.onclick = closeModal);
  }
  function closeModal() { $('#modalBg').classList.remove('open'); }
  $('#modalBg').addEventListener('mousedown', e => { if (e.target.id === 'modalBg') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  /* ===== login ===== */
  try { if (sessionStorage.getItem('anat-admin')) $('#login').classList.add('hide'); } catch (e) { /* ignore */ }
  $('#loginForm').onsubmit = e => {
    e.preventDefault();
    try { sessionStorage.setItem('anat-admin', '1'); } catch (er) { /* ignore */ }
    $('#login').classList.add('hide');
    const p = db.bookings.filter(b => b.status === 'pending').length;
    toast(`בוקר טוב ענת 💕 ${p ? `יש לך ${p} בקשות שממתינות לאישור` : ''}`);
  };
  $('#logoutBtn').onclick = () => { try { sessionStorage.removeItem('anat-admin'); } catch (e) { /* ignore */ } $('#login').classList.remove('hide'); };
  $('#resetBtn').onclick = () => {
    modal('איפוס נתוני הדמו', '<p>כל ההזמנות, התשלומים וההגדרות יחזרו למצב ההתחלתי. להמשיך?</p>', '<button class="btn btn-bad" id="doReset">כן, לאפס</button><button class="btn btn-ghost" data-close>ביטול</button>');
    $('#doReset').onclick = () => { db = S.reset(); closeModal(); render(); toast('הנתונים אופסו ✓'); };
  };

  /* ===== navigation ===== */
  const TITLES = { dash: 'לוח בקרה', bookings: 'הזמנות', calendar: 'יומן', avail: 'זמינות וחופשות', payments: 'תשלומים', clients: 'לקוחות', services: 'טיפולים ומחירים' };
  let page = 'dash';
  function goto(p) {
    page = p;
    $$('.navbtn[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === p));
    $$('.page').forEach(s => s.classList.toggle('active', s.id === 'page-' + p));
    $('#pageTitle').textContent = TITLES[p];
    render();
    window.scrollTo({ top: 0 });
  }
  $$('.navbtn[data-page]').forEach(b => b.onclick = () => goto(b.dataset.page));
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-goto]'); if (!g) return;
    e.preventDefault(); if (g.dataset.filter) { bFilter = g.dataset.filter; bWhen = 'all'; $('#bWhen').value = 'all'; } goto(g.dataset.goto);
  });
  $('#bell').onclick = () => { bFilter = 'pending'; bWhen = 'all'; $('#bWhen').value = 'all'; goto('bookings'); };

  /* ===== booking actions ===== */
  function setStatus(id, st, silent) {
    const b = db.bookings.find(x => x.id === id); if (!b) return;
    b.status = st; b.isNew = false;
    let refunded = 0;
    if (st === 'rejected' || st === 'cancelled') {
      refunded = paidOf(b);
      if (refunded > 0) db.payments.push({ id: S.uid(), bookingId: b.id, name: b.name, amount: refunded, method: 'אשראי', date: today(), type: 'refund' });
    }
    save();
    if (!silent) {
      const msgs = { approved: `✓ התור של ${esc(b.name)} אושר · נשלח SMS ללקוחה`, rejected: `התור של ${esc(b.name)} נדחה · נשלחה הודעה ללקוחה`, done: '✓ הטיפול סומן כהושלם', cancelled: 'התור בוטל · נשלחה הודעה ללקוחה' };
      toast(msgs[st] + (refunded > 0 ? ` · ${ils(refunded)} הוחזרו ללקוחה` : ''));
    }
  }

  function openBooking(id) {
    const b = db.bookings.find(x => x.id === id); if (!b) return;
    if (b.isNew) { b.isNew = false; S.save(); render(); }
    const s = svc(b.service); const paid = paidOf(b);
    const pays = db.payments.filter(p => p.bookingId === b.id);
    const active = b.status === 'pending' || b.status === 'approved';
    const body = `
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px"><span class="av">${esc(initials(b.name))}</span><div><b style="font-size:18px">${esc(b.name)}</b><div style="color:var(--ink-2)">${esc(b.phone)}</div></div><span style="margin-inline-start:auto">${badge(b.status)}</span></div>
      <dl class="detail">
        <dt>טיפול</dt><dd>${esc(s.name)}</dd>
        <dt>מועד</dt><dd>${fmtLong(b.date)} · ${b.time}</dd>
        <dt>משך</dt><dd>${b.duration} דקות (עד ${S.toTime(S.toMin(b.time) + b.duration)})</dd>
        <dt>מחיר</dt><dd>${ils(b.price)}</dd>
        <dt>שולם</dt><dd>${paid > 0 ? `<span class="badge paid">${ils(paid)}</span> ${pays.map(p => `<small style="color:var(--ink-3)">${p.type === 'deposit' ? 'מקדמה' : p.type === 'refund' ? 'החזר' : 'תשלום'} ב${p.method}</small>`).join(' · ')}` : '<span class="badge unpaid">טרם שולם</span>'}</dd>
        <dt>מקור</dt><dd>${esc(b.source || 'אתר')}</dd>
        ${b.notes ? `<dt>הערות</dt><dd>${esc(b.notes)}</dd>` : ''}
        ${b.rejectReason ? `<dt>סיבת דחייה</dt><dd>${esc(b.rejectReason)}</dd>` : ''}
      </dl>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn btn-ghost btn-sm" href="tel:${esc(b.phone)}">📞 חיוג</a>
        <button class="btn btn-ghost btn-sm" id="mWa">💬 וואטסאפ</button>
        ${active ? '<button class="btn btn-ghost btn-sm" id="mRemind">🔔 שליחת תזכורת</button>' : ''}
      </div>`;
    let foot = '';
    if (b.status === 'pending') foot = '<button class="btn btn-ok" id="mApprove">✓ אישור התור</button><button class="btn btn-ghost" id="mResched">🕐 הצעת מועד אחר</button><button class="btn btn-bad" id="mReject">✕ דחייה</button>';
    else if (b.status === 'approved') foot = `<button class="btn btn-primary" id="mCharge">💳 גבייה</button><button class="btn btn-ok" id="mDone">✓ הושלם</button><button class="btn btn-ghost" id="mResched">🕐 שינוי מועד</button><button class="btn btn-bad" id="mCancel">ביטול תור</button>`;
    else if (b.status === 'done' && paid < b.price) foot = '<button class="btn btn-primary" id="mCharge">💳 גביית יתרה</button>';
    modal('פרטי התור', body, foot);
    const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
    on('#mApprove', () => { setStatus(b.id, 'approved'); closeModal(); });
    on('#mDone', () => { setStatus(b.id, 'done'); if (paidOf(b) < b.price) openCharge(b.id); else closeModal(); });
    on('#mCancel', () => confirmBox('ביטול התור', `לבטל את התור של ${esc(b.name)}? ${paid > 0 ? 'המקדמה תוחזר ללקוחה.' : ''}`, () => setStatus(b.id, 'cancelled')));
    on('#mReject', () => openReject(b.id));
    on('#mResched', () => openReschedule(b.id));
    on('#mCharge', () => openCharge(b.id));
    on('#mWa', () => toast('💬 בגרסה האמיתית — נפתח צ׳אט וואטסאפ עם הלקוחה'));
    on('#mRemind', () => toast(`🔔 נשלחה תזכורת SMS ל${esc(b.name)}`));
  }

  function confirmBox(title, text, fn) {
    modal(title, `<p>${text}</p>`, '<button class="btn btn-bad" id="cfYes">כן</button><button class="btn btn-ghost" data-close>חזרה</button>');
    $('#cfYes').onclick = () => { fn(); closeModal(); };
  }

  function openReject(id) {
    const b = db.bookings.find(x => x.id === id);
    modal('דחיית בקשה', `<p>הלקוחה תקבל הודעה על הדחייה.</p>
      <div class="field"><label>סיבה (תישלח ללקוחה)</label><select id="rjReason"><option>המועד כבר לא פנוי, אשמח לתאם מועד אחר</option><option>הסטודיו סגור במועד זה</option><option>הטיפול המבוקש אינו זמין כרגע</option><option>אחר</option></select></div>
      <div class="field"><label>הודעה אישית (לא חובה)</label><textarea id="rjMsg" rows="2" placeholder="היי, מצטערת…"></textarea></div>`,
    '<button class="btn btn-bad" id="rjGo">דחיית הבקשה</button><button class="btn btn-ghost" data-close>ביטול</button>');
    $('#rjGo').onclick = () => { b.rejectReason = $('#rjReason').value; setStatus(id, 'rejected'); closeModal(); };
  }

  function slotPicker(serviceId, ignoreId, initDate, initTime, onPick) {
    return {
      html: `<div class="row2"><div class="field"><label>תאריך</label><input type="date" id="spDate" value="${initDate}" min="${today()}"></div><div class="field"><label>טיפול</label><select id="spSvc">${db.services.map(s => `<option value="${s.id}" ${s.id === serviceId ? 'selected' : ''}>${esc(s.name)} · ${s.duration} דק׳</option>`).join('')}</select></div></div>
        <label style="font-size:13.5px;font-weight:500;color:var(--ink-2)">שעה פנויה</label><div id="spInfo"></div><div class="slot-pick" id="spSlots"></div>`,
      bind() {
        let sel = initTime;
        const draw = () => {
          const date = $('#spDate').value; const sv = $('#spSvc').value;
          const v = S.isVacation(date);
          const sl = date ? S.availableSlots(date, sv, ignoreId) : [];
          $('#spInfo').innerHTML = v ? `<div class="callout warn">🌴 ${esc(v.reason)} — הסטודיו סגור</div>` : (!sl.length && date ? '<div class="callout">אין שעות פנויות ביום זה (או שהסטודיו סגור)</div>' : '');
          if (!sl.includes(sel)) sel = null;
          $('#spSlots').innerHTML = sl.map(t => `<button type="button" data-t="${t}" class="${t === sel ? 'sel' : ''}">${t}</button>`).join('');
          $$('#spSlots button').forEach(x => x.onclick = () => { sel = x.dataset.t; draw(); });
          onPick(date, sel, sv);
        };
        $('#spDate').onchange = draw; $('#spSvc').onchange = draw; draw();
      }
    };
  }

  function openReschedule(id) {
    const b = db.bookings.find(x => x.id === id);
    const pick = { date: b.date, time: null, svc: b.service };
    const sp = slotPicker(b.service, b.id, b.date >= today() ? b.date : today(), b.time, (date, time, sv) => { pick.date = date; pick.time = time; pick.svc = sv; const g = $('#rsGo'); if (g) g.disabled = !time; });
    modal('שינוי מועד', `<div class="callout">מועד נוכחי: <b>${fmtLong(b.date)} · ${b.time}</b></div>${sp.html}`, '<button class="btn btn-primary" id="rsGo" disabled>עדכון ושליחת הודעה ללקוחה</button><button class="btn btn-ghost" data-close>ביטול</button>');
    sp.bind();
    $('#rsGo').disabled = !pick.time;
    $('#rsGo').onclick = () => {
      const s = svc(pick.svc);
      Object.assign(b, { date: pick.date, time: pick.time, service: s.id, duration: s.duration, price: s.price, status: 'approved', isNew: false });
      save(); closeModal(); toast(`🕐 התור עודכן ל${fmt(b.date)} ב-${b.time} · נשלח SMS ל${esc(b.name)}`);
    };
  }

  function openNewBooking(date, time) {
    const pick = { date: date || today(), time: time || null, svc: db.services[0].id };
    const sp = slotPicker(pick.svc, null, pick.date, pick.time, (dt, t, sv) => { pick.date = dt; pick.time = t; pick.svc = sv; });
    modal('תור חדש', `<div class="row2"><div class="field"><label>שם הלקוחה *</label><input id="nbName" list="clientNames" placeholder="שם מלא"><datalist id="clientNames">${clients().map(c => `<option value="${esc(c.name)}">`).join('')}</datalist></div><div class="field"><label>טלפון *</label><input id="nbPhone" placeholder="050-0000000"></div></div>${sp.html}<div class="field"><label>הערות</label><input id="nbNotes"></div>`,
      '<button class="btn btn-primary" id="nbGo">שמירת התור</button><button class="btn btn-ghost" data-close>ביטול</button>');
    sp.bind();
    $('#nbName').oninput = () => { const c = clients().find(x => x.name === $('#nbName').value); if (c) $('#nbPhone').value = c.phone; };
    $('#nbGo').onclick = () => {
      const name = $('#nbName').value.trim(), phone = $('#nbPhone').value.trim();
      if (!name || !phone) { toast('נא למלא שם וטלפון'); return; }
      if (!pick.time) { toast('נא לבחור שעה פנויה'); return; }
      const b = S.addBooking({ name, phone, service: pick.svc, date: pick.date, time: pick.time, notes: $('#nbNotes').value, source: 'ידני' });
      b.status = 'approved'; b.isNew = false;
      save(); closeModal(); toast(`✓ נקבע תור ל${esc(name)} · ${fmt(b.date)} ${b.time}`);
    };
  }
  $('#newBookingBtn').onclick = () => openNewBooking();

  function openCharge(id) {
    const b = db.bookings.find(x => x.id === id);
    const due = Math.max(0, b.price - paidOf(b));
    let method = 'אשראי';
    modal('גביית תשלום', `
      <div class="callout">${esc(b.name)} · ${esc(svc(b.service).name)} · מחיר ${ils(b.price)}${paidOf(b) ? ` · שולם ${ils(paidOf(b))}` : ''}</div>
      <div class="field"><label>סכום לגבייה (₪)</label><input type="number" id="chAmt" value="${due}" min="1"></div>
      <label style="font-size:13.5px;font-weight:500;color:var(--ink-2)">אמצעי תשלום</label>
      <div class="methods" style="margin-top:6px">${METHODS.map(([m, i]) => `<button type="button" data-m="${m}" class="${m === method ? 'sel' : ''}"><span>${i}</span>${m}</button>`).join('')}</div>
      <div class="field"><label>טיפ (לא חובה)</label><input type="number" id="chTip" value="0" min="0"></div>
      <p style="font-size:13px;color:var(--ink-3);margin:0">🔒 מצב דמו — לא מתבצע חיוב אמיתי. בגרסה המלאה: חיבור לסליקה (משולם / טרנזילה / Grow) והפקת קבלה אוטומטית.</p>`,
    '<button class="btn btn-primary" id="chGo">גבייה</button><button class="btn btn-ghost" data-close>ביטול</button>');
    $$('.methods button').forEach(x => x.onclick = () => { method = x.dataset.m; $$('.methods button').forEach(y => y.classList.toggle('sel', y === x)); });
    $('#chGo').onclick = () => {
      const amt = +$('#chAmt').value, tip = +$('#chTip').value || 0;
      if (!(amt > 0)) { toast('סכום לא תקין'); return; }
      $('#chGo').disabled = true; $('#chGo').innerHTML = '<span class="spinner"></span> מעבד…';
      setTimeout(() => {
        const rc = 10240 + db.payments.length;
        db.payments.push({ id: S.uid(), bookingId: b.id, name: b.name, amount: amt + tip, method, date: today(), type: 'charge', receipt: rc });
        if (b.status === 'approved' && b.date <= today()) b.status = 'done';
        save();
        modal('התשלום התקבל', `<div class="receipt"><div class="ok">✓</div><h3 style="font-size:26px">${ils(amt + tip)}</h3><p style="color:var(--ink-2)">${method} · ${esc(b.name)}${tip ? ` · כולל טיפ ${ils(tip)} 💕` : ''}</p><div class="callout">קבלה מס׳ ${rc} נשלחה ללקוחה ב-SMS</div></div>`, '<button class="btn btn-primary" data-close>סגירה</button>');
      }, 1300);
    };
  }

  /* ===== RENDER ===== */
  function render() {
    db = S.load();
    const pend = db.bookings.filter(b => b.status === 'pending').length;
    const fresh = db.bookings.filter(b => b.isNew).length;
    $('#navPending').hidden = !pend; $('#navPending').textContent = pend;
    $('#bellDot').hidden = !fresh; $('#bellDot').textContent = fresh;
    $('#pageSub').textContent = fmtLong(today());
    ({ dash: renderDash, bookings: renderBookings, calendar: renderWeek, avail: renderAvail, payments: renderPayments, clients: renderClients, services: renderServices })[page]();
  }

  function itemRow(b, acts) {
    return `<div class="list-item" data-open="${b.id}" style="cursor:pointer">
      <span class="time">${b.time}</span><span class="av">${esc(initials(b.name))}</span>
      <span class="who"><b>${esc(b.name)}${b.isNew ? '<span class="new-tag">חדש</span>' : ''}</b><small>${esc(svc(b.service).name)}${acts === 'pending' ? ` · ${fmt(b.date)}` : ` · ${b.duration} דק׳`}</small></span>
      <span class="acts">${acts === 'pending' ? `<button class="btn btn-ok btn-sm" data-approve="${b.id}">אישור</button><button class="btn btn-bad btn-sm" data-reject="${b.id}">דחייה</button>` : badge(b.status)}</span></div>`;
  }
  function bindRows(root) {
    root.querySelectorAll('[data-open]').forEach(el => el.onclick = e => { if (!e.target.closest('button')) openBooking(el.dataset.open); });
    root.querySelectorAll('[data-approve]').forEach(el => el.onclick = () => setStatus(el.dataset.approve, 'approved'));
    root.querySelectorAll('[data-reject]').forEach(el => el.onclick = () => openReject(el.dataset.reject));
    root.querySelectorAll('[data-charge]').forEach(el => el.onclick = () => openCharge(el.dataset.charge));
  }

  function revenueByMonth(n) {
    const out = []; const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      const sum = db.payments.filter(p => p.date.startsWith(key)).reduce((a, p) => a + (p.type === 'refund' ? -p.amount : p.amount), 0);
      out.push({ label: MON[m.getMonth()], sum, cur: i === 0 });
    }
    return out;
  }

  function renderDash() {
    const t = today();
    const todays = db.bookings.filter(b => b.date === t && ['approved', 'done', 'pending'].includes(b.status)).sort((a, b) => a.time.localeCompare(b.time));
    const pending = db.bookings.filter(b => b.status === 'pending').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const rev = revenueByMonth(6);
    const cur = rev[5].sum, prev = rev[4].sum;
    const dayOfMonth = new Date().getDate();
    const prevSameDay = (() => { const now = new Date(); const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1); const key = `${pm.getFullYear()}-${String(pm.getMonth() + 1).padStart(2, '0')}`; return db.payments.filter(p => p.date.startsWith(key) && +p.date.slice(8) <= dayOfMonth).reduce((a, p) => a + (p.type === 'refund' ? -p.amount : p.amount), 0); })();
    const delta = prevSameDay ? Math.round((cur - prevSameDay) / prevSameDay * 100) : 0;
    // week occupancy
    let cap = 0, used = 0;
    for (let i = 0; i < 7; i++) {
      const dt = S.addDays(new Date(), i); const h = db.hours[dt.getDay()]; const k = S.iso(dt);
      if (!h.open || S.isVacation(k)) continue;
      cap += S.toMin(h.to) - S.toMin(h.from);
      used += db.bookings.filter(b => b.date === k && ['approved', 'done', 'pending'].includes(b.status)).reduce((a, b) => a + b.duration, 0);
    }
    const occ = cap ? Math.min(100, Math.round(used / cap * 100)) : 0;
    const todayIncome = todays.reduce((a, b) => a + b.price, 0);
    $('#stats').innerHTML = [
      ['📅', 'תורים היום', todays.length, `צפי הכנסה ${ils(todayIncome)}`, ''],
      ['⏳', 'ממתינות לאישור', pending.length, pending.length ? 'כדאי לאשר בהקדם' : 'הכול מטופל ✓', ''],
      ['💰', `הכנסות ${MON[new Date().getMonth()]}`, ils(cur), prevSameDay ? `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% לעומת אותה תקופה בחודש שעבר` : `${MON[(new Date().getMonth() + 11) % 12]}: ${ils(prev)}`, prevSameDay ? (delta >= 0 ? 'up' : 'down') : ''],
      ['📈', 'תפוסה 7 ימים קדימה', occ + '%', `${Math.round(used / 60)} מתוך ${Math.round(cap / 60)} שעות עבודה`, '']
    ].map(([i, l, v, dl, cls]) => `<div class="card stat"><span class="lbl"><i>${i}</i>${l}</span><span class="val">${v}</span><span class="delta ${cls}">${dl}</span></div>`).join('');

    $('#todayLabel').textContent = fmtLong(t);
    const v = S.isVacation(t);
    $('#todayList').innerHTML = v ? `<div class="empty">🌴 ${esc(v.reason)}</div>` : todays.length ? todays.map(b => itemRow(b)).join('') : '<div class="empty">אין תורים היום ☕</div>';
    $('#pendingList').innerHTML = pending.length ? pending.slice(0, 6).map(b => itemRow(b, 'pending')).join('') : '<div class="empty">אין בקשות ממתינות 🎉</div>';
    bindRows($('#page-dash'));

    // revenue bars — single series, one hue; current month emphasised
    const max = Math.max(...rev.map(r => r.sum), 1);
    const nice = Math.ceil(max / 2000) * 2000;
    $('#revChart').innerHTML = `<div class="bars">${[.5, 1].map(f => `<div class="gridline" style="bottom:${f * 100 * (200 - 24) / 200}%"><span>${ils(nice * f)}</span></div>`).join('')}
      ${rev.map(r => `<div class="bar-col${r.cur ? ' cur' : ''}"><span class="tip">${r.label}: ${ils(r.sum)}</span><div class="bar" style="height:${r.sum / nice * 100}%"></div></div>`).join('')}</div>
      <div class="bar-labels">${rev.map(r => `<span>${r.label}${r.cur ? ' (עד היום)' : ''}</span>`).join('')}</div>`;

    const since = S.iso(S.addDays(new Date(), -90));
    const cnt = {}; db.bookings.filter(b => b.date >= since && b.status === 'done').forEach(b => { cnt[b.service] = (cnt[b.service] || 0) + 1; });
    const arr = Object.entries(cnt).sort((a, b) => b[1] - a[1]); const top = arr.length ? arr[0][1] : 1;
    $('#popular').innerHTML = arr.map(([id, n]) => `<div class="hbar"><span>${esc(svc(id).name)}</span><div class="track"><div class="fill" style="width:${n / top * 100}%"></div></div><span class="v">${n} טיפולים</span></div>`).join('') || '<div class="empty">אין נתונים</div>';
  }

  // bookings page
  let bFilter = 'all', bWhen = 'upcoming';
  $('#bSearch').oninput = () => renderBookings();
  $('#bWhen').onchange = e => { bWhen = e.target.value; renderBookings(); };
  function renderBookings() {
    const t = today(); const q = $('#bSearch').value.trim();
    let list = db.bookings.filter(b => bWhen === 'all' || (bWhen === 'upcoming' ? b.date >= t : b.date < t));
    if (q) list = list.filter(b => b.name.includes(q) || b.phone.replace(/-/g, '').includes(q.replace(/-/g, '')));
    const counts = { all: list.length }; Object.keys(STATUS).forEach(k => { counts[k] = list.filter(b => b.status === k).length; });
    $('#statusChips').innerHTML = [['all', 'הכול'], ...Object.entries(STATUS)].map(([k, l]) => `<button class="chip${bFilter === k ? ' active' : ''}" data-f="${k}">${l}<b>${counts[k]}</b></button>`).join('');
    $$('#statusChips .chip').forEach(c => c.onclick = () => { bFilter = c.dataset.f; renderBookings(); });
    if (bFilter !== 'all') list = list.filter(b => b.status === bFilter);
    list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    if (bWhen === 'past') list.reverse();
    // pending + new first
    list.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
    $('#bTable').innerHTML = list.slice(0, 200).map(b => {
      const p = paidOf(b);
      return `<tr data-open="${b.id}">
        <td><div style="display:flex;gap:10px;align-items:center"><span class="av" style="width:32px;height:32px;font-size:13px">${esc(initials(b.name))}</span><div><b>${esc(b.name)}</b>${b.isNew ? '<span class="new-tag">חדש</span>' : ''}<div style="font-size:13px;color:var(--ink-3)">${esc(b.phone)}</div></div></div></td>
        <td>${esc(svc(b.service).name)}</td>
        <td class="num">${fmt(b.date)} · ${b.time}</td>
        <td class="num">${ils(b.price)}</td>
        <td>${badge(b.status)}</td>
        <td>${p >= b.price ? '<span class="badge paid">שולם</span>' : p > 0 ? `<span class="badge paid">מקדמה ${ils(p)}</span>` : '<span class="badge unpaid">—</span>'}</td>
        <td><div class="acts">${b.status === 'pending' ? `<button class="btn btn-ok btn-sm" data-approve="${b.id}">אישור</button><button class="btn btn-bad btn-sm" data-reject="${b.id}">דחייה</button>` : (b.status === 'approved' || b.status === 'done') && p < b.price && b.date <= t ? `<button class="btn btn-primary btn-sm" data-charge="${b.id}">גבייה</button>` : ''}</div></td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="empty">לא נמצאו הזמנות</td></tr>';
    bindRows($('#page-bookings'));
  }

  // week calendar
  let weekStart = (() => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; })();
  $('#wPrev').onclick = () => { weekStart = S.addDays(weekStart, -7); renderWeek(); };
  $('#wNext').onclick = () => { weekStart = S.addDays(weekStart, 7); renderWeek(); };
  $('#wToday').onclick = () => { weekStart = new Date(); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); renderWeek(); };
  function renderWeek() {
    const H0 = 8, H1 = 22, PX = 56; // px per hour
    const end = S.addDays(weekStart, 6);
    $('#wRange').textContent = `${weekStart.getDate()} ${MON[weekStart.getMonth()]} – ${end.getDate()} ${MON[end.getMonth()]} ${end.getFullYear()}`;
    const t = today();
    let html = '<div class="hd"></div>';
    const days = [...Array(7)].map((_, i) => S.addDays(weekStart, i));
    days.forEach(dt => {
      const k = S.iso(dt); const n = db.bookings.filter(b => b.date === k && ['approved', 'pending', 'done'].includes(b.status)).length;
      html += `<div class="hd${k === t ? ' today' : ''}">${DAY[dt.getDay()]}<b>${dt.getDate()}</b><small>${n ? n + ' תורים' : '&nbsp;'}</small></div>`;
    });
    html += `<div class="hours-col" style="height:${(H1 - H0) * PX}px">${[...Array(H1 - H0)].map((_, i) => `<div style="top:${i * PX}px">${String(H0 + i).padStart(2, '0')}:00</div>`).join('')}</div>`;
    days.forEach(dt => {
      const k = S.iso(dt); const h = db.hours[dt.getDay()]; const v = S.isVacation(k);
      let inner = '';
      if (v) inner += `<div class="vac">🌴<br>${esc(v.reason)}</div>`;
      else if (!h.open) inner += `<div class="closed" style="top:0;bottom:0"></div>`;
      else {
        const a = (S.toMin(h.from) - H0 * 60) / 60 * PX, z = (S.toMin(h.to) - H0 * 60) / 60 * PX;
        if (a > 0) inner += `<div class="closed" style="top:0;height:${a}px"></div>`;
        inner += `<div class="closed" style="top:${z}px;bottom:0"></div>`;
      }
      db.bookings.filter(b => b.date === k && ['approved', 'pending', 'done'].includes(b.status)).forEach(b => {
        const top = (S.toMin(b.time) - H0 * 60) / 60 * PX, ht = b.duration / 60 * PX - 3;
        inner += `<div class="ev ${b.status}" data-open="${b.id}" style="top:${top}px;height:${ht}px"><b>${esc(b.name)}</b>${b.time} · ${esc(svc(b.service).name)}</div>`;
      });
      if (k === t) { const now = new Date(); const m = now.getHours() * 60 + now.getMinutes(); if (m > H0 * 60 && m < H1 * 60) inner += `<div class="now-line" style="top:${(m - H0 * 60) / 60 * PX}px"></div>`; }
      html += `<div class="daycol" data-day="${k}" style="height:${(H1 - H0) * PX}px">${inner}</div>`;
    });
    $('#week').innerHTML = html;
    $$('#week .ev').forEach(el => el.onclick = e => { e.stopPropagation(); openBooking(el.dataset.open); });
    $$('#week .daycol').forEach(col => col.onclick = e => {
      if (e.target.closest('.vac')) return;
      const y = e.clientY - col.getBoundingClientRect().top;
      const m = Math.floor((H0 * 60 + y / PX * 60) / 30) * 30;
      const k = col.dataset.day;
      if (k < today()) { toast('לא ניתן לקבוע תור בעבר'); return; }
      openNewBooking(k, S.toTime(m));
    });
  }

  // availability
  function renderAvail() {
    $('#hoursEditor').innerHTML = [0, 1, 2, 3, 4, 5, 6].map(i => { const h = db.hours[i]; return `<div class="hours-row${h.open ? '' : ' off'}" data-d="${i}"><b>${DAY[i]}</b><label class="switch"><input type="checkbox" ${h.open ? 'checked' : ''}><span></span></label><div class="times"><input type="time" value="${h.from}" step="900"> עד <input type="time" value="${h.to}" step="900"></div></div>`; }).join('');
    $$('.hours-row input[type=checkbox]').forEach(c => c.onchange = () => c.closest('.hours-row').classList.toggle('off', !c.checked));
    $('#setBuffer').value = db.settings.buffer; $('#setStep').value = db.settings.slotStep; $('#setAuto').checked = db.settings.autoApprove;
    const t = today();
    const vs = [...db.vacations].sort((a, b) => a.from.localeCompare(b.from));
    $('#vacList').innerHTML = vs.length ? vs.map(v => `<div class="vac-item${v.to < t ? ' past' : ''}"><span class="ic">🌴</span><div><b>${esc(v.reason || 'חופשה')}</b><small>${v.from === v.to ? fmtLong(v.from) : `${fmt(v.from)} – ${fmt(v.to)}`}${v.to < t ? ' · הסתיים' : ''}</small></div><button class="btn btn-bad btn-sm" data-delvac="${v.id}">מחיקה</button></div>`).join('') : '<div class="empty">אין חופשות מתוכננות. מגיע לך! 😉</div>';
    $$('[data-delvac]').forEach(b => b.onclick = () => { db.vacations = db.vacations.filter(v => v.id !== b.dataset.delvac); save(); toast('החופשה נמחקה · הימים נפתחו להזמנות'); });
  }
  $('#saveHours').onclick = () => {
    $$('.hours-row').forEach(r => { const i = r.dataset.d; const [f, to] = r.querySelectorAll('input[type=time]'); db.hours[i] = { open: r.querySelector('input[type=checkbox]').checked, from: f.value, to: to.value }; });
    db.settings.buffer = +$('#setBuffer').value || 0; db.settings.slotStep = +$('#setStep').value; db.settings.autoApprove = $('#setAuto').checked;
    save(); toast('✓ שעות הפעילות נשמרו ומתעדכנות באתר');
  };
  $('#addVac').onclick = () => {
    modal('חופשה / חסימת ימים', `<div class="row2"><div class="field"><label>מתאריך</label><input type="date" id="vFrom" value="${today()}" min="${today()}"></div><div class="field"><label>עד תאריך</label><input type="date" id="vTo" value="${today()}" min="${today()}"></div></div>
      <div class="field"><label>סיבה (מוצגת רק לך)</label><input id="vReason" placeholder="למשל: חופשה בחו״ל ✈️"></div><div id="vWarn"></div>`,
    '<button class="btn btn-primary" id="vGo">שמירה וחסימת הימים</button><button class="btn btn-ghost" data-close>ביטול</button>');
    const check = () => {
      if ($('#vTo').value < $('#vFrom').value) $('#vTo').value = $('#vFrom').value;
      const hit = db.bookings.filter(b => b.date >= $('#vFrom').value && b.date <= $('#vTo').value && ['pending', 'approved'].includes(b.status));
      $('#vWarn').innerHTML = hit.length ? `<div class="callout warn">⚠️ יש ${hit.length} תורים בטווח הזה (${hit.map(b => esc(b.name)).slice(0, 3).join(', ')}${hit.length > 3 ? '…' : ''}).<label style="display:flex;gap:8px;margin-top:8px"><input type="checkbox" id="vCancel" checked> לבטל אותם ולשלוח ללקוחות הודעה עם קישור לקביעת מועד חדש</label></div>` : '';
      return hit;
    };
    $('#vFrom').onchange = check; $('#vTo').onchange = check; check();
    $('#vGo').onclick = () => {
      const hit = check();
      db.vacations.push({ id: S.uid(), from: $('#vFrom').value, to: $('#vTo').value, reason: $('#vReason').value.trim() || 'חופשה' });
      let n = 0; if (hit.length && $('#vCancel') && $('#vCancel').checked) { hit.forEach(b => { setStatus(b.id, 'cancelled', true); n++; }); }
      save(); closeModal(); toast(`🌴 הימים נחסמו להזמנות${n ? ` · ${n} תורים בוטלו והלקוחות עודכנו` : ''}`);
    };
  };

  // payments
  function renderPayments() {
    const t = today(); const month = t.slice(0, 7);
    const net = p => p.type === 'refund' ? -p.amount : p.amount;
    const mPays = db.payments.filter(p => p.date.startsWith(month));
    const due = db.bookings.filter(b => (b.status === 'done' || b.status === 'approved') && b.date <= t && paidOf(b) < b.price);
    const futureDeposits = db.payments.filter(p => p.type === 'deposit' && (db.bookings.find(b => b.id === p.bookingId) || {}).date > t).reduce((a, p) => a + p.amount, 0);
    const byMethod = {}; mPays.filter(p => p.type !== 'refund').forEach(p => { byMethod[p.method] = (byMethod[p.method] || 0) + p.amount; });
    const topM = Object.entries(byMethod).sort((a, b) => b[1] - a[1])[0];
    $('#payStats').innerHTML = [
      ['💰', 'נכנס החודש', ils(mPays.reduce((a, p) => a + net(p), 0)), `${mPays.length} תנועות`],
      ['⏳', 'ממתין לגבייה', ils(due.reduce((a, b) => a + b.price - paidOf(b), 0)), `${due.length} טיפולים`],
      ['🔒', 'מקדמות לתורים עתידיים', ils(futureDeposits), 'יקוזזו ביום הטיפול'],
      ['💳', 'אמצעי מוביל החודש', topM ? topM[0] : '—', topM ? ils(topM[1]) : '']
    ].map(([i, l, v, dl]) => `<div class="card stat"><span class="lbl"><i>${i}</i>${l}</span><span class="val">${v}</span><span class="delta">${dl}</span></div>`).join('');
    $('#dueList').innerHTML = due.length ? due.sort((a, b) => b.date.localeCompare(a.date)).map(b => `<div class="list-item" data-open="${b.id}" style="cursor:pointer"><span class="time" style="min-width:70px">${fmt(b.date)}</span><span class="av">${esc(initials(b.name))}</span><span class="who"><b>${esc(b.name)}</b><small>${esc(svc(b.service).name)} · יתרה ${ils(b.price - paidOf(b))}</small></span><span class="acts"><button class="btn btn-primary btn-sm" data-charge="${b.id}">גבייה</button></span></div>`).join('') : '<div class="empty">הכול נגבה ✓</div>';
    bindRows($('#page-payments'));
    const list = [...db.payments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 80);
    const TYPE = { charge: 'תשלום', deposit: 'מקדמה', refund: 'החזר' };
    $('#payTable').innerHTML = list.map((p, i) => `<tr data-open="${p.bookingId}"><td class="num">${fmt(p.date)}</td><td>${esc(p.name)}</td><td>${TYPE[p.type]}</td><td>${p.method}</td><td class="num" style="font-weight:700;color:${p.type === 'refund' ? 'var(--bad)' : 'var(--ok)'}">${p.type === 'refund' ? '−' : '+'}${ils(p.amount)}</td><td><button class="btn btn-ghost btn-sm" data-rc="${p.id}">🧾 ${p.receipt || 9000 + db.payments.length - i}</button></td></tr>`).join('');
    $$('#payTable tr').forEach(r => r.onclick = e => { if (e.target.closest('[data-rc]')) { toast('🧾 בגרסה המלאה — הקבלה נפתחת כ-PDF'); return; } openBooking(r.dataset.open); });
  }

  // clients
  function clients() {
    const map = {};
    db.bookings.forEach(b => {
      const c = map[b.phone] || (map[b.phone] = { name: b.name, phone: b.phone, visits: 0, last: null, next: null, total: 0 });
      if (b.status === 'done') { c.visits++; if (!c.last || b.date > c.last) c.last = b.date; }
      if ((b.status === 'approved' || b.status === 'pending') && b.date >= today() && (!c.next || b.date < c.next)) c.next = b.date;
    });
    db.payments.forEach(p => { const b = db.bookings.find(x => x.id === p.bookingId); if (b && map[b.phone]) map[b.phone].total += p.type === 'refund' ? -p.amount : p.amount; });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }
  $('#cSearch').oninput = () => renderClients();
  function renderClients() {
    const q = $('#cSearch').value.trim();
    const list = clients().filter(c => !q || c.name.includes(q) || c.phone.includes(q));
    $('#cTable').innerHTML = list.map((c, i) => `<tr data-phone="${esc(c.phone)}"><td><div style="display:flex;gap:10px;align-items:center"><span class="av" style="width:32px;height:32px;font-size:13px">${esc(initials(c.name))}</span><b>${esc(c.name)}</b>${i < 3 && !q ? ' <span title="לקוחת VIP">👑</span>' : ''}</div></td><td class="num">${esc(c.phone)}</td><td class="num">${c.visits}</td><td>${c.last ? fmt(c.last) : '—'}</td><td>${c.next ? fmt(c.next) : '—'}</td><td class="num"><b>${ils(c.total)}</b></td><td><div class="acts"><button class="btn btn-ghost btn-sm" data-bookfor="${esc(c.phone)}">+ תור</button></div></td></tr>`).join('') || '<tr><td colspan="7" class="empty">לא נמצאו לקוחות</td></tr>';
    $$('#cTable [data-bookfor]').forEach(b => b.onclick = e => { e.stopPropagation(); const c = list.find(x => x.phone === b.dataset.bookfor); openNewBooking(); $('#nbName').value = c.name; $('#nbPhone').value = c.phone; });
    $$('#cTable tr[data-phone]').forEach(r => r.onclick = () => {
      const c = list.find(x => x.phone === r.dataset.phone);
      const hist = db.bookings.filter(b => b.phone === c.phone).sort((a, b) => b.date.localeCompare(a.date));
      modal(esc(c.name), `<dl class="detail"><dt>טלפון</dt><dd>${esc(c.phone)}</dd><dt>ביקורים</dt><dd>${c.visits}</dd><dt>סה״כ</dt><dd>${ils(c.total)}</dd></dl><h4 style="margin-bottom:6px">היסטוריית תורים</h4>${hist.slice(0, 12).map(b => `<div class="list-item" data-open="${b.id}" style="cursor:pointer"><span class="time" style="min-width:64px">${fmt(b.date)}</span><span class="who"><b>${esc(svc(b.service).name)}</b><small>${b.time} · ${ils(b.price)}</small></span>${badge(b.status)}</div>`).join('')}`);
      bindRows($('#modal'));
    });
  }

  // services
  function renderServices() {
    $('#svcEditor').innerHTML = db.services.map(s => `<div class="svc-row" data-id="${s.id}"><img src="https://images.unsplash.com/${s.img}?w=120&h=120&fit=crop" alt=""><div class="nm"><label>שם הטיפול</label><input data-k="name" value="${esc(s.name)}"></div><div><label>מחיר (₪)</label><input data-k="price" type="number" value="${s.price}"></div><div><label>משך (דק׳)</label><input data-k="duration" type="number" step="15" value="${s.duration}"></div><span class="del" title="בגרסה המלאה ניתן גם להוסיף ולמחוק טיפולים">⋮</span></div>`).join('');
    $('#setDeposit').value = db.settings.deposit;
  }
  $('#saveSvc').onclick = () => {
    $$('.svc-row').forEach(r => { const s = db.services.find(x => x.id === r.dataset.id); r.querySelectorAll('input').forEach(i => { s[i.dataset.k] = i.type === 'number' ? +i.value : i.value; }); });
    db.settings.deposit = +$('#setDeposit').value || 0;
    save(); toast('✓ המחירון עודכן — השינויים כבר באתר');
  };

  // live updates when a booking is made in another tab
  window.addEventListener('storage', e => {
    if (e.key !== S.KEY) return;
    try { const fresh = JSON.parse(e.newValue); const before = db.bookings.length; Object.assign(db, fresh); if (fresh.bookings.length > before) toast(`🔔 בקשת תור חדשה מ${esc(fresh.bookings[fresh.bookings.length - 1].name)}!`); render(); } catch (er) { /* ignore */ }
  });

  render();
})();
