# LUNO (repo NTab) — notas para Claude

## Flujo de trabajo con git

- Trabaja directamente en `main`: no crees ramas ni pull requests.
- Haz commit y `git push origin main` cuando el cambio esté comprobado.
- Antes de subir, pasa lo mismo que la CI: `npm run typecheck`, `npm test`, `npm run build`, `npm run size` y, si tocas la interfaz, `npm run e2e`.
