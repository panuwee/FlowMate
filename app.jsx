// FlowMate - app shell + routing
const { useState: useStateApp, useEffect: useEffectApp } = React;

const FLOWMATE_APP_VERSION = "v20260624-10";

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
  "workload": "Workload", "kpi": "KPI", "settings": "Team settings",
  "admin-whitelist": "Whitelist",
};

const MEMBER_ROUTE_KEYS = new Set(MEMBER_NAV_GROUPS.flatMap(group => group.items.map(item => item.key)).concat(["detail"]));

function getVisibleNavGroups(role) {
  return role === "admin" ? [...NAV, ADMIN_NAV_GROUP] : MEMBER_NAV_GROUPS;
}

function isFlowMateRouteAllowedForRole(role, routeKey) {
  if (role === "admin") return Boolean(TITLE_MAP[routeKey]);
  return MEMBER_ROUTE_KEYS.has(routeKey);
}

function App() {
  const [route, setRoute] = useStateApp(() => {
    const h = window.location.hash.replace("#", "");
    return h && TITLE_MAP[h.split("/")[0]] ? h.split("/")[0] : "my-work";
  });
  const [focusId, setFocusId] = useStateApp(null);
  // O-6: `searchInput` is bound to the box (instant typing); `searchQuery` is
  // the debounced value passed to the screens. This stops every keystroke from
  // re-rendering the whole signed-in tree and re-running the O(n) grouping.
  const [searchInput, setSearchInput] = useStateApp("");
  const [searchQuery, setSearchQuery] = useStateApp("");
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
  // status: "loading" → "signed-in" | "signed-out".
  // Loading shows a small splash. Signed-out shows the Login landing page.
  // Signed-in renders the full FlowMate app.
  const [authState, setAuthState] = useStateApp({ status: "loading", user: null });
  const [isSigningIn, setIsSigningIn] = useStateApp(false);
  const [realtimeState, setRealtimeState] = useStateApp(() => window.FLOWMATE_REALTIME_STATE || {
    status: "idle",
    message: "Realtime not started",
  });

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
      const [r, id] = h.split("/");
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
    }
  }

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

  return (
    <div className="app">
      <FlowMatePromptHost />
      <div className="app__brand">
        <img src="garena/logo_graphic.png" alt="Garena" />
        <span className="app__brand-name">FlowMate</span>
        <span className="app__brand-version">{FLOWMATE_APP_VERSION}</span>
      </div>

      <div className="app__topbar">
        <div className="searchbar">
          <Icon name="search" size={14} />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by ID, title, campaign, requester, assignee..."
          />
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

  // Bioluminescent orb spawner — uses the Web Animations API rather than
  // CSS keyframes + custom properties. Some desktop Chrome builds refuse
  // to interpolate var(--wha-drift) inside a keyframe, leaving the orbs
  // stuck below the viewport so they were never visible on PC.
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

    // Immediate burst so first impression already has motion
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

      {/* Floating orb stage */}
      <div id="wha-orb-stage" className="wha-orb-stage" aria-hidden="true" />

      {/* HEADER ------------------------------------------------------- */}
      <header className="wha-header">
        <div className="wha-header__mark" aria-hidden="true">
          <svg viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="16" fill="none" stroke="var(--ink)" strokeWidth="1.2"/>
            <circle cx="20" cy="20" r="11" fill="none" stroke="var(--sienna)" strokeWidth="0.6" strokeDasharray="2 3"/>
            <path d="M 20,7 L 25,18 L 33,18 L 27,25 L 30,33 L 20,28 L 10,33 L 13,25 L 7,18 L 15,18 Z"
                  fill="var(--sienna)" stroke="var(--ink)" strokeWidth="0.7"/>
          </svg>
        </div>
        <nav className="wha-header__nav" aria-label="flowmate">
          <a href="#atelier" className="wha-nav-link">Task</a>
          <a href="#grimoire" className="wha-nav-link">Request</a>
          <a href="#threshold" className="wha-nav-link">Workload</a>
        </nav>
      </header>

      {/* HERO --------------------------------------------------------- */}
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
            {/* outer ring + sigil glyphs — both rotate CW together via SMIL.
                We use animateTransform rather than CSS transform because
                transform-origin on SVG <g> is unreliable across browsers
                and was leaving the group rotating around (0,0). */}
            <g className="wha-sigil__outer">
              <animateTransform attributeName="transform" attributeType="XML"
                type="rotate" from="0 250 250" to="360 250 250"
                dur="40s" repeatCount="indefinite"/>
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
            {/* pentagram — rotates CCW via SMIL animateTransform */}
            <g className="wha-sigil__penta">
              <animateTransform attributeName="transform" attributeType="XML"
                type="rotate" from="0 250 250" to="-360 250 250"
                dur="60s" repeatCount="indefinite"/>
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

      {/* INK DIVIDER */}
      <InkDivider />

      {/* CARDS -------------------------------------------------------- */}
      <section className="wha-cards" id="atelier">
        {[
          { glyph: "quill",   title: "Brief Gate",       phrase: "Every request begins with clarity." },
          { glyph: "glass",   title: "Capacity Oracle",  phrase: "Work flows by skill, effort, and load." },
          { glyph: "compass", title: "Team Compass",     phrase: "Every task finds the right owner." },
        ].map((c, i) => (
          <article key={c.title} className="wha-card wha-reveal" style={{ transitionDelay: (0.18 * i) + "s" }}>
            <div className="wha-card__hatch" aria-hidden="true"></div>
            <div className="wha-card__glyph" aria-hidden="true">
              <CardGlyph kind={c.glyph} />
            </div>
            <h3 className="wha-card__title">{c.title}</h3>
            <p className="wha-card__phrase">{c.phrase}</p>
            <div className="wha-card__seal" aria-hidden="true">✦</div>
          </article>
        ))}
      </section>

      {/* INK DIVIDER */}
      <InkDivider />

      {/* BOTANICAL SHELF --------------------------------------------- */}
      <section className="wha-shelf wha-reveal" id="grimoire" aria-hidden="true">
        <ShelfRow />
      </section>

      {/* FOOTER ------------------------------------------------------- */}
      <footer className="wha-footer wha-reveal">
        <div className="wha-footer__ring">
          <svg viewBox="0 0 120 120">
            <defs>
              <path id="wha-footer-arc" d="M 60,60 m -42,0 a 42,42 0 1,1 84,0 a 42,42 0 1,1 -84,0"/>
            </defs>
            {/* Rotating sub-group via SMIL — reliable across desktop browsers
                where CSS transform-origin on SVG root is flaky. */}
            <g>
              <animateTransform attributeName="transform" attributeType="XML"
                type="rotate" from="0 60 60" to="360 60 60"
                dur="60s" repeatCount="indefinite"/>
              <circle cx="60" cy="60" r="50" fill="none" stroke="var(--ink)" strokeWidth="0.8"/>
              <circle cx="60" cy="60" r="42" fill="none" stroke="var(--sienna)" strokeWidth="0.4" strokeDasharray="2 3"/>
              <text className="wha-footer__runes">
                <textPath href="#wha-footer-arc">⚝ INSCRIBED · BY · HAND · PANU · ⚝ · GARENA · FCO · ⚝</textPath>
              </text>
            </g>
            {/* Center star stays still */}
            <text x="60" y="68" textAnchor="middle" fontFamily="Cinzel Decorative" fontSize="24"
                  fontWeight="700" fill="var(--ink)">⚝</text>
          </svg>
        </div>
        <p className="wha-footer__credit">Inscribed by hand · Panu</p>
      </footer>
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
  overflow-y: auto; overflow-x: hidden;
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
  from { filter: sepia(1) brightness(1.3); }
  to   { filter: sepia(0) brightness(1); }
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
  /* Above all decorative content. Animation timing/transform is now driven
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
  min-height: 78vh;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 30px 24px 60px;
  text-align: center;
}
.wha-sigil-stage {
  position: relative;
  width: 460px; height: 460px;
  max-width: 86vw; max-height: 86vw;
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
  background: radial-gradient(circle, rgba(196,114,42,0.55) 0%, rgba(196,114,42,0.18) 35%, transparent 65%);
  filter: blur(24px);
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
/* Rotation now driven by SMIL <animateTransform> inside the SVG so the
   spin is reliable regardless of transform-origin quirks. */
.wha-sigil__outer { }
.wha-sigil__penta { }
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
          {req.multiline
            ? <textarea autoFocus rows={4} style={inputStyle} value={value} placeholder={req.placeholder || ""}
                onChange={(e) => { setValue(e.target.value); if (error) setError(""); }} />
            : <input autoFocus type="text" style={inputStyle} value={value} placeholder={req.placeholder || ""}
                onChange={(e) => { setValue(e.target.value); if (error) setError(""); }} />}
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
