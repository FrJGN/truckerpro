import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Truck, Fuel, Receipt, CheckCircle, FileText, AlertTriangle, ArrowLeft, Home as HomeIcon,
  Settings as SettingsIcon, Trash2, Edit3, X, Users, Plus, Download, Search, BarChart3,
  CreditCard, Clock, CheckCircle2, CircleDollarSign, Upload, Database, Moon, Sun, TrendingUp
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { dataApi } from "./dataApi.js";

/* ---------------- Utilidades ---------------- */
const eur = (n) => (Number(n) || 0).toFixed(2).replace(".", ",") + " €";
const eurShort = (n) => { const v = Number(n) || 0; return v >= 1000 ? v.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " €" : v.toFixed(2).replace(".", ",") + " €"; };
const fmtDate = (iso) => new Date(iso).toLocaleDateString("es-ES");
const fmtShort = (iso) => { const d = new Date(iso); return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`; };
const addDays = (iso, d) => { const x = new Date(iso); x.setDate(x.getDate() + d); return x.toISOString(); };
const diffDays = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
const haptic = (ms = 10) => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };
const monthKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const monthLabel = (key) => { const [y, m] = key.split("-"); const nombres = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]; return `${nombres[Number(m) - 1]} ${y}`; };

/* ---------------- Categorías de gasto ---------------- */
// Cubre tanto gastos de ruta (combustible, peajes, dietas, parking) como gastos generales del autónomo
// (mantenimiento, neumáticos, seguro, ITV, impuestos, cuota autónomos, formación, otros).
const CATEGORIES = [
  { key: "fuel",        label: "Combustible",     emoji: "⛽", colorKey: "warning", scope: "ruta" },
  { key: "toll",        label: "Peaje",           emoji: "🛣️", colorKey: "info",    scope: "ruta" },
  { key: "meal",        label: "Dieta",           emoji: "🍽️", colorKey: "info",    scope: "ruta" },
  { key: "parking",     label: "Parking",         emoji: "🅿️", colorKey: "info",    scope: "ruta" },
  { key: "tires",       label: "Neumáticos",      emoji: "🛞", colorKey: "danger",  scope: "general" },
  { key: "maintenance", label: "Mantenimiento",   emoji: "🔧", colorKey: "warning", scope: "general" },
  { key: "repair",      label: "Reparación",      emoji: "🛠️", colorKey: "danger",  scope: "general" },
  { key: "insurance",   label: "Seguro",          emoji: "🛡️", colorKey: "primary", scope: "general" },
  { key: "itv",         label: "ITV / Tacógrafo", emoji: "📋", colorKey: "primary", scope: "general" },
  { key: "tax",         label: "Impuestos",       emoji: "💼", colorKey: "danger",  scope: "general" },
  { key: "autonomo",    label: "Cuota autónomo",  emoji: "👤", colorKey: "primary", scope: "general" },
  { key: "training",    label: "Formación / CAP", emoji: "🎓", colorKey: "info",    scope: "general" },
  { key: "other",       label: "Otros",           emoji: "📌", colorKey: "textMuted", scope: "ambos" },
];
const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));
const catLabel = (key) => { const c = CAT_BY_KEY[key]; return c ? `${c.emoji} ${c.label}` : key; };

/* ---------------- Helpers de combustible ---------------- */
// Obtiene el último precio €/L pagado por el usuario, calculado a partir de sus repostajes
function lastFuelPrice(expenses) {
  const fuels = expenses
    .filter(e => e.tipo === "fuel" && Number(e.litros) > 0 && Number(e.importe) > 0)
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  if (!fuels.length) return null;
  return Number(fuels[0].importe) / Number(fuels[0].litros);
}
// Consumo medio L/100km — calculado sobre histórico de repostajes con km
function avgConsumption(expenses) {
  const rf = expenses.filter(e => e.tipo === "fuel" && e.litros && e.km).sort((a, b) => Number(a.km) - Number(b.km));
  if (rf.length < 2) return null;
  const l = rf.slice(1).reduce((s, r) => s + Number(r.litros), 0);
  const k = Number(rf[rf.length - 1].km) - Number(rf[0].km);
  return k > 0 ? (l * 100) / k : null;
}
// Estimación de coste de combustible para X km, usando histórico cuando exista
function estimateFuelCost(km, expenses, settings) {
  const consumo = avgConsumption(expenses) ?? Number(settings?.consumoEstimado || 30);
  const precio = lastFuelPrice(expenses) ?? Number(settings?.precioGasoil || 1.45);
  const litros = (Number(km) || 0) * consumo / 100;
  return { litros, coste: litros * precio, consumo, precio, fromHistory: avgConsumption(expenses) != null && lastFuelPrice(expenses) != null };
}

/* ---------------- Helpers de periodo (Hoy / Semana / Mes / Año) ---------------- */
const PERIODS = [
  { key: "today",   label: "Hoy" },
  { key: "week",    label: "Semana" },
  { key: "month",   label: "Mes" },
  { key: "quarter", label: "Trim." },
  { key: "year",    label: "Año" },
  { key: "all",     label: "Todo" },
];
function periodRange(periodKey, now = new Date()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  if (periodKey === "today") return { start, end };
  if (periodKey === "week") {
    const day = (start.getDay() + 6) % 7; // lunes=0
    start.setDate(start.getDate() - day);
    return { start, end };
  }
  if (periodKey === "month") return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
  if (periodKey === "quarter") { const q = Math.floor(now.getMonth() / 3); return { start: new Date(now.getFullYear(), q * 3, 1), end }; }
  if (periodKey === "year")    return { start: new Date(now.getFullYear(), 0, 1), end };
  return { start: new Date(0), end };
}
function inPeriod(iso, periodKey) {
  if (periodKey === "all") return true;
  if (!iso) return false;
  const d = new Date(iso);
  const { start, end } = periodRange(periodKey);
  return d >= start && d <= end;
}

/* ---------------- Paleta (light + dark) ---------------- */
const themes = {
  light: {
    bg: "#f1f5f9", surface: "#ffffff", surfaceAlt: "#f8fafc",
    border: "#e2e8f0", text: "#0f172a", textMuted: "#64748b", textLight: "#94a3b8",
    primary: "#2563eb", primaryDark: "#1d4ed8", primaryBg: "#eff6ff",
    success: "#059669", successBg: "#ecfdf5",
    warning: "#f59e0b", warningBg: "#fffbeb",
    danger: "#dc2626", dangerBg: "#fef2f2",
    info: "#0891b2", infoBg: "#ecfeff",
    shadow: "0 1px 3px rgba(15,23,42,0.08)",
    shadowLg: "0 -4px 16px rgba(15,23,42,0.08)",
    shadowCard: "0 2px 8px rgba(15,23,42,0.06)",
    gradient: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
    gradientSuccess: "linear-gradient(135deg, #059669 0%, #047857 100%)",
  },
  dark: {
    bg: "#0f172a", surface: "#1e293b", surfaceAlt: "#0f172a",
    border: "#334155", text: "#f1f5f9", textMuted: "#94a3b8", textLight: "#64748b",
    primary: "#60a5fa", primaryDark: "#3b82f6", primaryBg: "#1e3a8a",
    success: "#34d399", successBg: "#064e3b",
    warning: "#fbbf24", warningBg: "#78350f",
    danger: "#f87171", dangerBg: "#7f1d1d",
    info: "#22d3ee", infoBg: "#164e63",
    shadow: "0 1px 3px rgba(0,0,0,0.3)",
    shadowLg: "0 -4px 16px rgba(0,0,0,0.4)",
    shadowCard: "0 2px 8px rgba(0,0,0,0.25)",
    gradient: "linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)",
    gradientSuccess: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
  },
};

/* Helper para generar los estilos a partir del tema activo */
function makeStyles(C) {
  return {
    app: { minHeight: "100vh", background: C.bg, color: C.text, paddingBottom: 180, transition: "background 0.3s" },
    container: { maxWidth: 480, margin: "0 auto" },
    header: { padding: "18px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, background: C.bg, zIndex: 10 },
    h1: { fontSize: 22, fontWeight: 700, margin: 0, flex: 1, color: C.text },
    card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, margin: "12px 16px", boxShadow: C.shadowCard },
    btn: (bg, h = 64) => ({ width: "100%", padding: 16, fontSize: 15, fontWeight: 700, border: "none", borderRadius: 12, color: "white", background: bg, cursor: "pointer", minHeight: h, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 2px 8px rgba(37,99,235,0.25)" }),
    btnGradient: (h = 64) => ({ width: "100%", padding: 16, fontSize: 15, fontWeight: 700, border: "none", borderRadius: 12, color: "white", background: C.gradient, cursor: "pointer", minHeight: h, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 14px rgba(37,99,235,0.35)" }),
    thumb: { position: "fixed", bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, padding: 12, zIndex: 50, paddingBottom: "calc(12px + env(safe-area-inset-bottom))", boxShadow: C.shadowLg },
    thumbAbove: { position: "fixed", bottom: "calc(64px + env(safe-area-inset-bottom))", left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, padding: 12, zIndex: 49, boxShadow: C.shadowLg },
    thumbInner: { maxWidth: 480, margin: "0 auto", display: "flex", gap: 8, width: "100%" },
    tabBar: { position: "fixed", bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 50, paddingBottom: "env(safe-area-inset-bottom)", boxShadow: C.shadowLg },
    tabInner: { maxWidth: 480, margin: "0 auto", display: "flex", width: "100%" },
    tab: (a) => ({ flex: 1, padding: "14px 4px", background: "none", border: "none", color: a ? C.primary : C.textMuted, fontSize: 11, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", fontWeight: 600 }),
    input: { width: "100%", padding: 14, fontSize: 16, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, marginBottom: 10, outline: "none" },
    label: { fontSize: 13, color: C.textMuted, display: "block", marginTop: 8, marginBottom: 4, fontWeight: 600 },
    stat: { display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}`, fontSize: 14, color: C.text },
    badge: (bg, color) => ({ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: bg, color }),
  };
}

/* ---------------- Splash Screen ---------------- */
function Splash({ C, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1900);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <>
      <style>{`
        @keyframes driveIn { 0%{transform:translateX(-140%);opacity:0} 45%{transform:translateX(0);opacity:1} 100%{transform:translateX(0);opacity:1} }
        @keyframes textIn { 0%{opacity:0;transform:translateY(12px) scale(.94)} 100%{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes tagIn { 0%,60%{opacity:0} 100%{opacity:1} }
        @keyframes fadeOutAll { 0%,78%{opacity:1} 100%{opacity:0} }
        @keyframes roadDash { from{background-position:0 0} to{background-position:60px 0} }
        @keyframes wheelSpin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
      `}</style>
      <div onClick={onDone} style={{ position: "fixed", inset: 0, background: C.gradient, zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "fadeOutAll 1.9s forwards", cursor: "pointer" }}>
        <div style={{ position: "relative", width: 260, height: 120, animation: "driveIn 1.2s cubic-bezier(.2,.8,.2,1) forwards" }}>
          <svg viewBox="0 0 260 120" width="260" height="120" style={{ overflow: "visible" }}>
            {/* Caja del camión */}
            <rect x="60" y="30" width="130" height="55" rx="6" fill="#ffffff" stroke="rgba(255,255,255,0.9)" />
            <rect x="68" y="38" width="16" height="16" rx="2" fill={C.primary} opacity="0.25" />
            <rect x="90" y="38" width="16" height="16" rx="2" fill={C.primary} opacity="0.25" />
            {/* Cabina */}
            <path d="M190 40 L220 40 L235 58 L235 85 L190 85 Z" fill="#ffffff" />
            <rect x="200" y="48" width="22" height="18" rx="2" fill={C.primary} opacity="0.5" />
            {/* Ruedas con giro */}
            <g style={{ transformOrigin: "95px 90px", animation: "wheelSpin 0.5s linear infinite" }}>
              <circle cx="95" cy="90" r="13" fill="#0f172a" />
              <circle cx="95" cy="90" r="5" fill="#64748b" />
            </g>
            <g style={{ transformOrigin: "155px 90px", animation: "wheelSpin 0.5s linear infinite" }}>
              <circle cx="155" cy="90" r="13" fill="#0f172a" />
              <circle cx="155" cy="90" r="5" fill="#64748b" />
            </g>
            <g style={{ transformOrigin: "215px 90px", animation: "wheelSpin 0.5s linear infinite" }}>
              <circle cx="215" cy="90" r="13" fill="#0f172a" />
              <circle cx="215" cy="90" r="5" fill="#64748b" />
            </g>
          </svg>
          {/* Carretera */}
          <div style={{ position: "absolute", bottom: -2, left: -40, right: -40, height: 4, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5) 20%, rgba(255,255,255,0.5) 80%, transparent)" }} />
          <div style={{ position: "absolute", bottom: -10, left: -40, right: -40, height: 2, backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,.8) 0 20px, transparent 20px 40px)", animation: "roadDash 0.4s linear infinite" }} />
        </div>
        <div style={{ marginTop: 32, color: "white", fontSize: 44, fontWeight: 800, letterSpacing: -1, animation: "textIn 0.6s 0.6s backwards" }}>
          Trucker<span style={{ opacity: 0.75 }}>Pro</span>
        </div>
        <div style={{ marginTop: 6, color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 500, letterSpacing: 1, animation: "tagIn 1.4s backwards" }}>
          rutas · gastos · facturación
        </div>
        <div style={{ position: "absolute", bottom: 40, color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 500, letterSpacing: 0.5, animation: "tagIn 1.4s backwards" }}>
          toca para continuar
        </div>
      </div>
    </>
  );
}

