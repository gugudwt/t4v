'use strict';
/* A tavola: tutto il contenuto sta in dati.bin, cifrato. Qui c'è solo il guscio. */

const PASTI = [
  ['colazione', 'Colazione'], ['pranzo', 'Pranzo'], ['merenda', 'Merenda'],
  ['cena', 'Cena'], ['arco', "Nell'arco della giornata"],
];
const NOME_PASTO = Object.fromEntries(PASTI);
const LETTERE = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const CEREALI = ['riso-integrale', 'pasta-di-semola', 'pasta-integrale'];
const MESE = new Date().getMonth() + 1;

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const foglio = document.getElementById('foglio');

let D = null;                  // i contenuti, una volta aperti
let indice = {};               // ricetta -> dove compare e per chi
const posizioni = {};          // scroll di ogni vista, per tornare dove eri
let ultimaVista = location.hash;
const oraDelPasto = () => {
  const h = new Date().getHours();
  return h < 10 ? 'colazione' : h < 15 ? 'pranzo' : h < 18 ? 'merenda' : 'cena';
};
const filtro = { pasto: oraDelPasto(), veloci: false, testo: '' };

/* Memoria del telefono: può mancare, l'app deve funzionare lo stesso */
const memoria = {
  leggi(k) { try { return localStorage.getItem(k); } catch { return null; } },
  scrivi(k, v) { try { localStorage.setItem(k, v); } catch { /* resta in sessione */ } },
  togli(k) { try { localStorage.removeItem(k); } catch { /* niente */ } },
};
let chi = memoria.leggi('chi');

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const persone = () => (chi === 'ac' ? ['a', 'c'] : [chi]);
const nomeDi = id => D.persone.find(p => p.id === id).nome;
const oggiId = () => D.giorni[(new Date().getDay() + 6) % 7].id;
const giorno = id => D.giorni.find(g => g.id === id);
const inStagione = mesi => !mesi || mesi.includes(MESE);

/* Cifratura */
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const aB64 = u => btoa(String.fromCharCode(...u));
const normalizza = f => f.trim().toLowerCase().replace(/\s+/g, ' ');

async function deriva(frase, busta) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalizza(frase)), 'PBKDF2', false, ['deriveBits']);
  const bit = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: b64(busta.sale), iterations: busta.iter, hash: 'SHA-256' }, base, 256);
  return new Uint8Array(bit);
}
async function apri(chiave, busta) {
  const k = await crypto.subtle.importKey('raw', chiave, 'AES-GCM', false, ['decrypt']);
  const chiaro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(busta.iv) }, k, b64(busta.dati));
  return JSON.parse(new TextDecoder().decode(chiaro));
}

/* Avvio */
async function avvia() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  let busta;
  try {
    const r = await fetch('dati.bin', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    busta = await r.json();
  } catch {
    app.className = 'senza-nav';
    app.innerHTML = `<section class="porta"><h1>A tavola</h1><p>La prima apertura ha bisogno della connessione. Collegati a internet e riapri l'app.</p></section>`;
    return;
  }
  const salvata = memoria.leggi('chiave');
  if (salvata) {
    try { return entra(await apri(b64(salvata), busta)); }
    catch { memoria.togli('chiave'); }
  }
  porta(busta);
}

function porta(busta) {
  nav.hidden = true;
  app.className = 'senza-nav';
  const safari = /iP(hone|ad|od)/.test(navigator.userAgent) && !navigator.standalone;
  app.innerHTML = `<section class="porta">
    <h1>A tavola</h1>
    ${safari ? `<p class="aiuto">Per averla sul telefono, prima aggiungila alla Home: tocca Condividi, poi Aggiungi alla schermata Home. Dopo aprila da lì.</p>` : ''}
    <form id="entra" autocomplete="off">
      <label for="frase">Frase segreta</label>
      <input id="frase" type="password" autocapitalize="off" autocorrect="off" spellcheck="false" required>
      <button type="submit">Apri</button>
      <p class="errore" role="alert"></p>
    </form></section>`;
  const form = document.getElementById('entra');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const bottone = form.querySelector('button');
    const errore = form.querySelector('.errore');
    bottone.disabled = true; bottone.textContent = 'Apro…'; errore.textContent = '';
    try {
      const chiave = await deriva(form.frase.value, busta);
      const dati = await apri(chiave, busta);
      memoria.scrivi('chiave', aB64(chiave));
      entra(dati);
    } catch {
      errore.textContent = 'Frase sbagliata. Controlla le parole e gli spazi.';
      bottone.disabled = false; bottone.textContent = 'Apri';
    }
  });
}

