# StatusHub Frontend

SPA de StatusHub desarrollada con React, TypeScript y Vite.

## Desarrollo local

```bash
npm install
npm run dev
```

## Desarrollo con Docker

```bash
docker compose up --build
```

El Compose monta el codigo fuente para conservar HMR y usa un volumen anonimo para `node_modules`, evitando que las dependencias del contenedor se mezclen con las del sistema anfitrion.

## Imagen de produccion

```bash
docker build -t statushub-frontend .
docker run --rm -p 8080:80 statushub-frontend
```

La imagen usa una etapa `node:22-alpine` para compilar y `nginx:alpine` para servir los archivos estaticos. No necesita volumen en produccion porque el contenido compilado queda incluido en la imagen.
