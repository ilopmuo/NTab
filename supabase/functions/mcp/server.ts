/**
 * Servidor MCP (Model Context Protocol) de LUNO: responde a los mensajes
 * JSON-RPC que envía Claude. El almacenamiento se inyecta (`Store`), así que
 * se puede probar sin Supabase (src/lib/mcp.test.ts).
 */
import { houseAdd, houseDone, houseView, type HouseCtx } from './casa.ts'
import type { HouseOp } from '../_shared/house.ts'
import { ymdIn } from '../_shared/time.ts'
import { takeMed, viewMeds } from './meds.ts'
import { createHabit, listHabits, updateHabit } from './habits.ts'
import { createRoutine, deleteRoutines, listRoutines, updateRoutine } from './routines.ts'
import { DAYS_SCHEMA } from './days.ts'
import { logFocus, markDone, markRoutine, tellDay, tickShopping } from './day.ts'
import { createGoal, logContactTool, savePerson, updateProject } from './organize.ts'
import { buildSummary, eventLines, type EventLike, createNote, createProject, markReturned, saveThing, whereIs, lastTime, logLastTime, addShopping, listShopping, readJournal, writeJournal, whatNow, addExpenseTool, listExpenses, readMenu, planMenu, createRecipe, addCountdown, createTasks, listTemplates, markHabit, markPaid, savePayment, searchNotes, appendNoteTool, searchTasks, updateGoal, updateTasks, useTemplate, type Change, type Env, type NewTask, type Row, type SearchArgs } from './ntab.ts'

export interface Store {
  /** los registros del usuario (con `tables`, solo de esas tablas) */
  load(tables?: string[]): Promise<Row[]>
  save(rows: Row[], deletes?: Row[]): Promise<void>
  /** eventos de los calendarios externos entre dos instantes (ms) */
  events?(from: number, to: number): Promise<{ events: EventLike[]; names: Record<string, string> }>
  /** su casa compartida (si tiene) y guardar cambios en ella */
  house?(): Promise<HouseCtx | null>
  houseOps?(ops: HouseOp[]): Promise<void>
}

export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
export const SERVER_INFO = { name: 'ntab', title: 'LUNO', version: '1.0.0' }

const INSTRUCTIONS = `LUNO es el sistema personal con el que el usuario organiza su vida: tareas, proyectos, hábitos, rutinas, objetivos, pagos, personas y sus cosas. Es muy despistado: ayúdale a no olvidar nada.
- Ante «¿dónde dejé…?», «¿quién tiene mi…?» o «¿cuándo caduca…?», usa donde_esta; si te cuenta dónde guarda algo, a quién presta algo o que algo caduca, apúntalo con guardar_cosa.
- Para lo que no puede olvidar (llamadas importantes), crea la tarea con hora e insistir. Sus pastillas van en Medicación: ante «¿me he tomado la pastilla?», mira MEDICACIÓN DE HOY en el resumen o usa ver_medicacion; «me la he tomado» se marca con tomar_medicacion.
- Si algo depende de otra persona («le he pedido a Ana el presupuesto», «espero la respuesta del casero»), crea la tarea con esperando: sale de Hoy y vuelve en unos días para que pregunte. Las de A LA ESPERA no son trabajo suyo: cuando llegue su fecha, propón preguntar.
- Lo que haya que comprar va a la lista de la compra (anadir_compra), no a tareas. Lo que hace de vez en cuando («he cambiado las sábanas») va a lo_he_hecho.
- Para un hábito nuevo («quiero beber 8 vasos de agua al día»), crear_habito; para verlos con su racha, ver_habitos; para cambiarlo o dejarlo, actualizar_habito. «Me he bebido 2 vasos» se marca con marcar_habito.
- Rutinas (listas de pasos que hace siempre igual): crear_rutina, ver_rutinas y actualizar_rutina. borrar_rutina las manda a la Papelera: confirma con él antes de borrar.
- Si te cuenta su día (lo que ha hecho, con quién ha hablado, qué ha comido, en qué ha gastado, cómo se siente, lo que tiene que hacer mañana…), apúntalo TODO de una vez con contar_dia: rellena cada apartado que salga y escribe en el diario un resumen con sus palabras. Luego cuéntale en pocas líneas qué has apuntado y pregunta lo que no encajó.
- «He hecho X» suelto: marcar_hecho (completa la tarea, el hábito, la rutina o «Última vez» que encaje). Rato concentrado en algo: apuntar_foco. «He comprado…»: tachar_compra.
- Datos de una persona (cumpleaños, teléfono, ideas de regalo, cada cuánto hablar): guardar_persona. Proyectos: crear_proyecto y actualizar_proyecto (terminarlo, pausarlo, fecha límite). Objetivos: crear_objetivo y actualizar_objetivo.
- Para consultar lo que tiene apuntado en sus notas, buscar_notas; para añadir a una nota que ya tiene (ideas, la maleta…), anadir_a_nota.
- Si vive con compañeros (CASA COMPARTIDA en el resumen), lo común va al piso con anadir_a_casa: la compra de casa, las tareas de casa (por turnos: sacar la basura, limpiar el baño) y los gastos que se reparten; «he sacado la basura» va a hecho_en_casa. Lo suyo personal, como siempre.
- Si menciona un gasto («me he gastado 20 en la cena»), apúntalo con apuntar_gasto (con etiqueta si es de un viaje). Si se apunta a algo que se cobra cada mes o a una prueba gratis, guárdalo con guardar_pago. Ante «tengo un rato, ¿qué hago?», usa que_hago.
- Para comidas de la semana, planificar_menu (y crear_receta para guardar recetas con sus ingredientes).
- Para preguntas sobre su agenda o para planificar, llama primero a ver_resumen.
- Los cambios se guardan al momento y aparecen en todos sus dispositivos. Antes de cambios grandes (muchas tareas, reprogramar varias cosas), propón el plan y espera su confirmación.
- Al planificar, ten en cuenta sus reuniones y la carga del día (duración estimada de las tareas); si un día pasa de 6 h, propón mover algo. Para poner hora a algo, elige uno de los HUECOS LIBRES del resumen (y para lo que exige concentración, mejor en sus horas de FOCO). Ayúdale a elegir lo importante del día (hasta 3) y márcalo con importante=true. Si una tarea lleva muchas veces pospuesta, propón dejarla para algún día o partirla en algo más pequeño.
- Títulos de tarea cortos y que empiecen por un verbo. Fechas en formato YYYY-MM-DD y horas HH:MM, en su zona horaria.
- Responde en español.`

