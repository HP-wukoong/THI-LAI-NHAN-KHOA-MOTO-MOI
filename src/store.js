/* =====================================================================
   LƯU TRỮ AN TOÀN: phiên bản dữ liệu, mã kiểm tra, gộp nhiều máy,
   sao lưu xoay vòng, khôi phục, mã hoá tuỳ chọn, lưu trữ nhật ký
   ===================================================================== */
const SCHEMA = 2;
const MACHINE = (() => { let m = ''; try { m = localStorage.getItem('soA1.machine') || ''; if (!m) { m = 'M' + Math.random().toString(36).slice(2, 7).toUpperCase(); localStorage.setItem('soA1.machine', m); } } catch(e){ m = 'M-TAM'; } return m; })();
const machineName = () => { try { return localStorage.getItem('soA1.machineName') || ('Máy ' + MACHINE); } catch(e){ return 'Máy ' + MACHINE; } };
const nowISO = () => new Date().toISOString();
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------- SHA-256 (đồng bộ, không phụ thuộc trình duyệt) ---------- */
const SHA_K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
function sha256(str){
  const bytes = new TextEncoder().encode(str), l = bytes.length, n = ((l + 9 + 63) >> 6) << 6, buf = new Uint8Array(n);
  buf.set(bytes); buf[l] = 0x80; const dv = new DataView(buf.buffer); dv.setUint32(n - 4, (l * 8) >>> 0); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
  const H8 = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]), W = new Uint32Array(64);
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const a = W[i - 15], b = W[i - 2]; W[i] = (W[i - 16] + (((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) + W[i - 7] + (((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10))) | 0; }
    let a = H8[0], b = H8[1], c = H8[2], d = H8[3], e = H8[4], f = H8[5], g = H8[6], h = H8[7];
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + SHA_K[i] + W[i]) | 0;
      const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H8[0] += a; H8[1] += b; H8[2] += c; H8[3] += d; H8[4] += e; H8[5] += f; H8[6] += g; H8[7] += h;
  }
  return [...H8].map(x => x.toString(16).padStart(8, '0')).join('');
}

/* ---------- Phiên bản dữ liệu & nâng cấp ---------- */
const PAY_KIND = p => p.amount < 0 ? 'PC' : 'PT';
function maxNo(list, kind, year){ let m = 0; const re = new RegExp(`^${kind}-${year}-(\\d+)$`); for (const p of list) { const x = re.exec(p && p.no || ''); if (x) m = Math.max(m, +x[1]); } return m; }
function migrate(s){
  if (!s || typeof s !== 'object') return s;
  const from = s.schema || 1;
  s.regs = s.regs || []; s.pays = s.pays || []; s.trash = s.trash || []; s.dots = s.dots || []; s.withdrawals = s.withdrawals || []; s.log = s.log || [];
  s.contacts = s.contacts || {}; s.scanAddr = s.scanAddr || {}; s.khoa = s.khoa || []; s.closings = s.closings || []; s.users = s.users || []; s.seq = s.seq || { PT: {}, PC: {} };
  s.seq.PT = s.seq.PT || {}; s.seq.PC = s.seq.PC || {};
  /* Khoản thu cũ: hình thức mặc định tiền mặt, đánh số phiếu theo thứ tự ngày thu */
  const all = s.pays.concat(s.trash.filter(t => t.type === 'pay').map(t => t.pay), ...s.trash.filter(t => t.type === 'reg').map(t => t.pays || []));
  all.forEach((p, i) => { if (!p.method) p.method = 'TM'; if (!p.createdAt) p.createdAt = (p.date || '2000-01-01') + 'T00:00:00.000Z'; if (p._ord == null) p._ord = i; });
  const need = all.filter(p => !p.no && p.amount).sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.createdAt.localeCompare(b.createdAt) || a._ord - b._ord);
  for (const p of need) { const k = PAY_KIND(p), y = (p.date || todayISO()).slice(0, 4); const n = Math.max(s.seq[k][y] || 0, maxNo(all, k, y)) + 1; s.seq[k][y] = n; p.no = `${k}-${y}-${String(n).padStart(4, '0')}`; if (from < 2) p.noByUpgrade = true; }
  all.forEach(p => delete p._ord);
  if (from < 2) { s.migratedFrom = from; s.migratedAt = nowISO(); }
  s.schema = SCHEMA;
  return s;
}

/* ---------- Mã hoá tuỳ chọn (AES-GCM 256, khoá dữ liệu bọc bằng mật khẩu và mã khôi phục) ---------- */
const CRY = { key: null, wrap: null,
  b64(u8){ let s = ''; const n = 0x8000; for (let i = 0; i < u8.length; i += n) s += String.fromCharCode.apply(null, u8.subarray(i, i + n)); return btoa(s); },
  unb64(s){ const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; },
  async kdf(pw, salt){ const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); },
  async seal(rawKey, secret){ const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), k = await this.kdf(secret, salt);
    return { salt: this.b64(salt), iv: this.b64(iv), ct: this.b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, rawKey))) }; },
  async open(box, secret){ const k = await this.kdf(secret, this.unb64(box.salt)); return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.unb64(box.iv) }, k, this.unb64(box.ct))); },
  async setup(pw, recovery){ const raw = crypto.getRandomValues(new Uint8Array(32)); this.wrap = { kp: await this.seal(raw, pw), kr: await this.seal(raw, recovery) }; this.key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); },
  async unlock(enc, secret){ let raw = null; for (const box of [enc.kp, enc.kr]) { try { raw = await this.open(box, secret); break; } catch(e){} }
    if (!raw) return false; this.wrap = { kp: enc.kp, kr: enc.kr }; this.key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); return true; },
  async encrypt(txt){ const iv = crypto.getRandomValues(new Uint8Array(12)); return { iv: this.b64(iv), payload: this.b64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, new TextEncoder().encode(txt)))) }; },
  async decrypt(enc){ return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.unb64(enc.iv) }, this.key, this.unb64(enc.payload))); },
  recoveryCode(){ const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(24)); return [...r].map(x => a[x % a.length]).join('').match(/.{4}/g).join('-'); }
};
const encOn = () => { try { return localStorage.getItem('soA1.enc') === '1'; } catch(e){ return false; } };

/* ---------- Đóng gói file: kèm mã kiểm tra SHA-256 ---------- */
async function packState(st){
  const txt = JSON.stringify(st), hash = sha256(txt);
  const head = { app: 'SoSatHachA1', kind: 'so_thu', appVersion: APP_VERSION, schema: SCHEMA, savedAt: st.savedAt, machine: MACHINE, machineName: machineName(), user: curUser() || '', sha256: hash,
    counts: { regs: (st.regs || []).length, pays: (st.pays || []).length, khoa: (st.khoa || []).length, paid: (st.pays || []).reduce((s, p) => s + (p.amount || 0), 0) } };
  if (encOn() && CRY.key) { const e = await CRY.encrypt(txt); head.enc = { v: 1, kp: CRY.wrap.kp, kr: CRY.wrap.kr, iv: e.iv }; return { text: JSON.stringify(Object.assign(head, { payload: e.payload })), hash, head }; }
  return { text: JSON.stringify(head).slice(0, -1) + ',"data":' + txt + '}', hash, head };
}
/* Trả về { data, head, ok, err, legacy, needKey } */
async function unpackState(text){
  let o; try { o = JSON.parse(text); } catch(e){ return { ok: false, err: 'File không phải JSON hợp lệ (có thể bị hỏng giữa chừng)' }; }
  if (o && o.app === 'SoSatHachA1') {
    let txt;
    if (o.enc) { if (!CRY.key) return { ok: false, needKey: true, head: o, err: 'Dữ liệu đã mã hoá, cần mật khẩu dữ liệu' };
      try { txt = await CRY.decrypt({ iv: o.enc.iv, payload: o.payload }); } catch(e){ return { ok: false, needKey: true, head: o, err: 'Không giải mã được (sai khoá)' }; } }
    else txt = JSON.stringify(o.data);
    if (sha256(txt) !== o.sha256) return { ok: false, head: o, err: 'Mã kiểm tra không khớp: file đã bị sửa tay hoặc hỏng' };
    return { ok: true, data: JSON.parse(txt), head: o };
  }
  if (o && Array.isArray(o.regs)) return { ok: true, legacy: true, data: o, head: { savedAt: o.savedAt, machine: '?', machineName: 'bản tool cũ', schema: o.schema || 1, sha256: sha256(JSON.stringify(o)) } };
  return { ok: false, err: 'Không phải file dữ liệu của tool' };
}

