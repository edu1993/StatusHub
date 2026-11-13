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

function appConfig(): array
{
    return [
        'db_host' => config('DB_HOST', 'mysql'),
        'db_name' => config('DB_NAME', 'statushub'),
        'db_user' => config('DB_USER', 'statushub'),
        'db_pass' => config('DB_PASS', ''),
        'redis_host' => config('REDIS_HOST', 'redis'),
        'redis_port' => (int) config('REDIS_PORT', '6379'),
        'jwt_secret' => config('JWT_SECRET'),
        'frontend_origin' => config('FRONTEND_ORIGIN', 'http://localhost:5173'),
        'mail_adapter_url' => rtrim(config('MAILER_URL', 'http://mail-adapter:8025'), '/'),
        'mail_adapter_token' => config('MAILER_API_TOKEN'),
        'mailer_mode' => config('MAILER_MODE', 'local'),
    ];
}
