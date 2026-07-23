/* AUTO-GENERATED from app.jsx by build-github.cjs. Do not edit; edit the .jsx and re-run `npm run build:github`. */
const {
  useState: useStateApp,
  useEffect: useEffectApp,
  useRef: useRefApp
} = React;
function getFlowMateAppVersion() {
  const fallbackVersion = "v20260723-7";
  try {
    const scripts = Array.from(document.scripts || []);
    const appScript = scripts.find(script => {
      const src = script.getAttribute("src") || "";
      return /(?:^|\/)app\.js(?:\?|$)/.test(src);
    });
    const src = appScript ? appScript.getAttribute("src") || "" : "";
    const deployVersion = new URL(src, window.location.href).searchParams.get("v");
    if (deployVersion) return deployVersion.startsWith("v") ? deployVersion : `v${deployVersion}`;
  } catch (e) {}
  return fallbackVersion;
}
const FLOWMATE_APP_VERSION = getFlowMateAppVersion();
const PRODUCT_BOOK_PRODUCT_KEY = "product-book";
const NAV = [{
  group: "Personal",
  items: [{
    key: "my-work",
    label: "My work",
    icon: "inbox"
  }, {
    key: "create",
    label: "Create",
    icon: "plus"
  }]
}, {
  group: "Team",
  items: [{
    key: "board",
    label: "Board",
    icon: "board"
  }, {
    key: "list",
    label: "List",
    icon: "list"
  }, {
    key: "calendar",
    label: "Calendar",
    icon: "calendar"
  }, {
    key: "gantt",
    label: "Gantt Chart",
    icon: "chart"
  }, {
    key: "queue",
    label: "Central queue",
    icon: "queue"
  }]
}, {
  group: "Supervisor",
  items: [{
    key: "workload",
    label: "Workload",
    icon: "users"
  }, {
    key: "kpi",
    label: "KPI",
    icon: "chart"
  }, {
    key: "settings",
    label: "Team settings",
    icon: "settings"
  }]
}];
const ADMIN_NAV_GROUP = {
  group: "Admin",
  items: [{
    key: "admin-whitelist",
    label: "Whitelist",
    icon: "users"
  }]
};
const MEMBER_NAV_GROUPS = NAV.filter(group => group.group === "Personal" || group.group === "Team");
const TITLE_MAP = {
  "my-work": "My work",
  "create": "Create",
  "detail": "Work item",
  "list": "All work",
  "board": "Board",
  "calendar": "Team calendar",
  "gantt": "Team Gantt chart",
  "queue": "Central queue",
  "planning-channel": "Channel View",
  "planning-campaign": "Campaign View",
  "planning-calendar": "Content Calendar",
  "workload": "Workload",
  "kpi": "KPI",
  "settings": "Team settings",
  "admin-whitelist": "Whitelist"
};
const MEMBER_ROUTE_KEYS = new Set(MEMBER_NAV_GROUPS.flatMap(group => group.items.map(item => item.key)).concat(["detail"]));
const MARKETING_PLAN_HASH_KEYS = new Set(["campaign-timeline", "channel-plan", "marketing-calendar", "working-sheet", "supervisor"]);
const PRODUCT_BOOK_HASH_KEYS = new Set([PRODUCT_BOOK_PRODUCT_KEY, "product-book-latest"]);
const VALID_PRODUCT_KEYS = new Set(["flowmate", "marketing-plan", PRODUCT_BOOK_PRODUCT_KEY]);
function getFlowMateHashRouteKey(hashValue) {
  return String(hashValue || window.location.hash || "").replace("#", "").split("/")[0];
}
function isProductChoicePath() {
  return /\/home\/?$/.test(String(window.location.pathname || ""));
}
function getProductFromHashRouteKey(hashValue) {
  const hashKey = getFlowMateHashRouteKey(hashValue);
  if (MARKETING_PLAN_HASH_KEYS.has(hashKey)) return "marketing-plan";
  if (PRODUCT_BOOK_HASH_KEYS.has(hashKey)) return PRODUCT_BOOK_PRODUCT_KEY;
  if (TITLE_MAP[hashKey]) return "flowmate";
  return "";
}
function showProductChoicePathInAddressBar() {
  try {
    const path = String(window.location.pathname || "/");
    if (isProductChoicePath()) {
      window.history.replaceState(null, "", path.replace(/\/$/, ""));
      return;
    }
    const basePath = path.endsWith("/") ? path : path.replace(/\/[^/]*$/, "/");
    window.history.replaceState(null, "", `${basePath}home`);
  } catch (e) {}
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
  const [searchInput, setSearchInput] = useStateApp("");
  const [searchQuery, setSearchQuery] = useStateApp("");
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useStateApp(false);
  const searchWrapRef = useRefApp(null);
  const [navCounts, setNavCounts] = useStateApp({});
  const [notifications, setNotifications] = useStateApp([]);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useStateApp(false);
  const [notificationLoadState, setNotificationLoadState] = useStateApp({
    status: "idle",
    message: ""
  });
  const [markingNotificationId, setMarkingNotificationId] = useStateApp(null);
  const [isMarkingAllNotifications, setIsMarkingAllNotifications] = useStateApp(false);
  const [isDismissingReadNotifications, setIsDismissingReadNotifications] = useStateApp(false);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useStateApp(false);
  const [createModeIntent, setCreateModeIntent] = useStateApp("creative");
  const [isGlobalLeaveModalOpen, setIsGlobalLeaveModalOpen] = useStateApp(false);
  const [activeProduct, setActiveProduct] = useStateApp(() => {
    try {
      const hashKey = getFlowMateHashRouteKey();
      const hashProduct = getProductFromHashRouteKey(hashKey);
      if (isProductChoicePath()) return hashProduct || null;
      if (hashProduct) return hashProduct;
      const savedProduct = sessionStorage.getItem("flowmate:activeProduct");
      if (VALID_PRODUCT_KEYS.has(savedProduct)) return savedProduct;
    } catch (e) {}
    return null;
  });
  const [authState, setAuthState] = useStateApp({
    status: "loading",
    user: null
  });
  const [isSigningIn, setIsSigningIn] = useStateApp(false);
  const [realtimeState, setRealtimeState] = useStateApp(() => window.FLOWMATE_REALTIME_STATE || {
    status: "idle",
    message: "Realtime not started"
  });
  const [globalSearchRows, setGlobalSearchRows] = useStateApp([]);
  const [globalSearchLoadState, setGlobalSearchLoadState] = useStateApp({
    status: "idle",
    message: ""
  });
  function nav(key) {
    setRoute(key);
    window.location.hash = key;
  }
  function open(id, options = {}) {
    if (!options.preserveBackContext && window.saveFlowMateDetailBackContext && route !== "detail") {
      window.saveFlowMateDetailBackContext({
        route,
        label: `Back to ${TITLE_MAP[route] || "Previous"}`
      });
    }
    setFocusId(id);
    setRoute("detail");
    window.location.hash = `detail/${id}`;
  }
  async function refreshNotifications(options = {}) {
    if (!window.loadFlowMateNotifications) {
      setNotifications([]);
      setNotificationLoadState({
        status: "error",
        message: "Notification loader is not ready."
      });
      return [];
    }
    if (options.showLoading) {
      setNotificationLoadState({
        status: "loading",
        message: "Loading notifications..."
      });
    }
    try {
      const rows = await window.loadFlowMateNotifications();
      setNotifications(rows || []);
      setNotificationLoadState({
        status: "live",
        message: "Live Supabase notifications"
      });
      return rows || [];
    } catch (error) {
      console.error("[FlowMate Notifications] Load failed:", error);
      setNotifications([]);
      setNotificationLoadState({
        status: "error",
        message: window.flowmateUserError(error, "Notification load failed.")
      });
      return [];
    }
  }
  async function handleMarkNotificationRead(notification) {
    if (!notification || notification.readAt || !window.markFlowMateNotificationRead) return;
    setMarkingNotificationId(notification.id);
    try {
      const result = await window.markFlowMateNotificationRead(notification.id);
      const readAt = result && result.read_at || new Date().toISOString();
      setNotifications(rows => rows.map(row => row.id === notification.id ? {
        ...row,
        readAt,
        isRead: true
      } : row));
    } catch (error) {
      console.error("[FlowMate Notifications] Mark read failed:", error);
      setNotificationLoadState({
        status: "error",
        message: window.flowmateUserError(error, "Mark read failed.")
      });
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
      setNotifications(rows => rows.map(row => row.readAt ? row : {
        ...row,
        readAt,
        isRead: true
      }));
      refreshNotifications({
        showLoading: false
      });
    } catch (error) {
      console.error("[FlowMate Notifications] Mark all read failed:", error);
      setNotificationLoadState({
        status: "error",
        message: window.flowmateUserError(error, "Mark all read failed.")
      });
    } finally {
      setIsMarkingAllNotifications(false);
    }
  }
  async function handleDismissReadNotifications() {
    if (!window.dismissReadFlowMateNotifications) return;
    setIsDismissingReadNotifications(true);
    try {
      await window.dismissReadFlowMateNotifications();
      await refreshNotifications({
        showLoading: false
      });
    } catch (error) {
      console.error("[FlowMate Notifications] Dismiss read failed:", error);
      setNotificationLoadState({
        status: "error",
        message: window.flowmateUserError(error, "Clear read failed.")
      });
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
      setNotificationLoadState({
        status: "error",
        message: window.flowmateUserError(error, "Open notification failed.")
      });
    }
  }
  useEffectApp(() => {
    function onHash() {
      const h = window.location.hash.replace("#", "");
      const r = getFlowMateHashRouteKey(h);
      const id = h.split("/")[1];
      if (MARKETING_PLAN_HASH_KEYS.has(r)) {
        setActiveProduct("marketing-plan");
        try {
          sessionStorage.setItem("flowmate:activeProduct", "marketing-plan");
        } catch (e) {}
      } else if (PRODUCT_BOOK_HASH_KEYS.has(r)) {
        setActiveProduct(PRODUCT_BOOK_PRODUCT_KEY);
        try {
          sessionStorage.setItem("flowmate:activeProduct", PRODUCT_BOOK_PRODUCT_KEY);
        } catch (e) {}
      } else if (TITLE_MAP[r]) {
        setActiveProduct("flowmate");
        try {
          sessionStorage.setItem("flowmate:activeProduct", "flowmate");
        } catch (e) {}
      }
      if (r === "detail" && id) {
        setFocusId(id);
        setRoute("detail");
        return;
      }
      if (TITLE_MAP[r]) setRoute(r);
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
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
  useEffectApp(() => {
    let alive = true;
    if (!window.flowmateInitAuth) {
      setAuthState({
        status: "signed-out",
        user: null
      });
      return;
    }
    let decided = false;
    setTimeout(() => {
      if (!alive || decided) return;
      setAuthState({
        status: "signed-out",
        user: null
      });
    }, 5000);
    Promise.resolve().then(() => window.flowmateInitAuth()).catch(error => {
      console.error("[FlowMate Auth] init failed:", error);
      return null;
    }).then(realUser => {
      decided = true;
      window.flowmateInitialAuthSettled = true;
      if (!alive) return;
      if (realUser) {
        setAuthState({
          status: "signed-in",
          user: realUser
        });
        let shouldShowProductChoice = false;
        try {
          shouldShowProductChoice = sessionStorage.getItem("flowmate:showProductChoiceAfterLogin") === "1";
        } catch (e) {}
        if (shouldShowProductChoice) {
          try {
            sessionStorage.removeItem("flowmate:showProductChoiceAfterLogin");
            sessionStorage.removeItem("flowmate:activeProduct");
          } catch (e) {}
          setActiveProduct(null);
          showProductChoicePathInAddressBar();
          return;
        }
        let postLoginHash = null;
        try {
          postLoginHash = sessionStorage.getItem("flowmate:postLoginHash");
        } catch (e) {}
        if (postLoginHash) {
          try {
            sessionStorage.removeItem("flowmate:postLoginHash");
          } catch (e) {}
          if (TITLE_MAP[postLoginHash]) {
            window.location.hash = postLoginHash;
          }
        }
      } else {
        setAuthState({
          status: "signed-out",
          user: null
        });
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  async function handleSignIn() {
    setIsSigningIn(true);
    try {
      try {
        sessionStorage.setItem("flowmate:showProductChoiceAfterLogin", "1");
        sessionStorage.removeItem("flowmate:activeProduct");
        sessionStorage.removeItem("flowmate:postLoginHash");
      } catch (e) {}
      await window.flowmateSignInWithGoogle();
    } catch (error) {
      console.error("[FlowMate Auth] sign-in failed:", error);
      window.alert("Sign-in failed: " + window.flowmateUserError(error, "unknown error"));
      setIsSigningIn(false);
    }
  }
  async function handleSignOut() {
    try {
      await window.flowmateSignOut();
    } catch (error) {
      console.error("[FlowMate Auth] sign-out failed:", error);
    } finally {
      setActiveProduct(null);
      try {
        sessionStorage.removeItem("flowmate:activeProduct");
      } catch (e) {}
    }
  }
  function returnToProductHome() {
    setActiveProduct(null);
    try {
      sessionStorage.removeItem("flowmate:activeProduct");
      sessionStorage.removeItem("flowmate:postLoginHash");
    } catch (e) {}
    showProductChoicePathInAddressBar();
  }
  function chooseFlowMateProduct() {
    setActiveProduct("flowmate");
    try {
      sessionStorage.setItem("flowmate:activeProduct", "flowmate");
    } catch (e) {}
    if (MARKETING_PLAN_HASH_KEYS.has(getFlowMateHashRouteKey())) {
      window.location.hash = route && TITLE_MAP[route] ? route : "my-work";
    }
  }
  function chooseMarketingPlanProduct() {
    setActiveProduct("marketing-plan");
    try {
      sessionStorage.setItem("flowmate:activeProduct", "marketing-plan");
    } catch (e) {}
    if (!MARKETING_PLAN_HASH_KEYS.has(getFlowMateHashRouteKey())) {
      window.location.hash = "campaign-timeline";
    }
  }
  function chooseProductBookProduct() {
    setActiveProduct(PRODUCT_BOOK_PRODUCT_KEY);
    try {
      sessionStorage.setItem("flowmate:activeProduct", PRODUCT_BOOK_PRODUCT_KEY);
    } catch (e) {}
    window.location.hash = "product-book";
  }
  useEffectApp(() => {
    function onSwitchFlowMateProduct(event) {
      const routeKey = event && event.detail && event.detail.route ? event.detail.route : "my-work";
      setActiveProduct("flowmate");
      try {
        sessionStorage.setItem("flowmate:activeProduct", "flowmate");
      } catch (e) {}
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
      setRealtimeState(event.detail || window.FLOWMATE_REALTIME_STATE || {
        status: "idle"
      });
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
      setNotificationLoadState({
        status: "idle",
        message: ""
      });
      return;
    }
    let alive = true;
    async function loadRows() {
      const rows = await refreshNotifications({
        showLoading: notifications.length === 0
      });
      if (!alive) return;
      return rows;
    }
    loadRows();
    const cleanup = window.attachFlowMateLiveRefresh ? window.attachFlowMateLiveRefresh(loadRows) : () => {};
    return () => {
      alive = false;
      cleanup();
    };
  }, [authState.status]);
  useEffectApp(() => {
    if (authState.status !== "signed-in") {
      setGlobalSearchRows([]);
      setGlobalSearchLoadState({
        status: "idle",
        message: ""
      });
      return;
    }
    let alive = true;
    async function refreshGlobalSearchRows() {
      if (!window.loadFlowMateListRows) {
        setGlobalSearchRows([]);
        setGlobalSearchLoadState({
          status: "error",
          message: "Search loader is not ready."
        });
        return;
      }
      try {
        const rows = await window.loadFlowMateListRows();
        if (!alive) return;
        setGlobalSearchRows(rows || []);
        setGlobalSearchLoadState({
          status: "live",
          message: "Search ready"
        });
      } catch (error) {
        if (!alive) return;
        console.error("[FlowMate Search] Global search load failed:", error);
        setGlobalSearchRows([]);
        setGlobalSearchLoadState({
          status: "error",
          message: window.flowmateUserError(error, "Search load failed.")
        });
      }
    }
    refreshGlobalSearchRows();
    window.addEventListener("flowmate:refresh-request", refreshGlobalSearchRows);
    return () => {
      alive = false;
      window.removeEventListener("flowmate:refresh-request", refreshGlobalSearchRows);
    };
  }, [authState.status]);
  if (authState.status === "loading") {
    return React.createElement(LoadingScreen, null);
  }
  if (authState.status === "signed-out") {
    return React.createElement(LoginScreen, {
      onSignIn: handleSignIn,
      isSigningIn: isSigningIn,
      authError: window.flowmateAuthError || null
    });
  }
  const user = authState.user || {};
  const currentUserName = user.name || "User";
  const currentUserEmail = user.email || "";
  const avatarMemberId = user.team_member_id || null;
  const isAdminUser = user.role === "admin";
  const visibleNavGroups = getVisibleNavGroups(user.role);
  const allowedRoute = isFlowMateRouteAllowedForRole(user.role, route);
  const unreadNotificationCount = notifications.filter(notification => !notification.readAt).length;
  const normalizedGlobalSearch = searchInput.trim();
  const globalSearchResults = normalizedGlobalSearch ? (globalSearchRows || []).filter(row => window.matchesFlowMateSearch ? window.matchesFlowMateSearch(row, normalizedGlobalSearch) : false).slice(0, 8) : [];
  function openGlobalSearchResult(row) {
    if (!row || !row.id) return;
    window.flowmateSelectedWorkItem = row;
    setSearchInput("");
    setSearchQuery("");
    setIsGlobalSearchOpen(false);
    open(row.id);
  }
  if (!activeProduct) {
    return React.createElement(ProductChoiceScreen, {
      user: user,
      currentUserName: currentUserName,
      currentUserEmail: currentUserEmail,
      avatarMemberId: avatarMemberId,
      onChooseFlowMate: chooseFlowMateProduct,
      onChooseMarketingPlan: chooseMarketingPlanProduct,
      onChooseProductBook: chooseProductBookProduct,
      onSignOut: handleSignOut
    });
  }
  if (activeProduct === "marketing-plan") {
    return React.createElement(MarketingPlanShell, {
      user: user,
      currentUserName: currentUserName,
      currentUserEmail: currentUserEmail,
      avatarMemberId: avatarMemberId,
      onHome: returnToProductHome,
      onSwitchFlowMate: chooseFlowMateProduct,
      onSwitchMarketingPlan: chooseMarketingPlanProduct,
      onSwitchProductBook: chooseProductBookProduct,
      onSignOut: handleSignOut
    });
  }
  if (activeProduct === PRODUCT_BOOK_PRODUCT_KEY) {
    return React.createElement(ProductBookShell, {
      currentUserName: currentUserName,
      currentUserEmail: currentUserEmail,
      avatarMemberId: avatarMemberId,
      onHome: returnToProductHome,
      onSwitchFlowMate: chooseFlowMateProduct,
      onSwitchMarketingPlan: chooseMarketingPlanProduct,
      onSwitchProductBook: chooseProductBookProduct,
      onSignOut: handleSignOut
    });
  }
  return React.createElement("div", {
    className: "app"
  }, React.createElement(FlowMatePromptHost, null), React.createElement("div", {
    className: "app__brand"
  }, React.createElement("img", {
    src: "garena/logo_graphic.png",
    alt: "Garena"
  }), React.createElement("span", {
    className: "app__brand-name"
  }, "FlowMate"), React.createElement("span", {
    className: "app__brand-version"
  }, FLOWMATE_APP_VERSION)), React.createElement("div", {
    className: "app__topbar"
  }, React.createElement(HomeButton, {
    onHome: returnToProductHome
  }), React.createElement(ProductSwitch, {
    activeProduct: "flowmate",
    onSwitchFlowMate: chooseFlowMateProduct,
    onSwitchMarketingPlan: chooseMarketingPlanProduct,
    onSwitchProductBook: chooseProductBookProduct
  }), React.createElement("div", {
    className: "searchbar-wrap",
    ref: searchWrapRef
  }, React.createElement("div", {
    className: "searchbar"
  }, React.createElement(Icon, {
    name: "search",
    size: 14
  }), React.createElement("input", {
    value: searchInput,
    onChange: e => {
      setSearchInput(e.target.value);
      setIsGlobalSearchOpen(true);
    },
    onFocus: () => setIsGlobalSearchOpen(true),
    onKeyDown: event => {
      if (event.key === "Enter" && globalSearchResults[0]) {
        event.preventDefault();
        openGlobalSearchResult(globalSearchResults[0]);
      }
      if (event.key === "Escape") {
        setSearchInput("");
        setSearchQuery("");
        setIsGlobalSearchOpen(false);
      }
    },
    placeholder: "Search by ID, title, campaign, requester, assignee..."
  })), isGlobalSearchOpen && normalizedGlobalSearch && React.createElement(GlobalSearchResultsPanel, {
    query: normalizedGlobalSearch,
    results: globalSearchResults,
    loadState: globalSearchLoadState,
    onOpen: openGlobalSearchResult
  })), React.createElement("span", {
    className: "topbar__spacer"
  }), React.createElement("div", {
    className: "topbar__menu-wrap"
  }, React.createElement("button", {
    className: "topbar__btn",
    onClick: () => {
      setIsCreateMenuOpen(open => !open);
      setIsNotificationCenterOpen(false);
    },
    "aria-haspopup": "menu",
    "aria-expanded": isCreateMenuOpen
  }, React.createElement(Icon, {
    name: "plus"
  }), " Create"), isCreateMenuOpen && React.createElement(CreateMenuPanel, {
    onQuick: () => handleTopbarCreateChoice("quick"),
    onCreative: () => handleTopbarCreateChoice("creative"),
    onLeave: () => handleTopbarCreateChoice("leave"),
    onClose: () => setIsCreateMenuOpen(false)
  })), React.createElement("button", {
    className: "topbar__btn",
    onClick: () => {
      setIsCreateMenuOpen(false);
      setIsNotificationCenterOpen(open => {
        const nextOpen = !open;
        if (nextOpen) refreshNotifications({
          showLoading: true
        });
        return nextOpen;
      });
    },
    title: "Open notifications"
  }, React.createElement(Icon, {
    name: "bell"
  }), " Notifications", unreadNotificationCount > 0 && React.createElement("span", {
    className: "nav-item__count",
    style: {
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
      padding: "0 5px"
    }
  }, unreadNotificationCount)), isNotificationCenterOpen && React.createElement(NotificationCenterPanel, {
    notifications: notifications,
    unreadCount: unreadNotificationCount,
    loadState: notificationLoadState,
    markingNotificationId: markingNotificationId,
    isMarkingAll: isMarkingAllNotifications,
    isDismissingRead: isDismissingReadNotifications,
    onClose: () => setIsNotificationCenterOpen(false),
    onRefresh: () => refreshNotifications({
      showLoading: true
    }),
    onOpen: handleOpenNotification,
    onMarkRead: handleMarkNotificationRead,
    onMarkAllRead: handleMarkAllNotificationsRead,
    onDismissRead: handleDismissReadNotifications
  }), React.createElement("div", {
    className: "topbar__user",
    title: `Signed in as ${currentUserEmail}`
  }, React.createElement(Avatar, {
    memberId: avatarMemberId,
    size: ""
  }), React.createElement("span", {
    className: "topbar__user-name"
  }, currentUserName)), React.createElement("button", {
    className: "topbar__btn",
    onClick: handleSignOut,
    title: "Sign out"
  }, "Sign out")), React.createElement("nav", {
    className: "app__sidebar"
  }, visibleNavGroups.map(group => React.createElement("div", {
    key: group.group
  }, React.createElement("div", {
    className: "nav-section"
  }, group.group), group.items.map(it => {
    const itemCount = navCounts[it.key];
    return React.createElement("div", {
      key: it.key,
      className: `nav-item ${route === it.key ? "is-active" : ""}`,
      onClick: () => nav(it.key)
    }, React.createElement(Icon, {
      name: it.icon,
      size: 15
    }), React.createElement("span", null, it.label), itemCount != null && React.createElement("span", {
      className: "nav-item__count"
    }, itemCount));
  }))), React.createElement(LiveStatus, {
    realtimeState: realtimeState
  })), React.createElement("main", {
    className: "app__main",
    key: route + (focusId || "")
  }, allowedRoute && route === "my-work" && React.createElement(MyWorkScreen, {
    onOpen: open,
    onNav: nav,
    searchQuery: searchQuery
  }), allowedRoute && route === "create" && React.createElement(CreateScreen, {
    onNav: nav,
    onOpen: open,
    initialMode: createModeIntent
  }), allowedRoute && route === "detail" && React.createElement(DetailScreen, {
    onNav: nav,
    onOpen: open,
    focusId: focusId
  }), allowedRoute && route === "list" && React.createElement(ListScreen, {
    onOpen: open,
    searchQuery: searchQuery
  }), allowedRoute && route === "board" && React.createElement(BoardScreen, {
    onOpen: open
  }), allowedRoute && route === "calendar" && React.createElement(CalendarScreen, {
    onOpen: open
  }), allowedRoute && route === "gantt" && React.createElement(TeamGanttScreen, {
    onOpen: open
  }), allowedRoute && route === "queue" && React.createElement(QueueScreen, {
    onOpen: open,
    searchQuery: searchQuery
  }), allowedRoute && route === "planning-channel" && React.createElement(PlanningChannelViewScreen, {
    onOpen: open
  }), allowedRoute && route === "planning-campaign" && React.createElement(PlanningCampaignViewScreen, {
    onOpen: open
  }), allowedRoute && route === "planning-calendar" && React.createElement(PlanningContentCalendarScreen, {
    onOpen: open
  }), allowedRoute && route === "workload" && React.createElement(WorkloadScreen, {
    onOpen: open
  }), allowedRoute && route === "kpi" && React.createElement(KpiScreen, null), allowedRoute && route === "settings" && React.createElement(SettingsScreen, null), allowedRoute && route === "admin-whitelist" && isAdminUser && React.createElement(AdminWhitelistScreen, null), !allowedRoute && React.createElement(AccessDeniedScreen, {
    onNav: nav
  })), isGlobalLeaveModalOpen && React.createElement(GlobalLeaveRequestModal, {
    onClose: () => setIsGlobalLeaveModalOpen(false)
  }));
}
function ProductSwitch({
  activeProduct,
  onSwitchFlowMate,
  onSwitchMarketingPlan,
  onSwitchProductBook
}) {
  return React.createElement("div", {
    className: "row",
    style: {
      gap: 6,
      marginRight: 14
    },
    "aria-label": "Product switch"
  }, React.createElement("button", {
    type: "button",
    className: `btn btn--xs ${activeProduct === "flowmate" ? "btn--primary" : "btn--ghost"}`,
    onClick: onSwitchFlowMate
  }, "FlowMate"), React.createElement("button", {
    type: "button",
    className: `btn btn--xs ${activeProduct === "marketing-plan" ? "btn--primary" : "btn--ghost"}`,
    onClick: onSwitchMarketingPlan
  }, "Marketing Plan"), React.createElement("button", {
    type: "button",
    className: `btn btn--xs ${activeProduct === PRODUCT_BOOK_PRODUCT_KEY ? "btn--primary" : "btn--ghost"}`,
    onClick: onSwitchProductBook
  }, "Product Book"));
}
function HomeButton({
  onHome
}) {
  return React.createElement("button", {
    type: "button",
    className: "topbar__btn",
    onClick: onHome,
    title: "Back to product home"
  }, React.createElement(Icon, {
    name: "home"
  }), " Home");
}
function ProductChoiceScreen({
  currentUserName,
  currentUserEmail,
  avatarMemberId,
  onChooseFlowMate,
  onChooseMarketingPlan,
  onChooseProductBook,
  onSignOut
}) {
  const pageStyle = {
    minHeight: "100vh",
    background: "var(--garena-bg)",
    color: "var(--garena-iron)"
  };
  const headerStyle = {
    height: 58,
    borderBottom: "1px solid var(--garena-light-grey)",
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "0 24px",
    background: "var(--garena-white)",
    boxSizing: "border-box"
  };
  const mainStyle = {
    maxWidth: 980,
    margin: "0 auto",
    padding: "52px 24px"
  };
  const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
    marginTop: 22
  };
  const cardStyle = {
    border: "1px solid var(--garena-light-grey)",
    background: "var(--garena-white)",
    borderRadius: "var(--radius-sm)",
    padding: 22,
    textAlign: "left",
    minHeight: 190,
    cursor: "pointer"
  };
  return React.createElement("div", {
    style: pageStyle
  }, React.createElement("div", {
    style: headerStyle
  }, React.createElement("img", {
    src: "garena/logo_graphic.png",
    alt: "Garena",
    style: {
      width: 26,
      height: 26,
      objectFit: "contain"
    }
  }), React.createElement("div", {
    className: "strong",
    style: {
      fontSize: 17
    }
  }, "Choose workspace"), React.createElement("span", {
    className: "topbar__spacer"
  }), React.createElement("div", {
    className: "topbar__user",
    title: `Signed in as ${currentUserEmail}`
  }, React.createElement(Avatar, {
    memberId: avatarMemberId,
    size: ""
  }), React.createElement("span", {
    className: "topbar__user-name"
  }, currentUserName)), React.createElement("button", {
    className: "topbar__btn",
    onClick: onSignOut
  }, "Sign out")), React.createElement("main", {
    style: mainStyle
  }, React.createElement("div", {
    className: "eyebrow"
  }, "Garena FCO Thailand"), React.createElement("h1", {
    style: {
      margin: "6px 0 8px",
      fontSize: 30
    }
  }, "Select product"), React.createElement("p", {
    className: "muted",
    style: {
      margin: 0,
      maxWidth: 620
    }
  }, "FlowMate handles task execution. Marketing Plan handles campaign planning. Product Book keeps patch notes readable for the team."), React.createElement("div", {
    style: gridStyle
  }, React.createElement("button", {
    type: "button",
    style: cardStyle,
    onClick: onChooseFlowMate
  }, React.createElement("div", {
    className: "row",
    style: {
      justifyContent: "space-between",
      alignItems: "flex-start"
    }
  }, React.createElement("span", {
    className: "badge badge--creative"
  }, "Execution"), React.createElement(Icon, {
    name: "inbox",
    size: 18
  })), React.createElement("h2", {
    style: {
      fontSize: 22,
      margin: "18px 0 8px"
    }
  }, "FlowMate"), React.createElement("p", {
    className: "muted",
    style: {
      lineHeight: 1.55
    }
  }, "Create requests, assign GD/VE work, track status, workload, calendar, and KPI.")), React.createElement("button", {
    type: "button",
    style: cardStyle,
    onClick: onChooseMarketingPlan
  }, React.createElement("div", {
    className: "row",
    style: {
      justifyContent: "space-between",
      alignItems: "flex-start"
    }
  }, React.createElement("span", {
    className: "badge badge--quick"
  }, "Planning"), React.createElement(Icon, {
    name: "calendar",
    size: 18
  })), React.createElement("h2", {
    style: {
      fontSize: 22,
      margin: "18px 0 8px"
    }
  }, "Marketing Plan"), React.createElement("p", {
    className: "muted",
    style: {
      lineHeight: 1.55
    }
  }, "Plan campaigns, channels, publish dates, and monthly content before work moves into execution.")), React.createElement("button", {
    type: "button",
    style: cardStyle,
    onClick: onChooseProductBook
  }, React.createElement("div", {
    className: "row",
    style: {
      justifyContent: "space-between",
      alignItems: "flex-start"
    }
  }, React.createElement("span", {
    className: "badge badge--system"
  }, "Knowledge"), React.createElement(Icon, {
    name: "book",
    size: 18
  })), React.createElement("h2", {
    style: {
      fontSize: 22,
      margin: "18px 0 8px"
    }
  }, "Product Book"), React.createElement("p", {
    className: "muted",
    style: {
      lineHeight: 1.55
    }
  }, "Read monthly patch notes, team impact summaries, marketing angles, and source PDF references.")))));
}
function ProductBookShell({
  currentUserName,
  currentUserEmail,
  avatarMemberId,
  onHome,
  onSwitchFlowMate,
  onSwitchMarketingPlan,
  onSwitchProductBook,
  onSignOut
}) {
  const patches = Array.isArray(window.PRODUCT_BOOK_PATCHES) ? window.PRODUCT_BOOK_PATCHES : [];
  const [activePatchId, setActivePatchId] = useStateApp(() => patches[0] && patches[0].id ? patches[0].id : "MS26.07");
  const activePatch = patches.find(patch => patch.id === activePatchId) || patches[0] || null;
  return React.createElement("div", {
    className: "app"
  }, React.createElement(FlowMatePromptHost, null), React.createElement("div", {
    className: "app__brand"
  }, React.createElement("img", {
    src: "garena/logo_graphic.png",
    alt: "Garena"
  }), React.createElement("span", {
    className: "app__brand-name"
  }, "Product Book"), React.createElement("span", {
    className: "app__brand-version"
  }, FLOWMATE_APP_VERSION)), React.createElement("div", {
    className: "app__topbar"
  }, React.createElement(HomeButton, {
    onHome: onHome
  }), React.createElement(ProductSwitch, {
    activeProduct: PRODUCT_BOOK_PRODUCT_KEY,
    onSwitchFlowMate: onSwitchFlowMate,
    onSwitchMarketingPlan: onSwitchMarketingPlan,
    onSwitchProductBook: onSwitchProductBook
  }), React.createElement("span", {
    className: "topbar__spacer"
  }), React.createElement("div", {
    className: "topbar__user",
    title: `Signed in as ${currentUserEmail}`
  }, React.createElement(Avatar, {
    memberId: avatarMemberId,
    size: ""
  }), React.createElement("span", {
    className: "topbar__user-name"
  }, currentUserName)), React.createElement("button", {
    className: "topbar__btn",
    onClick: onSignOut
  }, "Sign out")), React.createElement("nav", {
    className: "app__sidebar"
  }, React.createElement("div", null, React.createElement("div", {
    className: "nav-section"
  }, "Product Book"), patches.length === 0 && React.createElement("div", {
    className: "reason-box",
    style: {
      margin: 12
    }
  }, "No patch notes found."), patches.map(patch => React.createElement("div", {
    key: patch.id,
    className: `nav-item ${activePatch && activePatch.id === patch.id ? "is-active" : ""}`,
    onClick: () => setActivePatchId(patch.id)
  }, React.createElement(Icon, {
    name: "book",
    size: 15
  }), React.createElement("span", null, patch.name || patch.id))))), React.createElement("main", {
    className: "app__main app__main--product-book"
  }, activePatch ? React.createElement(ProductBookPatchView, {
    patch: activePatch
  }) : React.createElement("div", {
    className: "reason-box"
  }, "Upload product-book-data.js with at least one patch note entry.")));
}
function ProductBookPatchView({
  patch
}) {
  const tags = Array.isArray(patch.tags) ? patch.tags : [];
  const tagAnchors = buildProductBookAnchorMap(patch);
  const markdown = getProductBookPatchMarkdown(patch);
  return React.createElement("div", null, React.createElement("div", {
    className: "page-head"
  }, React.createElement("div", null, React.createElement("div", {
    className: "eyebrow"
  }, "Product Book / ", patch.monthLabel || patch.id))), React.createElement("div", {
    className: "product-book-sticky-zone"
  }, React.createElement("div", {
    className: "product-book-tag-nav",
    "aria-label": "Product Book sections"
  }, tags.map(tag => React.createElement("button", {
    key: tag,
    type: "button",
    className: "product-book-tag-nav__button",
    onClick: () => scrollToProductBookSection(tagAnchors[tag])
  }, tag)))), React.createElement("div", {
    className: "section section--product-book"
  }, React.createElement(ProductBookMarkdown, {
    markdown: markdown
  })));
}
const PRODUCT_BOOK_TAG_ANCHOR_OVERRIDES = {
  "fp+10": "ms26.07-top-updates-fp-10-and-trait-update",
  "trait update": "ms26.07-top-updates-fp-10-and-trait-update",
  enhancement: "3.-key-highlight-1",
  "ranked mode 4.5": "4.-key-highlight-2-ranked-mode-4.5-master",
  "transfer market": "5.-key-highlight-3-transfer-market-team-color",
  "team color": "5.-key-highlight-3-transfer-market-team-color",
  gameplay: "6.-key-highlight-4-gameplay-improvement-match-fairness",
  qol: "7.-key-highlight-5-qol",
  performance: "8.-performance-system-stability"
};
function normalizeProductBookLabel(value) {
  return String(value || "").trim().toLowerCase();
}
function getProductBookPatchMarkdown(patch) {
  const topUpdates = String(patch && patch.topUpdatesMarkdown || "").trim();
  const content = String(patch && patch.contentMarkdown || "").trim();
  return [topUpdates, content].filter(Boolean).join("\r\n\r\n");
}
function productBookSlug(value) {
  return normalizeProductBookLabel(value).replace(/[*_`]/g, "").replace(/[^a-z0-9.]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
}
function stripInlineMarkdownText(value) {
  return String(value || "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1").replace(/[_*]/g, "");
}
function getProductBookHeadings(markdown) {
  return String(markdown || "").split(/\r?\n/).map(line => line.trim().match(/^(#{1,4})\s+(.+)$/)).filter(Boolean).map(match => {
    const title = stripInlineMarkdownText(match[2]);
    return {
      title,
      anchor: productBookSlug(title)
    };
  }).filter(item => item.anchor);
}
function buildProductBookAnchorMap(patch) {
  const headings = getProductBookHeadings(getProductBookPatchMarkdown(patch));
  const toc = Array.isArray(patch && patch.tableOfContents) ? patch.tableOfContents : [];
  const candidates = [...headings, ...toc.map(item => ({
    title: item.title,
    anchor: item.anchor
  })).filter(item => item.anchor)];
  const result = {};
  (Array.isArray(patch && patch.tags) ? patch.tags : []).forEach(tag => {
    const key = normalizeProductBookLabel(tag);
    const preferred = PRODUCT_BOOK_TAG_ANCHOR_OVERRIDES[key];
    const preferredExists = preferred && candidates.some(item => item.anchor === preferred);
    if (preferredExists || preferred) {
      result[tag] = preferred;
      return;
    }
    const tagSlug = productBookSlug(tag);
    const match = candidates.find(item => {
      const title = normalizeProductBookLabel(item.title);
      const anchor = normalizeProductBookLabel(item.anchor);
      return title.includes(key) || anchor.includes(tagSlug);
    });
    result[tag] = match ? match.anchor : "";
  });
  return result;
}
function scrollToProductBookSection(anchorId) {
  if (!anchorId) return;
  const target = document.getElementById(anchorId);
  if (!target) return;
  target.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}
function ProductBookMarkdown({
  markdown
}) {
  const lines = String(markdown || "").split(/\r?\n/);
  const nodes = [];
  let listItems = [];
  function flushList() {
    if (!listItems.length) return;
    const items = listItems;
    listItems = [];
    nodes.push(React.createElement("ul", {
      key: `ul-${nodes.length}`
    }, items.map((item, index) => React.createElement("li", {
      key: index
    }, formatInlineMarkdown(item)))));
  }
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    if (/^---+$/.test(trimmed)) {
      flushList();
      nodes.push(React.createElement("hr", {
        key: `hr-${index}`
      }));
      return;
    }
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const anchorId = productBookSlug(stripInlineMarkdownText(heading[2])) || `product-book-heading-${index}`;
      const text = formatInlineMarkdown(heading[2]);
      if (level === 1) nodes.push(React.createElement("h2", {
        id: anchorId,
        key: `h-${index}`
      }, text));else if (level === 2) nodes.push(React.createElement("h3", {
        id: anchorId,
        key: `h-${index}`
      }, text));else nodes.push(React.createElement("h4", {
        id: anchorId,
        key: `h-${index}`
      }, text));
      return;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      listItems.push(bullet[1]);
      return;
    }
    flushList();
    nodes.push(React.createElement("p", {
      key: `p-${index}`
    }, formatInlineMarkdown(trimmed)));
  });
  flushList();
  return React.createElement("div", {
    className: "product-book-content"
  }, nodes);
}
function formatInlineMarkdown(text) {
  const parts = String(text || "").split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return React.createElement("strong", {
        key: index
      }, part.slice(2, -2));
    }
    return part;
  });
}
function getMarketingPlanMonthLabel(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || "-";
  const date = new Date(`${monthKey}-01T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  });
}
function getMarketingPlanDays(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return [];
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Array.from({
    length: daysInMonth
  }, (_, index) => {
    const date = new Date(Date.UTC(year, monthIndex, index + 1));
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      day: index + 1,
      weekday: date.toLocaleDateString("en-US", {
        weekday: "short",
        timeZone: "UTC"
      }).slice(0, 1),
      isWeekend: date.getUTCDay() === 0 || date.getUTCDay() === 6
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
    return {
      monthKeys: [],
      monthGroups: [],
      days: []
    };
  }
  const monthKeys = [monthKey, getNextMarketingPlanMonthKey(monthKey)].filter(Boolean);
  const monthGroups = monthKeys.map(key => {
    const days = getMarketingPlanDays(key).map(day => ({
      ...day,
      monthKey: key
    }));
    return {
      key,
      label: getMarketingPlanMonthLabel(key),
      days
    };
  });
  return {
    monthKeys,
    monthGroups,
    days: monthGroups.flatMap(group => group.days)
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
    subPicUserId: row.sub_pic_user_id || "",
    subPicName: row.sub_pic_name || "",
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
    placementNote: row.placement_note || ""
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
    planId: row.plan_id || plan && plan.id || "",
    monthKey: plan && plan.month_key || row.month_key || "",
    sortOrder: Number(row.sort_order || 0)
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
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  });
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
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC"
  }).toUpperCase();
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
  if (viewMode === "4_days") return Array.from({
    length: 4
  }, (_, index) => addMarketingPlanDays(referenceDate, index));
  if (viewMode === "week") {
    const start = getMarketingPlanWeekStart(referenceDate);
    return Array.from({
      length: 7
    }, (_, index) => addMarketingPlanDays(start, index));
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
  const order = {
    S: 0,
    A: 1,
    B: 2,
    C: 3
  };
  return Object.prototype.hasOwnProperty.call(order, normalized) ? order[normalized] : 99;
}
function getMarketingPlanAssetFirstPublishDate(asset) {
  const dates = (asset && asset.placements || []).map(placement => String(placement.publishDate || "")).filter(Boolean).sort();
  return dates[0] || "9999-12-31";
}
function getMarketingPlanTimelineAssetMeta(asset) {
  return [asset.format, asset.contentTier, asset.picName].filter(Boolean).join(" - ");
}
const MARKETING_PLAN_TIMELINE_COUNT_CHANNELS = [{
  key: "facebook",
  label: "FB"
}, {
  key: "tiktok",
  label: "TK"
}, {
  key: "instagram",
  label: "IG"
}];
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
  (rows || []).filter(row => {
    const rowMonth = row.monthKey || (row.publishDate ? row.publishDate.slice(0, 7) : "");
    return windowMonths.has(rowMonth);
  }).forEach(row => {
    const campaignKey = getMarketingPlanCampaignKey(row.campaignName) || row.campaignId || "uncategorized";
    if (!campaigns.has(campaignKey)) {
      campaigns.set(campaignKey, {
        id: campaignKey,
        sourceCampaignIds: row.campaignId ? [row.campaignId] : [],
        name: row.campaignName,
        team: row.campaignTeam,
        sortOrder: row.campaignSortOrder,
        assets: new Map()
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
        placements: []
      });
    }
    campaign.assets.get(row.contentItemId).placements.push({
      id: row.placementId,
      channel: row.channel,
      publishDate: row.publishDate,
      publishTime: row.publishTime,
      status: getMarketingPlanViewStatus(row),
      note: row.placementNote
    });
  });
  return Array.from(campaigns.values()).map(campaign => {
    const assets = Array.from(campaign.assets.values()).map(asset => ({
      ...asset,
      firstPublishDate: getMarketingPlanAssetFirstPublishDate(asset),
      placements: asset.placements.sort((a, b) => String(a.publishDate || "").localeCompare(String(b.publishDate || "")) || String(a.publishTime || "").localeCompare(String(b.publishTime || "")) || String(a.channel || "").localeCompare(String(b.channel || "")))
    })).sort((a, b) => String(a.firstPublishDate || "").localeCompare(String(b.firstPublishDate || "")) || getMarketingPlanTierRank(a.contentTier) - getMarketingPlanTierRank(b.contentTier) || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    const firstPublishDate = assets[0] ? assets[0].firstPublishDate : "9999-12-31";
    const bestTier = assets.reduce((best, asset) => getMarketingPlanTierRank(asset.contentTier) < getMarketingPlanTierRank(best) ? asset.contentTier : best, "");
    return {
      ...campaign,
      firstPublishDate,
      bestTier,
      assets
    };
  }).sort((a, b) => String(a.firstPublishDate || "").localeCompare(String(b.firstPublishDate || "")) || getMarketingPlanTierRank(a.bestTier) - getMarketingPlanTierRank(b.bestTier) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}
const MARKETING_PLAN_CHANNELS = [{
  key: "facebook",
  label: "Facebook"
}, {
  key: "tiktok",
  label: "TikTok"
}, {
  key: "instagram",
  label: "Instagram"
}, {
  key: "in_game",
  label: "In-game"
}, {
  key: "youtube",
  label: "YouTube"
}, {
  key: "other",
  label: "Other"
}];
const MARKETING_PLAN_ASSET_TYPES = ["Banner", "Video", "Shorts/Reels", "Story", "Album", "Cover/Profile", "PR", "GIF", "Live"];
const MARKETING_PLAN_CONTENT_TIERS = ["S", "A", "B", "C"];
const MARKETING_PLAN_PUBLISH_TIME_OPTIONS = ["11:00", "14:00", "18:00", "21:00"];
const MARKETING_PLAN_WORKING_STATUS_OPTIONS = [{
  value: "planned",
  label: "Planned"
}, {
  value: "assigned",
  label: "Assigned"
}, {
  value: "review",
  label: "Review"
}, {
  value: "ready_to_post",
  label: "Ready to Post"
}, {
  value: "scheduled",
  label: "Schedule"
}, {
  value: "posted",
  label: "Posted"
}];
const MARKETING_PLAN_CALENDAR_VIEW_OPTIONS = [{
  value: "day",
  label: "Day"
}, {
  value: "week",
  label: "Week"
}, {
  value: "month",
  label: "Month"
}, {
  value: "4_days",
  label: "4 Days"
}, {
  value: "schedule",
  label: "Schedule"
}];
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
    subPicUserId: "",
    subPicName: "",
    briefLink: "",
    channels: ["facebook"],
    note: ""
  };
}
function marketingPlanMonthKeyFromDate(dateKey) {
  return dateKey && /^\d{4}-\d{2}-\d{2}/.test(String(dateKey)) ? String(dateKey).slice(0, 7) : flowMateTodayDateKey().slice(0, 7);
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
  return "11:00";
}
function createFlowMateDraftFromMarketingPlanRow(row) {
  const currentUserDefaults = getMarketingPlanCurrentUserDefaults();
  const launchDate = row.publishDate || flowMateTodayDateKey();
  const channels = Array.isArray(row.channels) && row.channels.length ? row.channels.map(channel => getMarketingPlanChannelLabel(channel)).join(", ") : row.channel ? getMarketingPlanChannelLabel(row.channel) : "Instagram";
  const productEvent = row.contentTitle || "";
  const requesterTeam = currentUserDefaults.team || "Operations";
  const campaignName = row.campaignName || "";
  const assetSubtype = getFlowMateCreativeSubtypeFromMarketingAssetType(row.format);
  return {
    title: window.buildFlowMateTemplateTitle ? window.buildFlowMateTemplateTitle({
      launchDate,
      requesterTeam,
      projectName: campaignName,
      productEvent
    }) : "",
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
    marketingPlanCampaignName: campaignName
  };
}
function openFlowMateCreativeBriefFromMarketingRow(row) {
  const draft = createFlowMateDraftFromMarketingPlanRow(row);
  if (window.localStorage) {
    window.localStorage.setItem("flowmate:create:creativeDraft:v1", JSON.stringify(draft));
  }
  window.dispatchEvent(new CustomEvent("flowmate:create-draft-updated", {
    detail: {
      mode: "creative",
      draft
    }
  }));
  if (window.sessionStorage) {
    window.sessionStorage.setItem("flowmate:activeProduct", "flowmate");
  }
  window.dispatchEvent(new CustomEvent("flowmate:switch-flowmate-product", {
    detail: {
      route: "create"
    }
  }));
}
function getMarketingPlanChannelOptions(rows, selectedMonth) {
  const channels = new Set();
  (rows || []).forEach(row => {
    const rowMonth = row.monthKey || (row.publishDate ? row.publishDate.slice(0, 7) : "");
    if (rowMonth === selectedMonth && row.channel) channels.add(row.channel);
  });
  return Array.from(channels).sort((a, b) => getMarketingPlanChannelLabel(a).localeCompare(getMarketingPlanChannelLabel(b)));
}
function filterMarketingPlanRows(rows, selectedMonth, selectedChannel = "all", assignedUserId = "") {
  return (rows || []).filter(row => {
    const rowMonth = row.monthKey || (row.publishDate ? row.publishDate.slice(0, 7) : "");
    if (rowMonth !== selectedMonth) return false;
    if (assignedUserId && row.picUserId !== assignedUserId && row.subPicUserId !== assignedUserId) return false;
    return selectedChannel === "all" || row.channel === selectedChannel;
  }).sort((a, b) => String(a.publishDate || "").localeCompare(String(b.publishDate || "")) || String(a.publishTime || "").localeCompare(String(b.publishTime || "")) || String(a.channel || "").localeCompare(String(b.channel || "")) || String(a.campaignName || "").localeCompare(String(b.campaignName || "")) || String(a.contentTitle || "").localeCompare(String(b.contentTitle || "")));
}
