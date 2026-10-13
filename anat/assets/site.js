(function () {
  const S = window.AnatStore;
  const db = S.load();
  const $ = sel => document.querySelector(sel);
  const IMG = (id, w) => `https://images.unsplash.com/${id}?w=${w || 800}&q=80&auto=format&fit=crop`;
  const DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const fmtDate = d => { const x = new Date(d + 'T00:00:00'); return `יום ${DAY_NAMES[x.getDay()]}, ${x.getDate()} ב${MONTHS[x.getMonth()]}`; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // mobile menu
  $('#menuBtn').onclick = () => $('#nav').classList.toggle('open');
  document.querySelectorAll('#nav a').forEach(a => a.addEventListener('click', () => $('#nav').classList.remove('open')));

  // services
  $('#servicesGrid').innerHTML = db.services.map(s => `
    <article class="service-card reveal">
      <div class="img"><img loading="lazy" src="${IMG(s.img, 700)}" alt="${esc(s.name)}"></div>
      <div class="body">
        <h3>${esc(s.name)}</h3>
        <p>${esc(s.desc)}</p>
        <div class="meta"><span class="price">₪${s.price}${s.id === 'art' ? ' <small>החל מ-</small>' : ''}</span><span class="dur">⏱ ${s.duration} דק׳</span></div>
        <button class="book-link" data-book="${s.id}">לקביעת תור ←</button>
      </div>
    </article>`).join('');
  document.querySelectorAll('[data-book]').forEach(b => b.onclick = () => { pickService(b.dataset.book); $('#booking').scrollIntoView(); });

  // gallery
  const gallery = [
    ['photo-1604654894610-df63bc536371', 'כהה וטורטואז'], ['photo-1607779097040-26e80aa78e66', 'פסטל ונצנצים'],
    ['photo-1519014816548-bf5fe059798b', 'אדום עם כיתוב'], ['photo-1599948128020-9a44505b0d1b', 'פלטת צבעי הקיץ'],
    ['photo-1610992015732-2449b76344bc', 'נוד טבעי'], ['photo-1571290274554-6a2eaa771e5f', 'נייל ארט צבעוני'],
    ['photo-1587729927069-ef3b7a5ab9b4', 'עדין עם קישוט'], ['photo-1604902396830-aca29e19b067', 'ורוד אבקתי']
  ];
  $('#galleryGrid').innerHTML = gallery.map(([id, cap]) => `<figure data-full="${IMG(id, 1400)}"><img loading="lazy" src="${IMG(id, 700)}" alt="${cap}"><figcaption>${cap}</figcaption></figure>`).join('');
  const lb = $('#lightbox');
  document.querySelectorAll('#galleryGrid figure').forEach(f => f.onclick = () => { lb.querySelector('img').src = f.dataset.full; lb.classList.add('open'); });
  lb.onclick = () => lb.classList.remove('open');

  // hours
  const order = [0, 1, 2, 3, 4, 5, 6];
  $('#hoursList').innerHTML = order.map(d => { const h = db.hours[d]; return `<div>${DAY_NAMES[d]}: ${h.open ? `${h.from}–${h.to}` : 'סגור'}</div>`; }).join('');

  // next available slot (hero)
  (function () {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    for (let i = 0; i < 30; i++) {
      const d = S.iso(S.addDays(now, i));
      const sl = S.availableSlots(d, 'gel');
      if (sl.length) { $('#nextSlot').textContent = (i === 0 ? 'היום' : i === 1 ? 'מחר' : fmtDate(d).replace('יום ', '')) + ` ב-${sl[0]}`; return; }
    }
    $('#nextSlot').textContent = 'צרי קשר בוואטסאפ';
  })();

  // reveal on scroll
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  /* ===== Booking wizard ===== */
  const state = { service: null, date: null, time: null };
  let viewMonth = new Date(); viewMonth.setDate(1);

  $('#svcOptions').innerHTML = db.services.map(s => `<button type="button" class="svc-opt" data-svc="${s.id}"><span class="p">₪${s.price}</span><b>${esc(s.name)}</b><small>${s.duration} דקות</small></button>`).join('');
  document.querySelectorAll('[data-svc]').forEach(b => b.onclick = () => pickService(b.dataset.svc));
  $('#depAmt').textContent = db.settings.deposit;

  function pickService(id) {
    state.service = id; state.time = null;
    document.querySelectorAll('[data-svc]').forEach(b => b.classList.toggle('sel', b.dataset.svc === id));
    $('#to2').disabled = false;
    updateSummary();
    if (state.date) renderSlots();
  }

  function go(n) {
    document.querySelectorAll('.step').forEach(s => s.classList.toggle('active', +s.dataset.step === n));
    document.querySelectorAll('#stepsNav li').forEach((li, i) => { li.classList.toggle('active', i + 1 === n); li.classList.toggle('done', i + 1 < n); });
    if (n === 2) renderCal();
    if (window.innerWidth < 900) $('.booking-main').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('#to2').onclick = () => go(2);
  $('#to3').onclick = () => go(3);
  document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => go(+b.dataset.back));

  function renderCal() {
    const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
    $('#calTitle').textContent = `${MONTHS[m]} ${y}`;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const max = S.addDays(today, 60);
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    let html = DOW.map(d => `<div class="dow">${d}</div>`).join('');
    for (let i = 0; i < first; i++) html += '<div></div>';
    for (let d = 1; d <= days; d++) {
      const dt = new Date(y, m, d); const key = S.iso(dt);
      const vac = S.isVacation(key);
      const closed = !db.hours[dt.getDay()].open;
      const dis = dt < today || dt > max || closed || vac || !S.availableSlots(key, state.service).length;
      html += `<button type="button" class="cal-day${vac ? ' vac' : ''}${key === state.date ? ' sel' : ''}${dt.getTime() === today.getTime() ? ' today' : ''}" data-date="${key}" ${dis ? 'disabled' : ''} title="${vac ? esc(vac.reason ? 'הסטודיו סגור — חופשה' : '') : closed ? 'סגור' : ''}">${d}</button>`;
    }
    $('#calGrid').innerHTML = html;
    document.querySelectorAll('.cal-day[data-date]:not(:disabled)').forEach(b => b.onclick = () => { state.date = b.dataset.date; state.time = null; $('#to3').disabled = true; renderCal(); renderSlots(); updateSummary(); });
    const cur = new Date(); cur.setDate(1); cur.setHours(0, 0, 0, 0);
    $('#calPrev').disabled = viewMonth <= cur;
  }
  $('#calPrev').onclick = () => { viewMonth.setMonth(viewMonth.getMonth() - 1); renderCal(); };
  $('#calNext').onclick = () => { viewMonth.setMonth(viewMonth.getMonth() + 1); renderCal(); };

  function renderSlots() {
    const sl = S.availableSlots(state.date, state.service);
    $('#slotsTitle').textContent = `שעות פנויות · ${fmtDate(state.date)}`;
    $('#slots').innerHTML = sl.length ? sl.map(t => `<button type="button" class="slot${t === state.time ? ' sel' : ''}" data-t="${t}">${t}</button>`).join('') : '<p class="hint">אין שעות פנויות ביום זה. נסי יום אחר 💗</p>';
    document.querySelectorAll('.slot').forEach(b => b.onclick = () => { state.time = b.dataset.t; renderSlots(); $('#to3').disabled = false; updateSummary(); });
  }

  function updateSummary() {
    const s = db.services.find(x => x.id === state.service);
    if (!s) return;
    $('#summary').classList.add('show');
    $('#summary').innerHTML = `<div><span>טיפול</span><b>${esc(s.name)}</b></div>`
      + (state.date ? `<div><span>תאריך</span><b>${fmtDate(state.date).replace('יום ', '')}</b></div>` : '')
      + (state.time ? `<div><span>שעה</span><b>${state.time}</b></div>` : '')
      + `<div><span>משך</span><b>${s.duration} דק׳</b></div><div><span>מחיר</span><b>₪${s.price}</b></div>`;
  }

  document.querySelectorAll('input[name=pay]').forEach(r => r.onchange = () => { $('#cardBox').hidden = $('input[name=pay]:checked').value !== 'deposit'; });

  $('#detailsForm').onsubmit = e => {
    e.preventDefault();
    const name = $('#fName').value.trim(), phone = $('#fPhone').value.trim();
    let ok = true;
    [[$('#fName'), name.length >= 2], [$('#fPhone'), /^0\d{1,2}-?\d{7}$/.test(phone.replace(/\s/g, ''))]].forEach(([el, v]) => { el.style.borderColor = v ? '' : '#e04848'; if (!v) ok = false; });
    if (!$('#fAgree').checked) ok = false;
    if (!ok) return;
    if (!S.availableSlots(state.date, state.service).includes(state.time)) { alert('אופס, השעה הזו נתפסה הרגע. בחרי שעה אחרת 🙏'); go(2); renderSlots(); return; }
    const deposit = $('input[name=pay]:checked').value === 'deposit';
    const btn = $('#submitBtn');
    btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${deposit ? 'מעבד תשלום…' : 'שולחת…'}`;
    setTimeout(() => {
      const b = S.addBooking({ name, phone, service: state.service, date: state.date, time: state.time, notes: $('#fNotes').value.trim(), deposit: deposit ? db.settings.deposit : 0 });
      $('#refNum').textContent = 'הזמנה #' + b.id.toUpperCase();
      $('#successText').innerHTML = `${esc(name.split(' ')[0])}, ביקשת <b>${esc(db.services.find(s => s.id === b.service).name)}</b> ב${fmtDate(b.date)} בשעה <b>${b.time}</b>.<br>`
        + (deposit ? `המקדמה בסך ₪${b.deposit} התקבלה בהצלחה. ` : '')
        + (b.status === 'approved' ? 'התור אושר! נתראה 💕' : 'ענת תאשר את התור בהקדם ותשלח לך SMS.');
      btn.disabled = false; btn.textContent = 'שליחת בקשה לתור ←';
      go(4);
    }, deposit ? 1600 : 900);
  };

  $('#again').onclick = () => {
    state.service = state.date = state.time = null;
    $('#detailsForm').reset(); $('#cardBox').hidden = true;
    document.querySelectorAll('.svc-opt').forEach(b => b.classList.remove('sel'));
    $('#to2').disabled = true; $('#to3').disabled = true; $('#summary').classList.remove('show'); $('#slots').innerHTML = '';
    $('#slotsTitle').textContent = 'בחרי תאריך כדי לראות שעות פנויות';
    go(1);
  };
})();
