.DEFAULT_GOAL := help

.PHONY: help dev app check

help:
	@echo "make dev    Open the dashboard in the browser with simulated quotes"
	@echo "make app    Start the native Troy Dev app with live feeds and hot reload"
	@echo "make check  Run frontend checks, Rust tests and Clippy"

node_modules/.troy-deps: package.json package-lock.json
	npm ci
	@touch $@

dev: node_modules/.troy-deps
	npm run dev:mock -- --host 127.0.0.1 --port 1431 --strictPort --open

app: export RUST_BACKTRACE ?= 1
app: node_modules/.troy-deps
	npm run tauri -- dev --config src-tauri/tauri.dev.conf.json

check: node_modules/.troy-deps
	npm run version:check
	npm run format:check
	npm run lint
	npm test
	npm run build
	cargo fmt --all --check
	cargo test --workspace --locked
	cargo clippy --workspace --locked --all-targets -- -D warnings
