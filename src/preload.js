const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("chessEngine", {
  getBestMove(payload) {
    return ipcRenderer.invoke("engine:get-best-move", payload);
  },
  getStatus() {
    return ipcRenderer.invoke("engine:get-status");
  },
});
