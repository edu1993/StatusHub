<?php
declare(strict_types=1);

function sendJson(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function requestData(): array
{
    $data = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($data)) {
        sendJson(['error' => 'El cuerpo de la solicitud debe ser JSON válido.'], 400);
    }

    return $data;
}

function jwtEncode(array $payload): string
{
    $header = base64UrlEncode(json_encode(['typ' => 'JWT', 'alg' => 'HS256']));
    $body = base64UrlEncode(json_encode($payload, JSON_UNESCAPED_UNICODE));
    $signature = hash_hmac('sha256', "{$header}.{$body}", appConfig()['jwt_secret'], true);

    return "{$header}.{$body}." . base64UrlEncode($signature);
}

function jwtDecode(string $token): ?array
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }

    [$encodedHeader, $encodedPayload, $encodedSignature] = $parts;
    $header = json_decode(base64UrlDecode($encodedHeader), true);
    $payload = json_decode(base64UrlDecode($encodedPayload), true);
    if (!is_array($header) || ($header['alg'] ?? null) !== 'HS256' || !is_array($payload)) {
        return null;
    }

    $signature = base64UrlDecode($encodedSignature);
    $expected = hash_hmac(
        'sha256',
        "{$encodedHeader}.{$encodedPayload}",
        appConfig()['jwt_secret'],
        true
    );

    if (!hash_equals($expected, $signature) || !isset($payload['exp'], $payload['client_id'])) {
        return null;
    }

    return (int) $payload['exp'] > time() ? $payload : null;
}

function base64UrlEncode(string|false $value): string
{
    if ($value === false) {
        throw new RuntimeException('No fue posible codificar un token.');
    }

    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function base64UrlDecode(string $value): string
{
    $decoded = base64_decode(strtr($value, '-_', '+/'), true);
    return $decoded === false ? '' : $decoded;
}

function authenticatedClientId(): int
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($header === '' && function_exists('getallheaders')) {
        $headers = getallheaders();
        $header = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }

    if (!preg_match('/^Bearer\s+(\S+)$/i', $header, $matches)) {
        sendJson(['error' => 'Autenticación requerida.'], 401);
    }

    $payload = jwtDecode($matches[1]);
    if ($payload === null) {
        sendJson(['error' => 'El token no es válido o expiró.'], 401);
    }

    $clientId = (int) $payload['client_id'];
    $statement = database()->prepare('SELECT auth_version FROM clients WHERE id = ?');
    $statement->execute([$clientId]);
    $authVersion = $statement->fetchColumn();
    if ($authVersion === false || (int) ($payload['ver'] ?? 0) !== (int) $authVersion) {
        sendJson(['error' => 'La sesión ya no es válida. Inicia sesión nuevamente.'], 401);
    }

    return $clientId;
}

function validatedServiceInput(array $data): array
{
    $name = trim((string) ($data['name'] ?? ''));
    $url = trim((string) ($data['url'] ?? ''));
    $interval = filter_var($data['check_interval'] ?? $data['interval'] ?? null, FILTER_VALIDATE_INT);
    $parts = parse_url($url);

    if ($name === '' || strlen($name) > 255) {
        sendJson(['error' => 'El nombre del servicio es obligatorio y no debe superar 255 caracteres.'], 400);
    }
    if (!filter_var($url, FILTER_VALIDATE_URL) || !in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true)) {
        sendJson(['error' => 'La URL debe ser una dirección HTTP o HTTPS válida.'], 400);
    }
    if ($interval === false || $interval < 30 || $interval > 86400) {
        sendJson(['error' => 'El intervalo debe estar entre 30 y 86400 segundos.'], 400);
    }

    return [
        'name' => $name,
        'url' => $url,
        'check_interval' => $interval,
        'is_public' => filter_var($data['is_public'] ?? false, FILTER_VALIDATE_BOOLEAN) ? 1 : 0,
    ];
}
