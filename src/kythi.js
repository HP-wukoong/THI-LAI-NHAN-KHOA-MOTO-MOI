/* =====================================================================
   SAU MỖI KỲ THI: tiền bảo lưu (vắng thi), VietQR, sao kê ngân hàng,
   chuyển Trượt/Vắng sang đợt mới, giấy hẹn, tin nhắn, biên bản lệ phí
   ===================================================================== */

/* ---------------- NGÂN HÀNG · VIETQR (chuẩn EMVCo / NAPAS) ---------------- */
const BANKS = [['970415','VietinBank'],['970436','Vietcombank'],['970418','BIDV'],['970405','Agribank'],['970422','MB Bank'],['970407','Techcombank'],['970416','ACB'],['970432','VPBank'],['970403','Sacombank'],['970423','TPBank'],['970441','VIB'],['970443','SHB'],['970448','OCB'],['970426','MSB'],['970437','HDBank'],['970431','Eximbank'],['970425','ABBANK'],['970449','LPBank'],['970454','Viet Capital Bank'],['970429','SCB']];
const BANK_DEFAULT = { bin: '970415', acc: '107882633015', owner: 'NGUYEN HO HOAI PHUC', branch: 'CN KCN Phú Tài - PGD Hoài Nhơn' };
const bankCfg = () => Object.assign({}, BANK_DEFAULT, S.cfg.bank || {});
const bankName = bin => (BANKS.find(b => b[0] === bin) || [0, 'Ngân hàng ' + bin])[1];
function crc16(s){ let c = 0xFFFF; for (const ch of new TextEncoder().encode(s)) { c ^= ch << 8; for (let i = 0; i < 8; i++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF; } return c.toString(16).toUpperCase().padStart(4, '0'); }
const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v;
const qrNote = s => fold(s).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 25);
function vietqr(amount, note){
  const b = bankCfg(), acct = tlv('00', 'A000000727') + tlv('01', tlv('00', b.bin) + tlv('01', b.acc)) + tlv('02', 'QRIBFTTA');
  const p = tlv('00', '01') + tlv('01', amount ? '12' : '11') + tlv('38', acct) + tlv('53', '704') + (amount ? tlv('54', String(Math.round(amount))) : '') + tlv('58', 'VN') + (note ? tlv('62', tlv('08', qrNote(note))) : '') + '6304';
  return p + crc16(p);
}
/* QR dạng vector (SVG): in bao nhiêu cũng sắc nét, không vỡ ảnh */
function qrSvg(text, size){
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), m = 4, N = n + 2 * m; let d = '';
  for (let r = 0; r < n; r++) { let c = 0; while (c < n) { if (!q.isDark(r, c)) { c++; continue; } let e = c; while (e < n && q.isDark(r, e)) e++; d += `M${c + m} ${r + m}h${e - c}v1h-${e - c}z`; c = e; } }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges" style="width:${size || '100%'};height:${size || 'auto'};display:block;background:#fff" role="img" aria-label="Mã QR"><rect width="${N}" height="${N}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
const ddmm = d => d ? d.slice(8, 10) + d.slice(5, 7) : '';
const payNote = r => `A1 ${r.cccd} ${ddmm(r.examDate)}`.trim();
const bankLine = () => { const b = bankCfg(); return `${bankName(b.bin)} · STK ${b.acc} · ${b.owner}`; };
/* QR tĩnh của đợt (không số tiền) dùng trên phiếu thu, thẻ đợt */
const dotQrHtml = (date, size) => { const o = dotOf(date); if (o && o.qrMode === 'image' && o.qr) return `<img src="${o.qr}" style="width:${size};height:${size};object-fit:contain;image-rendering:pixelated;display:block;margin:0 auto" alt="QR">`; return qrSvg(vietqr(0, ''), size); };

/* ---------------- PHÂN BỔ TIỀN VÀO TỪNG KHOẢN ----------------
   Khoản có gắn mục (chuyển bảo lưu Hình / GPLX) vào đúng mục; phần còn lại theo thứ tự duyệt HS → LT → Hình → GPLX */
function allocPays(r){
  const keys = FEE_ORDER.filter(k => r.items[k]), due = {}, paid = {}, bl = {};
  keys.forEach(k => { due[k] = r.items[k]; paid[k] = 0; bl[k] = 0; });
  let adj = r.adjust || 0; for (const k of keys.slice().reverse()) { const d = Math.min(adj, due[k]); due[k] -= d; adj -= d; }
  let pool = 0;
  for (const p of S.pays) { if (p.regId !== r.id) continue;
    if (p.item && due[p.item] != null && p.amount > 0) { const a = Math.min(p.amount, due[p.item] - paid[p.item]); paid[p.item] += a; if (p.method === 'BL') bl[p.item] += a; pool += p.amount - a; } else pool += p.amount; }
  for (const k of keys) { const a = Math.max(0, Math.min(pool, due[k] - paid[k])); paid[k] += a; pool -= a; }
  return { keys, due, paid, bl, extra: Math.max(0, pool) };
}

/* ---------------- TIỀN BẢO LƯU (VẮNG / TRƯỢT) ----------------
   Quy định của trung tâm:
   · Lệ phí LT (60k) và phí duyệt hồ sơ (50k): KHÔNG hoàn, KHÔNG bảo lưu.
   · Lệ phí Hình (70k): chỉ bảo lưu khi VẮNG CẢ 2 PHẦN, hoặc TRƯỢT LÝ THUYẾT ở đợt thi từ 01/07/2026 (thi tuần tự nên không được thi Hình).
     Đạt LT (hoặc chỉ đăng ký Hình) mà vắng Hình → không bảo lưu.
   · Phí thẻ GPLX (115k) đã nộp: bảo lưu cho tới khi thi đạt (vắng hay trượt đều giữ).
   Tiền ở đợt cũ đã bàn giao cho công ty → đợt sau chỉ thu phần học viên phải đóng thêm. */
