const db = require('../config/database');
const Docker = require('dockerode');
const fs = require('fs').promises;
const path = require('path');
const simpleGit = require('simple-git');
const yaml = require('yaml');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const nginxService = require('./nginx.service');
const sslService = require('./ssl.service');
const jenkinsService = require('./jenkins.service');

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

const docker = new Docker();
const PROJECTS_DIR = path.join(process.cwd(), 'data', 'projects');
const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');

class ProjectService {
    constructor() {
        this.ensureDirectories();
    }

    async ensureDirectories() {
        await fs.mkdir(PROJECTS_DIR, { recursive: true });
        await fs.mkdir(BACKUP_DIR, { recursive: true });
    }

    async createProject(projectData) {
        try {
            const projectId = uuidv4();
            const projectPath = path.join(PROJECTS_DIR, projectId);

            // Clone repository
            await simpleGit().clone(projectData.repoUrl, projectPath);
            
            // Generate random port between 3000-9000
            const port = Math.floor(Math.random() * (9000 - 3000 + 1)) + 3000;

            const project = {
                id: projectId,
                name: projectData.name,
                repoUrl: projectData.repoUrl,
                branch: projectData.branch || 'main',
                domain: projectData.domain,
                port,
                env: projectData.env || {},
                createdAt: new Date().toISOString(),
                status: 'created'
            };

            // Save to database
            db.get('projects')
                .push(project)
                .write();

            // Setup Nginx if domain is provided
            if (project.domain) {
                await nginxService.setupDomain(project.domain, port);
                if (projectData.ssl) {
                    await sslService.setupSSL(project.domain);
                }
            }

            // Jenkins job oluştur
            await jenkinsService.createJob(project);

            logger.info('Project created:', { projectId });
            return project;
        } catch (error) {
            logger.error('Project creation error:', error);
            throw error;
        }
    }

    async updateProject(projectId, updateData) {
        try {
            const project = db.get('projects')
                .find({ id: projectId })
                .value();

            if (!project) {
                throw new Error('Project not found');
            }

            // Update project data
            const updatedProject = {
                ...project,
                ...updateData,
                updatedAt: new Date().toISOString()
            };

            // Save to database
            db.get('projects')
                .find({ id: projectId })
                .assign(updatedProject)
                .write();

            // Update domain configuration if domain changed
            if (updateData.domain && updateData.domain !== project.domain) {
                await nginxService.updateDomain(project.domain, updateData.domain, project.port);
                if (updateData.ssl) {
                    await sslService.setupSSL(updateData.domain);
                }
            }

            // Jenkins job'unu güncelle
            await jenkinsService.updateJob(updatedProject);

            logger.info('Project updated:', { projectId });
            return updatedProject;
        } catch (error) {
            logger.error('Project update error:', error);
            throw error;
        }
    }

    async deleteProject(projectId) {
        try {
            const project = db.get('projects')
                .find({ id: projectId })
                .value();

            if (!project) {
                throw new Error('Project not found');
            }

            // Stop and remove containers
            await this.stopProject(projectId);

            // Remove project files
            const projectPath = path.join(PROJECTS_DIR, projectId);
            await fs.rm(projectPath, { recursive: true, force: true });

            // Remove Nginx configuration
            if (project.domain) {
                await nginxService.removeDomain(project.domain);
            }

            // Jenkins job'unu sil
            await jenkinsService.deleteJob(projectId);

            // Remove from database
            db.get('projects')
                .remove({ id: projectId })
                .write();

            logger.info('Project deleted:', { projectId });
        } catch (error) {
            logger.error('Project deletion error:', error);
            throw error;
        }
    }

    async deployProject(projectId) {
        try {
            const project = db.get('projects')
                .find({ id: projectId })
                .value();

            if (!project) {
                throw new Error('Project not found');
            }

            // Jenkins build'ini başlat
            const buildResult = await jenkinsService.buildJob(projectId);

            // Update project status
            db.get('projects')
                .find({ id: projectId })
                .assign({ 
                    status: buildResult.result === 'SUCCESS' ? 'deployed' : 'failed',
                    lastDeployedAt: new Date().toISOString()
                })
                .write();

            logger.info('Project deployed:', { projectId });
            return { success: buildResult.result === 'SUCCESS' };
        } catch (error) {
            logger.error('Deployment error:', error);
            throw error;
        }
    }

    async rollbackDeployment(projectId, version) {
        try {
            const project = db.get('projects')
                .find({ id: projectId })
                .value();

            if (!project) {
                throw new Error('Project not found');
            }

            const backupPath = path.join(BACKUP_DIR, `${projectId}-${version}.tar.gz`);
            const projectPath = path.join(PROJECTS_DIR, projectId);

            // Extract backup
            await this.runCommand('', `tar -xzf ${backupPath} -C ${projectPath}`);

            // Redeploy
            await this.deployProject(projectId);

            logger.info('Deployment rollback:', { projectId, version });
            return { success: true };
        } catch (error) {
            logger.error('Rollback error:', error);
            throw error;
        }
    }

