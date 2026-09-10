# StatusHub

Servicio web de monitoreo de disponibilidad multi-cliente.

## Proyecto

StatusHub permite que cada cliente registre servicios, consulte su disponibilidad, revise incidentes y publique opcionalmente una pagina de estado para sus usuarios. La solucion usa arquitectura cliente-servidor y capas separadas:

- `aplicacion/frontend`: SPA desarrollada con React, TypeScript y Vite.
- `aplicacion/backend`: reservado para la API REST y los workers PHP.
- MySQL: persistencia prevista para clientes, servicios e incidentes.
- Redis: control de concurrencia previsto para las verificaciones.
- Nginx: servidor de archivos estaticos del frontend en produccion.

El frontend actual funciona con datos simulados e incluye autenticacion, dashboard privado, gestion de servicios, historial de incidentes, pagina publica y busqueda de servicios publicos.

## Documentacion

- [Arquitectura](ARQUITECTURA/ARQUITECTURA_StatusHub.md)
- [Especificacion de requisitos](SRS/SRS_StatusHub.md)
- [Seguimiento de tareas](TAREAS/TAREAS_StatusHub.md)

## Requisitos

- Node.js 22 o superior.
- npm.
- Docker y Docker Compose para ejecutar el frontend en contenedor.

## Levantar en local

Desde la raiz del repositorio:

```bash
npm --prefix aplicacion/frontend install
npm --prefix aplicacion/frontend run dev -- --host 0.0.0.0
```

Abrir:

- Aplicacion: `http://localhost:5173/`
- Pagina publica: `http://localhost:5173/status/eduardo`

Para acceder al dashboard, ingresar cualquier correo valido y una contrasena de minimo 8 caracteres. La autenticacion actual es simulada hasta implementar la API REST.

## Levantar con Docker

Para desarrollo con recarga automatica:

```bash
cd aplicacion/frontend
docker compose up --build
```

Abrir:

- Aplicacion: `http://localhost:5173/`
- Pagina publica: `http://localhost:5173/status/eduardo`

El Compose monta el codigo fuente mediante un bind mount y conserva `node_modules` en un volumen anonimo. Esto permite editar el frontend sin reconstruir en cada cambio.

Para construir y ejecutar la imagen final con Nginx Alpine:

```bash
cd aplicacion/frontend
docker build -t statushub-frontend .
docker run --rm -p 8080:80 statushub-frontend
```

Abrir:

- Aplicacion: `http://localhost:8080/`
- Pagina publica: `http://localhost:8080/status/eduardo`

La imagen de produccion no necesita volumen: los archivos compilados quedan incluidos dentro de la imagen.

## Validaciones

```bash
npm --prefix aplicacion/frontend run build
npm --prefix aplicacion/frontend run lint
docker compose -f aplicacion/frontend/docker-compose.yml config
```
