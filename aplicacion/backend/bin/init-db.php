<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

for ($attempt = 1; $attempt <= 30; $attempt++) {
    try {
        initializeSchema();
        fwrite(STDOUT, "Esquema de StatusHub inicializado correctamente.\n");
        exit(0);
    } catch (PDOException $error) {
        $driverCode = (int) ($error->errorInfo[1] ?? 0);
        if (!in_array($driverCode, [2002, 2003, 2006], true) || $attempt === 30) {
            throw $error;
        }

        fwrite(STDERR, "MySQL todavía no acepta conexiones; nuevo intento {$attempt}/30.\n");
        sleep(2);
    }
}