    async createBackup(projectId) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(BACKUP_DIR, `${projectId}-${timestamp}.tar.gz`);
            const projectPath = path.join(PROJECTS_DIR, projectId);

            await this.runCommand('', `tar -czf ${backupFile} -C ${projectPath} .`);

            // Keep only last 5 backups
            const backups = await fs.readdir(BACKUP_DIR);
            const projectBackups = backups.filter(file => file.startsWith(projectId));
            if (projectBackups.length > 5) {
                const oldBackups = projectBackups
                    .sort()
                    .slice(0, projectBackups.length - 5);
                
                for (const backup of oldBackups) {
                    await fs.unlink(path.join(BACKUP_DIR, backup));
                }
            }

            logger.info('Backup created:', { projectId, timestamp });
            return { timestamp };
        } catch (error) {
            logger.error('Backup error:', error);
            throw error;
        }
    }

    async stopProject(projectId) {
        try {
            const containers = await docker.listContainers();
            const projectContainers = containers.filter(container => 
                container.Names.some(name => name.includes(projectId))
            );

            for (const container of projectContainers) {
                const containerInstance = docker.getContainer(container.Id);
                await containerInstance.stop();
                await containerInstance.remove();
            }

            logger.info('Project stopped:', { projectId });
        } catch (error) {
            logger.error('Stop project error:', error);
            throw error;
        }
    }

    async getDeploymentHistory(projectId) {
        try {
            const backups = await fs.readdir(BACKUP_DIR);
            const projectBackups = backups
                .filter(file => file.startsWith(projectId))
                .map(file => {
                    const timestamp = file.replace(`${projectId}-`, '').replace('.tar.gz', '');
                    return {
                        version: timestamp,
                        timestamp: new Date(timestamp.replace(/-/g, ':')).toISOString()
                    };
                })
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            return projectBackups;
        } catch (error) {
            logger.error('Get deployment history error:', error);
            throw error;
        }
    }

    async getProjectStatus(projectId) {
        try {
            const containers = await docker.listContainers();
            const projectContainers = containers.filter(container => 
                container.Names.some(name => name.includes(projectId))
            );

            const status = {
                running: projectContainers.length > 0,
                containers: projectContainers.map(container => ({
                    id: container.Id,
                    name: container.Names[0],
                    status: container.State,
                    ports: container.Ports
                }))
            };

            return status;
        } catch (error) {
            logger.error('Get status error:', error);
            throw error;
        }
    }

    async getProjectMetrics(projectId) {
        try {
            const containers = await docker.listContainers();
            const projectContainers = containers.filter(container => 
                container.Names.some(name => name.includes(projectId))
            );

            const metrics = [];
            for (const container of projectContainers) {
                const containerInstance = docker.getContainer(container.Id);
                const stats = await containerInstance.stats({ stream: false });
                metrics.push({
                    containerId: container.Id,
                    name: container.Names[0],
                    cpu: stats.cpu_stats,
                    memory: stats.memory_stats,
                    network: stats.networks
                });
            }

            return metrics;
        } catch (error) {
            logger.error('Get metrics error:', error);
            throw error;
        }
    }

    async streamLogs(projectId) {
        try {
            const containers = await docker.listContainers();
            const projectContainer = containers.find(container => 
                container.Names.some(name => name.includes(projectId))
            );

            if (!projectContainer) {
                throw new Error('No running containers found for project');
            }

            const container = docker.getContainer(projectContainer.Id);
            const logs = await container.logs({
                follow: true,
                stdout: true,
                stderr: true,
                timestamps: true
            });

            return logs;
        } catch (error) {
            logger.error('Stream logs error:', error);
            throw error;
        }
    }

    async getProjectLogs(projectId) {
        try {
            const containers = await docker.listContainers();
            const projectContainer = containers.find(container => 
                container.Names.some(name => name.includes(projectId))
            );

            if (!projectContainer) {
                return [];
            }

            const container = docker.getContainer(projectContainer.Id);
            const logs = await container.logs({
                stdout: true,
                stderr: true,
                timestamps: true,
                tail: 100
            });

            return logs.toString().split('\n');
        } catch (error) {
            logger.error('Get logs error:', error);
            throw error;
        }
    }

    async runCommand(cwd, command) {
        return new Promise((resolve, reject) => {
            const { exec } = require('child_process');
            exec(command, { cwd }, (error, stdout, stderr) => {
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

module.exports = new ProjectService(); 