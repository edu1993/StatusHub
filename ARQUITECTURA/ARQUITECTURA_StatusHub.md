# Arquitectura del Sistema: StatusHub

## Backend

* **Tipo de Arquitectura:** Servidor dentro del modelo **Cliente-Servidor** y **Arquitectura en Capas (N-tier)**.
* **Fundamentación:**
  * La arquitectura **Cliente-Servidor** asigna al servidor el procesamiento y el almacenamiento de datos. Esto se alinea con el backend de StatusHub, que centraliza la base de datos MySQL, el control de concurrencia con Redis y la validación de la disponibilidad de los servicios.
  * Adicionalmente, la **Arquitectura en Capas (N-tier)** organiza el código dividiendo claramente las responsabilidades. En este caso, se divide en la capa de presentación (la API REST en JSON), la capa de lógica (el motor de monitoreo) y la capa de datos.
  * El backend se divide en `public/index.php` como entrada HTTP y módulos en `src/` para configuración, acceso a datos, autenticación, servicios, incidentes y worker. Docker despliega la API y el worker en contenedores independientes, junto con MySQL y Redis.

---

## Frontend

* **Tipo de Arquitectura:** Cliente dentro del modelo **Cliente-Servidor**.
* **Fundamentación:**
  * En la arquitectura **Cliente-Servidor**, el componente cliente es el responsable exclusivo de la interfaz de usuario y del consumo de servicios.
  * El frontend de StatusHub es una SPA React/TypeScript; mantiene HTML, CSS y lógica en archivos separados y consume la API REST. Nginx sirve los archivos compilados y reenvía `/api` al backend.

## Página de estado pública

* El backend genera un slug único por cliente y devuelve únicamente los servicios que estén marcados como públicos.
* El cliente puede copiar y abrir su enlace público, y define los servicios visibles editando esa opción desde el dashboard.
* El frontend renderiza la página sin autenticación y permite buscar por nombre o URL dentro de los servicios públicos devueltos por la API REST. No accede directamente a MySQL ni Redis.
