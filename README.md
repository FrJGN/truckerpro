# TruckerPro

PWA de gestión para camioneros autónomos: rutas, gastos, consumo, rentabilidad y facturación con hash encadenado preparado para VeriFactu.

## Stack

- React 18 + Vite 6
- IndexedDB (vía `dataApi.js`) para persistencia offline-first
- vite-plugin-pwa para instalación como app y service worker
- lucide-react para iconos
- Sin backend (de momento). `dataApi.js` está aislado para sustituirlo por Supabase sin tocar `App.jsx`.

## Estructura

```
truckerpro/
├── package.json
├── vite.config.js
├── index.html
└── src/
    ├── main.jsx
    ├── App.jsx        ← UI completa, todas las pantallas
    └── dataApi.js     ← capa de datos (IndexedDB hoy, Supabase mañana)
```

## Uso

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # genera /dist
npm run preview      # sirve /dist localmente
```

Para desplegar en Vercel: `vercel --prod` desde la raíz, sin configuración extra.

## Funcionalidades

**Rutas**
- Alta, edición y seguimiento de ruta activa
- Estados: in_progress → delivered → invoiced
- Cálculo en vivo de beneficio neto y margen %

**Gastos y consumo**
- Repostajes con litros y km de odómetro
- Otros gastos: peajes, dietas, parking, otros
- Consumo medio L/100km calculado a partir de los repostajes
- Borrado de gastos con confirmación

**Rentabilidad**
- Beneficio = precio - Σ gastos
- Semáforo de margen: verde ≥30%, ámbar 20–30%, rojo <20%
- Alerta visual configurable cuando el margen cae por debajo del umbral

**Facturación**
- Emisión automática al marcar la ruta como entregada
- Numeración correlativa con serie y ejercicio: `A-2026-0001`
- **Hash SHA-256 encadenado** (`hash_actual = SHA256(numero|fecha|nif|cliente|base|cuota|total|hash_anterior)`)
- Facturas marcadas como inmutables
- Generación paralela del e-CMR con los datos de la ruta

**UX**
- Modo oscuro nativo
- Botones críticos en thumb zone (barra inferior fija, mínimo 64 px)
- Safe area iOS respetada
- Modales bottom-sheet
- 100% offline (IndexedDB + service worker)

## Migración a Supabase

Cuando quieras sincronización entre dispositivos, solo hay que reescribir `src/dataApi.js` manteniendo la misma firma (`getAll`, `get`, `put`, `remove`, `getSettings`, `saveSettings`). `App.jsx` no se toca.

## Pendiente

- Generación de PDF de factura y e-CMR (jsPDF)
- Firma táctil del e-CMR
- Envío XML a AEAT VeriFactu (requiere certificado FNMT y backend)
- GPS tracking de km reales
- Foto de tickets en gastos
- Sincronización Supabase
