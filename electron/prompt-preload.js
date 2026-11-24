'use strict';
// La fenêtre de saisie ne peut que renvoyer sa réponse.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('invite', {
  repondre: valeur => ipcRenderer.send('bureau:prompt-reponse', valeur === null ? null : String(valeur)),
});
