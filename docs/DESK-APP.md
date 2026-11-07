# The board and the desk app

The board the team works from lives in Switch: the scout's **Crypto
inventory** document in `desk-intake`, which only the scout can edit, and the
board line it posts after every change
(`Shipped 0/6 · Accepted risk 0 · In progress 1 · Open 5`).

The **desk app** is the cross-check, with the same numbers read straight from
git, so anyone can confirm the chat matches the code.
[A snapshot of it is hosted here.](https://dakshhhhh-ops.github.io/fliptheswitch/)
It has five pages in the URL hash (`#/`, `#/scan`, `#/run`, `#/verify`,
`#/inventory`; see `web/src/lib/route.js`), and old section links such as
`#break` open the page that holds them.

```sh
npm run web        # installs, builds and serves it on http://127.0.0.1:4317
npm run web:dev    # the same, with hot reload on http://localhost:5173
npm run board      # the same status as a single board.html
```

It's a React front end on a small Node API (`web/server/index.mjs`) that
reads the agents' git origin, and it updates live when the agents push or
merge. A finding is **shipped** when a `Ship F<n>:` merge is on main, an
**accepted risk** when `ACCEPTED-RISKS.md` on main names it, and **in review**
when a `pqc/f<n>-…` branch exists. It opens on **Flip the switch**: five moments from live runs 1 and 3 (the engineer asking for an approval and a ship, a second agent claiming the reviewer role, the migrator editing the board, the lead's ship). With Switch on, each outcome is Switch's recorded reply, linked to the log; switched off, the same message meets no rules, shown as a labelled what-if. Next is **Scan your code**: `tools/cbom-scan.mjs` and `tools/mosca.mjs` bundled into the page (their Node-only CLI imports are shimmed in `web/vite.config.js`), run on whatever the visitor pastes, with nothing uploaded. It also has the CBOM inventory before and
after, with each asset's NIST quantum security level, and the timeline of
everything merged to main.

## Hosting it

`npm run export` writes a static snapshot (the page, `api/desk.json`, a
freshly sealed specimen and `cbom.json`) to `web/dist-static/`, with relative
paths so it works on any static host or under a GitHub Pages subpath. The
page says it's a snapshot and when it was taken.

```sh
npm run export
npx vercel deploy web/dist-static --prod          # or
npx gh-pages -d web/dist-static --dotfiles        # then Settings → Pages → gh-pages
```

CI builds and exports it on every push.
