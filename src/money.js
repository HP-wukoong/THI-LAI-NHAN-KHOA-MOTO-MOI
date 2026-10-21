/* =====================================================================
   TIỀN & CHỨNG TỪ: số phiếu thu/chi liên tục, hình thức nộp, chốt quỹ ca
   ===================================================================== */
const PM = { TM: 'Tiền mặt', CK: 'Chuyển khoản', BL: 'Chuyển tiền bảo lưu' };
const isCash = p => p.method !== 'BL'; /* khoản chuyển bảo lưu không phải tiền thực thu: không vào quỹ, không chốt ca */
const allPaysEver = () => S.pays.concat(S.trash.filter(t => t.type === 'pay').map(t => t.pay), ...S.trash.filter(t => t.type === 'reg').map(t => t.pays || []));
function nextNo(kind, date){
  S.seq = S.seq || { PT: {}, PC: {}, BL: {} }; S.seq[kind] = S.seq[kind] || {};
  const y = (date || todayISO()).slice(0, 4), n = Math.max(S.seq[kind][y] || 0, maxNo(allPaysEver(), kind, y)) + 1;
  S.seq[kind][y] = n; return `${kind}-${y}-${String(n).padStart(4, '0')}`;
}
/* Mọi khoản thu / chi mới đều đi qua đây: đánh số phiếu, hình thức, người thu, thời điểm, máy */
function addPay(p){
  p.id = p.id || uid(); p.amount = Math.round(+p.amount || 0); p.method = p.method === 'CK' || p.method === 'BL' ? p.method : 'TM'; if (p.method !== 'CK') delete p.txn;
  p.by = p.by || curUser() || ''; p.createdAt = nowISO(); p.machine = MACHINE; p.no = nextNo(PAY_KIND(p), p.date);
  S.pays.push(p); return p;
}
const payNoLbl = p => p.no ? `<span class="mono">${esc(p.no)}</span>` : '';
/* Ô chọn hình thức nộp dùng chung cho các hộp thoại thu tiền */
function methodHtml(px, def){
  return `<label class="f">Hình thức<select id="${px}Mt" onchange="document.getElementById('${px}TxL').hidden=this.value!=='CK'"><option value="TM"${def !== 'CK' ? ' selected' : ''}>Tiền mặt</option><option value="CK"${def === 'CK' ? ' selected' : ''}>Chuyển khoản</option></select></label>
    <label class="f" id="${px}TxL"${def === 'CK' ? '' : ' hidden'}>Mã giao dịch / nội dung CK<input id="${px}Tx" placeholder="vd: FT26285xxxx" autocomplete="off"></label>`;
}
function readMethod(px){
  const m = ($('#' + px + 'Mt') || {}).value === 'CK' ? 'CK' : 'TM', txn = m === 'CK' ? C.norm(($('#' + px + 'Tx') || {}).value || '') : '';
  if (m === 'CK' && txn.length < 3) { blockMsg('Thiếu mã giao dịch', '<p>Khoản chuyển khoản phải ghi mã giao dịch ngân hàng (hoặc nội dung chuyển khoản) để đối chiếu sao kê.</p>'); return null; }
  return { method: m, txn };
}
/* ---------- Chốt quỹ ---------- */
const liveClosings = () => (S.closings || []).filter(c => !c.voided);
const closingOfPay = id => liveClosings().find(c => c.payIds.includes(id));
function closingSig(ids){ return sha256(JSON.stringify(ids.map(id => { const p = S.pays.find(x => x.id === id); return p ? [p.id, p.amount, p.date, p.method] : [id]; }))); }
/* Sửa / xoá khoản thu đã chốt, hoặc ghi lùi ngày vào ngày đã chốt → cần quản lý */
function guardClosed(payIds, date, by, label, fn){
  const hit = payIds.map(closingOfPay).filter(Boolean);
  const back = date && date < todayISO() && liveClosings().some(c => c.date === date && c.cashier === by);
  if (!hit.length && !back) return fn();
  requireAdmin(`${label} (${hit.length ? 'khoản đã chốt quỹ ' + [...new Set(hit.map(c => c.no))].join(', ') : 'ghi vào ngày ' + fd(date) + ' đã chốt quỹ'})`, fn);
}
function pendingPays(cashier, upto){ const closed = new Set(liveClosings().flatMap(c => c.payIds)); return S.pays.filter(p => isCash(p) && !closed.has(p.id) && (p.by || '(không ghi)') === cashier && p.date <= upto).sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || '')); }
function unclosedDays(){ const closed = new Set(liveClosings().flatMap(c => c.payIds)), m = new Map(); for (const p of S.pays) if (isCash(p) && !closed.has(p.id)) { const k = p.date + '|' + (p.by || '(không ghi)'); const o = m.get(k) || { date: p.date, cashier: p.by || '(không ghi)', n: 0, total: 0 }; o.n++; o.total += p.amount; m.set(k, o); } return [...m.values()].sort((a, b) => a.date.localeCompare(b.date)); }
function paySum(list){ const s = { tmIn: 0, tmOut: 0, ckIn: 0, ckOut: 0, n: list.length }; for (const p of list) { if (!isCash(p)) continue; const k = (p.method === 'CK' ? 'ck' : 'tm') + (p.amount >= 0 ? 'In' : 'Out'); s[k] += Math.abs(p.amount); } s.tm = s.tmIn - s.tmOut; s.ck = s.ckIn - s.ckOut; s.total = s.tm + s.ck; return s; }
const DENOMS = [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000];
const regOfPay = p => S.regs.find(r => r.id === p.regId) || (S.trash.find(t => t.type === 'reg' && t.reg.id === p.regId) || {}).reg || {};
const payContent = p => { const r = regOfPay(p); return r.kind === 'moi' ? 'Nạp hồ sơ mới' : r.parts ? 'Thi lại ' + partsLbl(r) + (r.examDate ? ' · đợt ' + fd(r.examDate) : '') : ''; };

