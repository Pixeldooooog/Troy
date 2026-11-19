.DEFAULT_GOAL := help

.PHONY: help dev mock check

help:
	@echo "make dev    Start the native Troy Dev app with live feeds and hot reload"
	@echo "make mock   Open the dashboard in Vite with simulated quotes"
	@echo "make check  Run frontend checks, Rust tests and Clippy"

node_modules/.troy-deps: package.json package-lock.json
	npm ci
	@touch $@

dev: export RUST_BACKTRACE ?= 1
dev: node_modules/.troy-deps
	npm run tauri -- dev --config src-tauri/tauri.dev.conf.json

mock: node_modules/.troy-deps
	npm run dev:mock -- --host 127.0.0.1 --port 1431 --strictPort --open

check: node_modules/.troy-deps
	npm run format:check
	npm run lint
	npm test
	npm run build
	cargo test --workspace --locked
	cargo clippy --workspace --locked --all-targets -- -D warnings
