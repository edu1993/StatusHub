# DESARROLLO DE SOFTWARE
## Especificación de Requisitos de Software (SRS)

**Proyecto:** StatusHub - Servicio Web de Monitoreo de Disponibilidad Multi-Cliente  
**Versión:** 1.4 (Actualizada con publicación opcional de páginas de estado)
**Fecha:** 03/09/2026  
**Autores:** Juan Eduardo Alvarez  

---

## 1. Introducción

### 1.1 PROPÓSITO
El propósito de este documento es definir los requisitos funcionales y no funcionales de StatusHub, un servicio web que permite a cualquier cliente registrarse, dar de alta los servicios propios que quiere monitorear (sitios web, APIs), recibir verificaciones periódicas automáticas de disponibilidad, consultar el historial de incidentes en un panel privado y, opcionalmente, publicar una página de estado pública para sus propios usuarios finales.

### 1.2 ALCANCE
Cualquier persona podrá registrarse como cliente y acceder con sus credenciales. Cada cliente podrá dar de alta sus propios servicios a monitorear (URL o endpoint) y solo podrá ver y administrar los suyos. Una tarea en segundo plano verificará periódicamente cada servicio activo, garantizando que las verificaciones no se ejecuten de manera duplicada o concurrente. Los fallos se registrarán como incidentes visibles en el panel del cliente. Cada cliente podrá activar una página de estado pública (de solo lectura, sin necesidad de login) para compartir con sus propios usuarios. Quedan fuera del alcance el envío de alertas (correo, SMS), la facturación y la remediación automática de fallos.

### 1.3 DEFINICIONES Y ACRÓNIMOS
*   **SRS:** Software Requirements Specification.
*   **Cliente:** Usuario registrado y autenticado que administra sus propios servicios monitoreados. (Nota: Se unifica el término para referirse a los usuarios del sistema).
*   **Servicio monitoreado:** Recurso (sitio web, API) cuya disponibilidad se verifica periódicamente.
*   **Checker:** Componente que ejecuta la verificación de un servicio (ej. petición HTTP).
*   **Incidente:** Registro generado cuando una verificación detecta que un servicio no responde correctamente.
*   **Página de estado pública:** Vista de solo lectura, sin autenticación, que muestra el estado actual de los servicios de un cliente a sus propios usuarios.

---

## 2. Descripción General

### 2.1 PERSPECTIVA DEL SISTEMA
StatusHub estará compuesto por dos partes:
*   **Backend:** Expone una API REST para el registro/login de clientes y la administración de sus servicios monitoreados, y ejecuta periódicamente la verificación (el checker) de cada servicio activo, previniendo ejecuciones concurrentes o duplicadas. Persistirá clientes, servicios e incidentes en una base de datos relacional, garantizando que los datos de un cliente nunca sean visibles para otro (multi-tenant).
*   **Frontend:** Aplicación web (SPA) donde el cliente se registra, inicia sesión, administra sus servicios y consulta su historial de incidentes; además renderiza la página de estado pública para visitantes sin sesión.

### 2.2 USUARIOS DEL SISTEMA
*   **Cliente:** Se registra, da de alta sus servicios y consulta su estado en un panel privado.
*   **Visitante público:** Accede, sin login, a la página de estado publicada por un cliente.

### 2.3 SUPOSICIONES Y DEPENDENCIAS
*   Se asume disponibilidad de una instancia de Redis para implementar el control de concurrencia de tareas.
*   Los servicios a monitorear deben ser alcanzables por HTTP(S) desde el backend.
*   El intervalo mínimo de verificación configurable es de 30 segundos.

---

## 3. Requisitos Específicos

### 3.1 REQUISITOS FUNCIONALES

*   **RF-01. Registro e inicio de sesión de clientes (frontend + backend)**
    Cualquier persona podrá crear una cuenta indicando correo y contraseña, e iniciar sesión luego. El backend devolverá un token de sesión que el frontend usará en cada solicitud posterior.
*   **RF-02. Alta de servicios propios (frontend + backend)**
    Un cliente podrá dar de alta un servicio indicando de forma obligatoria los siguientes campos: `nombre`, `URL`, `intervalo de chequeo`, y `visibilidad pública`. Un cliente solo podrá ver, editar o eliminar los servicios que él mismo dio de alta. La estructura de registro de incidentes deberá contener de forma obligatoria: `estado` (abierto/resuelto), `código HTTP` y `latencia`.
