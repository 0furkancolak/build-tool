const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const winston = require('winston');
const nginxService = require('./nginxService');

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

class SSLService {
    constructor() {
        this.certPath = '/etc/letsencrypt/live';
        this.renewScriptPath = '/etc/cron.daily/cert-renewal';
    }

    async setupSSL(domain) {
        try {
            // Obtain certificate
            await this.obtainCertificate(domain);

            // Update Nginx configuration
            const certPath = path.join(this.certPath, domain, 'fullchain.pem');
            const keyPath = path.join(this.certPath, domain, 'privkey.pem');
            const config = nginxService.generateSSLConfig(domain, port, certPath, keyPath);

            // Write SSL configuration
            await fs.writeFile(
                path.join('/etc/nginx/sites-available', domain),
                config
            );

            // Create symlink if it doesn't exist
            const symlinkPath = path.join('/etc/nginx/sites-enabled', domain);
            await fs.symlink(
                path.join('/etc/nginx/sites-available', domain),
                symlinkPath
            ).catch(() => {});

            // Reload Nginx
            await nginxService.reloadNginx();

            // Setup auto renewal
            await this.setupAutoRenewal();

            logger.info('SSL setup completed:', { domain });
        } catch (error) {
            logger.error('SSL setup error:', error);
            throw error;
        }
    }

    async obtainCertificate(domain) {
        try {
            // Stop Nginx temporarily
            await this.runCommand('systemctl stop nginx');

            // Obtain certificate
            await this.runCommand(
                `certbot certonly --standalone -d ${domain} --non-interactive --agree-tos --email admin@${domain}`
            );

            // Start Nginx again
            await this.runCommand('systemctl start nginx');

            logger.info('Certificate obtained:', { domain });
        } catch (error) {
            // Make sure Nginx is started even if there's an error
            await this.runCommand('systemctl start nginx').catch(() => {});
            logger.error('Certificate obtainment error:', error);
            throw error;
        }
    }

    async renewCertificates() {
        try {
            // Stop Nginx temporarily
            await this.runCommand('systemctl stop nginx');

            // Renew certificates
            await this.runCommand('certbot renew');

            // Start Nginx again
            await this.runCommand('systemctl start nginx');

            // Reload Nginx to apply new certificates
            await nginxService.reloadNginx();

            logger.info('Certificates renewed');
        } catch (error) {
            // Make sure Nginx is started even if there's an error
            await this.runCommand('systemctl start nginx').catch(() => {});
            logger.error('Certificate renewal error:', error);
            throw error;
        }
    }

    async setupAutoRenewal() {
        try {
            // Create renewal script
            const renewalScript = `#!/bin/bash
# Stop Nginx
systemctl stop nginx

# Renew certificates
certbot renew

# Start Nginx
systemctl start nginx

# Reload Nginx configuration
systemctl reload nginx`;

            // Write renewal script
            await fs.writeFile(this.renewScriptPath, renewalScript);
            await fs.chmod(this.renewScriptPath, '755');

            logger.info('Auto renewal setup completed');
        } catch (error) {
            logger.error('Auto renewal setup error:', error);
            throw error;
        }
    }

    async removeCertificate(domain) {
        try {
            // Remove certificate
            await this.runCommand(`certbot delete --cert-name ${domain} --non-interactive`);

            logger.info('Certificate removed:', { domain });
        } catch (error) {
            logger.error('Certificate removal error:', error);
            throw error;
        }
    }

    async getCertificateInfo(domain) {
        try {
            const certPath = path.join(this.certPath, domain);
            const info = await this.runCommand(`certbot certificates -d ${domain}`);
            return this.parseCertificateInfo(info);
        } catch (error) {
            logger.error('Get certificate info error:', error);
            throw error;
        }
    }

    parseCertificateInfo(info) {
        const lines = info.split('\n');
        const certInfo = {};

        for (const line of lines) {
            if (line.includes('Expiry Date:')) {
                certInfo.expiryDate = line.split(':')[1].trim();
            }
            if (line.includes('Certificate Path:')) {
                certInfo.certPath = line.split(':')[1].trim();
            }
            if (line.includes('Private Key Path:')) {
                certInfo.keyPath = line.split(':')[1].trim();
            }
        }

        return certInfo;
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

module.exports = new SSLService(); 