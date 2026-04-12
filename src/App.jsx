import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Truck, Play, Fuel, Receipt, CheckCircle, FileText, AlertTriangle,
  ArrowLeft, Home as HomeIcon, Settings as SettingsIcon, Trash2, Edit3, X
} from "lucide-react";
import { dataApi } from "./dataApi.js";

// ---------- helpers ----------
const eur = (n) => (Number(n) || 0).toFixed(2) + " €";
const fmtDate = (iso) => new Date(iso).toLocaleDateString("es-ES");

// ---------- estilos compartidos ----------
const S = {
  app: { minHeight: "100vh", background: "#0a0f1c", color: "#e5e7eb", paddingBottom: 110, position: "relative" },
  header: { padding: "18px 16px", borderBottom: "1px solid #1f2937", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, background: "#0a0f1c", zIndex: 10 },
  h1: { fontSize: 22, fontWeight: 700, margin: 0, flex: 1 },
  card: { background: "#111827", border: "1px solid #1f2937", borderRadius: 14, padding: 16, margin: "12px 16px" },
  btn: (bg, h = 64) => ({ width: "100%", padding: 16, fontSize: 15, fontWeight: 700, border: "none", borderRadius: 12, color: "white", background: bg, cursor: "pointer", minHeight: h, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }),
  thumb: { position: "fixed", bottom: 0, left: 0, right: 0, background: "#0a0f1c", borderTop: "1px solid #1f2937", padding: 12, display: "flex", gap: 8, zIndex: 50, paddingBottom: "calc(12px + env(safe-area-inset-bottom))" },
  tabBar: { position: "fixed", bottom: 0, left: 0, right: 0, background: "#0a0f1c", borderTop: "1px solid #1f2937", display: "flex", zIndex: 50, paddingBottom: "env(safe-area-inset-bottom)" },
  tab: (a) => ({ flex: 1, padding: "14px 4px", background: "none", border: "none", color: a ? "#3b82f6" : "#6b7280", fontSize: 11, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", fontWeight: 600 }),
  input: { width: "100%", padding: 14, fontSize: 16, background: "#0f1629", border: "1px solid #1f2937", borderRadius: 10, color: "#e5e7eb", marginBottom: 10 },
  label: { fontSize: 13, color: "#9ca3af", display: "block", marginTop: 8, marginBottom: 4, fontWeight: 600 },
  stat: { display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #1f2937", fontSize: 14 },
};

// ---------- Header ----------
function Header({ title, onBack, action }) {
  return (
    <div style={S.header}>
      {onBack && (
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#e5e7eb", cursor: "pointer", padding: 4 }}>
          <ArrowLeft size={26} />
        </button>
      )}
      <Truck color="#3b82f6" size={28} />
      <h1 style={S.h1}>{title}</h1>
      {action}
    </div>
  );
}

// ---------- Confirm modal ----------
function ConfirmModal({ msg, onYes, onNo }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#111827", borderRadius: 16, padding: 22, maxWidth: 360, width: "100%", border: "1px solid #1f2937" }}>
        <div style={{ fontSize: 16, marginBottom: 18 }}>{msg}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onNo} style={{ ...S.btn("#374151", 52) }}>Cancelar</button>
          <button onClick={onYes} style={{ ...S.btn("#ef4444", 52) }}>Confirmar</button>
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

  // ---- carga inicial ----
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

  // ---- acciones ----
  const startRoute = async (data) => {
    const r = await dataApi.put("routes", {
      ...data,
      precio: Number(data.precio),
      km: Number(data.km),
      peso: Number(data.peso),
      estado: "in_progress",
      inicio: new Date().toISOString(),
    });
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
    await dataApi.put("expenses", {
      routeId: active.id,
      fecha: new Date().toISOString(),
      ...data,
      importe: Number(data.importe),
      litros: data.litros ? Number(data.litros) : null,
      km: data.km ? Number(data.km) : null,
    });
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

    await dataApi.put("invoices", {
      routeId: r.id, numero, fecha, cliente: r.cliente, nif: settings.nif,
      origen: r.origen, destino: r.destino, base, ivaPct, cuota, total,
      hashAnterior: prevHash, hash, estado: "issued", inmutable: true,
    });
    await dataApi.put("ecmrs", {
      routeId: r.id, numeroCmr: `CMR-${numero}`,
      remitente: r.cliente, destinatario: r.destino,
      mercancia: r.mercancia || "Mercancía general",
      peso: r.peso, fecha,
    });
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

  if (!ready) return <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}>Cargando…</div>;

  // ---------- pantallas ----------
  return (
    <div style={S.app}>
      {screen === "home" && <HomeScreen invoices={invoices} routes={routes} consumoMedio={consumoMedio} active={active} onNew={() => setScreen("new")} onContinue={() => setScreen("active")} />}
      {screen === "new" && <RouteForm onCancel={() => setScreen("home")} onSubmit={startRoute} />}
      {screen === "edit" && <RouteForm initial={editingRoute} onCancel={() => { setEditingRoute(null); setScreen("active"); }} onSubmit={updateRoute} editing />}
      {screen === "active" && <ActiveScreen route={active} expenses={expensesOf(active?.id)} totals={totals(active)} margenAlerta={settings.margenAlerta} onBack={() => setScreen("home")} onAddFuel={() => setModal("fuel")} onAddExpense={() => setModal("expense")} onDeliver={deliverRoute} onEditRoute={() => { setEditingRoute(active); setScreen("edit"); }} onDeleteExpense={(id) => setConfirm({ msg: "¿Eliminar este gasto?", onYes: () => removeExpense(id) })} />}
      {screen === "deliver" && <DeliverScreen route={active} totals={totals(active)} settings={settings} onEmit={emitInvoice} />}
      {screen === "invoices" && <InvoicesScreen invoices={invoices} />}
      {screen === "settings" && <SettingsScreen settings={settings} onSave={saveSettings} />}

      {modal && <ExpenseModal kind={modal} onCancel={() => setModal(null)} onSave={addExpense} />}
      {confirm && <ConfirmModal msg={confirm.msg} onYes={confirm.onYes} onNo={() => setConfirm(null)} />}

      {["home", "invoices", "settings"].includes(screen) && (
        <div style={S.tabBar}>
          <button style={S.tab(screen === "home")} onClick={() => setScreen("home")}><HomeIcon size={22} />Inicio</button>
          <button style={S.tab(screen === "invoices")} onClick={() => setScreen("invoices")}><FileText size={22} />Facturas</button>
          <button style={S.tab(screen === "settings")} onClick={() => setScreen("settings")}><SettingsIcon size={22} />Ajustes</button>
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
        <div style={{ fontSize: 13, color: "#9ca3af" }}>Ingresos este mes</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: "#10b981", marginTop: 4 }}>{eur(ingresosMes)}</div>
        <div style={{ ...S.stat, marginTop: 8 }}><span>Facturas emitidas</span><b>{mes.length}</b></div>
        <div style={S.stat}><span>Consumo medio</span><b>{consumoMedio ? `${consumoMedio} L/100km` : "—"}</b></div>
        <div style={{ ...S.stat, borderBottom: "none" }}><span>Rutas activas</span><b>{routes.filter(r => r.estado === "in_progress").length}</b></div>
      </div>

      {active && (
        <div style={{ ...S.card, borderColor: "#3b82f6" }}>
          <div style={{ fontSize: 12, color: "#3b82f6", fontWeight: 700, letterSpacing: 0.5 }}>RUTA EN CURSO</div>
          <div style={{ fontSize: 18, fontWeight: 700, margin: "8px 0" }}>{active.origen} → {active.destino}</div>
          <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 12 }}>{active.cliente} · {eur(active.precio)}</div>
          <button onClick={onContinue} style={S.btn("#3b82f6", 52)}>Continuar ruta</button>
        </div>
      )}

      <div style={S.thumb}>
        <button onClick={onNew} style={S.btn("#10b981")}><Play size={24} />Iniciar nueva ruta</button>
      </div>
    </>
  );
}

