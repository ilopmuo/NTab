# LUNO — Marca

> **LUNO es tu sistema personal.** Un único lugar donde se conectan tareas, proyectos, hábitos, notas, calendario, foco, finanzas y personas.
> No es «una app de tareas»: es el centro de tu sistema. La marca transmite claridad, control y calma, y se nota que está hecha con cuidado.

## 1. Concepto

**LUNO como centro de un sistema personal.** Todo lo de tu vida gira alrededor de un centro claro; LUNO es ese centro.

- **Órbita:** las áreas de tu vida, conectadas en un mismo ciclo.
- **Luna:** lo que te acompaña cada día, siempre en su sitio.
- **Hueco:** la luna abre la órbita. Un sistema vivo, que se mueve, no un círculo cerrado.

Nada literal: ni lunas en cuarto creciente, ni estrellas, ni planetas.

## 2. Símbolo

Una órbita de trazo grueso (radio 7, grosor 3, en una retícula de 24) abierta 62° arriba a la derecha, y en el hueco, su luna (radio 2,6, sobre la misma órbita, a −45°). Los cortes de la órbita son rectos, como los del logotipo.

| Archivo | Uso |
|---|---|
| `docs/brand/luno-symbol.svg` | Sobre fondos claros |
| `docs/brand/luno-symbol-dark.svg` | Sobre fondos oscuros |
| `docs/brand/luno-mono.svg` | Una sola tinta (grabados, sellos, fondos de color) |
| `public/icon.svg`, `icon-*.png` | Icono de la app: baldosa casi negra, órbita blanca, luna índigo |
| `public/favicon.svg` | Favicon que sigue al tema del sistema (órbita oscura en claro, clara en oscuro) |
| `public/favicon.ico`, `favicon-16.png`, `favicon-32.png` | Favicon de respaldo, en su baldosa oscura |
| `public/apple-touch-icon.png` (180) | iPhone y iPad: a sangre, Apple redondea las esquinas |
| `public/icon-maskable-512.png` | Android: el símbolo dentro de la zona segura (80 %) |
| `public/og.png` (1200 × 630) | Al compartir un enlace (Open Graph y X) |

En la app: `LunoMark` (`src/components/Brand.tsx`). La órbita va en el color del texto y la luna en el acento; con `mono`, todo en el color actual.

**Reglas**
- Tamaño mínimo: 14 px. Por debajo de 20 px, la órbita va sin efectos ni sombras.
- Espacio libre alrededor: al menos el diámetro de la luna.
- No se gira, no se deforma, no se pone en contorno ni con degradados. La luna no cambia de sitio.
- La luna solo va en índigo o en la misma tinta que la órbita; nunca en otro color.

## 3. Logotipo

«LUNO» en mayúsculas, dibujado (no escrito con una fuente): letras geométricas de un solo grosor, con cortes rectos y la «O» como círculo perfecto. Con aire entre letras, para que respire.

- Componentes: `LunoWordmark` (solo el nombre) y `LunoLockup` (símbolo + nombre, como en la barra lateral).
- Archivos: `docs/brand/luno-wordmark.svg`, `luno-wordmark-dark.svg`, `luno-lockup.svg`, `luno-lockup-dark.svg`.
- En el bloque, el símbolo mide 1,7 veces el alto de las letras y la separación es 0,6 veces ese alto.
- En el texto corrido, el nombre se escribe **LUNO**, en mayúsculas.

Las formas de los dos (y sus colores) están en `src/lib/brand.ts`. Si cambian, se regeneran los iconos:

```bash
npm i --no-save @resvg/resvg-js wawoff2 && node scripts/icons.mjs
```

## 4. Paleta

Casi todo es neutro. El color es un acento, no un fondo.

| Token | Valor | Uso |
|---|---|---|
| `--luno-black` | `#050506` | Negro de marca (impresión, contraste máximo) |
| `--luno-ink` | `#0B0B0E` | Casi negro: fondo del icono, tinta sobre claro |
| `--luno-graphite` | `#16161A` | Superficies oscuras |
| `--luno-gray-900` | `#1F1F24` | Superficies elevadas en oscuro |
| `--luno-gray-500` | `#8B8B94` | Gris neutro |
| `--luno-gray-100` | `#ECECF0` | Gris claro |
| `--luno-paper` | `#F5F5F7` | Blanco roto: fondo en claro, tinta sobre oscuro |
| `--luno-white` | `#FFFFFF` | Celdas en claro |
| `--luno-indigo` | `#5B57E8` | **Índigo LUNO**: botones principales, selección, luna del icono |
| `--luno-indigo-light` | `#8783FF` | Índigo sobre oscuro (texto, marcas, luna) |
| `--luno-indigo-deep` | `#4F4BD9` | Índigo sobre claro |
| `--luno-lime` | `#C5F82A` | Lo hecho (casillas, hábitos, anillos completos) |

