/**
 * LUNO en Hermes (el agente de Nous Research, siempre encendido y con
 * Telegram, WhatsApp…): la misma URL privada que el conector de Claude, como
 * servidor MCP «luno» en ~/.hermes/config.yaml. La skill que le explica cómo
 * usarlo está en hermes/luno/SKILL.md.
 */
export const HERMES_SERVER = 'luno'

/** El trozo de ~/.hermes/config.yaml que añade LUNO (las herramientas se llaman mcp_luno_…) */
export function hermesConfig(url: string) {
  return `mcp_servers:\n  ${HERMES_SERVER}:\n    url: "${url}"\n    timeout: 120\n`
}
