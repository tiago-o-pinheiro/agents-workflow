---
max_turns: 30
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit]
---

Review: useCartState is defined as const useCartState = () => ({ ...useCartItems(), ...useCartTotal() })

Context: TypeScript React file containing the wrapper and two components using it. If the context is missing, create a minimal stand-in in the working directory before acting.
