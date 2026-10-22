---
max_turns: 30
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
---

Review: useNotesState is defined as const useNotesState = () => ({ ...useNotesList(), ...useNotesFilter() })

Context: TypeScript React file containing the wrapper and two components using it. If the context is missing, create a minimal stand-in in the working directory before acting.
