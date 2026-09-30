const CSS = `
.bp-hud {
  --text:#f1ede5; --muted:#b0aca3; --amber:#f5a45f; --red:#d55a4a; --line:#ffffff55;
  position:absolute; inset:0; overflow:hidden; pointer-events:none; user-select:none;
  color:var(--text); font:500 12px/1.35 'Segoe UI',Arial,sans-serif; letter-spacing:.04em;
}
.bp-hud * { box-sizing:border-box; }
.bp-edge { position:absolute; inset:0; background:radial-gradient(ellipse at center,transparent 57%,#08080640 100%); transition:background .25s; }
.bp-hud.low .bp-edge { background:radial-gradient(ellipse at center,transparent 30%,#8e211c9c 100%); }
.bp-flash { position:absolute; inset:0; opacity:0; background:radial-gradient(ellipse at center,transparent 45%,#d44033c9 100%); }
.bp-topline { position:absolute; top:22px; left:30px; right:265px; display:flex; align-items:flex-start; justify-content:space-between; }
.bp-location small,.bp-objective small,.bp-opponent small,.bp-hint small { display:block; color:var(--muted); font-size:9px; font-weight:700; letter-spacing:.19em; text-transform:uppercase; }
.bp-location strong { display:block; margin-top:3px; font-size:13px; font-weight:700; letter-spacing:.12em; }
.bp-objective { position:absolute; top:92px; left:30px; max-width:280px; border-left:2px solid var(--amber); padding-left:11px; }
.bp-objective strong { display:block; margin-top:3px; font-size:14px; font-weight:600; letter-spacing:.08em; }
.bp-opponent { position:absolute; top:24px; left:50%; width:min(370px,38vw); transform:translateX(-50%); text-align:center; }
.bp-opponent-head { display:flex; justify-content:space-between; align-items:baseline; gap:12px; text-align:left; }
.bp-opponent strong { font-size:11px; font-weight:800; letter-spacing:.17em; }
.bp-phase { color:var(--amber); font-size:9px; font-weight:700; letter-spacing:.13em; text-align:right; }
.bp-health-track { height:5px; margin-top:8px; overflow:hidden; background:#050504a8; }
.bp-health-fill { display:block; width:100%; height:100%; transform:scaleX(1); transform-origin:left; background:linear-gradient(90deg,#a44332,#e58050,#f3ba76); transition:transform .16s linear; }
.bp-target-lock { margin-top:5px; color:#e8dfcf99; font-size:8px; letter-spacing:.15em; }
.bp-target-lock.on { color:var(--amber); }
.bp-center-reticle { position:absolute; left:50%; top:50%; width:24px; height:24px; opacity:0; transform:translate(-50%,-50%); transition:opacity .16s; }
.bp-center-reticle::before,.bp-center-reticle::after { content:''; position:absolute; background:#fff9; }
.bp-center-reticle::before { left:11px; top:0; width:1px; height:24px; }
.bp-center-reticle::after { top:11px; left:0; width:24px; height:1px; }
.bp-center-reticle.on { opacity:.6; }
.bp-parry { position:absolute; left:50%; top:57%; transform:translate(-50%,-50%); padding:4px 10px; border-bottom:1px solid var(--amber); color:#ffdbac; font-size:10px; font-weight:800; letter-spacing:.18em; opacity:0; transition:opacity .08s; }
.bp-parry.show { opacity:1; }
.bp-bottom { position:absolute; left:26px; bottom:23px; display:flex; align-items:flex-end; gap:13px; }
.bp-radar-wrap { position:relative; width:102px; height:102px; flex:none; overflow:hidden; border:1px solid #ffffff70; border-radius:50%; background:radial-gradient(circle,#3c49447a 0,#19221fd1 58%,#080b0bdc 100%); box-shadow:0 2px 18px #0008; }
.bp-radar-wrap::before,.bp-radar-wrap::after { content:''; position:absolute; background:#ffffff32; }
.bp-radar-wrap::before { left:50%; top:0; bottom:0; width:1px; }
.bp-radar-wrap::after { top:50%; left:0; right:0; height:1px; }
.bp-radar-ring { position:absolute; inset:23%; border:1px solid #ffffff20; border-radius:50%; }
.bp-radar-player { position:absolute; left:50%; top:50%; z-index:2; width:7px; height:7px; border-radius:50%; transform:translate(-50%,-50%); background:#f4eadc; box-shadow:0 0 6px #fff8; }
.bp-radar-enemy { position:absolute; left:50%; top:50%; z-index:2; width:7px; height:7px; border-radius:50%; background:#ef6e51; box-shadow:0 0 8px #ef6e51; }
.bp-vitals { width:min(220px,26vw); padding-bottom:2px; text-shadow:0 1px 5px #000; }
.bp-vitals-head { display:flex; justify-content:space-between; margin-bottom:7px; color:#eee6db; font-size:9px; font-weight:800; letter-spacing:.12em; }
.bp-vital-row { display:flex; align-items:center; gap:8px; margin-top:6px; }
.bp-vital-label { width:42px; color:#bcb8af; font-size:8px; font-weight:700; letter-spacing:.12em; }
.bp-vital-track { position:relative; flex:1; height:5px; background:#050505a6; }
.bp-vital-fill { display:block; width:100%; height:100%; transform:scaleX(1); transform-origin:left; transition:transform .12s; }
.bp-hp-fill { background:#d95f51; }
.bp-st-fill { background:#d8c59b; }
.bp-ability { display:flex; align-items:center; gap:8px; margin:10px 0 0 50px; color:#ccc5b8; font-size:9px; }
.bp-ability-key { display:grid; place-items:center; width:22px; height:22px; border:1px solid #ffffff8a; border-radius:50%; color:#fff; font-size:9px; font-weight:700; }
.bp-ability.ready .bp-ability-key { border-color:var(--amber); color:var(--amber); box-shadow:0 0 9px #ef9d5d66; }
.bp-right-bottom { position:absolute; right:28px; bottom:28px; display:flex; flex-direction:column; align-items:flex-end; gap:8px; text-shadow:0 1px 5px #000; }
.bp-use { display:flex; align-items:center; gap:9px; opacity:0; transform:translateY(5px); transition:opacity .15s,transform .15s; }
.bp-use.show { opacity:1; transform:translateY(0); }
.bp-use-key { display:grid; place-items:center; min-width:25px; height:25px; border:1px solid #ffffffaa; border-radius:3px; font-size:10px; font-weight:800; }
.bp-use-text strong { display:block; color:#fff; font-size:10px; letter-spacing:.1em; }
.bp-use-text small { display:block; color:#c8c0b5; font-size:9px; }
.bp-controls { color:#e4ded3; font-size:9px; letter-spacing:.09em; opacity:.82; }
.bp-controls kbd { color:#fff; font:700 9px/1 'Segoe UI',Arial,sans-serif; }
.bp-utilities { position:absolute; z-index:5; top:20px; right:28px; display:flex; align-items:center; gap:16px; pointer-events:auto; }
.bp-utility { display:flex; align-items:center; gap:6px; padding:5px 0; border:0; border-bottom:1px solid #ffffff45; background:transparent; color:#eee8de; cursor:pointer; font:700 9px/1 'Segoe UI',Arial,sans-serif; letter-spacing:.1em; }
.bp-utility:hover,.bp-utility:focus-visible { color:var(--amber); border-color:var(--amber); outline:none; }
.bp-sound[aria-pressed='false'] { color:#b0aca3; }
.bp-pause-overlay { position:absolute; inset:0; z-index:15; display:none; align-items:center; justify-content:center; padding:18px; background:#070807db; pointer-events:auto; }
.bp-pause-overlay.show { display:flex; }
.bp-pause-panel { width:min(420px,92vw); padding:clamp(22px,5vw,38px); border-left:2px solid var(--amber); background:#11120f; box-shadow:0 15px 55px #000a; text-align:left; }
.bp-pause-panel small { color:var(--amber); font-size:9px; font-weight:800; letter-spacing:.2em; }
.bp-pause-panel h2 { margin:7px 0 18px; font-size:clamp(28px,5vw,42px); letter-spacing:.1em; }
.bp-pause-actions { display:grid; gap:8px; }
.bp-action { min-height:42px; padding:0 13px; border:1px solid #ffffff35; background:#ffffff08; color:#f1ede5; text-align:left; cursor:pointer; font:700 10px/1 'Segoe UI',Arial,sans-serif; letter-spacing:.12em; }
.bp-action:hover,.bp-action:focus-visible { border-color:var(--amber); color:#ffcb93; outline:none; }
.bp-banner-actions { display:flex; justify-content:center; gap:10px; flex-wrap:wrap; margin-top:22px; pointer-events:auto; }
.bp-banner-actions .bp-action { min-width:150px; text-align:center; }
.bp-toast { position:absolute; left:50%; top:42%; transform:translate(-50%,-50%); color:#fff; font-size:12px; font-weight:800; letter-spacing:.22em; text-shadow:0 2px 9px #000; opacity:0; white-space:nowrap; }
.bp-toast.show { animation:bp-toast .9s ease-out forwards; }
@keyframes bp-toast { 0%{opacity:0;transform:translate(-50%,-35%)} 16%{opacity:1;transform:translate(-50%,-50%)} 100%{opacity:0;transform:translate(-50%,-75%)} }
.bp-intro { position:absolute; left:7vw; top:42%; width:min(530px,75vw); text-shadow:0 2px 16px #000; animation:bp-intro 5.5s ease both; }
.bp-intro small { color:var(--amber); font-size:10px; font-weight:800; letter-spacing:.23em; }
.bp-intro h1 { margin:8px 0 7px; font:700 clamp(35px,6vw,66px)/.98 'Segoe UI',Arial,sans-serif; letter-spacing:.06em; }
.bp-intro p { max-width:390px; margin:0; color:#e5ddd1; font-size:13px; line-height:1.55; }
@keyframes bp-intro { 0%{opacity:0;transform:translateX(-14px)} 12%,72%{opacity:1;transform:translateX(0)} 100%{opacity:0;transform:translateX(0)} }
.bp-banner { position:absolute; inset:0; display:none; align-items:center; justify-content:center; flex-direction:column; background:#090a08d9; text-align:center; pointer-events:auto; }
.bp-banner.show { display:flex; }
.bp-banner small { color:var(--amber); font-size:10px; font-weight:800; letter-spacing:.2em; }
.bp-banner h1 { margin:9px 0 0; color:#f5eee3; font-size:clamp(34px,6vw,64px); letter-spacing:.1em; }
.bp-banner p { max-width:440px; margin:12px 20px 0; color:#d6cec2; font-size:12px; line-height:1.6; }
.bp-credits { position:absolute; inset:0; z-index:20; display:none; align-items:center; justify-content:center; padding:18px; background:#070807ed; pointer-events:auto; }
.bp-credits.show { display:flex; }
.bp-credits-panel { width:min(620px,94vw); max-height:82vh; overflow:auto; border-left:2px solid var(--amber); background:#11120f; padding:clamp(18px,4vw,30px); box-shadow:0 15px 55px #000a; }
.bp-credits-head { display:flex; align-items:flex-start; justify-content:space-between; gap:15px; margin-bottom:17px; }
.bp-credits-head small { color:var(--amber); font-size:9px; font-weight:800; letter-spacing:.18em; }
.bp-credits-head h2 { margin:5px 0 0; font-size:22px; letter-spacing:.1em; }
.bp-close { border:0; background:transparent; color:#eee; cursor:pointer; font:700 11px/1 'Segoe UI',Arial,sans-serif; letter-spacing:.08em; }
.bp-close:hover,.bp-close:focus-visible { color:var(--amber); outline:none; }
.bp-credit-list { display:grid; gap:11px; margin:0; padding:0; list-style:none; }
.bp-credit-list li { border-top:1px solid #ffffff22; padding-top:9px; }
.bp-credit-list strong { display:block; color:#eee6da; font-size:10px; letter-spacing:.1em; }
.bp-credit-list span { display:block; margin-top:3px; color:#c4beb3; font-size:11px; line-height:1.55; }
.bp-credit-list a { color:#f3b077; }
.bp-credit-note { margin:14px 0 0; color:#a8a196; font-size:9px; line-height:1.6; }
@media(max-width:720px) {
  .bp-topline { top:14px; left:14px; right:14px; }
  .bp-location strong { font-size:10px; }
  .bp-objective { top:65px; left:14px; }
  .bp-objective strong { font-size:11px; }
  .bp-opponent { top:58px; left:auto; right:14px; width:min(48vw,280px); transform:none; }
  .bp-opponent-head { display:block; text-align:right; }
  .bp-opponent strong,.bp-phase { display:block; font-size:8px; }
  .bp-health-track { margin-top:5px; }
  .bp-target-lock { font-size:7px; }
  .bp-topline { right:14px; }
  .bp-topline .bp-location:nth-child(2) { display:none; }
  .bp-utilities { top:10px; right:12px; gap:10px; }
  .bp-utility { font-size:8px; }
  .bp-bottom { left:12px; bottom:14px; gap:8px; }
  .bp-radar-wrap { width:78px; height:78px; }
  .bp-vitals { width:min(170px,43vw); }
  .bp-vitals-head { font-size:8px; }
  .bp-vital-row { gap:5px; }
  .bp-vital-label { width:35px; font-size:7px; }
  .bp-ability { margin:7px 0 0 40px; font-size:8px; }
  .bp-right-bottom { right:13px; bottom:18px; }
  .bp-controls { max-width:115px; text-align:right; font-size:8px; line-height:1.5; }
  .bp-intro { left:6vw; top:38%; width:88vw; }
}
@media(max-width:420px) {
  .bp-radar-wrap { width:66px; height:66px; }
  .bp-vitals { width:40vw; }
  .bp-controls { max-width:96px; }
}
@media(prefers-reduced-motion:reduce) { .bp-hud *, .bp-hud *::before, .bp-hud *::after { animation:none!important; transition:none!important; } }

/* DEEPHOLD field-interface redesign */
.bp-hud { --text:#eee9df; --muted:#b8b2a7; --amber:#d9a36e; --red:#c96250; letter-spacing:.025em; }
.bp-edge { background:linear-gradient(180deg,#03040342 0%,transparent 28%,transparent 76%,#03040355 100%); }
.bp-flash { background:radial-gradient(ellipse at center,transparent 48%,#b93b2fc2 100%); }
.bp-topline { top:24px; left:30px; right:30px; }
.bp-location small,.bp-objective small,.bp-opponent small,.bp-hint small { color:#bdb6aa; letter-spacing:.12em; }
.bp-location strong { font-size:12px; letter-spacing:.09em; }
.bp-objective { top:82px; left:30px; border:0; border-left:1px solid #d9a36e; background:linear-gradient(90deg,#090a09a6,transparent); padding:5px 12px; }
.bp-objective strong { font-size:12px; letter-spacing:.04em; }
.bp-opponent { top:24px; width:min(320px,32vw); padding:8px 12px 9px; background:#08090793; border-top:1px solid #ffffff32; }
.bp-opponent-head { align-items:center; }
.bp-opponent strong { font-size:10px; letter-spacing:.11em; }
.bp-phase { color:#d9a36e; font-size:8px; letter-spacing:.08em; }
.bp-health-track { height:4px; margin-top:7px; background:#000b; }
.bp-health-fill { background:linear-gradient(90deg,#8e3d32,#d66f51); }
.bp-target-lock { display:none; }
.bp-center-reticle { display:none; }
.bp-parry { top:60%; padding:3px 0; border-bottom-color:#d9a36e; color:#f0cfaa; font-size:9px; }
.bp-bottom { left:28px; bottom:24px; gap:0; }
.bp-radar-wrap { display:none; }
.bp-vitals { width:210px; padding:11px 13px 12px; background:linear-gradient(90deg,#080907c9,#08090782 84%,transparent); border-left:1px solid #ffffff58; text-shadow:none; }
.bp-vitals-head { margin-bottom:9px; color:#ded8ce; font-size:9px; letter-spacing:.14em; }
.bp-vital-row { margin-top:8px; gap:9px; }
.bp-vital-label { width:44px; font-size:8px; letter-spacing:.08em; }
.bp-vital-track { height:4px; background:#000b; }
.bp-hp-fill { background:#cc695b; }
.bp-st-fill { background:#c5ad86; }
.bp-ability { margin:10px 0 0 53px; color:#c8c0b2; font-size:8px; }
.bp-ability-key { width:18px; height:18px; border:1px solid #ffffff55; border-radius:2px; font-size:8px; }
.bp-ability.ready .bp-ability-key { border-color:#d9a36e; color:#e9b985; box-shadow:none; }
.bp-right-bottom { right:30px; bottom:29px; gap:7px; }
.bp-use-key { border-color:#ffffff75; border-radius:2px; }
.bp-controls { max-width:300px; padding:5px 8px; background:#0809079c; color:#c9c3b9; font-size:8px; letter-spacing:.045em; }
.bp-controls kbd { color:#f1ece3; }
.bp-utilities { top:22px; right:30px; gap:13px; }
.bp-utility { padding:6px 0; border-bottom-color:#ffffff36; color:#e0dbd2; font-size:8px; letter-spacing:.08em; }
.bp-utility:hover,.bp-utility:focus-visible { color:#f0c496; border-color:#d9a36e; }
.bp-intro { left:30px; top:auto; bottom:23%; width:min(390px,62vw); padding:10px 14px; border-left:1px solid #d9a36e; background:linear-gradient(90deg,#080907a8,transparent); animation-duration:4s; }
.bp-intro small { color:#d9a36e; font-size:8px; letter-spacing:.17em; }
.bp-intro h1 { margin:5px 0 4px; font-size:clamp(24px,3vw,38px); letter-spacing:.08em; }
.bp-intro p { max-width:340px; color:#d0c9bf; font-size:11px; }
.bp-toast { font-size:10px; letter-spacing:.14em; }
.bp-banner { background:#080907d9; }
.bp-banner small,.bp-pause-panel small,.bp-credits-head small { color:#d9a36e; }
.bp-banner h1 { letter-spacing:.07em; }
.bp-banner p { color:#cec7bc; }
.bp-pause-overlay,.bp-credits { background:#050605d9; backdrop-filter:blur(3px); }
.bp-pause-panel,.bp-credits-panel { border-left:1px solid #d9a36e; background:#11120feF; box-shadow:0 12px 38px #0008; }
.bp-action { border-color:#ffffff30; background:#ffffff06; border-radius:2px; letter-spacing:.08em; }
.bp-action:hover,.bp-action:focus-visible { border-color:#d9a36e; color:#f0c496; }
.bp-credit-list li { border-color:#ffffff20; }
.bp-credit-list strong { letter-spacing:.07em; }
.bp-credit-list a { color:#e6b98a; }
@media(max-width:720px) {
  .bp-topline { top:13px; left:14px; right:14px; }
  .bp-objective { top:60px; left:14px; }
  .bp-opponent { top:54px; right:14px; width:min(47vw,270px); padding:6px 8px; }
  .bp-opponent-head { display:flex; text-align:left; }
  .bp-phase { text-align:right; }
  .bp-utilities { top:10px; right:13px; gap:9px; }
  .bp-bottom { left:12px; bottom:12px; }
  .bp-vitals { width:min(188px,47vw); padding:8px 9px; }
  .bp-right-bottom { right:12px; bottom:14px; }
  .bp-controls { max-width:150px; line-height:1.5; }
  .bp-intro { left:14px; bottom:27%; width:82vw; }
}
@media(max-width:420px) {
  .bp-vitals { width:46vw; }
  .bp-vitals-head { font-size:8px; }
  .bp-controls { max-width:118px; }
  .bp-utility { font-size:7px; }
}
/* DeepHold's field UI is sparse, edge-anchored and legible over dark rock. */
.bp-hud { --text:#eee7dc; --muted:#bcb4a6; --amber:#d49b63; --red:#b94f43; letter-spacing:.015em; }
.bp-edge { background:linear-gradient(180deg,#05040366 0%,transparent 23%,transparent 75%,#05040383 100%); }
.bp-flash { background:radial-gradient(ellipse at center,transparent 48%,#8d261eaa 100%); }
.bp-topline { top:22px; left:24px; right:24px; }
.bp-location small,.bp-objective small,.bp-opponent small,.bp-hint small { color:#c5b9a7; letter-spacing:.12em; }
.bp-location strong { font-size:12px; letter-spacing:.06em; }
.bp-objective { top:76px; left:24px; border:0; border-left:2px solid #c58b56; background:linear-gradient(90deg,#080706a8,transparent); padding:6px 12px; }
.bp-objective strong { font-size:12px; letter-spacing:.025em; }
.bp-opponent { top:22px; width:min(330px,34vw); padding:0 0 8px; background:transparent; border:0; border-bottom:1px solid #eee7dc55; }
.bp-opponent-head { align-items:center; }
.bp-opponent strong { font-size:10px; letter-spacing:.1em; }
.bp-phase { color:#d7ad7f; font-size:8px; letter-spacing:.06em; }
.bp-health-track { height:4px; margin-top:7px; background:#080706c9; }
.bp-health-fill { background:linear-gradient(90deg,#8d352c,#c96b4d); }
.bp-parry { top:59%; padding:4px 9px; border-bottom:1px solid #d49b63; background:#090806ad; color:#f3dfc5; font-size:9px; letter-spacing:.1em; }
.bp-bottom { left:24px; bottom:23px; gap:0; }
.bp-radar-wrap { display:none; }
.bp-vitals { width:216px; padding:0; background:transparent; border:0; text-shadow:0 1px 5px #000; }
.bp-vitals-head { margin-bottom:7px; color:#eee7dc; font-size:9px; letter-spacing:.1em; }
.bp-vital-row { margin-top:6px; gap:8px; }
.bp-vital-label { width:48px; font-size:8px; letter-spacing:.07em; }
.bp-vital-track { height:4px; background:#090806c9; }
.bp-hp-fill { background:#c96b5e; }
.bp-st-fill { background:#c6ab81; }
.bp-ability { margin:8px 0 0 56px; color:#ddd2c3; font-size:8px; }
.bp-ability-key { width:18px; height:18px; border:1px solid #d8cbb855; border-radius:50%; font-size:8px; }
.bp-ability.ready .bp-ability-key { border-color:#e2ac73; color:#f0c391; box-shadow:0 0 7px #bb744455; }
.bp-right-bottom { right:28px; bottom:190px; gap:6px; }
.bp-use-key { border-color:#d9ccba99; border-radius:50%; }
.bp-controls { position:absolute; left:50%; bottom:19px; transform:translateX(-50%); max-width:min(690px,60vw); padding:0; background:none; color:#e2dbcf; font-size:8px; letter-spacing:.035em; text-align:center; text-shadow:0 1px 5px #000; }
.bp-controls kbd { color:#fff5e7; }
.bp-utilities { top:20px; right:24px; gap:14px; }
.bp-utility { padding:6px 0; border-bottom-color:#eee7dc55; color:#eee7dc; font-size:8px; letter-spacing:.07em; text-shadow:0 1px 4px #000; }
.bp-utility:hover,.bp-utility:focus-visible { color:#f0c496; border-color:#d49b63; }
.bp-intro { left:24px; top:auto; bottom:24%; width:min(390px,64vw); padding:8px 12px; border-left:2px solid #c58b56; background:linear-gradient(90deg,#080706ae,transparent); animation-duration:4.2s; }
.bp-intro small { color:#d49b63; font-size:8px; letter-spacing:.14em; }
.bp-intro h1 { margin:5px 0 4px; font-size:clamp(24px,3vw,38px); letter-spacing:.06em; }
.bp-intro p { max-width:340px; color:#e0d7ca; font-size:11px; }
.bp-toast { font-size:10px; letter-spacing:.1em; }
.bp-story { position:absolute; left:24px; top:36%; width:min(345px,68vw); padding:10px 14px; border-left:2px solid #d49b63; background:linear-gradient(90deg,#080706d9,#0807068a 78%,transparent); opacity:0; pointer-events:none; text-shadow:0 1px 6px #000; }
.bp-story.show { animation:bp-story 4.2s ease both; }
.bp-story small { display:block; color:#d49b63; font-size:8px; font-weight:800; letter-spacing:.15em; }
.bp-story strong { display:block; margin-top:5px; font-size:15px; letter-spacing:.04em; }
.bp-story p { margin:4px 0 0; color:#ded5c8; font-size:11px; line-height:1.45; }
@keyframes bp-story { 0%{opacity:0;transform:translateX(-8px)} 10%,78%{opacity:1;transform:translateX(0)} 100%{opacity:0} }
.bp-banner { background:#090806e8; }
.bp-banner small,.bp-pause-panel small,.bp-credits-head small { color:#d49b63; }
.bp-banner h1 { letter-spacing:.055em; }
.bp-banner p { color:#ded5c8; }
.bp-pause-overlay,.bp-credits { background:#080706e6; backdrop-filter:blur(2px); }
.bp-pause-panel,.bp-credits-panel { border-left:2px solid #c58b56; background:#151310f2; box-shadow:0 12px 38px #0009; }
.bp-action { border-color:#eee7dc33; background:#eee7dc08; border-radius:1px; letter-spacing:.06em; }
.bp-action:hover,.bp-action:focus-visible { border-color:#d49b63; color:#f0c496; }
.bp-credit-list li { border-color:#eee7dc22; }
.bp-credit-list strong { letter-spacing:.05em; }
.bp-credit-list a { color:#e4b884; }
@media(max-width:720px) {
  .bp-topline { top:12px; left:12px; right:12px; }
  .bp-objective { top:61px; left:12px; }
  .bp-opponent { top:56px; right:12px; width:min(48vw,260px); padding-bottom:5px; }
  .bp-opponent-head { display:flex; text-align:left; }
  .bp-phase { text-align:right; }
  .bp-utilities { top:8px; right:12px; gap:9px; }
  .bp-bottom { left:12px; bottom:12px; }
  .bp-vitals { width:min(180px,43vw); }
  .bp-right-bottom { right:12px; bottom:185px; }
  .bp-controls { display:none; }
  .bp-intro { left:12px; bottom:28%; width:82vw; }
  .bp-story { left:12px; top:34%; width:78vw; }
}
@media(max-width:420px) {
  .bp-vitals { width:40vw; }
  .bp-vitals-head { font-size:8px; }
  .bp-utility { font-size:7px; }
}
.bp-controls { position:absolute; left:50%; bottom:19px; transform:translateX(-50%); max-width:min(690px,60vw); padding:0; background:none; color:#e2dbcf; font-size:8px; letter-spacing:.035em; text-align:center; text-shadow:0 1px 5px #000; }
.bp-controls kbd { color:#fff5e7; }
.bp-story { position:absolute; left:24px; top:36%; width:min(345px,68vw); padding:10px 14px; border-left:2px solid #d49b63; background:linear-gradient(90deg,#080706d9,#0807068a 78%,transparent); opacity:0; pointer-events:none; text-shadow:0 1px 6px #000; }
.bp-story.show { animation:bp-story 4.2s ease both; }
.bp-story small { display:block; color:#d49b63; font-size:8px; font-weight:800; letter-spacing:.15em; }
.bp-story strong { display:block; margin-top:5px; font-size:15px; letter-spacing:.04em; }
.bp-story p { margin:4px 0 0; color:#ded5c8; font-size:11px; line-height:1.45; }
@keyframes bp-story { 0%{opacity:0;transform:translateX(-8px)} 10%,78%{opacity:1;transform:translateX(0)} 100%{opacity:0} }
@media(max-width:720px) {
  .bp-controls { display:none; }
  .bp-story { left:12px; top:34%; width:78vw; }
}
`;

