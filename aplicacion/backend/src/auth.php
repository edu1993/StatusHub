<?php
declare(strict_types=1);

function registerClient(PDO $db): never
{
    $data = requestData();
    $email = filter_var(trim((string) ($data['email'] ?? '')), FILTER_VALIDATE_EMAIL);
    $password = (string) ($data['password'] ?? '');
    if ($email === false) {
        sendJson(['error' => 'Ingresa un correo electrónico válido.'], 400);
    }
    if (strlen($password) < 8 || !preg_match('/[A-Z]/', $password) || !preg_match('/[a-z]/', $password) || !preg_match('/[0-9]/', $password)) {
        sendJson(['error' => 'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.'], 400);
    }
    if (($data['terms_accepted'] ?? false) !== true) {
        sendJson(['error' => 'Debes aceptar los términos y condiciones para registrarte.'], 400);
    }

    $slug = bin2hex(random_bytes(8));
    try {
        $statement = $db->prepare(
            'INSERT INTO clients (email, password_hash, public_slug, terms_accepted_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
        );
        $statement->execute([$email, password_hash($password, PASSWORD_DEFAULT), $slug]);
    } catch (PDOException $error) {
        if ($error->getCode() === '23000') {
            sendJson(['error' => 'El correo ya está registrado.'], 409);
        }

        throw $error;
    }

    sendJson(authResponse((int) $db->lastInsertId(), $email, $slug), 201);
}

function loginClient(PDO $db): never
{
    $data = requestData();
    $email = filter_var(trim((string) ($data['email'] ?? '')), FILTER_VALIDATE_EMAIL);
    $password = (string) ($data['password'] ?? '');
    if ($email === false || $password === '') {
        sendJson(['error' => 'Correo o contraseña inválidos.'], 400);
    }

    $statement = $db->prepare('SELECT id, email, password_hash, public_slug FROM clients WHERE email = ?');
    $statement->execute([$email]);
    $client = $statement->fetch();
    if (!$client || !password_verify($password, $client['password_hash'])) {
        sendJson(['error' => 'Credenciales inválidas.'], 401);
    }

    sendJson(authResponse((int) $client['id'], $client['email'], $client['public_slug']));
}

