#!/bin/bash

# BSMarker Server Initialization Script
# Run this once on a fresh server to set up the production environment
# Usage: ./scripts/init-server.sh

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
    exit 1
}

warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root"
fi

log "BSMarker Server Initialization"
log "==============================="

# 1. Update system
log "Updating system packages..."
apt-get update
apt-get upgrade -y

# 2. Install Docker
if ! command -v docker &> /dev/null; then
    log "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
else
    log "Docker is already installed"
fi

# 3. Install Docker Compose
if ! command -v docker-compose &> /dev/null; then
    log "Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
else
    log "Docker Compose is already installed"
fi

# 4. Install additional tools
log "Installing additional tools..."
apt-get install -y \
    git \
    curl \
    wget \
    htop \
    vim \
    certbot \
    ufw \
    fail2ban

# 5. Configure firewall
log "Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 6. Configure fail2ban
log "Configuring fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

# 7. Create deployment directory
log "Creating deployment directory..."
mkdir -p /opt/bsmarker
mkdir -p /var/log/bsmarker
mkdir -p /var/backups/bsmarker

# 8. Create bsmarker user
if ! id -u bsmarker > /dev/null 2>&1; then
    log "Creating bsmarker user..."
    useradd -m -s /bin/bash bsmarker
    usermod -aG docker bsmarker
else
    log "User bsmarker already exists"
fi

# 9. Set up SSL certificate
log "Setting up SSL certificate for bsmarker.utia.cas.cz..."
SSL_EMAIL=${SSL_EMAIL:-"admin@utia.cas.cz"}
certbot certonly --standalone -d bsmarker.utia.cas.cz --non-interactive --agree-tos --email "$SSL_EMAIL"

# Create SSL directory for nginx
mkdir -p /opt/bsmarker/nginx/ssl
ln -sf /etc/letsencrypt/live/bsmarker.utia.cas.cz /opt/bsmarker/nginx/ssl/

# 10. Set up automatic SSL renewal
log "Setting up automatic SSL renewal..."
cat > /etc/cron.d/certbot-renewal <<EOF
0 2 * * * root certbot renew --quiet --post-hook "docker-compose -f /opt/bsmarker/docker-compose.prod.yml restart nginx"
EOF

# 11. Set up automatic backups
log "Setting up automatic backups..."
cat > /etc/cron.d/bsmarker-backup <<EOF
0 3 * * * bsmarker /opt/bsmarker/scripts/backup.sh >> /var/log/bsmarker/backup.log 2>&1
0 4 * * 0 bsmarker /opt/bsmarker/scripts/backup.sh --full >> /var/log/bsmarker/backup.log 2>&1
EOF

# 12. Set up log rotation
log "Setting up log rotation..."
cat > /etc/logrotate.d/bsmarker <<EOF
/var/log/bsmarker/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 bsmarker bsmarker
    sharedscripts
    postrotate
        docker-compose -f /opt/bsmarker/docker-compose.prod.yml kill -s USR1 nginx
    endscript
}
EOF

# 13. Create systemd service
log "Creating systemd service..."
cat > /etc/systemd/system/bsmarker.service <<EOF
[Unit]
Description=BSMarker Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/bsmarker
ExecStart=/usr/local/bin/docker-compose -f docker-compose.prod.yml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.prod.yml down
TimeoutStartSec=0
User=bsmarker
Group=bsmarker

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable bsmarker

# 14. Set up monitoring (optional)
log "Setting up basic monitoring..."
apt-get install -y prometheus-node-exporter

# 15. Configure sysctl for production
log "Optimizing system parameters..."
cat >> /etc/sysctl.conf <<EOF

# BSMarker optimizations
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 8192
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 30
vm.overcommit_memory = 1
EOF
sysctl -p

# 16. Set permissions
log "Setting permissions..."
chown -R bsmarker:bsmarker /opt/bsmarker
chown -R bsmarker:bsmarker /var/log/bsmarker
chown -R bsmarker:bsmarker /var/backups/bsmarker

log "================================"
log "Server initialization completed!"
log "================================"
log ""
log "Next steps:"
log "1. Clone your repository to /opt/bsmarker"
log "2. Create .env.production file from .env.example"
log "3. Run deployment: ./scripts/deploy.sh --build"
log "4. Start services: systemctl start bsmarker"
log ""
log "Important paths:"
log "- Application: /opt/bsmarker"
log "- Logs: /var/log/bsmarker"
log "- Backups: /var/backups/bsmarker"
log "- SSL certificates: /etc/letsencrypt/live/bsmarker.utia.cas.cz"