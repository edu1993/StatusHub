<?php
declare(strict_types=1);

function listIncidents(PDO $db, int $clientId): never
{
    $statement = $db->prepare("
        SELECT i.id, i.created_at AS date, s.name AS service_name, s.url,
            i.status, i.http_code, i.latency, i.description
        FROM incidents i
        JOIN services s ON s.id = i.service_id
        WHERE s.client_id = ?
        ORDER BY i.created_at DESC
        LIMIT 500
    ");
    $statement->execute([$clientId]);
    sendJson($statement->fetchAll());
}

function recentChecksByService(PDO $db, array $serviceIds): array
{
    if ($serviceIds === []) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($serviceIds), '?'));
    $statement = $db->prepare("
        SELECT service_id, DATE_FORMAT(created_at, '%H:00') AS timestamp,
            DATE_FORMAT(MIN(created_at), '%Y-%m-%d %H:00:00') AS hour_start,
            ROUND(AVG(latency)) AS latency,
            MAX(status_code) AS status_code,
            MAX(CASE WHEN status_code IS NULL OR status_code < 200 OR status_code >= 400
                THEN 1 ELSE 0 END) AS is_down,
            MAX(error_message) AS error_message
        FROM checks
        WHERE service_id IN ({$placeholders})
            AND created_at >= NOW() - INTERVAL 24 HOUR
        GROUP BY service_id,
            DATE_FORMAT(created_at, '%Y-%m-%d %H'),
            DATE_FORMAT(created_at, '%H:00')
        ORDER BY service_id, DATE_FORMAT(created_at, '%Y-%m-%d %H')
    ");
    $statement->execute($serviceIds);
    $checksByService = [];
    foreach ($statement->fetchAll() as $check) {
        $serviceId = (int) $check['service_id'];
        $checksByService[$serviceId][] = [
            'timestamp' => $check['timestamp'],
            'hour_start' => $check['hour_start'],
            'latency' => (int) $check['latency'],
            'status_code' => $check['status_code'] === null ? null : (int) $check['status_code'],
            'status' => (int) $check['is_down'] === 1 ? 'down' : 'up',
            'error_message' => $check['error_message'],
        ];
    }

    return $checksByService;
}

function checksForServiceHour(PDO $db, int $clientId, int $serviceId, string $hourStart): never
{
    $start = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $hourStart);
    $errors = DateTimeImmutable::getLastErrors();
    if (
        $start === false
        || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
        || $start->format('Y-m-d H:i:s') !== $hourStart
        || $start->format('i:s') !== '00:00'
    ) {
        sendJson(['error' => 'La hora solicitada no es válida.'], 400);
    }

    $owner = $db->prepare('SELECT id FROM services WHERE id = ? AND client_id = ?');
    $owner->execute([$serviceId, $clientId]);
    if (!$owner->fetch()) {
        sendJson(['error' => 'Servicio no encontrado.'], 404);
    }

    $statement = $db->prepare("
        SELECT DATE_FORMAT(created_at, '%H:%i') AS timestamp,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:00:00') AS hour_start,
            latency, status_code, error_message,
            CASE WHEN status_code IS NULL OR status_code < 200 OR status_code >= 400
                THEN 'down' ELSE 'up' END AS status
        FROM checks
        WHERE service_id = ?
            AND created_at >= ?
            AND created_at < DATE_ADD(?, INTERVAL 1 HOUR)
        ORDER BY created_at, id
    ");
    $statement->execute([$serviceId, $hourStart, $hourStart]);
    $checks = $statement->fetchAll();
    foreach ($checks as &$check) {
        $check['latency'] = (int) $check['latency'];
        $check['hour_start'] = $check['hour_start'];
        $check['status_code'] = $check['status_code'] === null ? null : (int) $check['status_code'];
    }

    sendJson($checks);
}

