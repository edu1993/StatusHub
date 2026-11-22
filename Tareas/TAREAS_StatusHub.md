# StatusHub: tareas y cronograma de desarrollo

## Resumen de estado del proyecto

Todas las fases planificadas (Fases 1 a 6) y la ronda de correcciones de QA se encuentran **completadas** y verificadas sobre el stack Docker Compose.

## Diagrama de Gantt

`■` indica las semanas planificadas de ejecución de cada tarea.

| ID | Tarea | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | Estado |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| F2.1 | Enrutamiento y acceso | ■ | | | | | | | | | Completada |
| F2.2 | Sesión de usuario | ■ | | | | | | | | | Completada |
| F2.3 | API simulada | ■ | | | | | | | | | Completada |
| F2.4 | Métricas y gráfico | ■ | | | | | | | | | Completada |
| F2.5 | Exportación CSV | ■ | | | | | | | | | Completada |
| F3.1 | Entorno Docker | | ■ | | | | | | | | Completada |
| F3.2 | Estructura de la API | | ■ | | | | | | | | Completada |
| F3.3 | Esquema de base de datos | | ■ | | | | | | | | Completada |
| F3.4 | Conexiones MySQL y Redis | | ■ | | | | | | | | Completada |
| F4.1 | Registro y autenticación | | | ■ | | | | | | | Completada |
| F4.2 | Protección de rutas | | | ■ | | | | | | | Completada |
| F4.3 | CRUD de servicios | | | ■ | ■ | | | | | | Completada |
| F4.4 | Incidentes y métricas | | | | ■ | | | | | | Completada |
| F4.5 | API pública de estado | | | | ■ | | | | | | Completada |
| F4.6 | Validaciones y errores | | | | ■ | | | | | | Completada |
| F5.1 | Checker HTTP/HTTPS | | | | | ■ | | | | | Completada |
| F5.2 | Registro de verificaciones | | | | | ■ | | | | | Completada |
| F5.3 | Bloqueos con Redis | | | | | ■ | ■ | | | | Completada |
| F5.4 | Apertura y cierre de incidentes | | | | | | ■ | | | | Completada |
| F5.5 | Ejecución periódica del worker | | | | | | ■ | | | | Completada |
| F5.6 | Recuperación ante fallos | | | | | | ■ | | | | Completada |
| F6.1 | Integración de autenticación | | | | | | | ■ | | | Completada |
| F6.2 | Integración de servicios | | | | | | | ■ | ■ | | Completada |
| F6.3 | Integración de estado público | | | | | | | | ■ | | Completada |
| F6.4 | Integración de incidentes y métricas | | | | | | | | ■ | | Completada |
| F6.5 | Pruebas de API y permisos | | | | | | | | ■ | | Completada |
| F6.6 | Pruebas de carga del worker | | | | | | | | | ■ | Completada |
| F6.7 | Validación integral y documentación | | | | | | | | | ■ | Completada |

## Detalle por fase

### Fase 1: Prototipado y maquetado inicial — Completada
Inicialización de la SPA, prototipo HTML de referencia (`aplicacion/prototipo/statushub_app.html`), vistas base y Dockerfile inicial.

### Fase 2: Lógica del frontend — Completada
| ID | Nombre | Descripción | Estado |
|---|---|---|---|
| F2.1 | Enrutamiento y acceso | Separación de vistas privadas, `/status/<slug>` y `/reset-password?token=...`. | Completada |
| F2.2 | Sesión de usuario | Persistencia JWT en `localStorage`, renovación de token y cierre de sesión. | Completada |
| F2.3 | API simulada | Capa `src/api.ts` inicialmente mockeada y luego conectada a la API REST real. | Completada |
| F2.4 | Métricas y gráfico | Disponibilidad global, gráfico histórico 24 hs y latencia interactiva con desglose por minuto. | Completada |
| F2.5 | Exportación CSV | Descarga filtrada en CSV UTF-8 con BOM desde el historial de incidentes. | Completada |

