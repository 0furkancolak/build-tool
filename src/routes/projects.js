const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const projectController = require('../controllers/projectController');
const { requireAuth } = require('../middleware/auth');

// Multer yapılandırması
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../../data/uploads'))
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Dashboard routes
router.get('/dashboard', requireAuth, projectController.showDashboard);
router.get('/projects/new', requireAuth, projectController.showNewProjectForm);
router.get('/projects/:id', requireAuth, projectController.showProjectDetails);
router.get('/projects/:id/settings', requireAuth, projectController.showProjectSettings);
router.get('/projects/:id/logs', requireAuth, projectController.showProjectLogs);

// Project management routes
router.post('/api/projects', requireAuth, projectController.createProject);
router.put('/api/projects/:id', requireAuth, projectController.updateProject);
router.delete('/api/projects/:id', requireAuth, projectController.deleteProject);

// Deployment routes
router.post('/api/projects/:id/deploy', requireAuth, projectController.deployProject);
router.post('/api/projects/:id/rollback', requireAuth, projectController.rollbackDeployment);
router.get('/api/projects/:id/deployments', requireAuth, projectController.getDeploymentHistory);

// Environment variables
router.get('/api/projects/:id/env', requireAuth, projectController.getProjectEnv);
router.post('/api/projects/:id/env', requireAuth, projectController.updateProjectEnv);

// File upload routes
router.post('/api/projects/:id/upload', requireAuth, upload.single('file'), projectController.uploadFile);
router.get('/api/projects/:id/files', requireAuth, projectController.listFiles);
router.delete('/api/projects/:id/files/:fileId', requireAuth, projectController.deleteFile);

// Domain management
router.post('/api/projects/:id/domains', requireAuth, projectController.addDomain);
router.delete('/api/projects/:id/domains/:domain', requireAuth, projectController.removeDomain);
router.post('/api/projects/:id/domains/:domain/ssl', requireAuth, projectController.setupSSL);

// Monitoring routes
router.get('/api/projects/:id/status', requireAuth, projectController.getProjectStatus);
router.get('/api/projects/:id/metrics', requireAuth, projectController.getProjectMetrics);
router.get('/api/projects/:id/logs/stream', requireAuth, projectController.streamLogs);

module.exports = router; 