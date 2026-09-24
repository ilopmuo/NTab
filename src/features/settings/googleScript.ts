/**
 * Script de Google Apps Script que copia NTab en un calendario de Google y lo
 * mantiene al día cada 5 minutos: crea, cambia y BORRA eventos. Google tarda
 * horas en refrescar los calendarios suscritos por URL; así no hace falta.
 *
 * Se ejecuta en la cuenta de Google del usuario (script.google.com), sin
 * proyectos de Google Cloud ni claves. Probado con src/lib/googleScript.test.ts.
 */
export function googleScript(jsonUrl: string) {
  return `/**
 * NTab → Google Calendar
 * Copia tus tareas, pagos y cumpleaños de NTab en el calendario «NTab» de tu
 * Google Calendar y lo mantiene al día cada 5 minutos (también borra lo que
 * borras o completas en NTab).
 *
 * Instalación: elige la función «instalar» arriba y pulsa ▶ Ejecutar.
 */
const NTAB_URL = '${jsonUrl}';
const NOMBRE_CALENDARIO = 'NTab';
const DIAS_ATRAS = 60;
const DIAS_ADELANTE = 400;

function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(5).create();
  sincronizar();
}

function desinstalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

function sincronizar() {
  const res = UrlFetchApp.fetch(NTAB_URL, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('NTab respondió ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  }
  const eventos = JSON.parse(res.getContentText()).events;
  const cal = calendario();
  const desde = new Date(Date.now() - DIAS_ATRAS * 864e5);
  const hasta = new Date(Date.now() + DIAS_ADELANTE * 864e5);

  // Lo que ya hay en Google, por identificador de NTab
  const actuales = {};
  cal.getEvents(desde, hasta).forEach(function (e) {
    const uid = e.getTag('ntab');
    if (!uid) return;
    if (actuales[uid]) { e.deleteEvent(); return; } // duplicado
    actuales[uid] = e;
  });

  const vistos = {};
  let creados = 0, cambiados = 0, borrados = 0;
  eventos.forEach(function (ev) {
    const inicio = ev.allDay ? dia(ev.start) : new Date(ev.start);
    if (inicio < desde || inicio > hasta) return;
    vistos[ev.uid] = true;
    const e = actuales[ev.uid];
    if (e && e.getTag('ntab-hash') === ev.hash) return;
    if (e && e.isAllDayEvent() === ev.allDay) {
      e.setTitle(ev.title);
      e.setDescription(ev.description || '');
      if (ev.allDay) e.setAllDayDate(dia(ev.start));
      else e.setTime(new Date(ev.start), new Date(ev.end));
      e.setTag('ntab-hash', ev.hash);
      cambiados++;
      return;
    }
    if (e) e.deleteEvent();
    const nuevo = ev.allDay
      ? cal.createAllDayEvent(ev.title, dia(ev.start), { description: ev.description || '' })
      : cal.createEvent(ev.title, new Date(ev.start), new Date(ev.end), { description: ev.description || '' });
    nuevo.setTag('ntab', ev.uid);
    nuevo.setTag('ntab-hash', ev.hash);
    creados++;
  });

  Object.keys(actuales).forEach(function (uid) {
    if (!vistos[uid]) { actuales[uid].deleteEvent(); borrados++; }
  });
  console.log('NTab: ' + creados + ' creados, ' + cambiados + ' cambiados, ' + borrados + ' borrados');
}

function calendario() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('calendario');
  let cal = id ? CalendarApp.getCalendarById(id) : null;
  if (!cal) {
    const mios = CalendarApp.getOwnedCalendarsByName(NOMBRE_CALENDARIO);
    cal = mios.length ? mios[0] : CalendarApp.createCalendar(NOMBRE_CALENDARIO, { color: CalendarApp.Color.BLUE });
    props.setProperty('calendario', cal.getId());
  }
  return cal;
}

function dia(ymd) {
  const p = ymd.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}
`
}
