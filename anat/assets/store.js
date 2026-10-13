/* ענת · סטודיו לציפורניים — שכבת נתונים משותפת לאתר ולממשק הניהול (דמו).
   כל הנתונים נשמרים בדפדפן בלבד (localStorage). שום דבר לא נשלח לשרת. */
(function () {
  const KEY = 'anat-demo-v1';

  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const toTime = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const uid = () => Math.random().toString(36).slice(2, 9);

  const SERVICES = [
    { id: 'gel', name: 'לק ג׳ל', desc: 'מניקור יסודי + לק ג׳ל עמיד עד 3 שבועות, במגוון של מעל 200 גוונים.', price: 140, duration: 60, img: 'photo-1610992015732-2449b76344bc' },
    { id: 'build', name: 'בניית ציפורניים', desc: 'בנייה בג׳ל על תבנית או טיפסים, בצורה ובאורך שתבחרי.', price: 260, duration: 120, img: 'photo-1519014816548-bf5fe059798b' },
    { id: 'fill', name: 'מילוי בנייה', desc: 'מילוי לבנייה קיימת, יישור קו הצמיחה והחלפת צבע.', price: 190, duration: 90, img: 'photo-1607779097040-26e80aa78e66' },
    { id: 'polish', name: 'מניקור + לק רגיל', desc: 'טיפוח ציפורניים ועור, ליטוש וצבע קלאסי.', price: 90, duration: 45, img: 'photo-1599948128020-9a44505b0d1b' },
    { id: 'art', name: 'עיצוב ונייל ארט', desc: 'ציורים, פרנץ׳, אבנים, כרום ואפקטים — תוספת לכל טיפול.', price: 40, duration: 30, img: 'photo-1571290274554-6a2eaa771e5f' },
    { id: 'pedi', name: 'פדיקור ג׳ל', desc: 'טיפול כף רגל מפנק, הסרת עור קשה ולק ג׳ל.', price: 170, duration: 75, img: 'photo-1600428877878-1a0fd85beda8' }
  ];

  const HOURS = {
    0: { open: true, from: '09:00', to: '19:00' }, // ראשון
    1: { open: true, from: '09:00', to: '19:00' },
    2: { open: true, from: '09:00', to: '19:00' },
    3: { open: true, from: '12:00', to: '21:00' },
    4: { open: true, from: '09:00', to: '19:00' },
    5: { open: true, from: '08:30', to: '13:30' }, // שישי
    6: { open: false, from: '10:00', to: '14:00' } // שבת
  };

  const NAMES = ['נועה לוי', 'מאיה כהן', 'שירה אברהם', 'יעל מזרחי', 'רוני פרץ', 'הילה ביטון', 'תמר דהן', 'אור שפירא', 'ליאור גבאי', 'עדי פרידמן', 'מיכל אזולאי', 'דנה רוזן', 'אגם חדד', 'קרן וקנין', 'שני בן דוד', 'ליה סעדה'];
  const phoneOf = i => `05${[0, 2, 4, 3, 8][i % 5]}-${String(4100000 + i * 73191).slice(0, 7)}`;

  function seed() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const bookings = [];
    const payments = [];
    let n = 0;
    // היסטוריה: 150 ימים אחורה עד 12 ימים קדימה
    for (let off = -150; off <= 12; off++) {
      const day = addDays(today, off);
      const h = HOURS[day.getDay()];
      if (!h.open) continue;
      const seedRand = Math.abs(Math.sin(off * 12.9898) * 43758.5453) % 1;
      const count = off < 0 ? 2 + Math.floor(seedRand * 4) : 1 + Math.floor(seedRand * 3);
      let cursor = toMin(h.from) + (seedRand > .5 ? 60 : 0);
      for (let k = 0; k < count; k++) {
        const s = SERVICES[(n * 7 + k * 3 + Math.floor(seedRand * 10)) % SERVICES.length];
        if (cursor + s.duration > toMin(h.to)) break;
        const ci = (n * 5 + k) % NAMES.length;
        let status;
        if (off < 0) status = (n % 17 === 0) ? 'cancelled' : 'done';
        else if (off === 0) status = 'approved';
        else status = (n % 3 === 0) ? 'pending' : 'approved';
        const b = {
          id: uid(), name: NAMES[ci], phone: phoneOf(ci), service: s.id,
          date: iso(day), time: toTime(cursor), duration: s.duration, price: s.price,
          notes: k === 1 && n % 4 === 0 ? 'רוצה גוון ורוד מעושן כמו בפעם הקודמת' : '',
          status, paid: false, createdAt: addDays(day, -3).toISOString(), source: n % 4 ? 'אתר' : 'טלפון'
        };
        if (status === 'done') {
          b.paid = true;
          payments.push({ id: uid(), bookingId: b.id, name: b.name, amount: b.price, method: ['אשראי', 'ביט', 'מזומן', 'אשראי'][n % 4], date: b.date, type: 'charge' });
        } else if (status === 'approved' && off > 0 && n % 2 === 0) {
          b.deposit = 50;
          payments.push({ id: uid(), bookingId: b.id, name: b.name, amount: 50, method: 'אשראי', date: iso(addDays(day, -2)), type: 'deposit' });
        }
        bookings.push(b);
        cursor += s.duration + 15;
        n++;
      }
    }
    const vacations = [
      { id: uid(), from: iso(addDays(today, 24)), to: iso(addDays(today, 28)), reason: 'חופשה משפחתית באילת 🌴' },
      { id: uid(), from: iso(addDays(today, 45)), to: iso(addDays(today, 45)), reason: 'השתלמות — טכניקות בנייה חדשות' }
    ];
    return { version: 1, services: SERVICES, hours: HOURS, bookings, payments, vacations, settings: { slotStep: 30, buffer: 15, deposit: 50, autoApprove: false } };
  }

  let mem = null;
  function load() {
    if (mem) return mem;
    try { const raw = localStorage.getItem(KEY); if (raw) mem = JSON.parse(raw); } catch (e) { /* ignore */ }
    if (!mem || mem.version !== 1) { mem = seed(); save(); }
    return mem;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { /* ignore */ } }
  function reset() { mem = seed(); save(); return mem; }

  function isVacation(date) {
    return load().vacations.find(v => date >= v.from && date <= v.to) || null;
  }

  // שעות פנויות ליום מסוים לשירות מסוים
  function availableSlots(date, serviceId, ignoreId) {
    const db = load();
    const d = new Date(date + 'T00:00:00');
    const h = db.hours[d.getDay()];
    const s = db.services.find(x => x.id === serviceId);
    if (!h || !h.open || !s || isVacation(date)) return [];
    const taken = db.bookings
      .filter(b => b.date === date && b.id !== ignoreId && ['pending', 'approved', 'done'].includes(b.status))
      .map(b => [toMin(b.time), toMin(b.time) + b.duration + db.settings.buffer]);
    const now = new Date();
    const slots = [];
    for (let m = toMin(h.from); m + s.duration <= toMin(h.to); m += db.settings.slotStep) {
      if (date === iso(now) && m <= now.getHours() * 60 + now.getMinutes() + 60) continue;
      const end = m + s.duration;
      if (taken.some(([a, b]) => m < b && end + db.settings.buffer > a)) continue;
      slots.push(toTime(m));
    }
    return slots;
  }

  function addBooking(data) {
    const db = load();
    const s = db.services.find(x => x.id === data.service);
    const b = Object.assign({ id: uid(), duration: s.duration, price: s.price, status: db.settings.autoApprove ? 'approved' : 'pending', paid: false, createdAt: new Date().toISOString(), source: 'אתר', isNew: true }, data);
    db.bookings.push(b);
    if (b.deposit) db.payments.push({ id: uid(), bookingId: b.id, name: b.name, amount: b.deposit, method: 'אשראי', date: iso(new Date()), type: 'deposit' });
    save();
    return b;
  }

  window.AnatStore = { load, save, reset, uid, iso, addDays, toMin, toTime, isVacation, availableSlots, addBooking, KEY };

  // קישור "דברו עם ראם"
  window.REEM_MAILTO = 'mailto:contact@reembir.com'
    + '?subject=' + encodeURIComponent('בניית אתר לסטודיו ענת — בעקבות הדמו')
    + '&body=' + encodeURIComponent(
      'היי ראם,\n\n'
      + 'עברתי על אתר הדמו שבנית עבורי — "ענת | סטודיו לציפורניים" — והוא ממש מצא חן בעיניי!\n'
      + 'אני רוצה להתקדם לבניית האתר האמיתי, כולל טופס ההזמנות וממשק הניהול.\n\n'
      + 'אשמח לתאם שיחה קצרה כדי לעבור יחד על התוכן, ההתאמות והמחיר.\n\n'
      + 'שם מלא:\n'
      + 'טלפון:\n'
      + 'זמן נוח לשיחה:\n'
      + 'דברים שהייתי רוצה לשנות או להוסיף:\n\n'
      + 'תודה רבה,\n');

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-reem]').forEach(a => a.setAttribute('href', window.REEM_MAILTO));
  });
})();
