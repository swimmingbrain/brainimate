<script lang="ts">
  import { base } from '$app/paths';
  import Logo from '$lib/ui/Logo.svelte';

  const features = [
    { title: 'Vector drawing', text: 'Pen, pencil, brush and shapes. Every line stays a curve you can bend and edit later.' },
    { title: 'A real timeline', text: 'Keyframes, tweens with easing, onion skin and layers, frame by frame or in between.' },
    { title: 'Bones and poses', text: 'Rig a character with bones, bind the drawing and pose it by dragging a hand or a foot.' },
    { title: 'Symbols', text: 'Draw a part once, reuse it as a symbol and change every copy in one place.' },
    { title: 'Export', text: 'PNG, SVG, GIF, WebM and MP4, image sequences and sprite sheets for games.' },
    { title: 'Stays on your machine', text: 'No account and no upload. The app works offline once it has loaded.' },
    { title: 'Made your way', text: 'Reorder the toolbar, save brush presets, change any key and keep your own workspaces.' },
    { title: 'Fast with a lot on stage', text: 'Hundreds of shapes stay smooth to drag and scrub, layers you are not touching are kept ready.' },
    { title: 'Open source', text: 'MIT licensed, on GitHub. Read how it works, file a problem or send a fix.' }
  ];

  const steps = [
    { title: 'Draw', text: 'Brush, pencil or pen on a stage of any size. Every shape stays a curve you can bend later.' },
    { title: 'Key it', text: 'Go to a later frame and press F6, then change the drawing there. Each keyframe holds a pose.' },
    { title: 'Tween or rig', text: 'Let a tween fill the frames in between, or give a character bones and drag it into poses.' },
    { title: 'Export', text: 'Save a GIF, a video, PNG frames, SVG or a sprite sheet, right from the browser.' }
  ];
</script>

<svelte:head>
  <title>brainIMATE | Vector Drawing and 2D Animation in Your Browser</title>
  <meta name="description" content="Draw vector art and animate it on a timeline, right in your browser. Bones, tweens, onion skin, GIF and video export. No account, nothing uploaded." />
  <link rel="canonical" href="https://anima.swimmingbrain.dev/" />
  <meta property="og:title" content="brainIMATE | Vector Drawing and 2D Animation in Your Browser" />
  <meta property="og:description" content="Draw vector art and animate it on a timeline, right in your browser. No account, nothing uploaded." />
  <meta property="og:url" content="https://anima.swimmingbrain.dev/" />
  <meta name="twitter:title" content="brainIMATE | Vector Drawing and 2D Animation in Your Browser" />
  <meta name="twitter:description" content="Draw vector art and animate it on a timeline, right in your browser. No account, nothing uploaded." />
  {@html `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'brainIMATE',
    url: 'https://anima.swimmingbrain.dev',
    applicationCategory: 'DesignApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description: 'Vector drawing and 2D animation in the browser. Draw, animate on a timeline, rig with bones, export to GIF, video or SVG.',
    author: { '@type': 'Person', name: 'Braian Plaku', url: 'https://swimmingbrain.dev' },
    license: 'https://opensource.org/licenses/MIT'
  })}<\/script>`}
</svelte:head>