const creditsOf = cccd => (S.credits || []).filter(c => c.cccd === cccd && c.status === 'open');
const creditLeft = (c, k) => Math.max(0, (c.items[k] || 0) - c.uses.filter(u => u.item === k).reduce((a, u) => a + u.amount, 0));
const creditTotalLeft = c => Object.keys(c.items).reduce((a, k) => a + creditLeft(c, k), 0);
const attemptAt = (cccd, date) => { const p = H.people.get(cccd); return p && p.attempts.find(a => a.date === date); };
const SEQ_FROM = () => S.cfg.seqDate || '2026-07-01';
function creditPlan(r, a){
  if (!a || a.kq === 'D') return null;
  const al = allocPays(r), items = {}, hTaken = a.h === 'D' || a.h === 'T', why = [];
  if (al.paid.H && !hTaken) {
    if (a.lt === 'V') { items.H = al.paid.H; why.push('vắng cả LT và Hình'); }
    else if (a.lt === 'T' && r.examDate >= SEQ_FROM()) { items.H = al.paid.H; why.push('trượt LT nên chưa được thi Hình'); }
  }
  if (al.paid.GPLX115) { items.GPLX115 = al.paid.GPLX115; why.push('chưa đạt, giữ phí thẻ GPLX'); }
  return Object.keys(items).length ? { items, reason: `${C.RLABEL[a.lt] || '–'} LT / ${C.RLABEL[a.h] || '–'} Hình: ${why.join('; ')}` } : null;
}
function syncCredits(){
  S.credits = S.credits || []; const made = [];
  if (S.cfg.absentAsFail === false) return made; /* quy tắc "không thu lại phần vắng" đã chuyển lệ phí sẵn */
  /* Khoản tạo theo quy định cũ (v3.6.0) mà chưa dùng: tính lại theo quy định mới */
  for (const c of S.credits.slice()) { if (c.rule === 2 || c.status !== 'open' || !c.fromReg || c.manual) continue;
    const r = S.regs.find(x => x.id === c.fromReg), pl = r && creditPlan(r, attemptAt(r.cccd, r.examDate)), used = {};
    c.uses.forEach(u => used[u.item] = (used[u.item] || 0) + u.amount);
    const items = Object.assign({}, (pl || {}).items || {}); for (const [k, v] of Object.entries(used)) items[k] = Math.max(items[k] || 0, v);
    if (JSON.stringify(items) !== JSON.stringify(c.items)) logA('Tính lại tiền bảo lưu theo quy định mới', c.cccd, c.name, `${Object.entries(c.items).map(([k, v]) => ITEM[k] + ' ' + money(v)).join(', ')} → ${Object.entries(items).map(([k, v]) => ITEM[k] + ' ' + money(v)).join(', ') || 'không bảo lưu'}`);
    if (!Object.keys(items).length) { S.credits.splice(S.credits.indexOf(c), 1); continue; }
    c.items = items; c.reason = pl ? pl.reason : c.reason; c.rule = 2; }
  for (const r of S.regs) {
    if (r.kind !== 'lai' || !r.examDate) continue;
    const id = 'cr_' + r.id; if (S.credits.some(c => c.id === id)) continue;
    const pl = creditPlan(r, attemptAt(r.cccd, r.examDate)); if (!pl) continue;
    const c = { id, cccd: r.cccd, name: r.name, fromReg: r.id, fromExam: r.examDate, items: pl.items, uses: [], status: 'open', reason: pl.reason, rule: 2, createdAt: nowISO(), by: curUser() || 'tự động' };
    S.credits.push(c); made.push(c);
    logA('Bảo lưu tiền', r.cccd, r.name, `đợt ${fd(r.examDate)}: ${Object.entries(pl.items).map(([k, v]) => ITEM[k] + ' ' + money(v)).join(', ')} · ${pl.reason} (LT và phí duyệt hồ sơ không hoàn)`);
  }
  return made;
}
/* Trừ tiền bảo lưu vào đăng ký mới (đúng khoản Hình / GPLX, hoặc mọi khoản nếu là bảo lưu toàn bộ) */
function applyCredits(r, quiet){
  let total = 0; if (!r || r.cancelled) return 0;
  for (const c of creditsOf(r.cccd)) for (const k of Object.keys(c.items)) {
    if (!r.items[k]) continue; const al = allocPays(r), need = (al.due[k] || 0) - (al.paid[k] || 0), amt = Math.min(creditLeft(c, k), need);
    if (amt <= 0) continue;
    const p = addPay({ regId: r.id, cccd: r.cccd, date: todayISO(), amount: amt, method: 'BL', item: k, creditId: c.id, note: `Chuyển bảo lưu ${ITEM[k]} từ đợt ${fd(c.fromExam)}` });
    c.uses.push({ regId: r.id, item: k, amount: amt, payId: p.id, at: nowISO() }); total += amt;
    if (!creditTotalLeft(c)) c.status = 'used';
    logA('Dùng tiền bảo lưu', r.cccd, r.name, `${p.no} · ${ITEM[k]} ${money(amt)} từ đợt ${fd(c.fromExam)} → đợt ${fd(r.examDate)}`);
  }
  if (total && !quiet) toast(`Đã trừ tiền bảo lưu ${money(total)} đ`);
  return total;
}
window.useCredit = regId => { const r = S.regs.find(x => x.id === regId); if (!r) return;
  const rows = []; for (const c of creditsOf(r.cccd)) for (const k of Object.keys(c.items)) { const left = creditLeft(c, k); if (left) rows.push({ c, k, left, has: !!r.items[k] }); }
  if (!rows.length) return toast('Học viên không còn tiền bảo lưu');
  dialog(`<h2>Trừ tiền bảo lưu · ${esc(r.name)}</h2><p class="small">Đăng ký: ${esc(partsLbl(r))} · đợt ${fd(r.examDate)} · còn phải nộp ${money(regTotals(r).left)} đ</p>
    <table><tr><th></th><th>Khoản bảo lưu</th><th>Từ đợt</th><th class="num">Còn</th><th>Đăng ký này</th></tr>${rows.map((x, i) => `<tr><td><input type="checkbox" class="cuK" data-i="${i}" ${x.has ? 'checked' : ''}></td><td>${ITEM[x.k]}</td><td class="mono">${fd(x.c.fromExam)}</td><td class="num">${money(x.left)}</td><td class="small">${x.has ? 'đang thu khoản này → trừ vào' : '<span class="r-T">chưa thu khoản này</span> → thêm khoản (vd: đã đạt LT, nay thi Hình) rồi trừ'}</td></tr>`).join('')}</table>
    <p class="small muted">Chỉ tick khoản chưa thu khi học viên thật sự phải nộp khoản đó ở đợt này (ví dụ đã đạt lý thuyết, nay thi Hình).</p>`, () => {
    let n = 0; for (const cb of document.querySelectorAll('.cuK:checked')) { const x = rows[+cb.dataset.i];
      if (!r.items[x.k]) { r.items[x.k] = x.left; r.extra = r.extra || {}; r.extra[x.k] = (r.extra[x.k] || 0) + x.left; r.extraNote = ((r.extraNote || '') + ' chuyển bảo lưu ' + ITEM[x.k]).trim(); logA('Thêm khoản để trừ bảo lưu', r.cccd, r.name, `${ITEM[x.k]} ${money(x.left)}`); } }
    n = applyCredits(r); if (!n) return toast('Không trừ được khoản nào'); save(); renderAll(); if (curId === r.cccd) showPerson(r.cccd); }, 'Trừ tiền bảo lưu'); };
window.refundCredit = id => requireRole('ketoan', 'Hoàn tiền bảo lưu', () => { const c = S.credits.find(x => x.id === id), left = creditTotalLeft(c), src = S.regs.find(r => r.id === c.fromReg);
  if (!left) return toast('Khoản này đã dùng hết');
  dialog(`<h2>Hoàn tiền bảo lưu · ${esc(c.name)}</h2><p>Còn bảo lưu <b>${money(left)} đ</b> (${Object.keys(c.items).map(k => ITEM[k] + ' ' + money(creditLeft(c, k))).join(', ')}) từ đợt ${fd(c.fromExam)}.</p><div class="row">${methodHtml('cr')}</div><label class="f" style="margin-top:8px">Lý do<input id="crWhy" value="Học viên không thi nữa, hoàn tiền bảo lưu"></label>`, () => {
    const mt = readMethod('cr'); if (!mt) return; if (!src) return blockMsg('Không tìm thấy đăng ký gốc', '<p>Đăng ký gốc đã bị xoá, không ghi được phiếu chi.</p>');
    const p = addPay({ regId: src.id, cccd: c.cccd, date: todayISO(), amount: -left, method: mt.method, txn: mt.txn, note: 'Hoàn tiền bảo lưu: ' + $('#crWhy').value });
    c.status = 'refunded'; c.refund = { payId: p.id, at: nowISO(), by: curUser(), amount: left, why: $('#crWhy').value };
    logA('Hoàn tiền bảo lưu', c.cccd, c.name, `${p.no} · ${money(left)} đ`); save(); renderAll(); toast('Đã ghi phiếu chi ' + p.no); }, 'Ghi phiếu chi'); });
window.voidCredit = id => requireAdmin('Huỷ khoản bảo lưu', () => { const c = S.credits.find(x => x.id === id);
  dialog(`<h2>Huỷ khoản bảo lưu?</h2><p>${esc(c.name)} · còn ${money(creditTotalLeft(c))} đ. Tiền đã thu vẫn giữ nguyên ở đăng ký gốc, chỉ không còn được trừ vào đợt sau.</p><label class="f">Lý do<input id="cvWhy"></label>`, () => {
    const why = $('#cvWhy').value.trim(); if (why.length < 3) return blockMsg('Chưa ghi lý do', ''); c.status = 'void'; c.voided = { at: nowISO(), by: curUser(), why }; logA('Huỷ khoản bảo lưu', c.cccd, c.name, why); save(); renderAll(); }, 'Huỷ bảo lưu'); });
