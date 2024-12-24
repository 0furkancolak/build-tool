const db = require('../config/database');
const projectService = require('../services/projectService');
const fs = require('fs').promises;
const path = require('path');
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

class ProjectController {
    // Dashboard views
    async showDashboard(req, res) {
        try {
            const projects = db.get('projects').value();
            res.render('dashboard', { 
                user: req.session.user,
                projects,
                activeTab: 'dashboard'
            });
        } catch (error) {
            logger.error('Dashboard error:', error);
            res.render('dashboard', { error: error.message });
        }
    }

    showNewProjectForm(req, res) {
        res.render('projects/new', {
            user: req.session.user,
            activeTab: 'new'
        });
    }

    async showProjectDetails(req, res) {
        try {
            const project = db.get('projects')
                .find({ id: req.params.id })
                .value();

            if (!project) {
                throw new Error('Project not found');
            }

            const deployments = await projectService.getDeploymentHistory(req.params.id);
            const metrics = await projectService.getProjectMetrics(req.params.id);

            res.render('projects/details', {
                user: req.session.user,
                project,
                deployments,
                metrics,
                activeTab: 'details'
            });
        } catch (error) {
            logger.error('Project details error:', error);
            res.redirect('/dashboard');
        }
    }

    async showProjectSettings(req, res) {
        try {
            const project = db.get('projects')
                .find({ id: req.params.id })
                .value();

            if (!project) {
                throw new Error('Project not found');
            }

            res.render('projects/settings', {
                user: req.session.user,
                project,
                activeTab: 'settings'
            });
        } catch (error) {
            logger.error('Project settings error:', error);
            res.redirect('/dashboard');
        }
    }

    async showProjectLogs(req, res) {
        try {
            const project = db.get('projects')
                .find({ id: req.params.id })
                .value();

            if (!project) {
                throw new Error('Project not found');
            }

            const logs = await projectService.getProjectLogs(req.params.id);

            res.render('projects/logs', {
                user: req.session.user,
                project,
                logs,
                activeTab: 'logs'
            });
        } catch (error) {
            logger.error('Project logs error:', error);
            res.redirect('/dashboard');
        }
    }

    // Project management
    async createProject(req, res) {
        try {
            const project = await projectService.createProject(req.body);
            logger.info('Project created:', { projectId: project.id });
            res.json({ success: true, project });
        } catch (error) {
            logger.error('Project creation error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async updateProject(req, res) {
        try {
            const project = await projectService.updateProject(req.params.id, req.body);
            logger.info('Project updated:', { projectId: project.id });
            res.json({ success: true, project });
        } catch (error) {
            logger.error('Project update error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async deleteProject(req, res) {
        try {
            await projectService.deleteProject(req.params.id);
            logger.info('Project deleted:', { projectId: req.params.id });
            res.json({ success: true });
        } catch (error) {
            logger.error('Project deletion error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // Deployment management
    async deployProject(req, res) {
        try {
            const result = await projectService.deployProject(req.params.id);
            logger.info('Project deployed:', { projectId: req.params.id });
            res.json({ success: true, result });
        } catch (error) {
            logger.error('Deployment error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async rollbackDeployment(req, res) {
        try {
            const result = await projectService.rollbackDeployment(req.params.id, req.body.version);
            logger.info('Deployment rollback:', { projectId: req.params.id, version: req.body.version });
            res.json({ success: true, result });
        } catch (error) {
            logger.error('Rollback error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getDeploymentHistory(req, res) {
        try {
            const history = await projectService.getDeploymentHistory(req.params.id);
            res.json({ success: true, history });
        } catch (error) {
            logger.error('Deployment history error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // Environment variables
    async getProjectEnv(req, res) {
        try {
            const project = db.get('projects')
                .find({ id: req.params.id })
                .value();

            if (!project) {
                throw new Error('Project not found');
            }

            res.json({ success: true, env: project.env || {} });
        } catch (error) {
            logger.error('Get env error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async updateProjectEnv(req, res) {
        try {
            const project = db.get('projects')
                .find({ id: req.params.id })
                .value();

            if (!project) {
                throw new Error('Project not found');
            }

            // Update environment variables
            db.get('projects')
                .find({ id: req.params.id })
                .assign({ env: req.body })
                .write();

            // Redeploy the project with new environment variables
            await projectService.deployProject(req.params.id);
            logger.info('Environment variables updated:', { projectId: req.params.id });

            res.json({ success: true });
        } catch (error) {
            logger.error('Update env error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // File management
    async uploadFile(req, res) {
        try {
            if (!req.file) {
                throw new Error('No file uploaded');
            }

            const project = db.get('projects')
                .find({ id: req.params.id })
                .value();

            if (!project) {
                throw new Error('Project not found');
            }

            const fileInfo = {
                id: require('uuid').v4(),
                name: req.file.originalname,
                path: req.file.path,
                size: req.file.size,
                type: req.file.mimetype,
                uploadedAt: new Date().toISOString()
            };

            // Save file info to project
            project.files = project.files || [];
            project.files.push(fileInfo);
            db.write();

            logger.info('File uploaded:', { projectId: req.params.id, fileId: fileInfo.id });
            res.json({ success: true, file: fileInfo });
        } catch (error) {
            logger.error('File upload error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async listFiles(req, res) {
        try {
            const project = db.get('projects')
                .find({ id: req.params.id })
                .value();

            if (!project) {
                throw new Error('Project not found');
            }

            res.json({ success: true, files: project.files || [] });
        } catch (error) {
            logger.error('List files error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async deleteFile(req, res) {
        try {
            const project = db.get('projects')
                .find({ id: req.params.id })
                .value();

            if (!project) {
                throw new Error('Project not found');
            }

            const file = project.files?.find(f => f.id === req.params.fileId);
            if (!file) {
                throw new Error('File not found');
            }

            // Remove file from filesystem
            await fs.unlink(file.path);

            // Remove file from project
            project.files = project.files.filter(f => f.id !== req.params.fileId);
            db.write();

            logger.info('File deleted:', { projectId: req.params.id, fileId: req.params.fileId });
            res.json({ success: true });
        } catch (error) {
            logger.error('File deletion error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // Domain management
    async addDomain(req, res) {
        try {
            const result = await projectService.addDomain(req.params.id, req.body.domain);
            logger.info('Domain added:', { projectId: req.params.id, domain: req.body.domain });
            res.json({ success: true, result });
        } catch (error) {
            logger.error('Add domain error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async removeDomain(req, res) {
        try {
            await projectService.removeDomain(req.params.id, req.params.domain);
            logger.info('Domain removed:', { projectId: req.params.id, domain: req.params.domain });
            res.json({ success: true });
        } catch (error) {
            logger.error('Remove domain error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async setupSSL(req, res) {
        try {
            const result = await projectService.setupSSL(req.params.id, req.params.domain);
            logger.info('SSL setup:', { projectId: req.params.id, domain: req.params.domain });
            res.json({ success: true, result });
        } catch (error) {
            logger.error('SSL setup error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // Monitoring
    async getProjectStatus(req, res) {
        try {
            const status = await projectService.getProjectStatus(req.params.id);
            res.json({ success: true, status });
        } catch (error) {
            logger.error('Status check error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async getProjectMetrics(req, res) {
        try {
            const metrics = await projectService.getProjectMetrics(req.params.id);
            res.json({ success: true, metrics });
        } catch (error) {
            logger.error('Metrics error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async streamLogs(req, res) {
        try {
            const logStream = await projectService.streamLogs(req.params.id);
            logStream.pipe(res);
        } catch (error) {
            logger.error('Log streaming error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
}

module.exports = new ProjectController(); 