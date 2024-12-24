const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const winston = require('winston');

// Logger yapılandırması
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    ]
});

class NginxService {
    constructor() {
        this.configDir = '/etc/nginx';
        this.sitesAvailable = path.join(this.configDir, 'sites-available');
        this.sitesEnabled = path.join(this.configDir, 'sites-enabled');
    }

    async setupDomain(domain, port) {
        try {
            // Generate Nginx configuration
            const config = this.generateConfig(domain, port);
            const configPath = path.join(this.sitesAvailable, domain);

            // Write configuration file
            await fs.writeFile(configPath, config);

            // Create symlink
            const symlinkPath = path.join(this.sitesEnabled, domain);
            await fs.symlink(configPath, symlinkPath).catch(() => {});

            // Test and reload Nginx
            await this.reloadNginx();

            logger.info('Domain setup completed:', { domain, port });
        } catch (error) {
            logger.error('Domain setup error:', error);
            throw error;
        }
    }

    async updateDomain(oldDomain, newDomain, port) {
        try {
            // Remove old configuration
            await this.removeDomain(oldDomain);

            // Setup new domain
            await this.setupDomain(newDomain, port);

            logger.info('Domain updated:', { oldDomain, newDomain, port });
        } catch (error) {
            logger.error('Domain update error:', error);
            throw error;
        }
    }

    async removeDomain(domain) {
        try {
            // Remove configuration files
            const configPath = path.join(this.sitesAvailable, domain);
            const symlinkPath = path.join(this.sitesEnabled, domain);

            await fs.unlink(configPath).catch(() => {});
            await fs.unlink(symlinkPath).catch(() => {});

            // Reload Nginx
            await this.reloadNginx();

            logger.info('Domain removed:', { domain });
        } catch (error) {
            logger.error('Domain removal error:', error);
            throw error;
        }
    }

    generateConfig(domain, port) {
        return `server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Gzip compression
    gzip on;
    gzip_proxied any;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    gzip_vary on;
    gzip_comp_level 6;
    gzip_buffers 16 8k;
    gzip_http_version 1.1;

    # File upload
    client_max_body_size 100M;

    # Error pages
    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }

    # Logs
    access_log /var/log/nginx/${domain}.access.log;
    error_log /var/log/nginx/${domain}.error.log;
}`;
    }

    generateSSLConfig(domain, port, certPath, keyPath) {
        return `server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${domain};

    ssl_certificate ${certPath};
    ssl_certificate_key ${keyPath};
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # Modern configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS (uncomment if you're sure)
    # add_header Strict-Transport-Security "max-age=63072000" always;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Gzip compression
    gzip on;
    gzip_proxied any;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    gzip_vary on;
    gzip_comp_level 6;
    gzip_buffers 16 8k;
    gzip_http_version 1.1;

    # File upload
    client_max_body_size 100M;

    # Error pages
    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }

    # Logs
    access_log /var/log/nginx/${domain}.access.log;
    error_log /var/log/nginx/${domain}.error.log;
}

# HTTP redirect
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};
    return 301 https://$server_name$request_uri;
}`;
    }

    async reloadNginx() {
        return new Promise((resolve, reject) => {
            // First test the configuration
            exec('nginx -t', (error) => {
                if (error) {
                    logger.error('Nginx configuration test failed:', error);
                    reject(error);
                    return;
                }

                // If test passes, reload Nginx
                exec('systemctl reload nginx', (error) => {
                    if (error) {
                        logger.error('Nginx reload failed:', error);
                        reject(error);
                        return;
                    }
                    logger.info('Nginx reloaded successfully');
                    resolve();
                });
            });
        });
    }

    async backupConfig() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDir = path.join(process.cwd(), 'backups', 'nginx');
            await fs.mkdir(backupDir, { recursive: true });

            // Backup sites-available and sites-enabled
            await this.runCommand(`cp -r ${this.sitesAvailable} ${backupDir}/sites-available-${timestamp}`);
            await this.runCommand(`cp -r ${this.sitesEnabled} ${backupDir}/sites-enabled-${timestamp}`);

            logger.info('Nginx configuration backed up:', { timestamp });
            return { timestamp };
        } catch (error) {
            logger.error('Nginx backup error:', error);
            throw error;
        }
    }

    async restoreConfig(timestamp) {
        try {
            const backupDir = path.join(process.cwd(), 'backups', 'nginx');
            
            // Restore sites-available and sites-enabled
            await this.runCommand(`cp -r ${backupDir}/sites-available-${timestamp}/* ${this.sitesAvailable}/`);
            await this.runCommand(`cp -r ${backupDir}/sites-enabled-${timestamp}/* ${this.sitesEnabled}/`);

            // Reload Nginx
            await this.reloadNginx();

            logger.info('Nginx configuration restored:', { timestamp });
        } catch (error) {
            logger.error('Nginx restore error:', error);
            throw error;
        }
    }

    async runCommand(command) {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    logger.error('Command error:', { command, error });
                    reject(error);
                    return;
                }
                resolve(stdout);
            });
        });
    }
}

module.exports = new NginxService(); 