const DATE = { type: 'string', description: 'YYYY-MM-DD' }
const TIME = { type: 'string', description: 'HH:MM (24 h)' }
const PRIORITY = { type: 'integer', minimum: 0, maximum: 3, description: '0 ninguna, 1 baja, 2 media, 3 alta' }
const NAG = { type: 'integer', minimum: 5, description: 'Repetir el aviso cada N minutos hasta que la marque como hecha (para lo que no puede olvidar: pastillas, llamadas…). Necesita hora.' }
const DURATION = { type: 'integer', minimum: 1, description: 'Minutos que calculas que llevará (para no sobrecargar el día)' }

/** Una tarea nueva (crear_tareas y contar_dia) */
const TASK_ITEM = {
  type: 'object',
  properties: {
    titulo: { type: 'string', description: 'Corto, empieza por un verbo' },
    fecha: DATE,
    hora: TIME,
    fecha_limite: { ...DATE, description: 'YYYY-MM-DD: para cuándo tiene que estar hecha («antes del viernes»), aparte de cuándo hacerla' },
    algun_dia: { type: 'boolean', description: 'Para «algún día»: sin fecha y fuera de la Bandeja (ideas, lo que no es ahora)' },
    prioridad: PRIORITY,
    notas: { type: 'string' },
    proyecto: { type: 'string', description: 'Nombre de un proyecto existente' },
    seccion: { type: 'string', description: 'Sección dentro del proyecto («Diseño»); si no existe, se crea' },
    etiquetas: { type: 'array', items: { type: 'string' } },
    subtareas: { type: 'array', items: { type: 'string' } },
    personas: { type: 'array', items: { type: 'string' }, description: 'Personas relacionadas (por nombre): la tarea aparece en su ficha' },
    duracion: DURATION,
    insistir: NAG,
    importante: { type: 'boolean', description: 'De lo importante del día (hasta 3; de hoy si no tiene fecha)' },
    esperando: { type: 'string', description: 'A la espera de esta persona (algo que depende de otro: «le he pedido a Ana el presupuesto»). Sin fecha, vuelve en 3 días para que pregunte' },
  },
  required: ['titulo'],
}