*   **RF-03. Verificación periódica de servicios**
    El sistema verificará cada servicio activo respetando el intervalo de chequeo configurado por el cliente al dar de alta el recurso. Se considerará un fallo cuando se detecte un *timeout* superior a 5 segundos, errores HTTP en el rango 5xx, o fallos de resolución DNS/certificados SSL. Si un servicio caído vuelve a responder con éxito, el incidente abierto se marcará como resuelto de forma automática.
*   **RF-04. Prevención de ejecuciones concurrentes**
    El sistema deberá validar la ejecución de las tareas de monitoreo garantizando que las verificaciones sobre un mismo servicio no se realicen de forma duplicada o concurrente, incluso si los ciclos de validación se superponen.
*   **RF-05. Panel privado del cliente (frontend)**
    El frontend mostrará al cliente el listado de sus servicios con su estado actual y un gráfico de disponibilidad histórica de los **últimos 30 días**. Para cada servicio, el sistema calculará la disponibilidad mediante la fórmula `((Tiempo Total del Período - Tiempo Total de Caídas) / Tiempo Total del Período) * 100` y mostrará el nivel de disponibilidad alcanzado según la siguiente escala:
    *   **Sin nivel:** disponibilidad inferior al 99%.
    *   **Nivel 1 (dos nueves):** disponibilidad igual o superior al 99%.
    *   **Nivel 2 (tres nueves):** disponibilidad igual o superior al 99,9%.
    *   **Nivel 3 (cuatro nueves):** disponibilidad igual o superior al 99,99%.
    *   **Nivel 4 (cinco nueves):** disponibilidad igual o superior al 99,999%.

    El sistema deberá informar el porcentaje calculado, el nivel alcanzado, el tiempo total de caída y el período evaluado. Además del gráfico histórico, el panel deberá mostrar un indicador visual de la escala de disponibilidad, señalando claramente el nivel alcanzado y los niveles superiores que aún no se cumplen. El nivel mostrado será el mayor nivel cuya disponibilidad mínima se cumpla.
*   **RF-06. Registro de incidentes**
    Cuando una verificación falle, el sistema generará un incidente con fecha, servicio afectado y descripción del fallo, visible en el panel del cliente.
*   **RF-07. Página de estado pública (frontend + backend)**
    StatusHub generará un enlace único asociado a cada cliente para su página de estado. La página permanecerá privada por defecto y el cliente podrá activarla o desactivarla desde su panel. Cuando la active, podrá copiar y compartir el enlace sin necesidad de que los visitantes tengan una cuenta o inicien sesión. El cliente podrá seleccionar de manera individual y específica cuáles de sus servicios activos serán visibles en dicha página. Si la página está desactivada, el enlace no deberá mostrar información pública.
*   **RF-08. Exportación del historial de incidentes (frontend)**
    Un cliente podrá exportar su historial de incidentes en formato CSV, filtrado por rango de fechas. El archivo descargado incluirá obligatoriamente las siguientes columnas: `Fecha y Hora`, `Nombre del Servicio`, `URL`, `Estado`, `Código HTTP`, `Latencia (ms)` y `Descripción del Fallo`.

*   **RF-09. Búsqueda de servicios en la página pública (frontend)**
    La página de estado pública deberá permitir al visitante buscar servicios visibles mediante su nombre o URL. La búsqueda deberá actualizar el listado sin recargar la página y solo podrá filtrar los servicios que el cliente haya marcado previamente como públicos. Si no existen coincidencias, el sistema deberá mostrar un mensaje informativo sin exponer servicios privados.

### 3.2 REQUISITOS NO FUNCIONALES

*   **RNF-01. Rendimiento:** Cada verificación deberá completarse (o expirar) en un máximo de 5 segundos, para no acumular tareas pendientes.
*   **RNF-02. Aislamiento multi-cliente:** Un cliente nunca deberá poder ver, editar ni eliminar servicios o incidentes de otro cliente.
*   **RNF-03. Concurrencia (Backend):** El sistema deberá garantizar la unicidad de las tareas de monitoreo, evitando procesos fantasmas o superpuestos en caso de alta carga.
*   **RNF-04. Seguridad:** Las contraseñas deberán almacenarse hasheadas (nunca en texto plano) y las conexiones deberán usar HTTPS.
*   **RNF-05. Disponibilidad y observabilidad:** El sistema StatusHub (API y Panel) deberá medir y reportar su disponibilidad mensual utilizando la escala de niveles definida en RF-05. Como objetivo operativo, deberá alcanzar al menos el **Nivel 2 (tres nueves, 99,9%)**, independientemente del estado de los servicios de los clientes que se estén monitoreando. La medición deberá excluir las caídas de los servicios monitoreados y considerar únicamente la disponibilidad de la API y el Panel de StatusHub. El panel deberá informar el porcentaje de disponibilidad, el nivel alcanzado y el tiempo total de indisponibilidad del período.

    Para un período de referencia de 30 días, los límites máximos aproximados de caída son:

    | Nivel | Disponibilidad mínima | Caída máxima en 30 días |
    | :--- | :--- | :--- |
    | Nivel 1 (dos nueves) | 99% | 7 h 12 min |
    | Nivel 2 (tres nueves) | 99,9% | 43 min 12 s |
    | Nivel 3 (cuatro nueves) | 99,99% | 4 min 19 s |
    | Nivel 4 (cinco nueves) | 99,999% | 26 s |

    Estos valores son referencias para un mes de 30 días; el cálculo real deberá utilizar la duración exacta del período evaluado.
