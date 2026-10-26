# Posebook Docker 部署文档

本文档说明如何用当前仓库内的 `Dockerfile` 和 `compose.yaml` 部署 Posebook。默认方案会同时启动 MySQL 和应用容器，适合本机验证以及 Linux 服务器部署。

## 1. 部署文件说明

```text
Dockerfile          多阶段构建前端并生成生产运行镜像
compose.yaml        一键启动 MySQL + Posebook 应用
.dockerignore       构建时排除本机依赖、构建产物和敏感配置
.env.example        环境变量参考文件
storage/uploads     应用上传图片，Compose 挂载到宿主机
storage/data        旧版 JSON 数据迁移目录，Compose 挂载到宿主机
```

镜像运行用户是 `node`，UID 通常为 `1000`。上传目录和旧数据目录都通过 Compose 挂载到宿主机，不需要把文件写进镜像。

## 2. 环境要求

- 已安装 Docker Engine 和 Docker Compose v2
- 服务器防火墙或云安全组放行 `3001/tcp`
- 如果 `docker compose` 不可用，可使用 `sudo docker-compose` 作为兼容命令

检查版本：

```bash
docker --version
docker compose version
```

## 3. 准备配置

进入项目目录，准备 `.env`。如果项目里已有 `.env`，确认其中至少包含 `DB_PASSWORD`：

```bash
cd /path/to/pose-book
cp .env.example .env
```

参考配置：

```env
DB_HOST=mysql
DB_PORT=3306
DB_USER=posebook
DB_PASSWORD=replace-with-a-strong-password
DB_NAME=posebook

MYSQL_ROOT_PASSWORD=replace-with-a-strong-root-password

PORT=3001
HOST=0.0.0.0
UPLOAD_DIR=/app/storage/uploads
TZ=Asia/Shanghai
```

说明：

- `DB_PASSWORD` 是 Compose 必填变量，MySQL 和应用容器都会使用它。
- `MYSQL_ROOT_PASSWORD` 只用于初始化 MySQL 容器，建议设置强密码。
- Compose 会把应用容器里的 `DB_HOST` 固定为 `mysql`，因此 `.env` 里的 `DB_HOST` 在默认 Compose 部署中不会被应用直接使用。
- `PORT` 控制宿主机映射端口，容器内部始终监听 `3001`。
- `.env` 已被 `.gitignore` 忽略，不要提交到 Git。

## 4. 一键启动

```bash
docker compose up -d --build
```

查看状态：

```bash
docker compose ps
```

应用首次启动时会自动创建 MySQL 表结构。如果 MySQL 中没有数据，会写入默认管理员和初始角色数据。

访问地址：

```text
http://服务器IP:3001
```

健康检查：

```bash
curl http://127.0.0.1:3001/api/health
```

返回：

```json
{"status":"ok","uploadLimitMb":20}
```

## 5. 常用命令

仅构建镜像：

```bash
docker build -t posebook:latest .
```

查看日志：

```bash
docker compose logs -f app
docker compose logs -f mysql
```

停止但不删除数据：

```bash
docker compose down
```

停止并删除容器、网络以及未被挂载的匿名卷，但不删除命名卷 `mysql_data`：

```bash
docker compose down -v
```

> `-v` 不会删除宿主机上的 `storage/uploads` 和 `storage/data`，这两个目录始终保留。

## 6. 数据持久化与备份

Compose 使用的数据位置：

```text
MySQL 数据      posebook_mysql_data 命名卷
上传图片        ./storage/uploads
旧版迁移数据    ./storage/data
```

备份数据库：

```bash
docker compose exec -T mysql sh -c 'exec mysqldump -uposebook -p"$MYSQL_PASSWORD" posebook' > backup-$(date +%F-%H%M%S).sql
```

备份上传图片：

```bash
tar -czf uploads-$(date +%F-%H%M%S).tar.gz storage/uploads
```

恢复数据库前建议先停止应用：

```bash
docker compose stop app
docker compose exec -T mysql sh -c 'exec mysql -uposebook -p"$MYSQL_PASSWORD" posebook' < backup.sql
docker compose start app
```

## 7. 更新部署

拉取新代码后重新构建并滚动重启：

```bash
git pull
docker compose up -d --build
```

如果只修改了 `.env`，可以只重建应用容器：

```bash
docker compose up -d app
```

## 8. 初始化账号

- 初始超级管理员：`admin`
- 初始密码：`admin123`

登录后请在“改密”中立即修改管理员密码。

## 9. 常见问题

### 提示缺少 DB_PASSWORD

确认项目根目录存在 `.env`，且包含：

```env
DB_PASSWORD=your-strong-password
```

然后重新执行：

```bash
docker compose up -d
```

### 应用容器反复重启

查看数据库和应用日志：

```bash
docker compose logs mysql
docker compose logs app
```

如果 MySQL 还没初始化完成，应用会等待其健康检查通过后再启动。若日志提示数据库连接失败，检查 `DB_PASSWORD` 是否与 MySQL 初始化时一致。

### 上传图片失败或报权限错误

确保宿主机挂载目录可写：

```bash
mkdir -p storage/uploads storage/data
sudo chown -R 1000:1000 storage
```

然后重建应用容器：

```bash
docker compose up -d app
```

### 其他电脑访问不了

确认：

- `docker compose ps` 中 `app` 状态为 `Up` 且健康
- 防火墙已放行 `3001/tcp`
- 云安全组已放行 `3001/tcp`
- 部署地址是 `http://服务器IP:3001`，不是 `http://127.0.0.1:3001`

### 数据库卷需要彻底重置

先备份数据，再执行：

```bash
docker compose down -v
docker volume rm posebook_mysql_data
docker compose up -d --build
```

这会删除 MySQL 中的业务数据，不能用于日常恢复操作。
