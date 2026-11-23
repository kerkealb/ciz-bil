const $ = i => document.getElementById(i), cv = $('tuval'), ctx = cv.getContext('2d');
const RENKLER = ['#1f2328', '#d62828', '#f77f00', '#fcbf49', '#2a9d3f', '#1d6fd1', '#7b2cbf', '#7f4f24'], BOYUTLAR = [4, 10, 22];
const oku = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
const yaz = (k, v) => { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} };
const bekle = m => new Promise(r => setTimeout(r, m));
let istemci = oku('cizbil-istemci');
if (!istemci) { const a = new Uint32Array(3); crypto.getRandomValues(a); istemci = [...a].map(x => x.toString(36)).join(''); yaz('cizbil-istemci', istemci); }
let kod = oku('cizbil-kod') || '', peer = null, conn = null, bagliOldu = false, zaman = null, tekrarZaman = null, cikti = false;
let st = null, tur = 0, cizgiler = [], aktif = null, kirli = false, bitisAn = 0, renk = RENKLER[0], kalin = 10, silgi = false, temizOnay = 0;

function ekran(a) { ['kodEkran', 'takimEkran', 'oyun'].forEach(x => $(x).hidden = x !== a); }
function kapat() { clearTimeout(zaman); clearTimeout(tekrarZaman); if (peer) { const p = peer; peer = null; conn = null; try { p.destroy(); } catch (e) {} } }
function kodHatasi(t) { kapat(); bagliOldu = false; kod = ''; yaz('cizbil-kod', null); $('kopuk').hidden = true; ekran('kodEkran'); $('kodHata').textContent = t; $('kodBtn').disabled = false; $('kodBtn').textContent = 'Odaya gir'; $('kodGir').focus(); }
function yenidenDene() { if (cikti || !kod) return; $('kopuk').hidden = false; clearTimeout(tekrarZaman); tekrarZaman = setTimeout(() => baglan(kod), 2500); }
function baglan(k) {
  kapat(); kod = k; cikti = false;
  if (typeof Peer === 'undefined') { kodHatasi('İnternet bağlantısı yok.'); return; }
  const p = new Peer({ debug: 0 }); peer = p;
  zaman = setTimeout(() => { if (p !== peer || (conn && conn.open)) return; if (bagliOldu) yenidenDene(); else kodHatasi('Odaya bağlanılamadı. Kodu kontrol et.'); }, 14000);
  p.on('open', () => {
    if (p !== peer) return;
    const c = p.connect(ODA_ON_EK + k, { reliable: true }); conn = c;
    c.on('open', () => { if (p !== peer) return; clearTimeout(zaman); bagliOldu = true; yaz('cizbil-kod', k); $('kopuk').hidden = true; c.send({ t: 'selam', istemci, takim: +(oku('cizbil-takim') || 0) }); });
    c.on('data', m => { if (p === peer) al(m); });
    c.on('close', () => { if (p === peer) yenidenDene(); });
    c.on('error', () => {});
  });
  p.on('error', e => {
    if (p !== peer) return;
    if (bagliOldu) { yenidenDene(); return; }
    kodHatasi(e.type === 'peer-unavailable' ? 'Bu kodla açık oda yok.' : 'Bağlanılamadı. İnterneti kontrol et.');
  });
}
function al(m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'red') { $('takimHata').textContent = m.neden === 'dolu' ? 'Bu takım alınmış, başka takım seç.' : m.neden === 'kilitli' ? 'Oda kilitli. Öğretmene söyle.' : 'Bu takıma girilemedi.'; return; }
  if (m.t === 'durum') guncelle(m);
}
function takimDiz(s) {
  const k = $('takimlar');
  if (k.children.length !== s.takimlar.length) { k.textContent = ''; s.takimlar.forEach(t => { const b = document.createElement('button'); b.textContent = 'Takım ' + t.no; b.onclick = () => { $('takimHata').textContent = ''; if (conn && conn.open) conn.send({ t: 'katil', takim: t.no }); }; k.appendChild(b); }); }
  s.takimlar.forEach((t, i) => { k.children[i].disabled = t.cevrim; });
}
function guncelle(s) {
  const once = st; st = s;
  if (!s.ben) { yaz('cizbil-takim', null); ekran('takimEkran'); $('odaYazi').textContent = 'Oda ' + kod + (s.kilit ? ' · kilitli' : ''); takimDiz(s); return; }
  yaz('cizbil-takim', String(s.ben)); ekran('oyun'); $('takimAd').textContent = 'Takım ' + s.ben;
  if (s.tur !== tur) { tur = s.tur; yukle(); ciz(); }
  $('kelime').textContent = s.kelime || 'Çiz Bil';
  bitisAn = performance.now() + s.kalan; saat();
  const acik = s.faz === 'ciziyor' && !s.duraklat; cv.classList.toggle('kilitli', !acik); if (!acik && aktif) bitirCizgi();
  if (once && once.faz === 'ciziyor' && s.faz === 'puanlama') sonGonder();
  $('durum').textContent = mesaj(s);
}
function mesaj(s) {
  const b = s.takimlar[s.ben - 1] || { toplam: 0, turPuani: 0 };
  if (s.faz === 'lobi') return 'Hazırsınız. Öğretmen oyunu başlatınca kelime çıkacak.';
  if (s.faz === 'hazir') return 'Kelimeye bakın. Öğretmen süreyi başlatınca çizmeye başlayın.';
  if (s.faz === 'ciziyor') return s.duraklat ? 'Süre durdu, bekleyin.' : 'Çizin!';
  if (s.faz === 'puanlama') return (b.turPuani ? 'Bu çizimden ' + b.turPuani + ' puan aldınız. ' : 'Süre bitti, tahtaya bakın. ') + 'Toplam: ' + b.toplam;
  const sira = 1 + s.takimlar.filter(t => t.dolu && t.toplam > b.toplam).length;
  return 'Oyun bitti. ' + sira + '. oldunuz, toplam ' + b.toplam + ' puan.';
}
function saat() {
  if (!st || !st.ben) return;
  const k = st.faz === 'ciziyor' && !st.duraklat ? Math.max(0, bitisAn - performance.now()) : st.kalan, sn = Math.ceil(k / 1000);
  $('sayac').textContent = st.faz === 'lobi' || st.faz === 'bitti' ? '' : Math.floor(sn / 60) + ':' + String(sn % 60).padStart(2, '0');
  $('sayac').classList.toggle('az', st.faz === 'ciziyor' && sn <= 10);
}
setInterval(saat, 200);

