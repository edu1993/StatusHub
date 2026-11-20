<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class AccountAndPublicSettingsTest extends TestCase
{
    private string $srcDir;
    private string $publicDir;

    protected function setUp(): void
    {
        $this->srcDir = dirname(__DIR__, 2) . '/src';
        $this->publicDir = dirname(__DIR__, 2) . '/public';
    }

    public function testAccountAndPublicSettingsRoutesExistInIndex(): void
    {
        $index = file_get_contents($this->publicDir . '/index.php');
        self::assertIsString($index);

        self::assertStringContainsString("'/api/account/password'", $index);
        self::assertStringContainsString("changeClientPassword(\$db, \$clientId)", $index);
        self::assertStringContainsString("'/api/account'", $index);
        self::assertStringContainsString("deleteClientAccount(\$db, \$clientId)", $index);
        self::assertStringContainsString("'/api/public-status/settings'", $index);
    }

    public function testAuthRequiresOrganizationNameWhenEnablingPublicPage(): void
    {
        $auth = file_get_contents($this->srcDir . '/auth.php');
        self::assertIsString($auth);

        self::assertStringContainsString('ensurePublicPageNameColumn($db)', $auth);
        self::assertStringContainsString('if ($nextEnabled && $nextName === \'\')', $auth);
        self::assertStringContainsString('El nombre de la organización es obligatorio para activar la página pública.', $auth);
        self::assertStringContainsString('strlen($name) > 120', $auth);
    }

    public function testChangePasswordInvalidatesPreviousSessionsAndDeleteAccountChecksPassword(): void
    {
        $auth = file_get_contents($this->srcDir . '/auth.php');
        self::assertIsString($auth);

        self::assertStringContainsString('function changeClientPassword(', $auth);
        self::assertStringContainsString('auth_version = auth_version + 1', $auth);
        self::assertStringContainsString('function deleteClientAccount(', $auth);
        self::assertStringContainsString('DELETE FROM clients WHERE id = ?', $auth);
    }

    public function testSchemaDefinesPublicPageNameAndTimezoneIsConfigured(): void
    {
        $schema = file_get_contents($this->srcDir . '/schema.php');
        $bootstrap = file_get_contents($this->srcDir . '/bootstrap.php');
        $database = file_get_contents($this->srcDir . '/database.php');

        self::assertIsString($schema);
        self::assertIsString($bootstrap);
        self::assertIsString($database);

        self::assertStringContainsString('public_page_name VARCHAR(120) NULL DEFAULT NULL', $schema);
        self::assertStringContainsString('America/Argentina/Buenos_Aires', $bootstrap);
        self::assertStringContainsString('SET time_zone =', $database);
    }
}
