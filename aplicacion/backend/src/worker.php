<?php
declare(strict_types=1);

function runWorkerOnce(PDO $db, Redis $redis): void
{
    $services = $db->query("
        SELECT id, name, url, check_interval
        FROM services
        WHERE next_check <= NOW()
        ORDER BY next_check
        LIMIT 100
    ")->fetchAll();

    foreach ($services as $service) {
        $lockKey = 'lock:service:' . $service['id'];
        $lockValue = bin2hex(random_bytes(16));
        if (!$redis->set($lockKey, $lockValue, ['nx', 'ex' => 30])) {
            continue;
        }

        try {
            $update = $db->prepare('UPDATE services SET next_check = ? WHERE id = ?');
            $update->execute([
                date('Y-m-d H:i:s', time() + (int) $service['check_interval']),
                $service['id'],
            ]);

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
            $error = $response === false ? curl_error($curl) : null;
            curl_close($curl);

            $healthy = $response !== false && $httpCode >= 200 && $httpCode < 400;
            $statusCode = $httpCode > 0 ? $httpCode : null;
            $errorMessage = $healthy
                ? null
                : ($error ?: sprintf('El servicio respondió con HTTP %d.', $httpCode));
            if (!$healthy && $response === false) {
                $latency = 0;
            }

            $db->beginTransaction();
            $insert = $db->prepare("
                INSERT INTO checks (service_id, status_code, latency, error_message)
                VALUES (?, ?, ?, ?)
            ");
            $insert->execute([$service['id'], $statusCode, $latency, $errorMessage]);

            $open = $db->prepare("
                SELECT id FROM incidents
                WHERE service_id = ? AND status = 'Abierto'
                ORDER BY created_at DESC LIMIT 1
            ");
            $open->execute([$service['id']]);
            $incident = $open->fetch();

            if (!$healthy && !$incident) {
                $insertIncident = $db->prepare("
                    INSERT INTO incidents (service_id, http_code, latency, description)
                    VALUES (?, ?, ?, ?)
                ");
                $insertIncident->execute([$service['id'], $statusCode, $latency, $errorMessage]);
                printf("[%s] Servicio #%d caído; incidente creado.%s", date('c'), $service['id'], PHP_EOL);
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