*   **RNF-06. Usabilidad (Criterio de Aceptación UI):** El diseño de la interfaz del panel principal deberá destacar visualmente los servicios que se encuentren caídos, permitiendo al cliente identificarlos de forma inmediata en la vista por defecto sin requerir navegación adicional.

---

## 4. Interfaces Externas

*   **API REST:** Formato JSON, autenticación mediante token de sesión.
*   **Página de estado pública:** HTML servido sin autenticación mediante el enlace único generado por StatusHub para cada cliente, únicamente cuando el cliente haya activado la publicación.
*   **Frontend ↔ Backend:** La SPA consume únicamente la API REST; no accede directamente a la base de datos ni a Redis.
*   **Exportación de incidentes:** Formato CSV.

---

## 5. Restricciones

*   El backend (API REST y lógica de verificación) deberá desarrollarse en PHP.
*   Los bloqueos distribuidos (para cumplir con la no concurrencia de las tareas) se implementarán sobre Redis, utilizando claves con expiración (TTL).
*   La persistencia de clientes, servicios e incidentes se implementará sobre MySQL.
*   El frontend se desarrollará como aplicación web independiente (SPA) utilizando **TypeScript** para un tipado estricto, desacoplada del backend y desplegada por separado.

---

## 6. Trazabilidad

| Requisito | Caso de uso | Historia de usuario | Caso de prueba |
| :--- | :--- | :--- | :--- |
| **RF-01** | CU-00 Registrarse / iniciar sesión | US-00 | CP-00 Rechazo de login con credenciales inválidas |
| **RF-02** | CU-01 Dar de alta un servicio propio | US-01 | CP-01 Un cliente no puede ver servicios de otro cliente |
| **RF-03** | CU-02 Ejecutar verificación periódica | US-02 | CP-02 Verificación se ejecuta en el intervalo configurado por el usuario |
| **RF-04** | CU-03 Validar concurrencia de tareas | US-03 | CP-03 Segunda ejecución concurrente se omite correctamente |
| **RF-05** | CU-04 Consultar métricas en panel privado | US-04 | CP-04 El panel muestra porcentaje, período, nivel y tiempo de caída; una disponibilidad de 99,9% o superior informa el Nivel 2 o uno superior |
| **RF-06** | CU-05 Registrar incidente | US-05 | CP-05 Incidente se genera al fallar la verificación y se cierra al recuperarse |
| **RF-07** | CU-06 Publicar página de estado | US-06 | CP-06 Un cliente activa la página, copia su enlace y un visitante sin login solo visualiza los servicios públicos seleccionados |
| **RF-08** | CU-07 Exportar incidentes | US-07 | CP-07 Archivo CSV generado respeta filtros de fecha y columnas definidas |
| **RF-09** | CU-08 Buscar servicios públicos | US-08 | CP-08 La búsqueda filtra por nombre o URL y nunca muestra servicios privados |

---

## 7. Estimación de Tiempo de Desarrollo

*Estimación orientativa asumiendo dedicación part-time (8-10 horas semanales):*

| Bloque | Horas estimadas |
| :--- | :--- |
| Setup (repo, entorno, base de datos) | 3-4 h |
| RF-01 Registro/login (frontend + backend) | 6-8 h |
| RF-02 CRUD de servicios propios | 6-8 h |
| RF-03/RF-04 Verificación periódica + control concurrencia | 8-10 h |
| RF-05 Panel privado + gráfico de disponibilidad | 8-10 h |
| RF-06 Registro de incidentes | 4-6 h |
| RF-07 Página de estado pública | 4-6 h |
| RF-08 Exportación CSV | 2-3 h |
| Ajustes de UI / responsive | 4-6 h |
| Pruebas manuales y corrección de errores | 6-8 h |
| Documentación para la entrega | 3-4 h |
| **Total** | **~54-73 h** |

A ese ritmo, el desarrollo completo tomaría aproximadamente 6 a 9 semanas (1,5 a 2 meses).