/* ---------- Gộp 3 chiều (base = bản chung lần trước, L = máy này, R = thư mục) ---------- */
const MERGE_KEYS = { regs: 'id', pays: 'id', withdrawals: 'id', trash: 'id', khoa: 'id', closings: 'id', users: 'id', dots: 'date' };
/* Xoá chỉ được công nhận khi có "dấu xoá" (tomb) ghi rõ; bản ghi chỉ thiếu ở một phía thì GIỮ LẠI → không bao giờ mất dữ liệu do 2 máy ghi chồng */
const maxMap = (a, b) => { const o = Object.assign({}, a || {}); for (const [k, v] of Object.entries(b || {})) if (!o[k] || v > o[k]) o[k] = v; return o; };
function merge3(base, L, R){
  base = base || {}; const out = clone(L), notes = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const tomb = maxMap(L.tomb, R.tomb), revive = maxMap(L.revive, R.revive), dead = k => tomb[k] && !((revive[k] || '') > tomb[k]);
  out.tomb = tomb; out.revive = revive;
  for (const [col, key] of Object.entries(MERGE_KEYS)) {
    const mk = arr => new Map((arr || []).map(x => [x[key], x])); const B = mk(base[col]), Lm = mk(L[col]), Rm = mk(R[col]);
    const res = [], ids = new Set([...Lm.keys(), ...Rm.keys()]);
    for (const id of ids) {
      const l = Lm.get(id), r = Rm.get(id), b = B.get(id);
      if (dead(col + ':' + id)) { if ((l && b && !same(l, b)) || (r && b && !same(r, b))) notes.push(`${col} ${id}: đã bị xoá ở một máy trong khi máy kia đang sửa — theo thao tác xoá`); continue; }
      if (l && r) { if (same(l, r)) res.push(l); else if (b && same(l, b)) res.push(r); else if (b && same(r, b)) res.push(l); else { res.push(l); notes.push(`${col} ${id}: cả 2 máy cùng sửa, giữ bản máy này`); } }
      else res.push(l || r);
    }
    /* giữ thứ tự: theo L rồi phần mới của R */
    const order = new Map((L[col] || []).map((x, i) => [x[key], i])); res.sort((a, b) => (order.has(a[key]) ? order.get(a[key]) : 1e9) - (order.has(b[key]) ? order.get(b[key]) : 1e9));
    out[col] = res;
  }
  /* Nhật ký: chỉ ghi thêm → hợp */
  { const seen = new Set(), lg = []; for (const x of (L.log || []).concat(R.log || [])) { const k = x.at + '|' + x.by + '|' + x.action + '|' + x.cccd + '|' + x.detail; if (!seen.has(k)) { seen.add(k); lg.push(x); } } out.log = lg.sort((a, b) => a.at.localeCompare(b.at)); }
  /* Đối tượng theo khoá */
  for (const col of ['contacts', 'scanAddr']) { const o = Object.assign({}, R[col] || {}); for (const [k, v] of Object.entries(L[col] || {})) if (!base[col] || !same(v, (base[col] || {})[k]) || !(k in o)) o[k] = v; out[col] = o; }
  /* Cấu hình, mật khẩu: máy nào đổi so với base thì lấy máy đó */
  for (const col of ['cfg', 'sec']) out[col] = same(L[col], base[col]) ? clone(R[col] ?? null) : clone(L[col] ?? null);
  /* Bộ đếm số phiếu: lấy lớn nhất */
  out.seq = { PT: {}, PC: {} }; for (const k of ['PT', 'PC']) for (const src of [L.seq, R.seq]) for (const [y, n] of Object.entries((src || {})[k] || {})) out.seq[k][y] = Math.max(out.seq[k][y] || 0, n);
  /* Số phiếu trùng (2 máy cùng cấp số) → cấp lại số cho phiếu tạo sau */
  const byNo = new Map();
  for (const p of out.pays.slice().sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))) {
    if (!p.no) continue;
    if (byNo.has(p.no)) { const k = PAY_KIND(p), y = p.no.split('-')[1]; const n = Math.max(out.seq[k][y] || 0, maxNo(out.pays, k, y)) + 1; out.seq[k][y] = n; const old = p.no; p.no = `${k}-${y}-${String(n).padStart(4, '0')}`; p.renumbered = { from: old, at: nowISO() }; notes.push(`Số phiếu ${old} bị trùng giữa 2 máy: phiếu tạo sau đổi thành ${p.no}`); }
    byNo.set(p.no, p);
  }
  out.savedAt = L.savedAt > (R.savedAt || '') ? L.savedAt : R.savedAt;
  return { data: out, notes };
}