/* Đăng ký có kết quả "Không có tên" mà đã nộp tiền → chờ quyết định */
const pendingMoney = () => S.regs.filter(r => r.kind === 'lai' && !r.moneyAction && examOutcome(r).k === 'none' && regTotals(r).paid > 0);
window.moneyAction = (regId, type) => { const r = S.regs.find(x => x.id === regId), t = regTotals(r);
  if (type === 'credit') return requireRole('ketoan', 'Bảo lưu toàn bộ tiền đã nộp', () => { const al = allocPays(r), items = {}; for (const k of al.keys) if (al.paid[k]) items[k] = al.paid[k];
    S.credits.push({ id: 'cr_' + r.id, cccd: r.cccd, name: r.name, fromReg: r.id, fromExam: r.examDate, items, uses: [], status: 'open', reason: 'Không có tên trong kết quả', manual: true, rule: 2, createdAt: nowISO(), by: curUser() });
    r.moneyAction = { type, at: nowISO(), by: curUser() }; logA('Bảo lưu toàn bộ tiền (không có tên)', r.cccd, r.name, money(t.paid)); save(); renderAll(); });
  if (type === 'refund') return refundDlg(r.id);
  if (type === 'keep') return dialog(`<h2>Giữ, không xử lý tiền?</h2><p>${esc(r.name)} · đã nộp ${money(t.paid)} đ · đợt ${fd(r.examDate)}</p><label class="f">Ghi chú<input id="maWhy"></label>`, () => { r.moneyAction = { type, at: nowISO(), by: curUser(), note: $('#maWhy').value }; logA('Giữ tiền, không xử lý', r.cccd, r.name, $('#maWhy').value); save(); renderAll(); }, 'Xác nhận');
};
function renderCredits(){
  const el = $('#crTable'); if (!el) return;
  const all = (S.credits || []).slice().sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.createdAt.localeCompare(a.createdAt));
  const open = all.filter(c => c.status === 'open'), sum = open.reduce((a, c) => a + creditTotalLeft(c), 0);
  $('#crSum').innerHTML = `<b>${open.length}</b> học viên đang có tiền bảo lưu, tổng <b>${money(sum)} đ</b>. Quy định: LT ${money(S.cfg.prices.LT)} và phí duyệt ${money(S.cfg.prices.DUYET)} không hoàn; lệ phí Hình ${money(S.cfg.prices.H)} chỉ bảo lưu khi vắng cả 2 phần hoặc trượt LT (đợt từ ${fd(SEQ_FROM())}); phí thẻ GPLX ${money(S.cfg.prices.GPLX)} đã nộp giữ đến khi thi đạt. Đợt sau chỉ thu phần học viên đóng thêm.`;
  el.innerHTML = all.length ? `<table><tr><th>Học viên</th><th>CCCD</th><th>Từ đợt</th><th>Lý do</th><th class="num">Bảo lưu</th><th class="num">Đã dùng</th><th class="num">Còn lại</th><th>Tình trạng</th><th></th></tr>${all.map(c => { const tot = Object.values(c.items).reduce((a, b) => a + b, 0), left = creditTotalLeft(c), ar = activeReg(c.cccd);
    return `<tr class="${c.status === 'void' ? 'kdel' : ''}"><td><a href="#" data-q="${c.cccd}">${esc(c.name)}</a></td><td class="mono">${esc(mask(c.cccd))}</td><td class="mono">${fd(c.fromExam)}</td><td class="small">${esc(c.reason || '')}<div class="muted">${Object.entries(c.items).map(([k, v]) => ITEM[k] + ' ' + money(v)).join(' · ')}</div></td><td class="num">${money(tot)}</td><td class="num">${money(tot - left)}</td><td class="num"><b>${money(left)}</b></td>
      <td>${c.status === 'open' ? '<span class="pill p-part">Đang bảo lưu</span>' : c.status === 'used' ? '<span class="pill p-paid">Đã dùng hết</span>' : c.status === 'refunded' ? '<span class="pill p-cxl">Đã hoàn</span>' : c.status === 'passed' ? `<span class="pill p-paid">Đã thi đạt ${fd(c.passed)}</span>` : '<span class="pill p-due">Đã huỷ</span>'}${c.uses.length ? `<div class="small muted">${c.uses.map(u => { const r = S.regs.find(x => x.id === u.regId); return `→ đợt ${fd(r && r.examDate)} ${ITEM[u.item]} ${money(u.amount)}`; }).join('<br>')}</div>` : ''}</td>
      <td class="act">${c.status === 'open' ? `${ar && ar.id !== c.fromReg ? `<button class="b s p" onclick="useCredit('${ar.id}')">Trừ vào đợt ${fd(ar.examDate)}</button>` : ''}<button class="b s" onclick="refundCredit('${c.id}')">Hoàn tiền</button><button class="b s" onclick="voidCredit('${c.id}')">Huỷ</button>` : ''}</td></tr>`; }).join('')}</table>` : '<div class="empty">Chưa có khoản bảo lưu nào. Tool tự tạo khi nạp kết quả: người vắng cả 2 phần / trượt LT đã nộp lệ phí Hình, người chưa đạt đã nộp phí thẻ GPLX.</div>';
  const pm = pendingMoney();
  $('#pmTable').innerHTML = pm.length ? `<div class="alert" style="margin-bottom:8px">${pm.length} người đã đăng ký, đã nộp tiền nhưng <b>không có tên</b> trong file kết quả của Hội đồng (bị loại hồ sơ, sai đợt…). Chọn cách xử lý tiền cho từng người.</div><table><tr><th>Học viên</th><th>Đợt</th><th class="num">Đã nộp</th><th></th></tr>${pm.map(r => `<tr><td><a href="#" data-q="${r.cccd}">${esc(r.name)}</a></td><td class="mono">${fd(r.examDate)}</td><td class="num">${money(regTotals(r).paid)}</td><td class="act"><button class="b s p" onclick="moneyAction('${r.id}','credit')">Bảo lưu toàn bộ sang đợt sau</button><button class="b s" onclick="moneyAction('${r.id}','refund')">Hoàn tiền</button><button class="b s" onclick="moneyAction('${r.id}','keep')">Giữ, không xử lý</button></td></tr>`).join('')}</table>` : '<div class="empty">Không có khoản tiền nào cần xử lý.</div>';
}
document.addEventListener('click', e => { const a = e.target.closest('#crTable a[data-q], #pmTable a[data-q]'); if (a) { e.preventDefault(); switchTab('quay'); $('#q').value = a.dataset.q; showPerson(a.dataset.q); } });

/* ---------------- 1. CHUYỂN TRƯỢT / VẮNG SANG ĐỢT MỚI ---------------- */
function transferPlan(from, to, kinds, regDate){
  const out = [];
  for (const r of S.regs) {
    if (r.kind !== 'lai' || r.cancelled || r.examDate !== from) continue;
    const o = examOutcome(r); if (!kinds.includes(o.k)) continue;
    const x = { r, o, ok: false, why: '' }, ev = H.ev.get(r.cccd);
    if (!ev) x.why = 'Không có trong dữ liệu sát hạch';
    else if (ev.status === 'DAT') x.why = 'Đã đạt ở kỳ sau';
    else if (withdrawnOf(r.cccd)) x.why = 'Đã rút hồ sơ';
    else if (activeReg(r.cccd)) x.why = 'Đã có đăng ký ở ' + regWhere(activeReg(r.cccd));
    else { const e2 = evalFor(r.cccd, to);
      if (e2.status === 'DAT') x.why = 'Tại đợt mới không cần thi lại';
      else if (e2.uncertain && e2.uncertain.length) x.why = 'Không rõ ngày đạt gốc → đăng ký từng người ở Quầy';
      else { const f = C.fee(e2, S.cfg, regDate); x.ok = true; x.need = e2.need; x.fee = f.total; x.items = f.items;
        x.credit = creditsOf(r.cccd).reduce((a, c) => a + Object.keys(c.items).filter(k => f.items[k]).reduce((s, k) => s + Math.min(creditLeft(c, k), f.items[k]), 0), 0);
        x.hold = creditsOf(r.cccd).reduce((a, c) => a + creditTotalLeft(c), 0) - x.credit; } }
    out.push(x);
  }
  return out.sort((a, b) => (b.ok - a.ok) || C.viNameCmp(a.r.name, b.r.name));
}
window.transferDlg = from0 => {
  const doneDots = dotsSorted().filter(o => dotDone(o.date) && S.regs.some(r => r.kind === 'lai' && r.examDate === o.date)).map(o => o.date).reverse();
  if (!doneDots.length) return blockMsg('Chưa có đợt nào có kết quả', '<p>Nạp file kết quả sát hạch của đợt đã thi trước (Dữ liệu &amp; cài đặt).</p>');
  const from = doneDots.includes(from0) ? from0 : doneDots[0], to = defaultDot();
  if (!to) return blockMsg('Chưa có đợt thi sắp tới', '<p>Thêm đợt mới ở tab Đợt thi trước.</p>');
  dialog(`<h2>Chuyển người Trượt / Vắng sang đợt mới</h2>
    <div class="row"><label class="f">Từ đợt (đã có kết quả)<select id="trFrom">${doneDots.map(d => `<option value="${d}"${d === from ? ' selected' : ''}>${esc(dotLabel(d))}</option>`).join('')}</select></label>
      <label class="f">Sang đợt${dotSelect('trTo', to)}</label><label class="f">Ngày đăng ký<input type="date" id="trReg" value="${todayISO()}"></label></div>
    <div class="chips" style="margin-top:8px"><label class="chip"><input type="checkbox" class="trK" value="T" checked> Trượt</label><label class="chip"><input type="checkbox" class="trK" value="V" checked> Vắng</label><label class="chip"><input type="checkbox" class="trK" value="none"> Không có tên trong KQ</label></div>
    <div id="trPrev" class="tw" style="margin-top:10px;max-height:46vh"></div>
    <p class="small muted">Phần thi và lệ phí được tính lại theo lần thi mới nhất và ngày thi của đợt mới. Tiền bảo lưu tự trừ vào khoản Hình / thẻ GPLX nếu đợt mới có thu; học viên chỉ đóng phần thêm. Đăng ký mới ở trạng thái chưa nộp, thu tiền sau.</p>`, () => {
    const plan = transferPlan($('#trFrom').value, $('#trTo').value, [...document.querySelectorAll('.trK:checked')].map(i => i.value), $('#trReg').value).filter(x => x.ok);
    if (!plan.length) return toast('Không có ai để chuyển');
    let n = 0, sum = 0, cr = 0; const made = [];
    for (const x of plan) { const r = makeRetake(x.r.cccd, $('#trReg').value, $('#trTo').value, `Chuyển từ đợt ${fd(x.r.examDate)} (${x.o.l})`, x.r.phone || phoneOf(x.r.cccd), ''); if (!r) continue; n++; cr += r.creditApplied || 0; sum += regTotals(r).due; made.push(r); }
    logA('Chuyển Trượt/Vắng sang đợt mới', '', '', `${n} người · đợt ${fd($('#trFrom').value)} → ${fd($('#trTo').value)} · phải thu ${money(sum)}${cr ? ' · trừ bảo lưu ' + money(cr) : ''}`);
    save(); renderAll();
    dialog(`<h2>Đã chuyển ${n} người sang đợt ${fd($('#trTo').value)}</h2><p>Tổng phải thu <b>${money(sum)} đ</b>${cr ? `, đã trừ tiền bảo lưu <b>${money(cr)} đ</b>` : ''}. Tất cả đang ở trạng thái chưa nộp đủ.</p><p class="small">Bước tiếp theo: gửi tin nhắn nhắc nộp tiền và lịch thi cho họ.</p>`, () => msgDlg(made.map(r => r.id), 'no'), 'Tạo tin nhắn nhắc nộp tiền');
  }, 'Chuyển sang đợt mới');
  const prev = () => { const plan = transferPlan($('#trFrom').value, $('#trTo').value, [...document.querySelectorAll('.trK:checked')].map(i => i.value), $('#trReg').value), ok = plan.filter(x => x.ok);
    $('#trPrev').innerHTML = `<div class="small" style="margin-bottom:6px"><b>${ok.length}</b> người sẽ được chuyển · phải thu ${money(ok.reduce((a, x) => a + x.fee, 0))} đ${ok.some(x => x.credit) ? ` · trừ bảo lưu ${money(ok.reduce((a, x) => a + x.credit, 0))} đ` : ''}${plan.length - ok.length ? ` · bỏ qua ${plan.length - ok.length}` : ''}</div>
      <table><tr><th>Họ tên</th><th>KQ đợt cũ</th><th>Thi lại</th><th class="num">Lệ phí</th><th class="num">Trừ bảo lưu</th><th>Ghi chú</th></tr>${plan.map(x => `<tr class="${x.ok ? '' : 'kdel'}"><td>${esc(x.r.name)}</td><td>${esc(x.o.l)}</td><td>${x.ok ? ndLabel(x.need) : ''}</td><td class="num">${x.ok ? money(x.fee) : ''}</td><td class="num">${x.credit ? money(x.credit) : ''}</td><td class="small">${esc(x.why)}${x.hold ? `${x.why ? ' · ' : ''}giữ bảo lưu ${money(x.hold)} (Hình trừ khi thi Hình; thẻ GPLX giữ đến khi đạt)` : ''}</td></tr>`).join('')}</table>`; };
  ['trFrom', 'trTo', 'trReg'].forEach(i => $('#' + i).addEventListener('input', prev)); document.querySelectorAll('.trK').forEach(i => i.addEventListener('change', prev)); prev();
};

