#!/usr/bin/env bash
# Wrapper shell for VHS demo recordings.
# Sets up mock haiphen on PATH and a clean prompt.
# DEMO_MOCK_DIR must be set before invoking.
export PATH="${DEMO_MOCK_DIR}:${PATH}"
export PS1='$ '
exec bash --norc --noprofile