/* ---------- Thư mục dữ liệu ---------- */
const BK = { hourKeep: 72, dayKeep: 180, hourEvery: 5 * 60e3, dayEvery: 10 * 60e3 };
const FS = { dir: null, perm: 'none', last: null, err: null, t: null, supported: 'showDirectoryPicker' in window, baseTxt: null, baseHash: null, writing: false, again: false, others: [], lastBk: {}, conflictNotes: [],
  async writeText(dir, name, text){ const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(text); await w.close(); },
  async readText(dir, name){ try { const fh = await dir.getFileHandle(name); return await (await fh.getFile()).text(); } catch(e){ return null; } },
  async sub(path){ let d = this.dir; for (const p of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(p, { create: true }); return d; },
  setBase(txt, hash){ this.baseTxt = txt; this.baseHash = hash; IDB.put('fsBase', { txt, hash }); },
  ready(){ return !!(this.dir && this.perm === 'granted'); },
  schedule(){ if (this.ready()) { clearTimeout(this.t); this.t = setTimeout(() => this.writeState(), 500); } },
  /* Ghi so_thu.json: nếu máy khác đã ghi sau lần đọc cuối thì GỘP trước rồi mới ghi, không ghi đè */
  /* Khoá ghi ngắn hạn giữa các máy (lease 8 giây) để 2 máy không đọc-gộp-ghi chồng lên nhau */
  async acquire(){
    const d = await this.sub('dang_mo'), sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40; i++) {
      let o = null; try { o = JSON.parse(await this.readText(d, '_khoa_ghi.json') || 'null'); } catch(e){}
      if (!o || !o.m || o.m === MACHINE || Date.now() - o.at > 8000) {
        await this.writeText(d, '_khoa_ghi.json', JSON.stringify({ m: MACHINE, at: Date.now() })); await sleep(120);
        try { if (JSON.parse(await this.readText(d, '_khoa_ghi.json')).m === MACHINE) return true; } catch(e){}
      }
      await sleep(120 + Math.random() * 300);
    }
    return false;
  },
  async release(){ try { const d = await this.sub('dang_mo'); const o = JSON.parse(await this.readText(d, '_khoa_ghi.json') || 'null'); if (o && o.m === MACHINE) await this.writeText(d, '_khoa_ghi.json', JSON.stringify({ m: '', at: 0 })); } catch(e){} },
  async writeState(){
    if (!this.ready()) return;
    if (this.writing) { this.again = true; return; }
    this.writing = true; let locked = false;
    try {
      locked = await this.acquire();
      if (encOn() && !CRY.key) throw new Error('Đang bật mã hoá nhưng chưa nhập mật khẩu dữ liệu');
      const curTxt = await this.readText(this.dir, 'so_thu.json');
      if (curTxt) { const cur = await unpackState(curTxt);
        if (cur.head && cur.head.appVersion && verCmp(cur.head.appVersion, APP_VERSION) > 0) { this.newer = cur.head.appVersion; throw new Error(`Dữ liệu trong thư mục do phiên bản v${cur.head.appVersion} (mới hơn) ghi. Bản đang mở là v${APP_VERSION}: không ghi để tránh mất dữ liệu. Hãy mở file tool phiên bản mới nhất.`); }
        if (cur.ok) { const d0 = await this.sub('sao_luu'); await this.writeText(d0, 'so_thu_ban_ghi_truoc.json', curTxt); }
        if (cur.ok && cur.head.sha256 !== this.baseHash) {
          const base = this.baseTxt ? JSON.parse(this.baseTxt) : null, remote = migrate(cur.data);
          const m = merge3(base, migrate(clone(S)), remote);
          if (JSON.stringify(m.data) !== JSON.stringify(S)) { adoptState(m.data); afterExternalChange(); }
          this.conflictNotes = m.notes; logA('Gộp dữ liệu từ máy khác', '', '', `${cur.head.machineName || cur.head.machine}${cur.head.user ? ' (' + cur.head.user + ')' : ''} · ${m.notes.length ? m.notes.join('; ') : 'không xung đột'}`);
          S.savedAt = nowISO();
          toast('Đã gộp dữ liệu do ' + (cur.head.machineName || 'máy khác') + ' vừa lưu');
        } else if (!cur.ok && !cur.needKey && curTxt.length > 2) {
          /* file trên đĩa hỏng: giữ lại để điều tra rồi ghi bản tốt */
          const bad = await this.sub('sao_luu/hong'); await this.writeText(bad, `so_thu_hong_${stamp()}.json`, curTxt);
          logA('Phát hiện file dữ liệu hỏng', '', '', cur.err + ' · đã cất vào sao_luu/hong');
        }
      }
      await this.archiveLog();
      const pk = await packState(S);
      await this.writeText(this.dir, 'so_thu.json', pk.text);
      /* đọc lại để chắc chắn ghi đúng */
      const back = await this.readText(this.dir, 'so_thu.json'); const chk = back && await unpackState(back);
      if (!chk || !chk.ok || chk.head.sha256 !== pk.hash) throw new Error('Đọc lại sau khi ghi không khớp mã kiểm tra');
      this.setBase(JSON.stringify(S), pk.hash);
      await this.backups(pk.text);
      this.last = new Date(); this.err = null;
      try { localStorage.setItem('soA1.lastDisk', this.last.toISOString()); } catch(e){}
    } catch(e){ this.err = e.message; }
    if (locked) await this.release();
    this.writing = false; renderFs();
    if (this.again) { this.again = false; this.schedule(); }
  },
  async backups(text){
    const t = new Date(), d = todayISO(), h = String(t.getHours()).padStart(2, '0'), now = Date.now(), lb = this.lastBk;
    const put = async (path, name, keep) => { const dir = await this.sub(path); await this.writeText(dir, name, text); if (keep) await this.prune(dir, keep); };
    if (!lb.hour || lb.hourKey !== d + h || now - lb.hour > BK.hourEvery) { await put('sao_luu/gio', `so_thu_${d}_${h}h.json`, BK.hourKeep); lb.hour = now; lb.hourKey = d + h; }
    if (!lb.day || lb.dayKey !== d || now - lb.day > BK.dayEvery) { await put('sao_luu/ngay', `so_thu_${d}.json`, BK.dayKeep); lb.day = now; lb.dayKey = d; }
    if (lb.monKey !== d.slice(0, 7) || now - (lb.mon || 0) > BK.dayEvery) { await put('sao_luu/thang', `so_thu_${d.slice(0, 7)}.json`, 0); lb.mon = now; lb.monKey = d.slice(0, 7); }
    if (S.migratedFrom && !S.migrBackup) { await put('sao_luu', `truoc_nang_cap_v${S.migratedFrom}_${d}.json`, 0); S.migrBackup = nowISO(); }
    try { localStorage.setItem('soA1.lastBk', nowISO()); } catch(e){}
  },
  async prune(dir, keep){ const names = []; for await (const [n, hd] of dir.entries()) if (hd.kind === 'file' && /\.json$/.test(n)) names.push(n); names.sort(); for (const n of names.slice(0, Math.max(0, names.length - keep))) { try { await dir.removeEntry(n); } catch(e){} } },
  async writeHist(){
    if (!this.ready()) return;
    try { const txt = JSON.stringify({ attempts: H.attempts, issues: H.issues, files: H.files, addrBook: H.addrBook, fees: H.fees, at: H.at });
      await this.writeText(this.dir, 'ket_qua_sat_hach.json', txt);
      const dir = await this.sub('sao_luu/ket_qua'); await this.writeText(dir, `ket_qua_${todayISO()}.json`, txt); await this.prune(dir, 15);
      this.last = new Date(); this.err = null; }
    catch(e){ this.err = e.message; }
    renderFs();
  },
  /* Đánh dấu máy đang mở (để máy khác biết) */
  async heartbeat(){
    if (!this.ready()) return;
    try { const d = await this.sub('dang_mo'); await this.writeText(d, MACHINE + '.json', JSON.stringify({ machine: MACHINE, name: machineName(), user: curUser() || '', at: nowISO() }));
      const others = []; for await (const [n, hd] of d.entries()) { if (hd.kind !== 'file' || n === MACHINE + '.json' || n.startsWith('_')) continue; try { const o = JSON.parse(await (await hd.getFile()).text()); if (Date.now() - new Date(o.at).getTime() < 3 * 60e3) others.push(o); } catch(e){} }
      this.others = others; } catch(e){}
    renderFs();
  },
  /* Kiểm tra định kỳ: máy khác vừa ghi → gộp vào màn hình này */
  async poll(){
    if (!this.ready() || this.writing || document.querySelector('dialog[open]')) return;
    const txt = await this.readText(this.dir, 'so_thu.json'); if (!txt) return;
    const cur = await unpackState(txt); if (!cur.ok || cur.head.sha256 === this.baseHash) return;
    const base = this.baseTxt ? JSON.parse(this.baseTxt) : null, m = merge3(base, migrate(clone(S)), migrate(cur.data));
    const localChanged = this.baseTxt !== JSON.stringify(S);
    adoptState(m.data); this.setBase(JSON.stringify(migrate(cur.data)), cur.head.sha256);
    if (localChanged || m.notes.length) save(); else { IDB.put('state', clone(S)); }
    afterExternalChange(); toast('Đã cập nhật dữ liệu mới từ ' + (cur.head.machineName || 'máy khác'));
  },
  /* Mở thư mục: lấy bản nào mới hơn; nếu cả 2 đều có thay đổi riêng thì gộp */
  async sync(){
    let msg = [];
    const st = await this.readText(this.dir, 'so_thu.json');
    if (st) { const cur = await unpackState(st);
      if (cur.head && cur.head.appVersion && verCmp(cur.head.appVersion, APP_VERSION) > 0) { this.newer = cur.head.appVersion; this.err = `Dữ liệu do phiên bản v${cur.head.appVersion} ghi, mới hơn bản đang mở (v${APP_VERSION}). Hãy dùng file tool mới nhất trên máy này.`; renderFs(); setTimeout(() => blockMsg('Cần dùng phiên bản tool mới hơn', `<p>${esc(this.err)}</p><p class="small">Bản đang mở chỉ đọc dữ liệu trong trình duyệt và <b>không ghi</b> vào thư mục.</p>`), 200); return; }
      if (cur.needKey) { const ok = await askDataKey(cur.head.enc); if (!ok) { this.perm = 'locked'; renderFs(); return; } return this.sync(); }
      if (!cur.ok) {
        const bad = await this.sub('sao_luu/hong'); await this.writeText(bad, `so_thu_hong_${stamp()}.json`, st);
        /* tự phục hồi từ bản sao lưu hợp lệ mới nhất trong thư mục */
        const good = await this.newestGoodBackup();
        if (good) { const m = merge3(null, migrate(clone(S)), migrate(clone(good.data))); adoptState(m.data); this.setBase(null, null);
          logA('Tự phục hồi dữ liệu', '', '', `so_thu.json hỏng (${cur.err}); đã lấy bản sao lưu ${good.path} rồi gộp với dữ liệu trong trình duyệt. File hỏng cất ở sao_luu/hong`);
          msg.push('sổ thu (TỰ PHỤC HỒI từ ' + good.path + ')'); setTimeout(() => blockMsg('Đã tự phục hồi dữ liệu', `<p>File <span class="mono">so_thu.json</span> trong thư mục bị hỏng (${esc(cur.err)}).</p><p>Tool đã lấy bản sao lưu hợp lệ mới nhất <b>${esc(good.path)}</b> và gộp với dữ liệu trên máy này. File hỏng được cất trong <span class="mono">sao_luu/hong</span>. Kiểm tra lại các thao tác gần nhất.</p>`), 300); }
        else { this.err = 'so_thu.json: ' + cur.err + ' — không tìm thấy bản sao lưu hợp lệ'; logA('Phát hiện file dữ liệu hỏng', '', '', cur.err); if (!S.regs.length && !S.pays.length) { renderFs(); return; } }
      }
      else { const remote = migrate(clone(cur.data));
        if (!S.savedAt || (!S.regs.length && !S.pays.length && !(S.khoa || []).length)) { adoptState(clone(remote)); msg.push(`sổ thu (${S.regs.length} đăng ký)`); }
        else if (cur.head.sha256 && cur.head.sha256 === this.baseHash) { /* thư mục không đổi từ lần đồng bộ trước: giữ thay đổi của máy này */ }
        else { const m = merge3(lastSyncedBase(), migrate(clone(S)), remote); adoptState(m.data); if (JSON.stringify(m.data) !== JSON.stringify(remote)) msg.push(`sổ thu (${S.regs.length} đăng ký, đã gộp với dữ liệu trong trình duyệt)`); else msg.push(`sổ thu (${S.regs.length} đăng ký)`);
          if (m.notes.length) { this.conflictNotes = m.notes; logA('Gộp dữ liệu khi mở thư mục', '', '', m.notes.join('; ')); } }
        this.setBase(JSON.stringify(remote), cur.head.sha256 || sha256(JSON.stringify(cur.data))); if (!cur.legacy && encOn() !== !!cur.head.enc) try { localStorage.setItem('soA1.enc', cur.head.enc ? '1' : '0'); } catch(e){} }
    }
    const ht = await this.readText(this.dir, 'ket_qua_sat_hach.json');
    if (ht) { try { const h = JSON.parse(ht);
      if (!H.attempts.length || (h.at && (!H.at || h.at > H.at))) { H.attempts = h.attempts || []; H.issues = h.issues || []; H.files = h.files || []; H.addrBook = h.addrBook || {}; H.fees = h.fees || {}; H.at = h.at; IDB.put('hist', h); msg.push(`kết quả sát hạch (${H.attempts.length.toLocaleString('vi-VN')} lượt)`); }
    } catch(e){ this.err = 'ket_qua_sat_hach.json bị lỗi: ' + e.message; } }
    if (!st || this.baseTxt !== JSON.stringify(S)) { IDB.put('state', clone(S)); await this.writeState(); }
    if (H.attempts.length && (!ht || (H.at || '') > (JSON.parse(ht || '{}').at || ''))) await this.writeHist();
    await this.heartbeat();
    rebuild(); renderFs();
    if (msg.length) toast('Đã mở từ thư mục: ' + msg.join(', '));
  },
  async newestGoodBackup(){
    const cands = [];
    try { const d0 = await this.sub('sao_luu'); const h = await d0.getFileHandle('so_thu_ban_ghi_truoc.json'); const f = await h.getFile(); cands.push({ path: 'sao_luu/so_thu_ban_ghi_truoc.json', f, t: f.lastModified }); } catch(e){}
    for (const path of ['sao_luu/gio', 'sao_luu/ngay', 'sao_luu/thang']) { try { const d = await this.sub(path); for await (const [n, h] of d.entries()) if (h.kind === 'file' && /\.json$/.test(n)) { const f = await h.getFile(); cands.push({ path: path + '/' + n, f, t: f.lastModified }); } } catch(e){} }
    cands.sort((a, b) => b.t - a.t || b.path.localeCompare(a.path));
    for (const c of cands) { const r = await unpackState(await c.f.text()); if (r.ok) return { path: c.path, data: r.data }; }
    return null;
  },
  async pick(){
    if (!this.supported) return toast('Trình duyệt này không hỗ trợ. Hãy mở tool bằng Chrome hoặc Edge.');
    try { this.dir = await window.showDirectoryPicker({ id: 'soSatHachA1', mode: 'readwrite' }); } catch(e){ return; }
    this.perm = 'granted'; await IDB.put('dir', this.dir); { const p = dirPathOf(); if (p && !p.replace(/[\\/]+$/, '').toLowerCase().endsWith(this.dir.name.toLowerCase())) try { localStorage.removeItem('soA1.dirPath'); } catch(e){} } logA('Chọn thư mục lưu dữ liệu', '', '', this.dir.name); await this.sync();
  },
  async reconnect(){
    try { this.perm = await this.dir.requestPermission({ mode: 'readwrite' }); } catch(e){ this.perm = 'denied'; }
    if (this.perm === 'granted') await this.sync(); else renderFs();
  },
  async boot(){
    if (!this.supported) return;
    const d = await IDB.get('dir'); if (!d) return;
    this.dir = d; const b = await IDB.get('fsBase'); if (b && b.txt) { this.baseTxt = b.txt; this.baseHash = b.hash; }
    try { this.perm = await d.queryPermission({ mode: 'readwrite' }); } catch(e){ this.perm = 'prompt'; }
    if (this.perm === 'granted') await this.sync();
  },
  /* Nhật ký cũ hơn N tháng: chuyển sang file theo tháng, không mất */
  async archiveLog(){
    const keep = +(S.cfg.logKeepMonths || 6), d = new Date(); d.setMonth(d.getMonth() - keep); const cut = d.toISOString().slice(0, 7);
    const old = (S.log || []).filter(l => l.at.slice(0, 7) < cut); if (!old.length) return;
    const byM = {}; old.forEach(l => (byM[l.at.slice(0, 7)] = byM[l.at.slice(0, 7)] || []).push(l));
    for (const [m, list] of Object.entries(byM)) {
      const prev = (await IDB.get('logArc:' + m)) || []; const merged = mergeLogs(prev, list); await IDB.put('logArc:' + m, merged);
      if (this.ready()) { const dir = await this.sub('nhat_ky'); const ft = await this.readText(dir, `nhat_ky_${m}.json`); let fl = []; try { fl = ft ? JSON.parse(ft).log || [] : []; } catch(e){}
        const all = mergeLogs(fl, merged); await this.writeText(dir, `nhat_ky_${m}.json`, JSON.stringify({ month: m, sha256: sha256(JSON.stringify(all)), log: all })); }
    }
    const idx = new Set((await IDB.get('logArcIdx')) || []); Object.keys(byM).forEach(m => idx.add(m)); await IDB.put('logArcIdx', [...idx].sort());
    S.log = S.log.filter(l => l.at.slice(0, 7) >= cut);
  }
};
const mergeLogs = (a, b) => { const seen = new Set(), out = []; for (const x of a.concat(b)) { const k = x.at + '|' + x.by + '|' + x.action + '|' + x.cccd + '|' + x.detail; if (!seen.has(k)) { seen.add(k); out.push(x); } } return out.sort((x, y) => x.at.localeCompare(y.at)); };
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
function lastSyncedBase(){ return FS.baseTxt ? JSON.parse(FS.baseTxt) : null; }
function afterExternalChange(){ rebuild(); if (typeof curId !== 'undefined' && curId && $('#t-quay').classList.contains('on')) showPerson(curId); }
setInterval(() => FS.heartbeat(), 60e3);
setInterval(() => FS.poll(), 20e3);
window.addEventListener('beforeunload', () => { try { if (FS.ready()) FS.sub('dang_mo').then(d => d.removeEntry(MACHINE + '.json')).catch(() => {}); } catch(e){} });

