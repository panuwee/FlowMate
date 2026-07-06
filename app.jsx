// FlowMate - app shell + routing
const { useState: useStateApp, useEffect: useEffectApp, useRef: useRefApp } = React;

const FLOWMATE_APP_VERSION = "v20260706-3";

const NAV = [
  { group: "Personal", items: [
    { key: "my-work", label: "My work",       icon: "inbox" },
    { key: "create",  label: "Create",        icon: "plus" },
  ]},
  { group: "Team", items: [
    { key: "board",    label: "Board",         icon: "board" },
    { key: "list",     label: "List",          icon: "list" },
    { key: "calendar", label: "Calendar",      icon: "calendar" },
    { key: "gantt",    label: "Gantt Chart",   icon: "chart" },
    { key: "queue",    label: "Central queue", icon: "queue" },
  ]},
  { group: "Supervisor", items: [
    { key: "workload", label: "Workload",      icon: "users" },
    { key: "kpi",      label: "KPI",           icon: "chart" },
    { key: "settings", label: "Team settings", icon: "settings" },
  ]},
];

const ADMIN_NAV_GROUP = { group: "Admin", items: [
  { key: "admin-whitelist", label: "Whitelist", icon: "users" },
]};

const MEMBER_NAV_GROUPS = NAV.filter(group => group.group === "Personal" || group.group === "Team");

const TITLE_MAP = {
  "my-work": "My work", "create": "Create", "detail": "Work item",
  "list": "All work", "board": "Board", "calendar": "Team calendar", "gantt": "Team Gantt chart", "queue": "Central queue",
  "planning-channel": "Channel View",
  "planning-campaign": "Campaign View",
  "planning-calendar": "Content Calendar",
  "workload": "Workload", "kpi": "KPI", "settings": "Team settings",
  "admin-whitelist": "Whitelist",
};

const MEMBER_ROUTE_KEYS = new Set(MEMBER_NAV_GROUPS.flatMap(group => group.items.map(item => item.key)).concat(["detail"]));
const MARKETING_PLAN_HASH_KEYS = new Set(["campaign-timeline", "channel-plan", "marketing-calendar", "working-sheet", "supervisor"]);

function getFlowMateHashRouteKey(hashValue) {
  return String(hashValue || window.location.hash || "").replace("#", "").split("/")[0];
}

function getVisibleNavGroups(role) {
  return role === "admin" ? [...NAV, ADMIN_NAV_GROUP] : MEMBER_NAV_GROUPS;
}

function isFlowMateRouteAllowedForRole(role, routeKey) {
  if (role === "admin") return Boolean(TITLE_MAP[routeKey]);
  return MEMBER_ROUTE_KEYS.has(routeKey);
}

function App() {
  const [route, setRoute] = useStateApp(() => {
    const h = getFlowMateHashRouteKey();
    return h && TITLE_MAP[h] ? h : "my-work";
  });
  const [focusId, setFocusId] = useStateApp(() => {
    const hash = String(window.location.hash || "").replace("#", "");
    return getFlowMateHashRouteKey(hash) === "detail" ? hash.split("/")[1] || null : null;
  });
  // O-6: `searchInput` is bound to the box (instant typing); `searchQuery` is
  // the debounced value passed to the screens. This stops every keystroke from
  // re-rendering the whole signed-in tree and re-running the O(n) grouping.
  const [searchInput, setSearchInput] = useStateApp("");
  const [searchQuery, setSearchQuery] = useStateApp("");
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useStateApp(false);
  const searchWrapRef = useRefApp(null);
  const [navCounts, setNavCounts] = useStateApp({});
  const [notifications, setNotifications] = useStateApp([]);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useStateApp(false);
  const [notificationLoadState, setNotificationLoadState] = useStateApp({ status: "idle", message: "" });
  const [markingNotificationId, setMarkingNotificationId] = useStateApp(null);
  const [isMarkingAllNotifications, setIsMarkingAllNotifications] = useStateApp(false);
  const [isDismissingReadNotifications, setIsDismissingReadNotifications] = useStateApp(false);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useStateApp(false);
  const [createModeIntent, setCreateModeIntent] = useStateApp("creative");
  const [isGlobalLeaveModalOpen, setIsGlobalLeaveModalOpen] = useStateApp(false);
  const [activeProduct, setActiveProduct] = useStateApp(() => {
    try {
      const hashKey = getFlowMateHashRouteKey();
      if (MARKETING_PLAN_HASH_KEYS.has(hashKey)) return "marketing-plan";
      if (TITLE_MAP[hashKey]) return "flowmate";
      const savedProduct = sessionStorage.getItem("flowmate:activeProduct");
      if (savedProduct === "flowmate" || savedProduct === "marketing-plan") return savedProduct;
    } catch (e) {}
    return null;
  });
  // status: "loading" → "signed-in" | "signed-out".
  // Loading shows a small splash. Signed-out shows the Login landing page.
  // Signed-in renders the full FlowMate app.
  const [authState, setAuthState] = useStateApp({ status: "loading", user: null });
  const [isSigningIn, setIsSigningIn] = useStateApp(false);
  const [realtimeState, setRealtimeState] = useStateApp(() => window.FLOWMATE_REALTIME_STATE || {
    status: "idle",
    message: "Realtime not started",
  });
  const [globalSearchRows, setGlobalSearchRows] = useStateApp([]);
  const [globalSearchLoadState, setGlobalSearchLoadState] = useStateApp({ status: "idle", message: "" });

  function nav(key) {
    setRoute(key);
    window.location.hash = key;
  }
  function open(id, options = {}) {
    if (!options.preserveBackContext && window.saveFlowMateDetailBackContext && route !== "detail") {
      window.saveFlowMateDetailBackContext({
        route,
        label: `Back to ${TITLE_MAP[route] || "Previous"}`,
      });
    }
    setFocusId(id);
    setRoute("detail");
    window.location.hash = `detail/${id}`;
  }

  async function refreshNotifications(options = {}) {
    if (!window.loadFlowMateNotifications) {
      setNotifications([]);
      setNotificationLoadState({ status: "error", message: "Notification loader is not ready." });
      return [];
    }
    if (options.showLoading) {
      setNotificationLoadState({ status: "loading", message: "Loading notifications..." });
    }
    try {
      const rows = await window.loadFlowMateNotifications();
      setNotifications(rows || []);
      setNotificationLoadState({ status: "live", message: "Live Supabase notifications" });
      return rows || [];
    } catch (error) {
      console.error("[FlowMate Notifications] Load failed:", error);
      setNotifications([]);
      setNotificationLoadState({ status: "error", message: window.flowmateUserError(error, "Notification load failed.") });
      return [];
    }
  }

  async function handleMarkNotificationRead(notification) {
    if (!notification || notification.readAt || !window.markFlowMateNotificationRead) return;
    setMarkingNotificationId(notification.id);
    try {
      const result = await window.markFlowMateNotificationRead(notification.id);
      const readAt = (result && result.read_at) || new Date().toISOString();
      setNotifications(rows => rows.map(row => (
        row.id === notification.id ? { ...row, readAt, isRead: true } : row
      )));
    } catch (error) {
      console.error("[FlowMate Notifications] Mark read failed:", error);
      setNotificationLoadState({ status: "error", message: window.flowmateUserError(error, "Mark read failed.") });
    } finally {
      setMarkingNotificationId(null);
    }
  }

  async function handleMarkAllNotificationsRead() {
    if (!window.markAllFlowMateNotificationsRead) return;
    setIsMarkingAllNotifications(true);
    try {
      await window.markAllFlowMateNotificationsRead();
      const readAt = new Date().toISOString();
      setNotifications(rows => rows.map(row => row.readAt ? row : { ...row, readAt, isRead: true }));
      refreshNotifications({ showLoading: false });
    } catch (error) {
      console.error("[FlowMate Notifications] Mark all read failed:", error);
      setNotificationLoadState({ status: "error", message: window.flowmateUserError(error, "Mark all read failed.") });
    } finally {
      setIsMarkingAllNotifications(false);
    }
  }

  async function handleDismissReadNotifications() {
    if (!window.dismissReadFlowMateNotifications) return;
    setIsDismissingReadNotifications(true);
    try {
      await window.dismissReadFlowMateNotifications();
      await refreshNotifications({ showLoading: false });
    } catch (error) {
      console.error("[FlowMate Notifications] Dismiss read failed:", error);
      setNotificationLoadState({ status: "error", message: window.flowmateUserError(error, "Clear read failed.") });
    } finally {
      setIsDismissingReadNotifications(false);
    }
  }

  function handleTopbarCreateChoice(choice) {
    setIsCreateMenuOpen(false);
    if (choice === "leave") {
      setIsGlobalLeaveModalOpen(true);
      return;
    }
    setCreateModeIntent(choice);
    nav("create");
  }

  async function handleOpenNotification(notification) {
    if (!notification) return;
    await handleMarkNotificationRead(notification);

    if (!notification.workItemId) {
      return;
    }

    try {
      if (window.loadFlowMateListRows && window.findFlowMateWorkItemById) {
        const rows = await window.loadFlowMateListRows();
        const row = window.findFlowMateWorkItemById(rows, notification.workItemId);
        if (row) {
          window.flowmateSelectedWorkItem = row;
          open(row.id);
          setIsNotificationCenterOpen(false);
          return;
        }
      }
      open(notification.workItemId);
      setIsNotificationCenterOpen(false);
    } catch (error) {
      console.error("[FlowMate Notifications] Open detail failed:", error);
      setNotificationLoadState({ status: "error", message: window.flowmateUserError(error, "Open notification failed.") });
    }
  }

  useEffectApp(() => {
    function onHash() {
      const h = window.location.hash.replace("#", "");
      const r = getFlowMateHashRouteKey(h);
      const id = h.split("/")[1];
      if (MARKETING_PLAN_HASH_KEYS.has(r)) {
        setActiveProduct("marketing-plan");
        try { sessionStorage.setItem("flowmate:activeProduct", "marketing-plan"); } catch (e) {}
      } else if (TITLE_MAP[r]) {
        setActiveProduct("flowmate");
        try { sessionStorage.setItem("flowmate:activeProduct", "flowmate"); } catch (e) {}
      }
      if (r === "detail" && id) { setFocusId(id); setRoute("detail"); return; }
      if (TITLE_MAP[r]) setRoute(r);
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // O-6: debounce search input -> searchQuery (200ms) so the screens only
  // re-filter once the user pauses typing.
  useEffectApp(() => {
    const id = setTimeout(() => setSearchQuery(searchInput), 200);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffectApp(() => {
    function onSearchOutsideMouseDown(event) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(event.target)) {
        setIsGlobalSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onSearchOutsideMouseDown);
    return () => document.removeEventListener("mousedown", onSearchOutsideMouseDown);
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

    // H-13: do NOT race the whole init against a hard timeout that commits to
    // "signed-out" — a slow-but-valid session would then be stuck on the login
    // screen with its real result discarded. Instead:
    //  - `decided` flips true when init resolves (the authoritative result).
    //  - the timeout only shows the login screen PROVISIONALLY while init is
    //    still in flight (so the user isn't stuck on a spinner).
    //  - init's resolution always applies, upgrading login -> app if a valid
    //    session arrives late. It never downgrades a resolved signed-in state.
    let decided = false;

    setTimeout(() => {
      if (!alive || decided) return;
      setAuthState({ status: "signed-out", user: null });
    }, 5000);

    Promise.resolve()
      .then(() => window.flowmateInitAuth())
      .catch((error) => {
        console.error("[FlowMate Auth] init failed:", error);
        return null;
      })
      .then((realUser) => {
        decided = true;
        window.flowmateInitialAuthSettled = true;
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
      window.alert("Sign-in failed: " + window.flowmateUserError(error, "unknown error"));
      setIsSigningIn(false);
    }
  }

  async function handleSignOut() {
    try { await window.flowmateSignOut(); }
    catch (error) {
      console.error("[FlowMate Auth] sign-out failed:", error);
    } finally {
      setActiveProduct(null);
      try { sessionStorage.removeItem("flowmate:activeProduct"); } catch (e) {}
    }
  }

  function chooseFlowMateProduct() {
    setActiveProduct("flowmate");
    try { sessionStorage.setItem("flowmate:activeProduct", "flowmate"); } catch (e) {}
    if (MARKETING_PLAN_HASH_KEYS.has(getFlowMateHashRouteKey())) {
      window.location.hash = route && TITLE_MAP[route] ? route : "my-work";
    }
  }

  function chooseMarketingPlanProduct() {
    setActiveProduct("marketing-plan");
    try { sessionStorage.setItem("flowmate:activeProduct", "marketing-plan"); } catch (e) {}
    if (!MARKETING_PLAN_HASH_KEYS.has(getFlowMateHashRouteKey())) {
      window.location.hash = "campaign-timeline";
    }
  }

  useEffectApp(() => {
    function onSwitchFlowMateProduct(event) {
      const routeKey = event && event.detail && event.detail.route ? event.detail.route : "my-work";
      setActiveProduct("flowmate");
      try { sessionStorage.setItem("flowmate:activeProduct", "flowmate"); } catch (e) {}
      if (TITLE_MAP[routeKey]) {
        setRoute(routeKey);
        window.location.hash = routeKey;
      }
    }
    window.addEventListener("flowmate:switch-flowmate-product", onSwitchFlowMateProduct);
    return () => window.removeEventListener("flowmate:switch-flowmate-product", onSwitchFlowMateProduct);
  }, []);

  useEffectApp(() => {
    function onRealtimeState(event) {
      setRealtimeState(event.detail || window.FLOWMATE_REALTIME_STATE || { status: "idle" });
    }
    window.addEventListener("flowmate:realtime-state", onRealtimeState);
    return () => window.removeEventListener("flowmate:realtime-state", onRealtimeState);
  }, []);

  useEffectApp(() => {
    if (authState.status !== "signed-in") {
      if (window.stopFlowMateRealtime) window.stopFlowMateRealtime();
      return;
    }
    if (window.startFlowMateRealtime) window.startFlowMateRealtime();
    return () => {
      if (window.stopFlowMateRealtime) window.stopFlowMateRealtime();
    };
  }, [authState.status]);

  useEffectApp(() => {
    if (authState.status !== "signed-in") return;
    let alive = true;

    async function refreshNavCounts() {
      if (!window.loadFlowMateListRows || !window.getFlowMateNavCounts) return;
      try {
        const rows = await window.loadFlowMateListRows();
        if (!alive) return;
        const currentUser = window.FLOWMATE_CURRENT_USER || authState.user || {};
        setNavCounts(window.getFlowMateNavCounts(rows, currentUser, window.MEMBERS || []));
      } catch (error) {
        console.error("[FlowMate Nav] Count refresh failed:", error);
      }
    }

    refreshNavCounts();
    window.addEventListener("flowmate:refresh-counts", refreshNavCounts);
    return () => {
      alive = false;
      window.removeEventListener("flowmate:refresh-counts", refreshNavCounts);
    };
  }, [authState.status, route]);

  useEffectApp(() => {
    if (authState.status !== "signed-in") {
      setNotifications([]);
      setIsNotificationCenterOpen(false);
      setNotificationLoadState({ status: "idle", message: "" });
      return;
    }

    let alive = true;
    async function loadRows() {
      const rows = await refreshNotifications({ showLoading: notifications.length === 0 });
      if (!alive) return;
      return rows;
    }

    loadRows();
    const cleanup = window.attachFlowMateLiveRefresh
      ? window.attachFlowMateLiveRefresh(loadRows)
      : () => {};
    return () => {
      alive = false;
      cleanup();
    };
  }, [authState.status]);

  useEffectApp(() => {
    if (authState.status !== "signed-in") {
      setGlobalSearchRows([]);
      setGlobalSearchLoadState({ status: "idle", message: "" });
      return;
    }

    let alive = true;
    async function refreshGlobalSearchRows() {
      if (!window.loadFlowMateListRows) {
        setGlobalSearchRows([]);
        setGlobalSearchLoadState({ status: "error", message: "Search loader is not ready." });
        return;
      }
      try {
        const rows = await window.loadFlowMateListRows();
        if (!alive) return;
        setGlobalSearchRows(rows || []);
        setGlobalSearchLoadState({ status: "live", message: "Search ready" });
      } catch (error) {
        if (!alive) return;
        console.error("[FlowMate Search] Global search load failed:", error);
        setGlobalSearchRows([]);
        setGlobalSearchLoadState({ status: "error", message: window.flowmateUserError(error, "Search load failed.") });
      }
    }

    refreshGlobalSearchRows();
    window.addEventListener("flowmate:refresh-request", refreshGlobalSearchRows);
    return () => {
      alive = false;
      window.removeEventListener("flowmate:refresh-request", refreshGlobalSearchRows);
    };
  }, [authState.status]);

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
  const isAdminUser = user.role === "admin";
  const visibleNavGroups = getVisibleNavGroups(user.role);
  const allowedRoute = isFlowMateRouteAllowedForRole(user.role, route);
  const unreadNotificationCount = notifications.filter(notification => !notification.readAt).length;
  const normalizedGlobalSearch = searchInput.trim();
  const globalSearchResults = normalizedGlobalSearch
    ? (globalSearchRows || [])
      .filter(row => window.matchesFlowMateSearch ? window.matchesFlowMateSearch(row, normalizedGlobalSearch) : false)
      .slice(0, 8)
    : [];

  function openGlobalSearchResult(row) {
    if (!row || !row.id) return;
    window.flowmateSelectedWorkItem = row;
    setSearchInput("");
    setSearchQuery("");
    setIsGlobalSearchOpen(false);
    open(row.id);
  }

  if (!activeProduct) {
    return (
      <ProductChoiceScreen
        user={user}
        currentUserName={currentUserName}
        currentUserEmail={currentUserEmail}
        avatarMemberId={avatarMemberId}
        onChooseFlowMate={chooseFlowMateProduct}
        onChooseMarketingPlan={chooseMarketingPlanProduct}
        onSignOut={handleSignOut}
      />
    );
  }

  if (activeProduct === "marketing-plan") {
    return (
      <MarketingPlanShell
        user={user}
        currentUserName={currentUserName}
        currentUserEmail={currentUserEmail}
        avatarMemberId={avatarMemberId}
        onSwitchFlowMate={chooseFlowMateProduct}
        onSwitchMarketingPlan={chooseMarketingPlanProduct}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <div className="app">
      <FlowMatePromptHost />
      <div className="app__brand">
        <img src="garena/logo_graphic.png" alt="Garena" />
        <span className="app__brand-name">FlowMate</span>
        <span className="app__brand-version">{FLOWMATE_APP_VERSION}</span>
      </div>

      <div className="app__topbar">
        <ProductSwitch
          activeProduct="flowmate"
          onSwitchFlowMate={chooseFlowMateProduct}
          onSwitchMarketingPlan={chooseMarketingPlanProduct}
        />
        <div className="searchbar-wrap" ref={searchWrapRef}>
          <div className="searchbar">
            <Icon name="search" size={14} />
            <input
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setIsGlobalSearchOpen(true);
              }}
              onFocus={() => setIsGlobalSearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && globalSearchResults[0]) {
                  event.preventDefault();
                  openGlobalSearchResult(globalSearchResults[0]);
                }
                if (event.key === "Escape") {
                  setSearchInput("");
                  setSearchQuery("");
                  setIsGlobalSearchOpen(false);
                }
              }}
              placeholder="Search by ID, title, campaign, requester, assignee..."
            />
          </div>
          {isGlobalSearchOpen && normalizedGlobalSearch && (
            <GlobalSearchResultsPanel
              query={normalizedGlobalSearch}
              results={globalSearchResults}
              loadState={globalSearchLoadState}
              onOpen={openGlobalSearchResult}
            />
          )}
        </div>
        <span className="topbar__spacer"></span>
        <div className="topbar__menu-wrap">
          <button
            className="topbar__btn"
            onClick={() => {
              setIsCreateMenuOpen(open => !open);
              setIsNotificationCenterOpen(false);
            }}
            aria-haspopup="menu"
            aria-expanded={isCreateMenuOpen}
          >
            <Icon name="plus" /> Create
          </button>
          {isCreateMenuOpen && (
            <CreateMenuPanel
              onQuick={() => handleTopbarCreateChoice("quick")}
              onCreative={() => handleTopbarCreateChoice("creative")}
              onLeave={() => handleTopbarCreateChoice("leave")}
              onClose={() => setIsCreateMenuOpen(false)}
            />
          )}
        </div>
        <button
          className="topbar__btn"
          onClick={() => {
            setIsCreateMenuOpen(false);
            setIsNotificationCenterOpen(open => {
              const nextOpen = !open;
              if (nextOpen) refreshNotifications({ showLoading: true });
              return nextOpen;
            });
          }}
          title="Open notifications"
        >
          <Icon name="bell" /> Notifications
          {unreadNotificationCount > 0 && (
            <span className="nav-item__count" style={{
              marginLeft: 2,
              minWidth: 18,
              height: 18,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 999,
              background: "var(--garena-red)",
              color: "var(--garena-white)",
              fontSize: 11,
              fontWeight: 700,
              padding: "0 5px",
            }}>{unreadNotificationCount}</span>
          )}
        </button>
        {isNotificationCenterOpen && (
          <NotificationCenterPanel
            notifications={notifications}
            unreadCount={unreadNotificationCount}
            loadState={notificationLoadState}
            markingNotificationId={markingNotificationId}
            isMarkingAll={isMarkingAllNotifications}
            isDismissingRead={isDismissingReadNotifications}
            onClose={() => setIsNotificationCenterOpen(false)}
            onRefresh={() => refreshNotifications({ showLoading: true })}
            onOpen={handleOpenNotification}
            onMarkRead={handleMarkNotificationRead}
            onMarkAllRead={handleMarkAllNotificationsRead}
            onDismissRead={handleDismissReadNotifications}
          />
        )}
        <div className="topbar__user" title={`Signed in as ${currentUserEmail}`}>
          <Avatar memberId={avatarMemberId} size="" />
          <span className="topbar__user-name">{currentUserName}</span>
        </div>
        <button className="topbar__btn" onClick={handleSignOut} title="Sign out">
          Sign out
        </button>
      </div>

      <nav className="app__sidebar">
        {visibleNavGroups.map(group => (
          <div key={group.group}>
            <div className="nav-section">{group.group}</div>
            {group.items.map(it => {
              const itemCount = navCounts[it.key];
              return (
                <div
                  key={it.key}
                  className={`nav-item ${route === it.key ? "is-active" : ""}`}
                  onClick={() => nav(it.key)}
                >
                  <Icon name={it.icon} size={15} />
                  <span>{it.label}</span>
                  {itemCount != null && <span className="nav-item__count">{itemCount}</span>}
                </div>
              );
            })}
          </div>
        ))}

        <LiveStatus realtimeState={realtimeState} />
      </nav>

      <main className="app__main" key={route + (focusId || "")}>
        {allowedRoute && route === "my-work"  && <MyWorkScreen   onOpen={open} onNav={nav} searchQuery={searchQuery} />}
        {allowedRoute && route === "create"   && <CreateScreen   onNav={nav} onOpen={open} initialMode={createModeIntent} />}
        {allowedRoute && route === "detail"   && <DetailScreen   onNav={nav} onOpen={open} focusId={focusId} />}
        {allowedRoute && route === "list"     && <ListScreen     onOpen={open} searchQuery={searchQuery} />}
        {allowedRoute && route === "board"    && <BoardScreen    onOpen={open} />}
        {allowedRoute && route === "calendar" && <CalendarScreen onOpen={open} />}
        {allowedRoute && route === "gantt"    && <TeamGanttScreen onOpen={open} />}
        {allowedRoute && route === "queue"    && <QueueScreen    onOpen={open} searchQuery={searchQuery} />}
        {allowedRoute && route === "planning-channel" && <PlanningChannelViewScreen onOpen={open} />}
        {allowedRoute && route === "planning-campaign" && <PlanningCampaignViewScreen onOpen={open} />}
        {allowedRoute && route === "planning-calendar" && <PlanningContentCalendarScreen onOpen={open} />}
        {allowedRoute && route === "workload" && <WorkloadScreen onOpen={open} />}
        {allowedRoute && route === "kpi"      && <KpiScreen />}
        {allowedRoute && route === "settings" && <SettingsScreen />}
        {allowedRoute && route === "admin-whitelist" && isAdminUser && <AdminWhitelistScreen />}
        {!allowedRoute && <AccessDeniedScreen onNav={nav} />}
      </main>
      {isGlobalLeaveModalOpen && (
        <GlobalLeaveRequestModal onClose={() => setIsGlobalLeaveModalOpen(false)} />
      )}
    </div>
  );
}

function ProductSwitch({ activeProduct, onSwitchFlowMate, onSwitchMarketingPlan }) {
  return (
    <div className="row" style={{ gap: 6, marginRight: 14 }} aria-label="Product switch">
      <button
        type="button"
        className={`btn btn--xs ${activeProduct === "flowmate" ? "btn--primary" : "btn--ghost"}`}
        onClick={onSwitchFlowMate}
      >
        FlowMate
      </button>
      <button
        type="button"
        className={`btn btn--xs ${activeProduct === "marketing-plan" ? "btn--primary" : "btn--ghost"}`}
        onClick={onSwitchMarketingPlan}
      >
        Marketing Plan
      </button>
    </div>
  );
}

function ProductChoiceScreen({
  currentUserName,
  currentUserEmail,
  avatarMemberId,
  onChooseFlowMate,
  onChooseMarketingPlan,
  onSignOut,
}) {
  const pageStyle = { minHeight: "100vh", background: "var(--garena-bg)", color: "var(--garena-iron)" };
  const headerStyle = {
    height: 58,
    borderBottom: "1px solid var(--garena-light-grey)",
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "0 24px",
    background: "var(--garena-white)",
    boxSizing: "border-box",
  };
  const mainStyle = { maxWidth: 980, margin: "0 auto", padding: "52px 24px" };
  const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 22 };
  const cardStyle = {
    border: "1px solid var(--garena-light-grey)",
    background: "var(--garena-white)",
    borderRadius: "var(--radius-sm)",
    padding: 22,
    textAlign: "left",
    minHeight: 190,
    cursor: "pointer",
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <img src="garena/logo_graphic.png" alt="Garena" style={{ width: 26, height: 26, objectFit: "contain" }} />
        <div className="strong" style={{ fontSize: 17 }}>Choose workspace</div>
        <span className="topbar__spacer"></span>
        <div className="topbar__user" title={`Signed in as ${currentUserEmail}`}>
          <Avatar memberId={avatarMemberId} size="" />
          <span className="topbar__user-name">{currentUserName}</span>
        </div>
        <button className="topbar__btn" onClick={onSignOut}>Sign out</button>
      </div>
      <main style={mainStyle}>
        <div className="eyebrow">Garena FCO Thailand</div>
        <h1 style={{ margin: "6px 0 8px", fontSize: 30 }}>Select product</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 620 }}>
          FlowMate handles task execution. Marketing Plan handles campaign and channel planning.
        </p>
        <div style={gridStyle}>
          <button type="button" style={cardStyle} onClick={onChooseFlowMate}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <span className="badge badge--creative">Execution</span>
              <Icon name="inbox" size={18} />
            </div>
            <h2 style={{ fontSize: 22, margin: "18px 0 8px" }}>FlowMate</h2>
            <p className="muted" style={{ lineHeight: 1.55 }}>
              Create requests, assign GD/VE work, track status, workload, calendar, and KPI.
            </p>
          </button>
          <button type="button" style={cardStyle} onClick={onChooseMarketingPlan}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <span className="badge badge--quick">Planning</span>
              <Icon name="calendar" size={18} />
            </div>
            <h2 style={{ fontSize: 22, margin: "18px 0 8px" }}>Marketing Plan</h2>
            <p className="muted" style={{ lineHeight: 1.55 }}>
              Plan campaigns, channels, publish dates, and monthly content before work moves into execution.
            </p>
          </button>
        </div>
      </main>
    </div>
  );
}

