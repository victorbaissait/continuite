'use strict';
/**
 * Essai de la sauvegarde automatique, sans Electron :  npm run test:sauvegarde
 * Deux projets dans un dossier vide et temporaire : chaque projet devient un fichier .continuite, les anciennes
 * copies au-delà de « garder » partent, et le fichier sauvegardé se réimporte.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PhpServer, findPhp, devBundledPhp } = require('./php-server');
const sauvegarde = require('./sauvegarde');

(async () => {
  const php = findPhp([devBundledPhp()]);
  if (!php) throw new Error('PHP introuvable : npm run fetch:php');
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'continuite-sauvegarde-'));
  const s = new PhpServer({ phpPath: php, appRoot: path.resolve(__dirname, '..'), dataDir: path.join(racine, 'data'), logFile: path.join(racine, 'php.log'), pool: 1 });
  await s.start();
  const echecs = [];
  const verifier = (nom, ok, detail = '') => { console.log(`${ok ? 'OK' : 'KO'} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) echecs.push(nom); };
  const json = (chemin, corps) => s.request('/api/index.php?' + chemin, { method: 'POST', body: JSON.stringify(corps), headers: { 'content-type': 'application/json' }, timeout: 30000 });
  try {
    // Deux projets, dont un avec un nom qui gênerait un système de fichiers
    await json('path=saisons', { numero: 1, nom: 'Une' });
    const p2 = JSON.parse((await json('path=projets/creer', { nom: 'Roman : « essai » / v2', type: 'roman' })).body.toString());
    verifier('deux projets créés', Boolean(p2.slug));

    const dossier = path.join(racine, 'sauvegardes');
    const sansDossier = await sauvegarde.sauvegarder(s, { dossier: '', frequence: 'jour' });
    verifier('sans dossier choisi : refus clair', !sansDossier.ok && /dossier/i.test(sansDossier.erreurs[0]));
    const absent = await sauvegarde.sauvegarder(s, { dossier: path.join(racine, 'nulle-part'), frequence: 'jour' });
    verifier('dossier introuvable : refus clair', !absent.ok && /introuvable/.test(absent.erreurs[0]));

    fs.mkdirSync(dossier);
    const t0 = new Date('2026-01-01T10:00:00');
    const b1 = await sauvegarde.sauvegarder(s, { dossier, frequence: 'jour', garder: 2 }, t0);
    verifier('première sauvegarde', b1.ok && b1.projets === 2 && b1.octets > 0, JSON.stringify({ projets: b1.projets, octets: b1.octets, erreurs: b1.erreurs }));
    const sousDossiers = fs.readdirSync(dossier);
    verifier('un dossier par projet, au nom sûr', sousDossiers.length === 2 && sousDossiers.every(d => !/[\\/:*?"<>|]/.test(d)), sousDossiers.join(' · '));
    for (let i = 1; i <= 3; i++) await sauvegarde.sauvegarder(s, { dossier, frequence: 'jour', garder: 2 }, new Date(t0.getTime() + i * 60000));
    const copies = sousDossiers.map(d => fs.readdirSync(path.join(dossier, d)).filter(f => f.endsWith('.continuite')).length);
    verifier('les anciennes copies partent (2 gardées)', copies.every(n => n === 2), copies.join(', '));
    const gardees = fs.readdirSync(path.join(dossier, sousDossiers[0])).sort();
    verifier('ce sont les plus récentes qui restent', gardees.every(f => /10h0[23]m/.test(f)), gardees.join(' · '));
    verifier('aucun fichier partiel laissé', !fs.readdirSync(dossier, { recursive: true }).some(f => String(f).endsWith('.partiel')));

    // Sauvegardes chiffrées : rien en clair dans le dossier, le bon mot de passe rouvre, le mauvais non
    const dossierC = path.join(racine, 'chiffrees');
    fs.mkdirSync(dossierC);
    const sansMdp = await sauvegarde.sauvegarder(s, { dossier: dossierC, frequence: 'jour', garder: 2, chiffre: true }, new Date('2026-01-02T10:00:00'));
    verifier('chiffrée sans mot de passe : refusée', !sansMdp.ok && /mot de passe/.test(sansMdp.erreurs.join(' ')));
    const bc = await sauvegarde.sauvegarder(s, { dossier: dossierC, frequence: 'jour', garder: 2, chiffre: true }, new Date('2026-01-02T11:00:00'), 'un mot de passe solide');
    const fichiersC = fs.readdirSync(dossierC, { recursive: true }).map(String).filter(f => f.endsWith('.continuite')).map(f => path.join(dossierC, f));
    verifier('sauvegarde chiffrée', bc.ok && fichiersC.length === 2 && fichiersC.every(f => sauvegarde.estChiffre(f)), JSON.stringify(bc.erreurs));
    verifier('aucun fichier en clair dans le dossier', fichiersC.every(f => !fs.readFileSync(f).subarray(0, 2).equals(Buffer.from('PK'))) && !fs.readdirSync(dossierC, { recursive: true }).some(f => /partiel/.test(String(f))));
    const clair = path.join(racine, 'clair.continuite');
    await sauvegarde.dechiffrerFichier(fichiersC[0], clair, 'un mot de passe solide');
    verifier('le bon mot de passe rouvre un vrai projet', fs.readFileSync(clair).subarray(0, 2).equals(Buffer.from('PK')));
    let refuse = false;
    try { await sauvegarde.dechiffrerFichier(fichiersC[0], path.join(racine, 'faux'), 'pas le bon'); } catch { refuse = !fs.existsSync(path.join(racine, 'faux')); }
    verifier('le mauvais mot de passe est refusé, sans rien laisser', refuse);
    verifier('la liste signale les copies chiffrées', sauvegarde.lister({ dossier: dossierC }).every(x => x.chiffre));

    // Le fichier sauvegardé se rouvre : l'import l'accepte
    const unFichier = path.join(dossier, sousDossiers[0], fs.readdirSync(path.join(dossier, sousDossiers[0]))[0]);
    const apercu = await s.request('/api/index.php?path=projets/apercu_import', { method: 'POST', body: fs.readFileSync(unFichier), headers: { 'content-type': 'application/octet-stream' }, timeout: 60000 });
    const a = JSON.parse(apercu.body.toString());
    verifier('la sauvegarde se réimporte', apercu.status === 200 && Boolean(a.jeton), a.error || a.nom);

    verifier('« une fois par jour » : à faire après 24 h', sauvegarde.aFaire({ dossier, frequence: 'jour', derniere: 0 }, 'jour') && !sauvegarde.aFaire({ dossier, frequence: 'jour', derniere: Date.now() }, 'jour'));
    verifier('« à la fermeture » : seulement en quittant', sauvegarde.aFaire({ dossier, frequence: 'fermeture' }, 'fermeture') && !sauvegarde.aFaire({ dossier, frequence: 'fermeture' }, 'jour'));
    verifier('« jamais » : rien', !sauvegarde.aFaire({ dossier, frequence: 'non' }, 'jour') && !sauvegarde.aFaire({ dossier, frequence: 'non' }, 'fermeture'));
    verifier('réglages abîmés : valeurs sûres', JSON.stringify(sauvegarde.nettoyerReglages({ frequence: 'toujours', garder: -5, dossier: 3 })) === JSON.stringify({ dossier: '', frequence: 'non', garder: 1, derniere: 0, resultat: null, chiffre: false }));
  } finally {
    await s.stop();
    fs.rmSync(racine, { recursive: true, force: true });
  }
  if (echecs.length) { console.error(`\n${echecs.length} échec(s)`); process.exit(1); }
  console.log('\nSauvegarde automatique : tout est bon.');
})().catch(e => { console.error('✗ ' + e.message); process.exit(1); });