/* ---------- Bản chụp trong trình duyệt (khi chưa có thư mục) ---------- */
async function idbSnapshot(){
  const idx = (await IDB.get('snapIdx')) || [], last = idx[idx.length - 1];
  if (last && Date.now() - new Date(last.at).getTime() < 30 * 60e3) return;
  const at = nowISO(); await IDB.put('snap:' + at, JSON.stringify(S));
  idx.push({ at, regs: S.regs.length, pays: S.pays.length, paid: S.pays.reduce((s, p) => s + p.amount, 0) });
  while (idx.length > 48) { const o = idx.shift(); await IDB.put('snap:' + o.at, null); }
  await IDB.put('snapIdx', idx);
}

/* ---------- Dấu xoá: bản ghi biến mất giữa 2 lần lưu → ghi nhận là xoá thật ---------- */
var LAST_IDS = null;
function idsOf(st){ const m = {}; for (const [col, key] of Object.entries(MERGE_KEYS)) m[col] = new Set((st[col] || []).map(x => x[key])); return m; }
function trackTombs(){
  S.tomb = S.tomb || {}; S.revive = S.revive || {}; const now = nowISO(), cur = idsOf(S);
  if (LAST_IDS) for (const col in cur) { for (const id of LAST_IDS[col] || []) if (!cur[col].has(id)) S.tomb[col + ':' + id] = now; for (const id of cur[col]) if (!(LAST_IDS[col] || new Set()).has(id) && S.tomb[col + ':' + id]) S.revive[col + ':' + id] = now; }
  LAST_IDS = cur;
}
/* ---------- Lưu ---------- */
function save(){
  trackTombs();
  S.savedAt = nowISO(); S.schema = SCHEMA;
  IDB.put('state', clone(S));
  try { localStorage.setItem(LS, JSON.stringify(S)); localStorage.removeItem('soA1.lsFull'); } catch(e){ try { localStorage.setItem('soA1.lsFull', '1'); } catch(_){} }
  FS.schedule(); idbSnapshot(); renderSaveChip();
}
function load(){ try { const s = JSON.parse(localStorage.getItem(LS) || 'null'); if (s) adoptState(s); } catch(e){} }