function entra(dati) {
  D = dati;
  indice = {};
  for (const g of D.giorni) for (const [pid] of PASTI) {
    for (const r of g.pasti[pid].ricette) {
      (indice[r.id] ||= []).push({ g: g.id, p: pid, per: r.per });
    }
  }
  if (!['a', 'c', 'ac'].includes(chi)) return scegli();
  avviaNav();
}

function scegli() {
  nav.hidden = true;
  app.className = 'senza-nav';
  const [a, c] = D.persone;
  app.innerHTML = `<section class="scelta">
    <header><h1>Chi sta guardando?</h1><p>Vedrai i grammi di questa persona. Puoi cambiare quando vuoi.</p></header>
    <button class="uno" data-scegli="${a.id}">${esc(a.nome)}</button>
    <button class="altra" data-scegli="${c.id}">${esc(c.nome)}</button>
    <button class="entrambi" data-scegli="ac">Tutti e due</button>
  </section>`;
}

function avviaNav() {
  app.className = '';
  nav.hidden = false;
  disegna();
}

/* Pezzi comuni */
const icone = {
  oggi: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  ricette: '<svg viewBox="0 0 24 24"><path d="M4 11h16v5a4.5 4.5 0 0 1-4.5 4.5h-7A4.5 4.5 0 0 1 4 16zM2 11h20M9 7.5c0-1.5 1-1.5 1-3M14 7.5c0-1.5 1-1.5 1-3"/></svg>',
  alimenti: '<svg viewBox="0 0 24 24"><path d="M12 7.5c-2-1.8-7-1.5-7 4.5 0 4.5 3 9 5 9 .8 0 1.2-.5 2-.5s1.2.5 2 .5c2 0 5-4.5 5-9 0-6-5-6.3-7-4.5zM12 7.5c0-2 1-3.5 3-4"/></svg>',
  regole: '<svg viewBox="0 0 24 24"><rect x="3.5" y="9" width="17" height="11.5" rx="2.5"/><circle cx="12" cy="14.8" r="3.2"/><path d="M12 14.8l1.5-1.5M5 9c1-3 4-5 7-5s6 2 7 5"/></svg>',
};

function disegnaNav(attiva) {
  const voci = [['oggi', 'Oggi', '#/oggi'], ['ricette', 'Ricette', '#/ricette'], ['alimenti', 'Alimenti', '#/alimenti'], ['regole', 'Regole', '#/regole']];
  nav.innerHTML = voci.map(([k, t, h]) =>
    `<a href="${h}"${k === attiva ? ' aria-current="page"' : ''}>${icone[k]}<span>${t}</span></a>`).join('');
}

function bottoniChi() {
  const [a, c] = D.persone;
  const voci = [[a.id, a.nome[0]], [c.id, c.nome[0]], ['ac', 'Due']];
  const titoli = { [a.id]: a.nome, [c.id]: c.nome, ac: 'Tutti e due' };
  return `<div class="chi" role="group" aria-label="Di chi vedere i grammi">${voci.map(([k, t]) =>
    `<button data-chi="${k}" aria-label="${esc(titoli[k])}" aria-pressed="${k === chi}">${esc(t)}</button>`).join('')}</div>`;
}

function quantita(v) {
  if (!v) return '';
  if (v.u === 'g') return `${v.q}<i>g${v.dubbio ? '*' : ''}</i>`;
  if (v.u === 'n') return `${v.q}`;
  const u = v.u.startsWith('cucchiain') ? 'cucch.' : v.u;
  return `${v.q}<i>${u}</i>`;
}

const stessiAlimenti = (x, y) => x.length === y.length && x.every((v, i) => v.id === y[i].id);

