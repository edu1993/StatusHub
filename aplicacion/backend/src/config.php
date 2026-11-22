<?php
declare(strict_types=1);

function config(string $name, ?string $default = null): string
{
    $value = getenv($name);
    if ($value === false || $value === '') {
        if ($default !== null) {
            return $default;
        }

        throw new RuntimeException("Falta configurar la variable de entorno {$name}.");
    }

    return $value;
}

function configAny(array $names, ?string $default = null): string
{
    foreach ($names as $name) {
        $value = getenv($name);
        if ($value !== false && $value !== '') {
            return $value;
        }
    }

    if ($default !== null) {
        return $default;
    }

    throw new RuntimeException("Falta configurar la variable de entorno {$names[0]}.");
}

function appConfig(): array
{
    return [
        'db_host' => configAny(['DB_HOST', 'MYSQLHOST'], 'mysql'),
        'db_port' => (int) configAny(['DB_PORT', 'MYSQLPORT'], '3306'),
        'db_name' => configAny(['DB_NAME', 'MYSQLDATABASE'], 'statushub'),
        'db_user' => configAny(['DB_USER', 'MYSQLUSER'], 'statushub'),
        'db_pass' => configAny(['DB_PASS', 'MYSQLPASSWORD'], ''),
        'db_ssl' => in_array(strtolower(config('DB_SSL', 'false')), ['1', 'true', 'yes'], true),
        'redis_host' => configAny(['REDIS_HOST', 'REDISHOST'], 'redis'),
        'redis_port' => (int) configAny(['REDIS_PORT', 'REDISPORT'], '6379'),
        'redis_password' => configAny(['REDIS_PASSWORD', 'REDISPASSWORD'], ''),
        'redis_tls' => in_array(strtolower(config('REDIS_TLS', 'false')), ['1', 'true', 'yes'], true),
        'jwt_secret' => config('JWT_SECRET'),
        'frontend_origin' => rtrim(config('FRONTEND_ORIGIN', 'http://localhost:5173'), '/'),
        'mail_adapter_url' => rtrim(config('MAILER_URL', 'http://mail-adapter:8025'), '/'),
        'mail_adapter_token' => config('MAILER_API_TOKEN'),
        'mailer_mode' => config('MAILER_MODE', 'local'),
    ];
}