/* ---------- Trạng thái lưu (góc trên) ---------- */
function renderSaveChip(){
  const el = $('#saveChip'); if (!el) return;
  let cls = 'warn', txt = 'Chỉ lưu trong trình duyệt', tip = 'Chưa chọn thư mục lưu dữ liệu trên ổ đĩa';
  if (!FS.supported) { txt = 'Trình duyệt không lưu ra ổ đĩa'; tip = 'Dùng Chrome hoặc Edge'; }
  else if (FS.dir && FS.perm === 'locked') { cls = 'bad'; txt = 'Dữ liệu đang khoá'; tip = 'Nhập mật khẩu dữ liệu để mở'; }
  else if (FS.dir && FS.perm !== 'granted') { cls = 'bad'; txt = 'Chưa mở thư mục dữ liệu'; tip = 'Bấm để cho phép đọc/ghi thư mục ' + FS.dir.name; }
  else if (FS.err) { cls = 'bad'; txt = 'LỖI LƯU'; tip = FS.err; }
  else if (FS.ready()) { cls = 'ok'; txt = FS.last ? 'Đã lưu ổ đĩa ' + FS.last.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Đã kết nối thư mục'; tip = 'Thư mục ' + FS.dir.name + (FS.others.length ? ' · đang mở cùng: ' + FS.others.map(o => o.name + (o.user ? ' (' + o.user + ')' : '')).join(', ') : ''); }
  el.className = 'savechip ' + cls; el.innerHTML = `<i></i>${esc(txt)}${FS.others.length && FS.ready() ? ` <b>+${FS.others.length} máy</b>` : ''}`; el.title = tip;
}
function renderFs(){
  const bar = $('#fsBar'), info = $('#fsInfo'); let cls = '', html = '';
  if (!FS.supported) { cls = 'warn'; html = 'Trình duyệt này không lưu được ra thư mục. Dữ liệu chỉ nằm trong trình duyệt; nên mở tool bằng Chrome hoặc Edge.'; }
  else if (!FS.dir) { cls = 'warn'; html = `Chưa chọn thư mục lưu dữ liệu: hồ sơ và tiền thu đang chỉ nằm trong trình duyệt. Thu tiền sẽ bị chặn cho tới khi chọn thư mục. <button class="b s w" onclick="FS.pick()">Chọn thư mục</button>`; }
  else if (FS.perm === 'locked') { cls = 'err'; html = `Dữ liệu trong thư mục <b>${esc(FS.dir.name)}</b> đã mã hoá. <button class="b s w" onclick="FS.reconnect()">Nhập mật khẩu dữ liệu</button>`; }
  else if (FS.perm !== 'granted') { cls = 'warn'; html = `Đã có thư mục <b>${esc(FS.dir.name)}</b>. Bấm để cho phép tool đọc/ghi lại (trình duyệt hỏi mỗi lần mở). <button class="b s w" onclick="FS.reconnect()">Mở dữ liệu</button>`; }
  else if (FS.err) { cls = 'err'; html = `Lỗi ghi vào thư mục ${esc(FS.dir.name)}: ${esc(FS.err)} <button class="b s" onclick="FS.writeState()">Thử lại</button>`; }
  else { cls = 'ok'; html = `Tự lưu vào thư mục <b>${esc(FS.dir.name)}</b>${FS.last ? ' · lần lưu cuối ' + FS.last.toLocaleTimeString('vi-VN') : ''} · ${esc(machineName())}${FS.others.length ? ` · <b>đang mở cùng lúc ở: ${FS.others.map(o => esc(o.name + (o.user ? ' (' + o.user + ')' : ''))).join(', ')}</b> — dữ liệu được gộp tự động khi lưu` : ''}${FS.conflictNotes.length ? `<br><span class="r-T">Lần gộp gần nhất: ${esc(FS.conflictNotes.slice(0, 5).join('; '))}</span>` : ''}`; }
  bar.className = cls; bar.innerHTML = cls === 'ok' && !FS.others.length ? '' : html;
  if (cls === 'ok' && FS.others.length) bar.className = 'warn';
  info.innerHTML = `<div class="alert ${cls === 'ok' ? 'ok' : cls === 'err' ? 'bad' : ''}">${html}</div>`;
  renderSaveChip();
}

/* ---------- Chặn thu tiền khi chưa lưu ra ổ đĩa ---------- */
const storageOk = () => !FS.supported || FS.ready() && !FS.err || (() => { try { return sessionStorage.getItem('soA1.noFolderOk') === '1'; } catch(e){ return false; } })();
function guardStorage(label, fn){
  if (storageOk()) return fn();
  const reason = !FS.dir ? 'Chưa chọn thư mục lưu dữ liệu trên ổ đĩa.' : FS.err ? 'Đang lỗi ghi thư mục: ' + esc(FS.err) : 'Thư mục dữ liệu chưa được mở trong lần làm việc này.';
  dialog(`<h2>Chưa lưu được ra ổ đĩa</h2><p>${reason}</p><p class="small">Thao tác <b>${esc(label)}</b> có tiền. Để không mất số liệu khi trình duyệt bị xoá dữ liệu hoặc hỏng máy, hãy mở thư mục dữ liệu trước.</p>
    <label class="small" style="display:flex;gap:6px"><input type="checkbox" id="gsTmp"> Tạm làm việc không có thư mục trong lần mở này (cần quyền quản lý)</label>`, () => {
    if ($('#gsTmp').checked) return requireAdmin('Làm việc tạm không có thư mục lưu', () => { try { sessionStorage.setItem('soA1.noFolderOk', '1'); } catch(e){} logA('Cho phép làm việc tạm không thư mục', '', '', label); save(); fn(); });
    (FS.dir ? FS.reconnect() : FS.pick()).then(() => { if (storageOk()) fn(); });
  }, FS.dir ? 'Mở thư mục dữ liệu' : 'Chọn thư mục');
}

/* ---------- Mật khẩu dữ liệu (mã hoá) ---------- */
function askDataKey(enc){
  return new Promise(res => {
    dialog(`<h2>Dữ liệu đã được mã hoá</h2><p class="small">Nhập <b>mật khẩu dữ liệu</b> (hoặc <b>mã khôi phục</b> đã in khi bật mã hoá) để mở.</p><label class="f">Mật khẩu / mã khôi phục<input type="password" id="dkPw" autocomplete="off"></label>`, async () => {
      const ok = await CRY.unlock(enc, $('#dkPw').value.trim());
      if (!ok) { toast('Sai mật khẩu dữ liệu'); return res(false); }
      try { localStorage.setItem('soA1.enc', '1'); } catch(e){} res(true);
    }, 'Mở dữ liệu');
    $('#dlg').addEventListener('close', function h(){ $('#dlg').removeEventListener('close', h); if ($('#dlg').returnValue !== 'ok') res(false); });
    setTimeout(() => { const e = $('#dkPw'); if (e) e.focus(); }, 50);
  });
}
function encSetupDlg(){
  if (!crypto.subtle) return toast('Trình duyệt không hỗ trợ mã hoá');
  if (encOn()) return requireAdmin('Tắt mã hoá dữ liệu', () => dialog('<h2>Tắt mã hoá?</h2><p>File trong thư mục sẽ được lưu lại ở dạng đọc được.</p>', () => { try { localStorage.setItem('soA1.enc', '0'); } catch(e){} CRY.key = null; logA('Tắt mã hoá dữ liệu', '', '', ''); save(); renderStoragePanel(); }, 'Tắt mã hoá'));
  requireAdmin('Bật mã hoá dữ liệu', () => { const code = CRY.recoveryCode();
    dialog(`<h2>Bật mã hoá file dữ liệu</h2><p class="small">File <span class="mono">so_thu.json</span> và các bản sao lưu trong thư mục sẽ được mã hoá AES-256. Mở tool trên máy mới phải nhập mật khẩu dữ liệu.</p>
      <div class="alert bad small"><b>Quên cả mật khẩu và mã khôi phục = mất dữ liệu.</b> In hoặc chép mã khôi phục dưới đây, cất nơi an toàn (két, phòng quản lý).</div>
      <p>Mã khôi phục: <b class="mono" style="font-size:16px">${code}</b></p>
      <div class="row"><label class="f">Mật khẩu dữ liệu (≥ 8 ký tự)<input type="password" id="ePw1" autocomplete="new-password"></label><label class="f">Nhập lại<input type="password" id="ePw2" autocomplete="new-password"></label></div>
      <label class="small" style="display:flex;gap:6px;margin-top:8px"><input type="checkbox" id="eSaved"> Tôi đã chép / in mã khôi phục</label>`, async () => {
      const a = $('#ePw1').value, b = $('#ePw2').value;
      if (a.length < 8) return blockMsg('Mật khẩu quá ngắn', '<p>Tối thiểu 8 ký tự.</p>'); if (a !== b) return blockMsg('Không khớp', '<p>Hai lần nhập mật khẩu không giống nhau.</p>');
      if (!$('#eSaved').checked) return blockMsg('Chưa lưu mã khôi phục', '<p>Tick xác nhận đã chép mã khôi phục rồi làm lại.</p>');
      await CRY.setup(a, code); try { localStorage.setItem('soA1.enc', '1'); } catch(e){} logA('Bật mã hoá dữ liệu', '', '', ''); save(); renderStoragePanel(); toast('Đã bật mã hoá');
    }, 'Bật mã hoá'); });
}

/* ---------- Khôi phục theo thời điểm ---------- */
async function listBackups(){
  const out = [];
  if (FS.ready()) {
    const scan = async (path, kind) => { try { const d = await FS.sub(path); for await (const [n, h] of d.entries()) if (h.kind === 'file' && /^so_thu.*\.json$|^truoc_.*\.json$/.test(n)) { const f = await h.getFile(); out.push({ src: 'disk', path: path + '/' + n, name: n, kind, at: new Date(f.lastModified).toISOString(), size: f.size, h }); } } catch(e){} };
    await scan('sao_luu/gio', 'Theo giờ'); await scan('sao_luu/ngay', 'Theo ngày'); await scan('sao_luu/thang', 'Theo tháng'); await scan('sao_luu', 'Khác'); await scan('sao_luu/truoc_khoi_phuc', 'Trước khôi phục'); await scan('sao_luu/thu_cong', 'Thủ công');
  }
  for (const s of (await IDB.get('snapIdx')) || []) out.push({ src: 'idb', name: 'Bản chụp trong trình duyệt', kind: 'Trình duyệt', at: s.at, info: s });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
async function readBackup(b){
  const txt = b.src === 'idb' ? await IDB.get('snap:' + b.at) : await (await b.h.getFile()).text();
  if (!txt) return { ok: false, err: 'Không đọc được' };
  if (b.src === 'idb') { try { return { ok: true, data: JSON.parse(txt), head: {} }; } catch(e){ return { ok: false, err: 'Hỏng' }; } }
  return unpackState(txt);
}
const stateSummary = s => ({ regs: (s.regs || []).length, pays: (s.pays || []).length, paid: (s.pays || []).reduce((a, p) => a + (p.amount || 0), 0), khoa: (s.khoa || []).length, wd: (s.withdrawals || []).length, savedAt: s.savedAt });
let bkList = [];
async function renderRestore(){
  const el = $('#rsList'); el.innerHTML = '<div class="small muted">Đang đọc danh sách…</div>';
  bkList = await listBackups();
  el.innerHTML = bkList.length ? `<table><tr><th>Thời điểm</th><th>Loại</th><th>Tên</th><th class="num">Dung lượng</th><th></th></tr>${bkList.slice(0, 400).map((b, i) => `<tr><td class="mono">${new Date(b.at).toLocaleString('vi-VN')}</td><td>${esc(b.kind)}</td><td class="small mono">${esc(b.path || b.name)}</td><td class="num">${b.size ? (b.size / 1024).toFixed(0) + ' KB' : b.info ? b.info.regs + ' ĐK' : ''}</td><td class="act"><button class="b s" onclick="previewBackup(${i})">Xem & so sánh</button></td></tr>`).join('')}</table>`
    : '<div class="empty">Chưa có bản sao lưu nào.</div>';
}
window.previewBackup = i => previewBackupObj(bkList[i]);
async function previewBackupObj(b){
  const r = await readBackup(b);
  if (!r.ok) return blockMsg('Không mở được bản sao lưu', `<p>${esc(r.err)}</p>`);
  const d = migrate(r.data), a = stateSummary(d), c = stateSummary(S);
  const ids = arr => new Set((arr || []).map(x => x.id)), cr = ids(S.regs), br = ids(d.regs), cp = ids(S.pays), bp = ids(d.pays);
  const onlyNow = [...cr].filter(x => !br.has(x)).length, onlyBk = [...br].filter(x => !cr.has(x)).length, pNow = [...cp].filter(x => !bp.has(x)).length, pBk = [...bp].filter(x => !cp.has(x)).length;
  const row = (l, x, y) => `<tr><td>${l}</td><td class="num">${x}</td><td class="num">${y}</td></tr>`;
  dialog(`<h2>Bản sao lưu ${new Date(b.at).toLocaleString('vi-VN')}</h2><p class="small muted">${esc(b.kind)} · ${esc(b.path || b.name)}${r.head && r.head.sha256 ? ' · mã kiểm tra hợp lệ' : ''}${r.head && r.head.machineName ? ' · ghi bởi ' + esc(r.head.machineName) : ''}</p>
    <table><tr><th></th><th class="num">Bản sao lưu</th><th class="num">Hiện tại</th></tr>${row('Đăng ký', a.regs, c.regs)}${row('Khoản thu / chi', a.pays, c.pays)}${row('Tổng tiền thu thuần', money(a.paid), money(c.paid))}${row('Đợt khóa mới', a.khoa, c.khoa)}${row('Rút hồ sơ', a.wd, c.wd)}</table>
    <p class="small">Khôi phục sẽ <b>mất ${onlyNow} đăng ký và ${pNow} khoản thu</b> chỉ có ở hiện tại, và đưa lại ${onlyBk} đăng ký, ${pBk} khoản thu chỉ có trong bản sao lưu.</p>
    <p class="small muted">Trước khi khôi phục, dữ liệu hiện tại được cất vào <span class="mono">sao_luu/truoc_khoi_phuc</span> (và bản chụp trong trình duyệt), nên vẫn quay lại được.</p>`, () => requireAdmin('Khôi phục dữ liệu về ' + new Date(b.at).toLocaleString('vi-VN'), async () => {
      const curTxt = JSON.stringify(S), at = nowISO();
      await IDB.put('snap:' + at, curTxt); const idx = (await IDB.get('snapIdx')) || []; idx.push(Object.assign({ at, note: 'trước khôi phục' }, stateSummary(S))); await IDB.put('snapIdx', idx);
      if (FS.ready()) { const pk = await packState(S); const dir = await FS.sub('sao_luu/truoc_khoi_phuc'); await FS.writeText(dir, `so_thu_truoc_khoi_phuc_${stamp()}.json`, pk.text); }
      const keepLog = S.log; adoptState(d); S.log = mergeLogs(keepLog, S.log || []);
      logA('KHÔI PHỤC DỮ LIỆU', '', '', `về bản ${new Date(b.at).toLocaleString('vi-VN')} (${b.path || b.name}) · ${a.regs} đăng ký, ${a.pays} khoản thu`);
      save(); rebuild(); renderRestore(); toast('Đã khôi phục');
    }), 'Khôi phục bản này');
}

/* ---------- Kiểm tra toàn vẹn dữ liệu ---------- */
function integrityReport(){
  const out = [], add = (lv, area, msg) => out.push({ lv, area, msg });
  const regIds = new Set(), dupId = (arr, nm) => { const s = new Set(); for (const x of arr) { if (s.has(x.id)) add('bad', nm, `Trùng mã ${x.id}`); s.add(x.id); } };
  dupId(S.regs, 'Đăng ký'); dupId(S.pays, 'Khoản thu'); S.regs.forEach(r => regIds.add(r.id));
  for (const p of S.pays) {
    if (!regIds.has(p.regId)) add('bad', 'Khoản thu', `${p.no || p.id} (${money(p.amount)} đ ngày ${fd(p.date)}) không thuộc đăng ký nào`);
    if (!Number.isInteger(p.amount) || !p.amount) add('bad', 'Khoản thu', `${p.no || p.id}: số tiền không hợp lệ (${p.amount})`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) add('bad', 'Khoản thu', `${p.no || p.id}: ngày thu không hợp lệ`);
    if (!p.no) add('bad', 'Số phiếu', `Khoản ${money(p.amount)} ngày ${fd(p.date)} chưa có số phiếu`);
    if (p.method === 'CK' && !p.txn) add('warn', 'Chuyển khoản', `${p.no}: chuyển khoản chưa ghi mã giao dịch`);
  }
  /* số phiếu: trùng và bị nhảy */
  const allPays = S.pays.concat(S.trash.filter(t => t.type === 'pay').map(t => t.pay), ...S.trash.filter(t => t.type === 'reg').map(t => t.pays || []));
  const seen = new Map(); for (const p of S.pays) { if (p.no && seen.has(p.no)) add('bad', 'Số phiếu', `Số ${p.no} bị dùng 2 lần`); seen.set(p.no, p); }
  const usedEver = new Set(allPays.map(p => p.no).filter(Boolean));
  const purged = new Set((S.log || []).filter(l => /Xoá vĩnh viễn/.test(l.action)).map(l => (l.detail.match(/(P[TC]-\d{4}-\d+)/g) || [])).flat());
  for (const k of ['PT', 'PC']) for (const [y, n] of Object.entries(S.seq[k] || {})) { const miss = []; for (let i = 1; i <= n; i++) { const no = `${k}-${y}-${String(i).padStart(4, '0')}`; if (!usedEver.has(no) && !purged.has(no)) miss.push(no); } if (miss.length) add('warn', 'Số phiếu', `${miss.length} số ${k} năm ${y} không còn bản ghi (đã xoá vĩnh viễn hoặc gộp): ${miss.slice(0, 8).join(', ')}${miss.length > 8 ? '…' : ''}`); }
  const inTrash = allPays.filter(p => !S.pays.includes(p)).length; if (inTrash) add('info', 'Số phiếu', `${inTrash} phiếu đang nằm trong thùng rác (vẫn giữ số)`);
  for (const r of S.regs) { const t = regTotals(r); if (t.paid < 0) add('bad', 'Đăng ký', `${r.name}: tổng thu âm ${money(t.paid)}`); if (!r.cancelled && t.paid > t.due) add('warn', 'Đăng ký', `${r.name} (đợt ${fd(r.examDate)}): thu thừa ${money(t.paid - t.due)} đ`); if (r.kind === 'lai' && typeof regIssues === 'function' && regIssues(r).length) add('warn', 'Đăng ký', `${r.name}: ${regIssues(r).join('; ')}`); }
  /* chốt quỹ: số liệu đã chốt phải còn nguyên */
  for (const c of (S.closings || []).filter(c => !c.voided)) { const now = c.payIds.map(id => S.pays.find(p => p.id === id)); const miss = now.filter(x => !x).length, sum = now.filter(Boolean).reduce((s, p) => s + p.amount, 0);
    if (miss || sum !== c.total) add('bad', 'Chốt quỹ', `Ca ${c.cashier} ngày ${fd(c.date)} (${c.no}): đã chốt ${money(c.total)} đ nhưng hiện ${miss ? miss + ' khoản đã bị xoá, ' : ''}còn ${money(sum)} đ`);
    if (sha256(JSON.stringify(c.payIds.map(id => { const p = S.pays.find(x => x.id === id); return p ? [p.id, p.amount, p.date, p.method] : [id]; }))) !== c.sig) add('bad', 'Chốt quỹ', `Ca ${c.cashier} ngày ${fd(c.date)} (${c.no}): khoản thu đã chốt bị sửa sau khi chốt`); }
  const unclosed = unclosedDays(); if (unclosed.length) add('warn', 'Chốt quỹ', `${unclosed.length} ca chưa chốt quỹ: ${unclosed.slice(0, 6).map(u => fd(u.date) + ' ' + u.cashier).join(', ')}`);
  /* khóa mới */
  for (const k of (S.khoa || []).filter(k => !k.deleted)) { const c = kCalc(k); if (c.net < 0) add('bad', 'Khóa mới', `${k.name}: số rút lớn hơn số nhận`); if (c.st === 'over') add('warn', 'Khóa mới', `${k.name}: vượt chỉ tiêu ${c.net - c.limit}`); }
  if (!FS.ready() && FS.supported) add('warn', 'Lưu trữ', 'Chưa kết nối thư mục lưu dữ liệu');
  if (FS.err) add('bad', 'Lưu trữ', FS.err);
  try { if (localStorage.getItem('soA1.lsFull')) add('info', 'Lưu trữ', 'Bộ nhớ nhanh của trình duyệt đã đầy (vẫn lưu đủ ở IndexedDB và thư mục)'); } catch(e){}
  return out;
}
function renderIntegrity(show){
  const rep = integrityReport(), bad = rep.filter(x => x.lv === 'bad').length, warn = rep.filter(x => x.lv === 'warn').length;
  const el = $('#intOut'); if (!el) return rep;
  if (show) el.innerHTML = `<div class="alert ${bad ? 'bad' : warn ? '' : 'ok'}" style="margin-bottom:8px">${bad ? `<b>${bad} lỗi</b>` : 'Không có lỗi'}${warn ? ` · ${warn} cảnh báo` : ''} · kiểm tra lúc ${new Date().toLocaleTimeString('vi-VN')} · ${S.regs.length} đăng ký, ${S.pays.length} khoản thu, mã kiểm tra dữ liệu <span class="mono">${sha256(JSON.stringify(S)).slice(0, 16)}…</span></div>
    ${rep.length ? `<div class="tw"><table><tr><th>Mức</th><th>Mục</th><th>Chi tiết</th></tr>${rep.map(x => `<tr><td><span class="pill ${x.lv === 'bad' ? 'p-due' : x.lv === 'warn' ? 'p-part' : 'p-cxl'}">${x.lv === 'bad' ? 'Lỗi' : x.lv === 'warn' ? 'Cảnh báo' : 'Thông tin'}</span></td><td>${esc(x.area)}</td><td style="white-space:normal">${esc(x.msg)}</td></tr>`).join('')}</table></div>` : ''}`;
  return rep;
}

/* ---------- Sao lưu Excel có kèm bản JSON + mã kiểm tra ---------- */
function backupSheets(){
  const txt = JSON.stringify(S), hash = sha256(txt), chunks = txt.match(/[\s\S]{1,30000}/g) || [''];
  return [['KiemTra', [{ app: 'SoSatHachA1', phien_ban: APP_VERSION, schema: SCHEMA, savedAt: S.savedAt, xuat_luc: nowISO(), may: machineName(), sha256: hash, so_manh: chunks.length, dang_ky: S.regs.length, khoan_thu: S.pays.length, tong_thu: S.pays.reduce((s, p) => s + p.amount, 0) }]],
    ['JSON', chunks.map((c, i) => ({ i, json: c }))]];
}
function readJsonBackup(wb){
  const g = n => XLSX.utils.sheet_to_json(wb.Sheets[n] || {}, { defval: '' });
  const kt = g('KiemTra')[0], parts = g('JSON'); if (!kt || !parts.length) return null;
  const txt = parts.sort((a, b) => a.i - b.i).map(p => String(p.json)).join('');
  if (sha256(txt) !== kt.sha256) return { ok: false, err: 'Mã kiểm tra không khớp: file sao lưu đã bị sửa hoặc hỏng. Không mở để tránh sai số liệu.' };
  return { ok: true, data: JSON.parse(txt), kt };
}

/* ---------- Bảng điều khiển lưu trữ (tab Dữ liệu) ---------- */
function renderStoragePanel(){
  const el = $('#stPanel'); if (!el) return;
  let lastBk = ''; try { lastBk = localStorage.getItem('soA1.lastBk') || ''; } catch(e){}
  el.innerHTML = `<div class="kinfo">
    <div><span>Tên máy này</span><b style="font-size:14px">${esc(machineName())}</b><em><a href="#" onclick="event.preventDefault();renameMachine()">Đổi tên máy</a></em></div>
    <div><span>Phiên bản dữ liệu</span><b>v${S.schema || 1}</b>${S.migratedAt ? `<em>nâng cấp ${new Date(S.migratedAt).toLocaleDateString('vi-VN')}</em>` : ''}</div>
    <div><span>Sao lưu tự động gần nhất</span><b style="font-size:14px">${lastBk ? new Date(lastBk).toLocaleString('vi-VN') : 'chưa có'}</b></div>
    <div><span>Mã hoá file dữ liệu</span><b style="font-size:14px">${encOn() ? 'ĐANG BẬT' : 'Tắt'}</b><em><a href="#" onclick="event.preventDefault();encSetupDlg()">${encOn() ? 'Tắt mã hoá' : 'Bật mã hoá'}</a></em></div>
    <div><span>Nhật ký giữ trong sổ</span><b>${S.cfg.logKeepMonths || 6} tháng</b><em>cũ hơn: chuyển sang nhat_ky/</em></div>
  </div>`;
}
window.renameMachine = () => dialog(`<h2>Tên máy này</h2><p class="small muted">Hiện trên phiếu chốt quỹ, nhật ký và khi nhiều máy cùng mở dữ liệu.</p><label class="f">Tên<input id="mnName" value="${esc(machineName())}"></label>`, () => { const n = C.norm($('#mnName').value); if (n) { try { localStorage.setItem('soA1.machineName', n); } catch(e){} logA('Đổi tên máy', '', '', n); save(); renderStoragePanel(); renderFs(); } }, 'Lưu');

/* ---------- Quản lý thư mục dữ liệu & sao lưu ---------- */
const BM_DIRS = [
  ['', 'Thư mục gốc', 'Dữ liệu đang dùng: so_thu.json (đăng ký, tiền thu, đợt, khóa mới…), ket_qua_sat_hach.json (kết quả sát hạch đã nạp)', 'Luôn là bản mới nhất'],
  ['sao_luu/gio', 'Sao lưu theo giờ', 'Tự ghi khi có thay đổi, mỗi giờ một file', 'Giữ 72 bản gần nhất (~3 ngày)'],
  ['sao_luu/ngay', 'Sao lưu theo ngày', 'Trạng thái cuối mỗi ngày', 'Giữ 180 ngày'],
  ['sao_luu/thang', 'Sao lưu theo tháng', 'Trạng thái cuối mỗi tháng', 'Giữ vĩnh viễn'],
  ['sao_luu/thu_cong', 'Sao lưu thủ công', 'Tạo khi bấm “Sao lưu ngay”', 'Giữ vĩnh viễn'],
  ['sao_luu/truoc_khoi_phuc', 'Trước khi khôi phục', 'Tool tự cất dữ liệu hiện tại trước mỗi lần khôi phục', 'Giữ vĩnh viễn'],
  ['sao_luu', 'Bản ghi trước / trước nâng cấp', 'so_thu_ban_ghi_truoc.json (lần ghi liền trước), bản trước khi nâng cấp phiên bản', 'Tự thay'],
  ['sao_luu/ket_qua', 'Kết quả sát hạch', 'Bản sao file kết quả đã nạp theo ngày', 'Giữ 15 bản'],
  ['sao_luu/hong', 'File hỏng đã cất', 'File dữ liệu bị lỗi / bị sửa tay, cất lại để điều tra', 'Giữ vĩnh viễn'],
  ['nhat_ky', 'Nhật ký theo tháng', 'Nhật ký thao tác cũ hơn ' + '6 tháng', 'Giữ vĩnh viễn']];
const dirPathOf = () => { try { return localStorage.getItem('soA1.dirPath') || ''; } catch(e){ return ''; } };
const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
async function subNoCreate(path){ let d = FS.dir; for (const p of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(p); return d; }
async function listDir(path){ const out = []; try { const d = path ? await subNoCreate(path) : FS.dir; for await (const [n, h] of d.entries()) if (h.kind === 'file') { const f = await h.getFile(); out.push({ name: n, h, size: f.size, at: f.lastModified }); } } catch(e){ return null; } return out.sort((a, b) => b.at - a.at); }
let bmCur = null;
async function renderBkManager(){
  const head = $('#bmHead'); if (!head) return;
  const p = dirPathOf();
  if (!FS.ready()) { head.innerHTML = `<div class="alert">${FS.dir ? `Thư mục <b>${esc(FS.dir.name)}</b> chưa được mở trong lần làm việc này. <button class="b s w" onclick="FS.reconnect().then(renderBkManager)">Mở dữ liệu</button>` : 'Chưa chọn thư mục lưu dữ liệu: sao lưu đang chỉ nằm trong trình duyệt của máy này. <button class="b s w" onclick="FS.pick().then(renderBkManager)">Chọn thư mục</button>'}</div>`; $('#bmTree').innerHTML = ''; $('#bmFiles').innerHTML = ''; return; }
  head.innerHTML = `<div class="kinfo" style="margin-top:0"><div style="grid-column:span 2"><span>Thư mục dữ liệu trên máy này</span><b style="font-size:14px">${p ? esc(p) : esc(FS.dir.name)}</b><em>${p ? `<a href="#" onclick="event.preventDefault();copyDirPath()">Sao chép đường dẫn</a> · ` : ''}<a href="#" onclick="event.preventDefault();setDirPath()">${p ? 'Sửa đường dẫn' : 'Ghi đường dẫn đầy đủ (vd. D:\\TOOLS A1 CSHN\\DuLieu)'}</a></em></div>
    <div><span>Tên thư mục</span><b style="font-size:14px">${esc(FS.dir.name)}</b><em>${esc(machineName())}</em></div>
    <div><span>Lần lưu gần nhất</span><b style="font-size:14px">${FS.last ? FS.last.toLocaleString('vi-VN') : '—'}</b></div></div>`;
  $('#bmTree').innerHTML = '<div class="small muted">Đang đọc thư mục…</div>';
  const rows = [];
  for (const [path, name, desc, keep] of BM_DIRS) { const fs = await listDir(path); const files = (fs || []).filter(f => path || /\.json$/.test(f.name));
    rows.push({ path, name, desc, keep, n: files.length, size: files.reduce((a, f) => a + f.size, 0), last: files[0] ? files[0].at : 0, exists: !!fs }); }
  const snaps = (await IDB.get('snapIdx')) || [];
  $('#bmTree').innerHTML = `<table><tr><th>Thư mục con</th><th>Chứa gì</th><th>Lưu giữ</th><th class="num">Số file</th><th class="num">Dung lượng</th><th>Mới nhất</th><th></th></tr>
    ${rows.map(r => `<tr class="${bmCur === r.path ? 'sel' : ''}"><td><b>${esc(r.name)}</b><div class="small mono muted">${esc((dirPathOf() || FS.dir.name).replace(/[\\/]+$/, ''))}${r.path ? '\\' + esc(r.path.replace(/\//g, '\\')) : ''}</div></td><td class="small" style="white-space:normal;min-width:220px">${esc(r.desc)}</td><td class="small">${esc(r.keep)}</td><td class="num">${r.exists ? r.n : '<span class="muted">chưa có</span>'}</td><td class="num">${r.n ? fmtSize(r.size) : ''}</td><td class="mono small">${r.last ? new Date(r.last).toLocaleString('vi-VN') : ''}</td><td>${r.n ? `<button class="b s" data-bm="${esc(r.path)}">Xem file</button>` : ''}</td></tr>`).join('')}
    <tr><td><b>Bản chụp trong trình duyệt</b><div class="small muted">chỉ có trên máy này</div></td><td class="small" style="white-space:normal">Tự chụp mỗi 30 phút, dùng khi chưa có thư mục hoặc thư mục bị mất</td><td class="small">Giữ 48 bản</td><td class="num">${snaps.length}</td><td></td><td class="mono small">${snaps.length ? new Date(snaps[snaps.length - 1].at).toLocaleString('vi-VN') : ''}</td><td>${snaps.length ? '<button class="b s" data-bm="@idb">Xem</button>' : ''}</td></tr></table>`;
  if (bmCur !== null) renderBmFiles(bmCur);
}
async function renderBmFiles(path){
  bmCur = path; const el = $('#bmFiles');
  if (path === '@idb') { const snaps = ((await IDB.get('snapIdx')) || []).slice().reverse();
    el.innerHTML = `<h3>Bản chụp trong trình duyệt</h3><div class="tw"><table><tr><th>Thời điểm</th><th class="num">Đăng ký</th><th class="num">Khoản thu</th><th class="num">Tổng thu</th><th></th></tr>${snaps.map((s, i) => `<tr><td class="mono">${new Date(s.at).toLocaleString('vi-VN')}${s.note ? ' · ' + esc(s.note) : ''}</td><td class="num">${s.regs}</td><td class="num">${s.pays}</td><td class="num">${money(s.paid || 0)}</td><td class="act"><button class="b s" data-bmi="${i}">Xem &amp; so sánh</button></td></tr>`).join('')}</table></div>`;
    el._snaps = snaps; return; }
  const files = ((await listDir(path)) || []).filter(f => path || /\.json$/.test(f.name)), meta = BM_DIRS.find(d => d[0] === path) || ['', path];
  const main = !path && /^(so_thu|ket_qua_sat_hach)\.json$/;
  el.innerHTML = `<h3>${esc(meta[1])} · <span class="mono">${esc((dirPathOf() || FS.dir.name).replace(/[\\/]+$/, ''))}${path ? '\\' + esc(path.replace(/\//g, '\\')) : ''}</span> · ${files.length} file</h3>
    <div class="tw" style="max-height:380px"><table><tr><th>Tên file</th><th>Ghi lúc</th><th class="num">Dung lượng</th><th></th></tr>${files.map((f, i) => `<tr><td class="mono small">${esc(f.name)}</td><td class="mono small">${new Date(f.at).toLocaleString('vi-VN')}</td><td class="num">${fmtSize(f.size)}</td>
      <td class="act">${/^so_thu|^truoc_/.test(f.name) ? `<button class="b s" data-bmv="${i}">Xem &amp; so sánh</button>` : ''}<button class="b s" data-bmd="${i}">Tải về</button>${main && main.test(f.name) ? '' : `<button class="b s" data-bmx="${i}">Xoá</button>`}</td></tr>`).join('')}</table></div>`;
  el._files = files; el._path = path;
}
$('#bmTree').addEventListener('click', e => { const b = e.target.closest('[data-bm]'); if (b) { renderBmFiles(b.dataset.bm); renderBkManager(); } });
$('#bmFiles').addEventListener('click', async e => {
  const el = $('#bmFiles'), b = e.target.closest('button'); if (!b) return;
  if (b.dataset.bmi != null) { const s = el._snaps[+b.dataset.bmi]; return previewBackupObj({ src: 'idb', name: 'Bản chụp trong trình duyệt', kind: 'Trình duyệt', at: s.at, info: s }); }
  const f = el._files && el._files[+(b.dataset.bmv ?? b.dataset.bmd ?? b.dataset.bmx)]; if (!f) return;
  const full = (el._path ? el._path + '/' : '') + f.name;
  if (b.dataset.bmv != null) return previewBackupObj({ src: 'disk', path: full, name: f.name, kind: 'Thư mục', at: new Date(f.at).toISOString(), size: f.size, h: f.h });
  if (b.dataset.bmd != null) { const file0 = await f.h.getFile(), file = file0 instanceof Blob ? file0 : new Blob([await file0.text()], { type: 'application/json' }), url = URL.createObjectURL(file), a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); logA('Tải file sao lưu', '', '', full); save(); return; }
  if (b.dataset.bmx != null) requireAdmin('Xoá file sao lưu ' + full, () => dialog(`<h2>Xoá file sao lưu?</h2><p class="mono small">${esc(full)}</p><p class="small muted">Chỉ nên xoá khi chắc chắn không cần. Không khôi phục được.</p>`, async () => {
    try { const d = el._path ? await subNoCreate(el._path) : FS.dir; await d.removeEntry(f.name); logA('Xoá file sao lưu', '', '', full); save(); toast('Đã xoá ' + f.name); } catch(err){ toast('Không xoá được: ' + err.message); }
    renderBkManager(); }, 'Xoá'));
});
$('#bmRefresh').onclick = () => renderBkManager();
$('#bmNow').onclick = async () => {
  if (FS.ready()) { try { const pk = await packState(S), dir = await FS.sub('sao_luu/thu_cong'), name = `so_thu_thu_cong_${stamp()}.json`; await FS.writeText(dir, name, pk.text);
      logA('Sao lưu thủ công', '', '', `sao_luu/thu_cong/${name} · ${S.regs.length} đăng ký, ${S.pays.length} khoản thu`); save(); bmCur = 'sao_luu/thu_cong'; await renderBkManager(); toast('Đã sao lưu: sao_luu\\thu_cong\\' + name); }
    catch(err){ toast('Lỗi sao lưu: ' + err.message); } }
  else { const at = nowISO(); await IDB.put('snap:' + at, JSON.stringify(S)); const idx = (await IDB.get('snapIdx')) || []; idx.push(Object.assign({ at, note: 'thủ công' }, stateSummary(S))); await IDB.put('snapIdx', idx); logA('Sao lưu thủ công (trình duyệt)', '', '', ''); save(); toast('Chưa có thư mục: đã chụp trong trình duyệt. Nên chọn thư mục lưu dữ liệu.'); renderBkManager(); }
};
window.setDirPath = () => dialog(`<h2>Đường dẫn thư mục dữ liệu</h2><p class="small">Vì lý do bảo mật, trình duyệt không cho trang web biết đường dẫn đầy đủ. Mở thư mục <b>${esc(FS.dir ? FS.dir.name : '')}</b> trong File Explorer, bấm vào thanh địa chỉ, sao chép rồi dán vào đây. Đường dẫn chỉ ghi trên máy này.</p><label class="f">Đường dẫn<input id="dpIn" value="${esc(dirPathOf())}" placeholder="D:\\TOOLS A1 CSHN\\DuLieu"></label>`, () => {
  const v = $('#dpIn').value.trim(); if (v && FS.dir && !v.replace(/[\\/]+$/, '').toLowerCase().endsWith(FS.dir.name.toLowerCase())) return blockMsg('Đường dẫn không khớp', `<p>Đường dẫn phải kết thúc bằng tên thư mục đang mở: <b>${esc(FS.dir.name)}</b>.</p>`);
  try { localStorage.setItem('soA1.dirPath', v); } catch(e){} renderBkManager(); renderHome && $('#t-home').classList.contains('on') && renderHome(); }, 'Lưu');
window.copyDirPath = () => { const p = dirPathOf(); (navigator.clipboard ? navigator.clipboard.writeText(p) : Promise.reject()).then(() => toast('Đã sao chép: ' + p), () => toast(p)); };
