import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Truck, Play, Fuel, Receipt, CheckCircle, FileText, AlertTriangle, ArrowLeft, Home as HomeIcon, Settings as SettingsIcon, Trash2, Edit3, X, Users, Plus, Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { dataApi } from "./dataApi.js";

const eur = (n) => (Number(n) || 0).toFixed(2) + " €";
const fmtDate = (iso) => new Date(iso).toLocaleDateString("es-ES");
const fmtShort = (iso) => { const d = new Date(iso); return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`; };

const C = { bg: "#f1f5f9", surface: "#ffffff", surfaceAlt: "#f8fafc", border: "#e2e8f0", text: "#0f172a", textMuted: "#64748b", textLight: "#94a3b8", primary: "#2563eb", success: "#16a34a", warning: "#f59e0b", danger: "#dc2626", shadow: "0 1px 3px rgba(15,23,42,0.08)", shadowLg: "0 -4px 16px rgba(15,23,42,0.08)" };

const S = {
  app: { minHeight: "100vh", background: C.bg, color: C.text, paddingBottom: 180 },
  container: { maxWidth: 480, margin: "0 auto" },
  header: { padding: "18px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, background: C.bg, zIndex: 10 },
  h1: { fontSize: 22, fontWeight: 700, margin: 0, flex: 1, color: C.text },
  card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, margin: "12px 16px", boxShadow: C.shadow },
  btn: (bg, h = 64) => ({ width: "100%", padding: 16, fontSize: 15, fontWeight: 700, border: "none", borderRadius: 12, color: "white", background: bg, cursor: "pointer", minHeight: h, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 2px 6px rgba(37,99,235,0.2)" }),
  thumb: { position: "fixed", bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, padding: 12, zIndex: 50, paddingBottom: "calc(12px + env(safe-area-inset-bottom))", boxShadow: C.shadowLg },
  thumbAbove: { position: "fixed", bottom: "calc(64px + env(safe-area-inset-bottom))", left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, padding: 12, zIndex: 49, boxShadow: C.shadowLg },
  thumbInner: { maxWidth: 480, margin: "0 auto", display: "flex", gap: 8, width: "100%" },
  tabBar: { position: "fixed", bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 50, paddingBottom: "env(safe-area-inset-bottom)", boxShadow: C.shadowLg },
  tabInner: { maxWidth: 480, margin: "0 auto", display: "flex", width: "100%" },
  tab: (a) => ({ flex: 1, padding: "14px 4px", background: "none", border: "none", color: a ? C.primary : C.textMuted, fontSize: 11, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", fontWeight: 600 }),
  input: { width: "100%", padding: 14, fontSize: 16, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, marginBottom: 10, outline: "none" },
  label: { fontSize: 13, color: C.textMuted, display: "block", marginTop: 8, marginBottom: 4, fontWeight: 600 },
  stat: { display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}`, fontSize: 14, color: C.text },
  sectionTitle: { fontSize: 12, color: C.textLight, textTransform: "uppercase", marginTop: 16, marginBottom: 4, fontWeight: 700, padding: "0 16px" },
};

function Header({ title, onBack, action }) {
  return (
    <div style={S.header}>
      {onBack && <button onClick={onBack} style={{ background: "none", border: "none", color: C.text, cursor: "pointer", padding: 4 }}><ArrowLeft size={26} /></button>}
      <Truck color={C.primary} size={28} />
      <h1 style={S.h1}>{title}</h1>
      {action}
    </div>
  );
}

function Confirm({ msg, onYes, onNo }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: C.surface, borderRadius: 16, padding: 22, maxWidth: 360, width: "100%", boxShadow: "0 20px 50px rgba(15,23,42,0.25)" }}>
        <div style={{ fontSize: 16, marginBottom: 18 }}>{msg}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onNo} style={S.btn("#94a3b8", 52)}>Cancelar</button>
          <button onClick={onYes} style={S.btn(C.danger, 52)}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// PDF GENERATOR
