// assets/js/roman.js — Le type du projet ouvert : série TV, roman, film ou BD, et toute l'app parle avec ses mots
'use strict';

const ROMAN_VUES_SERIE = [['reprendre', 'Reprendre'], ['persos', 'Personnages'], ['relations', 'Relations'], ['pov', 'Point de vue'], ['rythme', 'Rythme'], ['fins', 'Fins de chapitre'], ['temps', 'Temps du récit'], ['fils', 'Fils entre livres'], ['memoire', 'Mémoire'], ['repetitions', 'Répétitions'], ['plan', 'Plan'], ['objectifs', 'Objectifs'], ['export', 'Exporter'], ['retrouver', 'Retrouver']];
const ROMAN_VUES_UN_LIVRE = ROMAN_VUES_SERIE.map(([k, l]) => [k, k === 'fils' ? 'Fils ouverts' : l]);
const ROMAN_FORMATS = '.txt,.md,.markdown,.text,.fountain,.pdf,.docx,.docm,.dotx,.odt,.ott,.rtf,.epub,.html,.htm,.xhtml,.zip,.pages,.doc';
const ROMAN_FORMATS_TEXTE = /\.(txt|md|markdown|text|fountain)$/i;
const FILM_FORMATS = '.fountain,.fdx,.highland,.fadein,.celtx,.txt,.md,.pdf,.docx,.odt,.rtf,.html,.htm,.wdz,.scw,.mmsw';
const FILM_VUES_SERIE = [['reprendre', 'Reprendre'], ['persos', 'Personnages'], ['relations', 'Relations'], ['actes', 'Structure'], ['sequences', 'Séquences'], ['parActe', 'Personnages par acte'], ['liege', 'Tableau de liège'], ['travail', 'Plan de travail'], ['tournage', 'Tournage'], ['revisions', 'Révisions'], ['memoire', 'Mémoire'], ['repetitions', 'Répétitions'], ['plan', 'Plan'], ['depouillement', 'Dépouillement'], ['objectifs', 'Objectifs'], ['export', 'Exporter'], ['retrouver', 'Retrouver']];
const THEATRE_VUES_SERIE = [['reprendre', 'Reprendre'], ['persos', 'Personnages'], ['relations', 'Relations'], ['presence', 'Entrées et sorties'], ['distribution', 'Distribution'], ['parole', 'Temps de parole'], ['didascalies', 'Didascalies'], ['memoire', 'Mémoire'], ['repetitions', 'Répétitions'], ['plan', 'Plan'], ['objectifs', 'Objectifs'], ['export', 'Exporter'], ['retrouver', 'Retrouver']];
const PUB_VUES_SERIE = [['reprendre', 'Reprendre'], ['campagne', 'Campagne'], ['persos', 'Personnages'], ['memoire', 'Mémoire'], ['plan', 'Plan'], ['objectifs', 'Objectifs'], ['export', 'Exporter'], ['retrouver', 'Retrouver']];
const JEU_VUES_SERIE = [['reprendre', 'Reprendre'], ['carte', 'Carte des lieux'], ['enigmes', 'Énigmes'], ['dialogues', 'Dialogues'], ['inventaire', 'Inventaire'], ['persos', 'Personnages'], ['memoire', 'Mémoire'], ['plan', 'Plan'], ['objectifs', 'Objectifs'], ['export', 'Exporter'], ['retrouver', 'Retrouver']];
const GENRES_FORMATS = '.txt,.md,.fountain,.pdf,.docx,.odt,.rtf,.html,.htm,.twee,.tw,.tw3,.yarn,.ink,.json';
const BD_VUES_SERIE = [['reprendre', 'Reprendre'], ['persos', 'Personnages'], ['relations', 'Relations'], ['planches', 'Planches'], ['bulles', 'Bulles'], ['tourne', 'Tourne de page'], ['decoupage', 'Découpage'], ['cheminfer', 'Chemin de fer'], ['production', 'Production'], ['memoire', 'Mémoire'], ['repetitions', 'Répétitions'], ['plan', 'Plan'], ['objectifs', 'Objectifs'], ['retrouver', 'Retrouver']];
// Nombre de cases habituel d'une planche, selon le format
const BD_CASES_NORME = { fb: [6, 9], rg: [3, 8], manga: [4, 7], comics: [4, 7] };
// Les couleurs des révisions d'un scénario, dans l'ordre d'usage
const REVISION_COULEURS = [['Blanche', '#f4f4f0'], ['Bleue', '#9fc3ff'], ['Rose', '#f6a8c8'], ['Jaune', '#f5e27a'], ['Verte', '#9be38f'], ['Chamois', '#e8c99a'], ['Saumon', '#f4a58a'], ['Cerise', '#e0607e'], ['Bleu ciel', '#a8e0f0'], ['Gris', '#b0b0b0']];
const BD_FORMATS_NOMS = { fb: 'franco-belge', rg: 'roman graphique', manga: 'manga', comics: 'comics' };

