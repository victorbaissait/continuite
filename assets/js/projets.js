// assets/js/projets.js — Changer de projet ; chaque projet garde ses données et ses réglages

const PROJETS_PROPRES = ['Épisodes et scripts', 'Personnages et décors', 'Brouillons et notes', 'Mémoire et plan', 'Onglets et listes', 'Thème et couleurs', 'Typographie', 'Sauvegardes'];
const PROJETS_CLES_NAVIGATEUR = ['lemenu_theme', 'cfg_mots_par_minute'];

const Projets = {
  liste: [],
  corbeille: [],
  menuOuvert: false,
  fichiers: [],
  manuscrit: [],
  nomsImport: [],

  async charger() {
    this.liste = await api.get('projets');
    Roman.appliquer(this.actuel());
    // Le projet retenu a été retiré ailleurs : on revient au projet d'origine plutôt que d'échouer
    if (!this.liste.some(p => p.slug === PROJET)) this.changer('');
    document.addEventListener('mousedown', event => {
      if (this.menuOuvert && !event.target.closest('#projets-menu, #projets-bouton')) this.fermerMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.menuOuvert) this.fermerMenu(true);
    });
  },

  actuel() {
    return this.liste.find(p => p.slug === PROJET);
  },

  // Chaque projet se décrit avec ses propres mots, même ouvert depuis un autre
  _resume(p) {
    const [unite, texte] = { roman: ['chapitre', 'texte'], film: ['acte', 'scénario'], bd: ['planche', 'scénario'], theatre: ['scène', 'texte'], pub: ['spot', 'script'], jeu: ['lieu', 'script'] }[p.type] || ['épisode', 'script'];
    const forme = (FORMES_TYPE[p.type] || []).find(f => f[0] === p.forme)?.[1];
    const genre = {
      theatre: `Théâtre${forme ? ` · ${forme.toLowerCase()}` : ''}`,
      pub: `Pub${forme ? ` · ${forme}` : ''}`,
      jeu: forme || 'Jeu vidéo',
      roman: p.livres === 'plusieurs' ? 'Série de romans' : 'Roman',
      film: p.forme === 'court' ? 'Court métrage' : 'Long métrage',
      bd: `${p.livres === 'plusieurs' ? 'Série de BD' : 'BD'} ${BD_FORMATS_NOMS[p.format] || ''}`.trim(),
    }[p.type] || 'Série TV';
    if (!p.episodes) return `${genre} · 0 ${unite}`;
    return `${genre} · ${p.episodes} ${unite === 'lieu' && p.episodes > 1 ? 'lieux' : unite + (p.episodes > 1 ? 's' : '')} · ${p.scripts} ${texte}${p.scripts > 1 ? 's' : ''}${p.storyboard ? ' · storyboard' : ''}`;
  },

  basculerMenu() {
    if (this.menuOuvert) this.fermerMenu();
    else this.ouvrirMenu();
  },

  ouvrirMenu() {
    const menu = document.getElementById('projets-menu');
    menu.innerHTML = `
      ${this.liste.map(p => `
        <button type="button" role="menuitem" class="projets-entree ${p.slug === PROJET ? 'actif' : ''}" onclick="Projets.changer('${esc(p.slug)}')">
          <span>${p.slug === PROJET ? '✓ ' : ''}${esc(p.nom)}</span><small class="vo-brut">${esc(this._resume(p))}</small>
        </button>`).join('')}
      <div class="projets-separe"></div>
      <button type="button" role="menuitem" class="projets-entree projets-action" onclick="Projets.gerer()">+ Nouveau projet</button>
      <button type="button" role="menuitem" class="projets-entree" onclick="Projets.gerer()">Gérer les projets</button>
    `;
    menu.hidden = false;
    this.menuOuvert = true;
    document.getElementById('projets-bouton').setAttribute('aria-expanded', 'true');
    menu.querySelector('button').focus();
  },

  fermerMenu(rendreFocus = false) {
    document.getElementById('projets-menu').hidden = true;
    this.menuOuvert = false;
    const bouton = document.getElementById('projets-bouton');
    bouton.setAttribute('aria-expanded', 'false');
    if (rendreFocus) bouton.focus();
  },

  async gerer() {
    this.fermerMenu();
    switchTab('settings');
    localStorage.setItem(cleProjet(TAB_STORAGE_KEY), 'settings');
    await initTab('settings');
    document.getElementById('projets-panel')?.scrollIntoView({ block: 'start' });
    document.getElementById('projet-nom')?.focus();
  },

  // Le texte en attente part d'abord dans le projet ouvert, puis la page repart sur le nouveau
  async changer(slug) {
    if (typeof Ecriture !== 'undefined') await Ecriture.viderNotes();
    try {
      if (slug) localStorage.setItem('lemenu_projet', slug);
      else localStorage.removeItem('lemenu_projet');
    } catch (e) {}
    location.reload();
  },

  async rendrePanel() {
    const panel = document.getElementById('projets-panel');
    if (!panel) return;
    this.corbeille = await api.get('projets/corbeille');
    panel.innerHTML = `
      <div class="projets-config">
        <div class="projets-colonne">
          <div class="projets-liste">
            ${this.liste.map(p => `
              <div class="projets-ligne">
                <div><strong>${esc(p.nom)}</strong><small class="vo-brut">${esc(this._resume(p))}${p.slug === PROJET ? ' · projet ouvert' : ''}</small></div>
                <div class="projets-actions">
                  ${p.slug === PROJET ? '' : `<button type="button" class="ec-lien" onclick="Projets.changer('${esc(p.slug)}')">Ouvrir</button>`}
                  <button type="button" class="ec-lien" onclick="Projets.renommer('${esc(p.slug)}')">Renommer</button>
                  <button type="button" class="ec-lien" onclick="Projets.dupliquer('${esc(p.slug)}')">Dupliquer</button>
                  ${p.type === 'roman' ? `<button type="button" class="ec-lien vo-brut" onclick="Projets.changerLivres('${esc(p.slug)}')">${p.livres === 'plusieurs' ? 'Passer en roman seul' : 'Passer en série de romans'}</button>` : ''}
                  ${p.type === 'roman' && p.scripts ? `<button type="button" class="ec-lien vo-brut" onclick="Projets.adapter('${esc(p.slug)}')">Adapter en scénario</button>` : ''}
                  ${p.type === 'bd' ? `<button type="button" class="ec-lien vo-brut" onclick="Projets.changerLivres('${esc(p.slug)}')">${p.livres === 'plusieurs' ? 'Passer en album seul' : 'Passer en série d\'albums'}</button>` : ''}
                  <button type="button" class="ec-lien vo-brut" onclick="Projets.basculerStoryboard('${esc(p.slug)}')">${p.storyboard ? 'Retirer le storyboard' : 'Ajouter le storyboard'}</button>
                  ${p.slug && p.slug !== PROJET ? `<button type="button" class="ec-lien" onclick="Projets.retirer('${esc(p.slug)}')">Retirer</button>` : ''}
                </div>
              </div>`).join('')}
          </div>
          <p class="an-label">Propre à chaque projet</p>
          <ul class="projets-propres">${PROJETS_PROPRES.map(r => `<li>✓ ${esc(r)}</li>`).join('')}</ul>
        </div>
        <div class="projets-colonne projets-formulaire">
          <p class="an-label">Nouveau projet</p>
          <label class="an-label" for="projet-nom">Nom</label>
          <input id="projet-nom" type="text" maxlength="80" placeholder="Nom du projet">
          <p class="an-label" id="projet-type-label">Ce que tu écris</p>
          <div class="projets-types vo-brut" role="radiogroup" aria-labelledby="projet-type-label">
            <label class="projets-type"><input type="radio" name="projet-type" value="serie" checked onchange="Projets.choisirType()"><strong>Série TV</strong><small>Saisons, épisodes, scripts</small></label>
            <label class="projets-type"><input type="radio" name="projet-type" value="roman" onchange="Projets.choisirType()"><strong>Roman</strong><small>Livres, chapitres, manuscrit</small></label>
            <label class="projets-type"><input type="radio" name="projet-type" value="film" onchange="Projets.choisirType()"><strong>Scénario</strong><small>Un film, des séquences, un script</small></label>
            <label class="projets-type"><input type="radio" name="projet-type" value="bd" onchange="Projets.choisirType()"><strong>BD</strong><small>Albums, planches, cases, bulles</small></label>
            <label class="projets-type"><input type="radio" name="projet-type" value="theatre" onchange="Projets.choisirType()"><strong>Théâtre</strong><small>Actes, scènes, répliques, didascalies</small></label>
            <label class="projets-type"><input type="radio" name="projet-type" value="pub" onchange="Projets.choisirType()"><strong>Pub</strong><small>Campagnes, spots, image et son</small></label>
            <label class="projets-type"><input type="radio" name="projet-type" value="jeu" onchange="Projets.choisirType()"><strong>Jeu vidéo</strong><small>Chapitres, lieux, dialogues, énigmes</small></label>
          </div>
          <div id="projet-livres" class="projets-types vo-brut" role="radiogroup" aria-label="Nombre de livres" hidden>
            <label class="projets-type"><input type="radio" name="projet-livres" value="un" checked><strong>Un roman</strong><small>Des chapitres, sans livres</small></label>
            <label class="projets-type"><input type="radio" name="projet-livres" value="plusieurs"><strong>Une série de romans</strong><small>Des livres, puis des chapitres</small></label>
          </div>
          <div id="projet-forme" class="projets-types vo-brut" role="radiogroup" aria-label="Forme" hidden></div>
          <div id="projet-bd" class="projets-colonne vo-brut" hidden>
            <div class="projets-types" role="radiogroup" aria-label="Nombre d'albums">
              <label class="projets-type"><input type="radio" name="projet-albums" value="un" checked><strong>Un album</strong><small>Des planches, sans albums</small></label>
              <label class="projets-type"><input type="radio" name="projet-albums" value="plusieurs"><strong>Une série d'albums</strong><small>Des albums, puis des planches</small></label>
            </div>
            <label class="an-label" for="projet-format">Format des pages</label>
            <select id="projet-format">${Object.entries(BD_FORMATS_NOMS).map(([k, l]) => `<option value="${k}">${l.charAt(0).toUpperCase() + l.slice(1)}${k === 'fb' ? ' · 46 planches' : ''}</option>`).join('')}</select>
          </div>
          <label class="projets-type projets-interrupteur vo-brut"><input id="projet-storyboard" type="checkbox"><strong>Storyboard</strong><small id="projet-storyboard-aide">Chaque scène se découpe en plans dessinés. Tu peux l'ajouter plus tard.</small></label>
          <label class="an-label" for="projet-depart">Réglages de départ</label>
          <select id="projet-depart">
            ${this.liste.map(p => `<option value="${esc(p.slug)}" ${p.slug === PROJET ? 'selected' : ''}>Copier ceux de ${esc(p.nom)}</option>`).join('')}
            <option value="__defaut">Réglages par défaut</option>
          </select>
          <p class="an-note">Seuls les réglages sont copiés. Le nouveau projet démarre sans épisodes ni scripts.</p>
          <button type="button" class="btn btn-primary btn-sm" onclick="Projets.creer()">Créer le projet</button>
        </div>
      </div>
      ${this.corbeille.length ? `
        <div class="projets-bloc">
          <p class="an-label">Projets retirés</p>
          <div class="projets-liste">${this.corbeille.map(p => `
            <div class="projets-ligne">
              <div><strong>${esc(p.nom)}</strong><small>Retiré le ${new Date(p.date).toLocaleDateString('fr-FR', { dateStyle: 'medium' })}</small></div>
              <div class="projets-actions"><button type="button" class="ec-lien" onclick="Projets.restaurer('${esc(p.dossier)}')">Restaurer</button></div>
            </div>`).join('')}</div>
        </div>` : ''}
      <div class="projets-bloc">
        ${Roman.film ? `
        <p class="an-label">Importer le scénario dans ${esc(this.actuel()?.nom || '')}</p>
        <p class="an-note vo-brut">Formats : Final Draft (.fdx), Fountain, Highland, Fade In, Celtx, PDF de scénario, Word, LibreOffice, RTF et texte. WriterDuet et Movie Magic : exporte d'abord en Final Draft ou en Fountain.</p>
        <p class="an-note vo-brut">Chaque INT. ou EXT. ouvre une séquence. Le film est coupé en actes aux proportions habituelles ; tu pourras déplacer les coupures dans Écriture → Structure.</p>
        <div class="an-ligne">
          <input id="import-fichiers" type="file" accept="${FILM_FORMATS}" aria-label="Choisir le scénario" onchange="Projets.choisirScenario(this.files)">
          <label class="an-label" for="import-actes">Actes</label>
          <select id="import-actes" onchange="Projets.apercuScenario()">${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </div>` : Roman.genre ? `
        <p class="an-label">Importer ${{ theatre: 'la pièce', pub: 'les spots', jeu: 'le script du jeu' }[Roman.type]} dans ${esc(this.actuel()?.nom || '')}</p>
        <p class="an-note vo-brut">${{
          theatre: 'Formats : Word, LibreOffice, PDF, RTF, HTML, Markdown, texte, Fountain. « ACTE II » ouvre un acte, « SCÈNE 3 » (ou TABLEAU 3) une scène. Une réplique : « JULIETTE. — Texte », « JULIETTE : Texte », ou le NOM sur sa ligne puis le texte. Une didascalie entre parenthèses ; « (Rose entre.) » et « (Il sort.) » font entrer et sortir les personnages.',
          pub: 'Formats : Word, LibreOffice, PDF, RTF, texte. « CAMPAGNE » ouvre une campagne, « SPOT 2 — Titre » un spot. Dans un spot, « IMAGE : » ouvre un plan, puis « VO : », « SON : », « MENTION : » ou « NOM : ». « (3 s) » fixe une durée, « [garder] » marque un plan à garder dans la version courte.',
          jeu: 'Formats : Twine (.twee), Yarn (.yarn), Ink (.ink), Word, texte. « CHAPITRE 2 » ouvre un chapitre, « LIEU : Le port » (ou un titre) un lieu. Dans un lieu : « OBJET : corde », « SORTIE : La falaise [si corde] », « ÉNIGME : Réparer : rame + corde -> barque », « NOM : réplique », « >> choix », « DONNE : clé ».',
        }[Roman.type]} Ce qui a déjà un texte n'est jamais écrasé.</p>
        <div class="an-ligne">
          <input id="import-fichiers" type="file" multiple accept="${GENRES_FORMATS}" aria-label="Choisir les fichiers" onchange="Projets.choisirManuscrit(this.files)">
          <label class="an-label" for="import-saison">Premier ${Roman.haut.s}</label><input id="import-saison" class="an-nombre" type="number" min="1" value="1" onchange="Projets.numeroterManuscrit()">
        </div>` : Roman.actif || Roman.bd ? `
        <p class="an-label">Importer ${Roman.bd ? 'le scénario' : 'le manuscrit'} dans ${esc(this.actuel()?.nom || '')}</p>
        <p class="an-note vo-brut">Formats : Word, LibreOffice, ePub, RTF, PDF, HTML, Markdown, texte, Fountain, et Scrivener compressé en .zip. Pages et Google Docs : exporte d'abord en Word.</p>
        <p class="an-note vo-brut">${Roman.bd
          ? `Une ligne « PLANCHE 3 » (ou PAGE 3) ouvre une planche${Roman.plusieurs ? ', « Album 2 » ou « Tome 2 » ouvre un album' : ''}. Dans la planche, « CASE 2 » (ou PANEL 2, VIGNETTE 2) ouvre une case : la description suit, puis une ligne « MARIE : » par bulle. RÉCITATIF : et SFX : sont lus comme tels. Une planche qui a déjà un texte n'est jamais écrasée.`
          : `Un titre « Chapitre 3 » ou un titre de niveau 1 ou 2 ouvre un chapitre${Roman.plusieurs ? ', « Livre 2 » ou « Tome 2 » ouvre un livre' : ''}. Une ligne *** coupe une scène. Un fichier sans titre devient un chapitre. Un chapitre qui a déjà un texte n'est jamais écrasé.`}</p>
        <div class="an-ligne">
          <input id="import-fichiers" type="file" multiple accept="${ROMAN_FORMATS}" aria-label="Choisir le manuscrit" onchange="Projets.choisirManuscrit(this.files)">
          ${Roman.plusieurs ? `<label class="an-label" for="import-saison">Premier ${Roman.bd ? 'album' : 'livre'}</label><input id="import-saison" class="an-nombre" type="number" min="1" value="1" onchange="Projets.numeroterManuscrit()">` : ''}
        </div>` : `
        <p class="an-label">Importer des scripts dans ${esc(this.actuel()?.nom || '')}</p>
        <p class="an-note">Formats : .txt, .fountain, .md, .pdf, Word, LibreOffice, RTF et HTML. Un nom comme S2E05 ou 2x05 place le script tout seul. Un épisode qui a déjà un script n'est jamais écrasé.</p>
        <div class="an-ligne">
          <input id="import-fichiers" type="file" multiple accept=".txt,.fountain,.md,.pdf,.docx,.odt,.rtf,.html,.htm,text/plain,application/pdf" aria-label="Choisir les scripts" onchange="Projets.choisirFichiers(this.files)">
          <label class="an-label" for="import-saison">Saison si le nom ne la donne pas</label>
          <input id="import-saison" class="an-nombre" type="number" min="1" value="1" onchange="Projets.renumeroter()">
        </div>`}
        <div id="import-apercu"></div>
        <div id="import-noms"></div>
      </div>
    `;
    this._typeParDefaut();
    if (Roman.actif || Roman.bd || Roman.genre) this._rendreManuscrit();
    else if (!Roman.film) this._rendreApercu();
    this._rendreNoms();
  },

  async restaurer(dossier) {
    const res = await api.post('projets/restaurer', { dossier });
    if (res.error) { toast(res.error, 'error'); return; }
    toast('Projet restauré', 'success');
    await this._rafraichir();
  },

  // ─── Import de scripts ───────────────────────────────────────────────────

  _lireNomFichier(nom) {
    const base = nom.replace(/\.[^.]+$/, '');
    const motifs = [/S(\d{1,2})\s*[-_ ]?\s*[EX]\s*(\d{1,3})/i, /(?<!\d)(\d{1,2})x(\d{1,3})(?!\d)/i, /saison\s*(\d{1,2}).*?[ée]p(?:isode)?\s*(\d{1,3})/i];
    for (const motif of motifs) {
      const m = base.match(motif);
      if (m) return { saison: Number(m[1]), numero: Number(m[2]), titre: base.replace(m[0], '').replace(/^[\s_.-]+|[\s_.-]+$/g, '').replace(/_/g, ' ') };
    }
    return { saison: 0, numero: 0, titre: base.replace(/_/g, ' ') };
  },

  // Le texte brut et le PDF se lisent ici ; Word, ePub, RTF et les autres passent par le serveur
  async _lireTexte(fichier, garderTitres = false) {
    const octets = await fichier.arrayBuffer();
    if (/\.pdf$/i.test(fichier.name)) return this._lirePdf(octets);
    if (ROMAN_FORMATS_TEXTE.test(fichier.name) || !/\.[a-z0-9]+$/i.test(fichier.name)) {
      try { return new TextDecoder('utf-8', { fatal: true }).decode(octets); }
      catch (e) { return new TextDecoder('windows-1252').decode(octets); }
    }
    let binaire = '';
    const vue = new Uint8Array(octets);
    for (let i = 0; i < vue.length; i += 0x8000) binaire += String.fromCharCode(...vue.subarray(i, i + 0x8000));
    const res = await api.post('ecriture_extraire', { nom: fichier.name, donnees: btoa(binaire) });
    if (res.error) throw new Error(res.error);
    return garderTitres ? res.texte : res.texte.replace(/^#{1,6}\s+/gm, '');
  },

  async _lirePdf(octets) {
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdfjs/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(octets) }).promise;
    const lignes = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const contenu = await (await pdf.getPage(p)).getTextContent();
      const parY = new Map();
      contenu.items.filter(i => i.str.trim()).forEach(i => {
        const y = Math.round(i.transform[5]);
        parY.set(y, [...(parY.get(y) || []), i]);
      });
      [...parY.keys()].sort((a, b) => b - a).forEach(y => {
        lignes.push(parY.get(y).sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ').trim());
      });
    }
    return lignes.join('\n');
  },

  async choisirFichiers(fichiers) {
    const tries = [...fichiers].sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
    this.fichiers = tries.map(f => ({ fichier: f, nom: f.name, ...this._lireNomFichier(f.name), auto: false, etat: '' }));
    this.renumeroter();
  },

  // Les fichiers sans numéro se suivent dans la saison choisie
  renumeroter() {
    const saison = Number(document.getElementById('import-saison')?.value) || 1;
    const pris = new Set(this.fichiers.filter(f => f.saison && f.numero && !f.auto).map(f => `${f.saison}:${f.numero}`));
    let suivant = 1;
    this.fichiers.forEach(f => {
      if (f.saison && f.numero && !f.auto) return;
      while (pris.has(`${saison}:${suivant}`)) suivant++;
      Object.assign(f, { saison, numero: suivant, auto: true });
      pris.add(`${saison}:${suivant}`);
    });
    this._rendreApercu();
  },

  // ─── Import d'un manuscrit ───────────────────────────────────────────────

  async choisirManuscrit(fichiers) {
    const tries = [...fichiers].sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
    const slot = document.getElementById('import-apercu');
    this.manuscrit = [];
    for (const [i, f] of tries.entries()) {
      if (slot) slot.innerHTML = `<p class="an-note">Lecture de ${esc(f.name)} (${i + 1} / ${tries.length})…</p>`;
      try {
        const parties = Roman.decouper(await this._lireTexte(f, true));
        const nomFichier = f.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
        // Un fichier sans titres de chapitre est un chapitre à lui seul
        if (parties.length === 1 && parties[0].chapitres.length === 1 && parties[0].chapitres[0].avant) parties[0].chapitres[0] = { ...parties[0].chapitres[0], titre: nomFichier, avant: false };
        parties.forEach((p, j) => p.chapitres.forEach(c => this.manuscrit.push({
          fichier: f.name, livreTitre: p.titre, livreNumero: p.numero || null, partie: `${i}:${j}`, nouveauLivre: Boolean(p.titre) || (tries.length > 1 && parties.length === 1 && p.chapitres.length > 1),
          titre: c.titre, texte: c.texte, mots: Roman.compterMots(c.texte), garder: !c.avant || Roman.compterMots(c.texte) >= 150, avant: c.avant, etat: '',
          cases: Roman.bd ? (c.texte.match(/^\s*(case|vignette|panel|panneau)\s*\d+/gim) || []).length : 0,
        })));
      } catch (e) {
        this.manuscrit.push({ fichier: f.name, erreur: e.message, garder: false });
      }
    }
    this.numeroterManuscrit();
  },

  // Les chapitres se suivent ; chaque nouveau livre repart au chapitre 1
  numeroterManuscrit() {
    const premier = Number(document.getElementById('import-saison')?.value) || 1;
    let livre = premier - 1;
    let numero = 0;
    let partie = null;
    this.manuscrit.filter(c => !c.erreur).forEach(c => {
      if (c.partie !== partie) {
        // Un nouveau livre ne s'ouvre que si le précédent a reçu au moins un chapitre
        // Le numéro écrit dans le fichier (« ACTE III ») passe avant la suite automatique
        if (livre < premier || (Roman.plusieurs && c.nouveauLivre && numero > 0)) { livre = c.livreNumero || livre + 1; numero = 0; }
        partie = c.partie;
      }
      c.livre = Roman.plusieurs ? livre : 1;
      c.numero = c.garder ? ++numero : 0;
    });
    this._rendreManuscrit();
  },

  setChapitre(i, cle, valeur) {
    const c = this.manuscrit[i];
    if (cle === 'garder') { c.garder = valeur; this.numeroterManuscrit(); return; }
    c[cle] = cle === 'titre' ? valeur : Math.max(1, Number(valeur) || 1);
  },

  _rendreManuscrit() {
    const slot = document.getElementById('import-apercu');
    if (!slot) return;
    if (!this.manuscrit.length) { slot.innerHTML = ''; return; }
    const gardes = this.manuscrit.filter(c => c.garder);
    const livres = new Set(gardes.map(c => c.livre)).size;
    // Une BD parle d'albums et de planches ; le reste du tableau ne change pas
    const [L, C] = Roman.genre ? [Roman.haut.s, Roman.unite.s] : Roman.bd ? ['album', 'planche'] : ['livre', 'chapitre'];
    const maj = m => m.charAt(0).toUpperCase() + m.slice(1);
    slot.innerHTML = `
      <p class="an-note">${gardes.length} ${C}(s)${Roman.plusieurs ? ` dans ${livres} ${L}(s)` : ''} · ${gardes.reduce((a, c) => a + c.mots, 0).toLocaleString('fr-FR')} mots${Roman.bd ? ` · ${gardes.reduce((a, c) => a + (c.cases || 0), 0)} cases` : ''}. Vérifie le découpage avant d'importer.</p>
      <div class="an-table"><table>
        <thead><tr><th>Garder</th>${Roman.plusieurs ? `<th>${maj(L)}</th>` : ''}<th>${maj(C)}</th><th>Titre</th><th>Mots</th><th>Début</th><th></th></tr></thead>
        <tbody>${this.manuscrit.map((c, i) => c.erreur ? `<tr><td></td><td colspan="${Roman.plusieurs ? 6 : 5}" class="ec-orange">${esc(c.fichier)} : ${esc(c.erreur)}</td></tr>` : `<tr>
          <td><input type="checkbox" aria-label="Importer ${esc(c.titre || 'ce passage')}" ${c.garder ? 'checked' : ''} onchange="Projets.setChapitre(${i}, 'garder', this.checked)"></td>
          ${Roman.plusieurs ? `<td><input class="an-nombre" type="number" min="1" aria-label="${maj(L)}" value="${c.livre}" onchange="Projets.setChapitre(${i}, 'livre', this.value)"></td>` : ''}
          <td>${c.garder ? `<input class="an-nombre" type="number" min="1" aria-label="Numéro ${Roman.bd ? 'de la planche' : 'du chapitre'}" value="${c.numero}" onchange="Projets.setChapitre(${i}, 'numero', this.value)">` : '<span class="an-note">—</span>'}</td>
          <td><input type="text" aria-label="Titre ${Roman.bd ? 'de la planche' : 'du chapitre'}" value="${esc(c.titre)}" placeholder="${c.avant ? `Avant ${Roman.bd ? 'la première planche' : 'le premier chapitre'}` : 'Sans titre'}" onchange="Projets.setChapitre(${i}, 'titre', this.value)"></td>
          <td>${c.mots.toLocaleString('fr-FR')}</td>
          <td class="an-note vo-brut">${esc(c.texte.replace(/\s+/g, ' ').slice(0, 70))}…</td>
          <td class="an-note" id="import-etat-${i}">${esc(c.etat)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <button type="button" class="btn btn-primary btn-sm" id="import-go" onclick="Projets.importerManuscrit()" ${gardes.length ? '' : 'disabled'}>Importer ${gardes.length} ${C}(s)</button>
    `;
  },

  async importerManuscrit() {
    document.getElementById('import-go').disabled = true;
    let importes = 0;
    for (const [i, c] of this.manuscrit.entries()) {
      if (!c.garder || c.erreur) continue;
      const etat = document.getElementById(`import-etat-${i}`);
      etat.textContent = 'Import…';
      try {
        const res = await api.post('ecriture_import', { saison: c.livre, numero: c.numero, titre: c.titre, texte: c.texte });
        if (res.error) throw new Error(res.error);
        c.etat = { importe: `Importé, ${res.repliques} répliques`, existe: 'Déjà un texte : ignoré', vide: 'Vide : ignoré' }[res.statut];
        if (res.statut === 'importe') importes++;
      } catch (e) {
        c.etat = `Erreur : ${e.message}`;
      }
      etat.textContent = c.etat;
    }
    window.DataStore?.invalidateForMutation('upload');
    toast(`${importes} ${Roman.genre ? Roman.unite.s : Roman.bd ? 'planche' : 'chapitre'}(s) importé(s)`, 'success');
    this.liste = await api.get('projets');
    await this._chargerNoms();
  },

  setFichier(i, cle, valeur) {
    this.fichiers[i][cle] = cle === 'titre' ? valeur : Math.max(1, Number(valeur) || 1);
    this.fichiers[i].auto = false;
  },

  _rendreApercu() {
    const slot = document.getElementById('import-apercu');
    if (!slot) return;
    if (!this.fichiers.length) { slot.innerHTML = ''; return; }
    slot.innerHTML = `
      <div class="an-table"><table>
        <thead><tr><th>Fichier</th><th>Saison</th><th>Épisode</th><th>Titre</th><th></th></tr></thead>
        <tbody>${this.fichiers.map((f, i) => `<tr>
          <td>${esc(f.nom)}</td>
          <td><input class="an-nombre" type="number" min="1" aria-label="Saison de ${esc(f.nom)}" value="${f.saison}" onchange="Projets.setFichier(${i}, 'saison', this.value)"></td>
          <td><input class="an-nombre" type="number" min="1" aria-label="Épisode de ${esc(f.nom)}" value="${f.numero}" onchange="Projets.setFichier(${i}, 'numero', this.value)"></td>
          <td><input type="text" aria-label="Titre de ${esc(f.nom)}" value="${esc(f.titre)}" onchange="Projets.setFichier(${i}, 'titre', this.value)"></td>
          <td class="an-note" id="import-etat-${i}">${esc(f.etat)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <button type="button" class="btn btn-primary btn-sm" id="import-go" onclick="Projets.importer()">Importer ${this.fichiers.length} script(s)</button>
    `;
  },

  async importer() {
    document.getElementById('import-go').disabled = true;
    let importes = 0;
    for (let i = 0; i < this.fichiers.length; i++) {
      const f = this.fichiers[i];
      const etat = document.getElementById(`import-etat-${i}`);
      etat.textContent = 'Lecture…';
      try {
        const res = await api.post('ecriture_import', { saison: f.saison, numero: f.numero, titre: f.titre, texte: await this._lireTexte(f.fichier) });
        if (res.error) throw new Error(res.error);
        f.etat = { importe: `Importé, ${res.repliques} répliques`, existe: 'Déjà un script : ignoré', vide: 'Fichier vide : ignoré' }[res.statut];
        if (res.statut === 'importe') importes++;
      } catch (e) {
        f.etat = `Erreur : ${e.message}`;
      }
      etat.textContent = f.etat;
    }
    window.DataStore?.invalidateForMutation('upload');
    toast(`${importes} script(s) importé(s)`, 'success');
    this.liste = await api.get('projets');
    await this._chargerNoms();
  },

  // ─── Personnages trouvés dans les scripts ────────────────────────────────

  async _chargerNoms() {
    const noms = await api.get('noms');
    this.nomsImport = noms.non_reconnus.filter(n => !['INCONNU', 'NARRATEUR'].includes(n.nom)).slice(0, 40).map((n, i) => ({ nom: n.nom, repliques: n.nb_repliques, episodes: n.nb_episodes, garder: n.nb_repliques >= 3, principal: i < 4 }));
    this._rendreNoms();
  },

  _rendreNoms() {
    const slot = document.getElementById('import-noms');
    if (!slot) return;
    if (!this.nomsImport.length) { slot.innerHTML = ''; return; }
    slot.innerHTML = `
      <p class="an-label">Personnages trouvés dans les scripts</p>
      ${Roman.actif ? '<p class="an-note">Le genre aide à savoir qui parle après « dit-il » ou « demanda-t-elle ».</p>' : ''}
      <div class="an-table"><table>
        <thead><tr><th>Créer</th><th>Nom</th><th>Répliques</th><th>Épisodes</th><th>Principal</th><th>Genre</th></tr></thead>
        <tbody>${this.nomsImport.map((n, i) => `<tr>
          <td><input type="checkbox" aria-label="Créer ${esc(n.nom)}" ${n.garder ? 'checked' : ''} onchange="Projets.nomsImport[${i}].garder = this.checked"></td>
          <td>${esc(n.nom)}</td><td>${n.repliques}</td><td>${n.episodes}</td>
          <td><input type="checkbox" aria-label="${esc(n.nom)} est principal" ${n.principal ? 'checked' : ''} onchange="Projets.nomsImport[${i}].principal = this.checked"></td>
          <td><select aria-label="Genre de ${esc(n.nom)}" onchange="Projets.nomsImport[${i}].sexe = this.value"><option value="">—</option><option value="F" ${n.sexe === 'F' ? 'selected' : ''}>Femme</option><option value="M" ${n.sexe === 'M' ? 'selected' : ''}>Homme</option></select></td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="an-ligne">
        <button type="button" class="btn btn-primary btn-sm" id="import-persos" onclick="Projets.creerPersonnages()">Créer les personnages cochés</button>
        <span class="an-note" id="import-persos-etat"></span>
      </div>
    `;
  },

  // « PAUL MARTIN » donne Paul Martin ; « LE LIVREUR » reste un seul nom
  _decouperNom(brut) {
    const propre = s => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
    const mots = brut.trim().split(/\s+/);
    if (mots.length < 2 || /^(LE|LA|LES|L'.*|UN|UNE|DES|MONSIEUR|MADAME|M\.|MME)$/.test(mots[0])) {
      const nom = propre(brut.trim());
      return { prenom: nom.charAt(0).toUpperCase() + nom.slice(1), nom: '' };
    }
    return { prenom: propre(mots[0]), nom: propre(mots.slice(1).join(' ')) };
  },

  async creerPersonnages() {
    const choisis = this.nomsImport.filter(n => n.garder);
    if (!choisis.length) return;
    document.getElementById('import-persos').disabled = true;
    const etat = document.getElementById('import-persos-etat');
    const couleurs = ['#67cbac', '#4d9fff', '#ffb454', '#f08fb0', '#c9b8ff', '#9be38f', '#ff9f9f', '#7fe0d4'];
    for (const [i, n] of choisis.entries()) {
      await api.post('personnages', { ...this._decouperNom(n.nom), sexe: n.sexe || null, est_principal: n.principal ? 2 : 0, couleur_identite: couleurs[i % couleurs.length] });
    }
    const avecScript = (await api.get('episodes&include_text=1')).filter(e => String(e.texte_episode || '').trim());
    for (const [i, e] of avecScript.entries()) {
      etat.textContent = `Relecture des scripts : ${i + 1} / ${avecScript.length}`;
      await api.post('reanalyse', { episode_id: e.id });
    }
    window.DataStore?.invalidateForMutation('reanalyse');
    window.DataStore?.invalidateForMutation('personnages');
    toast(`${choisis.length} personnage(s) créé(s)`, 'success');
    this.fichiers = [];
    await this._chargerNoms();
    await this.rendrePanel();
  },

  _copierNavigateur(depuis, vers) {
    const cle = (nom, slug) => (slug ? `${nom}@${slug}` : nom);
    try {
      PROJETS_CLES_NAVIGATEUR.forEach(nom => {
        const valeur = localStorage.getItem(cle(nom, depuis));
        if (valeur !== null) localStorage.setItem(cle(nom, vers), valeur);
      });
    } catch (e) {}
  },

  async _rafraichir() {
    this.liste = await api.get('projets');
    this.rendrePanel();
  },

  async creer() {
    const nom = document.getElementById('projet-nom').value.trim();
    if (!nom) { toast('Donne un nom au projet', 'error'); return; }
    const depart = document.getElementById('projet-depart').value;
    const source = depart === '__defaut' ? null : depart;
    const type = document.querySelector('input[name="projet-type"]:checked')?.value || 'serie';
    const livres = document.querySelector(`input[name="${type === 'bd' ? 'projet-albums' : 'projet-livres'}"]:checked`)?.value || 'un';
    const forme = document.querySelector('input[name="projet-forme"]:checked')?.value || '';
    const format = document.getElementById('projet-format')?.value || 'fb';
    const storyboard = document.getElementById('projet-storyboard')?.checked || false;
    const res = await api.post('projets/creer', { nom, source, type, livres, forme, format, storyboard });
    if (res.error) { toast(res.error, 'error'); return; }
    if (source !== null) this._copierNavigateur(source, res.slug);
    if (confirm(`« ${nom} » est créé. L'ouvrir maintenant ?`)) { this.changer(res.slug); return; }
    await this._rafraichir();
  },

  // Le formulaire part du type du projet ouvert, avec ses options
  _typeParDefaut() {
    const p = this.actuel();
    if (!p) return;
    const cocher = (nom, valeur) => { const el = document.querySelector(`input[name="${nom}"][value="${valeur}"]`); if (el) el.checked = true; };
    cocher('projet-type', p.type);
    if (p.type === 'roman') cocher('projet-livres', p.livres);
    if (p.type === 'bd') { cocher('projet-albums', p.livres); const f = document.getElementById('projet-format'); if (f) f.value = p.format; }
    this.choisirType();
    if (FORMES_TYPE[p.type]) cocher('projet-forme', p.forme);
    const sb = document.getElementById('projet-storyboard');
    if (sb) sb.checked = Boolean(p.storyboard);
    this.choisirType();
  },

  choisirType() {
    const type = document.querySelector('input[name="projet-type"]:checked')?.value || 'serie';
    document.getElementById('projet-livres').hidden = type !== 'roman';
    // Les formes du type choisi : durée d'un film, découpage d'une pièce, support d'une pub, genre d'un jeu
    const formes = FORMES_TYPE[type];
    const bloc = document.getElementById('projet-forme');
    bloc.hidden = !formes;
    if (formes && bloc.dataset.type !== type) {
      bloc.dataset.type = type;
      bloc.innerHTML = formes.map(([v, l, d], i) => `<label class="projets-type"><input type="radio" name="projet-forme" value="${v}" ${i ? '' : 'checked'}><strong>${l}</strong><small>${d}</small></label>`).join('');
    }
    document.getElementById('projet-bd').hidden = type !== 'bd';
    document.getElementById('projet-storyboard-aide').textContent = {
      serie: 'Chaque scène se découpe en plans dessinés, avec valeur, mouvement et durée.',
      roman: 'Dessine les scènes clés comme au cinéma : utile pour un pitch ou une adaptation.',
      film: 'Chaque séquence se découpe en plans dessinés, avec valeur, mouvement, objectif et durée.',
      bd: 'Chaque planche se découpe en cases sur un gabarit, avec le cadrage et le crayonné de chaque case.',
      theatre: 'Dessine la mise en scène : la place des comédiens et les tableaux clés de chaque scène.',
      pub: 'Chaque plan du spot a son dessin, sa valeur et sa durée : le storyboard qu\'on montre au client.',
      jeu: 'Dessine chaque lieu et les moments clés des dialogues, comme des écrans du jeu.',
    }[type] + ' Tu peux l\'ajouter plus tard.';
  },

  // L'API d'un autre projet que celui ouvert
  _api(slug, chemin, corps) {
    const url = `api/index.php?${slug ? `projet=${encodeURIComponent(slug)}&` : ''}path=${chemin}`;
    return fetch(url, corps ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) } : {}).then(r => r.json());
  },

  // Un nouveau projet Scénario, avec les personnages du roman, et le roman réécrit en séquences
  async adapter(slug) {
    const p = this.liste.find(x => x.slug === slug);
    if (!confirm(`Créer un projet Scénario à partir de « ${p.nom} » ? Le roman ne change pas : chaque scène devient une séquence, la narration des didascalies à resserrer, les dialogues des répliques.`)) return;
    const source = await this._api(slug, 'ecriture_adapter');
    if (source.error) { toast(source.error, 'error'); return; }
    const res = await api.post('projets/creer', { nom: `${p.nom} (scénario)`, source: slug, type: 'film', forme: 'long', storyboard: p.storyboard });
    if (res.error) { toast(res.error, 'error'); return; }
    this._copierNavigateur(slug, res.slug);
    // Les fiches d'abord : l'import reconnaît alors les personnages
    const persos = await this._api(slug, 'personnages');
    for (const x of persos || []) {
      await this._api(res.slug, 'personnages', { prenom: x.prenom, nom: x.nom, nom_affichage: x.nom_affichage, sexe: x.sexe, est_principal: x.est_principal, couleur_identite: x.couleur_identite, description: x.description });
    }
    const film = await this._api(res.slug, 'ecriture_film_import', { texte: source.texte, actes: 3 });
    if (film.error) { toast(film.error, 'error'); return; }
    toast(`${source.chapitres} chapitre(s) → ${film.sequences} séquence(s), ${this._pages(film.pages)} pages`, 'success');
    if (confirm(`« ${p.nom} (scénario) » est créé : ${film.sequences} séquences, environ ${Math.round(film.pages)} pages. L'ouvrir maintenant ?`)) { this.changer(res.slug); return; }
    await this._rafraichir();
  },

  async basculerStoryboard(slug) {
    const p = this.liste.find(x => x.slug === slug);
    if (p.storyboard && !confirm(`Retirer le storyboard de « ${p.nom} » ? Les plans déjà faits sont gardés et reviennent si tu le remets.`)) return;
    const res = await api.post('projets/storyboard', { slug, storyboard: !p.storyboard });
    if (res.error) { toast(res.error, 'error'); return; }
    if (slug === PROJET) { location.reload(); return; }
    await this._rafraichir();
  },

  // ─── Import d'un scénario de film ────────────────────────────────────────

  async choisirScenario(fichiers) {
    const f = fichiers[0];
    const slot = document.getElementById('import-apercu');
    if (!f || !slot) return;
    slot.innerHTML = `<p class="an-note">Lecture de ${esc(f.name)}…</p>`;
    try {
      this.scenario = { nom: f.name, texte: await this._lireTexte(f) };
      await this.apercuScenario();
    } catch (e) {
      slot.innerHTML = `<p class="an-note ec-orange">${esc(f.name)} : ${esc(e.message)}</p>`;
    }
  },

  async apercuScenario() {
    const slot = document.getElementById('import-apercu');
    if (!slot || !this.scenario) return;
    const actes = Number(document.getElementById('import-actes').value) || 3;
    const res = await api.post('ecriture_film_import', { texte: this.scenario.texte, actes, apercu: true });
    if (res.error) { slot.innerHTML = `<p class="an-note ec-orange">${esc(res.error)}</p>`; return; }
    const minutes = Math.round(res.pages);
    slot.innerHTML = `
      <p class="an-note">${esc(this.scenario.nom)} : ${res.sequences} séquence(s) · ${this._pages(res.pages)} p. · environ ${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} h ` : ''}${String(minutes % 60).padStart(Math.floor(minutes / 60) ? 2 : 1, '0')} min.${res.sequences ? '' : ' Aucune ligne INT. ou EXT. : le scénario sera un seul bloc.'}</p>
      <div class="an-table"><table>
        <thead><tr><th>Acte</th><th>Séquences</th><th>Pages</th><th>Part du film</th><th></th></tr></thead>
        <tbody>${res.actes.map((a, i) => `<tr><td>Acte ${i + 1}</td><td>${a.sequences}</td><td>${this._pages(a.pages)}</td><td>${Math.round(100 * a.pages / (res.pages || 1))} %</td><td class="an-note" id="import-etat-${i}"></td></tr>`).join('')}</tbody>
      </table></div>
      <button type="button" class="btn btn-primary btn-sm" id="import-go" onclick="Projets.importerScenario()">Importer le scénario en ${res.actes.length} acte(s)</button>
    `;
  },

  _pages(p) {
    const e = Math.floor(p), h = Math.round((p - e) * 8);
    return `${e || (h ? '' : '0')}${h ? `${e ? ' ' : ''}${h}/8` : ''}`;
  },

  async importerScenario() {
    document.getElementById('import-go').disabled = true;
    const res = await api.post('ecriture_film_import', { texte: this.scenario.texte, actes: Number(document.getElementById('import-actes').value) || 3 });
    if (res.error) { toast(res.error, 'error'); return; }
    res.actes.forEach((r, i) => {
      const etat = document.getElementById(`import-etat-${i}`);
      if (etat) etat.textContent = { importe: `Importé, ${r.repliques} répliques`, existe: 'Déjà un texte : ignoré', vide: 'Vide : ignoré' }[r.statut] || '';
    });
    window.DataStore?.invalidateForMutation('upload');
    toast(`${res.actes.filter(r => r.statut === 'importe').length} acte(s) importé(s)`, 'success');
    this.liste = await api.get('projets');
    await this._chargerNoms();
  },

  async changerLivres(slug) {
    const p = this.liste.find(x => x.slug === slug);
    const livres = p.livres === 'plusieurs' ? 'un' : 'plusieurs';
    const res = await api.post('projets/livres', { slug, livres });
    if (res.error) { toast(res.error, 'error'); return; }
    if (slug === PROJET) { location.reload(); return; }
    await this._rafraichir();
  },

  async renommer(slug) {
    const p = this.liste.find(x => x.slug === slug);
    const nom = prompt('Nouveau nom du projet', p.nom)?.trim();
    if (!nom || nom === p.nom) return;
    const res = await api.post('projets/renommer', { slug, nom });
    if (res.error) { toast(res.error, 'error'); return; }
    if (slug === PROJET) { location.reload(); return; }
    await this._rafraichir();
  },

  async dupliquer(slug) {
    const p = this.liste.find(x => x.slug === slug);
    if (!confirm(`Créer une copie complète de « ${p.nom} », avec ses épisodes et ses scripts ?`)) return;
    const res = await api.post('projets/dupliquer', { slug });
    if (res.error) { toast(res.error, 'error'); return; }
    this._copierNavigateur(slug, res.slug);
    toast('Copie créée', 'success');
    await this._rafraichir();
  },

  async retirer(slug) {
    const p = this.liste.find(x => x.slug === slug);
    if (!confirm(`Retirer « ${p.nom} » ? Il disparaît de la liste, mais son dossier reste dans data/corbeille.`)) return;
    const res = await api.post('projets/retirer', { slug });
    if (res.error) { toast(res.error, 'error'); return; }
    toast('Projet retiré', 'success');
    await this._rafraichir();
  },
};
