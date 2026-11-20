#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# StatusHub - Script autosuficiente para levantar y verificar todo el stack
# Funciona directamente en ~/Descargas/statushub-integrado (crea docker-compose.yml
# automáticamente si no existe) o en la raíz de tu repo si ya tienes uno.
#
# Uso:
#   ./levantar-statushub.sh              -> Construye, levanta y verifica todo
#   ./levantar-statushub.sh --no-tests   -> Levanta sin ejecutar tests
#   ./levantar-statushub.sh --logs       -> Levanta y deja los logs en pantalla
#   ./levantar-statushub.sh --down       -> Detiene y elimina los contenedores
# ==============================================================================

RUN_TESTS=true
FOLLOW_LOGS=false
DO_DOWN=false

for arg in "$@"; do
  case "$arg" in
    --no-tests) RUN_TESTS=false ;;
    --logs)     FOLLOW_LOGS=true ;;
    --down)     DO_DOWN=true ;;
    -h|--help)
      sed -n '4,14p' "$0"
      exit 0
      ;;
    *)
      echo "[ERROR] Opción desconocida: $arg (usa --help para ver las opciones)"
      exit 1
      ;;
  esac
done

# 1. Verificar Docker y Docker Compose
if ! command -v docker >/dev/null 2>&1; then
  echo "[ERROR] Docker no está instalado o no está en el PATH."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "[ERROR] El daemon de Docker no está corriendo. Inicia Docker e intenta de nuevo."
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "[ERROR] No se encontró 'docker compose' ni 'docker-compose'."
  exit 1
fi

# 2. Ubicar proyecto o generar docker-compose.yml si estás en statushub-integrado
if [[ -f "docker-compose.yml" || -f "compose.yml" ]]; then
  PROJECT_ROOT="$(pwd)"
elif [[ -d "backend" && -d "frontend" ]]; then
  PROJECT_ROOT="$(pwd)"
  echo "==> No se encontró docker-compose.yml; generando uno para ./backend y ./frontend..."
  cat > docker-compose.yml <<'EOF'
services:
  mysql:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: statushub
      MYSQL_USER: statushub
      MYSQL_PASSWORD: statushub_dev_password
      MYSQL_ROOT_PASSWORD: statushub_root_password
    volumes:
      - statushub_mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-ustatushub", "-pstatushub_dev_password"]
      interval: 5s
      timeout: 5s
      retries: 20

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  init-db:
    build: ./backend
    command: ["php", "bin/init-db.php"]
    depends_on:
      mysql:
        condition: service_healthy
    environment:
      DB_HOST: mysql
      DB_NAME: statushub
      DB_USER: statushub
      DB_PASS: statushub_dev_password
      REDIS_HOST: redis
      REDIS_PORT: "6379"
      JWT_SECRET: statushub-dev-jwt-secret-change-in-production-2026
      FRONTEND_ORIGIN: http://localhost:8080
      MAILER_URL: http://mail-adapter:8025
      MAILER_API_TOKEN: statushub-dev-mail-token
      MAILER_MODE: local

  backend:
    build: ./backend
    restart: unless-stopped
    depends_on:
      init-db:
        condition: service_completed_successfully
      redis:
        condition: service_healthy
    ports:
      - "8081:80"
    environment:
      DB_HOST: mysql
      DB_NAME: statushub
      DB_USER: statushub
      DB_PASS: statushub_dev_password
      REDIS_HOST: redis
      REDIS_PORT: "6379"
      JWT_SECRET: statushub-dev-jwt-secret-change-in-production-2026
      FRONTEND_ORIGIN: http://localhost:8080
      MAILER_URL: http://mail-adapter:8025
      MAILER_API_TOKEN: statushub-dev-mail-token
      MAILER_MODE: local

  worker:
    build: ./backend
    restart: unless-stopped
    command: ["php", "bin/worker.php"]
    depends_on:
      init-db:
        condition: service_completed_successfully
      redis:
        condition: service_healthy
    environment:
      DB_HOST: mysql
      DB_NAME: statushub
      DB_USER: statushub
      DB_PASS: statushub_dev_password
      REDIS_HOST: redis
      REDIS_PORT: "6379"
      JWT_SECRET: statushub-dev-jwt-secret-change-in-production-2026
      FRONTEND_ORIGIN: http://localhost:8080
      MAILER_URL: http://mail-adapter:8025
      MAILER_API_TOKEN: statushub-dev-mail-token
      MAILER_MODE: local

  frontend:
    build: ./frontend
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "8080:80"