const RING_CIRCUMFERENCE = 75.4;

export class FightHUD {
  constructor(options = {}) {
    const {
      host = document.getElementById('hud') || document.body,
      game = null,
      onSoundToggle = null,
      initialMuted = false,
    } = options;
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.el = document.createElement('div');
    this.el.className = 'bp-hud';
    this.el.innerHTML = `
      <div class="bp-edge"></div>
      <div class="bp-flash"></div>
      <div class="bp-topline">
        <div class="bp-location"><small>BLACKOUT PROTOCOL · LEVEL 03</small><strong>SHAFT 07 / 900 m</strong></div>
        <div class="bp-location" style="text-align:right"><small>DEEPHOLD MINE</small><strong>COOLING CHAMBER</strong></div>
      </div>
      <div class="bp-objective"><small>MISSION</small><strong>Take down the Handler</strong></div>
      <div class="bp-opponent"><div class="bp-opponent-head"><strong>THE HANDLER</strong><span class="bp-phase"></span></div><div class="bp-health-track"><i class="bp-health-fill"></i></div><div class="bp-target-lock"></div></div>
      <div class="bp-center-reticle"></div>
      <div class="bp-parry">PARRY NOW</div>
      <div class="bp-bottom">
        <div class="bp-radar-wrap" aria-label="Arena radar"><i class="bp-radar-ring"></i><i class="bp-radar-player"></i><i class="bp-radar-enemy"></i></div>
        <section class="bp-vitals" aria-label="Kai status"><div class="bp-vitals-head"><span>KAI NDLOVU</span><span class="bp-health-number">100%</span></div><div class="bp-vital-row"><span class="bp-vital-label">HEALTH</span><div class="bp-vital-track"><i class="bp-vital-fill bp-hp-fill"></i></div></div><div class="bp-vital-row"><span class="bp-vital-label">STAMINA</span><div class="bp-vital-track"><i class="bp-vital-fill bp-st-fill"></i></div></div><div class="bp-ability"><span class="bp-ability-key">Q</span><span class="bp-key-label">THE KEY · CHARGING</span></div></section>
      </div>
      <div class="bp-right-bottom"><div class="bp-use"><span class="bp-use-key">E</span><span class="bp-use-text"><strong></strong><small></small></span></div></div>
      <div class="bp-controls"><kbd>WASD</kbd> move · <kbd>LMB</kbd> combo · <kbd>RMB</kbd> guard / parry · <kbd>SPACE</kbd> dodge · <kbd>E</kbd> interact · <kbd>Q</kbd> Key pulse</div>
      <div class="bp-utilities"><button class="bp-utility bp-credits-open" type="button">FIELD CREDITS</button><button class="bp-utility bp-sound" type="button" aria-label="Toggle sound"></button><button class="bp-utility bp-pause-toggle" type="button" aria-label="Pause game">PAUSE</button></div>
      <div class="bp-toast" aria-live="polite"></div>
      <div class="bp-story" aria-live="polite"><small></small><strong></strong><p></p></div>
      <div class="bp-intro"><small>THE CHASE ENDS HERE</small><h1>SHAFT 07</h1><p>The mine has gone dark. Someone is waiting below.</p></div>
      <div class="bp-banner"><small>ENCOUNTER COMPLETE</small><h1></h1><p></p><div class="bp-banner-actions"><button class="bp-action bp-replay" type="button">PLAY AGAIN</button><button class="bp-action bp-banner-credits" type="button">FIELD CREDITS</button></div></div>
      <div class="bp-pause-overlay"><section class="bp-pause-panel" role="dialog" aria-modal="true" aria-labelledby="bp-pause-title"><small>BLACKOUT PROTOCOL · LEVEL 03</small><h2 id="bp-pause-title">PAUSED</h2><div class="bp-pause-actions"><button class="bp-action bp-resume" type="button">RESUME</button><button class="bp-action bp-restart" type="button">RESTART LEVEL</button><button class="bp-action bp-pause-credits" type="button">FIELD CREDITS</button></div></section></div>
      <div class="bp-credits" role="dialog" aria-modal="true" aria-labelledby="bp-credits-title"><div class="bp-credits-panel" tabindex="-1"><div class="bp-credits-head"><div><small>BLACKOUT PROTOCOL · DEEPHOLD</small><h2 id="bp-credits-title">FIELD CREDITS</h2></div><button class="bp-close" type="button">CLOSE</button></div><ul class="bp-credit-list"></ul><p class="bp-credit-note">Third-party assets remain under their listed licences. Level-specific geometry, UI, shader work, gameplay and original sound design are credited to the project team.</p></div></div>`;
    host.appendChild(this.el);

    this.game = game;
    this.onSoundToggle = onSoundToggle;
    this.soundMuted = initialMuted;
    this.credits = this.el.querySelector('.bp-credits');
    this.soundButton = this.el.querySelector('.bp-sound');
    this.creditsOpenButton = this.el.querySelector('.bp-credits-open');
    this.pauseButton = this.el.querySelector('.bp-pause-toggle');
    this.pauseOverlay = this.el.querySelector('.bp-pause-overlay');
    this.creditsClose = this.el.querySelector('.bp-close');
    this._pausedBeforeCredits = false;
    this.creditsClose.addEventListener('click', () => this.closeCredits());
    this.creditsOpenButton.addEventListener('click', () => this.openCredits());
    this.el.querySelector('.bp-banner-credits').addEventListener('click', () => this.openCredits());
    this.el.querySelector('.bp-pause-credits').addEventListener('click', () => this.openCredits());
    this.pauseButton.addEventListener('click', () => this.game?.setPaused(!this.game.paused));
    this.el.querySelector('.bp-resume').addEventListener('click', () => this.game?.setPaused(false));
    this.el.querySelector('.bp-restart').addEventListener('click', () => { this.game?.setPaused(false); this.game?.restart(); });
    this.el.querySelector('.bp-replay').addEventListener('click', () => { this.game?.setPaused(false); this.game?.restart(); });
    this.soundButton.addEventListener('click', () => {
      this.soundMuted = !this.soundMuted;
      this.onSoundToggle?.(this.soundMuted);
      this.setSoundMuted(this.soundMuted);
    });
    this._previousPauseHandler = game?.onPaused || null;
    this._pauseRelay = (paused) => {
      this._previousPauseHandler?.(paused);
      this.setPaused(paused);
    };
    if (game) game.onPaused = this._pauseRelay;
    this.setSoundMuted(this.soundMuted);

    const q = (selector) => this.el.querySelector(selector);
    this.bossFill = q('.bp-health-fill');
    this.phase = q('.bp-phase');
    this.hp = q('.bp-hp-fill');
    this.hpNumber = q('.bp-health-number');
    this.stamina = q('.bp-st-fill');
    this.lock = q('.bp-target-lock');
    this.reticle = q('.bp-center-reticle');
    this.keyIndicator = q('.bp-ability');
    this.keyLabel = q('.bp-key-label');
    this.keyKey = q('.bp-ability-key');
    this.story = q('.bp-story');
    this.toast = q('.bp-toast');
    this.flash = q('.bp-flash');
    this.use = q('.bp-use');
    this.useTitle = q('.bp-use-text strong');
    this.useDetail = q('.bp-use-text small');
    this.banner = q('.bp-banner');
    this.radarEnemy = q('.bp-radar-enemy');
    this.lastHp = 1;
  }

