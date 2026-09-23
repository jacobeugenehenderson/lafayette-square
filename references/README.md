# References — the kit's external standards and manuals

**Started 2026-09-23 at Jacob's request:** *"we will use them and as we expand they will continue to be germane."* The kit pours towns in **MO, OH, CA and MA** today. A highway is built to **its state's** design manual, so the kit's section values should come from the manual of the state the road is in, never from one national table.

**The registry is `registry.json`**: one entry per source, with its publisher, jurisdiction, URL, what it covers, and its **terms**. This file holds only the rules.

## The rules

1. **⛔ No agent reads a source until its `terms.aiUse` is `permitted`.** Someone checks the publisher's terms first, and records the date, the reviewer and a quote. `unchecked` means **do not read**.
   - The rule exists because of AASHTO's Green Book, which forbids *"the entry of AASHTO content into any AI tool"* (checked by Jacob, 2026-09-23).
2. **Cite the source the kit actually used.** A value drawn from a manual carries that source's `id` into the pour output. A value no one has cited is marked **[U]** and must never be presented as cited.
3. **Local copies stay out of git.** They go under `references/files/`, which is gitignored. The registry records the URL, the edition and where the local copy lives.
4. **Every entry declares a jurisdiction.** When a town is added, check that its state has a manual here.

## Status

Read `registry.json`. As of creation: the Green Book is **prohibited**, and the FHWA, MoDOT, ODOT, Caltrans and MassDOT entries are **candidates with unchecked terms**.
