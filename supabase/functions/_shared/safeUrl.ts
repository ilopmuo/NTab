/**
 * ¿Es una dirección pública que el servidor puede leer? Solo http(s), sin
 * usuario ni contraseña, en los puertos de siempre y nunca hacia la red
 * interna (localhost, 10.x, 192.168.x, 169.254.x, ::1…). Lo usan las Edge
 * Functions que leen páginas que pega el usuario (recetas).
 */
export function isPrivateIp(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
  }
  if (h.includes(':')) {
    // IPv6: bucle, sin especificar, locales, únicas locales y IPv4 mapeadas
    if (h === '::' || h === '::1' || /^fe[89ab]/.test(h) || /^f[cd]/.test(h)) return true
    // IPv4 mapeada, en decimal (::ffff:127.0.0.1) o como la escribe el navegador (::ffff:7f00:1)
    const dotted = h.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (dotted) return isPrivateIp(dotted[1])
    const hex = h.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
    if (hex) {
      const [hi, lo] = [parseInt(hex[1], 16), parseInt(hex[2], 16)]
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
    }
    return false
  }
  return false
}

export function publicHttpUrl(raw: string): URL | undefined {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return undefined
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined
  if (u.username || u.password) return undefined
  if (u.port && u.port !== '80' && u.port !== '443') return undefined
  const host = u.hostname.toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') && !host.includes(':')) return undefined
  if (isPrivateIp(host)) return undefined
  return u
}
