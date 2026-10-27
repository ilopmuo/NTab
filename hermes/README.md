# LUNO en Hermes

[Hermes](https://hermes-agent.nousresearch.com) es un agente de Nous Research que está siempre encendido, recuerda y te escribe por Telegram, WhatsApp, Discord… Conectado a LUNO deja de ser un asistente al que preguntar y pasa a estar pendiente: te da los buenos días con lo importante, te recuerda las pastillas, cierra el día contigo y apunta en LUNO lo que le cuentes desde cualquier chat.

Usa el mismo conector que Claude (el servidor MCP de `supabase/functions/mcp`, con tu URL privada), así que todo lo que puede hacer Claude con LUNO lo puede hacer Hermes, con el modelo que tengas en Hermes.

## Instalar

1. En LUNO: **Ajustes → Claude, Siri y Hermes → Hermes → Copiar configuración de Hermes**. Pégala en `~/.hermes/config.yaml`. Queda así (si ya tienes `mcp_servers:`, añade solo el bloque `luno`):

   ```yaml
   mcp_servers:
     luno:
       url: "https://<tu-proyecto>.supabase.co/functions/v1/mcp/<tu-token>"
       timeout: 120
   ```

2. **Descargar la skill de LUNO** (o copia [`luno/SKILL.md`](luno/SKILL.md)) y guárdala como `~/.hermes/skills/luno/SKILL.md`. Le explica a Hermes qué herramienta usar en cada caso, cómo planificar con tus huecos y tus reuniones y cómo escribirte cuando es él quien empieza.
3. En Hermes, `/reload-mcp` (o reinícialo). Las herramientas aparecen como `mcp_luno_ver_resumen`, `mcp_luno_crear_tareas`… Prueba: «¿Qué tengo hoy en LUNO?».

## Lo que cambia con Hermes

Pídeselo con tus palabras y él programa las tareas (la skill trae las recetas):

- «Cada día a las 8 mándame los buenos días de LUNO»: lo importante, las reuniones, lo atrasado, las pastillas, a quién preguntar y el proyecto que se está quedando parado, con una pregunta para decidir.
- «Recuérdame las pastillas si no las marco»: a la hora de cada toma, si falta; contestas «tomada» y queda apuntada.
- «A las 21:30 cerramos el día»: lo hecho, qué pasa con lo que queda y «¿qué tal el día?» para el diario.
- «Los domingos a las 7, revisión semanal»: proyectos que piden atención, lo que esperas de otros, hábitos y dinero frente al presupuesto, con consejos que puede hacer por ti.
- Desde cualquier chat: «apunta llamar al casero mañana a las 10», «he gastado 30 en la gasolinera», una nota de voz contándole el día o un mensaje reenviado («mira lo que me dice Ana»).

## Seguridad

Quien tenga la URL puede ver y cambiar tus cosas. Está en tu `config.yaml` (no la subas a ningún repositorio) y se puede cambiar en LUNO → Ajustes → Claude, Siri y Hermes → Cambiar URL (y entonces hay que copiarla de nuevo en Claude, en el atajo de Siri y en Hermes). La skill pide a Hermes que confirme antes de cambios grandes o de borrar.

## Para quien desarrolla

- La skill nombra todas las herramientas del conector y solo esas: `src/lib/mcpSchemas.test.ts` falla si se añade una herramienta sin contarla en la skill o si la skill nombra una que no existe. El mismo test comprueba que los esquemas de entrada los aceptan los proveedores estrictos (Hermes puede usar modelos que no son Claude).
- El servidor es MCP por HTTP sin estado (POST con JSON-RPC, respuesta JSON; `GET` responde 405, que el cliente de Hermes trata como «sin flujo de eventos»). Las instrucciones generales también llegan en `initialize` (`INSTRUCTIONS` en `supabase/functions/mcp/server.ts`).
