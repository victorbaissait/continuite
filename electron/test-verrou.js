'use strict';
// Essai du verrou, sans Electron :  npm run test:verrou
const v = require('./verrou');

const echecs = [];
const verifier = (nom, ok, detail = '') => { console.log(`${ok ? 'OK' : 'KO'} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) echecs.push(nom); };

let r = v.changer({}, { nouveau: 'abc' });
verifier('trop court : refusé', Boolean(r.error));
r = v.changer({}, { nouveau: 'clé-secrète 🎬' });
verifier('mot de passe défini', !r.error && v.actif(r.verrou));
const reglage = r.verrou;
verifier('seule l\'empreinte est gardée', !JSON.stringify(reglage).includes('clé') && reglage.empreinte.length === 128 && reglage.sel.length === 32);
verifier('bon mot de passe accepté', v.verifier(reglage, 'clé-secrète 🎬'));
verifier('mauvais mot de passe refusé', !v.verifier(reglage, 'clé-secrète') && !v.verifier(reglage, '') && !v.verifier(reglage, null));
verifier('même texte, autre écriture Unicode (é composé) accepté', v.verifier(reglage, 'clé-secrète 🎬'));
const autre = v.changer({}, { nouveau: 'clé-secrète 🎬' }).verrou;
verifier('deux fois le même mot de passe : deux empreintes différentes (sel)', autre.empreinte !== reglage.empreinte);
verifier('changer sans l\'ancien : refusé', Boolean(v.changer(reglage, { nouveau: 'nouveau-mdp' }).error));
verifier('changer avec un faux ancien : refusé', Boolean(v.changer(reglage, { ancien: 'faux', nouveau: 'nouveau-mdp' }).error));
const change = v.changer(reglage, { ancien: 'clé-secrète 🎬', nouveau: 'nouveau-mdp' });
verifier('changer avec le bon ancien', !change.error && v.verifier(change.verrou, 'nouveau-mdp') && !v.verifier(change.verrou, 'clé-secrète 🎬'));
const minutes = v.changer(reglage, { ancien: 'clé-secrète 🎬', minutes: 15, veille: false });
verifier('régler l\'inactivité garde le mot de passe', !minutes.error && minutes.verrou.minutes === 15 && minutes.verrou.veille === false && v.verifier(minutes.verrou, 'clé-secrète 🎬'));
verifier('une durée inconnue revient à « jamais »', v.nettoyer({ minutes: 7 }).minutes === 0);
const retire = v.changer(reglage, { ancien: 'clé-secrète 🎬', nouveau: null });
verifier('retirer avec le bon ancien', !retire.error && !v.actif(retire.verrou));
verifier('retirer sans le bon ancien : refusé', Boolean(v.changer(reglage, { ancien: 'x', nouveau: null }).error));
verifier('après quelques erreurs, il faut attendre de plus en plus', v.delai(1) === 0 && v.delai(4) > 0 && v.delai(7) > v.delai(5) && v.delai(100) === v.delai(7));
verifier('un réglage abîmé ne verrouille pas par erreur', !v.actif({ empreinte: 'zz', sel: 'yy' }) && !v.actif(null));

if (echecs.length) { console.error(`\n${echecs.length} échec(s)`); process.exit(1); }
console.log('\nVerrou : tout est bon.');