  setPaused(paused) {
    this.pauseOverlay.classList.toggle('show', !!paused && !this.credits.classList.contains('show'));
    this.pauseButton.textContent = paused ? 'RESUME' : 'PAUSE';
    this.pauseButton.setAttribute('aria-pressed', String(!!paused));
  }

  setCredits(rows) {
    const list = this.el.querySelector('.bp-credit-list');
    list.replaceChildren(...rows.map(({ title, html }) => {
      const li = document.createElement('li');
      const heading = document.createElement('strong');
      const detail = document.createElement('span');
      heading.textContent = title;
      detail.innerHTML = html;
      li.append(heading, detail);
      return li;
    }));
  }

  setBoss(frac, phaseName) {
    this.bossFill.style.transform = `scaleX(${Math.min(1, Math.max(0, frac))})`;
    this.phase.textContent = phaseName || '';
  }

  setPlayer(hpFrac, staminaFrac) {
    const hp = Math.min(1, Math.max(0, hpFrac));
    this.hp.style.transform = `scaleX(${hp})`;
    this.hpNumber.textContent = `${Math.round(hp * 100)}%`;
    this.stamina.style.transform = `scaleX(${Math.min(1, Math.max(0, staminaFrac))})`;
    this.el.classList.toggle('low', hp > 0 && hp < 0.25);
    this.lastHp = hp;
  }

