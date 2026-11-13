<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

fwrite(STDOUT, '[' . date('c') . "] Worker iniciado.\n");
while (true) {
    try {
        runWorkerOnce(database(), redisConnection());
    } catch (Throwable $error) {
        error_log('Error en ciclo del worker: ' . $error->getMessage());
    }
    sleep(5);
}
