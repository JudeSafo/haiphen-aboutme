# Claude Code Multi-Agent Quick Reference

## Setup

### 1. Enable Multi-Agent Mode

In your Claude Code session:
```
/config
```

Then enable:
- Subagents: Yes
- Max concurrent: 4 (for M2 MacBook)

Or start Claude Code with:
```bash
claude --multi-agent
```

### 2. Create Agent Config (Optional)

Create `.claude/agents.json` for predefined agent roles:

```json
{
  "agents": {
    "AGENT_NAME": {
      "scope": ["path/to/files/**"],
      "permissions": {
        "allow": ["Read(./**)", "Edit(scope/**)"],
        "deny": ["Bash(rm -rf:*)"]
      },
      "model": "opus",
      "description": "What this agent does"
    }
  }
}
```

---

## Commands

### Agent Management

| Command | Description |
|---------|-------------|
| `/agents enable` | Enable multi-agent mode |
| `/agents disable` | Disable multi-agent mode |
| `/agents status` | Show all agent statuses |
| `/agents list` | List configured agents |

### Spawning Agents

```
@AGENT_NAME Your task description here.
Include specific requirements and constraints.
```

Or spawn ad-hoc:
```
/spawn --scope "haiphen-cli/**" Build the telemetry feature
```

### Monitoring

| Command | Description |
|---------|-------------|
| `/agents logs AGENT_NAME` | View agent output |
| `/agents progress` | Overall progress |
| `/agents errors` | Show any agent errors |

### Control

| Command | Description |
|---------|-------------|
| `/agents pause AGENT_NAME` | Pause an agent |
| `/agents resume AGENT_NAME` | Resume paused agent |
| `/agents cancel AGENT_NAME` | Stop an agent |
| `/agents cancel --all` | Stop all agents |

### Rollback

| Command | Description |
|---------|-------------|
| `/agents rollback AGENT_NAME` | Undo agent's changes |
| `/agents rollback --all` | Undo all agent changes |
| `/agents checkpoint` | Create manual checkpoint |
| `/agents restore CHECKPOINT_ID` | Restore to checkpoint |

---

## Best Practices

### 1. Scope Isolation
Each agent should have non-overlapping file scopes to avoid conflicts:
```
AGENT_CLI:     haiphen-cli/**
AGENT_WEBAPP:  docs/**, haiphen-api/**
AGENT_MOBILE:  haiphen-mobile/**
```

### 2. Sequential Then Parallel
Do foundation work (DB migrations, shared code) sequentially first.
Then parallelize independent service development.

### 3. Checkpoint Before Parallelizing
```bash
git add -A && git commit -m "Checkpoint before parallel agent work"
```

### 4. Review Agent Output
Before merging agent work:
```
/agents diff AGENT_NAME  # See what agent changed
```

### 5. Limit Concurrency
On M2 MacBook, 4 concurrent agents is reasonable.
More can cause memory pressure and slower responses.

---

## Troubleshooting

### Agent Stuck
```
/agents status AGENT_NAME
/agents logs AGENT_NAME --tail 50
/agents cancel AGENT_NAME
```

### Conflicting Changes
```
/agents diff --conflicts
/agents resolve AGENT_A AGENT_B  # Interactive resolution
```

### Out of Memory
```
/agents pause --all
# Wait for memory to free
/agents resume AGENT_NAME  # Resume one at a time
```

### Agent Went Off-Script
```
/agents rollback AGENT_NAME
# Re-prompt with more specific instructions
```

---

## Example Session

```bash
# Start Claude Code
cd /Users/jks142857/Desktop/haiphen-aboutme
claude

# In Claude Code:
/agents enable

# Check configured agents
/agents list

# Start with foundation work (you, not an agent)
Create the D1 migration for service_subscriptions...

# After foundation is committed, spawn parallel agents
@AGENT_CLI Implement telemetry dashboard in haiphen-cli
@AGENT_WEBAPP Update services grid in docs/components/services/

# Monitor progress
/agents status

# When agents finish, review
/agents diff AGENT_CLI
/agents diff AGENT_WEBAPP

# If good, commit
git add -A && git commit -m "[Phase 3] Services catalogue MVP"
```

---

## Integration with Git

### Before Agent Work
```bash
git checkout -b feature/multi-agent-services
git add -A && git commit -m "Checkpoint before agent work"
```

### After Agent Work
```bash
# Review all changes
git diff HEAD~1

# If problems, reset
git reset --hard HEAD~1

# If good, continue
git add -A && git commit -m "Agent work: description"
```

### Merge Strategy
```bash
# Squash agent work into clean commits
git checkout main
git merge --squash feature/multi-agent-services
git commit -m "[Phase 3] Services catalogue complete"
```
