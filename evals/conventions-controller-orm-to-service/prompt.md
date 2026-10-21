---
max_turns: 30
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
---

Review this controller: the route handler calls prisma.user.findMany directly

Context: backend controller file with an ORM call in the handler. If the context is missing, create a minimal stand-in in the working directory before acting.
