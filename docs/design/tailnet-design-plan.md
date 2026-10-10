# Lenovo proxy console

Reference: the supplied CPAMC screenshots. Preserve the useful dense quota ledger, warm dark surfaces, quiet sidebar, grouped provider tabs, and green/amber/red remaining-capacity bars. This is a private operational console for subscriptions on the Lenovo server.

## Tokens

- Canvas `#131410`; sidebar `#1c1d17`; raised surface `#20211a`.
- Fine rules `#33352c`; primary text `#eeeee6`; secondary text `#a3a598`.
- Capacity green `#2cc69a`, amber `#e5c369`, danger `#e48479`.
- Typography: system sans with intentional compact hierarchy, 13px supporting labels, 14px ledger, 28px page titles. Tabular figures for quota, no decorative monospaced labels.
- Surfaces have 8–12px radii, while the shared quota ledger uses horizontal separators and no repeated card wrappers.

## Layout

All working content is left aligned. Fixed 224px sidebar, a quiet 68px top bar, then an expansive quota workspace with a maximum readable width. The first view is remaining capacity and reset timing, directly serving the task in the reference.

```
Console       | Lenovo / Quota management                  Private tailnet
              | Quota management                       Refresh snapshot
Overview      | Snapshot age and source
Quota         | All  ·  Codex  ·  Claude
Accounts      | [ Codex aggregate capacity | Claude observed 5h capacity ]
Routing       | Search accounts                     Sort by reset
Connection    | Codex   account / weekly / 5 hour / priority / edit
              | ----------------------------------------------------
Lenovo status | Claude  account / weekly — / 5 hour / priority / edit
```

On mobile, the sidebar becomes an explicit collapsible navigation region and each ledger row reflows into account identity and two quota columns. Dialogs use native keyboard semantics, close on Escape, and return focus to their trigger.

## Review against brief

The reference explicitly asks for near-black/olive dashboard chrome, so this palette is retained rather than replaced with an unrelated aesthetic. Avoid generic chart cards and fabricated analytics: quota bars are the primary visual because they answer the actual remaining-budget question. The memorable detail is the shared provider capacity panel and precisely aligned ledger. Do not show a “currently draining” account because the cache does not establish that fact. State the snapshot source, stale windows, blocked authentication, and unavailable Claude weekly data plainly. Routing is the configured policy and an estimate, never invented execution telemetry.