function getMarketingPlanMonthLabel(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || "-";
  const date = new Date(`${monthKey}-01T00:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function getMarketingPlanDays(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return [];
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(Date.UTC(year, monthIndex, index + 1));
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      day: index + 1,
      weekday: date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).slice(0, 1),
      isWeekend: date.getUTCDay() === 0 || date.getUTCDay() === 6,
    };
  });
}

function getNextMarketingPlanMonthKey(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return "";
  const [yearText, monthText] = monthKey.split("-");
  const date = new Date(Date.UTC(Number(yearText), Number(monthText), 1));
  return date.toISOString().slice(0, 7);
}

function getMarketingPlanTimelineWindow(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
    return { monthKeys: [], monthGroups: [], days: [] };
  }
  const monthKeys = [monthKey, getNextMarketingPlanMonthKey(monthKey)].filter(Boolean);
  const monthGroups = monthKeys.map(key => {
    const days = getMarketingPlanDays(key).map(day => ({ ...day, monthKey: key }));
    return { key, label: getMarketingPlanMonthLabel(key), days };
  });
  return {
    monthKeys,
    monthGroups,
    days: monthGroups.flatMap(group => group.days),
  };
}

function normalizeMarketingPlanTimelineRow(row) {
  const publishDate = row.publish_date || "";
  return {
    planId: row.plan_id,
    monthKey: row.month_key || (publishDate ? publishDate.slice(0, 7) : ""),
    planTitle: row.plan_title || "",
    market: row.market || "",
    audienceScope: row.audience_scope || "",
    campaignId: row.campaign_id || row.campaign_name || "campaign",
    campaignName: row.campaign_name || "No campaign",
    campaignTeam: row.campaign_team || "",
    campaignSortOrder: Number(row.campaign_sort_order || 0),
    contentItemId: row.content_item_id || row.content_title || "content",
    contentTitle: row.content_title || "Untitled asset",
    contentTeam: row.content_team || "",
    format: row.format || "",
    contentTier: row.content_tier || "",
    picUserId: row.pic_user_id || "",
    picName: row.pic_name || "",
    briefLink: row.brief_link || "",
    flowmateWorkItemId: row.flowmate_work_item_id || "",
    flowmateDisplayId: row.flowmate_display_id || "",
    flowmateStatus: row.flowmate_status || "",
    contentStatus: row.content_status || "",
    contentSortOrder: Number(row.content_sort_order || 0),
    placementId: row.placement_id,
    channel: row.channel || "Channel",
    publishDate,
    publishTime: row.publish_time || "",
    placementStatus: row.placement_status || "planned",
    placementNote: row.placement_note || "",
  };
}

function getMarketingPlanMonthOptions(rows) {
  const months = new Set();
  (rows || []).forEach(row => {
    const monthKey = row.monthKey || (row.publishDate ? row.publishDate.slice(0, 7) : "");
    if (monthKey) months.add(monthKey);
  });
  return Array.from(months).sort();
}

function normalizeMarketingPlanCampaignOption(row, plan) {
  return {
    id: row.id,
    name: row.name || "",
    team: row.team || "",
    planId: row.plan_id || (plan && plan.id) || "",
    monthKey: (plan && plan.month_key) || row.month_key || "",
    sortOrder: Number(row.sort_order || 0),
  };
}

const MARKETING_PLAN_HIDDEN_CAMPAIGNS_KEY = "flowmate:marketing-plan:hidden-campaign-tags";

function getMarketingPlanCampaignKey(name) {
  return String(name || "").trim().toLowerCase();
}

function getHiddenMarketingPlanCampaignKeys() {
  try {
    const raw = window.localStorage ? window.localStorage.getItem(MARKETING_PLAN_HIDDEN_CAMPAIGNS_KEY) : "";
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function setHiddenMarketingPlanCampaignKeys(keys) {
  const uniqueKeys = Array.from(new Set((keys || []).filter(Boolean)));
  if (window.localStorage) {
    window.localStorage["setItem"](MARKETING_PLAN_HIDDEN_CAMPAIGNS_KEY, JSON.stringify(uniqueKeys));
  }
  return uniqueKeys;
}

function isMarketingPlanCampaignHidden(name) {
  return getHiddenMarketingPlanCampaignKeys().includes(getMarketingPlanCampaignKey(name));
}

function applyMarketingPlanCampaignVisibility(campaigns, includeHidden = false) {
  if (includeHidden) return campaigns || [];
  const hiddenKeys = new Set(getHiddenMarketingPlanCampaignKeys());
  return (campaigns || []).filter(campaign => !hiddenKeys.has(getMarketingPlanCampaignKey(campaign.name)));
}

function formatMarketingPlanTime(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function normalizeMarketingPlanTimeInput(value) {
  const text = String(value || "").trim();
  const compactMatch = text.match(/^(\d{1,2})(\d{2})$/);
  const colonMatch = text.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  const match = colonMatch || compactMatch;
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return "";
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeMarketingPlanPublishTimeOption(value) {
  const normalized = normalizeMarketingPlanTimeInput(value);
  return MARKETING_PLAN_PUBLISH_TIME_OPTIONS.includes(normalized) ? normalized : "";
}

function formatMarketingPlanDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00Z`);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function isMarketingPlanFlowMateDetailLink(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return /#detail\/CR-\d{4,}(?:$|[/?#])/i.test(text);
}

function getMarketingPlanFlowMateDetailUrl(displayId) {
  const id = String(displayId || "").trim();
  if (!/^CR-\d{4,}$/i.test(id)) return "";
  return `${window.location.origin}${window.location.pathname}#detail/${id.toUpperCase()}`;
}

function hasMarketingPlanLinkedCreativeRequest(row) {
  if (!row) return false;
  if (String(row.flowmateWorkItemId || "").trim() && String(row.flowmateDisplayId || "").trim()) return true;
  return isMarketingPlanFlowMateDetailLink(row.briefLink);
}

function formatMarketingPlanShortWeekday(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).toUpperCase();
}

function addMarketingPlanDays(dateKey, amount) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function getMarketingPlanWeekStart(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

function getMarketingPlanReferenceDate(selectedMonth) {
  const today = flowMateTodayDateKey();
  return selectedMonth && today.slice(0, 7) === selectedMonth ? today : `${selectedMonth || today.slice(0, 7)}-01`;
}

function getMarketingPlanCalendarViewDays(selectedMonth, viewMode) {
  const referenceDate = getMarketingPlanReferenceDate(selectedMonth);
  if (viewMode === "day") return [referenceDate];
  if (viewMode === "4_days") return Array.from({ length: 4 }, (_, index) => addMarketingPlanDays(referenceDate, index));
  if (viewMode === "week") {
    const start = getMarketingPlanWeekStart(referenceDate);
    return Array.from({ length: 7 }, (_, index) => addMarketingPlanDays(start, index));
  }
  return getMarketingPlanDays(selectedMonth).map(day => day.key);
}

function getMarketingPlanCalendarRangeLabel(days, viewMode, selectedMonth) {
  if (viewMode === "month") return `${getMarketingPlanMonthLabel(selectedMonth)} publishing calendar`;
  if (!days || days.length === 0) return "Publishing calendar";
  if (days.length === 1) return formatMarketingPlanDate(days[0]);
  return `${formatMarketingPlanDate(days[0])} - ${formatMarketingPlanDate(days[days.length - 1])}`;
}

function getMarketingPlanTierRank(tier) {
  const normalized = String(tier || "").trim().toUpperCase();
  const order = { S: 0, A: 1, B: 2, C: 3 };
  return Object.prototype.hasOwnProperty.call(order, normalized) ? order[normalized] : 99;
}

function getMarketingPlanAssetFirstPublishDate(asset) {
  const dates = ((asset && asset.placements) || [])
    .map(placement => String(placement.publishDate || ""))
    .filter(Boolean)
    .sort();
  return dates[0] || "9999-12-31";
}

function getMarketingPlanTimelineAssetMeta(asset) {
  return [asset.format, asset.contentTier, asset.picName].filter(Boolean).join(" · ") || "No details";
}

const MARKETING_PLAN_TIMELINE_COUNT_CHANNELS = [
  { key: "facebook", label: "FB" },
  { key: "tiktok", label: "TK" },
  { key: "instagram", label: "IG" },
];

function getMarketingPlanTimelineChannelCountsByDay(rows, selectedMonth) {
  const windowMonths = new Set(getMarketingPlanTimelineWindow(selectedMonth).monthKeys);
  const countChannels = new Set(MARKETING_PLAN_TIMELINE_COUNT_CHANNELS.map(channel => channel.key));
  const countsByDay = {};

  (rows || []).forEach(row => {
    const publishDate = String(row.publishDate || "");
    const rowMonth = row.monthKey || (publishDate ? publishDate.slice(0, 7) : "");
    if (!publishDate || !windowMonths.has(rowMonth) || !countChannels.has(row.channel)) return;
    if (!countsByDay[publishDate]) countsByDay[publishDate] = {};
    countsByDay[publishDate][row.channel] = (countsByDay[publishDate][row.channel] || 0) + 1;
  });

  return countsByDay;
}

function groupMarketingPlanTimelineRows(rows, selectedMonth) {
  const campaigns = new Map();
  const windowMonths = new Set(getMarketingPlanTimelineWindow(selectedMonth).monthKeys);
  (rows || [])
    .filter(row => {
      const rowMonth = row.monthKey || (row.publishDate ? row.publishDate.slice(0, 7) : "");
      return windowMonths.has(rowMonth);
    })
    .forEach(row => {
      const campaignKey = getMarketingPlanCampaignKey(row.campaignName) || row.campaignId || "uncategorized";
      if (!campaigns.has(campaignKey)) {
        campaigns.set(campaignKey, {
          id: campaignKey,
          sourceCampaignIds: row.campaignId ? [row.campaignId] : [],
          name: row.campaignName,
          team: row.campaignTeam,
          sortOrder: row.campaignSortOrder,
          assets: new Map(),
        });
      }
      const campaign = campaigns.get(campaignKey);
      if (row.campaignId && !campaign.sourceCampaignIds.includes(row.campaignId)) {
        campaign.sourceCampaignIds.push(row.campaignId);
      }
      if (!campaign.team && row.campaignTeam) campaign.team = row.campaignTeam;
      campaign.sortOrder = Math.min(Number(campaign.sortOrder || 0), Number(row.campaignSortOrder || 0));
      if (!campaign.assets.has(row.contentItemId)) {
        campaign.assets.set(row.contentItemId, {
          id: row.contentItemId,
          title: row.contentTitle,
          team: row.contentTeam,
          format: row.format,
          contentTier: row.contentTier,
          picName: row.picName,
          status: row.contentStatus,
          sortOrder: row.contentSortOrder,
          placements: [],
        });
      }
      campaign.assets.get(row.contentItemId).placements.push({
        id: row.placementId,
        channel: row.channel,
        publishDate: row.publishDate,
        publishTime: row.publishTime,
        status: getMarketingPlanViewStatus(row),
        note: row.placementNote,
      });
    });

  return Array.from(campaigns.values())
    .map(campaign => {
      const assets = Array.from(campaign.assets.values())
        .map(asset => ({
          ...asset,
          firstPublishDate: getMarketingPlanAssetFirstPublishDate(asset),
          placements: asset.placements.sort((a, b) => (
            String(a.publishDate || "").localeCompare(String(b.publishDate || "")) ||
            String(a.publishTime || "").localeCompare(String(b.publishTime || "")) ||
            String(a.channel || "").localeCompare(String(b.channel || ""))
          )),
        }))
        .sort((a, b) => (
          String(a.firstPublishDate || "").localeCompare(String(b.firstPublishDate || "")) ||
          getMarketingPlanTierRank(a.contentTier) - getMarketingPlanTierRank(b.contentTier) ||
          (a.sortOrder - b.sortOrder) ||
          a.title.localeCompare(b.title)
        ));
      const firstPublishDate = assets[0] ? assets[0].firstPublishDate : "9999-12-31";
      const bestTier = assets.reduce((best, asset) => (
        getMarketingPlanTierRank(asset.contentTier) < getMarketingPlanTierRank(best) ? asset.contentTier : best
      ), "");
      return { ...campaign, firstPublishDate, bestTier, assets };
    })
    .sort((a, b) => (
      String(a.firstPublishDate || "").localeCompare(String(b.firstPublishDate || "")) ||
      getMarketingPlanTierRank(a.bestTier) - getMarketingPlanTierRank(b.bestTier) ||
      (a.sortOrder - b.sortOrder) ||
      a.name.localeCompare(b.name)
    ));
}

const MARKETING_PLAN_CHANNELS = [
  { key: "facebook", label: "Facebook" },
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
  { key: "in_game", label: "In-game" },
  { key: "youtube", label: "YouTube" },
  { key: "other", label: "Other" },
];

const MARKETING_PLAN_ASSET_TYPES = [
  "Banner",
  "Video",
  "Shorts/Reels",
  "Story",
  "Album",
  "Cover/Profile",
  "PR",
  "GIF",
  "Live",
];

const MARKETING_PLAN_CONTENT_TIERS = ["S", "A", "B", "C"];

const MARKETING_PLAN_PUBLISH_TIME_OPTIONS = ["11:00", "14:00", "18:00", "21:00"];

const MARKETING_PLAN_WORKING_STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "assigned", label: "Assigned" },
  { value: "review", label: "Review" },
  { value: "ready_to_post", label: "Ready to Post" },
  { value: "scheduled", label: "Schedule" },
  { value: "posted", label: "Posted" },
];

const MARKETING_PLAN_CALENDAR_VIEW_OPTIONS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "4_days", label: "4 Days" },
  { value: "schedule", label: "Schedule" },
];

function getDefaultMarketingPlanWorkingSheetForm() {
  const today = flowMateTodayDateKey();
  return {
    campaignName: "",
    productEvent: "",
    team: "",
    launchDate: today,
    publishTime: "11:00",
    assetType: "Banner",
    details: "",
    contentTier: "B",
    picName: "",
    briefLink: "",
    channels: ["facebook"],
    note: "",
  };
}

function marketingPlanMonthKeyFromDate(dateKey) {
  return dateKey && /^\d{4}-\d{2}-\d{2}/.test(String(dateKey))
    ? String(dateKey).slice(0, 7)
    : flowMateTodayDateKey().slice(0, 7);
}

function marketingPlanTitleFromDetails(details, assetType) {
  const text = String(details || "").trim().replace(/\s+/g, " ");
  if (text) return text.slice(0, 90);
  return `${assetType || "Asset"} content`;
}

function getFlowMateCreativeSubtypeFromMarketingAssetType(assetType) {
  const normalized = String(assetType || "").trim().toLowerCase();
  if (normalized.includes("short") || normalized.includes("reel")) return "video-under-1-min";
  if (normalized.includes("video")) return "video-standard";
  if (normalized.includes("motion") || normalized.includes("gif")) return "motion";
  if (normalized.includes("album")) return "hero-album";
  if (normalized.includes("banner")) return "banner";
  return "banner";
}

function getFlowMateCreativeAssetTypeFromSubtype(subtype) {
  if (subtype === "video-standard" || subtype === "video-under-1-min") return "general-video";
  if (subtype === "motion") return "motion";
  return "static-graphic";
}

function getMarketingPlanWorkingRowPublishTime(row) {
  const directTime = normalizeMarketingPlanTimeInput(row && row.publishTime);
  if (directTime) return directTime;
  const placements = Array.isArray(row && row.placements) ? row.placements : [];
  for (const placement of placements) {
    const placementTime = normalizeMarketingPlanTimeInput(placement && placement.publishTime);
    if (placementTime) return placementTime;
  }
  return "12:00";
}

function createFlowMateDraftFromMarketingPlanRow(row) {
  const currentUserDefaults = getMarketingPlanCurrentUserDefaults();
  const launchDate = row.publishDate || flowMateTodayDateKey();
  const channels = Array.isArray(row.channels) && row.channels.length
    ? row.channels.map(channel => getMarketingPlanChannelLabel(channel)).join(", ")
    : (row.channel ? getMarketingPlanChannelLabel(row.channel) : "Instagram");
  const productEvent = row.contentTitle || "";
  const requesterTeam = currentUserDefaults.team || "Operations";
  const campaignName = row.campaignName || "";
  const assetSubtype = getFlowMateCreativeSubtypeFromMarketingAssetType(row.format);
  return {
    title: window.buildFlowMateTemplateTitle
      ? window.buildFlowMateTemplateTitle({ launchDate, requesterTeam, projectName: campaignName, productEvent })
      : "",
    requesterTeam,
    campaignName,
    productEvent,
    assetType: getFlowMateCreativeAssetTypeFromSubtype(assetSubtype),
    assetSubtype,
    assetCount: "1",
    platforms: channels,
    sizeFormat: "1080x1080",
    briefLink: row.briefLink || "",
    briefNote: row.contentDetails || row.placementNote || "",
    referenceLink: "",
    priority: "normal",
    urgentReason: "",
    dueDate: launchDate,
    launchDate,
    publishTime: getMarketingPlanWorkingRowPublishTime(row),
    marketingPlanContentItemId: row.contentItemId || "",
    marketingPlanOriginalBriefLink: row.briefLink || "",
    marketingPlanProductEvent: productEvent,
    marketingPlanCampaignName: campaignName,
  };
}

function openFlowMateCreativeBriefFromMarketingRow(row) {
  const draft = createFlowMateDraftFromMarketingPlanRow(row);
  if (window.localStorage) {
    window.localStorage.setItem("flowmate:create:creativeDraft:v1", JSON.stringify(draft));
  }
  window.dispatchEvent(new CustomEvent("flowmate:create-draft-updated", { detail: { mode: "creative", draft } }));
  if (window.sessionStorage) {
    window.sessionStorage.setItem("flowmate:activeProduct", "flowmate");
  }
  window.dispatchEvent(new CustomEvent("flowmate:switch-flowmate-product", { detail: { route: "create" } }));
}

function getMarketingPlanChannelOptions(rows, selectedMonth) {
  const channels = new Set();
  (rows || []).forEach(row => {
    const rowMonth = row.monthKey || (row.publishDate ? row.publishDate.slice(0, 7) : "");
    if (rowMonth === selectedMonth && row.channel) channels.add(row.channel);
  });
  return Array.from(channels).sort((a, b) => getMarketingPlanChannelLabel(a).localeCompare(getMarketingPlanChannelLabel(b)));
}

function filterMarketingPlanRows(rows, selectedMonth, selectedChannel = "all") {
  return (rows || [])
    .filter(row => {
      const rowMonth = row.monthKey || (row.publishDate ? row.publishDate.slice(0, 7) : "");
      if (rowMonth !== selectedMonth) return false;
      return selectedChannel === "all" || row.channel === selectedChannel;
    })
    .sort((a, b) => (
      String(a.publishDate || "").localeCompare(String(b.publishDate || "")) ||
      String(a.publishTime || "").localeCompare(String(b.publishTime || "")) ||
      String(a.channel || "").localeCompare(String(b.channel || "")) ||
      String(a.campaignName || "").localeCompare(String(b.campaignName || "")) ||
      String(a.contentTitle || "").localeCompare(String(b.contentTitle || ""))
    ));
}

function groupMarketingPlanWorkingSheetRows(rows, selectedMonth, selectedChannel = "all") {
  const groups = new Map();
  filterMarketingPlanRows(rows, selectedMonth, selectedChannel).forEach(row => {
    const key = row.contentItemId || `${row.campaignName}-${row.contentTitle}`;
    if (!groups.has(key)) {
      groups.set(key, {
        ...row,
        channels: [],
        placements: [],
      });
    }
    const group = groups.get(key);
    group.placements.push(row);
    if (row.channel && !group.channels.includes(row.channel)) group.channels.push(row.channel);
  });

  return Array.from(groups.values())
    .map(group => {
      const sortedPlacements = group.placements.sort((a, b) => (
        String(a.publishDate || "").localeCompare(String(b.publishDate || "")) ||
        String(a.publishTime || "").localeCompare(String(b.publishTime || "")) ||
        String(a.channel || "").localeCompare(String(b.channel || ""))
      ));
      const primaryPlacement = sortedPlacements[0] || group;
      const normalizedStatuses = new Set(sortedPlacements.map(row => normalizeMarketingPlanWorkingStatus(row.placementStatus)));
      const orderedChannels = MARKETING_PLAN_CHANNELS
        .map(channel => channel.key)
        .filter(channel => group.channels.includes(channel));
      return {
        ...group,
        placementId: primaryPlacement.placementId,
        monthKey: primaryPlacement.monthKey,
        publishDate: primaryPlacement.publishDate,
        publishTime: primaryPlacement.publishTime,
        placementStatus: normalizedStatuses.size === 1 ? Array.from(normalizedStatuses)[0] : normalizeMarketingPlanWorkingStatus(primaryPlacement.placementStatus),
        hasMixedStatus: normalizedStatuses.size > 1,
        channels: orderedChannels.length ? orderedChannels : group.channels,
        placements: sortedPlacements,
      };
    })
    .sort((a, b) => (
      String(a.publishDate || "").localeCompare(String(b.publishDate || "")) ||
      String(a.publishTime || "").localeCompare(String(b.publishTime || "")) ||
      String(a.campaignName || "").localeCompare(String(b.campaignName || "")) ||
      String(a.contentTitle || "").localeCompare(String(b.contentTitle || ""))
    ));
}

function getMarketingPlanChannelLabel(channel) {
  const normalized = channel || "other";
  const match = MARKETING_PLAN_CHANNELS.find(item => item.key === normalized);
  return match ? match.label : "Other";
}

function getMarketingPlanChannelAbbrev(channel) {
  const normalized = channel || "other";
  const labels = {
    facebook: "FB",
    tiktok: "TT",
    instagram: "IG",
    in_game: "Game",
    youtube: "YT",
    other: "Other",
  };
  return labels[normalized] || getMarketingPlanChannelLabel(normalized).slice(0, 6);
}

function formatMarketingPlanBadgeTime(value) {
  return formatMarketingPlanTime(value);
}

function getMarketingPlanStatusLabel(status) {
  if (status === "ready") return "Ready to Post";
  if (status === "ready_to_post") return "Ready to Post";
  if (status === "scheduled") return "Schedule";
  if (!status) return "Planned";
  return String(status).replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function normalizeMarketingPlanWorkingStatus(status) {
  if (status === "ready") return "ready_to_post";
  if (status === "schedule") return "scheduled";
  return status || "planned";
}

function getMarketingPlanViewStatus(row) {
  const flowmateStatus = normalizeMarketingPlanWorkingStatus(row && row.flowmateStatus);
  if (flowmateStatus === "review") return "review";
  if (flowmateStatus === "delivered") return "ready_to_post";
  const normalized = normalizeMarketingPlanWorkingStatus(row && row.placementStatus);
  if (normalized === "planned" && hasMarketingPlanLinkedCreativeRequest(row)) return "assigned";
  return normalized;
}

function getMarketingPlanStatusClass(status) {
  const normalized = normalizeMarketingPlanWorkingStatus(status);
  if (normalized === "posted") return "badge--delivered";
  if (normalized === "review") return "badge--review";
  if (normalized === "assigned" || normalized === "ready_to_post" || normalized === "scheduled") return "badge--assigned";
  if (normalized === "delayed") return "badge--overdue";
  if (normalized === "cancelled") return "badge--cancelled";
  return "badge--neutral";
}

function getMarketingPlanCurrentUserDefaults() {
  const user = window.FLOWMATE_CURRENT_USER || {};
  const member = user.team_member_id && window.MEMBERS_BY_ID ? window.MEMBERS_BY_ID[user.team_member_id] : null;
  return {
    picUserId: user.id || "",
    team: user.requester_team || (member && member.discipline) || "",
    picName: user.name || user.email || "Unknown",
  };
}

function openNativeTimePicker(event) {
  const input = event.currentTarget;
  if (!input || typeof input.showPicker !== "function") return;
  try {
    input.showPicker();
  } catch (error) {
    // Browsers only allow showPicker from direct user gestures.
  }
}

function getMarketingPlanPlacementStatusOptions(rows, selectedMonth) {
  const statuses = new Set();
  (rows || []).forEach(row => {
    const rowMonth = row.monthKey || (row.publishDate ? row.publishDate.slice(0, 7) : "");
    if (rowMonth === selectedMonth) statuses.add(getMarketingPlanViewStatus(row));
  });
  return Array.from(statuses).sort();
}

async function loadMarketingPlanTimelineRows(orderBy = "publish_date") {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready. Please refresh after the app loads.");
  }
  let query = window.flowmateSupabase
    .from("marketing_plan_timeline_v")
    .select("*")
    .order("month_key", { ascending: true });

  if (orderBy === "channel") {
    query = query
      .order("channel", { ascending: true })
      .order("publish_date", { ascending: true })
      .order("publish_time", { ascending: true });
  } else if (orderBy === "campaign") {
    query = query
      .order("campaign_sort_order", { ascending: true })
      .order("content_sort_order", { ascending: true })
      .order("publish_date", { ascending: true })
      .order("publish_time", { ascending: true });
  } else {
    query = query
      .order("publish_date", { ascending: true })
      .order("publish_time", { ascending: true })
      .order("campaign_sort_order", { ascending: true })
      .order("content_sort_order", { ascending: true });
  }

  const result = await query;
  if (result.error) throw result.error;
  return (result.data || []).map(normalizeMarketingPlanTimelineRow);
}

