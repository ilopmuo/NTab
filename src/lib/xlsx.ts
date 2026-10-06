/**
 * Leer la primera hoja de un Excel (.xlsx) sin librerías: un .xlsx es un zip
 * con XML dentro, y el navegador ya sabe descomprimir (DecompressionStream).
 * Lo justo para los extractos que descargas del banco: texto y números; las
 * fechas llegan como número de serie de Excel (ver `readDate`).
 */

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8)
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0

interface Entry {
  name: string
  method: number
  size: number
  offset: number
}

function entries(b: Uint8Array): Entry[] {
  // El directorio central se anuncia al final del archivo
  let end = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) {
    if (u32(b, i) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('No es un archivo .xlsx')
  const count = u16(b, end + 10)
  let p = u32(b, end + 16)
  const out: Entry[] = []
  const dec = new TextDecoder()
  for (let k = 0; k < count && u32(b, p) === 0x02014b50; k++) {
    const method = u16(b, p + 10)
    const size = u32(b, p + 20)
    const nameLen = u16(b, p + 28)
    const extra = u16(b, p + 30)
    const comment = u16(b, p + 32)
    const offset = u32(b, p + 42)
    out.push({ name: dec.decode(b.subarray(p + 46, p + 46 + nameLen)), method, size, offset })
    p += 46 + nameLen + extra + comment
  }
  return out
}

async function read(b: Uint8Array, e: Entry): Promise<string> {
  const start = e.offset + 30 + u16(b, e.offset + 26) + u16(b, e.offset + 28)
  const data = b.slice(start, start + e.size)
  if (e.method === 0) return new TextDecoder().decode(data)
  if (e.method !== 8) throw new Error('Compresión no soportada')
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(stream).text()
}

const unescape = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')

const texts = (xml: string) => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join('')

/** «AB12» → 27 (columna, desde 0) */
function colIndex(ref: string) {
  let n = 0
  for (const c of ref.replace(/\d+$/, '')) n = n * 26 + (c.charCodeAt(0) - 64)
  return n - 1
}

/** La primera hoja de un .xlsx, como tabla de texto */
export async function readXlsx(data: ArrayBuffer): Promise<string[][]> {
  const b = new Uint8Array(data)
  const list = entries(b)
  const get = async (name: string) => {
    const e = list.find((x) => x.name === name)
    return e ? read(b, e) : undefined
  }
  const shared = [...((await get('xl/sharedStrings.xml')) ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]))
  // La primera hoja del libro (por su relación), o sheet1
  const workbook = (await get('xl/workbook.xml')) ?? ''
  const rels = (await get('xl/_rels/workbook.xml.rels')) ?? ''
  const rid = /<sheet\b[^>]*r:id="([^"]+)"/.exec(workbook)?.[1]
  const target = rid ? new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1] : undefined
  const path = target ? (target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`) : 'xl/worksheets/sheet1.xml'
  const sheet = (await get(path)) ?? (await get('xl/worksheets/sheet1.xml'))
  if (!sheet) throw new Error('El libro no tiene hojas')
  const rows: string[][] = []
  for (const row of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = []
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1]
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1]
      const inner = c[2] ?? ''
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
      const value = type === 's' ? (shared[Number(v)] ?? '') : type === 'inlineStr' ? texts(inner) : unescape(v ?? '')
      const i = ref ? colIndex(ref) : cells.length
      while (cells.length < i) cells.push('')
      cells[i] = value
    }
    if (cells.some((x) => x.trim())) rows.push(cells)
  }
  return rows
}
