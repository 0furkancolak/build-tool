#!/bin/bash

# Root kontrolü
if [ "$EUID" -ne 0 ]; then 
    echo "Bu script root yetkisi gerektirir"
    exit 1
fi

# Sistem güncellemesi
echo "Sistem güncelleniyor..."
apt update && apt upgrade -y

# Temel paketlerin kurulumu
echo "Temel paketler kuruluyor..."
apt install -y git curl wget nano zip unzip ufw build-essential python3 python3-pip

# UFW Firewall yapılandırması
echo "Firewall yapılandırılıyor..."
ufw allow ssh
ufw allow http
ufw allow https
ufw allow 5000
echo "y" | ufw enable

# NodeJS kurulumu
echo "NodeJS kuruluyor..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Docker kurulumu
echo "Docker kuruluyor..."
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
systemctl enable docker
systemctl start docker

# Docker Compose kurulumu
echo "Docker Compose kuruluyor..."
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Jenkins kurulumu
echo "Jenkins kuruluyor..."
docker run -d \
  --name jenkins \
  --restart unless-stopped \
  -p 8080:8080 \
  -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  jenkins/jenkins:lts

# Nginx kurulumu
echo "Nginx kuruluyor..."
apt install -y nginx
systemctl enable nginx
systemctl start nginx

# Certbot kurulumu
echo "Certbot kuruluyor..."
apt install -y certbot python3-certbot-nginx
# SSL yenileme için cron job oluştur
(crontab -l 2>/dev/null; echo "0 0 * * * certbot renew --quiet") | crontab -

# Uygulama dizini oluşturma
APP_DIR="/opt/devops-tool"
mkdir -p $APP_DIR
cd $APP_DIR

# Mevcut dizindeki dosyaları kopyala
CURRENT_DIR=$(pwd)
echo "Dosyalar $CURRENT_DIR dizininden kopyalanıyor..."
cp -r $CURRENT_DIR/* $APP_DIR/ || {
    echo "Dosya kopyalama hatası. Git ile klonlama deneniyor..."
    # Eğer dosya kopyalama başarısız olursa ve GIT_REPO tanımlıysa, git clone dene
    if [ -n "$GIT_REPO" ]; then
        git clone $GIT_REPO .
    else
        echo "Hata: Kaynak dosyalar bulunamadı ve GIT_REPO tanımlanmadı!"
        exit 1
    fi
}

# Gerekli dizinleri oluştur
mkdir -p data/projects
mkdir -p data/uploads
mkdir -p logs

# package.json kontrolü
if [ ! -f "package.json" ]; then
    echo "package.json bulunamadı! Temel package.json oluşturuluyor..."
    cat > package.json << EOF
{
  "name": "devops-tool",
  "version": "1.0.0",
  "description": "DevOps automation tool",
  "main": "src/app.js",
  "scripts": {
    "start": "node src/app.js",
    "setup": "node src/scripts/setup.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "express-session": "^1.17.3",
    "bcryptjs": "^2.4.3",
    "ejs": "^3.1.9",
    "dotenv": "^16.3.1",
    "winston": "^3.10.0"
  }
}
EOF
fi

# Uygulama bağımlılıklarını kurma
echo "Uygulama bağımlılıkları kuruluyor..."
npm install

# .env dosyası oluştur
cat > .env << EOF
PORT=5000
NODE_ENV=production
SESSION_SECRET=$(openssl rand -hex 32)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=\$2a\$10\$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGDMVr5yUP1KUOYTa
EOF

# Systemd service dosyası oluşturma
cat > /etc/systemd/system/devops-tool.service << EOF
[Unit]
Description=DevOps Tool
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
ExecStartPre=/usr/bin/npm run setup
ExecStart=/usr/bin/npm start
Restart=always
Environment=NODE_ENV=production
Environment=PORT=5000

[Install]
WantedBy=multi-user.target
EOF

# Servisi başlatma
systemctl daemon-reload
systemctl enable devops-tool
systemctl start devops-tool

# Nginx yapılandırması
cat > /etc/nginx/sites-available/devops-tool << EOF
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Uploads dizini için özel yapılandırma
    location /uploads {
        alias $APP_DIR/data/uploads;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
EOF

ln -sf /etc/nginx/sites-available/devops-tool /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Startup script oluştur
cat > $APP_DIR/startup.sh << 'EOF'
#!/bin/bash

# Servisleri kontrol et ve başlat
services=("docker" "nginx" "devops-tool")

for service in "${services[@]}"; do
    if ! systemctl is-active --quiet $service; then
        echo "$service servisi başlatılıyor..."
        systemctl start $service
    fi
done

# Docker container'larını kontrol et
if ! docker ps -q --filter "name=jenkins" | grep -q .; then
    echo "Jenkins container'ı başlatılıyor..."
    docker start jenkins
fi

# Proje dizinlerini kontrol et
dirs=("data/projects" "data/uploads" "logs")
for dir in "${dirs[@]}"; do
    if [ ! -d "$APP_DIR/$dir" ]; then
        echo "$dir dizini oluşturuluyor..."
        mkdir -p "$APP_DIR/$dir"
        chown -R root:root "$APP_DIR/$dir"
        chmod -R 755 "$APP_DIR/$dir"
    fi
done

# Uploads dizini için özel izinler
chmod -R 775 "$APP_DIR/data/uploads"

echo "Sistem başlatma kontrolleri tamamlandı."
EOF

chmod +x $APP_DIR/startup.sh

# Startup script'ini cron'a ekle
(crontab -l 2>/dev/null; echo "@reboot $APP_DIR/startup.sh") | crontab -

# Jenkins initial password gösterme
echo "Jenkins kurulumu tamamlandı. Initial Admin Password:"
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword

echo "Kurulum tamamlandı!"
echo "Sisteme http://sunucu-ip:5000 adresinden erişebilirsiniz."
echo "Varsayılan kullanıcı adı: admin"
echo "Varsayılan şifre: admin"
echo "ÖNEMLİ: Lütfen ilk girişten sonra şifrenizi değiştirin!"