function anahtar() { return 'cizbil-cizim-' + kod + '-' + tur; }
function sakla() { try { sessionStorage.setItem(anahtar(), JSON.stringify(cizgiler)); } catch (e) {} }
function yukle() { aktif = null; kirli = false; try { cizgiler = JSON.parse(sessionStorage.getItem(anahtar())) || []; } catch (e) { cizgiler = []; } if (cizgiler.length) kirli = true; }
function cizgiCiz(c) { ctx.strokeStyle = ctx.fillStyle = c.r; ctx.lineWidth = c.k; ctx.lineCap = ctx.lineJoin = 'round'; const p = c.n; if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0][0], p[0][1], c.k / 2, 0, 7); ctx.fill(); return; } ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.stroke(); }
function ciz() { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); cizgiler.forEach(cizgiCiz); if (aktif) cizgiCiz(aktif); }
function nokta(e) { const r = cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) * cv.width / r.width), Math.round((e.clientY - r.top) * cv.height / r.height)]; }
function acikMi() { return st && st.faz === 'ciziyor' && !st.duraklat; }
function bitirCizgi() { if (!aktif) return; cizgiler.push(aktif); aktif = null; kirli = true; sakla(); ciz(); }
cv.addEventListener('pointerdown', e => { if (!acikMi() || e.button > 0) return; e.preventDefault(); cv.setPointerCapture(e.pointerId); aktif = { r: silgi ? '#ffffff' : renk, k: silgi ? Math.max(kalin, 22) : kalin, n: [nokta(e)] }; ciz(); });
cv.addEventListener('pointermove', e => { if (!aktif) return; const ev = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; (ev.length ? ev : [e]).forEach(x => aktif.n.push(nokta(x))); ciz(); });
['pointerup', 'pointercancel'].forEach(t => cv.addEventListener(t, bitirCizgi));

