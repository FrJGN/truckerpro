import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Truck, Play, Fuel, Receipt, CheckCircle, FileText, AlertTriangle,
  ArrowLeft, Home as HomeIcon, Settings as SettingsIcon, Trash2, Edit3, X
} from "lucide-react";
import { dataApi } from "./dataApi.js";

// ---------- helpers ----------
const eur = (n) => (Number(n) || 0).toFixed(2) + " €";
const fmtDate = (iso) => new Date(iso).toLocaleDateString("es-ES");

// ---------- paleta ----------
const C = {
  bg: "#f1f5f9",          // fondo gris azulado iOS
  surface: "#ffffff",     // tarjetas
  surfaceAlt: "#f8fafc",  // inputs
  border: "#e2e8f0",      // bordes suaves
  text: "#0f172a",        // texto principal
  textMuted: "#64748b",   // texto secundario
  textLight: "#94a3b8",   // texto terciario
  primary: "#2563eb",     // azul vivo (botones, acentos)
  primaryDark: "#1d4ed8",
  success: "#16a34a",
  warning: "#f59e0b",
  danger: "#dc2626",
  shadow: "0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)",
  shadowLg: "0 -4px 16px rgba(15,23,42,0.08)",
};

// ---------- estilos compartidos ----------
const S = {
  app: { minHeight: "100vh", background: C.bg, color: C.text, paddingBottom: 180 },
  container: { maxWidth: 480, margin: "0 auto", position: "relative" },
  header: { padding: "18px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, background: C.bg, zIndex: 10 },
  h1: { fontSize: 22, fontWeight: 700, margin: 0, flex: 1, color: C.text },
  card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, margin: "12px 16px", boxShadow: C.shadow },
  btn: (bg, h = 64) => ({ width: "100%", padding: 16, fontSize: 15, fontWeight: 700, border: "none", borderRadius: 12, color: "white", background: bg, cursor: "pointer", minHeight: h, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 2px 6px rgba(37,99,235,0.25)" }),
  thumb: { position: "fixed", bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, padding: 12, display: "flex", gap: 8, zIndex: 50, paddingBottom: "calc(12px + env(safe-area-inset-bottom))", boxShadow: C.shadowLg },
  thumbAboveTabs: { position: "fixed", bottom: "calc(64px + env(safe-area-inset-bottom))", left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, padding: 12, display: "flex", gap: 8, zIndex: 49, boxShadow: C.shadowLg },
  thumbInner: { maxWidth: 480, margin: "0 auto", display: "flex", gap: 8, width: "100%" },
  tabBar: { position: "fixed", bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 50, paddingBottom: "env(safe-area-inset-bottom)", boxShadow: C.shadowLg },
  tabInner: { maxWidth: 480, margin: "0 auto", display: "flex", width: "100%" },
  tab: (a) => ({ flex: 1, padding: "14px 4px", background: "none", border: "none", color: a ? C.primary : C.textMuted, fontSize: 11, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", fontWeight: 600 }),
  input: { width: "100%", padding: 14, fontSize: 16, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, marginBottom: 10, outline: "none" },
  label: { fontSize: 13, color: C.textMuted, display: "block", marginTop: 8, marginBottom: 4, fontWeight: 600 },
  stat: { display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}`, fontSize: 14, color: C.text },
};

// ---------- Header ----------
function Header({ title, onBack, action }) {
  return (
    <div style={S.header}>
      {onBack && (
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.text, cursor: "pointer", padding: 4 }}>
          <ArrowLeft size={26} />
        </button>
      )}
      <Truck color={C.primary} size={28} />
      <h1 style={S.h1}>{title}</h1>
      {action}
    </div>
  );
}

// ---------- Confirm modal ----------
function ConfirmModal({ msg, onYes, onNo }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: C.surface, borderRadius: 16, padding: 22, maxWidth: 360, width: "100%", border: `1px solid ${C.border}`, boxShadow: "0 20px 50px rgba(15,23,42,0.25)" }}>
        <div style={{ fontSize: 16, marginBottom: 18, color: C.text }}>{msg}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onNo} style={{ ...S.btn("#94a3b8", 52) }}>Cancelar</button>
          <button onClick={onYes} style={{ ...S.btn(C.danger, 52) }}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// APP
// =====================================================================
export default function App() {
  const [ready, setReady] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [settings, setSettings] = useState(null);

  const [screen, setScreen] = useState("home");
  const [activeId, setActiveId] = useState(null);
  const [editingRoute, setEditingRoute] = useState(null);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    (async () => {
      await dataApi.init();
      setRoutes(await dataApi.getAll("routes"));
      setExpenses(await dataApi.getAll("expenses"));
      setInvoices(await dataApi.getAll("invoices"));
      setSettings(await dataApi.getSettings());
      setReady(true);
    })();
  }, []);

  const reload = useCallback(async () => {
    setRoutes(await dataApi.getAll("routes"));
    setExpenses(await dataApi.getAll("expenses"));
    setInvoices(await dataApi.getAll("invoices"));
  }, []);

  const active = routes.find(r => r.id === activeId) || routes.find(r => r.estado === "in_progress");

  const expensesOf = (rid) => expenses.filter(e => e.routeId === rid);
  const totals = (r) => {
    if (!r) return { gastos: 0, beneficio: 0, margen: 0 };
    const gastos = expensesOf(r.id).reduce((s, e) => s + Number(e.importe), 0);
    const beneficio = Number(r.precio) - gastos;
    const margen = r.precio > 0 ? (beneficio / r.precio) * 100 : 0;
    return { gastos, beneficio, margen };
  };

  const consumoMedio = useMemo(() => {
    const refuels = expenses.filter(e => e.tipo === "fuel" && e.litros && e.km).sort((a, b) => a.km - b.km);
    if (refuels.length < 2) return null;
    const litros = refuels.slice(1).reduce((s, r) => s + Number(r.litros), 0);
    const km = refuels[refuels.length - 1].km - refuels[0].km;
    return km > 0 ? (litros * 100 / km).toFixed(2) : null;
  }, [expenses]);

  const startRoute = async (data) => {
    const r = await dataApi.put("routes", { ...data, precio: Number(data.precio), km: Number(data.km), peso: Number(data.peso), estado: "in_progress", inicio: new Date().toISOString() });
    await reload();
    setActiveId(r.id);
    setScreen("active");
  };

  const updateRoute = async (data) => {
    await dataApi.put("routes", { ...editingRoute, ...data, precio: Number(data.precio), km: Number(data.km), peso: Number(data.peso) });
    setEditingRoute(null);
    await reload();
    setScreen("active");
  };

  const addExpense = async (data) => {
    await dataApi.put("expenses", { routeId: active.id, fecha: new Date().toISOString(), ...data, importe: Number(data.importe), litros: data.litros ? Number(data.litros) : null, km: data.km ? Number(data.km) : null });
    await reload();
    setModal(null);
  };

  const removeExpense = async (id) => {
    await dataApi.remove("expenses", id);
    await reload();
    setConfirm(null);
  };

  const deliverRoute = async () => {
    await dataApi.put("routes", { ...active, estado: "delivered", fin: new Date().toISOString() });
    await reload();
    setScreen("deliver");
  };

  const emitInvoice = async () => {
    const r = active;
    const base = Number(r.precio);
    const ivaPct = settings.iva;
    const cuota = +(base * ivaPct / 100).toFixed(2);
    const total = +(base + cuota).toFixed(2);
    const numero = `${settings.serie}-${settings.ejercicio}-${String(invoices.length + 1).padStart(4, "0")}`;
    const fecha = new Date().toISOString();
    const sorted = [...invoices].sort((a, b) => a.numero.localeCompare(b.numero));
    const prevHash = sorted.length ? sorted[sorted.length - 1].hash : "0".repeat(64);
    const payload = `${numero}|${fecha.slice(0, 10)}|${settings.nif}|${r.cliente}|${base}|${cuota}|${total}|${prevHash}`;
    const hash = await dataApi.sha256(payload);

    await dataApi.put("invoices", { routeId: r.id, numero, fecha, cliente: r.cliente, nif: settings.nif, origen: r.origen, destino: r.destino, base, ivaPct, cuota, total, hashAnterior: prevHash, hash, estado: "issued", inmutable: true });
    await dataApi.put("ecmrs", { routeId: r.id, numeroCmr: `CMR-${numero}`, remitente: r.cliente, destinatario: r.destino, mercancia: r.mercancia || "Mercancía general", peso: r.peso, fecha });
    await dataApi.put("routes", { ...r, estado: "invoiced" });
    await reload();
    setActiveId(null);
    setScreen("invoices");
  };

  const saveSettings = async (s) => {
    const saved = await dataApi.saveSettings(s);
    setSettings(saved);
    setScreen("home");
  };

  if (!ready) return <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted }}>Cargando…</div>;

  return (
    <div style={S.app}>
      <div style={S.container}>
        {screen === "home" && <HomeScreen invoices={invoices} routes={routes} consumoMedio={consumoMedio} active={active} onNew={() => setScreen("new")} onContinue={() => setScreen("active")} />}
        {screen === "new" && <RouteForm onCancel={() => setScreen("home")} onSubmit={startRoute} />}
        {screen === "edit" && <RouteForm initial={editingRoute} onCancel={() => { setEditingRoute(null); setScreen("active"); }} onSubmit={updateRoute} editing />}
        {screen === "active" && <ActiveScreen route={active} expenses={expensesOf(active?.id)} totals={totals(active)} margenAlerta={settings.margenAlerta} onBack={() => setScreen("home")} onAddFuel={() => setModal("fuel")} onAddExpense={() => setModal("expense")} onDeliver={deliverRoute} onEditRoute={() => { setEditingRoute(active); setScreen("edit"); }} onDeleteExpense={(id) => setConfirm({ msg: "¿Eliminar este gasto?", onYes: () => removeExpense(id) })} />}
        {screen === "deliver" && <DeliverScreen route={active} totals={totals(active)} settings={settings} onEmit={emitInvoice} />}
        {screen === "invoices" && <InvoicesScreen invoices={invoices} />}
        {screen === "settings" && <SettingsScreen settings={settings} onSave={saveSettings} />}
      </div>

      {modal && <ExpenseModal kind={modal} onCancel={() => setModal(null)} onSave={addExpense} />}
      {confirm && <ConfirmModal msg={confirm.msg} onYes={confirm.onYes} onNo={() => setConfirm(null)} />}

      {["home", "invoices", "settings"].includes(screen) && (
        <div style={S.tabBar}>
          <div style={S.tabInner}>
            <button style={S.tab(screen === "home")} onClick={() => setScreen("home")}><HomeIcon size={22} />Inicio</button>
            <button style={S.tab(screen === "invoices")} onClick={() => setScreen("invoices")}><FileText size={22} />Facturas</button>
            <button style={S.tab(screen === "settings")} onClick={() => setScreen("settings")}><SettingsIcon size={22} />Ajustes</button>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// HOME
// =====================================================================
function HomeScreen({ invoices, routes, consumoMedio, active, onNew, onContinue }) {
  const now = new Date();
  const mes = invoices.filter(i => {
    const d = new Date(i.fecha);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const ingresosMes = mes.reduce((s, i) => s + i.base, 0);

  return (
    <>
      <Header title="TruckerPro" />
      <div style={S.card}>
        <div style={{ fontSize: 13, color: C.textMuted }}>Ingresos este mes</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: C.success, marginTop: 4 }}>{eur(ingresosMes)}</div>
        <div style={{ ...S.stat, marginTop: 8 }}><span>Facturas emitidas</span><b>{mes.length}</b></div>
        <div style={S.stat}><span>Consumo medio</span><b>{consumoMedio ? `${consumoMedio} L/100km` : "—"}</b></div>
        <div style={{ ...S.stat, borderBottom: "none" }}><span>Rutas activas</span><b>{routes.filter(r => r.estado === "in_progress").length}</b></div>
      </div>

      {active && (
        <div style={{ ...S.card, borderColor: C.primary, borderWidth: 2 }}>
          <div style={{ fontSize: 12, color: C.primary, fontWeight: 700, letterSpacing: 0.5 }}>RUTA EN CURSO</div>
          <div style={{ fontSize: 18, fontWeight: 700, margin: "8px 0", color: C.text }}>{active.origen} → {active.destino}</div>
          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12 }}>{active.cliente} · {eur(active.precio)}</div>
          <button onClick={onContinue} style={S.btn(C.primary, 52)}>Continuar ruta</button>
        </div>
      )}

      <div style={S.thumbAboveTabs}>
        <div style={S.thumbInner}>
          <button onClick={onNew} style={S.btn(C.success)}><Play size={24} />Iniciar nueva ruta</button>
        </div>
      </div>
    </>
  );
}

// =====================================================================
// FORMULARIO RUTA
// =====================================================================
function RouteForm({ initial, onCancel, onSubmit, editing }) {
  const [f, setF] = useState(initial || { cliente: "", origen: "", destino: "", km: "", peso: "", precio: "", mercancia: "" });
  const fields = [
    ["cliente", "Cliente", "text"],
    ["origen", "Origen", "text"],
    ["destino", "Destino", "text"],
    ["km", "Kilómetros", "number"],
    ["peso", "Peso (toneladas)", "number"],
    ["precio", "Precio acordado (€)", "number"],
    ["mercancia", "Mercancía", "text"],
  ];
  const valid = f.cliente && f.origen && f.destino && f.precio;

  return (
    <>
      <Header title={editing ? "Editar ruta" : "Nueva ruta"} onBack={onCancel} />
      <div style={{ padding: 16 }}>
        {fields.map(([k, l, t]) => (
          <div key={k}>
            <label style={S.label}>{l}</label>
            <input style={S.input} type={t} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} inputMode={t === "number" ? "decimal" : undefined} />
          </div>
        ))}
      </div>
      <div style={S.thumb}>
        <div style={S.thumbInner}>
          <button onClick={() => valid && onSubmit(f)} disabled={!valid} style={{ ...S.btn(valid ? C.success : "#cbd5e1"), opacity: valid ? 1 : 0.7 }}>
            <Play size={24} />{editing ? "Guardar cambios" : "Iniciar ruta"}
          </button>
        </div>
      </div>
    </>
  );
}

// =====================================================================
// RUTA ACTIVA
// =====================================================================
function ActiveScreen({ route, expenses, totals, margenAlerta, onBack, onAddFuel, onAddExpense, onDeliver, onEditRoute, onDeleteExpense }) {
  if (!route) return null;
  const { gastos, beneficio, margen } = totals;
  const color = margen < 20 ? C.danger : margen < 30 ? C.warning : C.success;
  const alerta = margen < margenAlerta;
  const tipoLabel = { fuel: "⛽ Gasoil", toll: "🛣️ Peaje", meal: "🍽️ Dieta", parking: "🅿️ Parking", other: "📌 Otro" };

  return (
    <>
      <Header title="Ruta activa" onBack={onBack} action={
        <button onClick={onEditRoute} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", padding: 4 }}><Edit3 size={20} /></button>
      } />

      <div style={S.card}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{route.origen} → {route.destino}</div>
        <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>{route.cliente} · {route.km} km · {route.peso} t</div>
      </div>

      <div style={{ ...S.card, borderColor: color, borderWidth: 2 }}>
        <div style={S.stat}><span>Precio flete</span><b>{eur(route.precio)}</b></div>
        <div style={S.stat}><span>Gastos acumulados</span><b style={{ color: C.danger }}>-{eur(gastos)}</b></div>
        <div style={S.stat}><span>Beneficio neto</span><b style={{ color }}>{eur(beneficio)}</b></div>
        <div style={{ ...S.stat, borderBottom: "none" }}><span>Margen</span><b style={{ color, fontSize: 22 }}>{margen.toFixed(1)}%</b></div>
        {alerta && (
          <div style={{ background: "#fef2f2", border: `1px solid ${C.danger}`, padding: 12, borderRadius: 8, marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle color={C.danger} size={20} />
            <span style={{ color: C.danger, fontSize: 13, fontWeight: 600 }}>Margen por debajo del {margenAlerta}%</span>
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 8, fontWeight: 600 }}>Gastos de la ruta ({expenses.length})</div>
        {expenses.length === 0 && <div style={{ color: C.textLight, fontSize: 13 }}>Aún no hay gastos</div>}
        {expenses.map(e => (
          <div key={e.id} style={{ ...S.stat, alignItems: "center" }}>
            <span>{tipoLabel[e.tipo] || e.tipo}{e.litros ? ` · ${e.litros} L` : ""}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <b>{eur(e.importe)}</b>
              <button onClick={() => onDeleteExpense(e.id)} style={{ background: "none", border: "none", color: C.textLight, cursor: "pointer", padding: 4 }}><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>

      <div style={S.thumb}>
        <div style={S.thumbInner}>
          <button onClick={onAddFuel} style={{ ...S.btn(C.warning), fontSize: 12, flexDirection: "column", gap: 2 }}><Fuel size={22} /><span>Repostaje</span></button>
          <button onClick={onAddExpense} style={{ ...S.btn(C.primary), fontSize: 12, flexDirection: "column", gap: 2 }}><Receipt size={22} /><span>Gasto</span></button>
          <button onClick={onDeliver} style={{ ...S.btn(C.success), fontSize: 12, flexDirection: "column", gap: 2 }}><CheckCircle size={22} /><span>Entregado</span></button>
        </div>
      </div>
    </>
  );
}

// =====================================================================
// MODAL GASTO
// =====================================================================
function ExpenseModal({ kind, onCancel, onSave }) {
  const isFuel = kind === "fuel";
  const [f, setF] = useState({ tipo: isFuel ? "fuel" : "toll", importe: "", litros: "", km: "" });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: C.surface, width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0", padding: 20, paddingBottom: "calc(20px + env(safe-area-inset-bottom))", boxShadow: "0 -10px 40px rgba(15,23,42,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: C.text }}>{isFuel ? "⛽ Repostaje" : "🧾 Nuevo gasto"}</h2>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer" }}><X size={24} /></button>
        </div>
        {!isFuel && (
          <>
            <label style={S.label}>Tipo</label>
            <select style={S.input} value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>
              <option value="toll">Peaje</option>
              <option value="meal">Dieta</option>
              <option value="parking">Parking</option>
              <option value="other">Otro</option>
            </select>
          </>
        )}
        <label style={S.label}>Importe (€)</label>
        <input style={S.input} type="number" inputMode="decimal" value={f.importe} onChange={e => setF({ ...f, importe: e.target.value })} autoFocus />
        {isFuel && (
          <>
            <label style={S.label}>Litros</label>
            <input style={S.input} type="number" inputMode="decimal" value={f.litros} onChange={e => setF({ ...f, litros: e.target.value })} />
            <label style={S.label}>Km del odómetro</label>
            <input style={S.input} type="number" inputMode="numeric" value={f.km} onChange={e => setF({ ...f, km: e.target.value })} />
          </>
        )}
        <button onClick={() => f.importe && onSave(f)} style={{ ...S.btn(C.success, 56), marginTop: 8 }}>Guardar</button>
      </div>
    </div>
  );
}

// =====================================================================
// ENTREGA
// =====================================================================
function DeliverScreen({ route, totals, settings, onEmit }) {
  if (!route) return null;
  const { beneficio, margen } = totals;
  const base = Number(route.precio);
  const cuota = +(base * settings.iva / 100).toFixed(2);

  return (
    <>
      <Header title="Entrega completada" />
      <div style={S.card}>
        <div style={{ color: C.success, fontSize: 14, fontWeight: 700, letterSpacing: 0.5 }}>✓ RUTA ENTREGADA</div>
        <div style={{ fontSize: 18, fontWeight: 700, margin: "8px 0", color: C.text }}>{route.origen} → {route.destino}</div>
        <div style={S.stat}><span>Beneficio neto</span><b style={{ color: C.success }}>{eur(beneficio)} ({margen.toFixed(1)}%)</b></div>
      </div>
      <div style={S.card}>
        <div style={{ fontSize: 13, color: C.primary, fontWeight: 700 }}>📄 FACTURA A EMITIR</div>
        <div style={S.stat}><span>Cliente</span><b>{route.cliente}</b></div>
        <div style={S.stat}><span>Base imponible</span><b>{eur(base)}</b></div>
        <div style={S.stat}><span>IVA {settings.iva}%</span><b>{eur(cuota)}</b></div>
        <div style={{ ...S.stat, borderBottom: "none" }}><span>Total</span><b style={{ fontSize: 18 }}>{eur(base + cuota)}</b></div>
      </div>
      <div style={S.card}>
        <div style={{ fontSize: 13, color: C.primary, fontWeight: 700 }}>📋 e-CMR</div>
        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>Documento de control digital generado automáticamente (obligatorio en España desde octubre 2026)</div>
      </div>
      <div style={S.thumb}>
        <div style={S.thumbInner}>
          <button onClick={onEmit} style={S.btn(C.success)}><FileText size={24} />Emitir factura + e-CMR</button>
        </div>
      </div>
    </>
  );
}

// =====================================================================
// FACTURAS
// =====================================================================
function InvoicesScreen({ invoices }) {
  const sorted = [...invoices].sort((a, b) => b.numero.localeCompare(a.numero));
  return (
    <>
      <Header title="Facturas" />
      {sorted.length === 0 && <div style={{ ...S.card, color: C.textLight, textAlign: "center" }}>No hay facturas emitidas todavía</div>}
      {sorted.map(i => (
        <div key={i.id} style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <b style={{ fontSize: 16, color: C.text }}>{i.numero}</b>
            <span style={{ color: C.success, fontSize: 18, fontWeight: 700 }}>{eur(i.total)}</span>
          </div>
          <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>{i.cliente} · {fmtDate(i.fecha)}</div>
          <div style={{ fontSize: 13, color: C.textMuted }}>{i.origen} → {i.destino}</div>
          <div style={{ fontSize: 12, color: C.textLight, marginTop: 6 }}>Base: {eur(i.base)} · IVA {i.ivaPct}%: {eur(i.cuota)}</div>
          <div style={{ fontSize: 10, color: C.textLight, marginTop: 8, fontFamily: "monospace", wordBreak: "break-all" }}>🔒 {i.hash.slice(0, 32)}…</div>
          <div style={{ fontSize: 11, color: C.success, marginTop: 4, fontWeight: 600 }}>✓ Inmutable · Hash encadenado VeriFactu</div>
        </div>
      ))}
    </>
  );
}

// =====================================================================
// AJUSTES
// =====================================================================
function SettingsScreen({ settings, onSave }) {
  const [f, setF] = useState(settings);
  return (
    <>
      <Header title="Ajustes" />
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: C.textLight, textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>Datos fiscales</div>
        <label style={S.label}>NIF</label><input style={S.input} value={f.nif} onChange={e => setF({ ...f, nif: e.target.value })} />
        <label style={S.label}>Razón social</label><input style={S.input} value={f.razon} onChange={e => setF({ ...f, razon: e.target.value })} />
        <label style={S.label}>Dirección fiscal</label><input style={S.input} value={f.direccion} onChange={e => setF({ ...f, direccion: e.target.value })} />
        <label style={S.label}>Código postal</label><input style={S.input} value={f.cp} onChange={e => setF({ ...f, cp: e.target.value })} />
        <label style={S.label}>Ciudad</label><input style={S.input} value={f.ciudad} onChange={e => setF({ ...f, ciudad: e.target.value })} />

        <div style={{ fontSize: 12, color: C.textLight, textTransform: "uppercase", marginTop: 16, marginBottom: 4, fontWeight: 700 }}>Facturación</div>
        <label style={S.label}>Serie</label><input style={S.input} value={f.serie} onChange={e => setF({ ...f, serie: e.target.value })} />
        <label style={S.label}>Ejercicio</label><input style={S.input} type="number" value={f.ejercicio} onChange={e => setF({ ...f, ejercicio: Number(e.target.value) })} />
        <label style={S.label}>IVA por defecto (%)</label><input style={S.input} type="number" value={f.iva} onChange={e => setF({ ...f, iva: Number(e.target.value) })} />

        <div style={{ fontSize: 12, color: C.textLight, textTransform: "uppercase", marginTop: 16, marginBottom: 4, fontWeight: 700 }}>Alertas</div>
        <label style={S.label}>Margen mínimo (%)</label><input style={S.input} type="number" value={f.margenAlerta} onChange={e => setF({ ...f, margenAlerta: Number(e.target.value) })} />

        <button onClick={() => onSave(f)} style={{ ...S.btn(C.success), marginTop: 20 }}>Guardar ajustes</button>
      </div>
    </>
  );
}
