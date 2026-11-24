// assets/js/demo.js — Le projet de démonstration : une petite série inventée (trois épisodes) pour découvrir l'app.
// Tout est fictif et écrit pour l'exemple. Il est créé par l'API ordinaire, comme un vrai projet, et se supprime pareil.
'use strict';

const DEMO = {
  episodes: [
  {
    "titre": "Le phare éteint",
    "date": "2024-10-03",
    "texte": "INT. PHARE - NUIT\n\nLe vent siffle. Odile monte l'escalier en colimaçon, une LAMPE TEMPÊTE à la main.\n\nODILE\nBasile ? Tu es là-haut ?\n\nBASILE\n(essoufflé)\nJ'ai trouvé quelque chose. Viens voir.\n\nElle arrive dans la salle de la lanterne. Basile tient une vieille clé rouillée.\n\nODILE\nUne clé ? Dans le phare ?\n\nBASILE\nElle était sous la lentille. Quelqu'un l'a cachée là exprès.\n\nODILE\nQui monte encore ici, à part nous ?\n\nEXT. PORT - JOUR\n\nCapucine attache son vélo devant la criée. Firmin, le patron du café, essuie une table.\n\nFIRMIN\nTu es bien matinale.\n\nCAPUCINE\nJ'ai vu de la lumière au phare cette nuit. Il est éteint depuis trente ans.\n\nFIRMIN\nLes gens voient ce qu'ils ont envie de voir.\n\nCAPUCINE\nMoi, j'ai trente-deux ans et de très bons yeux."
  },
  {
    "titre": "La clé du gardien",
    "date": "2024-10-04",
    "texte": "INT. CAFÉ DU PORT - MATIN\n\nOdile pose la clé sur le comptoir. Firmin la regarde longtemps sans rien dire.\n\nODILE\nVous la reconnaissez ?\n\nFIRMIN\nC'était celle du dernier gardien. Il est parti sans la rendre.\n\nBASILE\nParti où ?\n\nFIRMIN\nPersonne n'a jamais su.\n\nLe téléphone sonne. Firmin ne décroche pas.\n\nEXT. FALAISE - JOUR\n\nCapucine et Basile marchent le long du sentier. La mer est grise.\n\nCAPUCINE\nTu crois vraiment qu'elle ouvre quelque chose ?\n\nBASILE\nUne clé ouvre toujours quelque chose. Sinon, on ne la cache pas.\n\nCAPUCINE\nEt si on n'avait pas envie de savoir ?"
  },
  {
    "titre": "Ce que la mer rend",
    "date": "2024-10-06",
    "texte": "INT. CAVE DU PHARE - NUIT\n\nOdile et Basile descendent. Au fond, une porte basse, fermée.\n\nODILE\nEssaie.\n\nBasile tourne la clé. La porte s'ouvre sur une petite pièce remplie de lettres.\n\nBASILE\nElles sont toutes pour la même personne.\n\nODILE\n(lisant)\n« Pour Capucine. »\n\nEXT. PORT - AUBE\n\nCapucine attend sur la jetée. Odile lui tend une lettre.\n\nCAPUCINE\nJ'ai trente ans, je n'ai jamais eu de courrier du phare.\n\nODILE\nIl y en a deux cents."
  }
],
  personnages: [['Odile', 'Marceau', 2, 'Gardienne de la mémoire du port', '1990-05-12', ''], ['Basile', 'Ferrand', 2, 'Pêcheur', '1992-05-12', 'Il a les yeux verts et parle peu.'], ['Capucine', 'Morel', 2, 'Postière', '1993-05-12', ''], ['Firmin', 'Lacaze', 1, 'Patron du café du port', '1958-05-12', '']],

  async creer() {
    const p = await api.post('projets/creer', { nom: 'Démonstration', type: 'serie', source: null });
    if (p.error) throw new Error(p.error);
    const appel = (chemin, corps, methode = 'POST') => fetch(`api/index.php?projet=${encodeURIComponent(p.slug)}&path=${chemin}`, { method: methode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }).then(r => r.json());
    const saison = await appel('saisons', { numero: 1, nom: 'Saison 1', couleur: '#3498db' });
    for (const [prenom, nom, est_principal, profession, date_naissance, caracteristiques] of this.personnages) await appel('personnages', { prenom, nom, est_principal, profession, date_naissance, caracteristiques });
    let premier = null;
    for (const [i, e] of this.episodes.entries()) {
      const ep = await appel('episodes', { saison_id: Number(saison.id), numero_episode: i + 1, titre: e.titre, date_diege: e.date });
      premier = premier || ep.id;
      // Une version plus ancienne du premier épisode, avec une scène coupée depuis : de quoi remplir le chutier
      if (!i) await appel('ecriture_versions', { episode_id: ep.id, texte: `${e.texte}\n\nINT. CHAMBRE D'ODILE - NUIT\n\nODILE\nJe n'arrive pas à dormir, le phare me regarde.\n`, motif: 'Première version' });
      await appel('upload', { episode_id: ep.id, texte: e.texte });
    }
    await appel('promesses', { episode_source_id: premier, titre: 'Qui a caché la clé ?', type_promesse: 'mystere', statut: 'ouverte', description: 'La clé du dernier gardien, trouvée sous la lentille.' });
    return p;
  },

  async proposer() {
    if (!confirm('Créer un projet « Démonstration » : une petite série inventée de trois épisodes, pour découvrir chaque vue en situation ? Tes projets ne sont pas touchés.')) return;
    toast('Création de la démonstration…', 'info');
    try {
      const p = await this.creer();
      toast('La démonstration est prête.', 'success');
      Projets.changer(p.slug);
    } catch (e) { toast(e.message || 'Impossible de créer la démonstration', 'error'); }
  },
};
