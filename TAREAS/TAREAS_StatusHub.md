# StatusHub: tareas y cronograma de desarrollo

## Criterios para cargar las tareas

- Cada fila de la lista de tareas corresponde a una tarea independiente para cargar en la plataforma.
- **Estado inicial:** `A iniciar`.
- **Vencimiento:** completar con la fecha de la última clase de la semana indicada en el Gantt. Las semanas son relativas a la primera clase del cronograma; no se asignan fechas calendario porque no se proporcionó el calendario de clases.
- Los nombres son breves; el alcance de cada tarea se explica en la descripción.
- El prototipo de la Fase 1 ya figura como completado en el plan anterior, por lo que no se vuelve a cargar como trabajo pendiente.

## Diagrama de Gantt

`■` indica las semanas en las que se trabaja en la tarea. El vencimiento de cada tarea es al cierre de su última semana marcada.

| ID | Tarea | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| F2.1 | Enrutamiento y acceso | ■ | | | | | | | | |
| F2.2 | Sesión de usuario | ■ | | | | | | | | |
| F2.3 | API simulada | ■ | | | | | | | | |
| F2.4 | Métricas y gráfico | ■ | | | | | | | | |
| F2.5 | Exportación CSV | ■ | | | | | | | | |
| F3.1 | Entorno Docker | | ■ | | | | | | | |
| F3.2 | Estructura de la API | | ■ | | | | | | | |
| F3.3 | Esquema de base de datos | | ■ | | | | | | | |
| F3.4 | Conexiones MySQL y Redis | | ■ | | | | | | | |
| F4.1 | Registro y autenticación | | | ■ | | | | | | |
| F4.2 | Protección de rutas | | | ■ | | | | | | |
| F4.3 | CRUD de servicios | | | ■ | ■ | | | | | |
| F4.4 | Incidentes y métricas | | | | ■ | | | | | |
| F4.5 | API pública de estado | | | | ■ | | | | | |
| F4.6 | Validaciones y errores | | | | ■ | | | | | |
| F5.1 | Checker HTTP/HTTPS | | | | | ■ | | | | |
| F5.2 | Registro de verificaciones | | | | | ■ | | | | |
| F5.3 | Bloqueos con Redis | | | | | ■ | ■ | | | |
| F5.4 | Apertura y cierre de incidentes | | | | | | ■ | | | |
| F5.5 | Ejecución periódica del worker | | | | | | ■ | | | |
| F5.6 | Recuperación ante fallos | | | | | | ■ | | | |
| F6.1 | Integración de autenticación | | | | | | | ■ | | |
| F6.2 | Integración de servicios | | | | | | | ■ | ■ | |
| F6.3 | Integración de estado público | | | | | | | | ■ | |
| F6.4 | Integración de incidentes y métricas | | | | | | | | ■ | |
| F6.5 | Pruebas de API y permisos | | | | | | | | ■ | |
| F6.6 | Pruebas de carga del worker | | | | | | | | | ■ |
| F6.7 | Validación integral y documentación | | | | | | | | | ■ |

## Tareas para cargar en la plataforma

Para todas las tareas de esta lista, establecer **Estado: `A iniciar`**. Completar la fecha exacta de vencimiento con la última clase de la semana indicada arriba.

### Fase 2: Lógica del frontend

| ID | Nombre | Descripción | Vencimiento |
|---|---|---|---|
| F2.1 | Enrutamiento y acceso | Configurar las rutas de la SPA, separar vistas públicas y privadas y redirigir a usuarios no autenticados. | Fin de S1 — completar fecha |
| F2.2 | Sesión de usuario | Implementar el estado de sesión, persistencia del token y cierre de sesión para los flujos de autenticación. | Fin de S1 — completar fecha |
| F2.3 | API simulada | Crear datos de prueba y funciones HTTP simuladas para servicios, incidentes, autenticación y página pública. | Fin de S1 — completar fecha |
| F2.4 | Métricas y gráfico | Calcular y mostrar la disponibilidad de los últimos 30 días a partir de los datos simulados. | Fin de S1 — completar fecha |
| F2.5 | Exportación CSV | Generar y descargar el CSV de incidentes con las columnas requeridas y los filtros aplicados. | Fin de S1 — completar fecha |

### Fase 3: Infraestructura y base de datos

