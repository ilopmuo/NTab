/**
 * Iconos de LUNO (favicon, icono de la app, PWA, Apple y Open Graph) a partir de
 * las formas de src/lib/brand.ts. Se ejecuta a mano cuando cambia la marca:
 *
 *   npm i --no-save @resvg/resvg-js wawoff2 && node scripts/icons.mjs
 *
 * Escribe en public/ y en docs/brand/.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import { decompress } from 'wawoff2'
import { BRAND, MARK, WORDMARK } from '../src/lib/brand.ts'

const root = new URL('..', import.meta.url)
const out = (p) => new URL(p, root)
mkdirSync(out('docs/brand/'), { recursive: true })

// Inter (la de la app) para el texto de la imagen de Open Graph
const inter = Buffer.from(await decompress(readFileSync(out('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'))))
const fontFile = new URL('inter.ttf', out('node_modules/.cache/'))
mkdirSync(out('node_modules/.cache/'), { recursive: true })
writeFileSync(fontFile, inter)

/** Símbolo en la retícula de 24, colocado en (x, y) con escala s */
const mark = ({ x = 0, y = 0, s = 1, ring = BRAND.paper, moon = BRAND.indigoLight }) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="${MARK.ring}" fill="none" stroke="${ring}" stroke-width="${MARK.ringWidth}"/>
    <circle cx="${MARK.moon.cx}" cy="${MARK.moon.cy}" r="${MARK.moon.r}" fill="${moon}"/>
  </g>`

const wordmark = ({ x = 0, y = 0, s = 1, color = BRAND.paper }) => `
  <g transform="translate(${x} ${y}) scale(${s})" fill="${color}">
    ${WORDMARK.fills.map((d) => `<path d="${d}"/>`).join('')}
    <g fill="none" stroke="${color}" stroke-width="${WORDMARK.stroke}"><path d="${WORDMARK.u}"/><circle cx="${WORDMARK.o.cx}" cy="${WORDMARK.o.cy}" r="${WORDMARK.o.r}"/></g>
  </g>`

/** Fondo del icono: casi negro, con una luz muy leve arriba */
const tile = (size, radius) => `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#17171c"/>
      <stop offset="1" stop-color="${BRAND.ink}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#bg)"/>`

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}\n</svg>\n`

/** Icono cuadrado: el símbolo ocupa `fill` del lado (la órbita mide 17 de 24) */
const appIcon = (size, { radius = 0, fill = 0.6 } = {}) => {
  const s = (size * fill) / 17
  const o = (size - 24 * s) / 2
  return svg(size, size, tile(size, radius) + mark({ x: o, y: o, s }))
}

const png = (file, source, width) => {
  const r = new Resvg(source, { fitTo: { mode: 'width', value: width }, font: { fontFiles: [fontFile.pathname.replace(/^\/(\w:)/, '$1')], loadSystemFonts: false, defaultFontFamily: 'Inter Variable' } })
  const data = r.render().asPng()
  writeFileSync(out(file), data)
  return data
}

// ── App y PWA ─────────────────────────────────────────────
const tileSvg = appIcon(512, { radius: 114 })
writeFileSync(out('public/icon.svg'), tileSvg)
png('public/icon-512.png', tileSvg, 512)
png('public/icon-192.png', tileSvg, 192)
// Enmascarable: a sangre y con el símbolo dentro de la zona segura (círculo del 80 %)
png('public/icon-maskable-512.png', appIcon(512, { fill: 0.48 }), 512)
// Apple recorta las esquinas: cuadrado a sangre
png('public/apple-touch-icon.png', appIcon(180, { fill: 0.58 }), 180)
// Insignia de las notificaciones (Android): solo la silueta, en blanco sobre transparente
png('public/badge-96.png', svg(24, 24, mark({ ring: '#fff', moon: '#fff' })), 96)

