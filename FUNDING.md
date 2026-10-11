# Buy me some tokens

Shota is free. Not free-for-now, not free-with-a-Pro-tier-coming ~ free. It's MIT
licensed, the whole source is right here, and there is no account to make, nothing to
upgrade to, and nothing phoning home.

So this page is the optional bit.

## Why tokens and not coffee

The traditional ask is a coffee. But Shota was built with a great deal of AI assistance,
and that assistance is metered in tokens, so the honest unit of support is tokens.

Every arrow you drag, every API key you blur, every one of the fifteen languages in the
settings dropdown ~ all of it got argued over with a language model that bills per
million tokens. Some of those arguments were long. A few of them were me being wrong
about how `box-shadow` interacts with element screenshots for an embarrassing number of
attempts.

If that bothers you, fair enough ~ the code is public and you can judge it on its
merits rather than its provenance. If it doesn't, and you'd like there to be more of
it, the button below converts fairly directly into more of it.

## What the money actually buys

Not a salary. Specific, boring, verifiable things:

**A code-signing certificate.** This is the big one. Right now, anyone downloading the
installer from GitHub gets a full-screen Windows SmartScreen warning telling them the
app is from an unrecognised publisher. That's not a bug we can fix in code ~ it needs a
certificate from a certificate authority, which costs real money every year. It is
currently the single worst thing about installing Shota.

**Tokens.** See above.

**The occasional thing that costs money to test.** Multi-monitor bugs, DPI scaling
oddities, and Windows versions I don't own have a habit of being the ones that break.

That's the whole list. If it ever gets longer, it'll say so here.

## Free ways to help, which are genuinely useful

No money required, and some of these are worth more than the money:

**Tell me the translations are wrong.** Shota speaks fifteen languages. I speak rather
fewer than fifteen. The French has been checked by a human; the other thirteen
translations have not. If a tool name reads strangely in your language,
[say so](https://github.com/JulienHe/shota/issues) ~ the strings are plain JSON in
[`locales/`](locales/), so a fix is a three-line pull request.

**Report the weird bugs.** Especially anything involving multiple monitors, mixed DPI
scaling, or an overlay that appears with nothing in it. Those are the hard ones, and
they're hard precisely because they don't reproduce on my machine.

**Star the repo.** It costs nothing and it's how anyone finds anything.

**Tell someone.** Particularly anyone currently emailing screenshots of production
dashboards around with the credentials still visible.

## The small print

No ads, ever. No telemetry, ever. No "Shota Pro". If that changes ~ it won't ~ it'll
change in public, in this file, in a commit you can read.

---

*Shota is a screenshot and annotation tool for Windows. If you got here without the app,
it's [right here](https://github.com/JulienHe/shota).*
