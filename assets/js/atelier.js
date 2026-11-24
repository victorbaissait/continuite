// assets/js/atelier.js — Lecture à la table, versions comparées, arc des personnages, continuité, budget du film
'use strict';

const Atelier = {
  vue() {
    return '<div class="an-vue" id="ec-atelier"><p class="an-note">Lecture…</p></div>';
  },

  ouvrir() {
    const ouvrir = { lecture: () => Lecture.ouvrir(), versions: () => Versions.ouvrir(), arcs: () => Arcs.rendre(), continuite: () => Continuite.ouvrir(), budget: () => Budget.rendre() }[Ecriture.vue];
    if (ouvrir) ouvrir();
  },

  slot() {
    return document.getElementById('ec-atelier');
  },

  ep() {
    return Ecriture.ordre[Ecriture.rang.get(Ecriture.epId)];
  },
};

// ─── Lecture à la table : une voix par personnage, chronomètre en main ─────

const Lecture = {
  data: null,
  lignes: [],
  i: 0,
  enCours: false,
  vitesse: 1,
  didascalies: false,
  mesures: {},
  _debut: 0,

  async ouvrir() {
    this.arreter();
    // Un autre épisode : le partage du précédent s'arrête
    if (this.reseau) { await window.bureau?.reseau?.('arreter'); this.reseau = null; }
    this.surLigne = null;
    this.surFin = null;
    const e = Atelier.ep();
    if (!e) return;
    this.data = await api.get(`ecriture_sb&episode_id=${e.id}`);
    this.lignes = this.data.scenes.flatMap(s => s.lignes.map(l => ({ ...l, scene: s.i, slug: s.slug })));
    this.i = 0;
    this.mesures = objetNote(Ecriture.notes[`lecture:${e.id}`]).scenes || {};
    this.rendre();
  },

  _voix() {
    const toutes = 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
    const fr = toutes.filter(v => v.lang.startsWith('fr'));
    return fr.length ? fr : toutes;
  },

  // Une voix et une hauteur par personnage, toujours les mêmes d'une lecture à l'autre
  _pour(qui) {
    const voix = this._voix();
    const parleurs = [...new Set(this.lignes.map(l => l.qui).filter(Boolean))];
    const rang = Math.max(0, parleurs.indexOf(qui));
    return { voix: voix.length ? voix[rang % voix.length] : null, hauteur: 0.75 + ((rang * 0.37) % 0.7) };
  },

  // La durée attendue d'une scène : celle du storyboard (une page par minute), sinon 150 mots par minute
  _attendu(s) {
    if (s.secondes) return s.secondes;
    const mots = s.lignes.filter(l => l.qui).reduce((t, l) => t + l.texte.split(/\s+/).length, 0);
    return Math.round(mots / 150 * 60);
  },

  _duree(s) {
    s = Math.round(s);
    return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`;
  },

  rendre() {
    const slot = Atelier.slot();
    if (!slot || !this.data) return;
    if (!this.lignes.length) { slot.innerHTML = '<section class="an-carte"><p class="an-note">Pas encore de texte à lire pour cet épisode.</p></section>'; return; }
    const scenes = this.data.scenes;
    const mesures = scenes.map(s => this.mesures[s.i]).filter(Number.isFinite);
    const totalMesure = mesures.reduce((a, b) => a + b, 0);
    const totalAttendu = scenes.reduce((t, s) => t + this._attendu(s), 0);
    const courante = this.lignes[this.i];
    const parleurs = [...new Set(this.lignes.map(l => l.qui).filter(Boolean))];
    slot.innerHTML = `
      <div class="an-ligne lec-barre">
        <button type="button" class="btn btn-primary btn-sm" onclick="Lecture.basculer()">${this.enCours ? '❚❚ Pause' : this.i ? '▶ Reprendre' : '▶ Lire depuis le début'}</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="Lecture.recommencer()">Recommencer</button>
        ${window.bureau?.reseau ? `<button type="button" class="btn btn-secondary btn-sm" onclick="Lecture.partager()">${this.reseau ? 'Partage en cours' : 'Lire à plusieurs (Wi-Fi)'}</button>` : ''}
        <button type="button" class="btn btn-secondary btn-sm" title="Le texte qui défile en grand" onclick="Prompteur.ouvrir(Lecture.lignes.map(l => ({ type: l.qui ? 'dialogue' : 'action', qui: l.qui, texte: l.texte })), Ecriture._titreEp())">Prompteur</button>
        <label class="an-label" for="lec-vitesse">Vitesse</label>
        <select id="lec-vitesse" onchange="Lecture.vitesse = Number(this.value)">${[0.8, 0.9, 1, 1.1, 1.25, 1.5].map(v => `<option value="${v}" ${v === this.vitesse ? 'selected' : ''}>${String(v).replace('.', ',')}×</option>`).join('')}</select>
        <label class="mep-coche"><input type="checkbox" ${this.didascalies ? 'checked' : ''} onchange="Lecture.didascalies = this.checked"><span>Lire aussi les didascalies</span></label>
        <span class="an-note" id="lec-chrono">${this.enCours ? 'lecture…' : ''}</span>
      </div>
      ${'speechSynthesis' in window ? '' : '<p class="an-note ec-orange">Ce navigateur ne sait pas lire à voix haute.</p>'}
      ${this.reseau ? `<section class="an-carte lec-reseau"><div class="an-entete"><h2 class="an-titre">Lecture à plusieurs</h2><button type="button" class="btn btn-ghost btn-sm" onclick="Lecture.arreterPartage()">Arrêter le partage</button></div>
        <p>Sur chaque téléphone, connecté au même Wi-Fi, ouvre :</p>
        ${(this.reseau.urls || []).map(u => `<p class="lec-url"><code>${esc(u)}</code> <button type="button" class="ec-lien" onclick="navigator.clipboard?.writeText('${esc(u)}').then(() => toast('Adresse copiée', 'success'))">copier</button></p>`).join('') || '<p class="an-note ec-orange">Aucun réseau trouvé : cet ordinateur n\'est connecté à aucun Wi-Fi.</p>'}
        <p class="an-note">Chacun choisit son rôle : ses répliques sont surlignées, et la ligne lue ici avance chez tout le monde (clique une ligne pour y aller). Tant que le partage est actif, une personne du même réseau qui a l'adresse peut lire cet épisode, rien d'autre et sans rien modifier. Il s'arrête de lui-même dans 4 heures, et quand tu fermes l'app.</p></section>` : ''}
      <div class="sb-grille">
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre">${esc(courante?.slug || '')}</h2><span class="an-note">${this.i + 1} / ${this.lignes.length}</span></div>
          <div class="lec-texte" id="lec-texte">${this.lignes.map((l, k) => `<p class="lec-l ${l.qui ? '' : 'did'} ${k === this.i ? 'actif' : ''}" data-k="${k}" onclick="Lecture.aller(${k})">${l.qui ? `<strong style="color:${Analyse._encre(Analyse._couleur(l.qui))}">${esc(l.qui)}</strong> ` : ''}<span class="vo-brut">${esc(l.texte)}</span></p>`).join('')}</div>
        </section>
        <section class="an-carte sb-detail">
          <h2 class="an-titre">Chronomètre</h2>
          <div class="an-entete"><span>Lu</span><strong>${mesures.length ? this._duree(totalMesure) : '—'}</strong></div>
          <div class="an-entete"><span>Estimé</span><strong>${this._duree(totalAttendu)}</strong></div>
          <ul class="ec-liste">${scenes.map(s => {
            const m = this.mesures[s.i], a = this._attendu(s);
            const lent = Number.isFinite(m) && a && m > a * 1.3;
            return `<li class="${lent ? 'ec-orange' : ''}"><span class="vo-brut">${esc(s.slug || 'Ouverture')}</span><span>${Number.isFinite(m) ? `${this._duree(m)} lu` : '—'} · ${this._duree(a)} estimé${lent ? ' · ça traîne' : ''}</span></li>`;
          }).join('')}</ul>
          <span class="an-label">Voix</span>
          <p class="sb-texte vo-brut">${parleurs.map(p => { const v = this._pour(p).voix; return `${esc(p)} : ${esc(v ? v.name : 'voix par défaut')}`; }).join(' · ') || '—'}</p>
          <p class="an-note">Une scène qui dure 30 % de plus que l'estimation est signalée : c'est souvent là que le texte traîne. La durée lue est ramenée à la vitesse normale ; les mesures sont gardées pour la prochaine fois.</p>
        </section>
      </div>
    `;
  },

  async partager() {
    if (this.reseau) return;
    const e = Atelier.ep();
    const r = await window.bureau.reseau('demarrer', { titre: e ? `${Ecriture._code(e)}${e.t ? ` — ${e.t}` : ''}` : '', lignes: this.lignes.map(l => ({ qui: l.qui || '', texte: l.texte })) });
    if (r?.error) { toast(r.error, 'error'); return; }
    this.reseau = r;
    window.bureau.reseau('position', { i: this.i });
    this.rendre();
  },

  async arreterPartage() {
    await window.bureau.reseau('arreter');
    this.reseau = null;
    this.rendre();
  },

  aller(k) {
    const reprendre = this.enCours;
    this.arreter();
    this.i = Math.max(0, Math.min(this.lignes.length - 1, Number(k) || 0));
    if (this.reseau) window.bureau.reseau('position', { i: this.i });
    this.rendre();
    if (reprendre) this.basculer();
  },

  recommencer() {
    this.arreter();
    this.i = 0;
    this.mesures = {};
    this.rendre();
  },

  basculer() {
    if (this.enCours) { this.arreter(); this.rendre(); return; }
    if (!('speechSynthesis' in window)) return;
    // Le navigateur charge ses voix après coup : au premier appel la liste peut être vide
    if (!speechSynthesis.getVoices().length && !this._attente) {
      this._attente = true;
      speechSynthesis.addEventListener('voiceschanged', () => this.basculer(), { once: true });
      setTimeout(() => { if (!this.enCours) this.basculer(); }, 800);
      return;
    }
    this.enCours = true;
    this._sceneDebut = { i: this.lignes[this.i]?.scene, t: performance.now() };
    this.rendre();
    this._suivante();
  },

  _suivante() {
    if (!this.enCours) return;
    const l = this.lignes[this.i];
    if (!l) { this._finScene(); this.arreter(); this.rendre(); this.surFin?.(); return; }
    if (l.scene !== this._sceneDebut.i) { this._finScene(); this._sceneDebut = { i: l.scene, t: performance.now() }; }
    document.querySelectorAll('.lec-l.actif').forEach(p => p.classList.remove('actif'));
    const p = document.querySelector(`.lec-l[data-k="${this.i}"]`);
    if (p) { p.classList.add('actif'); p.scrollIntoView({ block: 'nearest' }); }
    if (!l.qui && !this.didascalies) { this.i++; this._suivante(); return; }
    this.surLigne?.(l);
    if (this.reseau) window.bureau.reseau('position', { i: this.i });
    const u = new SpeechSynthesisUtterance(l.texte);
    const { voix, hauteur } = this._pour(l.qui);
    if (voix) { u.voice = voix; u.lang = voix.lang; }
    u.pitch = l.qui ? hauteur : 1;
    u.rate = this.vitesse * (l.qui ? 1 : 1.1);
    u.onend = () => { if (!this.enCours) return; this.i++; this._suivante(); };
    u.onerror = u.onend;
    speechSynthesis.speak(u);
  },

  // Le temps passé sur une scène, ramené à la vitesse normale
  _finScene() {
    if (!this._sceneDebut || this._sceneDebut.i === undefined) return;
    const t = (performance.now() - this._sceneDebut.t) / 1000 * this.vitesse;
    this.mesures[this._sceneDebut.i] = (this.mesures[this._sceneDebut.i] || 0) + t;
    const e = Atelier.ep();
    if (e) Ecriture.noterPlusTard(`lecture:${e.id}`, JSON.stringify({ date: new Date().toISOString().slice(0, 10), scenes: this.mesures }));
  },

  arreter() {
    if (this.enCours) this._finScene();
    this.enCours = false;
    this._sceneDebut = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  },
};

// ─── Versions comparées : deux états du même texte côte à côte ─────────────

const Versions = {
  liste: [],
  images: null,
  k: 0,
  minuteur: null,

  // ─── Le chutier : les scènes coupées de toute la série, gardées dans les versions, à retrouver ou reprendre ───

  async chutier() {
    const slot = Atelier.slot();
    if (!slot) return;
    slot.innerHTML = '<p class="an-note">Recherche des scènes coupées…</p>';
    this.chute = (await api.get('chutier')).scenes || [];
    this.chuteQ = '';
    this.rendreChutier();
  },

  rendreChutier() {
    const slot = Atelier.slot();
    if (!slot || !this.chute) return;
    const plat = t => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const q = plat(this.chuteQ || '');
    const liste = q ? this.chute.filter(c => plat(`${c.slug} ${c.texte} ${c.code}`).includes(q)) : this.chute;
    slot.innerHTML = `
      <div class="an-ligne ver-barre"><input id="chute-q" class="an-recherche" type="text" placeholder="Chercher une scène coupée…" aria-label="Chercher dans le chutier" value="${esc(this.chuteQ || '')}" oninput="Versions.chuteQ = this.value; Versions.rendreChutier(); document.getElementById('chute-q').focus()">
        <span class="an-note">${liste.length} scène(s) sur ${this.chute.length}</span>
        <button type="button" class="btn btn-ghost btn-sm" onclick="Versions.chute = null; Versions.rendre()">Comparer deux versions</button></div>
      <p class="an-note">Les scènes qui ne sont plus dans le script ni dans le brouillon, retrouvées dans les versions gardées de toute la série. « Copier » met la scène dans le presse-papiers, pour la recoller où tu veux.</p>
      ${liste.length ? liste.slice(0, 200).map((c, i) => `<details class="an-carte chute"><summary><strong class="vo-brut">${esc(c.slug)}</strong> · ${esc(c.code)} ${esc(c.titre || '')} <span class="an-note">${c.mots} mots · version du ${esc(c.version)}</span></summary>
        <pre class="chute-texte vo-brut">${esc(c.texte)}</pre><button type="button" class="btn btn-ghost btn-sm" onclick="navigator.clipboard?.writeText(Versions.chute[${this.chute.indexOf(c)}].texte).then(() => toast('Scène copiée', 'success'))">Copier</button></details>`).join('') : '<section class="an-carte"><p class="an-note">Aucune scène coupée : tout ce qui a été écrit est encore là (ou n\'a pas été gardé dans une version).</p></section>'}`;
  },

  // ─── Le film de l'écriture : chaque version gardée devient une image, on voit les scènes naître, changer, partir ───

  async film() {
    const slot = Atelier.slot();
    if (!slot) return;
    slot.innerHTML = '<p class="an-note">Les versions se chargent…</p>';
    const anciennes = [...this.liste].sort((x, y) => x.id - y.id);
    const images = [];
    for (const v of anciennes) images.push({ titre: `${v.cree_le}${v.motif ? ` · ${v.motif}` : ''}`, texte: await this._texte(`v${v.id}`) });
    images.push({ titre: 'Script validé', texte: this.textes.script });
    if (!this.sansBrouillon) images.push({ titre: 'Brouillon en cours', texte: this.textes.brouillon });
    this.images = images.filter(i => i.texte.trim()).map(i => ({ ...i, scenes: Ecriture._scenesEmpreintes(i.texte), mots: (i.texte.match(/\S+/g) || []).length }));
    this.k = 0;
    this.rendreFilm();
  },

  rendreFilm() {
    const slot = Atelier.slot();
    const im = this.images;
    if (!slot || !im) return;
    if (im.length < 2) { slot.innerHTML = '<section class="an-carte"><p class="an-note">Il faut au moins deux versions pour rejouer l\'écriture.</p><button type="button" class="btn btn-ghost btn-sm" onclick="Versions.quitterFilm()">Retour</button></section>'; return; }
    const ici = im[this.k];
    const avant = this.k ? im[this.k - 1] : null;
    const titresAvant = new Map((avant?.scenes || []).map(s => [s.titre, s.h]));
    const empreintesAvant = new Set((avant?.scenes || []).map(s => s.h));
    const titresIci = new Set(ici.scenes.map(s => s.titre));
    const etat = s => (!avant ? '' : empreintesAvant.has(s.h) ? '' : titresAvant.has(s.titre) ? 'changee' : 'nouvelle');
    const parties = avant ? avant.scenes.filter(s => !titresIci.has(s.titre) && !ici.scenes.some(x => x.h === s.h)) : [];
    const max = Math.max(...im.map(i => i.mots), 1);
    slot.innerHTML = `
      <div class="an-ligne ver-barre">
        <button type="button" class="btn btn-primary btn-sm" onclick="Versions.lecture()">${this.minuteur ? '❚❚ Pause' : '▶ Lecture'}</button>
        <input type="range" min="0" max="${im.length - 1}" value="${this.k}" aria-label="Version" oninput="Versions.aller(Number(this.value))" class="film-curseur">
        <span class="an-note">${this.k + 1} / ${im.length} · ${esc(ici.titre)}</span>
        <button type="button" class="btn btn-ghost btn-sm" onclick="Versions.quitterFilm()">Comparer deux versions</button>
      </div>
      <div class="film-mots" role="img" aria-label="Nombre de mots à chaque version">${im.map((x, k) => `<span class="${k === this.k ? 'actif' : ''}" style="height:${Math.round((x.mots * 100) / max)}%" title="${esc(x.titre)} : ${x.mots} mots" onclick="Versions.aller(${k})"></span>`).join('')}</div>
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">${ici.scenes.length} scène(s) · ${Analyse._fr(ici.mots)} mots</h2>
          <span class="an-note">${avant ? `<span class="ver-ajout">nouvelle</span> · <span class="ver-deplace">réécrite</span> · <span class="ver-coupe">partie</span>` : 'La première version gardée'}</span></div>
        <ol class="film-scenes">${ici.scenes.map(s => `<li class="${etat(s)}">${esc(s.titre)}</li>`).join('')}${parties.map(s => `<li class="partie">${esc(s.titre)}</li>`).join('')}</ol>
      </section>`;
  },

  aller(k) {
    this.k = Math.max(0, Math.min((this.images?.length || 1) - 1, k));
    this.rendreFilm();
  },

  lecture() {
    if (this.minuteur) { clearInterval(this.minuteur); this.minuteur = null; this.rendreFilm(); return; }
    if (this.k >= this.images.length - 1) this.k = 0;
    this.minuteur = setInterval(() => {
      if (!Atelier.slot() || !this.images) { clearInterval(this.minuteur); this.minuteur = null; return; }
      if (this.k >= this.images.length - 1) { clearInterval(this.minuteur); this.minuteur = null; this.rendreFilm(); return; }
      this.aller(this.k + 1);
    }, 1600);
    this.rendreFilm();
  },

  quitterFilm() {
    clearInterval(this.minuteur);
    this.minuteur = null;
    this.images = null;
    this.rendre();
  },

  a: 'script',
  b: 'brouillon',
  textes: {},

  async ouvrir() {
    const e = Atelier.ep();
    if (!e) return;
    const [liste, fiche] = await Promise.all([api.get(`ecriture_versions&episode=${e.id}`), api.get(`episodes/${e.id}`)]);
    this.liste = Array.isArray(liste) ? liste : [];
    this.textes = { script: fiche.texte_episode || '', brouillon: Ecriture.notes[`brouillon:${e.id}`] || '' };
    // Sans brouillon, on compare le script à la dernière version gardée
    this.sansBrouillon = !this.textes.brouillon.trim();
    if (this.sansBrouillon && this.b === 'brouillon') this.b = this.liste[0] ? `v${this.liste[0].id}` : 'script';
    if (this.sansBrouillon && this.a === 'brouillon') this.a = 'script';
    await this.rendre();
  },

  async _texte(cle) {
    if (cle in this.textes) return this.textes[cle];
    const v = await api.get(`ecriture_versions&id=${cle.slice(1)}`);
    this.textes[cle] = v.texte || '';
    return this.textes[cle];
  },

  // Différence ligne à ligne ; une ligne coupée ici et ajoutée là, identique, a été déplacée
  comparer(avant, apres) {
    const a = avant.replace(/\r/g, '').split('\n'), b = apres.replace(/\r/g, '').split('\n');
    const n = a.length, m = b.length;
    if (n * m > 4000000) return [...a.map(t => ({ s: '-', t })), ...b.map(t => ({ s: '+', t }))];
    const t = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    const ops = [];
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) { ops.push({ s: '=', t: a[i] }); i++; j++; }
      else if (j < m && (i === n || t[i][j + 1] >= t[i + 1][j])) ops.push({ s: '+', t: b[j++] });
      else ops.push({ s: '-', t: a[i++] });
    }
    const retirees = new Map();
    ops.forEach((o, k) => { if (o.s === '-' && o.t.trim()) retirees.set(o.t.trim(), [...(retirees.get(o.t.trim()) || []), k]); });
    ops.forEach(o => {
      if (o.s !== '+' || !o.t.trim()) return;
      const k = retirees.get(o.t.trim())?.shift();
      if (k !== undefined) { o.s = '>'; ops[k].s = '<'; }
    });
    return ops;
  },

  async rendre() {
    const slot = Atelier.slot();
    if (!slot) return;
    const choix = [['script', 'Script validé'], ...(this.sansBrouillon ? [] : [['brouillon', 'Brouillon en cours']]), ...this.liste.map(v => [`v${v.id}`, `${v.cree_le}${v.motif ? ` · ${v.motif}` : ''}`])];
    if (choix.length < 2) {
      slot.innerHTML = '<section class="an-carte"><p class="an-note">Une seule version pour l\'instant : le script validé. Ouvre le Brouillon et garde une version, ou commence à réécrire, pour avoir de quoi comparer.</p></section>';
      return;
    }
    const [ta, tb] = await Promise.all([this._texte(this.a), this._texte(this.b)]);
    const ops = this.comparer(ta, tb);
    const nb = s => ops.filter(o => o.s === s && o.t.trim()).length;
    const mots = s => ops.filter(o => o.s === s).reduce((x, o) => x + (o.t.match(/\S+/g) || []).length, 0);
    const gauche = ops.filter(o => o.s !== '+' && o.s !== '>');
    const droite = ops.filter(o => o.s !== '-' && o.s !== '<');
    const classe = { '-': 'ver-coupe', '+': 'ver-ajout', '<': 'ver-deplace', '>': 'ver-deplace', '=': '' };
    const select = (id, valeur) => `<select id="${id}" onchange="Versions.${id === 'ver-a' ? 'a' : 'b'} = this.value; Versions.rendre()">${choix.map(([v, l]) => `<option value="${esc(v)}" ${v === valeur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    slot.innerHTML = `
      <div class="an-ligne ver-barre"><label class="an-label" for="ver-a">Avant</label>${select('ver-a', this.a)}<label class="an-label" for="ver-b">Après</label>${select('ver-b', this.b)}
        <button type="button" class="btn btn-secondary btn-sm" onclick="Versions.film()">▶ Rejouer l'écriture</button>
        <button type="button" class="btn btn-secondary btn-sm" onclick="Versions.chutier()">Chutier</button></div>
      <p class="an-note"><span class="ver-ajout">${nb('+')} ligne(s) ajoutée(s) (+${mots('+')} mots)</span> · <span class="ver-coupe">${nb('-')} coupée(s) (−${mots('-')} mots)</span> · <span class="ver-deplace">${nb('>')} déplacée(s)</span>. Les versions viennent du Brouillon (« Garder une version ») ; le script validé est celui qu'analyse l'app.</p>
      <div class="ver-cote">
        <section class="an-carte"><h2 class="an-titre">Avant</h2><div class="ver-texte">${gauche.map(o => `<div class="${classe[o.s]}">${esc(o.t) || '&nbsp;'}</div>`).join('')}</div></section>
        <section class="an-carte"><h2 class="an-titre">Après</h2><div class="ver-texte">${droite.map(o => `<div class="${classe[o.s]}">${esc(o.t) || '&nbsp;'}</div>`).join('')}</div></section>
      </div>
    `;
  },
};

// ─── Arc des personnages ───────────────────────────────────────────────────

const Arcs = {
  perso: null,

  _note(nom) {
    return objetNote(Ecriture.notes[`arc:${nom}`]);
  },

  _noms() {
    const compte = new Map();
    Ecriture.ensemble().forEach(e => e._noms.forEach((v, n) => compte.set(n, (compte.get(n) || 0) + v)));
    return [...compte.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 20);
  },

  rendre() {
    const slot = Atelier.slot();
    if (!slot) return;
    const noms = this._noms();
    if (!noms.length) { slot.innerHTML = '<section class="an-carte"><p class="an-note">Aucun personnage dans ce choix.</p></section>'; return; }
    if (!noms.includes(this.perso)) this.perso = noms[0];
    const nom = this.perso;
    const note = this._note(nom);
    // Chaque scène où le personnage parle, dans l'ordre de l'œuvre
    const scenes = Ecriture.ensemble().flatMap(e => e._scenes.map((set, k) => ({ e, k, la: set.has(nom), lieu: Ecriture._decor ? Ecriture._decor(e.sc[k][2]) : '' })).filter(x => x.la));
    let cumul = 0;
    const points = [];
    scenes.forEach((x, idx) => {
      const a = note[`${x.e.id}:${x.k}`];
      if (a && Number.isFinite(a.s)) { cumul += a.s; points.push([idx, cumul]); }
    });
    const notees = scenes.filter(x => note[`${x.e.id}:${x.k}`]);
    // Ce qui mérite un regard : un personnage qui stagne, un objectif qui change
    const alertes = [];
    let plat = 0;
    let avant = null;
    notees.forEach(x => {
      const a = note[`${x.e.id}:${x.k}`];
      plat = a.s === 0 ? plat + 1 : 0;
      if (plat === 5) alertes.push(`Stagne depuis cinq scènes (jusqu'à ${Ecriture._code(x.e)}) : rien ne le fait avancer ni reculer.`);
      if (avant && a.v && avant.v && a.v.trim().toLowerCase() !== avant.v.trim().toLowerCase()) alertes.push(`En ${Ecriture._code(x.e)}, il ne veut plus « ${avant.v} » mais « ${a.v} » : qu'est-ce qui l'a fait changer ?`);
      if (a.v) avant = a;
    });
    const min = Math.min(0, ...points.map(p => p[1])), max = Math.max(1, ...points.map(p => p[1]));
    const X = i => 20 + (660 * i) / Math.max(1, scenes.length - 1);
    const Y = v => 150 - (130 * (v - min)) / ((max - min) || 1);
    slot.innerHTML = `
      <div class="an-ligne"><label class="an-label" for="arc-perso">Personnage</label><select id="arc-perso" onchange="Arcs.perso = this.value; Arcs.rendre()">${noms.map(n => `<option ${n === nom ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
        <span class="an-note">${notees.length} scène(s) notée(s) sur ${scenes.length}</span></div>
      <section class="an-carte">
        <h2 class="an-titre">La courbe de ${esc(nom)}</h2>
        ${points.length > 1 ? `<svg class="arc-courbe" viewBox="0 0 700 170" role="img" aria-label="Courbe de ${esc(nom)}"><line x1="20" x2="680" y1="${Y(0)}" y2="${Y(0)}" class="arc-zero"/><polyline points="${points.map(([i, v]) => `${X(i)},${Y(v)}`).join(' ')}"/>${points.map(([i, v]) => `<circle cx="${X(i)}" cy="${Y(v)}" r="4"/>`).join('')}</svg>` : '<p class="an-note">Note au moins deux scènes pour voir la courbe.</p>'}
        <p class="an-note">Chaque ▲ le fait monter, chaque ▼ descendre : la courbe montre s'il avance vers ce qu'il veut ou s'en éloigne.</p>
      </section>
      ${alertes.length ? `<section class="an-carte"><h2 class="an-titre">À regarder</h2><ul class="ec-liste">${alertes.map(a => `<li class="ec-orange"><span class="vo-brut">${esc(a)}</span></li>`).join('')}</ul></section>` : ''}
      <section class="an-carte">
        <h2 class="an-titre">Scène par scène</h2>
        <div class="an-table"><table class="arc-table">
          <thead><tr><th scope="col">Où</th><th scope="col">Ce qu'il veut</th><th scope="col">Il…</th></tr></thead>
          <tbody>${scenes.map(x => {
            const cle = `${x.e.id}:${x.k}`, a = note[cle] || {};
            const bouton = (s, l, titre) => `<button type="button" class="arc-sens ${a.s === s ? 'actif' : ''}" aria-pressed="${a.s === s}" title="${titre}" onclick="Arcs.noter('${cle}', 's', ${s})">${l}</button>`;
            return `<tr><td>${Ecriture._lien(esc(Ecriture._code(x.e)), 'ouvrirEpisode', x.e.id)} · sc. ${x.k + 1}<br><small class="an-note vo-brut">${esc(x.lieu || '')}</small></td>
              <td><input type="text" maxlength="120" aria-label="Ce que veut ${esc(nom)}" value="${esc(a.v || '')}" placeholder="${esc(avant?.v || 'ce qu\'il veut ici')}" onchange="Arcs.noter('${cle}', 'v', this.value)"></td>
              <td class="arc-boutons">${bouton(1, '▲', 'avance')}${bouton(0, '●', 'piétine')}${bouton(-1, '▼', 'recule')}</td></tr>`;
          }).join('')}</tbody>
        </table></div>
      </section>
    `;
  },

  noter(cle, champ, valeur) {
    const note = this._note(this.perso);
    note[cle] = { ...(note[cle] || {}), [champ]: champ === 's' ? Number(valeur) : String(valeur).slice(0, 120) };
    Ecriture.noterPlusTard(`arc:${this.perso}`, JSON.stringify(note));
    this.rendre();
  },
};

// ─── Continuité ────────────────────────────────────────────────────────────

const Continuite = {
  data: null,

  async ouvrir() {
    this.data = await api.get('ecriture_continuite');
    this.rendre();
  },

  rendre() {
    const slot = Atelier.slot();
    if (!slot || !this.data) return;
    const types = [...new Set(this.data.alertes.map(a => a.type))];
    const morts = this.data.morts || {};
    const ep = id => Ecriture.ordre[Ecriture.rang.get(Number(id))];
    slot.innerHTML = `
      <section class="an-carte">
        <div class="an-entete"><h2 class="an-titre">Continuité</h2><span class="an-note">${this.data.alertes.length} point(s) à vérifier</span></div>
        <p class="an-note">L'app compare le texte et les fiches : un nom écrit de deux façons, un personnage mort qui reparle, un âge qui ne colle pas avec les dates, une date qui recule sans flashback. Un point écarté ne revient plus.</p>
      </section>
      ${types.map(t => `<section class="an-carte"><h2 class="an-titre">${esc(t)}</h2><ul class="ec-liste">${this.data.alertes.filter(a => a.type === t).map(a => {
        const e = a.episode ? ep(a.episode) : null;
        return `<li><span class="vo-brut">${esc(a.texte)}${e ? ` <span class="an-note">(${esc(Ecriture._code(e))})</span>` : ''}</span><span class="an-ligne">${e ? Ecriture._lien('Ouvrir', 'ouvrirEpisode', e.id) : ''}<button type="button" class="ec-lien" onclick="Continuite.ecarter(${esc(JSON.stringify(a.cle))})">Écarter</button></span></li>`;
      }).join('')}</ul></section>`).join('') || '<section class="an-carte"><p class="an-note">Rien à signaler.</p></section>'}
      <section class="an-carte">
        <h2 class="an-titre">Morts</h2>
        <p class="an-note">Indique quand un personnage meurt : l'app signalera s'il reparle après, hors flashback.</p>
        <ul class="ec-liste">${Object.entries(morts).map(([n, id]) => `<li><span class="vo-brut">${esc(n)} · ${esc(ep(id) ? Ecriture._code(ep(id)) : '?')}</span><button type="button" class="ec-lien" onclick="Continuite.mort(${esc(JSON.stringify(n))}, '')">Retirer</button></li>`).join('') || '<li class="an-note">Personne pour l\'instant.</li>'}</ul>
        <div class="an-ligne">
          <select id="ct-perso" aria-label="Personnage">${this.data.personnages.slice(0, 200).map(n => `<option>${esc(n)}</option>`).join('')}</select>
          <select id="ct-ep" aria-label="Épisode de la mort">${Ecriture.ordre.map(e => `<option value="${e.id}">${esc(Ecriture._code(e))} ${esc(e.t || '')}</option>`).join('')}</select>
          <button type="button" class="btn btn-secondary btn-sm" onclick="Continuite.mort(document.getElementById('ct-perso').value, document.getElementById('ct-ep').value)">Marquer mort ici</button>
        </div>
      </section>
    `;
  },

  async ecarter(cle) {
    const liste = (() => { try { const v = JSON.parse(Ecriture.notes['continuite-ignores'] || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } })();
    liste.push(cle);
    await Ecriture.note('continuite-ignores', JSON.stringify(liste));
    await this.ouvrir();
  },

  async mort(nom, id) {
    const morts = objetNote(Ecriture.notes['continuite-morts']);
    if (id) morts[nom] = Number(id);
    else delete morts[nom];
    await Ecriture.note('continuite-morts', JSON.stringify(morts));
    await this.ouvrir();
  },
};

// ─── Budget approximatif d'un film ─────────────────────────────────────────

const BUDGET_DEFAUT = {
  long: { equipe: 12000, materiel: 3000, cachet: 450, decor: 1500, nuit: 25, post: 90000, imprevus: 10 },
  court: { equipe: 2500, materiel: 800, cachet: 150, decor: 300, nuit: 20, post: 6000, imprevus: 10 },
};

const Budget = {
  _taux() {
    const base = BUDGET_DEFAUT[Roman.forme === 'court' ? 'court' : 'long'];
    const n = objetNote(Ecriture.notes.budget);
    return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Number.isFinite(Number(n[k])) && n[k] !== '' ? Math.max(0, Number(n[k])) : v]));
  },

  async rendre() {
    const slot = Atelier.slot();
    if (!slot) return;
    if (!Ecriture.film) Ecriture.film = await api.get('ecriture_film');
    if (!Ecriture.film.length) { slot.innerHTML = '<section class="an-carte"><p class="an-note">Importe d\'abord le scénario.</p></section>'; return; }
    const t = this._taux();
    const { jours } = Ecriture._joursTravail();
    const comediens = jours.reduce((s, j) => s + new Set(j.blocs.flatMap(b => [...b.g.persos])).size, 0);
    const decors = jours.reduce((s, j) => s + new Set(j.blocs.map(b => b.g.decor)).size, 0);
    const nuits = jours.filter(j => j.moment === 'NUIT').length;
    const lignes = [
      ['Équipe technique', `${jours.length} jour(s) × ${t.equipe.toLocaleString('fr-FR')} €`, jours.length * t.equipe],
      ['Matériel (caméra, lumière, son)', `${jours.length} jour(s) × ${t.materiel.toLocaleString('fr-FR')} €`, jours.length * t.materiel],
      ['Comédiens', `${comediens} cachet(s) × ${t.cachet.toLocaleString('fr-FR')} €`, comediens * t.cachet],
      ['Décors', `${decors} décor-jour(s) × ${t.decor.toLocaleString('fr-FR')} €`, decors * t.decor],
      ['Majoration de nuit', `${nuits} nuit(s) × ${t.nuit} % de l'équipe`, nuits * t.equipe * t.nuit / 100],
      ['Post-production', 'forfait', t.post],
    ];
    const sous = lignes.reduce((s, l) => s + l[2], 0);
    const imprevus = sous * t.imprevus / 100;
    const eur = v => `${Math.round(v).toLocaleString('fr-FR')} €`;
    const champ = (k, l, unite) => `<label class="mep-champ"><span class="an-label">${l}</span><input type="number" min="0" step="any" value="${t[k]}" onchange="Budget.regler('${k}', this.value)"><small class="an-note">${unite}</small></label>`;
    slot.innerHTML = `
      <div class="ec-dep-grille">
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre">Ordre de grandeur</h2><strong>${eur(sous + imprevus)}</strong></div>
          <div class="an-table"><table>
            <tbody>${lignes.map(([l, d, v]) => `<tr><td>${l}</td><td class="an-note">${d}</td><td>${eur(v)}</td></tr>`).join('')}
              <tr><td>Imprévus</td><td class="an-note">${t.imprevus} %</td><td>${eur(imprevus)}</td></tr></tbody>
          </table></div>
          <p class="an-note">Tiré du plan de travail : ${jours.length} jour(s) de tournage, ${nuits} de nuit. C'est un ordre de grandeur pour situer le projet, pas un devis : les taux se règlent à côté, à voir avec ta production.</p>
        </section>
        <section class="an-carte">
          <h2 class="an-titre">Taux</h2>
          <div class="mep-grille">
            ${champ('equipe', 'Équipe par jour', '€')}${champ('materiel', 'Matériel par jour', '€')}${champ('cachet', 'Cachet d\'un comédien par jour', '€')}
            ${champ('decor', 'Décor par jour', '€')}${champ('nuit', 'Majoration de nuit', '% de l\'équipe')}${champ('post', 'Post-production', '€, forfait')}${champ('imprevus', 'Imprévus', '%')}
          </div>
          <button type="button" class="ec-lien" onclick="Budget.defaut()">Revenir aux taux par défaut</button>
        </section>
      </div>
    `;
  },

  regler(k, v) {
    const n = objetNote(Ecriture.notes.budget);
    n[k] = Math.max(0, Number(v) || 0);
    Ecriture.noterPlusTard('budget', JSON.stringify(n));
    this.rendre();
  },

  defaut() {
    Ecriture.noterPlusTard('budget', '');
    Ecriture.notes.budget = '';
    this.rendre();
  },
};

// ─── Le prompteur : le texte défile en grand, à la vitesse choisie (lecture à voix haute, voix témoin) ───
const Prompteur = {
  vitesse: 40,
  taille: 44,
  miroir: false,
  enCours: false,

  depuisTexte(texte, titre) {
    let qui = null;
    const lignes = [];
    Ecriture.classerLignes(texte).forEach(l => {
      const t = l.ligne.trim();
      if (l.type === 'vide' || l.type === 'note' || !t) { if (l.type === 'vide') qui = null; return; }
      if (l.type === 'perso') { qui = t.replace(/\s*\(.*\)$/, ''); return; }
      lignes.push({ type: l.type, qui: l.type === 'dialogue' || l.type === 'parenthese' ? qui : null, texte: t });
    });
    this.ouvrir(lignes, titre);
  },

  ouvrir(lignes, titre = '') {
    if (!lignes.length) { toast('Rien à faire défiler.', 'info'); return; }
    this.fermer();
    try { Object.assign(this, JSON.parse(localStorage.getItem('prompteur') || '{}')); } catch (e) { /* réglages par défaut */ }
    const fond = document.createElement('div');
    fond.id = 'prompteur';
    fond.className = 'prompteur';
    fond.setAttribute('role', 'dialog');
    fond.setAttribute('aria-label', 'Prompteur');
    let precedent = null;
    fond.innerHTML = `<div class="prompteur-barre">
        <button type="button" data-a="lire">▶</button><button type="button" data-a="debut" title="Revenir au début">⟲</button>
        <span>Vitesse</span><button type="button" data-a="lent">−</button><b id="pr-vitesse"></b><button type="button" data-a="vite">+</button>
        <span>Taille</span><button type="button" data-a="petit">A−</button><button type="button" data-a="grand">A+</button>
        <button type="button" data-a="miroir" title="Texte inversé, pour une vitre de prompteur">Miroir</button>
        <span class="prompteur-aide">Espace : lire/pause · ↑↓ : vitesse · Échap : fermer</span>
        <button type="button" data-a="fermer">Fermer</button></div>
      <div class="prompteur-defile"><div class="prompteur-texte">${titre ? `<h1>${esc(titre)}</h1>` : ''}${lignes.map(l => {
        const nom = l.qui && l.qui !== precedent ? `<p class="pr-qui">${esc(l.qui)}</p>` : '';
        precedent = l.qui || null;
        return `${nom}<p class="pr-${esc(l.type)}">${esc(l.texte)}</p>`;
      }).join('')}<p class="pr-fin">— fin —</p></div></div>`;
    document.body.appendChild(fond);
    fond.querySelector('.prompteur-barre').addEventListener('click', e => { const a = e.target.closest('button')?.dataset.a; if (a) this.action(a); });
    this._touches = e => {
      if (e.key === 'Escape') { e.preventDefault(); this.fermer(); }
      else if (e.key === ' ') { e.preventDefault(); this.action('lire'); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.action('vite'); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); this.action('lent'); }
    };
    document.addEventListener('keydown', this._touches, true);
    this._appliquer();
  },

  action(a) {
    const zone = document.querySelector('.prompteur-defile');
    if (a === 'lire') this.enCours ? this._pause() : this._lire();
    if (a === 'debut' && zone) zone.scrollTop = 0;
    if (a === 'vite') this.vitesse = Math.min(400, this.vitesse + 10);
    if (a === 'lent') this.vitesse = Math.max(10, this.vitesse - 10);
    if (a === 'grand') this.taille = Math.min(96, this.taille + 6);
    if (a === 'petit') this.taille = Math.max(20, this.taille - 6);
    if (a === 'miroir') this.miroir = !this.miroir;
    if (a === 'fermer') { this.fermer(); return; }
    try { localStorage.setItem('prompteur', JSON.stringify({ vitesse: this.vitesse, taille: this.taille, miroir: this.miroir })); } catch (e) { /* rien */ }
    this._appliquer();
  },

  _appliquer() {
    const f = document.getElementById('prompteur');
    if (!f) return;
    f.style.setProperty('--pr-taille', `${this.taille}px`);
    f.classList.toggle('miroir', this.miroir);
    f.querySelector('#pr-vitesse').textContent = this.vitesse;
    f.querySelector('[data-a="lire"]').textContent = this.enCours ? '❚❚' : '▶';
  },

  _lire() {
    this.enCours = true;
    let t0 = performance.now();
    let reste = 0;
    const pas = t => {
      if (!this.enCours) return;
      const zone = document.querySelector('.prompteur-defile');
      if (!zone) { this.enCours = false; return; }
      reste += (this.vitesse * (t - t0)) / 1000;
      t0 = t;
      if (reste >= 1) { zone.scrollTop += Math.floor(reste); reste -= Math.floor(reste); }
      if (zone.scrollTop + zone.clientHeight >= zone.scrollHeight - 1) { this._pause(); return; }
      this._raf = requestAnimationFrame(pas);
    };
    this._raf = requestAnimationFrame(pas);
    this._appliquer();
  },

  _pause() {
    this.enCours = false;
    cancelAnimationFrame(this._raf);
    this._appliquer();
  },

  fermer() {
    this._pause();
    document.getElementById('prompteur')?.remove();
    if (this._touches) document.removeEventListener('keydown', this._touches, true);
    this._touches = null;
  },
};

