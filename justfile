default: check

fmt:
    cargo fmt --all -- --check

lint:
    cargo clippy --all-targets -- -D warnings

check:
    just fmt
    just lint
    cargo test

serve:
    uv run --project server python  -m server.main

bundle:
    ./scripts/bundler.sh

install:
    ./scripts/install.sh

iso:
    ./scripts/make_iso.sh
