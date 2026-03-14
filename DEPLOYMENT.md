# EasePBN — Production Deployment Guide

## Overview

This guide covers deploying EasePBN on a VPS (Ubuntu 22.04/24.04) with Nginx reverse proxy, SSL, and process management via PM2.

**Architecture:**

```
Client → Nginx (SSL :443) → Bun API (:3000)
                           → Static frontend (built files)
         PostgreSQL (:5432)
         Redis (:6379)
```

---

## 1. VPS Requirements

| Resource | Minimum | Recommended (200+ sites) |
|----------|---------|--------------------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 2 GB | 4 GB |
| Storage | 20 GB SSD | 40 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |

Providers: DigitalOcean, Hetzner, Vultr, Contabo, etc.

---

## 2. Server Setup

### 2.1 Initial Security

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Create deploy user (don't run app as root)
sudo adduser easepbn
sudo usermod -aG sudo easepbn
su - easepbn

# SSH key auth (copy your pubkey)
mkdir -p ~/.ssh
echo "your-public-key" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys

# Disable password auth (optional, recommended)
sudo sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# Firewall
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### 2.2 Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version
```

### 2.3 Install PostgreSQL 16

```bash
sudo apt install -y gnupg2 lsb-release
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
sudo apt update
sudo apt install -y postgresql-16

# Create database and user
sudo -u postgres psql <<SQL
CREATE USER easepbn WITH PASSWORD 'YOUR_STRONG_PASSWORD_HERE';
CREATE DATABASE easepbn OWNER easepbn;
GRANT ALL PRIVILEGES ON DATABASE easepbn TO easepbn;
SQL
```

### 2.4 Install Redis 7

```bash
sudo apt install -y redis-server

# Bind to localhost only, set password
sudo nano /etc/redis/redis.conf
# Set: bind 127.0.0.1 ::1
# Set: requirepass YOUR_REDIS_PASSWORD_HERE
# Set: maxmemory 256mb
# Set: maxmemory-policy allkeys-lru

sudo systemctl restart redis
sudo systemctl enable redis
```

### 2.5 Install Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

### 2.6 Install PM2

```bash
bun install -g pm2
```

---

## 3. Deploy Application

### 3.1 Clone & Install

```bash
cd /home/easepbn
git clone <your-repo-url> easepbn-app
cd easepbn-app
bun install
```

### 3.2 Environment Configuration

```bash
cp .env.example .env
nano .env
```

**Production `.env`:**

```env
# Database (use strong password)
DATABASE_URL=postgresql://easepbn:YOUR_STRONG_PASSWORD_HERE@localhost:5432/easepbn

# Redis (with password)
REDIS_URL=redis://:YOUR_REDIS_PASSWORD_HERE@localhost:6379

# Security (generate fresh keys!)
JWT_SECRET=<generate: openssl rand -base64 32>
ENCRYPTION_KEY=<generate: openssl rand -hex 32>

# OpenAI
OPENAI_API_KEY=sk-your-production-key

# Admin
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your-strong-admin-password

# App
API_PORT=3000
CORS_ORIGIN=https://yourdomain.com

# Optional: Featured images
PEXELS_API_KEY=your-pexels-key
UNSPLASH_ACCESS_KEY=your-unsplash-key

# Production
NODE_ENV=production
```

Generate secure keys:

```bash
# JWT_SECRET
openssl rand -base64 32

# ENCRYPTION_KEY (64 hex chars for AES-256)
openssl rand -hex 32
```

### 3.3 Database Setup

```bash
# Run migrations
bun run db:migrate

# Seed admin account
bun run db:seed
```

### 3.4 Build Frontend

```bash
cd apps/web
bun run build
cd ../..
```

The built files will be in `apps/web/dist/`.

---

## 4. Nginx Configuration

### 4.1 Create Site Config

```bash
sudo nano /etc/nginx/sites-available/easepbn
```

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Redirect HTTP to HTTPS (after SSL setup)
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL (managed by Certbot, see section 5)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Frontend (static files)
    root /home/easepbn/easepbn-app/apps/web/dist;
    index index.html;

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # SPA fallback — serve index.html for all non-file routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 1000;
}
```

### 4.2 Enable Site

```bash
sudo ln -s /etc/nginx/sites-available/easepbn /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # remove default site
sudo nginx -t  # test config
sudo systemctl reload nginx
```

---

## 5. SSL with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx

# Get certificate (Nginx plugin auto-configures)
sudo certbot --nginx -d yourdomain.com

# Auto-renewal (certbot installs a timer by default)
sudo certbot renew --dry-run
```

---

## 6. Process Management (PM2)

### 6.1 PM2 Ecosystem File

Create `ecosystem.config.cjs` at project root:

```bash
nano /home/easepbn/easepbn-app/ecosystem.config.cjs
```

```javascript
module.exports = {
  apps: [
    {
      name: 'easepbn-api',
      interpreter: 'bun',
      script: 'apps/api/src/index.ts',
      cwd: '/home/easepbn/easepbn-app',
      env: {
        NODE_ENV: 'production',
      },
      // Load .env from project root
      env_file: '/home/easepbn/easepbn-app/.env',
      // Restart policy
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      // Logging
      error_file: '/home/easepbn/logs/api-error.log',
      out_file: '/home/easepbn/logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Memory limit restart
      max_memory_restart: '1G',
    },
  ],
}
```

### 6.2 Start & Persist

```bash
# Create logs directory
mkdir -p /home/easepbn/logs

# Start
cd /home/easepbn/easepbn-app
pm2 start ecosystem.config.cjs

# Verify running
pm2 status
pm2 logs easepbn-api

# Save process list & enable startup on boot
pm2 save
pm2 startup
# Run the command it outputs (with sudo)
```

### 6.3 PM2 Commands

```bash
pm2 status              # Check status
pm2 logs easepbn-api    # View logs (live)
pm2 restart easepbn-api # Restart
pm2 stop easepbn-api    # Stop
pm2 monit               # Resource monitor
```

---

## 7. Alternative: systemd Service

If you prefer systemd over PM2:

```bash
sudo nano /etc/systemd/system/easepbn.service
```

```ini
[Unit]
Description=EasePBN API
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=easepbn
WorkingDirectory=/home/easepbn/easepbn-app
ExecStart=/home/easepbn/.bun/bin/bun run --env-file=.env apps/api/src/index.ts
Restart=always
RestartSec=5
Environment=NODE_ENV=production

# Resource limits
LimitNOFILE=65535
MemoryMax=1G

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=easepbn

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable easepbn
sudo systemctl start easepbn
sudo systemctl status easepbn

# View logs
sudo journalctl -u easepbn -f
```

---

## 8. Database Backup & Restore

### 8.1 Automated Daily Backup

```bash
mkdir -p /home/easepbn/backups

nano /home/easepbn/backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/home/easepbn/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="easepbn_${TIMESTAMP}.sql.gz"

# Dump and compress
PGPASSWORD='YOUR_STRONG_PASSWORD_HERE' pg_dump \
  -h localhost -U easepbn -d easepbn \
  --no-owner --no-acl \
  | gzip > "${BACKUP_DIR}/${FILENAME}"

# Keep only last 14 days
find "${BACKUP_DIR}" -name "easepbn_*.sql.gz" -mtime +14 -delete

echo "[$(date)] Backup created: ${FILENAME}"
```

```bash
chmod +x /home/easepbn/backup.sh

# Schedule daily at 3 AM
crontab -e
# Add: 0 3 * * * /home/easepbn/backup.sh >> /home/easepbn/logs/backup.log 2>&1
```

### 8.2 Restore from Backup

```bash
gunzip -c /home/easepbn/backups/easepbn_20260314_030000.sql.gz | \
  PGPASSWORD='YOUR_STRONG_PASSWORD_HERE' psql -h localhost -U easepbn -d easepbn
```

### 8.3 Off-site Backup (Optional)

```bash
# Sync to S3-compatible storage
sudo apt install -y rclone
rclone config  # Configure your remote

# Add to backup.sh:
rclone copy "${BACKUP_DIR}/${FILENAME}" remote:easepbn-backups/
```

---

## 9. Updating / Redeploying

### 9.1 Standard Update

```bash
cd /home/easepbn/easepbn-app

# Pull latest code
git pull origin main

# Install dependencies
bun install

# Run new migrations (if any)
bun run db:migrate

# Rebuild frontend
cd apps/web && bun run build && cd ../..

# Restart API
pm2 restart easepbn-api
# or: sudo systemctl restart easepbn
```

### 9.2 Zero-Downtime Approach

For minimal disruption to queue workers:

```bash
# 1. Build frontend first (no downtime)
cd apps/web && bun run build && cd ../..

# 2. Run migrations (additive migrations are safe while running)
bun run db:migrate

# 3. Restart API (BullMQ workers auto-recover in-flight jobs)
pm2 restart easepbn-api
```

BullMQ handles graceful shutdown — in-progress jobs will be retried after restart.

---

## 10. Monitoring

### 10.1 Health Check

```bash
# Quick check
curl -s https://yourdomain.com/health | jq .

# Cron-based uptime check (every 5 min)
# Add to crontab:
# */5 * * * * curl -sf https://yourdomain.com/health > /dev/null || echo "EasePBN DOWN" | mail -s "Alert" admin@yourdomain.com
```

### 10.2 PM2 Monitoring

```bash
pm2 monit           # Real-time CPU/memory
pm2 logs --lines 50 # Recent logs
```

### 10.3 External Monitoring (Recommended)

Use a free uptime monitor to ping `/health`:
- UptimeRobot (free, 5-min intervals)
- Better Stack (free tier)
- Cronitor

### 10.4 Disk & Resource Alerts

```bash
# Check disk usage
df -h

# Watch for high memory/CPU
htop
```

---

## 11. Security Checklist

- [ ] SSH key auth only (password auth disabled)
- [ ] UFW firewall enabled (only 22, 80, 443)
- [ ] PostgreSQL listens on localhost only
- [ ] Redis bound to localhost with password
- [ ] `.env` file is `chmod 600` (owner read/write only)
- [ ] CORS_ORIGIN set to your exact domain (not `*`)
- [ ] Strong JWT_SECRET (32+ chars, randomly generated)
- [ ] Strong ENCRYPTION_KEY (64 hex chars, randomly generated)
- [ ] Admin password changed from default
- [ ] Nginx security headers configured
- [ ] SSL/TLS with auto-renewal
- [ ] Regular backups configured
- [ ] Fail2ban installed (`sudo apt install fail2ban`)

```bash
# Lock down .env
chmod 600 /home/easepbn/easepbn-app/.env
```

---

## 12. Docker Production (Alternative)

If you prefer Docker for the full stack:

Create `docker-compose.prod.yml`:

```yaml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    restart: always
    env_file: .env
    ports:
      - "127.0.0.1:3000:3000"
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_USER: easepbn
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: easepbn
    volumes:
      - pgdata:/var/lib/postgresql/data
    # No port exposure — internal only

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD} --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redisdata:/data
    # No port exposure — internal only

