# Development

## 已验证状态

当前仓库已验证通过：

```bash
cargo test -p sms-core
cargo check --workspace
npm run build
```

并做过运行态冒烟：

- `GET /health`
- `GET /api/provider-manifests`
- `GET /api/providers/mock/manifest`
- `PUT /api/providers/mock/manifest`
- `POST /api/provider-manifests/reload`

## Git

仓库已初始化 Git：

```bash
git init
```

当前还没有提交历史。

## 常用命令

### Rust

```bash
cargo check --workspace
cargo test -p sms-core
```

### 前端

```bash
npm run build
```

### 启动 daemon

```bash
cargo run -p madao-sms-daemon
```

### 查看 provider manifests

```bash
curl http://127.0.0.1:7822/api/provider-manifests
```

### 读取单个 manifest

```bash
curl http://127.0.0.1:7822/api/providers/mock/manifest
```

### 保存单个 manifest

```bash
curl -X PUT http://127.0.0.1:7822/api/providers/mock/manifest \
  -H 'Content-Type: application/json' \
  -d @manifest.json
```

### 热重载 manifests

```bash
curl -X POST http://127.0.0.1:7822/api/provider-manifests/reload
```

## Tauri / UI 现状

当前前端已经可以构建，Tauri 侧也能通过 workspace 编译检查。

如果你问“现在能编译打开测试了吗”，答案是：

- `能编译`：是。
- `能构建前端`：是。
- `能启动 daemon 并测试接口`：是。
- `能打开桌面壳做完整交互验收`：代码层面已具备基础条件，但我这一轮主要验证的是编译、构建和后端 API 冒烟，不是完整桌面交互录屏式验收。

如果你要，我下一步可以继续做：

1. `git status` 清点并帮你做首个提交。
2. 启动 Tauri 开发壳，进一步验证桌面 UI 是否可直接打开使用。
