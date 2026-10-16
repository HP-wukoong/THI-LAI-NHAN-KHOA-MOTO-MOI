/* =====================================================================
   QUẢN LÝ: người dùng & phân quyền, khoá màn hình, tổng quan, báo cáo,
   hướng dẫn, phím tắt, chế độ hiển thị, xem trước phiếu thu
   ===================================================================== */
var SESSION = { user: null, locked: false, last: Date.now() };
const ROLES = { quay: 'Nhân viên quầy', ketoan: 'Kế toán', quanly: 'Quản lý' };
const RANK = { quay: 1, ketoan: 2, quanly: 3 };
const usersOn = () => (S.users || []).some(u => u.active);
const activeUsers = () => (S.users || []).filter(u => u.active);
function restoreSession(){ try { const id = sessionStorage.getItem('soA1.sess'); const u = id && activeUsers().find(x => x.id === id); SESSION.user = u || null; } catch(e){} }
/* Thao tác cần quyền: người đang đăng nhập đủ quyền thì làm luôn, không thì người có quyền nhập PIN duyệt */
function requireRole(min, label, fn){
  if (!usersOn()) return requireAdminPw(label, fn);
  if (SESSION.user && RANK[SESSION.user.role] >= RANK[min]) return fn();
  const ok = activeUsers().filter(u => RANK[u.role] >= RANK[min]);
  dialog(`<h2>Cần quyền ${ROLES[min]}</h2><p class="small">Thao tác: <b>${esc(label)}</b>${SESSION.user ? `<br>Người đang làm: ${esc(SESSION.user.name)} (${ROLES[SESSION.user.role]})` : ''}</p>
    <div class="row"><label class="f">Người duyệt<select id="apU">${ok.map(u => `<option value="${u.id}">${esc(u.name)} · ${ROLES[u.role]}</option>`).join('')}</select></label><label class="f">Mã PIN<input type="password" id="apPin" inputmode="numeric" autocomplete="off" style="width:120px"></label></div>`, async () => {
    const u = ok.find(x => x.id === $('#apU').value);
    if (!u || (await hashPw($('#apPin').value, u.salt)) !== u.pin) { logA('Duyệt quyền thất bại', '', u ? u.name : '', label); save(); return toast('Sai mã PIN'); }
    logA('Duyệt quyền', '', u.name, label + (SESSION.user && SESSION.user.id !== u.id ? ' · cho ' + SESSION.user.name : '')); fn();
  }, 'Duyệt');
  setTimeout(() => { const e = $('#apPin'); if (e) e.focus(); }, 50);
}
function requireAdmin(label, fn){ return requireRole('quanly', label, fn); }

/* ---------- Đăng nhập / khoá màn hình ---------- */
function showLogin(lockedUser){
  const el = $('#lockScreen'); document.body.classList.add('locked'); el.hidden = false;
  const us = activeUsers();
  el.innerHTML = `<div class="lockbox"><div class="logo" style="margin:0 auto 10px">A1</div><h2 style="margin:0 0 4px;text-align:center">${lockedUser ? 'Màn hình đã khoá' : 'Đăng nhập'}</h2>
    <p class="small muted" style="text-align:center;margin:0 0 14px">${lockedUser ? 'Không thao tác quá ' + (S.cfg.idleMin || 10) + ' phút. Nhập mã PIN để tiếp tục.' : esc(ORG) + ' · ' + ORG_SITE}</p>
    <label class="f">Người dùng<select id="lgU">${us.map(u => `<option value="${u.id}"${lockedUser && u.id === lockedUser.id ? ' selected' : ''}>${esc(u.name)} · ${ROLES[u.role]}</option>`).join('')}</select></label>
    <label class="f" style="margin-top:8px">Mã PIN<input type="password" id="lgPin" inputmode="numeric" autocomplete="off"></label>
    <div id="lgMsg" class="small r-T" style="min-height:18px;margin-top:6px"></div>
    <button class="b p" id="lgGo" style="width:100%;justify-content:center">Vào làm việc</button></div>`;
  const go = async () => { const u = us.find(x => x.id === $('#lgU').value);
    if (!u || (await hashPw($('#lgPin').value, u.salt)) !== u.pin) { $('#lgMsg').textContent = 'Sai mã PIN'; logA('Đăng nhập sai PIN', '', u ? u.name : '', machineName()); save(); $('#lgPin').value = ''; return; }
    const changed = !SESSION.user || SESSION.user.id !== u.id; SESSION.user = u; SESSION.locked = false; SESSION.last = Date.now();
    try { sessionStorage.setItem('soA1.sess', u.id); } catch(e){}
    if (changed) { logA('Đăng nhập', '', u.name, machineName()); save(); }
    el.hidden = true; document.body.classList.remove('locked'); renderUser(); renderAll(); };
  $('#lgGo').onclick = go; $('#lgPin').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
  setTimeout(() => $('#lgPin').focus(), 50);
}
function needLogin(){ if (usersOn() && !SESSION.user) showLogin(); }
['mousemove', 'keydown', 'click', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { SESSION.last = Date.now(); }, { passive: true, capture: true }));
setInterval(() => { if (usersOn() && SESSION.user && !SESSION.locked && Date.now() - SESSION.last > (S.cfg.idleMin || 10) * 60e3) { SESSION.locked = true; const d = $('#dlg'); if (d.open) d.close(); showLogin(SESSION.user); } }, 15e3);
function logout(){ logA('Đăng xuất', '', SESSION.user ? SESSION.user.name : '', ''); save(); SESSION.user = null; try { sessionStorage.removeItem('soA1.sess'); } catch(e){} showLogin(); }

