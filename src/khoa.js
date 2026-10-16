/* =============== KHÓA MỚI DỰ KIẾN — theo dõi nhận hồ sơ mới theo đợt (độc lập với thi lại) =============== */
const K_ST = { plan: ['Chưa nhận', 'p-cxl'], open: ['Đang nhận', 'p-THILAI'], full: ['Đủ chỉ tiêu', 'p-paid'], over: ['Vượt chỉ tiêu', 'p-due'], late: ['Hết hạn nhận', 'p-part'], done: ['Đã sát hạch', 'p-cxl'], closed: ['Đã chốt', 'p-DAT'], del: ['Đã xoá', 'p-due'] };
const K_REASONS = ['Chuyển nơi cư trú / học nơi khác', 'Bận công việc, đi làm xa', 'Lý do sức khỏe', 'Đi học, nhập ngũ', 'Không muốn tiếp tục học, thi', 'Hồ sơ không hợp lệ', 'Chuyển sang đợt khác', 'Khác'];
const kAll = () => (S.khoa = S.khoa || []);
const kLive = arr => (arr || []).filter(x => !x.deleted);
const kGet = id => kAll().find(k => k.id === id);
const kInt = v => { const n = Math.round(+String(v ?? '').replace(/[^\d-]/g, '')); return Number.isFinite(n) ? n : 0; };
const kNames = s => String(s || '').split(/[\n;,]+/).map(x => C.norm(x)).filter(Boolean);
const kRecvLabel = x => x.kind === 'bs' ? 'Hồ sơ BỔ SUNG' + (x.n > 1 ? ' ' + x.n : '') : 'Hồ sơ mới LẦN ' + x.n;
const kSerial = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000); };
const kStamp = s => s ? new Date(s).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

function kCalc(k){
  const recv = kLive(k.recv), rut = kLive(k.rut), today = todayISO();
  const received = recv.reduce((s, x) => s + x.qty, 0), withdrawn = rut.reduce((s, x) => s + x.qty, 0), net = received - withdrawn;
  const limit = +k.limit || 0, price = +k.price || 0;
  const st = k.deleted ? 'del' : k.closed ? 'closed' : (k.examDate && k.examDate < today) ? 'done'
    : (limit && net > limit) ? 'over' : (limit && net === limit) ? 'full' : (k.deadline && k.deadline < today) ? 'late' : received ? 'open' : 'plan';
  return { received, withdrawn, net, limit, free: limit - net, pct: limit ? net / limit : 0, nLan: recv.filter(x => x.kind !== 'bs').length, nBs: recv.filter(x => x.kind === 'bs').length,
    st, lastRecv: recv.map(x => x.date).sort().pop() || '', days: k.examDate ? C.daysBetween(today, k.examDate) : null, price, money: received * price, moneyNet: net * price };
}
function kHist(k, act, detail){ (k.hist = k.hist || []).push({ at: new Date().toISOString(), by: curUser() || '(chưa đặt tên)', act, detail: detail || '' }); logA('Khóa mới: ' + act, '', k.name, detail); }
const kPill = st => `<span class="pill ${K_ST[st][1]}">${K_ST[st][0]}</span>`;
const kBar = c => `<div class="kbar ${c.st === 'over' ? 'over' : c.st === 'full' ? 'full' : ''}" title="${c.net}/${c.limit}"><i style="width:${Math.min(100, Math.round(c.pct * 100))}%"></i></div>`;