async function findOrCreateMarketingPlan(monthKey) {
  const title = `Marketing Plan - ${getMarketingPlanMonthLabel(monthKey)}`;
  const existing = await window.flowmateSupabase
    .from("marketing_plans")
    .select("id")
    .eq("month_key", monthKey)
    .neq("status", "archived")
    .order("created_at", { ascending: true })
    .limit(1);
  if (existing.error) throw existing.error;
  if (existing.data && existing.data[0]) return existing.data[0].id;

  const inserted = await window.flowmateSupabase
    .from("marketing_plans")
    .insert({
      month_key: monthKey,
      title,
      market: "TH",
      audience_scope: "TH ONLY",
      plan_date: `${monthKey}-01`,
      status: "active",
    })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  return inserted.data.id;
}

async function findOrCreateMarketingCampaign(planId, name, team) {
  const campaignName = String(name || "").trim();
  const existing = await window.flowmateSupabase
    .from("marketing_campaigns")
    .select("id")
    .eq("plan_id", planId)
    .eq("name", campaignName)
    .limit(1);
  if (existing.error) throw existing.error;
  if (existing.data && existing.data[0]) return existing.data[0].id;

  const inserted = await window.flowmateSupabase
    .from("marketing_campaigns")
    .insert({
      plan_id: planId,
      name: campaignName,
      team: team || null,
      start_date: null,
      end_date: null,
      sort_order: 100,
    })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  return inserted.data.id;
}

async function loadMarketingPlanCampaignOptions(options = {}) {
  if (!window.flowmateSupabase) {
    window.FLOWMATE_MARKETING_CAMPAIGNS = [];
    return [];
  }
  const result = await window.flowmateSupabase
    .from("marketing_plans")
    .select("id,month_key,marketing_campaigns(id,name,team,plan_id,sort_order)")
    .neq("status", "archived")
    .order("month_key", { ascending: true });
  if (result.error) throw result.error;

  const byName = new Map();
  (result.data || []).forEach(plan => {
    (plan.marketing_campaigns || []).forEach(campaign => {
      const option = normalizeMarketingPlanCampaignOption(campaign, plan);
      if (!option.name) return;
      const key = option.name.trim().toLowerCase();
      if (!byName.has(key)) byName.set(key, option);
    });
  });

  const allCampaigns = Array.from(byName.values()).sort((a, b) => (
    String(a.name || "").localeCompare(String(b.name || ""))
  ));
  const campaigns = applyMarketingPlanCampaignVisibility(allCampaigns, options.includeHidden === true);
  window.FLOWMATE_MARKETING_CAMPAIGNS = campaigns;
  if (options.announce !== false) {
    window.dispatchEvent(new CustomEvent("flowmate:marketing-campaigns-updated", { detail: { campaigns } }));
  }
  return campaigns;
}

async function addMarketingPlanCampaignTag(name, monthKey) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready. Please refresh after the app loads.");
  }
  const campaignName = String(name || "").trim();
  if (!campaignName) throw new Error("Campaign name is required.");
  const targetMonthKey = monthKey && /^\d{4}-\d{2}$/.test(monthKey)
    ? monthKey
    : flowMateTodayDateKey().slice(0, 7);
  const planId = await findOrCreateMarketingPlan(targetMonthKey);
  const campaignId = await findOrCreateMarketingCampaign(planId, campaignName, null);
  const hiddenKeys = getHiddenMarketingPlanCampaignKeys().filter(key => key !== getMarketingPlanCampaignKey(campaignName));
  setHiddenMarketingPlanCampaignKeys(hiddenKeys);
  const campaigns = await loadMarketingPlanCampaignOptions();
  return { campaignId, campaignName, monthKey: targetMonthKey, campaigns };
}

async function hideMarketingPlanCampaignTag(name) {
  const key = getMarketingPlanCampaignKey(name);
  if (!key) throw new Error("Campaign name is required.");
  const hiddenKeys = getHiddenMarketingPlanCampaignKeys();
  setHiddenMarketingPlanCampaignKeys([...hiddenKeys, key]);
  const campaigns = await loadMarketingPlanCampaignOptions();
  return campaigns;
}

async function showMarketingPlanCampaignTag(name) {
  const key = getMarketingPlanCampaignKey(name);
  const hiddenKeys = getHiddenMarketingPlanCampaignKeys().filter(item => item !== key);
  setHiddenMarketingPlanCampaignKeys(hiddenKeys);
  const campaigns = await loadMarketingPlanCampaignOptions();
  return campaigns;
}

async function deleteMarketingPlanCampaignTag(campaign) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready. Please refresh after the app loads.");
  }
  if (!campaign || !campaign.id) throw new Error("Campaign is missing.");
  const linkedContent = await window.flowmateSupabase
    .from("marketing_content_items")
    .select("id")
    .eq("campaign_id", campaign.id)
    .limit(1);
  if (linkedContent.error) throw linkedContent.error;
  if (linkedContent.data && linkedContent.data.length > 0) {
    throw new Error("This campaign has content rows. Hide it instead of deleting it.");
  }
  const deleted = await window.flowmateSupabase
    .from("marketing_campaigns")
    .delete()
    .eq("id", campaign.id);
  if (deleted.error) throw deleted.error;
  await showMarketingPlanCampaignTag(campaign.name);
  return loadMarketingPlanCampaignOptions({ includeHidden: true });
}

window.loadFlowMateMarketingCampaignOptions = loadMarketingPlanCampaignOptions;
window.addFlowMateMarketingCampaignTag = addMarketingPlanCampaignTag;
window.hideFlowMateMarketingCampaignTag = hideMarketingPlanCampaignTag;
window.showFlowMateMarketingCampaignTag = showMarketingPlanCampaignTag;
window.deleteFlowMateMarketingCampaignTag = deleteMarketingPlanCampaignTag;

async function createMarketingPlanWorkingSheetRow(form) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready. Please refresh after the app loads.");
  }
  const monthKey = marketingPlanMonthKeyFromDate(form.launchDate);
  const title = String(form.productEvent || "").trim() || marketingPlanTitleFromDetails(form.details, form.assetType);
  const selectedChannels = Array.isArray(form.channels) && form.channels.length
    ? form.channels
    : ["other"];
  const planId = await findOrCreateMarketingPlan(monthKey);
  const campaignId = await findOrCreateMarketingCampaign(planId, form.campaignName, getMarketingPlanCurrentUserDefaults().team || null);
  const contentPayload = {
    campaign_id: campaignId,
    title,
    details: String(form.details || title || "").trim(),
    team: getMarketingPlanCurrentUserDefaults().team || null,
    format: form.assetType || null,
    content_tier: form.contentTier || null,
    pic_name: getMarketingPlanCurrentUserDefaults().picName || null,
    pic_user_id: getMarketingPlanCurrentUserDefaults().picUserId || null,
    brief_link: String(form.briefLink || "").trim() || null,
    source_start_date: form.launchDate || null,
    source_start_time: form.publishTime || null,
    note: String(form.note || "").trim() || null,
  };
  const contentResult = await window.flowmateSupabase
    .from("marketing_content_items")
    .insert(contentPayload)
    .select("id")
    .single();
  if (contentResult.error) throw contentResult.error;
  const contentItemId = contentResult.data.id;
  const insertRows = selectedChannels.map(channel => ({
    content_item_id: contentItemId,
    channel,
    publish_date: form.launchDate || null,
    publish_time: form.publishTime || null,
    placement_status: "planned",
  }));
  const placementResult = await window.flowmateSupabase
    .from("marketing_channel_placements")
    .insert(insertRows);
  if (placementResult.error) throw placementResult.error;
  return { contentItemId, placementCount: insertRows.length };
}

async function updateMarketingPlanWorkingSheetBriefLinkFromCreativeRequest(contentItemId, briefLink, flowMateWorkItemId = "") {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready. Please refresh after the app loads.");
  }
  if (!contentItemId) throw new Error("Content item is missing.");
  if (!briefLink) throw new Error("Creative Request link is missing.");

  const updatePayload = { brief_link: briefLink };
  if (flowMateWorkItemId) updatePayload.flowmate_work_item_id = flowMateWorkItemId;

  const result = await window.flowmateSupabase
    .from("marketing_content_items")
    .update(updatePayload)
    .eq("id", contentItemId);
  if (result.error) throw result.error;
  const placementResult = await window.flowmateSupabase
    .from("marketing_channel_placements")
    .update({ placement_status: "assigned" })
    .eq("content_item_id", contentItemId)
    .eq("placement_status", "planned");
  if (placementResult.error) throw placementResult.error;
  window.dispatchEvent(new CustomEvent("flowmate:refresh-request", { detail: { reason: "marketing_plan_creative_request_link" } }));
  return { contentItemId, briefLink };
}
window.updateMarketingPlanWorkingSheetBriefLinkFromCreativeRequest = updateMarketingPlanWorkingSheetBriefLinkFromCreativeRequest;

async function updateMarketingPlanWorkingSheetPlacementFields(contentItemId, changes) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready. Please refresh after the app loads.");
  }
  if (!contentItemId) throw new Error("Content item is missing.");
  const payload = {};
  if (Object.prototype.hasOwnProperty.call(changes, "status")) {
    payload.placement_status = normalizeMarketingPlanWorkingStatus(changes.status);
  }
  if (Object.prototype.hasOwnProperty.call(changes, "publishTime")) {
    payload.publish_time = changes.publishTime || null;
  }
  if (Object.keys(payload).length === 0) return false;
  const result = await window.flowmateSupabase
    .from("marketing_channel_placements")
    .update(payload)
    .eq("content_item_id", contentItemId);
  if (result.error) throw result.error;
  window.dispatchEvent(new CustomEvent("flowmate:refresh-request", { detail: { reason: "marketing_plan_working_sheet_updated" } }));
  return true;
}

async function syncMarketingPlanWorkingSheetPlacementsDirect(row, form, selectedChannels, normalizedTime) {
  const existingPlacements = Array.isArray(row.placements) ? row.placements : [];
  const existingByChannel = new Map(existingPlacements.map(placement => [placement.channel, placement]));
  const selectedSet = new Set(selectedChannels);
  const deleteIds = existingPlacements
    .filter(placement => placement.placementId && !selectedSet.has(placement.channel))
    .map(placement => placement.placementId);
  if (deleteIds.length > 0) {
    const deleted = await window.flowmateSupabase
      .from("marketing_channel_placements")
      .delete()
      .in("id", deleteIds);
    if (deleted.error) throw deleted.error;
  }

  const updateIds = selectedChannels
    .map(channel => existingByChannel.get(channel))
    .filter(placement => placement && placement.placementId)
    .map(placement => placement.placementId);
  if (updateIds.length > 0) {
    const updated = await window.flowmateSupabase
      .from("marketing_channel_placements")
      .update({
        publish_date: form.publishDate || null,
        publish_time: normalizedTime,
      })
      .in("id", updateIds);
    if (updated.error) throw updated.error;
  }

  const insertRows = selectedChannels
    .filter(channel => !existingByChannel.has(channel))
    .map(channel => ({
      content_item_id: row.contentItemId,
      channel,
      publish_date: form.publishDate || null,
      publish_time: normalizedTime,
      placement_status: normalizeMarketingPlanWorkingStatus(row.placementStatus),
    }));
  if (insertRows.length > 0) {
    const inserted = await window.flowmateSupabase
      .from("marketing_channel_placements")
      .insert(insertRows);
    if (inserted.error) throw inserted.error;
  }
  return true;
}

async function updateMarketingPlanWorkingSheetRow(row, form) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready. Please refresh after the app loads.");
  }
  if (!row || !row.contentItemId) throw new Error("Content item is missing.");
  const selectedChannels = Array.isArray(form.channels) && form.channels.length ? form.channels : [];
  if (selectedChannels.length === 0) throw new Error("Select at least one Channel Tag.");

  const normalizedTime = normalizeMarketingPlanTimeInput(form.publishTime);
  if (!normalizedTime) throw new Error("Time must use HH:MM, for example 15:00.");

  const contentPayload = {
    title: String(form.contentTitle || "").trim(),
    details: String(form.details || form.contentTitle || "").trim(),
    format: form.assetType || null,
    content_tier: form.contentTier || null,
    brief_link: String(form.briefLink || "").trim() || null,
    source_start_date: form.publishDate || null,
    source_start_time: normalizedTime,
  };
  if (!contentPayload.title) throw new Error("Content is required.");

  const contentResult = await window.flowmateSupabase
    .from("marketing_content_items")
    .update(contentPayload)
    .eq("id", row.contentItemId);
  if (contentResult.error) throw contentResult.error;

  await syncMarketingPlanWorkingSheetPlacementsDirect(row, form, selectedChannels, normalizedTime);
  window.dispatchEvent(new CustomEvent("flowmate:refresh-request", { detail: { reason: "marketing_plan_working_sheet_row_edited" } }));
  return true;
}

async function deleteMarketingPlanWorkingSheetRow(row) {
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready. Please refresh after the app loads.");
  }
  if (!row || !row.contentItemId) throw new Error("Content item is missing.");
  const placementResult = await window.flowmateSupabase
    .from("marketing_channel_placements")
    .delete()
    .eq("content_item_id", row.contentItemId);
  if (placementResult.error) throw placementResult.error;
  const result = await window.flowmateSupabase
    .from("marketing_content_items")
    .delete()
    .eq("id", row.contentItemId);
  if (result.error) throw result.error;
  window.dispatchEvent(new CustomEvent("flowmate:refresh-request", { detail: { reason: "marketing_plan_working_sheet_row_deleted" } }));
  return true;
}

