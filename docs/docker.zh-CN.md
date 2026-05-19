# Docker 部署说明

## 概览

MaDao 现已支持独立的 Docker 模式，可通过浏览器直接访问控制台。

Docker 方案包含两个服务：

- `daemon`：Rust 后端服务
- `web`：由 `nginx` 托管的 React 前端

前端通过同源反向代理访问后端，因此对外只需要暴露一个 Web 端口。

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

如果你不想在部署机器上本地构建，也可以直接拉取 Docker Hub 镜像：

```bash
cp .env.docker.example .env
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

默认会拉取：

- `netcookies/madao-daemon:latest`
- `netcookies/madao-web:latest`

这些镜像现在会随发布自动构建为多架构 manifest，包含：

- `linux/amd64`
- `linux/arm64`

如果你要固定到某个发布版本，可在 `.env` 中设置：

```dotenv
MADAO_IMAGE_NAMESPACE=netcookies
MADAO_IMAGE_TAG=0.2.0
```

这里的 `MADAO_IMAGE_TAG` 对应 Docker 镜像 tag，不带前缀 `v`。

## 环境变量

当前 `.env` 支持：

```dotenv
MADAO_WEB_PORT=8080
MADAO_DAEMON_HTTP_PORT=7822
MADAO_HTTP_SECRET=
MADAO_IMAGE_NAMESPACE=netcookies
MADAO_IMAGE_TAG=latest
```

它控制网页端暴露到宿主机的端口：

- 左侧：宿主机端口
- 右侧：容器内 `nginx` 的 `80` 端口

例如：

```dotenv
MADAO_WEB_PORT=18080
```

则访问地址变为：

```text
http://127.0.0.1:18080
```

如果设置了 `MADAO_HTTP_SECRET`，它会覆盖 `runtime-settings.json` 中持久化保存的 secret。
如果为空或未设置，则使用持久化 secret。

`MADAO_DAEMON_HTTP_PORT` 用来控制宿主机侧暴露出来的 daemon HTTP 直连端口。
网页控制台入口仍然走 `MADAO_WEB_PORT`。

`MADAO_IMAGE_NAMESPACE` 和 `MADAO_IMAGE_TAG` 仅用于 `docker-compose.prod.yml`。
默认会拉取 `netcookies` 命名空间下的 `latest` 镜像。

## Docker 模式会做什么

- 后端 HTTP 监听地址改为 `0.0.0.0:7822`
- 运行配置目录改为 `/var/lib/madao`
- 前端运行在 `web` 模式，而不是 Tauri 桌面模式
- 浏览器中不可用的 Tauri 专属能力会自动降级
- 网页控制台必须先通过 HTTP secret 登录，才能进入主页面
- 受保护的 HTTP 路由依赖已登录会话 cookie
- 持久化的 HTTP 端口修改后，需要重启 daemon 才会生效

宿主机侧暴露出来的 daemon HTTP 直连端口，可通过 `MADAO_DAEMON_HTTP_PORT` 单独配置。

## 持久化数据

Docker 模式默认使用命名卷：

```text
madao-data
```

该卷会保存：

- 自动生成的 `config.toml`
- `providers/` 下的 provider manifests
- runtime settings
- runtime state
- option cache
- routing plans

查看 volume：

```bash
docker volume inspect madao_madao-data
```

进入后端容器：

```bash
docker compose exec daemon sh
```

运行时文件目录位于：

```text
/var/lib/madao
```

## 升级

拉取或修改最新代码后，重新构建并启动：

```bash
docker compose up -d --build
```

该操作会保留命名卷，因此运行时数据不会丢失。

如果你使用的是 Docker Hub 预构建镜像，则升级命令为：

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## 重置

如果你需要完全清空运行时状态：

```bash
docker compose down -v
```

这会删除容器并移除持久化 volume。

## 备份与恢复

可以先从后端容器导出运行时目录：

```bash
docker compose exec daemon sh -lc 'tar -czf /tmp/madao-backup.tar.gz -C /var/lib madao'
docker compose cp daemon:/tmp/madao-backup.tar.gz ./madao-backup.tar.gz
```

恢复时，重新创建 volume 后再把备份解压回 `/var/lib` 即可。

## 常用命令

启动：

```bash
docker compose up -d
```

代码更新后重建：

```bash
docker compose up -d --build
```

查看日志：

```bash
docker compose logs -f
```

只看后端日志：

```bash
docker compose logs -f daemon
```

只看网页端日志：

```bash
docker compose logs -f web
```

停止：

```bash
docker compose down
```

停止并删除数据卷：

```bash
docker compose down -v
```

只重启后端：

```bash
docker compose restart daemon
```

只重启网页端：

```bash
docker compose restart web
```

## 故障排查

如果 `http://127.0.0.1:8080` 打不开：

1. 查看服务状态：

```bash
docker compose ps
```

2. 检查后端健康接口：

```bash
curl http://127.0.0.1:8080/health
```

3. 查看后端日志：

```bash
docker compose logs --tail=100 daemon
```

4. 查看网页端日志：

```bash
docker compose logs --tail=100 web
```

如果宿主机端口被占用，修改 `.env`：

```dotenv
MADAO_WEB_PORT=18080
```

然后重新启动：

```bash
docker compose up -d
```

## 浏览器模式说明

当前网页端继续复用现有主控制台 UI，没有额外分叉一套界面。

浏览器模式下：

- 服务商管理、路由、日志、设置、价格查询、激活流程仍可使用
- 打开本地配置目录这类桌面专属操作会自动禁用
- 已补充小屏自适应，但主要目标仍然是桌面浏览器窗口
- Tauri 菜单事件、原生窗口控制和本地壳层能力在浏览器中不可用

## 验证

服务启动后可执行：

```bash
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/api/provider-manifests
```
