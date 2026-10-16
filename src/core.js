/* Core logic — quản lý đào tạo & sát hạch mô tô A1. Pure functions, testable in Node. */
(function (root) {
  const DEFAULT_CFG = {
    prices: { HP: 400000, LT: 60000, H: 70000, GPLX: 115000, DUYET: 50000 },
    cutoff: '2026-07-25',      // mốc 115k khi rớt 1 phần (LT hoặc Hình)
    cutoffBoth: '2026-07-01',  // mốc 115k khi rớt cả 2 phần (LT + Hình)
    cutoffLT: '2026-07-01',    // mốc 115k khi chỉ thu lại LT
    seqDate: '2026-07-01',     // từ đợt này: đạt LT mới được thi Hình → trượt/vắng LT thì Hình không bị tính phí
    extraBatches: ['2026-07-02'], // đợt ngoại lệ: thi lại luôn cộng phí GPLX
    basis: 'exam',             // 'exam' = ngày thi rớt gần nhất | 'reg' = ngày đăng ký thi lại
    absentAsFail: true,        // Vắng = phải nộp lệ phí lại phần đó
    examDate: '2026-12-20',    // ngày sát hạch dự kiến (tính hết hạn bảo lưu)
    reserveMonths: 12,
    soonDays: 30,              // cảnh báo "sắp hết hạn" trong N ngày tới ngày thi
    mask: true
  };

  const norm = s => (s == null ? '' : String(s)).normalize('NFC').replace(/[\s ]+/g, ' ').trim();
  const lower = s => norm(s).toLowerCase();

  function normCCCD(v) {
    let s = String(v == null ? '' : v).replace(/\D/g, '');
    let fixed = false;
    if (s.length === 11) { s = '0' + s; fixed = true; }
    return { id: s, fixed, ok: s.length === 12 || s.length === 9 };
  }

  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  function validYMD(y, m, d) {
    if (!(y > 1900 && y < 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCMonth() === m - 1;
  }
  /** Excel serial (1900 system) → ISO */
  function serialToISO(n) {
    const ms = Math.round((n - 25569) * 86400000);
    const t = new Date(ms);
    return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  function parseDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number' && v > 20000 && v < 80000) return serialToISO(v);
    const s = norm(v);
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m && validYMD(+m[3], +m[2], +m[1])) return iso(+m[3], +m[2], +m[1]);
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m && validYMD(+m[1], +m[2], +m[3])) return iso(+m[1], +m[2], +m[3]);
    return null;
  }
  function addMonths(isoStr, n) {
    const [y, m, d] = isoStr.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, Math.min(d, last));
  }
  function daysBetween(a, b) { // b - a
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  }
  const fmtDate = s => (s ? s.split('-').reverse().join('/') : '');
  const money = n => (Math.round(n || 0)).toLocaleString('vi-VN');

  function normResult(v) {
    const s = lower(v);
    if (!s) return '';
    if (s === 'đạt' || s === 'dat' || s === 'đ') return 'D';
    if (s.startsWith('trượt') || s === 'truot' || s === 'rớt') return 'T';
    if (s.startsWith('vắng') || s === 'vang' || s === 'v') return 'V';
    if (s === 'x' || s.startsWith('miễn') || s.startsWith('bảo lưu')) return 'X';
    return '?';
  }
  const RLABEL = { D: 'Đạt', T: 'Trượt', V: 'Vắng', X: 'Miễn (X)', '': '', '?': '?' };

  /* ---------- Header detection ---------- */
  const COLS = {
    stt: [/^stt$/, /^sst$/],
    sbd: [/^sbd$/, /số báo danh/],
    name: [/họ và tên/, /^họ tên/, /^tên$/],
    dob: [/ngày sinh/, /^ns$/],
    cccd: [/số định danh/, /cccd/, /cmnd/],
    addr: [/nơi cư trú/, /địa chỉ/],
    cls: [/hạng/],
    nd: [/nội dung/],
    lt: [/^lt$/, /lý thuyết/],
    h: [/^hình$/, /^h$/, /sa hình/, /^thực hành/],
    kq: [/^kết quả$/],
    date: [/^ngày$/, /ngày thi/, /ngày sát hạch/]
  };
  function detectHeader(rows) {
    // Hỗ trợ tiêu đề 2 tầng (vd. "Kết quả thi" gộp ô, dòng dưới là LT | Hình)
    for (let r = 0; r < Math.min(rows.length, 20); r++) {
      const row = rows[r] || [], sub = rows[r + 1] || [];
      const map = {}; let usedSub = false;
      const scan = (cells, isSub) => cells.forEach((c, i) => {
        const s = lower(c);
        if (!s) return;
        for (const k in COLS) if (map[k] == null && COLS[k].some(re => re.test(s))) { map[k] = i; if (isSub) usedSub = true; break; }
      });
      scan(row, false);
      if (map.cccd == null) continue;
      if (map.lt == null || map.h == null) scan(sub, true);
      if (map.lt != null && map.h != null) return { headerRow: usedSub ? r + 1 : r, map };
    }
    return null;
  }
  /** Ngày sát hạch ghi ở phần đầu trang (vd. "Ngày SH: | 29/08/2026") khi bảng không có cột NGÀY */
  function findSheetDate(rows) {
    for (let r = 0; r < Math.min(rows.length, 12); r++) {
      const row = rows[r] || [];
      for (let i = 0; i < row.length; i++) {
        const s = lower(row[i]);
        if (!/ngày\s*(sh|sát hạch)/.test(s)) continue;
        const m = s.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
        if (m && parseDate(m[1])) return parseDate(m[1]);
        for (let j = i + 1; j < Math.min(row.length, i + 5); j++) { const d = parseDate(row[j]); if (d) return d; }
      }
    }
    return null;
  }
  function findSheetCode(rows) {
    for (let r = 0; r < Math.min(rows.length, 12); r++) {
      const row = rows[r] || [];
      for (let i = 0; i < row.length; i++) {
        const s = lower(row[i]);
        if (!/mã kỳ/.test(s)) continue;
        const m = norm(row[i]).match(/([A-ZĐ]{2,}-\d{4}-\S+)/); if (m) return m[1];
        for (let j = i + 1; j < Math.min(row.length, i + 4); j++) if (norm(row[j])) return norm(row[j]);
      }
    }
    return '';
  }

  /* ---------- Parse sheet rows → attempts ---------- */
  function parseRows(rows, sheetName) {
    const det = detectHeader(rows);
    const out = { attempts: [], issues: [], skippedBlank: 0, sheet: sheetName, ok: !!det };
    if (!det) return out;
    const { headerRow, map } = det;
    const sheetDate = map.date == null ? findSheetDate(rows) : null;
    out.examDate = sheetDate; out.code = findSheetCode(rows);
    if (map.date == null && !sheetDate) { out.ok = false; out.noDate = true; return out; }
    const g = (row, k) => (map[k] == null ? null : row[map[k]]);
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every(c => c == null || norm(c) === '')) { out.skippedBlank++; continue; }
      const rawId = g(row, 'cccd');
      if (rawId == null || norm(rawId) === '') { out.skippedBlank++; continue; }
      const c = normCCCD(rawId);
      const where = `${sheetName} dòng ${r + 1}`;
      const name = norm(g(row, 'name')).toUpperCase();
      if (!c.ok) { out.issues.push({ type: 'CCCD sai độ dài', where, cccd: norm(rawId), name, detail: `${c.id.length} chữ số` }); continue; }
      if (c.fixed) out.issues.push({ type: 'CCCD 11 số (đã thêm số 0)', where, cccd: c.id, name, detail: norm(rawId) });
      const date = sheetDate || parseDate(g(row, 'date'));
      if (!date) { out.issues.push({ type: 'Ngày thi không đọc được', where, cccd: c.id, name, detail: norm(g(row, 'date')) }); continue; }
      const cls = norm(g(row, 'cls'));
      const lt = normResult(g(row, 'lt')), h = normResult(g(row, 'h'));
      let kq = normResult(g(row, 'kq'));
      if (lt === '?' || h === '?') out.issues.push({ type: 'Kết quả lạ', where, cccd: c.id, name, detail: `${norm(g(row, 'lt'))} / ${norm(g(row, 'h'))}` });
      const ndRaw = norm(g(row, 'nd'));
      out.attempts.push({
        cccd: c.id, name, dob: parseDate(g(row, 'dob')) || norm(g(row, 'dob')),
        addr: norm(g(row, 'addr')), sbd: norm(g(row, 'sbd')), cls, nd: ndRaw,
        lt, h, kq, date, src: where
      });
    }
    return out;
  }

  /* ---------- Build person index ---------- */
  function buildIndex(attemptLists) {
    const people = new Map();
    const seen = new Set();
    let dup = 0;
    const issues = [];
    for (const list of attemptLists) for (const a of list) {
      const key = `${a.cccd}|${a.date}`;
      if (seen.has(key)) { dup++; const p0 = people.get(a.cccd); const i = p0.attempts.findIndex(x => x.date === a.date); if (!a.addr && p0.attempts[i].addr) a.addr = p0.attempts[i].addr; p0.attempts[i] = a; if (a.addr) p0.addr = a.addr; continue; }
      seen.add(key);
      let p = people.get(a.cccd);
      if (!p) { p = { id: a.cccd, name: a.name, dob: a.dob, addr: a.addr, attempts: [], names: new Set() }; people.set(a.cccd, p); }
      p.attempts.push(a);
      if (a.name) p.names.add(a.name);
      if (!p.addr && a.addr) p.addr = a.addr;
    }
    for (const p of people.values()) {
      p.attempts.sort((x, y) => x.date.localeCompare(y.date));
      const last = p.attempts[p.attempts.length - 1];
      p.name = last.name || p.name; p.dob = last.dob || p.dob;
      if (p.names.size > 1) issues.push({ type: 'Cùng CCCD khác tên', where: '', cccd: p.id, name: [...p.names].join(' / '), detail: '' });
    }
    return { people, dup, issues };
  }

  /* ---------- Evaluate one person ---------- */
  function evaluate(p, cfg, today) {
    cfg = Object.assign({}, DEFAULT_CFG, cfg);
    const at = p.attempts;
    const last = at[at.length - 1];
    const res = { id: p.id, name: p.name, dob: p.dob, n: at.length, lastDate: last.date, last, flags: [] };
    const passed = at.find(a => a.kq === 'D' || ((a.lt === 'D' || a.lt === 'X') && (a.h === 'D' || a.h === 'X') && !(a.lt === 'X' && a.h === 'X')));
    // lastPass per part (X never refreshes the date)
    const lastPass = { LT: null, H: null };
    for (const a of at) {
      if (a.lt === 'D') lastPass.LT = a.date;
      if (a.h === 'D') lastPass.H = a.date;
    }
    res.inferred = {};
    // X validity check
    for (const a of at) for (const [k, part] of [['lt', 'LT'], ['h', 'H']]) {
      if (a[k] !== 'X') continue;
      const prior = at.filter(b => b.date < a.date && b[k] === 'D').map(b => b.date).pop();
      if (!prior) {
        // Đạt trước khi có dữ liệu: chỉ biết phần này còn bảo lưu vào ngày X → hạn tối đa = ngày X + 12 tháng
        if (!lastPass[part] && !res.inferred[part]) res.inferred[part] = a.date;
      } else if (addMonths(prior, cfg.reserveMonths) < a.date) res.flags.push(`X phần ${part} ngày ${fmtDate(a.date)} nhưng Đạt từ ${fmtDate(prior)} (quá ${cfg.reserveMonths} tháng)`);
    }
    res.lastPass = lastPass;
    res.expiry = {};
    for (const part of ['LT', 'H']) {
      if (lastPass[part]) res.expiry[part] = addMonths(lastPass[part], cfg.reserveMonths);
      else if (res.inferred[part]) res.expiry[part] = addMonths(res.inferred[part], cfg.reserveMonths);
      else res.expiry[part] = null;
    }
    res.uncertain = Object.keys(res.inferred).filter(k => !lastPass[k]);
    if (passed) {
      res.status = 'DAT'; res.passDate = passed.date; res.need = []; res.fee = null;
      return res;
    }
    const need = [], expired = [], soon = [];
    for (const part of ['LT', 'H']) {
      const exp = res.expiry[part];
      // hết hạn tính đến ngày thi: ngày thi > ngày hết hạn
      if (exp && exp >= cfg.examDate) {
        const left = daysBetween(cfg.examDate, exp);
        if (left <= cfg.soonDays) soon.push(part);
      } else {
        need.push(part);
        if (exp) expired.push(part);
      }
    }
    res.need = need; res.expired = expired; res.soon = soon;
    if (!need.length) { res.status = 'DAT'; res.passDate = null; res.fee = null; res.flags.push('Đủ 2 phần còn bảo lưu nhưng không có dòng Kết quả "Đạt" — kiểm tra lại'); return res; }
    const everSat = at.some(a => a.lt === 'D' || a.lt === 'T' || a.h === 'D' || a.h === 'T');
    res.status = !everSat && !res.uncertain.length ? 'VANG' : (expired.length ? 'HETBL' : 'THILAI');
    if (res.uncertain.some(k => !need.includes(k) || expired.includes(k))) res.flags.push(`Ngày Đạt gốc phần ${res.uncertain.join(', ')} nằm trước dữ liệu — hạn bảo lưu là ước tính tối đa (${res.uncertain.map(k => fmtDate(res.expiry[k])).join(', ')}), cần đối chiếu hồ sơ`);
    res.needLabel = need.join('+');
    res.fee = fee(res, cfg);
    return res;
  }

  /** Phí thi lại cho một kết quả evaluate. regDate dùng khi cfg.basis === 'reg'. */
  function fee(res, cfg, regDate) {
    cfg = Object.assign({}, DEFAULT_CFG, cfg);
    const items = {};
    let parts = res.need.slice();
    if (!cfg.absentAsFail && res.status === 'VANG') parts = []; // lệ phí lần trước được chuyển sang
    const last = res.last || {};
    let blockedH = false;
    // Thi tuần tự: trượt/vắng LT thì không được thi Hình → lệ phí Hình đã nộp còn nguyên, không thu lại
    if (last.date && last.date >= cfg.seqDate && (last.lt === 'T' || last.lt === 'V') && last.h !== 'T' && last.h !== 'D'
        && parts.includes('LT') && parts.includes('H') && !(res.expired || []).includes('H')) { parts = parts.filter(p => p !== 'H'); blockedH = true; }
    for (const p of parts) items[p] = cfg.prices[p];
    const basisDate = cfg.basis === 'reg' ? (regDate || null) : res.lastDate;
    const special = parts.length && (cfg.extraBatches || []).includes(res.lastDate);
    const both = parts.length === 2;
    const cut = both ? cfg.cutoffBoth : (parts[0] === 'LT' ? cfg.cutoffLT : cfg.cutoff);
    const before = !!(parts.length && basisDate && basisDate < cut);
    if (special || before) items.GPLX115 = cfg.prices.GPLX;
    if (cfg.prices.DUYET) items.DUYET = cfg.prices.DUYET; // phí duyệt hồ sơ: mọi lượt thi lại
    const total = Object.values(items).reduce((s, v) => s + v, 0);
    let rule;
    if (!parts.length) rule = 'không thu lại lệ phí';
    else {
      rule = (both ? 'rớt LT + Hình' : 'thu lại ' + (parts[0] === 'LT' ? 'LT' : 'Hình')) + ', mốc ' + fmtDate(cut) + (before ? ' → trước mốc: + phí ' + money(cfg.prices.GPLX) : ' → sau mốc: chỉ phần rớt');
      if (special && !before) rule = 'đợt ' + fmtDate(res.lastDate) + ' là đợt ngoại lệ → + phí ' + money(cfg.prices.GPLX);
    }
    if (blockedH) rule += '. Hình chưa được thi vì trượt/vắng LT, lệ phí Hình đã nộp được giữ lại';
    return { items, total, basisDate, cut, blockedH, special: !!special, rule };
  }

  function newStudentFee(type, cfg) {
    cfg = Object.assign({}, DEFAULT_CFG, cfg);
    const it = { LT: cfg.prices.LT, H: cfg.prices.H, GPLX: cfg.prices.GPLX };
    if (type !== 'tudo') it.HP = cfg.prices.HP;
    return it;
  }

  /* ---------- Batch (đợt) statistics from history ---------- */
  function batchStats(people, cfg) {
    cfg = Object.assign({}, DEFAULT_CFG, cfg);
    const m = new Map();
    for (const p of people.values()) p.attempts.forEach((a, i) => {
      let b = m.get(a.date);
      if (!b) { b = { date: a.date, n: 0, first: 0, retake: 0, D: 0, T: 0, V: 0, satLT: 0, satH: 0, fee: 0 }; m.set(a.date, b); }
      b.n++;
      if (i === 0) b.first++; else b.retake++;
      const k = a.kq || (a.lt === 'V' && a.h === 'V' ? 'V' : '');
      if (k === 'D' || k === 'T' || k === 'V') b[k]++;
      if (a.lt && a.lt !== 'X') b.satLT++;
      if (a.h && a.h !== 'X') b.satH++;
    });
    for (const b of m.values()) b.fee = b.satLT * cfg.prices.LT + b.satH * cfg.prices.H;
    return [...m.values()].sort((a, b) => b.date.localeCompare(a.date));
  }


  /* ---------- Sắp xếp tên tiếng Việt ----------
     Tên riêng → Họ → Tên đệm. Trong mỗi chữ: so chữ cái trước (a<ă<â<b<c<d<đ<e<ê…, không mũ trước có mũ sau),
     chữ cái giống nhau mới so dấu: không dấu < huyền < sắc < hỏi < ngã < nặng. */
  const VI_ALPHA = 'a ă â b c d đ e ê f g h i j k l m n o ô ơ p q r s t u ư v w x y z'.split(' ');
  const VI_IDX = new Map(VI_ALPHA.map((c, i) => [c, i + 10]));
  const TONE = { '̀': 1, '́': 2, '̉': 3, '̃': 4, '̣': 5 };
  const SHAPE = { '̆': 'ă', '̂': 'â', '̛': 'ơ' };
  function viWordKey(w) {
    const letters = [], tones = [];
    for (const ch of String(w).toLowerCase().normalize('NFC')) {
      const d = ch.normalize('NFD'); let base = d[0], tone = 0;
      for (const m of d.slice(1)) {
        if (TONE[m]) tone = TONE[m];
        else if (m === '̂') base = { a: 'â', e: 'ê', o: 'ô' }[base] || base;
        else if (m === '̆') base = base === 'a' ? 'ă' : base;
        else if (m === '̛') base = { o: 'ơ', u: 'ư' }[base] || base;
      }
      letters.push(VI_IDX.has(base) ? VI_IDX.get(base) : (/[0-9]/.test(base) ? +base : 200 + base.charCodeAt(0)));
      tones.push(tone);
    }
    return { letters, tones };
  }
  function cmpArr(a, b) { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; }
  function viWordCmp(a, b) { const x = viWordKey(a), y = viWordKey(b); return cmpArr(x.letters, y.letters) || cmpArr(x.tones, y.tones); }
  function viWordsCmp(a, b) { for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = viWordCmp(a[i], b[i]); if (c) return c; } return a.length - b.length; }
  function viNameParts(n) { const w = norm(n).split(' ').filter(Boolean); if (w.length < 2) return { ten: w[0] || '', ho: '', dem: [] }; return { ten: w[w.length - 1], ho: w[0], dem: w.slice(1, -1) }; }
  function viNameCmp(a, b) {
    const x = viNameParts(a), y = viNameParts(b);
    return viWordCmp(x.ten, y.ten) || viWordCmp(x.ho, y.ho) || viWordsCmp(x.dem, y.dem);
  }


  /** Sổ địa chỉ: bất kỳ sheet nào có cột Số định danh + Nơi cư trú (vd. sheet DanhSach của file Hội đồng, danh sách hồ sơ) */
  function parseAddrBook(rows) {
    for (let r = 0; r < Math.min(rows.length, 20); r++) {
      const row = rows[r] || []; let ci = -1, ai = -1;
      row.forEach((c, i) => { const s = lower(c); if (ci < 0 && COLS.cccd.some(re => re.test(s))) ci = i; if (ai < 0 && COLS.addr.some(re => re.test(s))) ai = i; });
      if (ci < 0 || ai < 0) continue;
      const out = {};
      for (let k = r + 1; k < rows.length; k++) { const x = rows[k] || []; const c = normCCCD(x[ci]); const ad = norm(x[ai]); if (c.ok && ad) out[c.id] = ad; }
      return out;
    }
    return null;
  }

  const api = { parseAddrBook, viNameCmp, viWordCmp, findSheetDate, findSheetCode, DEFAULT_CFG, norm, normCCCD, parseDate, addMonths, daysBetween, fmtDate, money, normResult, RLABEL, detectHeader, parseRows, buildIndex, evaluate, fee, newStudentFee, batchStats };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Core = api;
})(this);
