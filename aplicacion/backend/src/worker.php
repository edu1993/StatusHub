<?php
declare(strict_types=1);

function classifyFailureType(bool $healthy, int $curlErrno, int $httpCode): ?string
{
    if ($healthy) {
        return null;
    }

    if ($curlErrno !== 0) {
        // Códigos numéricos estándar de libcurl (evita incompatibilidades de constantes entre versiones de PHP)
        return match ($curlErrno) {
            5, 6 => 'dns',                                  // COULDNT_RESOLVE_PROXY, COULDNT_RESOLVE_HOST
            28 => 'timeout',                                // OPERATION_TIMEDOUT
            35, 51, 53, 54, 58, 59, 60, 77, 83 => 'ssl',    // Errores SSL/TLS y verificación de certificados
            7, 52, 55, 56 => 'connection',                  // COULDNT_CONNECT, GOT_NOTHING, SEND_ERROR, RECV_ERROR
            default => 'unknown',
        };
    }

    if ($httpCode >= 500 || ($httpCode > 0 && $httpCode < 200)) {
        return 'http';
    }

    return 'unknown';
}

function runWorkerOnce(PDO $db, Redis $redis): void
{
    $services = $db->query("
        SELECT s.id, s.name, s.url, s.check_interval
        FROM services s
        LEFT JOIN (
            SELECT service_id, MAX(created_at) AS last_checked
            FROM checks
            GROUP BY service_id
        ) lc ON lc.service_id = s.id
        WHERE lc.last_checked IS NULL
            OR TIMESTAMPADD(SECOND, s.check_interval, lc.last_checked) <= NOW()
        ORDER BY COALESCE(lc.last_checked, '1970-01-01 00:00:00') ASC
        LIMIT 100
    ")->fetchAll();

    foreach ($services as $service) {
        $lockKey = 'lock:service:' . $service['id'];
        $lockValue = bin2hex(random_bytes(16));
        if (!$redis->set($lockKey, $lockValue, ['nx', 'ex' => 30])) {
            continue;
        }

        try {
            $curl = curl_init($service['url']);
            if ($curl === false) {
                throw new RuntimeException('No fue posible inicializar cURL.');
            }

            curl_setopt_array($curl, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT => 3,
                CURLOPT_TIMEOUT => 5,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_USERAGENT => 'StatusHub-Monitor/1.0',
            ]);

            $startedAt = microtime(true);
            $response = curl_exec($curl);
            $latency = (int) round((microtime(true) - $startedAt) * 1000);
            $httpCode = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
            $curlErrno = $response === false ? curl_errno($curl) : 0;
            $error = $response === false ? curl_error($curl) : null;
            curl_close($curl);

            // Según SRS: 2xx, 3xx y 4xx indican servicio accesible (saludable); 5xx y fallos de red/SSL/DNS/timeout son caída
            $healthy = $response !== false && $httpCode >= 200 && $httpCode < 500;
            $statusCode = $httpCode > 0 ? $httpCode : null;
            $failureType = classifyFailureType($healthy, $curlErrno, $httpCode);
            $errorMessage = $healthy
                ? null
                : ($error ?: sprintf('El servicio respondió con HTTP %d.', $httpCode));
            if (!$healthy && $response === false) {
                $latency = 0;
            }

            $db->beginTransaction();
            $insert = $db->prepare("
                INSERT INTO checks (service_id, status_code, latency, failure_type, error_message)
                VALUES (?, ?, ?, ?, ?)
            ");
            $insert->execute([$service['id'], $statusCode, $latency, $failureType, $errorMessage]);

            $open = $db->prepare("
                SELECT id FROM incidents
                WHERE service_id = ? AND status = 'Abierto'
                ORDER BY created_at DESC LIMIT 1
            ");
            $open->execute([$service['id']]);
            $incident = $open->fetch();

            if (!$healthy && !$incident) {
                $insertIncident = $db->prepare("
                    INSERT INTO incidents (service_id, http_code, latency, failure_type, description)
                    VALUES (?, ?, ?, ?, ?)
                ");
                $insertIncident->execute([
                    $service['id'],
                    $statusCode,
                    $latency,
                    $failureType ?? 'unknown',
                    $errorMessage ?? 'Fallo de disponibilidad detectado.',
                ]);
                printf("[%s] Servicio #%d caído (%s); incidente creado.%s", date('c'), $service['id'], $failureType ?? 'unknown', PHP_EOL);
            } elseif ($healthy && $incident) {
                $resolve = $db->prepare("
                    UPDATE incidents SET status = 'Resuelto', resolved_at = NOW() WHERE id = ?
                ");
                $resolve->execute([$incident['id']]);
                printf("[%s] Servicio #%d recuperado; incidente resuelto.%s", date('c'), $service['id'], PHP_EOL);
            } else {
                printf("[%s] Servicio #%d verificado (%d ms).%s", date('c'), $service['id'], $latency, PHP_EOL);
            }

            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            error_log(sprintf('Error verificando servicio #%d: %s', $service['id'], $error->getMessage()));
        } finally {
            $redis->eval(
                "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
                [$lockKey, $lockValue],
                1
            );
        }
    }
}