// =====================================================================
function generateInvoicePDF(invoice, settings, client, lines) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();

  // Cabecera emisor
  doc.setFont("helvetica", "bold").setFontSize(14);
  doc.text((settings.nombre || "EMISOR").toUpperCase(), 14, 18);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(`NIF: ${settings.nif || ""}`, 14, 24);
  doc.text(settings.direccion || "", 14, 29);
  doc.text(`${settings.cp || ""}  ${(settings.ciudad || "").toUpperCase()}`, 14, 34);

  // Dirección de envío (cliente)
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text("Dirección de Envío:", 120, 24);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(client.razon || "", 120, 29);
  doc.text(`C.I.F ${client.nif || ""}`, 120, 34);
  doc.text(client.direccion || "", 120, 39);
  doc.text(`${client.cp || ""} ${(client.ciudad || "").toUpperCase()}`, 120, 44);

  // Cuadro Factura/Fecha
  doc.rect(14, 42, 90, 18);
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text("FACTURA", 16, 48);
  doc.text("FECHA", 16, 54);
  doc.text("FORMA DE PAGO", 16, 60);
  doc.setFont("helvetica", "normal");
  doc.text(invoice.numero, 50, 48);
  doc.text(fmtDate(invoice.fecha), 50, 54);
  doc.text(settings.formaPago || "", 50, 60);

  // Datos del cliente
  doc.setFont("helvetica", "bold").setFontSize(9);
  doc.text("DATOS DEL CLIENTE:", 14, 70);
  doc.setFont("helvetica", "normal");
  doc.text(`C.I.F ${client.nif || ""}    ${client.razon || ""}`, 14, 75);
  doc.text(client.direccion || "", 14, 80);
  doc.text(`${client.cp || ""} ${(client.ciudad || "").toUpperCase()}`, 14, 85);

  // Tabla de líneas
  autoTable(doc, {
    startY: 92,
    head: [["FECHA", "EXPED.", "ORIGEN/DESTINO", "TRACTORA", "REMOLQUE", "IMPORTE"]],
    body: lines.map(l => [
      fmtShort(l.fecha || invoice.fecha),
      l.expediente || "",
      `${l.origen} → ${l.destino}`,
      l.tractora || settings.tractora || "",
      l.remolque || settings.remolque || "",
      Number(l.precio).toFixed(2),
    ]),
    theme: "grid",
    headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 5: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });

  // Totales abajo a la derecha
  const finalY = doc.lastAutoTable.finalY + 10;
  const labelX = 120, valueX = pageW - 16;
  doc.setFont("helvetica", "bold").setFontSize(10);

  const rows = [
    ["SUMA IMPORTES", eur(invoice.base)],
    ["DESCUENTO", eur(0)],
    ["BASE IMPONIBLE", eur(invoice.base)],
    [`I.R.P.F   ${invoice.irpfPct}%`, eur(invoice.irpfImporte)],
    [`I.V.A.    ${invoice.ivaPct}%`, eur(invoice.cuota)],
    ["TOTAL FACTURA", eur(invoice.total)],
  ];
  rows.forEach((r, i) => {
    const y = finalY + i * 7;
    doc.text(r[0], labelX, y);
    doc.text(r[1], valueX, y, { align: "right" });
  });

  // Observaciones
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(`Forma de Pago: ${settings.formaPago || ""}`, 14, finalY);
  if (settings.observaciones) doc.text(`Observaciones: ${settings.observaciones}`, 14, finalY + 6);

  // Hash VeriFactu
  doc.setFontSize(7).setTextColor(120);
  doc.text(`VeriFactu hash: ${invoice.hash}`, 14, finalY + 50);

  doc.save(`Factura_${invoice.numero}.pdf`);
}

