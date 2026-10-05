# Security

Everything in brainIMATE runs in your browser. No server of mine sees your drawings. Nothing is uploaded. One request goes to another server and that is the whole list: the fonts, from Google Fonts as the page loads. It never carries your work. The site itself is served by GitHub Pages, and an open tab asks it about once a minute whether a new version is out. There is no backend, no API, no account, no telemetry and no error reporting.

SVG files, pictures and fonts are read in the tab, and a `.brainimate` file is parsed as json, unzipped with fflate first when it is compressed. An imported SVG is turned into paths, its scripts and links are never run. Exports are encoded in the tab too. There are no shell commands, no `exec`, nothing that runs outside the tab.

## What stays on your machine

Everything the app keeps is in your browser's storage for this origin, and clearing the site's data removes all of it:

- **localStorage**: one key of settings, `brainimate-preferences`.
- **IndexedDB**: the last five autosaved copies of the open document and the list of recent files.
- **Cache Storage**: the app's own files so it works offline, and the fonts once they have been loaded.

A file you open is read once. Where the browser supports it, the app keeps the file handle so that save writes back to the same file.

## Reporting

If you find a security problem, please don't open a public issue. Use the private vulnerability reporting under the Security tab of this repository and I'll get back to you as soon as I can.
