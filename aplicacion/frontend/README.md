# StatusHub Frontend

SPA de StatusHub desarrollada con React, TypeScript y Vite.

El frontend es la capa de presentación de la arquitectura cliente-servidor. La estructura separa el documento HTML (`index.html`), estilos (`src/index.css`, `src/App.css`) y lógica/tipos (`src/App.tsx`, `src/api.ts`). Consume la API REST PHP detrás de `/api`.

## Desarrollo local

```bash
npm install
npm run dev
```

El proxy local de Vite apunta por defecto a `http://localhost:8081`; levanta el stack con `docker compose up --build` desde la raíz del repositorio o cambia `API_PROXY_TARGET`.

Rutas disponibles:

- `/`: autenticación y dashboard privado.
- `/status/<slug>`: página pública generada para cada cliente.
- `/reset-password?token=<token>`: formulario para establecer una nueva contraseña.

## Recuperación de contraseña y correo

El proyecto independiente `aplicacion/mail-adapter` expone una interfaz de envío común. Por defecto, Docker Compose usa el modo `local`: los mensajes de recuperación quedan en una bandeja de desarrollo disponible en `http://localhost:8026`, sin enviar correo real.

Para usar un servidor SMTP, configura `MAILER_MODE=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` y `MAIL_FROM` en `.env`. El adaptador acepta servidores SMTP compatibles; nunca guardes credenciales en el repositorio. Con SMTP, la bandeja local devuelve 404.

Si ejecutas el frontend con Vite en vez de Docker, configura `FRONTEND_ORIGIN=http://localhost:5173` para que los enlaces de recuperación vuelvan a esa instancia.

El stack completo se ejecuta desde la raíz con `docker compose up --build`, no desde esta carpeta.

## Imagen de produccion

```bash
docker build -t statushub-frontend .
docker run --rm -p 8080:80 statushub-frontend
```

La imagen usa una etapa `node:22-alpine` para compilar y `nginx:alpine` para servir los archivos estaticos. No necesita volumen en produccion porque el contenido compilado queda incluido en la imagen.

Nginx incluye fallback a `index.html` para las rutas de la SPA y proxy inverso de `/api` al servicio backend.

## Validaciones

```bash
npm run build
npm run lint
docker compose -f ../../docker-compose.yml config
```