/* ---------------- 8. TÓM TẮT SAU KHI NẠP KẾT QUẢ ---------------- */
function afterResultsLoaded(dates){
  const made = syncCredits(); if (made.length) save();
  const rows = dates.filter(d => S.regs.some(r => r.kind === 'lai' && r.examDate === d)).sort().map(d => { const rs = S.regs.filter(r => r.kind === 'lai' && !r.cancelled && r.examDate === d), cnt = { D: 0, T: 0, V: 0, none: 0 };
    rs.forEach(r => { const k = examOutcome(r).k; if (cnt[k] != null) cnt[k]++; }); const cr = made.filter(c => c.fromExam === d); return { d, n: rs.length, ...cnt, crN: cr.length, crSum: cr.reduce((a, c) => a + creditTotalLeft(c), 0) }; });
  if (!rows.length) return;
  const pm = pendingMoney().filter(r => dates.includes(r.examDate)).length;
  dialog(`<h2>Kết quả các đợt vừa nạp</h2><div class="tw"><table><tr><th>Đợt</th><th class="num">Đăng ký</th><th class="num">Đạt</th><th class="num">Trượt</th><th class="num">Vắng</th><th class="num">Không có tên</th><th class="num">Tỷ lệ đạt</th><th class="num">Tiền bảo lưu</th></tr>${rows.map(x => `<tr><td>${esc(dotLabel(x.d))}</td><td class="num">${x.n}</td><td class="num r-D">${x.D}</td><td class="num r-T">${x.T}</td><td class="num">${x.V}</td><td class="num">${x.none}</td><td class="num">${x.n ? (x.D / x.n * 100).toFixed(1) + '%' : ''}</td><td class="num">${x.crN ? x.crN + ' người · ' + money(x.crSum) : ''}</td></tr>`).join('')}</table></div>
    ${made.length ? `<p class="small">Đã tự bảo lưu tiền cho <b>${made.length}</b> người (Hình: vắng cả 2 phần / trượt LT; thẻ GPLX: chưa đạt; LT và phí duyệt không hoàn). Xem ở tab Sổ thu → Tiền bảo lưu.</p>` : ''}
    ${pm ? `<div class="alert">${pm} người không có tên trong kết quả nhưng đã nộp tiền: xử lý ở tab Sổ thu → Tiền cần xử lý.</div>` : ''}
    <p class="small muted">Bấm nút bên dưới để đăng ký luôn người Trượt / Vắng vào đợt tiếp theo.</p>`, () => transferDlg(rows[rows.length - 1].d), 'Chuyển Trượt/Vắng sang đợt mới');
}
function kythiTodo(){
  const out = [];
  for (const o of dotsSorted().filter(o => dotDone(o.date))) { const n = S.regs.filter(r => r.kind === 'lai' && !r.cancelled && r.examDate === o.date && ['T', 'V'].includes(examOutcome(r).k) && !activeReg(r.cccd) && !withdrawnOf(r.cccd) && (H.ev.get(r.cccd) || {}).status !== 'DAT').length;
    if (n && o.date >= addDays(todayISO(), -120)) out.push(['warn', `${n} người trượt/vắng đợt ${fd(o.date)} chưa đăng ký lại`, 'tl']); }
  const pm = pendingMoney().length; if (pm) out.push(['bad', `${pm} khoản tiền của người không có tên trong kết quả chưa xử lý`, 'thu']);
  const cr = (S.credits || []).filter(c => c.status === 'open'); if (cr.length) out.push(['warn', `${cr.length} học viên đang có tiền bảo lưu (${money(cr.reduce((a, c) => a + creditTotalLeft(c), 0))} đ)`, 'thu']);
  return out;
}
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

