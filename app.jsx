// FlowMate - app shell + routing
const { useState: useStateApp, useEffect: useEffectApp } = React;

const NAV = [
  { group: "Personal", items: [
    { key: "my-work", label: "My work",       icon: "inbox", count: 7 },
    { key: "create",  label: "Create",        icon: "plus" },
  ]},
  { group: "Team", items: [
    { key: "board",    label: "Board",         icon: "board" },
    { key: "list",     label: "List",          icon: "list" },
    { key: "queue",    label: "Central queue", icon: "queue", count: 4 },
  ]},
  { group: "Supervisor", items: [
    { key: "workload", label: "Workload",      icon: "users" },
    { key: "kpi",      label: "KPI",           icon: "chart" },
    { key: "settings", label: "Team settings", icon: "settings" },
  ]},
];

const TITLE_MAP = {
  "my-work": "My work", "create": "Create", "detail": "Work item",
  "list": "All work", "board": "Board", "queue": "Central queue",
  "workload": "Workload", "kpi": "KPI", "settings": "Team settings",
};

function App() {
  const [route, setRoute] = useStateApp(() => {
    const h = window.location.hash.replace("#", "");
    return h && TITLE_MAP[h.split("/")[0]] ? h.split("/")[0] : "my-work";
  });
  const [focusId, setFocusId] = useStateApp(null);
  const [searchQuery, setSearchQuery] = useStateApp("");
  // status: "loading" → "signed-in" | "signed-out".
  // Loading shows a small splash. Signed-out shows the Login landing page.
  // Signed-in renders the full FlowMate app.
  const [authState, setAuthState] = useStateApp({ status: "loading", user: null });
  const [isSigningIn, setIsSigningIn] = useStateApp(false);

  function nav(key) {
    setRoute(key);
    window.location.hash = key;
  }
  function open(id) {
    setFocusId(id);
    setRoute("detail");
    window.location.hash = `detail/${id}`;
  }

  useEffectApp(() => {
    function onHash() {
      const h = window.location.hash.replace("#", "");
      const [r, id] = h.split("/");
      if (r === "detail" && id) { setFocusId(id); setRoute("detail"); return; }
      if (TITLE_MAP[r]) setRoute(r);
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Initialise Supabase Auth in the background. If a Google session exists,
  // upgrade the topbar to "signed-in". Never blocks initial render so a
  // hanging or failing auth call cannot leave the page blank.
  useEffectApp(() => {
    let alive = true;
    if (!window.flowmateInitAuth) {
      setAuthState({ status: "signed-out", user: null });
      return;
    }

    // 5s safety timeout — if Supabase is unreachable we fall back to the
    // Login screen rather than leaving the user staring at a spinner.
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 5000));

    Promise.race([
      Promise.resolve().then(() => window.flowmateInitAuth()).catch((error) => {
        console.error("[FlowMate Auth] init failed:", error);
        return null;
      }),
      timeoutPromise,
    ]).then((realUser) => {
      if (!alive) return;
      if (realUser) {
        setAuthState({ status: "signed-in", user: realUser });

        // Restore the post-login route (set by flowmateSignInWithGoogle
        // before redirect). The OAuth callback lands us on the origin
        // with the access_token hash that Supabase has just cleared, so
        // without this step we'd never reach #my-work.
        let postLoginHash = null;
        try { postLoginHash = sessionStorage.getItem("flowmate:postLoginHash"); } catch (e) {}
        if (postLoginHash) {
          try { sessionStorage.removeItem("flowmate:postLoginHash"); } catch (e) {}
          if (TITLE_MAP[postLoginHash]) {
            window.location.hash = postLoginHash;
          }
        }
      } else {
        setAuthState({ status: "signed-out", user: null });
      }
    });

    return () => { alive = false; };
  }, []);

  async function handleSignIn() {
    setIsSigningIn(true);
    try {
      await window.flowmateSignInWithGoogle();
      // Browser is now redirecting to Google. Leave isSigningIn=true so
      // the button stays in its "Redirecting…" state until navigation.
    } catch (error) {
      console.error("[FlowMate Auth] sign-in failed:", error);
      window.alert("Sign-in failed: " + (error.message || "unknown error"));
      setIsSigningIn(false);
    }
  }

  async function handleSignOut() {
    try { await window.flowmateSignOut(); }
    catch (error) {
      console.error("[FlowMate Auth] sign-out failed:", error);
    }
  }

  // Gate the whole app on auth status.
  if (authState.status === "loading") {
    return <LoadingScreen />;
  }
  if (authState.status === "signed-out") {
    return <LoginScreen onSignIn={handleSignIn} isSigningIn={isSigningIn} authError={window.flowmateAuthError || null} />;
  }

  // Signed-in from here. Defensive accessors avoid optional chaining so
  // older Babel transpiles cannot trip on the render path.
  const user = authState.user || {};
  const currentUserName  = user.name  || "User";
  const currentUserEmail = user.email || "";
  const avatarMemberId   = user.team_member_id || null;

  return (
    <div className="app">
      <div className="app__brand">
        <img src="garena/logo_graphic.png" alt="Garena" />
        <span className="app__brand-name">FlowMate</span>
      </div>

      <div className="app__topbar">
        <div className="searchbar">
          <Icon name="search" size={14} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID, title, campaign, requester, assignee..."
          />
        </div>
        <span className="topbar__spacer"></span>
        <button className="topbar__btn" onClick={() => nav("create")}><Icon name="plus" /> Create</button>
        <button className="topbar__btn" disabled title="Notifications are planned for MVP 1.1">
          <Icon name="bell" /> Notifications (MVP 1.1)
        </button>
        <div className="topbar__user" title={`Signed in as ${currentUserEmail}`}>
          <Avatar memberId={avatarMemberId} size="" />
          <span className="topbar__user-name">{currentUserName}</span>
        </div>
        <button className="topbar__btn" onClick={handleSignOut} title="Sign out">
          Sign out
        </button>
      </div>

      <nav className="app__sidebar">
        {NAV.map(group => (
          <div key={group.group}>
            <div className="nav-section">{group.group}</div>
            {group.items.map(it => (
              <div
                key={it.key}
                className={`nav-item ${route === it.key ? "is-active" : ""}`}
                onClick={() => nav(it.key)}
              >
                <Icon name={it.icon} size={15} />
                <span>{it.label}</span>
                {it.count != null && <span className="nav-item__count">{it.count}</span>}
              </div>
            ))}
          </div>
        ))}

        <LiveStatus />
      </nav>

      <main className="app__main" key={route + (focusId || "")}>
        {route === "my-work"  && <MyWorkScreen   onOpen={open} onNav={nav} searchQuery={searchQuery} />}
        {route === "create"   && <CreateScreen   onNav={nav} />}
        {route === "detail"   && <DetailScreen   onNav={nav} onOpen={open} focusId={focusId} />}
        {route === "list"     && <ListScreen     onOpen={open} searchQuery={searchQuery} />}
        {route === "board"    && <BoardScreen    onOpen={open} />}
        {route === "queue"    && <QueueScreen    onOpen={open} searchQuery={searchQuery} />}
        {route === "workload" && <WorkloadScreen onOpen={open} />}
        {route === "kpi"      && <KpiScreen />}
        {route === "settings" && <SettingsScreen />}
      </main>
    </div>
  );
}

function LiveStatus() {
  const [tick, setTick] = useStateApp(0);
  const [lastSyncedAt, setLastSyncedAt] = useStateApp(() => Date.now());

  useEffectApp(() => {
    function onSynced() { setLastSyncedAt(Date.now()); }
    window.addEventListener("flowmate:synced", onSynced);
    const id = setInterval(() => setTick(t => t + 1), 15000);
    return () => { window.removeEventListener("flowmate:synced", onSynced); clearInterval(id); };
  }, []);

  // Refresh on browser tab focus (PRD section 9 minimum behaviour).
  useEffectApp(() => {
    function onFocus() { window.dispatchEvent(new CustomEvent("flowmate:refresh-request")); }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const seconds = Math.max(0, Math.floor((Date.now() - lastSyncedAt) / 1000));
  const label = seconds < 5 ? "just now" : seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
  void tick;
  return (
    <div style={{ padding: "16px 24px", marginTop: 24, borderTop: "1px solid var(--garena-light-grey)" }}>
      <div className="muted" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Live</div>
      <div className="row" style={{ gap: 6, fontSize: 12, color: "var(--garena-iron)" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--garena-positive)" }}></span>
        <span>Synced {label}</span>
      </div>
    </div>
  );
}

// =============================================================================
// Auth-gate UI
// =============================================================================
function LoadingScreen() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: 12,
      fontFamily: "inherit",
      color: "var(--garena-iron, #2E546D)",
      background: "var(--garena-light, #F5F7FA)",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        border: "3px solid var(--garena-light-grey, #d8dee4)",
        borderTopColor: "var(--garena-deep-blue, #2E546D)",
        animation: "flowmate-spin 0.9s linear infinite",
      }} />
      <div style={{ fontSize: 13 }}>Checking session…</div>
      <style>{`@keyframes flowmate-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" style={{ display: "block" }}>
      <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
      <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
      <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
      <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
    </svg>
  );
}

function LoginScreen({ onSignIn, isSigningIn, authError }) {
  return (
    <div className="flowmate-login">
      <style>{`
        .flowmate-login {
          position: fixed; inset: 0;
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
          box-sizing: border-box;
          font-family: inherit;
          overflow: hidden;
          background:
            radial-gradient(ellipse 80% 60% at 20% 0%,   rgba(192, 80, 77, 0.28), transparent 60%),
            radial-gradient(ellipse 70% 50% at 80% 100%, rgba(46, 84, 109, 0.42), transparent 60%),
            radial-gradient(ellipse 60% 80% at 50% 50%,  rgba(80, 40, 100, 0.22), transparent 70%),
            linear-gradient(135deg, #08101f 0%, #131830 45%, #1a1530 100%);
          background-size: 200% 200%;
          animation: flow-bg-pan 22s ease-in-out infinite;
        }

        /* Floating gradient orbs — Garena palette */
        .flowmate-login__orb { position: absolute; border-radius: 50%; filter: blur(90px); pointer-events: none; mix-blend-mode: screen; }
        .flowmate-login__orb--1 {
          width: 520px; height: 520px; top: -10%; left: -12%; opacity: 0.55;
          background: radial-gradient(circle, #c0504d 0%, transparent 70%);
          animation: flow-orb-1 26s ease-in-out infinite;
        }
        .flowmate-login__orb--2 {
          width: 600px; height: 600px; bottom: -14%; right: -14%; opacity: 0.5;
          background: radial-gradient(circle, #2E546D 0%, transparent 70%);
          animation: flow-orb-2 30s ease-in-out infinite;
        }
        .flowmate-login__orb--3 {
          width: 380px; height: 380px; top: 55%; left: 38%; opacity: 0.35;
          background: radial-gradient(circle, #BF6B00 0%, transparent 70%);
          animation: flow-orb-3 24s ease-in-out infinite;
        }

        /* Drifting grid lines for tech feel */
        .flowmate-login__grid {
          position: absolute; inset: 0; pointer-events: none; opacity: 0.06;
          background-image:
            linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
          -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
          animation: flow-grid-drift 40s linear infinite;
        }

        /* Glass card */
        .flowmate-login__card {
          position: relative; z-index: 1;
          width: 100%; max-width: 460px;
          background: rgba(20, 28, 50, 0.55);
          backdrop-filter: blur(28px) saturate(140%);
          -webkit-backdrop-filter: blur(28px) saturate(140%);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 22px;
          padding: 52px 44px 36px;
          box-shadow:
            0 24px 80px rgba(0, 0, 0, 0.55),
            0 2px 10px rgba(0, 0, 0, 0.35),
            inset 0 1px 0 rgba(255, 255, 255, 0.12);
          box-sizing: border-box;
          text-align: center;
          animation: flow-card-in 0.95s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        .flowmate-login__logo {
          height: 26px; opacity: 0.9;
          display: block; margin: 0 auto 28px;
          filter: brightness(0) invert(1);
          animation: flow-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both;
        }

        .flowmate-login__title {
          font-size: 58px; font-weight: 800; line-height: 1;
          letter-spacing: -0.035em;
          margin: 0 0 18px;
          background: linear-gradient(90deg,
            #ffffff 0%, #d5e3f0 30%, #ffffff 50%, #d5e3f0 70%, #ffffff 100%);
          background-size: 200% auto;
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent; color: transparent;
          animation:
            flow-fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both,
            flow-shimmer 6s linear infinite 1.2s;
        }

        .flowmate-login__tagline {
          font-size: 13.5px; line-height: 1.65;
          color: rgba(255, 255, 255, 0.7);
          margin: 0 auto 32px; max-width: 340px;
          animation: flow-fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.45s both;
        }

        .flowmate-login__btn {
          width: 100%; padding: 13px 18px;
          font-size: 14.5px; font-weight: 600; font-family: inherit;
          color: #1f2937; background: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.5);
          border-radius: 10px;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 12px;
          transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
                      box-shadow 220ms ease;
          animation:
            flow-fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.6s both,
            flow-btn-glow 3.4s ease-in-out infinite 1.6s;
          position: relative;
        }
        .flowmate-login__btn:not(:disabled):hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.4),
                      0 0 32px rgba(255, 255, 255, 0.18);
        }
        .flowmate-login__btn:not(:disabled):active { transform: translateY(0); }
        .flowmate-login__btn:disabled { cursor: not-allowed; opacity: 0.75; }

        .flowmate-login__footer {
          margin-top: 28px; padding-top: 22px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 11.5px; line-height: 1.6;
          color: rgba(255, 255, 255, 0.5);
          animation: flow-fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.8s both;
        }
        .flowmate-login__footer strong {
          color: rgba(255, 255, 255, 0.88); font-weight: 600;
        }

        /* Keyframes ------------------------------------------------------ */
        @keyframes flow-bg-pan {
          0%, 100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
        @keyframes flow-orb-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(60px, -40px) scale(1.15); }
          66%      { transform: translate(-40px, 50px) scale(0.92); }
        }
        @keyframes flow-orb-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(-70px, -50px) scale(1.1); }
        }
        @keyframes flow-orb-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(-40px, -60px) scale(0.95); }
          66%      { transform: translate(50px, 30px) scale(1.08); }
        }
        @keyframes flow-grid-drift {
          from { background-position: 0 0, 0 0; }
          to   { background-position: 96px 96px, 96px 96px; }
        }
        @keyframes flow-card-in {
          from { opacity: 0; transform: translateY(28px) scale(0.96); filter: blur(4px); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    filter: blur(0);    }
        }
        @keyframes flow-fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes flow-shimmer {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes flow-btn-glow {
          0%, 100% { box-shadow: 0 6px 22px rgba(0,0,0,0.35), 0 0 0    rgba(255,255,255,0); }
          50%      { box-shadow: 0 6px 22px rgba(0,0,0,0.35), 0 0 32px rgba(255,255,255,0.22); }
        }

        @media (max-width: 480px) {
          .flowmate-login__card  { padding: 40px 28px 28px; border-radius: 18px; }
          .flowmate-login__title { font-size: 46px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .flowmate-login,
          .flowmate-login__orb,
          .flowmate-login__grid,
          .flowmate-login__card,
          .flowmate-login__logo,
          .flowmate-login__title,
          .flowmate-login__tagline,
          .flowmate-login__btn,
          .flowmate-login__footer { animation: none !important; }
        }
      `}</style>

      <div className="flowmate-login__orb flowmate-login__orb--1" />
      <div className="flowmate-login__orb flowmate-login__orb--2" />
      <div className="flowmate-login__orb flowmate-login__orb--3" />
      <div className="flowmate-login__grid" />

      <div className="flowmate-login__card">
        <img src="garena/logo_horizontal.png" alt="Garena" className="flowmate-login__logo" />
        <h1 className="flowmate-login__title">FlowMate</h1>
        <p className="flowmate-login__tagline">
          real-time capacity visibility, and lightweight task tracking — built for the Garena team.
        </p>

        {authError && (
          <div style={{
            background: "rgba(192, 80, 77, 0.16)",
            border: "1px solid rgba(192, 80, 77, 0.35)",
            color: "#ffd8d6",
            borderRadius: 10,
            padding: "12px 14px",
            fontSize: 12.5,
            lineHeight: 1.55,
            textAlign: "left",
            marginBottom: 20,
          }}>
            {authError}
          </div>
        )}

        <button
          type="button"
          onClick={onSignIn}
          disabled={isSigningIn}
          className="flowmate-login__btn"
        >
          <GoogleLogo />
          <span>{isSigningIn ? "Redirecting to Google…" : "Sign in with Google"}</span>
        </button>

        <div className="flowmate-login__footer">
          Use your <strong>@garena.com</strong> Workspace account
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