  setKey(frac) {
    const charge = Math.min(1, Math.max(0, frac));
    const ready = charge >= 1;
    this.keyIndicator.classList.toggle('ready', ready);
    this.keyLabel.textContent = ready ? 'THE KEY · READY' : 'THE KEY · CHARGING';
    this.keyKey.style.background = ready ? '#d49b63' : 'transparent';
  }

  setParryWindow(on) { this.el.querySelector('.bp-parry').classList.toggle('show', !!on); }

  setLock(on) {
    this.lock.classList.toggle('on', on);
    this.lock.textContent = on ? 'LOCKED' : 'FREE CAMERA';
    this.reticle.classList.toggle('on', on);
  }

  setRadar(player, enemy, radius = 12.6) {
    const dx = enemy.x - player.x;
    const dz = enemy.z - player.z;
    const scale = 41 / Math.max(1, radius);
    this.radarEnemy.style.left = `${50 + THREELESS(dx * scale)}%`;
    this.radarEnemy.style.top = `${50 + THREELESS(-dz * scale)}%`;
  }

  setInteractPrompt(title = '', detail = '') {
    this.useTitle.textContent = title;
    this.useDetail.textContent = detail;
    this.use.classList.toggle('show', !!title);
  }

  setSoundMuted(muted) {
    this.soundMuted = !!muted;
    this.soundButton.textContent = this.soundMuted ? 'SOUND OFF' : 'SOUND ON';
    this.soundButton.setAttribute('aria-pressed', String(!this.soundMuted));
  }

