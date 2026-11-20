# StatusHub — Paquete Integrado (Frontend + Backend + DER + Tests)

## Levantar con Docker Compose
Reemplaza las carpetas `frontend/` y `backend/` en tu repositorio y ejecuta desde la raíz del proyecto:
```bash
docker compose up --build
```
*(Se mantuvieron `frontend/package.json` y `frontend/package-lock.json` sincronizados y `src/__tests__` excluido de `tsconfig.app.json` para que `npm ci` y `npm run build` dentro del Dockerfile pasen sin errores).*

## Ejecutar tests del Backend (PHP 8.2+)
- **Sin dependencias (dentro del contenedor PHP):**
  ```bash
  docker compose exec backend php tests/run-standalone.php
  ```
- **Con PHPUnit:**
  ```bash
  cd backend && composer install && composer test
  ```

## Ejecutar tests del Frontend (Vitest + React Testing Library)
```bash
cd frontend
npm install -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @vitest/coverage-v8
npx vitest run
```
