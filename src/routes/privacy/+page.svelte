<script lang="ts">
  import Logo from '$lib/ui/Logo.svelte';
</script>

<svelte:head>
  <title>Privacy Policy | brainIMATE</title>
  <meta name="description" content="brainIMATE privacy policy. Your drawings and animations stay in your browser, nothing is uploaded to any server." />
  <link rel="canonical" href="https://anima.swimmingbrain.dev/privacy" />
  <meta property="og:title" content="Privacy Policy | brainIMATE" />
  <meta property="og:url" content="https://anima.swimmingbrain.dev/privacy" />
</svelte:head>

<div class="legal">
  <nav class="nav">
    <div class="nav-inner">
      <a href="/" class="logo" data-sveltekit-reload>
        <span class="logo-mark"><Logo size={24} /></span>
        <span class="logo-name">brainIMATE</span>
      </a>
    </div>
  </nav>

  <div class="content">
    <h1>Privacy Policy</h1>
    <p class="updated">Last updated: October 2026</p>

    <h2>Overview</h2>
    <p>
      brainIMATE is a browser-based app for vector drawing and 2D animation. Your documents, pictures and fonts
      are kept in your browser on your device. We do not collect, store, or transmit your work or personal data
      to any server.
    </p>

    <h2>Files</h2>
    <p>
      SVG files, pictures, fonts and <code>.brainimate</code> files reach the app through a file picker or by
      drag and drop. They are read right in the tab. No file data is uploaded to external servers.
    </p>
    <p>
      Exports are made in the tab as well. A PNG, SVG, GIF, video or <code>.brainimate</code> file is written to
      the place you pick, or downloaded the usual way in browsers without a save dialog.
    </p>

    <h2>Data Storage</h2>
    <p>
      brainIMATE uses your browser's own storage and nothing else. None of it leaves your browser, and all of it
      can be cleared at any time through your browser settings. This is everything the app writes:
    </p>
    <p>
      <strong>localStorage</strong> holds your settings under one key, <code>brainimate-preferences</code>: the
      toolbar, grid, snapping, drawing and timeline defaults, the panel sizes and the workspace.
    </p>
    <p>
      <strong>IndexedDB</strong> holds the autosaved copy of the open document, so it can be restored after a
      crash, and the list of recent files.
    </p>
    <p>
      <strong>Cache Storage</strong> holds the app itself, so it works offline: the files of the build you
      loaded, the last good copy of everything else from this site, and the fonts once they have been loaded.
    </p>

    <h2>Analytics</h2>
    <p>
      We do not use tracking scripts, analytics services, or advertising networks.
    </p>

    <h2>Third-Party Services</h2>
    <p>
      <strong>Fonts.</strong> The interface loads its fonts from Google Fonts (fonts.googleapis.com and
      fonts.gstatic.com) when the page loads. Google's privacy policy applies to that request. The font files
      are kept in Cache Storage after the first visit. This request never carries your work.
    </p>
    <p>
      <strong>Hosting.</strong> The site is served by GitHub Pages. Like any web server, GitHub receives the
      usual request data when your browser loads the app, such as your IP address and browser, and GitHub's
      privacy statement applies. While a tab is open, the app asks the same server about once a minute whether a
      new version has been published. Nothing about you or your work goes with it.
    </p>
    <p>
      That is the complete list. There is no backend, no account, no error reporting and no upload. Once the
      page has loaded, the app works with the network switched off.
    </p>

    <h2>Cookies</h2>
    <p>
      brainIMATE does not use cookies, and there is no account to sign in to. The settings listed above are
      stored in localStorage.
    </p>

    <h2>Changes</h2>
    <p>
      We may update this policy from time to time. Changes will be reflected on this page with an updated date.
    </p>

    <h2>Contact</h2>
    <p>
      For questions about this policy, contact us via
      <a href="https://github.com/swimmingbrain/brainimate" target="_blank" rel="noopener">GitHub</a>.
    </p>
  </div>

  <footer class="footer">
    <a href="/" data-sveltekit-reload>&larr; Back to brainIMATE</a>
  </footer>
</div>

<style>
  /* the app shell pins html and body to the viewport and hides the overflow.
     the legal pages are documents, so they hand the scrolling back. the two
     selectors are deliberately heavier than app.css's plain `html, body`,
     because which of the two stylesheets loads last is not fixed */
  :global(html:root), :global(html body) {
    height: auto;
    overflow: auto;
  }

  .legal {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-deep);
  }

  .nav {
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
  }

  .nav-inner {
    max-width: 720px;
    margin: 0 auto;
    padding: 0 32px;
    height: 48px;
    display: flex;
    align-items: center;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
  }

  .logo-mark {
    display: flex;
    align-items: center;
    color: var(--accent);
  }

  .logo-name {
    font-family: var(--font-brand);
    font-style: italic;
    font-size: 18px;
    color: var(--text-primary);
  }

  .content {
    flex: 1;
    max-width: 720px;
    margin: 0 auto;
    padding: 48px 32px;
    width: 100%;
  }

  h1 {
    font-size: 28px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 4px;
  }

  .updated {
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--font-editor);
    margin-bottom: 32px;
  }

  h2 {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 24px 0 8px;
  }

  p {
    font-size: 14px;
    line-height: 1.7;
    color: var(--text-secondary);
  }

  /* only the headings space the sections, so paragraphs need their own gap */
  p + p {
    margin-top: 12px;
  }

  p a {
    color: var(--accent);
    text-decoration: none;
  }

  p a:hover {
    color: var(--accent-hover);
  }

  /* the storage keys are named exactly, so they are set in the mono face */
  p :global(code) {
    font-family: var(--font-editor);
    font-size: 12px;
    color: var(--text-primary);
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 1px 5px;
    white-space: nowrap;
  }

  .footer {
    border-top: 1px solid var(--border);
    padding: 16px 32px;
    max-width: 720px;
    margin: 0 auto;
    width: 100%;
  }

  .footer a {
    font-size: 12px;
    font-family: var(--font-editor);
    color: var(--text-muted);
    text-decoration: none;
  }

  .footer a:hover {
    color: var(--accent);
  }
</style>