/* ---------------- Common: Header, Confirm ---------------- */
function Header({ C, S, title, onBack, action }) {
  return (
    <div style={S.header}>
      {onBack && <button onClick={() => { haptic(); onBack(); }} style={{ background: "none", border: "none", color: C.text, cursor: "pointer", padding: 4 }}><ArrowLeft size={26} /></button>}
      <Truck color={C.primary} size={28} />
      <h1 style={S.h1}>{title}</h1>
      {action}
    </div>
  );
}

function Confirm({ C, S, msg, onYes, onNo }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: C.surface, borderRadius: 16, padding: 22, maxWidth: 360, width: "100%", boxShadow: "0 20px 50px rgba(15,23,42,0.35)" }}>
        <div style={{ fontSize: 16, marginBottom: 18, color: C.text }}>{msg}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onNo} style={S.btn("#94a3b8", 52)}>Cancelar</button>
          <button onClick={onYes} style={S.btn(C.danger, 52)}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Texto resaltado (autocompletado) ---------------- */
function Highlight({ text, query, color }) {
  if (!query) return <>{text}</>;
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color, fontWeight: 700, textDecoration: "underline" }}>{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  );
}

/* ---------------- AutoInput con resaltado ---------------- */
function AutoInput({ C, S, value, onChange, suggestions, placeholder, type = "text" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const filtered = useMemo(() => {
    const v = (value || "").toLowerCase().trim();
    if (!v) return suggestions.slice(0, 8);
    // Prioriza los que empiezan por la query
    const starts = suggestions.filter(s => s.toLowerCase().startsWith(v));
    const contains = suggestions.filter(s => !s.toLowerCase().startsWith(v) && s.toLowerCase().includes(v));
    return [...starts, ...contains].slice(0, 8);
  }, [value, suggestions]);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("touchstart", h);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h); };
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", marginBottom: 10 }}>
      <input style={{ ...S.input, marginBottom: 0 }} type={type} value={value || ""} placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }} />
      {open && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 8px 20px rgba(15,23,42,0.18)", zIndex: 20, marginTop: 4, maxHeight: 240, overflowY: "auto" }}>
          {filtered.map((s, i) => (
            <div key={i} onMouseDown={() => { haptic(5); onChange(s); setOpen(false); }}
              style={{ padding: "12px 14px", cursor: "pointer", fontSize: 14, borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : "none", color: C.text }}>
              <Highlight text={s} query={value} color={C.primary} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Estado de cobro (helpers) ---------------- */
function PeriodChips({ C, value, onChange, options = PERIODS }) {
  return (
    <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 6 }}>
      {options.map(p => (
        <button key={p.key} onClick={() => { haptic(5); onChange(p.key); }}
          style={{ padding: "7px 14px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
            background: value === p.key ? C.primary : C.surfaceAlt,
            color: value === p.key ? "white" : C.text,
            border: `1px solid ${value === p.key ? C.primary : C.border}`,
            borderRadius: 20, cursor: "pointer" }}>{p.label}</button>
      ))}
    </div>
  );
}

function invoiceStatus(inv, today, avisoDias = 7) {
  const pagado = (inv.pagos || []).reduce((s, p) => s + Number(p.importe || 0), 0);
  const total = Number(inv.total || 0);
  if (pagado >= total - 0.005) return { estado: "paid", pagado, pendiente: 0, diasRestantes: null };
  const diff = inv.vencimiento ? diffDays(inv.vencimiento, today) : null;
  if (diff !== null && diff < 0) return { estado: "overdue", pagado, pendiente: total - pagado, diasRestantes: diff };
  if (pagado > 0) return { estado: "partial", pagado, pendiente: total - pagado, diasRestantes: diff };
  if (diff !== null && diff <= avisoDias) return { estado: "due_soon", pagado, pendiente: total - pagado, diasRestantes: diff };
  return { estado: "pending", pagado, pendiente: total - pagado, diasRestantes: diff };
}

function PaymentBadge({ C, S, estado, diasRestantes }) {
  const map = {
    paid: { bg: C.successBg, color: C.success, icon: <CheckCircle2 size={12} />, label: "Cobrada" },
    partial: { bg: C.warningBg, color: C.warning, icon: <CircleDollarSign size={12} />, label: "Parcial" },
    overdue: { bg: C.dangerBg, color: C.danger, icon: <AlertTriangle size={12} />, label: `Vencida ${Math.abs(diasRestantes)}d` },
    due_soon: { bg: C.warningBg, color: C.warning, icon: <Clock size={12} />, label: `Vence ${diasRestantes}d` },
    pending: { bg: C.infoBg, color: C.info, icon: <Clock size={12} />, label: diasRestantes != null ? `Pendiente ${diasRestantes}d` : "Pendiente" },
  };
  const c = map[estado] || map.pending;
  return <span style={S.badge(c.bg, c.color)}>{c.icon}{c.label}</span>;
}

/* ---------------- Generación de PDF (igual que antes, intacto) ---------------- */
function generateInvoicePDF(invoice, settings, client, lines) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 14;

  doc.setFont("helvetica", "bold").setFontSize(14);
  doc.text((settings.nombre || "EMISOR").toUpperCase(), M, 20);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(settings.nif || "", M, 26);
  doc.text(settings.direccion || "", M, 31);
  doc.text(`${settings.cp || ""}  ${(settings.ciudad || "").toUpperCase()}`, M, 36);
  if (settings.telefono) doc.text(settings.telefono, M, 41);

  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text("Dirección de Envío:", 120, 26);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text((client.razon || "").toUpperCase(), 120, 31);
  doc.text(`C.I.F ${client.nif || ""}`, 120, 36);
  doc.text(client.direccion || "", 120, 41);
  doc.text(`${client.cp || ""} ${(client.ciudad || "").toUpperCase()}`, 120, 46);

  const boxY = 48, boxH = 22, boxW = 100;
  doc.setLineWidth(0.4).rect(M, boxY, boxW, boxH);
  doc.setLineWidth(0.2);
  doc.line(M, boxY + 5.5, M + boxW, boxY + 5.5);
  doc.line(M, boxY + 11, M + boxW, boxY + 11);
  doc.line(M, boxY + 16.5, M + boxW, boxY + 16.5);
  doc.setFont("helvetica", "bold").setFontSize(9);
  doc.text("FACTURA", M + 2, boxY + 4);
  doc.text("FECHA", M + 2, boxY + 9.5);
  doc.text("VENCIMIENTO", M + 2, boxY + 15);
  doc.text("FORMA DE PAGO", M + 2, boxY + 20.5);
  doc.setFont("helvetica", "normal");
  doc.text(invoice.numero, M + 32, boxY + 4);
  doc.text(fmtDate(invoice.fecha), M + 32, boxY + 9.5);
  if (invoice.vencimiento) doc.text(fmtDate(invoice.vencimiento), M + 32, boxY + 15);

  doc.setFontSize(9).text("pag. 1", pageW - M, boxY + boxH + 4, { align: "right" });

  const cliY = boxY + boxH + 6;
  doc.setFont("helvetica", "bold").setFontSize(9);
  doc.text("DATOS DEL CLIENTE :", M, cliY);
  doc.setFont("helvetica", "normal");
  doc.text(`C.I.F ${client.nif || ""}`, M, cliY + 5);
  doc.text((client.razon || "").toUpperCase(), M + 40, cliY + 5);
  doc.text(client.direccion || "", M, cliY + 10);
  doc.text(`${client.cp || ""} ${(client.ciudad || "").toUpperCase()}`, M, cliY + 15);

  autoTable(doc, {
    startY: cliY + 20,
    head: [["FECHA", "EXPED.", "ORIGEN/ DESTINO", "TRACTORA", "REMOLQUE", "IMPORTE"]],
    body: lines.map(l => [
      fmtShort(l.fecha || invoice.fecha),
      l.expediente || "",
      `${(l.origen || "").toUpperCase()} → ${(l.destino || "").toUpperCase()}`,
      l.tractora || settings.tractora || "",
      l.remolque || settings.remolque || "",
      Number(l.precio).toFixed(0),
    ]),
    theme: "grid",
    headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: "bold", fontSize: 9, lineWidth: 0.3, lineColor: [0, 0, 0], halign: "left" },
    bodyStyles: { fontSize: 9, lineWidth: 0.2, lineColor: [0, 0, 0], minCellHeight: 6 },
    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 18 }, 2: { cellWidth: 70 }, 3: { cellWidth: 25 }, 4: { cellWidth: 25 }, 5: { cellWidth: 24, halign: "right" } },
    margin: { left: M, right: M },
  });

  const finalY = doc.lastAutoTable.finalY;
  const tableBottomY = 200;
  if (finalY < tableBottomY) {
    doc.setLineWidth(0.3);
    const xs = [M, M + 20, M + 38, M + 108, M + 133, M + 158, M + 182];
    xs.forEach(x => doc.line(x, finalY, x, tableBottomY));
    doc.line(M, tableBottomY, M + 182, tableBottomY);
  }

  const bottomY = tableBottomY + 6;
  doc.setFont("helvetica", "bold").setFontSize(9);
  doc.text("Forma de Pago:", M, bottomY);
  doc.setFont("helvetica", "normal");
  doc.text(` ${settings.iban || settings.formaPago || ""}`, M + 26, bottomY);
  doc.setFont("helvetica", "bold");
  doc.text("Observaciones:", M, bottomY + 5);
  doc.setFont("helvetica", "normal");
  doc.text(` ${settings.observaciones || ""}`, M + 26, bottomY + 5);

  const totalX = 120, valueX = pageW - M;
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text("SUMA IMPORTES", totalX, bottomY);
  doc.setLineWidth(0.3).rect(valueX - 22, bottomY - 4, 22, 6);
  doc.text(eurShort(invoice.base), valueX - 2, bottomY, { align: "right" });

  doc.text("DESCUENTO", totalX, bottomY + 7);

  doc.setLineWidth(0.5).rect(valueX - 22, bottomY + 10, 22, 6);
  doc.text("BASE IMPONIBLE", totalX, bottomY + 14);
  doc.text(eurShort(invoice.base), valueX - 2, bottomY + 14, { align: "right" });

  doc.setLineWidth(0.2);
  doc.setFont("helvetica", "bold").setFontSize(9);
  doc.text("I.R.P.F", totalX, bottomY + 21);
  doc.setFont("helvetica", "normal");
  doc.text(`${invoice.irpfPct}%`, totalX + 22, bottomY + 21);
  doc.text(eur(invoice.irpfImporte), valueX - 2, bottomY + 21, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.text("I.V.A.", totalX, bottomY + 27);
  doc.setFont("helvetica", "normal");
  doc.text(`${invoice.ivaPct}%`, totalX + 22, bottomY + 27);
  doc.text(eur(invoice.cuota), valueX - 2, bottomY + 27, { align: "right" });

  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text("TOTAL FACTURA", totalX, bottomY + 35);
  doc.text(eurShort(invoice.total), valueX - 2, bottomY + 35, { align: "right" });

  doc.setFont("helvetica", "normal").setFontSize(7);
  if (settings.registro) doc.text(settings.registro, M, pageH - 15);
  doc.setFontSize(6).setTextColor(120);
  doc.text(`VeriFactu hash: ${invoice.hash}`, M, pageH - 8);

  doc.save(`Factura_${invoice.numero.replace(/\//g, "-")}.pdf`);
}