En la interfaz se usan los tokens de cada tema (`src/index.css`):

| | Oscuro | Claro |
|---|---|---|
| Fondo (`--c-bg`) | `#0A0A0C` (profundo, nunca negro puro) | `#F5F5F7` |
| Celdas (`--c-surface`) | `#151518` | `#FFFFFF` |
| Elevado (`--c-elevated`) | `#222227` | `#FFFFFF` |
| Texto (`--c-text`) | `#F4F4F6` | `#111114` |
| Acento: texto y marcas (`--c-blue`) | `#8783FF` | `#4F4BD9` |
| Acento: relleno con texto blanco (`--c-accent-fill`) | `#5B57E8` | `#5B57E8` |
| Acento: texto sobre su fondo suave (`--c-accent-on-soft`) | `#B9B6FF` | `#3F3BC0` |

- El acento (`--c-blue`, nombre heredado) es para lo que actúa: elementos activos, el botón principal, la selección, el foco del teclado y pequeños detalles de marca. Nunca para fondos grandes.
- Todo cumple el contraste AA; lo comprueba `src/lib/accents.test.ts` (también para los otros acentos que se eligen en Ajustes → Apariencia).
- Sin degradados llamativos, sin neones y sin sombras de color: las sombras son neutras y suaves.

## 5. Tipografía

**Inter** (variable, incluida en la app) en todos los dispositivos: la misma voz en el iPhone, el Mac y Windows. Los números, con cifras tabulares (`font-num`).

| Nivel | Token Tailwind | Tamaño / peso / tracking | Uso |
|---|---|---|---|
| Display | `text-display` | 34 px · 700 · −0,03 em | Título grande de cada pantalla |
| Título | `text-title` | 22 px · 650 · −0,022 em | Títulos de bloque y de hojas |
| Encabezado | `text-headline` | 17 px · 600 · −0,015 em | Títulos de fila, estados vacíos |
| Cuerpo | `text-body` | 15 px · 400 · −0,01 em | Texto general |
| Etiqueta | `text-label` | 13 px · 600 | Grupos de la barra lateral, botones pequeños |
| Metadato | `text-meta` | 12 px · 400, en `--c-muted` | Fechas, contadores, notas al pie |
| Números | `font-num` | Cifras tabulares, −0,02 em | Contadores, anillos, importes |
| Navegación | — | 14 px · 400 (activa, 600) | Filas de la barra lateral y pestañas |

## 6. Iconografía

- **Lucide** para todo lo funcional: trazo de 2–2,4 px, esquinas redondeadas, alineado a la retícula de 24.
- Glifos sobre baldosas de relleno gris; el acento solo en lo activo.
- Nada de emojis para funciones. El símbolo de LUNO no se usa como icono de una función.

## 7. Voz

Directa, humana, clara y tranquila. Frases cortas, de tú, sin lenguaje corporativo ni exclamaciones de más.

| Mejor | Evitar |
|---|---|
| «LUNO te avisa cuando toque.» | «¡Nunca más olvidarás nada con nuestras notificaciones inteligentes!» |
| «Sin gastos este mes» | «¡Vaya! Parece que aún no hay datos para mostrar» |
| «Tu sistema personal.» | «La plataforma definitiva de productividad» |

**Lema:** *Tu sistema personal.* (En inglés: *Your personal system.*)

## 8. Movimiento de marca

- **Arranque:** la órbita gira hasta su sitio con un muelle, la luna se posa y aparece «LUNO».
- **Estados vacíos:** el icono, en su baldosa, dentro de una órbita tenue con su luna.
- **Acceso:** órbitas muy tenues alrededor del símbolo, que se desvanecen hacia el formulario.
- Con «Reducir movimiento», todo aparece sin animación.
