const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const execAsync = promisify(exec);
const os = require('os');

const isWindows = os.platform() === 'win32';

async function cleanup() {
    try {
        console.log('Cleaning up development environment...');

        // Stop all running containers
        console.log('Stopping all Docker containers...');
        await execAsync('docker stop $(docker ps -aq)').catch(() => {});
        await execAsync('docker rm $(docker ps -aq)').catch(() => {});

        // Remove all project-related Docker images
        console.log('Removing Docker images...');
        await execAsync('docker image prune -af').catch(() => {});

        // Remove Docker volumes
        console.log('Removing Docker volumes...');
        await execAsync('docker volume prune -f').catch(() => {});

        // Remove project data directory
        console.log('Removing project data...');
        const dataDir = path.join(__dirname, 'data');
        await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});

        // Remove node_modules
        console.log('Removing node_modules...');
        const nodeModulesDir = path.join(__dirname, 'node_modules');
        await fs.rm(nodeModulesDir, { recursive: true, force: true }).catch(() => {});

        // Windows-specific cleanup
        if (isWindows) {
            console.log('Performing Windows-specific cleanup...');
            // Clean Docker Desktop settings if needed
            await execAsync('docker system prune -af').catch(() => {});
        }

        console.log('Cleanup completed successfully!');
        console.log('To completely remove Docker Desktop from Windows:');
        console.log('1. Uninstall Docker Desktop from Windows Settings');
        console.log('2. Delete the following directories if they exist:');
        console.log('   - %PROGRAMDATA%\\Docker');
        console.log('   - %APPDATA%\\Docker');
        console.log('   - %LOCALAPPDATA%\\Docker');
        console.log('3. Remove any Docker Desktop shortcuts');
    } catch (error) {
        console.error('Error during cleanup:', error);
        process.exit(1);
    }
}

// Add cleanup script to package.json scripts
const packageJsonPath = path.join(__dirname, 'package.json');
fs.readFile(packageJsonPath, 'utf8')
    .then(data => {
        const packageJson = JSON.parse(data);
        packageJson.scripts = packageJson.scripts || {};
        packageJson.scripts.cleanup = 'node cleanup.js';
        return fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
    })
    .catch(() => {});

// Run cleanup if script is executed directly
if (require.main === module) {
    cleanup();
} 