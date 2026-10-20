# Betrayal Night

Optional `mafia_recruitment` room rule, disabled by default and in Kids mode. The living Mafia boss may commit one recruitment attempt per match on an enabled Mafia kill night, before submitting an assassination target. It replaces the entire faction kill even when it fails. The attempt survives leader changes and resets with a new match.

The boss selects a living non-Mafia player. Only an ordinary, unjailed citizen receives an anonymous private offer. They have 30 seconds to accept or decline; no reply counts as refusal. The fixed response window also applies to ineligible targets so readiness does not disclose their role. Pausing the game pauses this window. Bots may accept or decline an offer.

Acceptance is resolved at dawn, after attacks and before investigations and the revealer count. The target must survive and remain eligible; the recruiting boss must not be blocked. The new member wins with Mafia and can access its team and chat. Other role attacks continue normally. The normal Mafia parity victory check runs after conversion.

Everyone sees a generic recruitment-attempt announcement at dawn. Mafia sees whether the target joined, without a failure reason. Target, boss and detailed outcome are revealed publicly only when the match ends.

Recruitment and replies use the existing atomic transition RPC. No schema migration is required. Test with `node --test tests/recruitment.test.mjs tests/recruitment-client.test.mjs tests/closing-replies.test.mjs tests/client-replies.test.mjs`.
