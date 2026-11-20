<?php
declare(strict_types=1);

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class FailureClassificationTest extends TestCase
{
    #[DataProvider('healthyStatusCodesProvider')]
    public function testHealthyResponsesIncluding4xxReturnNullFailureType(int $httpCode): void
    {
        // Según SRS: 2xx, 3xx y 4xx indican servicio accesible (saludable)
        $healthy = $httpCode >= 200 && $httpCode < 500;
        self::assertTrue($healthy, "HTTP {$httpCode} debe considerarse saludable.");
        self::assertNull(classifyFailureType($healthy, 0, $httpCode));
    }

    public static function healthyStatusCodesProvider(): array
    {
        return [
            'HTTP 200 OK' => [200],
            'HTTP 204 No Content' => [204],
            'HTTP 301 Moved Permanently' => [301],
            'HTTP 302 Found' => [302],
            'HTTP 400 Bad Request' => [400],
            'HTTP 401 Unauthorized' => [401],
            'HTTP 403 Forbidden' => [403],
            'HTTP 404 Not Found' => [404],
            'HTTP 429 Too Many Requests' => [429],
        ];
    }

    #[DataProvider('httpFailureStatusCodesProvider')]
    public function testHttp5xxAndInvalidCodesAreClassifiedAsHttpFailure(int $httpCode): void
    {
        $healthy = $httpCode >= 200 && $httpCode < 500;
        self::assertFalse($healthy, "HTTP {$httpCode} debe considerarse fallo.");
        self::assertSame('http', classifyFailureType($healthy, 0, $httpCode));
    }

    public static function httpFailureStatusCodesProvider(): array
    {
        return [
            'HTTP 100 Continue sin respuesta final' => [100],
            'HTTP 500 Internal Server Error' => [500],
            'HTTP 502 Bad Gateway' => [502],
            'HTTP 503 Service Unavailable' => [503],
            'HTTP 504 Gateway Timeout' => [504],
        ];
    }

    #[DataProvider('curlErrnoProvider')]
    public function testCurlErrorsMapToExpectedFailureTypes(int $curlErrno, string $expectedType): void
    {
        self::assertSame($expectedType, classifyFailureType(false, $curlErrno, 0));
    }

    public static function curlErrnoProvider(): array
    {
        return [
            'DNS host no resuelto' => [CURLE_COULDNT_RESOLVE_HOST, 'dns'],
            'DNS proxy no resuelto' => [CURLE_COULDNT_RESOLVE_PROXY, 'dns'],
            'Timeout de operación' => [CURLE_OPERATION_TIMEDOUT, 'timeout'],
            'Error handshake SSL' => [CURLE_SSL_CONNECT_ERROR, 'ssl'],
            'Certificado SSL inválido' => [60, 'ssl'],
            'Problema con certificado local SSL' => [CURLE_SSL_CERTPROBLEM, 'ssl'],
            'Error de emisor SSL' => [83, 'ssl'],
            'No se pudo conectar TCP' => [CURLE_COULDNT_CONNECT, 'connection'],
            'Respuesta vacía de red' => [CURLE_GOT_NOTHING, 'connection'],
            'Error al enviar datos' => [CURLE_SEND_ERROR, 'connection'],
            'Error al recibir datos' => [CURLE_RECV_ERROR, 'connection'],
            'Error cURL no mapeado cae en unknown' => [999, 'unknown'],
        ];
    }

    public function testUndeterminedFailureFallsBackToUnknown(): void
    {
        self::assertSame('unknown', classifyFailureType(false, 0, 0));
    }
}
