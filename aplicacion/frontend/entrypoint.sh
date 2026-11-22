#!/bin/sh
set -eu

PORT="${PORT:-80}"

cat << EOF > /etc/nginx/conf.d/default.conf
server {
    listen ${PORT};
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
EOF

if [ -n "${BACKEND_UPSTREAM:-}" ]; then
cat << EOF >> /etc/nginx/conf.d/default.conf

    location /api/ {
        proxy_pass ${BACKEND_UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
EOF
fi

echo "}" >> /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