// Les mots qu'on peut choisir pour chaque niveau, avec leur genre : les tournures s'accordent toutes seules
const VOCAB_NOMS = {
  saison: { s: 'saison', p: 'saisons', f: true, abr: 'Sa.', l: 'S' },
  livre: { s: 'livre', p: 'livres', abr: 'Liv.', l: 'L' },
  tome: { s: 'tome', p: 'tomes', abr: 'Tome', l: 'T' },
  partie: { s: 'partie', p: 'parties', f: true, abr: 'Part.', l: 'P', code: 'Partie ' },
  volume: { s: 'volume', p: 'volumes', abr: 'Vol.', l: 'V' },
  album: { s: 'album', p: 'albums', abr: 'Alb.', l: 'A' },
  film: { s: 'film', p: 'films', abr: 'Film', l: 'F' },
  episode: { s: 'épisode', p: 'épisodes', abr: 'Ép.', code: 'E' },
  chapitre: { s: 'chapitre', p: 'chapitres', abr: 'Ch.', code: 'Ch', l: 'C' },
  planche: { s: 'planche', p: 'planches', f: true, abr: 'Pl.', code: 'Pl.' },
  page: { s: 'page', p: 'pages', f: true, abr: 'P.', code: 'P.' },
  acte: { s: 'acte', p: 'actes', abr: 'Acte', code: 'Acte ', l: 'A' },
  scene: { s: 'scène', p: 'scènes', f: true, abr: 'Sc.', code: 'Sc' },
  tableau: { s: 'tableau', p: 'tableaux', abr: 'Tabl.', code: 'T' },
  campagne: { s: 'campagne', p: 'campagnes', f: true, abr: 'Camp.', l: 'C' },
  spot: { s: 'spot', p: 'spots', abr: 'Spot', code: 'Spot ' },
  lieu: { s: 'lieu', p: 'lieux', abr: 'Lieu', code: 'Lieu ' },
};
const VOCAB_CHOIX = {
  serie: { haut: ['saison', 'partie', 'volume'], unite: ['episode', 'chapitre'] },
  roman: { haut: ['livre', 'tome', 'partie', 'volume'], unite: ['chapitre', 'partie'] },
  film: { haut: ['film'], unite: ['acte', 'partie'] },
  bd: { haut: ['album', 'tome', 'volume'], unite: ['planche', 'page'] },
  theatre: { haut: ['acte', 'partie'], unite: ['scene', 'tableau'] },
  pub: { haut: ['campagne'], unite: ['spot'] },
  jeu: { haut: ['chapitre', 'partie'], unite: ['lieu'] },
};
// Le tableau de liège et le storyboard d'une pièce, d'un spot ou d'un jeu se servent de ces règles en plus
const THEATRE_MOTS = [
  [/\bSCRIPTS\b/g, 'TEXTES'], [/\bSCRIPT\b/g, 'TEXTE'], [/\bScripts\b/g, 'Textes'], [/\bScript\b/g, 'Texte'], [/\bscripts\b/g, 'textes'], [/\bscript\b/g, 'texte'],
  [/\bsitcom\b/g, 'pièce'],
];
const PUB_MOTS = [[/\bsitcom\b/g, 'campagne']];
const JEU_MOTS = [[/\bsitcom\b/g, 'jeu']];
// Les formes de chaque type, avec leur description, pour la création du projet
const FORMES_TYPE = {
  film: [['long', 'Long métrage', '90 à 120 pages'], ['court', 'Court métrage', 'Moins de 30 pages']],
  theatre: [['classique', 'Actes et scènes', 'Une scène par entrée ou sortie'], ['tableaux', 'Tableaux', 'Des tableaux plutôt que des scènes'], ['seul', 'Seul en scène', 'Un seul comédien']],
  pub: [['tv', 'TV et cinéma', 'Spots de 15 à 45 s'], ['radio', 'Radio', 'Le son seul'], ['reseaux', 'Réseaux sociaux', 'Formats courts et verticaux']],
  jeu: [['pnc', 'Point and click', 'Lieux, objets, énigmes'], ['narratif', 'Jeu narratif', 'Dialogues à choix'], ['rpg', 'Jeu de rôle', 'Quêtes et dialogues']],
};

