// assets/js/storyboard.js — Le storyboard : chaque scène découpée en plans dessinés, ou chaque planche de BD en cases
'use strict';

const SB_VALEURS = [['PG', 'Plan général', 0.05], ['PE', 'Plan d\'ensemble', 0.08], ['PM', 'Plan moyen', 0.13], ['PA', 'Plan américain', 0.2], ['PR', 'Plan rapproché', 0.32], ['GP', 'Gros plan', 0.62], ['TGP', 'Très gros plan', 1.3], ['INS', 'Insert (objet)', 0]];
const SB_ANGLES = [['normal', 'À hauteur d\'œil'], ['plongee', 'Plongée'], ['contre', 'Contre-plongée'], ['subj', 'Subjectif'], ['epaule', 'Par-dessus l\'épaule'], ['zenith', 'Vue du dessus']];
const SB_MOUVEMENTS = [['fixe', 'Fixe', ''], ['pano', 'Panoramique', '↔ pano'], ['trav', 'Travelling avant', '→ trav. av.'], ['travarr', 'Travelling arrière', '← trav. arr.'], ['travlat', 'Travelling latéral', '⇢ trav. lat.'], ['zoom', 'Zoom', '⤢ zoom'], ['steady', 'Steadicam', '∿ steadicam'], ['epaule', 'Caméra à l\'épaule', '≈ épaule'], ['grue', 'Grue', '⤒ grue'], ['drone', 'Drone', '↟ drone']];
const SB_TRANSITIONS = [['cut', 'Cut'], ['fondu', 'Fondu au noir'], ['enchaine', 'Fondu enchaîné'], ['volet', 'Volet'], ['raccord', 'Raccord mouvement'], ['sonore', 'Raccord sonore']];
const SB_AXES = [['A', 'Côté A de l\'axe'], ['B', 'Côté B de l\'axe'], ['axe', 'Sur l\'axe (permet de changer de côté)']];
const SB_RATIOS = [['1.78', '16:9'], ['2.39', '2,39:1 (scope)'], ['1.85', '1,85:1'], ['1.33', '4:3'], ['1', 'Carré']];
// Le rapport hauteur / largeur d'une planche selon le format
// Le format imprimé d'une planche, en millimètres, et le corps de lettrage habituel
const SB_PAGE_MM = { fb: [240, 320], rg: [170, 240], manga: [128, 182], comics: [168, 260] };
const SB_CORPS = { fb: 3, rg: 2.8, manga: 2.4, comics: 2.8 };
const SB_PAGE = { fb: 1.36, rg: 1.42, manga: 1.45, comics: 1.54 };

