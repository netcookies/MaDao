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

当前仓库已经完成初始化提交，可继续按功能粒度提交后续修改。

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

### 原生 UI 截图

通过真实 Tauri 程序窗口做截图，而不是浏览器页面：

```bash
npm run ui:screenshot -- --target Overview
npm run ui:screenshot:compare -- --target Overview
```

说明：

- 会先构建前端
- 再启动 `cargo run -p madao-tauri`
- 使用 macOS 原生窗口截图抓取实际桌面渲染
- 基线仍然来自 `designs/screenshots/*.png`

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

如需继续验收，建议下一步优先做：

1. 以你们内部平台真实响应样例补充 protocol contract tests。
2. 增加桌面端手工交互验收清单与截图基线。