/* ---------------- 4. ĐỐI CHIẾU SAO KÊ NGÂN HÀNG ---------------- */
let skRows = [];
const skNum = v => { if (typeof v === 'number') return v; const s = String(v ?? '').replace(/\s/g, ''); if (!s) return 0; const neg = /^-|\(.*\)/.test(s); const n = +s.replace(/[^\d,.]/g, '').replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'); return neg ? -n : n || 0; };
function skDate(v){
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5); return d.toISOString().slice(0, 10); }
  const m = String(v || '').match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  const m2 = String(v || '').match(/(\d{4})-(\d{2})-(\d{2})/); return m2 ? m2[0] : '';
}
function parseStatement(rows){
  let hr = -1, col = {};
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const r = (rows[i] || []).map(x => fold(String(x ?? ''))), f = re => r.findIndex(x => re.test(x));
    const c = { date: f(/ngay (giao dich|gd|hach toan|thuc hien)|^ngay$|thoi gian|transaction date|^date/), desc: f(/noi dung|mo ta|dien giai|chi tiet|description|remark/), credit: f(/ghi co|so tien co|tien vao|^co$|credit/), debit: f(/ghi no|so tien no|tien ra|^no$|debit/), amount: f(/^so tien( giao dich)?$|^amount$/), ref: f(/so tham chieu|so giao dich|ma giao dich|so but toan|so ct|reference|ref/) };
    if (c.date >= 0 && c.desc >= 0 && (c.credit >= 0 || c.amount >= 0)) { hr = i; col = c; break; }
  }
  if (hr < 0) return { ok: false, err: 'Không tìm thấy dòng tiêu đề (cần có cột Ngày, Nội dung/Mô tả và Ghi có/Số tiền)' };
  const tx = [];
  for (let i = hr + 1; i < rows.length; i++) { const r = rows[i] || []; const date = skDate(r[col.date]), desc = C.norm(r[col.desc]);
    let amt = col.credit >= 0 ? skNum(r[col.credit]) : skNum(r[col.amount]); if (col.credit < 0 && col.debit >= 0 && skNum(r[col.debit])) amt = -Math.abs(skNum(r[col.debit]));
    if (!date || !desc || !(amt > 0)) continue;
    tx.push({ i, date, desc, amount: Math.round(amt), ref: C.norm(col.ref >= 0 ? r[col.ref] : '') || `${date}|${amt}|${desc.slice(0, 40)}` }); }
  return { ok: true, tx, header: hr };
}
function skMatch(t){
  const known = new Set(S.pays.filter(p => p.txn).map(p => p.txn));
  if (known.has(t.ref)) return { st: 'done', why: 'Đã ghi thu trước đó (trùng mã giao dịch)' };
  const ids = [...new Set((t.desc.match(/\d{12}/g) || []).concat((t.desc.match(/(?<!\d)\d{11}(?!\d)/g) || []).map(x => '0' + x)))];
  let cands = []; for (const id of ids) cands.push(...S.regs.filter(r => r.cccd === id && !r.cancelled && regTotals(r).left > 0));
  if (!cands.length) { const ph = (t.desc.match(/0\d{9}/g) || []); for (const p of ph) cands.push(...S.regs.filter(r => !r.cancelled && regTotals(r).left > 0 && (r.phone || phoneOf(r.cccd)) === p)); }
  if (!cands.length) return { st: 'none', why: ids.length ? 'Có CCCD ' + ids.join(', ') + ' nhưng không còn khoản nào phải thu' : 'Không thấy CCCD / SĐT trong nội dung' };
  if (cands.length > 1) { const dm = (t.desc.match(/\b(\d{4})\b/g) || []); const pick = cands.filter(r => dm.includes(ddmm(r.examDate))); if (pick.length === 1) cands = pick; }
  if (cands.length > 1) return { st: 'multi', cands, why: 'Học viên có nhiều khoản phải thu, chọn đúng đăng ký' };
  const r = cands[0], left = regTotals(r).left;
  if (t.amount > left) return { st: 'over', reg: r, why: `Chuyển ${money(t.amount)} > còn nợ ${money(left)}: ghi ${money(left)}, phần dư xử lý tay` };
  return { st: 'ok', reg: r, why: t.amount < left ? `Nộp một phần, còn nợ ${money(left - t.amount)}` : 'Khớp đủ' };
}
async function skLoad(file){
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, raw: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  const res = parseStatement(rows); if (!res.ok) { $('#skOut').innerHTML = `<div class="alert bad">${esc(res.err)}</div>`; return; }
  skRows = res.tx.map(t => Object.assign(t, skMatch(t), { pick: null }));
  skRows.forEach(x => { if (x.st === 'ok' || x.st === 'over') x.pick = x.reg.id; });
  logA('Nạp sao kê ngân hàng', '', '', `${file.name}: ${skRows.length} giao dịch tiền vào`); save(); skRender(file.name);
}
function skRender(name){
  const c = s => skRows.filter(x => x.st === s).length, sel = skRows.filter(x => x.pick && x.st !== 'done');
  $('#skOut').innerHTML = `<div class="kpis" style="margin:8px 0"><div class="kpi ok"><span>Khớp</span><b>${c('ok') + c('over')}</b></div><div class="kpi warn"><span>Cần chọn</span><b>${c('multi')}</b></div><div class="kpi bad"><span>Không khớp</span><b>${c('none')}</b></div><div class="kpi"><span>Đã ghi trước đó</span><b>${c('done')}</b></div><div class="kpi ok"><span>Sẽ ghi thu</span><b>${money(sel.reduce((a, x) => a + Math.min(x.amount, regTotals(S.regs.find(r => r.id === x.pick)).left), 0))}</b></div></div>
    <div class="tw" style="max-height:60vh"><table><tr><th></th><th>Ngày</th><th>Mã GD</th><th>Nội dung chuyển khoản</th><th class="num">Số tiền</th><th>Học viên / đăng ký</th><th>Ghi chú</th></tr>${skRows.map((x, i) => `<tr class="${x.st === 'done' ? 'kdel' : ''}"><td>${x.st === 'done' ? '' : `<input type="checkbox" data-sk="${i}" ${x.pick ? 'checked' : ''} ${x.st === 'none' && !x.pick ? 'disabled' : ''}>`}</td><td class="mono">${fd(x.date)}</td><td class="mono small">${esc(x.ref)}</td><td class="small" style="white-space:normal;min-width:240px">${esc(x.desc)}</td><td class="num"><b>${money(x.amount)}</b></td>
      <td>${x.st === 'multi' ? `<select data-skp="${i}"><option value="">— chọn —</option>${x.cands.map(r => `<option value="${r.id}"${x.pick === r.id ? ' selected' : ''}>${esc(r.name)} · đợt ${fd(r.examDate)} · còn ${money(regTotals(r).left)}</option>`).join('')}</select>` : x.reg ? `${esc(x.reg.name)}<div class="small muted">${esc(partsLbl(x.reg))} · đợt ${fd(x.reg.examDate)} · còn ${money(regTotals(x.reg).left)}</div>` : x.st === 'none' ? `<button class="b s" data-skm="${i}">Chọn học viên…</button>` : ''}</td>
      <td class="small ${x.st === 'ok' ? 'r-D' : x.st === 'done' ? 'muted' : 'r-T'}">${esc(x.why)}</td></tr>`).join('')}</table></div>
    <div class="row" style="margin-top:10px"><button class="b p" id="skGo">Ghi thu ${sel.length} giao dịch đã chọn</button><button class="b" id="skExp">Xuất bảng đối chiếu (Excel)</button><span class="small muted">${esc(name || '')}</span></div>`;
  $('#skGo').onclick = skCommit; $('#skExp').onclick = skExport;
}
$('#skFile').onchange = e => { const f = e.target.files[0]; if (f) skLoad(f); e.target.value = ''; };
$('#skOut').addEventListener('change', e => { const cb = e.target.closest('[data-sk]'), sp = e.target.closest('[data-skp]');
  if (cb) { const x = skRows[+cb.dataset.sk]; x.pick = cb.checked ? (x.pick || (x.reg && x.reg.id) || null) : null; if (cb.checked && !x.pick) { cb.checked = false; toast('Chọn đăng ký trước'); } skRender(); }
  if (sp) { skRows[+sp.dataset.skp].pick = sp.value || null; skRender(); } });
$('#skOut').addEventListener('click', e => { const b = e.target.closest('[data-skm]'); if (!b) return; const x = skRows[+b.dataset.skm];
  const owe = S.regs.filter(r => !r.cancelled && regTotals(r).left > 0).sort((a, b) => C.viNameCmp(a.name, b.name));
  dialog(`<h2>Gán giao dịch cho học viên</h2><p class="small">${esc(x.desc)} · <b>${money(x.amount)} đ</b></p><label class="f">Học viên còn nợ<select id="skSel">${owe.map(r => `<option value="${r.id}">${esc(r.name)} · ${esc(r.cccd)} · đợt ${fd(r.examDate)} · còn ${money(regTotals(r).left)}</option>`).join('')}</select></label>`, () => { x.pick = $('#skSel').value; x.st = 'manual'; x.why = 'Gán tay'; skRender(); }, 'Gán'); });
function skCommit(){
  const sel = skRows.filter(x => x.pick && x.st !== 'done'); if (!sel.length) return toast('Chưa chọn giao dịch nào');
  requireRole('ketoan', `Ghi thu ${sel.length} giao dịch từ sao kê`, () => {
    let n = 0, sum = 0;
    for (const x of sel) { const r = S.regs.find(y => y.id === x.pick); if (!r) continue; const left = regTotals(r).left, amt = Math.min(x.amount, left); if (amt <= 0) continue;
      if (S.pays.some(p => p.txn === x.ref)) continue;
      const p = addPay({ regId: r.id, cccd: r.cccd, date: x.date > todayISO() ? todayISO() : x.date, amount: amt, method: 'CK', txn: x.ref, note: 'Sao kê NH: ' + x.desc.slice(0, 80) + (amt < x.amount ? ` (chuyển ${money(x.amount)}, dư ${money(x.amount - amt)})` : '') });
      logA('Thu tiền (sao kê)', r.cccd, r.name, `${p.no} · ${money(amt)} đ CK ${x.ref}`); n++; sum += amt; x.st = 'done'; x.why = 'Vừa ghi thu ' + p.no; }
    save(); renderAll(); skRender(); toast(`Đã ghi thu ${n} giao dịch, ${money(sum)} đ`);
  });
}
function skExport(){
  kWrite([['Doi chieu', kSheet('ĐỐI CHIẾU SAO KÊ NGÂN HÀNG', [`${bankLine()} · Lập ${fd(todayISO())}${curUser() ? ' · ' + curUser() : ''}`], [{ h: 'Ngày', w: 12, k: 'date' }, { h: 'Mã giao dịch', w: 18 }, { h: 'Nội dung', w: 50, wrap: 1 }, { h: 'Số tiền', w: 14, k: 'money' }, { h: 'Học viên', w: 26 }, { h: 'CCCD', w: 15, k: 'ctr' }, { h: 'Đợt', w: 12, k: 'date' }, { h: 'Kết quả', w: 40, wrap: 1 }],
    skRows.map(x => { const r = S.regs.find(y => y.id === (x.pick || (x.reg && x.reg.id))) || {}; return { c: [x.date, x.ref, x.desc, x.amount, r.name || '', r.cccd || '', r.examDate || '', x.why], color: { 7: x.st === 'none' || x.st === 'multi' ? 'A1261E' : undefined } }; })
    .concat([{ t: 't', c: ['', '', 'TỔNG TIỀN VÀO', skRows.reduce((a, x) => a + x.amount, 0), '', '', '', ''] }]), true), 8]], `DOI_CHIEU_SAO_KE_${todayISO()}.xlsx`);
}

