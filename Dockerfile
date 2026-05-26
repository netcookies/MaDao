FROM node:22-bookworm-slim AS ui-builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY config ./config
COPY ui ./ui
COPY ui/login.html ./ui/login.html
COPY vite.config.ts tsconfig.json tailwind.config.cjs postcss.config.cjs Cargo.toml ./
RUN VITE_RUNTIME_MODE=web \
    VITE_API_BASE=/ \
    VITE_SOCKET_PATH=/tmp/madao-sms.sock \
    VITE_CONFIG_DIRECTORY=/var/lib/madao \
    npm run build

FROM rust:1.88-bookworm AS daemon-builder
WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY apps ./apps
COPY crates ./crates
COPY src-tauri ./src-tauri
COPY config ./config
COPY plugins ./plugins
RUN cargo build --release -p madao-sms-daemon

FROM debian:bookworm-slim AS daemon
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=daemon-builder /app/target/release/madao-sms-daemon /usr/local/bin/madao-sms-daemon
COPY config/server.toml /app/config/server.toml
COPY plugins/providers /app/plugins/providers

ENV MADAO_RUNTIME_MODE=docker \
    MADAO_CONFIG_DIR=/var/lib/madao \
    MADAO_HTTP_BIND=0.0.0.0:7822 \
    MADAO_SOCKET_PATH=/tmp/madao-sms.sock

VOLUME ["/var/lib/madao"]
EXPOSE 7822

CMD ["madao-sms-daemon"]

FROM nginx:1.27-alpine AS web
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=ui-builder /app/dist /usr/share/nginx/html
COPY ui/login.html /usr/share/nginx/html/login.html
EXPOSE 80