// ── Favicon ───────────────────────────────────────────────
// SVG que sigue al tema del sistema: órbita oscura en claro y clara en oscuro
writeFileSync(
  out('public/favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <style>
    .r { stroke: ${BRAND.ink} } .m { fill: ${BRAND.indigo} }
    @media (prefers-color-scheme: dark) { .r { stroke: ${BRAND.paper} } .m { fill: ${BRAND.indigoLight} } }
  </style>
  <path class="r" d="${MARK.ring}" fill="none" stroke-width="${MARK.ringWidth}"/>
  <circle class="m" cx="${MARK.moon.cx}" cy="${MARK.moon.cy}" r="${MARK.moon.r}"/>
</svg>
`,
)
// PNG e ICO de respaldo, en su baldosa oscura (se ven igual sobre pestañas claras y oscuras)
const small = (size) => appIcon(size, { radius: size * 0.22, fill: 0.74 })
const ico16 = png('public/favicon-16.png', small(16), 16)
const ico32 = png('public/favicon-32.png', small(32), 32)
{
  // ICO con los dos PNG dentro
  const imgs = [
    [16, ico16],
    [32, ico32],
  ]
  const head = Buffer.alloc(6 + imgs.length * 16)
  head.writeUInt16LE(0, 0)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(imgs.length, 4)
  let offset = head.length
  imgs.forEach(([size, data], i) => {
    const e = 6 + i * 16
    head.writeUInt8(size, e)
    head.writeUInt8(size, e + 1)
    head.writeUInt16LE(1, e + 4)
    head.writeUInt16LE(32, e + 6)
    head.writeUInt32LE(data.length, e + 8)
    head.writeUInt32LE(offset, e + 12)
    offset += data.length
  })
  writeFileSync(out('public/favicon.ico'), Buffer.concat([head, ...imgs.map(([, d]) => d)]))
}

// ── Open Graph / X (1200 × 630) ───────────────────────────
{
  const W = 1200
  const H = 630
  const ms = 5.2 // símbolo: 125 px
  const ws = 2.6 // logotipo: 62 px de alto
  const gap = 34
  const total = 24 * ms + gap + WORDMARK.width * ws
  const x = (W - total) / 2
  const y = 238
  const og = svg(
    W,
    H,
    `<rect width="${W}" height="${H}" fill="${BRAND.ink}"/>` +
      mark({ x, y: y - (24 * ms - 24 * ws) / 2, s: ms }) +
      wordmark({ x: x + 24 * ms + gap, y, s: ws }) +
      `<text x="${W / 2}" y="${y + 24 * ws + 96}" text-anchor="middle" font-family="Inter Variable" font-size="38" letter-spacing="-0.5" fill="#a1a1aa">Tu sistema personal.</text>`,
  )
  png('public/og.png', og, W)
}

// ── Recursos de marca para la documentación ───────────────
const lockup = (color, moon) => svg(24 + 10 + WORDMARK.width * 0.6, 24, mark({ ring: color, moon }) + wordmark({ x: 34, y: 4.8, s: 0.6, color }))
writeFileSync(out('docs/brand/luno-symbol.svg'), svg(24, 24, mark({ ring: BRAND.ink, moon: BRAND.indigo })))
writeFileSync(out('docs/brand/luno-symbol-dark.svg'), svg(24, 24, mark({})))
writeFileSync(out('docs/brand/luno-wordmark.svg'), svg(WORDMARK.width, WORDMARK.height, wordmark({ color: BRAND.ink })))
writeFileSync(out('docs/brand/luno-wordmark-dark.svg'), svg(WORDMARK.width, WORDMARK.height, wordmark({})))
writeFileSync(out('docs/brand/luno-lockup.svg'), lockup(BRAND.ink, BRAND.indigo))
writeFileSync(out('docs/brand/luno-lockup-dark.svg'), lockup(BRAND.paper, BRAND.indigoLight))
writeFileSync(out('docs/brand/luno-mono.svg'), svg(24, 24, mark({ ring: '#000', moon: '#000' })))

console.log('Iconos de LUNO generados')