volumes:
  pgdata:
  redisdata:
```

Create `Dockerfile`:

```dockerfile
FROM oven/bun:1-alpine

WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/ packages/
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build frontend
RUN cd apps/web && bun run build

# Expose API port
EXPOSE 3000

# Start API (workers + cron start automatically)
CMD ["bun", "run", "apps/api/src/index.ts"]
```

```bash
# Deploy with Docker
docker compose -f docker-compose.prod.yml up -d

# Run migrations
docker compose -f docker-compose.prod.yml exec api bun run db:migrate
docker compose -f docker-compose.prod.yml exec api bun run db:seed
```

Use Nginx on the host as reverse proxy (same config as section 4).

---

## 13. Scaling Considerations

| Sites | Workers | Redis Memory | PostgreSQL | Notes |
|-------|---------|-------------|-----------|-------|
| 1-50 | Default | 128 MB | 1 GB RAM | Dev/small setup |
| 50-200 | Current config | 256 MB | 2 GB RAM | Standard production |
| 200-500 | Increase concurrency | 512 MB | 4 GB RAM | Consider connection pooling |
| 500+ | Multiple API instances | 1 GB+ | Dedicated DB | Add PgBouncer, separate worker processes |

**Current worker concurrency (configured for 200 sites):**

| Queue | Concurrency | Rate Limit |
|-------|-------------|-----------|
| Article Generation | 8 | 30/min |
| WordPress Posting | 15 | Per-site maxPostsPerDay |
| Schedule Execution | 5 | — |

---

## Quick Reference

```bash
# Start everything
pm2 start ecosystem.config.cjs

# View status
pm2 status

# View logs
pm2 logs easepbn-api --lines 100

# Restart after deploy
git pull && bun install && bun run db:migrate && cd apps/web && bun run build && cd ../.. && pm2 restart easepbn-api

# Backup now
/home/easepbn/backup.sh

# Check health
curl -s https://yourdomain.com/health
```