// ─── Le bruit de fond du mode concentration : pluie, bruit brun ou rumeur, fabriqués sur place (aucun fichier) ───
const Ambiance = {
  SONS: [['', '♪ Silence'], ['pluie', '♪ Pluie'], ['brun', '♪ Bruit brun'], ['rumeur', '♪ Rumeur']],
  actuel: '',
  ctx: null,
  noeuds: [],

  libelle() {
    return (this.SONS.find(s => s[0] === this.actuel) || this.SONS[0])[1];
  },

  suivante() {
    const i = this.SONS.findIndex(s => s[0] === this.actuel);
    this.jouer(this.SONS[(i + 1) % this.SONS.length][0]);
  },

  _bruit(type) {
    const ctx = this.ctx;
    const n = ctx.sampleRate * 4;
    const tampon = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = tampon.getChannelData(c);
      let dernier = 0;
      for (let i = 0; i < n; i++) {
        const blanc = Math.random() * 2 - 1;
        if (type === 'brun') { dernier = (dernier + 0.02 * blanc) / 1.02; d[i] = dernier * 3.5; } else d[i] = blanc;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = tampon;
    src.loop = true;
    return src;
  },

  jouer(son) {
    this.arreter(false);
    this.actuel = son;
    const b = document.getElementById('ec-ambiance');
    if (b) b.textContent = this.libelle();
    if (!son) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { toast('Le son n\'est pas disponible ici.', 'info'); return; }
    this.ctx = this.ctx || new AC();
    this.ctx.resume?.();
    const ctx = this.ctx;
    const volume = ctx.createGain();
    volume.gain.value = 0;
    volume.gain.linearRampToValueAtTime({ pluie: 0.22, brun: 0.35, rumeur: 0.18 }[son], ctx.currentTime + 1.5);
    volume.connect(ctx.destination);
    const src = this._bruit(son === 'brun' ? 'brun' : 'blanc');
    let chaine = src;
    if (son === 'pluie') {
      // Un bruit blanc filtré, avec de petites variations : une averse régulière
      const passeHaut = ctx.createBiquadFilter(); passeHaut.type = 'highpass'; passeHaut.frequency.value = 900;
      const passeBas = ctx.createBiquadFilter(); passeBas.type = 'lowpass'; passeBas.frequency.value = 7000;
      chaine.connect(passeHaut); passeHaut.connect(passeBas); chaine = passeBas;
      this.noeuds.push(passeHaut, passeBas);
    } else if (son === 'rumeur') {
      // Une bande de fréquences de la voix, qui monte et descend lentement : une salle de café au loin
      const bande = ctx.createBiquadFilter(); bande.type = 'bandpass'; bande.frequency.value = 450; bande.Q.value = 0.9;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
      const profondeur = ctx.createGain(); profondeur.gain.value = 160;
      lfo.connect(profondeur); profondeur.connect(bande.frequency); lfo.start();
      chaine.connect(bande); chaine = bande;
      this.noeuds.push(bande, lfo, profondeur);
    }
    chaine.connect(volume);
    src.start();
    this.noeuds.push(src, volume);
  },

  arreter(remettre = true) {
    for (const n of this.noeuds) { try { n.stop?.(); } catch (e) { /* déjà arrêté */ } try { n.disconnect(); } catch (e) { /* rien */ } }
    this.noeuds = [];
    if (remettre) {
      this.actuel = '';
      const b = document.getElementById('ec-ambiance');
      if (b) b.textContent = this.libelle();
    }
  },
};

// ─── Le sprint : 25 minutes d'écriture chronométrées, et les mots gagnés pendant la séance ───
const Sprint = {
  fin: 0,
  depart: 0,
  minuteur: null,
  minutes: 25,

  _mots() {
    return ((document.getElementById('ec-brouillon')?.value || '').match(/\S+/g) || []).length;
  },

  basculer() {
    if (this.minuteur) { this.terminer(true); return; }
    this.depart = this._mots();
    this.debut = Date.now();
    this.fin = this.debut + this.minutes * 60000;
    this.minuteur = setInterval(() => this._tic(), 1000);
    this._tic();
  },

  _tic() {
    const reste = Math.max(0, this.fin - Date.now());
    const b = document.getElementById('ec-sprint');
    const gagnes = Math.max(0, this._mots() - this.depart);
    if (b) b.textContent = `⏱ ${Math.floor(reste / 60000)}:${String(Math.floor((reste % 60000) / 1000)).padStart(2, '0')} · +${gagnes} mots`;
    if (!reste) this.terminer(false);
  },

  terminer(interrompu) {
    clearInterval(this.minuteur);
    this.minuteur = null;
    const minutes = Math.round((Date.now() - this.debut) / 60000);
    const mots = Math.max(0, this._mots() - this.depart);
    const b = document.getElementById('ec-sprint');
    if (b) b.textContent = '⏱ Sprint';
    if (minutes < 1) return;
    let liste = [];
    try { liste = JSON.parse(Ecriture.notes?.sprints || '[]'); } catch (e) { liste = []; }
    liste = [...(Array.isArray(liste) ? liste : []), { date: new Date().toISOString(), minutes, mots }].slice(-200);
    Ecriture.note('sprints', JSON.stringify(liste)).catch(() => {});
    toast(`${interrompu ? 'Sprint arrêté' : 'Sprint terminé'} : ${mots} mots en ${minutes} min.`, 'success');
  },

  libelle() {
    return this.minuteur ? '⏱ …' : '⏱ Sprint';
  },
};
