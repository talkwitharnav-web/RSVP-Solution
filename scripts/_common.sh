#!/usr/bin/env bash
# Shared helpers for startup.sh / shutdown.sh. Not meant to be run directly --
# sourced by the other scripts in this folder.

step() { printf "\033[36m==> %s\033[0m\n" "$1"; }
ok()   { printf "\033[32m    OK: %s\033[0m\n" "$1"; }
warn() { printf "\033[33m    WARN: %s\033[0m\n" "$1"; }
err()  { printf "\033[31m    ERROR: %s\033[0m\n" "$1"; }
info() { printf "\033[90m    %s\033[0m\n" "$1"; }

# Waits for a caller-supplied check function to succeed, printing one plain
# status line every $poll seconds (e.g. "waiting... (10s)") instead of a fake
# progress bar -- there's no way to know real percent-complete for something
# like "has Docker Desktop finished booting", so we don't pretend to.
# Usage: wait_for "label" max_wait_seconds poll_seconds check_fn
wait_for() {
    local label="$1" max_wait="$2" poll="$3" check_fn="$4"
    local waited=0

    while [ "$waited" -lt "$max_wait" ]; do
        if "$check_fn"; then
            ok "$label"
            return 0
        fi
        info "$label: still waiting... (${waited}s)"
        sleep "$poll"
        waited=$(( waited + poll ))
    done

    if "$check_fn"; then
        ok "$label"
        return 0
    fi
    return 1
}
