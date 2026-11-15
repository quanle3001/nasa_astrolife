const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("astrotip", {
  ping: () => ipcRenderer.invoke("backend:ping"),
  getConfig: () => ipcRenderer.invoke("backend:config"),
  listPorts: () => ipcRenderer.invoke("backend:ports"),
  connectSensor: (port) => ipcRenderer.invoke("backend:sensor-connect", { port }),
  disconnectSensor: () => ipcRenderer.invoke("backend:sensor-disconnect"),
  simulateSensor: () => ipcRenderer.invoke("backend:sensor-simulate"),
  assess: (checkin) => ipcRenderer.invoke("backend:assess", checkin),
  saveAssessment: (assessmentId) => ipcRenderer.invoke("backend:save", { assessment_id: assessmentId }),
  listHistory: () => ipcRenderer.invoke("backend:history"),
  openNasaSource: (url) => ipcRenderer.invoke("external:nasa", url),
  onPpgBatch: (callback) => {
    const listener = (_event, batch) => callback(batch);
    ipcRenderer.on("backend:ppg", listener);
    return () => ipcRenderer.removeListener("backend:ppg", listener);
  },
  onBackendEvent: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("backend:event", listener);
    return () => ipcRenderer.removeListener("backend:event", listener);
  },
});
