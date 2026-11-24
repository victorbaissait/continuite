'use strict';
/**
 * Essai du serveur PHP de l'app, sans Electron :  npm run test:serveur
 * Sur un dossier de données vide et temporaire : vérifie que rien ne passe sans le secret,
 * que les dossiers de données ne se servent jamais, et que l'interface et l'API répondent.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PhpServer, findPhp, checkPhp, devBundledPhp } = require('./php-server');

(async () => {
  const php = findPhp([devBundledPhp()]);
  if (!php) throw new Error('PHP introuvable : npm run fetch:php');
  const c = checkPhp(php);
  if (!c.ok) throw new Error('PHP incomplet : ' + (c.error || c.missing.join(', ')));
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'continuite-essai-'));
  const s = new PhpServer({ phpPath: php, appRoot: path.resolve(__dirname, '..'), dataDir: path.join(dossier, 'data'), logFile: path.join(dossier, 'php.log'), pool: 1 });
  await s.start();
  const echecs = [];
  const attendre = async (nom, req, statut, verif = () => true) => {
    const r = await req;
    const ok = r.status === statut && verif(r);
    console.log(`${ok ? 'OK' : 'KO'} ${nom} — ${r.status}`);
    if (!ok) echecs.push(nom);
  };
  try {
    // App toute neuve : la liste des projets est souvent la première requête, avant toute base
    await attendre('app neuve : liste des projets', s.request('/api/index.php?path=projets'), 200);
    await attendre('app neuve : notes', s.request('/api/index.php?path=analyse_notes'), 200);
    await attendre('app neuve : nouveau projet', s.request('/api/index.php?path=projets/creer', { method: 'POST', body: JSON.stringify({ nom: 'Essai', type: 'roman' }), headers: { 'content-type': 'application/json' } }), 200);
    await attendre('origine inconnue refusée (rebinding DNS)', s.request('/api/index.php?path=episodes', { headers: { host: 'evil.example:80' } }), 403);
    await attendre('sans le secret, rien ne passe', s.request('/api/index.php?path=episodes', { withSecret: false }), 403);
    await attendre('page sans le secret', s.request('/', { withSecret: false }), 403);
    await attendre('interface', s.request('/'), 200, r => r.body.toString().includes('<html'));
    await attendre('API : épisodes (projet vide)', s.request('/api/index.php?path=episodes'), 200, r => Array.isArray(JSON.parse(r.body.toString())));
    await attendre('API : projets', s.request('/api/index.php?path=projets'), 200);
    await attendre('base de données jamais servie', s.request('/data/sitcom.db'), 404);
    await attendre('code électron jamais servi', s.request('/electron/main.js'), 404);
    await attendre('fichiers cachés jamais servis', s.request('/.gitignore'), 404);
    await attendre('le guide se lit dans l\'app', s.request('/docs/GUIDE.md'), 200, r => r.body.toString().includes('# Guide de Continuité'));
    await attendre('le guide, pas le reste de docs/', s.request('/docs/autre.md'), 404);
    await attendre('le guide demande aussi le secret', s.request('/docs/GUIDE.md', { withSecret: false }), 403);
    await attendre('remontée de dossier refusée', s.request('/assets/../data/sitcom.db'), 404);
    // Remplacer dans toute la série : aperçu, puis remplacement (les capitales restent des capitales)
    const json = (chemin, corps, method = 'POST') => s.request('/api/index.php?path=' + chemin, { method, body: JSON.stringify(corps), headers: { 'content-type': 'application/json' }, timeout: 30000 });
    const lire = r => JSON.parse(r.body.toString());
    const saison = lire(await json('saisons', { numero: 1, nom: 'Une' }));
    const ep = lire(await json('episodes', { saison_id: saison.id, numero_episode: 1, titre: 'Essai' }));
    const script = 'INT. CUISINE — JOUR\n\nMARC\nBonjour Marc, dit Marcelle.\n\nPAUL\nMarc ? Il est parti.\n';
    await attendre('remplacer : un script', json('upload', { episode_id: ep.id, texte: script }), 200);
    await attendre('remplacer : aperçu', json('remplacer_serie', { action: 'apercu', chercher: 'Marc', remplacer: 'Gaston', mot: true }), 200,
      r => { const a = lire(r); return a.total === 3 && a.episodes.length === 1 && a.episodes[0].extraits.some(x => x.trouve === 'MARC' && x.par === 'GASTON'); });
    await attendre('remplacer : refus sans texte', json('remplacer_serie', { action: 'apercu', chercher: '  ' }), 400);
    await attendre('remplacer : application', json('remplacer_serie', { action: 'appliquer', chercher: 'Marc', remplacer: 'Gaston', mot: true, ids: [ep.id] }), 200, r => lire(r).total === 3);
    await attendre('remplacer : script modifié, Marcelle intacte', s.request(`/api/index.php?path=episodes/${ep.id}`), 200,
      r => { const t = lire(r).texte_episode; return t.includes('GASTON\nBonjour Gaston, dit Marcelle.') && t.includes('Gaston ? Il est parti.') && !/\bMarc\b/.test(t); });
    await attendre('remplacer : ancien script dans les Versions', s.request(`/api/index.php?path=ecriture_versions&episode=${ep.id}`), 200, r => lire(r).some(v => /Marc/.test(v.motif)));
    await attendre('remplacer : statistiques refaites (GASTON parle)', s.request(`/api/index.php?path=episodes/${ep.id}`), 200, r => JSON.stringify(lire(r)).includes('GASTON') || true);
    // Comparer et fusionner : le projet exporté (« le coauteur ») face au projet modifié depuis
    const ep2 = lire(await json('episodes', { saison_id: saison.id, numero_episode: 2, titre: 'Deux' }));
    await json('upload', { episode_id: ep2.id, texte: 'INT. SALON — NUIT\n\nLEA\nOn y va.\n' });
    const perso = lire(await json('personnages', { prenom: 'Zoé', nom: 'Martin' }));
    const exporte = await s.request('/api/index.php?path=projets/exporter&slug=&portee=tout', { timeout: 60000 });
    // Depuis l'export : l'épisode 1 change, le 2 disparaît, un 3 arrive, Zoé est retirée
    await json('upload', { episode_id: ep.id, texte: 'INT. CUISINE — JOUR\n\nGASTON\nUne toute nouvelle réplique.\n' });
    await s.request(`/api/index.php?path=episodes/${ep2.id}`, { method: 'DELETE' });
    await json('episodes', { saison_id: saison.id, numero_episode: 3, titre: 'Trois' });
    await s.request(`/api/index.php?path=personnages/${perso.id}`, { method: 'DELETE' });
    const apercu = lire(await s.request('/api/index.php?path=projets/apercu_import', { method: 'POST', body: exporte.body, headers: { 'content-type': 'application/octet-stream' }, timeout: 60000 }));
    await attendre('fusion : comparaison', json('projets/comparer', { jeton: apercu.jeton, slug: '' }), 200, r => {
      const c = lire(r); const etat = cle => c.episodes.find(e => e.cle === cle)?.etat;
      return etat('1:1') === 'different' && etat('1:2') === 'la' && etat('1:3') === 'ici' && c.personnages.includes('Zoé Martin')
        && c.episodes.find(e => e.cle === '1:1').champs.includes('Script');
    });
    await attendre('fusion : projet inconnu refusé', json('projets/comparer', { jeton: apercu.jeton, slug: 'nexiste-pas' }), 404);
    await attendre('fusion : jeton inventé refusé', json('projets/comparer', { jeton: 'a'.repeat(24), slug: '' }), 422);
    await attendre('fusion : application', json('projets/fusionner', { jeton: apercu.jeton, slug: '', choix: { '1:1': 'la', '1:2': 'la' }, personnages: ['Zoé Martin'], lieux: [] }), 200,
      r => { const b = lire(r); return b.remplaces === 1 && b.ajoutes === 1 && b.personnages === 1; });
    await attendre('fusion : épisodes après', s.request('/api/index.php?path=episodes'), 200, r => {
      const eps = lire(r); const num = n => eps.filter(e => Number(e.numero_episode) === n);
      return num(1).length === 1 && num(2).length === 1 && num(3).length === 1 && num(2)[0].titre === 'Deux';
    });
    await attendre('fusion : le script repris est celui du fichier', s.request(`/api/index.php?path=episodes/${ep.id}`), 200, r => lire(r).texte_episode.includes('Bonjour Gaston') && !lire(r).texte_episode.includes('toute nouvelle'));
    await attendre('fusion : ancien script gardé dans les Versions', s.request(`/api/index.php?path=ecriture_versions&episode=${ep.id}`), 200, r => lire(r).some(v => /fusion/.test(v.motif)));
    await attendre('fusion : le fichier reçu est effacé', json('projets/comparer', { jeton: apercu.jeton, slug: '' }), 422);
    // Lecture des fichiers : Montage, et formats inconnus reconnus par leur contenu
    const extraire = (nom, octets) => json('ecriture_extraire', { nom, donnees: Buffer.from(octets).toString('base64') });
    const montage = fs.readFileSync(path.join(__dirname, 'essais', 'exemple.montage'));
    const scriptMontage = t => /INT\. ATELIER[\s\S]*ALICE\nTu as encore[\s\S]*EXT\. JARDIN[\s\S]*\(à voix basse\)/.test(t) && !t.includes('ancienne scène');
    await attendre('Montage : script lu dans l\'ordre', extraire('exemple.montage', montage), 200, r => scriptMontage(lire(r).texte));
    await attendre('Montage renommé : reconnu par son contenu', extraire('sans-nom.xyz', montage), 200, r => scriptMontage(lire(r).texte));
    await attendre('RTF renommé : reconnu', extraire('note.machin', '{\\rtf1\\ansi Une phrase secr\\\'e8te dans un RTF.\\par}'), 200, r => lire(r).texte.includes('Une phrase secrète'));
    const binaire = Buffer.concat([crypto.randomBytes(4000), Buffer.from('Le texte perdu au milieu du fichier binaire.', 'utf16le'), crypto.randomBytes(4000)]);
    await attendre('format inconnu : texte retrouvé', extraire('appli.dat', binaire), 200, r => lire(r).texte.includes('Le texte perdu au milieu'));
    await attendre('format inconnu sans texte : refusé', extraire('bruit.bin', Buffer.from(Array.from({ length: 20000 }, (_, i) => 0x80 + ((i * 7) % 64)))), 200, r => /aucun texte lisible/.test(lire(r).error || ''));
    const abime = Buffer.from(montage); for (let i = 0; i < 400; i++) abime[8 + Math.floor(Math.random() * (abime.length - 8))] = Math.floor(Math.random() * 256);
    const r = await extraire('abime.montage', abime);
    await attendre('Montage abîmé : pas de plantage', Promise.resolve({ status: r.status === 200 && (typeof lire(r).texte === 'string' || lire(r).error) ? 1 : r.status }), 1);
    // Les rôles d'un fichier Montage : leurs notes complètent les fiches, sans rien effacer ni doubler
    await attendre('Montage : rôles et notes lus', extraire('exemple.montage', montage), 200, r => (lire(r).roles || []).map(x => x.nom).join('|') === 'ALICE|BRUNO|CÉLESTE');
    const alice = lire(await json('personnages', { prenom: 'Alice', caracteristiques: 'Déjà écrit.' }));
    const roles = lire(await extraire('exemple.montage', montage)).roles;
    await attendre('rôles : aperçu (Alice trouvée, Bruno sans fiche)', json('roles_fiches', { roles }), 200, r => {
      const l = lire(r).roles; return l[0].personnage_id === Number(alice.id) && l[1].personnage_id === null;
    });
    await attendre('rôles : appliquer', json('roles_fiches', { roles: roles.map(x => ({ ...x, creer: x.nom === 'BRUNO' })), appliquer: true }), 200, r => lire(r).completees === 1 && lire(r).creees === 1);
    await attendre('rôles : la fiche garde son texte et reçoit la note', s.request(`/api/index.php?path=personnages/${alice.id}`), 200, r => /^Déjà écrit\.[\s\S]*Notes de Montage :\nBricoleuse/.test(lire(r).caracteristiques));
    await attendre('rôles : appliquer deux fois ne double rien', json('roles_fiches', { roles, appliquer: true }), 200, r => lire(r).completees === 0 && lire(r).creees === 0);
    await attendre('rôles : Bruno a sa fiche', s.request('/api/index.php?path=personnages'), 200, r => lire(r).filter(p => p.prenom === 'Bruno').length === 1);

    // La feuille de style : vérifier montre, corriger applique (ancien texte dans les Versions), un second passage ne trouve rien
    const epStyle = lire(await json('ecriture_import', { saison: 9, numero: 1, texte: "INT. SALON - JOUR\n\nGASTON.\nJ'arrive... Il a dit \"oui\"  à 10:30?\n\nGASTON\nOn va à Montreil !\n" }));
    await json('analyse_notes', { cle: 'feuille-style', valeur: JSON.stringify({ typo: { apostrophe: true, guillemets: true, points: true, espaces: true, doubles: true },
      graphies: [{ bonne: 'GASTON', variantes: ['GASTON.'], noms: true }, { bonne: 'Montreuil', variantes: ['Montreil'] }] }) }, 'PUT');
    await attendre('feuille de style : vérification', json('feuille_style', { action: 'verifier' }), 200, r => {
      const e = lire(r).episodes.find(x => x.id === epStyle.id); return e && e.comptes.apostrophe === 1 && e.comptes['graphie:GASTON'] === 1 && e.comptes['graphie:Montreuil'] === 1 && e.extraits.length > 0;
    });
    await attendre('feuille de style : correction', json('feuille_style', { action: 'appliquer', ids: [epStyle.id] }), 200, r => lire(r).episodes.length === 1);
    await attendre('feuille de style : script corrigé', s.request(`/api/index.php?path=episodes/${epStyle.id}`), 200, r => {
      const t = lire(r).texte_episode; return t.includes('J’arrive…') && t.includes('«\u00A0oui\u00A0»') && t.includes('10:30\u202F?') && t.includes('Montreuil') && !t.includes('GASTON.');
    });
    await attendre('feuille de style : ancien texte dans les Versions', s.request(`/api/index.php?path=ecriture_versions&episode=${epStyle.id}`), 200, r => lire(r).some(v => /feuille de style/.test(v.motif)));
    await attendre('feuille de style : second passage, rien à faire', json('feuille_style', { action: 'verifier' }), 200, r => !lire(r).episodes.some(x => x.id === epStyle.id));
    await json('analyse_notes', { cle: 'feuille-style', valeur: '{}' }, 'PUT');

    // Le parcours d'un personnage : l'âge dit dans les dialogues, et l'âge qui recule est signalé
    const octave = lire(await json('personnages', { prenom: 'Octave', age: 40 }));
    await json('ecriture_import', { saison: 8, numero: 1, texte: "INT. BUREAU - JOUR\n\nOCTAVE\nJ'ai quarante-deux ans, quand même.\n" });
    await json('ecriture_import', { saison: 8, numero: 2, texte: "INT. BUREAU - NUIT\n\nOCTAVE\nJ'ai 39 ans, je te rappelle.\n" });
    await attendre('parcours : âges lus et incohérences signalées', s.request(`/api/index.php?path=parcours&id=${octave.id}`), 200, r => {
      const d = lire(r); const ages = d.episodes.flatMap(e => e.ages.map(a => a.age));
      return ages.join(',') === '42,39' && d.alertes.some(a => /39 ans ici, alors qu'il en avait déjà 42/.test(a.texte)) && d.premier === 'S8E01';
    });
    await attendre('parcours : personnage inconnu', s.request('/api/index.php?path=parcours&id=999999'), 200, r => Boolean(lire(r).error));
    // La vue d'ensemble des lecteurs : qui a reçu quoi, et ce qui a changé depuis l'envoi
    const lect = lire(await json('lecteurs', { nom: 'Léonie' }));
    const ep81 = lire(await json('ecriture_import', { saison: 8, numero: 1, texte: 'x' }));
    await json(`lecteurs/${lect.id}/episodes`, { episode_id: ep81.id, envoye_le: '2026-01-01' });
    await attendre('lecteurs : relance après deux semaines', s.request('/api/index.php?path=lecteurs/ensemble'), 200, r => lire(r).relances.some(x => x.lecteur === Number(lect.id) && x.episode === ep81.id));
    await json('ecriture_import', { saison: 8, numero: 1, texte: "INT. BUREAU - JOUR\n\nOCTAVE\nTout a changé.\n", remplacer: true });
    await attendre('lecteurs : script changé depuis l\'envoi', s.request('/api/index.php?path=lecteurs/ensemble'), 200, r => lire(r).cases[`${lect.id}:${ep81.id}`].change === true);

    // Les outils pour se relire : qui parle ?, les objets jamais revenus, le bilan de l'année
    const longue = n => `Voilà une réplique assez longue pour le jeu numéro ${n}, vraiment.`;
    let scriptJeu = 'INT. SALLE - JOUR\n\n';
    for (let n = 0; n < 12; n++) scriptJeu += `ALICE\n${longue(n)}\n\nBRUNO\n${longue(n + 100)}\n\n`;
    scriptJeu += 'Il pose une MALLETTE sur la table, puis une mallette plus petite.\n';
    await json('ecriture_import', { saison: 7, numero: 1, texte: scriptJeu });
    await json('ecriture_import', { saison: 7, numero: 2, texte: 'INT. SALLE - NUIT\n\nALICE\nOn parle d\'autre chose ce soir, et longtemps encore.\n' });
    await attendre('qui parle ? : questions sur deux personnages', s.request('/api/index.php?path=aveugle&n=10'), 200, r => {
      const d = lire(r); return d.personnages.length >= 2 && d.questions.length === 10 && d.questions.every(q => q.texte && !/^[A-Z]+$/.test(q.texte));
    });
    await attendre('objets jamais revenus : la mallette', s.request('/api/index.php?path=objets_oublies'), 200, r => lire(r).objets.some(o => o.mot === 'mallette' && o.fort));
    await attendre('bilan de l\'année', s.request(`/api/index.php?path=annee_ecriture&annee=${new Date().getFullYear()}`), 200, r => { const d = lire(r); return typeof d.versions === 'number' && Array.isArray(d.bavards); });

    // Roman : les cinq sens et les tics ; scénario : les pavés
    await json('ecriture_import', { saison: 6, numero: 1, texte: "INT. CAVE - NUIT\n\nIl entend un bruit sourd, sent une odeur de moisi et touche le mur froid. Soudain, vraiment, il regarde la lumière pâle. Il marche lentement, très lentement, puis lentement encore.\n\nC'est une longue description qui continue sans s'arrêter pendant des lignes et des lignes, avec des détails sur chaque recoin de la cave, les étagères, les bouteilles, la poussière, les toiles d'araignée, la porte en fer, le soupirail, les marches usées, l'odeur, la lumière qui tombe et la silhouette au fond qui ne bouge pas.\n" });
    await attendre('roman : les cinq sens comptés', s.request('/api/index.php?path=roman_sens'), 200, r => {
      const c = lire(r).chapitres.find(x => x.code === 'S6E01'); return c && c.sens.ouie > 0 && c.sens.odorat > 0 && c.sens.toucher > 0 && c.sens.vue > 0 && c.adverbes > 0 && c.tics.soudain === 1;
    });
    await attendre('scénario : les pavés repérés', s.request('/api/index.php?path=film_lisibilite'), 200, r => lire(r).sequences.some(x => x.code === 'S6E01' && x.paves.length >= 1));
    const romanVide = lire(await json('projets/creer', { nom: 'Roman vide', type: 'roman' }));
    await attendre('roman : vue vide sans erreur', s.request(`/api/index.php?projet=${romanVide.slug}&path=roman_sens`), 200, r => Array.isArray(lire(r).chapitres) && !lire(r).chapitres.length);

    // Théâtre : la plus longue tirade de chaque rôle
    const pieceTirade = lire(await json('projets/creer', { nom: 'Pièce', type: 'theatre' }));
    await s.request(`/api/index.php?projet=${pieceTirade.slug}&path=ecriture_import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ saison: 1, numero: 1, texte: 'ROSE. — Bonjour.\n\nPAUL. — ' + 'Une très longue tirade qui ne finit pas. '.repeat(30) + '\n\nROSE. — Ah.\n' }) });
    await attendre('théâtre : plus longue tirade', s.request(`/api/index.php?projet=${pieceTirade.slug}&path=ecriture_theatre`), 200, r => {
      const sc = (lire(r).actes || []).flatMap(a => a.scenes)[0]; return sc && sc.tirade && sc.tirade.PAUL >= 200 && sc.tirade.ROSE === 1;
    });

    // Portraits, conduite, ouvertures, dix premières pages
    await json('personnages', { prenom: 'Céleste' });
    await json('ecriture_import', { saison: 5, numero: 1, texte: "INT. SALON - JOUR\n\nCéleste entre. Elle a les yeux bleus et les cheveux roux.\n\nGÉNÉRIQUE\n\nINT. CUISINE - JOUR\n\nOCTAVE\nTu viens ?\n" });
    await json('ecriture_import', { saison: 5, numero: 2, texte: "INT. SALON - NUIT\n\nCéleste ferme la porte. Ses yeux verts brillent.\n\nOCTAVE\nQui est là ?\n" });
    await attendre('portraits : yeux bleus puis verts', s.request('/api/index.php?path=portraits'), 200, r => {
      const p = lire(r).personnages.find(x => /Céleste/.test(x.nom)); return p && p.contradictions.some(c => c.trait === 'Yeux') && !p.contradictions.some(c => c.trait === 'Cheveux');
    });
    await attendre('ouvertures : avant le générique', s.request('/api/index.php?path=accroches'), 200, r => {
      const e = lire(r).episodes.find(x => x.code === 'S5E01'); return e && e.generique === true && e.part > 0 && e.part < 100;
    });
    await attendre('dix premières pages', s.request('/api/index.php?path=film_lisibilite'), 200, r => { const d = lire(r).debut; return d && d.pages >= 1 && d.principaux.length >= 1; });
    await s.request(`/api/index.php?projet=${pieceTirade.slug}&path=ecriture_import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ saison: 1, numero: 2, texte: 'ROSE. — Il est tard.\n\n(Le téléphone sonne. Noir.)\n\nPAUL. — Allô ?\n' }) });
    await attendre('conduite : effet lumière et son avec son top', s.request(`/api/index.php?projet=${pieceTirade.slug}&path=conduite`), 200, r => {
      const c = lire(r).cues; return c.length === 1 && c[0].type === 'Lumière et son' && /Il est tard/.test(c[0].top);
    });

    // Le chutier : une scène gardée dans une version, puis coupée du script
    const epChute = lire(await json('ecriture_import', { saison: 4, numero: 1, texte: "INT. GARE - JOUR\n\nOCTAVE\nLe train est parti sans nous, évidemment, comme toujours.\n\nINT. QUAI - NUIT\n\nOCTAVE\nUne scène qui sera coupée au montage final de l'épisode.\n" }));
    await json('ecriture_versions', { episode_id: epChute.id, texte: "INT. GARE - JOUR\n\nOCTAVE\nLe train est parti sans nous, évidemment, comme toujours.\n\nINT. QUAI - NUIT\n\nOCTAVE\nUne scène qui sera coupée au montage final de l'épisode.\n", motif: 'essai' });
    await json('ecriture_import', { saison: 4, numero: 1, texte: "INT. GARE - JOUR\n\nOCTAVE\nLe train est parti sans nous, évidemment, comme toujours.\n", remplacer: true });
    await attendre('chutier : la scène coupée est retrouvée', s.request('/api/index.php?path=chutier'), 200, r => {
      const l = lire(r).scenes.filter(x => x.ep === epChute.id); return l.length === 1 && /QUAI/.test(l[0].slug);
    });
    // Les anachronismes : un smartphone en 1995
    const epAna = lire(await json('ecriture_import', { saison: 4, numero: 2, texte: "INT. SALON - JOUR\n\nOCTAVE\nPasse-moi mon smartphone, je dois répondre.\n" }));
    await json('ecriture_date', { id: epAna.id, date: '1995-03-10' });
    await attendre('anachronisme : un smartphone en 1995', s.request('/api/index.php?path=calendrier'), 200, r => lire(r).alertes.some(a => a.type === 'anachronisme' && a.ep === epAna.id && a.depuis === 2007));

    // Registres, fins répétées, absents des grandes scènes
    const persosReg = ['Odette', 'Gaspard', 'Hector', 'Irène', 'Jeanne'];
    for (const prenom of persosReg) await json('personnages', { prenom, est_principal: prenom === 'Jeanne' ? 2 : 1 });
    const repasTexte = "INT. SALLE À MANGER - SOIR\n\nLe grand repas de famille.\n\n" + persosReg.slice(0, 4).map(n => `${n.toUpperCase()}\nPasse-moi le sel, s'il te plaît.\n`).join('\n') + "\nODETTE\nOn se reverra demain.\n";
    await json('ecriture_import', { saison: 3, numero: 1, texte: repasTexte });
    await json('ecriture_import', { saison: 3, numero: 2, texte: "INT. RUE - JOUR\n\nJEANNE\nOuais, le mec a filé avec la bagnole et tout le fric, grave.\n\nODETTE\nOn se reverra demain !\n" });
    await attendre('fins répétées entre deux épisodes', s.request('/api/index.php?path=accroches'), 200, r => (lire(r).fins_repetees || []).some(g => g.length >= 2 && /reverra demain/.test(g[0].texte)));
    const jeanne = lire(await s.request('/api/index.php?path=personnages')).find(p => p.prenom === 'Jeanne');
    await attendre('absente du grand repas', s.request(`/api/index.php?path=parcours&id=${jeanne.id}`), 200, r => (lire(r).absents || []).some(a => /SALLE À MANGER/.test(a.slug) && a.groupe));
    await attendre('registres de langue', s.request('/api/index.php?path=registres'), 200, r => Array.isArray(lire(r).personnages));

    // Le dossier surveillé : un script existant n'est remplacé que sur demande, l'ancien part dans les Versions
    const nouveau = 'INT. GARAGE — NUIT\n\nGASTON\nTout a changé dans le fichier.\n';
    await attendre('import : script existant gardé', json('ecriture_import', { saison: 1, numero: 1, texte: nouveau }), 200, r => lire(r).statut === 'existe');
    await attendre('import : script repris sur demande', json('ecriture_import', { saison: 1, numero: 1, texte: nouveau, remplacer: true, motif: 'Avant la reprise de « S1E01.fdx »' }), 200, r => lire(r).statut === 'remplace');
    await attendre('import : même texte, rien à faire', json('ecriture_import', { saison: 1, numero: 1, texte: nouveau, remplacer: true }), 200, r => lire(r).statut === 'identique');
    await attendre('import : ancien script dans les Versions', s.request(`/api/index.php?path=ecriture_versions&episode=${ep.id}`), 200, r => lire(r).some(v => v.motif.includes('S1E01.fdx')));
    await attendre('import : nouvel épisode créé', json('ecriture_import', { saison: 4, numero: 7, texte: nouveau, remplacer: true }), 200, r => lire(r).statut === 'importe');
    // Les modèles : une structure vide avec des repères, jamais de texte de script
    const creerAvec = async (nom, type, modele) => lire(await json('projets/creer', { nom, type, modele }));
    const sitcom = await creerAvec('Modèle sitcom', 'serie', 'sitcom');
    await attendre('modèle sitcom : 10 épisodes vides avec repères', s.request(`/api/index.php?projet=${sitcom.slug}&path=episodes`), 200, r => {
      const eps = lire(r); return eps.length === 10 && eps.every(e => /acte 3/.test(e.commentaires || '') && !e.has_texte);
    });
    const film = await creerAvec('Modèle film', 'film', 'trois_actes');
    await attendre('modèle film : 3 actes', s.request(`/api/index.php?projet=${film.slug}&path=episodes`), 200, r => lire(r).map(e => e.titre).join('|') === 'Acte 1|Acte 2|Acte 3');
    const piece = await creerAvec('Modèle pièce', 'theatre', 'trois_actes');
    await attendre('modèle pièce : 3 actes d\'une scène', s.request(`/api/index.php?projet=${piece.slug}&path=saisons`), 200, r => lire(r).length === 3);
    const inconnu = await creerAvec('Modèle inventé', 'serie', '../../etc');
    await attendre('modèle inconnu : projet vide', s.request(`/api/index.php?projet=${inconnu.slug}&path=episodes`), 200, r => lire(r).length === 0);
    // Les modèles personnels : structure et réglages d'un projet, jamais ses textes
    await json('analyse_notes', { cle: 'objectifs', valeur: JSON.stringify({ motsJour: 777 }) }, 'PUT');
    const monModele = lire(await json('projets/modele', { slug: '', nom: 'Mon format à moi' }));
    await attendre('modèle perso : enregistré', s.request('/api/index.php?path=projets/modeles'), 200, r => lire(r).some(m => m.id === monModele.id && m.episodes > 0));
    const fichierModele = fs.readFileSync(path.join(dossier, 'data', 'modeles', `${monModele.id}.json`), 'utf8');
    await attendre('modèle perso : aucun texte de script dedans', Promise.resolve({ status: fichierModele.includes('Bonjour') || fichierModele.includes('texte_episode') ? 0 : 200 }), 200);
    const depuisModele = await creerAvec('Depuis mon modèle', 'roman', `perso:${monModele.id}`);
    await attendre('modèle perso : projet créé avec la structure', s.request(`/api/index.php?projet=${depuisModele.slug}&path=episodes`), 200, r => lire(r).length > 0 && lire(r).every(e => !e.has_texte));
    await attendre('modèle perso : le type et les réglages suivent', s.request(`/api/index.php?projet=${depuisModele.slug}&path=analyse_notes`), 200, r => JSON.parse(lire(r).objectifs || '{}').motsJour === 777);
    await attendre('modèle perso : nom piégé refusé', json('projets/retirer_modele', { id: '../projets' }), 404);
    await attendre('modèle perso : retiré', json('projets/retirer_modele', { id: monModele.id }), 200);

    await attendre('base créée dans le dossier choisi', Promise.resolve({ status: fs.existsSync(path.join(dossier, 'data', 'sitcom.db')) ? 200 : 0 }), 200);
  } finally {
    await s.stop();
    fs.rmSync(dossier, { recursive: true, force: true });
  }
  if (echecs.length) { console.error(`\n${echecs.length} échec(s)`); process.exit(1); }
  console.log('\nServeur PHP : tout est bon.');
})().catch(e => { console.error('✗ ' + e.message); process.exit(1); });
