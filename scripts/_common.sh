#!/usr/bin/env bash
# Shared helpers for startup.sh / shutdown.sh. Not meant to be run directly --
# sourced by the other scripts in this folder.

step() { printf "\033[36m==> %s\033[0m\n" "$1"; }
ok()   { printf "\033[32m    OK: %s\033[0m\n" "$1"; }
warn() { printf "\033[33m    WARN: %s\033[0m\n" "$1"; }
err()  { printf "\033[31m    ERROR: %s\033[0m\n" "$1"; }
info() { printf "\033[90m    %s\033[0m\n" "$1"; }

# Renders a real progress bar driven by a caller-supplied "are we done yet"
# check function name -- not a fixed-time animation. Polls every
# $3 (poll_seconds) up to $2 (max_wait_seconds), advancing toward 90% while
# waiting and snapping to 100% the moment the check function returns success.
# Usage: wait_progress "Label" max_wait_seconds poll_seconds check_fn
wait_progress() {
    local label="$1" max_wait="$2" poll="$3" check_fn="$4"
    local waited=0 done=0 percent=0 bar_width=30 filled empty

    while [ "$waited" -lt "$max_wait" ]; do
        if "$check_fn"; then
            done=1
            break
        fi
        percent=$(( waited * 90 / max_wait ))
        filled=$(( percent * bar_width / 100 ))
        empty=$(( bar_width - filled ))
        printf "\r    %s: [%s%s] %d%%" "$label" "$(printf '%*s' "$filled" '' | tr ' ' '#')" "$(printf '%*s' "$empty" '' | tr ' ' '-')" "$percent"
        sleep "$poll"
        waited=$(( waited + poll ))
    done

    if [ "$done" -eq 1 ]; then
        filled=$bar_width
        printf "\r    %s: [%s] 100%%\n" "$label" "$(printf '%*s' "$filled" '' | tr ' ' '#')"
        return 0
    else
        printf "\n"
        return 1
    fi
}
