---
max_turns: 30
allowed_tools: [Read, Glob, Grep, Skill, Bash, Write, Edit, Agent]
---

/capitan:start acme single vite fastify zod --defaults

Context: empty directory. If the context is missing, create a minimal stand-in in the working directory before acting.