export const TOOLS = [
  {
    name: 'ver_resumen',
    title: 'Ver resumen de LUNO',
    description:
      'Resumen completo: fecha y hora actuales, tareas atrasadas, con fecha y sin fecha (con sus id), proyectos, objetivos, hábitos de hoy, pagos próximos, personas (cumpleaños y a quién llamar), los huecos libres de hoy y mañana y su foco (hoy, la semana, la racha y sus mejores horas). Úsalo antes de responder sobre la agenda o planificar.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'contar_dia',
    title: 'Contar el día',
    description:
      'Apunta de una vez todo lo que cuenta de su día (por defecto hoy): lo hecho (completa tareas, hábitos, rutinas o «Última vez»), hábitos con cantidad, rutinas, ratos de foco, con quién ha hablado (crea a la persona si no está), comida y cena, gastos, lo comprado, lo que tiene que hacer (sin fecha, para el día siguiente) y el diario con su ánimo. Rellena solo lo que haya contado. Devuelve qué se apuntó y qué no encajó.',
    inputSchema: {
      type: 'object',
      properties: {
        fecha: { ...DATE, description: 'YYYY-MM-DD del día que cuenta (por defecto hoy; no futura)' },
        hecho: { type: 'array', items: { type: 'string' }, description: 'Lo que ha hecho, una cosa por elemento y como lo dice: «he llamado al banco», «regar las plantas»' },
        habitos: {
          type: 'array',
          items: { type: 'object', properties: { habito: { type: 'string' }, cantidad: { type: 'number', description: 'Cuánto sumar (2 vasos)' } }, required: ['habito'] },
          description: 'Hábitos con cantidad o que quieras marcar por su nombre',
        },
        rutinas: { type: 'array', items: { type: 'string' }, description: 'Rutinas que ha hecho enteras (por su nombre)' },
        foco: {
          type: 'array',
          items: { type: 'object', properties: { que: { type: 'string', description: 'En qué (una tarea o algo libre)' }, minutos: { type: 'integer', minimum: 1, maximum: 720 }, hora_fin: TIME }, required: ['que', 'minutos'] },
          description: 'Ratos concentrado en algo («2 horas con el informe»)',
        },
        personas: {
          type: 'array',
          items: {
            type: 'object',
            properties: { nombre: { type: 'string' }, tipo: { type: 'string', enum: ['llamada', 'mensaje', 'reunión', 'email', 'otro'] }, resumen: { type: 'string', description: 'De qué hablasteis' } },
            required: ['nombre'],
          },
          description: 'Con quién ha hablado o quedado',
        },
        comida: { type: 'string', description: 'Qué ha comido a mediodía' },
        cena: { type: 'string', description: 'Qué ha cenado' },
        gastos: {
          type: 'array',
          items: { type: 'object', properties: { texto: { type: 'string', description: '«12,50 café»' }, importe: { type: 'number' }, concepto: { type: 'string' }, categoria: { type: 'string', enum: ['super', 'comer', 'transporte', 'casa', 'ocio', 'salud', 'ropa', 'regalos', 'otros'] } } },
          description: 'En qué ha gastado (texto libre o importe y concepto)',
        },
        comprado: { type: 'array', items: { type: 'string' }, description: 'Lo que ha comprado: se tacha de la lista de la compra' },
        tareas: { type: 'array', items: TASK_ITEM, description: 'Lo que tiene que hacer. Sin fecha, van para el día siguiente al que cuenta' },
        diario: {
          type: 'object',
          properties: {
            texto: { type: 'string', description: 'Resumen del día con sus palabras (se añade a lo que hubiera)' },
            animo: { type: 'integer', minimum: 1, maximum: 5, description: '1 muy mal … 5 muy bien' },
            cosas_buenas: { type: 'array', items: { type: 'string' }, maxItems: 3 },
          },
        },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'marcar_hecho',
    title: 'Marcar como hecho',
    description: 'Marca lo que ha hecho («he llamado al banco», «he regado las plantas»): completa la tarea pendiente que encaje; si no, el hábito, la rutina o «Última vez». Si nada encaja, lo dice.',
    inputSchema: {
      type: 'object',
      properties: { cosas: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'Una cosa por elemento, como la dice' }, fecha: { ...DATE, description: 'Para hábitos, rutinas y «Última vez»: el día (por defecto hoy)' } },
      required: ['cosas'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'ver_eventos',
    title: 'Ver eventos del calendario',
    description:
      'Eventos de los calendarios que el usuario ha conectado (Google, iCloud, Outlook…), en un rango de fechas. Solo lectura: úsalo para saber cuándo tiene reuniones o huecos libres.',
    inputSchema: { type: 'object', properties: { desde: DATE, hasta: DATE } },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'buscar_tareas',
    title: 'Buscar tareas',
    description: 'Busca tareas por texto, estado, fechas, proyecto o etiqueta. Devuelve sus id para poder cambiarlas.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Texto en el título, las notas o las etiquetas' },
        estado: { type: 'string', enum: ['pendientes', 'hechas', 'todas'], description: 'Por defecto, pendientes' },
        desde: DATE,
        hasta: DATE,
        proyecto: { type: 'string', description: 'Nombre del proyecto' },
        etiqueta: { type: 'string' },
        persona: { type: 'string', description: 'Tareas relacionadas con esta persona' },
        limite: { type: 'integer', minimum: 1, maximum: 200 },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'crear_tareas',
    title: 'Crear tareas',
    description:
      'Crea una o varias tareas en LUNO (por ejemplo, a partir de un email o una lista). Las tareas con hora avisan a su hora si el usuario tiene activado el aviso automático.',
    inputSchema: {
      type: 'object',
      properties: {
        tareas: {
          type: 'array',
          minItems: 1,
          items: TASK_ITEM,
        },
      },
      required: ['tareas'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'actualizar_tareas',
    title: 'Actualizar tareas',
    description: 'Cambia tareas existentes por su id: título, fecha, hora, prioridad, notas, proyecto, duración estimada o marcarlas como hechas. fecha u hora a null las quita.',
    inputSchema: {
      type: 'object',
      properties: {
        cambios: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              titulo: { type: 'string' },
              fecha: { type: ['string', 'null'], description: 'YYYY-MM-DD, o null para quitarla' },
              hora: { type: ['string', 'null'], description: 'HH:MM, o null para quitarla' },
              fecha_limite: { type: ['string', 'null'], description: 'YYYY-MM-DD (para cuándo tiene que estar), o null para quitarla' },
              algun_dia: { type: 'boolean', description: 'true: a «algún día» (quita la fecha); false: lo saca de ahí' },
              prioridad: PRIORITY,
              notas: { type: 'string' },
              proyecto: { type: ['string', 'null'], description: 'Nombre del proyecto, o null para sacarla' },
              hecha: { type: 'boolean' },
              duracion: { type: ['integer', 'null'], minimum: 1, description: 'Minutos estimados, o null para quitarla' },
              insistir: { type: ['integer', 'null'], minimum: 5, description: 'Repetir el aviso cada N minutos hasta que la haga, o null para dejar de insistir' },
              importante: { type: 'boolean', description: 'true: de lo importante de hoy (hasta 3, arriba en su Hoy); false: quitarlo' },
              esperando: { type: ['string', 'null'], description: 'A la espera de esta persona (vuelve a Hoy en 3 días si no tiene fecha), o null si ya no espera nada' },
            },
            required: ['id'],
          },
        },
      },
      required: ['cambios'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'buscar_notas',
    title: 'Buscar en las notas',
    description: 'Busca en sus notas (título, texto o #etiqueta) o lee una entera por su título («¿qué apunté en la nota de la reunión?», «¿qué me queda en la maleta?»). Si solo encaja una, la devuelve entera.',
    inputSchema: { type: 'object', properties: { buscar: { type: 'string' }, nota: { type: 'string', description: 'Título de la nota a leer entera' } } },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'anadir_a_nota',
    title: 'Añadir a una nota',
    description: 'Añade texto al final de una nota que ya existe (por su título); si no existe, la crea. Con como_lista, cada cosa (separada por comas o líneas) va como casilla «- [ ]»; si la nota ya es una lista, por defecto también.',
    inputSchema: {
      type: 'object',
      properties: { nota: { type: 'string', description: 'Título de la nota' }, texto: { type: 'string' }, como_lista: { type: 'boolean' } },
      required: ['nota', 'texto'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'crear_nota',
    title: 'Crear nota',
    description: 'Guarda una nota en LUNO (ideas, resúmenes, apuntes de una reunión…).',
    inputSchema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        contenido: { type: 'string', description: 'Texto; las líneas "- [ ] algo" se pueden convertir luego en tareas' },
        proyecto: { type: 'string' },
      },
      required: ['titulo'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'marcar_habito',
    title: 'Marcar hábito',
    description: 'Marca (o desmarca) un hábito como hecho en un día; por defecto, hoy. En hábitos con cantidad («beber agua: 8 vasos») suma `cantidad` o, sin ella, lo da por cumplido.',
    inputSchema: {
      type: 'object',
      properties: {
        habito: { type: 'string', description: 'Nombre del hábito' },
        fecha: DATE,
        hecho: { type: 'boolean', description: 'false para desmarcarlo; por defecto true' },
        cantidad: { type: 'number', description: 'Cuánto sumar en hábitos con cantidad (p. ej. 2 vasos)' },
      },
      required: ['habito'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'ver_habitos',
    title: 'Ver hábitos',
    description: 'Lista sus hábitos activos: días en que tocan, objetivo de cantidad, hora de aviso, área, racha actual y cómo va hoy. Al final, los archivados.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'crear_habito',
    title: 'Crear hábito',
    description:
      'Crea un hábito que quiere hacer con regularidad («meditar», «beber agua: 8 vasos al día»). Sale en Hoy los días que toca, avisa a su hora si no está hecho y se marca con marcar_habito. Si ya existe uno con ese nombre, no lo duplica.',
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Corto: «Meditar», «Beber agua», «Leer»' },
        dias: DAYS_SCHEMA('Días en que toca (por defecto, todos)'),
        hora: { ...TIME, description: 'HH:MM: avisarle a esta hora si aún no lo ha hecho (opcional)' },
        cantidad: { type: 'integer', minimum: 1, maximum: 1000, description: 'Objetivo al día para hábitos con cantidad (8 vasos, 20 min). Sin ella, hecho o no hecho' },
        unidad: { type: 'string', description: 'Unidad de la cantidad: «vasos», «min», «páginas»' },
        area: { type: 'string', description: 'Área de vida existente (Salud, Estudio, Trabajo, Personal…)' },
      },
      required: ['nombre'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'actualizar_habito',
    title: 'Actualizar hábito',
    description:
      'Cambia un hábito por su nombre: nombre, días, hora de aviso, cantidad y unidad o área (hora, cantidad o area a null los quitan). Con archivado=true lo deja (sale de Hoy, sin borrar su historial); con archivado=false lo recupera.',
    inputSchema: {
      type: 'object',
      properties: {
        habito: { type: 'string', description: 'Nombre actual del hábito' },
        nombre: { type: 'string', description: 'Nombre nuevo' },
        dias: DAYS_SCHEMA('Días nuevos en que toca'),
        hora: { type: ['string', 'null'], description: 'HH:MM del aviso, o null para quitarlo' },
        cantidad: { type: ['integer', 'null'], minimum: 1, maximum: 1000, description: 'Objetivo al día, o null para que sea hecho o no hecho' },
        unidad: { type: 'string', description: 'Unidad de la cantidad («vasos», «min»)' },
        area: { type: ['string', 'null'], description: 'Área existente, o null para quitarla' },
        archivado: { type: 'boolean', description: 'true: archivarlo (conserva el historial); false: recuperarlo' },
      },
      required: ['habito'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'crear_proyecto',
    title: 'Crear proyecto',
    description: 'Crea un proyecto (algo que necesita varias tareas: una mudanza, un viaje…). Después se le pueden añadir tareas con crear_tareas indicando el proyecto.',
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        area: { type: 'string', description: 'Área de vida (Trabajo, Personal, Salud…)' },
        descripcion: { type: 'string', description: '¿Qué significa terminarlo?' },
        limite: DATE,
      },
      required: ['nombre'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'actualizar_proyecto',
    title: 'Actualizar proyecto',
    description: 'Cambia un proyecto por su nombre: terminarlo, pausarlo o reactivarlo (estado), nombre, fecha límite (null la quita), descripción o área.',
    inputSchema: {
      type: 'object',
      properties: {
        proyecto: { type: 'string', description: 'Nombre del proyecto' },
        estado: { type: 'string', enum: ['activo', 'pausado', 'terminado'] },
        nombre: { type: 'string', description: 'Nombre nuevo' },
        limite: { type: ['string', 'null'], description: 'YYYY-MM-DD, o null para quitarla' },
        descripcion: { type: 'string', description: '¿Qué significa terminarlo?' },
        area: { type: ['string', 'null'], description: 'Área existente, o null para quitarla' },
      },
      required: ['proyecto'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'donde_esta',
    title: 'Dónde está',
    description: 'Busca en sus Cosas: dónde guardó algo, qué ha prestado y a quién, qué le han prestado y qué caduca. Úsalo ante «¿dónde dejé…?», «¿quién tiene mi…?», «¿cuándo caduca…?».',
    inputSchema: { type: 'object', properties: { busqueda: { type: 'string', description: 'Palabras: la cosa, el sitio o la persona' } }, required: ['busqueda'] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'guardar_cosa',
    title: 'Apuntar una cosa',
    description:
      'Apunta o actualiza (por nombre) una cosa: dónde la guardó, a quién se la prestó (tipo "prestado" + persona), quién se la prestó ("me lo prestaron") o cuándo caduca un documento ("caduca" + fecha). Para lo que compra: fecha, precio y hasta cuándo dura la garantía. LUNO avisa de las caducidades, del fin de la garantía y de reclamar o devolver préstamos.',
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        tipo: { type: 'string', enum: ['guardado', 'prestado', 'me lo prestaron', 'caduca'] },
        donde: { type: 'string', description: 'Dónde está guardado' },
        persona: { type: 'string', description: 'Para préstamos' },
        desde: DATE,
        devolver: { ...DATE, description: 'YYYY-MM-DD: cuándo reclamarlo o devolverlo' },
        caduca: { ...DATE, description: 'YYYY-MM-DD: fecha de caducidad' },
        garantia: { ...DATE, description: 'YYYY-MM-DD: hasta cuándo dura la garantía (avisa un mes antes). En España, 3 años desde la compra para lo nuevo' },
        comprado: { ...DATE, description: 'YYYY-MM-DD: cuándo se compró' },
        precio: { type: 'number', description: 'Lo que costó, en euros' },
        estancia: { type: 'string', description: 'Estancia de la casa: Cocina, Salón, Dormitorio…' },
        avisar_dias: { type: 'integer', minimum: 1, description: 'Días antes de caducar para avisar (por defecto 30)' },
        notas: { type: 'string' },
      },
      required: ['nombre'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'marcar_devuelto',
    title: 'Marcar préstamo devuelto',
    description: 'Marca como devuelto un préstamo (lo que prestó o lo que le prestaron).',
    inputSchema: { type: 'object', properties: { cosa: { type: 'string', description: 'Nombre de la cosa o de la persona' } }, required: ['cosa'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'apuntar_gasto',
    title: 'Apuntar un gasto',
    description: 'Apunta un gasto. Vale texto libre («12,50 café», «ayer 20 cena», «30 museo #roma») o importe y concepto. La categoría se pone sola si no la das (usa la que el usuario le enseñó a la app). Las etiquetas juntan los gastos de un viaje o un plan. Avisa si se pasa del presupuesto o del límite de la categoría.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string' },
        etiquetas: { type: 'array', items: { type: 'string' }, description: 'Para juntar gastos de un viaje o plan («roma»)' },
        importe: { type: 'number', description: 'En euros' },
        concepto: { type: 'string' },
        categoria: { type: 'string', enum: ['super', 'comer', 'transporte', 'casa', 'ocio', 'salud', 'ropa', 'regalos', 'otros'] },
        fecha: DATE,
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'ver_gastos',
    title: 'Ver gastos',
    description: 'Gastos de un mes (por defecto el actual): total, presupuesto, proyección, por categoría con sus límites, etiquetas, los últimos 6 meses y los últimos gastos. Con «buscar», busca en todos los meses (concepto, categoría o #etiqueta) y da el total: «¿cuánto llevo gastado en Mercadona?», «¿cuánto me costó el viaje a Roma?».',
    inputSchema: { type: 'object', properties: { mes: { type: 'string', description: 'YYYY-MM' }, buscar: { type: 'string', description: 'Texto o #etiqueta' } } },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'ver_menu',
    title: 'Ver el menú',
    description: 'El menú de la semana (comida y cena de cada día) y las recetas guardadas.',
    inputSchema: { type: 'object', properties: { desde: { ...DATE, description: 'Primer día (por defecto, el lunes de esta semana)' } } },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'planificar_menu',
    title: 'Planificar el menú',
    description: 'Pone qué se come en varios días. Si el plato coincide con una receta guardada, se enlaza (y sus ingredientes pueden ir a la compra). Propón el menú antes de guardarlo.',
    inputSchema: {
      type: 'object',
      properties: {
        comidas: {
          type: 'array',
          items: { type: 'object', properties: { fecha: DATE, comida: { type: 'string' }, cena: { type: 'string' } }, required: ['fecha'] },
        },
      },
      required: ['comidas'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'crear_receta',
    title: 'Guardar una receta',
    description: 'Guarda (o actualiza por nombre) una receta con sus ingredientes, uno por elemento, con cantidad («6 huevos», «200 g de harina»), y si los tienes, sus pasos y para cuántas personas es.',
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        ingredientes: { type: 'array', items: { type: 'string' } },
        pasos: { type: 'array', items: { type: 'string' }, description: 'Pasos en orden; los tiempos («20 minutos») salen como temporizadores en el modo cocina' },
        raciones: { type: 'integer', minimum: 1, description: 'Para cuántas personas son las cantidades' },
        minutos: { type: 'integer', minimum: 1, description: 'Tiempo total' },
        notas: { type: 'string' },
      },
      required: ['nombre', 'ingredientes'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'cuenta_atras',
    title: 'Crear una cuenta atrás',
    description: 'Crea (o cambia por nombre) una cuenta atrás para algo que espera: vacaciones, una boda, un examen. Se ve en Hoy.',
    inputSchema: { type: 'object', properties: { nombre: { type: 'string' }, fecha: DATE }, required: ['nombre', 'fecha'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'apuntar_foco',
    title: 'Apuntar foco',
    description: 'Apunta un rato de trabajo concentrado («he estado 2 horas con el informe»), como el modo foco de la app: cuenta para su foco del día, la semana y la racha.',
    inputSchema: {
      type: 'object',
      properties: {
        que: { type: 'string', description: 'En qué: una tarea (se enlaza si encaja) o algo libre' },
        minutos: { type: 'integer', minimum: 1, maximum: 720 },
        fecha: DATE,
        hora_fin: { ...TIME, description: 'HH:MM a la que terminó (por defecto, ahora)' },
      },
      required: ['que', 'minutos'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'que_hago',
    title: '¿Qué hago ahora?',
    description: 'Propone qué tareas hacer ahora según el tiempo que tiene y su energía (atrasadas, para hoy, prioridad, lo que cabe). Úsalo ante «tengo media hora, ¿qué hago?».',
    inputSchema: {
      type: 'object',
      properties: {
        minutos: { type: 'integer', minimum: 5, description: 'Tiempo disponible (por defecto 30)' },
        energia: { type: 'string', enum: ['poca', 'normal', 'mucha'] },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'ver_diario',
    title: 'Leer el diario',
    description: 'Lee su diario (ánimo, texto y cosas buenas de cada día). Por defecto, la última semana. Úsalo para hablar de cómo le va o hacer una revisión.',
    inputSchema: { type: 'object', properties: { desde: DATE, hasta: DATE } },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'escribir_diario',
    title: 'Escribir en el diario',
    description: 'Apunta en su diario cómo le ha ido el día: texto (se añade a lo que ya hubiera), ánimo de 1 (muy mal) a 5 (muy bien) y hasta tres cosas buenas. Úsalo si te cuenta su día y quiere guardarlo.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string' },
        animo: { type: 'integer', minimum: 1, maximum: 5 },
        cosas_buenas: { type: 'array', items: { type: 'string' }, maxItems: 3 },
        fecha: DATE,
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'ver_casa',
    title: 'Ver la casa compartida',
    description: 'Su piso compartido: las tareas de casa con a quién le toca cada una (por turnos), la lista de la compra común, quién debe a quién y el reparto de tareas del último mes.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'anadir_a_casa',
    title: 'Añadir a la casa compartida',
    description:
      'Apunta algo en el piso compartido, que ven al momento sus compañeros: tipo «compra» (cosas para casa: «papel higiénico y lavavajillas»), «tarea» (una tarea de casa; con cada_dias se repite por turnos entre todos) o «gasto» (algo pagado para el piso, que se reparte a partes iguales).',
    inputSchema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['compra', 'tarea', 'gasto'] },
        texto: { type: 'string', description: 'Lo que hay que comprar, el nombre de la tarea o el concepto del gasto' },
        cada_dias: { type: 'number', description: 'Tarea: cada cuántos días se repite (2 la basura, 7 el baño)' },
        para: { type: 'string', description: 'Tarea: a quién le toca (o por quién empiezan los turnos)' },
        fecha: { type: 'string', description: 'Tarea: desde cuándo (YYYY-MM-DD)' },
        importe: { type: 'number', description: 'Gasto: cuánto (en euros)' },
        pago: { type: 'string', description: 'Gasto: quién pagó (sin él, el usuario)' },
        entre: { type: 'array', items: { type: 'string' }, description: 'Gasto: entre quiénes se reparte (sin él, entre todos)' },
      },
      required: ['tipo', 'texto'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'hecho_en_casa',
    title: 'Tarea de casa hecha',
    description: 'Marca una tarea de casa del piso como hecha («he sacado la basura»): pasa el turno al siguiente y, si se repite, pone la próxima fecha.',
    inputSchema: {
      type: 'object',
      properties: {
        tarea: { type: 'string', description: 'La tarea (por su nombre)' },
        quien: { type: 'string', description: 'Quién la ha hecho, si no ha sido el usuario' },
      },
      required: ['tarea'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'ver_compra',
    title: 'Ver la lista de la compra',
    description: 'La lista de la compra pendiente, ordenada por pasillos (y por listas, si tiene varias: súper, farmacia…), con el total estimado si hay precios.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'anadir_compra',
    title: 'Añadir a la compra',
    description: 'Añade cosas a la lista de la compra. Acepta texto libre con cantidades («leche, 2 barras de pan y detergente») o una lista. LUNO las ordena por pasillos y no repite lo que ya está.',
    inputSchema: {
      type: 'object',
      properties: {
        cosas: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], description: 'Lo que hay que comprar; con precio si lo sabes («leche 1,20 €»)' },
        lista: { type: 'string', description: 'A qué lista (farmacia, ferretería…), si tiene varias. Sin ella, a la principal (súper).' },
      },
      required: ['cosas'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'tachar_compra',
    title: 'Tachar de la compra',
    description: 'Tacha de la lista de la compra lo que ya ha comprado («he comprado leche y pan»). Dice lo que no estaba en la lista.',
    inputSchema: {
      type: 'object',
      properties: { cosas: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], description: 'Lo comprado' } },
      required: ['cosas'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'ver_medicacion',
    title: 'Ver la medicación',
    description: '¿Se ha tomado la pastilla? Lo de hoy de cada medicamento (tomada y a qué hora, pendiente, sin tomar), cuántas quedan y cómo ha cumplido las dos últimas semanas.',
    inputSchema: { type: 'object', properties: { medicamento: { type: 'string', description: 'Solo este (por su nombre); sin él, todos' } } },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'tomar_medicacion',
    title: 'Marcar una toma',
    description: 'Apunta que se ha tomado (o saltado) un medicamento: la toma pendiente más cercana a ahora, o la de «hora». Descuenta de lo que queda.',
    inputSchema: {
      type: 'object',
      properties: { medicamento: { type: 'string' }, hora: { ...TIME, description: 'La toma de esta hora (HH:MM); sin ella, la más cercana a ahora' }, saltada: { type: 'boolean', description: 'true: no se la ha tomado a propósito (saltar la toma)' } },
      required: ['medicamento'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'ultima_vez',
    title: 'Última vez',
    description: '¿Cuándo fue la última vez que hizo algo que hace de vez en cuando (cambiar las sábanas, ir al dentista, regar las plantas)? Sin «cosa», lista todo.',
    inputSchema: { type: 'object', properties: { cosa: { type: 'string' } } },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'lo_he_hecho',
    title: 'Apuntar que lo ha hecho',
    description: 'Apunta en «Última vez» que ha hecho algo hoy (o en «fecha»). Si no existe, lo crea. Con cada_dias, LUNO le avisa cuando vuelva a tocar.',
    inputSchema: {
      type: 'object',
      properties: { cosa: { type: 'string' }, fecha: DATE, cada_dias: { type: 'integer', minimum: 1, description: 'Cada cuántos días debería hacerlo' } },
      required: ['cosa'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'crear_rutina',
    title: 'Crear rutina',
    description:
      'Crea una rutina: una lista corta de pasos que hace siempre igual («Antes de salir de casa»: llaves, cartera, móvil…). LUNO le avisa a la hora y le guía paso a paso. Para lo que se repite con varios pasos, mejor una rutina que muchas tareas.',
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        pasos: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'Pasos cortos, en orden' },
        dias: DAYS_SCHEMA('Días en que toca (por defecto, todos)'),
        hora: { ...TIME, description: 'HH:MM para avisarle de empezarla (opcional)' },
      },
      required: ['nombre', 'pasos'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'ver_rutinas',
    title: 'Ver rutinas',
    description: 'Lista sus rutinas: nombre, días en que tocan, hora de aviso, sus pasos en orden y cómo va hoy.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'actualizar_rutina',
    title: 'Actualizar rutina',
    description: 'Cambia una rutina por su nombre: nombre, días, hora de aviso (null la quita) o pasos (manda la lista completa nueva, en orden; sustituye a la anterior).',
    inputSchema: {
      type: 'object',
      properties: {
        rutina: { type: 'string', description: 'Nombre actual de la rutina' },
        nombre: { type: 'string', description: 'Nombre nuevo' },
        dias: DAYS_SCHEMA('Días nuevos en que toca'),
        hora: { type: ['string', 'null'], description: 'HH:MM para avisarle de empezarla, o null para quitar el aviso' },
        pasos: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'Todos los pasos, cortos y en orden' },
      },
      required: ['rutina'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'borrar_rutina',
    title: 'Borrar rutinas',
    description: 'Borra una o varias rutinas por su nombre: dejan de salir en Hoy y de avisar, y van a la Papelera de LUNO (30 días). Si un nombre no existe, lo dice y sigue con las demás. Confirma con el usuario antes.',
    inputSchema: {
      type: 'object',
      properties: {
        rutinas: {
          description: 'Nombre de la rutina o lista de nombres',
          anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' }, minItems: 1 }],
        },
      },
      required: ['rutinas'],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'marcar_rutina',
    title: 'Marcar rutina',
    description: 'Marca una rutina como hecha un día (por defecto hoy), entera o solo algunos pasos; con hecha=false los desmarca.',
    inputSchema: {
      type: 'object',
      properties: {
        rutina: { type: 'string', description: 'Nombre de la rutina' },
        pasos: { type: 'array', items: { type: 'string' }, description: 'Solo estos pasos (por su nombre); sin ellos, todos' },
        fecha: DATE,
        hecha: { type: 'boolean', description: 'false para desmarcar' },
      },
      required: ['rutina'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'actualizar_objetivo',
    title: 'Actualizar objetivo',
    description: 'Actualiza un objetivo: poner la cifra (cifra), sumarle algo (sumar, p. ej. 1 libro más) o marcarlo como conseguido.',
    inputSchema: {
      type: 'object',
      properties: {
        objetivo: { type: 'string', description: 'Nombre del objetivo' },
        cifra: { type: 'number' },
        sumar: { type: 'number' },
        conseguido: { type: 'boolean' },
      },
      required: ['objetivo'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'crear_objetivo',
    title: 'Crear objetivo',
    description: 'Crea un objetivo. Con cifra (y unidad) se mide con un número que se va sumando («leer 12 libros»); con etiqueta y cifra, cuenta las tareas hechas con esa #etiqueta; con proyectos, por sus proyectos (que quedan vinculados).',
    inputSchema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        por_que: { type: 'string', description: 'Por qué le importa' },
        cifra: { type: 'number', description: 'A cuánto quiere llegar' },
        unidad: { type: 'string', description: '«libros», «kg», «€»' },
        etiqueta: { type: 'string', description: 'Contar las tareas hechas con esta etiqueta' },
        proyectos: { type: 'array', items: { type: 'string' }, description: 'Proyectos existentes que lo forman' },
        limite: DATE,
        area: { type: 'string', description: 'Área de vida existente' },
      },
      required: ['titulo'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'guardar_persona',
    title: 'Guardar persona',
    description: 'Añade una persona o completa su ficha por su nombre: cumpleaños, teléfono, email, empresa, cargo, notas (se añaden), etiquetas, cada cuántos días quiere hablar con ella e ideas de regalo.',
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        cumpleanos: { type: 'string', description: 'MM-DD, o YYYY-MM-DD si sabe el año' },
        telefono: { type: 'string' },
        email: { type: 'string' },
        empresa: { type: 'string' },
        cargo: { type: 'string' },
        notas: { type: 'string', description: 'Lo que conviene recordar de ella (se añade a lo que hubiera)' },
        etiquetas: { type: 'array', items: { type: 'string' }, description: '«familia», «trabajo»…' },
        cada_dias: { type: 'integer', minimum: 1, maximum: 365, description: 'Cada cuántos días quiere hablar con ella (LUNO avisa)' },
        idea_regalo: { type: 'array', items: { type: 'string' } },
      },
      required: ['nombre'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'registrar_contacto',
    title: 'Registrar contacto',
    description: 'Apunta que ha hablado con una persona (llamada, mensaje, reunión…) y actualiza su último contacto. Si no está en sus personas, la añade.',
    inputSchema: {
      type: 'object',
      properties: {
        persona: { type: 'string' },
        tipo: { type: 'string', enum: ['llamada', 'mensaje', 'reunión', 'email', 'otro'] },
        resumen: { type: 'string', description: 'De qué hablasteis' },
        fecha: DATE,
      },
      required: ['persona'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'guardar_pago',
    title: 'Apuntar un pago que se repite',
    description:
      'Apunta o cambia (por nombre) una suscripción, un recibo o una prueba gratis. En una prueba gratis, pon «prueba_hasta»: LUNO avisa antes de que empiece a cobrar. Si cambia el precio, se guarda el anterior para ver las subidas.',
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        importe: { type: 'number', description: 'Lo que cuesta cada vez' },
        cada: { type: 'string', enum: ['semana', 'mes', 'trimestre', 'año'] },
        proximo: { ...DATE, description: 'Próximo cargo' },
        tipo: { type: 'string', enum: ['suscripcion', 'recibo'], description: 'suscripcion: se cobra sola; recibo: hay que pagarlo' },
        prueba_hasta: { ...DATE, description: 'Si es una prueba gratis: el día que acaba (primer cargo)' },
        categoria: { type: 'string', description: 'Streaming, casa, software…' },
        aviso_dias: { type: 'number', description: 'Días antes del cargo para avisar' },
        baja: { type: 'string', description: 'Enlace para darse de baja' },
        activo: { type: 'boolean', description: 'false para pausarlo' },
      },
      required: ['nombre'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'marcar_pago',
    title: 'Marcar pago como pagado',
    description: 'Marca un recibo o pago recurrente como pagado: pasa al siguiente cargo.',
    inputSchema: {
      type: 'object',
      properties: { pago: { type: 'string', description: 'Nombre del pago (alquiler, luz…)' } },
      required: ['pago'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: 'ver_plantillas',
    title: 'Ver plantillas',
    description: 'Lista las plantillas del usuario (listas reutilizables: maleta de viaje, cierre de mes…) con sus tareas.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'usar_plantilla',
    title: 'Usar plantilla',
    description:
      'Crea las tareas de una plantilla con fechas relativas al día de inicio. Con como="proyecto" crea además un proyecto; con proyecto="nombre" (sin como) las añade a un proyecto existente.',
    inputSchema: {
      type: 'object',
      properties: {
        plantilla: { type: 'string', description: 'Nombre de la plantilla' },
        fecha_inicio: DATE,
        como: { type: 'string', enum: ['proyecto', 'tareas'], description: 'proyecto: crea un proyecto nuevo; tareas: tareas sueltas (por defecto)' },
        proyecto: { type: 'string', description: 'Nombre del proyecto nuevo, o de uno existente donde añadirlas' },
      },
      required: ['plantilla'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
]

interface RpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const ok = (id: RpcRequest['id'], result: unknown) => ({ jsonrpc: '2.0', id, result })
const fail = (id: RpcRequest['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
const text = (s: string, isError = false) => ({ content: [{ type: 'text', text: s }], ...(isError ? { isError: true } : {}) })

async function callTool(name: string, args: Record<string, unknown>, store: Store, env: Env) {
  const rows = await store.load()
  switch (name) {
    case 'ver_resumen': {
      const cal = store.events ? await store.events(env.now - 864e5, env.now + 8 * 864e5).catch(() => undefined) : undefined
      const house = store.house ? ((await store.house().catch(() => null)) ?? undefined) : undefined
      if (cal) {
        const soon = cal.events.filter((e) => Date.parse(e.allDay ? `${e.end}T00:00:00Z` : e.end) > env.now)
        return text(buildSummary(rows, env, { events: soon, names: cal.names }, house))
      }
      return text(buildSummary(rows, env, undefined, house))
    }
    case 'ver_casa':
    case 'anadir_a_casa':
    case 'hecho_en_casa': {
      const house = store.house ? await store.house() : null
      if (!house) return text('No tiene casa compartida en LUNO: se crea en Casa → Tareas.')
      const today = ymdIn(env.now, env.tz)
      if (name === 'ver_casa') return text(houseView(house, today, env.now))
      const r = name === 'anadir_a_casa' ? houseAdd(house, args, { now: env.now, today, newId: env.newId }) : houseDone(house, args, { now: env.now, today })
      if (r.ops.length) await store.houseOps!(r.ops)
      return text(r.report)
    }
    case 'ver_eventos': {
      if (!store.events) return text('No hay calendarios conectados.')
      const from = isDate(args.desde) ? Date.parse(`${args.desde}T00:00:00Z`) - 864e5 : env.now - 864e5
      const to = isDate(args.hasta) ? Date.parse(`${args.hasta}T00:00:00Z`) + 2 * 864e5 : env.now + 8 * 864e5
      const cal = await store.events(from, Math.min(to, from + 95 * 864e5))
      if (!Object.keys(cal.names).length) return text('No hay calendarios conectados. Se conectan en LUNO → Ajustes → Calendarios.')
      const lines = eventLines(cal.events, cal.names, env).filter((l) => {
        const m = l.match(/\((\d{4}-\d{2}-\d{2})\)/)
        return !m || ((!isDate(args.desde) || m[1] >= (args.desde as string)) && (!isDate(args.hasta) || m[1] <= (args.hasta as string)))
      })
      return text(lines.length ? lines.join('\n') : 'No hay eventos en esas fechas.')
    }
    case 'buscar_tareas':
      return text(searchTasks(rows, args as SearchArgs, env))
    case 'crear_tareas': {
      if (!Array.isArray(args.tareas)) return text('Falta la lista "tareas".', true)
      const r = createTasks(rows, args.tareas as NewTask[], env)
      if (r.writes.length) await store.save(r.writes)
      return text(r.report.join('\n'), !r.writes.length)
    }
    case 'actualizar_tareas': {
      if (!Array.isArray(args.cambios)) return text('Falta la lista "cambios".', true)
      const r = updateTasks(rows, args.cambios as Change[], env)
      if (r.writes.length) await store.save(r.writes)
      return text(r.report.join('\n'), !r.writes.length)
    }
    case 'crear_nota': {
      const r = createNote(rows, args, env)
      await store.save(r.writes)
      return text(r.report.join('\n'))
    }
    case 'marcar_habito': {
      const r = markHabit(rows, args, env)
      if (r.writes.length || r.deletes.length) await store.save(r.writes, r.deletes)
      return text(r.report.join('\n'))
    }
    case 'ver_habitos':
      return text(listHabits(rows, args, env))
    case 'ver_rutinas':
      return text(listRoutines(rows, args, env))
    case 'contar_dia':
    case 'marcar_hecho':
    case 'marcar_rutina':
    case 'apuntar_foco':
    case 'tachar_compra': {
      const fn = { contar_dia: tellDay, marcar_hecho: markDone, marcar_rutina: markRoutine, apuntar_foco: logFocus, tachar_compra: tickShopping }[name]
      const r = fn(rows, args, env)
      if (r.writes.length || r.deletes?.length) await store.save(r.writes, r.deletes)
      return text(r.report.join('\n'), !r.writes.length && !r.deletes?.length)
    }
    case 'borrar_rutina': {
      const r = deleteRoutines(rows, args, env)
      if (r.writes.length || r.deletes.length) await store.save(r.writes, r.deletes)
      return text(r.report.join('\n'), !r.deletes.length)
    }
    case 'ver_plantillas':
      return text(listTemplates(rows))
    case 'usar_plantilla': {
      const r = useTemplate(rows, args, env)
      if (r.writes.length) await store.save(r.writes)
      return text(r.report.join('\n'), !r.writes.length)
    }
    case 'donde_esta':
      return text(whereIs(await store.load(), args, env))
    case 'ultima_vez':
      return text(lastTime(await store.load(), args, env))
    case 'ver_compra':
      return text(listShopping(await store.load()))
    case 'ver_medicacion':
      return text(viewMeds(rows, args, env))
    case 'tomar_medicacion': {
      const r = takeMed(rows, args, env)
      if (r.writes.length) await store.save(r.writes)
      return text(r.report.join('\n'))
    }
    case 'ver_menu':
      return text(readMenu(await store.load(), args, env))
    case 'ver_gastos':
      return text(listExpenses(await store.load(), args, env))
    case 'buscar_notas':
      return text(searchNotes(await store.load(), args, env))
    case 'que_hago':
      return text(whatNow(await store.load(), args, env))
    case 'ver_diario':
      return text(readJournal(await store.load(), args, env))
    case 'crear_proyecto':
    case 'cuenta_atras':
    case 'planificar_menu':
    case 'crear_receta':
    case 'apuntar_gasto':
    case 'escribir_diario':
    case 'anadir_compra':
    case 'lo_he_hecho':
    case 'guardar_cosa':
    case 'marcar_devuelto':
    case 'crear_rutina':
    case 'actualizar_objetivo':
    case 'registrar_contacto':
    case 'anadir_a_nota':
    case 'guardar_pago':
    case 'marcar_pago':
    case 'crear_habito':
    case 'actualizar_habito':
    case 'actualizar_rutina':
    case 'guardar_persona':
    case 'actualizar_proyecto':
    case 'crear_objetivo': {
      const fn = { guardar_persona: savePerson, actualizar_proyecto: updateProject, crear_objetivo: createGoal, crear_habito: createHabit, actualizar_habito: updateHabit, actualizar_rutina: updateRoutine, anadir_a_nota: appendNoteTool, guardar_pago: savePayment, crear_proyecto: createProject, cuenta_atras: addCountdown, planificar_menu: planMenu, crear_receta: createRecipe, apuntar_gasto: addExpenseTool, escribir_diario: writeJournal, anadir_compra: addShopping, lo_he_hecho: logLastTime, guardar_cosa: saveThing, marcar_devuelto: markReturned, crear_rutina: createRoutine, actualizar_objetivo: updateGoal, registrar_contacto: logContactTool, marcar_pago: markPaid }[name]
      const r = fn(rows, args, env)
      if (r.writes.length) await store.save(r.writes)
      return text(r.report.join('\n'), !r.writes.length)
    }
    default:
      return null
  }
}

/** Responde a un mensaje JSON-RPC. Devuelve null para las notificaciones (sin respuesta). */
export async function handleMessage(msg: RpcRequest, store: Store, env: Env): Promise<unknown | null> {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(msg?.id, -32600, 'Invalid Request')
  const isNotification = msg.id === undefined || msg.id === null
  if (isNotification) return null
  const params = msg.params ?? {}
  try {
    switch (msg.method) {
      case 'initialize': {
        const asked = String(params.protocolVersion ?? '')
        return ok(msg.id, {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        })
      }
      case 'ping':
        return ok(msg.id, {})
      case 'tools/list':
        return ok(msg.id, { tools: TOOLS })
      case 'tools/call': {
        const name = String(params.name ?? '')
        const result = await callTool(name, (params.arguments as Record<string, unknown>) ?? {}, store, env)
        return result ? ok(msg.id, result) : fail(msg.id, -32602, `Herramienta desconocida: ${name}`)
      }
      case 'resources/list':
        return ok(msg.id, { resources: [] })
      case 'prompts/list':
        return ok(msg.id, { prompts: [] })
      default:
        return fail(msg.id, -32601, `Método no disponible: ${msg.method}`)
    }
  } catch (e) {
    // Un fallo al leer o guardar se devuelve como error de la herramienta para que Claude lo cuente
    if (msg.method === 'tools/call') return ok(msg.id, text(`No se pudo completar: ${e instanceof Error ? e.message : String(e)}`, true))
    return fail(msg.id, -32603, e instanceof Error ? e.message : 'Error interno')
  }
}
