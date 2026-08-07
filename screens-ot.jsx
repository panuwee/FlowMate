const OT_REQUEST_VIEW_ROUTES = {
  overview: "ot-request",
  "my-requests": "ot-request/my-requests",
  manager: "ot-request/manager",
  "root-causes": "ot-request/root-causes",
};

function getOtRequestHashView() {
  const route = String(window.location.hash || "").replace(/^#/, "").split("/");
  if (route[0] !== "ot-request") return "overview";
  return OT_REQUEST_VIEW_ROUTES[route[1]] ? route[1] : "overview";
}

function canOpenOtRequestView(view, access) {
  if (view === "overview" || view === "my-requests") return true;
  return Boolean(access && (access.isEligibleApprover || access.isOwner || access.isHrAdmin));
}

function OtRequestShell({
  user,
  currentUserName,
  currentUserEmail,
  avatarMemberId,
  onHome,
  onSwitchFlowMate,
  onSwitchMarketingPlan,
  onSwitchProductBook,
  onSwitchOtRequest,
  onSignOut,
}) {
  const [access, setAccess] = useStateApp({ status: "loading", canManage: false, canExport: false, isOwner: false });
  const [activeView, setActiveView] = useStateApp(getOtRequestHashView);

  useEffectApp(() => {
    let alive = true;
    const loadAccess = window.loadOtAccessContext
      ? window.loadOtAccessContext()
      : Promise.reject(new Error("OT Request data service is not ready."));

    loadAccess
      .then(data => {
        if (!alive) return;
        const serverAccess = data || {};
        setAccess({
          status: "ready",
          ...serverAccess,
          canManage: Boolean(serverAccess.isEligibleApprover || serverAccess.isOwner || serverAccess.isHrAdmin),
          canExport: Boolean(serverAccess.isOwner || serverAccess.isHrAdmin),
        });
      })
      .catch(error => {
        if (alive) setAccess({ status: "error", canManage: false, canExport: false, isOwner: false, message: error.message });
      });

    return () => { alive = false; };
  }, [user && user.id]);

  useEffectApp(() => {
    function onHashChange() {
      setActiveView(getOtRequestHashView());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffectApp(() => {
    if (access.status === "loading") return;
    if (canOpenOtRequestView(activeView, access)) return;
    setActiveView("overview");
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#ot-request`);
  }, [access, activeView]);

  function openView(view) {
    if (!canOpenOtRequestView(view, access)) return;
    setActiveView(view);
    window.location.hash = OT_REQUEST_VIEW_ROUTES[view] || OT_REQUEST_VIEW_ROUTES.overview;
  }

  const visibleView = canOpenOtRequestView(activeView, access) ? activeView : "overview";
  const viewCopy = {
    overview: {
      eyebrow: "OT Request",
      title: "Weekly overtime overview",
      detail: "Review your overtime status and continue personal actions from one place.",
    },
    "my-requests": {
      eyebrow: "Personal",
      title: "My OT requests",
      detail: "Your request history and employee actions will appear here.",
    },
    manager: {
      eyebrow: "Manage",
      title: "Team OT overview",
      detail: "Authorized approvers can monitor assigned overtime workflows here.",
    },
    "root-causes": {
      eyebrow: "Understand",
      title: "Root causes",
      detail: "Authorized managers can review structured overtime drivers here.",
    },
  }[visibleView] || null;

  return (
    <div className="ot-shell">
      <FlowMatePromptHost />
      <div className="app__brand">
        <img src="garena/logo_graphic.png" alt="Garena" />
        <span className="app__brand-name">OT Request</span>
        <span className="app__brand-version">{FLOWMATE_APP_VERSION}</span>
      </div>
      <div className="app__topbar">
        <HomeButton onHome={onHome} />
        <ProductSwitch
          activeProduct="ot-request"
          onSwitchFlowMate={onSwitchFlowMate}
          onSwitchMarketingPlan={onSwitchMarketingPlan}
          onSwitchProductBook={onSwitchProductBook}
          onSwitchOtRequest={onSwitchOtRequest}
        />
        <span className="topbar__spacer" />
        <ThemeToggle />
        <div className="topbar__user" title={`Signed in as ${currentUserEmail}`}>
          <Avatar memberId={avatarMemberId} size="" />
          <span className="topbar__user-name">{currentUserName}</span>
        </div>
        <button type="button" className="topbar__btn" onClick={onSignOut}>Sign out</button>
      </div>
      <nav className="ot-sidebar" aria-label="OT Request navigation">
        <div className="nav-section">Personal</div>
        <button type="button" className={`nav-item ${visibleView === "overview" ? "is-active" : ""}`} aria-current={visibleView === "overview" ? "page" : undefined} onClick={() => openView("overview")}>
          <Icon name="calendar" size={16} /> Overview
        </button>
        <button type="button" className={`nav-item ${visibleView === "my-requests" ? "is-active" : ""}`} aria-current={visibleView === "my-requests" ? "page" : undefined} onClick={() => openView("my-requests")}>
          <Icon name="list" size={16} /> My requests
        </button>
        {access.status === "ready" && access.canManage && (
          <>
            <div className="nav-section">Manage</div>
            <button type="button" className={`nav-item ${visibleView === "manager" ? "is-active" : ""}`} aria-current={visibleView === "manager" ? "page" : undefined} onClick={() => openView("manager")}>
              <Icon name="users" size={16} /> Team OT
            </button>
            <button type="button" className={`nav-item ${visibleView === "root-causes" ? "is-active" : ""}`} aria-current={visibleView === "root-causes" ? "page" : undefined} onClick={() => openView("root-causes")}>
              <Icon name="chart" size={16} /> Root causes
            </button>
          </>
        )}
      </nav>
      <main className="ot-main ot-shell__main" aria-labelledby="ot-view-title">
        {access.status === "loading" && <div className="ot-warning" role="status"><span aria-hidden="true">ⓘ</span><span>Loading OT access…</span></div>}
        {access.status === "error" && <div className="ot-warning ot-warning--error" role="alert"><span aria-hidden="true">⚠</span><span>{access.message || "OT access could not be loaded."}</span></div>}
        {viewCopy && (
          <div>
            <div className="page-head">
              <div>
                <div className="eyebrow">{viewCopy.eyebrow}</div>
                <h1 id="ot-view-title">{viewCopy.title}</h1>
                <p className="muted">{viewCopy.detail}</p>
              </div>
            </div>
            <section className="ot-metric-grid" aria-label="OT workspace status">
              <div className="stat"><span>Weekly limit</span><strong>{access.weeklyLimitMinutes ? `${access.weeklyLimitMinutes / 60}h` : "—"}</strong></div>
              <div className="stat"><span>Timezone</span><strong>{access.timezone || "Asia/Bangkok"}</strong></div>
              <div className="stat"><span>Workweek</span><strong>{access.weekStartsOn === "monday" ? "Mon–Sun" : "—"}</strong></div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

window.OtRequestShell = OtRequestShell;
