default: check

fmt:
    cargo fmt --all -- --check

lint:
    cargo clippy --all-targets -- -D warnings

check:
    just fmt
    just lint
    cargo test
