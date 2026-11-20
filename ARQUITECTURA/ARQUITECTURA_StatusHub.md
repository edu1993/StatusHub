# Arquitectura del Sistema: StatusHub

## Visión General

StatusHub implementa una arquitectura **Cliente-Servidor** desacoplada con **Arquitectura en Capas (N-tier)** y procesamiento asíncrono en segundo plano, orquestada mediante Docker Compose (`frontend`, `backend`, `worker`, `mysql`, `redis` y `mail-adapter`).

---

## Backend (`aplicacion/backend`)

* **Tipo de Arquitectura:** API REST en capas (Presentación HTTP, Lógica de negocio y Persistencia PDO) + Worker desacoplado.
* **Estructura modular:**
  * `public/index.php`: punto de entrada único, aplicación de encabezados CORS (incluyendo preflight `OPTIONS` antes de responder `204`) y enrutamiento REST.
  * `src/bootstrap.php` y `src/database.php`: configuración de zona horaria (`America/Argentina/Buenos_Aires` por defecto, sincronizada en PHP y MySQL `SET time_zone`), conexión PDO con prepared statements nativos y conexión Redis.
  * `src/schema.php` y `bin/init-db.php`: inicialización y migraciones idempotentes del esquema MySQL (`clients`, `services`, `incidents`, `checks`, `password_resets`, `password_reset_requests`).
  * `src/auth.php`: registro con aceptación de términos, login JWT HS256 con `auth_version`, recuperación de contraseña con rate limiting, cambio de contraseña (`PUT /api/account/password`), baja definitiva en cascada (`DELETE /api/account`) y configuración de página pública (`GET/PUT /api/public-status/settings`).
  * `src/services.php`: CRUD aislado por `client_id` y cálculo de disponibilidad de 30 días usando la duración real del período con recorte de incidentes previos, exponiendo `uptime`, `availability_level`, `downtime_seconds` y `evaluated_period`.
  * `src/incidents.php`: historial de incidentes con soporte de paginación (`page`, `limit`, `total`, `total_pages`), `resolved_at`, `failure_type`, exportación CSV, métricas horarias/minuto a minuto y endpoint público `/api/public/status/{slug}`.
  * `src/worker.php` y `bin/worker.php`: chequeos periódicos HTTP/HTTPS basados en el último registro de `checks` (sin `next_check`), locks distribuidos en Redis con liberación atómica Lua, regla HTTP `200–499` saludable / `5xx` caída y clasificación de `failure_type` (`dns`, `ssl`, `http`, `timeout`, `connection`, `unknown`).

---

## Frontend (`aplicacion/frontend`)

* **Tipo de Arquitectura:** SPA React + TypeScript + Vite servida por Nginx, con proxy inverso `/api` hacia `backend:80`.
* **Módulos principales:**
  * `src/api.ts`: cliente HTTP tipado con manejo de token Bearer, compatibilidad de paginación server-side/client-side y gestión de errores.
  * `src/App.tsx`: autenticación con validación por campo, panel privado con vistas **Dashboard**, **Alta de Servicio**, **Historial de Incidentes** (paginado + exportación CSV) y **Configuración** (página pública, preferencias locales, seguridad y baja de cuenta), popover de notificaciones y vista de página pública.
  * `src/AvailabilityChart.tsx` y `src/LatencyChart.tsx`: gráficos interactivos de disponibilidad histórica (24 hs) y latencia con drill-down minuto a minuto, con modales renderizados mediante `createPortal` para evitar parpadeos.

---

## Página de Estado Pública

* La visibilidad pública depende de dos condiciones obligatorias: la página habilitada en el cliente (`clients.public_status_enabled = TRUE` con `public_page_name` definido) y cada servicio marcado como público (`services.is_public = TRUE`).
* Cuando un visitante accede mediante el enlace compartido `/status/<slug>`, la interfaz opera en modo solo lectura estricto (sin controles administrativos ni enlaces clickeables a los endpoints). Cuando el propietario ingresa desde el botón **Ver Página Pública** o **Vista previa**, dispone del retorno al panel administrativo.

---

## Adaptador de Correo (`aplicacion/mail-adapter`)

* Servicio aislado en Node.js para el envío de correos de recuperación de contraseña.
* Opera en modo `local` por defecto (bandeja de desarrollo en `http://localhost:8026`) o en modo `smtp` para despliegues productivos.
