<?php
declare(strict_types=1);

function database(): PDO
{
    static $connection;
    if ($connection instanceof PDO) {
        return $connection;
    }

    $config = appConfig();
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $config['db_host'],
        $config['db_port'],
        $config['db_name']
    );

    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    if ($config['db_ssl']) {
        $caPath = '/etc/ssl/certs/ca-certificates.crt';
        if (is_file($caPath)) {
            $options[PDO::MYSQL_ATTR_SSL_CA] = $caPath;
        }
    }

    $connection = new PDO($dsn, $config['db_user'], $config['db_pass'], $options);

    // Alinear la sesión de MySQL con la zona horaria de PHP (por defecto UTC-3 Argentina)
    $offset = (new DateTimeImmutable('now'))->format('P');
    $connection->exec("SET time_zone = '{$offset}'");

    return $connection;
}

function redisConnection(): Redis
{
    static $connection;
    if ($connection instanceof Redis) {
        return $connection;
    }

    $config = appConfig();
    $connection = new Redis();
    $host = $config['redis_tls'] ? 'tls://' . $config['redis_host'] : $config['redis_host'];

    if (!$connection->connect($host, $config['redis_port'], 2.5)) {
        throw new RuntimeException('No fue posible conectar con Redis.');
    }

    if ($config['redis_password'] !== '') {
        if (!$connection->auth($config['redis_password'])) {
            throw new RuntimeException('No fue posible autenticar con Redis.');
        }
    }

    return $connection;
}
