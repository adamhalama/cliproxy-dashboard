# Claude usage detail addendum

Use the existing Lenovo console vocabulary for a private subscription operations dashboard. The task is to read Claude's reported limits and spending without mistaking a saved observation for current usage.

## Tokens

- Canvas `#131410`, panel `#1c1e17`, separators `#30332a`, text `#edeee6`, secondary text `#a0a494`, observed-use accent `#b8c799`.
- Keep the existing system sans family. Use 12px row names and values, 11px supporting text, and tabular figures for percentages and dollars.
- Reuse console green, amber, and red only for capacity warnings; usage bars use the quiet observed-use accent and explicit text.

## Layout

Keep the account and remaining-capacity row. Attach a left-aligned detail section below each Claude account, spanning its ledger width. Compare two compact columns of reported windows on desktop; use one column on mobile. Extra usage occupies a concluding ruled row rather than another card.

```
Claude account      Weekly remaining    5-hour remaining    Reconnect
  Claude usage                              Checked [time]
  Five-hour usage    [used bar]    Weekly usage     [used bar]
  Model limit        [used bar]    Credit pool      [$ values]
  Extra usage        Enabled / Disabled     Spent / monthly limit
```

An alternate repeated-card layout would add weight and waste space beside the existing dense ledger. Choose shared rules and a restrained inset surface so the account relationship remains visible. The existing remaining bars and new used bars must name their meaning in both visible and accessible text.

## Review before implementation

The reference already establishes a muted olive console; retain its color and typography rather than inventing a Claude-branded visual theme. The distinctive element is the account-linked ledger containing actual provider windows, including model limits and dollar pools. No decorative statistics, synthetic zero values, inferred monetary caps, or claims of live data. Missing detail has a direct explanation. Aged observations and passed resets remain explicitly marked. Use only the supplied server contract and preserve existing routes and authentication.