/* ---------------- 5. GIẤY HẸN SÁT HẠCH (nửa A4, kèm QR nộp tiền đúng số còn nợ) ---------------- */
function henHtml(r){
  const t = regTotals(r), o = dotOf(r.examDate) || {}, ev = H.ev.get(r.cccd), al = allocPays(r), b = bankCfg();
  const nd = partsLbl(r).replace('LT → H', 'Lý thuyết (đạt rồi thi Hình)').replace('LT+H', 'Lý thuyết và Hình').replace(/^LT$/, 'Lý thuyết').replace(/^H$/, 'Hình');
  const bl = reservedDate(r);
  return `<div class="henpage"><div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:start"><div></div><div style="text-align:center;font-weight:bold;font-size:14px">${ORG}</div><div style="text-align:right;font-weight:bold">${ORG_SITE}</div></div>
    <div style="text-align:center;margin-top:3mm"><b style="font-size:17px">GIẤY HẸN SÁT HẠCH LẠI</b><br><i>Hạng A1 · Ngày lập ${fd(todayISO())}</i></div>
    <div style="display:flex;gap:5mm;margin-top:3mm"><div style="flex:1;min-width:0;line-height:1.6">
      Họ và tên: <b>${esc(r.name)}</b> &nbsp; Ngày sinh: ${esc(dobText(r.dob))}<br>CCCD: ${esc(r.cccd)}${r.phone || phoneOf(r.cccd) ? ' &nbsp; SĐT: ' + esc(r.phone || phoneOf(r.cccd)) : ''}<br>
      Nội dung sát hạch lại: <b>${esc(nd)}</b>${bl ? ` <i>(bảo lưu phần đã đạt ngày ${fd(bl)})</i>` : ''}<br>
      Ngày sát hạch: <b style="font-size:15px">${fd(r.examDate)}</b>${o.time ? ` &nbsp; Có mặt lúc: <b>${esc(o.time)}</b>` : ''}<br>
      Địa điểm: <b>${esc(o.place || S.cfg.henPlace || 'theo thông báo của Trung tâm')}</b><br>
      Mang theo: ${esc(S.cfg.henDocs || 'CCCD bản gốc; đến đúng giờ, trang phục gọn gàng')}<br>
      Lệ phí: ${al.keys.map(k => `${ITEM[k]} ${money(al.due[k])}`).join(' + ')} = <b>${money(t.due)} đ</b> · đã nộp ${money(t.paid)} đ · <b>${t.left ? 'CÒN PHẢI NỘP ' + money(t.left) + ' đ' : 'ĐÃ NỘP ĐỦ'}</b>
    </div>
    ${t.left ? `<div style="width:46mm;flex:none;text-align:center">${qrSvg(vietqr(t.left, payNote(r)), '44mm')}<div style="font-size:10.5px;line-height:1.3;margin-top:1mm">Quét để chuyển <b>${money(t.left)} đ</b><br>${esc(bankName(b.bin))} · ${esc(b.acc)}<br>${esc(b.owner)}<br>Nội dung: <b>${esc(qrNote(payNote(r)))}</b></div></div>` : ''}</div>
    <table style="width:100%;margin-top:3mm"><tr><td style="width:55%;font-size:11.5px"><i>Lệ phí lý thuyết và phí duyệt hồ sơ không hoàn. Lệ phí Hình chỉ bảo lưu khi vắng cả 2 phần hoặc trượt lý thuyết; phí thẻ GPLX đã nộp được giữ đến khi thi đạt.</i></td><td style="text-align:center"><b>Người lập</b><br><i>(Ký, ghi rõ họ tên)</i><div style="height:11mm"></div>${esc(curUser() || '')}</td></tr></table></div>`;
}
window.printHen = ids => { const regs = ids.map(id => S.regs.find(r => r.id === id)).filter(r => r && !r.cancelled); if (!regs.length) return toast('Không có đăng ký nào để in');
  regs.forEach(r => (r.henPrinted = r.henPrinted || []).push({ at: nowISO(), by: curUser() })); logA('In giấy hẹn sát hạch', '', '', `${regs.length} người`); save();
  printFull(regs.map(henHtml).join('')); };

/* ---------------- 6. TIN NHẮN HÀNG LOẠT ---------------- */
const MSG_TPL = {
  no: 'A1 CSHN thông báo: {TEN} đã đăng ký sát hạch lại {PHAN} ngày {DOT}. Lệ phí còn phải nộp {CONNO} đ. Chuyển khoản {NGANHANG} STK {STK} ({CHUTK}), nội dung: {NOIDUNG}. Hoặc nộp trực tiếp tại văn phòng Trung tâm. Xin cảm ơn!',
  lich: 'A1 CSHN thông báo: {TEN} sát hạch lại {PHAN} ngày {DOT}{GIO}{DIADIEM}. Vui lòng mang CCCD bản gốc và có mặt đúng giờ.{NHACNO}',
  kq: 'A1 CSHN thông báo: {TEN} chưa đạt / vắng kỳ sát hạch vừa qua. Trung tâm đã đăng ký cho anh/chị thi lại {PHAN} ngày {DOT}, lệ phí {PHAITHU} đ (còn phải nộp {CONNO} đ). Liên hệ văn phòng để xác nhận. Xin cảm ơn!'
};
function msgFill(tpl, r){ const t = regTotals(r), o = dotOf(r.examDate) || {}, b = bankCfg();
  const v = { TEN: r.name, PHAN: ndLabel(r.parts), DOT: fd(r.examDate), GIO: o.time ? ' lúc ' + o.time : '', DIADIEM: (o.place || S.cfg.henPlace) ? ' tại ' + (o.place || S.cfg.henPlace) : '', CONNO: money(t.left), PHAITHU: money(t.due), NGANHANG: bankName(b.bin), STK: b.acc, CHUTK: b.owner, NOIDUNG: qrNote(payNote(r)), SDT: r.phone || phoneOf(r.cccd), NHACNO: t.left ? ` Lệ phí còn phải nộp ${money(t.left)} đ, vui lòng nộp trước ngày thi.` : '' };
  return tpl.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m); }
