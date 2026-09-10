# StatusHub Frontend

SPA de StatusHub desarrollada con React, TypeScript y Vite.

El frontend es la capa de presentacion de la arquitectura cliente-servidor. Actualmente usa datos simulados y queda preparado para consumir la API REST PHP cuando se implemente el backend.

## Desarrollo local

```bash
npm install
npm run dev
```

Rutas disponibles:

- `http://localhost:5173/`: autenticacion y dashboard privado simulado.
- `http://localhost:5173/status/eduardo`: pagina publica de estado.

## Desarrollo con Docker

```bash
docker compose up --build
```

El Compose monta el codigo fuente para conservar HMR y usa un volumen anonimo para `node_modules`, evitando que las dependencias del contenedor se mezclen con las del sistema anfitrion.

Los cambios realizados en `src/` se reflejan automaticamente en el navegador. Si se modifica `package.json`, hay que reconstruir con `docker compose up --build`.

## Imagen de produccion

```bash
docker build -t statushub-frontend .
docker run --rm -p 8080:80 statushub-frontend
```

La imagen usa una etapa `node:22-alpine` para compilar y `nginx:alpine` para servir los archivos estaticos. No necesita volumen en produccion porque el contenido compilado queda incluido en la imagen.

La configuracion de Nginx incluye fallback a `index.html` para que las rutas de la SPA, incluida la pagina publica, funcionen correctamente.

## Validaciones

```bash
npm run build
npm run lint
docker compose config
```
