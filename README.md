# Posebook 动作参考库

基于 Vue 3、Vite 与 Node.js 的多角色拍摄动作管理工具。每个角色拥有独立的动作参考、现场备注与完成进度，用户和动作数据由后端持久化保存，上传图片也由后端保存。

Docker 一键部署见 [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)；传统 Node.js + 系统 MySQL 部署见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 用户机制

- 默认超级管理员：`admin` / `admin123`
- 所有用户共享同一个动作库
- 未登录即可浏览“共享动作库”中的角色与动作，但只能查看，不能收藏、备注、标记完成或新增内容
- 登录用户都可以新增和修改动作
- 登录用户还可以批量添加动作：一次选择多张本地图片，每张自动压缩至 1MB 以内，动作名称默认取文件名（不含后缀）
- 普通用户只能删除自己创建的动作
- 超级管理员可以删除所有动作
- 用户可以修改自己的密码
- 用户可以收藏动作，并通过“我的收藏”页面集中查看
- “我的角色”页面会展示当前用户创建的角色
- 用户与动作数据由 MySQL 持久化保存（配置在 `.env`）

## 页面路由

前端使用 History API 维护可分享的地址。生产服务与 Vite 开发服务器都会把未带扩展名的路径回退到 `index.html`，因此可以直接打开角色详情地址：

| 地址 | 页面 |
| --- | --- |
| `/` | 共享动作库角色列表 |
| `/character/:characterId` | 共享动作库中的角色详情 |
| `/mine` | 我的角色 |
| `/mine/character/:characterId` | 我的角色中的角色详情（需登录） |
| `/favorites` | 我的收藏 |
| `/favorites/character/:characterId` | 收藏中的角色详情（需登录） |

点击角色卡片时会写入对应的角色详情地址，并支持浏览器前进/后退恢复页面。后续分享功能可以调用 `src/router.js` 中的 `buildCharacterSharePath(characterId)` 生成公共分享路径（始终指向 `/character/:characterId`），再拼接到 `window.location.origin` 上。

## 角色分享

角色详情页提供“微信分享”和“QQ 分享”按钮：

- “QQ 分享”会打开 QQ 互联分享页，可发送给 QQ 好友。
- “微信分享”在桌面端和普通手机浏览器中展示二维码与可复制的链接；在微信内置浏览器中会提示使用右上角 `···` 菜单发送给朋友或分享到朋友圈。
- 分享地址始终使用无需登录即可访问的 `/character/:characterId` 公共路径。

## 开发

```bash
npm install
npm run dev
```

该命令会同时启动：

- Vite 前端开发服务器，默认地址为 `http://127.0.0.1:5173`
- Node 上传服务，默认地址为 `http://127.0.0.1:3001`

如果 `5173` 已被占用，Vite 会自动选择下一个可用端口。

## 构建

```bash
npm run build
npm start
```

`npm start` 会由 Node 服务同时托管构建后的 `dist`、上传 API 和上传图片。生产环境可通过以下变量调整服务：

```bash
PORT=3001
HOST=0.0.0.0
UPLOAD_DIR=/absolute/path/to/uploads
```

服务默认监听 `0.0.0.0`。在同一局域网内，其他设备可通过 `http://服务器IP:3001` 访问；如果仍无法访问，请检查服务器防火墙是否放行 3001 端口。

上传接口为 `POST /api/uploads`，单张图片最大 20MB，支持 JPG、PNG、WebP、GIF 和 AVIF。服务会检查文件真实签名，而不是只信任扩展名。

前端选择本地图片后会自动压缩，尽量将上传文件控制在 1MB 以内；原图本身小于 1MB 时会直接上传，避免不必要的质量损失。批量添加动作时会逐张执行同样的压缩后再上传。

## 目录

```text
scripts/dev.js               前后端联合开发入口
server/index.js              上传 API 与生产静态服务
storage/uploads/             后端上传文件目录
storage/data/                数据迁移占位目录
src/components/             页面组件
src/composables/            角色和动作状态管理
src/services/                前端 API 服务
src/styles/                  全局样式与响应式设计
src/App.vue                  应用布局与顶层交互
```

在界面中可以创建新角色，随后直接上传本地图片或填写已有图片 URL。`storage/uploads` 中的实际上传文件默认不会提交到 Git，请在部署时为该目录配置持久磁盘和备份策略。

首次启动且数据库为空时，服务只创建默认超级管理员 `admin / admin123`，不会写入任何示例角色或动作数据；启动后不会自动恢复或重复添加已删除的数据。
