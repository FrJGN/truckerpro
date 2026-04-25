// dataApi.js - Capa offline-first sobre IndexedDB.
// API: init / getAll / get / put / remove / getSettings / saveSettings / uid / sha256 / exportAll / importAll

const DB_NAME = "truckerpro";
const DB_VERSION = 3;
const TABLES = ["routes", "expenses", "invoices", "ecmrs", "clients", "vehicles", "payments"];

let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      TABLES.forEach((t) => {
        if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: "id" });
      });
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv", { keyPath: "k" });
    };
  });
}

async function tx(table, mode = "readonly") {
  if (!_db) _db = await openDB();
  return _db.transaction(table, mode).objectStore(table);
}

const wrap = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const DEFAULT_SETTINGS = {
  // Datos del emisor
  nombre: "",
  nif: "",
  direccion: "",
  cp: "",
  ciudad: "",
  telefono: "",
  // Vehículos fijos
  tractora: "",
  remolque: "",
  // Facturación
  serie: "F",
  ejercicio: new Date().getFullYear(),
  iva: 21,
  irpf: 1,
  iban: "",
  formaPago: "Transferencia",
  observaciones: "Se adjuntan albaranes sellados.",
  registro: "",
  // Cobros
  diasVencimiento: 60,        // días estándar para vencimiento de factura
  avisoVencimiento: 7,        // avisa cuando faltan X días para vencer
  // Combustible (estimación de coste por ruta)
  precioGasoil: 1.45,         // €/L por defecto si no hay histórico
  consumoEstimado: 30,        // L/100km por defecto si no hay histórico
  // Alertas
  margenAlerta: 20,
  // UI
  tema: "light",              // "light" | "dark"
};

export const dataApi = {
  async init() { if (!_db) _db = await openDB(); return _db; },
  async getAll(table) { const s = await tx(table); return wrap(s.getAll()); },
  async get(table, id) { const s = await tx(table); return wrap(s.get(id)); },
  async put(table, obj) {
    if (!obj.id) obj.id = this.uid();
    if (!obj.createdAt) obj.createdAt = new Date().toISOString();
    obj.updatedAt = new Date().toISOString();
    const s = await tx(table, "readwrite");
    await wrap(s.put(obj));
    return obj;
  },
  async remove(table, id) { const s = await tx(table, "readwrite"); await wrap(s.delete(id)); },
  async getSettings() { const s = await tx("kv"); const r = await wrap(s.get("settings")); return { ...DEFAULT_SETTINGS, ...(r?.v || {}) }; },
  async saveSettings(s) { const st = await tx("kv", "readwrite"); await wrap(st.put({ k: "settings", v: s })); return s; },
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
  async sha256(msg) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  },

  async exportAll() {
    const data = { _app: "TruckerPro", _version: DB_VERSION, _exportedAt: new Date().toISOString() };
    for (const t of TABLES) data[t] = await this.getAll(t);
    data.settings = await this.getSettings();
    return data;
  },

  async importAll(data) {
    if (!data || data._app !== "TruckerPro") throw new Error("Archivo no válido");
    for (const t of TABLES) {
      const store = await tx(t, "readwrite");
      await wrap(store.clear());
      if (Array.isArray(data[t])) {
        for (const row of data[t]) await wrap(store.put(row));
      }
    }
    if (data.settings) await this.saveSettings(data.settings);
    return true;
  },
};