function exportIncidents(PDO $db, int $clientId): never
{
    $fromDate = $_GET['from'] ?? '';
    $toDate = $_GET['to'] ?? '';
    $service = $_GET['service'] ?? '';
    $status = $_GET['status'] ?? '';
    foreach ([$fromDate, $toDate] as $date) {
        if ($date !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            sendJson(['error' => 'El rango de fechas no es válido.'], 400);
        }
    }

    $where = ['s.client_id = ?'];
    $parameters = [$clientId];
    if ($fromDate !== '') {
        $where[] = 'i.created_at >= ?';
        $parameters[] = $fromDate . ' 00:00:00';
    }
    if ($toDate !== '') {
        $where[] = 'i.created_at < DATE_ADD(?, INTERVAL 1 DAY)';
        $parameters[] = $toDate . ' 00:00:00';
    }
    if ($service !== '' && $service !== 'Todos') {
        $where[] = 's.name = ?';
        $parameters[] = $service;
    }
    if ($status !== '' && $status !== 'Todos') {
        if (!in_array($status, ['Abierto', 'Resuelto'], true)) {
            sendJson(['error' => 'El filtro de estado no es válido.'], 400);
        }
        $where[] = 'i.status = ?';
        $parameters[] = $status;
    }

    $statement = $db->prepare("
        SELECT i.created_at AS 'Fecha y Hora', s.name AS 'Nombre del Servicio',
            s.url AS 'URL', i.status AS 'Estado', i.http_code AS 'Código HTTP',
            i.latency AS 'Latencia (ms)', i.description AS 'Descripción del Fallo'
        FROM incidents i
        JOIN services s ON s.id = i.service_id
        WHERE " . implode(' AND ', $where) . "
        ORDER BY i.created_at DESC
    ");
    $statement->execute($parameters);

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="incidentes_statushub.csv"');
    $output = fopen('php://output', 'w');
    if ($output === false) {
        throw new RuntimeException('No fue posible crear el archivo CSV.');
    }

    fwrite($output, "\xEF\xBB\xBF");
    fputcsv($output, ['Fecha y Hora', 'Nombre del Servicio', 'URL', 'Estado', 'Código HTTP', 'Latencia (ms)', 'Descripción del Fallo']);
    while ($row = $statement->fetch(PDO::FETCH_NUM)) {
        fputcsv($output, $row);
    }
    fclose($output);
    exit;
}

function publicStatus(PDO $db, string $slug): never
{
    $statement = $db->prepare('SELECT id FROM clients WHERE public_slug = ?');
    $statement->execute([$slug]);
    $client = $statement->fetch();
    if (!$client) {
        sendJson(['error' => 'Página de estado no encontrada.'], 404);
    }

    $statement = $db->prepare("
        SELECT s.id, s.name, s.url,
            CASE WHEN EXISTS (
                SELECT 1 FROM incidents i
                WHERE i.service_id = s.id AND i.status = 'Abierto'
            ) THEN 'down' ELSE 'up' END AS status,
            (SELECT i.http_code FROM incidents i WHERE i.service_id = s.id AND i.status = 'Abierto'
                ORDER BY i.created_at DESC LIMIT 1) AS http_code,
            (SELECT c.status_code FROM checks c WHERE c.service_id = s.id
                ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS status_code,
            (SELECT i.description FROM incidents i WHERE i.service_id = s.id AND i.status = 'Abierto'
                ORDER BY i.created_at DESC LIMIT 1) AS error_message,
            (SELECT c.latency FROM checks c WHERE c.service_id = s.id
                ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS latency,
            (SELECT c.created_at FROM checks c WHERE c.service_id = s.id
                ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS last_checked,
            COALESCE((
                SELECT SUM(TIMESTAMPDIFF(SECOND,
                    GREATEST(i.created_at, NOW() - INTERVAL 30 DAY),
                    LEAST(COALESCE(i.resolved_at, NOW()), NOW())
                ))
                FROM incidents i
                WHERE i.service_id = s.id
                    AND COALESCE(i.resolved_at, NOW()) > NOW() - INTERVAL 30 DAY
            ), 0) AS downtime_seconds
        FROM services s
        WHERE s.client_id = ? AND s.is_public = 1
        ORDER BY s.name
    ");
    $statement->execute([$client['id']]);
    $services = $statement->fetchAll();
    $serviceIds = array_map(static fn(array $service): int => (int) $service['id'], $services);
    $checksByService = recentChecksByService($db, $serviceIds);
    foreach ($services as &$service) {
        $service['id'] = (int) $service['id'];
        $service['status_code'] = $service['status_code'] === null ? null : (int) $service['status_code'];
        $service['http_code'] = $service['http_code'] === null ? null : (int) $service['http_code'];
        $service['latency'] = $service['latency'] === null ? null : (int) $service['latency'];
        $service['uptime'] = round(max(0, 100 - ((int) $service['downtime_seconds'] / 2592000 * 100)), 4);
        $service['check_interval'] = 0;
        $service['interval'] = 0;
        $service['is_public'] = true;
        $service['recent_checks'] = $checksByService[$service['id']] ?? [];
        unset($service['downtime_seconds']);
    }

    sendJson(['services' => $services]);
}
