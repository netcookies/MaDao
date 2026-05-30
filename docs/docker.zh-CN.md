# Docker 部署说明

## 概览

MaDao 支持独立的 Docker 模式，可通过浏览器直接访问控制台。

Docker 方案包含两个服务：

- `daemon` — Rust 后端服务
- `web` — 由 nginx 托管的 React 前端

前端通过同源反向代理访问后端，对外只需暴露一个 Web 端口。

## 一键启动

```bash
cp .env.docker.example .env
docker compose up -d --build
```

启动完成后访问：

```text
http://127.0.0.1:8080
```

如果你修改了 `MADAO_WEB_PORT`，请使用对应端口。

## 使用 Docker Hub 预构建镜像

不想在部署机器上本地构建时，可直接拉取 Docker Hub 镜像：

```bash
cp .env.docker.example .env
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

默认拉取 `netcookies/madao-daemon:latest` 和 `netcookies/madao-web:latest`（多架构：`linux/amd64` + `linux/arm64`）。

固定到某个版本：

```dotenv
MADAO_IMAGE_NAMESPACE=netcookies
MADAO_IMAGE_TAG=0.2.0
```

`MADAO_IMAGE_TAG` 对应 Docker 镜像 tag，不带前缀 `v`。

## 环境变量

```dotenv
MADAO_WEB_PORT=8080              # 宿主机 Web 端口
MADAO_DAEMON_HTTP_PORT=7822      # 宿主机 daemon HTTP 直连端口
MADAO_HTTP_SECRET=               # 覆盖持久化 secret（空 = 使用持久化值）
MADAO_IMAGE_NAMESPACE=netcookies # Docker Hub 命名空间（仅 prod compose）
MADAO_IMAGE_TAG=latest           # Docker 镜像 tag（仅 prod compose）
```

示例 — 修改 Web 端口：

```dotenv
MADAO_WEB_PORT=18080
```

访问地址变为 `http://127.0.0.1:18080`。

## Docker 模式会做什么

- 后端 HTTP 监听地址：`0.0.0.0:7822`
- 运行配置目录：`/var/lib/madao`
- 前端运行在 `web` 模式（Tauri 专属能力自动降级）
- 网页端必须先通过 HTTP secret 登录
- 受保护的 HTTP 路由依赖已登录会话 cookie
- 修改端口后需重启 daemon 生效

## 持久化数据

Docker 模式使用命名卷 `madao-data`，保存：config.toml、providers/、runtime settings、runtime state、option cache、routing plans。

```bash
docker volume inspect madao_madao-data   # 查看 volume
docker compose exec daemon sh            # 进入容器
```

运行时文件位于 `/var/lib/madao`。

## 升级

```bash
docker compose up -d --build                          # 本地构建
docker compose -f docker-compose.prod.yml pull        # 预构建镜像
docker compose -f docker-compose.prod.yml up -d
```

命名卷会保留，运行时数据不会丢失。

## 重置

```bash
docker compose down -v    # 删除容器并移除持久化 volume
```

## 备份与恢复

```bash
docker compose exec daemon sh -lc 'tar -czf /tmp/madao-backup.tar.gz -C /var/lib madao'
docker compose cp daemon:/tmp/madao-backup.tar.gz ./madao-backup.tar.gz
```

恢复时重新创建 volume 后把备份解压回 `/var/lib` 即可。

## 常用命令

| 操作 | 命令 |
|------|------|
| 启动 | `docker compose up -d` |
| 重建 | `docker compose up -d --build` |
| 全部日志 | `docker compose logs -f` |
| 后端日志 | `docker compose logs -f daemon` |
| 网页端日志 | `docker compose logs -f web` |
| 停止 | `docker compose down` |
| 停止并删除数据 | `docker compose down -v` |
| 重启后端 | `docker compose restart daemon` |
| 重启网页端 | `docker compose restart web` |

## 故障排查

如果 `http://127.0.0.1:8080` 打不开：

```bash
docker compose ps                        # 查看服务状态
curl http://127.0.0.1:8080/health        # 检查后端健康
docker compose logs --tail=100 daemon    # 查看后端日志
docker compose logs --tail=100 web       # 查看网页端日志
```

如果宿主机端口被占用，修改 `.env` 中的 `MADAO_WEB_PORT` 后重新启动。

## 浏览器模式说明

网页端复用现有主控制台 UI。浏览器模式下：

- 服务商管理、路由、日志、设置、价格查询、激活流程仍可使用
- 打开本地配置目录等桌面专属操作会自动禁用
- 已补充小屏自适应，但主要目标仍是桌面浏览器窗口
- Tauri 菜单事件、原生窗口控制在浏览器中不可用

## 验证

服务启动后可执行：

```bash
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/api/provider-manifests
```