window.msgDlg = (ids, kind) => { const regs = ids.map(id => S.regs.find(r => r.id === id)).filter(Boolean); if (!regs.length) return toast('Chưa chọn ai');
  dialog(`<h2>Tin nhắn cho ${regs.length} học viên</h2><div class="row"><label class="f">Mẫu<select id="msK"><option value="no">Nhắc nộp lệ phí</option><option value="lich">Nhắc lịch thi</option><option value="kq">Báo đã đăng ký thi lại</option></select></label><span class="small muted" style="flex:1">Chỗ trong ngoặc {…} tự điền: {TEN} {PHAN} {DOT} {GIO} {DIADIEM} {CONNO} {PHAITHU} {NGANHANG} {STK} {CHUTK} {NOIDUNG} {NHACNO}</span></div>
    <label class="f" style="margin-top:6px">Nội dung mẫu<textarea id="msT" rows="3"></textarea></label><div id="msL" class="tw" style="margin-top:8px;max-height:40vh"></div>
    <div class="row" style="margin-top:8px"><button type="button" class="b s" id="msCopy">Sao chép tất cả</button><button type="button" class="b s" id="msXls">Xuất Excel (SĐT + nội dung)</button><span class="small muted">Bấm “Ghi đã báo” để lưu vào lịch sử liên hệ từng người.</span></div>`, () => {
    regs.forEach(r => (S.contacts[r.cccd] = S.contacts[r.cccd] || []).push({ at: nowISO(), by: curUser(), result: 'Đã nhắn Zalo / SMS', note: $('#msK').selectedOptions[0].text, phone: (r.phone || phoneOf(r.cccd) || '').replace(/\D/g, '') }));
    logA('Gửi tin nhắn hàng loạt', '', '', `${regs.length} người · ${$('#msK').selectedOptions[0].text}`); save(); toast('Đã ghi lịch sử liên hệ cho ' + regs.length + ' người'); }, 'Ghi đã báo');
  const list = () => regs.map(r => ({ r, phone: r.phone || phoneOf(r.cccd), text: msgFill($('#msT').value, r) }));
  const draw = () => { $('#msL').innerHTML = `<table><tr><th>Họ tên</th><th>SĐT</th><th>Nội dung</th><th></th></tr>${list().map((x, i) => `<tr><td>${esc(x.r.name)}</td><td class="mono">${esc(x.phone || '—')}</td><td class="small" style="white-space:normal;min-width:320px">${esc(x.text)}</td><td><button type="button" class="b s" data-msc="${i}">Sao chép</button></td></tr>`).join('')}</table>`; };
  const setK = () => { $('#msT').value = MSG_TPL[$('#msK').value]; draw(); };
  $('#msK').value = kind || 'no'; setK(); $('#msK').onchange = setK; $('#msT').oninput = draw;
  const copy = t => (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Đã sao chép'), () => toast('Trình duyệt chặn sao chép'));
  $('#msL').onclick = e => { const b = e.target.closest('[data-msc]'); if (b) copy(list()[+b.dataset.msc].text); };
  $('#msCopy').onclick = () => copy(list().map(x => `${x.r.name} - ${x.phone || ''}\n${x.text}`).join('\n\n'));
  $('#msXls').onclick = () => exportXlsx(`TIN_NHAN_${todayISO()}.xlsx`, [['Tin nhan', list().map((x, i) => ({ 'STT': i + 1, 'Họ và tên': x.r.name, 'SĐT': x.phone || '', 'Đợt thi': fd(x.r.examDate), 'Còn nợ': regTotals(x.r).left, 'Nội dung': x.text })), { title: 'Danh sách tin nhắn gửi học viên', wide: { 'Nội dung': 90 } }]]);
};

/* ---------------- 7. BIÊN BẢN NỘP LỆ PHÍ (từ Tổng kết) ---------------- */
function numWords(n){
  n = Math.round(Math.abs(n)); if (!n) return 'Không đồng';
  const d = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const tri = (x, full) => { const h = Math.floor(x / 100), t = Math.floor(x % 100 / 10), u = x % 10; let s = [];
    if (h || full) s.push(d[h] + ' trăm');
    if (t > 1) { s.push(d[t] + ' mươi'); if (u === 1) s.push('mốt'); else if (u === 5) s.push('lăm'); else if (u) s.push(d[u]); }
    else if (t === 1) { s.push('mười'); if (u === 5) s.push('lăm'); else if (u) s.push(d[u]); }
    else if (u) { if (h || full) s.push('lẻ'); s.push(d[u]); }
    return s.join(' '); };
  const units = ['', ' nghìn', ' triệu', ' tỷ']; const parts = []; let i = 0, x = n;
  while (x > 0) { parts.unshift({ v: x % 1000, u: units[i % 4] + (i >= 4 ? ' tỷ' : '') }); x = Math.floor(x / 1000); i++; }
  const s = parts.map((p, j) => p.v ? tri(p.v, j > 0) + p.u : '').filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1) + ' đồng';
}
window.printBienBan = () => {
  const items = tkSel(), rows = tkRows; if (!rows.length || !items.length) return toast('Không có dữ liệu (chọn đợt và khoản ở trên)');
  const ag = tkAgg(rows, items), dot = $('#tkDot').value, dl = dot === '*' ? 'tất cả các đợt' : 'đợt sát hạch ' + dotLabel(dot), [y, m, d] = todayISO().split('-');
  const total = items.reduce((a, k) => a + ag.it[k].amt, 0), price = k => S.cfg.prices[k === 'GPLX115' ? 'GPLX' : k];
  printFull(`<div style="display:grid;grid-template-columns:1fr 1fr"><div style="text-align:center;font-weight:bold">${ORG}<br>${ORG_SITE}</div><div style="text-align:center;font-weight:bold">CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM<br><u>Độc lập - Tự do - Hạnh phúc</u></div></div>
    <div style="text-align:center;margin:7mm 0 4mm"><b style="font-size:18px">BIÊN BẢN BÀN GIAO LỆ PHÍ SÁT HẠCH LẠI</b><br><i>Hạng A1 · ${esc(dl)}</i></div>
    <p>Hôm nay, ngày ${d} tháng ${m} năm ${y}, tại ${ORG_SITE}, chúng tôi gồm:<br>BÊN GIAO: ${esc(curUser() || '................................................')}<br>BÊN NHẬN: ................................................................................................</p>
    <p>Cùng thống nhất bàn giao lệ phí sát hạch lại của <b>${ag.n}</b> học viên ${esc(dl)} như sau:</p>
    <table class="k" style="width:100%;border-collapse:collapse"><tr><th>STT</th><th style="text-align:left">Khoản</th><th>Số học viên đã nộp</th><th style="text-align:right">Đơn giá (đ)</th><th style="text-align:right">Thành tiền (đ)</th></tr>
    ${items.map((k, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${TK_ITEMS[k]}</td><td style="text-align:center">${ag.it[k].n}</td><td style="text-align:right">${money(price(k))}</td><td style="text-align:right">${money(ag.it[k].amt)}</td></tr>`).join('')}
    <tr><td></td><td colspan="3"><b>TỔNG CỘNG</b></td><td style="text-align:right"><b>${money(total)}</b></td></tr></table>
    <p>Số tiền bằng chữ: <b><i>${numWords(total)}</i></b>.</p>
    ${ag.bl ? `<p style="font-size:12.5px">Ngoài số tiền trên, <b>${ag.nBl}</b> học viên được trừ tiền bảo lưu tổng <b>${money(ag.bl)} đ</b> (đã nộp và đã bàn giao ở đợt trước) — <b>không bàn giao lại</b>.</p>` : ''}
    ${(() => { const cr = (S.credits || []).filter(c => (dot === '*' || c.fromExam === dot) && c.status !== 'void'); const sm = cr.reduce((a, c) => a + Object.values(c.items).reduce((x, y) => x + y, 0), 0); return sm ? `<p style="font-size:12.5px">Trong tiền đã nộp ${dot === '*' ? '' : 'của đợt này '}có <b>${money(sm)} đ</b> của <b>${cr.length}</b> học viên vắng / chưa đạt được <b>bảo lưu</b> sang đợt sau (lệ phí Hình, thẻ GPLX): đợt sau không thu lại khoản này.</p>` : ''; })()}
    <p style="font-size:12.5px">Kèm theo: danh sách chi tiết ${ag.n} học viên (xuất từ “Tổng kết tiền thi lại”). Biên bản lập thành 02 bản, mỗi bên giữ 01 bản.</p>
    <table style="width:100%;margin-top:6mm"><tr><td style="text-align:center;width:50%"><b>BÊN GIAO</b><br><i>(Ký, ghi rõ họ tên)</i></td><td style="text-align:center"><b>BÊN NHẬN</b><br><i>(Ký, ghi rõ họ tên)</i></td></tr><tr><td style="height:24mm;text-align:center;vertical-align:bottom">${esc(curUser() || '')}</td><td></td></tr></table>`);
  logA('In biên bản nộp lệ phí', '', '', `${dl} · ${money(total)} đ`); save();
};

/* ---------------- 3. CÀI ĐẶT NGÂN HÀNG ---------------- */
function renderBankPanel(){
  const el = $('#bankPanel'); if (!el) return; const b = bankCfg();
  el.innerHTML = `<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start"><div style="flex:1;min-width:280px">
    <div class="row"><label class="f">Ngân hàng<select id="bkBin">${BANKS.map(([v, n]) => `<option value="${v}"${v === b.bin ? ' selected' : ''}>${n} (${v})</option>`).join('')}</select></label><label class="f">Số tài khoản<input id="bkAcc" class="mono" value="${esc(b.acc)}"></label></div>
    <div class="row" style="margin-top:8px"><label class="f" style="flex:1">Chủ tài khoản (không dấu)<input id="bkOwner" value="${esc(b.owner)}"></label><label class="f" style="flex:1">Chi nhánh<input id="bkBranch" value="${esc(b.branch)}"></label></div>
    <div class="row" style="margin-top:8px"><label class="f" style="flex:1">Địa điểm sát hạch (in trên giấy hẹn, tin nhắn)<input id="bkPlace" value="${esc(S.cfg.henPlace || '')}" placeholder="vd: Sân sát hạch …"></label></div>
    <div class="row" style="margin-top:8px"><label class="f" style="flex:1">Giấy tờ mang theo<input id="bkDocs" value="${esc(S.cfg.henDocs || 'CCCD bản gốc; đến đúng giờ, trang phục gọn gàng')}"></label><button class="b p" id="bkSave">Lưu</button></div>
    <p class="small muted">Mã QR được tạo theo chuẩn VietQR (NAPAS 247) dạng hình vector nên in ra luôn sắc nét. Mỗi học viên có QR riêng ghi sẵn <b>đúng số tiền còn nợ</b> và nội dung <span class="mono">A1 &lt;CCCD&gt; &lt;ngày tháng đợt&gt;</span> để đối chiếu sao kê tự động.</p></div>
    <div style="width:170px;text-align:center"><div class="small muted">QR tài khoản (thử quét)</div>${qrSvg(vietqr(0, ''), '160px')}<div class="small">${esc(bankName(b.bin))}<br><b class="mono">${esc(b.acc)}</b><br>${esc(b.owner)}</div></div></div>`;
  $('#bkSave').onclick = () => requireAdmin('Đổi tài khoản nhận tiền', () => { const acc = $('#bkAcc').value.replace(/\D/g, ''), owner = fold($('#bkOwner').value).toUpperCase().replace(/[^A-Z ]/g, '').trim();
    if (acc.length < 6) return blockMsg('Số tài khoản không hợp lệ', ''); if (!owner) return blockMsg('Thiếu tên chủ tài khoản', '');
    const nb = { bin: $('#bkBin').value, acc, owner, branch: C.norm($('#bkBranch').value) }; logA('Đổi tài khoản nhận tiền', '', '', `${bankName(b.bin)} ${b.acc} → ${bankName(nb.bin)} ${nb.acc}`);
    S.cfg.bank = nb; S.cfg.henPlace = C.norm($('#bkPlace').value); S.cfg.henDocs = C.norm($('#bkDocs').value); save(); renderBankPanel(); renderDots(); toast('Đã lưu'); });
}
function creditRecalc(){ for (const c of S.credits || []) { c.uses = S.pays.filter(p => p.creditId === c.id).map(p => ({ regId: p.regId, item: p.item, amount: p.amount, payId: p.id, at: p.createdAt }));
  if (c.status === 'open' || c.status === 'used') c.status = creditTotalLeft(c) ? 'open' : 'used';
  if (c.status === 'open') { const ev = H.ev.get(c.cccd); if (ev && ev.status === 'DAT' && ev.passDate && ev.passDate > c.fromExam) { c.status = 'passed'; c.passed = ev.passDate; } } } }
$('#tlBulkHen').onclick = () => printHen([...tlSel]);
$('#tlBulkMsg').onclick = () => msgDlg([...tlSel], 'lich');
$('#tlTransfer').onclick = () => transferDlg($('#tlDot').value);
/* File sao kê mẫu theo bố cục sao kê tài khoản VietinBank (dữ liệu giả để tập dùng) */
function skSampleWb(){
  const b = bankCfg(), F = 'Arial', thin = { style: 'thin', color: { rgb: '9E9E9E' } }, B = { top: thin, bottom: thin, left: thin, right: thin }, RED = 'C8102E', BLUE = '005BAA';
  const owe = S.regs.filter(r => r.kind === 'lai' && !r.cancelled && regTotals(r).left > 0).slice(0, 3);
  const demo = owe.length ? owe.map(r => ({ id: r.cccd, name: fold(r.name).toUpperCase(), amt: regTotals(r).left, dd: ddmm(r.examDate) })) : [{ id: '052000000001', name: 'NGUYEN VAN A', amt: 295000, dd: '2711' }, { id: '052000000002', name: 'TRAN THI B', amt: 180000, dd: '2711' }, { id: '052000000003', name: 'LE VAN C', amt: 60000, dd: '2711' }];
  const t = todayISO(), d = (n) => fd(addDays(t, n)), tm = ['08:15:22', '09:02:41', '10:37:05', '13:20:18', '14:48:56', '16:05:33', '16:40:12'];
  let bal = 12500000; const tx = [
    [d(-2) + ' ' + tm[0], 'FT' + t.replace(/-/g, '').slice(2) + '10001', `CT DEN:${'4' + String(Date.now()).slice(-8)} ${demo[0].name} chuyen tien A1 ${demo[0].id} ${demo[0].dd}`, 0, demo[0].amt],
    [d(-2) + ' ' + tm[1], 'FT' + t.replace(/-/g, '').slice(2) + '10002', 'MBVCB.' + String(Date.now()).slice(-9) + `.${demo[1 % demo.length].name} nop le phi thi lai ${demo[1 % demo.length].id}.CT tu 1012345678 toi ${b.acc}`, 0, demo[1 % demo.length].amt],
    [d(-1) + ' ' + tm[2], 'FT' + t.replace(/-/g, '').slice(2) + '10003', 'CT DEN:' + String(Date.now()).slice(-9) + ' PHAM VAN D chuyen khoan', 0, 500000],
    [d(-1) + ' ' + tm[3], 'FT' + t.replace(/-/g, '').slice(2) + '10004', 'Phi SMS Banking thang ' + t.slice(5, 7), 11000, 0],
    [d(0) + ' ' + tm[4], 'FT' + t.replace(/-/g, '').slice(2) + '10005', `IBFT A1 ${demo[2 % demo.length].id} ${demo[2 % demo.length].dd} ${demo[2 % demo.length].name}`, 0, demo[2 % demo.length].amt],
    [d(0) + ' ' + tm[5], 'FT' + t.replace(/-/g, '').slice(2) + '10006', 'Rut tien mat tai quay', 2000000, 0]];
  const rows = tx.map((x, i) => { bal += x[4] - x[3]; return [i + 1, x[0], x[1], x[2], x[3] || '', x[4] || '', bal]; });
  const aoa = [['NGÂN HÀNG TMCP CÔNG THƯƠNG VIỆT NAM'], ['VIETNAM JOINT STOCK COMMERCIAL BANK FOR INDUSTRY AND TRADE'], [], ['SAO KÊ TÀI KHOẢN / ACCOUNT STATEMENT'], ['(BẢN MẪU ĐỂ TẬP ĐỐI CHIẾU – DỮ LIỆU GIẢ / SAMPLE – NOT A REAL STATEMENT)'], [],
    ['Chi nhánh / Branch:', '', '', b.branch], ['Số tài khoản / Account number:', '', '', b.acc], ['Tên tài khoản / Account name:', '', '', b.owner], ['Loại tiền / Currency:', '', '', 'VND'],
    ['Từ ngày / From date:', '', '', d(-2) + '   Đến ngày / To date: ' + d(0)], ['Số dư đầu kỳ / Opening balance:', '', '', 12500000], [],
    ['STT\nNo.', 'Ngày giao dịch\nTransaction date', 'Số giao dịch\nTransaction No.', 'Mô tả giao dịch\nTransaction description', 'Ghi nợ\nDebit', 'Ghi có\nCredit', 'Số dư\nBalance'], ...rows, [],
    ['', '', '', 'Tổng phát sinh / Total', rows.reduce((a, r) => a + (+r[4] || 0), 0), rows.reduce((a, r) => a + (+r[5] || 0), 0), ''], ['', '', '', 'Số dư cuối kỳ / Closing balance', '', '', bal]];
  const ws = XLSX.utils.aoa_to_sheet(aoa), HR = 13, cell = (r, c) => { const ref = XLSX.utils.encode_cell({ r, c }); if (!ws[ref]) ws[ref] = { t: 's', v: '' }; return ws[ref]; };
  cell(0, 0).s = { font: { name: F, sz: 13, bold: true, color: { rgb: BLUE } } }; cell(1, 0).s = { font: { name: F, sz: 9, color: { rgb: BLUE } } };
  cell(3, 0).s = { font: { name: F, sz: 15, bold: true, color: { rgb: RED } }, alignment: { horizontal: 'center' } }; cell(4, 0).s = { font: { name: F, sz: 9, italic: true, color: { rgb: '7A7A7A' } }, alignment: { horizontal: 'center' } };
  for (let r = 6; r <= 11; r++) { cell(r, 0).s = { font: { name: F, sz: 10, bold: true } }; cell(r, 3).s = { font: { name: F, sz: 10 }, numFmt: '#,##0', alignment: { horizontal: 'left' } }; }
  for (let c = 0; c < 7; c++) cell(HR, c).s = { font: { name: F, sz: 10, bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: BLUE } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: B };
  rows.forEach((x, i) => { for (let c = 0; c < 7; c++) { const e = cell(HR + 1 + i, c); e.s = { font: { name: F, sz: 10, color: c === 5 && x[5] ? { rgb: '1B7F3B' } : c === 4 && x[4] ? { rgb: RED } : undefined }, border: B, alignment: { horizontal: c >= 4 ? 'right' : c === 0 ? 'center' : 'left', vertical: 'center', wrapText: c === 3 }, fill: i % 2 ? { fgColor: { rgb: 'F2F6FA' } } : undefined }; if (c >= 4 && e.v !== '') { e.t = 'n'; e.z = '#,##0'; } } });
  for (const rr of [aoa.length - 2, aoa.length - 1]) for (let c = 3; c < 7; c++) { const e = cell(rr, c); e.s = { font: { name: F, sz: 10, bold: true }, alignment: { horizontal: c === 3 ? 'right' : 'right' } }; if (c > 3 && e.v !== '') { e.t = 'n'; e.z = '#,##0'; } }
  ws['!merges'] = [0, 1, 3, 4].map(r => ({ s: { r, c: 0 }, e: { r, c: 6 } })).concat([6, 7, 8, 9, 10, 11].map(r => ({ s: { r, c: 0 }, e: { r, c: 2 } })), [6, 7, 8, 9, 10, 11].map(r => ({ s: { r, c: 3 }, e: { r, c: 6 } })));
  ws['!cols'] = [{ wch: 6 }, { wch: 20 }, { wch: 18 }, { wch: 62 }, { wch: 14 }, { wch: 14 }, { wch: 16 }]; ws['!rows'] = []; ws['!rows'][HR] = { hpt: 30 };
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sao ke'); return wb;
}
$('#skSample').onclick = () => { XLSX.writeFile(skSampleWb(), 'SAO_KE_MAU_VIETINBANK.xlsx'); toast('Đã tải file sao kê mẫu. Nạp thử bằng nút “Chọn file sao kê…”'); };
