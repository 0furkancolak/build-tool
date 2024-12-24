const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../../config/database');
const { authMiddleware, adminMiddleware } = require('../authMiddleware');
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');

// Ensure projects directory exists
const projectsDir = path.join(__dirname, '../../data/projects');
if (!fs.existsSync(projectsDir)) {
    fs.mkdirSync(projectsDir, { recursive: true });
}

// Get all projects
router.get('/', async (req, res) => {
    try {
        const projects = db.get('projects')
            .filter({ userId: req.user.id })
            .value();
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

// Get project by ID
router.get('/:id', async (req, res) => {
    try {
        const project = db.get('projects')
            .find({ id: req.params.id, userId: req.user.id })
            .value();

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        res.json(project);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch project' });
    }
});

// Create new project
router.post('/', async (req, res) => {
    try {
        const { name, description, repositoryUrl, branch } = req.body;

        if (!name || !repositoryUrl) {
            return res.status(400).json({ error: 'Name and repository URL are required' });
        }

        const projectId = uuidv4();
        const projectPath = path.join(projectsDir, projectId);

        // Clone repository
        await simpleGit().clone(repositoryUrl, projectPath, ['--depth', '1']);
        if (branch) {
            await simpleGit(projectPath).checkout(branch);
        }

        const project = {
            id: projectId,
            name,
            description,
            repositoryUrl,
            branch: branch || 'main',
            userId: req.user.id,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        db.get('projects')
            .push(project)
            .write();

        res.status(201).json(project);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create project: ' + error.message });
    }
});

// Update project
router.put('/:id', async (req, res) => {
    try {
        const { name, description, branch } = req.body;
        const project = db.get('projects')
            .find({ id: req.params.id, userId: req.user.id })
            .value();

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const projectPath = path.join(projectsDir, project.id);

        // Update branch if changed
        if (branch && branch !== project.branch) {
            await simpleGit(projectPath).checkout(branch);
        }

        const updatedProject = {
            ...project,
            name: name || project.name,
            description: description || project.description,
            branch: branch || project.branch,
            updatedAt: new Date().toISOString()
        };

        db.get('projects')
            .find({ id: req.params.id })
            .assign(updatedProject)
            .write();

        res.json(updatedProject);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update project' });
    }
});

// Delete project
router.delete('/:id', async (req, res) => {
    try {
        const project = db.get('projects')
            .find({ id: req.params.id, userId: req.user.id })
            .value();

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Remove project directory
        const projectPath = path.join(projectsDir, project.id);
        if (fs.existsSync(projectPath)) {
            fs.rmSync(projectPath, { recursive: true, force: true });
        }

        db.get('projects')
            .remove({ id: req.params.id })
            .write();

        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

// Pull latest changes
router.post('/:id/pull', async (req, res) => {
    try {
        const project = db.get('projects')
            .find({ id: req.params.id, userId: req.user.id })
            .value();

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const projectPath = path.join(projectsDir, project.id);
        await simpleGit(projectPath).pull();

        res.json({ message: 'Project updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to pull latest changes' });
    }
});

// Get project status
router.get('/:id/status', async (req, res) => {
    try {
        const project = db.get('projects')
            .find({ id: req.params.id, userId: req.user.id })
            .value();

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const projectPath = path.join(projectsDir, project.id);
        const git = simpleGit(projectPath);
        
        const status = await git.status();
        const log = await git.log({ maxCount: 10 });

        res.json({
            status,
            recentCommits: log.all,
            currentBranch: project.branch
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get project status' });
    }
});

module.exports = router; 