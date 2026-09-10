# Arquitectura del Sistema: StatusHub

## Backend

* **Tipo de Arquitectura:** Servidor dentro del modelo **Cliente-Servidor** y **Arquitectura en Capas (N-tier)**.
* **Fundamentación:**
  * La arquitectura **Cliente-Servidor** asigna al servidor el procesamiento y el almacenamiento de datos. Esto se alinea con el backend de StatusHub, que centraliza la base de datos MySQL, el control de concurrencia con Redis y la validación de la disponibilidad de los servicios.
  * Adicionalmente, la **Arquitectura en Capas (N-tier)** organiza el código dividiendo claramente las responsabilidades. En este caso, se divide en la capa de presentación (la API REST en JSON), la capa de lógica (el motor de monitoreo) y la capa de datos.
  * En un entorno Docker, esta separación es ideal porque permite desplegar un contenedor para el servidor web que expone la API, otro contenedor independiente para los procesos en segundo plano que ejecutan las verificaciones, y contenedores aislados para los motores de almacenamiento (MySQL y Redis).

---

## Frontend

* **Tipo de Arquitectura:** Cliente dentro del modelo **Cliente-Servidor**.
* **Fundamentación:**
  * En la arquitectura **Cliente-Servidor**, el componente cliente es el responsable exclusivo de la interfaz de usuario y del consumo de servicios.
  * El frontend de StatusHub opera exactamente bajo este principio: es una aplicación SPA desarrollada en TypeScript que delega el procesamiento complejo y se enfoca en gestionar la interfaz y consumir la API REST del backend.
  * Utilizando Docker, esta arquitectura se implementa desplegando un contenedor web ligero (como Nginx) dedicado únicamente a despachar los archivos estáticos compilados de la interfaz para los clientes y los visitantes públicos.

## Página de estado pública

* El backend será responsable de generar y validar un enlace único por cliente, almacenar si la página está activa y devolver únicamente los servicios que el cliente haya marcado como públicos.
* El cliente administrará desde el panel la activación o desactivación de su página, la copia del enlace y la selección de servicios visibles. La página permanecerá desactivada por defecto.
* El frontend renderizará la página pública sin autenticación y ofrecerá la búsqueda por nombre o URL únicamente sobre los servicios públicos recibidos desde la API REST. No tendrá permisos para editar servicios ni acceder directamente a MySQL o Redis.
