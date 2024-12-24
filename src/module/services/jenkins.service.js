const jenkins = require('jenkins')({ baseUrl: process.env.JENKINS_URL });
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

class JenkinsService {
    constructor() {
        this.jenkins = jenkins;
    }

    async createJob(project) {
        try {
            const jobConfig = this.generateJobConfig(project);
            await this.jenkins.job.create(project.id, jobConfig);
            
            // Webhook'u yapılandır
            await this.setupWebhook(project);
            
            logger.info('Jenkins job created:', { projectId: project.id });
        } catch (error) {
            logger.error('Jenkins job creation error:', error);
            throw error;
        }
    }

    async updateJob(project) {
        try {
            const jobConfig = this.generateJobConfig(project);
            await this.jenkins.job.config(project.id, jobConfig);
            
            logger.info('Jenkins job updated:', { projectId: project.id });
        } catch (error) {
            logger.error('Jenkins job update error:', error);
            throw error;
        }
    }

    async deleteJob(projectId) {
        try {
            await this.jenkins.job.destroy(projectId);
            logger.info('Jenkins job deleted:', { projectId });
        } catch (error) {
            logger.error('Jenkins job deletion error:', error);
            throw error;
        }
    }

    async buildJob(projectId) {
        try {
            // Mevcut build'i kontrol et
            const jobInfo = await this.jenkins.job.get(projectId);
            const lastBuild = await this.getLastSuccessfulBuild(projectId);
            
            // Yeni build'i başlat
            const buildNumber = await this.jenkins.job.build(projectId);
            
            // Build durumunu izle
            const buildResult = await this.waitForBuildToComplete(projectId, buildNumber);
            
            if (buildResult.result === 'FAILURE' && lastBuild) {
                // Build başarısız olursa eski build'e geri dön
                await this.rollbackToBuild(projectId, lastBuild.number);
                throw new Error('Build failed, rolled back to last successful build');
            }
            
            logger.info('Jenkins build completed:', { 
                projectId, 
                buildNumber, 
                result: buildResult.result 
            });
            
            return buildResult;
        } catch (error) {
            logger.error('Jenkins build error:', error);
            throw error;
        }
    }

    async getLastSuccessfulBuild(projectId) {
        try {
            const job = await this.jenkins.job.get(projectId);
            if (job.lastSuccessfulBuild) {
                return await this.jenkins.build.get(projectId, job.lastSuccessfulBuild.number);
            }
            return null;
        } catch (error) {
            logger.error('Get last successful build error:', error);
            return null;
        }
    }

    async waitForBuildToComplete(projectId, buildNumber) {
        return new Promise((resolve, reject) => {
            const checkBuild = async () => {
                try {
                    const build = await this.jenkins.build.get(projectId, buildNumber);
                    if (!build.building) {
                        resolve(build);
                    } else {
                        setTimeout(checkBuild, 5000); // 5 saniye sonra tekrar kontrol et
                    }
                } catch (error) {
                    reject(error);
                }
            };
            checkBuild();
        });
    }

    async rollbackToBuild(projectId, buildNumber) {
        try {
            // Eski build'in artifact'lerini al
            const build = await this.jenkins.build.get(projectId, buildNumber);
            const artifacts = await this.jenkins.build.artifact(projectId, buildNumber);
            
            // Eski build'i geri yükle
            await this.deployBuildArtifacts(projectId, artifacts);
            
            logger.info('Rolled back to build:', { projectId, buildNumber });
        } catch (error) {
            logger.error('Rollback error:', error);
            throw error;
        }
    }

    async deployBuildArtifacts(projectId, artifacts) {
        // Artifact'leri deploy et
        // Bu kısım projenin deploy stratejisine göre özelleştirilmeli
    }

    async setupWebhook(project) {
        try {
            // GitHub webhook'unu yapılandır
            const webhookUrl = `${process.env.APP_URL}/api/webhooks/jenkins/${project.id}`;
            
            // Jenkins'te GitHub webhook trigger'ını etkinleştir
            await this.updateJobTriggers(project.id, webhookUrl);
            
            logger.info('Webhook setup completed:', { projectId: project.id });
        } catch (error) {
            logger.error('Webhook setup error:', error);
            throw error;
        }
    }

