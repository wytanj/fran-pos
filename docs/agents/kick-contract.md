# Kick contract

Draft for fran-pos. A kicked session reads this before it finishes.

## Class

A kicked session does class A work only. That is code, tests, drafts, and a push of `loop/<slug>`. The session does not merge, deploy, or apply migrations.

## What you owe

Stay in the worktree the kick created. Do not create another worktree. Do not edit the main checkout.

Push `loop/<slug>`.

If `gh` is not authenticated, leave the pull request title and body in `docs/agents/<slug>-pr.md`. The outer loop opens the draft.

If the kick named a brief and the pull request finishes that item, delete the brief in the same pull request.

When `DONE_WEBHOOK_URL` and `DONE_WEBHOOK_KEY` are set, POST the done payload from `agent-home/done-webhook.md`. Send `Authorization: Bearer <key>` and `X-Automation-Key: <key>`.

## Default branch

The default branch is `master`. The remote is `https://github.com/wytanj/fran-pos.git`.

## Staged for the outer loop

Class B. No production read is waiting on expiry-wire.

Class C. After the pull request is green, the outer loop opens it, merges it to `master`, and deploys.

```
gh pr create --repo wytanj/fran-pos --base master --head loop/expiry-wire --draft --title "feat(pos): wire lot expiry onto stock transfers" --body-file docs/agents/expiry-wire-pr.md
```

Then, only when checks are green:

```
gh pr ready --repo wytanj/fran-pos <number>
gh pr merge --repo wytanj/fran-pos <number>
vercel --prod
```

Class D. Do not run `npm run db:migrate`. This change has no SQL file.