  popup(text, color = '#ffffff') {
    this.toast.textContent = text;
    this.toast.style.color = color;
    this.toast.classList.remove('show');
    void this.toast.offsetWidth;
    this.toast.classList.add('show');
  }

  showStoryBeat(title, detail) {
    this.story.querySelector('small').textContent = 'DEEPHOLD · STORY';
    this.story.querySelector('strong').textContent = title;
    this.story.querySelector('p').textContent = detail;
    this.story.classList.remove('show');
    void this.story.offsetWidth;
    this.story.classList.add('show');
  }

  damageFlash() {
    this.flash.style.transition = 'none';
    this.flash.style.opacity = '1';
    void this.flash.offsetWidth;
    this.flash.style.transition = 'opacity .42s ease-out';
    this.flash.style.opacity = '0';
  }

  showBanner(title, subtitle, color = null) {
    const heading = this.banner.querySelector('h1');
    heading.textContent = title;
    if (color) heading.style.color = color;
    this.banner.querySelector('p').textContent = subtitle;
    this.banner.classList.add('show');
  }

  openCredits() {
    this._pausedBeforeCredits = !!this.game?.paused;
    this.credits.classList.add('show');
    this.game?.setPaused(true);
    this.creditsClose.focus();
  }

  closeCredits() {
    this.credits.classList.remove('show');
    this.game?.setPaused(this._pausedBeforeCredits);
    this.creditsOpenButton.focus();
  }

  dispose() {
    if (this.credits.classList.contains('show') && !this._pausedBeforeCredits) this.game?.setPaused(false);
    if (this.game?.onPaused === this._pauseRelay) this.game.onPaused = this._previousPauseHandler;
    this.el.remove();
    this.style.remove();
  }
}

function THREELESS(value) {
  return Math.max(6, Math.min(94, value));
}
