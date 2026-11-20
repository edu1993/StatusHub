<?php
declare(strict_types=1);

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class AvailabilityMetricsTest extends TestCase
{
    #[DataProvider('availabilityLevelProvider')]
    public function testClassifyAvailabilityLevelThresholds(float $uptime, string $expectedLevel): void
    {
        self::assertSame($expectedLevel, classifyAvailabilityLevel($uptime));
    }

    public static function availabilityLevelProvider(): array
    {
        return [
            '100% es Excelente' => [100.0, 'Excelente'],
            '99.9% limite inferior Excelente' => [99.9, 'Excelente'],
            '99.8999% baja a Bueno' => [99.8999, 'Bueno'],
            '99.0% limite inferior Bueno' => [99.0, 'Bueno'],
            '98.9999% baja a Aceptable' => [98.9999, 'Aceptable'],
            '95.0% limite inferior Aceptable' => [95.0, 'Aceptable'],
            '94.9999% baja a Critico' => [94.9999, 'Crítico'],
            '0% es Critico' => [0.0, 'Crítico'],
        ];
    }

    public function testBuildAvailabilityMetricsReturnsAllRf05Fields(): void
    {
        $metrics = buildAvailabilityMetrics(
            downtimeSeconds: 0,
            periodSeconds: 2592000,
            periodStart: '2026-10-20 00:00:00',
            periodEnd: '2026-11-19 00:00:00'
        );

        self::assertSame(100.0, $metrics['uptime']);
        self::assertSame('Excelente', $metrics['availability_level']);
        self::assertSame(0, $metrics['downtime_seconds']);
        self::assertSame([
            'days' => 30,
            'from' => '2026-10-20 00:00:00',
            'to' => '2026-11-19 00:00:00',
            'duration_seconds' => 2592000,
        ], $metrics['evaluated_period']);
    }

    public function testBuildAvailabilityMetricsUsesActualPeriodDurationInsteadOfFixed30Days(): void
    {
        // Servicio creado hace 1 hora (3600s) con 30 minutos (1800s) de caída => 50% real
        $metrics = buildAvailabilityMetrics(
            downtimeSeconds: 1800,
            periodSeconds: 3600,
            periodStart: '2026-11-19 20:00:00',
            periodEnd: '2026-11-19 21:00:00'
        );

        self::assertSame(50.0, $metrics['uptime']);
        self::assertSame('Crítico', $metrics['availability_level']);
        self::assertSame(1800, $metrics['downtime_seconds']);
        self::assertSame(3600, $metrics['evaluated_period']['duration_seconds']);
    }

    public function testBuildAvailabilityMetricsClampsOverflowAndNegativeInputs(): void
    {
        // Downtime mayor al período evaluado (por solapamientos) nunca debe dar uptime negativo
        $overflow = buildAvailabilityMetrics(
            downtimeSeconds: 99999,
            periodSeconds: 3600,
            periodStart: '2026-11-19 20:00:00',
            periodEnd: '2026-11-19 21:00:00'
        );
        self::assertSame(0.0, $overflow['uptime']);
        self::assertSame(3600, $overflow['downtime_seconds']);
        self::assertSame('Crítico', $overflow['availability_level']);

        // Período 0 o downtime negativo no deben provocar división por cero ni uptime > 100%
        $edge = buildAvailabilityMetrics(
            downtimeSeconds: -50,
            periodSeconds: 0,
            periodStart: '2026-11-19 21:00:00',
            periodEnd: '2026-11-19 21:00:00'
        );
        self::assertSame(100.0, $edge['uptime']);
        self::assertSame(0, $edge['downtime_seconds']);
        self::assertSame(1, $edge['evaluated_period']['duration_seconds']);
    }
}
