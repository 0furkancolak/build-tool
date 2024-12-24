const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(process.cwd(), 'data', 'uploads'));
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Dashboard routes
router.get('/dashboard', authMiddleware, projectController.showDashboard);
router.get('/projects/new', authMiddleware, projectController.showNewProjectForm);
router.get('/projects/:id', authMiddleware, projectController.showProjectDetails);
router.get('/projects/:id/settings', authMiddleware, projectController.showProjectSettings);
router.get('/projects/:id/logs', authMiddleware, projectController.showProjectLogs);

// Project management API routes
router.post('/api/projects', authMiddleware, projectController.createProject);
router.put('/api/projects/:id', authMiddleware, projectController.updateProject);
router.delete('/api/projects/:id', authMiddleware, projectController.deleteProject);

// Deployment routes
router.post('/api/projects/:id/deploy', authMiddleware, projectController.deployProject);
router.post('/api/projects/:id/rollback', authMiddleware, projectController.rollbackDeployment);
router.get('/api/projects/:id/deployments', authMiddleware, projectController.getDeploymentHistory);

// Environment variables routes
router.get('/api/projects/:id/env', authMiddleware, projectController.getProjectEnv);
router.put('/api/projects/:id/env', authMiddleware, projectController.updateProjectEnv);

// File management routes
router.post('/api/projects/:id/files', authMiddleware, upload.single('file'), projectController.uploadFile);
router.get('/api/projects/:id/files', authMiddleware, projectController.listFiles);
router.delete('/api/projects/:id/files/:fileId', authMiddleware, projectController.deleteFile);

// Domain management routes
router.post('/api/projects/:id/domains', authMiddleware, projectController.addDomain);
router.delete('/api/projects/:id/domains/:domain', authMiddleware, projectController.removeDomain);
router.post('/api/projects/:id/domains/:domain/ssl', authMiddleware, projectController.setupSSL);

// Monitoring routes
router.get('/api/projects/:id/status', authMiddleware, projectController.getProjectStatus);
router.get('/api/projects/:id/metrics', authMiddleware, projectController.getProjectMetrics);
router.get('/api/projects/:id/logs/stream', authMiddleware, projectController.streamLogs);

module.exports = router; 