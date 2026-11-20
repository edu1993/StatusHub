<?php
declare(strict_types=1);

function classifyAvailabilityLevel(float $uptime): string
{
    if ($uptime >= 99.9) {
        return 'Excelente';
    }
    if ($uptime >= 99.0) {
        return 'Bueno';
    }
    if ($uptime >= 95.0) {
        return 'Aceptable';
    }

    return 'Crítico';
}

function buildAvailabilityMetrics(int $downtimeSeconds, int $periodSeconds, string $periodStart, string $periodEnd): array
{
    $safePeriod = max(1, $periodSeconds);
    $safeDowntime = min($safePeriod, max(0, $downtimeSeconds));
    $uptime = round(max(0.0, min(100.0, (1 - ($safeDowntime / $safePeriod)) * 100)), 4);

    return [
        'uptime' => $uptime,
        'availability_level' => classifyAvailabilityLevel($uptime),
        'downtime_seconds' => $safeDowntime,
        'evaluated_period' => [
            'days' => 30,
            'from' => $periodStart,
            'to' => $periodEnd,
            'duration_seconds' => $safePeriod,
        ],
    ];
}

function listServices(PDO $db, int $clientId): never
{
    $statement = $db->prepare("
        SELECT s.id, s.name, s.url, s.check_interval, s.is_public,
            CASE WHEN EXISTS (
                SELECT 1 FROM incidents i
                WHERE i.service_id = s.id AND i.status = 'Abierto'
            ) THEN 'down' ELSE 'up' END AS status,
            GREATEST(s.created_at, NOW() - INTERVAL 30 DAY) AS period_start,
            NOW() AS period_end,
            GREATEST(1, TIMESTAMPDIFF(
                SECOND,
                GREATEST(s.created_at, NOW() - INTERVAL 30 DAY),
                NOW()
            )) AS evaluated_period_seconds,
            COALESCE((
                SELECT SUM(
                    GREATEST(0, TIMESTAMPDIFF(
                        SECOND,
                        GREATEST(i.created_at, GREATEST(s.created_at, NOW() - INTERVAL 30 DAY)),
                        LEAST(COALESCE(i.resolved_at, NOW()), NOW())
                    ))
                )
                FROM incidents i
                WHERE i.service_id = s.id
                    AND COALESCE(i.resolved_at, NOW()) > GREATEST(s.created_at, NOW() - INTERVAL 30 DAY)
                    AND i.created_at < NOW()
            ), 0) AS downtime_seconds,
            (SELECT c.status_code FROM checks c WHERE c.service_id = s.id
                ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS status_code,
            (SELECT c.latency FROM checks c WHERE c.service_id = s.id
                ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS latency,
            (SELECT c.failure_type FROM checks c WHERE c.service_id = s.id
                ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS failure_type,
            (SELECT c.error_message FROM checks c WHERE c.service_id = s.id
                ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS error_message,
            (SELECT c.created_at FROM checks c WHERE c.service_id = s.id
                ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS last_checked
        FROM services s
        WHERE s.client_id = ?
        ORDER BY s.id DESC
    ");
    $statement->execute([$clientId]);
    $services = $statement->fetchAll();
    $serviceIds = array_map(static fn(array $service): int => (int) $service['id'], $services);
    $checksByService = recentChecksByService($db, $serviceIds);

    foreach ($services as &$service) {
        $metrics = buildAvailabilityMetrics(
            (int) $service['downtime_seconds'],
            (int) $service['evaluated_period_seconds'],
            (string) $service['period_start'],
            (string) $service['period_end']
        );

        $service['id'] = (int) $service['id'];
        $service['check_interval'] = (int) $service['check_interval'];
        $service['interval'] = $service['check_interval'];
        $service['is_public'] = (bool) $service['is_public'];
        $service['uptime'] = $metrics['uptime'];
        $service['availability_level'] = $metrics['availability_level'];
        $service['downtime_seconds'] = $metrics['downtime_seconds'];
        $service['evaluated_period'] = $metrics['evaluated_period'];
        $service['status_code'] = $service['status_code'] === null ? null : (int) $service['status_code'];
        $service['latency'] = $service['latency'] === null ? null : (int) $service['latency'];
        $service['recent_checks'] = $checksByService[(int) $service['id']] ?? [];
        unset($service['period_start'], $service['period_end'], $service['evaluated_period_seconds']);
    }

    sendJson($services);
}

function createService(PDO $db, int $clientId): never
{
    $service = validatedServiceInput(requestData());
    $statement = $db->prepare("
        INSERT INTO services (client_id, name, url, check_interval, is_public)
        VALUES (?, ?, ?, ?, ?)
    ");
    $statement->execute([
        $clientId,
        $service['name'],
        $service['url'],
        $service['check_interval'],
        $service['is_public'],
    ]);

    sendJson(['message' => 'Servicio creado correctamente.', 'id' => (int) $db->lastInsertId()], 201);
}

function updateService(PDO $db, int $clientId, int $serviceId): never
{
    $service = validatedServiceInput(requestData());
    $statement = $db->prepare("
        UPDATE services SET name = ?, url = ?, check_interval = ?, is_public = ?
        WHERE id = ? AND client_id = ?
    ");
    $statement->execute([
        $service['name'],
        $service['url'],
        $service['check_interval'],
        $service['is_public'],
        $serviceId,
        $clientId,
    ]);

    if ($statement->rowCount() === 0) {
        $exists = $db->prepare('SELECT id FROM services WHERE id = ? AND client_id = ?');
        $exists->execute([$serviceId, $clientId]);
        if (!$exists->fetch()) {
            sendJson(['error' => 'Servicio no encontrado.'], 404);
        }
    }

    sendJson(['message' => 'Servicio actualizado correctamente.']);
}

function deleteService(PDO $db, int $clientId, int $serviceId): never
{
    $statement = $db->prepare('DELETE FROM services WHERE id = ? AND client_id = ?');
    $statement->execute([$serviceId, $clientId]);
    if ($statement->rowCount() === 0) {
        sendJson(['error' => 'Servicio no encontrado.'], 404);
    }

    sendJson(['message' => 'Servicio eliminado correctamente.']);
}
