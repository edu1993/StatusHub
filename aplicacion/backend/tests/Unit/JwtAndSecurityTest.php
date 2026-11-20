<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class JwtAndSecurityTest extends TestCase
{
    public function testJwtEncodeAndDecodeRoundTrip(): void
    {
        $payload = [
            'client_id' => 42,
            'ver' => 3,
            'iat' => time(),
            'exp' => time() + 3600,
        ];

        $token = jwtEncode($payload);
        self::assertCount(3, explode('.', $token));

        $decoded = jwtDecode($token);
        self::assertNotNull($decoded);
        self::assertSame(42, $decoded['client_id']);
        self::assertSame(3, $decoded['ver']);
    }

    public function testJwtDecodeRejectsExpiredToken(): void
    {
        $token = jwtEncode([
            'client_id' => 10,
            'ver' => 0,
            'iat' => time() - 7200,
            'exp' => time() - 10,
        ]);

        self::assertNull(jwtDecode($token));
    }

    public function testJwtDecodeRejectsTamperedPayload(): void
    {
        $token = jwtEncode([
            'client_id' => 10,
            'ver' => 0,
            'exp' => time() + 3600,
        ]);

        [$header, , $signature] = explode('.', $token);
        $forgedPayload = base64UrlEncode(json_encode([
            'client_id' => 1,
            'ver' => 0,
            'exp' => time() + 3600,
        ]));

        self::assertNull(jwtDecode("{$header}.{$forgedPayload}.{$signature}"));
    }

    public function testJwtDecodeRejectsAlgNoneDowngradeAttack(): void
    {
        $header = base64UrlEncode(json_encode(['typ' => 'JWT', 'alg' => 'none']));
        $body = base64UrlEncode(json_encode(['client_id' => 1, 'exp' => time() + 3600]));
        $sig = base64UrlEncode(hash_hmac('sha256', "{$header}.{$body}", appConfig()['jwt_secret'], true));

        self::assertNull(jwtDecode("{$header}.{$body}.{$sig}"));
    }

    public function testJwtDecodeRejectsMalformedTokens(): void
    {
        self::assertNull(jwtDecode(''));
        self::assertNull(jwtDecode('solo.dos'));
        self::assertNull(jwtDecode('a.b.c.d'));
        self::assertNull(jwtDecode('$$$.###.***'));
    }

    public function testBase64UrlEncodeProducesUrlSafeStringWithoutPadding(): void
    {
        $raw = "\xff\xfe\xfd\xfc\xfb\xfa\x01\x02";
        $encoded = base64UrlEncode($raw);

        self::assertStringNotContainsString('+', $encoded);
        self::assertStringNotContainsString('/', $encoded);
        self::assertStringNotContainsString('=', $encoded);
        self::assertSame($raw, base64UrlDecode($encoded));
    }

    public function testValidatedServiceInputNormalizesValidPayload(): void
    {
        $result = validatedServiceInput([
            'name' => '  API Pagos  ',
            'url' => '  https://pagos.ejemplo.com/health  ',
            'check_interval' => 60,
            'is_public' => true,
        ]);

        self::assertSame([
            'name' => 'API Pagos',
            'url' => 'https://pagos.ejemplo.com/health',
            'check_interval' => 60,
            'is_public' => 1,
        ], $result);
    }

    public function testValidatedServiceInputAcceptsLegacyIntervalAliasAndBoundaryValues(): void
    {
        $min = validatedServiceInput([
            'name' => 'Min Interval',
            'url' => 'http://localhost:8080/status',
            'interval' => 30,
            'is_public' => false,
        ]);
        self::assertSame(30, $min['check_interval']);
        self::assertSame(0, $min['is_public']);

        $max = validatedServiceInput([
            'name' => 'Max Interval',
            'url' => 'https://example.org',
            'check_interval' => 86400,
        ]);
        self::assertSame(86400, $max['check_interval']);
        self::assertSame(0, $max['is_public']);
    }
}
