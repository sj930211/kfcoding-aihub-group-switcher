  function mountUi() {
    if (document.getElementById(HOST_ID)) return;
    const host = document.createElement("div");
    host.id = HOST_ID;
    (document.body || document.documentElement).appendChild(host);
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
          --canvas: #101819;
          --surface: #192324;
          --surface-raised: #202d2e;
          --surface-active: #293738;
          --line: #344647;
          --line-soft: #2b3b3c;
          --line-strong: #4d6465;
          --text: #e5eeee;
          --text-soft: #c6d2d2;
          --muted: #a8b7b7;
          --accent: #73d2cb;
          --accent-ink: #102423;
          --accent-soft: #203d3c;
          --healthy: #58d69a;
          --healthy-soft: rgb(88 214 154 / 12%);
          --info: #79b9ff;
          --info-soft: rgb(91 169 255 / 12%);
          --warning: #f2b94b;
          --warning-soft: rgb(242 185 75 / 10%);
          --danger: #ff716f;
          --danger-soft: rgb(255 113 111 / 9%);
          --focus: rgb(115 210 203 / 40%);
          --toolbar: #192324;
          --control: #192324;
          --menu: #202d2e;
          --native-option-bg: #192324;
          --native-option-text: #e5eeee;
          --glass-transparency: 0%;
          --panel-glass: #192324;
          --shadow-panel: 0 24px 64px rgb(0 0 0 / 48%);
          --shadow-menu: 0 16px 38px rgb(0 0 0 / 38%), inset 0 1px 0 rgb(255 255 255 / 8%);
          --dialog-backdrop: rgb(0 0 0 / 62%);
        }
        :host([data-resolved-theme="light"]) {
          color-scheme: light;
          --canvas: #edf1f2;
          --surface: #ffffff;
          --surface-raised: #f6f8f8;
          --surface-active: #eef2f2;
          --line: #dce3e4;
          --line-soft: #e8eded;
          --line-strong: #a6b7b8;
          --text: #162426;
          --text-soft: #405456;
          --muted: #5d6e70;
          --accent: #066d72;
          --accent-ink: #ffffff;
          --accent-soft: #e2f3f1;
          --healthy: #0b7048;
          --healthy-soft: rgb(22 134 90 / 10%);
          --info: #1674d1;
          --info-soft: rgb(22 116 209 / 9%);
          --warning: #9a6500;
          --warning-soft: rgb(175 113 0 / 10%);
          --danger: #c63e3c;
          --danger-soft: rgb(198 62 60 / 9%);
          --focus: rgb(8 126 131 / 35%);
          --toolbar: #ffffff;
          --control: #ffffff;
          --menu: #ffffff;
          --native-option-bg: #ffffff;
          --native-option-text: #162426;
          --glass-transparency: 0%;
          --panel-glass: #ffffff;
          --shadow-panel: 0 24px 64px rgb(22 44 46 / 18%);
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
        .launcher, .panel, .manual-dialog, .scope-dialog {
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
          width: min(1080px, calc(100vw - 32px));
          height: min(84vh, 900px);
          max-height: calc(100vh - 24px);
          overflow: auto;
          border: 1px solid var(--line-strong);
          border-radius: 12px;
          background: var(--panel-glass);
          box-shadow: var(--shadow-panel);
          -webkit-backdrop-filter: none;
          backdrop-filter: none;
          scrollbar-color: var(--line-strong) transparent;
          scrollbar-width: thin;
          transition: width 180ms cubic-bezier(.2, .8, .2, 1), height 180ms cubic-bezier(.2, .8, .2, 1), box-shadow 160ms ease;
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
        .automation-bar { padding: 9px 0; flex-wrap: wrap; }
        .protection-bar { margin-bottom: 12px; padding: 9px 0; border-bottom: 1px solid var(--line-soft); }
        .automation-name { margin-right: auto; color: var(--text); font-size: 12px; font-weight: 600; }
        .strategy-select { width: 94px; height: 28px; flex: 0 0 auto; font-size: 10px; }
        .switch-mode-select { width: 118px; height: 28px; flex: 0 0 auto; font-size: 10px; }
        @media (max-width: 400px) {
          .automation-bar { display: grid; grid-template-columns: minmax(0, 1fr) auto; }
          .automation-bar select { width: 100%; min-width: 0; }
          .automation-bar .strategy-select { min-width: 106px; }
        }
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
        input[type="number"], input[type="text"], input[type="search"], select, .token-select-trigger {
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
        .selector-search { width: 100%; min-width: 0; margin-bottom: 5px; }
        .selector-platform { width: 100%; min-width: 0; margin-bottom: 5px; }
        .candidate-filter-controls { display: grid; grid-template-columns: minmax(150px, 1.4fr) repeat(3, minmax(120px, .8fr)) minmax(120px, .8fr); gap: 7px; margin: 10px 12px; }
        .candidate-filter-controls > * { min-width: 0; }
        .candidate-filter-controls .selector-search, .candidate-filter-controls .selector-platform { margin-bottom: 0; }
        .selector-platform[hidden], .candidate-filter-controls[hidden], .selector-search[hidden], .selector-search-status[hidden] { display: none; }
        .selector-search-status { min-height: 14px; margin: 0 0 5px; color: var(--muted); font-size: 9px; line-height: 1.4; }
        .token-option[hidden], .manual-group-option[hidden], .candidate[hidden], .candidate.candidate-details[hidden] { display: none; }
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
          grid-template-columns: minmax(150px, 1.7fr) 70px minmax(130px, 1.3fr) 100px 100px 85px 84px;
          align-items: center;
          gap: 5px;
          min-height: 30px;
          font-size: 10px;
        }
        .candidate-head { padding: 0 12px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--surface-raised); color: var(--muted); font-size: 9px; font-weight: 650; }
        .candidate-head[hidden] { display: none; }
        .candidate { min-height: 44px; padding: 0 12px; border-bottom: 1px solid var(--line-soft); color: var(--text-soft); }
        .monitor-scope-panel { margin: 12px; padding: 14px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); }
        .monitor-scope-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; align-items: center; gap: 8px; margin: 10px 0; }
        .monitor-scope-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); max-height: min(380px, 45vh); overflow: auto; border: 1px solid var(--line); border-radius: 5px; background: var(--control); }
        .monitor-scope-option { display: flex; align-items: flex-start; gap: 9px; min-width: 0; padding: 9px 10px; border-bottom: 1px solid var(--line-soft); color: var(--text-soft); font-size: 11px; line-height: 1.4; }
        .monitor-scope-option input { flex: 0 0 auto; margin: 2px 0 0; accent-color: var(--accent); }
        .monitor-scope-option span { min-width: 0; overflow-wrap: anywhere; }
        .monitor-scope-option small { display: block; margin-top: 2px; color: var(--muted); font-size: 9px; }
        .scope-notice { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 12px; align-items: center; margin: 10px 12px; padding: 12px; border: 1px solid var(--warning); border-radius: 6px; background: var(--warning-soft); color: var(--text-soft); font-size: 11px; line-height: 1.5; }
        .scope-notice[hidden] { display: none; }
        .scope-notice-list { grid-column: 1 / -1; display: grid; gap: 6px; }
        .scope-notice-item { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .scope-notice-item span { overflow-wrap: anywhere; }
        .scope-dialog { width: min(420px, calc(100vw - 28px)); max-height: min(560px, calc(100dvh - 28px)); padding: 0; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--panel-glass); color: var(--text); box-shadow: var(--shadow-panel); }
        .scope-dialog::backdrop { background: var(--dialog-backdrop); }
        .scope-dialog-content { display: grid; gap: 10px; padding: 18px; }
        .scope-dialog-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 7px; }
        .scope-dialog-actions > button[hidden] { display: none; }
        .scope-dialog-risk { margin: 0; padding: 10px; border: 1px solid var(--warning); border-radius: 5px; color: var(--warning); background: var(--warning-soft); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
        .scope-dialog-risk[hidden] { display: none; }
        .candidate-details-panel { padding: 0 12px 10px; border-bottom: 1px solid var(--line-soft); }
        .candidate-entry { min-width: 0; border-bottom: 1px solid var(--line-soft); }
        .candidate-entry[hidden], .monitor-scope-option[hidden] { display: none; }
        .candidate-row-v2 { display: grid; grid-template-columns: minmax(150px, 1.7fr) 70px minmax(130px, 1.3fr) 100px 100px 85px 84px; gap: 5px; align-items: center; min-height: 65px; padding: 10px 12px; font-size: 12px; }
        .candidate-row-v2 > * { min-width: 0; overflow-wrap: anywhere; }
        .candidate-row-v2 > :nth-child(n+2) { text-align: right; }
        .candidate-row-v2 small { display: block; margin-top: 3px; color: var(--muted); font-size: 10px; }
        .candidate-row-v2 strong { color: var(--text); font-weight: 650; }
        .candidate-row-v2 .candidate-row-switch { width: auto; height: 28px; padding: 0 9px; border-radius: 5px; }
        .candidate-row-v2 .candidate-status { display: inline-block; padding: 3px 6px; border: 1px solid var(--line); border-radius: 4px; font-size: 10px; }
        .candidate-entry[data-status="pass"] .candidate-status { color: var(--healthy); background: var(--healthy-soft); }
        .candidate-entry[data-status="fail"] .candidate-status { color: var(--danger); background: var(--danger-soft); }
        .candidate-entry[data-status="pending"] .candidate-status, .candidate-entry[data-status="stale"] .candidate-status { color: var(--warning); background: var(--warning-soft); }
        .candidate-inspection { margin: 0; border-top: 1px solid var(--line-soft); font-size: 11px; line-height: 1.6; }
        .candidate-inspection > summary { padding: 7px 12px; cursor: pointer; color: var(--muted); font-size: 10px; }
        .candidate-inspection[open] > summary { color: var(--accent); }
        .candidate-inspection > :not(summary) { margin: 0 12px 10px; overflow-wrap: anywhere; }
        .candidate-inspection dl { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 4px 12px; }
        .candidate-inspection dt { color: var(--muted); }
        .candidate-inspection dd { margin: 0; }
        .candidate-head button { border: 0; border-radius: 2px; background: transparent; padding: 8px 0; color: inherit; font: inherit; font-size: 10px; text-align: right; }
        .candidate-head > span:nth-child(n+2) { text-align: right; }
        .candidate-head button[aria-pressed="true"] { color: var(--accent); }
        .candidate-head button[aria-pressed="true"]::after { content: " ↓"; }
        .candidate-head button[aria-pressed="true"][data-sort-direction="ascending"]::after { content: " ↑"; }
        .algorithm-note { margin: 12px 0; padding: 12px 14px; border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 5px; background: var(--accent-soft); font-size: 12px; line-height: 1.6; }
        .algorithm-note p { margin: 4px 0 0; color: var(--text-soft); font-size: 11px; }
        .panel[data-fullscreen="true"] { inset: 12px !important; width: calc(100vw - 24px); height: calc(100dvh - 24px); max-height: none; }
        .candidate-section > .selector-search-status { margin: 0 12px 10px; }
        .candidate-section > .text-button { margin: 10px 12px; }
        @media (max-width: 980px) and (min-width: 641px) {
          .candidate-filter-controls { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .candidate-head, .candidate-row-v2 { grid-template-columns: minmax(110px, 1.5fr) 54px minmax(90px, 1fr) 75px 75px 60px 68px; }
        }
        @media (max-width: 640px) {
          .candidate-head { display: none; }
          .candidate-filter-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .candidate-filter-controls > .selector-search { grid-column: 1 / -1; }
          .candidate-row-v2 { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; min-height: 0; padding: 12px; }
          .candidate-row-v2 > :nth-child(1) { grid-column: 1 / 3; }
          .candidate-row-v2 > :nth-child(3) { grid-column: 3 / 5; grid-row: 1; }
          .candidate-row-v2 > :nth-child(2) { grid-column: 1; grid-row: 2; text-align: left; }
          .candidate-row-v2 > :nth-child(4), .candidate-row-v2 > :nth-child(5), .candidate-row-v2 > :nth-child(6) { grid-row: 2; font-size: 11px; }
          .candidate-row-v2 > :nth-child(7) { grid-column: 1 / -1; text-align: right; }
          .candidate-row-v2 > :nth-child(2)::before { display: block; content: "倍率"; color: var(--muted); font-size: 9px; margin-bottom: 3px; }
          .candidate-row-v2 > :nth-child(4)::before { display: block; content: "1h 缓存"; color: var(--muted); font-size: 9px; margin-bottom: 3px; }
          .candidate-row-v2 > :nth-child(5)::before { display: block; content: "1h 成功率"; color: var(--muted); font-size: 9px; margin-bottom: 3px; }
          .candidate-row-v2 > :nth-child(6)::before { display: block; content: "1h TPS"; color: var(--muted); font-size: 9px; margin-bottom: 3px; }
          .candidate-inspection dl { grid-template-columns: 85px minmax(0, 1fr); }
          .panel[data-fullscreen="true"] { inset: 0 !important; width: 100vw; height: 100dvh; }
        }
        .candidate:last-child { border-bottom: 0; }
        .candidate:hover { background: var(--surface-raised); }
        .candidate > span:first-child { overflow: hidden; color: var(--text); text-overflow: ellipsis; white-space: nowrap; }
        .candidate-head > span:not(:first-child), .candidate > span:not(:first-child) { text-align: center; }
        .candidate-ok { background: transparent; }
        .candidate-off { color: var(--muted); }
        .candidate-name { display: flex; align-items: center; gap: 8px; min-width: 0; }
        .candidate-name-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .candidate-name-with-media { gap: 6px; }
        .candidate-pelican {
          display: grid; place-items: center; flex: 0 0 28px; width: 28px; height: 28px;
          overflow: hidden; padding: 0; border: 1px solid var(--line-strong); border-radius: 4px;
          background: var(--surface-raised); color: var(--text-soft); font: inherit; font-size: 9px;
        }
        button.candidate-pelican { cursor: zoom-in; }
        button.candidate-pelican:hover { border-color: var(--accent); }
        button.candidate-pelican:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .candidate-pelican img { display: block; width: 100%; height: 100%; object-fit: contain; }
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
        .detection-image-dialog {
          width: min(1000px, calc(100vw - 24px)); max-height: calc(100dvh - 24px);
          padding: 16px; border: 1px solid var(--line-strong); border-radius: 12px;
          background: var(--menu); color: var(--text); pointer-events: auto;
          box-sizing: border-box; overflow: auto; font: 13px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
        }
        .detection-image-dialog::backdrop { background: var(--dialog-backdrop); }
        .detection-image-dialog [hidden] { display: none; }
        .detection-image-dialog .dialog-header { align-items: flex-start; }
        .detection-image-dialog .dialog-title { min-width: 0; overflow-wrap: anywhere; }
        .detection-image-dialog .icon-button { flex: 0 0 32px; width: 32px; height: 32px; }
        .detection-image-body { display: grid; place-items: center; min-height: min(300px, 45vh); }
        .detection-image-body img { display: block; max-width: 100%; max-height: calc(100dvh - 160px); object-fit: contain; }
        .detection-image-status { color: var(--text-soft); }
        .detection-image-original { display: inline-block; margin-top: 12px; color: var(--accent); text-underline-offset: 3px; }
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
          width: min(1160px, calc(100vw - 32px));
          height: min(790px, calc(100dvh - 32px));
          max-height: calc(100dvh - 24px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .work-nav { display: flex; flex-direction: column; gap: 4px; padding: 0 10px; }
        .work-nav button {
          border: 0;
          border-radius: 5px;
          background: transparent;
          color: var(--muted);
          font-size: 14px;
          font-weight: 550;
          transition: transform 100ms ease-out, background-color 140ms ease-out, color 140ms ease-out;
        }
        .work-nav { position: relative; isolation: isolate; }
        .work-nav button:hover { color: var(--text); background: var(--surface-raised); }
        .work-nav button:active { transform: scale(.97); transition-duration: 80ms; }
        .work-nav button[data-active="true"] { color: var(--accent); background: var(--accent-soft); font-weight: 650; }
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
        .statistics-chart { min-height: 188px; padding: 4px 12px 10px; overflow-x: auto; scrollbar-color: var(--line-strong) transparent; scrollbar-width: thin; }
        .statistics-chart svg { display: block; width: 100%; height: auto; overflow: visible; }
        .statistics-chart:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
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
          .panel { inset: 0; width: 100vw; height: 100dvh; max-height: 100dvh; border-radius: 0; }
          .command-deck { grid-template-columns: 1fr 1fr; }
          .route-grid, .diagnostics-grid { grid-template-columns: 1fr; }
          .route-grid > .section + .section, .diagnostics-grid > .section + .section { border-top: 1px solid var(--line); border-left: 0; }
        }
        @media (max-width: 390px) {
          .work-nav button { font-size: 9px; }
          .candidate-filter-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .nav-count { display: none; }
          .statistics-toolbar { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; }
          .statistics-overview { grid-template-columns: 1fr; }
          .statistics-overview > div + div { border-top: 1px solid var(--line-soft); border-left: 0; }
          .route-summary { grid-template-columns: 1fr; }
          .route-summary > div + div { border-top: 1px solid var(--line); border-left: 0; }
        }
        @media (max-width: 520px) {
          .panel { inset: 0; width: 100vw; height: 100dvh; max-height: 100dvh; border-radius: 0; }
          .launcher { right: 10px; bottom: 10px; }
          .advanced { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .monitor-scope-list { grid-template-columns: 1fr; }
          .candidate-head { display: none; }
          .candidate { grid-template-columns: minmax(0, 1fr); gap: 6px; padding: 10px 12px; }
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
          .scope-notice { grid-template-columns: minmax(0, 1fr); }
          .scope-dialog-actions { grid-template-columns: 1fr; }
          .actions { grid-template-columns: 1fr; }
        }
        .candidate.candidate-details {
          display: grid; grid-template-columns: 26px minmax(0, 1fr); column-gap: 8px; row-gap: 3px;
          height: 48px; min-height: 48px; box-sizing: border-box;
          padding: 5px 10px; align-items: center;
        }
        .candidate-media { grid-column: 1; grid-row: 1 / span 2; min-width: 0; }
        .candidate-media .candidate-pelican { width: 26px; height: 26px; }
        .candidate-details[data-current="true"] { background: var(--accent-soft); }
        .candidate-heading { grid-column: 2; display: flex; align-items: center; gap: 5px; height: 17px; min-width: 0; }
        .candidate-heading .candidate-name { flex: 1; min-width: 0; color: var(--text); }
        .candidate-heading .candidate-name-label {
          display: block; max-width: 100%; padding: 0; border: 0; border-radius: 2px; background: transparent;
          color: inherit; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          font: inherit; font-size: 12px; font-weight: 650; line-height: 17px; cursor: copy;
        }
        .candidate-heading .candidate-name-label:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
        .candidate-row-switch { flex: 0 0 34px; width: 34px; height: 20px; padding: 0; border: 1px solid var(--line); border-radius: 3px; background: var(--surface-raised); color: var(--accent); font: inherit; font-size: 10px; line-height: 18px; cursor: pointer; }
        .candidate-row-switch:hover:not(:disabled) { background: var(--accent-soft); }
        .candidate-row-switch:disabled { color: var(--text-soft); cursor: default; }
        .candidate-row-switch:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
        .candidate-current-tag { flex: 0 0 auto; padding: 1px 3px; border: 1px solid var(--accent); border-radius: 3px; color: var(--text); font-size: 8px; line-height: 1.2; }
        .candidate-heading .verdict { flex: 0 0 auto; max-width: 29%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; font-size: 10px; }
        .candidate-metrics, .candidate-column-labels {
          display: grid; grid-template-columns: 1.65fr 1fr 1fr 1.05fr .85fr 1fr;
          align-items: center; gap: 3px; margin: 0; font-variant-numeric: tabular-nums;
        }
        .candidate-metrics { grid-column: 2; min-width: 0; height: 15px; }
        .candidate-metric { min-width: 0; text-align: right; }
        .candidate-metric:first-child { text-align: left; }
        .candidate-metric dt { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
        .candidate-metric dd { margin: 0; overflow: hidden; text-overflow: ellipsis; font-size: 10px; line-height: 15px; white-space: nowrap; }
        .candidate-metrics .candidate-ratio { display: inline; color: var(--text-soft); font-size: 10px; }
        .candidate-metrics .health-value { display: inline; background: none; }
        .candidate-column-labels { padding: 5px 10px 5px 44px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); color: var(--text-soft); background: var(--surface-raised); font-size: 9px; line-height: 14px; }
        .candidate-column-labels > span { min-width: 0; text-align: right; white-space: nowrap; }
        .candidate-column-labels > span:first-child { text-align: left; }
        .settings-view > .section { padding: 16px; border-bottom: 1px solid var(--line); }
        .settings-view > .section:last-of-type { border-bottom: 0; }
        .settings-view .section-head { margin-bottom: 12px; }
        .settings-view .model-detection-setting { margin-top: 12px; padding-bottom: 0; }
        .settings-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
        .settings-label-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 20px; }
        .settings-label-row label { margin: 0; }
        .settings-label-row .text-button { flex-shrink: 0; padding: 0; font-size: 10px; }
        .settings-fields input, .settings-fields select { width: 100%; min-width: 0; }
        .settings-view .settings-billing-note { color: var(--text-soft); }
        .settings-disclosure { margin-top: 12px; border-top: 1px solid var(--line-soft); border-bottom: 0; }
        .settings-disclosure > summary { padding: 10px 0; color: var(--text-soft); cursor: pointer; font-size: 11px; }
        .settings-detail-content { display: grid; gap: 8px; padding-bottom: 4px; }
        .settings-protection .protection-bar { margin-bottom: 0; border-bottom: 0; }
        .settings-protection .route-settings-advanced { margin-top: 8px; border-bottom: 0; }
        .settings-protection .isolation-section { padding: 4px 0; border: 0; }
        .settings-secondary > .settings-appearance { margin: 0; border-top: 0; padding: 8px 0; }
        .settings-secondary .settings-footer { margin-top: 8px; padding: 12px 0 0; border-top: 1px solid var(--line-soft); }
        @media (max-width: 600px) { .settings-fields { grid-template-columns: minmax(0, 1fr); gap: 10px; } .monitor-scope-toolbar { grid-template-columns: minmax(0, 1fr) auto; } }
        .candidate-media-hint { margin: 0; padding: 6px 10px 0; border-top: 1px solid var(--line); color: var(--text-soft); font-size: 9px; }
        @media (max-width: 420px) {
          .candidate.candidate-details { padding-inline: 8px; column-gap: 6px; }
          .candidate-column-labels { padding-inline: 40px 8px; }
          .candidate-metrics, .candidate-column-labels { gap: 2px; }
          .candidate-heading .candidate-name-label { font-size: 11px; }
        }
        .settings-header { position: sticky; top: 0; z-index: 4; background: var(--native-option-bg); border-bottom: 1px solid var(--line); }
        .settings-heading { display: flex; align-items: center; gap: 12px; justify-content: space-between; padding: 14px 16px 8px; }
        .settings-heading h2 { margin: 0; font-size: 15px; }
        .settings-heading [role="status"] { min-width: 0; color: var(--muted); font-size: 10px; overflow-wrap: anywhere; text-align: right; }
        .settings-heading [data-invalid="true"] { color: var(--danger); }
        .settings-nav { display: flex; overflow-x: auto; padding: 0 12px; scrollbar-width: thin; }
        .settings-nav button { flex: 1 0 auto; min-height: 42px; padding: 8px; border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: transparent; color: var(--text-soft); font-size: 11px; font-weight: 600; white-space: nowrap; }
        .settings-nav button[aria-selected="true"] { color: var(--accent); border-bottom-color: var(--accent); }
        :host([data-resolved-theme="light"]) .settings-nav button[aria-selected="true"] { color: var(--accent); }
        .settings-nav button:hover { background: var(--surface-active); }
        .settings-page[hidden], .settings-nav button[hidden] { display: none; }
        .settings-page > .section { padding: 16px; }
        .settings-page > .section > .section-head { margin-bottom: 14px; }
        .settings-page[data-settings-page="protection"] .settings-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .settings-subheading { margin: 24px 0 12px; font-size: 12px; }
        .settings-hint { margin: 10px 0; color: var(--text-soft); font-size: 11px; line-height: 1.6; }
        .settings-check-times { display: flex; flex-wrap: wrap; gap: 6px 18px; color: var(--muted); font-size: 10px; }
        .settings-check-times b { color: var(--text-soft); font-weight: 500; font-variant-numeric: tabular-nums; }
        .settings-count { margin-left: 8px; color: var(--muted); font-size: 10px; font-weight: 500; }
        .settings-page .field { min-width: 0; }
        .settings-page label { line-height: 1.5; }
        .settings-page input[aria-invalid="true"] { border-color: var(--danger); }
        .settings-page .settings-disclosure > summary { min-height: 42px; }
        .settings-page :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .status[data-tone="running"]::before { animation: status-breathe 2s ease-in-out infinite; }
        @keyframes status-breathe { 0%, 100% { opacity: .65; transform: scale(.92); outline: 0 solid var(--warning-soft); } 50% { opacity: 1; transform: scale(1.08); outline: 4px solid var(--warning-soft); } }
        /* The approved workbench keeps navigation fixed beside one scrolling content area. */
        .panel { width: min(1160px, calc(100vw - 32px)); height: min(790px, calc(100dvh - 32px)); font-size: 14px; line-height: 1.45; }
        .header { position: relative; flex: 0 0 auto; min-height: 60px; gap: 12px; padding: 10px 20px; background: var(--surface); }
        .header-copy { display: flex; align-items: center; gap: 16px; }
        .title { font-size: 16px; font-weight: 700; }
        .brand-meta { gap: 8px; border-left: 1px solid var(--line); padding-left: 16px; }
        .brand-mark { border: 0; border-radius: 7px; background: var(--accent-soft); color: var(--accent); }
        .launcher, .token-menu, .manual-dialog, .isolation-toast { -webkit-backdrop-filter: none; backdrop-filter: none; }
        .workbench-body { display: grid; grid-template-columns: 186px minmax(0, 1fr); flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
        .work-sidebar { display: flex; flex-direction: column; gap: 10px; min-width: 0; min-height: 0; padding: 22px 0 14px; border-right: 1px solid var(--line); background: var(--surface-raised); }
        .sidebar-heading { display: grid; gap: 14px; padding: 0 19px; }
        .sidebar-heading strong { font-size: 12px; font-weight: 650; }
        .sidebar-heading > span { color: var(--muted); font-size: 11px; }
        .work-nav button { display: flex; align-items: center; gap: 10px; width: 100%; min-width: 0; min-height: 42px; padding: 9px 10px; text-align: left; }
        .nav-icon { display: inline-grid; place-items: center; width: 18px; flex: 0 0 18px; font-size: 17px; line-height: 1; }
        .nav-text { min-width: 0; }
        .nav-count { margin-left: auto; font-size: 11px; opacity: 1; }
        .sidebar-caption { margin: auto 18px 0; padding-top: 14px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; line-height: 1.7; overflow-wrap: anywhere; }
        .work-content { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; background: var(--surface); }
        .status { min-width: 0; min-height: 34px; padding: 7px 24px; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
        .status::before { width: 6px; height: 6px; box-shadow: none; }
        :host([data-resolved-theme="light"]) .status::before { box-shadow: none; }
        .workspace { min-width: 0; width: 100%; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; }
        .work-view { min-width: 0; }
        .view-heading, .view-intro { display: flex; align-items: flex-start; gap: 16px; padding: 17px 24px 13px; border: 0; }
        .heading-copy { min-width: 0; }
        .eyebrow { margin: 0 0 4px; color: var(--muted); font-size: 11px; font-weight: 600; }
        .view-heading h2, .view-intro h2, .settings-heading h2 { margin: 0; color: var(--text); font-size: 24px; font-weight: 720; line-height: 1.25; letter-spacing: -.5px; }
        .subhead, .view-intro p { max-width: 65ch; margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 1.55; }
        .view-intro { flex-direction: column; gap: 0; }
        .monitor-overview { display: grid; grid-template-columns: minmax(0, 1fr) 244px; align-items: stretch; gap: 16px; margin: 0 24px 16px; }
        .overview { min-width: 0; border: 1px solid var(--line); border-radius: 7px; background: var(--surface-raised); overflow: hidden; }
        .route-node { min-height: 88px; padding: 12px 14px; align-content: center; gap: 5px; }
        .metric-label { font-size: 12px; font-weight: 500; }
        .route-value, .route-best-value { font-family: inherit; font-size: 18px; font-weight: 650; line-height: 1.4; }
        .route-best-value { color: var(--accent); }
        .route-recommendation-meta { min-width: 0; overflow: hidden; color: var(--muted); font-size: 11px; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .route-apply { top: 10px; right: 10px; }
        .monitor-controls { display: grid; align-content: space-between; gap: 9px; min-width: 0; padding: 1px 0; }
        .route-meta { gap: 6px; font-size: 11px; }
        .route-meta strong { font-size: 11px; }
        .command-deck { gap: 7px; padding: 0; }
        .command-deck .button { min-height: 34px; border-radius: 5px; font-size: 12px; }
        .command-deck .button-check { border-color: var(--accent); background: var(--accent); color: var(--accent-ink); }
        .command-deck .button-manual { border-color: var(--line-strong); background: var(--surface); color: var(--text); }
        .monitor-auto-row { gap: 8px; padding: 0; border: 0; }
        .monitor-auto-copy { flex-direction: column; align-items: flex-start; gap: 1px; }
        .monitor-auto-copy strong { font-size: 12px; }
        .monitor-auto-copy span { max-width: 185px; font-size: 11px; }
        .usage-strip { margin: 0 24px 18px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); overflow: hidden; }
        .usage-item { padding: 11px 15px 12px; }
        .usage-item small { margin-bottom: 5px; font-size: 12px; font-weight: 500; }
        .usage-item strong { font-size: 20px; line-height: 1.2; font-weight: 650; }
        .section { padding: 18px 24px; }
        .section-title { font-size: 15px; font-weight: 650; }
        .section-meta { font-size: 11px; }
        .monitor-candidates { padding-top: 0; }
        .monitor-candidates .section-head { min-height: 24px; margin-bottom: 10px; padding: 0; }
        .candidate-filter-controls { grid-template-columns: minmax(145px, 1.55fr) repeat(4, minmax(0, 1fr)); gap: 7px; margin: 0 0 8px; }
        .candidate-filter-controls input, .candidate-filter-controls select { min-width: 0; width: 100%; height: 34px; border-radius: 5px; font-size: 11px; }
        .candidate-section > .selector-search-status { margin: 0 0 10px; font-size: 11px; line-height: 1.5; }
        .candidate-head, .candidate-row-v2 { grid-template-columns: minmax(140px, 1.7fr) 58px minmax(110px, 1.3fr) 78px 80px 60px 78px; gap: 7px; }
        .candidate-head { min-height: 35px; padding: 0 10px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--surface-raised); font-size: 11px; }
        .candidate-head button { font-size: 11px; }
        .candidate-row-v2 { min-height: 58px; padding: 9px 10px 5px; font-size: 12px; }
        .candidate-row-v2 strong { font-size: 13px; }
        .candidate-row-v2 small { font-size: 10px; line-height: 1.35; }
        .candidate-entry[data-current="true"] { background: color-mix(in srgb, var(--accent-soft) 45%, var(--surface)); }
        .candidate-entry:hover { background: var(--surface-raised); }
        .candidate-inspection { border-top: 0; }
        .candidate-inspection > summary { min-height: 0; padding: 2px 10px 7px; font-size: 10px; line-height: 1.4; }
        .candidate-inspection[open] > summary { padding-bottom: 10px; }
        .candidate-inspection > :not(summary) { font-size: 12px; }
        .scope-notice { margin: 0 24px 16px; font-size: 12px; }
        .scope-notice-item { flex-wrap: wrap; }
        .settings-header { background: var(--surface); }
        .settings-heading { align-items: flex-start; padding: 21px 24px 16px; }
        .settings-heading [role="status"] { padding-top: 8px; font-size: 12px; }
        .settings-nav { padding: 0 16px; gap: 5px; }
        .settings-nav button { flex: 0 0 auto; min-height: 43px; padding: 8px 12px; font-size: 13px; }
        .settings-page > .section { padding: 20px 24px; }
        .settings-page label, .settings-label-row label { font-size: 13px; }
        .settings-page input, .settings-page select, .token-select-trigger { min-width: 0; font-size: 13px; }
        .settings-hint, .algorithm-note p, .settings-detail-content, .settings-disclosure > summary { font-size: 12px; line-height: 1.65; }
        .settings-subheading, .automation-name { font-size: 14px; }
        .settings-fields, .control-grid { gap: 16px; }
        .monitor-scope-panel { margin: 12px 0 0; padding: 14px; background: var(--surface-raised); }
        .monitor-scope-option { font-size: 12px; }
        .monitor-scope-option small { font-size: 11px; }
        .settings-page .button, .settings-update { font-size: 12px; }
        .statistics-toolbar, .statistics-source, .statistics-summary { padding-inline: 24px; }
        .statistics-control > span, .statistics-source, .statistics-source strong, .statistics-summary, .statistics-overview small { font-size: 12px; }
        .statistics-control select { height: 36px; font-size: 13px; border-radius: 5px; }
        .statistics-overview { margin: 16px 24px 0; border: 1px solid var(--line); border-radius: 7px; }
        .statistics-overview > div { padding: 13px 16px; }
        .statistics-overview strong { font-size: 20px; }
        .statistics-chart { min-height: 210px; }
        .statistics-key-heading strong, .statistics-key-heading span, .diagnostic-caption { font-size: 12px; }
        .diagnostic-list { min-height: 180px; max-height: none; }
        .empty { padding: 28px 16px; font-size: 13px; line-height: 1.7; }
        @media (max-width: 1050px) and (min-width: 701px) {
          .workbench-body { grid-template-columns: 166px minmax(0, 1fr); }
          .monitor-overview { grid-template-columns: minmax(0, 1fr) 218px; gap: 12px; }
          .route-node { padding-inline: 12px; }
          .route-value, .route-best-value { font-size: 16px; }
          .candidate-head, .candidate-row-v2 { grid-template-columns: minmax(110px, 1.5fr) 48px minmax(90px, 1.2fr) 65px 65px 50px 65px; gap: 5px; }
          .candidate-head, .candidate-head button { font-size: 10px; }
        }
        @media (max-width: 900px) {
          .monitor-overview { grid-template-columns: minmax(0, 1fr); }
          .monitor-controls { grid-template-columns: minmax(0, 1fr) auto; gap: 8px 12px; align-items: center; }
          .monitor-controls > .route-meta { grid-column: 1; }
          .monitor-controls > .command-deck { grid-column: 2; grid-row: 1 / span 2; }
          .monitor-controls > .monitor-auto-row { grid-column: 1; }
          .monitor-auto-copy span { max-width: 155px; }
          .candidate-filter-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .candidate-filter-controls > .selector-search { grid-column: 1 / -1; }
          .candidate-head { display: none; }
          .candidate-row-v2 { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px 6px; padding: 12px 10px 8px; }
          .candidate-row-v2 > :nth-child(1) { grid-column: 1 / 3; }
          .candidate-row-v2 > :nth-child(3) { grid-column: 3 / 5; grid-row: 1; }
          .candidate-row-v2 > :nth-child(2) { grid-column: 1; grid-row: 2; text-align: left; }
          .candidate-row-v2 > :nth-child(4), .candidate-row-v2 > :nth-child(5), .candidate-row-v2 > :nth-child(6) { grid-row: 2; font-size: 12px; }
          .candidate-row-v2 > :nth-child(7) { grid-column: 1 / -1; text-align: right; }
          .candidate-row-v2 > :nth-child(2)::before, .candidate-row-v2 > :nth-child(4)::before, .candidate-row-v2 > :nth-child(5)::before, .candidate-row-v2 > :nth-child(6)::before { display: block; margin-bottom: 3px; color: var(--muted); font-size: 10px; }
          .candidate-row-v2 > :nth-child(2)::before { content: "倍率"; }
          .candidate-row-v2 > :nth-child(4)::before { content: "1h 缓存"; }
          .candidate-row-v2 > :nth-child(5)::before { content: "1h 成功率"; }
          .candidate-row-v2 > :nth-child(6)::before { content: "1h TPS"; }
        }
        @media (max-width: 700px) {
          .panel { inset: 0; width: 100vw; height: 100dvh; max-height: 100dvh; border: 0; border-radius: 0; }
          .header { min-height: 56px; gap: 8px; padding: 9px 12px; }
          .header-copy { display: grid; gap: 2px; }
          .title { font-size: 14px; }
          .brand-meta { padding: 0; border: 0; }
          .version { font-size: 10px; }
          .brand-mark { width: 31px; height: 31px; }
          .workbench-body { grid-template-columns: 56px minmax(0, 1fr); }
          .work-sidebar { padding-block: 12px; gap: 0; }
          .sidebar-heading, .sidebar-caption, .nav-text, .nav-count { display: none; }
          .work-nav { padding: 0 6px; gap: 8px; }
          .work-nav button { min-height: 42px; justify-content: center; padding: 8px 0; }
          .nav-icon { font-size: 20px; }
          .status { padding: 7px 14px; font-size: 11px; }
          .view-heading, .view-intro { padding: 18px 14px 15px; }
          .view-heading h2, .view-intro h2, .settings-heading h2 { font-size: 22px; }
          .subhead, .view-intro p { font-size: 12px; }
          .monitor-overview { margin: 0 14px 14px; gap: 12px; }
          .overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .route-node { min-height: 72px; padding: 12px; gap: 5px; }
          .route-primary { border-right: 0; border-bottom: 1px solid var(--line); }
          .route-value, .route-best-value { font-size: 16px; }
          .monitor-controls { grid-template-columns: minmax(0, 1fr); gap: 10px; }
          .monitor-controls > .route-meta, .monitor-controls > .command-deck, .monitor-controls > .monitor-auto-row { grid-column: 1; grid-row: auto; }
          .monitor-auto-copy { flex-direction: row; align-items: baseline; gap: 6px; }
          .monitor-auto-copy span { max-width: 118px; font-size: 10px; }
          .usage-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0 14px 18px; }
          .usage-item { padding: 11px 12px; }
          .usage-item strong { font-size: 18px; }
          .usage-item:nth-child(3) { border-left: 0; border-top: 1px solid var(--line-soft); }
          .usage-item:nth-child(4) { border-top: 1px solid var(--line-soft); }
          .section, .settings-page > .section { padding: 17px 14px; }
          .monitor-candidates { padding-top: 0; }
          .section-head { flex-wrap: wrap; gap: 5px 8px; }
          .section-title { font-size: 14px; }
          .section-meta { font-size: 10px; }
          .candidate-row-v2 .candidate-status { max-width: 100%; font-size: 10px; }
          .candidate-inspection > summary { overflow-wrap: anywhere; }
          .candidate-inspection dl { grid-template-columns: minmax(0, 1fr); }
          .scope-notice { grid-template-columns: minmax(0, 1fr); margin: 0 14px 14px; }
          .settings-heading { gap: 8px; padding: 18px 14px 14px; }
          .settings-heading [role="status"] { max-width: 75px; font-size: 11px; }
          .settings-nav { padding: 0 6px; }
          .settings-nav button { padding: 8px 10px; font-size: 12px; }
          .settings-fields, .control-grid, .settings-page[data-settings-page="protection"] .settings-fields { grid-template-columns: minmax(0, 1fr); }
          .monitor-scope-panel { padding: 10px; }
          .monitor-scope-list { grid-template-columns: minmax(0, 1fr); }
          .monitor-scope-toolbar { grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
          .monitor-scope-toolbar > input { grid-column: 1 / -1; }
          .settings-footer { flex-wrap: wrap; gap: 10px; }
          .settings-update { min-width: 0; }
          .statistics-toolbar, .statistics-source, .statistics-summary { padding-inline: 14px; }
          .statistics-toolbar { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; }
          .statistics-source { flex-wrap: wrap; }
          .statistics-overview { grid-template-columns: minmax(0, 1fr); margin-inline: 14px; }
          .statistics-overview > div + div { border-left: 0; border-top: 1px solid var(--line-soft); }
          .statistics-chart { min-height: 150px; padding-inline: 0; }
          .statistics-key-list { padding-inline: 0; }
          .diagnostic-list { min-height: 140px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .status[data-tone="running"]::before { animation: none; }
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
      <section class="panel" aria-label="${SITE_LABEL} 分组工作台">
        <header class="header" data-ref="header">
          <span class="brand-mark" aria-hidden="true">${SITE_SHORT_LABEL}</span>
          <span class="header-copy">
            <span class="header-title-row">
              <span class="title">${SITE_LABEL} 分组工作台</span>
              <span class="update-badge" data-ref="updateBadge" role="status" aria-live="polite" title="" hidden>NEW</span>
            </span>
            <span class="brand-meta"><span class="dot" data-ref="statusDot" title="监控状态"></span><span class="version" data-ref="version" title="当前插件版本">v${SCRIPT_VERSION}</span></span>
          </span>
          <button class="icon-button" data-ref="fullscreen" type="button" title="全屏工作台" aria-label="全屏工作台" aria-pressed="false">⛶</button>
          <button class="icon-button" data-ref="collapse" type="button" title="收起" aria-label="收起">−</button>
        </header>
        <div class="workbench-body">
        <aside class="work-sidebar" aria-label="分组工作台导航">
          <div class="sidebar-heading"><strong>${SITE_LABEL} 分组工作台</strong><span>工作区</span></div>
          <nav class="work-nav" aria-label="插件工作区" role="tablist" aria-orientation="vertical">
            <button id="kf-tab-monitor" data-view-target="monitor" data-active="true" role="tab" aria-label="监控" aria-controls="kf-view-monitor" aria-selected="true" type="button"><span class="nav-icon" aria-hidden="true">▤</span><span class="nav-text">分组监控</span><span class="nav-count" data-ref="candidateCount">0</span></button>
            <button id="kf-tab-statistics" data-view-target="statistics" data-active="false" role="tab" aria-label="统计" aria-controls="kf-view-statistics" aria-selected="false" type="button"><span class="nav-icon" aria-hidden="true">▥</span><span class="nav-text">用量统计</span></button>
            <button id="kf-tab-diagnostics" data-view-target="diagnostics" data-active="false" role="tab" aria-label="诊断" aria-controls="kf-view-diagnostics" aria-selected="false" type="button"><span class="nav-icon" aria-hidden="true">⌁</span><span class="nav-text">诊断记录</span><span class="nav-count" data-ref="logCount">0</span></button>
            <button id="kf-tab-settings" data-view-target="settings" data-active="false" role="tab" aria-label="设置" aria-controls="kf-view-settings" aria-selected="false" type="button"><span class="nav-icon" aria-hidden="true">⚙</span><span class="nav-text">偏好设置</span></button>
          </nav>
          <p class="sidebar-caption">监控范围决定参与检查的分组；列表筛选只改变显示。</p>
        </aside>
        <div class="work-content">
        <div class="status" data-ref="status" role="status" aria-live="polite"></div>
        <main class="workspace" data-ref="workspace">
        <section class="work-view" id="kf-view-monitor" data-view="monitor" role="tabpanel" aria-labelledby="kf-tab-monitor" tabindex="0">
        <div class="view-heading"><div class="heading-copy"><p class="eyebrow">分组监控</p><h2>运行概览</h2><p class="subhead">按所选目标模型的检测详情查看 1h 指标和自动切换准入。</p></div></div>
        <div class="monitor-overview">
        <section class="overview" aria-label="当前分组概览">
          <div class="route-primary route-node">
            <span class="metric-label">当前分组</span>
            <strong class="route-value" data-ref="currentGroup">-</strong>
          </div>
          <div class="route-best route-node">
            <span class="metric-label">策略推荐</span>
            <strong class="route-best-value" data-ref="bestGroup">-</strong>
            <span class="route-recommendation-meta" data-ref="bestGroupMeta">等待检查</span>
            <button class="icon-button route-apply" data-ref="switchNow" type="button" title="立即切到策略推荐分组" aria-label="立即切到策略推荐分组">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5"></path><path d="M4 20 21 3"></path><path d="M21 16v5h-5"></path><path d="m15 15 6 6"></path><path d="M4 4l5 5"></path></svg>
            </button>
          </div>
        </section>
        <div class="monitor-controls">
        <span class="route-meta">上次检查 <strong data-ref="lastCheck">-</strong></span>
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
          <span class="monitor-auto-copy"><strong>自动切换</strong><span data-ref="monitorMode">1h 综合质量</span></span>
          <label class="toggle" for="kf-monitor-enabled" title="自动切换">
            <input id="kf-monitor-enabled" data-ref="monitorEnabled" type="checkbox" aria-label="自动切换">
            <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
          </label>
        </div>
        </div>
        </div>
        <section class="scope-notice" data-ref="currentScopeWarning" role="status" aria-live="polite" hidden>
          <span>当前分组未纳入监控。该密钥的自动检查和切换已暂停；可加入监控范围，或从插件选择中移除密钥。</span>
          <button class="text-button" type="button" data-ref="removeOutOfScopeToken">移除密钥选择</button>
          <div class="scope-notice-list" data-ref="outOfScopeTokenList"></div>
        </section>
        <section class="usage-strip" aria-label="账户与今日用量">
          <div class="usage-item"><small>余额</small><strong class="mono" data-ref="balance">-</strong></div>
          <div class="usage-item" data-ref="todaySpendItem" data-spend-tone="none"><small>今日消费</small><strong class="mono" data-ref="todaySpend">-</strong></div>
          <div class="usage-item"><small>今日请求</small><strong class="mono" data-ref="todayRequests">-</strong></div>
          <div class="usage-item"><small>今日 Token</small><strong class="mono" data-ref="todayTokens">-</strong></div>
        </section>
        <section class="section candidate-section monitor-candidates">
          <div class="section-head"><h2 class="section-title">分组状态</h2><span class="section-meta" data-ref="candidateSummary">等待检查</span></div>
          <div class="candidate-filter-controls" ${IS_AIHUB ? "" : "hidden"}>
            <input class="selector-search" data-ref="candidateSearch" data-selector-search type="search" placeholder="搜索分组或模型" aria-label="搜索分组或模型" autocomplete="off" ${IS_AIHUB ? "" : "hidden"}>
            <select class="selector-platform" data-ref="candidatePlatform" aria-label="按平台筛选" ${IS_AIHUB ? "" : "hidden"}><option value="">全部平台</option></select>
            <select data-ref="candidateAvailabilityFilter" aria-label="按可用状态筛选"><option value="">全部可用状态</option><option value="available">可用</option><option value="unavailable">不可用</option></select>
            <select data-ref="candidateStatus" aria-label="检测状态筛选"><option value="">全部检测状态</option><option value="pass">检测通过</option><option value="fail">检测失败</option><option value="pending">检测中</option><option value="stale">数据过期</option><option value="notmatch">本轮不参与</option><option value="unknown">未知</option><option value="outscope">未纳入监控</option></select>
            <select data-ref="candidateSort" aria-label="分组列表排序"><option value="quality">综合推荐</option><option value="ratio">倍率：低到高</option><option value="success">1h 成功率：高到低</option><option value="cache">1h 缓存命中：高到低</option><option value="tps">1h TPS：高到低</option></select>
          </div>
          <p class="selector-search-status" data-ref="candidateSearchStatus" role="status" ${IS_AIHUB ? "" : "hidden"}></p>
          <div class="candidate-head" ${IS_AIHUB ? "" : "hidden"}>
            <span>分组 / 平台</span><button type="button" data-candidate-sort="ratio">倍率</button><span>模型检测详情</span><button type="button" data-candidate-sort="cache">1h 缓存命中</button><button type="button" data-candidate-sort="success">1h 成功率</button><button type="button" data-candidate-sort="tps">1h TPS</button><span>操作</span>
          </div>
          <div data-ref="candidateRows"></div>
          <button class="text-button" data-ref="candidateResetFilters" type="button" hidden>清除筛选</button>
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
                <option value="today">今天</option>
                <option value="yesterday">昨天</option>
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
          <div class="settings-header">
            <div class="settings-heading"><div class="heading-copy"><p class="eyebrow">偏好设置</p><h2>设置</h2><p class="subhead">管理监控范围、自动切换、检测保护与界面偏好。</p></div><span data-ref="settingsSave" role="status">已保存</span></div>
            <nav class="settings-nav" role="tablist" aria-label="设置分类">
              <button id="kf-settings-routing" data-settings-target="routing" role="tab" aria-controls="kf-settings-page-routing" aria-selected="false" tabindex="-1" type="button">自动切换</button>
              <button id="kf-settings-protection" data-settings-target="protection" role="tab" aria-controls="kf-settings-page-protection" aria-selected="false" tabindex="-1" type="button">检测保护</button>
              <button id="kf-settings-spending" data-settings-target="spending" role="tab" aria-controls="kf-settings-page-spending" aria-selected="false" tabindex="-1" type="button">消费提醒</button>
              <button id="kf-settings-appearance" data-settings-target="appearance" role="tab" aria-controls="kf-settings-page-appearance" aria-selected="false" tabindex="-1" type="button">界面更新</button>
            </nav>
          </div>
          <div class="settings-page" id="kf-settings-page-routing" data-settings-page="routing" role="tabpanel" aria-labelledby="kf-settings-routing" tabindex="0" hidden>
            <section class="section settings-group">
              <div class="section-head"><h2 class="section-title">监控分组</h2><span class="section-meta" data-ref="monitorScopeCount">全部分组</span></div>
              <p class="settings-hint">自动检查、健康判断和候选排序只处理已纳入的分组。页面筛选和排序只改变显示结果。</p>
              <div class="field">
                <label for="kf-monitor-scope-mode">监控范围</label>
                <select id="kf-monitor-scope-mode" data-ref="monitorScopeMode" aria-describedby="kf-monitor-scope-help">
                  <option value="all">全部分组</option>
                  <option value="selected">仅选择的分组</option>
                </select>
                <p class="settings-hint" id="kf-monitor-scope-help" data-ref="monitorScopeStatus" role="status">保存后下次检查生效；选择模式下空列表表示不监控任何分组。</p>
              </div>
              <div class="monitor-scope-panel" data-ref="monitorScopePanel">
                <div class="monitor-scope-toolbar">
                  <input class="selector-search" data-ref="monitorScopeSearch" data-selector-search type="search" placeholder="搜索分组名称、模型或 ID" aria-label="搜索监控范围分组" autocomplete="off">
                  <span class="section-meta" data-ref="monitorScopeCountDetail">0 个分组</span>
                  <button class="text-button" data-ref="monitorScopeSelectAll" type="button">全选</button>
                  <button class="text-button" data-ref="monitorScopeClear" type="button">清空</button>
                </div>
                <div class="monitor-scope-list" data-ref="monitorScopeList" role="group" aria-label="监控范围分组"></div>
                <div class="settings-footer">
                  <span data-ref="monitorScopeSearchStatus" class="selector-search-status" role="status"></span>
                  <button class="button button-primary" data-ref="monitorScopeSave" type="button">保存监控范围</button>
                </div>
              </div>
            </section>
        <section class="section control-section settings-section">
          <div class="section-head"><h2 class="section-title">自动路由</h2><span class="section-meta">密钥、模型与分组</span></div>
          <div class="automation-bar">
            <span class="automation-name">自动切换</span>
            <label class="toggle" for="kf-enabled" title="自动切换">
              <input id="kf-enabled" data-ref="enabled" type="checkbox" aria-label="自动切换">
              <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
            </label>
            <select class="switch-mode-select" data-ref="automaticSwitchMode" aria-label="自动切换模式" aria-describedby="kf-automatic-mode-help" title="自动切换模式">
              <option value="strategy">正常择优与恢复</option>
              <option value="failover">仅故障转移</option>
            </select>
          </div>
          <p id="kf-automatic-mode-help" class="settings-hint" data-ref="automaticSwitchHint">正常切换按 AIHub 1 小时质量指标排序；故障转移模式仅在当前组故障时切换。</p>
          <div class="algorithm-note"><strong>1h 综合质量排序</strong><p>成功率 40% · 缓存命中 30% · TPS 20% · 低倍率 10%。仅比较检测详情明确通过、指标完整且足够新鲜的同模型候选。</p></div>
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
                  <input class="selector-search" data-ref="tokenSearch" data-selector-search type="search" placeholder="搜索密钥名称或分组" aria-label="搜索 API 密钥" autocomplete="off">
                  <p class="selector-search-status" data-ref="tokenSearchStatus" role="status"></p>
                  <div class="token-toolbar">
                    <button class="text-button" data-ref="selectAllTokens" type="button">全选全部</button>
                    <button class="text-button" data-ref="clearTokens" type="button">清空全部</button>
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
                  <input class="selector-search" data-ref="modelSearch" data-selector-search type="search" placeholder="搜索模型或平台" aria-label="搜索目标模型或平台" autocomplete="off">
                  <p class="selector-search-status" data-ref="modelSearchStatus" role="status"></p>
                  <div class="token-toolbar">
                    <button class="text-button" data-ref="selectAllModels" type="button">全选全部</button>
                    <button class="text-button" data-ref="clearModels" type="button">清空全部</button>
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
                  <select class="selector-platform" data-ref="groupFilterPlatform" aria-label="名单分组平台分类" ${IS_AIHUB ? "" : "hidden"}><option value="">全部平台</option></select>
                  <input class="selector-search" data-ref="groupFilterSearch" data-selector-search type="search" placeholder="搜索分组" aria-label="搜索名单分组" autocomplete="off">
                  <p class="selector-search-status" data-ref="groupFilterSearchStatus" role="status"></p>
                  <div class="token-toolbar">
                    <button class="text-button" data-ref="clearGroupFilter" type="button">清空当前名单</button>
                  </div>
                  <div class="token-list" data-ref="groupFilterList"></div>
                </div>
              </div>
            </div>
          </div>
        </section>
          </div>
          <div class="settings-page" id="kf-settings-page-protection" data-settings-page="protection" role="tabpanel" aria-labelledby="kf-settings-protection" tabindex="0" hidden>
        <section class="section settings-group settings-protection">
          <div class="section-head"><h2 class="section-title">检测间隔</h2></div>
          <div class="settings-fields">
            <div class="field"><label for="kf-health-interval">故障检测间隔（秒）</label><input id="kf-health-interval" data-ref="pollSeconds" type="number" min="15" max="3600" step="any" required></div>
            <div class="field"><label for="kf-strategy-interval">分组择优间隔（分钟）</label><input id="kf-strategy-interval" data-ref="strategyMinutes" type="number" min="0.25" max="60" step="any" required></div>
          </div>
          <p class="settings-hint">当前组故障时立即寻找可用组，不等待择优周期。平台监控数据的更新速度也会影响故障发现时间。</p>
          <div class="settings-check-times"><span>故障检查 <b data-ref="lastHealthCheck">—</b></span><span>分组择优 <b data-ref="lastStrategyCheck">—</b></span></div>
          <h3 class="settings-subheading">切换保护</h3>
          <div class="settings-fields">
            <div class="field"><label for="kf-confirm">连续确认次数</label><input id="kf-confirm" data-ref="confirmPolls" type="number" min="1" max="10" step="1" required></div>
            <div class="field"><label for="kf-hold">正常切换后保持（分钟）</label><input id="kf-hold" data-ref="switchHoldMinutes" type="number" step="any" min="0" max="1440" required></div>
            <div class="field"><label for="kf-rollback">回滚观察次数（0关闭）</label><input id="kf-rollback" data-ref="rollbackChecks" type="number" min="0" max="10" step="1" required></div>
            <div class="field"><label for="kf-isolation">故障隔离时长（分钟）</label><input id="kf-isolation" data-ref="blacklistMinutes" type="number" step="any" min="1" max="1440" required></div>
          </div>
          <p class="settings-hint" data-ref="confirmationHint">连续确认按择优轮次计算，回滚观察按故障检测轮次计算。</p>
          <details class="settings-disclosure">
            <summary>健康判定与候选限制</summary>
            <div class="grid advanced">
              <div class="field"><label for="kf-min-success">1h 最低成功率（%）</label><input id="kf-min-success" data-ref="minSuccessRate" type="number" min="0" max="100" step="0.1" required></div>
              <div class="field"><label for="kf-min-metric-samples">模型最少样本数</label><input id="kf-min-metric-samples" data-ref="minMetricSamples" type="number" min="1" max="1000000" step="1" required></div>
              <div class="field"><label for="kf-min-cache-samples">缓存最少记录数</label><input id="kf-min-cache-samples" data-ref="minCacheSamples" type="number" min="1" max="1000000" step="1" required></div>
              <div class="field"><label>最大倍率（0 不限制）</label><input data-ref="maxGroupRatio" type="number" max="100000" min="0" step="0.01" required></div>
            </div>
            <p class="settings-hint">模型检测详情必须明确通过，并与目标模型精确匹配。1h 指标和缓存最多保留 60 分钟有效期；缺失或过期时暂停自动候选。</p>
          </details>
          <details class="settings-disclosure isolation-disclosure" data-ref="isolationRecords">
            <summary>故障隔离 <span class="settings-count" data-ref="isolationSummaryCount">0条</span></summary>
          <section class="section isolation-section" aria-labelledby="kf-isolation-title">
            <div class="section-head isolation-heading">
              <div class="isolation-heading-copy">
                <h2 class="section-title" id="kf-isolation-title">故障隔离</h2>
                <p class="isolation-description">明确故障时隔离，到期重新检查；不修改用户黑白名单</p>
              </div>
              <span class="isolation-actions">
                <span class="section-meta" data-ref="isolationCount">当前无隔离</span>
                <button class="text-button" data-ref="clearAllIsolations" type="button">清除全部</button>
              </span>
            </div>
            <div class="isolation-list" data-ref="isolationRows"></div>
        </section>
          </details>
        </section>
          </div>
          <div class="settings-page" id="kf-settings-page-spending" data-settings-page="spending" role="tabpanel" aria-labelledby="kf-settings-spending" tabindex="0" hidden>
        <section class="section settings-group settings-protection">
          <div class="section-head"><h2 class="section-title">每日消费提醒</h2></div>
          <p class="settings-hint">达到提醒额度时通知，不停止请求或自动切换。</p>
          <div class="protection-bar">
            <span class="protection-copy">
              <strong>消费提醒</strong>
              <small data-ref="spendProtectionStatus" data-tone="none">未启用</small>
            </span>
            <label class="toggle" for="kf-spend-protection" title="消费提醒仅提醒，不影响任务">
              <input id="kf-spend-protection" data-ref="spendProtectionEnabled" type="checkbox" aria-label="启用消费提醒">
              <span class="toggle-track" aria-hidden="true"><span class="toggle-thumb"></span></span>
            </label>
            <label class="spend-limit-field">
              <span>提醒额度</span>
              <input data-ref="dailySpendLimit" type="number" max="1000000000" min="0" step="0.01" aria-label="每日消费上限" required>
            </label>
            <button class="icon-button" data-ref="resetSpendProtection" type="button" title="从当前消费重新计数" aria-label="重新计数">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 3v6h6"></path></svg>
            </button>
          </div>
        </section>
          </div>
          <div class="settings-page" id="kf-settings-page-appearance" data-settings-page="appearance" role="tabpanel" aria-labelledby="kf-settings-appearance" tabindex="0" hidden>
        <section class="section settings-secondary settings-group" aria-labelledby="kf-appearance-title">
          <div class="section-head"><h2 class="section-title" id="kf-appearance-title">界面与更新</h2></div>
          <div class="settings-appearance">
            <span class="settings-appearance-copy"><strong>界面主题</strong><small>可跟随系统自动切换</small></span>
            <select class="theme-select" data-ref="theme" aria-label="插件皮肤">
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </div>
          <div class="settings-appearance">
            <span class="settings-appearance-copy"><strong id="kf-glass-transparency-label">界面透明度（兼容保留）</strong><small>2.0 工作台使用高对比不透明表面</small></span>
            <span class="glass-transparency-control">
              <input id="kf-glass-transparency" class="glass-transparency-range" data-ref="glassTransparency" type="range" min="0" max="100" step="1" aria-labelledby="kf-glass-transparency-label">
              <output class="glass-transparency-value mono" data-ref="glassTransparencyValue" for="kf-glass-transparency">0%</output>
            </span>
          </div>
          <div class="settings-footer">
            <span class="settings-version"><strong>脚本更新</strong><small>当前版本 v${SCRIPT_VERSION}</small></span>
            <button class="button settings-update" data-ref="checkUpdate" data-state="idle" data-update="none" type="button" title="检查更新" aria-label="检查更新">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.2 6.2L3 15"></path><path d="M3 21v-6h6"></path><path d="M3 12a9 9 0 0 1 15.2-6.2L21 9"></path><path d="M21 3v6h-6"></path></svg>
              <span data-ref="updateLabel">检查更新</span>
            </button>
          </div>
        </section>
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
        </div>
        </div>
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
            <select class="selector-platform" data-ref="manualGroupPlatform" aria-label="手动目标分组平台分类" ${IS_AIHUB ? "" : "hidden"}><option value="">全部平台</option></select>
            <input class="selector-search" data-ref="manualGroupSearch" data-selector-search type="search" placeholder="搜索目标分组" aria-label="搜索手动目标分组" autocomplete="off">
            <p class="selector-search-status" data-ref="manualGroupSearchStatus" role="status"></p>
            <div class="manual-group-list" data-ref="manualGroup" role="radiogroup" aria-labelledby="kf-manual-group-label"></div>
            <p class="dialog-hint" data-ref="manualHint"></p>
          </div>
          <div class="dialog-actions">
            <button class="button" data-ref="manualCancel" type="button">取消</button>
            <button class="button button-primary" data-ref="manualConfirm" type="button">确认切换</button>
          </div>
        </form>
      </dialog>
      <dialog class="scope-dialog" data-ref="manualScopeDialog" aria-labelledby="kf-manual-scope-title" aria-describedby="kf-manual-scope-target kf-manual-scope-risk kf-manual-scope-hint">
        <div class="scope-dialog-content">
          <h2 class="dialog-title" id="kf-manual-scope-title" data-ref="manualScopeTitle">目标分组未纳入监控</h2>
          <p class="dialog-hint" id="kf-manual-scope-target" data-ref="manualScopeTarget"></p>
          <p class="scope-dialog-risk" id="kf-manual-scope-risk" data-ref="manualScopeRisk"></p>
          <p class="dialog-hint" id="kf-manual-scope-hint" data-ref="manualScopeHint">请选择如何处理。仅本次切换不会修改保存的监控范围。</p>
          <div class="scope-dialog-actions">
            <button class="button button-primary" data-ref="manualScopeAdd" data-manual-scope="add" type="button">加入范围并切换</button>
            <button class="button" data-ref="manualScopeOnce" data-manual-scope="once" type="button">仅切换一次</button>
            <button class="button" data-ref="manualScopeCancel" data-manual-scope="cancel" type="button">取消</button>
          </div>
        </div>
      </dialog>
      <dialog class="detection-image-dialog" data-ref="detectionImageDialog" aria-labelledby="kf-detection-image-title">
        <div class="dialog-header">
          <h2 class="dialog-title" id="kf-detection-image-title" data-ref="detectionImageTitle">鹈鹕图片</h2>
          <button class="icon-button" data-ref="detectionImageClose" type="button" aria-label="关闭图片" title="关闭图片">×</button>
        </div>
        <div class="detection-image-body">
          <p class="detection-image-status" data-ref="detectionImageStatus" role="status"></p>
          <img data-ref="detectionImage" alt="" referrerpolicy="no-referrer" hidden>
        </div>
        <a class="detection-image-original" data-ref="detectionImageOriginal" target="_blank" rel="noopener noreferrer">在新标签页查看原图</a>
      </dialog>
    `;

    const refNames = [
      "candidatePlatform", "candidateSearch", "candidateSearchStatus", "candidateAvailabilityFilter", "candidateStatus", "candidateSort", "candidateResetFilters", "groupFilterPlatform", "manualGroupPlatform",
      "monitorScopeMode", "monitorScopeSearch", "monitorScopeList", "monitorScopeCount", "monitorScopeCountDetail", "monitorScopeSave", "monitorScopeSelectAll", "monitorScopeClear", "monitorScopeStatus", "monitorScopeSearchStatus", "monitorScopePanel", "currentScopeWarning", "outOfScopeTokenList", "removeOutOfScopeToken", "manualScopeDialog", "manualScopeTitle", "manualScopeTarget", "manualScopeRisk", "manualScopeHint", "manualScopeAdd", "manualScopeOnce", "manualScopeCancel",
      "automaticSwitchMode", "automaticSwitchHint", "tokenSearch", "tokenSearchStatus", "modelSearch", "modelSearchStatus", "groupFilterSearch", "groupFilterSearchStatus", "manualGroupSearch", "manualGroupSearchStatus",
      "detectionImageDialog", "detectionImageTitle", "detectionImageClose", "detectionImageStatus", "detectionImage", "detectionImageOriginal",
      "launcher", "panel", "header", "workspace", "statusDot", "version", "updateBadge", "theme", "glassTransparency", "glassTransparencyValue", "collapse", "fullscreen", "status", "currentGroup", "bestGroup",
      "lastCheck", "bestGroupMeta", "balance", "todaySpendItem", "todaySpend", "todayRequests", "todayTokens", "candidateCount", "candidateSummary", "tokenResultCount", "logCount", "settingsSection", "settingsSave", "strategyMinutes", "lastHealthCheck", "lastStrategyCheck", "confirmationHint", "enabled", "monitorEnabled", "monitorMode", "spendProtectionEnabled", "dailySpendLimit", "spendProtectionStatus", "resetSpendProtection",
      "statisticsMetric", "statisticsDays", "statisticsRefresh", "statisticsSource", "statisticsUpdated", "statisticsSummary", "statisticsLoading", "statisticsTotal", "statisticsAssigned", "statisticsCoverage", "statisticsTrendSummary", "statisticsTrend", "statisticsKeyRows",
      "tokenSelect", "tokenSelectToggle", "tokenSelectLabel", "tokenMenu", "tokenList", "tokenCount", "selectAllTokens", "clearTokens", "modelSelect", "modelSelectToggle", "modelSelectLabel", "modelCount", "modelMenu", "modelList", "selectAllModels", "clearModels", "groupFilterLabel", "groupFilterMode", "groupFilterSelect", "groupFilterSelectToggle", "groupFilterSelectLabel", "groupFilterCount", "groupFilterMenu", "groupFilterList", "clearGroupFilter", "pollSeconds",
      "minSuccessRate", "minMetricSamples", "minCacheSamples", "maxGroupRatio",
      "confirmPolls", "switchHoldMinutes", "rollbackChecks", "blacklistMinutes", "isolationRecords", "isolationSummaryCount",
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
