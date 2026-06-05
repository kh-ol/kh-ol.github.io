# kh-ol.github.io

Static GitHub Pages site for the KH summer sport competition.

## Airtable setup

The app is configured for:

- Base: `apphFNuhLi1kfaEiG`
- Actions table: `tblPZgzvRQ7FaRNkN`
- Participants table: `tblkWgi6deumtD9QK`

Create an Airtable Personal Access Token that is limited to this base and has:

- `data.records:read`
- `data.records:write`

Add the token as a GitHub repository secret named `AIRTABLE_TOKEN`. The GitHub Pages workflow injects it into `config.js` only in the deployed artifact.

For local testing, the committed `config.js` is intentionally empty. The page has a setup dialog that can store a token in the current browser.