function segnoStagione(v) {
  const info = D.alimenti[v.id];
  return info && info.stagione && !inStagione(info.stagione) ? '<span class="segno">fuori stagione</span>' : '';
}

function riga(nome, celle, attr = '', tag = 'div') {
  return `<${tag} class="riga" ${attr}><span class="nome">${nome}</span>${celle.map(c => `<span class="q">${c}</span>`).join('')}</${tag}>`;
}

/* La tabella dei grammi: una persona, due affiancate, o due gruppi se mangiano cose diverse */
function tabella(m, { gid = null, voci = null } = {}) {
  const a = voci ? voci.a : m.a, c = voci ? voci.c : m.c;
  const attr = v => (gid ? `data-alimento="${esc(v.id)}" data-giorno="${gid}" ${alternativeDi(gid, v.id) ? '' : 'data-senza'}` : '');
  const tag = gid ? 'button' : 'div';
  const dubbi = [];
  const nota = v => { if (v.dubbio && !dubbi.includes(v.dubbio)) dubbi.push(v.dubbio); return ''; };
  let corpo;
  if (chi !== 'ac' || !a.length || !c.length) {
    const lista = chi === 'c' ? c : (chi === 'a' ? a : (a.length ? a : c));
    corpo = lista.map(v => riga(esc(v.nome) + segnoStagione(v), [quantita(v) + nota(v)], attr(v), tag)).join('');
  } else if (stessiAlimenti(a, c)) {
    corpo = `<div class="due"><div class="riga capo"><span></span><span>${esc(nomeDi('a'))}</span><span>${esc(nomeDi('c'))}</span></div>` +
      a.map((v, i) => riga(esc(v.nome) + segnoStagione(v), [quantita(v) + nota(v), quantita(c[i]) + nota(c[i])], attr(v), tag)).join('') + '</div>';
  } else {
    corpo = [['a', a], ['c', c]].map(([k, l]) => `<div class="gruppo"><p class="gruppo-nome">${esc(nomeDi(k))}</p>` +
      l.map(v => riga(esc(v.nome) + segnoStagione(v), [quantita(v) + nota(v)], attr(v), tag)).join('') + '</div>').join('');
  }
  return `<div class="tabella ${gid ? 'tocca' : ''}">${corpo}${dubbi.map(d => `<p class="dubbio">* ${esc(d)}</p>`).join('')}${gid ? '<p class="suggerimento">Tocca un alimento per vedere con cosa puoi sostituirlo.</p>' : ''}</div>`;
}

function ricetteDelPasto(m) {
  const mappa = new Map();
  for (const r of m.ricette) {
    const x = mappa.get(r.id) || { id: r.id, per: '' };
    x.per += r.per;
    mappa.set(r.id, x);
  }
  return [...mappa.values()].filter(r => persone().some(p => r.per.includes(p)));
}

/* Oggi e i giorni */
function vistaGiorno(gid) {
  const g = giorno(gid);
  const eOggi = gid === oggiId();
  const data = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
  disegnaNav('oggi');
  const fasce = PASTI.map(([pid, nome]) => {
    const m = g.pasti[pid];
    const n = ricetteDelPasto(m).length;
    const testa = `<div class="fascia-testa"><h2>${esc(nome)}</h2>${n ? `<span>${n} ricette</span>` : ''}</div>`;
    const piatto = m.piatto ? `<p class="piatto">${esc(m.piatto)}</p>` : '';
    if (pid === 'arco') {
      return `<section class="fascia" data-pasto="arco">${testa}${tabella(m)}<p class="avviso">${esc(D.sintesiArco)}</p></section>`;
    }
    return `<a class="fascia" data-pasto="${pid}" href="#/pasto/${gid}/${pid}">${testa}${piatto}${tabella(m)}</a>`;
  }).join('');
  app.innerHTML = `<header class="testa">
    <div class="testa-riga"><h1>${esc(g.nome)}</h1>${bottoniChi()}</div>
    <p>${eOggi ? `Oggi, ${esc(data)}` : 'Il menu di questo giorno'}</p>
    <nav class="settimana" aria-label="Giorni della settimana">${D.giorni.map((x, i) =>
      `<a href="#/giorno/${x.id}" aria-label="${esc(x.nome)}" class="${x.id === oggiId() ? 'oggi' : ''}"${x.id === gid ? ' aria-current="page"' : ''}>${LETTERE[i]}</a>`).join('')}</nav>
  </header>${fasce}`;
}

