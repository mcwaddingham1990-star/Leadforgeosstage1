# Instructions for Claude

## Git workflow — ALWAYS, no asking

- The working branch is **`PUSH-TO-HERE-ALWAYS`**. All finished work ends up there.
- When the owner asks for a change, doing the change **includes** committing it,
  merging it into `PUSH-TO-HERE-ALWAYS`, and pushing `PUSH-TO-HERE-ALWAYS` to origin.
- Never ask "do you want me to push/merge this?" — just do it. One step for the owner, not two.
- Do not push to `main` unless explicitly told to.
- If a session is assigned its own `claude/...` branch, commit there too, then merge
  that branch into `PUSH-TO-HERE-ALWAYS` and push both.

See `DEVELOPMENT_STANDARDS.md` for product/code standards.
