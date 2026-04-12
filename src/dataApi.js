// dataApi.js - Capa de datos offline-first sobre IndexedDB.
// Preparada para sustituir por Supabase manteniendo la misma API pública.
//
// API pública:
//   await dataApi.init()
//   await dataApi.getAll(table)            -> array
//   await dataApi.get(table, id)           -> objeto | undefined
//   await dataApi.put(table, obj)          -> obj guardado (con id)
//   await dataApi.remove(table, id)        -> void
//   await dataApi.getSettings()            -> settings
//   await dataApi.saveSettings(s)          -> settings
//   dataApi.uid()                          -> string id único
//   await dataApi.sha256(string)           -> hex string (para VeriFactu)

const DB_NAME = "truckerpro";
const DB_VERSION = 1;
const TABLES = ["routes", "expenses", "invoices", "ecmrs", "clients", "vehicles"];

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
  nif: "",
  razon: "",
  direccion: "",
  cp: "",
  ciudad: "",
  iva: 21,
  margenAlerta: 20,
  serie: "A",
  ejercicio: new Date().getFullYear(),
};

export const dataApi = {
  async init() {
    if (!_db) _db = await openDB();
    return _db;
  },

  async getAll(table) {
    const store = await tx(table);
    return wrap(store.getAll());
  },

  async get(table, id) {
    const store = await tx(table);
    return wrap(store.get(id));
  },

  async put(table, obj) {
    if (!obj.id) obj.id = this.uid();
    if (!obj.createdAt) obj.createdAt = new Date().toISOString();
    obj.updatedAt = new Date().toISOString();
    const store = await tx(table, "readwrite");
    await wrap(store.put(obj));
    return obj;
  },

  async remove(table, id) {
    const store = await tx(table, "readwrite");
    await wrap(store.delete(id));
  },

  async getSettings() {
    const store = await tx("kv");
    const row = await wrap(store.get("settings"));
    return { ...DEFAULT_SETTINGS, ...(row?.v || {}) };
  },

  async saveSettings(s) {
    const store = await tx("kv", "readwrite");
    await wrap(store.put({ k: "settings", v: s }));
    return s;
  },

  uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  async sha256(msg) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  },
};