    generateJobConfig(project) {
        return `<?xml version='1.1' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@1316.vd2290d3341a_f">
    <actions/>
    <description>Build job for ${project.name}</description>
    <keepDependencies>false</keepDependencies>
    <properties>
        <com.coravy.hudson.plugins.github.GithubProjectProperty plugin="github@1.37.1">
            <projectUrl>${project.repoUrl}</projectUrl>
            <displayName>${project.name}</displayName>
        </com.coravy.hudson.plugins.github.GithubProjectProperty>
    </properties>
    <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps@3731.ve4b_5c262b_d58">
        <script>
pipeline {
    agent any
    
    environment {
        BRANCH_NAME = '${project.branch}'
        DOCKER_IMAGE = '${project.name.toLowerCase()}'
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout([$class: 'GitSCM',
                    branches: [[name: "*/${project.branch}"]],
                    userRemoteConfigs: [[url: '${project.repoUrl}']]])
            }
        }
        
        stage('Build') {
            steps {
                script {
                    // Eski container'ı çalışır durumda tut
                    sh 'docker ps -q --filter name=${project.id} | grep -q . && docker rename ${project.id} ${project.id}_old || true'
                    
                    // Yeni image'ı build et
                    sh 'docker build -t $DOCKER_IMAGE:$BUILD_NUMBER .'
                    
                    // Yeni container'ı başlat
                    sh '''
                        docker run -d --name=${project.id} \
                            -p ${project.port}:${project.port} \
                            $DOCKER_IMAGE:$BUILD_NUMBER
                    '''
                    
                    // Yeni container'ın sağlık kontrolü
                    sh '''
                        for i in {1..30}; do
                            if curl -s http://localhost:${project.port}/health; then
                                exit 0
                            fi
                            sleep 2
                        done
                        exit 1
                    '''
                }
            }
        }
        
        stage('Test') {
            steps {
                script {
                    // Test aşaması başarısız olursa eski container'a geri dön
                    try {
                        sh 'npm test'
                    } catch (Exception e) {
                        // Yeni container'ı durdur ve sil
                        sh 'docker stop ${project.id} || true'
                        sh 'docker rm ${project.id} || true'
                        
                        // Eski container'ı geri getir
                        sh 'docker rename ${project.id}_old ${project.id} || true'
                        sh 'docker start ${project.id} || true'
                        
                        throw e
                    }
                }
            }
        }
        
        stage('Deploy') {
            steps {
                script {
                    // Deploy başarılı olursa eski container'ı kaldır
                    sh 'docker stop ${project.id}_old || true'
                    sh 'docker rm ${project.id}_old || true'
                    
                    // Eski image'ları temizle
                    sh 'docker image prune -af'
                }
            }
        }
    }
    
    post {
        failure {
            script {
                // Build başarısız olursa eski container'a geri dön
                sh 'docker stop ${project.id} || true'
                sh 'docker rm ${project.id} || true'
                sh 'docker rename ${project.id}_old ${project.id} || true'
                sh 'docker start ${project.id} || true'
            }
        }
    }
}
        </script>
        <sandbox>true</sandbox>
    </definition>
    <triggers>
        <com.cloudbees.jenkins.GitHubPushTrigger plugin="github@1.37.1">
            <spec></spec>
        </com.cloudbees.jenkins.GitHubPushTrigger>
    </triggers>
</flow-definition>`;
    }

    async updateJobTriggers(projectId, webhookUrl) {
        try {
            const job = await this.jenkins.job.get(projectId);
            const config = await this.jenkins.job.config(projectId);
            
            // Webhook trigger'ını güncelle
            const updatedConfig = config.replace(
                /<triggers>[\s\S]*?<\/triggers>/,
                `<triggers>
                    <com.cloudbees.jenkins.GitHubPushTrigger plugin="github@1.37.1">
                        <spec></spec>
                    </com.cloudbees.jenkins.GitHubPushTrigger>
                </triggers>`
            );
            
            await this.jenkins.job.config(projectId, updatedConfig);
        } catch (error) {
            logger.error('Update job triggers error:', error);
            throw error;
        }
    }

    async getBuildLogs(projectId, buildNumber) {
        try {
            const log = await this.jenkins.build.log(projectId, buildNumber);
            return log;
        } catch (error) {
            logger.error('Get build logs error:', error);
            throw error;
        }
    }

    async getJobStatus(projectId) {
        try {
            const job = await this.jenkins.job.get(projectId);
            return {
                lastBuild: job.lastBuild,
                lastSuccessfulBuild: job.lastSuccessfulBuild,
                lastFailedBuild: job.lastFailedBuild,
                inProgress: job.inQueue || (job.lastBuild && job.lastBuild.building)
            };
        } catch (error) {
            logger.error('Get job status error:', error);
            throw error;
        }
    }
}

module.exports = new JenkinsService(); 