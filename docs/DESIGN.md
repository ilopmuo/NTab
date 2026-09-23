# NTab — Sistema de diseño

> Referencias: Recordatorios, Fitness, Calendario y Ajustes de Apple (iOS 26 / macOS Tahoe).
> Nada de "tarjetas oscuras con borde gris y un acento azul": materiales, profundidad, color con significado y movimiento con física.

## 1. Principios

1. **El color significa algo.** Cada sección tiene un color fijo, que se repite en su icono, en su título, en los anillos y en el halo del fondo. Si ves naranja, estás mirando lo que viene.
2. **Profundidad, no cajas.** El fondo es un degradado ambiental vivo. El contenido flota encima en *materiales* translúcidos (cristal con desenfoque), como en iOS.
3. **Listas agrupadas.** Las filas van en bloques redondeados con separadores finos que empiezan tras el icono (*inset grouped*), como en Ajustes y Recordatorios.
4. **Títulos grandes que se compactan.** Cada vista abre con un título grande. Al hacer scroll aparece una barra de cristal con el título pequeño.
5. **Movimiento con física.** Muelles (*springs*), nunca transiciones lineales. Todo entra escalonado y todo sale con animación. Si el sistema pide menos movimiento, se respeta.
6. **Nunca una pantalla vacía.** Hoy es un panel con anillos, agenda y widgets. Un estado vacío explica qué hacer y ofrece un botón.

## 2. Color semántico

| Color | Oscuro | Claro | Significa | Dónde |
|---|---|---|---|---|
| Azul | `#0A84FF` | `#007AFF` | **Hoy**, foco, acción principal | Hoy, botones, selección |
| Naranja | `#FF9F0A` | `#FF9500` | **Lo que viene** | Próximo, prioridad media |
| Rojo | `#FF453A` | `#FF3B30` | **Urgente o atrasado** | Atrasadas, prioridad alta, borrar |
| Verde | `#30D158` | `#34C759` | **Hecho, constancia** | Completar, hábitos, rachas |
| Verde azulado | `#40C8E0` | `#30B0C7` | **Tiempo** | Calendario, horas |
| Índigo | `#5E5CE6` | `#5856D6` | **Objetivos** | Proyectos, revisión semanal |
| Morado | `#BF5AF2` | `#AF52DE` | **Personas** | Personas, cumpleaños |
| Amarillo | `#FFD60A` | `#FFCC00` | **Ideas** | Notas |
| Gris | `#8E8E93` | `#8E8E93` | **Sin procesar / sistema** | Bandeja, Ajustes, Completadas |

Las áreas (Trabajo, Salud…) conservan el color que elija el usuario.

## 3. Superficies

- **Fondo:** oscuro `#000` y claro `#F2F2F7` (el gris agrupado de Apple, no blanco puro). Encima van dos o tres halos difuminados que se mueven muy despacio:
  - uno con el color de la sección actual;
  - otro según la hora: cálido por la mañana, azul por la tarde, índigo por la noche.
- **Material:** blanco o gris casi negro al 60–75 %, con `backdrop-filter: blur(40px) saturate(180%)`, borde de 0,5 px y un brillo interior de 1 px arriba.
- **Rellenos de control:** `rgba(120,120,128,.12/.24)`, igual que `systemFill` en iOS.

## 4. Tipografía

- Pila `-apple-system` → en iPhone, iPad y Mac se usa **SF Pro** de verdad. Inter queda de respaldo en Windows y Android.
- Números en **SF Pro Rounded** (`ui-rounded`), como en Fitness y Salud.
- Escala:
  - título grande: 34 px, negrita, tracking −0,02 em;
  - título de bloque: 20 px, seminegrita;
  - cuerpo: 15–17 px;
  - notas al pie: 13 px.

## 5. Movimiento

| Momento | Animación |
|---|---|
| Arranque | El logo aparece con un muelle y el contenido entra escalonado |
| Cambio de vista | Fundido con desplazamiento de 8 px y desenfoque, en 250 ms |
| Completar tarea | El círculo se rellena con un muelle, el ✓ se dibuja y la fila se pliega |
| Selección en la barra lateral | La píldora se desliza al nuevo elemento (*shared layout*) |
| Hojas y modales | Suben o crecen con muelle; en móvil se cierran arrastrando hacia abajo |
| Anillos y números | Se llenan y cuentan desde cero al aparecer |