| ID | Nombre | Descripción | Vencimiento |
|---|---|---|---|
| F3.1 | Entorno Docker | Crear Docker Compose para API PHP, worker, servidor web, MySQL y Redis; verificar que los servicios inicien. | Fin de S2 — completar fecha |
| F3.2 | Estructura de la API | Inicializar el proyecto PHP, instalar dependencias con Composer y preparar el enrutador REST. | Fin de S2 — completar fecha |
| F3.3 | Esquema de base de datos | Crear tablas de clientes, servicios, verificaciones e incidentes con relaciones e índices para aislar los datos por cliente. | Fin de S2 — completar fecha |
| F3.4 | Conexiones MySQL y Redis | Configurar las conexiones de la aplicación a MySQL y Redis mediante variables de entorno y comprobar su disponibilidad. | Fin de S2 — completar fecha |

### Fase 4: API REST

| ID | Nombre | Descripción | Vencimiento |
|---|---|---|---|
| F4.1 | Registro y autenticación | Implementar registro con hash de contraseñas e inicio de sesión con emisión y validación de tokens. | Fin de S3 — completar fecha |
| F4.2 | Protección de rutas | Aplicar autenticación a rutas privadas y obtener la identidad del cliente desde el token validado. | Fin de S3 — completar fecha |
| F4.3 | CRUD de servicios | Implementar creación, consulta, edición y eliminación de servicios, limitando cada operación al cliente autenticado. | Fin de S4 — completar fecha |
| F4.4 | Incidentes y métricas | Exponer historial y métricas de disponibilidad de los últimos 30 días, filtrados por cliente y servicio. | Fin de S4 — completar fecha |
| F4.5 | API pública de estado | Exponer una consulta de solo lectura mediante enlace único y devolver únicamente servicios públicos publicados. | Fin de S4 — completar fecha |
| F4.6 | Validaciones y errores | Validar entradas de los endpoints y responder con códigos HTTP y mensajes de error coherentes. | Fin de S4 — completar fecha |

### Fase 5: Monitoreo y workers

| ID | Nombre | Descripción | Vencimiento |
|---|---|---|---|
| F5.1 | Checker HTTP/HTTPS | Realizar verificaciones de servicios y registrar latencia, errores HTTP 5xx y timeout máximo de 5 segundos. | Fin de S5 — completar fecha |
| F5.2 | Registro de verificaciones | Persistir cada resultado del checker con fecha, servicio, estado, código HTTP, latencia y detalle del fallo. | Fin de S5 — completar fecha |
| F5.3 | Bloqueos con Redis | Adquirir locks con vencimiento antes de procesar cada servicio y liberarlos al terminar, evitando ejecuciones superpuestas. | Fin de S6 — completar fecha |
| F5.4 | Apertura y cierre de incidentes | Abrir un incidente ante una verificación fallida y cerrarlo cuando el servicio se recupere. | Fin de S6 — completar fecha |
| F5.5 | Ejecución periódica del worker | Configurar la ejecución continua del worker y respetar el intervalo mínimo de 30 segundos entre verificaciones. | Fin de S6 — completar fecha |
| F5.6 | Recuperación ante fallos | Manejar errores y expiración de locks para evitar tareas duplicadas o bloqueadas si un proceso se interrumpe. | Fin de S6 — completar fecha |

### Fase 6: Integración y pruebas

| ID | Nombre | Descripción | Vencimiento |
|---|---|---|---|
| F6.1 | Integración de autenticación | Conectar los formularios de registro e inicio de sesión del frontend con la API y validar el acceso a rutas privadas. | Fin de S7 — completar fecha |
| F6.2 | Integración de servicios | Reemplazar los mocks de gestión de servicios por llamadas reales a la API y verificar los flujos de alta, edición y baja. | Fin de S8 — completar fecha |
| F6.3 | Integración de estado público | Conectar la página pública a la API y validar el enlace único y la visibilidad de los servicios publicados. | Fin de S8 — completar fecha |
| F6.4 | Integración de incidentes y métricas | Conectar el historial, los gráficos de disponibilidad y la exportación CSV a los datos reales. | Fin de S8 — completar fecha |
| F6.5 | Pruebas de API y permisos | Probar autenticación, validaciones y aislamiento entre clientes, incluyendo intentos de consultar recursos ajenos. | Fin de S8 — completar fecha |
| F6.6 | Pruebas de carga del worker | Simular múltiples servicios lentos o fallidos y comprobar que Redis evita ejecuciones concurrentes duplicadas. | Fin de S9 — completar fecha |
| F6.7 | Validación integral y documentación | Ejecutar los flujos principales en Docker, corregir fallos encontrados y actualizar las instrucciones de ejecución. | Fin de S9 — completar fecha |

## Trabajo ya completado

La Fase 1 —prototipado y maquetado del frontend— se conserva como antecedente completado: inicialización de la SPA, vistas de autenticación, panel privado, formularios de servicios, historial y exportación, página pública y Dockerfile inicial. No se incluye en la lista de nuevas tareas `A iniciar`.