function resimUret() { const o = document.createElement('canvas'); o.width = 700; o.height = 490; o.getContext('2d').drawImage(cv, 0, 0, 700, 490); return o.toDataURL('image/jpeg', 0.8); }
function gonder() { if (!st || !conn || !conn.open || (!cizgiler.length && !st.gonderildi)) return false; try { conn.send({ t: 'cizim', tur, resim: resimUret() }); kirli = false; return true; } catch (e) { kirli = true; return false; } }
async function sonGonder() { bitirCizgi(); ciz(); if (!cizgiler.length && !st.gonderildi) { kirli = false; return; } await bekle(450); for (let i = 0; i < 8; i++) { if (gonder()) return; await bekle(700); } }
setInterval(() => { if (kirli && !aktif && acikMi()) gonder(); }, 3000);

RENKLER.forEach(c => { const b = document.createElement('button'); b.className = 'renk' + (c === renk ? ' secili' : ''); b.style.background = c; b.setAttribute('aria-label', 'Renk'); b.onclick = () => { renk = c; silgiAyar(false); document.querySelectorAll('.renk').forEach(x => x.classList.toggle('secili', x === b)); }; $('renkler').appendChild(b); });
BOYUTLAR.forEach(k => { const b = document.createElement('button'); b.className = 'boyut' + (k === kalin ? ' secili' : ''); b.setAttribute('aria-label', 'Kalınlık ' + k); const i = document.createElement('i'); i.style.width = i.style.height = Math.min(k, 24) + 'px'; b.appendChild(i); b.onclick = () => { kalin = k; document.querySelectorAll('.boyut').forEach(x => x.classList.toggle('secili', x === b)); }; $('boyutlar').appendChild(b); });
function silgiAyar(v) { silgi = v; $('silgi').classList.toggle('secili', v); }
$('silgi').onclick = () => silgiAyar(!silgi);
function geri() { if (!acikMi()) return; cizgiler.pop(); kirli = true; sakla(); ciz(); }
$('geri').onclick = geri;
addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); geri(); } });
$('temizle').onclick = () => { if (!acikMi()) return; const b = $('temizle'); if (Date.now() < temizOnay) { cizgiler = []; kirli = !!st.gonderildi; sakla(); ciz(); temizOnay = 0; b.textContent = 'Temizle'; return; } temizOnay = Date.now() + 2500; b.textContent = 'Emin misin?'; setTimeout(() => { if (Date.now() >= temizOnay) b.textContent = 'Temizle'; }, 2600); };
$('kodGir').addEventListener('input', () => { $('kodGir').value = $('kodGir').value.replace(/\D/g, '').slice(0, 3); $('kodHata').textContent = ''; });
$('kodForm').onsubmit = e => { e.preventDefault(); const k = $('kodGir').value; if (!/^[1-9]\d\d$/.test(k)) { $('kodHata').textContent = '3 haneli kodu yaz.'; return; } $('kodBtn').disabled = true; $('kodBtn').textContent = 'Bağlanıyor'; bagliOldu = false; baglan(k); };
$('cik').onclick = () => { cikti = true; yaz('cizbil-takim', null); st = null; tur = 0; kodHatasi(''); };
ciz();
const adresKod = new URLSearchParams(location.search).get('kod');
if (adresKod && /^[1-9]\d\d$/.test(adresKod)) { $('kodGir').value = adresKod; $('kodBtn').disabled = true; $('kodBtn').textContent = 'Bağlanıyor'; baglan(adresKod); }
else if (kod) { $('kodGir').value = kod; bagliOldu = true; $('kopuk').hidden = false; baglan(kod); }
else $('kodGir').focus();
