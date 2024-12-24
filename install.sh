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
ufw allow 5000/tcp
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
# Mevcut Jenkins container'ını kontrol et
if docker ps -a | grep -q jenkins; then
    echo "Jenkins container'ı zaten mevcut. Yeniden başlatılıyor..."
    docker start jenkins
else
    docker run -d \
      --name jenkins \
      --restart unless-stopped \
      -p 8080:8080 \
      -p 50000:50000 \
      -v jenkins_home:/var/jenkins_home \
      jenkins/jenkins:lts
fi

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

# Proje dosyalarını kontrol et ve gerekirse clone et
CURRENT_DIR=$(pwd)
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
    echo "Proje dosyaları bulunamadı. GitHub'dan klonlanıyor..."
    # Mevcut dizini temizle
    rm -rf * .[^.]*
    # Projeyi klonla
    git clone https://github.com/0furkancolak/build-tool.git .
    if [ $? -ne 0 ]; then
        echo "Proje klonlama başarısız oldu!"
        exit 1
    fi
fi

# Kullanılabilir port bulma fonksiyonu
find_available_port() {
    # İlk olarak 5000 portunu dene
    if ! lsof -i:5000 > /dev/null 2>&1; then
        echo "5000 portu kullanılabilir."
        echo "5000"
        return
    fi
    
    echo "5000 portu kullanımda. Alternatif port aranıyor..."
    # 5000 portu kullanılıyorsa, diğer portları dene
    for port in {5001..5010}; do
        if ! lsof -i:$port > /dev/null 2>&1; then
            echo "$port portu kullanılabilir."
            ufw allow $port/tcp
            echo "$port"
            return
        fi
    done
    
    echo "Kullanılabilir port bulunamadı (5000-5010 aralığında)"
    exit 1
}

# Kullanılabilir portu bul
AVAILABLE_PORT=$(find_available_port)
if [ $? -ne 0 ]; then
    echo "Port bulunamadı. Kurulum iptal ediliyor."
    exit 1
fi

echo "Kullanılacak port: $AVAILABLE_PORT"

# Gerekli dizinleri oluştur
mkdir -p data/projects
mkdir -p data/uploads
mkdir -p logs

# Uygulama bağımlılıklarını kurma
echo "Uygulama bağımlılıkları kuruluyor..."
npm install
npm install express-rate-limit
npm install express-session
npm install connect-mongo
npm install bcryptjs
npm install winston
npm install dotenv
npm install ejs
npm install mongoose
npm install multer
npm install nodemailer
npm install simple-git
npm install yaml
npm install node-cron

# .env dosyası oluştur
cat > .env << EOF
PORT=$AVAILABLE_PORT
NODE_ENV=production
SESSION_SECRET=$(openssl rand -hex 32)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=\$2a\$10\$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGDMVr5yUP1KUOYTa
SSL_AUTO=true
SSL_RENEWAL_TIME="0 0 * * *"
EOF

# Systemd service dosyası oluşturma
cat > /etc/systemd/system/devops-tool.service << EOF
[Unit]
Description=DevOps Tool
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$CURRENT_DIR
ExecStartPre=/usr/bin/npm run startup
ExecStart=/usr/bin/npm start
Restart=always
Environment=NODE_ENV=production
Environment=PORT=$AVAILABLE_PORT
TimeoutStartSec=180

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
        proxy_pass http://localhost:$AVAILABLE_PORT;
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
        alias $CURRENT_DIR/data/uploads;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }
}
EOF

ln -sf /etc/nginx/sites-available/devops-tool /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# SSL otomatik yenileme için cron job
(crontab -l 2>/dev/null; echo "0 0 * * * certbot renew --quiet && systemctl reload nginx") | crontab -

# Startup script oluştur
cat > $CURRENT_DIR/startup.sh << 'EOF'
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
    if [ ! -d "$dir" ]; then
        echo "$dir dizini oluşturuluyor..."
        mkdir -p "$dir"
        chmod -R 755 "$dir"
    fi
done

# Uploads dizini için özel izinler
chmod -R 775 "data/uploads"

echo "Sistem başlatma kontrolleri tamamlandı."
EOF

chmod +x $CURRENT_DIR/startup.sh

# Startup ve uygulamayı başlat
echo "Uygulama başlatılıyor..."
npm run startup
systemctl restart devops-tool

# Jenkins initial password gösterme
echo "Jenkins kurulumu tamamlandı. Initial Admin Password:"
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword

echo "Kurulum tamamlandı!"
echo "Sisteme http://$(curl -s ifconfig.me):$AVAILABLE_PORT adresinden erişebilirsiniz."
echo "Varsayılan kullanıcı adı: admin"
echo "Varsayılan şifre: admin"
echo "ÖNEMLİ: Lütfen ilk girişten sonra şifrenizi değiştirin!"