volumes:
  statushub_mysql_data:
EOF
  echo "    [OK] docker-compose.yml generado."
elif [[ -f "../docker-compose.yml" || -f "../compose.yml" ]]; then
  PROJECT_ROOT="$(cd .. && pwd)"
else
  echo "[ERROR] Ejecuta este script dentro de statushub-integrado (donde están backend/ y frontend/)."
  exit 1
fi

cd "$PROJECT_ROOT"
echo "==> Directorio del proyecto: $PROJECT_ROOT"

if [[ "$DO_DOWN" == true ]]; then
  echo "==> Deteniendo servicios de StatusHub..."
  "${COMPOSE[@]}" down
  echo "==> Servicios detenidos."
  exit 0
fi

# 3. Validar configuración de Compose y construir/levantar todo
echo "==> Validando configuración de Docker Compose..."
"${COMPOSE[@]}" config >/dev/null

echo "==> Construyendo e iniciando todos los contenedores..."
"${COMPOSE[@]}" up -d --build

# 4. Detectar nombre del servicio backend en Compose
BACKEND_SVC=""
for candidate in backend api php; do
  if "${COMPOSE[@]}" config --services | grep -qx "$candidate"; then
    BACKEND_SVC="$candidate"
    break
  fi
done

# 5. Esperar a que el backend responda en /api/health
if [[ -n "$BACKEND_SVC" ]]; then
  echo "==> Esperando a que el servicio '$BACKEND_SVC' esté listo..."
  READY=false
  for attempt in $(seq 1 30); do
    if "${COMPOSE[@]}" exec -T "$BACKEND_SVC" php -r '
      $res = @file_get_contents("http://127.0.0.1/api/health");
      exit($res !== false && str_contains($res, "ok") ? 0 : 1);
    ' >/dev/null 2>&1; then
      READY=true
      break
    fi
    sleep 2
  done

  if [[ "$READY" != true ]]; then
    echo "[ERROR] El backend no respondió en /api/health después de 60s. Últimos logs:"
    "${COMPOSE[@]}" logs --tail=50 "$BACKEND_SVC"
    exit 1
  fi
  echo "    [OK] Backend respondiendo en /api/health."
fi

# 6. Ejecutar validaciones automáticas (sintaxis PHP + tests unitarios)
if [[ "$RUN_TESTS" == true && -n "$BACKEND_SVC" ]]; then
  echo "==> Verificando sintaxis PHP en todos los archivos del backend..."
  "${COMPOSE[@]}" exec -T "$BACKEND_SVC" sh -c '
    set -e
    for f in $(find src public bin tests -name "*.php" 2>/dev/null); do
      php -l "$f" >/dev/null
    done
  '
  echo "    [OK] Sintaxis PHP sin errores."

  if "${COMPOSE[@]}" exec -T "$BACKEND_SVC" test -f tests/run-standalone.php; then
    echo "==> Ejecutando tests unitarios del backend (run-standalone.php)..."
    "${COMPOSE[@]}" exec -T "$BACKEND_SVC" php tests/run-standalone.php
  fi
fi

# 7. Mostrar estado final y accesos
echo ""
echo "=============================================================="
echo " StatusHub levantado correctamente"
echo "=============================================================="
"${COMPOSE[@]}" ps
echo ""
echo "Accesos:"
echo "  - Frontend (SPA):          http://localhost:8080"
echo "  - Backend API (health):    http://localhost:8081/api/health"
echo "  - Ver logs en vivo:        ${COMPOSE[*]} logs -f"
echo "  - Detener todo:            ./levantar-statushub.sh --down"
echo "=============================================================="

if [[ "$FOLLOW_LOGS" == true ]]; then
  "${COMPOSE[@]}" logs -f
fi