// Les tournures d'un nom : « de la saison » devient « du livre », « cet épisode » devient « cette planche »
function vocabFormes(n) {
  const v = /^[aeiouyéèêàâh]/i.test(n.s), f = Boolean(n.f);
  const le = v ? "l'" : f ? 'la ' : 'le ';
  const adj = (m, fem) => (f ? fem : m);
  return [
    `${f ? 'toute' : 'tout'} ${le}${n.s}`, `${f ? 'toutes' : 'tous'} les ${n.p}`,
    `${f ? 'de la ' : 'du '}${adj('premier', 'première')} ${n.s}`, `${f ? 'de la ' : 'du '}${adj('dernier', 'dernière')} ${n.s}`, `${f ? 'de la ' : 'du '}${adj('prochain', 'prochaine')} ${n.s}`,
    `${f ? 'la' : 'le'} ${adj('premier', 'première')} ${n.s}`, `${f ? 'la' : 'le'} ${adj('dernier', 'dernière')} ${n.s}`, `${f ? 'la' : 'le'} ${adj('prochain', 'prochaine')} ${n.s}`,
    `${v ? "de l'" : f ? 'de la ' : 'du '}${n.s}`, `${v ? "à l'" : f ? 'à la ' : 'au '}${n.s}`,
    `${f ? 'cette' : v ? 'cet' : 'ce'} ${n.s}`, `${f && !v ? 'sa' : 'son'} ${n.s}`, `${f ? 'nouvelle' : v ? 'nouvel' : 'nouveau'} ${n.s}`,
    `${adj('premier', 'première')} ${n.s}`, `${adj('dernier', 'dernière')} ${n.s}`, `${adj('prochain', 'prochaine')} ${n.s}`,
    `${adj('certains', 'certaines')} ${n.p}`, `chaque ${n.s}`, `${adj('aucun', 'aucune')} ${n.s}`, `${adj('quel', 'quelle')} ${n.s}`,
    `${adj('un', 'une')} ${n.s}`, `${v ? "d'" : 'de '}${n.s}`, `${le}${n.s}`,
    n.p, n.s,
  ];
}

// Règles de remplacement d'un nom par un autre, en minuscules, avec majuscule et en capitales
function vocabRegles(source, cible) {
  if (source === cible) return [];
  const a = vocabFormes(source), b = vocabFormes(cible);
  // « suivant » et « précédent » derrière le nom s'accordent avec le nouveau nom
  const motif = t => new RegExp(`(?<![\\p{L}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]")}( (?:suivante?|précédente?))?(?![\\p{L}])`, 'gu');
  const accord = adj => (adj ? ` ${adj.trim().replace(/e$/, '')}${cible.f ? 'e' : ''}` : '');
  const maj = t => t.charAt(0).toUpperCase() + t.slice(1);
  const regles = [];
  a.forEach((t, i) => {
    regles.push([motif(t.toUpperCase()), b[i].toUpperCase()], [motif(maj(t)), (m, adj) => maj(b[i]) + accord(adj)], [motif(t), (m, adj) => b[i] + accord(adj)]);
  });
  regles.push([new RegExp(`(?<![\\p{L}])${source.abr.replace('.', '\\.')}`, 'gu'), cible.abr]);
  return regles;
}

