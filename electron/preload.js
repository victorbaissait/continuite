'use strict';
// Pont minimal entre la page et l'app de bureau (fenêtre isolée, sandbox). La page ne voit jamais de chemin de fichier :
// elle peut poser une question, recevoir les commandes des menus, demander un PDF, régler la sauvegarde et les mises à jour.
const { contextBridge, ipcRenderer } = require('electron');

const texte = (v, max) => String(v ?? '').slice(0, max);

contextBridge.exposeInMainWorld('bureau', {
  // prompt() synchrone, comme dans un navigateur : renvoie le texte saisi, ou null si on annule
  promptSync: (message, defaut) => ipcRenderer.sendSync('bureau:prompt', texte(message, 500), texte(defaut, 2000)),
  // Commandes des menus et des raccourcis (onglet, recherche, nouvel épisode, fichier de projet ouvert…)
  onCommande: rappel => ipcRenderer.on('bureau:commande', (_e, nom, valeur) => rappel(String(nom), valeur)),
  // Un document HTML (ou la page actuelle si html est null) enregistré en PDF ; la fenêtre système demande où
  pdf: (html, nom) => ipcRenderer.invoke('bureau:pdf', html === null ? null : texte(html, 50 * 1024 * 1024), texte(nom, 120)),
  infos: () => ipcRenderer.invoke('bureau:infos'),
  // Le verrou : l'écran du verrou envoie le mot de passe ; la page règle le mot de passe et peut verrouiller
  deverrouiller: mdp => ipcRenderer.invoke('bureau:deverrouiller', texte(mdp, 200)),
  verrou: (action, valeur) => ipcRenderer.invoke('bureau:verrou', texte(action, 20), valeur && typeof valeur === 'object' ? {
    ancien: valeur.ancien === undefined ? undefined : texte(valeur.ancien, 200), nouveau: valeur.nouveau === undefined ? undefined : texte(valeur.nouveau, 200),
    retirer: valeur.retirer === true, minutes: valeur.minutes === undefined ? undefined : Number(valeur.minutes), veille: valeur.veille === undefined ? undefined : valeur.veille === true,
  } : null),
  // Une fenêtre en plus ; avec un épisode, elle s'ouvre sur son brouillon
  fenetre: options => ipcRenderer.invoke('bureau:fenetre', { episode: Number(options && options.episode) || 0 }),
  // Les noms de la série (personnages, lieux) ajoutés au dictionnaire du correcteur
  dictionnaire: mots => ipcRenderer.invoke('bureau:dictionnaire', Array.isArray(mots) ? mots.slice(0, 5000).map(m => texte(m, 60)) : []),
  // Le dossier surveillé du projet ouvert (le chemin choisi s'affiche, mais la page ne peut pas en donner un)
  surveillance: (action, projet) => ipcRenderer.invoke('bureau:surveillance', texte(action, 20), texte(projet, 80)),
  // Les raccourcis clavier des menus
  raccourcis: (action, valeur) => ipcRenderer.invoke('bureau:raccourcis', texte(action, 20),
    valeur && typeof valeur === 'object' ? { id: texte(valeur.id, 60), touches: valeur.touches === undefined ? undefined : texte(valeur.touches, 60) } : null),
  // La lecture à la table en réseau (Wi-Fi) : démarrer avec un épisode, suivre la ligne lue, arrêter
  reseau: (action, valeur) => ipcRenderer.invoke('bureau:reseau', texte(action, 20), action === 'demarrer' && valeur && typeof valeur === 'object'
    ? { titre: texte(valeur.titre, 200), lignes: Array.isArray(valeur.lignes) ? valeur.lignes.slice(0, 6000).map(l => ({ qui: texte(l && l.qui, 80), texte: texte(l && l.texte, 2000) })) : [] }
    : { i: Number(valeur && valeur.i) || 0 }),
  maj: (action, valeur) => ipcRenderer.invoke('bureau:maj', texte(action, 20), valeur === true),
  sauvegarde: (action, valeur) => ipcRenderer.invoke('bureau:sauvegarde', texte(action, 20),
    valeur && typeof valeur === 'object' ? { frequence: texte(valeur.frequence, 20), garder: Number(valeur.garder) || undefined, fichier: texte(valeur.fichier, 500) } : null),
});
