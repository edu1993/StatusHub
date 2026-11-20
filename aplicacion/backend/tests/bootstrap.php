<?php
declare(strict_types=1);

putenv('JWT_SECRET=test-jwt-secret-key-at-least-32-bytes-long');
putenv('MAILER_API_TOKEN=test-mailer-token');
putenv('FRONTEND_ORIGIN=http://localhost:5173');
putenv('MAILER_MODE=local');

$backendRoot = dirname(__DIR__);
require_once $backendRoot . '/src/bootstrap.php';