/* ---------- Quản lý người dùng ---------- */
function renderUsers(){
  const el = $('#usrTable'); if (!el) return; const us = S.users || [];
  el.innerHTML = us.length ? `<table><tr><th>Họ tên</th><th>Vai trò</th><th>Tình trạng</th><th>Tạo lúc</th><th></th></tr>${us.map(u => `<tr class="${u.active ? '' : 'kdel'}"><td><b>${esc(u.name)}</b></td><td>${ROLES[u.role]}</td><td>${u.active ? 'Đang dùng' : 'Đã khoá'}</td><td class="mono small">${new Date(u.createdAt).toLocaleString('vi-VN')}</td>
    <td class="act"><button class="b s" onclick="userDlg('${u.id}')">Sửa / đặt lại PIN</button><button class="b s" onclick="userToggle('${u.id}')">${u.active ? 'Khoá' : 'Mở lại'}</button></td></tr>`).join('')}</table>`
    : '<div class="empty">Chưa tạo người dùng: tool chạy ở chế độ một mật khẩu quản lý chung.</div>';
  $('#usrInfo').innerHTML = usersOn() ? `Đang bật phân quyền · ${activeUsers().length} người dùng · khoá màn hình sau <b>${S.cfg.idleMin || 10}</b> phút không thao tác${SESSION.user ? ' · bạn: <b>' + esc(SESSION.user.name) + '</b> (' + ROLES[SESSION.user.role] + ')' : ''}` : 'Chưa bật phân quyền.';
}
window.userDlg = id => requireRole('quanly', id ? 'Sửa người dùng' : 'Tạo người dùng', () => {
  const u = id ? S.users.find(x => x.id === id) : null, first = !usersOn();
  dialog(`<h2>${u ? 'Sửa ' + esc(u.name) : first ? 'Tạo người dùng đầu tiên (Quản lý)' : 'Tạo người dùng'}</h2>
    <div class="row"><label class="f" style="flex:1;min-width:200px">Họ tên<input id="usName" value="${esc(u ? u.name : '')}"></label>
    <label class="f">Vai trò<select id="usRole"${first ? ' disabled' : ''}>${Object.entries(ROLES).map(([k, v]) => `<option value="${k}"${(u ? u.role : first ? 'quanly' : 'quay') === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label></div>
    <div class="row" style="margin-top:8px"><label class="f">Mã PIN ${u ? '(để trống nếu giữ nguyên)' : ''}<input type="password" id="usPin" inputmode="numeric" autocomplete="new-password"></label><label class="f">Nhập lại PIN<input type="password" id="usPin2" inputmode="numeric" autocomplete="new-password"></label></div>
    <p class="small muted">PIN 4–8 chữ số. Quầy: tra cứu, đăng ký, thu tiền, in phiếu, rút hồ sơ, khóa mới. Kế toán: thêm chốt quỹ, hoàn / giảm tiền. Quản lý: toàn quyền (sửa số tiền, xoá, cài đặt, khôi phục, người dùng).</p>`, async () => {
    const name = C.norm($('#usName').value), role = first ? 'quanly' : $('#usRole').value, pin = $('#usPin').value, pin2 = $('#usPin2').value;
    if (!name) return blockMsg('Thiếu họ tên', '');
    if ((S.users || []).some(x => x.id !== id && fold(x.name) === fold(name))) return blockMsg('Trùng tên', '<p>Đã có người dùng cùng tên.</p>');
    if ((!u || pin) && !/^\d{4,8}$/.test(pin)) return blockMsg('PIN không hợp lệ', '<p>PIN gồm 4 đến 8 chữ số.</p>');
    if (pin !== pin2) return blockMsg('PIN không khớp', '');
    if (u && u.role === 'quanly' && role !== 'quanly' && activeUsers().filter(x => x.role === 'quanly').length < 2) return blockMsg('Phải còn ít nhất 1 quản lý', '');
    const x = u || { id: uid(), createdAt: nowISO(), active: true }; x.name = name; x.role = role;
    if (pin) { x.salt = uid(); x.pin = await hashPw(pin, x.salt); }
    if (!u) S.users.push(x);
    logA(u ? 'Sửa người dùng' : 'Tạo người dùng', '', name, ROLES[role] + (pin ? ' · đặt PIN' : ''));
    if (first) { SESSION.user = x; try { sessionStorage.setItem('soA1.sess', x.id); } catch(e){} }
    if (SESSION.user && SESSION.user.id === x.id) SESSION.user = x;
    save(); renderUsers(); renderUser(); toast('Đã lưu người dùng ' + name);
  }, 'Lưu');
});
window.userToggle = id => requireRole('quanly', 'Khoá / mở người dùng', () => { const u = S.users.find(x => x.id === id);
  if (u.active && u.role === 'quanly' && activeUsers().filter(x => x.role === 'quanly').length < 2) return blockMsg('Không khoá được', '<p>Phải còn ít nhất 1 quản lý đang dùng.</p>');
  u.active = !u.active; logA(u.active ? 'Mở lại người dùng' : 'Khoá người dùng', '', u.name, ''); if (!u.active && SESSION.user && SESSION.user.id === u.id) { save(); return logout(); } save(); renderUsers(); });

/* ---------- Tổng quan ---------- */
function renderHome(){
  const t = todayISO(), todayPays = S.pays.filter(p => p.date === t), s = paySum(todayPays);
  const un = unclosedDays(), unOld = un.filter(u => u.date < t);
  const nextDots = dotsSorted().filter(o => o.date >= t).slice(0, 3);
  const issues = S.regs.filter(r => r.kind === 'lai' && !r.cancelled && regIssues(r).length);
  const debt = S.regs.filter(r => !r.cancelled && regTotals(r).left > 0), debtSum = debt.reduce((a, r) => a + regTotals(r).left, 0);
  const stale = staleDots(), integ = integrityReport(), ib = integ.filter(x => x.lv === 'bad').length;
  const kh = (S.khoa || []).filter(k => !k.deleted).map(k => ({ k, c: kCalc(k) })).filter(x => !['done', 'closed'].includes(x.c.st));
  let lastBk = '', lastXl = ''; try { lastBk = localStorage.getItem('soA1.lastBk') || ''; lastXl = localStorage.getItem('soA1.bk') || ''; } catch(e){}
  const todo = [];
  if (!storageOk()) todo.push(['bad', 'Chưa lưu được ra ổ đĩa — thu tiền đang bị chặn', 'data']);
  else if (FS.supported && !FS.ready()) todo.push(['warn', 'Đang làm việc tạm không có thư mục lưu', 'data']);
  if (ib) todo.push(['bad', `${ib} lỗi toàn vẹn dữ liệu cần xem`, 'data']);
  if (unOld.length) todo.push(['bad', `${unOld.length} ca của ngày trước chưa chốt quỹ`, 'quy']);
  if (issues.length) todo.push(['bad', `${issues.length} đăng ký thi lại sai phần thi / lệ phí so với đợt`, 'tl']);
  stale.forEach(d => todo.push(['warn', `Đợt ${fd(d)} đã thi nhưng chưa nạp kết quả`, 'data']));
  if (debt.length) todo.push(['warn', `${debt.length} người còn nợ, tổng ${money(debtSum)} đ`, 'thu']);
  kh.filter(x => x.c.st === 'over').forEach(x => todo.push(['bad', `Khóa mới ${x.k.name}: vượt chỉ tiêu ${x.c.net - x.c.limit}`, 'khoa']));
  kh.filter(x => x.c.days != null && x.c.days >= 0 && x.c.days <= 14 && x.c.free > 0).forEach(x => todo.push(['warn', `Khóa mới ${x.k.name}: còn ${x.c.days} ngày đến sát hạch, còn trống ${x.c.free} chỗ`, 'khoa']));
  if (!lastXl || Date.now() - new Date(lastXl).getTime() > 7 * 864e5) todo.push(['warn', 'Hơn 7 ngày chưa sao lưu ra Excel (cất USB / ổ khác)', 'data']);
  const mtl = H.ev.size ? mtlCandidates().filter(x => x.soonExp && C.daysBetween(t, x.soonExp) <= 60).length : 0;
  if (mtl) todo.push(['warn', `${mtl} người sắp hết bảo lưu trong 60 ngày, chưa đăng ký thi lại`, 'mtl']);
  $('#homeKpi').innerHTML = [['Thu hôm nay', money(s.tmIn + s.ckIn), 'ok', `${todayPays.filter(p => p.amount > 0).length} phiếu thu`], ['Tiền mặt / chuyển khoản', money(s.tm) + ' / ' + money(s.ck), '', 'thuần trong ngày'], ['Còn nợ', money(debtSum), debt.length ? 'warn' : 'ok', debt.length + ' người'], ['Ca chưa chốt', un.length, unOld.length ? 'bad' : un.length ? 'warn' : 'ok', unOld.length ? unOld.length + ' ca ngày trước' : 'hôm nay'], ['Toàn vẹn dữ liệu', ib ? ib + ' lỗi' : 'Tốt', ib ? 'bad' : 'ok', integ.filter(x => x.lv === 'warn').length + ' cảnh báo']]
    .map(([l, v, c, e]) => `<div class="kpi ${c}"><span>${l}</span><b>${v}</b><span>${e}</span></div>`).join('');
  $('#homeTodo').innerHTML = todo.length ? todo.map(([lv, txt, tab]) => `<a href="#" class="todo ${lv}" data-go="${tab}"><i></i>${esc(txt)}<span>›</span></a>`).join('') : '<div class="alert ok">Không có việc tồn đọng.</div>';
  $('#homeDots').innerHTML = nextDots.length ? `<table><tr><th>Đợt</th><th class="num">Còn</th><th class="num">Đăng ký</th><th class="num">Phải thu</th><th class="num">Đã thu</th><th class="num">Còn nợ</th></tr>${nextDots.map(o => { const rs = S.regs.filter(r => r.kind === 'lai' && !r.cancelled && r.examDate === o.date), tt = rs.map(regTotals), sm = k => tt.reduce((a, x) => a + x[k], 0);
    return `<tr><td>${esc(dotLabel(o.date))}</td><td class="num">${C.daysBetween(t, o.date)} ngày</td><td class="num">${rs.length}</td><td class="num">${money(sm('due'))}</td><td class="num">${money(sm('paid'))}</td><td class="num ${sm('left') ? 'r-T' : ''}">${money(sm('left'))}</td></tr>`; }).join('')}</table>` : '<div class="empty">Chưa khai báo đợt thi sắp tới. Vào tab Đợt thi để thêm.</div>';
  const days = [...Array(14)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  $('#homeChart').innerHTML = barChart(days.map(d => ({ l: d.slice(8) + '/' + d.slice(5, 7), v: S.pays.filter(p => p.date === d).reduce((a, p) => a + p.amount, 0) })), 'Tiền thu thuần 14 ngày gần nhất (đ)');
  $('#homeStore').innerHTML = `<div class="kinfo" style="margin-top:0"><div><span>Thư mục dữ liệu</span><b style="font-size:13px">${FS.ready() ? esc(FS.dir.name) : 'chưa kết nối'}</b><em>${FS.last ? 'lưu lúc ' + FS.last.toLocaleTimeString('vi-VN') : ''}</em></div><div><span>Sao lưu tự động</span><b style="font-size:13px">${lastBk ? new Date(lastBk).toLocaleString('vi-VN') : 'chưa có'}</b><em>giờ · ngày · tháng</em></div><div><span>Sao lưu Excel gần nhất</span><b style="font-size:13px">${lastXl ? new Date(lastXl).toLocaleString('vi-VN') : 'chưa có'}</b></div><div><span>Máy đang mở cùng dữ liệu</span><b style="font-size:13px">${FS.others.length ? FS.others.map(o => esc(o.name)).join(', ') : 'chỉ máy này'}</b></div></div>`;
}
$('#homeTodo').addEventListener('click', e => { const a = e.target.closest('[data-go]'); if (a) { e.preventDefault(); switchTab(a.dataset.go); } });
function barChart(rows, title){
  const W = 640, Hh = 170, pad = 28, max = Math.max(1, ...rows.map(r => r.v)), bw = (W - pad * 2) / rows.length;
  return `<figure class="chart"><figcaption class="small muted">${esc(title)}</figcaption><svg viewBox="0 0 ${W} ${Hh + 26}" role="img" aria-label="${esc(title)}">
    <line x1="${pad}" y1="${Hh}" x2="${W - pad}" y2="${Hh}" class="ax"/>
    ${rows.map((r, i) => { const h = Math.max(0, r.v) / max * (Hh - 24), x = pad + i * bw + bw * 0.18; return `<g><title>${esc(r.l)}: ${money(r.v)} đ</title><rect x="${x.toFixed(1)}" y="${(Hh - h).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}" rx="2" class="bar"/>${r.v ? `<text x="${(x + bw * 0.32).toFixed(1)}" y="${(Hh - h - 4).toFixed(1)}" text-anchor="middle" class="bv">${r.v >= 1e6 ? (r.v / 1e6).toFixed(1) + 'tr' : Math.round(r.v / 1e3) + 'k'}</text>` : ''}<text x="${(x + bw * 0.32).toFixed(1)}" y="${Hh + 16}" text-anchor="middle" class="bl">${esc(r.l)}</text></g>`; }).join('')}</svg></figure>`;
}

/* ---------- Đối chiếu khóa mới với kết quả sát hạch ---------- */
function kActual(k){
  if (!k.examDate || !H.people.size || !H.attempts.some(a => a.date === k.examDate)) return null;
  const want = fold(k.hang || 'A1').replace(/m$/, ''), o = { first: 0, D: 0, T: 0, V: 0, all: 0 };
  for (const p of H.people.values()) p.attempts.forEach((a, i) => { if (a.date !== k.examDate || fold(a.cls || '').replace(/m$/, '') !== want) return; o.all++; if (i === 0) { o.first++; const kq = a.kq || (a.lt === 'V' && a.h === 'V' ? 'V' : ''); if (kq) o[kq]++; } });
  return o;
}
function kActualHtml(k, c){
  const a = kActual(k); if (!a) return k.examDate && k.examDate < todayISO() ? `<div class="alert">Đợt sát hạch ${fd(k.examDate)} đã qua nhưng chưa nạp file kết quả: chưa đối chiếu được số thực tế dự thi.</div>` : '';
  const d = a.first - c.net;
  return `<div class="alert ${d ? 'bad' : 'ok'}"><b>Đối chiếu kết quả sát hạch ${fd(k.examDate)} (hạng ${esc(k.hang)}):</b> ${a.first} thí sinh dự thi lần đầu · đạt ${a.D}, trượt ${a.T}, vắng ${a.V}${a.first ? ` · tỷ lệ đạt ${(a.D / a.first * 100).toFixed(1)}%` : ''}. So với còn lại ${c.net}: ${d === 0 ? '<b>khớp</b>' : `<b>${d > 0 ? 'nhiều hơn ' + d : 'ít hơn ' + (-d)}</b> — kiểm tra lại số nhận / rút hoặc hồ sơ thuộc đợt khác`}.</div>`;
}

/* ---------- Báo cáo định kỳ ---------- */
function bcRange(){
  const type = $('#bcType').value, y = +$('#bcYear').value || new Date().getFullYear();
  if (type === 'thang') { const m = +$('#bcMonth').value || 1, last = new Date(y, m, 0).getDate(); return [`${y}-${String(m).padStart(2, '0')}-01`, `${y}-${String(m).padStart(2, '0')}-${last}`, `Tháng ${m}/${y}`]; }
  if (type === 'quy') { const q = +$('#bcQuarter').value || 1, m1 = (q - 1) * 3 + 1, m3 = m1 + 2; return [`${y}-${String(m1).padStart(2, '0')}-01`, `${y}-${String(m3).padStart(2, '0')}-${new Date(y, m3, 0).getDate()}`, `Quý ${q}/${y}`]; }
  if (type === 'nam') return [`${y}-01-01`, `${y}-12-31`, `Năm ${y}`];
  const f = $('#bcFrom').value || `${y}-01-01`, t = $('#bcTo').value || todayISO(); return [f, t, `Từ ${fd(f)} đến ${fd(t)}`];
}
function bcData(){
  const [from, to, label] = bcRange(), inR = d => d && d >= from && d <= to;
  const pays = S.pays.filter(p => inR(p.date)), months = from.slice(0, 7) !== to.slice(0, 7);
  const keyOf = d => months ? d.slice(0, 7) : d, groups = new Map();
  pays.forEach(p => { const k = keyOf(p.date); groups.set(k, (groups.get(k) || []).concat(p)); });
  const keys = []; if (months) { let d = new Date(+from.slice(0, 4), +from.slice(5, 7) - 1, 1); const end = to.slice(0, 7); while (true) { const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; if (k > end) break; keys.push(k); d.setMonth(d.getMonth() + 1); } } else keys.push(...[...groups.keys()].sort());
  const money1 = keys.map(k => { const l = groups.get(k) || [], s = paySum(l); return { k, label: months ? k.slice(5) + '/' + k.slice(0, 4) : fd(k), nIn: l.filter(p => p.amount > 0).length, nOut: l.filter(p => p.amount < 0).length, ...s }; });
  const regs = S.regs.filter(r => r.kind === 'lai' && inR(r.regDate)), live = regs.filter(r => !r.cancelled), tt = live.map(regTotals);
  const parts = ['LT', 'H', 'LT+H'].map(p => ({ p, n: live.filter(r => r.parts.join('+') === p).length }));
  const exams = H.people.size ? C.batchStats(H.people, S.cfg).filter(b => inR(b.date)).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const wds = (S.withdrawals || []).filter(w => inR(w.date)), reasons = {}; wds.forEach(w => reasons[w.reason] = (reasons[w.reason] || 0) + 1);
  const khoa = (S.khoa || []).filter(k => !k.deleted && inR(k.examDate)).map(k => ({ k, c: kCalc(k), a: kActual(k) }));
  return { from, to, label, money: money1, regs, live, tt, parts, exams, wds, reasons, khoa, sumPay: paySum(pays), nPay: pays.length };
}
function renderBc(){
  const ys = new Set([new Date().getFullYear()]); S.pays.forEach(p => ys.add(+p.date.slice(0, 4))); H.attempts.forEach(a => ys.add(+a.date.slice(0, 4)));
  const ye = $('#bcYear'), yv = ye.value || String(new Date().getFullYear()); ye.innerHTML = [...ys].filter(Boolean).sort((a, b) => b - a).map(y => `<option${String(y) === yv ? ' selected' : ''}>${y}</option>`).join('');
  if (!$('#bcMonth').value) $('#bcMonth').value = String(new Date().getMonth() + 1);
  const type = $('#bcType').value; $('#bcMonthL').hidden = type !== 'thang'; $('#bcQuarterL').hidden = type !== 'quy'; $('#bcFromL').hidden = $('#bcToL').hidden = type !== 'tuy'; $('#bcYearL').hidden = type === 'tuy';
  const d = bcData(), sp = d.sumPay, sm = k => d.tt.reduce((a, x) => a + x[k], 0);
  const ex = d.exams.reduce((a, b) => ({ n: a.n + b.n, D: a.D + b.D, T: a.T + b.T, V: a.V + b.V, first: a.first + b.first, retake: a.retake + b.retake }), { n: 0, D: 0, T: 0, V: 0, first: 0, retake: 0 });
  $('#bcTitle').textContent = 'Báo cáo ' + d.label.toLowerCase().replace(/^tháng/, 'tháng').replace(/^từ/, 'từ');
  $('#bcKpi').innerHTML = [['Tiền thu thuần', money(sp.total), 'ok'], ['Tiền mặt / CK', money(sp.tm) + ' / ' + money(sp.ck), ''], ['Hoàn trả', money(sp.tmOut + sp.ckOut), sp.tmOut + sp.ckOut ? 'warn' : ''], ['Đăng ký thi lại', d.live.length, ''], ['Tỷ lệ đạt sát hạch', ex.n ? (ex.D / ex.n * 100).toFixed(1) + '%' : '—', ''], ['Rút hồ sơ', d.wds.length, d.wds.length ? 'warn' : '']]
    .map(([l, v, c]) => `<div class="kpi ${c}"><span>${l}</span><b>${v}</b></div>`).join('');
  $('#bcMoney').innerHTML = (d.money.length ? barChart(d.money.map(m => ({ l: /^\d{2}\/\d{4}$/.test(m.label) ? 'T' + (+m.label.slice(0, 2)) + (d.from.slice(0, 4) !== d.to.slice(0, 4) ? '/' + m.label.slice(5) : '') : m.label.slice(0, 5), v: m.total })), 'Tiền thu thuần theo ' + (d.from.slice(0, 7) !== d.to.slice(0, 7) ? 'tháng' : 'ngày') + ' (đ)') : '') +
    `<table><tr><th>Kỳ</th><th class="num">Phiếu thu</th><th class="num">Thu TM</th><th class="num">Thu CK</th><th class="num">Phiếu chi</th><th class="num">Chi (hoàn)</th><th class="num">Thuần</th></tr>${d.money.map(m => `<tr><td>${m.label}</td><td class="num">${m.nIn}</td><td class="num">${money(m.tmIn)}</td><td class="num">${money(m.ckIn)}</td><td class="num">${m.nOut}</td><td class="num">${money(m.tmOut + m.ckOut)}</td><td class="num"><b>${money(m.total)}</b></td></tr>`).join('')}
    <tr class="tot"><td>Cộng</td><td class="num">${d.money.reduce((a, m) => a + m.nIn, 0)}</td><td class="num">${money(sp.tmIn)}</td><td class="num">${money(sp.ckIn)}</td><td class="num">${d.money.reduce((a, m) => a + m.nOut, 0)}</td><td class="num">${money(sp.tmOut + sp.ckOut)}</td><td class="num">${money(sp.total)}</td></tr></table>`;
  $('#bcReg').innerHTML = `<table><tr><th>Chỉ tiêu</th><th class="num">Giá trị</th></tr><tr><td>Lượt đăng ký thi lại (theo ngày đăng ký)</td><td class="num">${d.regs.length}</td></tr><tr><td>— trong đó đã hủy</td><td class="num">${d.regs.length - d.live.length}</td></tr>${d.parts.map(x => `<tr><td>— thi lại ${ndLabel(x.p.split('+'))}</td><td class="num">${x.n}</td></tr>`).join('')}<tr><td>Phải thu</td><td class="num">${money(sm('due'))}</td></tr><tr><td>Đã thu (đến nay)</td><td class="num">${money(sm('paid'))}</td></tr><tr><td>Còn nợ</td><td class="num ${sm('left') ? 'r-T' : ''}">${money(sm('left'))}</td></tr></table>`;
  $('#bcExam').innerHTML = d.exams.length ? `<table><tr><th>Ngày sát hạch</th><th class="num">Lượt</th><th class="num">Lần đầu</th><th class="num">Thi lại</th><th class="num">Đạt</th><th class="num">Trượt</th><th class="num">Vắng</th><th class="num">Tỷ lệ đạt</th></tr>${d.exams.map(b => `<tr><td class="mono">${fd(b.date)}</td><td class="num">${b.n}</td><td class="num">${b.first}</td><td class="num">${b.retake}</td><td class="num r-D">${b.D}</td><td class="num r-T">${b.T}</td><td class="num">${b.V}</td><td class="num">${(b.D / b.n * 100).toFixed(1)}%</td></tr>`).join('')}<tr class="tot"><td>Cộng</td><td class="num">${ex.n}</td><td class="num">${ex.first}</td><td class="num">${ex.retake}</td><td class="num">${ex.D}</td><td class="num">${ex.T}</td><td class="num">${ex.V}</td><td class="num">${ex.n ? (ex.D / ex.n * 100).toFixed(1) + '%' : ''}</td></tr></table>` : '<div class="empty">Không có kỳ sát hạch nào trong khoảng này (hoặc chưa nạp kết quả).</div>';
  $('#bcOther').innerHTML = `<h3 style="margin-top:0">Rút hồ sơ</h3>${d.wds.length ? `<table><tr><th>Lý do</th><th class="num">Số người</th></tr>${Object.entries(d.reasons).sort((a, b) => b[1] - a[1]).map(([r, n]) => `<tr><td>${esc(r)}</td><td class="num">${n}</td></tr>`).join('')}<tr class="tot"><td>Cộng · hoàn ${money(d.wds.reduce((a, w) => a + (w.refund || 0), 0))} đ</td><td class="num">${d.wds.length}</td></tr></table>` : '<div class="empty">Không có.</div>'}
    <h3>Khóa mới có ngày sát hạch trong kỳ</h3>${d.khoa.length ? `<table><tr><th>Đợt</th><th>Ngày SH</th><th class="num">Giới hạn</th><th class="num">Đã nhận</th><th class="num">Đã rút</th><th class="num">Còn lại</th><th class="num">Dự thi lần đầu</th><th class="num">Đạt</th></tr>${d.khoa.map(x => `<tr><td>${esc(x.k.name)}</td><td class="mono">${fd(x.k.examDate)}</td><td class="num">${x.c.limit}</td><td class="num">${x.c.received}</td><td class="num">${x.c.withdrawn}</td><td class="num">${x.c.net}</td><td class="num">${x.a ? x.a.first : '—'}</td><td class="num">${x.a ? x.a.D : '—'}</td></tr>`).join('')}</table>` : '<div class="empty">Không có.</div>'}`;
}
['bcType', 'bcYear', 'bcMonth', 'bcQuarter', 'bcFrom', 'bcTo'].forEach(id => $('#' + id).addEventListener('input', renderBc));
$('#bcExport').onclick = () => { const d = bcData(), stampTxt = `${d.label} (${fd(d.from)} – ${fd(d.to)}) · Lập ngày ${fd(todayISO())}${curUser() ? ' · ' + curUser() : ''}`, sh = [];
  sh.push(['Thu chi', kSheet('BÁO CÁO THU CHI SÁT HẠCH LẠI – ' + d.label.toUpperCase(), [stampTxt], [{ h: 'Kỳ', w: 14, k: 'ctr' }, { h: 'Số phiếu thu', w: 11, k: 'num' }, { h: 'Thu tiền mặt', w: 15, k: 'money' }, { h: 'Thu chuyển khoản', w: 15, k: 'money' }, { h: 'Số phiếu chi', w: 11, k: 'num' }, { h: 'Chi hoàn trả', w: 14, k: 'money' }, { h: 'Thu thuần', w: 16, k: 'money', b: 1 }],
    d.money.map(m => ({ c: [m.label, m.nIn, m.tmIn, m.ckIn, m.nOut, m.tmOut + m.ckOut, m.total] })).concat([{ t: 't', c: ['CỘNG', d.money.reduce((a, m) => a + m.nIn, 0), d.sumPay.tmIn, d.sumPay.ckIn, d.money.reduce((a, m) => a + m.nOut, 0), d.sumPay.tmOut + d.sumPay.ckOut, d.sumPay.total] }]), true), 7]);
  const sm = k => d.tt.reduce((a, x) => a + x[k], 0);
  sh.push(['Dang ky thi lai', kSheet('ĐĂNG KÝ THI LẠI – ' + d.label.toUpperCase(), [stampTxt], [{ h: 'Chỉ tiêu', w: 40 }, { h: 'Giá trị', w: 18, k: 'num' }], [{ c: ['Lượt đăng ký (theo ngày đăng ký)', d.regs.length] }, { c: ['Đã hủy', d.regs.length - d.live.length] }, ...d.parts.map(x => ({ c: ['Thi lại ' + x.p, x.n] })), { c: ['Phải thu (đ)', sm('due')] }, { c: ['Đã thu đến nay (đ)', sm('paid')] }, { c: ['Còn nợ (đ)', sm('left')] }], false), 2]);
  const ex = d.exams.reduce((a, b) => ({ n: a.n + b.n, D: a.D + b.D, T: a.T + b.T, V: a.V + b.V, first: a.first + b.first, retake: a.retake + b.retake }), { n: 0, D: 0, T: 0, V: 0, first: 0, retake: 0 });
  sh.push(['Ket qua sat hach', kSheet('KẾT QUẢ SÁT HẠCH – ' + d.label.toUpperCase(), [stampTxt], [{ h: 'Ngày sát hạch', w: 14, k: 'date' }, { h: 'Lượt', w: 9, k: 'num' }, { h: 'Lần đầu', w: 9, k: 'num' }, { h: 'Thi lại', w: 9, k: 'num' }, { h: 'Đạt', w: 9, k: 'num' }, { h: 'Trượt', w: 9, k: 'num' }, { h: 'Vắng', w: 9, k: 'num' }, { h: 'Tỷ lệ đạt', w: 10, k: 'pct' }],
    d.exams.map(b => ({ c: [b.date, b.n, b.first, b.retake, b.D, b.T, b.V, b.n ? b.D / b.n : 0] })).concat([{ t: 't', c: ['CỘNG', ex.n, ex.first, ex.retake, ex.D, ex.T, ex.V, ex.n ? ex.D / ex.n : 0] }]), false), 8]);
  sh.push(['Rut ho so', kSheet('RÚT HỒ SƠ – ' + d.label.toUpperCase(), [stampTxt], [{ h: 'Lý do', w: 40 }, { h: 'Số người', w: 12, k: 'num' }], Object.entries(d.reasons).map(([r, n]) => ({ c: [r, n] })).concat([{ t: 't', c: ['CỘNG', d.wds.length] }]), false), 2]);
  sh.push(['Khoa moi', kSheet('KHÓA MỚI – ' + d.label.toUpperCase(), [stampTxt], [{ h: 'Đợt / khóa', w: 18 }, { h: 'Ngày SH', w: 12, k: 'date' }, { h: 'Giới hạn', w: 10, k: 'num' }, { h: 'Đã nhận', w: 10, k: 'num' }, { h: 'Đã rút', w: 10, k: 'num' }, { h: 'Còn lại', w: 10, k: 'num' }, { h: 'Dự thi lần đầu', w: 12, k: 'num' }, { h: 'Đạt', w: 9, k: 'num' }],
    d.khoa.map(x => ({ c: [x.k.name, x.k.examDate, x.c.limit, x.c.received, x.c.withdrawn, x.c.net, x.a ? x.a.first : '', x.a ? x.a.D : ''] })), false), 8]);
  kWrite(sh, `BAO_CAO_${d.label.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').toUpperCase()}.xlsx`); logA('Xuất báo cáo', '', '', d.label); save(); };

/* ---------- Hướng dẫn & bảng quy tắc phí ---------- */
function rulesHtml(){
  const c = S.cfg, P = c.prices, d = fd;
  const rows = [
    ['Rớt / vắng LT, đợt thi gần nhất TỪ ' + d(c.seqDate) + ' (thi tuần tự, chưa được thi Hình)', 'LT + duyệt HS', P.LT + P.DUYET],
    ['Rớt Hình (LT đã đạt), thi gần nhất TỪ ' + d(c.cutoff), 'Hình + duyệt HS', P.H + P.DUYET],
    ['Rớt Hình, thi gần nhất TRƯỚC ' + d(c.cutoff), 'Hình + GPLX + duyệt HS', P.H + P.GPLX + P.DUYET],
    ['Rớt LT (Hình đạt), thi gần nhất TRƯỚC ' + d(c.cutoffLT), 'LT + GPLX + duyệt HS', P.LT + P.GPLX + P.DUYET],
    ['Rớt cả 2 phần, thi gần nhất TRƯỚC ' + d(c.cutoffBoth), 'LT + Hình + GPLX + duyệt HS', P.LT + P.H + P.GPLX + P.DUYET],
    ['Phần đã đạt nhưng HẾT bảo lưu (' + c.reserveMonths + ' tháng) trước ngày thi của đợt đăng ký', 'thi lại cả phần đó', null],
    ...(c.extraBatches || []).map(b => ['Thi gần nhất ở đợt ' + d(b) + ' (ngoại lệ)', 'luôn cộng thêm GPLX', null])];
  return `<table class="k" style="border-collapse:collapse;width:100%"><tr><th>Khoản</th><th style="text-align:right">Đơn giá (đ)</th></tr><tr><td>Lệ phí sát hạch lý thuyết (LT)</td><td style="text-align:right">${money(P.LT)}</td></tr><tr><td>Lệ phí sát hạch hình</td><td style="text-align:right">${money(P.H)}</td></tr><tr><td>Phí cấp thẻ GPLX</td><td style="text-align:right">${money(P.GPLX)}</td></tr><tr><td>Phí duyệt hồ sơ (mọi lượt thi lại)</td><td style="text-align:right">${money(P.DUYET)}</td></tr></table>
    <table class="k" style="border-collapse:collapse;width:100%;margin-top:4mm"><tr><th>Trường hợp</th><th>Phải nộp</th><th style="text-align:right">Tổng (đ)</th></tr>${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td style="text-align:right">${r[2] == null ? '' : '<b>' + money(r[2]) + '</b>'}</td></tr>`).join('')}</table>
    <p style="font-size:12px;margin-top:3mm">Bảo lưu tính riêng cho từng phần, ${c.reserveMonths} tháng kể từ ngày ĐẠT phần đó, so với ngày thi của đợt đăng ký; dòng “X” không gia hạn bảo lưu. Từ ${d(c.seqDate)} thi tuần tự: rớt / vắng LT thì chưa được thi Hình nên chỉ nộp lại LT (lệ phí Hình đã nộp được giữ). Áp dụng từ ngày in ${fd(todayISO())}.</p>`;
}
function renderHd(){ $('#hdRules').innerHTML = rulesHtml(); if (typeof renderInstall === 'function') renderInstall();
  $('#hdVer').innerHTML = `<p style="margin:0 0 6px">Đang dùng <b>v${APP_VERSION}</b> (${APP_DATE}). Mọi máy nên dùng cùng một phiên bản.</p>` + CHANGELOG.map(([v, d, items]) => `<div style="margin-top:6px"><b>v${v}</b> <span class="muted">· ${d}</span><ul style="margin:2px 0 0;padding-left:18px">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join(''); }
$('#hdPrint').onclick = () => printFull(`<div style="display:grid;grid-template-columns:1fr auto 1fr"><div></div><div style="text-align:center;font-weight:bold;font-size:14.5px">${ORG}</div><div style="text-align:right;font-weight:bold">${ORG_SITE}</div></div><div style="text-align:center;margin:6mm 0 4mm"><b style="font-size:18px">BẢNG LỆ PHÍ SÁT HẠCH LẠI MÔ TÔ HẠNG A1</b></div>${rulesHtml()}`);

/* ---------- Phím tắt ---------- */
document.addEventListener('keydown', e => {
  if (document.body.classList.contains('locked')) return;
  const k = e.key;
  if (!['F1', 'F2', 'F4', 'F8', 'F9'].includes(k)) return;
  if (document.querySelector('dialog[open]')) return;
  e.preventDefault();
  if (k === 'F1') return switchTab('hd');
  if (k === 'F2') { switchTab('quay'); const q = $('#q'); q.focus(); q.select(); return; }
  if (k === 'F9') return switchTab('quy');
  if (!curId) return toast('Tra cứu một học viên trước (F2)');
  const regs = S.regs.filter(r => r.cccd === curId && !r.cancelled);
  if (k === 'F4') { const r = regs.find(r => regTotals(r).left > 0); return r ? payDlg(r.id) : toast('Học viên không còn khoản nào phải thu'); }
  if (k === 'F8') { const r = regs.filter(r => regTotals(r).st === 'paid').pop(); return r ? printReceipt(r.id) : toast('Chưa có đăng ký nào nộp đủ để in phiếu'); }
}, true);

/* ---------- Chế độ hiển thị ---------- */
function applyView(){ let v = {}; try { v = JSON.parse(localStorage.getItem('soA1.view') || '{}'); } catch(e){}
  document.documentElement.classList.toggle('bigtext', !!v.big); document.documentElement.classList.toggle('hc', !!v.hc);
  $('#vBig').classList.toggle('on', !!v.big); $('#vHc').classList.toggle('on', !!v.hc); }
function toggleView(k){ let v = {}; try { v = JSON.parse(localStorage.getItem('soA1.view') || '{}'); } catch(e){} v[k] = !v[k]; try { localStorage.setItem('soA1.view', JSON.stringify(v)); } catch(e){} applyView(); }
$('#vBig').onclick = () => toggleView('big'); $('#vHc').onclick = () => toggleView('hc');
applyView();

/* ---------- Gắn sự kiện: dữ liệu, toàn vẹn, chốt quỹ ---------- */
$('#rsLoad').onclick = () => renderRestore();
$('#intRun').onclick = () => { const rep = renderIntegrity(true); logA('Kiểm tra toàn vẹn dữ liệu', '', '', `${rep.filter(x => x.lv === 'bad').length} lỗi, ${rep.filter(x => x.lv === 'warn').length} cảnh báo`); save(); };
$('#intExport').onclick = () => { const rep = integrityReport();
  kWrite([['Kiem tra', kSheet('BÁO CÁO KIỂM TRA TOÀN VẸN DỮ LIỆU', [`Lúc ${new Date().toLocaleString('vi-VN')} · ${machineName()} · ${S.regs.length} đăng ký, ${S.pays.length} khoản thu · mã kiểm tra ${sha256(JSON.stringify(S)).slice(0, 16)}`], [{ h: 'Mức', w: 12, k: 'ctr' }, { h: 'Mục', w: 18 }, { h: 'Chi tiết', w: 100, wrap: 1 }],
    rep.length ? rep.map(x => ({ c: [x.lv === 'bad' ? 'Lỗi' : x.lv === 'warn' ? 'Cảnh báo' : 'Thông tin', x.area, x.msg], color: { 0: x.lv === 'bad' ? 'A1261E' : undefined } })) : [{ c: ['Tốt', '', 'Không phát hiện lỗi'] }], true), 3]], `KIEM_TRA_DU_LIEU_${todayISO()}.xlsx`); };
$('#cSec2').onclick = () => requireAdmin('Đổi cài đặt khoá màn hình / nhật ký', () => { const a = Math.max(2, Math.min(240, toNum($('#cIdle').value) || 10)), b = Math.max(1, Math.min(60, toNum($('#cLogKeep').value) || 6));
  logA('Đổi cài đặt', '', '', `khoá màn hình ${a} phút, giữ nhật ký ${b} tháng`); S.cfg.idleMin = a; S.cfg.logKeepMonths = b; save(); renderUsers(); renderStoragePanel(); toast('Đã lưu'); });
$('#qyDate').addEventListener('input', renderQuy); $('#qyCashier').addEventListener('input', renderQuy);
$('#qyDen').addEventListener('input', qyCalc); $('#qyCounted').addEventListener('input', () => { document.querySelectorAll('.qyD').forEach(i => i.value = ''); qyCalc(); });
$('#qyGo').onclick = () => requireRole('quay', 'Chốt quỹ', doClosing);
$('#qyUnclosed').addEventListener('click', e => { const a = e.target.closest('a[data-qd]'); if (!a) return; e.preventDefault(); $('#qyDate').value = a.dataset.qd; const cs = $('#qyCashier'); cs.innerHTML = `<option>${esc(a.dataset.qc)}</option>`; cs.value = a.dataset.qc; renderQuy(); });

/* Hiện số phiên bản, ghi nhật ký khi cập nhật bản mới */
document.title = `Sổ sát hạch A1 · CSHN · v${APP_VERSION}`; $('#appVer').textContent = 'v' + APP_VERSION;
setTimeout(() => { let old = ''; try { old = localStorage.getItem('soA1.ver') || ''; } catch(e){} if (old !== APP_VERSION) { try { localStorage.setItem('soA1.ver', APP_VERSION); } catch(e){} logA('Cập nhật phiên bản tool', '', '', (old ? 'v' + old + ' → ' : '') + 'v' + APP_VERSION + ' · ' + machineName()); save(); } }, 3000);

/* ===== Ứng dụng web (PWA): manifest, chạy offline, cài như phần mềm ===== */
const IS_WEB = /^https?:$/.test(location.protocol);
let installEvt = null;
function renderInstall(){ const el = $('#hdInstall'); if (!el) return;
  const standalone = matchMedia('(display-mode: standalone)').matches;
  el.innerHTML = !IS_WEB ? `Đang mở bằng file trên máy. Nên dùng bản web: <b>https://hp-wukoong.github.io/thi-lai-nhan-khoa-moto-moi/</b> (tự cập nhật, cài như ứng dụng). Lần đầu mở bản web, chọn lại đúng thư mục dữ liệu là dữ liệu về đủ.`
    : standalone ? '<span class="r-D">Đang chạy dạng ứng dụng đã cài.</span>'
    : installEvt ? `<button class="b p s" id="btnInstall">Cài tool này thành ứng dụng trên máy</button> <span class="muted">(có biểu tượng trên màn hình, mở như phần mềm)</span>`
    : 'Chrome / Edge: bấm biểu tượng “Cài đặt” ở thanh địa chỉ, hoặc menu ⋮ → “Cài đặt trang này dưới dạng ứng dụng”.';
  const b = $('#btnInstall'); if (b) b.onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; renderInstall(); }; }
if (IS_WEB) {
  const l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.webmanifest'; document.head.appendChild(l);
  const ic = document.createElement('link'); ic.rel = 'icon'; ic.href = 'icons/icon-192.png'; document.head.appendChild(ic);
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; renderInstall(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Đã tải phiên bản mới, tải lại trang (F5) để dùng'); }); });
  }).catch(() => {});
}
setTimeout(renderInstall, 500);
