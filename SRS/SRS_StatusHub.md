# DESARROLLO DE SOFTWARE
## Especificación de Requisitos de Software (SRS)

**Proyecto:** StatusHub - Servicio Web de Monitoreo de Disponibilidad Multi-Cliente  
**Versión:** 1.5 (Alineada con entrega final y validaciones de QA)  
**Fecha:** 20/11/2026  
**Autores:** Juan Eduardo Alvarez  

---

## 1. Introducción

### 1.1 PROPÓSITO
El propósito de este documento es definir los requisitos funcionales y no funcionales de StatusHub, un servicio web de software libre (licencia MIT) que permite a cualquier cliente registrarse, dar de alta los servicios propios que quiere monitorear (sitios web, APIs), recibir verificaciones periódicas automáticas de disponibilidad, consultar métricas e historial de incidentes en un panel privado y, opcionalmente, publicar una página de estado pública personalizada para sus propios usuarios finales.

### 1.2 ALCANCE
Cualquier persona podrá registrarse como cliente, aceptar los Términos y Condiciones, gestionar su cuenta (recuperación y cambio de contraseña, y baja definitiva) y administrar sus propios servicios a monitorear (URL o endpoint) con aislamiento multi-cliente. Una tarea en segundo plano verificará periódicamente cada servicio activo con bloqueos en Redis para evitar ejecuciones duplicadas o concurrentes. Los fallos se clasificarán por causa (`failure_type`) y se registrarán como incidentes visibles y exportables en CSV desde el panel. Cada cliente podrá activar una página de estado pública de solo lectura (con nombre de organización obligatorio) para compartir con sus propios usuarios. Quedan fuera del alcance el envío de alertas externas por fallo de servicio (correo/SMS), la facturación y la remediación automática.

### 1.3 DEFINICIONES Y ACRÓNIMOS
*   **SRS:** Software Requirements Specification.
*   **Cliente:** Usuario registrado y autenticado que administra sus propios servicios monitoreados.
*   **Servicio monitoreado:** Recurso HTTP/HTTPS (sitio web, API) cuya disponibilidad se verifica periódicamente.
*   **Checker / Worker:** Componente que ejecuta la verificación periódica de cada servicio.
*   **Incidente:** Registro generado cuando una verificación detecta que un servicio no está disponible, incluyendo causa del fallo (`failure_type`), fecha de detección y fecha de resolución.
*   **Página de estado pública:** Vista de solo lectura, sin autenticación ni controles administrativos, que muestra el estado de los servicios públicos de un cliente bajo el nombre de su organización.

---

## 2. Descripción General

### 2.1 PERSPECTIVA DEL SISTEMA
StatusHub sigue una arquitectura Cliente-Servidor desacoplada:
*   **Backend (PHP 8.2):** Expone una API REST JSON para autenticación, gestión de cuenta, CRUD de servicios, métricas de disponibilidad, historial paginado de incidentes, exportación CSV y consulta pública de estado. Incluye un proceso worker independiente que ejecuta los chequeos periódicos con locks distribuidos en Redis y persiste datos en MySQL 8 (zona horaria `America/Argentina/Buenos_Aires` por defecto).
*   **Frontend (React + TypeScript + Vite + Nginx):** SPA independiente que consume exclusivamente la API REST, ofrece panel privado, gráficos interactivos, sección de configuración y renderizado de páginas de estado públicas.
*   **Adaptador de correo (`mail-adapter`):** Servicio desacoplado utilizado únicamente para el envío de enlaces de recuperación de contraseña (bandeja local simulada en desarrollo o SMTP en producción).

### 2.2 USUARIOS DEL SISTEMA
*   **Cliente:** Se registra, inicia sesión, administra sus servicios, consulta métricas e incidentes y configura su cuenta y página pública.
*   **Visitante público:** Accede sin inicio de sesión al enlace único `/status/<slug>` publicado por un cliente para consultar servicios visibles.

### 2.3 SUPOSICIONES Y DEPENDENCIAS
*   Disponibilidad de MySQL 8 y Redis 7 para persistencia y control de concurrencia.
*   Los servicios a monitorear deben ser alcanzables por HTTP/HTTPS desde el contenedor del worker.
*   El intervalo mínimo de verificación configurable es de 30 segundos (máximo 86400 segundos).

---

## 3. Requisitos Específicos

### 3.1 REQUISITOS FUNCIONALES

