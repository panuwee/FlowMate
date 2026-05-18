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
  const [authState, setAuthState] = useStateApp({ status: "loading", user: null });

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

  // Initialise Supabase Auth. If a Google session exists, overwrite the
  // mock FLOWMATE_CURRENT_USER. Otherwise stay on the mock Pond identity
  // so the app remains usable while SSO is being rolled out.
  useEffectApp(() => {
    let alive = true;
    (async () => {
      try {
        const realUser = window.flowmateInitAuth ? await window.flowmateInitAuth() : null;
        if (!alive) return;
        if (realUser) {
          setAuthState({ status: "signed-in", user: realUser });
        } else {
          setAuthState({
            status: "signed-out",
            user: window.FLOWMATE_CURRENT_USER || null,
          });
        }
      } catch (error) {
        console.error("[FlowMate Auth] init failed:", error);
        if (alive) setAuthState({ status: "signed-out", user: window.FLOWMATE_CURRENT_USER || null });
      }
    })();
    return () => { alive = false; };
  }, []);

  async function handleSignIn() {
    try {
      await window.flowmateSignInWithGoogle();
    } catch (error) {
      console.error("[FlowMate Auth] sign-in failed:", error);
      window.alert("Sign-in failed: " + (error.message || "unknown error"));
    }
  }

  async function handleSignOut() {
    try { await window.flowmateSignOut(); }
    catch (error) {
      console.error("[FlowMate Auth] sign-out failed:", error);
    }
  }

  // While auth is initialising, show a tiny splash so we don't flash mock data
  // and immediately swap it out under the user.
  if (authState.status === "loading") {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--garena-iron)" }}>
        Loading FlowMate…
      </div>
    );
  }

  const currentUserName  = authState.user?.name  || "Pond";
  const currentUserEmail = authState.user?.email || "pond@garena.com";
  const isSignedIn       = authState.status === "signed-in";
  const avatarMemberId   = authState.user?.team_member_id || "m-pond";

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
        {isSignedIn ? (
          <>
            <div className="topbar__user" title={`Signed in as ${currentUserEmail}`}>
              <Avatar memberId={avatarMemberId} size="" />
              <span className="topbar__user-name">{currentUserName}</span>
            </div>
            <button className="topbar__btn" onClick={handleSignOut} title="Sign out">
              Sign out
            </button>
          </>
        ) : (
          <>
            <div className="topbar__user" title="Mock login (dev fallback) — not authenticated">
              <Avatar memberId={avatarMemberId} size="" />
              <span className="topbar__user-name">{currentUserName} (mock)</span>
            </div>
            <button className="topbar__btn" onClick={handleSignIn} title="Sign in with Google Workspace">
              <Icon name="users" /> Sign in with Google
            </button>
          </>
        )}
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

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