// =====================================================================
// APP
// =====================================================================
export default function App() {
  const [ready, setReady] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [settings, setSettings] = useState(null);

  const [screen, setScreen] = useState("home");
  const [activeId, setActiveId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [editingClient, setEditingClient] = useState(null);
  const [invoiceClientId, setInvoiceClientId] = useState(null);

  useEffect(() => {
    (async () => {
      await dataApi.init();
      setRoutes(await dataApi.getAll("routes"));
      setExpenses(await dataApi.getAll("expenses"));
      setInvoices(await dataApi.getAll("invoices"));
      setClients(await dataApi.getAll("clients"));
      setSettings(await dataApi.getSettings());
      setReady(true);
    })();
  }, []);

  const reload = useCallback(async () => {
    setRoutes(await dataApi.getAll("routes"));
    setExpenses(await dataApi.getAll("expenses"));
    setInvoices(await dataApi.getAll("invoices"));
    setClients(await dataApi.getAll("clients"));
  }, []);

  const active = routes.find(r => r.id === activeId) || routes.find(r => r.estado === "in_progress");
  const expensesOf = (rid) => expenses.filter(e => e.routeId === rid);
  const totals = (r) => {
    if (!r) return { gastos: 0, beneficio: 0, margen: 0 };
    const g = expensesOf(r.id).reduce((s, e) => s + Number(e.importe), 0);
    const b = Number(r.precio) - g;
    return { gastos: g, beneficio: b, margen: r.precio > 0 ? (b / r.precio) * 100 : 0 };
  };

  const consumoMedio = useMemo(() => {
    const rf = expenses.filter(e => e.tipo === "fuel" && e.litros && e.km).sort((a, b) => a.km - b.km);
    if (rf.length < 2) return null;
    const l = rf.slice(1).reduce((s, r) => s + Number(r.litros), 0);
    const k = rf[rf.length - 1].km - rf[0].km;
    return k > 0 ? (l * 100 / k).toFixed(2) : null;
  }, [expenses]);

  // ---- acciones ----
  const startRoute = async (data) => {
    const r = await dataApi.put("routes", { ...data, precio: Number(data.precio), km: Number(data.km || 0), peso: Number(data.peso || 0), estado: "delivered", fecha: data.fecha || new Date().toISOString(), inicio: new Date().toISOString() });
    await reload();
    setScreen("home");
  };
  const updateRoute = async (data) => {
    await dataApi.put("routes", { ...editing, ...data, precio: Number(data.precio), km: Number(data.km || 0), peso: Number(data.peso || 0) });
    setEditing(null); await reload(); setScreen("routesList");
  };
  const removeRoute = async (id) => { await dataApi.remove("routes", id); await reload(); setConfirm(null); };
  const addExpense = async (data) => { await dataApi.put("expenses", { routeId: active.id, fecha: new Date().toISOString(), ...data, importe: Number(data.importe), litros: data.litros ? Number(data.litros) : null, km: data.km ? Number(data.km) : null }); await reload(); setModal(null); };
  const removeExpense = async (id) => { await dataApi.remove("expenses", id); await reload(); setConfirm(null); };

  const saveClient = async (data) => { await dataApi.put("clients", { ...editingClient, ...data }); setEditingClient(null); await reload(); setScreen("clients"); };
  const removeClient = async (id) => { await dataApi.remove("clients", id); await reload(); setConfirm(null); };

  const saveSettings = async (s) => { const saved = await dataApi.saveSettings(s); setSettings(saved); setScreen("home"); };

  const emitInvoice = async (clientId, routeIds) => {
    const client = clients.find(c => c.id === clientId);
    const lines = routes.filter(r => routeIds.includes(r.id));
    const base = +lines.reduce((s, r) => s + Number(r.precio), 0).toFixed(2);
    const irpfPct = settings.irpf;
    const ivaPct = settings.iva;
    const irpfImporte = +(base * irpfPct / 100).toFixed(2);
    const cuota = +(base * ivaPct / 100).toFixed(2);
    const total = +(base - irpfImporte + cuota).toFixed(2);

    const numero = `${settings.serie}-${String(invoices.length + 1).padStart(3, "0")}/${settings.ejercicio}`;
    const fecha = new Date().toISOString();
    const sorted = [...invoices].sort((a, b) => a.numero.localeCompare(b.numero));
    const prevHash = sorted.length ? sorted[sorted.length - 1].hash : "0".repeat(64);
    const payload = `${numero}|${fecha.slice(0, 10)}|${settings.nif}|${client.nif}|${base}|${cuota}|${total}|${prevHash}`;
    const hash = await dataApi.sha256(payload);

    const inv = await dataApi.put("invoices", {
      numero, fecha, clientId, lineRouteIds: routeIds,
      base, irpfPct, irpfImporte, ivaPct, cuota, total,
      hashAnterior: prevHash, hash, estado: "issued", inmutable: true,
    });

    // Marcar rutas como facturadas
    for (const r of lines) {
      await dataApi.put("routes", { ...r, estado: "invoiced", invoiceId: inv.id });
    }
    await reload();
    setInvoiceClientId(null);
    setScreen("invoices");

    // Generar PDF inmediatamente
    generateInvoicePDF(inv, settings, client, lines);
  };

  const downloadInvoice = (inv) => {
    const client = clients.find(c => c.id === inv.clientId);
    const lines = routes.filter(r => inv.lineRouteIds?.includes(r.id));
    if (client && lines.length) generateInvoicePDF(inv, settings, client, lines);
  };

  if (!ready) return <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted }}>Cargando…</div>;

  return (
    <div style={S.app}>
      <div style={S.container}>
        {screen === "home" && <HomeScreen invoices={invoices} routes={routes} consumoMedio={consumoMedio} active={active} onNew={() => setScreen("new")} onActive={() => setScreen("active")} onRoutes={() => setScreen("routesList")} />}
        {screen === "new" && <RouteForm clients={clients} settings={settings} onCancel={() => setScreen("home")} onSubmit={startRoute} />}
        {screen === "editRoute" && <RouteForm clients={clients} settings={settings} initial={editing} editing onCancel={() => { setEditing(null); setScreen("routesList"); }} onSubmit={updateRoute} />}
        {screen === "routesList" && <RoutesListScreen routes={routes} clients={clients} onBack={() => setScreen("home")} onEdit={(r) => { setEditing(r); setScreen("editRoute"); }} onDelete={(id) => setConfirm({ msg: "¿Eliminar esta ruta?", onYes: () => removeRoute(id) })} />}
        {screen === "active" && <ActiveScreen route={active} expenses={expensesOf(active?.id)} totals={totals(active)} margenAlerta={settings.margenAlerta} onBack={() => setScreen("home")} onAddFuel={() => setModal("fuel")} onAddExpense={() => setModal("expense")} onDeleteExpense={(id) => setConfirm({ msg: "¿Eliminar este gasto?", onYes: () => removeExpense(id) })} />}
        {screen === "invoices" && <InvoicesScreen invoices={invoices} clients={clients} onNew={() => setScreen("invoiceClient")} onDownload={downloadInvoice} />}
        {screen === "invoiceClient" && <PickClientScreen clients={clients} routes={routes} onBack={() => setScreen("invoices")} onPick={(id) => { setInvoiceClientId(id); setScreen("invoiceLines"); }} />}
        {screen === "invoiceLines" && <PickLinesScreen client={clients.find(c => c.id === invoiceClientId)} routes={routes.filter(r => r.clientId === invoiceClientId && r.estado !== "invoiced")} settings={settings} onBack={() => setScreen("invoiceClient")} onEmit={(routeIds) => emitInvoice(invoiceClientId, routeIds)} />}
        {screen === "clients" && <ClientsScreen clients={clients} onBack={() => setScreen("settings")} onAdd={() => { setEditingClient({}); setScreen("editClient"); }} onEdit={(c) => { setEditingClient(c); setScreen("editClient"); }} onDelete={(id) => setConfirm({ msg: "¿Eliminar cliente?", onYes: () => removeClient(id) })} />}
        {screen === "editClient" && <ClientForm initial={editingClient} onCancel={() => { setEditingClient(null); setScreen("clients"); }} onSubmit={saveClient} />}
        {screen === "settings" && <SettingsScreen settings={settings} onSave={saveSettings} onClients={() => setScreen("clients")} />}
      </div>

      {modal && <ExpenseModal kind={modal} onCancel={() => setModal(null)} onSave={addExpense} />}
      {confirm && <Confirm msg={confirm.msg} onYes={confirm.onYes} onNo={() => setConfirm(null)} />}

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
function HomeScreen({ invoices, routes, consumoMedio, active, onNew, onActive, onRoutes }) {
  const now = new Date();
  const mes = invoices.filter(i => { const d = new Date(i.fecha); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const ingresosMes = mes.reduce((s, i) => s + i.base, 0);
  const pendientes = routes.filter(r => r.estado !== "invoiced").length;

  return (
    <>
      <Header title="TruckerPro" />
      <div style={S.card}>
        <div style={{ fontSize: 13, color: C.textMuted }}>Ingresos este mes</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: C.success, marginTop: 4 }}>{eur(ingresosMes)}</div>
        <div style={{ ...S.stat, marginTop: 8 }}><span>Facturas emitidas</span><b>{mes.length}</b></div>
        <div style={S.stat}><span>Rutas pendientes de facturar</span><b>{pendientes}</b></div>
        <div style={{ ...S.stat, borderBottom: "none" }}><span>Consumo medio</span><b>{consumoMedio ? `${consumoMedio} L/100km` : "—"}</b></div>
      </div>

      {active && (
        <div style={{ ...S.card, borderColor: C.primary, borderWidth: 2 }}>
          <div style={{ fontSize: 12, color: C.primary, fontWeight: 700 }}>RUTA EN CURSO (con gastos)</div>
          <div style={{ fontSize: 18, fontWeight: 700, margin: "8px 0" }}>{active.origen} → {active.destino}</div>
          <button onClick={onActive} style={S.btn(C.primary, 52)}>Ver gastos</button>
        </div>
      )}

      <div style={S.card}>
        <button onClick={onRoutes} style={{ ...S.btn(C.primary, 52), background: C.surfaceAlt, color: C.text, boxShadow: "none", border: `1px solid ${C.border}` }}>📋 Ver todas las rutas</button>
      </div>

      <div style={S.thumbAbove}>
        <div style={S.thumbInner}>
          <button onClick={onNew} style={S.btn(C.success)}><Plus size={24} />Registrar nueva ruta</button>
        </div>
      </div>
    </>
  );
}

// =====================================================================
// FORMULARIO RUTA
// =====================================================================
function RouteForm({ initial, clients, settings, onCancel, onSubmit, editing }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState(initial ? { ...initial, fecha: (initial.fecha || initial.inicio || "").slice(0, 10) } : { fecha: today, clientId: "", cliente: "", origen: "", destino: "", expediente: "", km: "", peso: "", precio: "" });
  const [newClient, setNewClient] = useState(false);
  const valid = (f.clientId || (newClient && f.cliente)) && f.origen && f.destino && f.precio;

  return (
    <>
      <Header title={editing ? "Editar ruta" : "Nueva ruta"} onBack={onCancel} />
      <div style={{ padding: 16 }}>
        <label style={S.label}>Fecha</label>
        <input style={S.input} type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} />

        <label style={S.label}>Cliente</label>
        {!newClient ? (
          <>
            <select style={S.input} value={f.clientId || ""} onChange={e => setF({ ...f, clientId: e.target.value, cliente: clients.find(c => c.id === e.target.value)?.razon || "" })}>
              <option value="">— Selecciona cliente —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.razon}</option>)}
            </select>
            <button onClick={() => setNewClient(true)} style={{ background: "none", border: "none", color: C.primary, fontSize: 13, cursor: "pointer", marginBottom: 8, fontWeight: 600 }}>+ Crear cliente al vuelo</button>
          </>
        ) : (
          <>
            <input style={S.input} placeholder="Nombre del cliente" value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value, clientId: "" })} />
            <button onClick={() => setNewClient(false)} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer", marginBottom: 8 }}>← Elegir de la lista</button>
          </>
        )}

        <label style={S.label}>Origen</label><input style={S.input} value={f.origen} onChange={e => setF({ ...f, origen: e.target.value })} />
        <label style={S.label}>Destino</label><input style={S.input} value={f.destino} onChange={e => setF({ ...f, destino: e.target.value })} />
        <label style={S.label}>Expediente (opcional)</label><input style={S.input} value={f.expediente || ""} onChange={e => setF({ ...f, expediente: e.target.value })} />
        <label style={S.label}>Precio acordado (€)</label><input style={S.input} type="number" inputMode="decimal" value={f.precio} onChange={e => setF({ ...f, precio: e.target.value })} />
        <label style={S.label}>Kilómetros (opcional)</label><input style={S.input} type="number" value={f.km} onChange={e => setF({ ...f, km: e.target.value })} />
        <label style={S.label}>Peso en t (opcional)</label><input style={S.input} type="number" value={f.peso} onChange={e => setF({ ...f, peso: e.target.value })} />

        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8 }}>Tractora: <b>{settings.tractora || "(configurar en Ajustes)"}</b> · Remolque: <b>{settings.remolque || "(configurar en Ajustes)"}</b></div>
      </div>
      <div style={S.thumb}><div style={S.thumbInner}>
        <button onClick={() => valid && onSubmit(f)} disabled={!valid} style={{ ...S.btn(valid ? C.success : "#cbd5e1"), opacity: valid ? 1 : 0.7 }}><CheckCircle size={24} />{editing ? "Guardar cambios" : "Registrar ruta"}</button>
      </div></div>
    </>
  );
}

