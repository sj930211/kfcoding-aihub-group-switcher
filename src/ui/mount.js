  function mountUi() {
    if (document.getElementById(HOST_ID)) return;
    const host = document.createElement("div");
    host.id = HOST_ID;
    document.documentElement.appendChild(host);
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host {
          all: initial;
          position: fixed;
          inset: 0;
          z-index: 2147483000;
          pointer-events: none;
          color-scheme: dark;
          --canvas: rgb(10 13 16 / 18%);
          --surface: rgb(255 255 255 / 3.5%);
          --surface-raised: rgb(255 255 255 / 6.5%);
          --surface-active: rgb(255 255 255 / 11.5%);
          --line: rgb(255 255 255 / 9%);
          --line-soft: rgb(255 255 255 / 5.5%);
          --line-strong: rgb(255 255 255 / 16%);
          --text: #f5f7f8;
          --text-soft: #c5cbd1;
          --muted: #89919a;
          --accent: #5ba9ff;
          --accent-ink: #081827;
          --accent-soft: rgb(91 169 255 / 14%);
          --healthy: #58d69a;
          --healthy-soft: rgb(88 214 154 / 12%);
          --info: #79b9ff;
          --info-soft: rgb(91 169 255 / 12%);
          --warning: #f2b94b;
          --warning-soft: rgb(242 185 75 / 10%);
          --danger: #ff716f;
          --danger-soft: rgb(255 113 111 / 9%);
          --focus: rgb(91 169 255 / 34%);
          --toolbar: rgb(28 31 36 / 20%);
          --control: rgb(255 255 255 / 7%);
          --menu: rgb(22 26 31 / 82%);
          --native-option-bg: #171a1f;
          --native-option-text: #f5f7f8;
          --glass-transparency: 0%;
          --panel-glass: linear-gradient(135deg, rgb(31 37 45 / 49%), rgb(13 17 22 / 38%));
          --shadow-panel: 0 34px 90px rgb(0 0 0 / 46%), inset 1px 1px 0 rgb(255 255 255 / 24%), inset -1px -1px 0 rgb(255 255 255 / 4.5%);
          --shadow-menu: 0 16px 38px rgb(0 0 0 / 38%), inset 0 1px 0 rgb(255 255 255 / 8%);
          --dialog-backdrop: rgb(0 0 0 / 62%);
        }
        :host([data-resolved-theme="light"]) {
          color-scheme: light;
          --canvas: rgb(255 255 255 / 15%);
          --surface: rgb(255 255 255 / 28%);
          --surface-raised: rgb(255 255 255 / 46%);
          --surface-active: rgb(255 255 255 / 68%);
          --line: rgb(26 36 44 / 12%);
          --line-soft: rgb(26 36 44 / 7%);
          --line-strong: rgb(26 36 44 / 20%);
          --text: #17212a;
          --text-soft: #2e3942;
          --muted: #4f5b66;
          --accent: #1674d1;
          --accent-ink: #f7fbff;
          --accent-soft: rgb(22 116 209 / 11%);
          --healthy: #16865a;
          --healthy-soft: rgb(22 134 90 / 10%);
          --info: #1674d1;
          --info-soft: rgb(22 116 209 / 9%);
          --warning: #9a6500;
          --warning-soft: rgb(175 113 0 / 10%);
          --danger: #c63e3c;
          --danger-soft: rgb(198 62 60 / 9%);
          --focus: rgb(22 116 209 / 25%);
          --toolbar: rgb(255 255 255 / 20%);
          --control: rgb(255 255 255 / 48%);
          --menu: rgb(244 247 249 / 88%);
          --native-option-bg: #f4f7f9;
          --native-option-text: #17212a;
          --glass-transparency: 0%;
          --panel-glass: linear-gradient(135deg, rgb(255 255 255 / 62%), rgb(235 240 244 / 48%));
          --shadow-panel: 0 28px 72px rgb(31 44 54 / 22%), inset 1px 1px 0 rgb(255 255 255 / 72%), inset -1px -1px 0 rgb(255 255 255 / 18%);
          --shadow-menu: 0 14px 34px rgb(31 44 54 / 20%), inset 0 1px 0 rgb(255 255 255 / 72%);
          --dialog-backdrop: rgb(28 36 32 / 38%);
        }
        :host([data-resolved-theme="light"]) .status::before { box-shadow: inset 0 0 0 7px rgb(255 255 255 / 78%); }
        :host([data-resolved-theme="light"]) .work-nav::before { background: rgb(255 255 255 / 24%); }
        :host([data-resolved-theme="light"]) .token-list { background: rgb(255 255 255 / 34%); }
        :host([data-resolved-theme="light"]) .isolation-row { background: rgb(255 255 255 / 38%); }
        *, *::before, *::after { box-sizing: border-box; }
        button, input, select { font: inherit; letter-spacing: 0; }
        button { cursor: pointer; touch-action: manipulation; }
        .mono, .version, .token-count, .route-value, .route-best-value, .route-meta strong {
          font-family: SFMono-Regular, Consolas, "Liberation Mono", monospace;
          font-variant-numeric: tabular-nums slashed-zero;
        }
        .launcher, .panel, .manual-dialog {
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei UI", sans-serif;
          font-optical-sizing: auto;
          color: var(--text);
          pointer-events: auto;
        }
        .launcher, .panel {
          position: fixed;
          right: 16px;
          bottom: 16px;
          z-index: 2147483000;
        }
        .panel[hidden], .launcher[hidden], .token-menu[hidden] { display: none; }
        .launcher {
          width: 44px;
          height: 44px;
          padding: 0;
          border: 1px solid var(--line-strong);
          border-radius: 13px;
          background: var(--panel-glass);
          color: var(--accent);
          box-shadow: var(--shadow-panel);
          -webkit-backdrop-filter: blur(20px) saturate(170%);
          backdrop-filter: blur(20px) saturate(170%);
          font-family: SFMono-Regular, Consolas, monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0;
          cursor: grab;
          touch-action: none;
        }
        .launcher:hover { border-color: var(--accent); background: var(--surface-raised); }
        .launcher:active { cursor: grabbing; transform: scale(.96); }
        .panel {
          width: min(480px, calc(100vw - 24px));
          max-height: min(848px, calc(100vh - 24px));
          overflow: auto;
          border: 1px solid var(--line-strong);
          border-radius: 20px;
          background: var(--panel-glass);
          box-shadow: var(--shadow-panel);
          -webkit-backdrop-filter: blur(22px) saturate(175%) contrast(108%);
          backdrop-filter: blur(22px) saturate(175%) contrast(108%);
          scrollbar-color: var(--line-strong) transparent;
          scrollbar-width: thin;
          transition: width 180ms cubic-bezier(.2, .8, .2, 1), height 180ms cubic-bezier(.2, .8, .2, 1), box-shadow 160ms ease;
        }
        .panel::before {
          position: absolute;
          z-index: 8;
          inset: 0 0 auto;
          height: 92px;
          border-radius: 20px 20px 0 0;
          background: linear-gradient(180deg, rgb(255 255 255 / 9%), transparent);
          pointer-events: none;
          content: "";
        }
        .panel::after {
          position: absolute;
          z-index: 8;
          inset: 16px auto 16px 0;
          width: 1px;
          background: linear-gradient(180deg, rgb(255 255 255 / 32%), rgb(255 255 255 / 2%));
          pointer-events: none;
          content: "";
        }
        .header {
          position: sticky;
          top: 0;
          z-index: 4;
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 64px;
          padding: 10px 12px 10px 14px;
          border-bottom: 1px solid var(--line);
          background: var(--toolbar);
          cursor: grab;
          touch-action: none;
          user-select: none;
        }
        .header:active { cursor: grabbing; }
        .panel[data-dragging="true"] { box-shadow: 0 18px 44px rgb(0 0 0 / 34%); opacity: .96; }
        .header-copy { display: grid; gap: 3px; min-width: 0; flex: 1; }
        .header-title-row { display: flex; align-items: center; gap: 7px; min-width: 0; }
        .title {
          overflow: hidden;
          color: var(--text);
          font-size: 15px;
          font-weight: 650;
          line-height: 1.2;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .brand-meta { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 10px; }
        .version { flex: 0 0 auto; color: inherit; font-size: 10px; font-weight: 500; }
        .update-badge {
          flex: 0 0 auto;
          border: 1px solid color-mix(in oklch, var(--accent) 58%, var(--line));
          border-radius: 5px;
          background: var(--accent-soft);
          color: var(--accent);
          padding: 1px 4px;
          font-size: 8px;
          font-weight: 750;
          line-height: 1.2;
        }
        .brand-mark {
          display: grid;
          width: 34px;
          height: 34px;
          flex: 0 0 auto;
          place-items: center;
          border: 1px solid var(--accent);
          background: var(--accent-soft);
          color: var(--accent);
          border-radius: 9px;
          font-family: SFMono-Regular, Consolas, monospace;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0;
        }
        .dot {
          width: 6px;
          height: 6px;
          flex: 0 0 auto;
          border-radius: 50%;
          background: var(--muted);
        }
        .dot[data-tone="running"], .dot[data-tone="warning"] { background: var(--warning); }
        .dot[data-tone="running"] { animation: status-pulse 1.2s ease-in-out infinite; }
        .dot[data-tone="success"] { background: var(--healthy); box-shadow: 0 0 0 4px var(--healthy-soft); }
        .dot[data-tone="error"] { background: var(--danger); }
        @keyframes status-pulse { 50% { opacity: .35; transform: scale(.72); } }
        .theme-select {
          width: 64px;
          height: 32px;
          flex: 0 0 auto;
          border: 1px solid transparent;
          border-radius: 7px;
          background: transparent;
          color: var(--muted);
          padding: 0 5px;
          font-size: 10px;
          cursor: pointer;
        }
        .theme-select:hover { border-color: var(--line); color: var(--text-soft); }
        .icon-button {
          position: relative;
          display: inline-grid;
          place-items: center;
          width: 32px;
          height: 32px;
          flex: 0 0 auto;
          border: 1px solid transparent;
          border-radius: 7px;
          background: transparent;
          color: var(--muted);
          padding: 0;
          line-height: 1;
        }
        .icon-button:hover { border-color: var(--line); background: var(--surface-raised); color: var(--text); }
        .icon-button:active { transform: scale(.92); transition-duration: 80ms; }
        button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .icon-button svg, .button svg {
          width: 14px;
          height: 14px;
          fill: none;
          stroke: currentColor;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 1.8;
        }
        .icon-button[data-update="available"]::after {
          position: absolute;
          top: 3px;
          right: 3px;
          width: 5px;
          height: 5px;
          border: 1px solid var(--surface);
          border-radius: 1px;
          background: var(--accent);
          content: "";
        }
        .icon-button[data-state="checking"] svg { animation: update-spin .8s linear infinite; }
        @keyframes update-spin { to { transform: rotate(360deg); } }
        .status {
          display: flex;
          align-items: center;
          min-height: 44px;
          gap: 9px;
          padding: 10px 16px;
          border-bottom: 1px solid var(--line-soft);
          color: var(--text-soft);
          background: transparent;
          font-size: 11px;
          font-weight: 590;
          line-height: 1.4;
        }
        .status::before { width: 20px; height: 20px; flex: 0 0 auto; border-radius: 50%; background: currentColor; box-shadow: inset 0 0 0 7px rgb(9 12 15 / 76%); content: ""; }
        .status[data-tone="success"] { color: var(--healthy); background: transparent; }
        .status[data-tone="warning"], .status[data-tone="running"] { color: var(--warning); background: var(--warning-soft); }
        .status[data-tone="error"] { color: var(--danger); background: var(--danger-soft); }
        .overview {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          border-bottom: 1px solid var(--line);
          background: transparent;
        }
        .route-primary, .route-best {
          display: grid;
          grid-template-columns: 1fr;
          align-content: center;
          gap: 5px;
          min-width: 0;
          min-height: 78px;
          padding: 13px 16px;
        }
        .route-primary { border-right: 1px solid var(--line); }
        .route-node { position: relative; }
        .route-apply { position: absolute; top: 9px; right: 10px; width: 28px; height: 28px; color: var(--accent); }
        .metric-label {
          color: var(--muted);
          font-size: 9px;
          font-weight: 650;
          white-space: nowrap;
        }
        .route-value, .route-best-value {
          display: block;
          overflow: hidden;
          font-size: 15px;
          font-weight: 700;
          line-height: 1.35;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .route-best-value { color: var(--healthy); padding-right: 24px; }
        .route-meta {
          grid-column: auto;
          display: flex;
          gap: 4px;
          color: var(--muted);
          font-size: 9px;
        }
        .route-meta strong { color: var(--text-soft); font-size: 10px; font-weight: 500; }
        .usage-strip {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border-bottom: 1px solid var(--line);
          background: rgb(255 255 255 / 2%);
        }
        .usage-item { position: relative; min-width: 0; padding: 10px 11px 11px; }
        .usage-item + .usage-item { border-left: 1px solid var(--line-soft); }
        .usage-item small {
          display: block;
          margin-bottom: 3px;
          color: var(--muted);
          font-size: 8px;
          font-weight: 600;
        }
        .usage-item strong {
          display: block;
          overflow: hidden;
          color: var(--text);
          font-size: 12px;
          font-weight: 650;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .usage-item[data-spend-tone="approaching"] { background: var(--warning-soft); }
        .usage-item[data-spend-tone="approaching"] strong { color: var(--warning); }
        .usage-item[data-spend-tone="reached"] { background: var(--danger-soft); }
        .usage-item[data-spend-tone="reached"] strong { color: var(--danger); }
        .usage-item[data-spend-tone="approaching"]::after,
        .usage-item[data-spend-tone="reached"]::after {
          position: absolute;
          right: 0;
          bottom: 0;
          left: 0;
          width: var(--spend-progress);
          height: 1px;
          background: var(--warning);
          content: "";
        }
        .usage-item[data-spend-tone="reached"]::after { background: var(--danger); }
        .section { padding: 15px 16px; border-bottom: 1px solid var(--line); background: transparent; }
        .section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .section-title { margin: 0; color: var(--text); font-size: 11px; font-weight: 700; }
        .automation-bar, .protection-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 36px;
          border-top: 1px solid var(--line-soft);
        }
        .automation-bar { padding: 9px 0; }
        .protection-bar { margin-bottom: 12px; padding: 9px 0; border-bottom: 1px solid var(--line-soft); }
        .automation-name { margin-right: auto; color: var(--text); font-size: 12px; font-weight: 600; }
        .strategy-select { width: 94px; height: 28px; flex: 0 0 auto; font-size: 10px; }
        .toggle { display: inline-flex; align-items: center; margin: 0; cursor: pointer; }
        .toggle input { position: absolute; inline-size: 1px; block-size: 1px; opacity: 0; }
        .toggle-track {
          display: grid;
          align-items: center;
          width: 38px;
          height: 22px;
          padding: 2px;
          border: 1px solid var(--line-strong);
          border-radius: 11px;
          background: var(--surface-raised);
        }
        .toggle-thumb { width: 16px; height: 16px; border-radius: 50%; background: var(--muted); box-shadow: 0 2px 5px rgb(0 0 0 / 30%); transition: transform .2s cubic-bezier(.2, .8, .2, 1); }
        .toggle input:checked + .toggle-track { border-color: color-mix(in srgb, var(--healthy) 62%, transparent); background: color-mix(in srgb, var(--healthy) 78%, transparent); }
        .toggle input:checked + .toggle-track .toggle-thumb { transform: translateX(16px); background: #fff; }
        .toggle input:focus-visible + .toggle-track { outline: 2px solid var(--focus); outline-offset: 2px; }
        .protection-copy { display: grid; gap: 1px; min-width: 88px; margin-right: auto; }
        .protection-copy strong { color: var(--text-soft); font-size: 11px; font-weight: 600; }
        .protection-copy small { overflow: hidden; color: var(--muted); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
        .protection-copy small[data-tone="approaching"] { color: var(--warning); }
        .protection-copy small[data-tone="reached"] { color: var(--danger); }
        .spend-limit-field { display: flex; align-items: center; gap: 5px; margin: 0; white-space: nowrap; }
        .spend-limit-field span { color: var(--muted); font-size: 9px; }
        .spend-limit-field input { width: 76px; height: 28px; }
        .control-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.12fr) minmax(0, .88fr);
          gap: 9px;
        }
        .field { min-width: 0; }
        .field-wide { grid-column: 1 / -1; }
        label { display: block; margin-bottom: 4px; color: var(--muted); font-size: 10px; font-weight: 550; }
        .group-filter-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
        .group-filter-heading > label { margin: 0; }
        .filter-mode-select { width: 78px; height: 26px; font-size: 10px; }
        input[type="number"], input[type="text"], select, .token-select-trigger {
          width: 100%;
          min-width: 0;
          height: 32px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: var(--control);
          color: var(--text);
          padding: 0 8px;
          font-size: 11px;
          outline: none;
        }
        select option, select optgroup {
          background-color: var(--native-option-bg);
          color: var(--native-option-text);
        }
        input:hover, select:hover, .token-select-trigger:hover { border-color: var(--line-strong); }
        input:focus, select:focus, .token-select-trigger:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--focus); }
        input[type="checkbox"] { accent-color: var(--accent); }
        .token-select { position: relative; }
        .token-select-trigger {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          align-items: center;
          gap: 6px;
          text-align: left;
        }
        .token-select-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .token-count { color: var(--muted); font-size: 9px; }
        .chevron { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.8; transition: transform .14s ease; }
        .token-select-trigger[aria-expanded="true"] .chevron { transform: rotate(180deg); }
        .token-menu {
          position: absolute;
          z-index: 6;
          top: calc(100% + 4px);
          right: 0;
          left: 0;
          padding: 6px;
          border: 1px solid var(--line-strong);
          border-radius: 10px;
          background: var(--menu);
          -webkit-backdrop-filter: blur(18px) saturate(145%);
          backdrop-filter: blur(18px) saturate(145%);
          box-shadow: var(--shadow-menu);
        }
        .model-select .token-menu { z-index: 6; }
        .group-filter-select .token-menu { z-index: 5; }
        .token-toolbar { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 5px; }
        .text-button { border: 0; background: transparent; color: var(--accent); padding: 2px; font-size: 10px; }
        .text-button:hover { text-decoration: underline; text-underline-offset: 2px; }
        .text-button:disabled { cursor: wait; opacity: .45; text-decoration: none; }
        .token-list { max-height: 176px; overflow: auto; border: 1px solid var(--line-soft); border-radius: 7px; background: rgb(0 0 0 / 16%); }
        .token-option {
          display: flex;
          align-items: center;
          gap: 7px;
          min-height: 30px;
          margin: 0;
          padding: 5px 7px;
          border-bottom: 1px solid var(--line-soft);
          color: var(--text-soft);
          cursor: pointer;
        }
        .token-option:last-child { border-bottom: 0; }
        .token-option:hover { background: var(--surface-raised); color: var(--text); }
        .token-option span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .token-empty { padding: 7px; }
        details { margin-top: 12px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
        summary { min-height: 38px; padding: 10px 1px; color: var(--text-soft); font-size: 10px; font-weight: 650; cursor: pointer; }
        summary:hover { color: var(--text); }
        .grid { display: grid; }
        .advanced { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; padding: 0 0 9px; }
        .advanced label { display: flex; align-items: end; min-height: 23px; line-height: 1.25; }
        .actions { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 7px; margin-top: 10px; }
        .button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 34px;
          border: 1px solid var(--line-strong);
          border-radius: 8px;
          background: var(--control);
          color: var(--text-soft);
          padding: 6px 9px;
          font-size: 10px;
          font-weight: 600;
          transition: transform 100ms ease-out, background-color 140ms ease-out, border-color 140ms ease-out;
        }
        .button:hover { background: var(--surface-active); color: var(--text); }
        .button:active { transform: scale(.97); transition-duration: 80ms; }
        .button:disabled { cursor: wait; opacity: .45; transform: none; }
        .button-check { border-color: color-mix(in srgb, var(--accent) 50%, transparent); background: var(--accent-soft); color: color-mix(in srgb, var(--accent) 55%, var(--text)); }
        .button-check:hover { border-color: var(--text); background: var(--text); color: var(--canvas); }
        .button-route { border-color: var(--info); background: var(--info-soft); color: var(--info); }
        .button-route:hover { background: var(--accent); color: var(--accent-ink); }
        .button-manual { min-height: 28px; border-color: var(--line); background: transparent; color: var(--text-soft); }
        .button-primary { border-color: var(--accent); background: var(--accent); color: var(--accent-ink); }
        .candidate-section { padding: 0 0 8px; }
        .candidate-section .section-head { margin: 0; padding: 12px 14px 10px; }
        .candidate-head, .candidate {
          display: grid;
          grid-template-columns: minmax(72px, 1fr) 58px 40px 40px 43px 43px 43px 70px;
          align-items: center;
          gap: 5px;
          min-height: 30px;
          font-size: 10px;
        }
        .candidate-head { padding: 0 12px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--surface-raised); color: var(--muted); font-size: 8px; font-weight: 650; }
        .candidate { min-height: 39px; padding: 0 12px; border-bottom: 1px solid var(--line-soft); color: var(--text-soft); }
        .candidate:last-child { border-bottom: 0; }
        .candidate:hover { background: var(--surface-raised); }
        .candidate > span:first-child { overflow: hidden; color: var(--text); text-overflow: ellipsis; white-space: nowrap; }
        .candidate-head > span:not(:first-child), .candidate > span:not(:first-child) { text-align: center; }
        .candidate-ok { background: transparent; }
        .candidate-off { color: var(--muted); }
        .candidate-name { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .candidate-name-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .candidate-ratio { display: grid; justify-items: center; gap: 1px; line-height: 1.05; }
        .candidate-ratio small { color: var(--accent); font-size: 8px; font-weight: 650; }
        .candidate-ratio .candidate-price { color: var(--text-soft); font-size: 7px; font-weight: 550; }
        .candidate-off .candidate-ratio small { color: var(--muted); }
        .candidate-signal { width: 6px; height: 6px; flex: 0 0 auto; background: var(--warning); }
        .candidate-signal { border-radius: 50%; }
        .candidate-ok .candidate-signal { background: var(--healthy); }
        .candidate-warning .candidate-signal { background: var(--warning); }
        .health-value { position: relative; padding-bottom: 5px; }
        .health-value::after { position: absolute; right: 0; bottom: 1px; left: 0; width: var(--health); height: 1px; background: var(--healthy); content: ""; }
        .candidate-off .health-value::after { background: var(--warning); }
        .verdict { overflow: hidden; color: var(--warning); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
        .candidate-ok .verdict { color: var(--healthy); }
        .candidate-warning .verdict { color: var(--warning); }
        .secondary-details { margin: 0; border: 0; border-bottom: 1px solid var(--line); background: transparent; }
        .secondary-details > summary { padding: 9px 12px; }
        .secondary-details > div { padding: 0 12px 10px; }
        .token-result {
          display: grid;
          grid-template-columns: 6px minmax(80px, .8fr) minmax(58px, .6fr) minmax(110px, 1.2fr);
          align-items: center;
          gap: 7px;
          min-height: 30px;
          border-bottom: 1px solid var(--line-soft);
          color: var(--text-soft);
          font-size: 10px;
        }
        .token-result::before { width: 5px; height: 5px; background: var(--muted); content: ""; }
        .token-result-success::before { background: var(--healthy); }
        .token-result-warning::before { background: var(--warning); }
        .token-result-error::before { background: var(--danger); }
        .token-result:last-child { border-bottom: 0; }
        .token-result span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .token-result-success span:last-child { color: var(--healthy); }
        .token-result-warning span:last-child { color: var(--warning); }
        .token-result-error span:last-child { color: var(--danger); }
        .logs { display: grid; gap: 0; }
        .log { display: grid; grid-template-columns: 5px 56px 1fr; align-items: baseline; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--line-soft); color: var(--muted); font-size: 10px; line-height: 1.4; }
        .log::before { width: 4px; height: 4px; background: currentColor; content: ""; }
        .log-success { color: var(--healthy); }
        .log-error { color: var(--danger); }
        .empty { padding: 8px 0; color: var(--muted); font-size: 10px; }
        .manual-dialog {
          width: min(380px, calc(100vw - 28px));
          max-height: min(680px, calc(100vh - 28px));
          border: 1px solid var(--line-strong);
          border-radius: 16px;
          background: var(--panel-glass);
          color: var(--text);
          padding: 0;
          box-shadow: var(--shadow-panel);
          -webkit-backdrop-filter: blur(24px) saturate(175%) contrast(108%);
          backdrop-filter: blur(24px) saturate(175%) contrast(108%);
        }
        .manual-dialog::backdrop { background: var(--dialog-backdrop); }
        .manual-group-list {
          display: grid;
          max-height: min(440px, calc(100vh - 190px));
          overflow: auto;
          border: 1px solid var(--line);
          border-radius: 9px;
          background: var(--control);
          scrollbar-color: var(--line-strong) transparent;
          scrollbar-width: thin;
        }
        .manual-group-option {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: start;
          gap: 8px;
          min-height: 44px;
          margin: 0;
          padding: 8px 9px;
          border-bottom: 1px solid var(--line-soft);
          color: var(--text);
          cursor: pointer;
        }
        .manual-group-option:last-child { border-bottom: 0; }
        .manual-group-option:hover { background: var(--surface-raised); }
        .manual-group-option:has(input:checked) { background: var(--accent-soft); }
        .manual-group-option input { margin: 3px 0 0; accent-color: var(--accent); }
        .manual-group-option span { display: grid; gap: 2px; min-width: 0; }
        .manual-group-option strong { overflow: hidden; font-size: 11px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
        .manual-group-option small { color: var(--muted); font-size: 9px; line-height: 1.45; }
        .manual-group-option-warning strong { color: var(--text-soft); }
        .manual-group-empty { padding: 18px 10px; text-align: center; }
        .settings-view .control-section { padding: 14px 16px; border-bottom: 0; }
        .settings-appearance {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 14px 0 0;
          padding: 12px 0;
          border-top: 1px solid var(--line-soft);
        }
        .settings-appearance-copy { display: grid; gap: 2px; min-width: 0; margin-right: auto; }
        .settings-appearance-copy strong { color: var(--text); font-size: 11px; font-weight: 650; }
        .settings-appearance-copy small { color: var(--muted); font-size: 9px; }
        .settings-appearance .theme-select { width: 104px; border-color: var(--line); background: var(--control); }
        .settings-appearance + .settings-appearance { margin-top: 0; }
        .model-detection-setting[hidden] { display: none; }
        .glass-transparency-control {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 36px;
          align-items: center;
          gap: 8px;
          width: 184px;
        }
        .glass-transparency-range {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 4px;
          border: 0;
          border-radius: 999px;
          background: linear-gradient(90deg, var(--accent) 0 var(--glass-transparency), var(--line-strong) var(--glass-transparency) 100%);
          padding: 0;
          cursor: pointer;
        }
        .glass-transparency-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border: 2px solid var(--text);
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 2px 8px rgb(0 0 0 / 28%);
        }
        .glass-transparency-range::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border: 2px solid var(--text);
          border-radius: 50%;
          background: var(--accent);
          box-shadow: 0 2px 8px rgb(0 0 0 / 28%);
        }
        .glass-transparency-range:focus-visible { outline: 2px solid var(--focus); outline-offset: 5px; box-shadow: none; }
        .glass-transparency-value { color: var(--text-soft); font-size: 10px; text-align: right; }
        .isolation-section { border-top: 1px solid var(--line); }
        .isolation-heading { align-items: flex-start; }
        .isolation-heading-copy { min-width: 0; }
        .isolation-heading .section-title { color: color-mix(in srgb, var(--warning) 78%, var(--text)); }
        .isolation-description { margin: 4px 0 0; color: var(--muted); font-size: 9px; line-height: 1.45; }
        .isolation-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
        .isolation-list { display: grid; gap: 8px; }
        .isolation-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          min-height: 76px;
          padding: 11px 12px;
          border: 1px solid color-mix(in srgb, var(--warning) 24%, transparent);
          border-radius: 8px;
          background: rgb(3 5 7 / 30%);
          box-shadow: inset 0 1px 0 rgb(255 255 255 / 4%);
        }
        .isolation-copy { min-width: 0; }
        .isolation-name { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .isolation-name strong { overflow: hidden; color: var(--text); font-size: 11px; font-weight: 630; text-overflow: ellipsis; white-space: nowrap; }
        .isolation-signal { background: var(--warning); }
        .isolation-meta { display: flex; align-items: center; gap: 7px; min-width: 0; margin-top: 7px; color: var(--muted); font-size: 9px; }
        .isolation-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .isolation-meta span + span { padding-left: 7px; border-left: 1px solid var(--line); }
        .isolation-meta .isolation-remaining { flex: 0 0 auto; color: var(--warning); }
        .isolation-unlock {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 32px;
          border: 1px solid color-mix(in srgb, var(--danger) 46%, transparent);
          border-radius: 7px;
          background: var(--danger-soft);
          color: color-mix(in srgb, var(--danger) 64%, var(--text));
          padding: 0 9px;
          font-size: 9px;
          font-weight: 650;
        }
        .isolation-unlock:hover { background: color-mix(in srgb, var(--danger) 17%, transparent); }
        .isolation-unlock:active { transform: scale(.96); }
        .isolation-unlock svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; }
        .isolation-empty { min-height: 58px; display: grid; place-items: center; border: 1px dashed var(--line); border-radius: 8px; color: var(--muted); font-size: 9px; text-align: center; }
        .isolation-toast {
          position: absolute;
          z-index: 12;
          right: 14px;
          bottom: 14px;
          left: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 42px;
          border: 1px solid var(--line-strong);
          border-radius: 10px;
          background: var(--menu);
          color: var(--text-soft);
          padding: 7px 9px 7px 12px;
          box-shadow: var(--shadow-menu);
          -webkit-backdrop-filter: blur(18px) saturate(170%);
          backdrop-filter: blur(18px) saturate(170%);
          font-size: 10px;
        }
        .isolation-toast[hidden] { display: none; }
        .isolation-toast::before { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: var(--healthy); content: ""; }
        .isolation-toast-message { overflow: hidden; flex: 1; text-overflow: ellipsis; white-space: nowrap; }
        .isolation-toast button { border: 0; border-radius: 6px; background: var(--accent-soft); color: var(--accent); padding: 5px 8px; font-size: 10px; font-weight: 650; }
        .settings-footer {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px 16px;
          border-top: 1px solid var(--line);
          background: var(--surface);
        }
        .settings-version { display: grid; gap: 2px; min-width: 0; margin-right: auto; }
        .settings-version strong { font-size: 10px; font-weight: 650; }
        .settings-version small { color: var(--muted); font-size: 9px; }
        .settings-update { min-width: 132px; }
        .dialog-form { padding: 13px; }
        .dialog-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .dialog-title { flex: 1; margin: 0; font-size: 12px; font-weight: 650; }
        .dialog-hint { min-height: 18px; margin: 6px 0 0; color: var(--muted); font-size: 10px; line-height: 1.45; }
        .dialog-actions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 12px; }
        .panel {
          width: min(480px, calc(100vw - 24px));
          height: min(760px, calc(100vh - 24px));
          max-height: none;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .work-nav {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          min-height: 52px;
          gap: 3px;
          padding: 10px 14px;
          border-bottom: 1px solid var(--line);
          background: rgb(17 19 23 / 12%);
        }
        .work-nav button {
          border: 0;
          border: 0;
          border-radius: 7px;
          background: transparent;
          color: var(--muted);
          font-size: 9px;
          font-weight: 650;
          transition: transform 100ms ease-out, background-color 140ms ease-out, color 140ms ease-out;
        }
        .work-nav::before { position: absolute; inset: 10px 14px; z-index: -1; border-radius: 9px; background: rgb(3 5 7 / 28%); box-shadow: inset 0 0 0 1px var(--line-soft); content: ""; }
        .work-nav { position: relative; isolation: isolate; }
        .work-nav button:hover { color: var(--text); background: var(--surface-raised); }
        .work-nav button:active { transform: scale(.97); transition-duration: 80ms; }
        .work-nav button[data-active="true"] { color: var(--text); background: var(--surface-active); box-shadow: 0 1px 4px rgb(0 0 0 / 26%), inset 0 1px 0 rgb(255 255 255 / 8%); }
        .nav-count { margin-left: 6px; color: inherit; font-size: 8px; font-variant-numeric: tabular-nums; opacity: .72; }
        .workspace { min-height: 0; flex: 1; overflow: auto; outline: none; scrollbar-color: var(--line-strong) transparent; scrollbar-width: thin; }
        .work-view[hidden] { display: none; }
        .work-view:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
        .work-view > .section:last-child { border-bottom: 0; }
        .view-intro { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 14px 14px 10px; border-bottom: 1px solid var(--line-soft); }
        .view-intro h2 { margin: 0; color: var(--text); font-size: 13px; font-weight: 700; }
        .view-intro p { margin: 0; color: var(--muted); font-size: 9px; }
        .command-deck { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 12px 16px 10px; background: transparent; }
        .command-deck .button { min-height: 36px; }
        .command-deck .button-manual { background: transparent; }
        .monitor-auto-row { display: flex; align-items: center; gap: 9px; padding: 0 16px 12px; border-bottom: 1px solid var(--line); }
        .monitor-auto-copy { display: flex; align-items: baseline; gap: 9px; min-width: 0; margin-right: auto; }
        .monitor-auto-copy strong { color: var(--text); font-size: 11px; font-weight: 620; }
        .monitor-auto-copy span { overflow: hidden; color: var(--muted); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
        .route-summary { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr); border-bottom: 1px solid var(--line); background: var(--surface); }
        .route-summary > div { display: grid; gap: 3px; padding: 10px 12px; min-width: 0; }
        .route-summary > div + div { border-left: 1px solid var(--line); }
        .route-summary small { color: var(--muted); font-size: 9px; font-weight: 600; }
        .route-summary strong { overflow: hidden; color: var(--text); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
        .route-summary .recommendation strong { color: var(--accent); }
        .status { flex: 0 0 auto; }
        .monitor-candidates { padding-top: 0; }
        .section-meta { margin-left: auto; color: var(--muted); font-size: 9px; font-weight: 500; }
        .route-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0; border-bottom: 1px solid var(--line); }
        .route-grid > .section { border-bottom: 0; }
        .route-grid > .section + .section { border-left: 1px solid var(--line); }
        .route-grid .control-grid { grid-template-columns: 1fr; }
        .route-grid .protection-bar { margin-bottom: 0; }
        .diagnostics-grid { display: grid; grid-template-columns: 1fr; }
        .diagnostics-grid > .section { border-bottom: 0; }
        .diagnostics-grid > .section + .section { border-top: 1px solid var(--line); }
        .diagnostic-caption { margin: -3px 0 10px; color: var(--muted); font-size: 9px; }
        .diagnostic-list { min-height: 160px; max-height: 240px; overflow: auto; }
        .diagnostic-list .logs { padding-right: 2px; }
        .statistics-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: end; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--line); }
        .statistics-control { display: grid; gap: 5px; min-width: 0; }
        .statistics-control > span { color: var(--muted); font-size: 8px; font-weight: 650; }
        .statistics-control select { min-width: 0; height: 32px; padding: 0 28px 0 9px; border: 1px solid var(--line); border-radius: 8px; background: var(--control); color: var(--text); font-size: 10px; }
        .statistics-refresh { min-width: 34px; min-height: 32px; align-self: end; }
        .statistics-source { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 14px; border-bottom: 1px solid var(--line-soft); color: var(--muted); font-size: 8px; }
        .statistics-source strong { overflow: hidden; color: var(--text-soft); font-size: 9px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
        .statistics-summary { padding: 9px 14px; border-bottom: 1px solid var(--line-soft); color: var(--text-soft); font-size: 9px; line-height: 1.5; }
        .statistics-summary[data-tone="success"] { color: var(--healthy); background: var(--healthy-soft); }
        .statistics-summary[data-tone="warning"], .statistics-summary[data-tone="partial"] { color: var(--warning); background: var(--warning-soft); }
        .statistics-summary[data-tone="error"] { color: var(--danger); background: var(--danger-soft); }
        .statistics-summary[data-tone="unavailable"] { color: var(--muted); }
        .statistics-loading { height: 3px; overflow: hidden; background: var(--surface-raised); }
        .statistics-loading::before { display: block; width: var(--statistics-loading-progress, 0%); height: 100%; background: var(--accent); content: ""; }
        .statistics-overview { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-bottom: 1px solid var(--line); }
        .statistics-overview > div { display: grid; gap: 4px; min-width: 0; padding: 10px 12px; }
        .statistics-overview > div + div { border-left: 1px solid var(--line-soft); }
        .statistics-overview small { color: var(--muted); font-size: 8px; }
        .statistics-overview strong { overflow: hidden; color: var(--text); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
        .statistics-overview strong[data-tone="error"] { color: var(--danger); }
        .statistics-overview strong[data-tone="partial"] { color: var(--warning); }
        .statistics-chart { min-height: 188px; padding: 4px 12px 10px; }
        .statistics-chart svg { display: block; width: 100%; height: auto; overflow: visible; }
        .statistics-chart svg:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .statistics-chart-baseline { stroke: var(--line-strong); stroke-width: 1; }
        .statistics-chart-area { fill: var(--accent-soft); }
        .statistics-chart-line { fill: none; stroke: var(--accent); stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; }
        .statistics-chart-point { fill: var(--accent); stroke: var(--panel-glass); stroke-width: 1.5; }
        .statistics-chart-label { fill: var(--muted); font: 8px SFMono-Regular, Consolas, monospace; }
        .statistics-state { display: grid; align-content: center; justify-items: start; gap: 5px; min-height: 118px; padding: 18px; color: var(--muted); }
        .statistics-state strong { color: var(--text-soft); font-size: 10px; }
        .statistics-state span { font-size: 9px; line-height: 1.55; }
        .statistics-state-error strong { color: var(--danger); }
        .statistics-state-loading { animation: statistics-pulse 1.4s ease-in-out infinite alternate; }
        .statistics-key-list { min-height: 150px; max-height: 330px; overflow: auto; padding: 2px 14px 12px; scrollbar-color: var(--line-strong) transparent; scrollbar-width: thin; }
        .statistics-key-row { display: grid; gap: 6px; padding: 10px 0; border-bottom: 1px solid var(--line-soft); }
        .statistics-key-row:last-child { border-bottom: 0; }
        .statistics-key-heading { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
        .statistics-key-heading strong { overflow: hidden; color: var(--text); font-size: 9px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
        .statistics-key-heading span { margin-left: auto; color: var(--text-soft); font-size: 9px; }
        .statistics-key-track { height: 6px; overflow: hidden; border-radius: 999px; background: var(--surface-raised); box-shadow: inset 0 0 0 1px var(--line-soft); }
        .statistics-key-track > span { display: block; height: 100%; border-radius: inherit; background: var(--accent); }
        .statistics-key-row-derived .statistics-key-track > span { background: var(--muted); }
        .statistics-key-row-derived .statistics-key-heading strong { color: var(--text-soft); }
        .statistics-key-row-error .statistics-key-track > span { background: var(--danger); }
        .statistics-key-row-error small { color: var(--danger); font-size: 8px; line-height: 1.4; }
        @keyframes statistics-pulse { from { opacity: .55; } to { opacity: 1; } }
        .settings-section { background: transparent; }
        .route-settings-advanced { min-width: 0; }
        @media (max-width: 520px) {
          .panel { right: 8px; bottom: 8px; width: calc(100vw - 16px); height: calc(100vh - 16px); }
          .command-deck { grid-template-columns: 1fr 1fr; }
          .route-grid, .diagnostics-grid { grid-template-columns: 1fr; }
          .route-grid > .section + .section, .diagnostics-grid > .section + .section { border-top: 1px solid var(--line); border-left: 0; }
        }
        @media (max-width: 390px) {
          .work-nav button { font-size: 9px; }
          .nav-count { display: none; }
          .statistics-toolbar { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; }
          .statistics-overview { grid-template-columns: 1fr; }
          .statistics-overview > div + div { border-top: 1px solid var(--line-soft); border-left: 0; }
          .route-summary { grid-template-columns: 1fr; }
          .route-summary > div + div { border-top: 1px solid var(--line); border-left: 0; }
        }
        @media (max-width: 520px) {
          .panel { right: 8px; bottom: 8px; width: calc(100vw - 16px); max-height: calc(100vh - 16px); }
          .launcher { right: 10px; bottom: 10px; }
          .advanced { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .candidate-head, .candidate { grid-template-columns: minmax(76px, 1fr) 40px 40px 43px 43px 52px; }
          .candidate-head span:nth-child(3), .candidate span:nth-child(3),
          .candidate-head span:nth-child(7), .candidate span:nth-child(7) { display: none; }
        }
        @media (max-width: 390px) {
          .header { gap: 6px; padding-inline: 9px; }
          .theme-select { width: 54px; padding-inline: 3px; }
          .glass-transparency-control { width: 156px; }
          .overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .route-primary { border-right: 1px solid var(--line); border-bottom: 0; }
          .route-node { min-height: 72px; padding: 11px 12px; }
          .usage-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .usage-item:nth-child(3) { border-left: 0; border-top: 1px solid var(--line-soft); }
          .usage-item:nth-child(4) { border-top: 1px solid var(--line-soft); }
          .protection-bar { flex-wrap: wrap; }
          .protection-copy { flex: 1 1 145px; }
          .control-grid { grid-template-columns: 1fr; }
          .field-wide { grid-column: auto; }
          .candidate-head, .candidate { grid-template-columns: minmax(70px, 1fr) 39px 41px 41px 48px; gap: 4px; }
          .candidate-head span:nth-child(4), .candidate span:nth-child(4) { display: none; }
          .actions { grid-template-columns: 1fr; }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation-duration: .001ms !important; }
        }
        @media (prefers-reduced-transparency: reduce) {
          .panel, .launcher, .header, .work-nav, .token-menu, .manual-dialog, .isolation-toast {
            -webkit-backdrop-filter: none;
            backdrop-filter: none;
          }
          .panel, .launcher, .manual-dialog, .isolation-toast, .token-menu {
            background: #171a1f;
          }
          :host([data-resolved-theme="light"]) .panel,
          :host([data-resolved-theme="light"]) .launcher,
          :host([data-resolved-theme="light"]) .manual-dialog,
          :host([data-resolved-theme="light"]) .isolation-toast,
          :host([data-resolved-theme="light"]) .token-menu { background: #f1f4f6; }
        }
        @media (prefers-contrast: more) {
          .panel, .manual-dialog { border-color: var(--text-soft); }
          .work-nav button[data-active="true"], input, select, .token-select-trigger { border-color: var(--line-strong); }
          .header, .work-nav { background: var(--surface); }
        }
        @media (forced-colors: active) {
          .panel, .launcher, .manual-dialog, .token-menu, .manual-group-list { background: Canvas; color: CanvasText; forced-color-adjust: auto; }
          select option, select optgroup { background-color: Canvas; color: CanvasText; }
          .token-option, .manual-group-option, .manual-group-option small { color: CanvasText; }
          .manual-group-option:has(input:checked) { outline: 2px solid Highlight; outline-offset: -2px; }
        }
      </style>

      <button class="launcher" type="button" title="打开 ${SITE_LABEL} 分组监控" hidden>${SITE_SHORT_LABEL}</button>
      <section class="panel" aria-label="${SITE_LABEL} 分组监控">
        <header class="header" data-ref="header">
          <span class="brand-mark" aria-hidden="true">${SITE_SHORT_LABEL}</span>
          <span class="header-copy">
            <span class="header-title-row">
              <span class="title">${SITE_LABEL} 分组监控</span>
              <span class="update-badge" data-ref="updateBadge" role="status" aria-live="polite" title="" hidden>NEW</span>
            </span>
            <span class="brand-meta"><span class="dot" data-ref="statusDot" title="监控状态"></span><span class="version" data-ref="version" title="当前插件版本">v${SCRIPT_VERSION}</span></span>
          </span>
          <button class="icon-button" data-ref="collapse" type="button" title="收起" aria-label="收起">−</button>
        </header>
        <nav class="work-nav" aria-label="插件工作区" role="tablist">
          <button id="kf-tab-monitor" data-view-target="monitor" data-active="true" role="tab" aria-controls="kf-view-monitor" aria-selected="true" type="button">监控 <span class="nav-count" data-ref="candidateCount">0</span></button>
          <button id="kf-tab-statistics" data-view-target="statistics" data-active="false" role="tab" aria-controls="kf-view-statistics" aria-selected="false" type="button">统计</button>
          <button id="kf-tab-diagnostics" data-view-target="diagnostics" data-active="false" role="tab" aria-controls="kf-view-diagnostics" aria-selected="false" type="button">诊断 <span class="nav-count" data-ref="logCount">0</span></button>
          <button id="kf-tab-settings" data-view-target="settings" data-active="false" role="tab" aria-controls="kf-view-settings" aria-selected="false" type="button">设置</button>
        </nav>
        <div class="status" data-ref="status" role="status" aria-live="polite"></div>
        <main class="workspace" data-ref="workspace">
        <section class="work-view" id="kf-view-monitor" data-view="monitor" role="tabpanel" aria-labelledby="kf-tab-monitor" tabindex="0">
        <section class="overview" aria-label="当前分组概览">
          <div class="route-primary route-node">
            <span class="metric-label">当前分组</span>
            <strong class="route-value" data-ref="currentGroup">-</strong>
          </div>
          <div class="route-best route-node">
            <span class="metric-label">策略推荐</span>
            <strong class="route-best-value" data-ref="bestGroup">-</strong>
            <span class="route-meta">检查 <strong data-ref="lastCheck">-</strong></span>
            <button class="icon-button route-apply" data-ref="switchNow" type="button" title="立即切到策略推荐分组" aria-label="立即切到策略推荐分组">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5"></path><path d="M4 20 21 3"></path><path d="M21 16v5h-5"></path><path d="m15 15 6 6"></path><path d="M4 4l5 5"></path></svg>
            </button>
          </div>
        </section>
        <section class="usage-strip" aria-label="账户与今日用量">
          <div class="usage-item"><small>余额</small><strong class="mono" data-ref="balance">-</strong></div>
          <div class="usage-item" data-ref="todaySpendItem" data-spend-tone="none"><small>今日消费</small><strong class="mono" data-ref="todaySpend">-</strong></div>
          <div class="usage-item"><small>今日请求</small><strong class="mono" data-ref="todayRequests">-</strong></div>
          <div class="usage-item"><small>今日 Token</small><strong class="mono" data-ref="todayTokens">-</strong></div>
        </section>
        <div class="command-deck" aria-label="常用操作">
          <button class="button button-check" data-ref="check" type="button">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg>
            立即检查
          </button>
          <button class="button button-manual" data-ref="manualSwitch" type="button">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 3-4 4 4 4"></path><path d="M4 7h16"></path><path d="m16 21 4-4-4-4"></path><path d="M20 17H4"></path></svg>
            手动切换
          </button>
        </div>
        <div class="monitor-auto-row">
          <span class="monitor-auto-copy"><strong>自动切换</strong><span data-ref="monitorMode">省钱优先</span></span>
          <label class="toggle" for="kf-monitor-enabled" title="自动切换">
            <input id="kf-monitor-enabled" data-ref="monitorEnabled" type="checkbox" aria-label="自动切换">
            <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
          </label>
        </div>
        <section class="section candidate-section monitor-candidates">
          <div class="section-head"><h2 class="section-title">分组状态</h2><span class="section-meta" data-ref="candidateSummary">等待检查</span></div>
          <div class="candidate-head"><span>分组</span><span title="AIHub 依次显示路由倍率（账号倍率优先）、页面倍率、平台返回的 1M 真实输入价格和预测倍率；其他站点显示路由倍率与预测倍率">${IS_AIHUB ? "倍率/价/预" : "标/预"}</span><span title="${IS_AIHUB ? "AIHub v2 采用平台 1 小时整体成功率；旧接口沿用对应趋势窗口" : "监测窗口内整体成功率"}">整体</span><span>近期</span><span title="${IS_AIHUB ? "优先采用用户最快95%平均首字延迟；缺失时依次回退到 P90 和探针；按 AIHub 页面同口径显示毫秒" : "平均首字延迟"}">首字</span><span>输出</span><span>缓存</span><span>判定</span></div>
          <div data-ref="candidateRows"></div>
        </section>
        </section>
        <section class="work-view" id="kf-view-statistics" data-view="statistics" role="tabpanel" aria-labelledby="kf-tab-statistics" tabindex="0" hidden>
          <div class="view-intro">
            <h2>用量统计</h2>
            <p>当前站点的真实账单趋势</p>
          </div>
          <div class="statistics-toolbar">
            <label class="statistics-control">
              <span>指标</span>
              <select data-ref="statisticsMetric" aria-label="统计指标">
                <option value="spend">实际消费</option>
                <option value="requests">请求数</option>
                <option value="tokens">Token</option>
              </select>
            </label>
            <label class="statistics-control">
              <span>范围</span>
              <select data-ref="statisticsDays" aria-label="统计日期范围">
                <option value="1">今天</option>
                <option value="7">最近 7 天</option>
                <option value="14">最近 14 天</option>
                <option value="30">最近 30 天</option>
              </select>
            </label>
            <button class="icon-button statistics-refresh" data-ref="statisticsRefresh" type="button" title="刷新统计" aria-label="刷新统计">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg>
            </button>
          </div>
          <div class="statistics-source"><strong data-ref="statisticsSource">AIHub 账单 · USD</strong><span data-ref="statisticsUpdated">尚未读取</span></div>
          <div class="statistics-loading" data-ref="statisticsLoading" hidden aria-hidden="true"></div>
          <div class="statistics-summary" data-ref="statisticsSummary" data-tone="idle" role="status" aria-live="polite">点击刷新读取统计</div>
          <section class="statistics-overview" aria-label="统计对账概览">
            <div><small>账户总量</small><strong class="mono" data-ref="statisticsTotal">-</strong></div>
            <div><small>当前密钥合计</small><strong class="mono" data-ref="statisticsAssigned">-</strong></div>
            <div><small>密钥覆盖率</small><strong class="mono" data-ref="statisticsCoverage">-</strong></div>
          </section>
          <section class="section">
            <div class="section-head"><h3 class="section-title">每日趋势</h3><span class="section-meta" data-ref="statisticsTrendSummary">等待数据</span></div>
            <div class="statistics-chart" data-ref="statisticsTrend"></div>
          </section>
          <section class="section">
            <div class="section-head"><h3 class="section-title">每个密钥使用度</h3><span class="section-meta">全部当前密钥</span></div>
            <div class="statistics-key-list" data-ref="statisticsKeyRows"></div>
          </section>
        </section>
        <section class="work-view settings-view" id="kf-view-settings" data-ref="settingsSection" data-view="settings" role="tabpanel" aria-labelledby="kf-tab-settings" tabindex="0" hidden>
          <div class="view-intro">
            <h2>设置</h2>
            <p>所有更改自动保存</p>
          </div>
        <section class="section control-section settings-section">
          <div class="section-head"><h2 class="section-title">自动路由</h2><span class="section-meta">运行策略与保护</span></div>
          <div class="automation-bar">
            <span class="automation-name">自动切换</span>
            <label class="toggle" for="kf-enabled" title="自动切换">
              <input id="kf-enabled" data-ref="enabled" type="checkbox" aria-label="自动切换">
              <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
            </label>
            <select class="strategy-select" data-ref="selectionMode" aria-label="分组选择策略" title="分组选择策略">
              <option value="saving">省钱优先</option>
              <option value="stable">稳定优先</option>
              <option value="balanced">均衡推荐</option>
            </select>
          </div>
          <div class="protection-bar">
            <span class="protection-copy">
              <strong>消费保护</strong>
              <small data-ref="spendProtectionStatus" data-tone="none">未启用</small>
            </span>
            <label class="toggle" for="kf-spend-protection" title="消费保护仅提醒，不影响任务">
              <input id="kf-spend-protection" data-ref="spendProtectionEnabled" type="checkbox" aria-label="启用消费保护">
              <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
            </label>
            <label class="spend-limit-field">
              <span>每日上限</span>
              <input data-ref="dailySpendLimit" type="number" min="0" step="0.01" aria-label="每日消费上限">
            </label>
            <button class="icon-button" data-ref="resetSpendProtection" type="button" title="从当前消费重新计数" aria-label="重置消费保护计数">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 3v6h6"></path></svg>
            </button>
          </div>
          <div class="control-grid">
            <div class="field">
              <label id="kf-token-label">API 密钥（可多选）</label>
              <div class="token-select" data-ref="tokenSelect">
                <button class="token-select-trigger" data-ref="tokenSelectToggle" type="button" aria-labelledby="kf-token-label" aria-expanded="false">
                  <span class="token-select-label" data-ref="tokenSelectLabel">请选择 API 密钥</span>
                  <span class="token-count" data-ref="tokenCount">已选 0/0</span>
                  <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
                </button>
                <div class="token-menu" data-ref="tokenMenu" hidden>
                  <div class="token-toolbar">
                    <button class="text-button" data-ref="selectAllTokens" type="button">全选</button>
                    <button class="text-button" data-ref="clearTokens" type="button">清空</button>
                  </div>
                  <div class="token-list" data-ref="tokenList"></div>
                </div>
              </div>
            </div>
            <div class="field">
              <label id="kf-model-label">${IS_AIHUB ? "目标模型（站点探测，可多选）" : "目标模型（可多选）"}</label>
              <div class="token-select model-select" data-ref="modelSelect">
                <button class="token-select-trigger" data-ref="modelSelectToggle" type="button" aria-labelledby="kf-model-label" aria-expanded="false">
                  <span class="token-select-label" data-ref="modelSelectLabel">请选择目标模型</span>
                  <span class="token-count" data-ref="modelCount">已选 0</span>
                  <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
                </button>
                <div class="token-menu" data-ref="modelMenu" hidden>
                  <div class="token-toolbar">
                    <button class="text-button" data-ref="selectAllModels" type="button">全选</button>
                    <button class="text-button" data-ref="clearModels" type="button">清空</button>
                  </div>
                  <div class="token-list" data-ref="modelList"></div>
                </div>
              </div>
            </div>
            <div class="field field-wide group-filter-field">
              <div class="group-filter-heading">
                <label id="kf-group-filter-label" data-ref="groupFilterLabel">白名单分组</label>
                <select class="filter-mode-select" data-ref="groupFilterMode" aria-label="分组名单模式">
                  <option value="whitelist">白名单</option>
                  <option value="blacklist">黑名单</option>
                </select>
              </div>
              <div class="token-select group-filter-select" data-ref="groupFilterSelect">
                <button class="token-select-trigger" data-ref="groupFilterSelectToggle" type="button" aria-labelledby="kf-group-filter-label" aria-expanded="false">
                  <span class="token-select-label" data-ref="groupFilterSelectLabel">不限分组</span>
                  <span class="token-count" data-ref="groupFilterCount">0/0</span>
                  <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
                </button>
                <div class="token-menu" data-ref="groupFilterMenu" hidden>
                  <div class="token-toolbar">
                    <button class="text-button" data-ref="clearGroupFilter" type="button">清空当前名单</button>
                  </div>
                  <div class="token-list" data-ref="groupFilterList"></div>
                </div>
              </div>
            </div>
          </div>
        </section>
          <section class="section isolation-section" aria-labelledby="kf-isolation-title">
            <div class="section-head isolation-heading">
              <div class="isolation-heading-copy">
                <h2 class="section-title" id="kf-isolation-title">故障隔离</h2>
                <p class="isolation-description">切换后的健康检查失败时自动隔离，不影响用户黑白名单</p>
              </div>
              <span class="isolation-actions">
                <span class="section-meta" data-ref="isolationCount">当前无隔离</span>
                <button class="text-button" data-ref="clearAllIsolations" type="button">清除全部</button>
              </span>
            </div>
            <div class="isolation-list" data-ref="isolationRows"></div>
        </section>
        <section class="section settings-secondary">
          <div class="settings-appearance model-detection-setting"${IS_AIHUB ? "" : " hidden"}>
            <span class="settings-appearance-copy">
              <strong id="kf-model-detection-label">模型检测参与切换</strong>
              <small id="kf-model-detection-help">开启后，匹配目标模型的检测未通过会立即切换</small>
            </span>
            <label class="toggle" for="kf-require-model-detection" title="将匹配目标模型的 AIHub 检测结果作为切换条件">
              <input id="kf-require-model-detection" data-ref="requireModelDetection" type="checkbox" aria-labelledby="kf-model-detection-label" aria-describedby="kf-model-detection-help">
              <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
            </label>
          </div>
          <details class="route-settings-advanced">
            <summary>判定与保护参数</summary>
            <div class="grid advanced">
              <div class="field"><label>轮询（秒）</label><input data-ref="pollSeconds" type="number" min="15"></div>
              <div class="field"><label title="${IS_AIHUB ? "AIHub v2 整体成功率采用平台 1 小时统计；此项控制探测序列和旧接口回退窗口" : "整体性能与趋势的统计窗口"}">${IS_AIHUB ? "趋势窗口（小时）" : "统计窗口（小时）"}</label><input data-ref="metricHours" type="number" min="1"></div>
              <div class="field"><label>总成功率（%）</label><input data-ref="minSuccessRate" type="number" min="0" max="100" step="0.1"></div>
              <div class="field"><label>最新成功率（%）</label><input data-ref="minLatestSuccessRate" type="number" min="0" max="100" step="0.1"></div>
              <div class="field"><label>指标时效（分钟）</label><input data-ref="maxMetricAgeMinutes" type="number" min="5"></div>
              <div class="field"><label>最大首字延迟（秒）</label><input data-ref="maxFirstTokenLatencySeconds" type="number" min="0" step="0.1"></div>
              <div class="field"><label>最大输出耗时（秒）</label><input data-ref="maxOutputDurationSeconds" type="number" min="0" step="0.1"></div>
              <div class="field"><label>最大倍率（0 不限制）</label><input data-ref="maxGroupRatio" type="number" min="0" step="0.01"></div>
              <div class="field"><label>切换确认次数</label><input data-ref="confirmPolls" type="number" min="1" max="10"></div>
              <div class="field"><label title="保持期间继续检测；当前渠道不可用时立即切换，到期后恢复策略择优">切换后保持（分钟）</label><input data-ref="switchHoldMinutes" type="number" min="0"></div>
              <div class="field"><label>回滚观察次数（0 关闭）</label><input data-ref="rollbackChecks" type="number" min="0" max="10"></div>
              <div class="field"><label>故障拉黑（分钟）</label><input data-ref="blacklistMinutes" type="number" min="1"></div>
            </div>
          </details>
          <div class="settings-appearance">
            <span class="settings-appearance-copy"><strong>界面主题</strong><small>可跟随系统自动切换</small></span>
            <select class="theme-select" data-ref="theme" aria-label="插件皮肤">
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </div>
          <div class="settings-appearance">
            <span class="settings-appearance-copy"><strong id="kf-glass-transparency-label">毛玻璃透明度</strong></span>
            <span class="glass-transparency-control">
              <input id="kf-glass-transparency" class="glass-transparency-range" data-ref="glassTransparency" type="range" min="0" max="100" step="1" aria-labelledby="kf-glass-transparency-label">
              <output class="glass-transparency-value mono" data-ref="glassTransparencyValue" for="kf-glass-transparency">0%</output>
            </span>
          </div>
        </section>
          <div class="settings-footer">
            <span class="settings-version"><strong>脚本更新</strong><small>当前版本 v${SCRIPT_VERSION}</small></span>
            <button class="button settings-update" data-ref="checkUpdate" data-state="idle" data-update="none" type="button" title="检查更新" aria-label="检查更新">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.2 6.2L3 15"></path><path d="M3 21v-6h6"></path><path d="M3 12a9 9 0 0 1 15.2-6.2L21 9"></path><path d="M21 3v6h-6"></path></svg>
              <span data-ref="updateLabel">检查更新</span>
            </button>
          </div>
        </section>
        <section class="work-view" id="kf-view-diagnostics" data-view="diagnostics" role="tabpanel" aria-labelledby="kf-tab-diagnostics" tabindex="0" hidden>
          <div class="view-intro">
            <h2>诊断历史</h2>
            <p>检查每个密钥的结果与最近事件</p>
          </div>
          <div class="diagnostics-grid">
            <section class="section">
              <div class="section-head"><h3 class="section-title">密钥结果</h3><span class="section-meta"><span data-ref="tokenResultCount">0</span> 条</span></div>
              <p class="diagnostic-caption">最近一次检查的逐密钥处理结果</p>
              <div class="diagnostic-list" data-ref="tokenResultRows"></div>
            </section>
            <section class="section">
              <div class="section-head"><h3 class="section-title">最近事件</h3><span class="section-meta">保留 10 条</span></div>
              <p class="diagnostic-caption">切换、告警、更新与接口异常记录</p>
              <div class="diagnostic-list"><div class="logs" data-ref="logs"></div></div>
            </section>
          </div>
        </section>
        </main>
        <div class="isolation-toast" data-ref="isolationToast" role="status" aria-live="polite" hidden>
          <span class="isolation-toast-message" data-ref="isolationToastMessage"></span>
          <button data-ref="isolationToastUndo" type="button">撤销</button>
        </div>
      </section>
      <dialog class="manual-dialog" data-ref="manualDialog" aria-labelledby="kf-manual-title">
        <form class="dialog-form" method="dialog">
          <div class="dialog-header">
            <h2 class="dialog-title" id="kf-manual-title">手动切换分组</h2>
            <button class="icon-button" data-ref="manualClose" type="button" title="关闭" aria-label="关闭">×</button>
          </div>
          <div class="field">
            <label id="kf-manual-group-label">目标分组</label>
            <div class="manual-group-list" data-ref="manualGroup" role="radiogroup" aria-labelledby="kf-manual-group-label"></div>
            <p class="dialog-hint" data-ref="manualHint"></p>
          </div>
          <div class="dialog-actions">
            <button class="button" data-ref="manualCancel" type="button">取消</button>
            <button class="button button-primary" data-ref="manualConfirm" type="button">确认切换</button>
          </div>
        </form>
      </dialog>
    `;

    const refNames = [
      "launcher", "panel", "header", "workspace", "statusDot", "version", "updateBadge", "theme", "glassTransparency", "glassTransparencyValue", "collapse", "status", "currentGroup", "bestGroup",
      "lastCheck", "balance", "todaySpendItem", "todaySpend", "todayRequests", "todayTokens", "candidateCount", "candidateSummary", "tokenResultCount", "logCount", "settingsSection", "enabled", "monitorEnabled", "monitorMode", "selectionMode", "requireModelDetection", "spendProtectionEnabled", "dailySpendLimit", "spendProtectionStatus", "resetSpendProtection",
      "statisticsMetric", "statisticsDays", "statisticsRefresh", "statisticsSource", "statisticsUpdated", "statisticsSummary", "statisticsLoading", "statisticsTotal", "statisticsAssigned", "statisticsCoverage", "statisticsTrendSummary", "statisticsTrend", "statisticsKeyRows",
      "tokenSelect", "tokenSelectToggle", "tokenSelectLabel", "tokenMenu", "tokenList", "tokenCount", "selectAllTokens", "clearTokens", "modelSelect", "modelSelectToggle", "modelSelectLabel", "modelCount", "modelMenu", "modelList", "selectAllModels", "clearModels", "groupFilterLabel", "groupFilterMode", "groupFilterSelect", "groupFilterSelectToggle", "groupFilterSelectLabel", "groupFilterCount", "groupFilterMenu", "groupFilterList", "clearGroupFilter", "pollSeconds", "metricHours",
      "minSuccessRate", "minLatestSuccessRate", "maxMetricAgeMinutes",
      "maxFirstTokenLatencySeconds", "maxOutputDurationSeconds", "maxGroupRatio",
      "confirmPolls", "switchHoldMinutes", "rollbackChecks", "blacklistMinutes",
      "check", "switchNow", "checkUpdate", "updateLabel", "manualDialog", "manualGroup", "manualHint", "manualSwitch", "manualConfirm", "manualClose", "manualCancel", "isolationCount", "isolationRows", "clearAllIsolations", "isolationToast", "isolationToastMessage", "isolationToastUndo",
      "tokenResultRows", "candidateRows", "logs",
    ];
    refs = Object.fromEntries(
      refNames.map((name) => [name, root.querySelector(`[data-ref="${name}"]`) || root.querySelector(`.${name}`)]),
    );
    applyTheme();
    syncForm();
    renderOptions();
    bindUi();
    render();
  }