function renderQuy(){
  const dEl = $('#qyDate'); if (!dEl.value) dEl.value = todayISO();
  const date = dEl.value, un = unclosedDays();
  const cs = $('#qyCashier'), cur = cs.value;
  const names = [...new Set(un.filter(u => u.date <= date).map(u => u.cashier).concat(curUser() ? [curUser()] : []).concat(cur ? [cur] : []))]; cs.innerHTML = names.map(n => `<option${n === cur ? ' selected' : ''}>${esc(n)}</option>`).join('') || '<option value="">(chưa có ai thu)</option>';
  if (!cur && names.length) cs.value = names.includes(curUser()) ? curUser() : names[0];
  const cashier = cs.value, list = cashier ? pendingPays(cashier, date) : [], s = paySum(list);
  $('#qyUnclosed').innerHTML = un.length ? `<div class="alert ${un.some(u => u.date < todayISO()) ? 'bad' : ''}"><b>Ca chưa chốt quỹ:</b> ${un.map(u => `<a href="#" data-qd="${u.date}" data-qc="${esc(u.cashier)}">${fd(u.date)} · ${esc(u.cashier)} · ${u.n} phiếu · ${money(u.total)} đ</a>`).join(' &nbsp;|&nbsp; ')}</div>` : '<div class="alert ok">Tất cả khoản thu đã được chốt quỹ.</div>';
  const older = list.filter(p => p.date < date).length;
  $('#qyList').innerHTML = list.length ? `${older ? `<div class="alert" style="margin-bottom:8px">Có ${older} khoản của ngày trước chưa chốt, được gộp vào ca này.</div>` : ''}<table><tr><th>Số phiếu</th><th>Ngày</th><th>Giờ ghi</th><th>Họ tên</th><th>Nội dung</th><th>Hình thức</th><th>Mã GD</th><th class="num">Số tiền</th></tr>
    ${list.map(p => { const r = regOfPay(p); return `<tr><td class="mono">${esc(p.no)}</td><td class="mono">${fd(p.date)}</td><td class="mono">${p.createdAt && !p.noByUpgrade ? new Date(p.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}</td><td>${esc(r.name || '')}</td><td class="small">${esc(payContent(p))}${p.note ? ' · ' + esc(p.note) : ''}</td><td>${PM[p.method] || 'Tiền mặt'}</td><td class="mono small">${esc(p.txn || '')}</td><td class="num ${p.amount < 0 ? 'r-T' : ''}"><b>${money(p.amount)}</b></td></tr>`; }).join('')}
    <tr class="tot"><td colspan="7">TỔNG CA (${list.length} phiếu)</td><td class="num">${money(s.total)}</td></tr></table>` : '<div class="empty">Không có khoản thu nào chờ chốt cho người thu này.</div>';
  $('#qySum').innerHTML = `<div><span>Thu tiền mặt</span><b>${money(s.tmIn)}</b></div><div><span>Chi tiền mặt (hoàn)</span><b class="r-T">${s.tmOut ? '−' + money(s.tmOut) : 0}</b></div><div><span>Tiền mặt phải nộp</span><b>${money(s.tm)}</b></div><div><span>Chuyển khoản</span><b>${money(s.ck)}</b></div><div><span>Tổng thuần</span><b>${money(s.total)}</b></div>`;
  $('#qyDen').innerHTML = DENOMS.map(d => `<label class="f">${money(d)}<input class="mono qyD" data-d="${d}" inputmode="numeric" style="width:80px" placeholder="tờ"></label>`).join('');
  qyCalc();
  $('#qyGo').disabled = !list.length;
  const cl = (S.closings || []).slice().reverse();
  $('#qyHist').innerHTML = cl.length ? `<table><tr><th>Số</th><th>Ngày</th><th>Người thu (bên giao)</th><th class="num">Số phiếu</th><th class="num">Tiền mặt</th><th class="num">Chuyển khoản</th><th class="num">Tổng</th><th class="num">Thực đếm</th><th class="num">Chênh</th><th>Bên nhận</th><th>Chốt lúc</th><th></th></tr>
    ${cl.map(c => `<tr class="${c.voided ? 'kdel' : ''}"><td class="mono">${esc(c.no)}</td><td class="mono">${fd(c.date)}</td><td>${esc(c.cashier)}</td><td class="num">${c.payIds.length}</td><td class="num">${money(c.tm)}</td><td class="num">${money(c.ck)}</td><td class="num"><b>${money(c.total)}</b></td><td class="num">${money(c.counted)}</td><td class="num ${c.diff ? 'r-T' : ''}">${c.diff ? money(c.diff) : '0'}</td><td>${esc(c.receiver || '')}</td><td class="mono small">${new Date(c.at).toLocaleString('vi-VN')}${c.voided ? `<div class="r-T">Huỷ chốt: ${esc(c.voided.reason)} (${esc(c.voided.by)})</div>` : ''}</td>
      <td class="act">${c.voided ? '' : `<button class="b s" onclick="printClosing('${c.id}')">In biên bản</button><button class="b s" onclick="exportClosing('${c.id}')">Excel</button><button class="b s" onclick="voidClosing('${c.id}')">Huỷ chốt</button>`}</td></tr>`).join('')}</table>` : '<div class="empty">Chưa chốt quỹ lần nào.</div>';
}
function qyCalc(){
  const cashier = $('#qyCashier').value, list = cashier ? pendingPays(cashier, $('#qyDate').value) : [], s = paySum(list);
  const counted = [...document.querySelectorAll('.qyD')].reduce((a, i) => a + toNum(i.value) * +i.dataset.d, 0), manual = toNum($('#qyCounted').value);
  const c = counted || manual, diff = c - s.tm;
  if (counted) $('#qyCounted').value = counted;
  $('#qyDiff').innerHTML = list.length ? (diff === 0 ? `<span class="r-D"><b>Khớp</b>: tiền mặt thực đếm ${money(c)} đ = tiền mặt phải nộp.</span>` : `<span class="r-T"><b>${diff > 0 ? 'Thừa' : 'Thiếu'} ${money(Math.abs(diff))} đ</b> so với tiền mặt phải nộp ${money(s.tm)} đ. Ghi rõ lý do trước khi chốt.</span>`) : '';
}
function doClosing(){
  const cashier = $('#qyCashier').value, date = $('#qyDate').value, list = pendingPays(cashier, date); if (!list.length) return;
  const s = paySum(list), denoms = {}; document.querySelectorAll('.qyD').forEach(i => { if (toNum(i.value)) denoms[i.dataset.d] = toNum(i.value); });
  const counted = toNum($('#qyCounted').value), diff = counted - s.tm, note = $('#qyNote').value.trim(), receiver = C.norm($('#qyRecv').value);
  if ($('#qyCounted').value.trim() === '') return blockMsg('Chưa nhập tiền mặt thực đếm', '<p>Đếm tiền mặt trong két rồi nhập vào bảng kê mệnh giá (hoặc ô tổng).</p>');
  if (diff && note.length < 5) return blockMsg('Có chênh lệch', `<p>Tiền mặt ${diff > 0 ? 'thừa' : 'thiếu'} ${money(Math.abs(diff))} đ. Ghi lý do chênh lệch vào ô ghi chú rồi chốt lại.</p>`);
  if (!receiver) return blockMsg('Thiếu bên nhận', '<p>Ghi họ tên người nhận tiền (kế toán / thủ quỹ).</p>');
  dialog(`<h2>Chốt quỹ ca của ${esc(cashier)}?</h2><table><tr><td>Số phiếu</td><td class="num">${list.length}</td></tr><tr><td>Tiền mặt phải nộp</td><td class="num">${money(s.tm)}</td></tr><tr><td>Tiền mặt thực đếm</td><td class="num">${money(counted)}</td></tr><tr><td>Chuyển khoản</td><td class="num">${money(s.ck)}</td></tr><tr><td><b>Tổng thuần</b></td><td class="num"><b>${money(s.total)}</b></td></tr></table><p class="small muted">Sau khi chốt, sửa / xoá các khoản này cần quyền quản lý.</p>`, () => {
    const y = date.slice(0, 4); S.seq.CQ = S.seq.CQ || {}; const n = (S.seq.CQ[y] || 0) + 1; S.seq.CQ[y] = n;
    const c = { id: uid(), no: `CQ-${y}-${String(n).padStart(3, '0')}`, date, cashier, at: nowISO(), by: curUser(), machine: machineName(), payIds: list.map(p => p.id), nos: list.map(p => p.no), tm: s.tm, tmIn: s.tmIn, tmOut: s.tmOut, ck: s.ck, total: s.total, counted, denoms, diff, note, receiver };
    c.sig = closingSig(c.payIds); S.closings.push(c);
    logA('Chốt quỹ', '', cashier, `${c.no} ngày ${fd(date)} · ${list.length} phiếu (${list[0].no} … ${list[list.length - 1].no}) · TM ${money(s.tm)}, CK ${money(s.ck)}, thực đếm ${money(counted)}${diff ? ', chênh ' + money(diff) + ': ' + note : ''} · bên nhận ${receiver}`);
    save(); renderQuy(); toast('Đã chốt quỹ ' + c.no); printClosing(c.id);
    ['qyCounted', 'qyNote'].forEach(i => $('#' + i).value = '');
  }, 'Chốt quỹ');
}
window.voidClosing = id => requireAdmin('Huỷ chốt quỹ', () => { const c = S.closings.find(x => x.id === id);
  dialog(`<h2>Huỷ chốt ${esc(c.no)}?</h2><p class="small">Bản chốt vẫn được giữ (gạch ngang) để đối chiếu. Các khoản thu trở lại trạng thái chưa chốt.</p><label class="f">Lý do<input id="vcWhy"></label>`, () => {
    const why = $('#vcWhy').value.trim(); if (why.length < 3) return blockMsg('Chưa ghi lý do', '<p>Ghi lý do huỷ chốt.</p>');
    c.voided = { at: nowISO(), by: curUser(), reason: why }; logA('Huỷ chốt quỹ', '', c.cashier, `${c.no} · ${why}`); save(); renderQuy(); }, 'Huỷ chốt'); });
function closingRows(c){ return c.payIds.map(id => S.pays.find(p => p.id === id) || allPaysEver().find(p => p.id === id)).filter(Boolean); }
window.printClosing = id => {
  const c = S.closings.find(x => x.id === id), rows = closingRows(c), [y, m, d] = c.date.split('-');
  const den = Object.entries(c.denoms || {}).sort((a, b) => b[0] - a[0]);
  printFull(`<div style="display:grid;grid-template-columns:1fr auto 1fr"><div></div><div style="text-align:center;font-weight:bold;font-size:14.5px">${ORG}</div><div style="text-align:right;font-weight:bold">${ORG_SITE}</div></div>
    <div style="text-align:center;margin-top:6mm"><b style="font-size:18px">BIÊN BẢN CHỐT QUỸ VÀ BÀN GIAO TIỀN</b><br><i>Số: ${esc(c.no)} · Ngày ${d} tháng ${m} năm ${y}</i></div>
    <p style="margin-top:4mm">Bên giao (người thu tiền): <b>${esc(c.cashier)}</b> &nbsp;&nbsp; Bên nhận: <b>${esc(c.receiver)}</b><br>Chốt lúc ${new Date(c.at).toLocaleString('vi-VN')} tại ${esc(c.machine || '')}. Gồm ${rows.length} phiếu từ <b>${esc(c.nos[0])}</b> đến <b>${esc(c.nos[c.nos.length - 1])}</b>.</p>
    <table class="k" style="width:100%;border-collapse:collapse;font-size:12px"><tr><th>STT</th><th>Số phiếu</th><th>Ngày</th><th>Họ tên</th><th>Nội dung</th><th>Hình thức</th><th style="text-align:right">Số tiền</th></tr>
    ${rows.map((p, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${esc(p.no)}</td><td>${fd(p.date)}</td><td>${esc(regOfPay(p).name || '')}</td><td>${esc(payContent(p))}</td><td>${PM[p.method] || 'Tiền mặt'}${p.txn ? ' · ' + esc(p.txn) : ''}</td><td style="text-align:right">${money(p.amount)}</td></tr>`).join('')}</table>
    <table class="k" style="width:60%;border-collapse:collapse;margin-top:4mm;font-size:13px"><tr><td>Thu tiền mặt</td><td style="text-align:right">${money(c.tmIn)}</td></tr><tr><td>Chi tiền mặt (hoàn trả)</td><td style="text-align:right">${money(c.tmOut)}</td></tr><tr><td><b>Tiền mặt phải nộp</b></td><td style="text-align:right"><b>${money(c.tm)}</b></td></tr><tr><td>Chuyển khoản (đối chiếu sao kê)</td><td style="text-align:right">${money(c.ck)}</td></tr><tr><td><b>Tổng thuần</b></td><td style="text-align:right"><b>${money(c.total)}</b></td></tr><tr><td><b>Tiền mặt thực đếm</b></td><td style="text-align:right"><b>${money(c.counted)}</b></td></tr><tr><td>Chênh lệch</td><td style="text-align:right">${money(c.diff)}${c.diff ? ' (' + esc(c.note) + ')' : ''}</td></tr></table>
    ${den.length ? `<p style="font-size:12px">Bảng kê: ${den.map(([k, v]) => `${money(+k)} × ${v}`).join('; ')}</p>` : ''}
    <table style="width:100%;margin-top:8mm"><tr><td style="text-align:center;width:50%"><b>BÊN GIAO</b><br><i>(Ký, ghi rõ họ tên)</i></td><td style="text-align:center"><b>BÊN NHẬN</b><br><i>(Ký, ghi rõ họ tên)</i></td></tr><tr><td style="height:22mm;text-align:center;vertical-align:bottom">${esc(c.cashier)}</td><td style="text-align:center;vertical-align:bottom">${esc(c.receiver)}</td></tr></table>`);
};
window.exportClosing = id => { const c = S.closings.find(x => x.id === id), rows = closingRows(c);
  const cols = [{ h: 'STT', w: 6, k: 'ctr' }, { h: 'Số phiếu', w: 15, k: 'ctr' }, { h: 'Ngày thu', w: 12, k: 'date' }, { h: 'Họ và tên', w: 26 }, { h: 'CCCD', w: 15, k: 'ctr' }, { h: 'Nội dung', w: 30, wrap: 1 }, { h: 'Hình thức', w: 13 }, { h: 'Mã giao dịch', w: 16 }, { h: 'Số tiền', w: 14, k: 'money' }];
  const data = rows.map((p, i) => ({ c: [i + 1, p.no, p.date, regOfPay(p).name || '', p.cccd, payContent(p), PM[p.method] || 'Tiền mặt', p.txn || '', p.amount], color: { 8: p.amount < 0 ? 'A1261E' : undefined } }));
  data.push({ t: 's', c: ['', 'Tiền mặt phải nộp', '', '', '', '', '', '', c.tm] }, { t: 's', c: ['', 'Chuyển khoản', '', '', '', '', '', '', c.ck] }, { t: 't', c: ['', 'TỔNG THUẦN', '', '', '', '', '', '', c.total] }, { t: 's', c: ['', 'Tiền mặt thực đếm', '', '', '', c.diff ? 'Chênh ' + money(c.diff) + ': ' + c.note : 'Khớp', '', '', c.counted] });
  const sh = kSheet('BIÊN BẢN CHỐT QUỸ VÀ BÀN GIAO TIỀN', [`Số ${c.no} · Ngày ${fd(c.date)} · Bên giao: ${c.cashier} · Bên nhận: ${c.receiver}`, `Chốt lúc ${new Date(c.at).toLocaleString('vi-VN')} · ${c.machine || ''}`], cols, data, true);
  kWrite([['Chot quy', sh, 9]], `CHOT_QUY_${c.no}_${c.date.split('-').reverse().join('-')}.xlsx`); };
function printFull(html){ document.body.classList.add('pfull'); $('#printArea').innerHTML = html; const old = document.title; document.title = ORG; window.print(); document.title = old; document.body.classList.remove('pfull'); }