const ROMAN_MOTS = [
  [/\bSCRIPTS\b/g, 'TEXTES'], [/\bSCRIPT\b/g, 'TEXTE'], [/\bScripts\b/g, 'Textes'], [/\bScript\b/g, 'Texte'], [/\bscripts\b/g, 'textes'], [/\bscript\b/g, 'texte'],
  [/DÉCORS/g, 'LIEUX'], [/DÉCOR\b/g, 'LIEU'], [/Décors/g, 'Lieux'], [/Décor\b/g, 'Lieu'], [/décors/g, 'lieux'], [/décor\b/g, 'lieu'],
  [/\bsitcom\b/g, 'roman'],
];
const FILM_MOTS = [
  [/SCÈNES/g, 'SÉQUENCES'], [/SCÈNE/g, 'SÉQUENCE'], [/Scènes/g, 'Séquences'], [/Scène/g, 'Séquence'], [/scènes/g, 'séquences'], [/scène/g, 'séquence'],
  [/\bSCRIPTS\b/g, 'SCÉNARIOS'], [/\bSCRIPT\b/g, 'SCÉNARIO'], [/\bScripts\b/g, 'Scénarios'], [/\bScript\b/g, 'Scénario'], [/\bscripts\b/g, 'scénarios'], [/\bscript\b/g, 'scénario'],
  [/\bsitcom\b/g, 'film'],
];
const BD_MOTS = [
  [/SCÈNES/g, 'CASES'], [/SCÈNE/g, 'CASE'], [/Scènes/g, 'Cases'], [/Scène/g, 'Case'], [/scènes/g, 'cases'], [/scène/g, 'case'],
  [/RÉPLIQUES/g, 'BULLES'], [/RÉPLIQUE/g, 'BULLE'], [/Répliques/g, 'Bulles'], [/Réplique/g, 'Bulle'], [/répliques/g, 'bulles'], [/réplique/g, 'bulle'],
  [/\bSCRIPTS\b/g, 'SCÉNARIOS'], [/\bSCRIPT\b/g, 'SCÉNARIO'], [/\bScripts\b/g, 'Scénarios'], [/\bScript\b/g, 'Scénario'], [/\bscripts\b/g, 'scénarios'], [/\bscript\b/g, 'scénario'],
  [/\bsitcom\b/g, 'BD'],
];
// Le texte des personnages et les champs qu'on remplit ne sont jamais réécrits
const ROMAN_HORS = 'textarea, input, [contenteditable], script, style, .vo-brut, .ec-scene-lignes, .ec-ligne-texte';

