<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class CorsHeadersTest extends TestCase
{
    public function testIndexAppliesCorsHeadersBeforeHandlingOptionsPreflight(): void
    {
        $indexFile = dirname(__DIR__, 2) . '/public/index.php';
        $source = file_get_contents($indexFile);
        self::assertIsString($source);

        $corsPos = strpos($source, 'applyCorsHeaders(');
        $optionsPos = strpos($source, "=== 'OPTIONS'");

        self::assertNotFalse($corsPos, 'index.php debe invocar applyCorsHeaders().');
        self::assertNotFalse($optionsPos, 'index.php debe manejar solicitudes OPTIONS.');
        self::assertLessThan(
            $optionsPos,
            $corsPos,
            'applyCorsHeaders() debe ejecutarse ANTES de responder 204 a solicitudes OPTIONS.'
        );
    }

    public function testApplyCorsHeadersFunctionAllowsConfiguredOriginAndMethods(): void
    {
        $httpFile = dirname(__DIR__, 2) . '/src/http.php';
        $source = file_get_contents($httpFile);
        self::assertIsString($source);

        self::assertStringContainsString('Access-Control-Allow-Origin:', $source);
        self::assertStringContainsString('Vary: Origin', $source);
        self::assertStringContainsString('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS', $source);
        self::assertStringContainsString('Access-Control-Allow-Headers: Content-Type, Authorization', $source);
        self::assertStringContainsString("hash_equals(\$config['frontend_origin'], \$origin)", $source);
    }
}
