const projectService = require('../services/project.service');
const jenkinsService = require('../services/jenkins.service');
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

class WebhookController {
    async handleGithubWebhook(req, res) {
        try {
            const event = req.headers['x-github-event'];
            const signature = req.headers['x-hub-signature-256'];
            const projectId = req.params.projectId;

            // Webhook imzasını doğrula
            if (!this.verifyGithubSignature(signature, req.body)) {
                logger.warn('Invalid GitHub webhook signature');
                return res.status(401).json({ error: 'Invalid signature' });
            }

            // Sadece push event'lerini işle
            if (event !== 'push') {
                return res.json({ message: 'Event ignored' });
            }

            // Branch kontrolü
            const branch = req.body.ref.replace('refs/heads/', '');
            const project = await projectService.getProject(projectId);

            if (!project) {
                return res.status(404).json({ error: 'Project not found' });
            }

            if (branch !== project.branch) {
                return res.json({ message: 'Branch ignored' });
            }

            // Jenkins build'ini başlat
            await jenkinsService.buildJob(projectId);

            logger.info('GitHub webhook processed:', { 
                projectId, 
                event, 
                branch 
            });

            res.json({ success: true });
        } catch (error) {
            logger.error('GitHub webhook error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async handleJenkinsWebhook(req, res) {
        try {
            const projectId = req.params.projectId;
            const build = req.body;

            // Build durumunu kontrol et
            if (build.status === 'FAILURE') {
                // Son başarılı build'e geri dön
                const lastSuccessfulBuild = await jenkinsService.getLastSuccessfulBuild(projectId);
                if (lastSuccessfulBuild) {
                    await jenkinsService.rollbackToBuild(projectId, lastSuccessfulBuild.number);
                }
            }

            // Proje durumunu güncelle
            await projectService.updateProjectStatus(projectId, {
                status: build.status === 'SUCCESS' ? 'deployed' : 'failed',
                lastDeployedAt: new Date().toISOString()
            });

            logger.info('Jenkins webhook processed:', { 
                projectId, 
                buildNumber: build.number,
                status: build.status 
            });

            res.json({ success: true });
        } catch (error) {
            logger.error('Jenkins webhook error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    verifyGithubSignature(signature, payload) {
        const crypto = require('crypto');
        const secret = process.env.GITHUB_WEBHOOK_SECRET;
        
        if (!secret || !signature) {
            return false;
        }

        const hmac = crypto.createHmac('sha256', secret);
        const digest = 'sha256=' + hmac.update(JSON.stringify(payload)).digest('hex');
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
    }
}

module.exports = new WebhookController(); 