// assets/js/production.js — Exporter aux normes, réordonner au tableau de liège, préparer le tournage
// Les réglages vivent dans la note « mise-en-page » du projet : Config → Mots, intrigues et mise en page
'use strict';

const MISE_EN_PAGE = {
  papier: 'A4', mentions: 'fr', numeros: true, revision: true, suite: true, titre: true, auteur: '', contact: '', version: '',
  police_roman: 'Times New Roman', taille_roman: 12, interligne: 2, signes: 1500, alinea: true, chapitre_page: true, entete_roman: true,
  hmc: 60, decalage: 15, debut_jour: '08:00', debut_nuit: '19:00', premier_jour: '', repos: [0],
  liege_couleur: 'intrigue',
};
// Une note en JSON qui doit être un objet : abîmée, vide ou « null », elle compte comme vide
function objetNote(brut) {
  try {
    const v = JSON.parse(brut || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch (e) { return {}; }
}
// Du texte placé dans une feuille de style : seulement des lettres, des chiffres et une ponctuation simple
const cssTexte = t => String(t || '').replace(/[^\p{L}\p{N} .,'’()-]/gu, '').slice(0, 120);
// Une couleur venue d'une note : seule une couleur #rrggbb passe dans un attribut
const couleurSure = (c, defaut) => (/^#[0-9a-f]{3,8}$/i.test(String(c)) ? c : defaut);
const JOURS_SEMAINE = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
// Les noms des mots qu'on peut choisir, pour les menus de Config
const VOCAB_LIBELLES = { saison: 'Saison', livre: 'Livre', tome: 'Tome', partie: 'Partie', volume: 'Volume', album: 'Album', film: 'Film', episode: 'Épisode', chapitre: 'Chapitre', planche: 'Planche', page: 'Page', acte: 'Acte' };
const LIEGE_PALETTE = ['#67cbac', '#e8a85c', '#9fb7e8', '#f08fb0', '#c9b8ff', '#9be38f', '#ff9f9f', '#7fe0d4', '#ffd36e', '#b0b0b0'];

// Les intrigues du projet : A, B, C (si elle n'est pas masquée) et celles ajoutées, avec un nom et une couleur
const Intrigues = {
  lettres() {
    const c = Interface.config;
    return ['A', 'B', ...(c.masquesEpisodes.includes('intrigue_C') ? [] : ['C']), ...c.intrigues];
  },

  details(notes = Ecriture.notes) {
    const d = objetNote(notes?.intrigues);
    return this.lettres().map((l, i) => ({ l, nom: String(d[l]?.nom || ''), couleur: couleurSure(d[l]?.couleur, LIEGE_PALETTE[i % LIEGE_PALETTE.length]) }));
  },

  async _enregistrerLettres() {
    await Interface.enregistrer();
    try { if (Episodes.data?.length) Episodes.render(); } catch (e) {}
  },

  async ajouter() {
    const c = Interface.config;
    if (c.masquesEpisodes.includes('intrigue_C')) c.masquesEpisodes = c.masquesEpisodes.filter(x => x !== 'intrigue_C');
    else {
      const suivante = String.fromCharCode(68 + c.intrigues.length);
      if (suivante > 'Z') { toast('26 intrigues au plus', 'error'); return; }
      c.intrigues = [...c.intrigues, suivante];
    }
    await this._enregistrerLettres();
    MiseEnPage.rendrePanel();
  },

  // Le texte déjà saisi reste en base : il revient si l'intrigue est rajoutée
  async retirer() {
    const c = Interface.config;
    if (c.intrigues.length) c.intrigues = c.intrigues.slice(0, -1);
    else if (!c.masquesEpisodes.includes('intrigue_C')) c.masquesEpisodes = [...c.masquesEpisodes, 'intrigue_C'];
    else return;
    await this._enregistrerLettres();
    MiseEnPage.rendrePanel();
  },

  async regler(l, cle, valeur) {
    const notes = MiseEnPage.notes || Ecriture.notes;
    const d = objetNote(notes.intrigues);
    if (cle === 'couleur' && !couleurSure(valeur, null)) return;
    d[l] = { ...(typeof d[l] === 'object' && d[l] ? d[l] : {}), [cle]: String(valeur).slice(0, 80) };
    notes.intrigues = JSON.stringify(d);
    if (Ecriture.notes && Ecriture.notes !== notes) Ecriture.notes.intrigues = notes.intrigues;
    await api.put('analyse_notes', { cle: 'intrigues', valeur: notes.intrigues });
  },
};

const MiseEnPage = {
  notes: null,

  // Une valeur abîmée ou du mauvais type reprend sa valeur par défaut
  lire(notes = Ecriture.notes) {
    let brut = {};
    try { brut = JSON.parse(notes?.['mise-en-page'] || '{}') || {}; } catch (e) {}
    const r = { ...MISE_EN_PAGE };
    if (typeof brut !== 'object' || Array.isArray(brut)) return r;
    for (const [cle, defaut] of Object.entries(MISE_EN_PAGE)) {
      const v = brut[cle];
      if (v === undefined || v === null) continue;
      if (Array.isArray(defaut)) { if (Array.isArray(v)) r[cle] = v.filter(x => Number.isInteger(x) && x >= 0 && x <= 6); continue; }
      if (typeof defaut === 'number') { if (Number.isFinite(Number(v))) r[cle] = Number(v); continue; }
      if (typeof v === typeof defaut) r[cle] = v;
    }
    return r;
  },

  async ecrire(changements) {
    const notes = this.notes || Ecriture.notes;
    const r = { ...this.lire(notes), ...changements };
    const valeur = JSON.stringify(r);
    notes['mise-en-page'] = valeur;
    if (Ecriture.notes && Ecriture.notes !== notes) Ecriture.notes['mise-en-page'] = valeur;
    await api.put('analyse_notes', { cle: 'mise-en-page', valeur });
    return r;
  },

  // ─── Config → Mots, intrigues et mise en page ───────────────────────────────────

  async rendrePanel() {
    const slot = document.getElementById('mise-en-page-panel');
    if (!slot) return;
    this.notes = await api.get('analyse_notes');
    const r = this.lire(this.notes);
    const coche = (cle, label, aide) => `<label class="mep-coche"><input type="checkbox" ${r[cle] ? 'checked' : ''} onchange="MiseEnPage.regler('${cle}', this.checked)"><span>${label}${aide ? `<small>${aide}</small>` : ''}</span></label>`;
    const champ = (cle, label, type = 'text', attrs = '') => `<label class="mep-champ"><span class="an-label">${label}</span><input type="${type}" value="${esc(r[cle] ?? '')}" ${attrs} onchange="MiseEnPage.regler('${cle}', this.type === 'number' ? Number(this.value) : this.value)"></label>`;
    const choix = (cle, label, options) => `<label class="mep-champ"><span class="an-label">${label}</span><select onchange="MiseEnPage.regler('${cle}', isNaN(this.value) ? this.value : Number(this.value))">${options.map(([v, l]) => `<option value="${esc(v)}" ${String(r[cle]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    const scenario = Roman.type === 'serie' || Roman.film;
    const choixMots = VOCAB_CHOIX[Roman.type];
    const actuel = Projets.actuel()?.mots || {};
    const motSel = (niveau, label) => `<label class="mep-champ"><span class="an-label">${label}</span><select id="mep-mot-${niveau}" ${choixMots[niveau].length < 2 ? 'disabled' : ''} onchange="MiseEnPage.changerMots()">${choixMots[niveau].map(m => `<option value="${m}" ${actuel[niveau] === m ? 'selected' : ''}>${VOCAB_LIBELLES[m]}</option>`).join('')}</select></label>`;
    const intrigues = Intrigues.details(this.notes);
    slot.innerHTML = `
      <p class="an-label">Vocabulaire</p>
      <div class="mep-grille vo-brut">${motSel('haut', 'Le grand niveau')}${motSel('unite', 'L\'unité')}</div>
      <p class="an-note vo-brut">Toute l'app parle avec ces mots, abréviations comprises : « S1 » devient « L1 » pour un livre. Les noms par défaut, comme « Livre 2 », suivent le nouveau mot.</p>
      <p class="an-label">Intrigues</p>
      <div class="mep-intrigues vo-brut">${intrigues.map(i => `<div class="mep-intrigue"><span class="mep-lettre" style="background:${esc(i.couleur)}">${i.l}</span><input type="text" aria-label="Nom de l'intrigue ${i.l}" maxlength="80" value="${esc(i.nom)}" placeholder="Intrigue ${i.l}" onchange="Intrigues.regler('${i.l}', 'nom', this.value)"><input type="color" aria-label="Couleur de l'intrigue ${i.l}" value="${esc(i.couleur)}" onchange="Intrigues.regler('${i.l}', 'couleur', this.value); this.previousElementSibling.previousElementSibling.style.background = this.value"></div>`).join('')}</div>
      <div class="an-ligne"><button type="button" class="btn btn-secondary btn-sm" ${intrigues.length >= 26 ? 'disabled' : ''} onclick="Intrigues.ajouter()">+ Ajouter une intrigue</button>${intrigues.length > 2 ? `<button type="button" class="btn btn-ghost btn-sm" onclick="Intrigues.retirer()">Retirer l'intrigue ${intrigues[intrigues.length - 1].l}</button>` : ''}</div>
      <p class="an-note">Les mêmes intrigues que dans le tableau des épisodes et au tableau de liège. Une intrigue retirée garde ses textes : ils reviennent si tu la rajoutes.</p>
      <p class="settings-card-subtitle">Ces réglages sont propres à ce projet. Ils servent à l'export, au compte des pages${Roman.film ? ', au tableau de liège et aux feuilles de service' : ' et au tableau de liège'}.</p>
      ${scenario ? `
      <p class="an-label">Scénario</p>
      <div class="mep-grille">
        ${choix('papier', 'Papier', [['A4', 'A4 (Europe) · 58 lignes par page'], ['Letter', 'US Letter · 54 lignes par page']])}
        ${choix('mentions', 'Mentions', [['fr', 'En français : (SUITE)'], ['en', 'En anglais : (MORE), (CONT\'D)']])}
      </div>
      ${coche('numeros', 'Numéros de séquence', 'dans les deux marges')}
      ${coche('suite', 'Couper une réplique entre deux pages', 'avec (SUITE) en bas et le nom repris en haut')}
      ${coche('revision', 'En-tête de révision', 'la couleur de la dernière version en haut des pages changées')}` : ''}
      ${Roman.actif ? `
      <p class="an-label">Manuscrit</p>
      <div class="mep-grille">
        ${choix('police_roman', 'Police', [['Times New Roman', 'Times New Roman'], ['Garamond', 'Garamond'], ['Georgia', 'Georgia'], ['Courier New', 'Courier New']])}
        ${choix('taille_roman', 'Taille', [[11, '11 points'], [12, '12 points'], [13, '13 points']])}
        ${choix('interligne', 'Interligne', [[1.5, '1,5'], [2, 'Double']])}
        ${champ('signes', 'Signes par page', 'number', 'min="500" max="3000" step="100"')}
      </div>
      ${coche('alinea', 'Alinéa en début de paragraphe')}
      ${coche('chapitre_page', 'Chaque chapitre sur une nouvelle page')}
      ${coche('entete_roman', 'En-tête', 'auteur, titre et numéro de page')}` : ''}
      ${scenario || Roman.actif ? `
      <p class="an-label">Page de titre</p>
      ${coche('titre', 'Ajouter une page de titre')}
      <div class="mep-grille">
        ${champ('auteur', 'Auteur')}
        ${champ('version', 'Version', 'text', 'placeholder="Première version, 3 novembre 2026"')}
      </div>
      ${champ('contact', 'Contact', 'text', 'placeholder="Agent, courriel, téléphone"')}` : ''}
      ${Roman.film ? `
      <p class="an-label">Tournage</p>
      <div class="mep-grille">
        ${champ('premier_jour', 'Premier jour de tournage', 'date')}
        ${champ('debut_jour', 'Prêt à tourner, jour', 'time')}
        ${champ('debut_nuit', 'Prêt à tourner, nuit', 'time')}
        ${champ('hmc', 'HMC avant le plateau (min)', 'number', 'min="0" max="240" step="5"')}
        ${champ('decalage', 'Écart entre deux comédiens (min)', 'number', 'min="0" max="60" step="5"')}
      </div>
      <div class="mep-repos"><span class="an-label">Jours sans tournage</span>${JOURS_SEMAINE.map((j, i) => `<label><input type="checkbox" ${r.repos.includes(i) ? 'checked' : ''} onchange="MiseEnPage.basculerRepos(${i}, this.checked)"> ${j}</label>`).join('')}</div>` : ''}
      <p class="an-label">Tableau de liège</p>
      ${choix('liege_couleur', 'Couleur des cartes par défaut', [['intrigue', 'Intrigue'], ['perso', 'Personnage'], ['lieu', 'Lieu']])}
    `;
  },

  async regler(cle, valeur) {
    await this.ecrire({ [cle]: valeur });
    toast('Réglage enregistré', 'success');
  },

  // Les mots s'appliquent au chargement de l'app : on recharge pour que tout l'écran les reprenne
  async changerMots() {
    const res = await api.post('projets/mots', { slug: PROJET, haut: document.getElementById('mep-mot-haut').value, unite: document.getElementById('mep-mot-unite').value });
    if (res.error) { toast(res.error, 'error'); return; }
    await Ecriture.viderNotes?.();
    location.reload();
  },

  async basculerRepos(i, coche) {
    const r = this.lire(this.notes || Ecriture.notes);
    const repos = new Set(r.repos);
    if (coche) repos.add(i);
    else repos.delete(i);
    await this.ecrire({ repos: [...repos].sort() });
  },
};

// ─── Exporter ──────────────────────────────────────────────────────────────

const Export = {
  format: 'pdf',
  donnees: null,
  page: 0,

  _formats() {
    if (Roman.theatre) return [['pdf', 'Édition théâtrale (PDF)', 'Noms centrés en capitales, didascalies en italique, un acte par page'], ['docx', 'Édition théâtrale (.docx)', 'Les mêmes règles, modifiable dans Word ou LibreOffice']];
    if (Roman.pub) return [['pdf', 'Script image et son (PDF)', 'Pour le client : le brief, puis chaque spot en deux colonnes, minuté']];
    if (Roman.jeu) return [['twee', 'Twine (.twee)', 'Un passage par lieu, les sorties en liens, l\'inventaire en variable Harlowe'], ['ink', 'Ink (.ink)', 'Un nœud par lieu, les choix en options, les objets dans une liste']];
    return Roman.actif
      ? [['pdf', 'Manuscrit éditeur (PDF)', 'Mise en page du manuscrit, imprimé en PDF depuis le navigateur'], ['docx', 'Manuscrit éditeur (.docx)', 'Les mêmes règles, modifiable dans Word ou LibreOffice'], ['epub', 'ePub', 'Pour liseuse : table des matières, un chapitre par fichier'], ['md', 'Markdown', 'Texte brut avec les titres']]
      : [['pdf', 'PDF aux normes', 'Courier 12, marges et retraits standard, 1 page ≈ 1 minute'], ['fdx', 'Final Draft (.fdx)', 'S\'ouvre dans Final Draft, WriterDuet, Fade In, Highland'], ['fountain', 'Fountain (.fountain)', 'Texte brut, lisible partout'], ['docx', 'Word (.docx)', 'Mis en page avec les styles de scénario']];
  },

  _ids() {
    return Roman.film ? '' : Ecriture.ensemble().map(e => e.id).join(',');
  },

  async ouvrir() {
    const slot = document.getElementById('ec-export');
    if (!slot) return;
    slot.innerHTML = '<p class="an-note">Mise en page…</p>';
    if (Roman.genre) {
      if (!this._formats().some(f => f[0] === this.format)) this.format = this._formats()[0][0];
      const titre = Projets.actuel()?.nom || '';
      this.donnees = Roman.theatre ? await api.get(`ecriture_export&format=piece&ids=${this._ids()}`)
        : Roman.pub ? { titre, pub: await api.get('ecriture_pub') } : { titre, jeu: await api.get('ecriture_jeu') };
      this._rendreGenre();
      return;
    }
    const [d, revisions, film] = await Promise.all([
      api.get(`ecriture_export&format=${Roman.actif ? 'manuscrit' : 'pages'}&ids=${this._ids()}`),
      Roman.film ? api.get('ecriture_film_revisions') : [],
      Roman.film ? api.get('ecriture_film') : [],
    ]);
    this.donnees = d;
    this.revisions = revisions;
    this.film = film;
    this.page = Math.min(this.page, Math.max(0, (d.pages?.length || 1) - 1));
    this.rendre();
  },

  rendre() {
    if (Roman.genre) { this._rendreGenre(); return; }
    const slot = document.getElementById('ec-export');
    if (!slot || !this.donnees) return;
    const r = MiseEnPage.lire();
    const d = this.donnees;
    const coche = (cle, label, aide) => `<label class="mep-coche"><input type="checkbox" ${r[cle] ? 'checked' : ''} onchange="Export.regler('${cle}', this.checked)"><span>${label}<small>${aide}</small></span></label>`;
    const total = Roman.actif ? d.pages : d.total;
    slot.innerHTML = `
      <div class="ec-dep-grille">
        <section class="an-carte">
          <h2 class="an-titre">${esc(d.titre)}</h2>
          <div class="mep-formats" role="radiogroup" aria-label="Format">${this._formats().map(([k, l, aide]) => `<label class="projets-type"><input type="radio" name="export-format" value="${k}" ${k === this.format ? 'checked' : ''} onchange="Export.format = this.value; Export.rendre()"><strong>${l}</strong><small>${aide}</small></label>`).join('')}</div>
          <p class="an-label">Options</p>
          ${Roman.actif
            ? `${coche('titre', 'Page de titre', 'titre, auteur, nombre de signes')}${coche('entete_roman', 'En-tête', 'auteur, titre et numéro de page')}${coche('chapitre_page', 'Chaque chapitre sur une nouvelle page', 'avec un tiers de page blanc au-dessus du titre')}`
            : `${coche('titre', 'Page de titre', 'titre, auteur, contact, version')}${coche('numeros', 'Numéros de séquence', 'dans les deux marges')}${Roman.film ? coche('revision', 'En-tête de révision', 'couleur et date en haut des pages changées') : ''}${coche('suite', '(SUITE) entre deux pages', 'une réplique coupée continue sur la page suivante')}`}
          <div class="an-entete"><span>${Roman.actif ? 'Pages au format éditeur' : 'Pages réelles, mises en page'}</span><strong>${total} page${total > 1 ? 's' : ''}${Roman.film ? ` · ${Ecriture._minutes(d.exact)}` : ''}</strong></div>
          <p class="an-note">${Roman.actif ? `${d.signes.toLocaleString('fr-FR')} signes, espaces comprises, à ${r.signes} signes par page.` : `${Roman.film ? 'Ce compte sert aussi au minutage, aux séquences et au plan de travail.' : 'Un épisode compte à peu près une minute par page.'} Papier ${r.papier === 'Letter' ? 'US Letter' : 'A4'}, à régler dans Config → Mots, intrigues et mise en page.`}</p>
          <div class="an-ligne"><button type="button" class="btn btn-primary btn-sm" onclick="Export.exporter()">Exporter ${{ pdf: 'le PDF', fdx: 'en .fdx', fountain: 'en .fountain', docx: 'en .docx', epub: 'l\'ePub', md: 'en Markdown' }[this.format]}</button></div>
        </section>
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre">Aperçu${Roman.actif ? '' : ` · page ${this.page + 1} sur ${d.pages.length}`}</h2>
            ${Roman.actif ? '' : `<span class="an-ligne"><button type="button" class="ec-lien" ${this.page ? '' : 'disabled'} onclick="Export.voir(-1)" aria-label="Page précédente">◂</button><button type="button" class="ec-lien" ${this.page < d.pages.length - 1 ? '' : 'disabled'} onclick="Export.voir(1)" aria-label="Page suivante">▸</button></span>`}</div>
          <div class="exp-apercu">${Roman.actif ? this._pageRoman(r) : this._pageScenario(d.pages[this.page] || [], this.page, r)}</div>
        </section>
      </div>
    `;
  },

  voir(sens) {
    this.page = Math.max(0, Math.min(this.donnees.pages.length - 1, this.page + sens));
    this.rendre();
  },

  async regler(cle, valeur) {
    await MiseEnPage.ecrire({ [cle]: valeur });
    this.ouvrir();
  },

  // La révision d'une page : la dernière version figée, si une séquence de la page y est apparue
  _revisionPage(lignes) {
    const revs = this.revisions || [];
    if (revs.length < 2 || !MiseEnPage.lire().revision) return null;
    const derniere = revs[revs.length - 1];
    const avant = revs[revs.length - 2];
    const nums = new Set();
    let courant = null;
    lignes.forEach(l => { if (l[0] === 'sequence') courant = l[2]; if (courant) nums.add(courant); });
    // Une page qui commence au milieu d'une séquence en dépend aussi
    const changee = [...nums].some(n => { const s = this.film[n - 1]; return s && derniere.h.includes(s.h) && !avant.h.includes(s.h); });
    return changee ? derniere : null;
  },

  _pageScenario(lignes, n, r) {
    const rev = Roman.film ? this._revisionPage(lignes) : null;
    return `<div class="exp-page scenario ${r.papier === 'Letter' ? 'letter' : ''}">
      ${n ? `<span class="exp-num">${n + 1}.</span>` : ''}
      ${rev ? `<span class="exp-rev" style="color:${Ecriture._couleurRev(rev.couleur)}">Révision ${esc(rev.couleur.toLowerCase())} · ${new Date(rev.date.replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR')}</span>` : ''}
      ${lignes.map(([t, x, num]) => `<div class="exp-l ${t}">${esc(x) || '&nbsp;'}${t === 'sequence' && num && r.numeros ? `<span class="exp-sn g">${num}</span><span class="exp-sn d">${num}</span>` : ''}</div>`).join('')}
    </div>`;
  },

  _pageRoman(r) {
    const c = this.donnees.chapitres[0];
    if (!c) return '<p class="an-note">Aucun chapitre.</p>';
    return `<div class="exp-page roman" style="font-family:'${esc(r.police_roman)}',serif;font-size:${r.taille_roman * 0.72}px;line-height:${r.interligne}">
      ${r.entete_roman ? `<span class="exp-num">${esc(r.auteur || 'Auteur')} · ${esc(this.donnees.titre)} · 1</span>` : ''}
      <div class="exp-chap" style="margin-top:${r.chapitre_page ? '30%' : '0'}">Chapitre ${c.n}${c.titre ? `<br>${esc(c.titre)}` : ''}</div>
      ${c.paragraphes.slice(0, 14).map(p => (p === '***' ? '<p class="exp-sep">* * *</p>' : `<p style="text-indent:${r.alinea ? '1.25em' : '0'}">${esc(p)}</p>`)).join('')}
    </div>`;
  },

  // Théâtre, pub, jeu : chacun son aperçu et ses formats
  _rendreGenre() {
    const slot = document.getElementById('ec-export');
    if (!slot || !this.donnees) return;
    const r = MiseEnPage.lire();
    const d = this.donnees;
    let resume = '', apercu = '';
    if (Roman.theatre) {
      const scenes = d.piece.reduce((t, a) => t + a.scenes.length, 0);
      resume = `${d.piece.length} acte(s), ${scenes} scène(s), ${d.mots.toLocaleString('fr-FR')} mots dits.`;
      apercu = `<div class="exp-page piece">${this._htmlPiece(d.piece.slice(0, 1).map(a => ({ ...a, scenes: a.scenes.slice(0, 2) })), r)}</div>`;
    } else if (Roman.pub) {
      const eps = Ecriture.ensemble().filter(e => d.pub.spots[e.id]);
      resume = `${eps.length} spot(s), ${eps.reduce((t, e) => t + d.pub.spots[e.id].total, 0)} s en tout.`;
      apercu = `<div class="exp-page piece">${this._htmlPub(eps.slice(0, 1))}</div>`;
    } else {
      const c = d.jeu.chapitres;
      resume = `${c.reduce((t, x) => t + x.lieux.length, 0)} lieu(x) dans ${c.length} chapitre(s). Les sorties vers un lieu qui n'existe pas restent en commentaire pour que le fichier se compile.`;
      apercu = '<p class="an-note">Le fichier s\'ouvre dans Twine 2 (importer le .twee) ou dans Inky (le .ink). Les dialogues à choix sont repris tels quels : relis-les dans l\'éditeur, la logique de chaque moteur a ses usages.</p>';
    }
    slot.innerHTML = `
      <div class="ec-dep-grille">
        <section class="an-carte">
          <h2 class="an-titre">${esc(d.titre)}</h2>
          <div class="mep-formats" role="radiogroup" aria-label="Format">${this._formats().map(([k, l, aide]) => `<label class="projets-type"><input type="radio" name="export-format" value="${k}" ${k === this.format ? 'checked' : ''} onchange="Export.format = this.value; Export.rendre()"><strong>${l}</strong><small>${aide}</small></label>`).join('')}</div>
          <p class="an-note">${esc(resume)}</p>
          <div class="an-ligne"><button type="button" class="btn btn-primary btn-sm" onclick="Export.exporter()">Exporter</button></div>
        </section>
        <section class="an-carte"><h2 class="an-titre">Aperçu</h2><div class="exp-apercu">${apercu}</div></section>
      </div>`;
  },

  _htmlPiece(actes, r) {
    const romain = n => { let s = ''; [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']].forEach(([v, l]) => { while (n >= v) { s += l; n -= v; } }); return s; };
    return actes.map((a, k) => `<section class="th-acte" style="${k ? 'break-before:page;' : ''}font-family:'${esc(r.police_roman)}',serif">
      <h2>Acte ${romain(a.n)}</h2>
      ${a.scenes.map(sc => {
        let dernier = null;
        return `<h3>Scène ${romain(sc.n)}${sc.titre ? ` — ${esc(sc.titre)}` : ''}</h3>${sc.presents.length ? `<p class="th-presents">${esc(sc.presents.join(', '))}</p>` : ''}
        ${sc.evenements.map(([type, t, qui]) => {
          if (type === 'did') return `<p class="th-did">${esc(t)}</p>`;
          const nom = qui !== dernier ? `<p class="th-nom">${esc(qui)}</p>` : '';
          dernier = qui;
          return `${nom}<p class="th-rep">${esc(t)}</p>`;
        }).join('')}`;
      }).join('')}</section>`).join('');
  },

  _htmlPub(eps) {
    const d = this.donnees;
    return eps.map((e, k) => {
      const s = d.pub.spots[e.id];
      const b = objetNote(Ecriture.notes[`pub-brief:${e.sa}`]);
      return `<section class="pub-exp" style="${k ? 'break-before:page;' : ''}">
        <h2>${esc(Roman.traduire(Ecriture._code(e)))}${e.t ? ` — ${esc(e.t)}` : ''}</h2>
        <p class="pub-exp-brief">${[['Cible', b.cible], ['Message', b.message], ['Ton', b.ton], ['Durée', s ? `${s.total} s` : '']].filter(x => x[1]).map(([l, v]) => `<b>${l} :</b> ${esc(v)}`).join(' · ')}</p>
        <table><thead><tr><th>Temps</th><th>Image</th><th>Son</th></tr></thead><tbody>${(s?.plans || []).map(p => `<tr><td>${p.debut}–${p.debut + p.duree} s</td><td>${esc(p.image)}</td><td>${p.sons.map(([, qui, t]) => `<b>${esc(qui)}</b> ${esc(t)}`).join('<br>')}</td></tr>`).join('')}</tbody></table>
      </section>`;
    }).join('');
  },

  async exporter() {
    if (Roman.genre && this.format === 'pdf') { this._imprimerGenre(); return; }
    if (this.format === 'pdf') { this._imprimer(); return; }
    const res = await api.get(`ecriture_export&format=${this.format}&ids=${this._ids()}`);
    if (res.error) { toast(res.error, 'error'); return; }
    let blob;
    if (res.donnees) {
      const bin = atob(res.donnees);
      const octets = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
      blob = new Blob([octets], { type: res.type });
    } else blob = new Blob([res.texte], { type: `${res.type};charset=utf-8` });
    Storyboard._telecharger(blob, res.nom);
  },

  _imprimerGenre() {
    const r = MiseEnPage.lire();
    const d = this.donnees;
    const fenetre = window.open('', '_blank');
    if (!fenetre) { toast('Autorise les fenêtres pour ce site pour exporter en PDF', 'error'); return; }
    const corps = Roman.theatre ? this._htmlPiece(d.piece, r) : this._htmlPub(Ecriture.ensemble().filter(e => d.pub.spots[e.id]));
    const titre = r.titre ? `<div class="exp-page-titre"><b>${esc(d.titre.toUpperCase())}</b>${r.auteur ? `<br><br>${esc(r.auteur)}` : ''}${r.version ? `<br><br>${esc(r.version)}` : ''}</div>` : '';
    fenetre.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(d.titre)}</title><style>
      @page { size: ${r.papier === 'Letter' ? 'letter' : 'A4'}; margin: 2.2cm; } body { font: 12pt Georgia, serif; color: #000; margin: 0; }
      .exp-page-titre { text-align: center; padding-top: 30vh; break-after: page; font-size: 16pt; }
      ${GENRE_CSS}
    </style></head><body>${titre}${corps}<script>window.onload = () => setTimeout(() => print(), 300)<\/script></body></html>`);
    fenetre.document.close();
  },

  _imprimer() {
    const r = MiseEnPage.lire();
    const d = this.donnees;
    const fenetre = window.open('', '_blank');
    if (!fenetre) { toast('Autorise les fenêtres pour ce site pour exporter en PDF', 'error'); return; }
    const titre = r.titre ? `<div class="exp-page ${Roman.actif ? 'roman' : 'scenario'} ${r.papier === 'Letter' ? 'letter' : ''} titre"><div class="exp-titre"><b>${esc(d.titre.toUpperCase())}</b>${r.auteur ? `<br><br>${Roman.actif ? '' : (r.mentions === 'en' ? 'Written by' : 'Écrit par')}<br>${esc(r.auteur)}` : ''}${r.version ? `<br><br>${esc(r.version)}` : ''}${Roman.actif ? `<br><br>${d.signes.toLocaleString('fr-FR')} signes` : ''}</div>${r.contact ? `<div class="exp-contact">${esc(r.contact)}</div>` : ''}</div>` : '';
    const corps = Roman.actif
      ? d.chapitres.map((c, i) => `<section class="exp-flux roman" style="font-family:'${esc(r.police_roman)}',serif;font-size:${r.taille_roman}pt;line-height:${r.interligne};${r.chapitre_page && (i || r.titre) ? 'break-before:page;' : ''}"><div class="exp-chap" style="margin-top:${r.chapitre_page ? '8cm' : '1cm'}">Chapitre ${c.n}${c.titre ? `<br>${esc(c.titre)}` : ''}</div>${c.paragraphes.map(p => (p === '***' ? '<p class="exp-sep">* * *</p>' : `<p style="text-indent:${r.alinea ? '1.25cm' : '0'}">${esc(p)}</p>`)).join('')}</section>`).join('')
      : d.pages.map((p, i) => this._pageScenario(p, i, r)).join('');
    const format = r.papier === 'Letter' ? 'letter' : 'A4';
    fenetre.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(d.titre)}</title><style>
      @page { size: ${format}; margin: ${Roman.actif ? '2.5cm 2.5cm 2.5cm 2.5cm' : '0'}; ${Roman.actif && r.entete_roman ? `@top-right { content: "${cssTexte(r.auteur)} · ${cssTexte(d.titre)} · " counter(page); font: 9pt serif; }` : ''} }
      body { margin: 0; color: #000; }
      ${EXPORT_CSS}
      .exp-page { box-shadow: none; margin: 0; break-after: page; }
      .exp-flux p { margin: 0; text-align: justify; }
    </style></head><body>${titre}${corps}<script>window.onload = () => setTimeout(() => print(), 400)<\/script></body></html>`);
    fenetre.document.close();
  },
};

// Une page de scénario à l'échelle réelle : Courier 12, 6 lignes par pouce, retraits standard
const EXPORT_CSS = `
  .exp-page.scenario { position: relative; box-sizing: border-box; width: 8.27in; height: 11.69in; padding: 1in 1in 0 1.5in; font: 12pt/12pt 'Courier New', Courier, monospace; background: #fff; color: #000; overflow: hidden; }
  .exp-page.scenario.letter { width: 8.5in; height: 11in; }
  .exp-l { white-space: pre; height: 12pt; position: relative; }
  .exp-l.personnage, .exp-l.suite { margin-left: 2.2in; }
  .exp-l.parenthese { margin-left: 1.6in; }
  .exp-l.dialogue { margin-left: 1in; }
  .exp-l.transition { text-align: right; padding-right: 0; }
  .exp-l.episode { text-align: center; text-decoration: underline; }
  .exp-sn { position: absolute; top: 0; }
  .exp-sn.g { left: -0.75in; }
  .exp-sn.d { left: 6.3in; }
  .exp-num { position: absolute; top: 0.5in; right: 1in; font-size: 12pt; }
  .exp-rev { position: absolute; top: 0.5in; left: 1.5in; font-size: 10pt; }
  .exp-titre { position: absolute; top: 3.5in; left: 0; right: 0; text-align: center; line-height: 1.4; }
  .exp-contact { position: absolute; bottom: 1in; left: 1.5in; white-space: pre-line; }
  .exp-page.roman { position: relative; box-sizing: border-box; background: #fff; color: #000; }
  .exp-chap { text-align: center; margin-bottom: 2em; }
  .exp-sep { text-align: center; text-indent: 0; }
`;

// L'édition théâtrale et le script de pub, à l'écran comme à l'impression
const GENRE_CSS = `
  .th-acte h2 { text-align: center; text-transform: uppercase; letter-spacing: 2px; font-size: 14pt; margin: 1.5em 0 1em; }
  .th-acte h3 { text-align: center; font-size: 12pt; margin: 1.4em 0 0.3em; }
  .th-presents { text-align: center; font-style: italic; text-transform: uppercase; font-size: 10pt; margin: 0 0 1em; }
  .th-nom { text-align: center; text-transform: uppercase; letter-spacing: 1px; margin: 0.9em 0 0.1em; font-size: 11pt; }
  .th-rep { margin: 0; text-align: justify; }
  .th-did { font-style: italic; margin: 0.4em 0 0.4em 2em; }
  .pub-exp h2 { font-size: 14pt; margin: 0 0 4mm; } .pub-exp-brief { font-size: 10pt; margin: 0 0 5mm; }
  .pub-exp table { width: 100%; border-collapse: collapse; font-size: 10pt; } .pub-exp th, .pub-exp td { border: 1px solid #999; padding: 2mm; vertical-align: top; text-align: left; }
  .pub-exp td:first-child { width: 18mm; white-space: nowrap; }
`;

// ─── Tableau de liège ──────────────────────────────────────────────────────

const Liege = {
  cartes: [],
  ordre: [],
  sel: null,
  mode: null,
  _glisse: null,

  _ids() {
    return Roman.film ? Ecriture.ordre.map(e => e.id).join(',') : String(Ecriture.epId);
  },

  async ouvrir() {
    const slot = document.getElementById('ec-liege');
    if (!slot) return;
    this.cartes = await api.get(`ecriture_liege&ids=${this._ids()}`);
    this.ordre = this.cartes.map(c => ({ ...c, cible: c.e }));
    this.mode = this.mode || MiseEnPage.lire().liege_couleur;
    if (!this.cartes.some(c => `${c.e}:${c.k}` === this.sel)) this.sel = this.cartes[0] ? `${this.cartes[0].e}:${this.cartes[0].k}` : null;
    this.rendre();
  },

  _meta(c) {
    return objetNote(Ecriture.notes[`liege:${c.h}`]);
  },

  _couleur(c) {
    if (this.mode === 'perso') return c.persos[0] ? Analyse._couleur(c.persos[0]) : '#b0b0b0';
    if (this.mode === 'lieu') {
      const lieu = (c.titre.match(/^(?:INT\.?\/EXT\.?|INT\.?|EXT\.?)\s*([^—–-]+)/i)?.[1] || c.titre).trim();
      let h = 0;
      for (const ch of lieu) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      return LIEGE_PALETTE[h % LIEGE_PALETTE.length];
    }
    const intrigues = Intrigues.details();
    return (intrigues.find(i => i.l === (this._meta(c).tag || 'A')) || intrigues[0]).couleur;
  },

  _groupes() {
    if (!Roman.film) return [{ id: Ecriture.epId, l: Roman.traduire(Ecriture._code(Ecriture.ordre[Ecriture.rang.get(Ecriture.epId)])) }];
    return Ecriture.ordre.filter(e => this.cartes.some(c => c.e === e.id)).map(e => ({ id: e.id, l: Roman.traduire(Ecriture._code(e)) }));
  },

  _cle: c => `${c.e}:${c.k}`,

  // Les cartes qui passent avant une carte dont elles dépendent
  _conflits() {
    const rang = new Map(this.ordre.map((c, i) => [c.h, i]));
    return this.ordre.flatMap((c, i) => {
      const apres = this._meta(c).apres;
      if (!apres || !rang.has(apres) || rang.get(apres) < i) return [];
      return [[c, this.ordre[rang.get(apres)]]];
    });
  },

  rendre() {
    const slot = document.getElementById('ec-liege');
    if (!slot) return;
    if (!this.cartes.length) { slot.innerHTML = '<section class="an-carte"><p class="an-note">Rien à étaler : il faut d\'abord un texte.</p></section>'; return; }
    let n = 0;
    const unite = Roman.film ? 'Séq.' : Roman.bd ? 'Case' : 'Scène';
    const groupes = this._groupes().map(g => `
      <div class="lg-groupe" data-groupe="${g.id}">
        ${Roman.film ? `<span class="lg-titre">${esc(g.l)}</span>` : ''}
        <div class="lg-cartes">${this.ordre.filter(c => c.cible === g.id).map(c => {
          n++;
          const m = this._meta(c);
          const on = this._cle(c) === this.sel;
          return `<button type="button" class="lg-carte ${on ? 'actif' : ''}" draggable="true" data-cle="${this._cle(c)}" aria-pressed="${on}" style="border-top-color:${this._couleur(c)}" onclick="Liege.choisir('${this._cle(c)}')">
            <strong>${unite} ${n} · <span class="vo-brut">${esc(m.titre || c.titre)}</span></strong>
            <span class="lg-resume vo-brut">${esc(m.resume || c.extrait)}</span>
            <small>${c.pages ? `${Ecriture._pages(c.pages)} p.` : `${c.mots} mots`}${c.persos.length ? ` · ${esc(c.persos.join(', '))}` : ''}</small>
          </button>`;
        }).join('')}<span class="lg-fin" data-fin="${g.id}" aria-hidden="true"></span></div>
      </div>`).join('');
    const sel = this.ordre.find(c => this._cle(c) === this.sel);
    const m = sel ? this._meta(sel) : {};
    const bouge = this.ordre.some((c, i) => c.e !== this.cartes[i].e || c.k !== this.cartes[i].k || c.cible !== c.e);
    const conflits = this._conflits();
    slot.innerHTML = `
      <div class="an-ligne lg-barre"><span class="an-label">Couleur selon</span>
        <div class="ec-modes" role="group" aria-label="Couleur des cartes">${[['intrigue', 'Intrigue'], ['perso', 'Personnage'], ['lieu', 'Lieu']].map(([k, l]) => `<button type="button" class="ec-mode ${k === this.mode ? 'actif' : ''}" aria-pressed="${k === this.mode}" onclick="Liege.mode = '${k}'; Liege.rendre()">${l}</button>`).join('')}</div></div>
      <div class="lg-tableau" id="lg-tableau">${groupes}</div>
      <div class="ec-dep-grille">
        ${sel ? `<section class="an-carte">
          <h2 class="an-titre">Carte choisie</h2>
          <div class="an-ligne"><button type="button" class="btn btn-secondary btn-sm" onclick="Liege.deplacer(-1)">◂ Avancer</button><button type="button" class="btn btn-secondary btn-sm" onclick="Liege.deplacer(1)">Reculer ▸</button>
            ${Roman.film ? '<button type="button" class="btn btn-secondary btn-sm" onclick="Liege.changerGroupe(-1)">Acte précédent</button><button type="button" class="btn btn-secondary btn-sm" onclick="Liege.changerGroupe(1)">Acte suivant</button>' : ''}</div>
          <label class="sb-champ" for="lg-titre"><span class="an-label">Titre de la carte</span><input id="lg-titre" type="text" value="${esc(m.titre || '')}" placeholder="${esc(sel.titre)}" onchange="Liege.noter('titre', this.value)"></label>
          <label class="sb-champ" for="lg-resume"><span class="an-label">Résumé</span><textarea id="lg-resume" rows="2" placeholder="${esc(sel.extrait)}" onchange="Liege.noter('resume', this.value)">${esc(m.resume || '')}</textarea></label>
          <div class="sb-champs">
            <label class="sb-champ" for="lg-tag"><span class="an-label">Intrigue</span><select id="lg-tag" onchange="Liege.noter('tag', this.value)">${Intrigues.details().map(i => `<option value="${i.l}" ${(m.tag || 'A') === i.l ? 'selected' : ''}>${i.l}${i.nom ? ` · ${esc(i.nom)}` : ''}</option>`).join('')}</select></label>
            <label class="sb-champ" for="lg-apres"><span class="an-label">Doit venir après</span><select id="lg-apres" onchange="Liege.noter('apres', this.value)"><option value="">Rien</option>${this.ordre.filter(c => c !== sel).map(c => `<option value="${c.h}" ${m.apres === c.h ? 'selected' : ''}>${esc((this._meta(c).titre || c.titre).slice(0, 50))}</option>`).join('')}</select></label>
          </div>
          <p class="an-note">Tire une carte sur une autre pour la placer devant, ou au bout d'une rangée. Le titre, le résumé et l'intrigue restent attachés à la carte quand elle bouge.</p>
        </section>` : ''}
        <section class="an-carte">
          <h2 class="an-titre">Avant d'écrire le nouvel ordre</h2>
          <ul class="ec-liste">${!bouge ? '<li><span>Rien n\'a bougé : le texte est dans cet ordre.</span></li>' : `
            <li><span>✓ Les ${Roman.film ? 'séquences' : Roman.bd ? 'cases' : 'scènes'} sont renumérotées${Roman.film ? ' ; une version figée garde ses anciens numéros' : ''}.</span></li>
            <li><span>✓ Les plans du storyboard et leur plan au sol suivent leur ${Roman.film ? 'séquence' : Roman.bd ? 'case' : 'scène'}.</span></li>
            ${conflits.map(([c, d]) => `<li class="ec-orange"><span>« ${esc(this._meta(c).titre || c.titre)} » passe avant « ${esc(this._meta(d).titre || d.titre)} », alors qu'elle doit venir après.</span></li>`).join('')}
            ${conflits.length ? '' : '<li><span>✓ Aucune carte ne passe avant une carte dont elle dépend.</span></li>'}`}</ul>
          <div class="an-ligne"><button type="button" class="btn btn-primary btn-sm" ${bouge ? '' : 'disabled'} onclick="Liege.appliquer()">Réécrire le texte dans cet ordre</button><button type="button" class="btn btn-ghost btn-sm" ${bouge ? '' : 'disabled'} onclick="Liege.annuler()">Revenir à l'ordre du texte</button></div>
        </section>
      </div>
    `;
    this._brancher();
  },

  choisir(cle) {
    if (!this.ordre.some(c => this._cle(c) === cle)) return;
    this.sel = cle;
    this.rendre();
  },

  noter(cle, valeur) {
    const c = this.ordre.find(x => this._cle(x) === this.sel);
    if (!c) return;
    const m = this._meta(c);
    if (valeur) m[cle] = valeur;
    else delete m[cle];
    Ecriture.noterPlusTard(`liege:${c.h}`, Object.keys(m).length ? JSON.stringify(m) : '');
    this.rendre();
  },

  deplacer(sens) {
    const i = this.ordre.findIndex(c => this._cle(c) === this.sel);
    const j = i + sens;
    if (i < 0 || j < 0 || j >= this.ordre.length) return;
    const c = this.ordre[i];
    // En bout d'acte, la carte passe dans l'acte voisin
    if (this.ordre[j].cible !== c.cible) { c.cible = this.ordre[j].cible; this.rendre(); return; }
    [this.ordre[i], this.ordre[j]] = [this.ordre[j], this.ordre[i]];
    this.rendre();
  },

  changerGroupe(sens) {
    const groupes = this._groupes().map(g => g.id);
    const c = this.ordre.find(x => this._cle(x) === this.sel);
    if (!c) return;
    const g = groupes[groupes.indexOf(c.cible) + sens];
    if (!g) return;
    this.ordre = this.ordre.filter(x => x !== c);
    // Elle arrive au début de l'acte suivant, ou à la fin de l'acte précédent
    const idx = sens > 0 ? this.ordre.findIndex(x => x.cible === g) : this.ordre.map(x => x.cible).lastIndexOf(g) + 1;
    c.cible = g;
    this.ordre.splice(idx < 0 ? this.ordre.length : idx, 0, c);
    this.rendre();
  },

  _brancher() {
    const tableau = document.getElementById('lg-tableau');
    tableau.querySelectorAll('.lg-carte').forEach(el => {
      el.addEventListener('dragstart', e => { this._glisse = el.dataset.cle; e.dataTransfer.effectAllowed = 'move'; el.classList.add('glisse'); });
      el.addEventListener('dragend', () => { el.classList.remove('glisse'); this._glisse = null; });
    });
    tableau.querySelectorAll('.lg-carte, .lg-fin').forEach(el => {
      el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('vise'); });
      el.addEventListener('dragleave', () => el.classList.remove('vise'));
      el.addEventListener('drop', e => {
        e.preventDefault();
        el.classList.remove('vise');
        // Une carte lâchée sur elle-même, ou un fichier venu d'ailleurs, ne bouge rien
        if (!this._glisse || el.dataset.cle === this._glisse) return;
        const c = this.ordre.find(x => this._cle(x) === this._glisse);
        this._glisse = null;
        if (!c) return;
        this.ordre = this.ordre.filter(x => x !== c);
        if (el.dataset.fin) {
          c.cible = Number(el.dataset.fin);
          const dernier = this.ordre.map(x => x.cible).lastIndexOf(c.cible);
          const apresGroupe = dernier >= 0 ? dernier + 1 : this.ordre.findIndex(x => this._groupes().findIndex(g => g.id === x.cible) > this._groupes().findIndex(g => g.id === c.cible));
          this.ordre.splice(apresGroupe < 0 ? this.ordre.length : apresGroupe, 0, c);
        } else {
          const cible = this.ordre.find(x => this._cle(x) === el.dataset.cle);
          c.cible = cible.cible;
          this.ordre.splice(this.ordre.indexOf(cible), 0, c);
        }
        this.sel = this._cle(c);
        this.rendre();
      });
    });
  },

  annuler() {
    this.ordre = this.cartes.map(c => ({ ...c, cible: c.e }));
    this.rendre();
  },

  async appliquer() {
    const conflits = this._conflits();
    if (conflits.length && !confirm(`${conflits.length} carte(s) passent avant une carte dont elles dépendent. Réécrire quand même ?`)) return;
    if (this._envoi) return;
    this._envoi = true;
    const res = await api.post('ecriture_liege', { ordre: this.ordre.map(c => [c.cible, c.k, c.e, c.h]) }).finally(() => { this._envoi = false; });
    if (res.error) { toast(res.error, 'error'); return; }
    toast('Nouvel ordre écrit', 'success');
    window.DataStore?.invalidateForMutation('upload');
    const vue = Ecriture.vue;
    await Ecriture.init();
    if (Ecriture.vue !== vue) Ecriture.aller(vue);
  },
};

// ─── Tournage : casting, disponibilités, feuilles de service ───────────────

const Tournage = {
  jour: 0,

  _casting() {
    const c = objetNote(Ecriture.notes.casting);
    // Chaque rôle doit être un objet avec une liste de jours pris
    Object.keys(c).forEach(n => { if (!c[n] || typeof c[n] !== 'object') c[n] = {}; if (!Array.isArray(c[n].indispo)) c[n].indispo = []; });
    return c;
  },

  _garder(casting) {
    Ecriture.noterPlusTard('casting', JSON.stringify(casting));
  },

  // Les dates des jours de tournage, en sautant les jours de repos
  _dates(n, r) {
    if (!r.premier_jour) return Array.from({ length: n }, () => null);
    const dates = [];
    const d = new Date(`${r.premier_jour}T12:00:00`);
    while (dates.length < n) {
      if (!r.repos.includes(d.getDay())) dates.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    return dates;
  },

  _cleJour(i, dates) {
    return dates[i] || `J${i + 1}`;
  },

  _heure(h, decale) {
    const [a, b] = String(h || '08:00').split(':').map(Number);
    const m = (((a * 60 + b + decale) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')} h ${String(m % 60).padStart(2, '0')}`;
  },

  async ouvrir() {
    const slot = document.getElementById('ec-tournage');
    if (!slot) return;
    if (!Ecriture.film) Ecriture.film = await api.get('ecriture_film');
    this.fiches = await api.get('ecriture_sb_fiches');
    this.rendre();
  },

  _photo(nom) {
    const f = (this.fiches || []).find(x => x.d.perso === nom && x.d.vue === 'photo' && x.image);
    return f ? Storyboard._url(f) : null;
  },

  _feuille(i, jours, dates, r, casting) {
    const j = jours[i];
    if (!j) return '';
    const nuit = j.blocs.some(b => b.g.moment === 'NUIT');
    const pat = nuit ? r.debut_nuit : r.debut_jour;
    const appeles = [...new Set(j.blocs.flatMap(b => [...b.g.persos]))];
    const cle = this._cleJour(i, dates);
    const pris = appeles.filter(n => (casting[n]?.indispo || []).includes(cle));
    const seqs = j.blocs.flatMap(b => b.g.seqs.map(s => ({ s, suite: b.suite })));
    const vus = new Set();
    return `
      <div class="ts-feuille">
        <div class="ts-tete"><strong>FEUILLE DE SERVICE · JOUR ${i + 1}</strong><span>${dates[i] ? new Date(`${dates[i]}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' }) : 'date à fixer'} · ${nuit ? 'nuit' : 'jour'}</span></div>
        <div class="ts-ligne"><span>Prêt à tourner : <strong>${this._heure(pat, 0)}</strong></span><span>Décor${j.blocs.length > 1 ? 's' : ''} : <strong>${esc([...new Set(j.blocs.map(b => b.g.decor))].join(' / '))}</strong></span><span>${Ecriture._pages(j.pages)} p.</span></div>
        <span class="ts-label">SÉQUENCES</span>
        ${seqs.filter(x => !vus.has(x.s.g) && vus.add(x.s.g)).map(({ s, suite }) => `<div class="ts-seq"><span>Séq. ${s.g + 1}</span><span>${esc(s.slug)}${suite ? ' (suite)' : ''}</span><span>${Ecriture._pages(s.pages)} p.</span></div>`).join('')}
        <span class="ts-label">COMÉDIENS</span>
        ${appeles.map((n, k) => `<div class="ts-appel ${pris.includes(n) ? 'pris' : ''}"><span>${esc(n)}${casting[n]?.comedien ? ` · ${esc(casting[n].comedien)}` : ''}</span><span>HMC ${this._heure(pat, -r.hmc + k * r.decalage)}</span><span>Plateau ${this._heure(pat, k * r.decalage)}</span></div>`).join('') || '<p>Aucun personnage ne parle ce jour-là.</p>'}
        ${pris.length ? `<div class="ts-conflit">${pris.map(n => `${esc(n)}${casting[n]?.comedien ? ` (${esc(casting[n].comedien)})` : ''} n'est pas libre ce jour-là`).join(' · ')}. Change sa disponibilité, ou déplace la séquence dans le plan de travail.</div>` : ''}
        <p class="ts-note">HMC : habillage, maquillage, coiffure, ${r.hmc} min avant le plateau. Heures et jours de repos dans Config → Mots, intrigues et mise en page.</p>
      </div>`;
  },

  rendre() {
    const slot = document.getElementById('ec-tournage');
    if (!slot) return;
    const r = MiseEnPage.lire();
    const { jours } = Ecriture._joursTravail();
    const dates = this._dates(jours.length, r);
    const casting = this._casting();
    this.jour = Math.min(this.jour, Math.max(0, jours.length - 1));
    const compte = new Map();
    Ecriture.film.forEach(s => Object.entries(s.repliques || {}).forEach(([n, v]) => compte.set(n, (compte.get(n) || 0) + v)));
    const roles = [...compte.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 30);
    const conflits = jours.reduce((a, j, i) => a + [...new Set(j.blocs.flatMap(b => [...b.g.persos]))].filter(n => (casting[n]?.indispo || []).includes(this._cleJour(i, dates))).length, 0);
    slot.innerHTML = `
      <div class="an-ligne ts-jours" role="group" aria-label="Jour de tournage">${jours.map((j, i) => `<button type="button" class="btn btn-sm ${i === this.jour ? 'btn-primary' : 'btn-secondary'}" aria-pressed="${i === this.jour}" onclick="Tournage.jour = ${i}; Tournage.rendre()">Jour ${i + 1}</button>`).join('')}</div>
      <div class="ec-dep-grille">
        <section class="an-carte">
          <div class="an-entete"><h2 class="an-titre">Casting et disponibilités</h2><span class="an-note">${roles.length} rôle(s)${conflits ? ` · <span class="ec-orange">${conflits} conflit(s)</span>` : ''}</span></div>
          <div class="an-table"><table class="ts-casting">
            <thead><tr><th scope="col">Rôle</th><th scope="col">Comédien</th>${jours.map((j, i) => `<th scope="col" title="${dates[i] || ''}">J${i + 1}</th>`).join('')}</tr></thead>
            <tbody>${roles.map((n, ri) => {
              const c = casting[n] || {};
              const photo = this._photo(n);
              return `<tr><td><span class="ts-role">${photo ? `<img src="${photo}" alt="">` : `<span class="ts-ini" style="background:${Analyse._couleur(n)}">${esc(n.charAt(0))}</span>`}<span>${esc(n)}<label class="ec-lien sb-fichier">photo<input type="file" accept="image/png,image/jpeg,image/webp" onchange="Tournage.photo(${ri}, this.files[0])"></label></span></span></td>
                <td><input type="text" aria-label="Comédien pour ${esc(n)}" value="${esc(c.comedien || '')}" placeholder="Nom" onchange="Tournage.regler(${ri}, 'comedien', this.value)"><input type="text" aria-label="Contact de ${esc(n)}" value="${esc(c.contact || '')}" placeholder="Agent, contact" onchange="Tournage.regler(${ri}, 'contact', this.value)"></td>
                ${jours.map((j, i) => {
                  const appele = j.blocs.some(b => b.g.persos.has(n));
                  const pris = (c.indispo || []).includes(this._cleJour(i, dates));
                  return `<td><button type="button" class="ts-dispo ${appele ? 'appele' : ''} ${pris ? 'pris' : ''}" style="--c:${Analyse._couleur(n)}" aria-pressed="${!pris}" aria-label="${esc(n)}, jour ${i + 1} : ${pris ? 'pas libre' : 'libre'}${appele ? ', appelé' : ''}" onclick="Tournage.basculer(${ri}, ${i})"></button></td>`;
                }).join('')}</tr>`;
            }).join('')}</tbody>
          </table></div>
          <p class="an-note">Case teintée : libre ; pleine : libre et appelé ce jour-là ; bord orange : appelé alors qu'il n'est pas libre. Clique pour changer.${r.premier_jour ? '' : ' Fixe le premier jour de tournage dans Config pour avoir les dates.'}</p>
          <div class="an-ligne"><button type="button" class="btn btn-secondary btn-sm" onclick="Tournage.imprimer(false)">Feuille du jour ${this.jour + 1} en PDF</button><button type="button" class="btn btn-ghost btn-sm" onclick="Tournage.imprimer(true)">Toutes les feuilles du tournage</button></div>
        </section>
        <section class="an-carte ts-papier">${jours.length ? this._feuille(this.jour, jours, dates, r, casting) : '<p class="an-note">Pas encore de plan de travail : importe le scénario.</p>'}</section>
      </div>
    `;
    this._roles = roles;
  },

  regler(ri, cle, valeur) {
    const casting = this._casting();
    const n = this._roles[ri];
    casting[n] = { ...(casting[n] || {}), [cle]: valeur };
    this._garder(casting);
    this.rendre();
  },

  basculer(ri, i) {
    const r = MiseEnPage.lire();
    const casting = this._casting();
    const n = this._roles[ri];
    const cle = this._cleJour(i, this._dates(Ecriture._joursTravail().jours.length, r));
    const indispo = new Set(casting[n]?.indispo || []);
    if (indispo.has(cle)) indispo.delete(cle);
    else indispo.add(cle);
    casting[n] = { ...(casting[n] || {}), indispo: [...indispo] };
    this._garder(casting);
    this.rendre();
  },

  async photo(ri, fichier) {
    if (!fichier) return;
    const nom = this._roles[ri];
    let f = (this.fiches || []).find(x => x.d.perso === nom && x.d.vue === 'photo');
    if (!f) {
      f = await api.post('ecriture_sb', { action: 'enregistrer', episode_id: 0, scene: 0, d: { fiche: true, perso: nom, vue: 'photo' } });
      this.fiches.push(f);
    }
    const octets = new Uint8Array(await fichier.arrayBuffer());
    let binaire = '';
    for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
    const res = await api.post('ecriture_sb', { action: 'image', id: f.id, type: fichier.type, donnees: btoa(binaire) });
    if (res.error) { toast(res.error, 'error'); return; }
    Object.assign(f, res);
    this.rendre();
  },

  imprimer(tout) {
    const r = MiseEnPage.lire();
    const { jours } = Ecriture._joursTravail();
    const dates = this._dates(jours.length, r);
    const casting = this._casting();
    const feuilles = (tout ? jours.map((j, i) => i) : [this.jour]).map(i => this._feuille(i, jours, dates, r, casting)).join('');
    const fenetre = window.open('', '_blank');
    if (!fenetre) { toast('Autorise les fenêtres pour ce site pour exporter en PDF', 'error'); return; }
    fenetre.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Feuilles de service</title><style>
      @page { size: A4; margin: 15mm; } body { font: 11pt system-ui, sans-serif; color: #111; margin: 0; }
      .ts-feuille { break-after: page; display: flex; flex-direction: column; gap: 8px; }
      .ts-tete, .ts-ligne { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; } .ts-tete strong { font-size: 15pt; }
      .ts-ligne { border-top: 1px solid #999; padding-top: 6px; }
      .ts-label { font-size: 8pt; letter-spacing: 1px; color: #666; margin-top: 8px; }
      .ts-seq, .ts-appel { display: grid; grid-template-columns: 70px 1fr 110px; gap: 10px; } .ts-appel { grid-template-columns: 1fr 110px 120px; }
      .ts-appel.pris { color: #b35a00; } .ts-conflit { background: #fbe6cf; border-left: 3px solid #c46a12; padding: 6px 10px; } .ts-note { color: #666; font-size: 9pt; }
    </style></head><body>${feuilles}<script>window.onload = () => setTimeout(() => print(), 300)<\/script></body></html>`);
    fenetre.document.close();
  },
};