/* Un pasto */
function dividi(m) {
  if (chi !== 'ac') return '';
  const va = m.a.find(v => CEREALI.includes(v.id));
  const vc = m.c.find(v => CEREALI.includes(v.id));
  if (!va || !vc || va.id !== vc.id || va.q === vc.q) return '';
  const pasta = va.id.startsWith('pasta');
  return `<div class="dividi" data-qa="${va.q}" data-qc="${vc.q}">
    <label for="cotto">Cuocete ${pasta ? 'la pasta' : 'il riso'} insieme? Scrivi il peso da ${pasta ? 'cotta' : 'cotto'} e ${pasta ? 'la' : 'lo'} divido</label>
    <div class="dividi-riga"><input id="cotto" type="number" inputmode="numeric" min="1" placeholder="g"><output for="cotto"></output></div>
  </div>`;
}

function rigaRicetta(r, gid, pid) {
  const x = D.ricette[r.id];
  const pronto = x.m > x.a ? (x.m >= 180 ? 'Pronto dopo il riposo' : `Pronto in ${x.m} minuti`) : 'Pronto subito';
  return `<li><a href="#/ricetta/${gid}/${pid}/${r.id}">
    <span class="tempo">${x.a}<small>min</small></span>
    <span><strong>${esc(x.t)}</strong><span class="pronto">${pronto}</span></span></a></li>`;
}

function vistaPasto(gid, pid) {
  const g = giorno(gid), m = g.pasti[pid];
  disegnaNav('oggi');
  const lista = ricetteDelPasto(m).sort((x, y) => D.ricette[x.id].a - D.ricette[y.id].a);
  let ricette;
  const soloDi = k => lista.filter(r => r.per === k || r.per === k + k);
  const comuni = lista.filter(r => r.per.includes('a') && r.per.includes('c'));
  if (chi === 'ac' && lista.some(r => !(r.per.includes('a') && r.per.includes('c')))) {
    const blocco = (titolo, l) => (l.length ? `<h3>${esc(titolo)}</h3><ol class="scala">${l.map(r => rigaRicetta(r, gid, pid)).join('')}</ol>` : '');
    ricette = blocco('Per tutti e due', comuni) + blocco(nomeDi('a'), soloDi('a')) + blocco(nomeDi('c'), soloDi('c'));
  } else {
    ricette = `<ol class="scala">${lista.map(r => rigaRicetta(r, gid, pid)).join('')}</ol>`;
  }
  const fagioli = D.cotti[`${gid}:fagioli-secchi`];
  const nota = fagioli && pid === 'pranzo'
    ? `<p class="promemoria">I fagioli secchi vanno in ammollo la sera prima. In scatola o già cotti: ${persone().map(p => `${esc(nomeDi(p))} ${esc(fagioli[p])}`).join(', ')}.</p>` : '';
  const riso = pid === 'pranzo' && m.a.some(v => v.id === 'riso-integrale')
    ? `<p class="promemoria">Il riso integrale cuoce 35 minuti: puoi lessarlo la sera prima.</p>` : '';
  app.innerHTML = `<section class="eroe" data-pasto="${pid}">
      <div class="eroe-sopra"><a class="indietro" href="#/giorno/${gid}">${esc(g.nome)}</a>${bottoniChi()}</div>
      <h1>${esc(NOME_PASTO[pid])}</h1>
      ${m.piatto ? `<p class="piatto">${esc(m.piatto)}</p>` : ''}
      ${tabella(m, { gid })}
      ${dividi(m)}
    </section>
    <section class="corpo" data-pasto="${pid}">
      <h2>Ricette</h2>
      <p class="sotto">Dalla più veloce alla più elaborata, con gli alimenti e i grammi di questo pasto. Il tempo è quello di lavoro.</p>
      ${ricette}${nota}${riso}
    </section>`;
}