<div class="landing">
  <nav class="nav">
    <div class="nav-inner">
      <a href="{base}/" class="logo">
        <span class="logo-mark"><Logo size={24} /></span>
        <span class="logo-name">brainIMATE</span>
      </a>
      <div class="nav-actions">
        <a href="https://github.com/swimmingbrain/brainimate" target="_blank" rel="noopener" class="github-link" title="GitHub">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        </a>
        <a href="{base}/editor" class="nav-cta">Open the editor</a>
      </div>
    </div>
  </nav>

  <div class="content">
    <div class="split">
      <div class="left">
        <h1 class="hero-title">
          Draw it.<br />
          <span class="hero-accent">Then make it move.</span>
        </h1>
        <p class="hero-desc">
          Vector drawing and 2D animation in your browser, for illustrators and for people who never animated
          before. Nothing to install, nothing uploaded.
        </p>
        <a href="{base}/editor" class="hero-cta">
          Open the editor
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>
        <div class="feature-pills">
          <span class="pill">vector tools</span>
          <span class="pill">timeline &amp; tweens</span>
          <span class="pill">onion skin</span>
          <span class="pill">bones &amp; ik</span>
          <span class="pill">gif &amp; video export</span>
          <span class="pill">works offline</span>
        </div>
      </div>

      <div class="right">
        <div class="demo-window" aria-hidden="true">
          <div class="demo-bar">
            <div class="demo-dots">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
            <span class="demo-filename">bounce.brainimate</span>
            <div style="flex:1"></div>
            <span class="demo-label">frame 13</span>
          </div>
          <div class="demo-content">
            <div class="demo-stage">
              <div class="demo-artboard">
                <span class="ball ghost-1"></span>
                <span class="ball ghost-2"></span>
                <span class="ball"></span>
                <span class="ground"></span>
              </div>
            </div>
            <div class="demo-timeline">
              <div class="demo-ruler">
                {#each Array(6) as _, i}
                  <span class="tick">{i === 0 ? 1 : i * 5}</span>
                {/each}
              </div>
              <div class="demo-lane">
                <span class="lane-name">Ball</span>
                <div class="lane-track">
                  <span class="span tween" style="left: 0%; width: 40%"></span>
                  <span class="span tween" style="left: 40%; width: 40%"></span>
                  <span class="key" style="left: 0%"></span>
                  <span class="key" style="left: 40%"></span>
                  <span class="key" style="left: 80%"></span>
                </div>
              </div>
              <div class="demo-lane">
                <span class="lane-name">Floor</span>
                <div class="lane-track">
                  <span class="span hold" style="left: 0%; width: 96%"></span>
                  <span class="key" style="left: 0%"></span>
                </div>
              </div>
              <div class="demo-playhead" style="left: calc(56px + (100% - 56px) * 0.4)"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <section class="how">
    <div class="features-inner">
      <h2 class="features-heading">How it works</h2>
      <ol class="how-list">
        {#each steps as step, i (step.title)}
          <li class="how-step">
            <span class="how-num">{i + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </li>
        {/each}
      </ol>
    </div>
  </section>

  <section class="features">
    <div class="features-inner">
      <h2 class="features-heading">What it does</h2>
      <div class="features-grid">
        {#each features as feature (feature.title)}
          <div class="feature">
            <h3>{feature.title}</h3>
            <p>{feature.text}</p>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <span class="logo-mark"><Logo size={16} /></span>
        <span class="footer-name">brainIMATE</span>
      </div>
      <div class="footer-links">
        <a href="{base}/privacy">Privacy</a>
        <a href="{base}/terms">Terms</a>
        <a href="{base}/imprint">Imprint</a>
        <a href="https://github.com/swimmingbrain/brainimate" target="_blank" rel="noopener">GitHub</a>
      </div>
      <p class="footer-credit">
        made with <span class="heart">&hearts;</span> by
        <a href="https://swimmingbrain.dev" target="_blank" rel="noopener">Braian Plaku</a>
      </p>
    </div>
  </footer>
</div>

<style>
  /* the app shell pins html and body to the viewport and hides the overflow.
     the public pages are documents, so they hand the scrolling back. the two
     selectors are deliberately heavier than app.css's plain `html, body`,
     because which of the two stylesheets loads last is not fixed */
  :global(html:root), :global(html body) {
    height: auto;
    overflow: auto;
  }

  .landing {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-deep);
  }

  .nav {
    flex-shrink: 0;
    background: var(--bg-deep);
    border-bottom: 1px solid var(--border);
  }

  .nav-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 32px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
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

  .nav-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .nav-cta {
    padding: 5px 14px;
    font-size: 12px;
    font-weight: 500;
    color: #111;
    background: var(--accent);
    border-radius: var(--radius-sm);
    text-decoration: none;
    transition: background 0.15s;
  }

  .nav-cta:hover {
    background: var(--accent-hover);
    color: #111;
  }

  .content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    padding: 56px 32px;
  }

  .split {
    max-width: 1200px;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 56px;
  }

  .left {
    flex: 0 0 400px;
  }

  .hero-title {
    font-size: 42px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.03em;
    color: var(--text-primary);
    margin-bottom: 16px;
  }

  .hero-accent {
    color: var(--accent);
  }

  .hero-desc {
    font-size: 15px;
    line-height: 1.6;
    color: var(--text-secondary);
    margin-bottom: 24px;
  }

  .hero-cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 22px;
    font-size: 14px;
    font-weight: 600;
    color: #111;
    background: var(--accent);
    border-radius: var(--radius-sm);
    text-decoration: none;
    transition: background 0.15s, transform 0.1s;
  }

  .hero-cta:hover {
    background: var(--accent-hover);
    color: #111;
    transform: translateY(-1px);
  }

  .feature-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 24px;
  }

  .pill {
    font-size: 10px;
    font-weight: 500;
    font-family: var(--font-editor);
    color: var(--text-muted);
    padding: 3px 8px;
    border: 1px solid var(--border);
    background: var(--bg-surface);
    letter-spacing: 0.02em;
  }

  .right {
    flex: 1;
    min-width: 0;
  }

  .demo-window {
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }

  .demo-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 32px;
    padding: 0 12px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
  }

  .demo-dots {
    display: flex;
    gap: 5px;
  }

  .demo-dots .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border);
  }

  .demo-filename {
    font-size: 11px;
    font-family: var(--font-editor);
    color: var(--text-primary);
  }

  .demo-label {
    font-size: 10px;
    font-family: var(--font-editor);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .demo-content {
    display: flex;
    flex-direction: column;
    background: var(--bg-surface);
  }

  .demo-stage {
    padding: 22px 28px;
    background: var(--pasteboard);
  }

  /* the artboard with a ball on its way down, two onion skin ghosts behind it */
  .demo-artboard {
    position: relative;
    aspect-ratio: 16 / 8;
    background: #f4f1ec;
    box-shadow: 0 4px 24px var(--stage-shadow);
    overflow: hidden;
  }

  .ball {
    position: absolute;
    left: 62%;
    top: 60.5%;
    width: 13%;
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--accent);
  }

  .ball.ghost-1 {
    left: 18%;
    top: 30%;
    width: 7%;
    opacity: 0.3;
  }

  .ball.ghost-2 {
    left: 38%;
    top: 12%;
    width: 10%;
    opacity: 0.55;
  }

  .ground {
    position: absolute;
    left: 8%;
    right: 8%;
    bottom: 14%;
    height: 2px;
    background: #cfc8bd;
  }

  .demo-timeline {
    position: relative;
    padding: 0 0 8px;
    background: var(--bg-surface);
    border-top: 1px solid var(--border);
  }

  .demo-ruler {
    display: flex;
    align-items: center;
    height: 18px;
    padding-left: 56px;
    border-bottom: 1px solid var(--border);
  }

  .tick {
    flex: 1;
    font-family: var(--font-editor);
    font-size: 8px;
    color: var(--text-muted);
    border-left: 1px solid var(--border);
    padding-left: 3px;
    line-height: 18px;
  }

  .demo-lane {
    display: flex;
    align-items: stretch;
    height: 18px;
    margin-top: 3px;
  }

  .lane-name {
    width: 56px;
    flex-shrink: 0;
    font-size: 9px;
    color: var(--text-muted);
    line-height: 18px;
    padding-left: 8px;
  }

  .lane-track {
    position: relative;
    flex: 1;
    background: var(--bg-deep);
  }

  .span {
    position: absolute;
    top: 0;
    bottom: 0;
  }

  .span.tween {
    background: var(--tween);
    border-right: 1px solid var(--tween-edge);
  }

  .span.hold {
    background: var(--frame-hold);
    border-right: 1px solid var(--frame-hold-edge);
  }

  .key {
    position: absolute;
    top: 50%;
    width: 6px;
    height: 6px;
    margin: -3px 0 0 3px;
    border-radius: 50%;
    background: var(--keyframe);
  }

  .demo-playhead {
    position: absolute;
    top: 0;
    bottom: 8px;
    width: 1px;
    background: var(--playhead);
  }

  .demo-playhead::before {
    content: '';
    position: absolute;
    top: 0;
    left: -3px;
    border-top: 6px solid var(--playhead);
    border-left: 3.5px solid transparent;
    border-right: 3.5px solid transparent;
  }

  .features,
  .how {
    border-top: 1px solid var(--border);
    padding: 64px 32px;
  }

  .how-list {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 32px;
  }

  .how-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    margin-bottom: 12px;
    font-family: var(--font-editor);
    font-size: 12px;
    color: #111;
    background: var(--accent);
  }

  .how-step h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .how-step p {
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-secondary);
  }

  .features-inner {
    max-width: 1200px;
    margin: 0 auto;
  }

  .features-heading {
    font-size: 24px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 40px;
    letter-spacing: -0.02em;
  }

  .features-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 32px;
  }

  .feature h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .feature p {
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-secondary);
  }

  .footer {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    padding: 12px 32px;
  }

  .footer-inner {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .footer-brand {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .footer-name {
    font-family: var(--font-brand);
    font-style: italic;
    font-size: 14px;
    color: var(--text-primary);
  }

  .footer-credit {
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--font-editor);
  }

  .footer-credit a {
    color: var(--accent);
    text-decoration: none;
  }

  .footer-credit a:hover {
    color: var(--accent-hover);
  }

  .github-link {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    transition: color 0.15s;
  }

  .github-link:hover {
    color: var(--text-secondary);
  }

  .footer-links {
    display: flex;
    gap: 16px;
    font-size: 11px;
    font-family: var(--font-editor);
  }

  .footer-links a {
    color: var(--text-muted);
    text-decoration: none;
  }

  .footer-links a:hover {
    color: var(--accent);
  }

  .heart {
    color: var(--error);
    font-size: 12px;
  }

  @media (max-width: 900px) {
    .content {
      padding: 40px 20px;
    }

    .split {
      flex-direction: column;
      gap: 32px;
    }

    .left {
      flex: none;
      text-align: center;
    }

    .hero-title {
      font-size: 34px;
    }

    .hero-desc {
      font-size: 14px;
    }

    .feature-pills {
      justify-content: center;
    }

    .right {
      width: 100%;
    }

    .features,
    .how {
      padding: 48px 20px;
    }

    .features-grid,
    .how-list {
      grid-template-columns: 1fr;
      gap: 24px;
    }

    .footer {
      padding: 16px 20px;
    }
  }

  @media (max-width: 560px) {
    .footer-inner {
      flex-direction: column;
      gap: 10px;
      text-align: center;
    }
  }

  @media (max-width: 480px) {
    .hero-title {
      font-size: 28px;
    }

    .content {
      padding: 32px 16px;
    }

    .nav-inner {
      padding: 0 16px;
    }
  }
</style>