// Roman garde son nom, mais décrit le type de n'importe quel projet ; actif veut dire « c'est un roman »
const Roman = {
  type: 'serie',
  actif: false,
  film: false,
  bd: false,
  plusieurs: false,
  storyboard: false,
  format: 'fb',
  forme: 'long',
  mots: null,

  appliquer(projet) {
    this.type = ['roman', 'film', 'bd', 'theatre', 'pub', 'jeu'].includes(projet?.type) ? projet.type : 'serie';
    this.actif = this.type === 'roman';
    this.film = this.type === 'film';
    this.bd = this.type === 'bd';
    this.theatre = this.type === 'theatre';
    this.pub = this.type === 'pub';
    this.jeu = this.type === 'jeu';
    this.genre = this.theatre || this.pub || this.jeu;
    // Une pièce a des actes, une campagne des spots, un jeu des chapitres : le grand niveau compte toujours
    this.plusieurs = ((this.actif || this.bd) && projet.livres === 'plusieurs') || this.genre;
    this.storyboard = Boolean(projet?.storyboard);
    this.format = projet?.format || 'fb';
    this.forme = projet?.forme || 'long';
    document.documentElement.dataset.projet = this.type;
    if (this.actif) ECRITURE_VUES.serie = this.plusieurs ? ROMAN_VUES_SERIE : ROMAN_VUES_UN_LIVRE;
    if (this.film) ECRITURE_VUES.serie = FILM_VUES_SERIE;
    if (this.bd) ECRITURE_VUES.serie = BD_VUES_SERIE;
    if (this.theatre) ECRITURE_VUES.serie = THEATRE_VUES_SERIE;
    if (this.pub) { ECRITURE_VUES.serie = PUB_VUES_SERIE; ECRITURE_VUES.episode = [['spot', 'Script image et son'], ...ECRITURE_VUES.episode]; }
    if (this.jeu) ECRITURE_VUES.serie = JEU_VUES_SERIE;
    if (this.type !== 'serie') ECRITURE_VUES.episode = ECRITURE_VUES.episode.filter(([k]) => k !== 'gags');
    // Le tableau de liège d'un film étale tout le film, pas un acte
    if (this.film) ECRITURE_VUES.episode = ECRITURE_VUES.episode.filter(([k]) => k !== 'liege');
    if (this.storyboard) {
      // Le suivi de production d'une BD est déjà dans ses vues ; ailleurs, il suit les plans du storyboard
      if (!this.bd) ECRITURE_VUES.serie = [...ECRITURE_VUES.serie.filter(([k]) => k !== 'retrouver'), ['production', 'Production'], ['retrouver', 'Retrouver']];
      const i = ECRITURE_VUES.episode.findIndex(([k]) => k === 'brouillon');
      ECRITURE_VUES.episode.splice(i + 1, 0, ['storyboard', 'Storyboard']);
    }
    // Les mots des deux niveaux, choisis dans Config ; une série TV garde « saison » et « épisode » par défaut
    const choix = VOCAB_CHOIX[this.type];
    const mots = projet?.mots || {};
    this.haut = VOCAB_NOMS[choix.haut.includes(mots.haut) ? mots.haut : choix.haut[0]];
    this.unite = VOCAB_NOMS[choix.unite.includes(mots.unite) ? mots.unite : choix.unite[0]];
    this.change = this.haut !== VOCAB_NOMS.saison || this.unite !== VOCAB_NOMS.episode;
    const autres = { roman: ROMAN_MOTS, film: FILM_MOTS, bd: BD_MOTS, theatre: THEATRE_MOTS, pub: PUB_MOTS, jeu: JEU_MOTS }[this.type] || [];
    // Arcs et continuité pour tous les types qui ont des personnages ; le budget pour un film
    const ajouter = (vue, avant) => {
      const liste = ECRITURE_VUES.serie.filter(([k]) => k !== vue[0]);
      const i = liste.findIndex(([k]) => k === avant);
      liste.splice(i < 0 ? liste.length - 1 : i, 0, vue);
      ECRITURE_VUES.serie = liste;
    };
    if (!this.pub) ajouter(['arcs', 'Arcs'], 'memoire');
    ajouter(['continuite', 'Continuité'], 'memoire');
    if (this.film) ajouter(['budget', 'Budget'], 'revisions');
        this.mots = this.change || autres.length ? [...vocabRegles(VOCAB_NOMS.saison, this.haut), ...vocabRegles(VOCAB_NOMS.episode, this.unite), ...autres] : null;
    if (this.mots) this._observer();
  },

  // « S2E05 » devient « L2 · Ch05 » (roman), « Acte 2 » (film) ou « A2 · Pl.05 » (BD), selon les mots choisis
  code(saison, numero) {
    const u = this.unite.code;
    if (this.film) return `${u}${numero}`;
    const n = u.endsWith(' ') ? `${u}${numero}` : `${u}${String(numero).padStart(2, '0')}`;
    return this.plusieurs || this.type === 'serie' ? `${this.haut.l}${saison} · ${n}` : n;
  },

  traduire(texte) {
    if (!texte || !this.mots) return texte;
    // Les abréviations seules dans une case : « S1 », « E05 », les en-têtes « Sa. » et « Ep »
    const seul = texte.match(/^(\s*)(?:S(\d{1,2})|E(\d{1,3})|(Sa\.)|(Ep\.?|Ép\.?))(\s*)$/);
    if (seul) {
      const [, a, s, e, sa, ep, b] = seul;
      const coeur = s ? `${this.haut.l}${s}` : e ? this.code(1, Number(e)).replace(/^.* · /, '') : sa ? this.haut.abr : this.unite.abr;
      return a + coeur + b;
    }
    let t = texte;
    for (const [motif, remplace] of this.mots) t = t.replace(motif, remplace);
    return t.replace(/\bS(\d{1,2})E(\d{1,3})\b/g, (m, s, e) => this.code(Number(s), Number(e)));
  },

  _attributs(el) {
    if (el.closest('.vo-brut')) return;
    ['placeholder', 'title', 'aria-label'].forEach(a => {
      const v = el.getAttribute(a);
      const t = v && this.traduire(v);
      if (t && t !== v) el.setAttribute(a, t);
    });
  },

  _noeud(n) {
    if (n.nodeType === Node.TEXT_NODE) {
      if (n.parentElement?.closest(ROMAN_HORS)) return;
      const t = this.traduire(n.nodeValue);
      if (t !== n.nodeValue) n.nodeValue = t;
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    [n, ...n.querySelectorAll('[placeholder], [title], [aria-label]')].forEach(el => this._attributs(el));
    if (n.closest(ROMAN_HORS)) return;
    const marche = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
    while (marche.nextNode()) this._noeud(marche.currentNode);
  },

  _observer() {
    this._noeud(document.body);
    document.title = this.traduire(document.title);
    new MutationObserver(liste => liste.forEach(m => {
      if (m.type === 'characterData') this._noeud(m.target);
      else if (m.type === 'attributes') this._noeud(m.target);
      else m.addedNodes.forEach(n => this._noeud(n));
    })).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
  },

  // ─── Découpage du manuscrit ──────────────────────────────────────────────

  _titre(ligne) {
    const t = ligne.trim();
    const md = t.match(/^(#{1,6})\s+(.+)$/);
    const texte = md ? md[2].trim() : t;
    if (!md && t.length > 70) return null;
    // Une pièce : ACTE ouvre un acte, SCÈNE ou TABLEAU une scène ; un spot, un jeu : leurs mots à eux
    if (this.genre) {
      const [haut, unite] = { theatre: [/^acte\b\s*\S*/i, /^(sc[èe]ne|tableau)\b\s*\S*/i], pub: [/^campagne\b/i, /^spot\b/i], jeu: [/^chapitre\b\s*\S*/i, /^lieu\s*:/i] }[this.type];
      if (haut.test(texte)) return { genre: 'livre', niveau: md ? md[1].length : 0, texte };
      if (unite.test(texte)) return { genre: 'chapitre', niveau: md ? md[1].length : 0, texte };
      if (this.jeu && md && md[1].length <= 2) return { genre: 'chapitre', niveau: md[1].length, texte };
      return null;
    }
    // Dans une BD, seules les planches et les albums découpent ; « CASE 2 » reste dans la planche
    if (this.bd) {
      if (/^(album|tome|volume)\b\s*\S*/i.test(texte)) return { genre: 'livre', niveau: md ? md[1].length : 0, texte };
      if (/^(planche|page|pl\.)\s*\d+/i.test(texte)) return { genre: 'chapitre', niveau: md ? md[1].length : 0, texte };
      return null;
    }
    if (/^(livre|tome|partie|volume)\b\s*\S*/i.test(texte)) return { genre: 'livre', niveau: md ? md[1].length : 0, texte };
    if (/^(chapitre|chap\.)\s*\S+/i.test(texte) || /^(prologue|épilogue|epilogue|interlude)\b/i.test(texte)) return { genre: 'chapitre', niveau: md ? md[1].length : 0, texte };
    if (!md && /^([IVXLC]{1,7}|\d{1,3})\.?$/.test(t)) return { genre: 'chapitre', niveau: 0, texte };
    if (md) return { genre: md[1].length >= 3 ? 'scene' : null, niveau: md[1].length, texte };
    return null;
  },

  // « Chapitre 3 : La fuite » donne le titre « La fuite »
  _nomChapitre(texte) {
    if (this.genre) return texte.replace(/^(sc[èe]ne|tableau|spot|lieu)\s*(?:\d+|[ivxlc]+)?\s*[:.—–-]?\s*/i, '').trim();
    if (this.bd) return texte.replace(/^(planche|page|pl\.)\s*\d+\s*[:.—–-]?\s*/i, '').trim();
    const prefixe = texte.match(/^(chapitre|chap\.)\s*([\divxlc]+|[a-zéèêûô-]+)\s*[:.—–-]?\s*(.*)$/i);
    if (prefixe) return prefixe[3].trim();
    return /^([IVXLC]{1,7}|\d{1,3})\.?$/.test(texte.trim()) ? '' : texte.trim();
  },

  // Rend des parties : { livre, chapitres: [{ titre, texte }] } ; livre vaut null si le fichier n'en annonce pas
  decouper(texte) {
    const lignes = texte.replace(/\r/g, '').split('\n');
    const titres = lignes.map(l => (l.trim() ? this._titre(l) : null));
    const niveaux = [...new Set(titres.filter(t => t && t.niveau && t.genre !== 'scene').map(t => t.niveau))].sort();
    // Deux niveaux de titres sans mot-clé : le premier ouvre un livre, le second un chapitre
    const niveauLivre = this.plusieurs && niveaux.length >= 2 && !titres.some(t => t?.genre === 'livre') ? niveaux[0] : null;
    const parties = [];
    let livre = { titre: null, chapitres: [] };
    let chapitre = { titre: '', lignes: [], avant: true };
    const fermerChapitre = () => {
      const corps = chapitre.lignes.join('\n').trim();
      if (corps) livre.chapitres.push({ titre: chapitre.titre, texte: corps, avant: chapitre.avant });
    };
    lignes.forEach((l, i) => {
      const t = titres[i];
      const estLivre = t && (t.genre === 'livre' || (niveauLivre && t.niveau === niveauLivre));
      if (estLivre && this.plusieurs) {
        fermerChapitre();
        if (livre.chapitres.length || livre.titre) parties.push(livre);
        livre = { titre: t.texte, chapitres: [], numero: this._numeroTitre(t.texte) };
        chapitre = { titre: '', lignes: [], avant: true };
        return;
      }
      if (estLivre) return;
      if (t && t.genre !== 'scene' && (t.genre === 'chapitre' || t.niveau)) {
        fermerChapitre();
        chapitre = { titre: this._nomChapitre(t.texte), lignes: [], avant: false };
        return;
      }
      chapitre.lignes.push(t?.genre === 'scene' ? '***' : l);
    });
    fermerChapitre();
    parties.push(livre);
    return parties.filter(p => p.chapitres.length);
  },

  // « ACTE III », « Livre 2 », « Tome IV » : le numéro écrit dans le titre, s'il y en a un
  _numeroTitre(texte) {
    const m = String(texte).match(/^\S+\s+([0-9]{1,3}|[IVXLC]{1,7})\b/i);
    if (!m) return null;
    if (/^\d+$/.test(m[1])) return Number(m[1]);
    const v = { I: 1, V: 5, X: 10, L: 50, C: 100 };
    const r = m[1].toUpperCase();
    return [...r].reduce((t, c, i) => (v[c] < (v[r[i + 1]] || 0) ? t - v[c] : t + v[c]), 0) || null;
  },

  compterMots(texte) {
    return (texte.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  },
};
