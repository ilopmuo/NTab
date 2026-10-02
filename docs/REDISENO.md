# LUNO — Rediseño visual (octubre 2026)

> Qué hemos cogido de Apple (iOS 26/27: Recordatorios, Fitness, Salud, Tiempo, Cartera, Atajos, Música, Tiempo de uso) y de las apps que mejor se ven en su terreno (Things, Structured, Tiimo, Streaks, Gentler Streak, Daylio, Copilot Money, Flighty, Duolingo…), y cómo lo llevamos a LUNO, por fases.

## Decisión de partida: LUNO sigue siendo monocromo

Se probó dar a cada módulo su color de sistema (iconos en baldosas de color, halo de color en cada pantalla, anillos de colores). Rompía el estilo de la app y se descartó. **La regla de [DESIGN.md](DESIGN.md#1-principios) se mantiene**: casi negro, casi blanco y grises; el acento (índigo LUNO o el que elijas) para actuar y lo que está en marcha; el lima para lo hecho.

Lo que engancha en esas apps y no depende del color es lo que traemos:
- **Forma y jerarquía**: cifras grandes, tarjetas con una sola idea, cabeceras claras.
- **Movimiento con intención**: barras que se recogen, anillos que se llenan o se vacían, cifras que ruedan.
- **Materiales**: cristal solo en lo que flota (barras, accesorios, hojas), bordes que se desvanecen en vez de líneas.
- **Momentos**: celebrar lo que cuesta (rachas, cerrar el día) sin gritar.

## Fases

### Fase 1 — Navegación como iOS 26 ✅
- La barra de pestañas se recoge en un círculo con la pestaña actual al bajar y vuelve al subir.
- **Accesorio inferior** (el mini reproductor de Música): con una sesión de Foco minimizada, una cápsula sobre la barra de pestañas con anillo de progreso, título, tiempo y pausa.
- Barra superior compacta con borde de desplazamiento suave (sin línea).
- «Más» abre con **acciones rápidas** tipo Atajos (la principal en el acento, el resto de cristal).

### Fase 2 — Hoy
- **Tarjeta «Ahora»** (Tiimo / Structured): lo que tiene hora y está en curso, con un anillo que se vacía y «Termina en 12 min»; si no, lo siguiente y cuándo empieza.

### Fase 3 — Piezas compartidas
- **Tarjeta de cifra** (Salud / Fitness): título pequeño, número grande con cifras tabulares, unidad en gris y un mini gráfico.
- Gráficos de barras con la de hoy resaltada en el acento y la media en línea discontinua (Tiempo de uso).

### Fase 4 — Módulos
- **Hábitos** (Streaks): rachas y semanas más visibles; el anillo se cierra en lima.
- **Cuenta atrás** (Flighty): la tarjeta cambia según se acerca la fecha (lejos, tranquila; esta semana, más presente; hoy, a lo grande).
- **Huchas** (Revolut / Finch): se llenan con una ola al añadir dinero.

### Fase 5 — Momentos
- Hitos de racha (7, 30, 100, 365 días) con una tarjeta de celebración, la cifra que sube y confeti en lima y acento (Duolingo / Fitness).

## Restricciones que se respetan
- JS de arranque ≤ 215 KB gzip.
- Contraste AA en las 28 pantallas y los dos temas (axe en e2e).
- «Reducir movimiento» y «Más contraste» siguen funcionando.