/* Una ricetta */
function vistaRicetta(gid, pid, rid) {
  const r = D.ricette[rid], g = giorno(gid), m = g.pasti[pid];
  disegnaNav('ricette');
  if (!r) return location.replace('#/oggi');
  const per = (indice[rid] || []).filter(x => x.g === gid && x.p === pid).map(x => x.per).join('');
  const voci = {
    a: per.includes('a') ? m.a : [],
    c: per.includes('c') ? m.c : [],
  };
  const olio = r.o ? `${r.o} ${r.o === 1 ? 'cucchiaino' : 'cucchiaini'} d'olio a testa` : '';
  app.innerHTML = `<section class="eroe ricetta" data-pasto="${pid}">
      <div class="eroe-sopra"><a class="indietro" href="#/pasto/${gid}/${pid}">${esc(NOME_PASTO[pid])}, ${esc(g.nome.toLowerCase())}</a>${bottoniChi()}</div>
      <h1>${esc(r.t)}</h1>
      <div class="meta"><span><b>${r.a} min</b> di lavoro</span>${r.m > r.a ? `<span><b>${r.m >= 180 ? 'riposo lungo' : `${r.m} min`}</b> in tutto</span>` : ''}</div>
      ${tabella(m, { voci })}
    </section>
    <section class="corpo" data-pasto="${pid}">
      <h2>Come si fa</h2>
      <ol class="passi">${r.p.map(s => `<li><span>${esc(s)}</span></li>`).join('')}</ol>
      <p class="promemoria">${olio ? `Questa ricetta usa ${esc(olio)}, dal conto del giorno. ` : ''}Pesa tutto a crudo, solo la parte che si mangia.</p>
    </section>`;
}

