const $ = i => document.getElementById(i), PUANLAR = [5, 10, 15, 20], SURELER = [30, 60, 90, 120, 180];
const EKRAN = ['baglan', 'lobi', 'hazir', 'ciziyor', 'puanlama', 'bitti'], KEY = 'cizbil-online-tahta';
const yeniDurum = () => ({ faz: 'lobi', takimSayisi: 20, kelimeSayisi: 10, sure: 90, tur: 0, deste: [], kelime: '', puanlar: [], kalan: 90000, duraklat: false, kilit: false, kod: '' });
let S = yeniDurum(), odaHazir = false, peer = null, bitisAn = 0, bitisZamani = 0, deneme = 0, acilis = 0, geriYuklendi = false, mz, kartTur = -1;
let oyuncular = new Map(), baglar = new Set(), resimler = {}, kartlar = new Map();
try { const k = JSON.parse(sessionStorage.getItem(KEY)); if (k && k.kod) { S = Object.assign(yeniDurum(), k); geriYuklendi = true; if (S.faz === 'ciziyor') S.duraklat = true; } } catch (e) {}

function kaydet() { try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
function mesaj(t) { $('mesaj').textContent = t; $('mesaj').hidden = false; clearTimeout(mz); mz = setTimeout(() => $('mesaj').hidden = true, 3500); }
function kodUret() { const a = new Uint16Array(1); do { crypto.getRandomValues(a); } while (a[0] >= 64800); return String(100 + a[0] % 900); }

function odaAc() {
  if (peer) { try { peer.destroy(); } catch (e) {} }
  $('tekrar').hidden = true; $('baglanYazi').textContent = 'İnternet bağlantısı kontrol ediliyor';
  if (typeof Peer === 'undefined') { baglantiHatasi(); return; }
  if (!S.kod) S.kod = kodUret();
  const p = new Peer(ODA_ON_EK + S.kod, { debug: 0 }); peer = p;
  p.on('open', () => { odaHazir = true; deneme = 0; acilis = performance.now(); ciz(); });
  p.on('connection', c => { baglar.add(c); c.on('data', m => al(c, m)); c.on('close', () => { baglar.delete(c); yay(); }); c.on('error', () => {}); });
  p.on('disconnected', () => setTimeout(() => { if (p === peer && !p.destroyed && p.disconnected) p.reconnect(); }, 1500));
  p.on('error', e => {
    if (p !== peer) return;
    if (e.type === 'unavailable-id') {
      if (geriYuklendi && deneme < 6) { deneme++; setTimeout(odaAc, 2500); }
      else { geriYuklendi = false; deneme = 0; S.kod = ''; odaAc(); }
      return;
    }
    if (!odaHazir && ['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible'].includes(e.type)) baglantiHatasi();
  });
}
function baglantiHatasi() { $('baglanYazi').textContent = 'Oda açılamadı. İnternet bağlantısını kontrol et.'; $('tekrar').hidden = false; }

function takimKaydi(t) { for (const [id, o] of oyuncular) if (o.takim === t) return [id, o]; return null; }
function toplam(t) { return S.puanlar.reduce((a, p) => a + (p[t] || 0), 0); }
function kalanSure() { return S.faz === 'ciziyor' && !S.duraklat ? Math.max(0, bitisAn - performance.now()) : S.kalan; }
function takimlar() {
  const l = [];
  for (let i = 1; i <= S.takimSayisi; i++) {
    const k = takimKaydi(i), o = k && k[1];
    l.push({ no: i, dolu: !!o, cevrim: !!(o && o.conn && o.conn.open), toplam: toplam(i), turPuani: S.tur > 0 ? (S.puanlar[S.tur - 1][i] || 0) : 0 });
  }
  return l;
}
function durum(c, l) {
  const o = c.istemci ? oyuncular.get(c.istemci) : null;
  return { t: 'durum', faz: S.faz, tur: S.tur, kelime: S.faz === 'lobi' ? '' : S.kelime, kalan: Math.round(kalanSure()), duraklat: S.duraklat, sure: S.sure, takimSayisi: S.takimSayisi, kelimeSayisi: S.kelimeSayisi, kilit: S.kilit, ben: o ? o.takim : 0, gonderildi: !!(o && resimler[o.takim]), takimlar: l };
}
function gonder(c, l) { if (c.open) { try { c.send(durum(c, l || takimlar())); } catch (e) {} } }
function yay() { const l = takimlar(); baglar.forEach(c => gonder(c, l)); ciz(); }
function red(c, neden) { if (c.open) { try { c.send({ t: 'red', neden }); } catch (e) {} } }

function al(c, m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'selam') {
    const id = String(m.istemci || '').slice(0, 40); if (!id) return;
    c.istemci = id; let o = oyuncular.get(id);
    if (o) o.conn = c;
    else {
      const t = +m.takim, serbest = !S.kilit || (geriYuklendi && performance.now() - acilis < 20000);
      if (Number.isInteger(t) && t >= 1 && t <= S.takimSayisi && serbest && !takimKaydi(t)) oyuncular.set(id, { takim: t, conn: c, son: 0 });
    }
    yay(); return;
  }
  if (!c.istemci) return;
  if (m.t === 'katil') {
    const t = +m.takim, ben = oyuncular.get(c.istemci);
    if (!Number.isInteger(t) || t < 1 || t > S.takimSayisi) return red(c, 'takim');
    if (S.kilit && !ben) return red(c, 'kilitli');
    const k = takimKaydi(t);
    if (k && k[0] !== c.istemci) { if (k[1].conn && k[1].conn.open) return red(c, 'dolu'); oyuncular.delete(k[0]); }
    if (ben) { ben.takim = t; ben.conn = c; } else oyuncular.set(c.istemci, { takim: t, conn: c, son: 0 });
    yay(); return;
  }
  if (m.t === 'cizim') {
    const o = oyuncular.get(c.istemci); if (!o || m.tur !== S.tur) return;
    const acik = S.faz === 'ciziyor' || (S.faz === 'puanlama' && performance.now() - bitisZamani < 8000);
    if (!acik || typeof m.resim !== 'string' || !m.resim.startsWith('data:image/jpeg;base64,') || m.resim.length > 600000) return;
    const an = performance.now(); if (an - o.son < 400) return; o.son = an;
    const once = resimler[o.takim]; resimler[o.takim] = { v: once ? once.v + 1 : 1, data: m.resim };
    gonder(c); ciz();
  }
}