*   **RF-01. Registro, inicio de sesión y gestión de cuenta (frontend + backend)**
    Cualquier persona podrá crear una cuenta indicando correo electrónico válido, contraseña segura (mínimo 8 caracteres, al menos una mayúscula, una minúscula y un número) y aceptación de los Términos y Condiciones (software libre MIT). El backend emitirá un token JWT con versionado de sesión (`auth_version`). El sistema soportará recuperación de contraseña mediante enlace de un solo uso válido por 1 hora, cambio de contraseña desde Configuración (invalidando sesiones previas) y baja definitiva de cuenta (eliminación en cascada de servicios, verificaciones e incidentes). Todos los formularios validarán campos obligatorios resaltando errores junto a cada campo.

*   **RF-02. Alta y gestión de servicios propios (frontend + backend)**
    Un cliente podrá crear, consultar, editar y eliminar únicamente sus propios servicios indicando `nombre` (hasta 255 caracteres), `URL` HTTP/HTTPS válida (hasta 2048 caracteres), `intervalo de chequeo` (30–86400 segundos) y `visibilidad pública`. Cada incidente registrado contendrá `estado` (`Abierto`/`Resuelto`), `código HTTP`, `latencia`, `failure_type` y `descripción`.

*   **RF-03. Verificación periódica de servicios y clasificación de fallos**
    El worker verificará cada servicio respetando su `check_interval` a partir del último registro en `checks`. Las respuestas HTTP en el rango `200–499` (2xx, 3xx y 4xx) se consideran **operativas** (el servicio está accesible). Se considerará **fallo** cualquier respuesta HTTP `5xx` (o `< 200`), *timeout* superior a 5 segundos, error de resolución DNS, fallo de certificado SSL/TLS o error de conexión de red, clasificándose en `failure_type` (`dns`, `ssl`, `http`, `timeout`, `connection`, `unknown`) tanto en `checks` como en `incidents`. Al recuperarse el servicio, el incidente abierto se resolverá automáticamente registrando `resolved_at`.

*   **RF-04. Prevención de ejecuciones concurrentes**
    El worker adquirirá un bloqueo distribuido en Redis (`SET NX EX`) por servicio antes de ejecutar su verificación y lo liberará atómicamente al finalizar, evitando ejecuciones duplicadas o superpuestas.

*   **RF-05. Panel privado, disponibilidad y gráficos (frontend + backend)**
    El panel privado mostrará disponibilidad global, resumen de servicios, un gráfico de **disponibilidad histórica de las últimas 24 horas**, y los servicios monitoreados en vista **Grilla compacta** o **Listado** con búsqueda en vivo y modal de detalle (con gráfico de latencia de 24 hs y desglose minuto a minuto).
    Para cada servicio, el backend calculará la disponibilidad de los **últimos 30 días** usando la duración real del período evaluado (`GREATEST(service.created_at, NOW() - 30 días)` hasta `NOW()`) y recortando los incidentes iniciados antes de esa ventana mediante la fórmula `((Duración Real - Tiempo Total de Caídas) / Duración Real) * 100`. La API informará explícitamente el porcentaje (`uptime`), el tiempo total de caída (`downtime_seconds`), el período evaluado (`evaluated_period`) y el nivel de disponibilidad (`availability_level`) según la siguiente escala:
    *   **Excelente:** disponibilidad igual o superior al 99,9%.
    *   **Bueno:** disponibilidad igual o superior al 99,0% e inferior al 99,9%.
    *   **Aceptable:** disponibilidad igual o superior al 95,0% e inferior al 99,0%.
    *   **Crítico:** disponibilidad inferior al 95,0%.

*   **RF-06. Registro, notificaciones y paginación de incidentes**
    Al detectarse un fallo se abrirá un incidente visible en el **popover de notificaciones** de la barra superior (al hacer clic sobre una notificación se navegará al historial abriendo su detalle) y en el **Historial de Incidentes**. El historial soportará filtros por servicio, estado y rango de fechas (rechazando fechas futuras o rangos invertidos), **paginación** (10, 20 o 50 registros por página) y modal de detalle con fecha/hora de **Detectado**, fecha/hora de **Resuelto**, `failure_type`, código HTTP, latencia, URL y log completo.

*   **RF-07. Página de estado pública personalizada (frontend + backend)**
    StatusHub generará un `public_slug` único por cliente. La página permanecerá privada por defecto (`public_status_enabled = FALSE`). Desde **Configuración → Página de Estado Pública**, el cliente podrá activarla o desactivarla, debiendo definir obligatoriamente un **nombre de organización** (`public_page_name`, hasta 120 caracteres) al habilitarla, y seleccionar individualmente qué servicios son públicos (`is_public`). Si está desactivada, el enlace responderá `404`. Al abrirse por enlace compartido, la vista no mostrará controles administrativos ni enlaces clickeables a los endpoints; si no tiene servicios públicos activos, no mostrará mensajes de estado engañosos.