// =====================================================================
// FORMULARIO RUTA (alta y edición)
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
        <button onClick={() => valid && onSubmit(f)} disabled={!valid} style={{ ...S.btn(valid ? "#10b981" : "#374151"), opacity: valid ? 1 : 0.6 }}>
          <Play size={24} />{editing ? "Guardar cambios" : "Iniciar ruta"}
        </button>
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
  const color = margen < 20 ? "#ef4444" : margen < 30 ? "#f59e0b" : "#10b981";
  const alerta = margen < margenAlerta;
  const tipoLabel = { fuel: "⛽ Gasoil", toll: "🛣️ Peaje", meal: "🍽️ Dieta", parking: "🅿️ Parking", other: "📌 Otro" };

  return (
    <>
      <Header title="Ruta activa" onBack={onBack} action={
        <button onClick={onEditRoute} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: 4 }}><Edit3 size={20} /></button>
      } />

      <div style={S.card}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{route.origen} → {route.destino}</div>
        <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>{route.cliente} · {route.km} km · {route.peso} t</div>
      </div>

      <div style={{ ...S.card, borderColor: color, borderWidth: 2 }}>
        <div style={S.stat}><span>Precio flete</span><b>{eur(route.precio)}</b></div>
        <div style={S.stat}><span>Gastos acumulados</span><b style={{ color: "#ef4444" }}>-{eur(gastos)}</b></div>
        <div style={S.stat}><span>Beneficio neto</span><b style={{ color }}>{eur(beneficio)}</b></div>
        <div style={{ ...S.stat, borderBottom: "none" }}><span>Margen</span><b style={{ color, fontSize: 22 }}>{margen.toFixed(1)}%</b></div>
        {alerta && (
          <div style={{ background: "#7f1d1d", padding: 12, borderRadius: 8, marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle color="#fca5a5" size={20} />
            <span style={{ color: "#fca5a5", fontSize: 13, fontWeight: 600 }}>Margen por debajo del {margenAlerta}%</span>
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 8, fontWeight: 600 }}>Gastos de la ruta ({expenses.length})</div>
        {expenses.length === 0 && <div style={{ color: "#6b7280", fontSize: 13 }}>Aún no hay gastos</div>}
        {expenses.map(e => (
          <div key={e.id} style={{ ...S.stat, alignItems: "center" }}>
            <span>{tipoLabel[e.tipo] || e.tipo}{e.litros ? ` · ${e.litros} L` : ""}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <b>{eur(e.importe)}</b>
              <button onClick={() => onDeleteExpense(e.id)} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", padding: 4 }}><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>

      <div style={S.thumb}>
        <button onClick={onAddFuel} style={{ ...S.btn("#f59e0b"), fontSize: 12, flexDirection: "column", gap: 2 }}><Fuel size={22} /><span>Repostaje</span></button>
        <button onClick={onAddExpense} style={{ ...S.btn("#6366f1"), fontSize: 12, flexDirection: "column", gap: 2 }}><Receipt size={22} /><span>Gasto</span></button>
        <button onClick={onDeliver} style={{ ...S.btn("#10b981"), fontSize: 12, flexDirection: "column", gap: 2 }}><CheckCircle size={22} /><span>Entregado</span></button>
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: "#111827", width: "100%", borderRadius: "20px 20px 0 0", padding: 20, paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{isFuel ? "⛽ Repostaje" : "🧾 Nuevo gasto"}</h2>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}><X size={24} /></button>
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
        <button onClick={() => f.importe && onSave(f)} style={{ ...S.btn("#10b981", 56), marginTop: 8 }}>Guardar</button>
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
        <div style={{ color: "#10b981", fontSize: 14, fontWeight: 700, letterSpacing: 0.5 }}>✓ RUTA ENTREGADA</div>
        <div style={{ fontSize: 18, fontWeight: 700, margin: "8px 0" }}>{route.origen} → {route.destino}</div>
        <div style={S.stat}><span>Beneficio neto</span><b style={{ color: "#10b981" }}>{eur(beneficio)} ({margen.toFixed(1)}%)</b></div>
      </div>
      <div style={S.card}>
        <div style={{ fontSize: 13, color: "#3b82f6", fontWeight: 700 }}>📄 FACTURA A EMITIR</div>
        <div style={S.stat}><span>Cliente</span><b>{route.cliente}</b></div>
        <div style={S.stat}><span>Base imponible</span><b>{eur(base)}</b></div>
        <div style={S.stat}><span>IVA {settings.iva}%</span><b>{eur(cuota)}</b></div>
        <div style={{ ...S.stat, borderBottom: "none" }}><span>Total</span><b style={{ fontSize: 18 }}>{eur(base + cuota)}</b></div>
      </div>
      <div style={S.card}>
        <div style={{ fontSize: 13, color: "#3b82f6", fontWeight: 700 }}>📋 e-CMR</div>
        <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 6 }}>Documento de control digital generado automáticamente (obligatorio en España desde octubre 2026)</div>
      </div>
      <div style={S.thumb}>
        <button onClick={onEmit} style={S.btn("#10b981")}><FileText size={24} />Emitir factura + e-CMR</button>
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
      {sorted.length === 0 && <div style={{ ...S.card, color: "#6b7280", textAlign: "center" }}>No hay facturas emitidas todavía</div>}
      {sorted.map(i => (
        <div key={i.id} style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <b style={{ fontSize: 16 }}>{i.numero}</b>
            <span style={{ color: "#10b981", fontSize: 18, fontWeight: 700 }}>{eur(i.total)}</span>
          </div>
          <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 4 }}>{i.cliente} · {fmtDate(i.fecha)}</div>
          <div style={{ fontSize: 13, color: "#9ca3af" }}>{i.origen} → {i.destino}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>Base: {eur(i.base)} · IVA {i.ivaPct}%: {eur(i.cuota)}</div>
          <div style={{ fontSize: 10, color: "#4b5563", marginTop: 8, fontFamily: "monospace", wordBreak: "break-all" }}>🔒 {i.hash.slice(0, 32)}…</div>
          <div style={{ fontSize: 11, color: "#10b981", marginTop: 4, fontWeight: 600 }}>✓ Inmutable · Hash encadenado VeriFactu</div>
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
        <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>Datos fiscales</div>
        <label style={S.label}>NIF</label><input style={S.input} value={f.nif} onChange={e => setF({ ...f, nif: e.target.value })} />
        <label style={S.label}>Razón social</label><input style={S.input} value={f.razon} onChange={e => setF({ ...f, razon: e.target.value })} />
        <label style={S.label}>Dirección fiscal</label><input style={S.input} value={f.direccion} onChange={e => setF({ ...f, direccion: e.target.value })} />
        <label style={S.label}>Código postal</label><input style={S.input} value={f.cp} onChange={e => setF({ ...f, cp: e.target.value })} />
        <label style={S.label}>Ciudad</label><input style={S.input} value={f.ciudad} onChange={e => setF({ ...f, ciudad: e.target.value })} />

        <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", marginTop: 16, marginBottom: 4, fontWeight: 700 }}>Facturación</div>
        <label style={S.label}>Serie</label><input style={S.input} value={f.serie} onChange={e => setF({ ...f, serie: e.target.value })} />
        <label style={S.label}>Ejercicio</label><input style={S.input} type="number" value={f.ejercicio} onChange={e => setF({ ...f, ejercicio: Number(e.target.value) })} />
        <label style={S.label}>IVA por defecto (%)</label><input style={S.input} type="number" value={f.iva} onChange={e => setF({ ...f, iva: Number(e.target.value) })} />

        <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", marginTop: 16, marginBottom: 4, fontWeight: 700 }}>Alertas</div>
        <label style={S.label}>Margen mínimo (%)</label><input style={S.input} type="number" value={f.margenAlerta} onChange={e => setF({ ...f, margenAlerta: Number(e.target.value) })} />

        <button onClick={() => onSave(f)} style={{ ...S.btn("#10b981"), marginTop: 20 }}>Guardar ajustes</button>
      </div>
    </>
  );
}
