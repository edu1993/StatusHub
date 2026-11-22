#!/bin/sh
set -eu

PORT="${PORT:-80}"

sed -i "s/Listen 80/Listen ${PORT}/g" /etc/apache2/ports.conf
sed -i "s/<VirtualHost \*:80>/<VirtualHost *:${PORT}>/g" /etc/apache2/sites-available/000-default.conf

attempt=1
until php /var/www/html/bin/init-db.php; do
  if [ "$attempt" -ge 10 ]; then
    echo "Error: no fue posible inicializar la base de datos tras ${attempt} intentos." >&2
    exit 1
  fi
  echo "Esperando base de datos (intento ${attempt}/10)..."
  attempt=$((attempt + 1))
  sleep 2
done

if [ "${RUN_WORKER:-false}" = "true" ] || [ "${RUN_WORKER:-0}" = "1" ]; then
  echo "Iniciando worker en segundo plano..."
  php /var/www/html/bin/worker.php &
fi

exec apache2-foreground