function karistir() { const a = [...KELIMELER]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function kelimeAl() { if (!S.deste.length) { S.deste = karistir(); if (S.deste[S.deste.length - 1] === S.kelime) S.deste.reverse(); } return S.deste.pop(); }
function yeniTur() { S.tur++; S.kelime = kelimeAl(); S.puanlar.push(Array(41).fill(0)); resimler = {}; S.kalan = S.sure * 1000; S.duraklat = false; S.faz = 'hazir'; yay(); }
function turBitir() { S.kalan = 0; S.duraklat = false; S.faz = 'puanlama'; bitisZamani = performance.now(); yay(); }
function onay(b, fn) { let ac = 0, ad = ''; b.addEventListener('click', () => { if (Date.now() < ac) { ac = 0; b.textContent = ad; fn(); return; } ad = b.textContent; ac = Date.now() + 3000; b.textContent = 'Emin misin?'; setTimeout(() => { if (ac && Date.now() >= ac) { ac = 0; b.textContent = ad; } }, 3050); }); }

function sureDiz() { document.querySelectorAll('.sureler').forEach(k => { if (!k.children.length) SURELER.forEach(v => { const b = document.createElement('button'); b.textContent = v + ' sn'; b.dataset.v = v; b.onclick = () => { S.sure = v; S.kalan = v * 1000; yay(); }; k.appendChild(b); }); [...k.children].forEach(b => b.classList.toggle('secili', +b.dataset.v === S.sure)); }); }
function ciz() {
  const l = takimlar(), dolu = l.filter(t => t.dolu), e = odaHazir ? S.faz : 'baglan';
  EKRAN.forEach(x => $(x).hidden = x !== e); sureDiz(); kaydet();
  $('ustKod').textContent = odaHazir ? 'Kod: ' + S.kod : ''; $('kilit').hidden = !odaHazir;
  $('kilit').textContent = S.kilit ? 'Oda kilitli' : 'Odayı kilitle'; $('kilit').classList.toggle('secili', S.kilit);
  $('ust').textContent = !odaHazir ? '' : S.faz === 'lobi' ? dolu.length + ' / ' + S.takimSayisi + ' takım girdi' : S.faz === 'bitti' ? 'Oyun bitti' : 'Kelime ' + S.tur + ' / ' + S.kelimeSayisi;
  if (!odaHazir) return;
  if (S.faz === 'lobi') lobi(l);
  if (S.faz === 'hazir') { $('hTur').textContent = 'Kelime ' + S.tur + ' / ' + S.kelimeSayisi; $('hKelime').textContent = S.kelime; }
  if (S.faz === 'ciziyor') { $('cKelime').textContent = S.kelime; $('dur').textContent = S.duraklat ? 'Devam et' : 'Duraklat'; $('gelen').textContent = (S.duraklat ? 'Süre durdu. ' : '') + Object.keys(resimler).length + ' / ' + dolu.length + ' takım çizmeye başladı'; saat(); }
  if (S.faz === 'puanlama') puanla(dolu);
  if (S.faz === 'bitti') sonuc(dolu);
}
function lobi(l) {
  $('kod').textContent = S.kod; $('adres').textContent = (location.origin + location.pathname.replace(/tahta\.html$/, '')).replace(/^https?:\/\//, '');
  $('aTakim').textContent = S.takimSayisi; $('aKelime').textContent = S.kelimeSayisi;
  const k = $('cipler');
  if (k.children.length !== l.length) { k.textContent = ''; l.forEach(t => { const b = document.createElement('button'); b.className = 'cip'; b.textContent = 'Takım ' + t.no; let ac = 0; b.onclick = () => { const x = takimKaydi(t.no); if (!x) return; if (Date.now() < ac) { ac = 0; b.textContent = 'Takım ' + t.no; const c = x[1].conn; oyuncular.delete(x[0]); if (c) gonder(c); yay(); return; } ac = Date.now() + 2500; b.textContent = 'Çıkar?'; setTimeout(() => { if (ac && Date.now() >= ac) { ac = 0; b.textContent = 'Takım ' + t.no; } }, 2600); }; k.appendChild(b); }); }
  l.forEach((t, i) => { k.children[i].classList.toggle('dolu', t.dolu); k.children[i].classList.toggle('kopuk', t.dolu && !t.cevrim); });
}
function kartYap(no) {
  const k = document.createElement('article'); k.className = 'kart'; k.innerHTML = '<div class="kbas"><b></b><span></span></div><button class="res" aria-label="Çizimi büyüt"></button><div class="tus"></div>';
  k.querySelector('b').textContent = 'Takım ' + no; const v = { k, ver: -1, res: k.querySelector('.res'), top: k.querySelector('.kbas span'), tus: [] };
  v.res.onclick = () => { const i = v.res.querySelector('img'); if (!i) return; $('buyuk').querySelector('img').src = i.src; $('buyuk').querySelector('p').textContent = 'Takım ' + no; $('buyuk').hidden = false; };
  PUANLAR.forEach(p => { const b = document.createElement('button'); b.textContent = p; b.setAttribute('aria-label', 'Takım ' + no + ' için ' + p + ' puan'); b.onclick = () => { const d = S.puanlar[S.tur - 1]; d[no] = d[no] === p ? 0 : p; yay(); }; v.tus.push(b); k.querySelector('.tus').appendChild(b); });
  return v;
}
function puanla(dolu) {
  if (kartTur !== S.tur) { kartTur = S.tur; kartlar.clear(); $('kartlar').textContent = ''; }
  $('pKelime').textContent = S.kelime; $('pTur').textContent = 'Kelime ' + S.tur + ' / ' + S.kelimeSayisi;
  dolu.forEach(t => { let v = kartlar.get(t.no); if (!v) { v = kartYap(t.no); kartlar.set(t.no, v); $('kartlar').appendChild(v.k); } const r = resimler[t.no], ver = r ? r.v : 0; if (v.ver !== ver) { v.ver = ver; v.res.textContent = ''; if (r) { const i = document.createElement('img'); i.alt = 'Takım ' + t.no + ' çizimi'; i.src = r.data; v.res.appendChild(i); } else v.res.textContent = 'Çizim gelmedi'; } v.top.textContent = 'Toplam ' + t.toplam; v.k.classList.toggle('puanli', t.turPuani > 0); v.tus.forEach((b, i) => b.classList.toggle('secili', PUANLAR[i] === t.turPuani)); });
  kartlar.forEach((v, no) => { if (!dolu.some(t => t.no === no)) { v.k.remove(); kartlar.delete(no); } });
  $('pSay').textContent = dolu.filter(t => t.turPuani > 0).length + ' / ' + dolu.length + ' takıma puan verildi'; $('sonraki').textContent = S.tur >= S.kelimeSayisi ? 'Sonuçları göster' : 'Sonraki kelime';
}
function sonuc(dolu) {
  const l = [...dolu].sort((a, b) => b.toplam - a.toplam || a.no - b.no), e = l.length ? l[0].toplam : 0, k = l.filter(t => t.toplam === e);
  $('kazanan').textContent = !l.length || e === 0 ? 'Puan verilmedi' : (k.length > 1 ? 'Berabere: ' : '') + k.map(t => 'Takım ' + t.no).join(', ');
  const o = $('sirala'); o.textContent = ''; let sira = 0, son = null;
  l.forEach((t, i) => { if (t.toplam !== son) { sira = i + 1; son = t.toplam; } const li = document.createElement('li'); if (e > 0 && t.toplam === e) li.className = 'ilk'; const a = document.createElement('span'), b = document.createElement('span'); a.textContent = sira + '. Takım ' + t.no; b.textContent = t.toplam + ' puan'; li.append(a, b); o.appendChild(li); });
}
function saat() {
  if (S.faz !== 'ciziyor') return;
  if (!S.duraklat) { S.kalan = Math.max(0, bitisAn - performance.now()); if (S.kalan <= 0) { turBitir(); return; } }
  const sn = Math.ceil(S.kalan / 1000); $('sayac').textContent = Math.floor(sn / 60) + ':' + String(sn % 60).padStart(2, '0'); $('sayac').classList.toggle('az', sn <= 10); $('bar').style.width = Math.min(100, S.kalan / (S.sure * 10)) + '%';
}
setInterval(saat, 200);

document.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
  const [a, d] = b.dataset.a.split(','), n = S[a] + (+d);
  if (a === 'kelimeSayisi' && (n < 1 || n > KELIMELER.length)) return;
  if (a === 'takimSayisi') { if (n < 2 || n > 40) return; if ([...oyuncular.values()].some(o => o.takim > n)) { mesaj('Bu sayının üstünde takımda oyuncu var, önce onları çıkar.'); return; } }
  S[a] = n; yay();
});
$('tekrar').onclick = odaAc;
$('kilit').onclick = () => { S.kilit = !S.kilit; yay(); };
$('basla').onclick = () => { if (!oyuncular.size) { mesaj('Önce en az bir takım girmeli.'); return; } S.tur = 0; S.puanlar = []; S.deste = []; S.kelime = ''; kartTur = -1; yeniTur(); };
$('baska').onclick = () => { S.kelime = kelimeAl(); yay(); };
$('git').onclick = () => { S.kalan = S.sure * 1000; bitisAn = performance.now() + S.kalan; S.duraklat = false; S.faz = 'ciziyor'; yay(); };
$('dur').onclick = () => { if (S.duraklat) { bitisAn = performance.now() + S.kalan; S.duraklat = false; } else { S.kalan = Math.max(0, bitisAn - performance.now()); S.duraklat = true; } yay(); };
$('ekle').onclick = () => { if (S.duraklat) S.kalan += 15000; else bitisAn += 15000; yay(); };
$('sonraki').onclick = () => { if (S.tur >= S.kelimeSayisi) { S.faz = 'bitti'; yay(); } else yeniTur(); };
onay($('bitir'), turBitir);
onay($('oyunBitir'), () => { S.faz = 'bitti'; yay(); });
onay($('yeni'), () => { const a = { takimSayisi: S.takimSayisi, kelimeSayisi: S.kelimeSayisi, sure: S.sure, kilit: S.kilit, kod: S.kod }; S = Object.assign(yeniDurum(), a); S.kalan = S.sure * 1000; resimler = {}; kartTur = -1; yay(); });
$('buyuk').onclick = () => $('buyuk').hidden = true;
addEventListener('keydown', e => { if (e.key === 'Escape') $('buyuk').hidden = true; });
if (S.faz === 'ciziyor') bitisAn = performance.now() + S.kalan;
ciz(); odaAc();