/* Tutte le ricette */
function vistaRicette() {
  disegnaNav('ricette');
  const voci = [['colazione', 'Colazione'], ['pranzo', 'Pranzo'], ['merenda', 'Merenda'], ['cena', 'Cena'], ['tutte', 'Tutte']];
  app.innerHTML = `<header class="testa"><div class="testa-riga"><h1>Ricette</h1>${bottoniChi()}</div>
      <input class="cerca" id="cercaR" type="search" placeholder="Cerca per piatto o alimento" aria-label="Cerca una ricetta" value="${esc(filtro.testo)}">
      <div class="filtri" role="group" aria-label="Filtra per pasto">
        ${voci.map(([k, t]) => `<button data-filtro="${k}" aria-pressed="${filtro.pasto === k}">${t}</button>`).join('')}
        <button data-veloci aria-pressed="${filtro.veloci}">Entro 15 minuti</button>
      </div></header>
    <section class="corpo" style="padding-top:6px"><ol class="scala" id="listaR"></ol></section>`;
  document.querySelector('[data-filtro][aria-pressed=true]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  elencoRicette();
}

function elencoRicette() {
  const q = filtro.testo.trim().toLowerCase();
  const voci = Object.values(D.ricette).filter(r => {
    const usi = indice[r.id] || [];
    if (!usi.some(u => persone().some(p => u.per.includes(p)))) return false;
    if (filtro.pasto !== 'tutte' && r.pasto !== filtro.pasto) return false;
    if (filtro.veloci && r.a > 15) return false;
    return !q || (r.t + ' ' + r.p.join(' ')).toLowerCase().includes(q);
  }).sort((x, y) => x.a - y.a || x.m - y.m);
  const giorniBrevi = id => giorno(id).nome.slice(0, 3);
  const lista = document.getElementById('listaR');
  lista.innerHTML = voci.length ? voci.map(r => {
    const usi = indice[r.id].filter(u => persone().some(p => u.per.includes(p)));
    const giorni = [...new Set(usi.map(u => u.g))];
    return `<li data-pasto="${r.pasto}"><a href="#/ricetta/${usi[0].g}/${usi[0].p}/${r.id}">
      <span class="tempo">${r.a}<small>min</small></span>
      <span><strong>${esc(r.t)}</strong><span class="pronto">${esc(NOME_PASTO[r.pasto])}, ${giorni.map(giorniBrevi).join(', ').toLowerCase()}</span></span></a></li>`;
  }).join('') : `<li class="vuoto">Nessuna ricetta trovata. Prova con un altro alimento o togli un filtro.</li>`;
}

/* Alimenti */
function vistaAlimenti() {
  disegnaNav('alimenti');
  app.innerHTML = `<header class="testa"><h1>Alimenti</h1>
      <p>Tutto ciò che c'è nel piano, con le alternative.</p>
      <input class="cerca" id="cercaA" type="search" placeholder="Cerca un alimento" aria-label="Cerca un alimento"></header>
    <section class="corpo" style="padding-top:6px" id="listaA"></section>`;
  elencoAlimenti('');
}

function elencoAlimenti(q) {
  q = q.trim().toLowerCase();
  const voci = Object.entries(D.alimenti).filter(([, a]) => !q || a.nome.toLowerCase().includes(q) || a.alt.some(x => x.nome.toLowerCase().includes(q)));
  const html = D.categorie.map(([cat, titolo]) => {
    const l = voci.filter(([, a]) => a.cat === cat).sort((x, y) => x[1].nome.localeCompare(y[1].nome, 'it'));
    if (!l.length) return '';
    return `<h3>${esc(titolo)}</h3><div class="elenco">${l.map(([id, a]) => {
      const n = altContate(id);
      return `<button data-scheda="${esc(id)}">${esc(a.nome)}<span>${n ? `${n} alternative` : 'nessuna alternativa'}</span></button>`;
    }).join('')}</div>`;
  }).join('');
  document.getElementById('listaA').innerHTML = html || `<p class="vuoto">Nessun alimento trovato. Prova con un altro nome.</p>`;
}

function altContate(id) {
  const nomi = new Set(D.alimenti[id].alt.map(x => x.nome));
  for (const [k, v] of Object.entries(D.autorizzate)) {
    if (k.endsWith(':' + id)) Object.values(v).flat().forEach(n => nomi.add(n));
  }
  return nomi.size;
}

/* Regole */
function vistaRegole() {
  disegnaNav('regole');
  const aggiornato = new Date(D.aggiornato).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  app.innerHTML = `<header class="testa"><h1>Regole</h1><p>Le indicazioni della dottoressa, in breve.</p></header>
    <section class="corpo" style="padding-top:0">
      ${D.regole.map(([t, l]) => `<div class="regola"><h2>${esc(t)}</h2><ul>${l.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}
      <div class="regola"><h2>Questo telefono</h2>
        <p class="sotto">Piano aggiornato al ${esc(aggiornato)}.</p>
        <button class="azione" data-cambia>Cambia persona</button>
        <button class="azione" data-blocca>Blocca l'app</button>
      </div>
    </section>`;
}

/* Foglio delle alternative */
function alternativeDi(gid, aid) {
  const aut = D.autorizzate[`${gid}:${aid}`];
  return (aut && Object.keys(aut).length) || D.alimenti[aid].alt.length;
}

function arrotonda(q) { return q < 50 ? Math.round(q / 5) * 5 : Math.round(q / 10) * 10; }

function grammi(gid, aid, f, fisso) {
  const cerca = (k) => {
    const g = giorno(gid);
    for (const [pid] of PASTI) {
      const v = g.pasti[pid][k].find(x => x.id === aid);
      if (v) return v;
    }
    return null;
  };
  const valori = persone().map(p => {
    const v = cerca(p);
    if (!v) return null;
    if (fisso) return { p, t: fisso };
    return { p, t: v.u === 'g' ? `${arrotonda(v.q * f)} g` : `${v.q} ${v.u === 'n' ? '' : v.u}`.trim() };
  }).filter(Boolean);
  if (valori.length === 2 && valori[0].t === valori[1].t) {
    return `<span class="g"><div>${esc(valori[0].t)}<small>a testa</small></div></span>`;
  }
  return `<span class="g">${valori.map(x => `<div>${esc(x.t)}${chi === 'ac' ? `<small>${esc(nomeDi(x.p))}</small>` : ''}</div>`).join('')}</span>`;
}

function apriFoglio(html) {
  foglio.innerHTML = html;
  foglio.showModal();
  foglio.scrollTop = 0;
}

function fogliAlternative(gid, aid) {
  const a = D.alimenti[aid];
  const aut = D.autorizzate[`${gid}:${aid}`] || {};
  const qui = persone();
  const nelPiano = [], altrui = [];
  for (const [per, nomi] of Object.entries(aut)) {
    for (const n of nomi) {
      if (qui.some(p => per.includes(p))) nelPiano.push({ n, solo: per.length === 1 && chi === 'ac' ? per : null });
      else altrui.push({ n, da: per });
    }
  }
  const scritti = new Set([...nelPiano, ...altrui].map(x => x.n));
  const proposte = a.alt.filter(x => !scritti.has(x.nome))
    .sort((x, y) => Number(inStagione(y.mesi) && !!y.mesi) - Number(inStagione(x.mesi) && !!x.mesi));

  const rigaAut = x => {
    const fisso = D.fisse[`${gid}:${aid}:${x.n}`];
    return `<div class="alt"><span>${esc(x.n)}${x.solo ? `<em>Solo nel piano di ${esc(nomeDi(x.solo))}</em>` : ''}</span>${grammi(gid, aid, 1, fisso)}</div>`;
  };
  const rigaAltrui = x => `<div class="alt"><span>${esc(x.n)}<em>È scritta nel piano di ${esc(nomeDi(x.da))}</em></span>${grammi(gid, aid, 1)}</div>`;
  const rigaProposta = x => `<div class="alt"><span>${esc(x.nome)}${x.mesi && inStagione(x.mesi) ? '<em class="stagione">Di stagione</em>' : ''}</span>${grammi(gid, aid, x.f, x.q)}</div>`;
  const conferma = altrui.length + proposte.length;
  apriFoglio(`<div class="foglio-testa"><h2>Al posto di: ${esc(a.nome.toLowerCase())}</h2><button class="chiudi" data-chiudi>Chiudi</button></div>
    <div class="foglio-corpo">
      ${nelPiano.length ? `<h3><span class="etichetta ok">Della dottoressa</span></h3><p class="spiega">Scritte nel piano per questo giorno.</p>${nelPiano.map(rigaAut).join('')}` : ''}
      ${conferma ? `<h3><span class="etichetta attesa">Da confermare</span></h3><p class="spiega">Proposte con calorie simili. Il piano le vieta senza un'indicazione della dottoressa: chiedile prima di usarle.</p>${altrui.map(rigaAltrui).join('')}${proposte.map(rigaProposta).join('')}` : ''}
      ${!nelPiano.length && !conferma ? `<p class="spiega">Per questo alimento non ci sono alternative. Si mangia come scritto nel piano.</p>` : ''}
    </div>`);
}

function fogliScheda(aid) {
  const a = D.alimenti[aid];
  const usi = new Map();
  for (const u of a.usi) {
    if (!persone().includes(u.chi)) continue;
    const k = `${u.g}/${u.p}`;
    usi.set(k, [...(usi.get(k) || []), u]);
  }
  const righe = [...usi.entries()].map(([k, l]) => {
    const [g, p] = k.split('/');
    const quanto = l.map(u => (u.u === 'g' ? `${u.q} g` : `${u.q}`)).join(' e ');
    const dove = `${giorno(g).nome}, ${NOME_PASTO[p].toLowerCase()}`;
    const inner = `<span>${esc(dove)}</span><span class="g">${esc(quanto)}</span>`;
    return p === 'arco' ? `<div class="alt">${inner}</div>` : `<a class="alt" href="#/pasto/${g}/${p}" data-chiudi>${inner}</a>`;
  }).join('');
  const aut = Object.entries(D.autorizzate).filter(([k]) => k.endsWith(':' + aid));
  const nomiAut = aut.flatMap(([k, v]) => {
    const nome = giorno(k.split(':')[0]).nome.toLowerCase();
    return Object.entries(v).filter(([per]) => persone().some(p => per.includes(p)))
      .flatMap(([, n]) => n.map(x => `${x} (${nome})`));
  });
  const proposte = a.alt.map(x => x.nome);
  apriFoglio(`<div class="foglio-testa"><h2>${esc(a.nome)}</h2><button class="chiudi" data-chiudi>Chiudi</button></div>
    <div class="foglio-corpo">
      ${righe ? `<h3>Dove compare</h3><p class="spiega">Apri il pasto e tocca l'alimento per vedere i grammi delle alternative.</p>${righe}` : '<p class="spiega">Non compare nel piano di questa persona.</p>'}
      ${nomiAut.length ? `<h3><span class="etichetta ok">Della dottoressa</span></h3><p class="spiega">${esc(nomiAut.join(', '))}</p>` : ''}
      ${proposte.length ? `<h3><span class="etichetta attesa">Da confermare</span></h3><p class="spiega">${esc(proposte.join(', '))}</p>` : ''}
    </div>`);
}

/* Navigazione */
function disegna() {
  if (!D) return;
  const [, vista, ...resto] = (location.hash || '#/oggi').slice(1).split('/');
  if (foglio.open) foglio.close();
  switch (vista) {
    case 'giorno': return giorno(resto[0]) ? vistaGiorno(resto[0]) : vistaGiorno(oggiId());
    case 'pasto': return giorno(resto[0]) && resto[1] in NOME_PASTO && resto[1] !== 'arco' ? vistaPasto(resto[0], resto[1]) : vistaGiorno(oggiId());
    case 'ricetta': return giorno(resto[0]) && resto[1] in NOME_PASTO ? vistaRicetta(resto[0], resto[1], resto[2]) : vistaGiorno(oggiId());
    case 'ricette': return vistaRicette();
    case 'alimenti': return vistaAlimenti();
    case 'regole': return vistaRegole();
    default: return vistaGiorno(oggiId());
  }
}

window.addEventListener('hashchange', () => {
  posizioni[ultimaVista] = window.scrollY;
  ultimaVista = location.hash;
  disegna();
  window.scrollTo(0, posizioni[location.hash] || 0);
});

document.addEventListener('click', e => {
  const t = e.target.closest('[data-chi],[data-scegli],[data-alimento],[data-scheda],[data-chiudi],[data-filtro],[data-veloci],[data-cambia],[data-blocca]');
  if (e.target === foglio) return foglio.close();
  if (!t) return;
  const d = t.dataset;
  if (d.chi) {
    e.preventDefault();
    chi = d.chi; memoria.scrivi('chi', chi);
    const y = window.scrollY; disegna(); window.scrollTo(0, y);
  } else if (d.scegli) {
    chi = d.scegli; memoria.scrivi('chi', chi);
    location.hash = '#/oggi'; avviaNav();
  } else if (d.alimento) {
    if ('senza' in d) return;
    fogliAlternative(d.giorno, d.alimento);
  } else if (d.scheda) {
    fogliScheda(d.scheda);
  } else if ('chiudi' in d) {
    foglio.close();
  } else if (d.filtro) {
    filtro.pasto = d.filtro;
    document.querySelectorAll('[data-filtro]').forEach(b => b.setAttribute('aria-pressed', b.dataset.filtro === filtro.pasto));
    elencoRicette();
  } else if ('veloci' in d) {
    filtro.veloci = !filtro.veloci;
    t.setAttribute('aria-pressed', filtro.veloci);
    elencoRicette();
  } else if ('cambia' in d) {
    scegli();
  } else if ('blocca' in d) {
    memoria.togli('chiave');
    location.hash = '';
    location.reload();
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'cercaR') { filtro.testo = e.target.value; elencoRicette(); }
  if (e.target.id === 'cercaA') elencoAlimenti(e.target.value);
  if (e.target.id === 'cotto') {
    const box = e.target.closest('.dividi');
    const qa = +box.dataset.qa, qc = +box.dataset.qc, tot = +e.target.value;
    const out = box.querySelector('output');
    if (!tot) { out.innerHTML = ''; return; }
    const a = Math.round(tot * qa / (qa + qc));
    out.innerHTML = `${esc(nomeDi('a'))} <b>${a} g</b><br>${esc(nomeDi('c'))} <b>${tot - a} g</b>`;
  }
});

avvia();
