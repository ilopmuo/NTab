// Límite del JS que se descarga al arrancar (index.html + modulepreload), en
// gzip. Si un cambio lo supera, la CI falla: algo pesado ha entrado en el
// arranque y seguramente debería cargarse bajo demanda (ver README → Carga).
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

const BUDGET_KB = Number(process.env.SIZE_BUDGET_KB ?? 200)
const dist = process.argv[2] ?? 'dist'
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const base = [...new Set([...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1]))]
// Lo que se precarga según la pantalla (la barra lateral o la de pestañas, ver
// vite.config.ts): cuenta la opción más pesada
const gz = (f) => gzipSync(readFileSync(join(dist, f)), { level: 9 }).length
const options = [...html.matchAll(/\[("assets\/[^\]]+)\]/g)].map((m) => JSON.parse(`[${m[1]}]`).filter((f) => !base.includes(f)))
const heaviest = [...options].sort((a, b) => b.reduce((s, f) => s + gz(f), 0) - a.reduce((s, f) => s + gz(f), 0))[0] ?? []
const files = [...base, ...heaviest]
if (!files.length) {
  console.error('No encuentro el JS de arranque en', join(dist, 'index.html'))
  process.exit(1)
}
const rows = files
  .map((f) => {
    const buf = readFileSync(join(dist, f))
    return { f, raw: buf.length, gz: gzipSync(buf, { level: 9 }).length }
  })
  .sort((a, b) => b.gz - a.gz)
const kb = (n) => (n / 1024).toFixed(1).padStart(7)
for (const r of rows) console.log(`${kb(r.raw)} KB ${kb(r.gz)} KB gzip  ${r.f}`)
const total = rows.reduce((s, r) => s + r.gz, 0) / 1024
if (options.length > 1) {
  const baseKb = base.reduce((s, f) => s + gz(f), 0) / 1024
  const [wide, narrow] = options.map((o) => (baseKb + o.reduce((s, f) => s + gz(f), 0) / 1024).toFixed(1))
  console.log(`\nOrdenador o tablet: ${wide} KB gzip · móvil: ${narrow} KB gzip (se cuenta el más pesado)`)
}
console.log(`\nJS de arranque: ${total.toFixed(1)} KB gzip (límite ${BUDGET_KB} KB)`)
if (total > BUDGET_KB) {
  console.error(`Se pasa del límite en ${(total - BUDGET_KB).toFixed(1)} KB`)
  process.exit(1)
}