function exportMarketingPlanRowsCsv(rows, selectedMonth, selectedChannel = "all") {
  const visibleRows = filterMarketingPlanRows(rows, selectedMonth, selectedChannel);
  const headerLabels = [
    "Month",
    "Campaign",
    "Team",
    "Product / Event",
    "Format",
    "Tier",
    "PIC",
    "Channel",
    "Publish Date",
    "Publish Time",
    "Placement Status",
    "Note",
  ];
  const dataRows = visibleRows.map(row => [
    getMarketingPlanMonthLabel(row.monthKey || (row.publishDate ? row.publishDate.slice(0, 7) : "")),
    row.campaignName,
    row.campaignTeam || row.contentTeam || row.market || "",
    row.contentTitle,
    row.format,
    row.contentTier,
    row.picName,
    getMarketingPlanChannelLabel(row.channel),
    row.publishDate,
    formatMarketingPlanTime(row.publishTime),
    getMarketingPlanStatusLabel(row.placementStatus),
    row.placementNote,
  ]);
  const channelSuffix = selectedChannel === "all" ? "all-channels" : selectedChannel;
  const filename = `marketing-plan-${selectedMonth || "no-month"}-${channelSuffix}.csv`;

  if (window.flowmateDownloadCsv) {
    window.flowmateDownloadCsv(filename, headerLabels, dataRows);
    return visibleRows.length;
  }

  const csv = [headerLabels, ...dataRows]
    .map(row => row.map(value => `"${String(value == null ? "" : value).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return visibleRows.length;
}

function normalizeMarketingPlanSupervisorRow(row) {
  return {
    planId: row.plan_id || "",
    monthKey: row.month_key || (row.launch_date ? String(row.launch_date).slice(0, 7) : ""),
    campaignId: row.campaign_id || "",
    campaignName: row.campaign_name || "No campaign",
    campaignTeam: row.campaign_team || "",
    contentItemId: row.content_item_id || "",
    productEvent: row.product_event || "Untitled asset",
    contentTeam: row.content_team || "",
    picUserId: row.pic_user_id || "",
    picName: row.pic_name || "Unassigned",
    placementId: row.placement_id || "",
    channel: row.channel || "other",
    launchDate: row.launch_date || "",
    publishDate: row.publish_date || "",
    publishTime: row.publish_time || "",
    storedStatus: normalizeMarketingPlanWorkingStatus(row.stored_status || "planned"),
    effectiveStatus: normalizeMarketingPlanWorkingStatus(row.effective_status || row.stored_status || "planned"),
    briefLink: row.brief_link || "",
    firstAssignedAt: row.first_assigned_at || "",
    assignedByUserId: row.assigned_by_user_id || "",
    workingDaysBeforeLaunch: row.working_days_before_launch == null ? null : Number(row.working_days_before_launch),
    calendarDaysBeforeLaunch: row.calendar_days_before_launch == null ? null : Number(row.calendar_days_before_launch),
    riskBucket: row.risk_bucket || "Watch",
    missingBriefLink: Boolean(row.missing_brief_link),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function normalizeMarketingPlanSupervisorSummaryRow(row, type) {
  return {
    type,
    monthKey: row.month_key || "",
    picUserId: row.pic_user_id || "",
    picName: row.pic_name || "Unassigned",
    campaignId: row.campaign_id || "",
    campaignName: row.campaign_name || "No campaign",
    campaignTeam: row.campaign_team || "",
    channel: row.channel || "other",
    totalRows: Number(row.total_rows || 0),
    assignedRows: Number(row.assigned_rows || 0),
    unassignedRows: Number(row.unassigned_rows || 0),
    avgWorkingDaysBeforeLaunch: row.avg_working_days_before_launch == null ? null : Number(row.avg_working_days_before_launch),
    medianWorkingDaysBeforeLaunch: row.median_working_days_before_launch == null ? null : Number(row.median_working_days_before_launch),
    healthyCount: Number(row.healthy_count || 0),
    watchCount: Number(row.watch_count || 0),
    riskCount: Number(row.risk_count || 0),
    criticalCount: Number(row.critical_count || 0),
    missingBriefLinkCount: Number(row.missing_brief_link_count || 0),
  };
}

async function loadMarketingPlanSupervisorRows(user) {
  if (!user || user.role !== "admin") return { monthlyRows: [], picRows: [], campaignRows: [], channelRows: [] };
  if (!window.flowmateSupabase) {
    throw new Error("Supabase client is not ready. Please refresh after the app loads.");
  }

  const [monthlyResult, picResult, campaignResult, channelResult] = await Promise.all([
    window.flowmateSupabase
      .from("marketing_plan_supervisor_monthly_v")
      .select("*")
      .order("month_key", { ascending: true })
      .order("launch_date", { ascending: true })
      .order("campaign_name", { ascending: true }),
    window.flowmateSupabase
      .from("marketing_plan_supervisor_pic_v")
      .select("*")
      .order("month_key", { ascending: true })
      .order("pic_name", { ascending: true }),
    window.flowmateSupabase
      .from("marketing_plan_supervisor_campaign_v")
      .select("*")
      .order("month_key", { ascending: true })
      .order("campaign_name", { ascending: true }),
    window.flowmateSupabase
      .from("marketing_plan_supervisor_channel_v")
      .select("*")
      .order("month_key", { ascending: true })
      .order("channel", { ascending: true }),
  ]);

  for (const result of [monthlyResult, picResult, campaignResult, channelResult]) {
    if (result.error) throw result.error;
  }

  return {
    monthlyRows: (monthlyResult.data || []).map(normalizeMarketingPlanSupervisorRow),
    picRows: (picResult.data || []).map(row => normalizeMarketingPlanSupervisorSummaryRow(row, "pic")),
    campaignRows: (campaignResult.data || []).map(row => normalizeMarketingPlanSupervisorSummaryRow(row, "campaign")),
    channelRows: (channelResult.data || []).map(row => normalizeMarketingPlanSupervisorSummaryRow(row, "channel")),
  };
}

function getMarketingPlanSupervisorMonthOptions(monthlyRows) {
  const months = new Set();
  (monthlyRows || []).forEach(row => {
    if (row.monthKey) months.add(row.monthKey);
  });
  return Array.from(months).sort();
}

function getDefaultMarketingPlanSupervisorMonth(monthOptions) {
  const currentMonth = flowMateTodayDateKey().slice(0, 7);
  if ((monthOptions || []).includes(currentMonth)) return currentMonth;
  return (monthOptions || [])[monthOptions.length - 1] || "";
}

function getMarketingPlanSupervisorFilterOptions(rows, key, labelKey) {
  const options = new Map();
  (rows || []).forEach(row => {
    const value = row[key] || row[labelKey] || "";
    const label = row[labelKey] || value;
    if (value && !options.has(value)) options.set(value, label);
  });
  return Array.from(options.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function filterMarketingPlanSupervisorRows(rows, filters) {
  const activeFilters = filters || {};
  return (rows || [])
    .filter(row => {
      if (activeFilters.month && row.monthKey !== activeFilters.month) return false;
      if (activeFilters.campaign && row.campaignId !== activeFilters.campaign && row.campaignName !== activeFilters.campaign) return false;
      if (activeFilters.channel && row.channel !== activeFilters.channel) return false;
      if (activeFilters.pic && row.picUserId !== activeFilters.pic && row.picName !== activeFilters.pic) return false;
      return true;
    })
    .sort((a, b) => (
      String(a.launchDate || "").localeCompare(String(b.launchDate || "")) ||
      String(a.publishTime || "").localeCompare(String(b.publishTime || "")) ||
      String(a.campaignName || "").localeCompare(String(b.campaignName || "")) ||
      String(a.productEvent || "").localeCompare(String(b.productEvent || ""))
    ));
}

function filterMarketingPlanSupervisorSummaryRows(rows, filters) {
  const activeFilters = filters || {};
  return (rows || []).filter(row => {
    if (activeFilters.month && row.monthKey !== activeFilters.month) return false;
    if (row.type === "pic" && activeFilters.pic && row.picUserId !== activeFilters.pic && row.picName !== activeFilters.pic) return false;
    if (row.type === "campaign" && activeFilters.campaign && row.campaignId !== activeFilters.campaign && row.campaignName !== activeFilters.campaign) return false;
    if (row.type === "channel" && activeFilters.channel && row.channel !== activeFilters.channel) return false;
    return true;
  });
}

function getMarketingPlanSupervisorSummary(rows) {
  const assigned = (rows || []).filter(row => row.firstAssignedAt || row.effectiveStatus !== "planned").length;
  const workingValues = (rows || [])
    .map(row => row.workingDaysBeforeLaunch)
    .filter(value => Number.isFinite(value));
  const avgWorking = workingValues.length
    ? workingValues.reduce((sum, value) => sum + value, 0) / workingValues.length
    : null;
  return {
    totalRows: (rows || []).length,
    assignedRows: assigned,
    unassignedRows: Math.max(((rows || []).length - assigned), 0),
    avgWorkingDaysBeforeLaunch: avgWorking,
    riskRows: (rows || []).filter(row => row.riskBucket === "Risk").length,
    criticalRows: (rows || []).filter(row => row.riskBucket === "Critical").length,
  };
}

function formatMarketingPlanSupervisorNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return "-";
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: digits });
}

function formatMarketingPlanSupervisorDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMarketingPlanSupervisorExportDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  const bangkokDate = new Date(date.getTime() + (7 * 60 * 60 * 1000));
  const year = bangkokDate.getUTCFullYear();
  const month = String(bangkokDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(bangkokDate.getUTCDate()).padStart(2, "0");
  const hour = String(bangkokDate.getUTCHours()).padStart(2, "0");
  const minute = String(bangkokDate.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}, ${hour}:${minute}`;
}

function getMarketingPlanSupervisorRiskClass(bucket) {
  if (bucket === "Healthy") return "badge--delivered";
  if (bucket === "Watch") return "badge--neutral";
  if (bucket === "Risk") return "badge--review";
  if (bucket === "Critical") return "badge--overdue";
  return "badge--neutral";
}

function exportMarketingPlanSupervisorCsv(rows, filters) {
  const visibleRows = filterMarketingPlanSupervisorRows(rows, filters);
  const headerLabels = [
    "Month",
    "Campaign",
    "Product / Event",
    "Channel",
    "Launch Date",
    "Time",
    "PIC",
    "Effective Status",
    "Stored Status",
    "Assigned At",
    "Working Days Before Launch",
    "Risk Bucket",
    "Brief Link",
  ];
  const dataRows = visibleRows.map(row => [
    getMarketingPlanMonthLabel(row.monthKey),
    row.campaignName,
    row.productEvent,
    getMarketingPlanChannelLabel(row.channel),
    row.launchDate,
    formatMarketingPlanTime(row.publishTime),
    row.picName,
    getMarketingPlanStatusLabel(row.effectiveStatus),
    getMarketingPlanStatusLabel(row.storedStatus),
    formatMarketingPlanSupervisorExportDateTime(row.firstAssignedAt),
    row.workingDaysBeforeLaunch == null ? "" : row.workingDaysBeforeLaunch,
    row.riskBucket,
    row.briefLink,
  ]);
  const filenameMonth = (filters && filters.month)
    ? getMarketingPlanMonthLabel(filters.month).toLowerCase().replace(/\s+/g, "-")
    : "all-months";
  const filename = `marketing-plan-supervisor-${filenameMonth}.csv`;

  if (window.flowmateDownloadCsv) {
    window.flowmateDownloadCsv(filename, headerLabels, dataRows);
    return visibleRows.length;
  }

  const csv = [headerLabels, ...dataRows]
    .map(row => row.map(value => `"${String(value == null ? "" : value).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return visibleRows.length;
}

function groupMarketingPlanRowsByChannel(rows, selectedMonth, selectedStatus, selectedChannel = "all") {
  const groups = MARKETING_PLAN_CHANNELS.map(channel => ({
    ...channel,
    placements: [],
  }));
  const groupMap = new Map(groups.map(group => [group.key, group]));

  (rows || [])
    .filter(row => {
      const rowMonth = row.monthKey || (row.publishDate ? row.publishDate.slice(0, 7) : "");
      if (rowMonth !== selectedMonth) return false;
      if (selectedStatus !== "all" && getMarketingPlanViewStatus(row) !== selectedStatus) return false;
      return selectedChannel === "all" || row.channel === selectedChannel;
    })
    .forEach(row => {
      const channelKey = groupMap.has(row.channel) ? row.channel : "other";
      groupMap.get(channelKey).placements.push(row);
    });

  groups.forEach(group => {
    group.placements.sort((a, b) => (
      String(a.publishDate || "").localeCompare(String(b.publishDate || "")) ||
      String(a.publishTime || "").localeCompare(String(b.publishTime || "")) ||
      String(a.campaignName || "").localeCompare(String(b.campaignName || "")) ||
      String(a.contentTitle || "").localeCompare(String(b.contentTitle || ""))
    ));
  });

  return groups.filter(group => group.placements.length > 0);
}

function MarketingPlanTimelineScreen() {
  const [rows, setRows] = useStateApp([]);
  const [selectedMonth, setSelectedMonth] = useStateApp("");
  const [campaignMessage, setCampaignMessage] = useStateApp("");
  const [isCampaignManagerOpen, setIsCampaignManagerOpen] = useStateApp(false);
  const [campaignManagerRows, setCampaignManagerRows] = useStateApp([]);
  const [campaignManagerName, setCampaignManagerName] = useStateApp("");
  const [campaignManagerState, setCampaignManagerState] = useStateApp({ status: "idle", message: "" });
  const [loadState, setLoadState] = useStateApp({ status: "loading", message: "Loading Marketing Plan timeline..." });

  async function loadTimelineRows(isAlive = () => true) {
    if (!window.flowmateSupabase) {
      setLoadState({ status: "error", message: "Supabase client is not ready. Please refresh after the app loads." });
      return;
    }
    try {
      const result = await window.flowmateSupabase
        .from("marketing_plan_timeline_v")
        .select("*")
        .order("month_key", { ascending: true })
        .order("campaign_sort_order", { ascending: true })
        .order("content_sort_order", { ascending: true })
        .order("publish_date", { ascending: true })
        .order("publish_time", { ascending: true });

      if (result.error) throw result.error;
      const normalizedRows = (result.data || []).map(normalizeMarketingPlanTimelineRow);
      const monthOptions = getMarketingPlanMonthOptions(normalizedRows);
      if (!isAlive()) return;
      setRows(normalizedRows);
      setSelectedMonth(current => current && monthOptions.includes(current) ? current : (monthOptions[0] || flowMateTodayDateKey().slice(0, 7)));
      setLoadState({
        status: normalizedRows.length ? "live" : "empty",
        message: normalizedRows.length
          ? "Live Marketing Plan data"
          : "No Marketing Plan data found. Run supabase/marketing_plan.sql, then optionally run select public.marketing_plan_june_2026_sample();",
      });
    } catch (error) {
      if (!isAlive()) return;
      console.error("[Marketing Plan] Timeline load failed:", error);
      setRows([]);
      setSelectedMonth("");
      setLoadState({
        status: "error",
        message: window.flowmateUserError
          ? window.flowmateUserError(error, "Marketing Plan timeline load failed. Run supabase/marketing_plan.sql, then optionally run select public.marketing_plan_june_2026_sample();")
          : "Marketing Plan timeline load failed. Run supabase/marketing_plan.sql, then optionally run select public.marketing_plan_june_2026_sample();",
      });
    }
  }

  useEffectApp(() => {
    let alive = true;
    const isAlive = () => alive;
    loadTimelineRows(isAlive);
    if (window.loadFlowMateMarketingCampaignOptions) {
      window.loadFlowMateMarketingCampaignOptions({ announce: false }).catch((error) => {
        console.warn("[Marketing Plan] Campaign options load failed:", error && error.message);
      });
    }
    const cleanup = window.attachFlowMateLiveRefresh ? window.attachFlowMateLiveRefresh(() => loadTimelineRows(isAlive)) : () => {};
    return () => {
      alive = false;
      cleanup();
    };
  }, []);

  const monthOptions = getMarketingPlanMonthOptions(rows);
  const timelineWindow = getMarketingPlanTimelineWindow(selectedMonth);
  const monthDays = timelineWindow.days;
  const groupedCampaigns = groupMarketingPlanTimelineRows(rows, selectedMonth);
  const channelCountsByDay = getMarketingPlanTimelineChannelCountsByDay(rows, selectedMonth);

  const columnWidth = 38;
  const timelineWidth = Math.max(monthDays.length * columnWidth, 760);
  const leftWidth = 330;

  async function loadCampaignManagerRows() {
    if (!window.loadFlowMateMarketingCampaignOptions) return;
    const campaigns = await window.loadFlowMateMarketingCampaignOptions({ includeHidden: true, announce: false });
    setCampaignManagerRows(campaigns || []);
  }

  async function openCampaignManager() {
    setCampaignManagerState({ status: "idle", message: "" });
    await loadCampaignManagerRows();
    setIsCampaignManagerOpen(true);
  }

  async function handleManagerAddCampaign(event) {
    event.preventDefault();
    if (!window.addFlowMateMarketingCampaignTag) {
      setCampaignManagerState({ status: "error", message: "Campaign manager is not ready. Please refresh the page." });
      return;
    }
    const campaignName = campaignManagerName.trim();
    if (!campaignName) {
      setCampaignManagerState({ status: "error", message: "Campaign name is required." });
      return;
    }
    try {
      const result = await window.addFlowMateMarketingCampaignTag(campaignName, selectedMonth || flowMateTodayDateKey().slice(0, 7));
      setCampaignManagerName("");
      setCampaignManagerState({ status: "saved", message: `Added "${result.campaignName}" to ${getMarketingPlanMonthLabel(result.monthKey)}.` });
      await loadCampaignManagerRows();
      await loadTimelineRows(() => true);
    } catch (error) {
      console.error("[Marketing Plan] Add campaign failed:", error);
      setCampaignManagerState({ status: "error", message: window.flowmateUserError ? window.flowmateUserError(error, "Add Campaign failed.") : "Add Campaign failed." });
    }
  }

  async function handleCampaignVisibility(campaign, mode) {
    setCampaignManagerState({ status: "saving", message: "Updating campaign tag..." });
    try {
      if (mode === "hide") {
        await window.hideFlowMateMarketingCampaignTag(campaign.name);
      } else {
        await window.showFlowMateMarketingCampaignTag(campaign.name);
      }
      await loadCampaignManagerRows();
      setCampaignManagerState({ status: "saved", message: mode === "hide" ? "Campaign tag hidden from selectors." : "Campaign tag shown in selectors." });
    } catch (error) {
      setCampaignManagerState({ status: "error", message: window.flowmateUserError ? window.flowmateUserError(error, "Campaign visibility update failed.") : "Campaign visibility update failed." });
    }
  }

  async function handleDeleteCampaignTag(campaign) {
    setCampaignManagerState({ status: "saving", message: "Deleting campaign tag..." });
    try {
      await window.deleteFlowMateMarketingCampaignTag(campaign);
      await loadCampaignManagerRows();
      setCampaignManagerState({ status: "saved", message: `Deleted "${campaign.name}".` });
      await loadTimelineRows(() => true);
    } catch (error) {
      setCampaignManagerState({ status: "error", message: window.flowmateUserError ? window.flowmateUserError(error, "Delete Campaign failed.") : (error && error.message) || "Delete Campaign failed." });
    }
  }

  function renderPlacementBadge(placement) {
    const statusClass = getMarketingPlanStatusClass(placement.status);
    const timeLabel = formatMarketingPlanTime(placement.publishTime);
    const badgeTimeLabel = formatMarketingPlanBadgeTime(placement.publishTime);
    const channelAbbrev = getMarketingPlanChannelAbbrev(placement.channel);
    return (
      <div
        key={placement.id || `${placement.channel}-${placement.publishDate}-${placement.publishTime}`}
        className={`badge ${statusClass} marketing-timeline-badge`}
        title={`${getMarketingPlanChannelLabel(placement.channel)} - ${placement.publishDate}${timeLabel ? ` ${timeLabel}` : ""} - ${placement.status}`}
        style={{
          width: "100%",
          justifyContent: "center",
        }}
      >
        <span className="marketing-timeline-badge__channel">{channelAbbrev}</span>
        <span className="marketing-timeline-badge__time">{badgeTimeLabel || "-"}</span>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Campaign Timeline</h1>
          <p>Campaign rows, Product / Event sub-rows, and channel placements by publish date.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <select
            className="input"
            style={{ width: 150 }}
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            disabled={monthOptions.length === 0}
          >
            {monthOptions.length === 0 && <option value="">No data</option>}
            {monthOptions.map(monthKey => (
              <option key={monthKey} value={monthKey}>{getMarketingPlanMonthLabel(monthKey)}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn--primary"
            onClick={openCampaignManager}
          >
            <Icon name="settings" /> Manage Campaign
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => window.dispatchEvent(new CustomEvent("flowmate:refresh-request"))}
          >
            <Icon name="refresh" /> Refresh
          </button>
        </div>
      </div>

      {campaignMessage && <div className="reason-box" style={{ marginBottom: 16 }}>{campaignMessage}</div>}

      {isCampaignManagerOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsCampaignManagerOpen(false)}>
          <div className="modal modal--settings" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()}>
            <div className="modal__head">
              <div>
                <h2>Manage Campaign</h2>
                <p>Choose which Campaign tags are shown in Marketing Plan selectors. Delete is allowed only for unused tags.</p>
              </div>
              <button type="button" className="iconbtn" onClick={() => setIsCampaignManagerOpen(false)}><Icon name="x" /></button>
            </div>
            <form className="row" style={{ gap: 8, padding: "12px 16px 0", alignItems: "center" }} onSubmit={handleManagerAddCampaign}>
              <input
                className="input"
                value={campaignManagerName}
                onChange={event => setCampaignManagerName(event.target.value)}
                placeholder="New campaign tag"
              />
              <button type="submit" className="btn btn--primary" disabled={campaignManagerState.status === "saving"}>
                <Icon name="plus" /> Add
              </button>
            </form>
            {campaignManagerState.message && (
              <div className={`reason-box ${campaignManagerState.status === "error" ? "reason-box--need" : ""}`} style={{ margin: "12px 16px 0" }}>
                {campaignManagerState.message}
              </div>
            )}
            <div className="marketing-campaign-manager">
              {campaignManagerRows.map(campaign => {
                const hidden = isMarketingPlanCampaignHidden(campaign.name);
                return (
                  <div key={campaign.id || campaign.name} className="marketing-campaign-manager__row">
                    <div>
                      <div className="strong">{campaign.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {[campaign.team || "No team", campaign.monthKey ? getMarketingPlanMonthLabel(campaign.monthKey) : ""].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <span className={`badge ${hidden ? "badge--neutral" : "badge--delivered"}`}>{hidden ? "Hidden" : "Shown"}</span>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => handleCampaignVisibility(campaign, hidden ? "show" : "hide")}
                        disabled={campaignManagerState.status === "saving"}
                      >
                        {hidden ? "Show" : "Hide"}
                      </button>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => handleDeleteCampaignTag(campaign)}
                        disabled={campaignManagerState.status === "saving"}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
              {campaignManagerRows.length === 0 && <div className="muted">No campaign tags yet.</div>}
            </div>
            <div className="modal__actions">
              <button type="button" className="btn btn--primary" onClick={() => setIsCampaignManagerOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {loadState.status === "loading" && <div className="reason-box">Loading Marketing Plan timeline...</div>}

      {loadState.status === "error" && (
        <div className="reason-box reason-box--need">
          <div className="strong">Marketing Plan data is not ready.</div>
          <div style={{ marginTop: 4 }}>{loadState.message}</div>
          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            SQL required: supabase/marketing_plan.sql. Optional sample data: select public.marketing_plan_june_2026_sample();
          </div>
        </div>
      )}

      {loadState.status === "empty" && (
        <div className="reason-box">
          <div className="strong">No Marketing Plan data yet.</div>
          <div className="muted" style={{ marginTop: 4 }}>
            Run supabase/marketing_plan.sql first. For demo data, run select public.marketing_plan_june_2026_sample();
          </div>
        </div>
      )}

      {loadState.status === "live" && groupedCampaigns.length === 0 && (
        <div className="reason-box">
          No placements in {getMarketingPlanMonthLabel(selectedMonth)}. The month dropdown only shows months found in Marketing Plan data.
        </div>
      )}

      {loadState.status === "live" && groupedCampaigns.length > 0 && (
        <div className="card">
          <div className="card__head">
            <div>
              <span className="card__title">{getMarketingPlanMonthLabel(selectedMonth)} + {getMarketingPlanMonthLabel(getNextMarketingPlanMonthKey(selectedMonth))} campaign timeline</span>
              <div className="card__sub">Main row = Campaign, sub-row = Product / Event, columns = publish date</div>
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {MARKETING_PLAN_WORKING_STATUS_OPTIONS.map(option => (
                <span key={option.value} className={`badge ${getMarketingPlanStatusClass(option.value)}`}>
                  {option.label}
                </span>
              ))}
            </div>
          </div>
          <div className="card__body card__body--flush">
            <div style={{
              maxHeight: "calc(100vh - 220px)",
              overflow: "auto",
              borderTop: "1px solid var(--garena-light-grey)",
            }}>
              <div style={{ minWidth: leftWidth + timelineWidth }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: `${leftWidth}px ${timelineWidth}px`,
                  position: "sticky",
                  top: 0,
                  zIndex: 20,
                  background: "var(--garena-white)",
                  borderBottom: "1px solid var(--garena-light-grey)",
                }}>
                  <div className="eyebrow" style={{
                    padding: "12px 14px",
                    borderRight: "1px solid var(--garena-light-grey)",
                    gridRow: "span 3",
                    position: "sticky",
                    left: 0,
                    zIndex: 5,
                    background: "var(--garena-white)",
                  }}>
                    Campaign / Product Event
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: timelineWindow.monthGroups.map(group => `${group.days.length * columnWidth}px`).join(" ") }}>
                    {timelineWindow.monthGroups.map(group => (
                      <div key={group.key} className="eyebrow" style={{
                        minHeight: 32,
                        padding: "8px 10px",
                        borderRight: "1px solid var(--garena-light-grey)",
                        textAlign: "center",
                        color: "var(--garena-black)",
                      }}>
                        {group.label}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${monthDays.length}, ${columnWidth}px)` }}>
                    {monthDays.map(day => (
                      <div key={day.key} style={{
                        minHeight: 44,
                        padding: "6px 2px",
                        borderRight: "1px solid var(--garena-light-grey)",
                        background: day.isWeekend ? "var(--garena-badge-bg)" : "var(--garena-white)",
                        textAlign: "center",
                      }}>
                        <div className="mono" style={{ fontSize: 11 }}>{day.day}</div>
                        <div className="muted" style={{ fontSize: 10 }}>{day.weekday}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${monthDays.length}, ${columnWidth}px)` }}>
                    {monthDays.map(day => {
                      const dayCounts = channelCountsByDay[day.key] || {};
                      return (
                        <div key={`${day.key}-channel-counts`} style={{
                          minHeight: 42,
                          padding: "4px 2px",
                          borderRight: "1px solid var(--garena-light-grey)",
                          background: day.isWeekend ? "var(--garena-badge-bg)" : "var(--garena-white)",
                          textAlign: "center",
                        }}>
                          {MARKETING_PLAN_TIMELINE_COUNT_CHANNELS.map(channel => {
                            const count = dayCounts[channel.key] || 0;
                            return count > 0 ? (
                              <div
                                key={channel.key}
                                className={`marketing-timeline-channel-count${count > 4 ? " marketing-timeline-channel-count--high" : ""}`}
                              >
                                {channel.label} {count}
                              </div>
                            ) : null;
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {groupedCampaigns.map(campaign => (
                  <div key={campaign.id}>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: `${leftWidth}px ${timelineWidth}px`,
                      borderBottom: "1px solid var(--garena-light-grey)",
                      background: "#F7F7F7",
                    }}>
                      <div style={{
                        padding: "10px 14px",
                        borderRight: "1px solid var(--garena-light-grey)",
                        position: "sticky",
                        left: 0,
                        zIndex: 3,
                        background: "#F7F7F7",
                      }}>
                        <div className="strong">{campaign.name}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{campaign.team || "No team"} · {campaign.assets.length} assets</div>
                      </div>
                      <div></div>
                    </div>
                    {campaign.assets.map(asset => (
                      <div key={asset.id} style={{
                        display: "grid",
                        gridTemplateColumns: `${leftWidth}px ${timelineWidth}px`,
                        minHeight: 58,
                        borderBottom: "1px solid var(--garena-light-grey)",
                        background: "var(--garena-white)",
                      }}>
                        <div style={{
                          padding: "9px 14px",
                          borderRight: "1px solid var(--garena-light-grey)",
                          minWidth: 0,
                          position: "sticky",
                          left: 0,
                          zIndex: 2,
                          background: "var(--garena-white)",
                        }}>
                          <div className="strong" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.title}</div>
                          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                            {getMarketingPlanTimelineAssetMeta(asset)}
                          </div>
                        </div>
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: `repeat(${monthDays.length}, ${columnWidth}px)`,
                          backgroundImage: `linear-gradient(to right, transparent ${columnWidth - 1}px, var(--garena-light-grey) ${columnWidth - 1}px)`,
                          backgroundSize: `${columnWidth}px 100%`,
                        }}>
                          {monthDays.map(day => {
                            const dayPlacements = asset.placements.filter(placement => placement.publishDate === day.key);
                            return (
                              <div key={`${asset.id}-${day.key}`} style={{
                                minHeight: 58,
                                padding: "5px 3px",
                                background: day.isWeekend ? "rgba(246, 246, 246, 0.65)" : "transparent",
                              }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                  {dayPlacements.map(renderPlacementBadge)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MarketingPlanChannelPlanScreen() {
  const [rows, setRows] = useStateApp([]);
  const [selectedMonth, setSelectedMonth] = useStateApp("");
  const [selectedStatus, setSelectedStatus] = useStateApp("all");
  const [selectedChannel, setSelectedChannel] = useStateApp("all");
  const [loadState, setLoadState] = useStateApp({ status: "loading", message: "Loading Marketing Plan channel placements..." });

  useEffectApp(() => {
    let alive = true;
    async function loadTimelineRows() {
      if (!window.flowmateSupabase) {
        setLoadState({ status: "error", message: "Supabase client is not ready. Please refresh after the app loads." });
        return;
      }
      try {
        const result = await window.flowmateSupabase
          .from("marketing_plan_timeline_v")
          .select("*")
          .order("month_key", { ascending: true })
          .order("channel", { ascending: true })
          .order("publish_date", { ascending: true })
          .order("publish_time", { ascending: true });

        if (result.error) throw result.error;
        const normalizedRows = (result.data || []).map(normalizeMarketingPlanTimelineRow);
        const monthOptions = getMarketingPlanMonthOptions(normalizedRows);
        if (!alive) return;
        setRows(normalizedRows);
        setSelectedMonth(current => current && monthOptions.includes(current) ? current : (monthOptions[0] || ""));
        setSelectedStatus(current => current || "all");
        setSelectedChannel(current => current || "all");
        setLoadState({
          status: normalizedRows.length ? "live" : "empty",
          message: normalizedRows.length
            ? "Live Marketing Plan channel data"
            : "No Marketing Plan data found. Run supabase/marketing_plan.sql, then optionally run select public.marketing_plan_june_2026_sample();",
        });
      } catch (error) {
        if (!alive) return;
        console.error("[Marketing Plan] Channel Plan load failed:", error);
        setRows([]);
        setSelectedMonth("");
        setSelectedStatus("all");
        setSelectedChannel("all");
        setLoadState({
          status: "error",
          message: window.flowmateUserError
            ? window.flowmateUserError(error, "Marketing Plan channel plan load failed. Run supabase/marketing_plan.sql, then optionally run select public.marketing_plan_june_2026_sample();")
            : "Marketing Plan channel plan load failed. Run supabase/marketing_plan.sql, then optionally run select public.marketing_plan_june_2026_sample();",
        });
      }
    }

    loadTimelineRows();
    const cleanup = window.attachFlowMateLiveRefresh ? window.attachFlowMateLiveRefresh(loadTimelineRows) : () => {};
    return () => {
      alive = false;
      cleanup();
    };
  }, []);

  const monthOptions = getMarketingPlanMonthOptions(rows);
  const statusOptions = getMarketingPlanPlacementStatusOptions(rows, selectedMonth);
  const channelOptions = getMarketingPlanChannelOptions(rows, selectedMonth);
  const groupedChannels = groupMarketingPlanRowsByChannel(rows, selectedMonth, selectedStatus, selectedChannel);

  function renderStatusBadge(status) {
    const statusClass = getMarketingPlanStatusClass(status);
    return <span className={`badge ${statusClass}`}>{getMarketingPlanStatusLabel(status)}</span>;
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Channel Plan</h1>
          <p>Marketing placements grouped by channel, campaign, and publish schedule.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <select
            className="input"
            style={{ width: 150 }}
            value={selectedMonth}
            onChange={(event) => {
              setSelectedMonth(event.target.value);
              setSelectedStatus("all");
              setSelectedChannel("all");
            }}
            disabled={monthOptions.length === 0}
          >
            {monthOptions.length === 0 && <option value="">No data</option>}
            {monthOptions.map(monthKey => (
              <option key={monthKey} value={monthKey}>{getMarketingPlanMonthLabel(monthKey)}</option>
            ))}
          </select>
          <select
            className="input"
            style={{ width: 160 }}
            value={selectedChannel}
            onChange={(event) => setSelectedChannel(event.target.value)}
            disabled={monthOptions.length === 0}
            aria-label="Filter By Channel"
          >
            <option value="all">Filter By Channel</option>
            {channelOptions.map(channel => (
              <option key={channel} value={channel}>{getMarketingPlanChannelLabel(channel)}</option>
            ))}
          </select>
          <select
            className="input"
            style={{ width: 140 }}
            value={selectedStatus}
            onChange={(event) => setSelectedStatus(event.target.value)}
            disabled={monthOptions.length === 0}
          >
            <option value="all">All statuses</option>
            {statusOptions.map(status => (
              <option key={status} value={status}>{getMarketingPlanStatusLabel(status)}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => window.dispatchEvent(new CustomEvent("flowmate:refresh-request"))}
          >
            <Icon name="refresh" /> Refresh
          </button>
        </div>
      </div>

      {loadState.status === "loading" && <div className="reason-box">Loading Marketing Plan channel placements...</div>}

      {loadState.status === "error" && (
        <div className="reason-box reason-box--need">
          <div className="strong">Marketing Plan data is not ready.</div>
          <div style={{ marginTop: 4 }}>{loadState.message}</div>
          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            SQL required: supabase/marketing_plan.sql. Optional sample data: select public.marketing_plan_june_2026_sample();
          </div>
        </div>
      )}

      {loadState.status === "empty" && (
        <div className="reason-box">
          <div className="strong">No Marketing Plan data yet.</div>
          <div className="muted" style={{ marginTop: 4 }}>
            Run supabase/marketing_plan.sql first. For demo data, run select public.marketing_plan_june_2026_sample();
          </div>
        </div>
      )}

      {loadState.status === "live" && groupedChannels.length === 0 && (
        <div className="reason-box">
          No placements match {getMarketingPlanMonthLabel(selectedMonth)}, {selectedChannel === "all" ? "all channels" : getMarketingPlanChannelLabel(selectedChannel)}, and {selectedStatus === "all" ? "all statuses" : getMarketingPlanStatusLabel(selectedStatus)}.
        </div>
      )}

      {loadState.status === "live" && groupedChannels.length > 0 && (
        <div className="card">
          <div className="card__head">
            <div>
              <span className="card__title">{getMarketingPlanMonthLabel(selectedMonth)} channel plan</span>
              <div className="card__sub">Grouped by channel first. Schedule uses publish date and publish time from Marketing Plan placements.</div>
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {MARKETING_PLAN_CHANNELS.map(channel => (
                <span key={channel.key} className="badge badge--neutral">{channel.label}</span>
              ))}
            </div>
          </div>
          <div className="card__body marketing-channel-plan" style={{ display: "grid", gap: 14 }}>
            {groupedChannels.map(group => (
              <div key={group.key} style={{ border: "1px solid var(--garena-light-grey)", borderRadius: 8, overflow: "hidden" }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  background: "var(--garena-badge-bg)",
                  borderBottom: "1px solid var(--garena-light-grey)",
                }}>
                  <div>
                    <div className="strong">{group.label}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{group.placements.length} placements</div>
                  </div>
                  <span className="badge badge--assigned">Active</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="table table--dense marketing-channel-table">
                    <thead>
                      <tr>
                        <th className="col-date">Publish date</th>
                        <th className="col-time">Time</th>
                        <th className="col-campaign">Campaign</th>
                        <th className="col-asset">Product / Event</th>
                        <th className="col-link">Brief Link</th>
                        <th className="col-status">Status</th>
                        <th className="col-pic">PIC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.placements.map(placement => (
                        <tr key={placement.placementId || `${placement.channel}-${placement.contentItemId}-${placement.publishDate}-${placement.publishTime}`}>
                          <td>{formatMarketingPlanDate(placement.publishDate)}</td>
                          <td className="mono">{formatMarketingPlanTime(placement.publishTime) || "-"}</td>
                          <td>
                            <div className="strong">{placement.campaignName}</div>
                            <div className="muted" style={{ fontSize: 12 }}>{placement.campaignTeam || placement.market || "-"}</div>
                          </td>
                          <td>
                            <div>{placement.contentTitle}</div>
                            <div className="muted" style={{ fontSize: 12 }}>
                              {[placement.format, placement.contentTier, placement.placementNote].filter(Boolean).join(" · ") || "No details"}
                            </div>
                          </td>
                          <td>
                            {placement.briefLink ? (
                              <a className="marketing-working-link" href={placement.briefLink} target="_blank" rel="noreferrer">Link</a>
                            ) : "-"}
                          </td>
                          <td>{renderStatusBadge(getMarketingPlanViewStatus(placement))}</td>
                          <td>{placement.picName || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MarketingPlanCalendarScreen() {
  const [rows, setRows] = useStateApp([]);
  const [selectedMonth, setSelectedMonth] = useStateApp("");
  const [selectedChannel, setSelectedChannel] = useStateApp("all");
  const [calendarViewMode, setCalendarViewMode] = useStateApp("schedule");
  const [selectedScheduleDate, setSelectedScheduleDate] = useStateApp("");
  const [loadState, setLoadState] = useStateApp({ status: "loading", message: "Loading Marketing Plan calendar..." });

  useEffectApp(() => {
    let alive = true;
    async function loadCalendarRows() {
      try {
        const normalizedRows = await loadMarketingPlanTimelineRows("publish_date");
        const monthOptions = getMarketingPlanMonthOptions(normalizedRows);
        if (!alive) return;
        setRows(normalizedRows);
        setSelectedMonth(current => current && monthOptions.includes(current) ? current : (monthOptions[0] || ""));
        setSelectedChannel("all");
        setSelectedScheduleDate("");
        setLoadState({
          status: normalizedRows.length ? "live" : "empty",
          message: normalizedRows.length
            ? "Live Marketing Plan calendar data"
            : "No Marketing Plan data found. Run supabase/marketing_plan.sql, then optionally run select public.marketing_plan_june_2026_sample();",
        });
      } catch (error) {
        if (!alive) return;
        console.error("[Marketing Plan] Calendar load failed:", error);
        setRows([]);
        setSelectedMonth("");
        setSelectedChannel("all");
        setLoadState({
          status: "error",
          message: window.flowmateUserError
            ? window.flowmateUserError(error, "Marketing Plan calendar load failed. Run supabase/marketing_plan.sql, then optionally run select public.marketing_plan_june_2026_sample();")
            : "Marketing Plan calendar load failed. Run supabase/marketing_plan.sql, then optionally run select public.marketing_plan_june_2026_sample();",
        });
      }
    }

    loadCalendarRows();
    const cleanup = window.attachFlowMateLiveRefresh ? window.attachFlowMateLiveRefresh(loadCalendarRows) : () => {};
    return () => {
      alive = false;
      cleanup();
    };
  }, []);

  const monthOptions = getMarketingPlanMonthOptions(rows);
  const channelOptions = getMarketingPlanChannelOptions(rows, selectedMonth);
  const monthDays = getMarketingPlanDays(selectedMonth);
  const viewDays = getMarketingPlanCalendarViewDays(selectedMonth, calendarViewMode);
  const scheduleDayKeys = calendarViewMode === "schedule" && selectedScheduleDate
    ? [selectedScheduleDate]
    : viewDays;
  const calendarHours = Array.from({ length: 24 }, (_, hour) => hour);
  const firstDay = monthDays[0] ? new Date(`${monthDays[0].key}T00:00:00Z`).getUTCDay() : 0;
  const calendarCells = [
    ...Array.from({ length: firstDay }, (_, index) => ({ key: `blank-${index}`, isBlank: true })),
    ...monthDays,
  ];
  const visibleRows = filterMarketingPlanRows(rows, selectedMonth, selectedChannel);
  const rowsByDate = visibleRows.reduce((map, row) => {
    if (!map.has(row.publishDate)) map.set(row.publishDate, []);
    map.get(row.publishDate).push(row);
    return map;
  }, new Map());

  function renderStatusBadge(status) {
    const statusClass = getMarketingPlanStatusClass(status);
    return <span className={`badge ${statusClass}`}>{getMarketingPlanStatusLabel(status)}</span>;
  }

  function openScheduleForDate(dateKey) {
    setSelectedScheduleDate(dateKey);
    setCalendarViewMode("schedule");
  }

  function renderCalendarPlacement(row, options = {}) {
    return (
      <div
        key={row.placementId || `${row.contentItemId}-${row.channel}-${row.publishTime}`}
        className={options.compact ? "marketing-calendar-event marketing-calendar-event--compact" : "marketing-calendar-event"}
      >
        <div className="strong">{row.campaignName}</div>
        <div>{row.contentTitle}</div>
        <div className="row" style={{ gap: 5, flexWrap: "wrap", marginTop: 4 }}>
          <span className="badge badge--neutral">{getMarketingPlanChannelLabel(row.channel)}</span>
          <span className="mono muted">{formatMarketingPlanTime(row.publishTime) || "-"}</span>
          {renderStatusBadge(getMarketingPlanViewStatus(row))}
          {row.picName && <span className="muted">{row.picName}</span>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Calendar</h1>
          <p>Monthly publishing calendar based on placement publish date and time.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <select
            className="input"
            style={{ width: 150 }}
            value={selectedMonth}
            onChange={(event) => {
              setSelectedMonth(event.target.value);
              setSelectedChannel("all");
              setSelectedScheduleDate("");
            }}
            disabled={monthOptions.length === 0}
          >
            {monthOptions.length === 0 && <option value="">No data</option>}
            {monthOptions.map(monthKey => (
              <option key={monthKey} value={monthKey}>{getMarketingPlanMonthLabel(monthKey)}</option>
            ))}
          </select>
          <select
            className="input"
            style={{ width: 150 }}
            value={selectedChannel}
            onChange={(event) => {
              setSelectedChannel(event.target.value);
              setSelectedScheduleDate("");
            }}
            disabled={monthOptions.length === 0}
          >
            <option value="all">All channels</option>
            {channelOptions.map(channel => (
              <option key={channel} value={channel}>{getMarketingPlanChannelLabel(channel)}</option>
            ))}
          </select>
          <select
            className="input"
            style={{ width: 132 }}
            value={calendarViewMode}
            onChange={(event) => {
              const nextMode = event.target.value;
              setCalendarViewMode(nextMode);
              if (nextMode !== "schedule") setSelectedScheduleDate("");
            }}
            disabled={monthOptions.length === 0}
            aria-label="Calendar view"
          >
            {MARKETING_PLAN_CALENDAR_VIEW_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => window.dispatchEvent(new CustomEvent("flowmate:refresh-request"))}
          >
            <Icon name="refresh" /> Refresh
          </button>
        </div>
      </div>

      {loadState.status === "loading" && <div className="reason-box">Loading Marketing Plan calendar...</div>}

      {loadState.status === "error" && (
        <div className="reason-box reason-box--need">
          <div className="strong">Marketing Plan data is not ready.</div>
          <div style={{ marginTop: 4 }}>{loadState.message}</div>
          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            SQL required: supabase/marketing_plan.sql. Optional sample data: select public.marketing_plan_june_2026_sample();
          </div>
        </div>
      )}

      {loadState.status === "empty" && (
        <div className="reason-box">
          <div className="strong">No Marketing Plan data yet.</div>
          <div className="muted" style={{ marginTop: 4 }}>
            Run supabase/marketing_plan.sql first. For demo data, run select public.marketing_plan_june_2026_sample();
          </div>
        </div>
      )}

      {loadState.status === "live" && visibleRows.length === 0 && (
        <div className="reason-box">
          No placements match {getMarketingPlanMonthLabel(selectedMonth)} and {selectedChannel === "all" ? "all channels" : getMarketingPlanChannelLabel(selectedChannel)}.
        </div>
      )}

      {loadState.status === "live" && visibleRows.length > 0 && (
        <div className="card">
          <div className="card__head">
            <div>
              <span className="card__title">{getMarketingPlanCalendarRangeLabel(viewDays, calendarViewMode, selectedMonth)}</span>
              <div className="card__sub">Day, Week, Month, 4 Days, and Schedule read the same Marketing Plan placements.</div>
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {MARKETING_PLAN_WORKING_STATUS_OPTIONS.map(option => (
                <span key={option.value} className={`badge ${getMarketingPlanStatusClass(option.value)}`}>
                  {option.label}
                </span>
              ))}
            </div>
          </div>
          <div className="card__body">
            {calendarViewMode === "schedule" ? (
              <div className="marketing-calendar-schedule">
                {scheduleDayKeys.map(dayKey => {
                  const dayRows = (rowsByDate.get(dayKey) || []).sort((a, b) => String(a.publishTime || "").localeCompare(String(b.publishTime || "")));
                  if (dayRows.length === 0) return null;
                  return (
                    <div key={dayKey} className="marketing-calendar-schedule__day">
                      <div className="marketing-calendar-schedule__date">
                        <span className="mono strong">{new Date(`${dayKey}T00:00:00Z`).getUTCDate()}</span>
                        <span className="muted">{formatMarketingPlanShortWeekday(dayKey)}</span>
                      </div>
                      <div className="marketing-calendar-schedule__items">
                        {dayRows.map(row => (
                          <div key={row.placementId || `${row.contentItemId}-${row.channel}-${row.publishTime}`} className="marketing-calendar-schedule__item">
                            <span className="mono">{formatMarketingPlanTime(row.publishTime) || "All day"}</span>
                            <span className="badge badge--neutral">{getMarketingPlanChannelLabel(row.channel)}</span>
                            <span className="strong">{row.campaignName}</span>
                            <span>{row.contentTitle}</span>
                            {renderStatusBadge(getMarketingPlanViewStatus(row))}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : calendarViewMode === "month" ? (
              <div className="marketing-calendar-month-grid">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(dayName => (
                  <div key={dayName} className="eyebrow" style={{ padding: "0 4px" }}>{dayName}</div>
                ))}
                {calendarCells.map(cell => {
                  if (cell.isBlank) return <div key={cell.key} style={{ minHeight: 116 }}></div>;
                  const dayRows = rowsByDate.get(cell.key) || [];
                  return (
                    <div key={cell.key} className={`marketing-calendar-month-cell ${cell.isWeekend ? "is-weekend" : ""}`}>
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span className="mono strong">{cell.day}</span>
                        {dayRows.length > 0 && <button type="button" className="marketing-calendar-month-count" onClick={() => openScheduleForDate(cell.key)}>{dayRows.length}</button>}
                      </div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {dayRows.slice(0, 2).map(row => renderCalendarPlacement(row, { compact: true }))}
                        {dayRows.length > 2 && (
                          <button type="button" className="marketing-calendar-more" onClick={() => openScheduleForDate(cell.key)}>
                            +{dayRows.length - 2} more placements
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="marketing-calendar-time-grid" style={{ gridTemplateColumns: `68px repeat(${viewDays.length}, minmax(180px, 1fr))` }}>
                <div className="marketing-calendar-time-grid__corner">GMT+07</div>
                {viewDays.map(dayKey => (
                  <div key={dayKey} className="marketing-calendar-time-grid__dayhead">
                    <span className="muted">{formatMarketingPlanShortWeekday(dayKey)}</span>
                    <span className="mono strong">{new Date(`${dayKey}T00:00:00Z`).getUTCDate()}</span>
                  </div>
                ))}
                {calendarHours.map(hour => (
                  <React.Fragment key={`hour-${hour}`}>
                    <div className="marketing-calendar-time-grid__hour">{String(hour).padStart(2, "0")}:00</div>
                    {viewDays.map(dayKey => {
                      const dayRows = (rowsByDate.get(dayKey) || []).filter(row => Number(String(row.publishTime || "00").slice(0, 2)) === hour);
                      return (
                        <div key={`${dayKey}-${hour}`} className="marketing-calendar-time-grid__slot">
                          {dayRows.map(row => renderCalendarPlacement(row, { compact: true }))}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MarketingPlanWorkingSheetScreen() {
  const [rows, setRows] = useStateApp([]);
  const [selectedMonth, setSelectedMonth] = useStateApp("");
  const [selectedChannel, setSelectedChannel] = useStateApp("all");
  const [campaignOptions, setCampaignOptions] = useStateApp(() => window.FLOWMATE_MARKETING_CAMPAIGNS || []);
  const [exportMessage, setExportMessage] = useStateApp("");
  const [sheetForm, setSheetForm] = useStateApp(getDefaultMarketingPlanWorkingSheetForm);
  const [saveState, setSaveState] = useStateApp({ status: "idle", message: "" });
  const [updatingRowId, setUpdatingRowId] = useStateApp("");
  const [editingWorkingRow, setEditingWorkingRow] = useStateApp(null);
  const [editForm, setEditForm] = useStateApp(null);
  const [loadState, setLoadState] = useStateApp({ status: "loading", message: "Loading Marketing Plan working sheet..." });

  async function loadWorkingSheetRows(aliveRef) {
    try {
      const normalizedRows = await loadMarketingPlanTimelineRows("publish_date");
      const monthOptions = getMarketingPlanMonthOptions(normalizedRows);
      if (aliveRef && !aliveRef.alive) return;
      setRows(normalizedRows);
      setSelectedMonth(current => current && monthOptions.includes(current) ? current : (monthOptions[0] || marketingPlanMonthKeyFromDate(sheetForm.launchDate)));
      setSelectedChannel("all");
      setLoadState({
        status: normalizedRows.length ? "live" : "empty",
        message: normalizedRows.length
          ? "Live Marketing Plan working sheet data"
          : "No Marketing Plan data yet. Add the first row below.",
      });
    } catch (error) {
      if (aliveRef && !aliveRef.alive) return;
      console.error("[Marketing Plan] Working Sheet load failed:", error);
      setRows([]);
      setSelectedMonth("");
      setSelectedChannel("all");
      setLoadState({
        status: "error",
        message: window.flowmateUserError
          ? window.flowmateUserError(error, "Marketing Plan working sheet load failed. Run supabase/marketing_plan.sql first.")
          : "Marketing Plan working sheet load failed. Run supabase/marketing_plan.sql first.",
      });
    }
  }

  useEffectApp(() => {
    const aliveRef = { alive: true };
    const loadRows = () => loadWorkingSheetRows(aliveRef);
    loadRows();
    const cleanup = window.attachFlowMateLiveRefresh ? window.attachFlowMateLiveRefresh(loadRows) : () => {};
    return () => {
      aliveRef.alive = false;
      cleanup();
    };
  }, []);

  useEffectApp(() => {
    let alive = true;
    function syncCampaignOptions(event) {
      const campaigns = event && event.detail && event.detail.campaigns
        ? event.detail.campaigns
        : (window.FLOWMATE_MARKETING_CAMPAIGNS || []);
      if (alive) setCampaignOptions(campaigns);
    }
    window.addEventListener("flowmate:marketing-campaigns-updated", syncCampaignOptions);
    if (window.loadFlowMateMarketingCampaignOptions) {
      window.loadFlowMateMarketingCampaignOptions()
        .then((campaigns) => { if (alive) setCampaignOptions(campaigns || []); })
        .catch((error) => console.warn("[Marketing Plan] Campaign options load failed:", error && error.message));
    }
    return () => {
      alive = false;
      window.removeEventListener("flowmate:marketing-campaigns-updated", syncCampaignOptions);
    };
  }, []);

  const monthOptions = getMarketingPlanMonthOptions(rows);
  const channelOptions = getMarketingPlanChannelOptions(rows, selectedMonth);
  const visiblePlacementRows = filterMarketingPlanRows(rows, selectedMonth, selectedChannel);
  const visibleRows = groupMarketingPlanWorkingSheetRows(rows, selectedMonth, selectedChannel);

  function canManageMarketingPlanWorkingRow(row) {
    const currentUser = window.FLOWMATE_CURRENT_USER || {};
    if (currentUser.role === "admin") return true;
    return Boolean(row && row.picUserId && currentUser.id && row.picUserId === currentUser.id);
  }

  function updateSheetForm(key, value) {
    setSheetForm(current => ({ ...current, [key]: value }));
  }

  function toggleSheetChannel(channelKey) {
    setSheetForm(current => {
      const currentChannels = Array.isArray(current.channels) ? current.channels : [];
      const nextChannels = currentChannels.includes(channelKey)
        ? currentChannels.filter(channel => channel !== channelKey)
        : [...currentChannels, channelKey];
      return { ...current, channels: nextChannels.length ? nextChannels : [channelKey] };
    });
  }

  function normalizeSheetTimeValue() {
    const normalizedTime = normalizeMarketingPlanPublishTimeOption(sheetForm.publishTime);
    updateSheetForm("publishTime", normalizedTime || "11:00");
  }

  function startEditWorkingRow(row) {
    if (!canManageMarketingPlanWorkingRow(row)) {
      setExportMessage("Only PIC or Admin can edit this row.");
      return;
    }
    const selectedChannels = Array.isArray(row.channels) && row.channels.length
      ? row.channels
      : (row.channel ? [row.channel] : ["facebook"]);
    setEditingWorkingRow(row);
    setEditForm({
      contentTitle: row.contentTitle || "",
      publishDate: row.publishDate || flowMateTodayDateKey(),
      publishTime: normalizeMarketingPlanPublishTimeOption(row.publishTime) || "",
      assetType: row.format || "Banner",
      contentTier: row.contentTier || "B",
      briefLink: row.briefLink || "",
      channels: selectedChannels,
    });
    setExportMessage("");
  }

  function updateEditForm(key, value) {
    setEditForm(current => ({ ...(current || {}), [key]: value }));
  }

  function toggleEditChannel(channelKey) {
    setEditForm(current => {
      const currentChannels = Array.isArray(current && current.channels) ? current.channels : [];
      const nextChannels = currentChannels.includes(channelKey)
        ? currentChannels.filter(channel => channel !== channelKey)
        : [...currentChannels, channelKey];
      return { ...(current || {}), channels: nextChannels.length ? nextChannels : [channelKey] };
    });
  }

  async function handleSaveEditWorkingRow(event) {
    event.preventDefault();
    if (!editingWorkingRow || !editForm) return;
    const normalizedTime = normalizeMarketingPlanPublishTimeOption(editForm.publishTime);
    if (!normalizedTime) {
      setExportMessage("Select a posting time: 11:00, 14:00, 18:00, or 21:00.");
      return;
    }
    if (!String(editForm.contentTitle || "").trim()) {
      setExportMessage("Content is required.");
      return;
    }
    if (!editForm.publishDate) {
      setExportMessage("Launch Date is required.");
      return;
    }
    if (!editForm.channels || editForm.channels.length === 0) {
      setExportMessage("Select at least one Channel Tag.");
      return;
    }

    setUpdatingRowId(editingWorkingRow.contentItemId);
    setExportMessage("");
    try {
      await updateMarketingPlanWorkingSheetRow(editingWorkingRow, { ...editForm, publishTime: normalizedTime });
      setEditingWorkingRow(null);
      setEditForm(null);
      await loadWorkingSheetRows({ alive: true });
    } catch (error) {
      console.error("[Marketing Plan] Working Sheet row edit failed:", error);
      setExportMessage(window.flowmateUserError ? window.flowmateUserError(error, "Row edit failed.") : "Row edit failed.");
    } finally {
      setUpdatingRowId("");
    }
  }

  async function handleDeleteWorkingRow(row) {
    if (!canManageMarketingPlanWorkingRow(row)) {
      setExportMessage("Only PIC or Admin can delete this row.");
      return;
    }
    const linkedFlowMateTask = hasMarketingPlanLinkedCreativeRequest(row);
    const label = row.contentTitle || "this Working Sheet row";
    const confirmMessage = linkedFlowMateTask
      ? `Delete ${label}? Deleting it will cancel the FlowMate task and notify stakeholders. Continue?`
      : `Delete ${label}?`;
    if (!window.confirm(confirmMessage)) return;
    setUpdatingRowId(row.contentItemId);
    setExportMessage("");
    try {
      if (linkedFlowMateTask) {
        if (!row.flowmateDisplayId) {
          throw new Error("Linked FlowMate task is missing its display ID. Run supabase/marketing_plan.sql and refresh before deleting.");
        }
        if (!window.cancelFlowMateWorkItem) {
          throw new Error("FlowMate cancel action is not ready. Please refresh and try again.");
        }
        await window.cancelFlowMateWorkItem(
          { id: row.flowmateDisplayId, type: "creative", isSupabaseRow: true },
          `Marketing Plan row deleted: ${label}`,
        );
      }
      await deleteMarketingPlanWorkingSheetRow(row);
      if (editingWorkingRow && editingWorkingRow.contentItemId === row.contentItemId) {
        setEditingWorkingRow(null);
        setEditForm(null);
      }
      await loadWorkingSheetRows({ alive: true });
    } catch (error) {
      console.error("[Marketing Plan] Working Sheet row delete failed:", error);
      setExportMessage(window.flowmateUserError ? window.flowmateUserError(error, "Row delete failed.") : "Row delete failed.");
    } finally {
      setUpdatingRowId("");
    }
  }

  async function handleSaveWorkingSheetRow(event) {
    event.preventDefault();
    const required = [
      ["campaignName", "Campaign is required."],
      ["productEvent", "Product / Event is required."],
      ["launchDate", "Launch Date is required."],
      ["publishTime", "Time is required."],
      ["assetType", "Asset Type is required."],
      ["details", "Details are required."],
      ["contentTier", "Content Tier is required."],
    ];
    const missing = required.find(([key]) => !String(sheetForm[key] || "").trim());
    if (missing) {
      setSaveState({ status: "error", message: missing[1] });
      return;
    }
    const normalizedTime = normalizeMarketingPlanPublishTimeOption(sheetForm.publishTime);
    if (!normalizedTime) {
      setSaveState({ status: "error", message: "Select a posting time: 11:00, 14:00, 18:00, or 21:00." });
      return;
    }
    if (!sheetForm.channels || sheetForm.channels.length === 0) {
      setSaveState({ status: "error", message: "Select at least one Channel Tag." });
      return;
    }

    setSaveState({ status: "saving", message: "Saving Working Sheet row..." });
    try {
      const result = await createMarketingPlanWorkingSheetRow({ ...sheetForm, publishTime: normalizedTime });
      setSaveState({ status: "saved", message: `Saved Marketing Plan row with ${result.placementCount} channel placement${result.placementCount === 1 ? "" : "s"}.` });
      setSheetForm(current => ({
        ...getDefaultMarketingPlanWorkingSheetForm(),
        launchDate: current.launchDate,
        publishTime: normalizedTime,
        campaignName: current.campaignName,
      }));
      await loadWorkingSheetRows({ alive: true });
      window.dispatchEvent(new CustomEvent("flowmate:refresh-request", { detail: { reason: "marketing_plan_working_sheet_saved" } }));
    } catch (error) {
      console.error("[Marketing Plan] Working Sheet save failed:", error);
      setSaveState({
        status: "error",
        message: window.flowmateUserError
          ? window.flowmateUserError(error, "Working Sheet save failed.")
          : "Working Sheet save failed.",
      });
    }
  }

  function handleExportCsv() {
    const exportedCount = exportMarketingPlanRowsCsv(rows, selectedMonth, selectedChannel);
    setExportMessage(`Exported ${exportedCount} visible Marketing Plan rows.`);
  }

  async function handleWorkingRowStatusChange(row, nextStatus) {
    if (!canManageMarketingPlanWorkingRow(row)) {
      setExportMessage("Only PIC or Admin can update this row.");
      return;
    }
    setUpdatingRowId(row.contentItemId);
    setExportMessage("");
    try {
      await updateMarketingPlanWorkingSheetPlacementFields(row.contentItemId, { status: nextStatus });
      await loadWorkingSheetRows({ alive: true });
    } catch (error) {
      console.error("[Marketing Plan] Working Sheet status update failed:", error);
      setExportMessage(window.flowmateUserError ? window.flowmateUserError(error, "Status update failed.") : "Status update failed.");
    } finally {
      setUpdatingRowId("");
    }
  }

  async function handleRepairWorkingRowBriefLink(row) {
    if (!canManageMarketingPlanWorkingRow(row)) {
      setExportMessage("Only PIC or Admin can repair this row.");
      return;
    }
    const detailUrl = getMarketingPlanFlowMateDetailUrl(row && row.flowmateDisplayId);
    if (!detailUrl) {
      setExportMessage("Linked FlowMate task is missing its display ID. Run supabase/marketing_plan.sql and refresh.");
      return;
    }
    setUpdatingRowId(row.contentItemId);
    setExportMessage("");
    try {
      await updateMarketingPlanWorkingSheetBriefLinkFromCreativeRequest(
        row.contentItemId,
        detailUrl,
        row.flowmateWorkItemId || "",
      );
      await loadWorkingSheetRows({ alive: true });
      setExportMessage(`Restored Brief Link for ${row.contentTitle || row.flowmateDisplayId}.`);
    } catch (error) {
      console.error("[Marketing Plan] Brief Link repair failed:", error);
      setExportMessage(window.flowmateUserError ? window.flowmateUserError(error, "Brief Link repair failed.") : "Brief Link repair failed.");
    } finally {
      setUpdatingRowId("");
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Working Sheet</h1>
          <p>Recurring monthly plan entry. Views read from these Campaign, Content Item, and Channel Placement records.</p>
        </div>
      </div>

      {loadState.status === "error" && (
        <div className="reason-box reason-box--need">
          <div className="strong">Marketing Plan data is not ready.</div>
          <div style={{ marginTop: 4 }}>{loadState.message}</div>
          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            SQL required: supabase/marketing_plan.sql. Saving requires a user role allowed by Marketing Plan RLS.
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card__head">
          <div>
            <span className="card__title">Add monthly working row</span>
            <div className="card__sub">Use this instead of entering the recurring plan in Google Sheet.</div>
          </div>
        </div>
        <form className="card__body" onSubmit={handleSaveWorkingSheetRow}>
          <div className="form-grid">
            <label className="field">
              <span className="field__label">Campaign *</span>
              <input className="input" list="marketing-plan-campaign-tags" value={sheetForm.campaignName} onChange={event => updateSheetForm("campaignName", event.target.value)} placeholder="e.g. New Patch update : 26.05" />
              <datalist id="marketing-plan-campaign-tags">
              {campaignOptions.map(campaign => <option key={campaign.id || campaign.name} value={campaign.name} />)}
              </datalist>
            </label>
            <label className="field">
              <span className="field__label">Product / Event *</span>
              <input className="input" value={sheetForm.productEvent} onChange={event => updateSheetForm("productEvent", event.target.value)} placeholder="e.g. DAU, Hero Post Teaser" />
            </label>
            <label className="field">
              <span className="field__label">Launch Date *</span>
              <input
                className="input"
                type="date"
                value={sheetForm.launchDate}
                onClick={openNativeTimePicker}
                onFocus={openNativeTimePicker}
                onChange={event => updateSheetForm("launchDate", event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Time *</span>
              <select
                className="select"
                value={sheetForm.publishTime}
                onChange={event => updateSheetForm("publishTime", event.target.value)}
              >
                {MARKETING_PLAN_PUBLISH_TIME_OPTIONS.map(time => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Asset Type *</span>
              <select className="select" value={sheetForm.assetType} onChange={event => updateSheetForm("assetType", event.target.value)}>
                {MARKETING_PLAN_ASSET_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Content Tier *</span>
              <select className="select" value={sheetForm.contentTier} onChange={event => updateSheetForm("contentTier", event.target.value)}>
                {MARKETING_PLAN_CONTENT_TIERS.map(tier => <option key={tier} value={tier}>{tier}</option>)}
              </select>
            </label>
            <label className="field field--full">
              <span className="field__label">Details *</span>
              <textarea className="textarea" rows="3" value={sheetForm.details} onChange={event => updateSheetForm("details", event.target.value)} placeholder="Content details, message, format requirements, or sheet note." />
            </label>
            <div className="field field--full">
              <span className="field__label">Channel Tag *</span>
              <div className="check-row">
                {MARKETING_PLAN_CHANNELS.filter(channel => channel.key !== "other").map(channel => (
                  <label key={channel.key} className="check-pill">
                    <input
                      type="checkbox"
                      checked={(sheetForm.channels || []).includes(channel.key)}
                      onChange={() => toggleSheetChannel(channel.key)}
                    />
                    <span>{channel.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="field field--full">
              <span className="field__label">Note</span>
              <textarea className="textarea" rows="2" value={sheetForm.note} onChange={event => updateSheetForm("note", event.target.value)} placeholder="Internal note, dependency, posting instruction, or campaign context." />
            </label>
          </div>
          {saveState.message && (
            <div className={`reason-box ${saveState.status === "error" ? "reason-box--need" : ""}`} style={{ marginTop: 12 }}>
              {saveState.message}
            </div>
          )}
          <div className="modal__actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn--secondary" onClick={() => setSheetForm(getDefaultMarketingPlanWorkingSheetForm())}>Clear</button>
            <button type="submit" className="btn btn--primary" disabled={saveState.status === "saving"}>
              {saveState.status === "saving" ? "Saving..." : "Save to Marketing Plan"}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card__head">
          <div>
            <span className="card__title">Current working rows</span>
            <div className="card__sub">These rows feed Campaign Timeline, Channel Plan, Calendar, and CSV export.</div>
          </div>
        </div>
        <div className="card__body">
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <select
              className="input"
              style={{ width: 150 }}
              value={selectedMonth}
              onChange={(event) => {
                setSelectedMonth(event.target.value);
                setSelectedChannel("all");
              }}
              disabled={monthOptions.length === 0}
            >
              {monthOptions.length === 0 && <option value="">No data</option>}
              {monthOptions.map(monthKey => (
                <option key={monthKey} value={monthKey}>{getMarketingPlanMonthLabel(monthKey)}</option>
              ))}
            </select>
            <select
              className="input"
              style={{ width: 150 }}
              value={selectedChannel}
              onChange={(event) => setSelectedChannel(event.target.value)}
              disabled={monthOptions.length === 0}
            >
              <option value="all">All channels</option>
              {channelOptions.map(channel => (
                <option key={channel} value={channel}>{getMarketingPlanChannelLabel(channel)}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleExportCsv}
              disabled={visiblePlacementRows.length === 0}
            >
              <Icon name="download" /> Export CSV
            </button>
            <span className="muted">{visibleRows.length} visible rows</span>
          </div>
          {exportMessage && <div className="reason-box" style={{ marginBottom: 14 }}>{exportMessage}</div>}
          <div style={{ overflowX: "auto" }}>
            <table className="table table--dense marketing-working-table">
              <thead>
                <tr>
                  <th className="col-month">Month</th>
                  <th className="col-campaign">Campaign</th>
                  <th className="col-asset">Product / Event</th>
                  <th className="col-tier">Tier</th>
                  <th className="col-type">Asset Type</th>
                  <th className="col-channel">Channel</th>
                  <th className="col-date">Launch Date</th>
                  <th className="col-time">Time</th>
                  <th className="col-link">Brief Link</th>
                  <th className="col-pic">PIC</th>
                  <th className="col-status">Status</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.slice(0, 12).map(row => {
                  const rowStatusValue = getMarketingPlanViewStatus(row);
                  const rowHasLinkedCreativeRequest = hasMarketingPlanLinkedCreativeRequest(row);
                  const rowNeedsBriefLinkRepair = rowHasLinkedCreativeRequest && !String(row.briefLink || "").trim();
                  const canManageRow = canManageMarketingPlanWorkingRow(row);
                  return (
                    <tr key={row.contentItemId || `${row.campaignName}-${row.contentTitle}-${row.publishDate}`}>
                      <td>{getMarketingPlanMonthLabel(row.monthKey)}</td>
                      <td>{row.campaignName}</td>
                      <td>{row.contentTitle}</td>
                      <td>{row.contentTier || "-"}</td>
                      <td>{row.format || "-"}</td>
                      <td>
                        <div className="marketing-channel-tags">
                          {(row.channels || []).map(channel => (
                            <span key={channel} className="marketing-channel-tag" title={getMarketingPlanChannelLabel(channel)}>
                              {getMarketingPlanChannelAbbrev(channel)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{formatMarketingPlanDate(row.publishDate)}</td>
                      <td>
                        <span className="mono marketing-working-time-text">{formatMarketingPlanTime(row.publishTime) || "-"}</span>
                      </td>
                      <td>
                        {row.briefLink ? (
                          <a className="marketing-working-link" href={row.briefLink} target="_blank" rel="noreferrer">Open</a>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td>{row.picName || "-"}</td>
                      <td>
                        <select
                          className="select marketing-working-status"
                          value={rowStatusValue}
                          disabled={!canManageRow || updatingRowId === row.contentItemId}
                          title={canManageRow ? "" : "Only PIC or Admin can edit this row."}
                          onChange={event => handleWorkingRowStatusChange(row, event.target.value)}
                        >
                          {MARKETING_PLAN_WORKING_STATUS_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}{row.hasMixedStatus && option.value === rowStatusValue ? " (mixed)" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="marketing-working-actions">
                          <button
                            type="button"
                            className="btn btn--secondary btn--xs"
                            disabled={!canManageRow || updatingRowId === row.contentItemId}
                            title={canManageRow ? "" : "Only PIC or Admin can edit this row."}
                            onClick={() => startEditWorkingRow(row)}
                          >
                            Edit
                          </button>
                          {rowNeedsBriefLinkRepair ? (
                            <button
                              type="button"
                              className="btn btn--secondary btn--xs"
                              disabled={!canManageRow || updatingRowId === row.contentItemId}
                              title={canManageRow ? "" : "Only PIC or Admin can edit this row."}
                              onClick={() => handleRepairWorkingRowBriefLink(row)}
                            >
                              Repair Link
                            </button>
                          ) : rowHasLinkedCreativeRequest ? null : (
                            <button
                              type="button"
                              className="btn btn--primary btn--xs"
                              disabled={!canManageRow || updatingRowId === row.contentItemId}
                              title={canManageRow ? "" : "Only PIC or Admin can edit this row."}
                              onClick={() => openFlowMateCreativeBriefFromMarketingRow(row)}
                            >
                              Create Brief
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan="12" className="muted">No rows match the selected filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editingWorkingRow && editForm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => { setEditingWorkingRow(null); setEditForm(null); }}>
          <form className="modal modal--settings marketing-working-edit-modal" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()} onSubmit={handleSaveEditWorkingRow}>
            <div className="modal__head">
              <div>
                <h2>Edit Working Sheet row</h2>
                <div className="muted">Changes update Timeline, Channel Plan, Calendar, and CSV export.</div>
              </div>
              <button type="button" className="iconbtn" onClick={() => { setEditingWorkingRow(null); setEditForm(null); }}>
                <Icon name="x" />
              </button>
            </div>
            <div className="form-grid">
              <label className="field field--full">
                <span className="field__label">Product / Event *</span>
                <input className="input" value={editForm.contentTitle} onChange={event => updateEditForm("contentTitle", event.target.value)} />
              </label>
              <label className="field">
                <span className="field__label">Launch Date *</span>
                <input
                  className="input"
                  type="date"
                  value={editForm.publishDate}
                  onClick={openNativeTimePicker}
                  onFocus={openNativeTimePicker}
                  onChange={event => updateEditForm("publishDate", event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field__label">Time *</span>
                <select
                  className="select"
                  value={editForm.publishTime}
                  onChange={event => updateEditForm("publishTime", event.target.value)}
                >
                  <option value="">Select time</option>
                  {MARKETING_PLAN_PUBLISH_TIME_OPTIONS.map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Asset Type *</span>
                <select className="select" value={editForm.assetType} onChange={event => updateEditForm("assetType", event.target.value)}>
                  {MARKETING_PLAN_ASSET_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Tier *</span>
                <select className="select" value={editForm.contentTier} onChange={event => updateEditForm("contentTier", event.target.value)}>
                  {MARKETING_PLAN_CONTENT_TIERS.map(tier => <option key={tier} value={tier}>{tier}</option>)}
                </select>
              </label>
              <label className="field field--full">
                <span className="field__label">Brief Link</span>
                <input className="input" value={editForm.briefLink} onChange={event => updateEditForm("briefLink", event.target.value)} placeholder="https://..." />
              </label>
              <div className="field field--full">
                <span className="field__label">Channel Tag *</span>
                <div className="check-row">
                  {MARKETING_PLAN_CHANNELS.map(channel => (
                    <label key={channel.key} className="check-pill">
                      <input
                        type="checkbox"
                        checked={(editForm.channels || []).includes(channel.key)}
                        onChange={() => toggleEditChannel(channel.key)}
                      />
                      <span>{channel.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal__actions">
              <button
                type="button"
                className="btn btn--danger"
                disabled={updatingRowId === editingWorkingRow.contentItemId}
                onClick={() => handleDeleteWorkingRow(editingWorkingRow)}
              >
                Delete
              </button>
              <button type="button" className="btn btn--secondary" onClick={() => { setEditingWorkingRow(null); setEditForm(null); }}>Cancel</button>
              <button type="submit" className="btn btn--primary" disabled={updatingRowId === editingWorkingRow.contentItemId}>
                {updatingRowId === editingWorkingRow.contentItemId ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function MarketingPlanSupervisorScreen({ user }) {
  const [monthlyRows, setMonthlyRows] = useStateApp([]);
  const [picRows, setPicRows] = useStateApp([]);
  const [campaignRows, setCampaignRows] = useStateApp([]);
  const [channelRows, setChannelRows] = useStateApp([]);
  const [selectedMonth, setSelectedMonth] = useStateApp("");
  const [selectedCampaign, setSelectedCampaign] = useStateApp("");
  const [selectedChannel, setSelectedChannel] = useStateApp("");
  const [selectedPic, setSelectedPic] = useStateApp("");
  const [activeTab, setActiveTab] = useStateApp("monthly");
  const [loadState, setLoadState] = useStateApp({ status: "loading", message: "Loading supervisor report..." });
  const [exportMessage, setExportMessage] = useStateApp("");

  async function loadSupervisorRows(isAlive = () => true) {
    if (!user || user.role !== "admin") return;
    setLoadState({ status: "loading", message: "Loading supervisor report..." });
    try {
      const report = await loadMarketingPlanSupervisorRows(user);
      if (!isAlive()) return;
      const nextMonthlyRows = report.monthlyRows || [];
      const monthOptions = getMarketingPlanSupervisorMonthOptions(nextMonthlyRows);
      setMonthlyRows(nextMonthlyRows);
      setPicRows(report.picRows || []);
      setCampaignRows(report.campaignRows || []);
      setChannelRows(report.channelRows || []);
      setSelectedMonth(current => current && monthOptions.includes(current) ? current : getDefaultMarketingPlanSupervisorMonth(monthOptions));
      setLoadState({
        status: nextMonthlyRows.length ? "live" : "empty",
        message: nextMonthlyRows.length ? "Live supervisor report" : "No supervisor data for this filter.",
      });
    } catch (error) {
      if (!isAlive()) return;
      console.error("[Marketing Plan] Supervisor load failed:", error);
      setLoadState({
        status: "error",
        message: window.flowmateUserError
          ? window.flowmateUserError(error, "Supervisor report load failed.")
          : "Supervisor report load failed.",
      });
    }
  }

  useEffectApp(() => {
    let alive = true;
    const isAlive = () => alive;
    loadSupervisorRows(isAlive);
    return () => {
      alive = false;
    };
  }, [user && user.role]);

  const monthOptions = getMarketingPlanSupervisorMonthOptions(monthlyRows);
  const filters = {
    month: selectedMonth,
    campaign: selectedCampaign,
    channel: selectedChannel,
    pic: selectedPic,
  };
  const filteredMonthlyRows = filterMarketingPlanSupervisorRows(monthlyRows, filters);
  const filteredPicRows = filterMarketingPlanSupervisorSummaryRows(picRows, filters);
  const filteredCampaignRows = filterMarketingPlanSupervisorSummaryRows(campaignRows, filters);
  const filteredChannelRows = filterMarketingPlanSupervisorSummaryRows(channelRows, filters);
  const summary = getMarketingPlanSupervisorSummary(filteredMonthlyRows);
  const campaignOptions = getMarketingPlanSupervisorFilterOptions(
    filterMarketingPlanSupervisorRows(monthlyRows, { month: selectedMonth, channel: selectedChannel, pic: selectedPic }),
    "campaignId",
    "campaignName",
  );
  const channelOptions = getMarketingPlanSupervisorFilterOptions(
    filterMarketingPlanSupervisorRows(monthlyRows, { month: selectedMonth, campaign: selectedCampaign, pic: selectedPic }),
    "channel",
    "channel",
  );
  const picOptions = getMarketingPlanSupervisorFilterOptions(
    filterMarketingPlanSupervisorRows(monthlyRows, { month: selectedMonth, campaign: selectedCampaign, channel: selectedChannel }),
    "picUserId",
    "picName",
  );

  function resetDependentFilter(type, value) {
    if (type === "month") {
      setSelectedMonth(value);
      setSelectedCampaign("");
      setSelectedChannel("");
      setSelectedPic("");
    }
    if (type === "campaign") setSelectedCampaign(value);
    if (type === "channel") setSelectedChannel(value);
    if (type === "pic") setSelectedPic(value);
  }

  function handleExportSupervisorCsv() {
    const exportedCount = exportMarketingPlanSupervisorCsv(monthlyRows, filters);
    setExportMessage(`Exported ${exportedCount} supervisor rows.`);
  }

  function renderRiskBadge(bucket) {
    return <span className={`badge ${getMarketingPlanSupervisorRiskClass(bucket)}`}>{bucket || "Watch"}</span>;
  }

  function renderSummaryMetric(label, value) {
    return (
      <div className="card" key={label} style={{ minHeight: 94 }}>
        <div className="card__head">
          <span className="card__title">{label}</span>
        </div>
        <div className="card__body">
          <div className="strong" style={{ fontSize: 24 }}>{value}</div>
        </div>
      </div>
    );
  }

  function renderSummaryTable(rows, type) {
    return (
      <div className="card">
        <div className="card__body" style={{ overflowX: "auto" }}>
          <table className="marketing-working-table">
            <thead>
              <tr>
                {type === "pic" && <th>PIC</th>}
                {type === "campaign" && <th>Campaign</th>}
                {type === "campaign" && <th>Team</th>}
                {type === "channel" && <th>Channel</th>}
                <th>Total Event</th>
                <th>Assigned</th>
                <th>Unassigned</th>
                <th>Avg Working Days Before Launch</th>
                {type === "pic" && <th>Median Working Days Before Launch</th>}
                <th>Healthy</th>
                <th>Watch</th>
                <th>Risk</th>
                <th>Critical</th>
                <th>Missing Brief Link</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={`${type}-${row.monthKey}-${row.picUserId || row.campaignId || row.channel}`}>
                  {type === "pic" && <td>{row.picName}</td>}
                  {type === "campaign" && <td>{row.campaignName}</td>}
                  {type === "campaign" && <td>{row.campaignTeam || "-"}</td>}
                  {type === "channel" && <td>{getMarketingPlanChannelLabel(row.channel)}</td>}
                  <td>{row.totalRows}</td>
                  <td>{row.assignedRows}</td>
                  <td>{row.unassignedRows}</td>
                  <td>{formatMarketingPlanSupervisorNumber(row.avgWorkingDaysBeforeLaunch)}</td>
                  {type === "pic" && <td>{formatMarketingPlanSupervisorNumber(row.medianWorkingDaysBeforeLaunch)}</td>}
                  <td>{row.healthyCount}</td>
                  <td>{row.watchCount}</td>
                  <td>{row.riskCount}</td>
                  <td>{row.criticalCount}</td>
                  <td>{row.missingBriefLinkCount}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={type === "campaign" ? 13 : 12}>No supervisor data for this filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const tabOptions = [
    { key: "monthly", label: "Monthly Overview" },
    { key: "pic", label: "PIC Performance" },
    { key: "campaign", label: "Campaign Risk" },
    { key: "channel", label: "Channel Risk" },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Supervisor</h1>
          <p>Monthly assignment health for Marketing Plan rows.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card__body">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <select className="input" style={{ width: 150 }} value={selectedMonth} onChange={event => resetDependentFilter("month", event.target.value)}>
              {monthOptions.length === 0 && <option value="">No data</option>}
              {monthOptions.map(monthKey => (
                <option key={monthKey} value={monthKey}>{getMarketingPlanMonthLabel(monthKey)}</option>
              ))}
            </select>
            <select className="input" style={{ width: 190 }} value={selectedCampaign} onChange={event => resetDependentFilter("campaign", event.target.value)}>
              <option value="">All campaigns</option>
              {campaignOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select className="input" style={{ width: 160 }} value={selectedChannel} onChange={event => resetDependentFilter("channel", event.target.value)}>
              <option value="">All channels</option>
              {channelOptions.map(option => (
                <option key={option.value} value={option.value}>{getMarketingPlanChannelLabel(option.value)}</option>
              ))}
            </select>
            <select className="input" style={{ width: 160 }} value={selectedPic} onChange={event => resetDependentFilter("pic", event.target.value)}>
              <option value="">All PICs</option>
              {picOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button type="button" className="btn btn--secondary" onClick={() => loadSupervisorRows(() => true)}>
              <Icon name="refresh" /> Refresh
            </button>
            <button type="button" className="btn btn--primary" onClick={handleExportSupervisorCsv} disabled={filteredMonthlyRows.length === 0}>
              <Icon name="download" /> Export CSV
            </button>
          </div>
          {exportMessage && <div className="muted" style={{ marginTop: 8 }}>{exportMessage}</div>}
        </div>
      </div>

      {loadState.status === "loading" && <div className="reason-box">Loading supervisor report...</div>}
      {loadState.status === "error" && (
        <div className="reason-box reason-box--need">
          <div className="strong">Supervisor report could not load.</div>
          <div style={{ marginTop: 4 }}>{loadState.message}</div>
        </div>
      )}
      {loadState.status === "empty" && <div className="reason-box">No supervisor data for this filter.</div>}

      {loadState.status === "live" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
            {renderSummaryMetric("Total Event", summary.totalRows)}
            {renderSummaryMetric("Assigned", summary.assignedRows)}
            {renderSummaryMetric("Unassigned", summary.unassignedRows)}
            {renderSummaryMetric("Avg Working Days Before Launch", formatMarketingPlanSupervisorNumber(summary.avgWorkingDaysBeforeLaunch))}
            {renderSummaryMetric("Risk", summary.riskRows)}
            {renderSummaryMetric("Critical", summary.criticalRows)}
          </div>

          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {tabOptions.map(tab => (
              <button
                key={tab.key}
                type="button"
                className={`btn btn--xs ${activeTab === tab.key ? "btn--primary" : "btn--secondary"}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
            <span className="topbar__spacer"></span>
            <span className="badge badge--delivered">Healthy</span>
            <span className="badge badge--neutral">Watch</span>
            <span className="badge badge--review">Risk</span>
            <span className="badge badge--overdue">Critical</span>
          </div>

          {activeTab === "monthly" && (
            <div className="card">
              <div className="card__body" style={{ overflowX: "auto" }}>
                <table className="marketing-working-table">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Product / Event</th>
                      <th>Channel</th>
                      <th>Launch Date</th>
                      <th>Time</th>
                      <th>PIC</th>
                      <th>Effective Status</th>
                      <th>Assigned At</th>
                      <th>Working Days Before Launch</th>
                      <th>Risk Bucket</th>
                      <th>Brief Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMonthlyRows.map(row => (
                      <tr key={`${row.contentItemId}-${row.placementId || row.channel}`}>
                        <td>{row.campaignName}</td>
                        <td>{row.productEvent}</td>
                        <td>{getMarketingPlanChannelLabel(row.channel)}</td>
                        <td>{formatMarketingPlanDate(row.launchDate)}</td>
                        <td>{formatMarketingPlanTime(row.publishTime) || "-"}</td>
                        <td>{row.picName}</td>
                        <td><span className={`badge ${getMarketingPlanStatusClass(row.effectiveStatus)}`}>{getMarketingPlanStatusLabel(row.effectiveStatus)}</span></td>
                        <td>{formatMarketingPlanSupervisorDateTime(row.firstAssignedAt)}</td>
                        <td>{row.workingDaysBeforeLaunch == null ? "-" : row.workingDaysBeforeLaunch}</td>
                        <td>{renderRiskBadge(row.riskBucket)}</td>
                        <td>{row.briefLink ? <a href={row.briefLink} target="_blank" rel="noreferrer">Link</a> : <span className="muted">Missing</span>}</td>
                      </tr>
                    ))}
                    {filteredMonthlyRows.length === 0 && (
                      <tr>
                        <td colSpan="11">No supervisor data for this filter.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "pic" && renderSummaryTable(filteredPicRows, "pic")}
          {activeTab === "campaign" && renderSummaryTable(filteredCampaignRows, "campaign")}
          {activeTab === "channel" && renderSummaryTable(filteredChannelRows, "channel")}
        </>
      )}
    </div>
  );
}

function MarketingPlanPlaceholderScreen({ title, detail }) {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p>{detail}</p>
        </div>
      </div>
      <div className="reason-box">
        This section is reserved for the next Marketing Plan chat. Campaign Timeline is the first implemented screen.
      </div>
    </div>
  );
}

function MarketingPlanShell({
  user,
  currentUserName,
  currentUserEmail,
  avatarMemberId,
  onSwitchFlowMate,
  onSwitchMarketingPlan,
  onSignOut,
}) {
  const isAdminUser = user.role === "admin";
  const supervisorSection = { key: "supervisor", label: "Supervisor", detail: "Monthly assignment health for Marketing Plan rows.", icon: "chart" };
  const baseSections = [
    { key: "campaign-timeline", label: "Campaign Timeline", detail: "Campaign rows with Product / Event sub-rows and publish dates.", icon: "chart" },
    { key: "channel-plan", label: "Channel Plan", detail: "View content by Facebook, TikTok, Instagram, LINE, YouTube, and in-game.", icon: "board" },
    { key: "marketing-calendar", label: "Calendar", detail: "Monthly publishing calendar for marketing managers.", icon: "calendar" },
    { key: "working-sheet", label: "Working Sheet", detail: "Enter recurring monthly plan rows in Marketing Plan.", icon: "list" },
  ];
  const sections = [
    ...baseSections,
    ...(isAdminUser ? [
      supervisorSection,
    ] : []),
  ];
  const sectionByKey = new Map([...baseSections, supervisorSection].map(section => [section.key, section]));
  function getSectionFromHash() {
    const hashKey = window.location.hash.replace("#", "");
    return sectionByKey.get(hashKey) || baseSections[0];
  }
  const [activeSectionKey, setActiveSectionKey] = useStateApp(() => getSectionFromHash().key);
  const activeSection = sectionByKey.get(activeSectionKey) || baseSections[0];

  useEffectApp(() => {
    function onMarketingHashChange() {
      const nextSection = getSectionFromHash();
      setActiveSectionKey(nextSection.key);
    }
    if (!sectionByKey.has(window.location.hash.replace("#", ""))) {
      window.location.hash = baseSections[0].key;
    }
    window.addEventListener("hashchange", onMarketingHashChange);
    return () => window.removeEventListener("hashchange", onMarketingHashChange);
  }, []);

  function openMarketingSection(section) {
    setActiveSectionKey(section.key);
    window.location.hash = section.key;
  }

  return (
    <div className="app">
      <FlowMatePromptHost />
      <div className="app__brand">
        <img src="garena/logo_graphic.png" alt="Garena" />
        <span className="app__brand-name">Marketing Plan</span>
        <span className="app__brand-version">{FLOWMATE_APP_VERSION}</span>
      </div>
      <div className="app__topbar">
        <ProductSwitch
          activeProduct="marketing-plan"
          onSwitchFlowMate={onSwitchFlowMate}
          onSwitchMarketingPlan={onSwitchMarketingPlan}
        />
        <span className="topbar__spacer"></span>
        <div className="topbar__user" title={`Signed in as ${currentUserEmail}`}>
          <Avatar memberId={avatarMemberId} size="" />
          <span className="topbar__user-name">{currentUserName}</span>
        </div>
        <button className="topbar__btn" onClick={onSignOut}>Sign out</button>
      </div>
      <nav className="app__sidebar">
        <div>
          <div className="nav-section">Marketing Plan</div>
          {sections.map(section => (
            <div
              key={section.key}
              className={`nav-item ${activeSection.key === section.key ? "is-active" : ""}`}
              onClick={() => openMarketingSection(section)}
            >
              <Icon name={section.icon} size={15} />
              <span>{section.label}</span>
            </div>
          ))}
        </div>
      </nav>
      <main className="app__main app__main--marketing">
        {activeSection.key === "campaign-timeline" && <MarketingPlanTimelineScreen />}
        {activeSection.key === "channel-plan" && <MarketingPlanChannelPlanScreen />}
        {activeSection.key === "marketing-calendar" && <MarketingPlanCalendarScreen />}
        {activeSection.key === "working-sheet" && <MarketingPlanWorkingSheetScreen />}
        {activeSection.key === "supervisor" && !isAdminUser && (
          <div className="card" style={{ maxWidth: 720 }}>
            <div className="card__head">
              <span className="card__title">Admin access required.</span>
            </div>
            <div className="card__body">
              <div className="reason-box reason-box--need">Admin access required.</div>
            </div>
          </div>
        )}
        {activeSection.key === "supervisor" && isAdminUser && <MarketingPlanSupervisorScreen user={user} />}
      </main>
    </div>
  );
}

function GlobalSearchResultsPanel({ query, results, loadState, onOpen }) {
  const safeResults = results || [];
  return (
    <div className="searchbar-results" role="listbox" aria-label="Search results">
      <div className="searchbar-results__head">
        <span>Search results</span>
        <span className="mono">{safeResults.length}</span>
      </div>
      {loadState && loadState.status === "error" && (
        <div className="searchbar-results__empty">{loadState.message}</div>
      )}
      {loadState && loadState.status !== "error" && safeResults.length === 0 && (
        <div className="searchbar-results__empty">No results for "{query}".</div>
      )}
      {safeResults.map(row => (
        <button
          key={row.id}
          type="button"
          className="searchbar__result"
          onMouseDown={(event) => {
            event.preventDefault();
            onOpen(row);
          }}
          role="option"
        >
          <span className="searchbar__result-main">
            <span className="searchbar__result-id mono">{row.id}</span>
            <span className="searchbar__result-title">{row.title}</span>
          </span>
          <span className="searchbar__result-meta">
            <TypePill type={row.type} />
            <StatusBadge status={row.status} />
            <span>{row.assignee && MEMBERS_BY_ID[row.assignee] ? MEMBERS_BY_ID[row.assignee].name : (row.assigneeOtherName || "Unassigned")}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function NotificationCenterPanel({
  notifications,
  unreadCount,
  loadState,
  markingNotificationId,
  isMarkingAll,
  isDismissingRead,
  onClose,
  onRefresh,
  onOpen,
  onMarkRead,
  onMarkAllRead,
  onDismissRead,
}) {
  const safeNotifications = notifications || [];
  const isLoading = loadState.status === "loading";
  const hasError = loadState.status === "error";
  const readCount = safeNotifications.filter(notification => notification.readAt).length;
  const panelStyle = {
    position: "fixed",
    top: 64,
    right: 20,
    width: 420,
    maxWidth: "calc(100vw - 32px)",
    maxHeight: "calc(100vh - 88px)",
    zIndex: 40,
    boxShadow: "0 18px 48px rgba(46, 84, 109, 0.18)",
    overflow: "hidden",
  };
  const listStyle = {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    maxHeight: 460,
    overflowY: "auto",
  };

  function notificationKindLabel(type) {
    return {
      assigned: "Assigned",
      status_changed: "Status",
      review_requested: "Review",
      approved: "Approved",
      changes_requested: "Changes",
      blocked: "Blocked",
      resumed: "Resumed",
      cancelled: "Cancelled",
      comment_created: "Comment",
      mentioned_in_comment: "Mention",
      link_added: "Link",
      watcher_added: "Watcher",
      due_soon: "Due soon",
      overdue: "Overdue",
    }[type] || "Notification";
  }

  function onNotificationKeyDown(event, notification) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(notification);
    }
  }

  return (
    <div className="card" style={panelStyle}>
      <div className="card__head">
        <div>
          <span className="card__title">Notification Center</span>
          <div className="card__sub">{unreadCount} unread</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn--xs btn--ghost" onClick={onRefresh} disabled={isLoading}>Refresh</button>
          <button className="iconbtn" onClick={onClose} title="Close notifications"><Icon name="x" size={14} /></button>
        </div>
      </div>
      <div className="card__body" style={{ padding: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            {safeNotifications.length} notifications
          </span>
          <button
            className="btn btn--xs btn--secondary"
            onClick={onMarkAllRead}
            disabled={unreadCount === 0 || isMarkingAll}
          >
            <Icon name="check" size={11} /> Mark all as read
          </button>
          <button
            className="btn btn--xs btn--ghost"
            onClick={onDismissRead}
            disabled={readCount === 0 || isDismissingRead}
            title="Hide read notifications from this center. Records are not deleted."
          >
            Clear read
          </button>
        </div>

        {hasError && (
          <div className="reason-box reason-box--need" style={{ marginBottom: 10 }}>
            {loadState.message}
          </div>
        )}

        {isLoading && safeNotifications.length === 0 && (
          <div className="reason-box">Loading notifications...</div>
        )}

        {!isLoading && safeNotifications.length === 0 && (
          <div className="reason-box" style={{ textAlign: "center" }}>
            <div className="strong">No notifications yet</div>
            <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
              Assignments, review requests, comments, links, watchers, and due reminders will appear here.
            </div>
          </div>
        )}

        {safeNotifications.length > 0 && (
          <div style={listStyle}>
            {safeNotifications.map(notification => {
              const isUnread = !notification.readAt;
              return (
                <div
                  key={notification.id}
                  role="button"
                  tabIndex="0"
                  onClick={() => onOpen(notification)}
                  onKeyDown={(event) => onNotificationKeyDown(event, notification)}
                  style={{
                    border: "1px solid var(--garena-light-grey)",
                    borderLeft: isUnread ? "3px solid var(--garena-red)" : "3px solid var(--garena-light-grey)",
                    background: isUnread ? "var(--garena-red-light-2)" : "var(--garena-white)",
                    borderRadius: "var(--radius-sm)",
                    padding: "10px 12px",
                    cursor: "pointer",
                  }}
                >
                  <div className="row" style={{ justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                        <span className={`badge ${isUnread ? "badge--overdue" : "badge--neutral"}`}>
                          {isUnread ? "Unread" : "Read"}
                        </span>
                        <span className="tag">{notificationKindLabel(notification.type)}</span>
                        {notification.workItemId && <span className="mono muted" style={{ fontSize: 11 }}>{notification.workItemId}</span>}
                      </div>
                      <div className="strong" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>{notification.title}</div>
                      {notification.body && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 3, overflowWrap: "anywhere", wordBreak: "break-word" }}>
                          {notification.body}
                        </div>
                      )}
                      <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>{notification.createdLabel || "No timestamp"}</div>
                    </div>
                    {isUnread && (
                      <button
                        className="btn btn--xs btn--ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          onMarkRead(notification);
                        }}
                        disabled={markingNotificationId === notification.id}
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function flowMateTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function CreateMenuPanel({ onQuick, onCreative, onLeave, onClose }) {
  return (
    <div className="topbar__create-menu" role="menu">
      <div className="topbar__create-menu-head">
        <span>Create new</span>
        <button type="button" className="iconbtn" onClick={onClose} aria-label="Close create menu"><Icon name="x" size={12} /></button>
      </div>
      <button type="button" className="topbar__create-option" role="menuitem" onClick={onQuick}>
        <span className="topbar__create-option-title"><Icon name="zap" size={14} /> Quick Task</span>
        <span className="topbar__create-option-sub">Small task or reminder</span>
      </button>
      <button type="button" className="topbar__create-option" role="menuitem" onClick={onCreative}>
        <span className="topbar__create-option-title"><Icon name="layers" size={14} /> Creative Request</span>
        <span className="topbar__create-option-sub">Brief for assignment engine</span>
      </button>
      <button type="button" className="topbar__create-option" role="menuitem" onClick={onLeave}>
        <span className="topbar__create-option-title"><Icon name="calendar" size={14} /> Leave request</span>
        <span className="topbar__create-option-sub">Date range shown on calendar</span>
      </button>
    </div>
  );
}

function GlobalLeaveRequestModal({ onClose }) {
  const todayKey = flowMateTodayDateKey();
  const [leaveForm, setLeaveForm] = useStateApp({ startDate: todayKey, endDate: todayKey, startHalf: "am", endHalf: "pm", reason: "" });
  const [leaveState, setLeaveState] = useStateApp({ status: "idle", message: "" });

  async function submitLeaveRequest(event) {
    event.preventDefault();
    if (!window.createFlowMateLeaveRequest) {
      setLeaveState({ status: "error", message: "Leave request helper is not ready." });
      return;
    }
    setLeaveState({ status: "saving", message: "Saving leave request..." });
    try {
      await window.createFlowMateLeaveRequest(leaveForm);
      onClose();
    } catch (error) {
      console.error("[FlowMate Create] Leave request failed:", error);
      setLeaveState({ status: "error", message: window.flowmateUserError(error, "Leave request failed.") });
    }
  }

  function updateLeaveHalf(half, checked) {
    setLeaveForm(current => {
      if (half === "am") {
        if (checked) return { ...current, startHalf: "am" };
        return current.endHalf === "pm" ? { ...current, startHalf: "pm" } : current;
      }
      if (checked) return { ...current, endHalf: "pm" };
      return current.startHalf === "am" ? { ...current, endHalf: "am" } : current;
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal modal--settings" onSubmit={submitLeaveRequest}>
        <div className="modal__head">
          <div>
            <h2>Create Leave Request</h2>
            <div className="muted" style={{ fontSize: 12 }}>Applies to your linked team member.</div>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="form-grid">
          <label className="field">
            <span className="field__label">Start date</span>
            <input className="input" type="date" value={leaveForm.startDate} onChange={event => setLeaveForm(current => ({ ...current, startDate: event.target.value }))} />
          </label>
          <label className="field">
            <span className="field__label">End date</span>
            <input className="input" type="date" value={leaveForm.endDate} onChange={event => setLeaveForm(current => ({ ...current, endDate: event.target.value }))} />
          </label>
          <div className="field field--full">
            <span className="field__label">Leave period</span>
            <div className="check-row">
              <label className="check-pill">
                <input type="checkbox" checked={leaveForm.startHalf === "am"} onChange={event => updateLeaveHalf("am", event.target.checked)} />
                <span>AM</span>
              </label>
              <label className="check-pill">
                <input type="checkbox" checked={leaveForm.endHalf === "pm"} onChange={event => updateLeaveHalf("pm", event.target.checked)} />
                <span>PM</span>
              </label>
            </div>
            <span className="field__hint">AM + PM is full day. AM only or PM only counts as half-day capacity.</span>
          </div>
          <label className="field field--full">
            <span className="field__label">Reason</span>
            <textarea className="textarea" value={leaveForm.reason} onChange={event => setLeaveForm(current => ({ ...current, reason: event.target.value }))} rows="3"></textarea>
          </label>
        </div>
        {leaveState.status === "error" && <div className="reason-box reason-box--need" style={{ marginTop: 12 }}>{leaveState.message}</div>}
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={leaveState.status === "saving"}>{leaveState.status === "saving" ? "Saving..." : "Save leave"}</button>
        </div>
      </form>
    </div>
  );
}

function AccessDeniedScreen({ onNav }) {
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="card">
        <div className="card__head">
          <span className="card__title">Admin access required</span>
        </div>
        <div className="card__body">
          <div className="reason-box reason-box--need">
            This page is only available to FlowMate admins.
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn--secondary" onClick={() => onNav("my-work")}>
              <Icon name="inbox" /> Back to My work
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveStatus({ realtimeState }) {
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
  const realtimeStatus = realtimeState && realtimeState.status ? realtimeState.status : "idle";
  const realtimeMessage =
    realtimeStatus === "connected" ? "Realtime connected" :
    realtimeStatus === "syncing" ? "Realtime syncing" :
    realtimeStatus === "degraded" ? "Realtime degraded" :
    "Polling fallback active";
  const dotColor =
    realtimeStatus === "connected" ? "var(--garena-positive)" :
    realtimeStatus === "syncing" ? "var(--garena-orange)" :
    realtimeStatus === "degraded" ? "var(--garena-red)" :
    "var(--garena-grey)";
  void tick;
  return (
    <div style={{ padding: "16px 24px", marginTop: 24, borderTop: "1px solid var(--garena-light-grey)" }}>
      <div className="muted" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>Live</div>
      <div className="row" style={{ gap: 6, fontSize: 12, color: "var(--garena-iron)" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor }}></span>
        <span>{realtimeMessage}</span>
      </div>
      <div className="row" style={{ gap: 6, fontSize: 12, color: "var(--garena-grey)", marginTop: 4 }}>
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
  // Inject Google Fonts once
  useEffectApp(() => {
    const id = "wha-fonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700&family=Cormorant+Garamond:ital,wght@0,300;1,300;1,400&family=Almendra+SC&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  // Bioluminescent orb spawner — orbs rise on their own from the bottom of the
  // screen and drift up past the top, independent of the pointer. Uses the Web
  // Animations API rather than CSS keyframes + custom properties because some
  // desktop Chrome builds refuse to interpolate var(--wha-drift) inside a
  // keyframe, which left the orbs stuck below the viewport on PC.
  useEffectApp(() => {
    const stage = document.getElementById("wha-orb-stage");
    if (!stage) return;
    const colors = [
      "rgba(40,80,160,0.90)",    // cobalt
      "rgba(30,100,60,0.90)",    // forest
      "rgba(196,114,42,0.92)",   // amber
      "rgba(120,50,150,0.85)",   // violet
    ];

    function spawn() {
      const orb = document.createElement("span");
      orb.className = "wha-orb";
      const size  = 18 + Math.random() * 20;                  // 18–38px
      const c     = colors[Math.floor(Math.random() * colors.length)];
      const drift = Math.random() * 160 - 80;                 // ±80px
      const duration = 9000 + Math.random() * 7000;           // 9–16s

      orb.style.width = orb.style.height = size + "px";
      orb.style.left  = (3 + Math.random() * 94) + "%";
      orb.style.background = `radial-gradient(circle, ${c} 0%, transparent 70%)`;
      stage.appendChild(orb);

      const anim = orb.animate(
        [
          { opacity: 0,    transform: "translate(0, 0)" },
          { opacity: 0.95, offset: 0.08, transform: `translate(${drift * 0.1}px, -8vh)` },
          { opacity: 0.78, offset: 0.55, transform: `translate(${drift * 0.6}px, -60vh)` },
          { opacity: 0,    transform: `translate(${drift}px, -115vh)` },
        ],
        { duration: duration, easing: "ease-out", fill: "forwards" },
      );
      anim.onfinish = () => orb.remove();
    }

    // Immediate burst so the first impression already has motion
    for (let i = 0; i < 10; i++) setTimeout(spawn, i * 180);
    const intervalId = setInterval(spawn, 700);
    return () => clearInterval(intervalId);
  }, []);

  // IntersectionObserver for scroll reveals
  useEffectApp(() => {
    const els = document.querySelectorAll(".wha-reveal");
    if (!els.length) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("wha-revealed");
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.18 });
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="wha">
      <style>{WHA_STYLES}</style>

      {/* Floating orb stage (self-rising) */}
      <div id="wha-orb-stage" className="wha-orb-stage" aria-hidden="true" />

      {/* HERO (single screen, no header/nav) -------------------------- */}
      <main className="wha-hero" id="threshold">
        <div className="wha-sigil-stage" aria-hidden="true">
          {/* Stained-glass accent (behind) */}
          <svg className="wha-glass" viewBox="0 0 500 500">
            <g>
              <polygon points="250,90 380,170 380,330 250,410 120,330 120,170"
                       fill="var(--glass-blue)" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round"/>
              <polygon points="250,130 390,250 250,370 110,250"
                       fill="var(--glass-teal)" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round"/>
              <polygon className="wha-glass__amber"
                       points="250,180 340,250 250,320 160,250"
                       fill="var(--glass-amber)" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round"/>
              <line x1="250" y1="90"  x2="250" y2="410" stroke="var(--ink)" strokeWidth="1.5"/>
              <line x1="120" y1="170" x2="380" y2="170" stroke="var(--ink)" strokeWidth="1"/>
              <line x1="120" y1="330" x2="380" y2="330" stroke="var(--ink)" strokeWidth="1"/>
            </g>
          </svg>

          {/* Lantern flicker glow (mid layer) */}
          <div className="wha-lantern" />

          {/* Big animated sigil */}
          <svg className="wha-sigil" viewBox="0 0 500 500">
            <defs>
              <path id="wha-rune-arc" d="M 250,250 m -185,0 a 185,185 0 1,1 370,0 a 185,185 0 1,1 -370,0"/>
            </defs>
            {/* outer ring + sigil glyphs — rotate CW together. Uses SMIL
                <animateTransform> with an explicit rotation centre (250,250)
                instead of a CSS transform animation: desktop Chrome/Edge here
                refused to animate the <g> via CSS (transform-box view-box AND
                fill-box both stayed frozen on PC while mobile rotated). SMIL
                rotates the group reliably on every browser and restarts on
                remount (e.g. after a logout re-render). */}
            <g className="wha-sigil__outer">
              <animateTransform attributeName="transform" attributeType="XML"
                                type="rotate" from="0 250 250" to="360 250 250"
                                dur="34s" repeatCount="indefinite"/>
              <circle cx="250" cy="250" r="200" fill="none" stroke="var(--ink)" strokeWidth="0.5" strokeDasharray="1 5"/>
              <circle cx="250" cy="250" r="190" fill="none" stroke="var(--ink)" strokeWidth="1.5"
                      pathLength="1000" className="wha-ink-draw" style={{ animationDelay: "0.4s" }}/>
              <circle cx="250" cy="250" r="160" fill="none" stroke="var(--sienna)" strokeWidth="0.6"
                      pathLength="1000" className="wha-ink-draw" style={{ animationDelay: "0.7s" }}/>
              {[0,30,60,90,120,150,180,210,240,270,300,330].map((deg) => (
                <line key={deg}
                      x1="250" y1="55" x2="250" y2={deg % 90 === 0 ? "80" : "70"}
                      stroke="var(--ink)" strokeWidth={deg % 90 === 0 ? "1.6" : "1"}
                      transform={`rotate(${deg} 250 250)`}/>
              ))}
              {[15,75,105,165,195,255,285,345].map((deg) => (
                <circle key={deg}
                        cx="250" cy="70" r="2.4"
                        fill="var(--sienna)"
                        transform={`rotate(${deg} 250 250)`}/>
              ))}
              {/* Sigil glyph ring — 8 hand-drawn marks at 45° intervals */}
              <g className="wha-sigil__glyphs" aria-hidden="true">
                {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
                  <g key={angle}
                     transform={`translate(250 250) rotate(${angle}) translate(0 -165)`}>
                    <SigilGlyph kind={i} />
                  </g>
                ))}
              </g>
            </g>
            {/* pentagram — rotates CCW via SMIL (see note above) */}
            <g className="wha-sigil__penta">
              <animateTransform attributeName="transform" attributeType="XML"
                                type="rotate" from="360 250 250" to="0 250 250"
                                dur="50s" repeatCount="indefinite"/>
              <path d="M 250,120 L 326,355 L 126,210 L 374,210 L 174,355 Z"
                    fill="none" stroke="var(--sienna)" strokeWidth="1.6" strokeLinejoin="round"
                    pathLength="1000" className="wha-ink-draw" style={{ animationDelay: "0.9s" }}/>
              <circle cx="250" cy="250" r="42" fill="none" stroke="var(--ink)" strokeWidth="1"
                      pathLength="1000" className="wha-ink-draw" style={{ animationDelay: "1.1s" }}/>
            </g>
            {/* central sigil mark */}
            <g className="wha-sigil__core">
              <circle cx="250" cy="250" r="26" fill="var(--cream)" stroke="var(--ink)" strokeWidth="1.4"/>
              <path d="M 250,230 L 264,250 L 250,270 L 236,250 Z"
                    fill="var(--sienna)" stroke="var(--ink)" strokeWidth="1"/>
              <circle cx="250" cy="250" r="3.5" fill="var(--ink)"/>
            </g>
          </svg>
        </div>

        <p className="wha-runes wha-runes--hero">· Garena · FCO · Thailand ·</p>

        {authError && (
          <div className="wha-error wha-reveal" role="alert">
            <strong>⚠</strong> {authError}
          </div>
        )}

        <button type="button" onClick={onSignIn} disabled={isSigningIn} className="wha-cta">
          <span className="wha-cta__glyph" aria-hidden="true"><GoogleLogo /></span>
          <span className="wha-cta__label">
            {isSigningIn ? "Crossing the threshold…" : "Sign in with Google"}
          </span>
        </button>

        <p className="wha-runes wha-runes--small">⚝ Garena Workspace only ⚝</p>
      </main>
    </div>
  );
}

function SigilGlyph({ kind }) {
  // 8 hand-drawn sigil designs (sienna ink). Each is drawn around (0,0) inside
  // a ~22px square. They sit on the rotating outer ring so they revolve with it.
  const stroke = "var(--sienna)";
  const sw = 1.1;
  switch (kind % 8) {
    case 0: // Pine triangle with side crosses
      return (
        <g fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M 0,-9 L 8,7 L -8,7 Z"/>
          <line x1="-10" y1="-1" x2="-5" y2="2"/>
          <line x1="10"  y1="-1" x2="5"  y2="2"/>
          <line x1="0" y1="7" x2="0" y2="11"/>
        </g>
      );
    case 1: // Twin serpent S-curves
      return (
        <g fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round">
          <path d="M -5,-9 Q -10,-4 -7,0 Q -4,4 -7,9"/>
          <path d="M 5,-9 Q 10,-4 7,0 Q 4,4 7,9"/>
          <circle cx="-5" cy="-9" r="0.9" fill={stroke}/>
          <circle cx="5"  cy="-9" r="0.9" fill={stroke}/>
          <circle cx="-7" cy="9" r="0.9" fill={stroke}/>
          <circle cx="7"  cy="9" r="0.9" fill={stroke}/>
        </g>
      );
    case 2: // Crowned diamond with dot eyes
      return (
        <g fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <line x1="-8" y1="-7" x2="8" y2="-7"/>
          <line x1="0" y1="-7" x2="0" y2="-3"/>
          <path d="M 0,-3 L 7,3 L 0,9 L -7,3 Z"/>
          <circle cx="-10" cy="3" r="1.2" fill={stroke}/>
          <circle cx="10"  cy="3" r="1.2" fill={stroke}/>
        </g>
      );
    case 3: // Bound S with four rays
      return (
        <g fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round">
          <line x1="-10" y1="-4" x2="-5" y2="-2"/>
          <line x1="-10" y1="4"  x2="-5" y2="2"/>
          <line x1="10"  y1="-4" x2="5"  y2="-2"/>
          <line x1="10"  y1="4"  x2="5"  y2="2"/>
          <path d="M -3,-8 Q 5,-3 0,0 Q -5,3 3,8"/>
        </g>
      );
    case 4: // Boxed cross — square with inscribed diamond, cardinal lines
      return (
        <g fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round">
          <rect x="-5" y="-5" width="10" height="10"/>
          <path d="M 0,-3 L 3,0 L 0,3 L -3,0 Z"/>
          <line x1="0" y1="-9" x2="0" y2="-5"/>
          <line x1="0" y1="5"  x2="0" y2="9"/>
          <line x1="-9" y1="0" x2="-5" y2="0"/>
          <line x1="5"  y1="0" x2="9"  y2="0"/>
        </g>
      );
    case 5: // Five-point star (pentagram)
      return (
        <g fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round">
          <path d="M 0,-9 L 5.29,7.28 L -8.56,-2.81 L 8.56,-2.81 L -5.29,7.28 Z"/>
        </g>
      );
    case 6: // Mystical eye
      return (
        <g fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round">
          <path d="M -10,0 Q 0,-7 10,0 Q 0,7 -10,0 Z"/>
          <circle cx="0" cy="0" r="2.6" fill={stroke}/>
          <circle cx="0" cy="0" r="0.9" fill="var(--cream)"/>
        </g>
      );
    case 7: // Crescent moon
    default:
      return (
        <g stroke={stroke} strokeWidth={sw * 0.7}>
          <path d="M 5,-9 Q -5,-5 -5,0 Q -5,5 5,9 Q -1,5 -1,0 Q -1,-5 5,-9 Z"
                fill={stroke}/>
        </g>
      );
  }
}

function InkDivider() {
  return (
    <svg className="wha-divider" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true">
      <path d="M 0,20 Q 150,5 300,20 T 600,20 T 900,20 T 1200,20"
            fill="none" stroke="var(--ink)" strokeWidth="0.8" strokeLinecap="round"/>
      <polygon points="600,11 612,20 600,29 588,20"
               fill="var(--sienna)" stroke="var(--ink)" strokeWidth="0.8"/>
      <circle cx="540" cy="20" r="1.5" fill="var(--ink)"/>
      <circle cx="660" cy="20" r="1.5" fill="var(--ink)"/>
    </svg>
  );
}

function CardGlyph({ kind }) {
  if (kind === "quill") {
    return (
      <svg viewBox="0 0 60 60">
        <path d="M 12,48 L 44,16" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
        <path d="M 30,30 Q 42,16 52,8 Q 54,22 42,32 Q 35,33 30,30 Z"
              fill="currentColor" stroke="currentColor" strokeWidth="0.5"/>
        <path d="M 32,32 L 36,28 M 36,30 L 40,26 M 40,28 L 44,24"
              stroke="var(--cream)" strokeWidth="0.6"/>
        <line x1="14" y1="46" x2="9" y2="51" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <circle cx="9" cy="51" r="1.6" fill="currentColor"/>
      </svg>
    );
  }
  if (kind === "glass") {
    return (
      <svg viewBox="0 0 60 60">
        <line x1="12" y1="8"  x2="48" y2="8"  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <line x1="12" y1="52" x2="48" y2="52" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M 15,8 L 45,8 L 30,30 L 45,52 L 15,52 L 30,30 Z"
              fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
        <path d="M 22,14 L 38,14 L 30,25 Z" fill="currentColor" opacity="0.45"/>
        <path d="M 22,46 L 38,46 L 30,35 Z" fill="currentColor" opacity="0.2"/>
        <circle cx="30" cy="30" r="0.9" fill="currentColor"/>
      </svg>
    );
  }
  // compass
  return (
    <svg viewBox="0 0 60 60">
      <circle cx="30" cy="30" r="22" fill="none" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="30" cy="30" r="17" fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 3"/>
      <line x1="30" y1="4"  x2="30" y2="56" stroke="currentColor" strokeWidth="0.8"/>
      <line x1="4"  y1="30" x2="56" y2="30" stroke="currentColor" strokeWidth="0.8"/>
      <path d="M 30,10 L 36,30 L 30,26 L 24,30 Z" fill="currentColor"/>
      <path d="M 30,50 L 24,30 L 30,34 L 36,30 Z" fill="currentColor" opacity="0.55"/>
      <circle cx="30" cy="30" r="2.5" fill="var(--cream)" stroke="currentColor" strokeWidth="1"/>
    </svg>
  );
}

function ShelfRow() {
  // Hanging herb bundle, repeated, with a potion and quill in the mix.
  function Herb({ x }) {
    return (
      <g transform={`translate(${x},0)`}>
        <line x1="0" y1="0" x2="0" y2="14" stroke="var(--ink)" strokeWidth="0.6"/>
        <line x1="0" y1="14" x2="0" y2="62" stroke="var(--ink)" strokeWidth="1"/>
        <line x1="-8" y1="14" x2="8" y2="14" stroke="var(--ink)" strokeWidth="0.7"/>
        <ellipse cx="-5" cy="28" rx="4" ry="9" fill="var(--forest)" opacity="0.85" transform="rotate(-18 -5 28)" stroke="var(--ink)" strokeWidth="0.4"/>
        <ellipse cx="6"  cy="34" rx="4" ry="10" fill="var(--forest)" opacity="0.85" transform="rotate(15 6 34)"  stroke="var(--ink)" strokeWidth="0.4"/>
        <ellipse cx="-4" cy="46" rx="4" ry="9"  fill="var(--forest)" opacity="0.85" transform="rotate(-12 -4 46)" stroke="var(--ink)" strokeWidth="0.4"/>
        <ellipse cx="5"  cy="54" rx="3.5" ry="8" fill="var(--forest)" opacity="0.85" transform="rotate(20 5 54)"  stroke="var(--ink)" strokeWidth="0.4"/>
        <path d="M -3,60 Q 0,68 3,60" fill="none" stroke="var(--sienna)" strokeWidth="0.8"/>
      </g>
    );
  }
  function Potion({ x }) {
    return (
      <g transform={`translate(${x},0)`}>
        <line x1="-12" y1="0" x2="12" y2="0" stroke="var(--ink)" strokeWidth="0.6"/>
        <line x1="0" y1="0" x2="0" y2="10" stroke="var(--ink)" strokeWidth="0.8"/>
        <rect x="-7" y="10" width="14" height="6" fill="var(--sienna)" stroke="var(--ink)" strokeWidth="0.7"/>
        <path d="M -5,16 L -5,30 Q -16,38 -14,55 Q -10,68 0,68 Q 10,68 14,55 Q 16,38 5,30 L 5,16 Z"
              fill="var(--glass-teal)" stroke="var(--ink)" strokeWidth="1"/>
        <path d="M -10,48 Q -6,42 -2,46 Q 2,50 6,46 Q 10,42 12,48"
              fill="none" stroke="var(--ink)" strokeWidth="0.5" opacity="0.5"/>
        <circle cx="-5" cy="52" r="1.5" fill="var(--cream)" opacity="0.5"/>
        <circle cx="3"  cy="58" r="1"   fill="var(--cream)" opacity="0.4"/>
      </g>
    );
  }
  function Quill({ x }) {
    return (
      <g transform={`translate(${x},0)`}>
        <line x1="0" y1="0" x2="0" y2="8" stroke="var(--ink)" strokeWidth="0.6"/>
        <line x1="-16" y1="62" x2="16" y2="14" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M 4,26 Q 16,14 22,6 Q 24,18 16,28 Q 9,30 4,26 Z"
              fill="var(--ink)" stroke="var(--ink)" strokeWidth="0.4"/>
        <path d="M 6,28 L 10,24 M 10,26 L 14,22 M 14,24 L 18,20"
              stroke="var(--cream)" strokeWidth="0.5"/>
        <circle cx="-16" cy="62" r="1.6" fill="var(--sienna)"/>
      </g>
    );
  }
  return (
    <svg viewBox="0 0 1200 90" preserveAspectRatio="none">
      {/* shelf line */}
      <line x1="40" y1="2" x2="1160" y2="2" stroke="var(--ink)" strokeWidth="1.2"/>
      <Herb x={100}/>
      <Herb x={220}/>
      <Potion x={370}/>
      <Herb x={520}/>
      <Quill x={660}/>
      <Herb x={800}/>
      <Potion x={930}/>
      <Herb x={1080}/>
    </svg>
  );
}

const WHA_STYLES = `
:root {
  --ink:        #1a1410;
  --sienna:     #7a3b1e;
  --forest:     #2d5a3d;
  --cobalt:     #1c2b4a;
  --parchment:  #e8d5a3;
  --cream:      #f5ead0;
  --amber:      #c4722a;
  --glass-blue: rgba(40,80,160,0.5);
  --glass-teal: rgba(30,100,60,0.5);
  --glass-amber:rgba(180,100,20,0.5);
}

.wha {
  position: fixed; inset: 0;
  overflow: hidden;
  color: var(--ink);
  font-family: 'Cormorant Garamond', 'EB Garamond', 'Garamond', 'Times New Roman', serif;
  font-weight: 300; font-style: italic;
  background-color: var(--parchment);
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.07'/%3E%3C/svg%3E"),
    radial-gradient(ellipse at center, transparent 35%, rgba(122,59,30,0.22) 100%);
  animation: wha-page-in 0.8s ease-out;
}
@keyframes wha-page-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.wha h1, .wha h2, .wha h3, .wha .wha-cta__label {
  font-family: 'Cinzel Decorative', 'Trajan Pro', serif;
  font-weight: 700; font-style: normal;
  letter-spacing: 0.18em;
  color: var(--ink);
}

/* Orb stage ------------------------------------------------------------- */
.wha-orb-stage {
  position: fixed; inset: 0;
  pointer-events: none; overflow: hidden;
  /* Above all decorative content. Animation timing/transform is driven
     entirely by the Web Animations API (see useEffect in LoginScreen). */
  z-index: 50;
}
.wha-orb {
  position: absolute;
  bottom: -40px;
  border-radius: 50%;
  filter: blur(2.5px) saturate(110%);
  will-change: transform, opacity;
}

/* HEADER --------------------------------------------------------------- */
.wha-header {
  position: relative; z-index: 2;
  max-width: 1280px; margin: 0 auto;
  padding: 26px 48px 14px;
  display: flex; justify-content: space-between; align-items: center;
}
.wha-header__mark {
  width: 40px; height: 40px;
  animation: wha-mark-in 1.2s cubic-bezier(0.16,1,0.3,1) 0.2s both;
}
@keyframes wha-mark-in {
  from { opacity: 0; transform: rotate(-25deg) scale(0.6); }
  to   { opacity: 1; transform: rotate(0)      scale(1);   }
}
.wha-header__nav { display: flex; gap: 38px; }
.wha-nav-link {
  position: relative;
  font-family: 'Almendra SC', 'Cinzel', serif;
  font-style: normal; font-size: 12.5px;
  letter-spacing: 0.28em; text-transform: uppercase;
  color: var(--sienna); text-decoration: none;
  padding: 4px 2px;
  animation: wha-nav-in 0.6s ease-out backwards;
}
.wha-header__nav .wha-nav-link:nth-child(1) { animation-delay: 0.5s; }
.wha-header__nav .wha-nav-link:nth-child(2) { animation-delay: 0.6s; }
.wha-header__nav .wha-nav-link:nth-child(3) { animation-delay: 0.7s; }
@keyframes wha-nav-in {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: translateY(0);    }
}
.wha-nav-link::after {
  content: ""; position: absolute; bottom: -1px; left: 0;
  width: 0; height: 1px; background: var(--ink);
  transition: width 420ms cubic-bezier(0.34,1.56,0.64,1);
}
.wha-nav-link:hover { color: var(--ink); }
.wha-nav-link:hover::after { width: 100%; }

/* HERO ----------------------------------------------------------------- */
.wha-hero {
  position: relative; z-index: 1;
  height: 100vh;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  text-align: center;
}
.wha-sigil-stage {
  position: relative;
  /* Square, but capped by viewport height so the sigil + runes + button all
     fit on a single screen without scrolling. */
  width: min(460px, 86vw, 52vh);
  height: min(460px, 86vw, 52vh);
  margin: 0 auto 28px;
}
.wha-glass {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  filter: drop-shadow(0 12px 24px rgba(28,43,74,0.22));
  animation: wha-glass-in 1.4s cubic-bezier(0.16,1,0.3,1) 0.9s both;
  perspective: 1200px;
}

/* Innermost amber diamond — flips clockwise around the vertical axis. */
.wha-glass__amber {
  transform-box: fill-box;
  transform-origin: 50% 50%;
  animation: wha-amber-flip 7s ease-in-out infinite 2.4s;
}
@keyframes wha-amber-flip {
  0%, 8%    { transform: rotateY(0deg); }
  50%, 58%  { transform: rotateY(180deg); }
  100%      { transform: rotateY(360deg); }
}
@keyframes wha-glass-in {
  from { opacity: 0; transform: scale(0.85); }
  to   { opacity: 0.85; transform: scale(1); }
}
.wha-lantern {
  position: absolute; inset: 6%;
  border-radius: 50%;
  /* Softer gradient stops replace the expensive filter: blur(24px). */
  background: radial-gradient(circle, rgba(196,114,42,0.45) 0%, rgba(196,114,42,0.14) 42%, transparent 72%);
  z-index: 1;
  animation: wha-flicker 3s ease-in-out infinite, wha-glass-in 1.4s ease-out 1.2s both;
}
@keyframes wha-flicker {
  0%, 100% { opacity: 0.7; }
  50%      { opacity: 0.95; }
}
.wha-sigil {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  z-index: 2;
  transition: filter 700ms ease;
}
.wha-sigil:hover { filter: drop-shadow(0 0 10px rgba(196,114,42,0.65)); }
/* Rotation is driven by SMIL <animateTransform> inside the SVG (see the
   .wha-sigil__outer / .wha-sigil__penta groups in LoginScreen), NOT CSS —
   desktop Chrome/Edge here would not animate these <g> groups via CSS
   transform (both transform-box: view-box and fill-box stayed frozen on PC
   while mobile rotated). No CSS animation here on purpose. */
.wha-sigil__glyphs {
  /* The glyphs ride along the outer rotating group, so they revolve with
     the ring. They draw themselves in after the ink ring strokes finish. */
  animation: wha-fade 1.4s ease-out 1.4s both;
}
.wha-sigil__glyphs g g {
  /* Subtle individual glyph staggered breath — pulse opacity to mimic
     candle-lit ink that brightens unevenly. */
  animation: wha-glyph-breath 6s ease-in-out infinite;
  transform-box: fill-box;
}
.wha-sigil__glyphs g:nth-child(1) g { animation-delay: 0s; }
.wha-sigil__glyphs g:nth-child(2) g { animation-delay: 0.7s; }
.wha-sigil__glyphs g:nth-child(3) g { animation-delay: 1.4s; }
.wha-sigil__glyphs g:nth-child(4) g { animation-delay: 2.1s; }
.wha-sigil__glyphs g:nth-child(5) g { animation-delay: 2.8s; }
.wha-sigil__glyphs g:nth-child(6) g { animation-delay: 3.5s; }
.wha-sigil__glyphs g:nth-child(7) g { animation-delay: 4.2s; }
.wha-sigil__glyphs g:nth-child(8) g { animation-delay: 4.9s; }
@keyframes wha-glyph-breath {
  0%, 100% { opacity: 0.65; }
  50%      { opacity: 1; }
}
.wha-sigil__core { animation: wha-fade 0.9s ease-out 1.4s both; }
.wha-ink-draw {
  stroke-dasharray: 1000; stroke-dashoffset: 1000;
  animation: wha-ink 2s ease-out forwards;
}
@keyframes wha-ink   { to { stroke-dashoffset: 0; } }
@keyframes wha-spin  { to { transform: rotate(360deg); } }
@keyframes wha-spin-rev { to { transform: rotate(-360deg); } }
@keyframes wha-fade  { from { opacity: 0; } to { opacity: 1; } }

.wha-runes {
  font-family: 'Almendra SC', serif; font-style: normal;
  letter-spacing: 0.4em; color: var(--sienna);
  margin: 0;
}
.wha-runes--hero {
  font-size: 13.5px;
  margin-bottom: 26px;
  animation: wha-fade-up 0.6s ease-out 1.6s both;
}
.wha-runes--small {
  font-size: 10.5px; opacity: 0.7;
  margin-top: 22px; letter-spacing: 0.42em;
  animation: wha-fade-up 0.5s ease-out 2.1s both;
}
@keyframes wha-fade-up {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0);    }
}

/* CTA ------------------------------------------------------------------ */
.wha-cta {
  position: relative;
  display: inline-flex; align-items: center; gap: 14px;
  padding: 16px 38px;
  font-family: 'Cinzel Decorative', serif;
  font-size: 13.5px; font-weight: 700; font-style: normal;
  letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--ink);
  background: var(--cream);
  border: 1.5px solid var(--ink);
  border-radius: 0;
  cursor: pointer;
  transition:
    background 300ms ease,
    border-color 300ms ease,
    box-shadow 300ms ease,
    transform 220ms cubic-bezier(0.34,1.56,0.64,1);
  animation: wha-fade-up 0.7s cubic-bezier(0.16,1,0.3,1) 1.9s both;
}
.wha-cta::before, .wha-cta::after {
  content: "✦"; position: absolute; top: 50%; transform: translateY(-50%);
  color: var(--sienna); font-size: 10px; font-family: serif;
}
.wha-cta::before { left: 14px; }
.wha-cta::after  { right: 14px; }
.wha-cta__glyph {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px;
  background: var(--parchment);
  border: 1px solid var(--ink);
  border-radius: 50%;
  padding: 2px;
  box-sizing: border-box;
}
.wha-cta__label { display: inline-block; }
.wha-cta:hover:not(:disabled) {
  border-color: var(--amber);
  box-shadow:
    inset 0 0 24px rgba(196,114,42,0.28),
    0 8px 28px rgba(122,59,30,0.28);
  transform: translateY(-2px);
}
.wha-cta:active:not(:disabled) { transform: translateY(0); }
.wha-cta:disabled { cursor: not-allowed; opacity: 0.65; }

/* Error box */
.wha-error {
  max-width: 540px;
  margin: 0 auto 22px;
  padding: 13px 18px;
  background: rgba(122,59,30,0.10);
  border: 1px solid var(--sienna);
  color: var(--ink);
  font-size: 14px; line-height: 1.55;
  text-align: left;
}
.wha-error strong { color: var(--sienna); margin-right: 6px; }

/* Divider -------------------------------------------------------------- */
.wha-divider {
  display: block; width: 100%; height: 40px;
  margin: 16px 0 24px;
}

/* CARDS ---------------------------------------------------------------- */
.wha-cards {
  position: relative; z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 28px;
  max-width: 1180px;
  margin: 40px auto;
  padding: 0 48px;
}
.wha-card {
  position: relative;
  background: var(--cream);
  border: 1.5px solid var(--ink);
  clip-path: polygon(0% 100%, 0% 22%, 6% 8%, 50% 0%, 94% 8%, 100% 22%, 100% 100%);
  padding: 88px 30px 30px;
  min-height: 320px;
  opacity: 0; transform: translateY(30px);
  transition:
    opacity 700ms ease-out,
    transform 700ms cubic-bezier(0.34,1.56,0.64,1),
    box-shadow 400ms ease;
}
.wha-card.wha-revealed { opacity: 1; transform: translateY(0); }
.wha-card:hover { transform: translateY(-6px); box-shadow: 0 20px 44px rgba(122,59,30,0.28); }
.wha-card__hatch {
  position: absolute; inset: 0; pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Cpath d='M 0,8 L 8,0' stroke='%231a1410' stroke-width='0.5'/%3E%3C/svg%3E");
  opacity: 0.1;
  clip-path: inherit;
}
.wha-card__glyph {
  width: 64px; height: 64px;
  margin: 0 auto 18px;
  color: var(--sienna);
  position: relative; z-index: 1;
}
.wha-card__title {
  font-size: 15px; letter-spacing: 0.24em;
  margin: 0 0 14px; text-align: center;
  text-transform: uppercase;
  position: relative; z-index: 1;
}
.wha-card__phrase {
  font-size: 15.5px; line-height: 1.65;
  text-align: center; color: var(--ink); opacity: 0.88;
  margin: 0; max-width: 240px; margin-left: auto; margin-right: auto;
  position: relative; z-index: 1;
}
.wha-card__seal {
  position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%);
  font-family: serif; font-size: 12px; color: var(--sienna);
}

/* SHELF ---------------------------------------------------------------- */
.wha-shelf {
  position: relative; z-index: 1;
  width: 100%;
  padding: 30px 48px 10px;
  max-width: 1280px; margin: 0 auto;
  opacity: 0; transform: translateY(20px);
  transition: opacity 800ms ease-out, transform 800ms ease-out;
}
.wha-shelf.wha-revealed { opacity: 1; transform: translateY(0); }
.wha-shelf svg { width: 100%; height: auto; max-height: 130px; display: block; }

/* FOOTER --------------------------------------------------------------- */
.wha-footer {
  position: relative; z-index: 1;
  text-align: center;
  padding: 30px 24px 60px;
  opacity: 0; transform: translateY(16px);
  transition: opacity 700ms ease-out, transform 700ms ease-out;
}
.wha-footer.wha-revealed { opacity: 1; transform: translateY(0); }
.wha-footer__ring {
  width: 90px; height: 90px; margin: 0 auto 10px;
}
.wha-footer__ring svg { width: 100%; height: 100%; }
/* footer ring rotation handled by SMIL animateTransform inside the SVG */
.wha-footer__runes {
  font-family: 'Almendra SC', serif; font-style: normal;
  font-size: 8.5px; letter-spacing: 0.3em;
  fill: var(--sienna);
}
.wha-footer__credit {
  font-family: 'Almendra SC', serif; font-style: normal;
  font-size: 11.5px; letter-spacing: 0.32em;
  color: var(--sienna); text-transform: uppercase;
  margin: 0;
}

/* Responsive ----------------------------------------------------------- */
@media (max-width: 720px) {
  .wha-header { padding: 18px 22px 8px; }
  .wha-header__nav { gap: 20px; }
  .wha-nav-link { font-size: 10.5px; letter-spacing: 0.18em; }
  .wha-sigil-stage { width: 320px; height: 320px; }
  .wha-cards { grid-template-columns: 1fr; padding: 0 22px; gap: 22px; }
  .wha-card { min-height: 280px; padding: 70px 24px 24px; }
  .wha-cta { padding: 14px 28px; font-size: 12.5px; }
}

@media (prefers-reduced-motion: reduce) {
  .wha, .wha *, .wha-orb {
    animation: none !important;
    transition: none !important;
  }
  .wha-card  { opacity: 1; transform: none; }
  .wha-shelf { opacity: 1; transform: none; }
  .wha-footer{ opacity: 1; transform: none; }
  .wha-ink-draw { stroke-dashoffset: 0; }
}
`;

// ===========================================================================
// H-11: promise-based prompt modal — replaces window.prompt (which blocks the
// UI, can't validate, and is suppressed by some enterprise browsers).
//   const value = await window.flowmatePrompt({ title, label, required, ... });
//   -> resolves the trimmed string, or null if cancelled.
// A single <FlowMatePromptHost/> mounted in App renders the dialog.
// ===========================================================================
window.flowmatePrompt = function (opts) {
  return new Promise(function (resolve) {
    window.__flowmatePromptResolve = resolve;
    try {
      window.dispatchEvent(new CustomEvent("flowmate:prompt-open", { detail: opts || {} }));
    } catch (e) {
      // If events are unavailable for any reason, fail closed (cancel).
      window.__flowmatePromptResolve = null;
      resolve(null);
    }
  });
};

function FlowMatePromptHost() {
  const [req, setReq] = useStateApp(null);
  const [value, setValue] = useStateApp("");
  const [error, setError] = useStateApp("");

  useEffectApp(() => {
    function onOpen(e) {
      const opts = e.detail || {};
      setReq(opts);
      setValue(opts.defaultValue || "");
      setError("");
    }
    window.addEventListener("flowmate:prompt-open", onOpen);
    return () => window.removeEventListener("flowmate:prompt-open", onOpen);
  }, []);

  useEffectApp(() => {
    if (!req) return;
    function onKey(e) { if (e.key === "Escape") settle(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req]);

  if (!req) return null;

  function settle(result) {
    const resolve = window.__flowmatePromptResolve;
    window.__flowmatePromptResolve = null;
    setReq(null);
    setValue("");
    setError("");
    if (resolve) resolve(result);
  }

  function onSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (req.hideInput) { settle(""); return; }
    const trimmed = (value || "").trim();
    if (req.required && !trimmed) { setError("This field is required."); return; }
    if (typeof req.validate === "function") {
      const v = req.validate(trimmed);
      if (v) { setError(v); return; }
    }
    settle(trimmed);
  }

  const overlayStyle = {
    position: "fixed", inset: 0, zIndex: 1000,
    background: "rgba(20, 24, 32, 0.45)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 20,
  };
  const modalStyle = {
    background: "var(--garena-white, #fff)", color: "var(--garena-iron, #2b2f36)",
    width: "100%", maxWidth: 460, borderRadius: 10,
    boxShadow: "0 18px 48px rgba(0,0,0,0.28)",
    padding: 20, boxSizing: "border-box",
    fontFamily: "inherit",
  };
  const inputStyle = {
    width: "100%", boxSizing: "border-box", marginTop: 6,
    padding: "9px 11px", fontSize: 14,
    border: "1px solid var(--garena-light-grey, #d8dce3)", borderRadius: 6,
    fontFamily: "inherit",
  };

  return (
    <div style={overlayStyle} onMouseDown={() => settle(null)}>
      <div role="dialog" aria-modal="true" style={modalStyle} onMouseDown={(e) => e.stopPropagation()}>
        <form onSubmit={onSubmit}>
          {req.title ? <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{req.title}</div> : null}
          {req.label ? (
            <label style={{ fontSize: 13, fontWeight: 600, display: "block" }}>
              {req.label}{req.required ? <span style={{ color: "var(--garena-red, #c0504d)" }}> *</span> : null}
            </label>
          ) : null}
          {!req.hideInput && (req.multiline
            ? <textarea autoFocus rows={4} style={inputStyle} value={value} placeholder={req.placeholder || ""}
                onChange={(e) => { setValue(e.target.value); if (error) setError(""); }} />
            : <input autoFocus type="text" style={inputStyle} value={value} placeholder={req.placeholder || ""}
                onChange={(e) => { setValue(e.target.value); if (error) setError(""); }} />)}
          {req.note ? <div style={{ fontSize: 12, color: "var(--garena-grey, #6b7280)", marginTop: 8, lineHeight: 1.5 }}>{req.note}</div> : null}
          {error ? <div style={{ fontSize: 12.5, color: "var(--garena-red, #c0504d)", marginTop: 8 }}>{error}</div> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn--ghost" onClick={() => settle(null)}>Cancel</button>
            <button type="submit" className="btn btn--primary">{req.confirmText || "OK"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
