const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const { UcciEngine } = require("./ucci-engine");

let mainWindow;
let engine;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1260,
    minHeight: 780,
    resizable: true,
    backgroundColor: "#17201d",
    title: "中国象棋",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "index.html"));
}

app.whenReady().then(() => {
  engine = new UcciEngine({
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
  });

  ipcMain.handle("engine:get-best-move", async (_event, payload) => engine.getBestMove(payload));
  ipcMain.handle("engine:get-status", async () => engine.getStatus());

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (engine) engine.dispose();
});
