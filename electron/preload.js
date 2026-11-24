'use strict';
// Pont minimal entre la page et l'app de bureau (fenêtre isolée, sandbox) : la page peut seulement poser une question.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bureau', {
  // prompt() synchrone, comme dans un navigateur : renvoie le texte saisi, ou null si on annule
  promptSync: (message, defaut) => ipcRenderer.sendSync('bureau:prompt', String(message ?? ''), String(defaut ?? '')),
});
