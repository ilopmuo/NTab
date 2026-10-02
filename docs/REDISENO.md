# LUNO — Rediseño visual (octubre 2026)

> Qué hemos cogido de Apple (iOS 26/27: Recordatorios, Fitness, Salud, Tiempo, Cartera, Atajos, Casa, Tiempo de uso) y de las apps que mejor se ven en su terreno (Things, Structured, Tiimo, Streaks, Gentler Streak, Daylio, Copilot Money, Flighty, Duolingo…), y cómo lo llevamos a LUNO, por fases.

## Decisión de partida: color por módulo

LUNO deja de ser monocromo. Cada módulo tiene su color de sistema (como las baldosas de Ajustes o las categorías de Salud) y ese color aparece en su icono, su cabecera, sus anillos y sus gráficos. **Las superficies siguen neutras** (casi negro / blanco roto) y el **acento** (índigo LUNO o el que elijas) sigue siendo solo para actuar: botones, selección, foco. El **lima** sigue siendo «hecho».

| Familia | Módulos y color |
|---|---|
| Esenciales | Hoy azul · Próximo rojo · Bandeja celeste · Calendario rosa |
| Día a día | Hábitos naranja · Rutinas verde azulado · Diario morado · Última vez marrón · Personas verde |
| Organizar | Foco índigo · Notas amarillo · Proyectos azul · Etiquetas gris · Listas verde azulado · Matriz naranja · Algún día marrón · Plantillas gris · Objetivos rojo · Revisión menta |
| Casa | Menú naranja · Compra verde · Cosas verde azulado |
| Dinero | Gastos menta · Pagos azul |

Reglas:
- Cada color tiene tres tonos por tema: **sólido** (`--m-x`, relleno de baldosas, anillos, barras), **tinta** (`--m-x-ink`, texto de color con contraste AA sobre fondo, celdas y hojas) y **sobre** (`--m-x-on`, el glifo encima del sólido). Un test lo comprueba.
- El texto largo nunca va en color: solo títulos cortos de tarjeta, cifras grandes y etiquetas.
- Los colores que el usuario ya elegía (áreas, proyectos, hábitos) vuelven a verse.

## Fases

### Fase 1 — Color por módulo (cimientos)
- Paleta de módulo en `index.css` (sólido / tinta / sobre, oscuro y claro) y test de contraste.
- `SectionIcon`: glifo blanco sobre baldosa del color del módulo (Ajustes de iOS).
- Cada sección con su color; barra lateral, «Más», paleta de comandos, editor de navegación y Ajustes ya coloreados.
- Cabecera de cada pantalla con un **halo** suave del color del módulo arriba que se funde con el fondo (Arc / Superlist / Tiempo).
- Pestaña activa del móvil en el color de su módulo.

### Fase 2 — Navegación como iOS 26
- Baldosas de la barra lateral como las listas inteligentes de Recordatorios: icono de color arriba a la izquierda, cifra grande arriba a la derecha y nombre abajo.
- «Más» como Atajos: baldosas con degradado del color del módulo, glifo y nombre en blanco.
- **Accesorio inferior** (el mini reproductor de Música): con una sesión de Foco en marcha, una cápsula de cristal sobre la barra de pestañas con el tiempo restante; al tocarla vuelves al temporizador.
- Bordes de desplazamiento suaves bajo la barra superior compacta (en vez de línea).

### Fase 3 — Hoy
- **Cabecera viva** según la hora (Tiempo): amanecer, día, atardecer y noche como un halo de color tenue tras el saludo.
- **Anillos de actividad** (Fitness): tareas, hábitos y foco en sus colores, con pista del mismo tono al 20 % y el extremo con sombra al pasar del 100 %.
- **Tarjeta «Ahora»** (Tiimo / Structured): el bloque o la tarea con hora en curso o la siguiente, con un arco que se vacía y «termina en 12 min».
- Las tarjetas laterales con cabecera de Salud: icono y título en el color de su módulo, con chevron.

### Fase 4 — Piezas compartidas
- `Section` y `Card` con cabecera de color de módulo (`tone` acepta cualquier color de la paleta o un hex).
- **Tarjeta de cifra** (Salud / Fitness): título de color, número grande, unidad pequeña en gris y mini gráfico.
- Estados vacíos con la baldosa del color del módulo.
- Gráficos de barras en el color de su módulo, con la barra de hoy resaltada y la media en línea discontinua (Tiempo de uso).

### Fase 5 — Módulos
- **Hábitos** (Streaks / Casa): cada hábito con su color en el anillo, el icono y la semana.
- **Proyectos y áreas** (Things): quesitos y secciones con su color.
- **Diario** (Daylio): el año en píxeles y el ánimo con colores de ánimo.
- **Gastos** (Copilot): categorías con color, barra de ritmo del mes y huchas que se llenan.
- **Calendario** (Structured / Calendario): bloques con el color de su área o proyecto y barra lateral de color.
- **Foco**: anillo y gráficos en índigo.

### Fase 6 — Momentos
- Hitos de racha (7, 30, 100, 365 días) con una tarjeta de celebración a pantalla completa, la cifra que sube y confeti con los colores del módulo (Duolingo / Fitness).
- Confeti multicolor al cerrar el día.
- Guía de diseño (`DESIGN.md`, `BRAND.md`) al día con todo lo anterior.

## Restricciones que se respetan
- JS de arranque ≤ 215 KB gzip: casi todo es CSS y componentes que ya cargan bajo demanda.
- Contraste AA en las 28 pantallas y los dos temas (axe en e2e) y en la paleta (test).
- «Reducir movimiento» y «Más contraste» siguen funcionando.
