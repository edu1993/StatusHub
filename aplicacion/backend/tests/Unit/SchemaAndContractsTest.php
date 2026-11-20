<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class SchemaAndContractsTest extends TestCase
{
    private string $srcDir;

    protected function setUp(): void
    {
        $this->srcDir = dirname(__DIR__, 2) . '/src';
    }

    public function testSchemaMatchesDerCorrections(): void
    {
        $schema = file_get_contents($this->srcDir . '/schema.php');
        self::assertIsString($schema);

        // public_status_enabled en clients por defecto FALSE
        self::assertStringContainsString('public_status_enabled BOOLEAN NOT NULL DEFAULT FALSE', $schema);

        // Largo máximo definido en VARCHAR y CHAR
        self::assertStringContainsString('email VARCHAR(255) NOT NULL UNIQUE', $schema);
        self::assertStringContainsString('url VARCHAR(2048) NOT NULL', $schema);
        self::assertStringContainsString('error_message VARCHAR(500) NULL', $schema);
        self::assertStringContainsString('token_hash CHAR(64) NOT NULL UNIQUE', $schema);

        // failure_type en checks e incidents con todas las causas del SRS + unknown
        self::assertStringContainsString(
            "failure_type ENUM('dns', 'ssl', 'http', 'timeout', 'connection', 'unknown') NOT NULL DEFAULT 'unknown'",
            $schema
        );
        self::assertStringContainsString(
            "failure_type ENUM('dns', 'ssl', 'http', 'timeout', 'connection', 'unknown') NULL DEFAULT NULL",
            $schema
        );

        // next_check eliminado de CREATE TABLE services y migración DROP COLUMN presente
        self::assertStringNotContainsString('next_check TIMESTAMP', $schema);
        self::assertStringContainsString('ALTER TABLE services DROP COLUMN next_check', $schema);
    }

    public function testWorkerDoesNotUseNextCheckAndTreats4xxAsHealthy(): void
    {
        $worker = file_get_contents($this->srcDir . '/worker.php');
        self::assertIsString($worker);

        self::assertStringNotContainsString('next_check', $worker);
        self::assertStringContainsString('MAX(created_at) AS last_checked', $worker);
        self::assertStringContainsString('$httpCode >= 200 && $httpCode < 500', $worker);
        self::assertStringNotContainsString('$httpCode < 400', $worker);
    }

    public function testIncidentsAndChecksUseConsistent5xxRuleAndExposeResolvedAt(): void
    {
        $incidents = file_get_contents($this->srcDir . '/incidents.php');
        self::assertIsString($incidents);

        // Consistencia HTTP 4xx saludable / 5xx fallo
        self::assertStringContainsString('status_code >= 500', $incidents);
        self::assertStringNotContainsString('status_code >= 400', $incidents);

        // Fecha de resolución y tipo de fallo incluidos en respuestas
        self::assertStringContainsString('i.resolved_at', $incidents);
        self::assertStringContainsString('i.failure_type', $incidents);

        // Página pública exige clients.public_status_enabled Y services.is_public = 1
        self::assertStringContainsString('public_status_enabled', $incidents);
        self::assertStringContainsString('s.is_public = 1', $incidents);

        // Paginación server-side soportada
        self::assertStringContainsString("'total_pages'", $incidents);
    }

    public function testServicesClampsIncidentsStartingBefore30DaysAndUsesRealPeriod(): void
    {
        $services = file_get_contents($this->srcDir . '/services.php');
        self::assertIsString($services);

        self::assertStringNotContainsString('2592000', $services, 'No debe hardcodear 2592000s en el cálculo privado.');
        self::assertStringContainsString('GREATEST(s.created_at, NOW() - INTERVAL 30 DAY)', $services);
        self::assertStringContainsString('GREATEST(i.created_at, GREATEST(s.created_at, NOW() - INTERVAL 30 DAY))', $services);
        self::assertStringContainsString("'availability_level'", $services);
        self::assertStringContainsString("'downtime_seconds'", $services);
        self::assertStringContainsString("'evaluated_period'", $services);
    }
}
