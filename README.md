# Jewish Piano Archive

A searchable index of solo piano music by composers of Jewish birth or descent (plus a few non-Jewish composers with a documented Jewish connection), born c.1790–1920.

Live site: https://josebowen.github.io/JewishPiano/

## What's here

- `index.html`, `app.js`, `styles.css` — a static single-page app with no build step. GitHub Pages serves it as is.
- `data/composers.json` — composers with at least one located solo piano work (`composers`), and composers with a sourced Jewish connection but no located work (`leads`). Each composer carries the sources for its Jewish-connection attribution.
- `data/works.json` — one row per work record (`c` = Wikidata ID of the composer).
- `data/meta.json` — build date and counts.

## Method (short version)

Candidates came from Wikidata, Wikipedia categories and lists in several languages, LexM (Universität Hamburg), Jewish encyclopedias, Holocaust victim databases, and the IMSLP user list “Jewish composers at IMSLP”.

A composer is included only if one primary source, or two independent supporting sources, state the Jewish connection.

Works come from:

- IMSLP work pages (solo piano instrumentation or tags)
- LexM work lists
- the Domestic Piano Repertoire catalogue database (original works only)
- Wikidata
- Women at the Keys
- Wikipedia work lists
- a few curated sources (IEMJ, Levande musikarv)

Nothing is estimated. Keys and durations appear only when IMSLP states them.

The About & Sources tab on the site has the full method and its limits. To report a correction, open an issue.
