# Kick contract

A kicked session on fran-pos owes the outer loop the items in this file. The session does class A work. It writes class B, class C, and class D commands in the session report and does not run them.

## Worktree

Stay in the worktree the kick created. Do not create another worktree. Do not change the owner's main checkout.

## Pull request

Push `loop/<slug>`. Open a draft pull request when `gh` is authenticated. When `gh` is not authenticated, push the branch and leave the title and the body in the session report.

The title uses Conventional Commits. The body uses these sections, in order, and drops a section that has nothing to say.

- Why
- Scope
- Tradeoffs
- Blast radius
- Verification

If the pull request finishes its brief, delete that brief in the same pull request.

## Done webhook

When `%USERPROFILE%\.config\agent-loop\done-webhook.env` exists, POST JSON to `DONE_WEBHOOK_URL`. Send `Authorization: Bearer <DONE_WEBHOOK_KEY>` and `X-Automation-Key: <DONE_WEBHOOK_KEY>`.

```json
{
  "event": "session_done",
  "repo": "fran-pos",
  "slug": "<slug>",
  "session": "grok-<slug>",
  "status": "ok",
  "summary": "<one or two sentences>",
  "pr_url": "<url or empty string>",
  "class_c_ready": false
}
```

Do not commit the webhook key. Do not paste the key in the report.

## Class handoff

Class A is the session. It includes code, tests, docs, and the push.

Class B is a production read. The outer loop runs it.

Class C is a green merge into the default branch, then `vercel --prod` where that deploy already applies. The outer loop runs it. `class_c_ready` stays false until the pull request checks are green.

Class D is a migration, a data fix, or any change that touches money, customers, or secrets. The outer loop dry-runs it and waits for JT to say yes in his own words.