/* ================================================================
   APP PRINCIPAL
   ================================================================ */
export default function App() {
  const [ready, setReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [tema, setTema] = useState("light");
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
  const [viewingInvoiceId, setViewingInvoiceId] = useState(null);
  const [paymentForInvoiceId, setPaymentForInvoiceId] = useState(null);
  const [toast, setToast] = useState(null);

  const C = themes[tema];
  const S = useMemo(() => makeStyles(C), [C]);

  useEffect(() => {
    (async () => {
      await dataApi.init();
      const s = await dataApi.getSettings();
      setSettings(s);
      setTema(s.tema || "light");

      // Migración: vincular rutas huérfanas (con `cliente` texto pero sin clientId)
      const allRoutes = await dataApi.getAll("routes");
      const allClients = await dataApi.getAll("clients");
      let migrated = 0;
      for (const r of allRoutes) {
        if (!r.clientId && r.cliente && r.cliente.trim()) {
          const name = r.cliente.trim().toLowerCase();
          let cli = allClients.find(c => (c.razon || "").trim().toLowerCase() === name);
          if (!cli) {
            cli = await dataApi.put("clients", { razon: r.cliente.trim(), nif: "", direccion: "", cp: "", ciudad: "" });
            allClients.push(cli);
          }
          await dataApi.put("routes", { ...r, clientId: cli.id });
          migrated++;
        }
      }

      setRoutes(await dataApi.getAll("routes"));
      setExpenses(await dataApi.getAll("expenses"));
      setInvoices(await dataApi.getAll("invoices"));
      setClients(await dataApi.getAll("clients"));
      setReady(true);
      if (migrated > 0) setTimeout(() => setToast(`${migrated} ruta${migrated > 1 ? "s" : ""} vinculada${migrated > 1 ? "s" : ""} a cliente`), 2100);
    })();
  }, []);

  useEffect(() => {
    document.body.style.background = C.bg;
    document.body.style.color = C.text;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", C.bg);
  }, [C]);

  const reload = useCallback(async () => {
    setRoutes(await dataApi.getAll("routes"));
    setExpenses(await dataApi.getAll("expenses"));
    setInvoices(await dataApi.getAll("invoices"));
    setClients(await dataApi.getAll("clients"));
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const suggestions = useMemo(() => ({
    origenes: [...new Set(routes.map(r => r.origen).filter(Boolean))].sort(),
    destinos: [...new Set(routes.map(r => r.destino).filter(Boolean))].sort(),
    expedientes: [...new Set(routes.map(r => r.expediente).filter(Boolean))].sort(),
    clientesNombres: [...new Set(routes.map(r => r.cliente).filter(Boolean))].sort(),
  }), [routes]);

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

  const hoy = new Date().toISOString();
  const cobrosResumen = useMemo(() => {
    let pendiente = 0, vencido = 0, cobradoMes = 0, numPendientes = 0, numVencidas = 0;
    const now = new Date();
    for (const inv of invoices) {
      const st = invoiceStatus(inv, hoy, settings?.avisoVencimiento || 7);
      if (st.estado === "paid") {
        for (const p of inv.pagos || []) {
          const d = new Date(p.fecha);
          if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) cobradoMes += Number(p.importe);
        }
      } else {
        pendiente += st.pendiente;
        numPendientes++;
        if (st.estado === "overdue") { vencido += st.pendiente; numVencidas++; }
      }
    }
    return { pendiente, vencido, cobradoMes, numPendientes, numVencidas };
  }, [invoices, hoy, settings]);

  /* -------- Acciones -------- */
  // Garantiza que toda ruta quede vinculada a un cliente real (crea uno si hace falta)
  const ensureClientId = useCallback(async (data) => {
    if (data.clientId) return data.clientId;
    const name = (data.cliente || "").trim();
    if (!name) return null;
    const existing = clients.find(c => (c.razon || "").trim().toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    const created = await dataApi.put("clients", { razon: name, nif: "", direccion: "", cp: "", ciudad: "" });
    setClients(cs => [...cs, created]);
    return created.id;
  }, [clients]);

  const startRoute = async (data) => {
    haptic();
    const clientId = await ensureClientId(data);
    const cliente = clients.find(c => c.id === clientId)?.razon || data.cliente || "";
    await dataApi.put("routes", { ...data, clientId, cliente, precio: Number(data.precio), km: Number(data.km || 0), peso: Number(data.peso || 0), estado: "delivered", fecha: data.fecha || new Date().toISOString(), inicio: new Date().toISOString() });
    await reload(); setScreen("home"); showToast("Ruta registrada");
  };
  const updateRoute = async (data) => {
    const clientId = await ensureClientId(data);
    const cliente = clients.find(c => c.id === clientId)?.razon || data.cliente || "";
    await dataApi.put("routes", { ...editing, ...data, clientId, cliente, precio: Number(data.precio), km: Number(data.km || 0), peso: Number(data.peso || 0) });
    setEditing(null); await reload(); setScreen("routesList");
  };
  const removeRoute = async (id) => { await dataApi.remove("routes", id); await reload(); setConfirm(null); };
  const addExpense = async (data) => {
    haptic();
    // routeId puede venir explícito (gasto general) o tomarse de la ruta activa
    const routeId = data.routeId !== undefined ? data.routeId : (active?.id || null);
    await dataApi.put("expenses", {
      routeId,
      fecha: data.fecha || new Date().toISOString(),
      tipo: data.tipo,
      importe: Number(data.importe),
      litros: data.litros ? Number(data.litros) : null,
      km: data.km ? Number(data.km) : null,
      motivo: data.motivo || "",
    });
    await reload(); setModal(null); showToast("Gasto guardado");
  };
  const removeExpense = async (id) => { await dataApi.remove("expenses", id); await reload(); setConfirm(null); };
  const saveClient = async (data) => { await dataApi.put("clients", { ...editingClient, ...data }); setEditingClient(null); await reload(); setScreen("clients"); };
  const removeClient = async (id) => { await dataApi.remove("clients", id); await reload(); setConfirm(null); };
  const saveSettings = async (s) => { const saved = await dataApi.saveSettings(s); setSettings(saved); setTema(saved.tema || "light"); setScreen("home"); showToast("Ajustes guardados"); };

  const emitInvoice = async (clientId, routeIds) => {
    haptic(20);
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
    const vencimiento = addDays(fecha, settings.diasVencimiento || 60);
    const sorted = [...invoices].sort((a, b) => a.numero.localeCompare(b.numero));
    const prevHash = sorted.length ? sorted[sorted.length - 1].hash : "0".repeat(64);
    const payload = `${numero}|${fecha.slice(0, 10)}|${settings.nif}|${client.nif}|${base}|${cuota}|${total}|${prevHash}`;
    const hash = await dataApi.sha256(payload);
    const inv = await dataApi.put("invoices", {
      numero, fecha, vencimiento, clientId, lineRouteIds: routeIds,
      base, irpfPct, irpfImporte, ivaPct, cuota, total,
      hashAnterior: prevHash, hash, estado: "issued", inmutable: true,
      pagos: [],
    });
    for (const r of lines) await dataApi.put("routes", { ...r, estado: "invoiced", invoiceId: inv.id });
    await reload();
    setInvoiceClientId(null);
    setScreen("invoices");
    showToast("Factura emitida");
    generateInvoicePDF(inv, settings, client, lines);
  };

  const downloadInvoice = (inv) => {
    const client = clients.find(c => c.id === inv.clientId);
    const lines = routes.filter(r => inv.lineRouteIds?.includes(r.id));
    if (client && lines.length) generateInvoicePDF(inv, settings, client, lines);
  };

  const registerPayment = async (invoiceId, pago) => {
    haptic(15);
    const inv = invoices.find(i => i.id === invoiceId);
    const pagos = [...(inv.pagos || []), { id: dataApi.uid(), ...pago, importe: Number(pago.importe) }];
    await dataApi.put("invoices", { ...inv, pagos });
    setPaymentForInvoiceId(null);
    await reload();
    showToast("Cobro registrado");
  };

  const deletePayment = async (invoiceId, pagoId) => {
    const inv = invoices.find(i => i.id === invoiceId);
    const pagos = (inv.pagos || []).filter(p => p.id !== pagoId);
    await dataApi.put("invoices", { ...inv, pagos });
    await reload();
    setConfirm(null);
  };

  const handleExport = async () => {
    const data = await dataApi.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `truckerpro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    showToast("Backup descargado");
  };
  const handleImport = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        setConfirm({
          msg: `Restaurar backup de ${data.exportedAt?.slice(0, 10) || "?"}. Se reemplazarán TODOS los datos actuales. ¿Confirmar?`,
          onYes: async () => { await dataApi.importAll(data); await reload(); const s = await dataApi.getSettings(); setSettings(s); setTema(s.tema || "light"); setConfirm(null); showToast("Backup restaurado"); }
        });
      } catch {
        showToast("Fichero inválido");
      }
    };
    reader.readAsText(file);
  };

  if (!ready) {
    return (
      <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {showSplash && <Splash C={C} onDone={() => setShowSplash(false)} />}
      </div>
    );
  }

  const viewingInvoice = invoices.find(i => i.id === viewingInvoiceId);

  return (
    <div style={S.app}>
      {showSplash && <Splash C={C} onDone={() => setShowSplash(false)} />}

      <div style={S.container}>
        {screen === "home" && <HomeScreen C={C} S={S} invoices={invoices} routes={routes} expenses={expenses} consumoMedio={consumoMedio} active={active} cobros={cobrosResumen} onNew={() => setScreen("new")} onActive={() => setScreen("active")} onRoutes={() => setScreen("routesList")} onCobros={() => setScreen("cobros")} onStats={() => setScreen("stats")} onExpenses={() => setScreen("expenses")} />}
        {screen === "new" && <RouteForm C={C} S={S} clients={clients} settings={settings} suggestions={suggestions} expenses={expenses} onCancel={() => setScreen("home")} onSubmit={startRoute} />}
        {screen === "editRoute" && <RouteForm C={C} S={S} clients={clients} settings={settings} suggestions={suggestions} expenses={expenses} initial={editing} editing onCancel={() => { setEditing(null); setScreen("routesList"); }} onSubmit={updateRoute} />}
        {screen === "routesList" && <RoutesListScreen C={C} S={S} routes={routes} clients={clients} onBack={() => setScreen("home")} onEdit={(r) => { setEditing(r); setScreen("editRoute"); }} onDelete={(id) => setConfirm({ msg: "¿Eliminar esta ruta?", onYes: () => removeRoute(id) })} />}
        {screen === "active" && <ActiveScreen C={C} S={S} route={active} expenses={expensesOf(active?.id)} totals={totals(active)} margenAlerta={settings.margenAlerta} fuelEstimate={active?.km > 0 ? estimateFuelCost(active.km, expenses, settings) : null} onBack={() => setScreen("home")} onAddFuel={() => setModal("fuel")} onAddExpense={() => setModal("expense")} onDeleteExpense={(id) => setConfirm({ msg: "¿Eliminar este gasto?", onYes: () => removeExpense(id) })} />}
        {screen === "invoices" && <InvoicesScreen C={C} S={S} invoices={invoices} clients={clients} settings={settings} hoy={hoy} onNew={() => setScreen("invoiceClient")} onOpen={(id) => { setViewingInvoiceId(id); setScreen("invoiceDetail"); }} />}
        {screen === "invoiceDetail" && viewingInvoice && <InvoiceDetailScreen C={C} S={S} invoice={viewingInvoice} client={clients.find(c => c.id === viewingInvoice.clientId)} routes={routes.filter(r => viewingInvoice.lineRouteIds?.includes(r.id))} settings={settings} hoy={hoy} onBack={() => { setViewingInvoiceId(null); setScreen("invoices"); }} onDownload={() => downloadInvoice(viewingInvoice)} onRegisterPayment={() => setPaymentForInvoiceId(viewingInvoice.id)} onDeletePayment={(pid) => setConfirm({ msg: "¿Eliminar este cobro?", onYes: () => deletePayment(viewingInvoice.id, pid) })} />}
        {screen === "invoiceClient" && <PickClientScreen C={C} S={S} clients={clients} routes={routes} onBack={() => setScreen("invoices")} onPick={(id) => { setInvoiceClientId(id); setScreen("invoiceLines"); }} />}
        {screen === "invoiceLines" && <PickLinesScreen C={C} S={S} client={clients.find(c => c.id === invoiceClientId)} routes={routes.filter(r => r.clientId === invoiceClientId && r.estado !== "invoiced")} settings={settings} onBack={() => setScreen("invoiceClient")} onEmit={(routeIds) => emitInvoice(invoiceClientId, routeIds)} />}
        {screen === "cobros" && <CobrosScreen C={C} S={S} invoices={invoices} clients={clients} settings={settings} hoy={hoy} onBack={() => setScreen("home")} onOpen={(id) => { setViewingInvoiceId(id); setScreen("invoiceDetail"); }} onRegisterPayment={(id) => setPaymentForInvoiceId(id)} />}
        {screen === "expenses" && <ExpensesScreen C={C} S={S} expenses={expenses} routes={routes} settings={settings} onBack={() => setScreen("home")} onAdd={() => setModal("global-expense")} onDelete={(id) => setConfirm({ msg: "¿Eliminar este gasto?", onYes: () => removeExpense(id) })} onEdit={() => {}} />}
        {screen === "stats" && <StatsScreen C={C} S={S} invoices={invoices} expenses={expenses} routes={routes} onBack={() => setScreen("home")} />}
        {screen === "clients" && <ClientsScreen C={C} S={S} clients={clients} invoices={invoices} hoy={hoy} settings={settings} onBack={() => setScreen("settings")} onAdd={() => { setEditingClient({}); setScreen("editClient"); }} onEdit={(c) => { setEditingClient(c); setScreen("editClient"); }} onDelete={(id) => setConfirm({ msg: "¿Eliminar cliente?", onYes: () => removeClient(id) })} />}
        {screen === "editClient" && <ClientForm C={C} S={S} initial={editingClient} onCancel={() => { setEditingClient(null); setScreen("clients"); }} onSubmit={saveClient} />}
        {screen === "settings" && <SettingsScreen C={C} S={S} settings={settings} tema={tema} onSave={saveSettings} onClients={() => setScreen("clients")} onExport={handleExport} onImport={handleImport} onToggleTheme={async () => { const t = tema === "light" ? "dark" : "light"; const s = { ...settings, tema: t }; await dataApi.saveSettings(s); setSettings(s); setTema(t); }} />}
      </div>

      {modal && <ExpenseModal C={C} S={S} kind={modal === "global-expense" ? null : modal} routes={routes} defaultRouteId={modal === "global-expense" ? null : active?.id} onCancel={() => setModal(null)} onSave={addExpense} />}
      {paymentForInvoiceId && <PaymentModal C={C} S={S} invoice={invoices.find(i => i.id === paymentForInvoiceId)} onCancel={() => setPaymentForInvoiceId(null)} onSave={(p) => registerPayment(paymentForInvoiceId, p)} />}
      {confirm && <Confirm C={C} S={S} msg={confirm.msg} onYes={confirm.onYes} onNo={() => setConfirm(null)} />}
      {toast && (
        <div style={{ position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)", background: C.text, color: C.surface, padding: "10px 18px", borderRadius: 24, fontSize: 14, fontWeight: 600, zIndex: 300, boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }}>{toast}</div>
      )}
      {["home", "invoices", "cobros", "expenses", "settings"].includes(screen) && (
        <div style={S.tabBar}>
          <div style={S.tabInner}>
            <button style={S.tab(screen === "home")} onClick={() => setScreen("home")}><HomeIcon size={20} /><span style={{ fontSize: 10 }}>Inicio</span></button>
            <button style={S.tab(screen === "invoices")} onClick={() => setScreen("invoices")}><FileText size={20} /><span style={{ fontSize: 10 }}>Facturas</span></button>
            <button style={S.tab(screen === "cobros")} onClick={() => setScreen("cobros")}><CreditCard size={20} /><span style={{ fontSize: 10 }}>Cobros</span></button>
            <button style={S.tab(screen === "expenses")} onClick={() => setScreen("expenses")}><Receipt size={20} /><span style={{ fontSize: 10 }}>Gastos</span></button>
            <button style={S.tab(screen === "settings")} onClick={() => setScreen("settings")}><SettingsIcon size={20} /><span style={{ fontSize: 10 }}>Ajustes</span></button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   PANTALLAS
   ================================================================ */

function HomeScreen({ C, S, invoices, routes, expenses, consumoMedio, active, cobros, onNew, onActive, onRoutes, onCobros, onStats, onExpenses }) {
  const now = new Date();
  const mes = invoices.filter(i => { const d = new Date(i.fecha); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const ingresosMes = mes.reduce((s, i) => s + i.base, 0);
  const pendientesFact = routes.filter(r => r.estado !== "invoiced").length;
  // Gastos del mes (independientemente de si están atados a ruta o no)
  const gastosMes = expenses.filter(e => inPeriod(e.fecha, "month")).reduce((s, e) => s + Number(e.importe || 0), 0);
  const gastosHoy = expenses.filter(e => inPeriod(e.fecha, "today")).reduce((s, e) => s + Number(e.importe || 0), 0);
  const beneficioMes = ingresosMes - gastosMes;
  return (
    <>
      <Header C={C} S={S} title="TruckerPro" />

      {/* Tarjeta principal con gradiente */}
      <div style={{ ...S.card, background: C.gradient, color: "white", border: "none" }}>
        <div style={{ fontSize: 13, opacity: 0.85 }}>Ingresos este mes (base)</div>
        <div style={{ fontSize: 36, fontWeight: 800, marginTop: 4, letterSpacing: -0.5 }}>{eur(ingresosMes)}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 10, opacity: 0.95 }}>
          <span>{mes.length} facturas · {pendientesFact} pendientes facturar</span>
          <span><TrendingUp size={14} style={{ verticalAlign: "middle" }} /> {eur(cobros.cobradoMes)} cobrados</span>
        </div>
      </div>

      {/* Resumen P&L del mes: ingresos - gastos = beneficio */}
      <div style={{ ...S.card, cursor: "pointer" }} onClick={onExpenses}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>📊 Resultado del mes</div>
          {gastosHoy > 0 && <span style={S.badge(C.warningBg, C.warning)}>hoy {eur(gastosHoy)}</span>}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: beneficioMes >= 0 ? C.success : C.danger, letterSpacing: -0.5 }}>{eur(beneficioMes)}</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>beneficio</div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 8, color: C.textMuted }}>
          <span>Ingresos: <b style={{ color: C.success }}>{eur(ingresosMes)}</b></span>
          <span>Gastos: <b style={{ color: C.danger }}>-{eur(gastosMes)}</b></span>
        </div>
      </div>

      {/* Resumen de cobros (destacado si hay vencido) */}
      <div style={{ ...S.card, borderColor: cobros.vencido > 0 ? C.danger : C.border, borderWidth: cobros.vencido > 0 ? 2 : 1, cursor: "pointer" }} onClick={onCobros}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>💰 Cobros pendientes</div>
          {cobros.numVencidas > 0 && <span style={S.badge(C.dangerBg, C.danger)}><AlertTriangle size={12} />{cobros.numVencidas} vencida{cobros.numVencidas > 1 ? "s" : ""}</span>}
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, color: cobros.vencido > 0 ? C.danger : C.text }}>{eur(cobros.pendiente)}</div>
        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
          {cobros.numPendientes} factura{cobros.numPendientes !== 1 ? "s" : ""} por cobrar{cobros.vencido > 0 ? ` · ${eur(cobros.vencido)} vencido` : ""}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.stat}><span>Consumo medio</span><b>{consumoMedio ? `${consumoMedio} L/100km` : "—"}</b></div>
        <div style={{ ...S.stat, borderBottom: "none" }}><span>Rutas totales</span><b>{routes.length}</b></div>
      </div>

      {active && (
        <div style={{ ...S.card, borderColor: C.primary, borderWidth: 2 }}>
          <div style={{ fontSize: 12, color: C.primary, fontWeight: 700 }}>RUTA CON GASTOS ABIERTA</div>
          <div style={{ fontSize: 18, fontWeight: 700, margin: "8px 0", color: C.text }}>{active.origen} → {active.destino}</div>
          <button onClick={onActive} style={S.btn(C.primary, 52)}>Ver gastos</button>
        </div>
      )}

      <div style={{ ...S.card, display: "flex", gap: 8 }}>
        <button onClick={onRoutes} style={{ ...S.btn(C.primary, 52), background: C.surfaceAlt, color: C.text, boxShadow: "none", border: `1px solid ${C.border}`, fontSize: 13 }}>📋 Rutas</button>
        <button onClick={onStats} style={{ ...S.btn(C.primary, 52), background: C.surfaceAlt, color: C.text, boxShadow: "none", border: `1px solid ${C.border}`, fontSize: 13 }}><BarChart3 size={18} />Stats</button>
      </div>

      <div style={S.thumbAbove}><div style={S.thumbInner}>
        <button onClick={onNew} style={S.btnGradient()}><Plus size={24} />Registrar nueva ruta</button>
      </div></div>
    </>
  );
}

function RouteForm({ C, S, initial, clients, settings, suggestions, expenses, onCancel, onSubmit, editing }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState(initial ? { ...initial, fecha: (initial.fecha || initial.inicio || "").slice(0, 10) } : { fecha: today, clientId: "", cliente: "", origen: "", destino: "", expediente: "", km: "", peso: "", precio: "" });
  const [newClient, setNewClient] = useState(false);
  const valid = (f.clientId || (newClient && f.cliente)) && f.origen && f.destino && f.precio;
  // Estimación de combustible en vivo
  const fuelEst = useMemo(() => Number(f.km) > 0 ? estimateFuelCost(f.km, expenses || [], settings) : null, [f.km, expenses, settings]);
  // Margen estimado a partir de la previsión de combustible
  const margenEst = useMemo(() => {
    const p = Number(f.precio); if (!p || !fuelEst) return null;
    const ben = p - fuelEst.coste;
    return { coste: fuelEst.coste, ben, margen: (ben / p) * 100 };
  }, [f.precio, fuelEst]);
  return (
    <>
      <Header C={C} S={S} title={editing ? "Editar ruta" : "Nueva ruta"} onBack={onCancel} />
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
            <AutoInput C={C} S={S} value={f.cliente} onChange={v => setF({ ...f, cliente: v, clientId: "" })} suggestions={suggestions.clientesNombres} placeholder="Nombre del cliente" />
            <button onClick={() => setNewClient(false)} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 13, cursor: "pointer", marginBottom: 8 }}>← Elegir de la lista</button>
          </>
        )}
        <label style={S.label}>Origen</label>
        <AutoInput C={C} S={S} value={f.origen} onChange={v => setF({ ...f, origen: v })} suggestions={suggestions.origenes} placeholder="Origen" />
        <label style={S.label}>Destino</label>
        <AutoInput C={C} S={S} value={f.destino} onChange={v => setF({ ...f, destino: v })} suggestions={suggestions.destinos} placeholder="Destino" />
        <label style={S.label}>Expediente (opcional)</label>
        <AutoInput C={C} S={S} value={f.expediente} onChange={v => setF({ ...f, expediente: v })} suggestions={suggestions.expedientes} placeholder="Nº expediente" />
        <label style={S.label}>Precio acordado (€)</label><input style={S.input} type="number" inputMode="decimal" value={f.precio} onChange={e => setF({ ...f, precio: e.target.value })} />
        <label style={S.label}>Kilómetros (opcional)</label><input style={S.input} type="number" value={f.km} onChange={e => setF({ ...f, km: e.target.value })} />
        {fuelEst && (
          <div style={{ background: C.warningBg, border: `1px solid ${C.warning}`, padding: 12, borderRadius: 10, marginBottom: 10, marginTop: -2 }}>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
              <span>⛽ Coste combustible estimado</span>
              <b style={{ color: C.warning }}>{eur(fuelEst.coste)}</b>
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
              {fuelEst.litros.toFixed(1)} L · {fuelEst.consumo.toFixed(1)} L/100km × {fuelEst.precio.toFixed(3)} €/L
              {fuelEst.fromHistory ? " · de tu histórico" : " · valores en Ajustes"}
            </div>
            {margenEst && (
              <div style={{ fontSize: 11, color: margenEst.margen < (settings?.margenAlerta || 20) ? C.danger : C.success, marginTop: 4, fontWeight: 700 }}>
                Beneficio estimado solo combustible: {eur(margenEst.ben)} ({margenEst.margen.toFixed(1)}%)
              </div>
            )}
          </div>
        )}
        <label style={S.label}>Peso en t (opcional)</label><input style={S.input} type="number" value={f.peso} onChange={e => setF({ ...f, peso: e.target.value })} />
        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8 }}>Tractora: <b>{settings.tractora || "(en Ajustes)"}</b> · Remolque: <b>{settings.remolque || "(en Ajustes)"}</b></div>
      </div>
      <div style={S.thumb}><div style={S.thumbInner}>
        <button onClick={() => valid && onSubmit(f)} disabled={!valid} style={{ ...S.btn(valid ? C.success : "#cbd5e1"), opacity: valid ? 1 : 0.7 }}><CheckCircle size={24} />{editing ? "Guardar cambios" : "Registrar ruta"}</button>
      </div></div>
    </>
  );
}

function RoutesListScreen({ C, S, routes, clients, onBack, onEdit, onDelete }) {
  const [q, setQ] = useState("");
  const sorted = [...routes].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  const filtered = sorted.filter(r => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    const c = clients.find(cl => cl.id === r.clientId);
    return [r.origen, r.destino, r.expediente, c?.razon, r.cliente].filter(Boolean).some(v => v.toLowerCase().includes(s));
  });
  return (
    <>
      <Header C={C} S={S} title="Todas las rutas" onBack={onBack} />
      <div style={{ padding: "0 16px", marginTop: 8 }}>
        <div style={{ position: "relative" }}>
          <Search size={18} style={{ position: "absolute", left: 14, top: 16, color: C.textMuted }} />
          <input style={{ ...S.input, paddingLeft: 42 }} placeholder="Buscar por origen, destino, expediente…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      {filtered.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🚚</div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
            {routes.length === 0 ? "Aún no tienes rutas" : "Sin coincidencias"}
          </div>
          <div style={{ color: C.textMuted, fontSize: 13 }}>
            {routes.length === 0 ? "Vuelve a Inicio y pulsa “Registrar nueva ruta”." : "Prueba con otro término de búsqueda."}
          </div>
        </div>
      )}
      {filtered.map(r => {
        const c = clients.find(cl => cl.id === r.clientId);
        const fact = r.estado === "invoiced";
        return (
          <div key={r.id} style={{ ...S.card, opacity: fact ? 0.7 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><b style={{ color: C.text }}><Highlight text={`${r.origen} → ${r.destino}`} query={q} color={C.primary} /></b><span style={{ color: C.success, fontWeight: 700 }}>{eur(r.precio)}</span></div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}><Highlight text={c?.razon || r.cliente || ""} query={q} color={C.primary} /> · {fmtDate(r.fecha || r.inicio)}{r.expediente ? <> · Exp. <Highlight text={r.expediente} query={q} color={C.primary} /></> : ""}</div>
            <div style={{ marginTop: 8 }}>
              {fact
                ? <span style={S.badge(C.successBg, C.success)}><CheckCircle2 size={12} />Facturada</span>
                : <span style={S.badge(C.warningBg, C.warning)}><Clock size={12} />Pendiente de facturar</span>}
            </div>
            {!fact && <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => onEdit(r)} style={{ ...S.btn(C.primary, 40), fontSize: 13 }}><Edit3 size={16} />Editar</button>
              <button onClick={() => onDelete(r.id)} style={{ ...S.btn(C.danger, 40), fontSize: 13 }}><Trash2 size={16} />Borrar</button>
            </div>}
          </div>
        );
      })}
    </>
  );
}

function ActiveScreen({ C, S, route, expenses, totals, margenAlerta, fuelEstimate, onBack, onAddFuel, onAddExpense, onDeleteExpense }) {
  if (!route) return null;
  const { gastos, beneficio, margen } = totals;
  const color = margen < 20 ? C.danger : margen < 30 ? C.warning : C.success;
  return (
    <>
      <Header C={C} S={S} title="Gastos de ruta" onBack={onBack} />
      <div style={S.card}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{route.origen} → {route.destino}</div>
        <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>{route.cliente}{route.km ? ` · ${route.km} km` : ""}</div>
        {fuelEstimate && Number(route.km) > 0 && (
          <div style={{ marginTop: 10, padding: 10, background: C.warningBg, borderRadius: 8, fontSize: 12, color: C.text }}>
            💡 Estimación combustible: <b>{eur(fuelEstimate.coste)}</b> ({fuelEstimate.litros.toFixed(1)} L)
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{fuelEstimate.consumo.toFixed(1)} L/100km × {fuelEstimate.precio.toFixed(3)} €/L {fuelEstimate.fromHistory ? "(de tu histórico)" : "(valores por defecto)"}</div>
          </div>
        )}
      </div>
      <div style={{ ...S.card, borderColor: color, borderWidth: 2 }}>
        <div style={S.stat}><span>Precio flete</span><b>{eur(route.precio)}</b></div>
        <div style={S.stat}><span>Gastos</span><b style={{ color: C.danger }}>-{eur(gastos)}</b></div>
        <div style={S.stat}><span>Beneficio</span><b style={{ color }}>{eur(beneficio)}</b></div>
        <div style={{ ...S.stat, borderBottom: "none" }}><span>Margen</span><b style={{ color, fontSize: 22 }}>{margen.toFixed(1)}%</b></div>
        {margen < margenAlerta && <div style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, padding: 12, borderRadius: 8, marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle color={C.danger} size={20} /><span style={{ color: C.danger, fontSize: 13, fontWeight: 600 }}>Margen por debajo del {margenAlerta}%</span></div>}
      </div>
      <div style={S.card}>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 8, fontWeight: 600 }}>Gastos ({expenses.length})</div>
        {expenses.length === 0 && <div style={{ color: C.textLight, fontSize: 13 }}>Sin gastos</div>}
        {expenses.map(e => (
          <div key={e.id} style={{ ...S.stat, alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14 }}>{catLabel(e.tipo)}{e.litros ? ` · ${e.litros} L` : ""}</div>
              {e.motivo && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{e.motivo}</div>}
            </div>
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

function ExpenseModal({ C, S, kind, routes, defaultRouteId, onCancel, onSave }) {
  // kind can be "fuel" (force fuel category) or null (free choice)
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    tipo: kind === "fuel" ? "fuel" : "toll",
    importe: "",
    litros: "",
    km: "",
    motivo: "",
    fecha: today,
    routeId: defaultRouteId || "",
  });
  const cat = CAT_BY_KEY[f.tipo];
  const showFuelFields = f.tipo === "fuel";
  const valid = Number(f.importe) > 0;
  // Lista de rutas en orden inverso, máximo 30
  const recentRoutes = useMemo(() => [...(routes || [])].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")).slice(0, 30), [routes]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: C.surface, width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0", padding: 20, paddingBottom: "calc(20px + env(safe-area-inset-bottom))", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: C.text }}>{kind === "fuel" ? "⛽ Repostaje" : "🧾 Nuevo gasto"}</h2>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer" }}><X size={24} /></button>
        </div>

        {kind !== "fuel" && (
          <>
            <label style={S.label}>Categoría</label>
            <select style={S.input} value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>
              <optgroup label="Gastos de ruta">
                {CATEGORIES.filter(c => c.scope === "ruta").map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
              </optgroup>
              <optgroup label="Gastos generales">
                {CATEGORIES.filter(c => c.scope === "general").map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
              </optgroup>
              <optgroup label="Otros">
                {CATEGORIES.filter(c => c.scope === "ambos").map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
              </optgroup>
            </select>
          </>
        )}

        <label style={S.label}>Fecha</label>
        <input style={S.input} type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} />

        <label style={S.label}>Importe (€)</label>
        <input style={S.input} type="number" inputMode="decimal" value={f.importe} onChange={e => setF({ ...f, importe: e.target.value })} autoFocus />

        {showFuelFields && (
          <>
            <label style={S.label}>Litros</label>
            <input style={S.input} type="number" inputMode="decimal" value={f.litros} onChange={e => setF({ ...f, litros: e.target.value })} />
            <label style={S.label}>Km del odómetro</label>
            <input style={S.input} type="number" value={f.km} onChange={e => setF({ ...f, km: e.target.value })} />
            {Number(f.litros) > 0 && Number(f.importe) > 0 && (
              <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8, marginTop: -4 }}>
                💡 Precio: <b style={{ color: C.text }}>{(Number(f.importe) / Number(f.litros)).toFixed(3)} €/L</b>
              </div>
            )}
          </>
        )}

        <label style={S.label}>Motivo / Descripción {cat?.scope === "ruta" ? "(opcional)" : ""}</label>
        <input style={S.input} value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })}
          placeholder={f.tipo === "tires" ? "p.ej. ruedas traseras Continental" : f.tipo === "maintenance" ? "p.ej. cambio de aceite + filtros" : "Detalle del gasto"} />

        {!defaultRouteId && (
          <>
            <label style={S.label}>Asociar a ruta (opcional)</label>
            <select style={S.input} value={f.routeId} onChange={e => setF({ ...f, routeId: e.target.value })}>
              <option value="">— Gasto general (sin ruta) —</option>
              {recentRoutes.map(r => <option key={r.id} value={r.id}>{fmtShort(r.fecha || r.inicio)} · {r.origen} → {r.destino}</option>)}
            </select>
          </>
        )}

        <button onClick={() => valid && onSave({
          ...f,
          fecha: new Date(f.fecha).toISOString(),
          routeId: f.routeId || null,
        })} disabled={!valid} style={{ ...S.btn(valid ? C.success : "#cbd5e1", 56), marginTop: 8, opacity: valid ? 1 : 0.7 }}>
          <CheckCircle size={22} />Guardar gasto
        </button>
      </div>
    </div>
  );
}

/* -------- Cobros / pagos -------- */
function PaymentModal({ C, S, invoice, onCancel, onSave }) {
  const pagado = (invoice.pagos || []).reduce((s, p) => s + Number(p.importe), 0);
  const pendiente = +(Number(invoice.total) - pagado).toFixed(2);
  const [f, setF] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    importe: pendiente.toFixed(2),
    metodo: "transferencia",
    notas: "",
  });
  const valid = Number(f.importe) > 0;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: C.surface, width: "100%", maxWidth: 480, borderRadius: "20px 20px 0 0", padding: 20, paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: C.text }}>💰 Registrar cobro</h2>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer" }}><X size={24} /></button>
        </div>
        <div style={{ ...S.card, margin: "0 0 12px 0", padding: 12, background: C.primaryBg, border: `1px solid ${C.primary}` }}>
          <div style={{ fontSize: 12, color: C.textMuted }}>Factura {invoice.numero}</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ color: C.text }}>Total: <b>{eur(invoice.total)}</b></span>
            <span style={{ color: C.primary, fontWeight: 700 }}>Pendiente: {eur(pendiente)}</span>
          </div>
        </div>
        <label style={S.label}>Fecha de cobro</label>
        <input style={S.input} type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} />
        <label style={S.label}>Importe cobrado (€)</label>
        <input style={S.input} type="number" inputMode="decimal" value={f.importe} onChange={e => setF({ ...f, importe: e.target.value })} autoFocus />
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          <button onClick={() => setF({ ...f, importe: pendiente.toFixed(2) })} style={{ padding: "6px 10px", fontSize: 12, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, cursor: "pointer" }}>Todo ({eur(pendiente)})</button>
          <button onClick={() => setF({ ...f, importe: (pendiente / 2).toFixed(2) })} style={{ padding: "6px 10px", fontSize: 12, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, cursor: "pointer" }}>Mitad</button>
        </div>
        <label style={S.label}>Método</label>
        <select style={S.input} value={f.metodo} onChange={e => setF({ ...f, metodo: e.target.value })}>
          <option value="transferencia">🏦 Transferencia</option>
          <option value="efectivo">💵 Efectivo</option>
          <option value="pagare">📜 Pagaré</option>
          <option value="confirming">📑 Confirming</option>
          <option value="bizum">📱 Bizum</option>
          <option value="otro">📌 Otro</option>
        </select>
        <label style={S.label}>Notas (opcional)</label>
        <input style={S.input} value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} placeholder="Referencia, banco, etc." />
        <button onClick={() => valid && onSave({ fecha: new Date(f.fecha).toISOString(), importe: f.importe, metodo: f.metodo, notas: f.notas })} disabled={!valid} style={{ ...S.btn(valid ? C.success : "#cbd5e1"), marginTop: 8, opacity: valid ? 1 : 0.7 }}><CheckCircle2 size={22} />Registrar cobro</button>
      </div>
    </div>
  );
}

function InvoicesScreen({ C, S, invoices, clients, settings, hoy, onNew, onOpen }) {
  const [filter, setFilter] = useState("all"); // all | pending | paid | overdue
  const [period, setPeriod] = useState("all"); // PERIODS keys
  const [q, setQ] = useState("");
  const sorted = [...invoices].sort((a, b) => b.numero.localeCompare(a.numero));
  const withStatus = sorted.map(i => ({ i, st: invoiceStatus(i, hoy, settings?.avisoVencimiento) }));
  const filtered = withStatus.filter(({ i, st }) => {
    if (!inPeriod(i.fecha, period)) return false;
    if (filter === "pending" && st.estado === "paid") return false;
    if (filter === "paid" && st.estado !== "paid") return false;
    if (filter === "overdue" && st.estado !== "overdue") return false;
    if (q.trim()) {
      const s = q.toLowerCase();
      const c = clients.find(cl => cl.id === i.clientId);
      if (![i.numero, c?.razon, c?.nif].filter(Boolean).some(v => v.toLowerCase().includes(s))) return false;
    }
    return true;
  });

  // Resumen del periodo seleccionado (sobre todas las facturas del periodo, ignorando el filtro estado/búsqueda)
  const periodSummary = useMemo(() => {
    const inv = invoices.filter(i => inPeriod(i.fecha, period));
    let base = 0, iva = 0, irpf = 0, total = 0, cobrado = 0;
    for (const i of inv) {
      base += Number(i.base || 0);
      iva += Number(i.cuota || 0);
      irpf += Number(i.irpfImporte || 0);
      total += Number(i.total || 0);
      cobrado += (i.pagos || []).reduce((s, p) => s + Number(p.importe || 0), 0);
    }
    return { num: inv.length, base, iva, irpf, total, cobrado, pendiente: total - cobrado };
  }, [invoices, period]);

  const chip = (key, label) => (
    <button onClick={() => setFilter(key)} style={{ padding: "6px 12px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", background: filter === key ? C.primary : C.surfaceAlt, color: filter === key ? "white" : C.text, border: `1px solid ${filter === key ? C.primary : C.border}`, borderRadius: 20, cursor: "pointer" }}>{label}</button>
  );
  return (
    <>
      <Header C={C} S={S} title="Facturas" />
      <div style={{ padding: "0 16px", marginTop: 8 }}>
        <PeriodChips C={C} value={period} onChange={setPeriod} />
      </div>

      {/* Resumen del periodo */}
      {period !== "all" && periodSummary.num > 0 && (
        <div style={{ ...S.card, background: C.gradient, color: "white", border: "none" }}>
          <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Resumen · {PERIODS.find(p => p.key === period)?.label}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4, letterSpacing: -0.5 }}>{eur(periodSummary.base)}</div>
          <div style={{ fontSize: 11, opacity: 0.9 }}>base imponible · {periodSummary.num} factura{periodSummary.num !== 1 ? "s" : ""}</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.25)", fontSize: 12 }}>
            <span>IVA repercutido</span><b>{eur(periodSummary.iva)}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4 }}>
            <span>IRPF retenido</span><b>{eur(periodSummary.irpf)}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4 }}>
            <span>Total facturado</span><b>{eur(periodSummary.total)}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4, opacity: 0.95 }}>
            <span>Cobrado</span><b>{eur(periodSummary.cobrado)}{periodSummary.pendiente > 0.005 ? ` · pendiente ${eur(periodSummary.pendiente)}` : ""}</b>
          </div>
        </div>
      )}

      <div style={{ padding: "0 16px" }}>
        <div style={{ position: "relative" }}>
          <Search size={18} style={{ position: "absolute", left: 14, top: 16, color: C.textMuted }} />
          <input style={{ ...S.input, paddingLeft: 42 }} placeholder="Buscar factura, cliente o NIF…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          {chip("all", "Todas")}
          {chip("pending", "Pendientes")}
          {chip("overdue", "Vencidas")}
          {chip("paid", "Cobradas")}
        </div>
      </div>
      {filtered.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🧾</div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
            {invoices.length === 0 ? "Aún no has emitido facturas" : "Sin facturas en este filtro"}
          </div>
          <div style={{ color: C.textMuted, fontSize: 13 }}>
            {invoices.length === 0 ? "Pulsa el botón verde de abajo para emitir tu primera factura a partir de rutas pendientes." : "Cambia el periodo, filtro o búsqueda."}
          </div>
        </div>
      )}
      {filtered.map(({ i, st }) => {
        const c = clients.find(cl => cl.id === i.clientId);
        return (
          <div key={i.id} style={{ ...S.card, cursor: "pointer" }} onClick={() => onOpen(i.id)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <b style={{ fontSize: 16, color: C.text }}><Highlight text={i.numero} query={q} color={C.primary} /></b>
              <span style={{ color: C.success, fontSize: 18, fontWeight: 700 }}>{eur(i.total)}</span>
            </div>
            <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}><Highlight text={c?.razon || "?"} query={q} color={C.primary} /> · {fmtDate(i.fecha)}</div>
            <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <PaymentBadge C={C} S={S} estado={st.estado} diasRestantes={st.diasRestantes} />
              {st.estado !== "paid" && st.pagado > 0 && <span style={{ fontSize: 11, color: C.textMuted }}>cobrado {eur(st.pagado)}</span>}
            </div>
          </div>
        );
      })}
      <div style={S.thumbAbove}><div style={S.thumbInner}>
        <button onClick={onNew} style={S.btnGradient()}><Plus size={24} />Generar nueva factura</button>
      </div></div>
    </>
  );
}

function InvoiceDetailScreen({ C, S, invoice, client, routes, settings, hoy, onBack, onDownload, onRegisterPayment, onDeletePayment }) {
  const st = invoiceStatus(invoice, hoy, settings?.avisoVencimiento);
  const metodoLabel = { transferencia: "🏦 Transferencia", efectivo: "💵 Efectivo", pagare: "📜 Pagaré", confirming: "📑 Confirming", bizum: "📱 Bizum", otro: "📌 Otro" };
  return (
    <>
      <Header C={C} S={S} title={invoice.numero} onBack={onBack} />
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{client?.razon || "?"}</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>{client?.nif}</div>
          </div>
          <PaymentBadge C={C} S={S} estado={st.estado} diasRestantes={st.diasRestantes} />
        </div>
        <div style={{ ...S.stat, marginTop: 12 }}><span>Fecha emisión</span><b>{fmtDate(invoice.fecha)}</b></div>
        {invoice.vencimiento && <div style={S.stat}><span>Vencimiento</span><b style={{ color: st.estado === "overdue" ? C.danger : C.text }}>{fmtDate(invoice.vencimiento)}</b></div>}
        <div style={S.stat}><span>Base imponible</span><b>{eur(invoice.base)}</b></div>
        <div style={S.stat}><span>IRPF -{invoice.irpfPct}%</span><b style={{ color: C.danger }}>-{eur(invoice.irpfImporte)}</b></div>
        <div style={S.stat}><span>IVA {invoice.ivaPct}%</span><b>{eur(invoice.cuota)}</b></div>
        <div style={{ ...S.stat, borderBottom: "none", fontSize: 16 }}><span><b>TOTAL</b></span><b style={{ color: C.success }}>{eur(invoice.total)}</b></div>
      </div>

      <div style={S.card}>
        <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Cobros</div>
        {(!invoice.pagos || invoice.pagos.length === 0) && <div style={{ color: C.textLight, fontSize: 13, padding: "8px 0" }}>Aún no hay cobros registrados.</div>}
        {(invoice.pagos || []).map(p => (
          <div key={p.id} style={{ ...S.stat, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 14 }}>{metodoLabel[p.metodo] || p.metodo}</div>
              <div style={{ fontSize: 11, color: C.textMuted }}>{fmtDate(p.fecha)}{p.notas ? ` · ${p.notas}` : ""}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <b style={{ color: C.success }}>{eur(p.importe)}</b>
              <button onClick={() => onDeletePayment(p.id)} style={{ background: "none", border: "none", color: C.textLight, cursor: "pointer" }}><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, padding: "10px 0", borderTop: `2px solid ${C.border}` }}>
          <span style={{ color: C.textMuted, fontWeight: 600 }}>Cobrado</span>
          <b style={{ color: C.success }}>{eur(st.pagado)}</b>
        </div>
        {st.estado !== "paid" && <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 10 }}>
          <span style={{ color: C.textMuted, fontWeight: 600 }}>Pendiente</span>
          <b style={{ color: C.danger }}>{eur(st.pendiente)}</b>
        </div>}
      </div>

      {routes.length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Rutas incluidas</div>
          {routes.map(r => (
            <div key={r.id} style={S.stat}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.origen} → {r.destino}</div>
                <div style={{ fontSize: 11, color: C.textMuted }}>{fmtDate(r.fecha || r.inicio)}{r.expediente ? ` · Exp. ${r.expediente}` : ""}</div>
              </div>
              <b>{eur(r.precio)}</b>
            </div>
          ))}
        </div>
      )}

      <div style={S.card}>
        <div style={{ fontSize: 10, color: C.textLight, fontFamily: "monospace", wordBreak: "break-all" }}>🔒 {invoice.hash}</div>
      </div>

      <div style={S.thumb}><div style={S.thumbInner}>
        {st.estado !== "paid" && <button onClick={onRegisterPayment} style={S.btn(C.success)}><CircleDollarSign size={22} />Registrar cobro</button>}
        <button onClick={onDownload} style={{ ...S.btn(C.primary), flex: st.estado === "paid" ? 1 : 0.8 }}><Download size={22} />PDF</button>
      </div></div>
    </>
  );
}

function CobrosScreen({ C, S, invoices, clients, settings, hoy, onBack, onOpen, onRegisterPayment }) {
  const pendientes = invoices
    .map(i => ({ i, st: invoiceStatus(i, hoy, settings?.avisoVencimiento) }))
    .filter(x => x.st.estado !== "paid")
    .sort((a, b) => {
      // primero las vencidas, luego por vencimiento
      if (a.st.estado === "overdue" && b.st.estado !== "overdue") return -1;
      if (b.st.estado === "overdue" && a.st.estado !== "overdue") return 1;
      return (a.i.vencimiento || "").localeCompare(b.i.vencimiento || "");
    });

  const total = pendientes.reduce((s, { st }) => s + st.pendiente, 0);
  const vencido = pendientes.filter(x => x.st.estado === "overdue").reduce((s, { st }) => s + st.pendiente, 0);
  const proximas = pendientes.filter(x => x.st.estado === "due_soon").reduce((s, { st }) => s + st.pendiente, 0);

  // Por cliente
  const porCliente = {};
  for (const { i, st } of pendientes) {
    const k = i.clientId;
    if (!porCliente[k]) porCliente[k] = { client: clients.find(c => c.id === k), total: 0, num: 0, vencido: 0 };
    porCliente[k].total += st.pendiente;
    porCliente[k].num++;
    if (st.estado === "overdue") porCliente[k].vencido += st.pendiente;
  }
  const clientesList = Object.values(porCliente).sort((a, b) => b.vencido - a.vencido || b.total - a.total);

  return (
    <>
      <Header C={C} S={S} title="Cobros pendientes" />
      <div style={{ ...S.card, background: vencido > 0 ? C.dangerBg : C.primaryBg, border: `2px solid ${vencido > 0 ? C.danger : C.primary}` }}>
        <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 700, textTransform: "uppercase" }}>Total por cobrar</div>
        <div style={{ fontSize: 38, fontWeight: 800, color: C.text, marginTop: 4 }}>{eur(total)}</div>
        <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12, flexWrap: "wrap" }}>
          {vencido > 0 && <span style={{ color: C.danger, fontWeight: 700 }}>⚠ {eur(vencido)} vencido</span>}
          {proximas > 0 && <span style={{ color: C.warning, fontWeight: 700 }}>🕐 {eur(proximas)} próximas</span>}
          <span style={{ color: C.textMuted }}>{pendientes.length} factura{pendientes.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {clientesList.length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Por cliente</div>
          {clientesList.map(c => (
            <div key={c.client?.id || "?"} style={S.stat}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{c.client?.razon || "?"}</div>
                <div style={{ fontSize: 11, color: C.textMuted }}>{c.num} factura{c.num > 1 ? "s" : ""}{c.vencido > 0 ? ` · ${eur(c.vencido)} vencido` : ""}</div>
              </div>
              <b style={{ color: c.vencido > 0 ? C.danger : C.text }}>{eur(c.total)}</b>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...S.card, padding: "8px 16px" }}>
        <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, padding: "8px 0" }}>Facturas pendientes</div>
      </div>
      {pendientes.length === 0 && <div style={{ ...S.card, color: C.success, textAlign: "center", fontWeight: 700 }}>🎉 No hay cobros pendientes</div>}
      {pendientes.map(({ i, st }) => {
        const c = clients.find(cl => cl.id === i.clientId);
        return (
          <div key={i.id} style={{ ...S.card, cursor: "pointer", borderLeft: `4px solid ${st.estado === "overdue" ? C.danger : st.estado === "due_soon" ? C.warning : C.primary}` }} onClick={() => onOpen(i.id)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <b style={{ color: C.text }}>{i.numero}</b>
              <b style={{ color: st.estado === "overdue" ? C.danger : C.success }}>{eur(st.pendiente)}</b>
            </div>
            <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>{c?.razon || "?"}</div>
            <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <PaymentBadge C={C} S={S} estado={st.estado} diasRestantes={st.diasRestantes} />
              <button onClick={(e) => { e.stopPropagation(); onRegisterPayment(i.id); }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, background: C.success, color: "white", border: "none", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><CircleDollarSign size={14} />Cobrar</button>
            </div>
          </div>
        );
      })}
    </>
  );
}

function StatsScreen({ C, S, invoices, expenses, routes, onBack }) {
  // Agrupar por mes
  const meses = useMemo(() => {
    const map = {};
    for (const i of invoices) {
      const k = monthKey(i.fecha);
      if (!map[k]) map[k] = { key: k, base: 0, iva: 0, facturas: 0, cobrado: 0 };
      map[k].base += Number(i.base);
      map[k].iva += Number(i.cuota);
      map[k].facturas++;
      for (const p of i.pagos || []) {
        const pk = monthKey(p.fecha);
        if (!map[pk]) map[pk] = { key: pk, base: 0, iva: 0, facturas: 0, cobrado: 0 };
        map[pk].cobrado += Number(p.importe);
      }
    }
    return Object.values(map).sort((a, b) => b.key.localeCompare(a.key)).slice(0, 12);
  }, [invoices]);

  const maxBase = Math.max(...meses.map(m => m.base), 1);
  const totalGastos = expenses.reduce((s, e) => s + Number(e.importe), 0);
  const totalIngresos = invoices.reduce((s, i) => s + Number(i.base), 0);
  const totalCobrado = invoices.reduce((s, i) => s + (i.pagos || []).reduce((a, p) => a + Number(p.importe), 0), 0);

  return (
    <>
      <Header C={C} S={S} title="Estadísticas" onBack={onBack} />
      <div style={S.card}>
        <div style={S.stat}><span>Ingresos totales (base)</span><b style={{ color: C.success }}>{eur(totalIngresos)}</b></div>
        <div style={S.stat}><span>Cobrado (caja)</span><b style={{ color: C.primary }}>{eur(totalCobrado)}</b></div>
        <div style={S.stat}><span>Gastos de rutas</span><b style={{ color: C.danger }}>-{eur(totalGastos)}</b></div>
        <div style={{ ...S.stat, borderBottom: "none", fontSize: 16 }}><span><b>Beneficio bruto</b></span><b style={{ color: totalIngresos - totalGastos >= 0 ? C.success : C.danger }}>{eur(totalIngresos - totalGastos)}</b></div>
      </div>

      <div style={S.card}>
        <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Facturación mensual</div>
        {meses.length === 0 && <div style={{ color: C.textLight, fontSize: 13 }}>Sin datos</div>}
        {meses.map(m => (
          <div key={m.key} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: C.text }}>{monthLabel(m.key)} <span style={{ color: C.textMuted }}>· {m.facturas} fact.</span></span>
              <span style={{ color: C.text, fontWeight: 700 }}>{eur(m.base)}</span>
            </div>
            <div style={{ height: 8, background: C.surfaceAlt, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${(m.base / maxBase) * 100}%`, height: "100%", background: C.gradient, borderRadius: 4 }} />
            </div>
            {m.cobrado > 0 && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>Cobrado ese mes: {eur(m.cobrado)}</div>}
          </div>
        ))}
      </div>
    </>
  );
}

