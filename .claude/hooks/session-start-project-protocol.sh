#!/bin/bash
cat << 'EOF'
---
name: project-protocol
description: Project documentation protocol
---

# Project Documentation Protocol

## Session Start - Read These Files:
1. `docs/FOCUS.md` - Current focus
2. `.claude/progress.json` - Project phase
3. `.claude/features.json` - Feature status

## Rules:
- Only ONE feature "in_progress" at a time
- Update features.json when completing work
- Log discoveries in docs/LEARNINGS.md
EOF
exit 0