/* ---------- Danh sách các đợt ---------- */
let kCur = null;
function kFiltered(){
  const q = fold($('#kSearch').value), y = $('#kYear').value, st = $('#kSt').value;
  return kAll().map(k => ({ k, c: kCalc(k) })).filter(({ k, c }) => {
    if (st === 'del') { if (!k.deleted) return false; } else if (k.deleted) return false;
    if (st === 'active' && ['done', 'closed'].includes(c.st)) return false;
    if (st && !['active', 'del'].includes(st) && c.st !== st) return false;
    if (y && (k.examDate || '').slice(0, 4) !== y) return false;
    if (q) { const hay = fold([k.name, k.hang, k.note, fd(k.examDate), ...(k.recv || []).map(x => x.note + ' ' + x.by), ...(k.rut || []).map(x => x.names + ' ' + x.note + ' ' + x.reason)].join(' ')); if (!hay.includes(q)) return false; }
    return true;
  }).sort((a, b) => { const fa = (a.c.days ?? -1) >= 0, fb = (b.c.days ?? -1) >= 0;
    return fa !== fb ? (fa ? -1 : 1) : fa ? (a.k.examDate || '').localeCompare(b.k.examDate || '') : (b.k.examDate || '').localeCompare(a.k.examDate || ''); });
}
function kMatchHint(k){
  const q = fold($('#kSearch').value); if (!q) return '';
  const hits = [];
  for (const r of kLive(k.rut)) kNames(r.names).forEach(n => { if (fold(n).includes(q)) hits.push(`rút: <b>${esc(n)}</b> ngày ${fd(r.date)}`); });
  for (const x of kLive(k.recv)) if (fold(x.note).includes(q)) hits.push(`${kRecvLabel(x)}: ${esc(x.note)}`);
  return hits.length ? `<div class="small muted">${hits.slice(0, 3).join(' · ')}</div>` : '';
}
function renderKhoa(){
  const years = [...new Set(kAll().map(k => (k.examDate || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const ys = $('#kYear'), yv = ys.value; ys.innerHTML = '<option value="">Tất cả</option>' + years.map(y => `<option${y === yv ? ' selected' : ''}>${y}</option>`).join('');
  const live = kAll().filter(k => !k.deleted).map(k => ({ k, c: kCalc(k) })), upc = live.filter(x => !['done', 'closed'].includes(x.c.st));
  const sum = (xs, f) => xs.reduce((s, x) => s + x.c[f], 0);
  $('#kKpi').innerHTML = [['Đợt đang / sắp mở', upc.length, ''], ['Chỉ tiêu các đợt này', sum(upc, 'limit').toLocaleString('vi-VN'), ''], ['Đã nhận hồ sơ', sum(upc, 'received').toLocaleString('vi-VN'), 'ok'],
    ['Đã rút', sum(upc, 'withdrawn').toLocaleString('vi-VN'), sum(upc, 'withdrawn') ? 'warn' : ''], ['Còn lại (dự thi)', sum(upc, 'net').toLocaleString('vi-VN'), 'ok'],
    ['Còn trống', sum(upc, 'free').toLocaleString('vi-VN'), upc.some(x => x.c.free < 0) ? 'bad' : '']].map(([l, v, c]) => `<div class="kpi ${c}"><span>${l}</span><b>${v}</b></div>`).join('');
  const rows = kFiltered();
  $('#kList').innerHTML = rows.length ? `<table class="klist"><tr><th class="num">STT</th><th>Đợt / khóa</th><th>Hạng</th><th>Ngày SH dự kiến</th><th class="num">Giới hạn</th><th class="num">Lần nhận</th><th class="num">Đã nhận</th><th class="num">Đã rút</th><th class="num">Còn lại</th><th class="num">Còn trống</th><th style="min-width:110px">Lấp đầy</th><th>Tình trạng</th><th>Nhận gần nhất</th></tr>
    ${rows.map(({ k, c }, i) => `<tr data-k="${k.id}" class="${k.id === kCur ? 'sel' : ''}"><td class="num">${i + 1}</td><td><b>${esc(k.name)}</b>${k.note ? `<div class="small muted">${esc(k.note.slice(0, 60))}${k.note.length > 60 ? '…' : ''}</div>` : ''}${kMatchHint(k)}</td><td>${esc(k.hang)}</td>
      <td class="mono">${fd(k.examDate)}${c.days != null && c.days >= 0 && !['closed', 'del'].includes(c.st) ? `<div class="small muted">còn ${c.days} ngày</div>` : ''}</td><td class="num">${c.limit}</td><td class="num">${c.nLan}${c.nBs ? ` <span class="small muted">+${c.nBs} BS</span>` : ''}</td>
      <td class="num">${c.received}</td><td class="num ${c.withdrawn ? 'r-T' : ''}">${c.withdrawn ? '−' + c.withdrawn : 0}</td><td class="num"><b>${c.net}</b></td><td class="num ${c.free < 0 ? 'r-T' : ''}">${c.free}</td>
      <td>${kBar(c)}<div class="small muted mono">${(c.pct * 100).toFixed(1)}%</div></td><td>${kPill(c.st)}</td><td class="mono">${fd(c.lastRecv)}</td></tr>`).join('')}
    ${rows.length > 1 ? `<tr class="tot"><td></td><td colspan="3">TỔNG CỘNG (${rows.length} đợt)</td><td class="num">${sum(rows, 'limit')}</td><td class="num">${sum(rows, 'nLan')}</td><td class="num">${sum(rows, 'received')}</td><td class="num">${sum(rows, 'withdrawn') ? '−' + sum(rows, 'withdrawn') : 0}</td><td class="num">${sum(rows, 'net')}</td><td class="num">${sum(rows, 'free')}</td><td colspan="3"></td></tr>` : ''}</table>`
    : `<div class="empty">${kAll().length ? 'Không có đợt nào khớp bộ lọc.' : 'Chưa có đợt nào. Bấm <b>+ Tạo đợt mới</b> để khai báo đợt sắp mở: ngày sát hạch dự kiến và số lượng dự kiến (giới hạn).'}</div>`;
  const over = live.filter(x => x.c.st === 'over').length; $('#nKhoa').hidden = !over; $('#nKhoa').textContent = over; $('#nKhoa').title = over + ' đợt vượt chỉ tiêu';
  renderKDetail();
}
$('#kList').onclick = e => { const tr = e.target.closest('tr[data-k]'); if (!tr) return; kCur = tr.dataset.k === kCur ? null : tr.dataset.k; renderKhoa(); if (kCur) $('#kDetail').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
['kSearch', 'kYear', 'kSt'].forEach(id => $('#' + id).addEventListener('input', renderKhoa));

/* ---------- Chi tiết một đợt (bố cục giống bảng "Quản lý nhận hồ sơ mới") ---------- */
let kShowDel = false;
function renderKDetail(){
  const el = $('#kDetail'), k = kCur && kGet(kCur);
  if (!k) { el.innerHTML = ''; return; }
  const c = kCalc(k), recv = (k.recv || []).filter(x => kShowDel || !x.deleted).sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));
  const rut = (k.rut || []).filter(x => kShowDel || !x.deleted).sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));
  const nDel = (k.recv || []).filter(x => x.deleted).length + (k.rut || []).filter(x => x.deleted).length;
  const ro = k.deleted;
  const act = (kind, x) => ro ? '' : `<button class="b s" onclick="kEditEntry('${k.id}','${kind}','${x.id}')">Sửa</button><button class="b s" onclick="kDelEntry('${k.id}','${kind}','${x.id}')">Xoá</button>${(x.edits || []).length ? `<button class="b s" title="Lịch sử sửa" onclick="kEntryHist('${k.id}','${kind}','${x.id}')">${x.edits.length} lần sửa</button>` : ''}`;
  const delNote = x => x.deleted ? `<div class="small r-T">Đã xoá ${kStamp(x.deleted.at)} bởi ${esc(x.deleted.by)}: ${esc(x.deleted.reason)}</div>` : '';
  const check = c.limit ? (c.net > c.limit ? `<div class="alert bad"><b>VƯỢT CHỈ TIÊU:</b> còn lại ${c.net}/${c.limit} hồ sơ, vượt ${c.net - c.limit}.</div>`
    : c.net === c.limit ? `<div class="alert ok"><b>ĐẠT ĐỦ CHỈ TIÊU:</b> ${c.net}/${c.limit} hồ sơ.</div>`
    : `<div class="alert ${c.st === 'late' ? 'bad' : 'ok'}"><b>ĐẠT:</b> ${c.net}/${c.limit} hồ sơ · còn trống <b>${c.free}</b> chỗ${c.st === 'late' ? ` · <b>đã quá hạn nhận hồ sơ ${fd(k.deadline)}</b>` : k.deadline ? ` · hạn nhận ${fd(k.deadline)}` : ''}.</div>`) : '<div class="alert">Chưa đặt giới hạn số lượng cho đợt này.</div>';
  const warns = [];
  if (c.days != null && c.days >= 0 && c.days <= 14 && c.free > 0 && !['closed', 'del'].includes(c.st)) warns.push(`<div class="alert">Còn ${c.days} ngày đến ngày sát hạch dự kiến, đợt còn trống ${c.free} chỗ.</div>`);
  if (k.closed) warns.push(`<div class="alert ok">Đợt đã chốt ${kStamp(k.closed.at)} bởi ${esc(k.closed.by)}. Sửa / xoá số liệu cần mật khẩu quản lý.</div>`);
  if (k.deleted) warns.push(`<div class="alert bad">Đợt đã xoá ${kStamp(k.deleted.at)} bởi ${esc(k.deleted.by)}: ${esc(k.deleted.reason)}</div>`);
  el.innerHTML = `<div class="panel kform">
    <div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">QUẢN LÝ NHẬN HỒ SƠ MỚI · ${esc(k.name)}</h2><div class="row">${kPill(c.st)}<button class="b s" onclick="kCur=null;renderKhoa()">Đóng</button></div></div>
    <div class="kinfo">
      <div><span>Đợt / khóa</span><b>${esc(k.name)}</b></div><div><span>Hạng</span><b>${esc(k.hang)}</b></div>
      <div><span>Ngày sát hạch dự kiến</span><b>${fd(k.examDate) || '—'}</b>${c.days != null ? `<em>${c.days >= 0 ? 'còn ' + c.days + ' ngày' : 'đã qua ' + (-c.days) + ' ngày'}</em>` : ''}</div>
      <div><span>Hạn nhận hồ sơ</span><b>${fd(k.deadline) || '—'}</b></div><div><span>Giới hạn</span><b>${c.limit}</b></div><div><span>Đơn giá</span><b>${money(c.price)}</b></div>
    </div>
    ${k.note ? `<p class="small"><b>Ghi chú đợt:</b> ${esc(k.note)}</p>` : ''}
    <div style="display:flex;flex-direction:column;gap:6px;margin:10px 0">${check}${warns.join('')}${typeof kActualHtml === 'function' ? kActualHtml(k, c) : ''}</div>
    ${ro ? `<div class="row"><button class="b p" onclick="kRestore('${k.id}')">Khôi phục đợt</button></div>` : `<div class="row">
      <button class="b p" onclick="kRecvDlg('${k.id}','lan')">+ Nhận hồ sơ lần ${Math.max(0, ...kLive(k.recv).filter(x => x.kind !== 'bs').map(x => x.n)) + 1}</button>
      <button class="b" onclick="kRecvDlg('${k.id}','bs')">+ Hồ sơ bổ sung</button>
      <button class="b" onclick="kRutDlg('${k.id}')">− Ghi nhận rút hồ sơ</button>
      <button class="b" onclick="kEditDlg('${k.id}')">Sửa thông tin đợt</button>
      <button class="b" onclick="kToggleClose('${k.id}')">${k.closed ? 'Mở chốt' : 'Chốt đợt'}</button>
      <button class="b" onclick="kExportOne('${k.id}')">Xuất Excel đợt này</button>
      <button class="b" onclick="kDelete('${k.id}')">Xoá đợt</button></div>`}
    <h3>Các lần nhận hồ sơ</h3>
    <div class="tw"><table><tr><th class="num">STT</th><th>Loại hồ sơ</th><th class="num">Số lượng</th><th>Ngày nhận</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th><th class="num">Tỷ lệ %</th><th>Người nhận</th><th>Ghi chú</th><th></th></tr>
      ${recv.length ? recv.map((x, i) => `<tr class="${x.deleted ? 'kdel' : x.kind === 'bs' ? 'kbs' : ''}"><td class="num">${i + 1}</td><td>${kRecvLabel(x)}</td><td class="num"><b>${x.qty}</b></td><td class="mono">${fd(x.date)}</td><td class="num">${money(c.price)}</td><td class="num">${money(x.qty * c.price)}</td>
        <td class="num">${!x.deleted && c.received ? (x.qty / c.received * 100).toFixed(1) + '%' : ''}</td><td>${esc(x.by)}</td><td class="small" style="white-space:normal;min-width:180px">${esc(x.note)}${delNote(x)}<div class="muted">ghi lúc ${kStamp(x.at)}</div></td><td class="nowrap">${x.deleted ? '' : act('recv', x)}</td></tr>`).join('')
      : '<tr><td colspan="10" class="empty">Chưa nhận hồ sơ lần nào.</td></tr>'}
      <tr class="tot"><td></td><td>TỔNG ĐÃ NHẬN</td><td class="num">${c.received}</td><td></td><td></td><td class="num">${money(c.money)}</td><td class="num">${c.received ? '100%' : ''}</td><td colspan="3"></td></tr></table></div>
    <h3>Học viên rút hồ sơ (nộp nhưng không thi)</h3>
    <div class="tw"><table><tr><th class="num">STT</th><th>Ngày rút</th><th class="num">Số lượng</th><th>Họ tên</th><th>Lý do</th><th>Ghi chú</th><th>Người ghi</th><th></th></tr>
      ${rut.length ? rut.map((x, i) => `<tr class="${x.deleted ? 'kdel' : ''}"><td class="num">${i + 1}</td><td class="mono">${fd(x.date)}</td><td class="num r-T"><b>−${x.qty}</b></td><td style="white-space:normal;min-width:160px">${kNames(x.names).map(esc).join('<br>') || '<span class="muted">(không ghi tên)</span>'}</td>
        <td>${esc(x.reason)}</td><td class="small" style="white-space:normal;min-width:160px">${esc(x.note)}${delNote(x)}<div class="muted">ghi lúc ${kStamp(x.at)}</div></td><td>${esc(x.by)}</td><td class="nowrap">${x.deleted ? '' : act('rut', x)}</td></tr>`).join('')
      : '<tr><td colspan="8" class="empty">Chưa có ai rút hồ sơ.</td></tr>'}
      <tr class="tot"><td></td><td>TỔNG ĐÃ RÚT</td><td class="num">${c.withdrawn ? '−' + c.withdrawn : 0}</td><td colspan="5"></td></tr></table></div>
    <div class="ksum">
      <div><span>Đã nhận</span><b>${c.received}</b></div><div><span>Đã rút</span><b class="r-T">−${c.withdrawn}</b></div><div><span>Còn lại (dự thi)</span><b>${c.net}</b></div>
      <div><span>Giới hạn</span><b>${c.limit}</b></div><div><span>Còn trống</span><b class="${c.free < 0 ? 'r-T' : ''}">${c.free}</b></div><div><span>Lấp đầy</span><b>${(c.pct * 100).toFixed(1)}%</b>${kBar(c)}</div>
    </div>
    ${nDel ? `<label class="small" style="display:flex;gap:6px;margin-top:10px"><input type="checkbox" ${kShowDel ? 'checked' : ''} onchange="kShowDel=this.checked;renderKDetail()"> Hiện ${nDel} dòng đã xoá (giữ lại để đối chiếu)</label>` : ''}
    <h3>Lịch sử thay đổi của đợt</h3>
    <div class="tw" style="max-height:260px"><table><tr><th>Thời điểm</th><th>Người thao tác</th><th>Thao tác</th><th>Chi tiết</th></tr>${(k.hist || []).slice().reverse().map(h => `<tr><td class="mono">${kStamp(h.at)}</td><td>${esc(h.by)}</td><td>${esc(h.act)}</td><td class="small" style="white-space:normal;min-width:260px">${esc(h.detail)}</td></tr>`).join('')}</table></div>
  </div>`;
}

/* ---------- Tạo / sửa đợt ---------- */
function kEditDlg(id, vals, err){
  const k = id ? kGet(id) : null, last = kAll().filter(x => !x.deleted).slice(-1)[0];
  const v = vals || (k ? { ...k } : { name: '', hang: 'A1', examDate: '', deadline: '', limit: '', price: last ? last.price : 530000, note: '' });
  dialog(`<h2>${k ? 'Sửa thông tin đợt ' + esc(k.name) : 'Tạo đợt / khóa mới'}</h2>${err ? `<div class="alert bad">${err}</div>` : ''}
    <div class="row"><label class="f" style="flex:1;min-width:180px">Tên đợt / khóa<input id="kfName" value="${esc(v.name)}" placeholder="vd: ĐỢT 1/2027, K21" required></label>
      <label class="f">Hạng<input id="kfHang" value="${esc(v.hang)}" list="kHangs" style="width:80px"></label></div>
    <div class="row" style="margin-top:8px"><label class="f">Ngày sát hạch dự kiến<input type="date" id="kfExam" value="${v.examDate || ''}"></label>
      <label class="f">Hạn nhận hồ sơ (nếu có)<input type="date" id="kfDead" value="${v.deadline || ''}"></label></div>
    <div class="row" style="margin-top:8px"><label class="f">Số lượng dự kiến (giới hạn)<input id="kfLimit" inputmode="numeric" value="${v.limit ?? ''}" style="width:150px"></label>
      <label class="f">Đơn giá / hồ sơ (đ)<input id="kfPrice" inputmode="numeric" value="${v.price ?? ''}" style="width:150px"></label></div>
    <label class="f" style="margin-top:8px">Ghi chú đợt<textarea id="kfNote" rows="2">${esc(v.note || '')}</textarea></label>
    ${k ? `<label class="f" style="margin-top:8px">Lý do thay đổi <span class="small muted">(bắt buộc khi đổi ngày, giới hạn, đơn giá của đợt đã nhận hồ sơ)</span><input id="kfWhy" value="${esc(v.why || '')}"></label>` : ''}
    <datalist id="kHangs"><option>A1</option><option>A</option><option>B1</option></datalist>`, () => {
    const n = { name: C.norm($('#kfName').value), hang: C.norm($('#kfHang').value) || 'A1', examDate: $('#kfExam').value, deadline: $('#kfDead').value, limit: kInt($('#kfLimit').value), price: kInt($('#kfPrice').value), note: $('#kfNote').value.trim(), why: k ? $('#kfWhy').value.trim() : '' };
    const again = m => setTimeout(() => kEditDlg(id, n, m), 0);
    if (!n.name) return again('Nhập tên đợt / khóa.');
    if (kAll().some(x => !x.deleted && x.id !== id && fold(x.name) === fold(n.name))) return again(`Đã có đợt tên “${esc(n.name)}”. Đặt tên khác để tránh nhầm.`);
    if (!n.examDate) return again('Nhập ngày sát hạch dự kiến.');
    if (n.limit <= 0) return again('Số lượng dự kiến phải lớn hơn 0.');
    if (n.price < 0) return again('Đơn giá không hợp lệ.');
    if (n.deadline && n.deadline > n.examDate) return again('Hạn nhận hồ sơ không được sau ngày sát hạch.');
    if (!k) { const nk = { id: uid(), name: n.name, hang: n.hang, examDate: n.examDate, deadline: n.deadline, limit: n.limit, price: n.price, note: n.note, recv: [], rut: [], hist: [], createdAt: new Date().toISOString(), createdBy: curUser() };
      kAll().push(nk); kHist(nk, 'Tạo đợt', `Ngày SH ${fd(n.examDate)}, giới hạn ${n.limit}, đơn giá ${money(n.price)}`); kCur = nk.id; save(); renderKhoa(); return toast('Đã tạo đợt ' + n.name); }
    const F = { name: 'Tên', hang: 'Hạng', examDate: 'Ngày SH', deadline: 'Hạn nhận', limit: 'Giới hạn', price: 'Đơn giá', note: 'Ghi chú' };
    const show = (f, x) => f === 'examDate' || f === 'deadline' ? (fd(x) || '(trống)') : f === 'price' ? money(x) : String(x ?? '');
    const diff = Object.keys(F).filter(f => String(k[f] ?? '') !== String(n[f] ?? ''));
    if (!diff.length) return toast('Không có thay đổi');
    if (kCalc(k).received && diff.some(f => ['examDate', 'limit', 'price'].includes(f)) && n.why.length < 3) return again('Đợt đã nhận hồ sơ: ghi lý do thay đổi ngày / giới hạn / đơn giá.');
    const detail = diff.map(f => `${F[f]}: ${show(f, k[f])} → ${show(f, n[f])}`).join('; ') + (n.why ? ` · Lý do: ${n.why}` : '');
    const go = () => { diff.forEach(f => k[f] = n[f]); kHist(k, 'Sửa thông tin đợt', detail); save(); renderKhoa(); toast('Đã lưu'); };
    k.closed ? requireAdmin('Sửa đợt đã chốt', go) : go();
  }, k ? 'Lưu thay đổi' : 'Tạo đợt');
  setTimeout(() => { const e = $('#kfName'); if (e && !v.name) e.focus(); }, 50);
}
window.kEditDlg = kEditDlg;
$('#kNew').onclick = () => kEditDlg(null);

/* ---------- Nhận hồ sơ (lần / bổ sung) ---------- */
function kRecvDlg(kid, kind, eid, vals, err){
  const k = kGet(kid), e = eid ? (k.recv || []).find(x => x.id === eid) : null, c = kCalc(k);
  kind = e ? e.kind : kind;
  const nextN = Math.max(0, ...kLive(k.recv).filter(x => (x.kind === 'bs') === (kind === 'bs')).map(x => x.n)) + 1;
  const v = vals || (e ? { ...e, why: '' } : { date: todayISO(), qty: '', by: curUser(), note: '' });
  const base = c.net - (e && !e.deleted ? e.qty : 0);
  dialog(`<h2>${e ? 'Sửa ' + kRecvLabel(e) : (kind === 'bs' ? 'Nhận hồ sơ BỔ SUNG' : 'Nhận hồ sơ mới LẦN ' + nextN)} · ${esc(k.name)}</h2>${err ? `<div class="alert bad">${err}</div>` : ''}
    <div class="row"><label class="f">Ngày nhận<input type="date" id="krDate" value="${v.date}"></label><label class="f">Số lượng hồ sơ<input id="krQty" inputmode="numeric" value="${v.qty}" style="width:120px" autocomplete="off"></label>
      <label class="f" style="flex:1;min-width:160px">Người nhận hồ sơ<input id="krBy" value="${esc(v.by || '')}"></label></div>
    <label class="f" style="margin-top:8px">Ghi chú (nguồn hồ sơ, đơn vị chuyển, số biên nhận…)<textarea id="krNote" rows="2">${esc(v.note || '')}</textarea></label>
    ${e ? `<label class="f" style="margin-top:8px">Lý do sửa <span class="small muted">(bắt buộc, lưu lại để đối chiếu)</span><input id="krWhy" value="${esc(v.why || '')}"></label>` : ''}
    <div id="krPrev" class="alert" style="margin-top:10px"></div>
    <label class="small" id="krOkL" hidden style="display:flex;gap:6px;margin-top:6px"><input type="checkbox" id="krOk"> <span id="krOkT"></span></label>`, () => {
    const n = { date: $('#krDate').value, qty: kInt($('#krQty').value), by: C.norm($('#krBy').value), note: $('#krNote').value.trim(), why: e ? $('#krWhy').value.trim() : '' };
    const again = m => setTimeout(() => kRecvDlg(kid, kind, eid, n, m), 0);
    if (!n.date) return again('Nhập ngày nhận.');
    if (n.qty <= 0) return again('Số lượng phải là số nguyên lớn hơn 0.');
    if (!n.by) return again('Ghi tên người nhận hồ sơ.');
    if (e && n.why.length < 3) return again('Ghi lý do sửa.');
    const risk = kRecvRisk(k, n, e, base);
    if (risk.length && !$('#krOk').checked) return again(risk.join('<br>') + '<br><b>Tick ô xác nhận phía dưới nếu vẫn ghi nhận.</b>');
    const go = () => {
      if (e) { const before = { date: e.date, qty: e.qty, by: e.by, note: e.note }; (e.edits = e.edits || []).push({ at: new Date().toISOString(), by: curUser(), reason: n.why, before });
        const ch = [['Ngày', fd(e.date), fd(n.date)], ['SL', e.qty, n.qty], ['Người nhận', e.by, n.by], ['Ghi chú', e.note, n.note]].filter(x => String(x[1]) !== String(x[2])).map(x => `${x[0]}: ${x[1] || '(trống)'} → ${x[2] || '(trống)'}`).join('; ');
        Object.assign(e, { date: n.date, qty: n.qty, by: n.by, note: n.note }); kHist(k, 'Sửa ' + kRecvLabel(e), (ch || 'không đổi số liệu') + ' · Lý do: ' + n.why); }
      else { const x = { id: uid(), kind, n: nextN, date: n.date, qty: n.qty, by: n.by, note: n.note, at: new Date().toISOString(), edits: [] }; (k.recv = k.recv || []).push(x);
        kHist(k, 'Nhận ' + kRecvLabel(x), `${n.qty} hồ sơ ngày ${fd(n.date)}, người nhận ${n.by}${risk.length ? ' · Đã xác nhận: ' + risk.join('; ').replace(/<[^>]+>/g, '') : ''}${n.note ? ' · ' + n.note : ''}`); }
      save(); renderKhoa(); toast(`Đã ghi nhận. Còn lại ${kCalc(k).net}/${k.limit}`);
    };
    k.closed ? requireAdmin('Sửa số liệu đợt đã chốt', go) : go();
  }, e ? 'Lưu sửa' : 'Ghi nhận');
  const prev = () => { const q = kInt($('#krQty').value), d = $('#krDate').value, r = kRecvRisk(k, { qty: q, date: d }, e, base), after = base + q;
    $('#krPrev').className = 'alert ' + (r.length ? 'bad' : 'ok');
    $('#krPrev').innerHTML = `Sau khi ghi: còn lại <b>${after}</b> / giới hạn <b>${k.limit}</b> · ${after > k.limit ? `<b>vượt ${after - k.limit}</b>` : `còn trống <b>${k.limit - after}</b>`}${q ? ` · thành tiền ${money(q * (+k.price || 0))} đ` : ''}${r.length ? '<br>' + r.join('<br>') : ''}`;
    $('#krOkL').hidden = !r.length; $('#krOkT').textContent = 'Tôi đã kiểm tra, vẫn ghi nhận (' + r.map(s => s.replace(/<[^>]+>/g, '')).join('; ') + ')'; };
  ['krQty', 'krDate'].forEach(i => $('#' + i).addEventListener('input', prev)); prev();
  setTimeout(() => { const q = $('#krQty'); if (q) q.focus(); }, 50);
}
function kRecvRisk(k, n, e, base){
  const r = [];
  if (n.qty > 0 && base + n.qty > k.limit) r.push(`Vượt giới hạn ${k.limit} (${base + n.qty} hồ sơ)`);
  if (n.date && n.date > todayISO()) r.push(`Ngày nhận ${fd(n.date)} ở tương lai`);
  if (n.date && k.examDate && n.date > k.examDate) r.push(`Ngày nhận sau ngày sát hạch ${fd(k.examDate)}`);
  if (n.date && k.deadline && n.date > k.deadline) r.push(`Sau hạn nhận hồ sơ ${fd(k.deadline)}`);
  if (n.qty > 0 && kLive(k.recv).some(x => x !== e && x.date === n.date && x.qty === n.qty)) r.push(`Đã có lần nhận ${n.qty} hồ sơ cùng ngày ${fd(n.date)} (có thể nhập trùng)`);
  return r;
}
window.kRecvDlg = kRecvDlg;

/* ---------- Rút hồ sơ ---------- */
function kRutDlg(kid, eid, vals, err){
  const k = kGet(kid), e = eid ? (k.rut || []).find(x => x.id === eid) : null, c = kCalc(k);
  const v = vals || (e ? { ...e, why: '' } : { date: todayISO(), qty: '', names: '', reason: K_REASONS[0], note: '', by: curUser() });
  const avail = c.net + (e && !e.deleted ? e.qty : 0);
  dialog(`<h2>${e ? 'Sửa bản ghi rút hồ sơ' : 'Ghi nhận rút hồ sơ'} · ${esc(k.name)}</h2>${err ? `<div class="alert bad">${err}</div>` : ''}
    <p class="small muted">Học viên đã nộp hồ sơ vào đợt này nhưng rút lại, không thi. Số lượng được trừ khỏi đợt. Hiện còn ${avail} hồ sơ.</p>
    <div class="row"><label class="f">Ngày rút<input type="date" id="kuDate" value="${v.date}"></label><label class="f">Số lượng rút<input id="kuQty" inputmode="numeric" value="${v.qty}" style="width:110px" autocomplete="off"></label>
      <label class="f" style="flex:1;min-width:200px">Lý do<select id="kuReason">${K_REASONS.map(r => `<option${r === v.reason ? ' selected' : ''}>${r}</option>`).join('')}</select></label></div>
    <label class="f" style="margin-top:8px">Họ tên người rút <span class="small muted">(mỗi người một dòng; để trống nếu chỉ biết số lượng)</span><textarea id="kuNames" rows="3">${esc(v.names || '')}</textarea></label>
    <label class="f" style="margin-top:8px">Ghi chú (người giao trả, giấy tờ đã trả, liên hệ…)<textarea id="kuNote" rows="2">${esc(v.note || '')}</textarea></label>
    <label class="f" style="margin-top:8px">Người ghi nhận<input id="kuBy" value="${esc(v.by || '')}"></label>
    ${e ? `<label class="f" style="margin-top:8px">Lý do sửa <span class="small muted">(bắt buộc)</span><input id="kuWhy" value="${esc(v.why || '')}"></label>` : ''}
    <div id="kuPrev" class="small" style="margin-top:8px"></div>`, () => {
    const n = { date: $('#kuDate').value, qty: kInt($('#kuQty').value), names: kNames($('#kuNames').value).join('\n'), reason: $('#kuReason').value, note: $('#kuNote').value.trim(), by: C.norm($('#kuBy').value), why: e ? $('#kuWhy').value.trim() : '' };
    const nn = kNames(n.names).length; if (!n.qty && nn) n.qty = nn;
    const again = m => setTimeout(() => kRutDlg(kid, eid, n, m), 0);
    if (!n.date) return again('Nhập ngày rút.');
    if (n.qty <= 0) return again('Nhập số lượng rút (hoặc ghi họ tên người rút).');
    if (nn > n.qty) return again(`Có ${nn} họ tên nhưng số lượng chỉ ${n.qty}.`);
    if (n.qty > avail) return again(`Số rút (${n.qty}) lớn hơn số hồ sơ còn lại của đợt (${avail}).`);
    if (n.date > todayISO()) return again('Ngày rút không được ở tương lai.');
    if (!n.by) return again('Ghi tên người ghi nhận.');
    if (e && n.why.length < 3) return again('Ghi lý do sửa.');
    const go = () => {
      const desc = x => `${x.qty} hồ sơ ngày ${fd(x.date)}${kNames(x.names).length ? ' (' + kNames(x.names).join(', ') + ')' : ''}, lý do: ${x.reason}`;
      if (e) { (e.edits = e.edits || []).push({ at: new Date().toISOString(), by: curUser(), reason: n.why, before: { date: e.date, qty: e.qty, names: e.names, reason: e.reason, note: e.note, by: e.by } });
        const old = desc(e); Object.assign(e, { date: n.date, qty: n.qty, names: n.names, reason: n.reason, note: n.note, by: n.by }); kHist(k, 'Sửa bản ghi rút', `${old} → ${desc(e)} · Lý do: ${n.why}`); }
      else { const x = { id: uid(), date: n.date, qty: n.qty, names: n.names, reason: n.reason, note: n.note, by: n.by, at: new Date().toISOString(), edits: [] }; (k.rut = k.rut || []).push(x); kHist(k, 'Rút hồ sơ', desc(x) + (n.note ? ' · ' + n.note : '')); }
      save(); renderKhoa(); toast(`Đã ghi nhận rút. Còn lại ${kCalc(k).net}/${k.limit}`);
    };
    k.closed ? requireAdmin('Sửa số liệu đợt đã chốt', go) : go();
  }, e ? 'Lưu sửa' : 'Ghi nhận rút');
  const prev = () => { const nn = kNames($('#kuNames').value).length, q = kInt($('#kuQty').value) || nn;
    $('#kuPrev').innerHTML = q ? `Sau khi trừ: còn lại <b>${avail - q}</b> / giới hạn ${k.limit}${nn && nn !== q ? ` · <span class="r-T">${nn} họ tên / số lượng ${q}</span>` : ''}` : ''; };
  ['kuQty', 'kuNames'].forEach(i => $('#' + i).addEventListener('input', prev)); prev();
}
window.kRutDlg = kRutDlg;

/* ---------- Sửa / xoá / lịch sử từng dòng ---------- */
window.kEditEntry = (kid, kind, eid) => kind === 'recv' ? kRecvDlg(kid, null, eid) : kRutDlg(kid, eid);
window.kDelEntry = (kid, kind, eid) => requireAdmin('Xoá dòng số liệu nhận / rút hồ sơ', () => {
  const k = kGet(kid), x = (kind === 'recv' ? k.recv : k.rut).find(y => y.id === eid), lbl = kind === 'recv' ? kRecvLabel(x) : 'bản ghi rút ' + x.qty + ' hồ sơ ngày ' + fd(x.date);
  dialog(`<h2>Xoá ${esc(lbl)}?</h2><p class="small">Dòng không mất hẳn: được đánh dấu đã xoá, không còn tính vào số lượng, vẫn xem lại được để đối chiếu.</p><label class="f">Lý do xoá <span class="small muted">(bắt buộc)</span><input id="kxWhy"></label>`, () => {
    const why = $('#kxWhy').value.trim(); if (why.length < 3) return blockMsg('Chưa ghi lý do', '<p>Ghi lý do xoá để lưu vào lịch sử đối chiếu.</p>');
    x.deleted = { at: new Date().toISOString(), by: curUser(), reason: why }; kHist(k, 'Xoá ' + lbl, `${kind === 'recv' ? x.qty + ' hồ sơ ngày ' + fd(x.date) : ''} · Lý do: ${why}`); save(); renderKhoa(); toast('Đã xoá (vẫn lưu lịch sử)'); }, 'Xoá');
  setTimeout(() => { const el = $('#kxWhy'); if (el) el.focus(); }, 50);
});
window.kEntryHist = (kid, kind, eid) => { const k = kGet(kid), x = (kind === 'recv' ? k.recv : k.rut).find(y => y.id === eid);
  blockMsg('Lịch sử sửa', `<div class="tw"><table><tr><th>Lúc</th><th>Người sửa</th><th>Lý do</th><th>Giá trị trước khi sửa</th></tr>${x.edits.map(ed => `<tr><td class="mono">${kStamp(ed.at)}</td><td>${esc(ed.by)}</td><td>${esc(ed.reason)}</td><td class="small">${esc(Object.entries(ed.before).map(([a, b]) => `${a}: ${a === 'date' ? fd(b) : b}`).join(' · '))}</td></tr>`).join('')}</table></div>`); };
window.kToggleClose = id => { const k = kGet(id);
  if (k.closed) return requireAdmin('Mở chốt đợt', () => { k.closed = null; kHist(k, 'Mở chốt đợt', ''); save(); renderKhoa(); });
  const c = kCalc(k); dialog(`<h2>Chốt đợt ${esc(k.name)}?</h2><p>Số liệu chốt: đã nhận <b>${c.received}</b>, đã rút <b>${c.withdrawn}</b>, còn lại <b>${c.net}</b> / giới hạn ${c.limit}.</p><p class="small muted">Sau khi chốt, sửa hoặc xoá số liệu cần mật khẩu quản lý.</p>`, () => {
    k.closed = { at: new Date().toISOString(), by: curUser(), snap: { received: c.received, withdrawn: c.withdrawn, net: c.net } }; kHist(k, 'Chốt đợt', `Đã nhận ${c.received}, đã rút ${c.withdrawn}, còn lại ${c.net}/${c.limit}`); save(); renderKhoa(); }, 'Chốt'); };
window.kDelete = id => requireAdmin('Xoá đợt khóa mới', () => { const k = kGet(id);
  dialog(`<h2>Xoá đợt ${esc(k.name)}?</h2><p class="small">Đợt được chuyển sang mục “Đã xoá” (lọc Tình trạng → Đã xoá), khôi phục được.</p><label class="f">Lý do xoá<input id="kxWhy"></label>`, () => {
    const why = $('#kxWhy').value.trim(); if (why.length < 3) return blockMsg('Chưa ghi lý do', '<p>Ghi lý do xoá đợt.</p>');
    k.deleted = { at: new Date().toISOString(), by: curUser(), reason: why }; kHist(k, 'Xoá đợt', why); kCur = null; save(); renderKhoa(); }, 'Xoá'); });
window.kRestore = id => { const k = kGet(id); if (kAll().some(x => !x.deleted && x.id !== id && fold(x.name) === fold(k.name))) return blockMsg('Trùng tên', '<p>Đang có đợt cùng tên. Đổi tên đợt kia trước.</p>');
  k.deleted = null; kHist(k, 'Khôi phục đợt', ''); save(); renderKhoa(); };

/* ---------- Xuất Excel ---------- */
function kSheet(title, subs, cols, rows, sign){
  const F = 'Times New Roman', thin = { style: 'thin', color: { rgb: '808080' } }, B = { top: thin, bottom: thin, left: thin, right: thin }, NAVY = '0B4F8A', nC = cols.length;
  const aoa = [[ORG + ' · ' + ORG_SITE], [title], ...subs.map(s => [s]), [], cols.map(c => c.h)], HR = aoa.length - 1;
  rows.forEach(r => aoa.push(r.c));
  const ws = XLSX.utils.aoa_to_sheet(aoa), cell = (r, c) => { const ref = XLSX.utils.encode_cell({ r, c }); if (!ws[ref]) ws[ref] = { t: 's', v: '' }; return ws[ref]; };
  const merges = [];
  cell(0, 0).s = { font: { name: F, sz: 10, bold: true, color: { rgb: NAVY } } };
  cell(1, 0).s = { font: { name: F, sz: 15, bold: true }, alignment: { horizontal: 'center', vertical: 'center' } }; merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: nC - 1 } });
  subs.forEach((s, i) => { cell(2 + i, 0).s = { font: { name: F, sz: 10.5, italic: true, color: { rgb: '404040' } }, alignment: { horizontal: 'center' } }; merges.push({ s: { r: 2 + i, c: 0 }, e: { r: 2 + i, c: nC - 1 } }); });
  for (let c = 0; c < nC; c++) cell(HR, c).s = { font: { name: F, sz: 10.5, bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: NAVY } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: B };
  rows.forEach((row, i) => { const r = HR + 1 + i, t = row.t || 'd';
    if (t === 'g') { for (let c = 0; c < nC; c++) cell(r, c).s = { font: { name: F, sz: 11, bold: true, color: { rgb: NAVY } }, fill: { fgColor: { rgb: 'E8EEF5' } }, border: B }; merges.push({ s: { r, c: 0 }, e: { r, c: nC - 1 } }); return; }
    for (let c = 0; c < nC; c++) { const x = cell(r, c), k = cols[c].k || 'txt', tot = t === 's' || t === 't';
      if (x.v !== '' && x.v != null) { if (k === 'num' || k === 'money' || k === 'pct') { x.t = 'n'; x.z = k === 'money' ? '#,##0' : k === 'pct' ? '0.0%' : '#,##0'; } if (k === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(x.v)) { x.t = 'n'; x.v = kSerial(x.v); x.z = 'dd/mm/yyyy'; } }
      x.s = { font: { name: F, sz: 11, bold: tot || !!cols[c].b, strike: t === 'x', color: t === 'x' ? { rgb: '808080' } : (cols[c].red && +x.v > 0 ? { rgb: 'A1261E' } : (row.color && row.color[c] ? { rgb: row.color[c] } : undefined)) },
        alignment: { horizontal: ['num', 'money', 'pct'].includes(k) ? 'right' : ['date', 'ctr'].includes(k) ? 'center' : 'left', vertical: 'center', wrapText: !!cols[c].wrap }, border: B,
        fill: t === 't' ? { fgColor: { rgb: 'DCE6F1' } } : t === 's' ? { fgColor: { rgb: 'EEF3F8' } } : (row.fill ? { fgColor: { rgb: row.fill } } : (i % 2 ? { fgColor: { rgb: 'F7F9FB' } } : undefined)) };
      if (t === 't' || t === 's') x.s.border = Object.assign({}, B, { top: { style: 'medium', color: { rgb: NAVY } } }); } });
  let end = aoa.length - 1;
  if (sign) { const r = aoa.length + 1, c1 = 1, c2 = Math.max(nC - 3, 3), today = todayISO().split('-'), st = (b, it) => ({ font: { name: F, sz: 11, bold: b, italic: it }, alignment: { horizontal: 'center' } });
    ws[XLSX.utils.encode_cell({ r, c: c2 })] = { t: 's', v: `Hoài Nhơn, ngày ${today[2]} tháng ${today[1]} năm ${today[0]}`, s: st(false, true) };
    ws[XLSX.utils.encode_cell({ r: r + 1, c: c1 })] = { t: 's', v: 'BÊN GIAO', s: st(true) }; ws[XLSX.utils.encode_cell({ r: r + 1, c: c2 })] = { t: 's', v: 'BÊN NHẬN', s: st(true) };
    ws[XLSX.utils.encode_cell({ r: r + 2, c: c1 })] = { t: 's', v: '(Ký, ghi rõ họ tên)', s: st(false, true) }; ws[XLSX.utils.encode_cell({ r: r + 2, c: c2 })] = { t: 's', v: '(Ký, ghi rõ họ tên)', s: st(false, true) };
    ws[XLSX.utils.encode_cell({ r: r + 6, c: c1 })] = { t: 's', v: curUser() || '', s: st(true) };
    const c2e = Math.min(nC - 1, c2 + 2); [r, r + 1, r + 2].forEach(rr => merges.push({ s: { r: rr, c: c2 }, e: { r: rr, c: c2e } })); end = r + 6; }
  ws['!merges'] = merges; ws['!cols'] = cols.map(c => ({ wch: c.w || 12 }));
  ws['!rows'] = [{ hpt: 16 }, { hpt: 26 }]; ws['!rows'][HR] = { hpt: 30 };
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: end, c: nC - 1 } });
  ws['!margins'] = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };
  return { ws, HR };
}
function kSheetsFor(list, oneK){
  const sheets = [], stamp = `Lập ngày ${fd(todayISO())}${curUser() ? ' · Người lập: ' + curUser() : ''}`;
  const tot = f => list.reduce((s, x) => s + x.c[f], 0);
  if (!oneK) {
    const cols = [{ h: 'STT', w: 6, k: 'ctr' }, { h: 'Đợt / khóa', w: 20, b: 1 }, { h: 'Hạng', w: 7, k: 'ctr' }, { h: 'Ngày sát hạch dự kiến', w: 13, k: 'date' }, { h: 'Hạn nhận hồ sơ', w: 12, k: 'date' }, { h: 'Giới hạn', w: 10, k: 'num' },
      { h: 'Số lần nhận', w: 9, k: 'num' }, { h: 'Đã nhận', w: 10, k: 'num' }, { h: 'Đã rút', w: 9, k: 'num', red: 1 }, { h: 'Còn lại (dự thi)', w: 11, k: 'num', b: 1 }, { h: 'Còn trống', w: 10, k: 'num' }, { h: 'Tỷ lệ lấp đầy', w: 10, k: 'pct' },
      { h: 'Đơn giá', w: 11, k: 'money' }, { h: 'Thành tiền (còn lại × đơn giá)', w: 15, k: 'money' }, { h: 'Tình trạng', w: 14, k: 'ctr' }, { h: 'Nhận gần nhất', w: 12, k: 'date' }, { h: 'Ghi chú', w: 34, wrap: 1 }];
    const tone = { over: 'A1261E', full: '1D6B3E', late: '7A5A00', closed: '1D6B3E' };
    const rows = list.map(({ k, c }, i) => ({ c: [i + 1, k.name, k.hang, k.examDate, k.deadline, c.limit, c.nLan + c.nBs, c.received, c.withdrawn, c.net, c.free, c.pct, c.price, c.moneyNet, K_ST[c.st][0], c.lastRecv, k.note], color: { 14: tone[c.st], 10: c.free < 0 ? 'A1261E' : undefined } }));
    const L = tot('limit'), N = tot('net');
    rows.push({ t: 't', c: ['', `TỔNG CỘNG (${list.length} đợt)`, '', '', '', L, list.reduce((s, x) => s + x.c.nLan + x.c.nBs, 0), tot('received'), tot('withdrawn'), N, tot('free'), L ? N / L : 0, '', tot('moneyNet'), '', '', ''] });
    sheets.push(['Thong ke cac dot', kSheet('BẢNG THỐNG KÊ NHẬN HỒ SƠ MỚI CÁC ĐỢT – MÔ TÔ', [kFilterDesc(), stamp], cols, rows, true), 17]);
  } else {
    const { k, c } = list[0], cols = [{ h: 'STT', w: 6, k: 'ctr' }, { h: 'Loại hồ sơ', w: 30, wrap: 1 }, { h: 'Số lượng', w: 10, k: 'num', b: 1 }, { h: 'Ngày nhận', w: 12, k: 'date' }, { h: 'Đơn giá (VNĐ)', w: 13, k: 'money' }, { h: 'Thành tiền', w: 15, k: 'money' }, { h: 'Tỷ lệ %', w: 9, k: 'pct' }, { h: 'Người nhận', w: 18 }, { h: 'Ghi chú', w: 40, wrap: 1 }];
    const recv = kLive(k.recv).sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));
    const rows = recv.map((x, i) => ({ c: [i + 1, kRecvLabel(x), x.qty, x.date, c.price, x.qty * c.price, c.received ? x.qty / c.received : 0, x.by, x.note], fill: x.kind === 'bs' ? 'FFF3D1' : undefined }));
    if (!rows.length) rows.push({ c: ['', '(chưa nhận hồ sơ)', '', '', '', '', '', '', ''] });
    rows.push({ t: 't', c: ['', 'TỔNG ĐÃ NHẬN', c.received, '', '', c.money, c.received ? 1 : 0, '', ''] });
    const rut = kLive(k.rut).sort((a, b) => a.date.localeCompare(b.date));
    if (rut.length) { rows.push({ t: 'g', c: ['HỌC VIÊN RÚT HỒ SƠ (nộp nhưng không thi)'] });
      rut.forEach((x, i) => rows.push({ c: [i + 1, 'Rút: ' + (kNames(x.names).join(', ') || '(không ghi tên)'), -x.qty, x.date, '', '', '', x.by, [x.reason, x.note].filter(Boolean).join(' · ')], color: { 2: 'A1261E' } }));
      rows.push({ t: 's', c: ['', 'TỔNG ĐÃ RÚT', -c.withdrawn, '', '', '', '', '', ''] }); }
    rows.push({ t: 'g', c: ['KIỂM TRA SỐ LƯỢNG'] });
    rows.push({ c: ['', 'Đã nhận', c.received, '', '', '', '', '', ''] }, { c: ['', 'Đã rút', -c.withdrawn, '', '', '', '', '', ''] },
      { t: 's', c: ['', 'CÒN LẠI (dự thi)', c.net, '', '', c.moneyNet, c.pct, '', `Giới hạn ${c.limit} · ${c.free < 0 ? 'VƯỢT ' + (-c.free) : c.free ? 'còn trống ' + c.free : 'ĐỦ CHỈ TIÊU'} · Tình trạng: ${K_ST[c.st][0]}`] });
    { const a = kActual(k); if (a) rows.push({ c: ['', `Thực tế dự thi lần đầu kỳ ${fd(k.examDate)}`, a.first, '', '', '', '', '', `Đạt ${a.D}, trượt ${a.T}, vắng ${a.V} · ${a.first === c.net ? 'khớp số còn lại' : 'chênh ' + (a.first - c.net) + ' so với còn lại'}`], color: { 2: a.first === c.net ? undefined : 'A1261E' } }); }
    const subs = [`Đợt: ${k.name} · Hạng ${k.hang} · Ngày sát hạch dự kiến: ${fd(k.examDate)}${k.deadline ? ' · Hạn nhận HS: ' + fd(k.deadline) : ''} · Giới hạn: ${c.limit}`, (k.note ? 'Ghi chú: ' + k.note + ' · ' : '') + stamp];
    sheets.push(['Nhan ho so', kSheet('QUẢN LÝ NHẬN HỒ SƠ MỚI', subs, cols, rows, true), 9]);
  }
  /* Chi tiết các lần nhận + rút (nhiều đợt) */
  if (!oneK) {
    const cols = [{ h: 'STT', w: 6, k: 'ctr' }, { h: 'Loại hồ sơ', w: 24 }, { h: 'Ngày nhận', w: 12, k: 'date' }, { h: 'Số lượng', w: 10, k: 'num', b: 1 }, { h: 'Đơn giá', w: 12, k: 'money' }, { h: 'Thành tiền', w: 15, k: 'money' }, { h: 'Tỷ lệ %', w: 9, k: 'pct' }, { h: 'Người nhận', w: 18 }, { h: 'Ghi chú', w: 36, wrap: 1 }, { h: 'Ghi nhận lúc', w: 17, k: 'ctr' }];
    const rows = [];
    for (const { k, c } of list) { rows.push({ t: 'g', c: [`${k.name} · Hạng ${k.hang} · Ngày SH dự kiến ${fd(k.examDate)} · Giới hạn ${c.limit} · Còn lại ${c.net}`] });
      kLive(k.recv).sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at)).forEach((x, i) => rows.push({ c: [i + 1, kRecvLabel(x), x.date, x.qty, c.price, x.qty * c.price, c.received ? x.qty / c.received : 0, x.by, x.note, kStamp(x.at)] }));
      rows.push({ t: 's', c: ['', `Cộng ${k.name}`, '', c.received, '', c.money, c.received ? 1 : 0, '', c.withdrawn ? `Đã rút ${c.withdrawn} · còn lại ${c.net}` : '', ''] }); }
    rows.push({ t: 't', c: ['', 'TỔNG CỘNG', '', tot('received'), '', tot('money'), '', '', `Đã rút ${tot('withdrawn')} · còn lại ${tot('net')}`, ''] });
    sheets.push(['Chi tiet nhan HS', kSheet('CHI TIẾT CÁC LẦN NHẬN HỒ SƠ', [kFilterDesc(), stamp], cols, rows, false), 10]);
    const rcols = [{ h: 'STT', w: 6, k: 'ctr' }, { h: 'Đợt / khóa', w: 18 }, { h: 'Ngày rút', w: 12, k: 'date' }, { h: 'Số lượng', w: 9, k: 'num', b: 1 }, { h: 'Họ tên', w: 28, wrap: 1 }, { h: 'Lý do', w: 26, wrap: 1 }, { h: 'Ghi chú', w: 30, wrap: 1 }, { h: 'Người ghi', w: 16 }, { h: 'Ghi nhận lúc', w: 17, k: 'ctr' }];
    const rr = []; list.forEach(({ k }) => kLive(k.rut).forEach(x => rr.push({ k, x })));
    rr.sort((a, b) => a.x.date.localeCompare(b.x.date));
    const rrows = rr.map(({ k, x }, i) => ({ c: [i + 1, k.name, x.date, x.qty, kNames(x.names).join('\n'), x.reason, x.note, x.by, kStamp(x.at)] }));
    rrows.push({ t: 't', c: ['', 'TỔNG CỘNG', '', tot('withdrawn'), '', '', '', '', ''] });
    sheets.push(['Rut ho so', kSheet('DANH SÁCH RÚT HỒ SƠ (NỘP NHƯNG KHÔNG THI)', [kFilterDesc(), stamp], rcols, rrows, false), 9]);
  }
  /* Lịch sử thay đổi — gồm cả dòng đã sửa / xoá, làm căn cứ đối chiếu */
  const hcols = [{ h: 'Thời điểm', w: 18, k: 'ctr' }, { h: 'Người thao tác', w: 18 }, { h: 'Đợt / khóa', w: 18 }, { h: 'Thao tác', w: 26 }, { h: 'Chi tiết', w: 70, wrap: 1 }];
  const hh = []; list.forEach(({ k }) => (k.hist || []).forEach(h => hh.push({ k, h }))); hh.sort((a, b) => a.h.at.localeCompare(b.h.at));
  sheets.push(['Lich su thay doi', kSheet('LỊCH SỬ THAY ĐỔI SỐ LIỆU (CĂN CỨ ĐỐI CHIẾU)', [stamp], hcols, hh.map(({ k, h }) => ({ c: [kStamp(h.at), h.by, k.name, h.act, h.detail], fill: /Xoá|Sửa/.test(h.act) ? 'FFF3D1' : undefined })), false), 5]);
  return sheets;
}
function kFilterDesc(){ const q = $('#kSearch').value.trim(), y = $('#kYear').value, st = $('#kSt').value;
  return [y ? 'Năm ' + y : 'Tất cả các năm', st ? 'Tình trạng: ' + $('#kSt').selectedOptions[0].text : '', q ? `Tìm: “${q}”` : ''].filter(Boolean).join(' · '); }
function kWrite(sheets, filename){
  const wb = XLSX.utils.book_new(); sheets.forEach(([n, { ws }]) => XLSX.utils.book_append_sheet(wb, ws, n));
  writeXlsxPrint(wb, filename, null, sheets.map(([, { HR }]) => ({ titles: `$${HR + 1}:$${HR + 1}`, freeze: HR + 1 })));
}
$('#kExportAll').onclick = () => { const list = kFiltered(); if (!list.length) return toast('Không có đợt nào để xuất');
  kWrite(kSheetsFor(list, false), `THONG_KE_NHAN_HO_SO_MOI_${todayISO().split('-').reverse().join('-')}.xlsx`); logA('Khóa mới: Xuất bảng thống kê', '', '', `${list.length} đợt`); save(); toast(`Đã xuất ${list.length} đợt`); };
window.kExportOne = id => { const k = kGet(id), list = [{ k, c: kCalc(k) }];
  kWrite(kSheetsFor(list, true), `NHAN_HO_SO_MOI_${k.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'D').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').toUpperCase()}_${(k.examDate || todayISO()).split('-').reverse().join('-')}.xlsx`); logA('Khóa mới: Xuất Excel đợt', '', k.name, ''); save(); };
