<?php
declare(strict_types=1);

/**
 * Runner liviano sin dependencias externas (útil dentro del contenedor PHP sin Composer).
 * Uso: php tests/run-standalone.php
 */
require_once __DIR__ . '/bootstrap.php';

$passed = 0;
$failed = 0;

function check(string $name, bool $condition, string $detail = ''): void
{
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "  [OK] {$name}\n";
    } else {
        $failed++;
        echo "  [FAIL] {$name}" . ($detail !== '' ? " -> {$detail}" : '') . "\n";
    }
}

echo "StatusHub Backend - Standalone Unit Test Runner\n\n";

// 1. RF-05 y disponibilidad
check('RF-05: 99.9% es Excelente', classifyAvailabilityLevel(99.9) === 'Excelente');
check('RF-05: 99.5% es Bueno', classifyAvailabilityLevel(99.5) === 'Bueno');
check('RF-05: 96.0% es Aceptable', classifyAvailabilityLevel(96.0) === 'Aceptable');
check('RF-05: 94.9% es Crítico', classifyAvailabilityLevel(94.9) === 'Crítico');

$m = buildAvailabilityMetrics(1800, 3600, '2026-11-19 20:00:00', '2026-11-19 21:00:00');
check('Disponibilidad usa duración real (1800/3600 => 50%)', $m['uptime'] === 50.0);
check('Disponibilidad expone downtime_seconds y evaluated_period', $m['downtime_seconds'] === 1800 && $m['evaluated_period']['duration_seconds'] === 3600);

$clamped = buildAvailabilityMetrics(99999, 3600, '2026-11-19 20:00:00', '2026-11-19 21:00:00');
check('Downtime acotado al período (uptime >= 0%)', $clamped['uptime'] === 0.0 && $clamped['downtime_seconds'] === 3600);

// 2. Clasificación de fallos y regla HTTP 4xx vs 5xx
check('HTTP 404 es saludable (failure_type null)', classifyFailureType(true, 0, 404) === null);
check('HTTP 503 se clasifica como http', classifyFailureType(false, 0, 503) === 'http');
check('cURL DNS (6) se clasifica como dns', classifyFailureType(false, 6, 0) === 'dns');
check('cURL Timeout (28) se clasifica como timeout', classifyFailureType(false, 28, 0) === 'timeout');
check('cURL SSL (60/83) se clasifica como ssl', classifyFailureType(false, 60, 0) === 'ssl' && classifyFailureType(false, 83, 0) === 'ssl');
check('cURL Connection (7) se clasifica como connection', classifyFailureType(false, 7, 0) === 'connection');
check('Error no determinable cae en unknown', classifyFailureType(false, 0, 0) === 'unknown');

// 3. JWT & Validación de servicios
$tok = jwtEncode(['client_id' => 7, 'ver' => 1, 'exp' => time() + 600]);
$dec = jwtDecode($tok);
check('JWT round-trip válido', is_array($dec) && $dec['client_id'] === 7 && $dec['ver'] === 1);
$expired = jwtEncode(['client_id' => 7, 'ver' => 1, 'exp' => time() - 5]);
check('JWT expirado es rechazado', jwtDecode($expired) === null);

$svc = validatedServiceInput(['name' => ' API ', 'url' => 'https://example.com', 'check_interval' => 60, 'is_public' => true]);
check('validatedServiceInput normaliza campos válidos', $svc['name'] === 'API' && $svc['is_public'] === 1);

// 4. CORS en OPTIONS, Zona horaria y Contratos de Cuenta/Página Pública
$root = dirname(__DIR__);
$indexSrc = file_get_contents($root . '/public/index.php') ?: '';
$authSrc = file_get_contents($root . '/src/auth.php') ?: '';
$schemaSrc = file_get_contents($root . '/src/schema.php') ?: '';
$dbSrc = file_get_contents($root . '/src/database.php') ?: '';

check('CORS se aplica antes de responder OPTIONS 204', strpos($indexSrc, 'applyCorsHeaders(') < strpos($indexSrc, "=== 'OPTIONS'"));
check('Zona horaria PHP configurada (America/Argentina/Buenos_Aires)', date_default_timezone_get() === (getenv('APP_TIMEZONE') ?: 'America/Argentina/Buenos_Aires'));
check('MySQL sincroniza SET time_zone en database.php', str_contains($dbSrc, 'SET time_zone ='));
check('Esquema incluye public_page_name VARCHAR(120)', str_contains($schemaSrc, 'public_page_name VARCHAR(120) NULL DEFAULT NULL'));
check('Página pública exige nombre de organización al activarse', str_contains($authSrc, 'El nombre de la organización es obligatorio para activar la página pública.'));
check('Endpoints de cambio de contraseña y baja existen en index.php', str_contains($indexSrc, "'/api/account/password'") && str_contains($indexSrc, "'/api/account'"));

echo "\nResultado: {$passed} pasaron, {$failed} fallaron.\n";
exit($failed > 0 ? 1 : 0);