const Storyboard = {
  ep: null,
  data: null,
  scene: null,
  sel: null,
  mode: 'grille',
  animI: 0,
  _lecture: null,
  _images: new Map(),
  _enregistrer: null,

  _note(cle, defaut) {
    return Ecriture.notes[cle] ?? defaut;
  },

  get ratio() {
    return Number(this._note('sb-ratio', '1.78')) || 1.78;
  },

  async ouvrir(e) {
    this.arreter();
    this.ep = e;
    const slot = document.getElementById('ec-sb');
    if (!e || !slot) return;
    [this.data, this.fiches] = await Promise.all([api.get(`ecriture_sb&episode_id=${e.id}`), api.get('ecriture_sb_fiches')]);
    this.data.sons = Array.isArray(this.data.sons) ? {} : this.data.sons || {};
    if (Ecriture.vue !== 'storyboard' || Ecriture.epId !== e.id) return;
    if (!this.data.scenes.some(s => s.i === this.scene)) this.scene = this.data.scenes[0]?.i ?? null;
    if (!this.data.scenes.length) {
      slot.innerHTML = '<section class="an-carte"><p class="an-note">Pas encore de script pour cet épisode : le storyboard se découpe à partir des scènes.</p></section>';
      return;
    }
    this.rendre();
  },

  rendre() {
    const slot = document.getElementById('ec-sb');
    if (!slot || !this.data) return;
    slot.innerHTML = Roman.bd ? this._vueBD() : this._vueFilm();
    if (Roman.bd) this._brancherGabarit();
    if (!Roman.bd && this.mode === 'sol') this._brancherSol();
  },

  _plansScene(i = this.scene) {
    return this.data.plans.filter(p => p.scene === i && !p.d.ref).sort((a, b) => a.ordre - b.ordre || a.id - b.id);
  },

  // Un roman n'a pas d'en-tête INT./EXT. : ses scènes se nomment par leur rang et leur lieu
  _nomScene(s) {
    if (!Roman.actif) return s.slug || 'Ouverture';
    const n = this.data.scenes.indexOf(s) + 1;
    return `Scène ${n}${s.lieu ? ` · ${s.lieu}` : ''}`;
  },

  _sceneCourante() {
    return this.data.scenes.find(s => s.i === this.scene);
  },

  _valeur(k) {
    return SB_VALEURS.find(v => v[0] === k) || SB_VALEURS[3];
  },

  _duree(s) {
    return `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')}`;
  },

  _url(p) {
    return `${API_BASE}ecriture_sb_image&id=${p.id}&v=${encodeURIComponent(p.image)}`;
  },

  // ─── Croquis : des têtes et des épaules à la taille que donne la valeur de plan ──

  _formes(d, w, h) {
    const v = this._valeur(d.valeur);
    const persos = (d.persos || []).slice(0, 4);
    const formes = [];
    const angle = d.angle || 'normal';
    const dy = angle === 'plongee' ? 0.1 : angle === 'contre' ? -0.1 : 0;
    formes.push({ t: 'horizon', y: h * (angle === 'zenith' ? -1 : 0.42 + dy * 2.2) });
    if (v[0] === 'INS') {
      formes.push({ t: 'objet', x: w * 0.3, y: h * 0.28, w: w * 0.4, h: h * 0.44 });
      return formes;
    }
    const n = Math.max(1, persos.length);
    const k = angle === 'contre' ? 1.1 : angle === 'plongee' ? 0.88 : 1;
    const s = v[2] * h * k * (n > 2 && v[2] > 0.3 ? 0.75 : 1);
    // Du plan général au plan moyen, on voit les personnages en pied
    const pied = ['PG', 'PE', 'PM'].includes(v[0]);
    persos.forEach((nom, i) => {
      const cx = w * (n === 1 ? (angle === 'epaule' ? 0.62 : 0.5) : 0.18 + (0.64 * i) / (n - 1));
      // En plan large, les pieds touchent le sol ; en plan serré, la tête reste au tiers haut
      const sol = h * (0.86 + dy);
      const tete = pied ? sol - s * 5.6 : h * (0.34 + dy) - s / 2 + (v[0] === 'TGP' ? s * 0.2 : 0);
      formes.push({ t: 'tete', x: cx, y: tete + s / 2, r: s / 2, nom });
      formes.push({ t: 'corps', x: cx - s * 0.85, y: tete + s * 1.05, w: s * 1.7, h: pied ? s * 2.3 : s * 2.6, r: s * 0.6 });
      if (pied) formes.push({ t: 'jambes', x: cx, y: tete + s * 3.35, l: s * 2.25, e: s * 0.35 });
    });
    if (angle === 'epaule') formes.push({ t: 'epaule', x: w * 0.02, y: h * 0.42, r: h * 0.36 });
    if (angle === 'subj') formes.push({ t: 'cache' });
    return formes;
  },

  croquisSVG(d, w = 320, h = Math.round(320 / this.ratio)) {
    const trait = 'stroke="var(--sb-trait)" fill="none" stroke-width="2"';
    const mvt = SB_MOUVEMENTS.find(m => m[0] === d.mvt)?.[2] || '';
    const formes = this._formes(d, w, h).map(f => ({
      horizon: () => (f.y > 0 ? `<line x1="0" y1="${f.y}" x2="${w}" y2="${f.y}" stroke="var(--sb-sol)" stroke-width="1"/>` : ''),
      objet: () => `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="6" ${trait}/><line x1="${f.x}" y1="${f.y}" x2="${f.x + f.w}" y2="${f.y + f.h}" stroke="var(--sb-sol)"/>`,
      tete: () => `<circle cx="${f.x}" cy="${f.y}" r="${f.r}" ${trait}/>${f.r > 6 ? `<text x="${f.x}" y="${f.y + Math.min(f.r * 0.35, 6)}" text-anchor="middle" font-size="${Math.max(8, Math.min(f.r * 0.7, 18))}" fill="var(--sb-sol)">${esc(String(f.nom).charAt(0))}</text>` : ''}`,
      corps: () => `<path d="M${f.x} ${f.y + f.h} V${f.y + f.r} Q${f.x} ${f.y} ${f.x + f.r} ${f.y} H${f.x + f.w - f.r} Q${f.x + f.w} ${f.y} ${f.x + f.w} ${f.y + f.r} V${f.y + f.h}" ${trait}/>`,
      jambes: () => `<path d="M${f.x - f.e} ${f.y} v${f.l} M${f.x + f.e} ${f.y} v${f.l}" ${trait}/>`,
      epaule: () => `<circle cx="${f.x}" cy="${f.y + f.r}" r="${f.r}" fill="var(--sb-ombre)"/>`,
      cache: () => `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="${h / 2}" fill="none" stroke="var(--sb-sol)" stroke-dasharray="4 4"/>`,
    }[f.t]())).join('');
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" class="sb-croquis" aria-hidden="true">${formes}<text x="6" y="14" font-size="11" fill="var(--sb-sol)">${esc(d.valeur || '')}</text>${mvt ? `<text x="${w - 6}" y="${h - 6}" text-anchor="end" font-size="11" fill="var(--orange)">${esc(mvt)}</text>` : ''}</svg>`;
  },

  // Le même croquis sur un canvas, pour l'animatique en vidéo, le PDF et le fond du dessin
  croquisCanvas(ctx, d, w, h, encre = '#d8d4c4', sol = '#5a5a50') {
    ctx.save();
    ctx.lineWidth = Math.max(2, h / 140);
    for (const f of this._formes(d, w, h)) {
      ctx.strokeStyle = encre;
      ctx.beginPath();
      if (f.t === 'horizon' && f.y > 0) { ctx.strokeStyle = sol; ctx.moveTo(0, f.y); ctx.lineTo(w, f.y); }
      if (f.t === 'objet') ctx.rect(f.x, f.y, f.w, f.h);
      if (f.t === 'tete') ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      if (f.t === 'corps') { ctx.moveTo(f.x, f.y + f.h); ctx.lineTo(f.x, f.y + f.r); ctx.quadraticCurveTo(f.x, f.y, f.x + f.r, f.y); ctx.lineTo(f.x + f.w - f.r, f.y); ctx.quadraticCurveTo(f.x + f.w, f.y, f.x + f.w, f.y + f.r); ctx.lineTo(f.x + f.w, f.y + f.h); }
      if (f.t === 'jambes') { ctx.moveTo(f.x - f.e, f.y); ctx.lineTo(f.x - f.e, f.y + f.l); ctx.moveTo(f.x + f.e, f.y); ctx.lineTo(f.x + f.e, f.y + f.l); }
      if (f.t === 'epaule') { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.arc(f.x, f.y + f.r, f.r, 0, Math.PI * 2); ctx.fill(); continue; }
      ctx.stroke();
    }
    ctx.restore();
  },

  _cadre(p, classe = '') {
    const d = p?.d || {};
    const contenu = p?.image ? `<img src="${this._url(p)}" alt="Dessin du plan">` : this.croquisSVG(d);
    return `<div class="sb-cadre ${classe}" style="aspect-ratio:${this.ratio}">${contenu}</div>`;
  },

  // ─── Film, série, roman : les plans d'une scène ──────────────────────────

  _vueFilm() {
    const scene = this._sceneCourante();
    const plans = this._plansScene();
    if (!plans.some(p => p.id === this.sel)) this.sel = plans[0]?.id ?? null;
    const choixScene = this.data.scenes.map(s => {
      const n = this._plansScene(s.i).length;
      return `<option value="${s.i}" ${s.i === this.scene ? 'selected' : ''}>${esc(this._nomScene(s))}${n ? ` · ${n} plan${n > 1 ? 's' : ''}` : ''}</option>`;
    }).join('');
    const modes = [['grille', 'Planche'], ['liste', 'Liste'], ['sol', 'Plan au sol'], ['anim', 'Animatique']];
    return `
      <div class="sb-barre">
        <label class="an-label" for="sb-scene">Scène</label>
        <select id="sb-scene" onchange="Storyboard.choisirScene(this.value)">${choixScene}</select>
        <div class="ec-modes sb-modes" role="group" aria-label="Affichage">${modes.map(([k, l]) => `<button type="button" class="ec-mode ${k === this.mode ? 'actif' : ''}" aria-pressed="${k === this.mode}" onclick="Storyboard.setMode('${k}')">${l}</button>`).join('')}</div>
        <label class="an-label" for="sb-ratio">Format</label>
        <select id="sb-ratio" onchange="Storyboard.setRatio(this.value)">${SB_RATIOS.map(([v, l]) => `<option value="${v}" ${Number(v) === this.ratio ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="sb-exports">
          <button type="button" class="btn btn-ghost btn-sm" onclick="Storyboard.ouvrirFiches()">Fiches des personnages</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Storyboard.exporterPDF()">PDF</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Storyboard.exporterCSV()">Liste des plans (CSV)</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Storyboard.exporterVideo()" ${plans.length ? '' : 'disabled'}>Animatique en vidéo</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Storyboard.exporterSRT()" ${plans.length ? '' : 'disabled'}>Sous-titres (.srt)</button>
        </span>
      </div>
      ${this.mode === 'anim' ? this._vueAnimatique(plans, scene) : this.mode === 'sol' ? this._vueSol(plans, scene) : `
      <div class="sb-grille">
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre">${plans.length} plan${plans.length > 1 ? 's' : ''} · ${this._duree(plans.reduce((a, p) => a + (Number(p.d.duree) || 0), 0))}</h2>
            <span class="an-ligne"><button type="button" class="btn btn-secondary btn-sm" onclick="Storyboard.generer()">${plans.length ? 'Ajouter un plan par réplique' : 'Découper depuis le script'}</button><button type="button" class="btn btn-primary btn-sm" onclick="Storyboard.ajouter()">+ Plan</button></span></div>
          ${plans.length ? `<div class="sb-plans ${this.mode === 'liste' ? 'liste' : ''}">${plans.map((p, n) => this._carte(p, n, scene)).join('')}</div>` : '<p class="an-note">Aucun plan pour cette scène. « Découper depuis le script » propose un plan d\'ensemble, puis un plan sur chaque personnage qui prend la parole : tu les ajustes ensuite.</p>'}
        </section>
        ${plans.length ? this._detail(plans.find(p => p.id === this.sel), plans, scene) : ''}
      </div>
      ${plans.length ? this._controles(plans, scene) : ''}
      ${this._references(scene)}`}
      <p class="an-note">Le storyboard suit le script : une réplique réécrite reste liée à son plan tant que la personne qui la dit ne change pas.</p>
    `;
  },

  _ligne(p, scene) {
    if (p.d.ligne === null || p.d.ligne === undefined) return null;
    const l = scene?.lignes.find(x => x.k === Number(p.d.ligne));
    // Si le script a bougé, on retrouve la réplique par son début
    if (l && (!p.d.extrait || l.texte.startsWith(p.d.extrait.slice(0, 20)))) return l;
    return scene?.lignes.find(x => p.d.extrait && x.texte.startsWith(p.d.extrait.slice(0, 20))) || l || null;
  },

  _carte(p, n, scene) {
    const v = this._valeur(p.d.valeur);
    const l = this._ligne(p, scene);
    const mvt = SB_MOUVEMENTS.find(m => m[0] === p.d.mvt)?.[1] || 'Fixe';
    return `<button type="button" class="sb-plan ${p.id === this.sel ? 'actif' : ''}" aria-pressed="${p.id === this.sel}" onclick="Storyboard.choisir(${p.id})">
      ${this._cadre(p)}
      <span class="sb-plan-texte"><strong>Plan ${n + 1} · ${Number(p.d.duree) || 0} s</strong><small>${esc(v[1])} · ${esc(mvt)}</small><small class="an-note vo-brut">${esc(l ? `${l.qui ? `${l.qui} — ` : ''}${l.texte}` : p.d.note || '')}</small></span>
    </button>`;
  },

  _choix(id, label, cle, options, valeur) {
    return `<label class="sb-champ" for="${id}"><span class="an-label">${label}</span><select id="${id}" onchange="Storyboard.modifier('${cle}', this.value)">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(valeur ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  },

  _saisie(id, label, cle, valeur, type = 'text', attrs = '') {
    return `<label class="sb-champ" for="${id}"><span class="an-label">${label}</span><input id="${id}" type="${type}" value="${esc(valeur ?? '')}" ${attrs} oninput="Storyboard.modifier('${cle}', this.value, true)"></label>`;
  },

  _detail(p, plans, scene) {
    if (!p) return '';
    const d = p.d;
    const n = plans.indexOf(p);
    const persos = [...new Set([...scene.lignes.map(l => l.qui).filter(Boolean), ...(d.persos || []), ...Ecriture.d.persos.filter(x => x.g === 'p').map(x => x.n)])];
    const lignes = [['', 'Aucune (plan muet)'], ...scene.lignes.map(l => [l.k, `${l.qui ? `${l.qui} — ` : '(didascalie) '}${l.texte.slice(0, 70)}`])];
    const l = this._ligne(p, scene);
    return `
      <section class="an-carte sb-detail">
        <div class="an-entete"><h2 class="an-titre">Plan ${n + 1}</h2>
          <span class="an-ligne"><button type="button" class="ec-lien" ${n ? '' : 'disabled'} onclick="Storyboard.deplacer(-1)" aria-label="Avancer ce plan">◂</button><button type="button" class="ec-lien" ${n < plans.length - 1 ? '' : 'disabled'} onclick="Storyboard.deplacer(1)" aria-label="Reculer ce plan">▸</button></span></div>
        ${this._cadre(p, 'grand')}
        <div class="an-ligne sb-outils">
          <button type="button" class="btn btn-secondary btn-sm" onclick="Storyboard.dessiner()">✎ Dessiner</button>
          <label class="btn btn-secondary btn-sm sb-fichier">⇪ Importer une image<input type="file" accept="image/png,image/jpeg,image/webp" onchange="Storyboard.importerImage(this.files[0])"></label>
          ${p.image ? '<button type="button" class="btn btn-ghost btn-sm" onclick="Storyboard.retirerImage()">Revenir au croquis</button>' : ''}
          <button type="button" class="btn btn-ghost btn-sm" onclick="Storyboard.supprimer()">Supprimer le plan</button>
        </div>
        <div class="sb-champs">
          ${this._choix('sb-valeur', 'Valeur de plan', 'valeur', SB_VALEURS.map(v => [v[0], v[1]]), d.valeur)}
          ${this._choix('sb-angle', 'Angle', 'angle', SB_ANGLES, d.angle)}
          ${this._choix('sb-mvt', 'Mouvement', 'mvt', SB_MOUVEMENTS.map(m => [m[0], m[1]]), d.mvt)}
          ${this._saisie('sb-focale', 'Objectif (mm)', 'focale', d.focale, 'number', 'min="8" max="600"')}
          ${this._saisie('sb-duree', 'Durée (s)', 'duree', d.duree, 'number', 'min="0" max="600" step="0.5"')}
          ${this._choix('sb-transition', 'Transition vers le suivant', 'transition', SB_TRANSITIONS, d.transition)}
          ${this._choix('sb-axe', `Côté de l'axe${d.cam ? ' (d\'après le plan au sol)' : ''}`, 'axe', SB_AXES, d.axe || 'A')}
          ${this._choix('sb-statut', 'Avancement', 'statut', [['esquisse', 'À dessiner'], ['dessine', 'Dessiné'], ['valide', 'Validé']], d.statut || (p.image ? 'dessine' : 'esquisse'))}
        </div>
        ${this._fichesDe(d.persos || [])}
        <fieldset class="sb-persos"><legend class="an-label">Dans le cadre</legend>${persos.map(nom => `<label><input type="checkbox" ${(d.persos || []).includes(nom) ? 'checked' : ''} data-nom="${esc(nom)}" onchange="Storyboard.basculerPerso(this.dataset.nom, this.checked)"> ${esc(nom)}</label>`).join('') || '<span class="an-note">Personne dans cette scène.</span>'}</fieldset>
        ${this._choix('sb-ligne', 'Réplique liée', 'ligne', lignes, l ? l.k : '')}
        ${this._saisie('sb-son', 'Son', 'son', d.son)}
        ${this._saisie('sb-lumiere', 'Lumière', 'lumiere', d.lumiere)}
        <label class="sb-champ" for="sb-note"><span class="an-label">Notes</span><textarea id="sb-note" rows="2" oninput="Storyboard.modifier('note', this.value, true)">${esc(d.note || '')}</textarea></label>
      </section>
    `;
  },

  _controles(plans, scene) {
    const duree = plans.reduce((a, p) => a + (Number(p.d.duree) || 0), 0);
    const liees = new Set(plans.map(p => this._ligne(p, scene)?.k).filter(k => k !== undefined));
    const sans = scene.lignes.filter(l => l.qui && !liees.has(l.k));
    let cote = null;
    const sauts = [];
    plans.forEach((p, n) => {
      const a = p.d.axe || 'A';
      if (a === 'axe') { cote = null; return; }
      if (cote && a !== cote) sauts.push(n + 1);
      cote = a;
    });
    const valeurs = new Set(plans.map(p => p.d.valeur));
    const ecart = scene.secondes ? duree - scene.secondes : 0;
    const cartes = [
      scene.secondes ? ['Durée', `${this._duree(duree)} / ${this._duree(scene.secondes)}`, Math.abs(ecart) > Math.max(10, scene.secondes * 0.25), `La scène fait environ ${this._duree(scene.secondes)} à l'écran (une page par minute). ${ecart < 0 ? `Il manque ${Math.round(-ecart)} s de plans.` : ecart > 0 ? `Les plans durent ${Math.round(ecart)} s de plus.` : 'Les plans tombent juste.'}`] : ['Durée', this._duree(duree), false, 'Somme de la durée des plans.'],
      ['Répliques sans plan', `${sans.length} sur ${scene.lignes.filter(l => l.qui).length}`, sans.length > 0, sans.length ? sans.slice(0, 3).map(l => `${l.qui} — « ${l.texte.slice(0, 40)}${l.texte.length > 40 ? '…' : ''} »`).join(' · ') : 'Chaque réplique a son plan.'],
      ['Règle des 180°', sauts.length ? `Plan${sauts.length > 1 ? 's' : ''} ${sauts.join(', ')}` : 'Respectée', sauts.length > 0, sauts.length ? 'La caméra passe de l\'autre côté de l\'axe entre deux personnages sans plan « sur l\'axe » : leurs regards s\'inversent à l\'écran.' : 'La caméra reste du même côté de l\'axe, ou le traverse par un plan sur l\'axe.'],
      ['Valeurs de plan', `${valeurs.size} différente${valeurs.size > 1 ? 's' : ''}`, plans.length >= 4 && valeurs.size < 3, valeurs.size < 3 && plans.length >= 4 ? 'Peu de variété : la scène risque de paraître plate.' : 'La scène varie ses cadrages.'],
    ];
    return `<div class="sb-controles">${cartes.map(([t, v, alerte, d]) => `<section class="an-carte"><span class="an-label">${t}</span><strong class="sb-chiffre ${alerte ? 'ec-orange' : ''}">${esc(v)}</strong><p class="an-note vo-brut">${esc(d)}</p></section>`).join('')}</div>`;
  },

  choisirScene(i) {
    if (!this.data.scenes.some(s => s.i === Number(i))) return;
    this.arreter();
    this.scene = Number(i);
    this.sel = null;
    this.animI = 0;
    this.rendre();
    document.getElementById('sb-scene')?.focus();
  },

  setMode(mode) {
    this.arreter();
    this.mode = ['grille', 'liste', 'sol', 'anim'].includes(mode) ? mode : 'grille';
    this.rendre();
  },

  setRatio(v) {
    Ecriture.notes['sb-ratio'] = v;
    Ecriture.noterPlusTard('sb-ratio', v);
    this.rendre();
  },

  choisir(id) {
    this.sel = id;
    this.rendre();
  },

  _plan() {
    return this.data.plans.find(p => p.id === this.sel);
  },

  async _sauver(p) {
    const res = await api.post('ecriture_sb', { action: 'enregistrer', id: p.id, d: p.d });
    if (res.error) toast(res.error, 'error');
  },

  // Les champs à taper s'enregistrent un instant après la dernière touche, sans redessiner la page
  modifier(cle, valeur, frappe = false) {
    const p = this._plan();
    if (!p || !this._sceneCourante()) return;
    // Une durée ou un objectif absurde est ramené dans des bornes raisonnables
    const borne = (v, max) => Math.max(0, Math.min(max, Number(v) || 0));
    p.d[cle] = cle === 'duree' ? borne(valeur, 600) : cle === 'focale' ? borne(valeur, 2000) : cle === 'ligne' ? (valeur === '' ? null : Number(valeur)) : valeur;
    if (cle === 'statut') p.d.statut_date = new Date().toISOString().slice(0, 10);
    if (cle === 'ligne') {
      const l = this._sceneCourante().lignes.find(x => x.k === p.d.ligne);
      p.d.extrait = l ? l.texte.slice(0, 80) : '';
      if (l?.qui && !(p.d.persos || []).includes(l.qui)) p.d.persos = [...(p.d.persos || []), l.qui];
    }
    clearTimeout(this._enregistrer);
    this._enregistrer = setTimeout(() => this._sauver(p), frappe ? 600 : 0);
    if (!frappe) {
      const focus = document.activeElement?.id;
      this.rendre();
      if (focus) document.getElementById(focus)?.focus();
    }
  },

  basculerPerso(nom, coche) {
    const p = this._plan();
    const liste = new Set(p.d.persos || []);
    if (coche) liste.add(nom);
    else liste.delete(nom);
    p.d.persos = [...liste];
    this._sauver(p);
    this.rendre();
  },

  async ajouter() {
    const scene = this._sceneCourante();
    const avant = this._plan();
    const d = avant ? { ...avant.d, ligne: null, extrait: '', note: '' } : { valeur: 'PE', angle: 'normal', mvt: 'fixe', focale: 35, duree: 4, transition: 'cut', axe: 'A', persos: [...new Set(scene.lignes.map(l => l.qui).filter(Boolean))].slice(0, 3), ligne: null };
    const p = await api.post('ecriture_sb', { action: 'enregistrer', episode_id: this.ep.id, scene: this.scene, d });
    if (p.error) { toast(p.error, 'error'); return; }
    this.data.plans.push(p);
    this.sel = p.id;
    this.rendre();
  },

  async generer() {
    const res = await api.post('ecriture_sb', { action: 'generer', episode_id: this.ep.id, scene: this.scene });
    if (res.error) { toast(res.error, 'error'); return; }
    const avant = new Set(this.data.plans.map(p => p.id));
    this.data.plans = res.plans;
    this.sel = res.plans.find(p => !avant.has(p.id) && p.scene === this.scene)?.id ?? this.sel;
    toast(`${res.plans.filter(p => !avant.has(p.id)).length} plan(s) proposé(s)`, 'success');
    this.rendre();
  },

  async supprimer() {
    const p = this._plan();
    if (!p || !confirm('Supprimer ce plan et son dessin ?')) return;
    await api.post('ecriture_sb', { action: 'supprimer', id: p.id });
    this.data.plans = this.data.plans.filter(x => x.id !== p.id);
    this.sel = null;
    this.rendre();
  },

  async deplacer(sens) {
    const plans = this._plansScene();
    const n = plans.findIndex(p => p.id === this.sel);
    const m = n + sens;
    if (m < 0 || m >= plans.length) return;
    [plans[n], plans[m]] = [plans[m], plans[n]];
    plans.forEach((p, i) => { p.ordre = i; });
    await api.post('ecriture_sb', { action: 'ordonner', ids: plans.map(p => p.id) });
    this.rendre();
  },

  // ─── Références de la scène : lumières, décors, films ────────────────────

  _references(scene) {
    const refs = this.data.plans.filter(p => p.scene === scene.i && p.d.ref && p.image);
    return `
      <section class="an-carte sb-refs">
        <div class="an-entete"><h2 class="an-titre">Références de la scène</h2>
          <label class="btn btn-secondary btn-sm sb-fichier">+ Ajouter des images<input type="file" multiple accept="image/png,image/jpeg,image/webp" onchange="Storyboard.ajouterReferences(this.files)"></label></div>
        ${refs.length ? `<div class="sb-refs-mur">${refs.map(r => `<figure><img src="${this._url(r)}" alt="Référence"><figcaption><input type="text" aria-label="Légende" value="${esc(r.d.note || '')}" placeholder="Légende…" onchange="Storyboard.legender(${r.id}, this.value)"><button type="button" class="ec-lien" onclick="Storyboard.retirerReference(${r.id})">Retirer</button></figcaption></figure>`).join('')}</div>` : '<p class="an-note">Un mur d\'images pour cette scène : lumière, décor, costume, plan d\'un film qui t\'inspire.</p>'}
      </section>`;
  },

  async ajouterReferences(fichiers) {
    for (const f of [...fichiers]) {
      const p = await api.post('ecriture_sb', { action: 'enregistrer', episode_id: this.ep.id, scene: this.scene, d: { ref: true, note: f.name.replace(/\.[^.]+$/, '') } });
      if (p.error) { toast(p.error, 'error'); return; }
      this.data.plans.push(p);
      await this._envoyerImage(p, f);
    }
  },

  async legender(id, texte) {
    const p = this.data.plans.find(x => x.id === id);
    p.d.note = texte;
    await this._sauver(p);
  },

  async retirerReference(id) {
    await api.post('ecriture_sb', { action: 'supprimer', id });
    this.data.plans = this.data.plans.filter(x => x.id !== id);
    this.rendre();
  },

  // ─── Fiches dessinées des personnages ────────────────────────────────────

  _vuesFiche: [['face', 'Face'], ['profil', 'Profil'], ['dos', 'Dos'], ['expressions', 'Expressions']],

  _fiche(nom, vue) {
    return (this.fiches || []).find(f => f.d.perso === nom && f.d.vue === vue);
  },

  _couleurs(nom) {
    try {
      const c = JSON.parse(Ecriture.notes[`sb-couleurs:${nom}`] || '[]');
      return Array.isArray(c) ? c.filter(x => /^#[0-9a-f]{3,8}$/i.test(String(x))) : [];
    } catch (e) { return []; }
  },

  // Les fiches des personnages dans le cadre, à garder sous les yeux pendant le dessin
  _fichesDe(noms) {
    const vignettes = noms.flatMap(n => this._vuesFiche.map(([v, l]) => [n, l, this._fiche(n, v)]).filter(x => x[2]?.image));
    const couleurs = noms.map(n => [n, this._couleurs(n)]).filter(x => x[1].length);
    if (!vignettes.length && !couleurs.length) return '';
    return `<div class="sb-champ"><span class="an-label">Fiches des personnages</span><div class="sb-fiches-mini">
      ${vignettes.map(([n, l, f]) => `<img src="${this._url(f)}" alt="${esc(n)}, ${esc(l)}" title="${esc(n)} · ${esc(l)}">`).join('')}
      ${couleurs.map(([n, c]) => `<span class="sb-palette" title="Couleurs de ${esc(n)}">${c.map(x => `<i style="background:${esc(x)}"></i>`).join('')}</span>`).join('')}
    </div></div>`;
  },

  ouvrirFiches() {
    modal.open('<div id="sb-fiches"></div>');
    this._rendreFiches();
  },

  _rendreFiches() {
    const slot = document.getElementById('sb-fiches');
    if (!slot) return;
    const dansEp = this.data.scenes.flatMap(s => s.lignes.map(l => l.qui)).filter(q => q && (!Roman.bd || true));
    const noms = [...new Set([...Ecriture.d.persos.filter(p => p.g === 'p').map(p => p.n), ...dansEp])].filter(n => !/^(RÉCITATIF|SFX|SON|NARRATEUR)/.test(n)).slice(0, 24);
    slot.innerHTML = `
      <h2 class="an-titre">Fiches des personnages</h2>
      <p class="an-note">Face, profil, dos et expressions, plus les couleurs : elles s'affichent à côté de chaque ${Roman.bd ? 'case' : 'plan'} où le personnage apparaît.</p>
      <div class="sb-fiches">${noms.map((n, i) => `
        <section class="sb-fiche">
          <strong>${esc(n)}</strong>
          <div class="sb-fiche-vues">${this._vuesFiche.map(([v, l]) => {
            const f = this._fiche(n, v);
            return `<div class="sb-fiche-vue">${f?.image ? `<img src="${this._url(f)}" alt="${esc(n)}, ${esc(l)}">` : '<span class="sb-fiche-vide"></span>'}<small>${l}</small>
              <span class="an-ligne"><label class="ec-lien sb-fichier">Importer<input type="file" accept="image/png,image/jpeg,image/webp" onchange="Storyboard.importerFiche(${i}, '${v}', this.files[0])"></label><button type="button" class="ec-lien" onclick="Storyboard.dessinerFiche(${i}, '${v}')">Dessiner</button></span></div>`;
          }).join('')}</div>
          <div class="an-ligne"><span class="an-label">Couleurs</span>${[0, 1, 2, 3, 4].map(k => `<input type="color" aria-label="Couleur ${k + 1} de ${esc(n)}" value="${esc(this._couleurs(n)[k] || '#888888')}" onchange="Storyboard.setCouleur(${i}, ${k}, this.value)">`).join('')}</div>
        </section>`).join('') || '<p class="an-note">Aucun personnage pour l\'instant.</p>'}</div>
    `;
    this._nomsFiches = noms;
  },

  async _assurerFiche(i, vue) {
    const nom = this._nomsFiches[i];
    let f = this._fiche(nom, vue);
    if (f) return f;
    f = await api.post('ecriture_sb', { action: 'enregistrer', episode_id: 0, scene: 0, d: { fiche: true, perso: nom, vue } });
    this.fiches.push(f);
    return f;
  },

  async importerFiche(i, vue, fichier) {
    if (!fichier) return;
    const f = await this._assurerFiche(i, vue);
    await this._envoyerImage(f, fichier);
    this._rendreFiches();
  },

  async dessinerFiche(i, vue) {
    const f = await this._assurerFiche(i, vue);
    this.dessiner(f, () => this.ouvrirFiches());
  },

  setCouleur(i, k, valeur) {
    const nom = this._nomsFiches[i];
    const c = this._couleurs(nom);
    while (c.length < k) c.push('#888888');
    c[k] = valeur;
    Ecriture.noterPlusTard(`sb-couleurs:${nom}`, JSON.stringify(c));
  },

  // ─── Plan au sol : la scène vue de dessus, l'axe et les caméras ──────────

  _cleSol() {
    return `sb-sol:${this.ep.id}:${this.scene}`;
  },

  _sol(scene) {
    let pos = {};
    try { pos = JSON.parse(Ecriture.notes[this._cleSol()] || '{}') || {}; } catch (e) {}
    if (typeof pos !== 'object' || Array.isArray(pos)) pos = {};
    Object.keys(pos).forEach(n => { if (!Array.isArray(pos[n]) || pos[n].length !== 2 || !pos[n].every(Number.isFinite)) delete pos[n]; });
    const noms = this._nomsScene(scene);
    noms.forEach((n, i) => { if (!pos[n]) pos[n] = [noms.length === 1 ? 50 : 25 + (50 * i) / Math.max(1, noms.length - 1), 38 + (i % 2) * 6]; });
    return pos;
  },

  _nomsScene(scene) {
    const compte = new Map();
    scene.lignes.forEach(l => { if (l.qui) compte.set(l.qui, (compte.get(l.qui) || 0) + 1); });
    this._plansScene(scene.i).forEach(p => (p.d.persos || []).forEach(n => { if (!compte.has(n)) compte.set(n, 0); }));
    return [...compte.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 8);
  },

  // L'axe passe par les deux personnages qui parlent le plus
  _axe(scene, pos) {
    const [a, b] = this._nomsScene(scene);
    return a && b ? [pos[a], pos[b]] : null;
  },

  _cote(cam, axe) {
    if (!axe) return 'A';
    const [[ax, ay], [bx, by]] = axe;
    const long = Math.hypot(bx - ax, by - ay) || 1;
    const croix = ((bx - ax) * (cam[1] - ay) - (by - ay) * (cam[0] - ax)) / long;
    return Math.abs(croix) < 3 ? 'axe' : croix > 0 ? 'A' : 'B';
  },

  // La caméra vise le milieu des personnages qu'elle cadre
  _vise(p, pos) {
    const cibles = (p.d.persos || []).map(n => pos[n]).filter(Boolean);
    const liste = cibles.length ? cibles : Object.values(pos);
    return [liste.reduce((a, c) => a + c[0], 0) / liste.length, liste.reduce((a, c) => a + c[1], 0) / liste.length];
  },

  // Les plans tournés du même endroit, regroupés : on installe la caméra une fois
  _positions(plans) {
    const groupes = [];
    plans.forEach((p, n) => {
      if (!p.d.cam) return;
      const g = groupes.find(x => Math.hypot(x.cam[0] - p.d.cam[0], x.cam[1] - p.d.cam[1]) < 10);
      if (g) g.plans.push(n);
      else groupes.push({ cam: p.d.cam, plans: [n] });
    });
    return groupes;
  },

  _vueSol(plans, scene) {
    if (!plans.length) return '<section class="an-carte"><p class="an-note">Ajoute d\'abord des plans : le plan au sol place leur caméra.</p></section>';
    const pos = this._sol(scene);
    const axe = this._axe(scene, pos);
    const sel = this._plan() || plans[0];
    this.sel = sel.id;
    let ligneAxe = '';
    if (axe) {
      const [[ax, ay], [bx, by]] = axe;
      const dx = bx - ax, dy = by - ay, k = 200 / (Math.hypot(dx, dy) || 1);
      ligneAxe = `<line x1="${ax - dx * k}" y1="${ay - dy * k}" x2="${bx + dx * k}" y2="${by + dy * k}" class="sb-sol-axe"/>`;
    }
    const cameras = plans.map((p, n) => {
      if (!p.d.cam) return '';
      const [x, y] = p.d.cam;
      const [vx, vy] = this._vise(p, pos);
      const angle = Math.atan2(vy - y, vx - x);
      const ouverture = { PG: 0.6, PE: 0.5, PM: 0.4, PA: 0.33, PR: 0.25, GP: 0.16, TGP: 0.1, INS: 0.12 }[p.d.valeur] || 0.35;
      const portee = Math.min(40, Math.hypot(vx - x, vy - y) + 6);
      const pt = a => `${x + Math.cos(a) * portee},${y + Math.sin(a) * portee}`;
      return `<g class="sb-sol-cam ${p.id === sel.id ? 'actif' : ''}" data-plan="${p.id}">
        <polygon points="${x},${y} ${pt(angle - ouverture)} ${pt(angle + ouverture)}" class="sb-sol-cone"/>
        <circle cx="${x}" cy="${y}" r="3.2"/><text x="${x}" y="${y + 1.2}" text-anchor="middle">${n + 1}</text></g>`;
    }).join('');
    const persos = Object.entries(pos).filter(([n]) => this._nomsScene(scene).includes(n)).map(([n, [x, y]]) => `<g class="sb-sol-perso" data-perso="${esc(n)}"><circle cx="${x}" cy="${y}" r="3.6" style="fill:${Analyse._couleur(n)}"/><text x="${x}" y="${y + 7.5}" text-anchor="middle">${esc(n.slice(0, 10))}</text></g>`).join('');
    const groupes = this._positions(plans);
    const places = plans.filter(p => p.d.cam).length;
    const changements = plans.reduce((a, p, n) => a + (n && p.d.cam && plans[n - 1].d.cam && groupes.findIndex(g => g.plans.includes(n)) !== groupes.findIndex(g => g.plans.includes(n - 1)) ? 1 : 0), 0) + (places ? 1 : 0);
    return `
      <div class="sb-grille">
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre">Vue de dessus</h2><span class="an-note">${places} plan(s) placé(s) sur ${plans.length}</span></div>
          <svg id="sb-sol" class="sb-sol" viewBox="0 0 100 75" role="img" aria-label="Plan au sol de la scène">${ligneAxe}${cameras}${persos}</svg>
          <p class="an-note">Tire les personnages pour les placer. Clique dans le décor pour poser la caméra du plan choisi, ou tire-la. Elle vise les personnages qu'elle cadre. ${axe ? 'Le trait en pointillés est l\'axe entre les deux personnages qui parlent le plus : le côté de chaque caméra se règle tout seul.' : 'Il faut deux personnages pour tracer l\'axe.'}</p>
        </section>
        <section class="an-carte sb-detail">
          <label class="sb-champ" for="sb-sol-plan"><span class="an-label">Plan à placer</span><select id="sb-sol-plan" onchange="Storyboard.choisir(Number(this.value))">${plans.map((p, n) => `<option value="${p.id}" ${p.id === sel.id ? 'selected' : ''}>Plan ${n + 1} · ${esc(this._valeur(p.d.valeur)[1])}${p.d.cam ? '' : ' · à placer'}</option>`).join('')}</select></label>
          ${this._cadre(sel, 'grand')}
          ${sel.d.cam ? `<p class="an-note">Côté de l'axe : ${esc(SB_AXES.find(a => a[0] === (sel.d.axe || 'A'))[1])}.</p><button type="button" class="ec-lien" onclick="Storyboard.retirerCamera()">Retirer la caméra de ce plan</button>` : '<p class="an-note">Ce plan n\'a pas encore de caméra : clique dans la vue de dessus.</p>'}
          <h3 class="an-label">Ordre de tournage</h3>
          ${groupes.length ? `<ol class="sb-ordre">${groupes.map((g, k) => `<li><strong>Position ${k + 1}</strong> · plan${g.plans.length > 1 ? 's' : ''} ${g.plans.map(n => n + 1).join(', ')} <span class="an-note">${esc([...new Set(g.plans.map(n => this._valeur(plans[n].d.valeur)[0]))].join(', '))}</span></li>`).join('')}</ol>
          <p class="an-note">En tournant position par position : ${groupes.length} installation(s) de caméra au lieu de ${changements} dans l'ordre du montage.</p>` : '<p class="an-note">Place les caméras pour regrouper les plans tournés du même endroit.</p>'}
        </section>
      </div>`;
  },

  _majCotes(scene, pos) {
    const axe = this._axe(scene, pos);
    this._plansScene().forEach(p => {
      if (!p.d.cam) return;
      const cote = this._cote(p.d.cam, axe);
      if (cote !== p.d.axe) { p.d.axe = cote; this._sauver(p); }
    });
  },

  retirerCamera() {
    const p = this._plan();
    delete p.d.cam;
    this._sauver(p);
    this.rendre();
  },

  _brancherSol() {
    const svg = document.getElementById('sb-sol');
    if (!svg) return;
    const scene = this._sceneCourante();
    const pos = this._sol(scene);
    const point = e => {
      const m = svg.getScreenCTM().inverse();
      const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
      return [Math.max(2, Math.min(98, Math.round(pt.x * 10) / 10)), Math.max(2, Math.min(73, Math.round(pt.y * 10) / 10))];
    };
    let tire = null;
    svg.addEventListener('pointerdown', e => {
      const perso = e.target.closest('[data-perso]');
      const cam = e.target.closest('[data-plan]');
      try { svg.setPointerCapture(e.pointerId); } catch (err) {}
      if (perso) tire = { perso: perso.dataset.perso };
      else if (cam) { this.sel = Number(cam.dataset.plan); tire = { cam: this.sel }; }
      else {
        const p = this._plan();
        p.d.cam = point(e);
        tire = { cam: p.id };
      }
    });
    svg.addEventListener('pointermove', e => {
      if (!tire) return;
      if (tire.perso) pos[tire.perso] = point(e);
      else this.data.plans.find(p => p.id === tire.cam).d.cam = point(e);
      tire.bouge = true;
      this._redessinerSol(pos);
    });
    const fin = () => {
      if (!tire) return;
      if (tire.perso) Ecriture.noterPlusTard(this._cleSol(), JSON.stringify(pos));
      this._majCotes(scene, pos);
      const p = this._plan();
      if (tire.cam) this._sauver(p);
      tire = null;
      this.rendre();
    };
    svg.addEventListener('pointerup', fin);
    svg.addEventListener('pointercancel', fin);
  },

  // Pendant qu'on tire, on ne redessine que la vue de dessus
  _redessinerSol(pos) {
    Ecriture.notes[this._cleSol()] = JSON.stringify(pos);
    const scene = this._sceneCourante();
    const html = this._vueSol(this._plansScene(), scene);
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    document.getElementById('sb-sol').innerHTML = tmp.querySelector('#sb-sol').innerHTML;
  },

  // ─── Voix enregistrée sur l'animatique ───────────────────────────────────

  _urlSon() {
    const maj = this.data.sons[this.scene];
    return maj ? `${API_BASE}ecriture_sb_son&episode_id=${this.ep.id}&scene=${this.scene}&v=${encodeURIComponent(maj)}` : null;
  },

  async enregistrerVoix() {
    if (this._micro) { this._finirVoix(); return; }
    let flux;
    try { flux = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { toast('Le micro n\'est pas accessible : autorise-le dans le navigateur.', 'error'); return; }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(flux, type ? { mimeType: type } : {});
    const morceaux = [];
    rec.ondataavailable = e => morceaux.push(e.data);
    rec.onstop = async () => {
      flux.getTracks().forEach(t => t.stop());
      const blob = new Blob(morceaux, { type: rec.mimeType.split(';')[0] });
      const octets = new Uint8Array(await blob.arrayBuffer());
      let binaire = '';
      for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
      const res = await api.post('ecriture_sb', { action: 'son', episode_id: this.ep.id, scene: this.scene, type: blob.type, donnees: btoa(binaire) });
      if (res.error) { toast(res.error, 'error'); return; }
      this.data.sons[this.scene] = res.maj;
      toast('Voix enregistrée', 'success');
      this.rendre();
    };
    this._micro = rec;
    this.animI = 0;
    rec.start(250);
    this._finLecture = () => this._finirVoix();
    this.lire(true);
  },

  _finirVoix() {
    const rec = this._micro;
    this._micro = null;
    this._finLecture = null;
    this.arreter();
    if (rec && rec.state !== 'inactive') rec.stop();
  },

  async supprimerVoix() {
    if (!confirm('Supprimer la voix enregistrée sur cette scène ?')) return;
    await api.post('ecriture_sb', { action: 'sans_son', episode_id: this.ep.id, scene: this.scene });
    delete this.data.sons[this.scene];
    this.rendre();
  },

  // ─── BD : l'ordre de lecture des bulles ──────────────────────────────────

  _posBulles(i) {
    const s = this.data.scenes.find(x => x.i === i);
    const p = this._planCase(i);
    const manga = Roman.format === 'manga';
    return s.lignes.filter(l => l.type !== 'son').map((l, n) => {
      const pos = p?.d.bulles?.[l.k];
      return { l, x: pos ? pos[0] : (manga ? 52 - (n % 2) * 30 : 4 + (n % 2) * 30), y: pos ? pos[1] : Math.min(78, 4 + n * 18) };
    });
  },

  // Une bulle se lit avant une autre si elle est nettement plus haut, ou à la même hauteur et plus à gauche (à droite en manga)
  _desordres(i) {
    const b = this._posBulles(i);
    const manga = Roman.format === 'manga';
    const avant = (a, c) => a.y < c.y - 8 || (Math.abs(a.y - c.y) <= 8 && (manga ? a.x > c.x : a.x < c.x));
    const fautes = [];
    for (let n = 1; n < b.length; n++) if (avant(b[n], b[n - 1])) fautes.push([b[n - 1].l, b[n].l]);
    return fautes;
  },

  // ─── Images : importées ou dessinées ─────────────────────────────────────

  async _envoyerImage(p, blob) {
    const type = blob.type;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) { toast('PNG, JPEG ou WebP seulement', 'error'); return; }
    const octets = new Uint8Array(await blob.arrayBuffer());
    let binaire = '';
    for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
    const res = await api.post('ecriture_sb', { action: 'image', id: p.id, type, donnees: btoa(binaire) });
    if (res.error) { toast(res.error, 'error'); return; }
    Object.assign(p, res);
    // Un plan qui reçoit son dessin passe à « dessiné »
    if (!p.d.ref && !p.d.fiche && (!p.d.statut || p.d.statut === 'esquisse')) {
      p.d.statut = 'dessine';
      p.d.statut_date = new Date().toISOString().slice(0, 10);
      this._sauver(p);
    }
    this.rendre();
  },

  async importerImage(fichier) {
    const p = this._plan();
    if (fichier && p) await this._envoyerImage(p, fichier);
  },

  async retirerImage() {
    const p = this._plan();
    await api.post('ecriture_sb', { action: 'sans_image', id: p.id });
    p.image = null;
    this.rendre();
  },

  _chargerImage(p) {
    if (!p?.image) return Promise.resolve(null);
    const cle = this._url(p);
    if (this._images.has(cle)) return this._images.get(cle);
    const promesse = new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = cle;
    });
    this._images.set(cle, promesse);
    return promesse;
  },

  // Un carnet de dessin : crayon, feutre, gomme, annuler ; le croquis peut servir de fond
  async dessiner(p = this._plan(), retour = null) {
    if (!p) return;
    const ratio = p.d.fiche ? 0.75 : Roman.bd ? 1.4 : this.ratio;
    const W = 1200, H = Math.round(W / ratio);
    modal.open(`
      <h2 class="an-titre">Dessiner ${p.d.fiche ? `${esc(p.d.perso)} · ${esc(p.d.vue)}` : Roman.bd ? 'la case' : 'le plan'}</h2>
      <div class="an-ligne sb-carnet-outils" role="toolbar" aria-label="Outils de dessin">
        ${[['crayon', 'Crayon'], ['feutre', 'Feutre'], ['gomme', 'Gomme']].map(([k, l], i) => `<button type="button" class="btn btn-secondary btn-sm ${i ? '' : 'actif'}" data-outil="${k}" onclick="Storyboard._outil('${k}')">${l}</button>`).join('')}
        ${['#111111', '#6b6b64', '#c0392b', '#2f6fd6'].map((c, i) => `<button type="button" class="sb-couleur ${i ? '' : 'actif'}" data-couleur="${c}" style="background:${c}" aria-label="Couleur ${c}" onclick="Storyboard._couleur('${c}')"></button>`).join('')}
        <button type="button" class="btn btn-ghost btn-sm" onclick="Storyboard._annuler()">Annuler</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="Storyboard._fond()">Partir du croquis</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="Storyboard._effacer()">Tout effacer</button>
      </div>
      <canvas id="sb-carnet" class="sb-carnet" width="${W}" height="${H}" style="aspect-ratio:${ratio}"></canvas>
      <div class="an-ligne"><button type="button" class="btn btn-primary btn-sm" onclick="Storyboard._garderDessin()">Garder le dessin</button><button type="button" class="btn btn-ghost btn-sm" onclick="modal.close()">Fermer sans garder</button></div>
    `);
    const c = document.getElementById('sb-carnet');
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f6f3ea';
    ctx.fillRect(0, 0, W, H);
    const img = await this._chargerImage(p);
    if (img) ctx.drawImage(img, 0, 0, W, H);
    this._carnet = { c, ctx, outil: 'crayon', couleur: '#111111', pile: [ctx.getImageData(0, 0, W, H)], plan: p, retour };
    let trace = false;
    const point = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
    c.addEventListener('pointerdown', e => {
      trace = true;
      try { c.setPointerCapture(e.pointerId); } catch (err) {}
      const [x, y] = point(e);
      const k = this._carnet;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = k.outil === 'gomme' ? '#f6f3ea' : k.couleur;
      ctx.lineWidth = { crayon: 3, feutre: 10, gomme: 28 }[k.outil] * (e.pressure && e.pointerType === 'pen' ? 0.5 + e.pressure : 1);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.1, y);
      ctx.stroke();
    });
    c.addEventListener('pointermove', e => {
      if (!trace) return;
      const [x, y] = point(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    });
    const fin = () => {
      if (!trace) return;
      trace = false;
      this._carnet.pile.push(ctx.getImageData(0, 0, W, H));
      if (this._carnet.pile.length > 30) this._carnet.pile.shift();
    };
    c.addEventListener('pointerup', fin);
    c.addEventListener('pointercancel', fin);
  },

  _outil(k) {
    this._carnet.outil = k;
    document.querySelectorAll('[data-outil]').forEach(b => b.classList.toggle('actif', b.dataset.outil === k));
  },

  _couleur(c) {
    this._carnet.couleur = c;
    if (this._carnet.outil === 'gomme') this._outil('crayon');
    document.querySelectorAll('[data-couleur]').forEach(b => b.classList.toggle('actif', b.dataset.couleur === c));
  },

  _annuler() {
    const k = this._carnet;
    if (k.pile.length > 1) k.pile.pop();
    k.ctx.putImageData(k.pile[k.pile.length - 1], 0, 0);
  },

  _effacer() {
    const k = this._carnet;
    k.ctx.fillStyle = '#f6f3ea';
    k.ctx.fillRect(0, 0, k.c.width, k.c.height);
    k.pile.push(k.ctx.getImageData(0, 0, k.c.width, k.c.height));
  },

  _fond() {
    const k = this._carnet;
    const d = k.plan.d.fiche ? { valeur: 'PM', angle: 'normal', persos: [k.plan.d.perso] } : Roman.bd ? { valeur: k.plan.d.cadrage || 'PM', angle: k.plan.d.angle, persos: this._persosCase(k.plan.scene) } : k.plan.d;
    this.croquisCanvas(k.ctx, d, k.c.width, k.c.height, '#b9b4a4', '#d6d1c2');
    k.pile.push(k.ctx.getImageData(0, 0, k.c.width, k.c.height));
  },

  _garderDessin() {
    const k = this._carnet;
    k.c.toBlob(async blob => {
      modal.close();
      await this._envoyerImage(k.plan, blob);
      if (k.retour) k.retour();
    }, 'image/png');
  },

  // ─── Animatique ──────────────────────────────────────────────────────────

  _vueAnimatique(plans, scene) {
    if (!plans.length) return '<section class="an-carte"><p class="an-note">Aucun plan dans cette scène.</p></section>';
    this.animI = Math.min(this.animI, plans.length - 1);
    const p = plans[this.animI];
    const l = this._ligne(p, scene);
    const total = plans.reduce((a, x) => a + (Number(x.d.duree) || 0), 0);
    return `
      <section class="an-carte sb-anim">
        <h2 class="an-titre">Animatique · plan ${this.animI + 1} sur ${plans.length}</h2>
        ${this._cadre(p, 'anim')}
        <div class="sb-piste" aria-hidden="true">${plans.map((x, i) => `<span style="flex:${Math.max(0.5, Number(x.d.duree) || 0)} 1 0" class="${i === this.animI ? 'actif' : i < this.animI ? 'vu' : ''}"></span>`).join('')}</div>
        <p class="sb-sous-titre vo-brut" aria-live="polite">${esc(l ? `${l.qui ? `${l.qui} — ` : ''}${l.texte}` : p.d.note || '')}</p>
        <div class="an-ligne">
          <button type="button" class="btn btn-secondary btn-sm" onclick="Storyboard.voisin(-1)" ${this.animI ? '' : 'disabled'}>◂ Plan précédent</button>
          <button type="button" id="sb-lire" class="btn btn-primary btn-sm" onclick="Storyboard.lire()">${this._lecture ? '❚❚ Pause' : `▶ Lire · ${this._duree(total)}`}</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="Storyboard.voisin(1)" ${this.animI < plans.length - 1 ? '' : 'disabled'}>Plan suivant ▸</button>
          ${this._urlSon() ? '' : `<label class="an-label"><input type="checkbox" id="sb-voix" ${this._note('sb-voix', '') === '1' ? 'checked' : ''} onchange="Ecriture.noterPlusTard('sb-voix', this.checked ? '1' : ''); Ecriture.notes['sb-voix'] = this.checked ? '1' : ''"> Voix de synthèse</label>`}
        </div>
        <div class="an-ligne">
          <button type="button" class="btn ${this._micro ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="Storyboard.enregistrerVoix()">${this._micro ? '■ Arrêter l\'enregistrement' : `● ${this._urlSon() ? 'Réenregistrer' : 'Enregistrer'} ma voix`}</button>
          ${this._urlSon() ? `<span class="an-note">Voix enregistrée le ${new Date(this.data.sons[this.scene].replace(' ', 'T') + 'Z').toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span><button type="button" class="ec-lien" onclick="Storyboard.supprimerVoix()">Supprimer la voix</button>` : ''}
        </div>
        <p class="an-note">Chaque plan reste à l'écran le temps de sa durée. « Enregistrer ma voix » lance l'animatique depuis le premier plan : lis les répliques au micro pendant qu'elle défile. La voix enregistrée est rejouée avec l'animatique et mise dans la vidéo ; la voix de synthèse, elle, n'est pas exportée.</p>
      </section>
    `;
  },

  voisin(sens) {
    this.arreter();
    this.animI = Math.max(0, Math.min(this._plansScene().length - 1, this.animI + sens));
    this.rendre();
  },

  // Pendant un enregistrement, la lecture part du premier plan et ne joue pas la voix déjà enregistrée
  lire(enregistrement = false) {
    if (this._lecture) { if (this._micro) this._finirVoix(); else { this.arreter(); } this.rendre(); return; }
    const plans = this._plansScene();
    if (this.animI >= plans.length - 1) this.animI = 0;
    const url = this._urlSon();
    if (url && !enregistrement) {
      // La voix est calée sur le premier plan
      this.animI = 0;
      this._audio = new Audio(url);
      this._audio.play().catch(() => {});
    }
    const suivant = () => {
      const p = plans[this.animI];
      this.rendre();
      const l = this._ligne(p, this._sceneCourante());
      if (!url && !enregistrement && this._note('sb-voix', '') === '1' && l?.qui && 'speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(l.texte);
        u.lang = 'fr-FR';
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      }
      this._lecture = setTimeout(() => {
        if (this.animI >= plans.length - 1) {
          const fin = this._finLecture;
          this.arreter();
          if (fin) fin();
          this.rendre();
          return;
        }
        this.animI++;
        suivant();
      }, Math.max(0.5, Number(p.d.duree) || 0) * 1000);
    };
    this._lecture = true;
    suivant();
  },

  arreter() {
    if (this._lecture && this._lecture !== true) clearTimeout(this._lecture);
    this._lecture = null;
    if (this._audio) { this._audio.pause(); this._audio = null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  },

  // Une image du plan sur un canvas : le dessin s'il existe, sinon le croquis, et la réplique en sous-titre
  async _image(ctx, p, w, h, scene, sousTitre = true) {
    ctx.fillStyle = '#16160f';
    ctx.fillRect(0, 0, w, h);
    const img = await this._chargerImage(p);
    if (img) ctx.drawImage(img, 0, 0, w, h);
    else this.croquisCanvas(ctx, p.d, w, h);
    const l = sousTitre ? this._ligne(p, scene) : null;
    if (l) {
      const texte = `${l.qui ? `${l.qui} — ` : ''}${l.texte}`;
      ctx.font = `${Math.round(h / 22)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, h * 0.86, w, h * 0.14);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(texte.length > 90 ? `${texte.slice(0, 90)}…` : texte, w / 2, h * 0.94, w * 0.94);
    }
  },

  async exporterVideo() {
    const plans = this._plansScene();
    const scene = this._sceneCourante();
    if (!plans.length || typeof MediaRecorder === 'undefined') { toast('Ce navigateur ne sait pas enregistrer de vidéo', 'error'); return; }
    const W = 1280, H = Math.round(W / this.ratio / 2) * 2;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t));
    const flux = c.captureStream(30);
    // La voix enregistrée rejoint l'image dans la même vidéo
    const url = this._urlSon();
    let audio = null;
    let pistes = flux;
    if (url) {
      audio = new Audio(url);
      const ctxA = new AudioContext();
      const dest = ctxA.createMediaStreamDestination();
      ctxA.createMediaElementSource(audio).connect(dest);
      pistes = new MediaStream([...flux.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    }
    const rec = new MediaRecorder(pistes, { mimeType: type });
    const morceaux = [];
    rec.ondataavailable = e => morceaux.push(e.data);
    const total = plans.reduce((a, p) => a + Math.max(0.5, Number(p.d.duree) || 0), 0);
    let annule = false;
    modal.open(`<h2 class="an-titre">Animatique en vidéo</h2><p class="an-note" id="sb-video-etat">Enregistrement en temps réel : ${this._duree(total)}.</p><button type="button" class="btn btn-ghost btn-sm" onclick="Storyboard._annulerVideo()">Arrêter</button>`);
    this._annulerVideo = () => { annule = true; };
    await this._image(ctx, plans[0], W, H, scene);
    rec.start(250);
    if (audio) audio.play().catch(() => {});
    for (const [i, p] of plans.entries()) {
      if (annule) break;
      await this._image(ctx, p, W, H, scene);
      const etat = document.getElementById('sb-video-etat');
      if (etat) etat.textContent = `Plan ${i + 1} sur ${plans.length}…`;
      // Le canvas doit changer pour que chaque image soit enregistrée : on le redessine pendant toute la durée
      const fin = performance.now() + Math.max(0.5, Number(p.d.duree) || 0) * 1000;
      while (performance.now() < fin && !annule) {
        await new Promise(r => setTimeout(r, 200));
        flux.getVideoTracks()[0].requestFrame?.();
      }
    }
    if (audio) audio.pause();
    await new Promise(r => { rec.onstop = r; rec.stop(); });
    modal.close();
    if (annule) return;
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    this._telecharger(new Blob(morceaux, { type }), `${this._nomFichier()}.${ext}`);
  },

  _slug(t) {
    return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  },

  // « Acte 2 », « Pl.05 » : le code tel que l'app l'affiche pour ce type de projet
  _codeFichier() {
    return this._slug(Roman.traduire(Ecriture._code(this.ep)));
  },

  _nomFichier() {
    return `storyboard-${this._codeFichier()}-${this._slug(this._sceneCourante() ? this._nomScene(this._sceneCourante()) : 'scene')}`;
  },

  _telecharger(blob, nom) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },

  // Les sous-titres de l'animatique : chaque réplique liée, le temps de son plan
  exporterSRT() {
    const scene = this._sceneCourante();
    const plans = this._plansScene();
    const temps = s => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
    let t = 0, n = 0;
    const blocs = [];
    plans.forEach(p => {
      const d = Math.max(0.5, Number(p.d.duree) || 0);
      const l = this._ligne(p, scene);
      if (l?.texte) blocs.push(`${++n}\n${temps(t)} --> ${temps(t + d)}\n${l.qui ? `${l.qui} : ` : ''}${l.texte}\n`);
      t += d;
    });
    if (!blocs.length) { toast('Aucune réplique liée à un plan dans cette scène', 'error'); return; }
    this._telecharger(new Blob([blocs.join('\n')], { type: 'text/plain;charset=utf-8' }), `${this._nomFichier()}.srt`);
  },

  exporterCSV() {
    const cellule = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lignes = [['Scène', 'Plan', 'Position caméra', 'Valeur', 'Angle', 'Mouvement', 'Objectif (mm)', 'Durée (s)', 'Transition', 'Axe', 'Dans le cadre', 'Réplique', 'Son', 'Lumière', 'Notes']];
    const nom = (liste, k) => liste.find(x => x[0] === k)?.[1] || '';
    this.data.scenes.forEach(s => this._plansScene(s.i).forEach((p, n, tous) => {
      const l = this._ligne(p, s);
      const position = this._positions(tous).findIndex(g => g.plans.includes(n));
      lignes.push([this._nomScene(s), n + 1, position < 0 ? '' : position + 1, nom(SB_VALEURS, p.d.valeur), nom(SB_ANGLES, p.d.angle), nom(SB_MOUVEMENTS, p.d.mvt), p.d.focale, p.d.duree, nom(SB_TRANSITIONS, p.d.transition), p.d.axe, (p.d.persos || []).join(', '), l ? `${l.qui ? `${l.qui} — ` : ''}${l.texte}` : '', p.d.son, p.d.lumiere, p.d.note]);
    }));
    if (lignes.length === 1) { toast('Aucun plan dans cet épisode', 'error'); return; }
    this._telecharger(new Blob(['﻿' + lignes.map(l => l.map(cellule).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), `plans-${this._codeFichier()}.csv`);
  },

  // Une page à imprimer en PDF depuis le navigateur : 6 plans par page, avec leurs réglages
  async exporterPDF() {
    const fenetre = window.open('', '_blank');
    if (!fenetre) { toast('Autorise les fenêtres pour ce site pour exporter en PDF', 'error'); return; }
    fenetre.document.write('<p style="font-family:sans-serif">Préparation des planches…</p>');
    const c = document.createElement('canvas');
    if (Roman.bd) return this._pdfBD(fenetre, c);
    c.width = 800;
    c.height = Math.round(800 / this.ratio);
    const ctx = c.getContext('2d');
    const blocs = [];
    for (const s of this.data.scenes) {
      const plans = this._plansScene(s.i);
      if (!plans.length) continue;
      const cartes = [];
      for (const [n, p] of plans.entries()) {
        await this._image(ctx, p, c.width, c.height, s, false);
        const l = this._ligne(p, s);
        cartes.push(`<figure><img src="${c.toDataURL('image/jpeg', 0.85)}" alt=""><figcaption><b>Plan ${n + 1}</b> · ${esc(this._valeur(p.d.valeur)[1])} · ${esc(SB_MOUVEMENTS.find(m => m[0] === p.d.mvt)?.[1] || 'Fixe')} · ${Number(p.d.duree) || 0} s${p.d.focale ? ` · ${p.d.focale} mm` : ''}<br>${esc(l ? `${l.qui ? `${l.qui} — ` : ''}${l.texte}` : p.d.note || '')}</figcaption></figure>`);
      }
      blocs.push(`<section><h2>${esc(this._nomScene(s))}</h2><div class="grille">${cartes.join('')}</div></section>`);
    }
    this._imprimer(fenetre, `Storyboard — ${Ecriture._code(this.ep)}`, blocs.join('') || '<p>Aucun plan dans cet épisode.</p>', '.grille{display:grid;grid-template-columns:repeat(2,1fr);gap:10mm 8mm}figure{margin:0;break-inside:avoid}img{width:100%;border:1px solid #999}figcaption{font-size:9pt;margin-top:2mm;line-height:1.35}');
  },

  _imprimer(fenetre, titre, corps, style) {
    fenetre.document.open();
    fenetre.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(Roman.traduire(titre))}</title><style>body{font-family:system-ui,sans-serif;color:#111;margin:12mm}h1{font-size:16pt;margin:0 0 6mm}h2{font-size:11pt;margin:8mm 0 3mm;break-after:avoid}section{break-inside:auto}${style}@page{margin:10mm}</style></head><body><h1>${esc(Roman.traduire(titre))}</h1>${corps}<script>window.onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`);
    fenetre.document.close();
  },

  // ─── BD : la planche en cases sur un gabarit ─────────────────────────────

  gabaritDefaut(nb) {
    const parBande = nb <= 3 ? 1 : nb <= 6 ? 2 : 3;
    const bandes = [];
    for (let i = 0; i < nb; i += parBande) bandes.push({ h: 1, cases: Array.from({ length: Math.min(parBande, nb - i) }, (_, k) => ({ i: i + k, f: 1 })) });
    return { bandes };
  },

  _gabarit() {
    const nb = this.data.scenes.length;
    try {
      const g = JSON.parse(Ecriture.notes[`sb-gabarit:${this.ep.id}`] || 'null');
      if (g?.bandes && g.bandes.flatMap(b => b.cases).length === nb) return g;
    } catch (e) {}
    return this.gabaritDefaut(nb);
  },

  _garderGabarit(g) {
    const valeur = JSON.stringify(g);
    Ecriture.notes[`sb-gabarit:${this.ep.id}`] = valeur;
    Ecriture.noterPlusTard(`sb-gabarit:${this.ep.id}`, valeur);
  },

  _planCase(i) {
    return this.data.plans.find(p => p.scene === i && !p.d.ref);
  },

  _persosCase(i) {
    const s = this.data.scenes.find(x => x.i === i);
    return [...new Set((s?.lignes || []).filter(l => l.type === 'bulle').map(l => l.qui))];
  },

  _vueBD() {
    const g = this._gabarit();
    if (!this.data.scenes.some(s => s.i === this.scene)) this.scene = this.data.scenes[0].i;
    const limite = { fb: 25, rg: 30, manga: 15, comics: 25 }[Roman.format] || 25;
    const total = this.data.scenes.length;
    const cases = g.bandes.map((b, nb) => `
      <div class="sb-bande" style="flex:${b.h} 1 0" data-bande="${nb}">
        ${b.cases.map((c, k) => {
          const s = this.data.scenes[c.i];
          const p = this._planCase(c.i);
          const d = { valeur: p?.d.cadrage || 'PM', angle: p?.d.angle || 'normal', persos: this._persosCase(c.i) };
          return `${k ? `<span class="sb-poignee v" data-bande="${nb}" data-case="${k}" role="separator" aria-label="Largeur des cases" tabindex="-1"></span>` : ''}
          <button type="button" class="sb-case ${c.i === this.scene ? 'actif' : ''}" style="flex:${c.f} 1 0" aria-pressed="${c.i === this.scene}" onclick="Storyboard.choisirCase(${c.i})">
            <span class="sb-case-n">${c.i + 1}</span>
            ${p?.image ? `<img src="${this._url(p)}" alt="Crayonné de la case ${c.i + 1}">` : this.croquisSVG(d, 200, 140)}
            ${this._posBulles(c.i).map(b => `<span class="sb-bulle vo-brut ${b.l.type === 'recitatif' ? 'recitatif' : ''}" data-k="${b.l.k}" style="left:${b.x}%;top:${b.y}%" title="${esc(b.l.qui)}">${esc(b.l.texte.length > 36 ? `${b.l.texte.slice(0, 36)}…` : b.l.texte)}</span>`).join('')}
          </button>`;
        }).join('')}
      </div>${nb < g.bandes.length - 1 ? `<span class="sb-poignee h" data-bande="${nb}" role="separator" aria-label="Hauteur des bandes" tabindex="-1"></span>` : ''}`).join('');
    const s = this._sceneCourante();
    const p = this._planCase(this.scene) || { d: {} };
    const bulles = s.lignes;
    const ou = g.bandes.findIndex(b => b.cases.some(c => c.i === this.scene));
    const longues = bulles.filter(b => b.mots > limite);
    const largeur = g.bandes[ou].cases.find(c => c.i === this.scene).f / g.bandes[ou].cases.reduce((a, c) => a + c.f, 0) * g.bandes[ou].h / g.bandes.reduce((a, b) => a + b.h, 0);
    const petite = largeur < 0.7 / total && s.mots > limite;
    const lettrage = this._lettrage(g, ou, s);
    const alertes = [
      ...(lettrage.part > 0.3 ? [`Les bulles prendraient environ ${Math.round(lettrage.part * 100)} % de la case à ${String(lettrage.corps).replace('.', ',')} mm de corps : il restera peu de place pour le dessin.`] : []),
      ...longues.map(b => `La bulle de ${b.qui} fait ${b.mots} mots : au-delà de ${limite}, elle mange la case.`),
      ...(petite ? [`Case petite pour ${s.mots} mots : agrandis-la ou étale les bulles sur deux cases.`] : []),
      ...this._desordres(this.scene).map(([a, b]) => `La bulle de ${b.qui} (« ${b.texte.slice(0, 24)}… ») se lit avant celle de ${a.qui}, alors qu'elle vient après dans le scénario.`),
    ];
    const desordres = this.data.scenes.filter(x => this._desordres(x.i).length).length;
    return `
      <div class="sb-barre">
        <span class="an-note">${desordres ? `<span class="ec-orange">${desordres} case(s) aux bulles dans le désordre</span> · ` : ''}${esc(Ecriture._code(this.ep))} · ${total} case${total > 1 ? 's' : ''} · format ${esc(BD_FORMATS_NOMS[Roman.format] || '')} · ${this.ep.n % 2 ? 'page de droite' : 'page de gauche'}</span>
        <span class="sb-exports">
          <button type="button" class="btn btn-ghost btn-sm" onclick="Storyboard.ouvrirFiches()">Fiches des personnages</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Storyboard.exporterPDF()">Planche en PDF</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="Storyboard.exporterDecoupage()">Scénario découpé (texte)</button>
        </span>
      </div>
      <div class="sb-grille">
        <section class="an-carte sb-page-carte">
          <div class="an-entete"><h2 class="an-titre">La planche</h2><span class="an-ligne"><button type="button" class="ec-lien" onclick="Storyboard.gabaritParDefaut()">Gabarit par défaut</button></span></div>
          <div class="sb-page" id="sb-page" style="aspect-ratio:1 / ${SB_PAGE[Roman.format] || 1.36}">${cases}</div>
          <p class="an-note">Tire les traits entre les cases pour changer leur largeur, et entre les bandes pour leur hauteur. Dans la case choisie, tire les bulles à leur place : l'app vérifie qu'elles se lisent ${Roman.format === 'manga' ? 'de droite à gauche' : 'de gauche à droite'} et de haut en bas, dans l'ordre du scénario. Les cases viennent du scénario : pour en ajouter une, écris « CASE » dans le brouillon.</p>
        </section>
        <section class="an-carte sb-detail">
          <div class="an-entete"><h2 class="an-titre">Case ${this.scene + 1}</h2><span class="an-note">${s.mots} mot${s.mots > 1 ? 's' : ''}</span></div>
          <div class="sb-champ"><span class="an-label">Description du scénario</span><p class="vo-brut">${esc(s.desc || '—')}</p></div>
          <div class="sb-champs">
            ${this._choix('sb-cadrage', 'Cadrage', 'cadrage', SB_VALEURS.map(v => [v[0], v[1]]), p.d.cadrage || 'PM')}
            ${this._choix('sb-angle', 'Angle', 'angle', SB_ANGLES, p.d.angle || 'normal')}
          </div>
          <div class="sb-champ"><span class="an-label">Bulles, récitatifs et sons</span>${bulles.length ? `<ul class="ec-liste">${bulles.map(b => `<li><span class="vo-brut"><strong>${esc(b.qui)}</strong> ${esc(b.texte)}</span><span class="${b.mots > limite ? 'ec-orange' : 'an-note'}">${b.mots} mot${b.mots > 1 ? 's' : ''}</span></li>`).join('')}</ul>` : '<p class="an-note">Case muette.</p>'}</div>
          ${this._fichesDe(this._persosCase(this.scene))}
          <div class="sb-champ"><span class="an-label">Lettrage</span><p class="sb-texte">Case d'environ ${Math.round(lettrage.l)} × ${Math.round(lettrage.h)} mm sur une planche ${esc(BD_FORMATS_NOMS[Roman.format] || '')} ; ${lettrage.signes} signes en bulles : ${Math.round(lettrage.part * 100)} % de la case.</p>
            <label class="an-ligne"><span class="an-label">Corps du lettrage (mm)</span><input type="number" class="an-nombre" min="1.5" max="6" step="0.1" value="${lettrage.corps}" onchange="Storyboard.setCorps(this.value)"></label></div>
          <label class="sb-champ" for="sb-note"><span class="an-label">Notes pour le dessin</span><textarea id="sb-note" rows="2" oninput="Storyboard.modifierCase('note', this.value, true)">${esc(p.d.note || '')}</textarea></label>
          <div class="an-ligne sb-outils">
            <button type="button" class="btn btn-secondary btn-sm" onclick="Storyboard.crayonner()">✎ Crayonner</button>
            <label class="btn btn-secondary btn-sm sb-fichier">⇪ Importer le crayonné<input type="file" accept="image/png,image/jpeg,image/webp" onchange="Storyboard.importerCase(this.files[0])"></label>
            ${p.image ? '<button type="button" class="btn btn-ghost btn-sm" onclick="Storyboard.retirerImageCase()">Retirer le crayonné</button>' : ''}
          </div>
          <div class="an-ligne">
            <button type="button" class="ec-lien" ${ou ? '' : 'disabled'} onclick="Storyboard.changerBande(-1)">Monter dans la bande du dessus</button>
            <button type="button" class="ec-lien" onclick="Storyboard.changerBande(1)">${ou < g.bandes.length - 1 ? 'Descendre dans la bande du dessous' : 'Ouvrir une bande dessous'}</button>
          </div>
          ${alertes.length ? `<ul class="ec-liste">${alertes.map(a => `<li class="ec-orange"><span>${esc(a)}</span></li>`).join('')}</ul>` : '<p class="an-note">Rien à signaler pour cette case.</p>'}
        </section>
      </div>
    `;
  },

  // La place que prend le texte : chaque signe occupe environ 0,55 × 1,3 corps, et la bulle ajoute ses marges
  _lettrage(g, ou, s) {
    const [pw, ph] = SB_PAGE_MM[Roman.format] || SB_PAGE_MM.fb;
    const corps = Math.max(1.5, Math.min(6, Number(Ecriture.notes['bd-corps']) || SB_CORPS[Roman.format] || 3));
    const marge = 12, ecart = 3;
    const bande = g.bandes[ou];
    const c = bande.cases.find(x => x.i === this.scene);
    const hauteur = (ph - 2 * marge - ecart * (g.bandes.length - 1)) * bande.h / g.bandes.reduce((a, b) => a + b.h, 0);
    const largeur = (pw - 2 * marge - ecart * (bande.cases.length - 1)) * c.f / bande.cases.reduce((a, x) => a + x.f, 0);
    const signes = s.lignes.filter(l => l.type !== 'son').reduce((t, l) => t + l.texte.length, 0);
    const surface = signes * (0.55 * corps) * (1.3 * corps) * 1.6;
    return { l: largeur, h: hauteur, signes, corps, part: largeur * hauteur ? surface / (largeur * hauteur) : 0 };
  },

  setCorps(v) {
    Ecriture.noterPlusTard('bd-corps', String(Math.max(1.5, Math.min(6, Number(v) || 3))));
    Ecriture.notes['bd-corps'] = String(Math.max(1.5, Math.min(6, Number(v) || 3)));
    this.rendre();
  },

  choisirCase(i) {
    if (!this.data.scenes.some(s => s.i === i)) return;
    this.scene = i;
    this.rendre();
  },

  // La case n'a son enregistrement qu'au premier réglage
  async _assurerCase() {
    let p = this._planCase(this.scene);
    if (p) return p;
    p = await api.post('ecriture_sb', { action: 'enregistrer', episode_id: this.ep.id, scene: this.scene, d: { cadrage: 'PM', angle: 'normal' } });
    this.data.plans.push(p);
    return p;
  },

  async modifierCase(cle, valeur, frappe = false) {
    const p = await this._assurerCase();
    p.d[cle] = valeur;
    clearTimeout(this._enregistrer);
    this._enregistrer = setTimeout(() => this._sauver(p), frappe ? 600 : 0);
    if (!frappe) this.rendre();
  },

  async crayonner() {
    const p = await this._assurerCase();
    this.sel = p.id;
    this.dessiner();
  },

  async importerCase(fichier) {
    const p = await this._assurerCase();
    if (fichier) await this._envoyerImage(p, fichier);
  },

  async retirerImageCase() {
    const p = this._planCase(this.scene);
    await api.post('ecriture_sb', { action: 'sans_image', id: p.id });
    p.image = null;
    this.rendre();
  },

  gabaritParDefaut() {
    this._garderGabarit(this.gabaritDefaut(this.data.scenes.length));
    this.rendre();
  },

  // Les cases gardent l'ordre de lecture : on ne déplace qu'une case en bout de bande
  changerBande(sens) {
    const g = this._gabarit();
    const ou = g.bandes.findIndex(b => b.cases.some(c => c.i === this.scene));
    if (ou < 0 || (sens < 0 && ou === 0)) return;
    const bande = g.bandes[ou];
    const k = bande.cases.findIndex(c => c.i === this.scene);
    if (sens < 0) {
      if (k !== 0) { toast('Seule la première case d\'une bande peut monter : l\'ordre de lecture ne change pas.', 'error'); return; }
      g.bandes[ou - 1].cases.push(bande.cases.shift());
    } else {
      if (k !== bande.cases.length - 1) { toast('Seule la dernière case d\'une bande peut descendre : l\'ordre de lecture ne change pas.', 'error'); return; }
      if (ou === g.bandes.length - 1) g.bandes.push({ h: 1, cases: [] });
      g.bandes[ou + 1].cases.unshift(bande.cases.pop());
    }
    g.bandes = g.bandes.filter(b => b.cases.length);
    this._garderGabarit(g);
    this.rendre();
  },

  // Tirer un trait entre deux cases échange de la largeur entre elles ; entre deux bandes, de la hauteur
  _brancherGabarit() {
    const page = document.getElementById('sb-page');
    if (!page) return;
    // Les bulles de la case choisie se tirent à leur place ; l'ordre de lecture est vérifié en lâchant
    page.querySelectorAll('.sb-case.actif .sb-bulle').forEach(bulle => {
      bulle.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        try { bulle.setPointerCapture(e.pointerId); } catch (err) {}
        const cadre = bulle.parentElement.getBoundingClientRect();
        const dx = e.clientX - bulle.getBoundingClientRect().left;
        const dy = e.clientY - bulle.getBoundingClientRect().top;
        let pos = null;
        const bouger = ev => {
          pos = [Math.max(0, Math.min(85, Math.round((ev.clientX - dx - cadre.left) / cadre.width * 100))), Math.max(0, Math.min(88, Math.round((ev.clientY - dy - cadre.top) / cadre.height * 100)))];
          bulle.style.left = `${pos[0]}%`;
          bulle.style.top = `${pos[1]}%`;
        };
        const finir = async () => {
          bulle.removeEventListener('pointermove', bouger);
          bulle.removeEventListener('pointerup', finir);
          if (!pos) return;
          const p = await this._assurerCase();
          // Les autres bulles gardent la place qu'on leur voit
          const toutes = Object.fromEntries(this._posBulles(this.scene).map(b => [b.l.k, [b.x, b.y]]));
          toutes[bulle.dataset.k] = pos;
          await this.modifierCase('bulles', toutes);
        };
        bulle.addEventListener('pointermove', bouger);
        bulle.addEventListener('pointerup', finir);
      });
      bulle.addEventListener('click', e => e.stopPropagation());
    });
    page.querySelectorAll('.sb-poignee').forEach(poignee => {
      poignee.addEventListener('pointerdown', e => {
        e.preventDefault();
        try { poignee.setPointerCapture(e.pointerId); } catch (err) {}
        const g = this._gabarit();
        const nb = Number(poignee.dataset.bande);
        const vertical = poignee.classList.contains('v');
        const k = Number(poignee.dataset.case);
        const depart = vertical ? e.clientX : e.clientY;
        const elems = vertical ? [poignee.previousElementSibling, poignee.nextElementSibling] : [poignee.previousElementSibling, poignee.nextElementSibling];
        const tailles = elems.map(el => (vertical ? el.getBoundingClientRect().width : el.getBoundingClientRect().height));
        const poids = vertical ? [g.bandes[nb].cases[k - 1].f, g.bandes[nb].cases[k].f] : [g.bandes[nb].h, g.bandes[nb + 1].h];
        const somme = poids[0] + poids[1];
        const bouger = ev => {
          const delta = (vertical ? ev.clientX : ev.clientY) - depart;
          const a = Math.max(0.15, Math.min(0.85, (tailles[0] + delta) / (tailles[0] + tailles[1])));
          const nouveaux = [somme * a, somme * (1 - a)];
          elems[0].style.flexGrow = nouveaux[0];
          elems[1].style.flexGrow = nouveaux[1];
          if (vertical) { g.bandes[nb].cases[k - 1].f = nouveaux[0]; g.bandes[nb].cases[k].f = nouveaux[1]; }
          else { g.bandes[nb].h = nouveaux[0]; g.bandes[nb + 1].h = nouveaux[1]; }
        };
        const finir = () => {
          poignee.removeEventListener('pointermove', bouger);
          poignee.removeEventListener('pointerup', finir);
          this._garderGabarit(g);
        };
        poignee.addEventListener('pointermove', bouger);
        poignee.addEventListener('pointerup', finir);
      });
    });
  },

  async _pdfBD(fenetre, c) {
    const g = this._gabarit();
    const cases = [];
    c.width = 600;
    c.height = 420;
    const ctx = c.getContext('2d');
    for (const s of this.data.scenes) {
      const p = this._planCase(s.i);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      const img = await this._chargerImage(p);
      if (img) ctx.drawImage(img, 0, 0, c.width, c.height);
      else this.croquisCanvas(ctx, { valeur: p?.d.cadrage || 'PM', angle: p?.d.angle, persos: this._persosCase(s.i) }, c.width, c.height, '#777', '#bbb');
      cases[s.i] = c.toDataURL('image/jpeg', 0.85);
    }
    const page = g.bandes.map(b => `<div class="bande" style="flex:${b.h} 1 0">${b.cases.map(x => `<div class="case" style="flex:${x.f} 1 0;background-image:url(${cases[x.i]})"><span>${x.i + 1}</span>${this.data.scenes[x.i].lignes.filter(l => l.type === 'bulle').slice(0, 2).map(l => `<em>${esc(l.texte.slice(0, 80))}</em>`).join('')}</div>`).join('')}</div>`).join('');
    this._imprimer(fenetre, `Crayonné — ${Ecriture._code(this.ep)}`, `<div class="page">${page}</div>`, `.page{width:180mm;height:${Math.round(180 * (SB_PAGE[Roman.format] || 1.36))}mm;max-height:250mm;display:flex;flex-direction:column;gap:3mm;margin:auto}.bande{display:flex;gap:3mm;min-height:0}.case{position:relative;border:1.5px solid #111;background-size:cover;background-position:center;min-width:0;overflow:hidden}.case span{position:absolute;left:2mm;top:1mm;font-size:8pt}.case em{display:block;margin:5mm 2mm 0 auto;max-width:60%;background:#fff;border:1px solid #111;border-radius:3mm;padding:1mm 2mm;font-size:7pt;font-style:normal}`);
  },

  exporterDecoupage() {
    const nom = (liste, k) => liste.find(x => x[0] === k)?.[1] || '';
    const texte = [`${Roman.traduire(Ecriture._code(this.ep))}${this.ep.t ? ` — ${this.ep.t}` : ''}`, ''];
    this.data.scenes.forEach(s => {
      const p = this._planCase(s.i);
      texte.push(`CASE ${s.i + 1}${p ? ` · ${nom(SB_VALEURS, p.d.cadrage || 'PM')} · ${nom(SB_ANGLES, p.d.angle || 'normal')}` : ''}`);
      if (s.desc) texte.push(s.desc);
      s.lignes.forEach(l => texte.push(`${l.qui} : ${l.texte}`));
      if (p?.d.note) texte.push(`Note pour le dessin : ${p.d.note}`);
      texte.push('');
    });
    this._telecharger(new Blob([texte.join('\n')], { type: 'text/plain;charset=utf-8' }), `decoupage-${this._codeFichier()}.txt`);
  },
};
