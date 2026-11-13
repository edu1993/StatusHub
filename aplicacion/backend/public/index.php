<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

try {
    $config = appConfig();
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && hash_equals($config['frontend_origin'], $origin)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');

    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $db = database();

    if ($path === '/api/health' && $method === 'GET') {
        sendJson(['status' => 'ok']);
    }
    if ($path === '/api/register' && $method === 'POST') {
        registerClient($db);
    }
    if ($path === '/api/login' && $method === 'POST') {
        loginClient($db);
    }
    if ($path === '/api/forgot-password' && $method === 'POST') {
        requestPasswordReset($db);
    }
    if ($path === '/api/reset-password' && $method === 'POST') {
        resetClientPassword($db);
    }
    if (preg_match('#^/api/public/status/([a-f0-9]{16})$#i', $path, $matches) && $method === 'GET') {
        publicStatus($db, $matches[1]);
    }

    if (str_starts_with($path, '/api/')) {
        $clientId = authenticatedClientId();
        if ($path === '/api/services' && $method === 'GET') {
            listServices($db, $clientId);
        }
        if ($path === '/api/services' && $method === 'POST') {
            createService($db, $clientId);
        }
        if (preg_match('#^/api/services/([1-9][0-9]*)$#', $path, $matches)) {
            $serviceId = (int) $matches[1];
            if ($method === 'PUT') {
                updateService($db, $clientId, $serviceId);
            }
            if ($method === 'DELETE') {
                deleteService($db, $clientId, $serviceId);
            }
        }
        if (preg_match('#^/api/services/([1-9][0-9]*)/checks$#', $path, $matches) && $method === 'GET') {
            $hourStart = $_GET['hour_start'] ?? '';
            checksForServiceHour($db, $clientId, (int) $matches[1], $hourStart);
        }
        if ($path === '/api/incidents' && $method === 'GET') {
            listIncidents($db, $clientId);
        }
        if ($path === '/api/export-csv' && $method === 'GET') {
            exportIncidents($db, $clientId);
        }
    }

    sendJson(['error' => 'Endpoint no encontrado.'], 404);
} catch (Throwable $error) {
    error_log($error->__toString());
    sendJson(['error' => 'Error interno del servidor.'], 500);
}
