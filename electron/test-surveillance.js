'use strict';
/**
 * Essai du dossier surveillé, sans l'app :  npm run test:surveillance
 * Un faux import note ce qu'on lui envoie ; les fichiers sont écrits dans un dossier temporaire.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Surveillance, nomVersEpisode, ignore } = require('./surveillance');

const echecs = [];
const verifier = (nom, ok, detail = '') => { console.log(`${ok ? 'OK' : 'KO'} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) echecs.push(nom); };

(async () => {
  // Les noms de fichier
  const n = nom => { const e = nomVersEpisode(nom); return e ? `${e.saison}:${e.numero}` : null; };
  verifier('« S2E05 Titre.fdx »', n('S2E05 Titre.fdx') === '2:5');
  verifier('« 2x05.fountain »', n('2x05.fountain') === '2:5');
  verifier('« Saison 1 episode 25.montage »', n('Saison 1 episode 25.montage') === '1:25');
  verifier('« saison 3 épisode 2.docx »', n('saison 3 épisode 2.docx') === '3:2');
  verifier('sans numéro : ignoré', n('Notes.docx') === null && n('S0E00.txt') === null);
  verifier('anciennes copies laissées de côté', ignore('saison 1 episode 1 [old].montage') && ignore('S1E02 copie.fdx') && ignore('~$S1E02.docx') && !ignore('S1E02.fdx'));

  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'continuite-surv-'));
  const passe = Date.now() / 1000 - 60;
  const ecrire = (nom, texte, age = 0) => { const f = path.join(dossier, nom); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, texte); fs.utimesSync(f, passe + age, passe + age); return f; };
  const appels = [];
  // Le faux projet : l'épisode 1:1 a déjà un script, les autres sont vides
  const scripts = { '1:1': 'ancien' };
  const importer = async a => {
    appels.push(a);
    const cle = `${a.saison}:${a.numero}`;
    const texte = a.octets.toString();
    if (scripts[cle] && !a.remplacer) return { statut: 'existe' };
    if (scripts[cle] === texte) return { statut: 'identique' };
    const statut = scripts[cle] ? 'remplace' : 'importe';
    scripts[cle] = texte;
    return { statut, id: 1 };
  };
  const evenements = [];
  let enregistre = null;
  const s = new Surveillance({ importer, prevenir: e => evenements.push(e), enregistrer: e => { enregistre = JSON.parse(JSON.stringify(e)); }, intervalle: 3600000 });
  try {
    ecrire('S1E01.fountain', 'nouveau 1');
    ecrire('S1E02.fountain', 'deux');
    ecrire('Saison 1/saison 1 episode 3 [old].fountain', 'vieux trois');
    ecrire('Saison 1/S1E03.fdx', 'trois', 10);
    ecrire('S1E03 brouillon.txt', 'trois plus ancien', 5);
    ecrire('notes.txt', 'rien à voir');
    ecrire('photo.png', 'image');

    // Premier passage : les épisodes vides sont remplis, celui qui a un script n'est pas touché
    await s.choisir('', dossier);
    verifier('premier passage : épisodes vides remplis', scripts['1:2'] === 'deux' && scripts['1:3'] === 'trois', JSON.stringify(scripts));
    verifier('premier passage : script existant intact', scripts['1:1'] === 'ancien');
    verifier('le fichier le plus récent gagne, « old » ignoré', appels.filter(a => a.numero === 3).length === 1 && appels.find(a => a.numero === 3).nom === 'S1E03.fdx');
    verifier('les autres fichiers sont ignorés', !appels.some(a => /notes|photo/.test(a.nom)));
    verifier('deux événements', evenements.length === 2, JSON.stringify(evenements.map(e => e.statut)));

    // Rien n'a changé : aucun appel
    const avant = appels.length;
    await s.verifier();
    verifier('rien de changé : aucun import', appels.length === avant);

    // Le fichier d'un épisode qui a un script change : il est repris
    ecrire('S1E01.fountain', 'nouveau 1, réécrit', 30);
    await s.verifier();
    verifier('fichier modifié : script repris', scripts['1:1'] === 'nouveau 1, réécrit' && evenements.at(-1).statut === 'remplace', JSON.stringify([scripts['1:1'], evenements.map(e => e.statut)]));

    // Même date mais contenu identique (fichier « touché ») : rien
    const avant2 = appels.length;
    const f = path.join(dossier, 'S1E02.fountain');
    fs.utimesSync(f, passe + 40, passe + 40);
    await s.verifier();
    verifier('fichier touché sans changement : rien', appels.length === avant2);

    // Un fichier en cours d'écriture (modifié à l'instant) attend le tour suivant
    fs.writeFileSync(path.join(dossier, 'S1E04.txt'), 'quatre');
    await s.verifier();
    verifier('fichier en cours d\'écriture : attend', !scripts['1:4']);
    fs.utimesSync(path.join(dossier, 'S1E04.txt'), passe + 50, passe + 50);
    await s.verifier();
    verifier('puis il est repris', scripts['1:4'] === 'quatre');

    // Une erreur d'import est notée, et l'app ne la redemande pas tant que le fichier ne change pas
    const s2 = new Surveillance({ importer: async () => { throw new Error('illisible'); }, intervalle: 3600000 });
    ecrire('S2E01.fdx', 'abîmé');
    await s2.choisir('autre', dossier);
    verifier('erreur notée dans le journal', s2.journal('autre').some(j => j.statut === 'erreur' && j.erreur === 'illisible'));

    // État enregistré, puis arrêt
    verifier('état enregistré', enregistre && enregistre.dossiers[''] === dossier && Object.keys(enregistre.vus).length >= 4);
    s.retirer('');
    verifier('arrêter oublie le dossier', s.dossier('') === null);
    // Dossier disparu : pas de plantage
    const s3 = new Surveillance({ importer, intervalle: 3600000, etat: { dossiers: { x: path.join(dossier, 'nexiste-pas') } } });
    verifier('dossier disparu : rien ne casse', Array.isArray(await s3.verifier()));
    s.arreter(); s2.arreter(); s3.arreter();
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
  if (echecs.length) { console.error(`\n${echecs.length} échec(s)`); process.exit(1); }
  console.log('\nDossier surveillé : tout est bon.');
})().catch(e => { console.error('✗ ' + (e.stack || e.message)); process.exit(1); });