/* -------- Gastos -------- */
function ExpensesScreen({ C, S, expenses, routes, settings, onBack, onAdd, onDelete, onEdit }) {
  const [period, setPeriod] = useState("month");
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Filtro por periodo + texto + categoría
  const filtered = useMemo(() => {
    let list = expenses.filter(e => inPeriod(e.fecha, period));
    if (categoryFilter !== "all") list = list.filter(e => e.tipo === categoryFilter);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter(e => [e.motivo, e.tipo, CAT_BY_KEY[e.tipo]?.label].filter(Boolean).some(v => v.toLowerCase().includes(s)));
    }
    return list.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  }, [expenses, period, q, categoryFilter]);

  // Totales por categoría en el periodo
  const byCategory = useMemo(() => {
    const map = {};
    for (const e of expenses.filter(x => inPeriod(x.fecha, period))) {
      const k = e.tipo || "other";
      if (!map[k]) map[k] = 0;
      map[k] += Number(e.importe || 0);
    }
    return Object.entries(map).map(([k, v]) => ({ key: k, total: v, cat: CAT_BY_KEY[k] })).sort((a, b) => b.total - a.total);
  }, [expenses, period]);

  const totalPeriodo = byCategory.reduce((s, c) => s + c.total, 0);
  const max = Math.max(...byCategory.map(c => c.total), 1);
  const periodLabel = PERIODS.find(p => p.key === period)?.label || "Mes";

  // Combustible HOY (atajo informativo solicitado por el usuario)
  const fuelToday = expenses
    .filter(e => e.tipo === "fuel" && inPeriod(e.fecha, "today"))
    .reduce((s, e) => s + Number(e.importe || 0), 0);

  return (
    <>
      <Header C={C} S={S} title="Gastos" onBack={onBack} />

      <div style={{ ...S.card, background: C.gradient, color: "white", border: "none" }}>
        <div style={{ fontSize: 13, opacity: 0.85 }}>Total gastos · {periodLabel}</div>
        <div style={{ fontSize: 36, fontWeight: 800, marginTop: 4, letterSpacing: -0.5 }}>{eur(totalPeriodo)}</div>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>{filtered.length} apunte{filtered.length !== 1 ? "s" : ""}</div>
      </div>

      <div style={{ padding: "0 16px" }}>
        <PeriodChips C={C} value={period} onChange={setPeriod} />
      </div>

      {/* Combustible hoy */}
      {fuelToday > 0 && period !== "today" && (
        <div style={{ ...S.card, background: C.warningBg, borderColor: C.warning }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>⛽ Combustible hoy</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginTop: 2 }}>{eur(fuelToday)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Por categoría */}
      {byCategory.length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Por categoría</div>
          {byCategory.map(c => {
            const colorKey = c.cat?.colorKey || "primary";
            const color = C[colorKey] || C.primary;
            return (
              <div key={c.key} style={{ marginBottom: 10, cursor: "pointer" }} onClick={() => setCategoryFilter(categoryFilter === c.key ? "all" : c.key)}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: C.text, fontWeight: categoryFilter === c.key ? 700 : 500 }}>{c.cat?.emoji || "📌"} {c.cat?.label || c.key}</span>
                  <span style={{ color: C.text, fontWeight: 700 }}>{eur(c.total)}</span>
                </div>
                <div style={{ height: 8, background: C.surfaceAlt, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${(c.total / max) * 100}%`, height: "100%", background: color, borderRadius: 4 }} />
                </div>
              </div>
            );
          })}
          {categoryFilter !== "all" && (
            <button onClick={() => setCategoryFilter("all")} style={{ marginTop: 4, background: "none", border: "none", color: C.primary, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>← Limpiar filtro</button>
          )}
        </div>
      )}

      {/* Buscador */}
      <div style={{ padding: "0 16px", marginTop: 4 }}>
        <div style={{ position: "relative" }}>
          <Search size={18} style={{ position: "absolute", left: 14, top: 16, color: C.textMuted }} />
          <input style={{ ...S.input, paddingLeft: 42 }} placeholder="Buscar gasto…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>

      {/* Lista detallada */}
      {filtered.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🧾</div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Sin gastos en este periodo</div>
          <div style={{ color: C.textMuted, fontSize: 13 }}>Pulsa el botón verde de abajo para apuntar uno.</div>
        </div>
      ) : (
        filtered.map(e => {
          const cat = CAT_BY_KEY[e.tipo];
          const route = e.routeId ? routes.find(r => r.id === e.routeId) : null;
          return (
            <div key={e.id} style={{ ...S.card, cursor: "pointer" }} onClick={() => onEdit && onEdit(e)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                    {cat?.emoji || "📌"} {cat?.label || e.tipo}
                    {e.litros ? <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 400 }}> · {e.litros} L</span> : null}
                  </div>
                  {e.motivo && <div style={{ fontSize: 13, color: C.text, marginTop: 4 }}><Highlight text={e.motivo} query={q} color={C.primary} /></div>}
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                    {fmtDate(e.fecha)}
                    {route ? ` · ${route.origen} → ${route.destino}` : " · gasto general"}
                  </div>
                </div>
                <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <b style={{ fontSize: 16, color: C.danger }}>-{eur(e.importe)}</b>
                  <button onClick={(ev) => { ev.stopPropagation(); onDelete(e.id); }} style={{ background: "none", border: "none", color: C.textLight, cursor: "pointer", padding: 4 }}><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          );
        })
      )}

      <div style={S.thumbAbove}><div style={S.thumbInner}>
        <button onClick={onAdd} style={S.btnGradient()}><Plus size={24} />Apuntar nuevo gasto</button>
      </div></div>
    </>
  );
}

/* -------- Clientes / facturación -------- */
function PickClientScreen({ C, S, clients, routes, onBack, onPick }) {
  const [q, setQ] = useState("");
  const conRutas = clients.map(c => ({ ...c, pendientes: routes.filter(r => r.clientId === c.id && r.estado !== "invoiced").length }));
  const filtered = conRutas.filter(c => !q.trim() || c.razon?.toLowerCase().includes(q.toLowerCase()) || c.nif?.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <Header C={C} S={S} title="Elegir cliente" onBack={onBack} />
      <div style={{ padding: "0 16px", marginTop: 8 }}>
        <div style={{ position: "relative" }}>
          <Search size={18} style={{ position: "absolute", left: 14, top: 16, color: C.textMuted }} />
          <input style={{ ...S.input, paddingLeft: 42 }} placeholder="Buscar por nombre o NIF…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      {filtered.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📋</div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
            {clients.length === 0 ? "Aún no tienes clientes" : "Sin coincidencias"}
          </div>
          <div style={{ color: C.textMuted, fontSize: 13 }}>
            {clients.length === 0 ? "Crea clientes desde Ajustes → Gestionar clientes, o ponlos al vuelo al registrar una ruta." : "Prueba a buscar por NIF o con menos letras."}
          </div>
        </div>
      )}
      {filtered.map(c => (
        <div key={c.id} style={{ ...S.card, cursor: c.pendientes > 0 ? "pointer" : "default", opacity: c.pendientes > 0 ? 1 : 0.6 }} onClick={() => c.pendientes > 0 && onPick(c.id)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ color: C.text }}><Highlight text={c.razon} query={q} color={C.primary} /></b>
              <div style={{ fontSize: 12, color: c.nif ? C.textMuted : C.danger, marginTop: 2, fontWeight: c.nif ? 400 : 600 }}>
                {c.nif ? <Highlight text={c.nif} query={q} color={C.primary} /> : "⚠ Sin NIF — edítalo antes de facturar"}
              </div>
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

function PickLinesScreen({ C, S, client, routes, settings, onBack, onEmit }) {
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
      <Header C={C} S={S} title={client?.razon || "Cliente"} onBack={onBack} />
      <div style={S.card}>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 8 }}>Marca las rutas a incluir:</div>
        {sorted.map(r => (
          <div key={r.id} onClick={() => toggle(r.id)} style={{ display: "flex", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer", gap: 10 }}>
            <input type="checkbox" checked={sel.includes(r.id)} readOnly style={{ width: 20, height: 20 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{r.origen} → {r.destino}</div>
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

function ClientsScreen({ C, S, clients, invoices, hoy, settings, onBack, onAdd, onEdit, onDelete }) {
  const [q, setQ] = useState("");
  const enriched = clients.map(c => {
    const facturas = invoices.filter(i => i.clientId === c.id);
    let pendiente = 0, vencido = 0;
    for (const i of facturas) {
      const st = invoiceStatus(i, hoy, settings?.avisoVencimiento);
      if (st.estado !== "paid") { pendiente += st.pendiente; if (st.estado === "overdue") vencido += st.pendiente; }
    }
    return { ...c, pendiente, vencido, nFact: facturas.length };
  });
  const filtered = enriched.filter(c => !q.trim() || c.razon?.toLowerCase().includes(q.toLowerCase()) || c.nif?.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <Header C={C} S={S} title="Clientes" onBack={onBack} />
      <div style={{ padding: "0 16px", marginTop: 8 }}>
        <div style={{ position: "relative" }}>
          <Search size={18} style={{ position: "absolute", left: 14, top: 16, color: C.textMuted }} />
          <input style={{ ...S.input, paddingLeft: 42 }} placeholder="Buscar cliente…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      {filtered.length === 0 && <div style={{ ...S.card, color: C.textLight, textAlign: "center" }}>{clients.length === 0 ? "No hay clientes" : "Sin coincidencias"}</div>}
      {filtered.map(c => (
        <div key={c.id} style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <b style={{ color: C.text }}><Highlight text={c.razon} query={q} color={C.primary} /></b>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}><Highlight text={c.nif || ""} query={q} color={C.primary} /></div>
              <div style={{ fontSize: 12, color: C.textMuted }}>{c.direccion}</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>{c.cp} {c.ciudad}</div>
            </div>
            {c.pendiente > 0 && <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: C.textMuted }}>Pendiente</div>
              <b style={{ color: c.vencido > 0 ? C.danger : C.warning, fontSize: 14 }}>{eur(c.pendiente)}</b>
              {c.vencido > 0 && <div style={{ fontSize: 10, color: C.danger, fontWeight: 700 }}>{eur(c.vencido)} vencido</div>}
            </div>}
          </div>
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

function ClientForm({ C, S, initial, onCancel, onSubmit }) {
  const [f, setF] = useState(initial?.id ? initial : { razon: "", nif: "", direccion: "", cp: "", ciudad: "" });
  const valid = f.razon && f.nif;
  return (
    <>
      <Header C={C} S={S} title={initial?.id ? "Editar cliente" : "Nuevo cliente"} onBack={onCancel} />
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

function SettingsScreen({ C, S, settings, tema, onSave, onClients, onExport, onImport, onToggleTheme }) {
  const [f, setF] = useState(settings);
  const fileRef = useRef(null);
  useEffect(() => setF(settings), [settings]);
  return (
    <>
      <Header C={C} S={S} title="Ajustes" />

      <div style={{ ...S.card, display: "flex", gap: 8 }}>
        <button onClick={onToggleTheme} style={{ ...S.btn(C.primary, 48), flex: 1 }}>
          {tema === "light" ? <><Moon size={18} />Modo oscuro</> : <><Sun size={18} />Modo claro</>}
        </button>
      </div>

      <div style={S.card}>
        <button onClick={onClients} style={{ ...S.btn(C.primary, 52) }}><Users size={20} />Gestionar clientes</button>
      </div>

      <div style={S.card}>
        <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>💾 Backup</div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>Exporta un fichero JSON con TODO: rutas, gastos, facturas, cobros, clientes, ajustes. Úsalo para copia de seguridad o para pasar a otro dispositivo.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onExport} style={{ ...S.btn(C.success, 48), flex: 1, fontSize: 13 }}><Download size={18} />Exportar</button>
          <button onClick={() => fileRef.current?.click()} style={{ ...S.btn(C.warning, 48), flex: 1, fontSize: 13 }}><Upload size={18} />Importar</button>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={e => { const file = e.target.files?.[0]; if (file) onImport(file); e.target.value = ""; }} />
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: C.textLight, textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>Mis datos</div>
        <label style={S.label}>Nombre / Razón social</label><input style={S.input} value={f.nombre || ""} onChange={e => setF({ ...f, nombre: e.target.value })} />
        <label style={S.label}>NIF</label><input style={S.input} value={f.nif || ""} onChange={e => setF({ ...f, nif: e.target.value })} />
        <label style={S.label}>Dirección</label><input style={S.input} value={f.direccion || ""} onChange={e => setF({ ...f, direccion: e.target.value })} />
        <label style={S.label}>Código postal</label><input style={S.input} value={f.cp || ""} onChange={e => setF({ ...f, cp: e.target.value })} />
        <label style={S.label}>Ciudad</label><input style={S.input} value={f.ciudad || ""} onChange={e => setF({ ...f, ciudad: e.target.value })} />
        <label style={S.label}>Teléfono</label><input style={S.input} value={f.telefono || ""} onChange={e => setF({ ...f, telefono: e.target.value })} />

        <div style={{ fontSize: 12, color: C.textLight, textTransform: "uppercase", marginTop: 16, marginBottom: 4, fontWeight: 700 }}>Vehículos</div>
        <label style={S.label}>Matrícula tractora</label><input style={S.input} value={f.tractora || ""} onChange={e => setF({ ...f, tractora: e.target.value })} />
        <label style={S.label}>Matrícula remolque</label><input style={S.input} value={f.remolque || ""} onChange={e => setF({ ...f, remolque: e.target.value })} />

        <div style={{ fontSize: 12, color: C.textLight, textTransform: "uppercase", marginTop: 16, marginBottom: 4, fontWeight: 700 }}>Facturación</div>
        <label style={S.label}>Serie</label><input style={S.input} value={f.serie} onChange={e => setF({ ...f, serie: e.target.value })} />
        <label style={S.label}>Ejercicio</label><input style={S.input} type="number" value={f.ejercicio} onChange={e => setF({ ...f, ejercicio: Number(e.target.value) })} />
        <label style={S.label}>IVA (%)</label><input style={S.input} type="number" value={f.iva} onChange={e => setF({ ...f, iva: Number(e.target.value) })} />
        <label style={S.label}>IRPF (%)</label><input style={S.input} type="number" value={f.irpf} onChange={e => setF({ ...f, irpf: Number(e.target.value) })} />
        <label style={S.label}>IBAN</label><input style={S.input} value={f.iban || ""} onChange={e => setF({ ...f, iban: e.target.value })} placeholder="ES00 0000 0000 0000 0000 0000" />
        <label style={S.label}>Forma de pago (si no hay IBAN)</label><input style={S.input} value={f.formaPago || ""} onChange={e => setF({ ...f, formaPago: e.target.value })} />
        <label style={S.label}>Observaciones</label><input style={S.input} value={f.observaciones || ""} onChange={e => setF({ ...f, observaciones: e.target.value })} />
        <label style={S.label}>Registro mercantil (pie)</label><input style={S.input} value={f.registro || ""} onChange={e => setF({ ...f, registro: e.target.value })} placeholder="INS. REG. MER. TOM. 1613…" />

        <div style={{ fontSize: 12, color: C.textLight, textTransform: "uppercase", marginTop: 16, marginBottom: 4, fontWeight: 700 }}>Cobros</div>
        <label style={S.label}>Días para vencimiento (al emitir factura)</label><input style={S.input} type="number" value={f.diasVencimiento ?? 60} onChange={e => setF({ ...f, diasVencimiento: Number(e.target.value) })} />
        <label style={S.label}>Avisar X días antes del vencimiento</label><input style={S.input} type="number" value={f.avisoVencimiento ?? 7} onChange={e => setF({ ...f, avisoVencimiento: Number(e.target.value) })} />

        <div style={{ fontSize: 12, color: C.textLight, textTransform: "uppercase", marginTop: 16, marginBottom: 4, fontWeight: 700 }}>Combustible</div>
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>
          Estos valores se usan para estimar el coste de combustible al crear una ruta. Si tienes repostajes registrados, la app usa tu histórico real y estos valores solo son fallback.
        </div>
        <label style={S.label}>Precio por defecto (€/L)</label><input style={S.input} type="number" step="0.001" value={f.precioGasoil ?? 1.45} onChange={e => setF({ ...f, precioGasoil: Number(e.target.value) })} />
        <label style={S.label}>Consumo por defecto (L/100km)</label><input style={S.input} type="number" step="0.1" value={f.consumoEstimado ?? 30} onChange={e => setF({ ...f, consumoEstimado: Number(e.target.value) })} />

        <div style={{ fontSize: 12, color: C.textLight, textTransform: "uppercase", marginTop: 16, marginBottom: 4, fontWeight: 700 }}>Alertas</div>
        <label style={S.label}>Margen mínimo (%)</label><input style={S.input} type="number" value={f.margenAlerta} onChange={e => setF({ ...f, margenAlerta: Number(e.target.value) })} />

        <button onClick={() => onSave(f)} style={{ ...S.btnGradient(), marginTop: 20 }}><CheckCircle size={22} />Guardar ajustes</button>
      </div>
    </>
  );
}