### Fase 3: Infraestructura y base de datos — Completada
| ID | Nombre | Descripción | Estado |
|---|---|---|---|
| F3.1 | Entorno Docker | `docker-compose.yml` con MySQL 8, Redis 7, `mail-adapter`, API PHP, worker y Nginx. | Completada |
| F3.2 | Estructura de la API | Enrutador REST en `public/index.php` y módulos en `src/` con CORS corregido para `OPTIONS`. | Completada |
| F3.3 | Esquema de base de datos | Tablas y migraciones idempotentes en `schema.php` alineadas con el DER actualizado. | Completada |
| F3.4 | Conexiones MySQL y Redis | Conexiones configuradas por variables de entorno y zona horaria sincronizada (`UTC-3`). | Completada |

### Fase 4: API REST — Completada
| ID | Nombre | Descripción | Estado |
|---|---|---|---|
| F4.1 | Registro y autenticación | Registro, login JWT, recuperación de contraseña, cambio de clave y baja definitiva. | Completada |
| F4.2 | Protección de rutas | Middleware `authenticatedClientId()` con validación de `auth_version`. | Completada |
| F4.3 | CRUD de servicios | Alta, listado, edición y eliminación aislados por `client_id`. | Completada |
| F4.4 | Incidentes y métricas | Cálculo real 30d con recorte de incidentes, métricas RF-05 y paginación en `/api/incidents`. | Completada |
| F4.5 | API pública de estado | Consulta `/api/public/status/{slug}` sujeta a `public_status_enabled`, `public_page_name` e `is_public`. | Completada |
| F4.6 | Validaciones y errores | Validaciones estrictas y respuestas HTTP/JSON consistentes. | Completada |

### Fase 5: Monitoreo y workers — Completada
| ID | Nombre | Descripción | Estado |
|---|---|---|---|
| F5.1 | Checker HTTP/HTTPS | Verificaciones cURL con timeout de 5 s, regla 200–499 saludable / 5xx fallo y `failure_type`. | Completada |
| F5.2 | Registro de verificaciones | Persistencia de resultados en `checks` con `status_code`, `latency`, `failure_type` y `error_message`. | Completada |
| F5.3 | Bloqueos con Redis | Locks por servicio con TTL y liberación atómica en Lua. | Completada |
| F5.4 | Apertura y cierre de incidentes | Creación automática de incidentes y resolución con `resolved_at` al recuperarse. | Completada |
| F5.5 | Ejecución periódica del worker | Programación basada en `MAX(checks.created_at)` + `check_interval` (sin `next_check`). | Completada |
| F5.6 | Recuperación ante fallos | Transacciones PDO con rollback y expiración segura de locks en Redis. | Completada |

### Fase 6: Integración, QA y documentación — Completada
| ID | Nombre | Descripción | Estado |
|---|---|---|---|
| F6.1 | Integración de autenticación | Login, registro, recuperación, cambio de clave y baja conectados extremo a extremo. | Completada |
| F6.2 | Integración de servicios | CRUD real, vista Grilla/Listado y modal de detalle sin parpadeo. | Completada |
| F6.3 | Integración de estado público | Configuración pública con nombre obligatorio, enlace compartible y vista aislada. | Completada |
| F6.4 | Integración de incidentes y métricas | Popover de notificaciones, paginación, fecha de resuelto, `failure_type` y CSV. | Completada |
| F6.5 | Pruebas de API y permisos | Suites de tests unitarios PHP (PHPUnit + standalone) y Frontend (Vitest + RTL). | Completada |
| F6.6 | Pruebas de carga del worker | Validación de concurrencia con locks en Redis y manejo de fallos múltiples. | Completada |
| F6.7 | Validación integral y documentación | SRS v1.5, Arquitectura, DER sincronizado, README y Guía de Usuario PDF entregados. | Completada |
