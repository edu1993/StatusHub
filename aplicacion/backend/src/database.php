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
        'mysql:host=%s;dbname=%s;charset=utf8mb4',
        $config['db_host'],
        $config['db_name']
    );

    $connection = new PDO($dsn, $config['db_user'], $config['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

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
    if (!$connection->connect($config['redis_host'], $config['redis_port'], 2.5)) {
        throw new RuntimeException('No fue posible conectar con Redis.');
    }

    return $connection;
}