// =====================================================================
// LISTADO RUTAS
// =====================================================================
function RoutesListScreen({ routes, clients, onBack, onEdit, onDelete }) {
  const sorted = [...routes].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  return (
    <>
      <Header title="Todas las rutas" onBack={onBack} />
      {sorted.length === 0 && <div style={{ ...S.card, color: C.textLight, textAlign: "center" }}>Sin rutas todavía</div>}
      {sorted.map(r => {
        const c = clients.find(cl => cl.id === r.clientId);
        const facturada = r.estado === "invoiced";
        return (
          <div key={r.id} style={{ ...S.card, opacity: facturada ? 0.65 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <b>{r.origen} → {r.destino}</b>
              <span style={{ color: C.success, fontWeight: 700 }}>{eur(r.precio)}</span>
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{c?.razon || r.cliente} · {fmtDate(r.fecha || r.inicio)}{r.expediente ? ` · Exp. ${r.expediente}` : ""}</div>
            <div style={{ fontSize: 11, color: facturada ? C.success : C.warning, marginTop: 4, fontWeight: 600 }}>{facturada ? "✓ Facturada" : "⏳ Pendiente"}</div>
            {!facturada && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => onEdit(r)} style={{ ...S.btn(C.primary, 40), fontSize: 13 }}><Edit3 size={16} />Editar</button>
                <button onClick={() => onDelete(r.id)} style={{ ...S.btn(C.danger, 40), fontSize: 13 }}><Trash2 size={16} />Borrar</button>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// =====================================================================
// RUTA ACTIVA (gastos)
// =====================================================================
function ActiveScreen({ route, expenses, totals, margenAlerta, onBack, onAddFuel, onAddExpense, onDeleteExpense }) {
  if (!route) return null;
  const { gastos, beneficio, margen } = totals;
  const color = margen < 20 ? C.danger : margen < 30 ? C.warning : C.success;
  const tipoLabel = { fuel: "⛽ Gasoil", toll: "🛣️ Peaje", meal: "🍽️ Dieta", parking: "🅿️ Parking", other: "📌 Otro" };
  return (
    <>
      <Header title="Gastos de ruta" onBack={onBack} />
      <div style={S.card}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{route.origen} → {route.destino}</div>
        <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>{route.cliente}</div>
      </div>
      <div style={{ ...S.card, borderColor: color, borderWidth: 2 }}>
        <div style={S.stat}><span>Precio flete</span><b>{eur(route.precio)}</b></div>
        <div style={S.stat}><span>Gastos</span><b style={{ color: C.danger }}>-{eur(gastos)}</b></div>
        <div style={S.stat}><span>Beneficio</span><b style={{ color }}>{eur(beneficio)}</b></div>
        <div style={{ ...S.stat, borderBottom: "none" }}><span>Margen</span><b style={{ color, fontSize: 22 }}>{margen.toFixed(1)}%</b></div>
        {margen < margenAlerta && <div style={{ background: "#fef2f2", border: `1px solid ${C.danger}`, padding: 12, borderRadius: 8, marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle color={C.danger} size={20} /><span style={{ color: C.danger, fontSize: 13, fontWeight: 600 }}>Margen por debajo del {margenAlerta}%</span></div>}
      </div>
      <div style={S.card}>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 8, fontWeight: 600 }}>Gastos ({expenses.length})</div>
        {expenses.length === 0 && <div style={{ color: C.textLight, fontSize: 13 }}>Sin gastos</div>}
        {expenses.map(e => (
          <div key={e.id} style={{ ...S.stat, alignItems: "center" }}>
            <span>{tipoLabel[e.tipo]}{e.litros ? ` · ${e.litros} L` : ""}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <b>{eur(e.importe)}</b>
              <button onClick={() => onDeleteExpense(e.id)} style={{ background: "none", border: "none", color: C.textLight, cursor: "pointer" }}><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
      </div>
      <div style={S.thumb}><div style={S.thumbInner}>
        <button onClick={onAddFuel} style={{ ...S.btn(C.warning), fontSize: 12, flexDirection: "column", gap: 2 }}><Fuel size={22} /><span>Repostaje</span></button>
        <button onClick={onAddExpense} style={{ ...S.btn(C.primary), fontSize: 12, flexDirection: "column", gap: 2 }}><Receipt size={22} /><span>Gasto</span></button>
      </div></div>
    </>
  );
}

function ExpenseModal({ kind, onCancel, onSave }) {
  const isFuel = kind === "fuel";
  const [f, setF] = useState({ tipo: isFuel ? "fuel" : "toll", importe: "", litros: "", km: "" });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: C.surface, width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0", padding: 20, paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{isFuel ? "⛽ Repostaje" : "🧾 Nuevo gasto"}</h2>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer" }}><X size={24} /></button>
        </div>
        {!isFuel && <><label style={S.label}>Tipo</label><select style={S.input} value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}><option value="toll">Peaje</option><option value="meal">Dieta</option><option value="parking">Parking</option><option value="other">Otro</option></select></>}
        <label style={S.label}>Importe (€)</label>
        <input style={S.input} type="number" inputMode="decimal" value={f.importe} onChange={e => setF({ ...f, importe: e.target.value })} autoFocus />
        {isFuel && <><label style={S.label}>Litros</label><input style={S.input} type="number" value={f.litros} onChange={e => setF({ ...f, litros: e.target.value })} /><label style={S.label}>Km del odómetro</label><input style={S.input} type="number" value={f.km} onChange={e => setF({ ...f, km: e.target.value })} /></>}
        <button onClick={() => f.importe && onSave(f)} style={{ ...S.btn(C.success, 56), marginTop: 8 }}>Guardar</button>
      </div>
    </div>
  );
}

// =====================================================================
// FACTURAS
// =====================================================================
function InvoicesScreen({ invoices, clients, onNew, onDownload }) {
  const sorted = [...invoices].sort((a, b) => b.numero.localeCompare(a.numero));
  return (
    <>
      <Header title="Facturas" />
      {sorted.length === 0 && <div style={{ ...S.card, color: C.textLight, textAlign: "center" }}>Aún no hay facturas. Pulsa el botón verde para crear la primera.</div>}
      {sorted.map(i => {
        const c = clients.find(cl => cl.id === i.clientId);
        return (
          <div key={i.id} style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <b style={{ fontSize: 16 }}>{i.numero}</b>
              <span style={{ color: C.success, fontSize: 18, fontWeight: 700 }}>{eur(i.total)}</span>
            </div>
            <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>{c?.razon || "?"} · {fmtDate(i.fecha)}</div>
            <div style={{ fontSize: 12, color: C.textLight, marginTop: 4 }}>Base: {eur(i.base)} · IRPF -{eur(i.irpfImporte)} · IVA: {eur(i.cuota)}</div>
            <button onClick={() => onDownload(i)} style={{ ...S.btn(C.primary, 44), marginTop: 10, fontSize: 13 }}><Download size={16} />Descargar PDF</button>
            <div style={{ fontSize: 10, color: C.textLight, marginTop: 8, fontFamily: "monospace", wordBreak: "break-all" }}>🔒 {i.hash.slice(0, 32)}…</div>
            <div style={{ fontSize: 11, color: C.success, marginTop: 4, fontWeight: 600 }}>✓ Inmutable · Hash encadenado VeriFactu</div>
          </div>
        );
      })}
      <div style={S.thumbAbove}><div style={S.thumbInner}>
        <button onClick={onNew} style={S.btn(C.success)}><Plus size={24} />Generar nueva factura</button>
      </div></div>
    </>
  );
}

function PickClientScreen({ clients, routes, onBack, onPick }) {
  const conRutas = clients.map(c => ({ ...c, pendientes: routes.filter(r => r.clientId === c.id && r.estado !== "invoiced").length }));
  return (
    <>
      <Header title="Elegir cliente" onBack={onBack} />
      {conRutas.length === 0 && <div style={{ ...S.card, color: C.textLight, textAlign: "center" }}>Crea primero clientes desde Ajustes → Clientes</div>}
      {conRutas.map(c => (
        <div key={c.id} style={S.card} onClick={() => c.pendientes > 0 && onPick(c.id)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <b>{c.razon}</b>
              <div style={{ fontSize: 12, color: C.textMuted }}>{c.nif}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: c.pendientes > 0 ? C.primary : C.textLight }}>{c.pendientes}</div>
              <div style={{ fontSize: 10, color: C.textMuted }}>pendientes</div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function PickLinesScreen({ client, routes, settings, onBack, onEmit }) {
  const [sel, setSel] = useState(routes.map(r => r.id));
  const sorted = [...routes].sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
  const selected = sorted.filter(r => sel.includes(r.id));
  const base = selected.reduce((s, r) => s + Number(r.precio), 0);
  const irpf = base * settings.irpf / 100;
  const iva = base * settings.iva / 100;
  const total = base - irpf + iva;

  const toggle = (id) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  return (
    <>
      <Header title={client?.razon || "Cliente"} onBack={onBack} />
      <div style={S.card}>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 8 }}>Marca las rutas que quieres incluir:</div>
        {sorted.map(r => (
          <div key={r.id} onClick={() => toggle(r.id)} style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer", gap: 10 }}>
            <input type="checkbox" checked={sel.includes(r.id)} readOnly style={{ width: 20, height: 20 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{r.origen} → {r.destino}</div>
              <div style={{ fontSize: 11, color: C.textMuted }}>{fmtDate(r.fecha || r.inicio)}{r.expediente ? ` · Exp. ${r.expediente}` : ""}</div>
            </div>
            <b style={{ color: C.success }}>{eur(r.precio)}</b>
          </div>
        ))}
      </div>
      <div style={S.card}>
        <div style={S.stat}><span>Base imponible</span><b>{eur(base)}</b></div>
        <div style={S.stat}><span>IRPF -{settings.irpf}%</span><b style={{ color: C.danger }}>-{eur(irpf)}</b></div>
        <div style={S.stat}><span>IVA {settings.iva}%</span><b>{eur(iva)}</b></div>
        <div style={{ ...S.stat, borderBottom: "none", fontSize: 18 }}><span>TOTAL</span><b style={{ color: C.success }}>{eur(total)}</b></div>
      </div>
      <div style={S.thumb}><div style={S.thumbInner}>
        <button onClick={() => sel.length && onEmit(sel)} disabled={!sel.length} style={{ ...S.btn(sel.length ? C.success : "#cbd5e1"), opacity: sel.length ? 1 : 0.7 }}><FileText size={24} />Emitir factura + PDF</button>
      </div></div>
    </>
  );
}

// =====================================================================
// CLIENTES
// =====================================================================
function ClientsScreen({ clients, onBack, onAdd, onEdit, onDelete }) {
  return (
    <>
      <Header title="Clientes" onBack={onBack} />
      {clients.length === 0 && <div style={{ ...S.card, color: C.textLight, textAlign: "center" }}>No hay clientes</div>}
      {clients.map(c => (
        <div key={c.id} style={S.card}>
          <b>{c.razon}</b>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{c.nif}</div>
          <div style={{ fontSize: 12, color: C.textMuted }}>{c.direccion}</div>
          <div style={{ fontSize: 12, color: C.textMuted }}>{c.cp} {c.ciudad}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => onEdit(c)} style={{ ...S.btn(C.primary, 40), fontSize: 13 }}><Edit3 size={16} />Editar</button>
            <button onClick={() => onDelete(c.id)} style={{ ...S.btn(C.danger, 40), fontSize: 13 }}><Trash2 size={16} />Borrar</button>
          </div>
        </div>
      ))}
      <div style={S.thumb}><div style={S.thumbInner}>
        <button onClick={onAdd} style={S.btn(C.success)}><Plus size={24} />Nuevo cliente</button>
      </div></div>
    </>
  );
}

function ClientForm({ initial, onCancel, onSubmit }) {
  const [f, setF] = useState(initial?.id ? initial : { razon: "", nif: "", direccion: "", cp: "", ciudad: "" });
  const valid = f.razon && f.nif;
  return (
    <>
      <Header title={initial?.id ? "Editar cliente" : "Nuevo cliente"} onBack={onCancel} />
      <div style={{ padding: 16 }}>
        <label style={S.label}>Razón social</label><input style={S.input} value={f.razon} onChange={e => setF({ ...f, razon: e.target.value })} />
        <label style={S.label}>NIF / CIF</label><input style={S.input} value={f.nif} onChange={e => setF({ ...f, nif: e.target.value })} />
        <label style={S.label}>Dirección</label><input style={S.input} value={f.direccion} onChange={e => setF({ ...f, direccion: e.target.value })} />
        <label style={S.label}>Código postal</label><input style={S.input} value={f.cp} onChange={e => setF({ ...f, cp: e.target.value })} />
        <label style={S.label}>Ciudad</label><input style={S.input} value={f.ciudad} onChange={e => setF({ ...f, ciudad: e.target.value })} />
      </div>
      <div style={S.thumb}><div style={S.thumbInner}>
        <button onClick={() => valid && onSubmit(f)} disabled={!valid} style={{ ...S.btn(valid ? C.success : "#cbd5e1") }}><CheckCircle size={24} />Guardar cliente</button>
      </div></div>
    </>
  );
}

// =====================================================================
// AJUSTES
// =====================================================================
function SettingsScreen({ settings, onSave, onClients }) {
  const [f, setF] = useState(settings);
  return (
    <>
      <Header title="Ajustes" />
      <div style={S.card}>
        <button onClick={onClients} style={{ ...S.btn(C.primary, 52) }}><Users size={20} />Gestionar clientes</button>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: C.textLight, textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>Mis datos</div>
        <label style={S.label}>Nombre / Razón social</label><input style={S.input} value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} />
        <label style={S.label}>NIF</label><input style={S.input} value={f.nif} onChange={e => setF({ ...f, nif: e.target.value })} />
        <label style={S.label}>Dirección</label><input style={S.input} value={f.direccion} onChange={e => setF({ ...f, direccion: e.target.value })} />
        <label style={S.label}>Código postal</label><input style={S.input} value={f.cp} onChange={e => setF({ ...f, cp: e.target.value })} />
        <label style={S.label}>Ciudad</label><input style={S.input} value={f.ciudad} onChange={e => setF({ ...f, ciudad: e.target.value })} />

        <div style={{ fontSize: 12, color: C.textLight, textTransform: "uppercase", marginTop: 16, marginBottom: 4, fontWeight: 700 }}>Vehículos</div>
        <label style={S.label}>Matrícula tractora</label><input style={S.input} value={f.tractora} onChange={e => setF({ ...f, tractora: e.target.value })} />
        <label style={S.label}>Matrícula remolque</label><input style={S.input} value={f.remolque} onChange={e => setF({ ...f, remolque: e.target.value })} />

        <div style={{ fontSize: 12, color: C.textLight, textTransform: "uppercase", marginTop: 16, marginBottom: 4, fontWeight: 700 }}>Facturación</div>
        <label style={S.label}>Serie</label><input style={S.input} value={f.serie} onChange={e => setF({ ...f, serie: e.target.value })} />
        <label style={S.label}>Ejercicio</label><input style={S.input} type="number" value={f.ejercicio} onChange={e => setF({ ...f, ejercicio: Number(e.target.value) })} />
        <label style={S.label}>IVA (%)</label><input style={S.input} type="number" value={f.iva} onChange={e => setF({ ...f, iva: Number(e.target.value) })} />
        <label style={S.label}>IRPF (%)</label><input style={S.input} type="number" value={f.irpf} onChange={e => setF({ ...f, irpf: Number(e.target.value) })} />
        <label style={S.label}>Forma de pago</label><input style={S.input} value={f.formaPago} onChange={e => setF({ ...f, formaPago: e.target.value })} />
        <label style={S.label}>Observaciones</label><input style={S.input} value={f.observaciones} onChange={e => setF({ ...f, observaciones: e.target.value })} />

        <div style={{ fontSize: 12, color: C.textLight, textTransform: "uppercase", marginTop: 16, marginBottom: 4, fontWeight: 700 }}>Alertas</div>
        <label style={S.label}>Margen mínimo (%)</label><input style={S.input} type="number" value={f.margenAlerta} onChange={e => setF({ ...f, margenAlerta: Number(e.target.value) })} />

        <button onClick={() => onSave(f)} style={{ ...S.btn(C.success), marginTop: 20 }}>Guardar ajustes</button>
      </div>
    </>
  );
}
