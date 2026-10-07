import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    chunkSizeWarningLimit: 400,
    rolldownOptions: {
      output: {
        // Librerías en trozos propios: cambian poco, así que al publicar una
        // versión nueva el iPhone solo vuelve a descargar el código de la app
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'dexie', test: /node_modules[\\/]dexie(-react-hooks)?[\\/]/ },
          ],
        },
      },
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    // date-fns trae el inglés como idioma por defecto aunque siempre se le pase
    // el español: así no llega el inglés al arranque
    {
      name: 'date-fns-es-por-defecto',
      enforce: 'pre',
      resolveId(id, importer) {
        if (importer?.includes('/node_modules/date-fns/') && /(^|\/)_lib\/defaultLocale\.js$/.test(id)) return fileURLToPath(new URL('./src/lib/dateLocale.ts', import.meta.url))
      },
    },
    // La barra que se ve (la lateral en pantallas anchas, la de pestañas en el
    // móvil) va aparte para no bajar las dos: se pide a la vez que el resto
    // del arranque, eligiendo la buena con el ancho de la pantalla
    {
      name: 'precargar-barra-y-fuente',
      apply: 'build',
      transformIndexHtml: {
        order: 'post',
        handler(html, ctx) {
          const chunks = Object.values(ctx.bundle ?? {}).filter((c) => c.type === 'chunk')
          const inHtml = new Set([...html.matchAll(/assets\/[^"]+\.js/g)].map((m) => m[0]))
          const files = (name: string) => {
            const c = chunks.find((x) => x.facadeModuleId?.endsWith(`/src/app/${name}.tsx`))
            return c ? [c.fileName, ...c.imports].filter((f) => !inHtml.has(f)) : []
          }
          const wide = files('Sidebar')
          const narrow = files('MobileBar')
          // La fuente (Inter, alfabeto latino): se pide ya, sin esperar a leer el CSS
          const font = Object.keys(ctx.bundle ?? {}).find((f) => /inter-latin-wght-normal-[^/]+\.woff2$/.test(f))
          if (font) html = html.replace('</head>', `    <link rel="preload" as="font" type="font/woff2" href="./${font}" crossorigin>\n  </head>`)
          if (!wide.length || !narrow.length) return html
          const script = `<script>(matchMedia('(min-width: 768px)').matches?${JSON.stringify(wide)}:${JSON.stringify(narrow)}).forEach(function(f){var l=document.createElement('link');l.rel='modulepreload';l.href='./'+f;l.crossOrigin='';document.head.appendChild(l)})</script>`
          return html.replace('</head>', `    ${script}\n  </head>`)
        },
      },
    },
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Solo alfabeto latino: las fuentes griega, cirílica y vietnamita no se usan
        // ni la imagen para compartir enlaces (la piden las redes, no la app)
        globIgnores: ['**/inter-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2', 'og.png'],
        importScripts: ['push-sw.js'],
      },
      includeAssets: ['icon.svg', 'favicon.svg', 'favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'LUNO',
        lang: 'es',
        short_name: 'LUNO',
        description: 'Tu sistema personal: tareas, proyectos, hábitos, notas, calendario, finanzas y personas, conectados.',
        theme_color: '#0a0a0c',
        background_color: '#0a0a0c',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        // «Compartir» desde otras apps (Android y la app instalada en el ordenador): llega a la captura
        share_target: { action: './', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
        // Pulsación larga en el icono (Android, Windows, macOS con Chrome/Edge)
        shortcuts: [
          { name: 'Nueva tarea', short_name: 'Nueva', url: './#/new', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Hoy', url: './#/today', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Planificar el día', short_name: 'Planificar', url: './#/plan', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
        ],
      },
    }),
  ],
})