function requestPasswordReset(PDO $db): never
{
    $data = requestData();
    $email = filter_var(trim((string) ($data['email'] ?? '')), FILTER_VALIDATE_EMAIL);
    if ($email === false) {
        sendJson(['error' => 'Ingresa un correo electrónico válido.'], 400);
    }

    $emailHash = hash_hmac('sha256', strtolower($email), appConfig()['jwt_secret']);
    $ipHash = hash_hmac('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? ''), appConfig()['jwt_secret']);
    $db->exec('DELETE FROM password_reset_requests WHERE created_at < NOW() - INTERVAL 1 DAY');
    $db->exec('DELETE FROM password_resets WHERE expires_at < NOW() - INTERVAL 1 DAY OR used_at < NOW() - INTERVAL 1 DAY');
    $rateLimit = $db->prepare("
        SELECT
            SUM(email_hash = ? AND created_at >= NOW() - INTERVAL 15 MINUTE) AS email_attempts,
            SUM(ip_hash = ? AND created_at >= NOW() - INTERVAL 15 MINUTE) AS ip_attempts
        FROM password_reset_requests
        WHERE (email_hash = ? OR ip_hash = ?)
    ");
    $rateLimit->execute([$emailHash, $ipHash, $emailHash, $ipHash]);
    $attempts = $rateLimit->fetch();
    $limited = (int) ($attempts['email_attempts'] ?? 0) >= 3 || (int) ($attempts['ip_attempts'] ?? 0) >= 10;

    if (!$limited) {
        $recordRequest = $db->prepare('INSERT INTO password_reset_requests (email_hash, ip_hash) VALUES (?, ?)');
        $recordRequest->execute([$emailHash, $ipHash]);

        $findClient = $db->prepare('SELECT id FROM clients WHERE email = ?');
        $findClient->execute([$email]);
        $clientId = $findClient->fetchColumn();
        $tokenHash = null;
        $text = "Recibimos una solicitud para recuperar una contraseña de StatusHub. "
            . "Si existe una cuenta con este correo, recibirás un mensaje con el enlace de recuperación.";
        $html = '<p>Recibimos una solicitud para recuperar una contraseña de StatusHub.</p>'
            . '<p>Si existe una cuenta con este correo, recibirás un mensaje con el enlace de recuperación.</p>';
        if ($clientId !== false) {
            $token = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $token);
            $db->beginTransaction();
            try {
                $invalidate = $db->prepare('UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE client_id = ? AND used_at IS NULL');
                $invalidate->execute([(int) $clientId]);
                $createReset = $db->prepare("
                    INSERT INTO password_resets (client_id, token_hash, expires_at)
                    VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))
                ");
                $createReset->execute([(int) $clientId, $tokenHash]);
                $db->commit();
            } catch (Throwable $error) {
                $db->rollBack();
                throw $error;
            }

            $config = appConfig();
            $resetUrl = $config['frontend_origin'] . '/reset-password?token=' . rawurlencode($token);
            $text = "Recibimos una solicitud para cambiar la contraseña de tu cuenta de StatusHub.\n\n"
                . "Usa este enlace dentro de una hora: {$resetUrl}\n\n"
                . "Si no solicitaste el cambio, puedes ignorar este mensaje.";
            $safeUrl = htmlspecialchars($resetUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $html = '<p>Recibimos una solicitud para cambiar la contraseña de tu cuenta de StatusHub.</p>'
                . '<p><a href="' . $safeUrl . '">Cambiar contraseña</a>. Este enlace vence en una hora.</p>'
                . '<p>Si no solicitaste el cambio, puedes ignorar este mensaje.</p>';
        }

        try {
            sendPasswordResetEmail($email, $text, $html);
        } catch (Throwable $error) {
            if ($tokenHash !== null) {
                $invalidateToken = $db->prepare('UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND used_at IS NULL');
                $invalidateToken->execute([$tokenHash]);
            }
            error_log('No fue posible enviar un correo de recuperación: ' . $error->getMessage());
            sendJson(['error' => 'No fue posible enviar el correo de recuperación. Intenta nuevamente más tarde.'], 503);
        }
    }

    sendJson([
        'message' => 'Si el correo está registrado, recibirás instrucciones para recuperar tu contraseña.',
        'simulated' => appConfig()['mailer_mode'] === 'local',
    ], 202);
}

function resetClientPassword(PDO $db): never
{
    $data = requestData();
    $token = (string) ($data['token'] ?? '');
    $password = (string) ($data['password'] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        sendJson(['error' => 'El enlace de recuperación no es válido o ya venció.'], 400);
    }
    if (strlen($password) < 8 || !preg_match('/[A-Z]/', $password) || !preg_match('/[a-z]/', $password) || !preg_match('/[0-9]/', $password)) {
        sendJson(['error' => 'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.'], 400);
    }

    $db->beginTransaction();
    try {
        $findReset = $db->prepare("
            SELECT id, client_id FROM password_resets
            WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
            FOR UPDATE
        ");
        $findReset->execute([hash('sha256', $token)]);
        $reset = $findReset->fetch();
        if (!$reset) {
            $db->rollBack();
            sendJson(['error' => 'El enlace de recuperación no es válido o ya venció.'], 400);
        }

        $updatePassword = $db->prepare('UPDATE clients SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ?');
        $updatePassword->execute([password_hash($password, PASSWORD_DEFAULT), (int) $reset['client_id']]);
        $invalidateResets = $db->prepare('UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE client_id = ? AND used_at IS NULL');
        $invalidateResets->execute([(int) $reset['client_id']]);
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $error;
    }

    sendJson(['message' => 'La contraseña se actualizó correctamente.']);
}

function sendPasswordResetEmail(string $email, string $text, string $html): void
{
    $config = appConfig();
    $handle = curl_init($config['mail_adapter_url'] . '/api/send');
    if ($handle === false) {
        throw new RuntimeException('No fue posible inicializar el cliente de correo.');
    }
    $payload = json_encode([
        'to' => $email,
        'subject' => 'Recuperar contraseña de StatusHub',
        'text' => $text,
        'html' => $html,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($payload === false) {
        curl_close($handle);
        throw new RuntimeException('No fue posible preparar el correo de recuperación.');
    }

    curl_setopt_array($handle, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $config['mail_adapter_token'],
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 8,
    ]);
    $response = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    $curlError = curl_error($handle);
    curl_close($handle);
    if ($response === false || $status !== 202) {
        throw new RuntimeException($response === false ? $curlError : "El adaptador de correo respondió con HTTP {$status}.");
    }
}

function authResponse(int $clientId, string $email, string $slug): array
{
    $statement = database()->prepare('SELECT auth_version FROM clients WHERE id = ?');
    $statement->execute([$clientId]);
    $authVersion = $statement->fetchColumn();
    if ($authVersion === false) {
        throw new RuntimeException('No se pudo cargar la versión de autenticación de la cuenta.');
    }

    return [
        'token' => jwtEncode([
            'client_id' => $clientId,
            'ver' => (int) $authVersion,
            'iat' => time(),
            'exp' => time() + 86400,
        ]),
        'email' => $email,
        'public_slug' => $slug,
    ];
}
