# Posebook 服务器部署文档

本文档适用于把 Posebook 部署到一台 Linux 服务器，并通过 `3001` 端口提供网页服务。

## 1. 环境要求

- Linux 服务器，建议 Ubuntu 22.04/24.04、Debian 12 或兼容系统
- Node.js `20.19+` 或 `22.12+`
- MySQL `8.0+`，与服务部署在同一台服务器时使用 `127.0.0.1:3306`
- 服务器防火墙或云安全组放行 `3001/tcp`

查看当前环境：

```bash
node -v
npm -v
```

如果 Node 版本过低，请先升级 Node.js。

## 2. 安装 MySQL

Ubuntu/Debian 示例：

```bash
sudo apt update
sudo apt install -y mysql-server
sudo systemctl enable --now mysql
```

进入 MySQL：

```bash
sudo mysql
```

创建数据库和专用账号。把 `YOUR_DB_PASSWORD` 换成你自己的强密码：

```sql
CREATE DATABASE posebook CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'posebook'@'localhost' IDENTIFIED BY 'YOUR_DB_PASSWORD';
CREATE USER 'posebook'@'127.0.0.1' IDENTIFIED BY 'YOUR_DB_PASSWORD';
GRANT ALL PRIVILEGES ON posebook.* TO 'posebook'@'localhost';
GRANT ALL PRIVILEGES ON posebook.* TO 'posebook'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

> 如果 MySQL 是 Docker 或远程数据库，按实际情况创建 `'posebook'@'%'` 或指定服务器 IP 的账号，并把后面的 `DB_HOST` 和 `DB_PORT` 改成实际地址。

## 3. 上传项目代码

建议把项目放到 `/opt/posebook`。

方式一：使用 Git

```bash
sudo mkdir -p /opt/posebook
sudo chown $USER:$USER /opt/posebook
git clone <你的仓库地址> /opt/posebook
cd /opt/posebook
```

方式二：直接上传目录

```bash
scp -r /本地/posebook 用户名@服务器IP:/opt/posebook
```

不要拷贝本机的 `node_modules` 和 `dist`，部署后重新安装和构建，避免环境不一致。

## 4. 创建环境配置

进入项目目录：

```bash
cd /opt/posebook
```

创建 `.env`：

```bash
nano .env
```

参考配置：

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=posebook
DB_PASSWORD=YOUR_DB_PASSWORD
DB_NAME=posebook

PORT=3001
HOST=0.0.0.0
UPLOAD_DIR=/opt/posebook/storage/uploads
```

说明：

- `PORT` 默认 `3001`，不配置也可以。
- `HOST` 默认 `0.0.0.0`，表示监听所有网卡，其他电脑才能访问。
- `UPLOAD_DIR` 是上传图片目录；不配置时默认使用项目内 `storage/uploads`。
- `.env` 已加入 `.gitignore`，不要提交到 Git。

## 5. 安装依赖并构建

```bash
npm ci
npm run build
```

构建成功后，`dist` 目录会生成前端静态文件。

如需减少生产目录体积，可以删除构建时使用的开发依赖：

```bash
npm prune --omit=dev
```

## 6. 启动服务

### 6.1 手动启动

```bash
npm start
```

保持后台运行：

```bash
nohup npm start > storage/app.log 2>&1 &
```

验证服务：

```bash
curl http://127.0.0.1:3001/api/health
```

返回：

```json
{"status":"ok","uploadLimitMb":20}
```

### 6.2 使用 systemd 管理（推荐）

如果使用专用运行用户，先创建用户并授权：

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin posebook
sudo chown -R posebook:posebook /opt/posebook
```

创建服务文件：

```bash
sudo nano /etc/systemd/system/posebook.service
```

示例内容：

```ini
[Unit]
Description=Posebook Service
After=network.target mysql.service

[Service]
Type=simple
WorkingDirectory=/opt/posebook
EnvironmentFile=/opt/posebook/.env
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
User=posebook
Group=posebook

[Install]
WantedBy=multi-user.target
```

如果不用专用用户，可以把 `User=posebook` 和 `Group=posebook` 改成实际部署用户，但必须保证该用户对项目目录、`storage/data`、`storage/uploads` 有读写权限。

启用并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now posebook
sudo systemctl status posebook
```

查看日志：

```bash
journalctl -u posebook -f
```

## 7. 防火墙与访问

```bash
sudo ufw allow 3001/tcp
```

如果服务器有云安全组，还需要在云控制台放行 `3001/tcp`。

访问地址：

```text
http://服务器IP:3001
```

健康检查地址：

```text
http://服务器IP:3001/api/health
```

## 8. 初始化数据说明

- 服务首次启动时，会自动创建 MySQL 表结构，不需要手动执行建表 SQL。
- 如果 MySQL 数据库为空，且项目内存在旧版 `storage/data/app-db.json`，服务会把它迁移到 MySQL。
- 如果数据库和旧文件都为空，服务会写入初始角色和动作数据。
- 当前数据以 MySQL 为准，`storage/data/app-db.json` 不再作为主要数据源。

## 9. 默认管理员与安全建议

- 初始超级管理员账号为 `admin`
- 初始密码为 `admin123`
- 登录后请立即在侧边栏“改密”中修改管理员密码

建议：

- 使用强数据库密码，不要把 `.env` 提交到 Git
- 不要直接暴露服务器 SSH 端口，或至少修改默认端口
- 如果用于公网访问，建议在前面加 Nginx/Caddy 和 HTTPS
- 定期备份 MySQL 数据和上传目录

## 10. 备份与恢复

### 备份数据库

```bash
cd /opt/posebook
mysqldump -uposebook -p posebook > backup-$(date +%F-%H%M%S).sql
```

### 备份上传图片

```bash
tar -czf uploads-$(date +%F-%H%M%S).tar.gz storage/uploads
```

建议把备份文件放到服务器以外的存储位置。

### 恢复数据库

先停止服务：

```bash
sudo systemctl stop posebook
```

然后恢复：

```bash
mysql -uposebook -p posebook < backup.sql
```

最后启动服务：

```bash
sudo systemctl start posebook
```

## 11. 更新部署

如果使用 Git 管理代码：

```bash
cd /opt/posebook
git pull
npm ci
npm run build
sudo systemctl restart posebook
```

如果修改了 `.env` 中的数据库配置，重启后才会生效。

## 12. 常见问题

### 页面打不开

检查服务是否启动：

```bash
curl http://127.0.0.1:3001/api/health
```

检查端口监听：

```bash
ss -ltnp | grep 3001
```

### 其他电脑访问不了

确认：

- 服务监听的是 `0.0.0.0`，而不是 `127.0.0.1`
- 防火墙已放行 `3001/tcp`
- 云安全组已放行 `3001/tcp`

### 连接数据库失败

检查 MySQL 是否运行：

```bash
sudo systemctl status mysql
```

检查 `.env` 中 `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME` 是否与第 2 步创建的账号一致。

### 上传图片报权限错误

确保服务运行用户对 `storage/uploads` 有写权限：

```bash
sudo chown -R posebook:posebook /opt/posebook/storage
sudo chmod -R u+rwX /opt/posebook/storage
```

如果使用的是手动 `npm start`，请把 `posebook` 换成实际运行服务的用户。

### 刷新后数据不见了

先确认 MySQL 数据存在：

```bash
mysql -uposebook -p -e "SELECT COUNT(*) FROM posebook.characters; SELECT COUNT(*) FROM posebook.actions;"
```

只要 MySQL 有数据，重启服务和刷新页面都不会丢数据。
