# DevOps Deployment Tool

A Vercel-like deployment tool for managing multiple projects with Docker, Jenkins, and Nginx integration.

## Features

- Web-based interface for managing deployments
- Docker container management
- Automatic Nginx configuration
- Environment variable management
- Multiple project support
- GitHub integration
- Automatic deployment on push

## Prerequisites

- Ubuntu/Debian-based Linux system
- Root access
- Git installed

## Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd devops-tool
```

2. Run the installation script:
```bash
sudo chmod +x install.sh
sudo ./install.sh
```

3. Initialize the application:
```bash
npm run setup
```

## Default Credentials

- Username: `admin`
- Password: `admin`

**Important**: Change these credentials after first login!

## Usage

1. Access the web interface at `http://your-server-ip`

2. Create a new project:
   - Enter project name
   - Provide GitHub repository URL
   - Set domain (optional)
   - Configure environment variables

3. Deploy your project:
   - Click "Deploy" to manually deploy
   - Automatic deployment on GitHub push (requires Jenkins configuration)

4. Manage your project:
   - View deployment status
   - Update environment variables
   - Configure domains
   - Delete projects

## Directory Structure

```
/opt/devops-tool/
├── src/
│   ├── app.js
│   ├── config/
│   ├── services/
│   └── views/
├── data/
│   └── projects/
└── node_modules/
```

## Environment Variables

Create a `.env` file with the following variables:

```env
PORT=3000
SESSION_SECRET=your-secret-key
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

MIT 