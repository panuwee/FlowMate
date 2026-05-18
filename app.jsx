// FlowMate โ€” app shell + routing
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
        <button className="iconbtn" style={{ position: "relative" }} disabled title="Notifications are planned for MVP 1.1">
          <Icon name="bell" />
        </button>
        <div className="topbar__user" title="Mock login: Pond">
          <Avatar memberId="m-pond" size="" />
          <span className="topbar__user-name">Pond</span>
        </div>
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

        <div style={{ padding: "16px 24px", marginTop: 24, borderTop: "1px solid var(--garena-light-grey)" }}>
          <div className="muted" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Live</div>
          <div className="row" style={{ gap: 6, fontSize: 12, color: "var(--garena-iron)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--garena-positive)" }}></span>
            <span>Synced 12s ago - 5 online</span>
          </div>
        </div>
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

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
