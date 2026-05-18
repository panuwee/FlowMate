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
    return <LoginScreen onSignIn={handleSignIn} isSigningIn={isSigningIn} />;
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

function LoginScreen({ onSignIn, isSigningIn }) {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      background: "linear-gradient(135deg, #F5F7FA 0%, #E4ECF2 100%)",
      fontFamily: "inherit",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 440,
        background: "#fff",
        borderRadius: 14,
        padding: "44px 40px 32px",
        boxShadow: "0 10px 40px rgba(46, 84, 109, 0.12), 0 2px 8px rgba(46, 84, 109, 0.06)",
        textAlign: "center",
        boxSizing: "border-box",
      }}>
        <img
          src="garena/logo_horizontal.png"
          alt="Garena"
          style={{ height: 28, marginBottom: 28, opacity: 0.9 }}
        />
        <div style={{
          fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
          color: "#8A99A6", fontWeight: 700, marginBottom: 6,
        }}>
          GD / VE creative workflow
        </div>
        <h1 style={{
          fontSize: 34, fontWeight: 700, margin: "0 0 12px",
          color: "var(--garena-deep-blue, #2E546D)", letterSpacing: "-0.02em",
        }}>
          FlowMate
        </h1>
        <p style={{
          fontSize: 13.5, lineHeight: 1.55, color: "#6B7C8A",
          margin: "0 auto 32px", maxWidth: 320,
        }}>
          Fair assignment, real-time capacity visibility, and lightweight task tracking — built for the Garena creative team.
        </p>

        <button
          onClick={onSignIn}
          disabled={isSigningIn}
          style={{
            width: "100%",
            padding: "12px 18px",
            fontSize: 14.5,
            fontWeight: 600,
            color: "#3C4043",
            background: "#fff",
            border: "1px solid #DADCE0",
            borderRadius: 8,
            cursor: isSigningIn ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            transition: "background 120ms, box-shadow 120ms, border-color 120ms",
            opacity: isSigningIn ? 0.7 : 1,
            fontFamily: "inherit",
          }}
          onMouseOver={(e) => { if (!isSigningIn) { e.currentTarget.style.background = "#F8F9FA"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(60,64,67,0.08)"; } }}
          onMouseOut={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <GoogleLogo />
          <span>{isSigningIn ? "Redirecting to Google…" : "Sign in with Google"}</span>
        </button>

        <div style={{
          marginTop: 28, paddingTop: 20,
          borderTop: "1px solid #EDF0F3",
          fontSize: 11.5, color: "#9BA8B3", lineHeight: 1.55,
        }}>
          Use your <strong style={{ color: "#6B7C8A" }}>@garena.com</strong> Workspace account.
          <br />
          Access requires an active GD/VE team profile.
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
