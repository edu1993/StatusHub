<?php
declare(strict_types=1);

function initializeSchema(): void
{
    $statements = [
        "CREATE TABLE IF NOT EXISTS clients (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            auth_version INT NOT NULL DEFAULT 0,
            public_slug VARCHAR(32) NOT NULL UNIQUE,
            terms_accepted_at TIMESTAMP NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS services (
            id INT AUTO_INCREMENT PRIMARY KEY,
            client_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            url VARCHAR(2048) NOT NULL,
            check_interval INT NOT NULL DEFAULT 60,
            is_public BOOLEAN NOT NULL DEFAULT FALSE,
            next_check TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_services_due (next_check),
            INDEX idx_services_client (client_id),
            CONSTRAINT fk_services_client FOREIGN KEY (client_id)
                REFERENCES clients(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS incidents (
            id INT AUTO_INCREMENT PRIMARY KEY,
            service_id INT NOT NULL,
            status ENUM('Abierto', 'Resuelto') NOT NULL DEFAULT 'Abierto',
            http_code INT NULL,
            latency INT NULL,
            description TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            resolved_at TIMESTAMP NULL,
            INDEX idx_incidents_service_status (service_id, status),
            INDEX idx_incidents_created (created_at),
            CONSTRAINT fk_incidents_service FOREIGN KEY (service_id)
                REFERENCES services(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS checks (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            service_id INT NOT NULL,
            status_code INT NULL,
            latency INT NOT NULL,
            error_message VARCHAR(500) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_checks_service_created (service_id, created_at),
            CONSTRAINT fk_checks_service FOREIGN KEY (service_id)
                REFERENCES services(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS password_resets (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            client_id INT NOT NULL,
            token_hash CHAR(64) NOT NULL UNIQUE,
            expires_at TIMESTAMP NOT NULL,
            used_at TIMESTAMP NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_password_resets_client (client_id, used_at, expires_at),
            CONSTRAINT fk_password_resets_client FOREIGN KEY (client_id)
                REFERENCES clients(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS password_reset_requests (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            email_hash CHAR(64) NOT NULL,
            ip_hash CHAR(64) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_reset_requests_email_created (email_hash, created_at),
            INDEX idx_reset_requests_ip_created (ip_hash, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    ];
    $db = database();
    foreach ($statements as $statement) {
        $db->exec($statement);
    }

    $termsColumn = $db->query("SHOW COLUMNS FROM clients LIKE 'terms_accepted_at'")->fetch();
    if (!$termsColumn) {
        $db->exec('ALTER TABLE clients ADD COLUMN terms_accepted_at TIMESTAMP NULL AFTER public_slug');
    }

    $authVersionColumn = $db->query("SHOW COLUMNS FROM clients LIKE 'auth_version'")->fetch();
    if (!$authVersionColumn) {
        $db->exec('ALTER TABLE clients ADD COLUMN auth_version INT NOT NULL DEFAULT 0 AFTER password_hash');
    }

    $urlColumn = $db->query("SHOW COLUMNS FROM services LIKE 'url'")->fetch();
    if ($urlColumn && strtolower($urlColumn['Type']) !== 'varchar(2048)') {
        $db->exec('ALTER TABLE services MODIFY COLUMN url VARCHAR(2048) NOT NULL');
    }

    $column = $db->query("SHOW COLUMNS FROM checks LIKE 'error_message'")->fetch();
    if (!$column) {
        $db->exec('ALTER TABLE checks ADD COLUMN error_message VARCHAR(500) NULL AFTER latency');
    }
}