*   **RF-08. Exportación del historial de incidentes (frontend + backend)**
    Un cliente podrá exportar su historial filtrado en formato CSV (UTF-8 con BOM). El archivo descargado incluirá las columnas: `Detectado`, `Resuelto`, `Nombre del Servicio`, `URL`, `Estado`, `Tipo de Fallo`, `Código HTTP`, `Latencia (ms)` y `Descripción del Fallo`.

*   **RF-09. Búsqueda de servicios en la página pública (frontend)**
    Cuando existan servicios públicos publicados, la página de estado permitirá buscar por nombre o URL sin recargar la página, filtrando exclusivamente servicios públicos del cliente.

### 3.2 REQUISITOS NO FUNCIONALES

*   **RNF-01. Rendimiento:** Cada verificación del worker expirará en un máximo de 5 segundos (`CURLOPT_TIMEOUT = 5`, `CURLOPT_CONNECTTIMEOUT = 3`).
*   **RNF-02. Aislamiento multi-cliente:** Todas las consultas privadas filtrarán por `client_id` autenticado; ningún cliente podrá ver, editar ni eliminar recursos ajenos.
*   **RNF-03. Concurrencia (Backend):** Locks en Redis con TTL de 30 s y liberación condicionada por token de lock (script Lua).
*   **RNF-04. Seguridad:** Contraseñas almacenadas con `password_hash`, JWT firmado con HS256 y `auth_version`, encabezados CORS válidos en solicitudes preflight `OPTIONS` y rate limiting en recuperación de contraseña. En entorno de desarrollo local el stack corre en HTTP (`:8080` / `:8081`); en despliegues productivos es obligatorio habilitar terminación HTTPS/TLS en el proxy inverso.
*   **RNF-05. Observabilidad operativa:** El backend expone `/api/health` y Docker Compose define healthchecks automáticos sobre MySQL, Redis, adaptador de correo y API. La medición histórica mensual de la infraestructura propia de StatusHub se delega al monitoreo externo del entorno de despliegue para mantener independencia respecto de los datos de clientes.
*   **RNF-06. Usabilidad:** Los servicios caídos se destacan visualmente en rojo en la vista principal sin navegación adicional; las preferencias de auto-actualización y vista (Grilla/Listado) se persisten localmente en Configuración.

---

## 4. Interfaces Externas

*   **API REST (`/api/*`):** Formato JSON con autenticación `Bearer <JWT>` para rutas privadas.
*   **Página de estado pública (`/status/<slug>`):** SPA de solo lectura sin autenticación cuando `public_status_enabled = TRUE`.
*   **Exportación de incidentes (`/api/export-csv`):** Archivo CSV UTF-8 con BOM.

---

## 5. Restricciones

*   Backend y worker desarrollados en PHP 8.2+.
*   Bloqueos distribuidos implementados en Redis 7.
*   Persistencia relacional en MySQL 8 (`utf8mb4`).
*   Frontend SPA independiente en React + TypeScript + Vite, servido mediante Nginx.

---

## 6. Trazabilidad

| Requisito | Caso de uso | Historia de usuario | Caso de prueba | Estado |
| :--- | :--- | :--- | :--- | :--- |
| **RF-01** | CU-00 Registro, login y gestión de cuenta | US-00 | CP-00 Validaciones, JWT, cambio de clave y baja definitiva | Cumplido |
| **RF-02** | CU-01 CRUD de servicios propios | US-01 | CP-01 Aislamiento multi-cliente y validación de campos | Cumplido |
| **RF-03** | CU-02 Verificación periódica y clasificación | US-02 | CP-02 Regla HTTP 200–499 saludable / 5xx fallo y `failure_type` | Cumplido |
| **RF-04** | CU-03 Control de concurrencia | US-03 | CP-03 Lock Redis evita ejecuciones duplicadas | Cumplido |
| **RF-05** | CU-04 Métricas y gráficos en panel privado | US-04 | CP-04 Cálculo real 30d, nivel, `downtime_seconds`, gráficos 24h/minuto | Cumplido |
| **RF-06** | CU-05 Incidentes, popover y paginación | US-05 | CP-05 Apertura/cierre con `resolved_at`, paginación y popover | Cumplido |
| **RF-07** | CU-06 Publicación de página pública | US-06 | CP-06 Activación con nombre obligatorio y vista compartida aislada | Cumplido |
| **RF-08** | CU-07 Exportación CSV | US-07 | CP-07 Exportación filtrada con todas las columnas definidas | Cumplido |
| **RF-09** | CU-08 Búsqueda en página pública | US-08 | CP-08 Filtrado en vivo sin exponer servicios privados | Cumplido |
