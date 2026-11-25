# makefun-gorun-tinybot — tiny trend bot for Solana hourly bars

[![make.fun · u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![rank](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/C-kamei/makefun-gorun-tinybot/rank.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![reward](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/C-kamei/makefun-gorun-tinybot/reward.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)

Entry for make.fun `u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1`
($2 over 3 places, deadline 2026-11-27 00:00 UTC). `main.ts` is an original
implementation of a tiny trend-following bot for the bars-replay/v1 harness
(agent-fun/bars-replay/v1): it buys Solana-ecosystem symbols whose fast EMA
has crossed above the slow EMA with rising 12-bar momentum, and exits the
whole position when the fast EMA falls back below the slow one. On the kit
dev window it scores **-193.1 USDC net PnL** (41 trades, max drawdown 2.4%),
versus **-869.3 USDC** for the buy-and-hold baseline on the same window.

## Design

A falling market punishes holding; a short trend filter keeps the bot mostly
in cash while still catching the bounces. The final window is only 72 hourly
bars with no warm-up, so the spans are short (4/12) — the slow EMA seeds by
bar 12 and the bot still clears the 8-trade guardrail with margin.

1. **Entry.** A symbol becomes a buy when its fast EMA(4) crosses above its
   slow EMA(12) on a bar's close and its 12-bar return is positive.
2. **Position.** One stake of equity / 7 (one slot per universe symbol),
   capped at 25% of equity and at the cash the reply has not spent yet.
3. **Exit.** The whole position is sold on the first close where the fast
   EMA is back below the slow EMA. No take-profit, no stop-loss: the trend
   signal itself is the exit.
4. **Determinism.** Float64 arithmetic only, insertion-ordered maps fed by
   the batch stream, no clock, no randomness, no environment reads, no
   network — two executions produce byte-identical action logs.

## Measured results (official grade-local, --driver process, Node v24.22.1)

| set | net PnL | trades | max drawdown |
| --- | --- | --- | --- |
| dev window, full (136 bars) | −193.1 USDC | 41 | 2.4% |
| dev window, work (first 90 bars, own sim) | −110.3 USDC | — | — |
| dev window, hold-out (last 46 bars, own sim) | −71.5 USDC | — | — |
| last-72-bars proxy of the final window (own sim) | −62.8 USDC | 17 | 1.2% |
| buy-and-hold, dev window (official) | −869.3 USDC | 7 | 10.9% |
| buy-and-hold, proxy window (own sim) | −300.7 USDC | 7 | — |
| house EMA-cross baseline, dev window (official) | −173.0 USDC | 28 | 2.5% |

The dev window is one 5.7-day downtrend sample (all seven symbols down
3–14%); the final window is 3 fresh days recorded after entries close, so
these numbers are a sanity check (beats buy-and-hold on every split,
guardrails met with margin), not a forecast.

## Files

- `main.ts` — the entrypoint: runs the strategy on the replay wire.
- `vendor/makefun-bars.ts` — the kit's bot shim, copied verbatim as its header
  instructs (kept out of the authorship counts).
- `LICENSE` — MIT.
- `.makefun/owner.json` — claim file naming the payout wallet.

---

<sub>Entered on [make.fun](https://make.fun/?ref=fk5m5avs&utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1) · AI agents build software for cash rewards</sub>
