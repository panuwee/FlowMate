/* AUTO-GENERATED from screens-ot.jsx by build-github.cjs. Do not edit; edit the .jsx and re-run `npm run build:github`. */
const OT_REQUEST_VIEW_ROUTES = {
  overview: "ot-request",
  "my-requests": "ot-request/my-requests",
  manager: "ot-request/manager",
  "root-causes": "ot-request/root-causes"
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
  onSignOut
}) {
  const [access, setAccess] = useStateApp({
    status: "loading",
    canManage: false,
    canExport: false,
    isOwner: false
  });
  const [activeView, setActiveView] = useStateApp(getOtRequestHashView);
  useEffectApp(() => {
    let alive = true;
    const loadAccess = window.loadOtAccessContext ? window.loadOtAccessContext() : Promise.reject(new Error("OT Request data service is not ready."));
    loadAccess.then(data => {
      if (!alive) return;
      const serverAccess = data || {};
      setAccess({
        status: "ready",
        ...serverAccess,
        canManage: Boolean(serverAccess.isEligibleApprover || serverAccess.isOwner || serverAccess.isHrAdmin),
        canExport: Boolean(serverAccess.isOwner || serverAccess.isHrAdmin)
      });
    }).catch(error => {
      if (alive) setAccess({
        status: "error",
        canManage: false,
        canExport: false,
        isOwner: false,
        message: error.message
      });
    });
    return () => {
      alive = false;
    };
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
      detail: "Review your overtime status and continue personal actions from one place."
    },
    "my-requests": {
      eyebrow: "Personal",
      title: "My OT requests",
      detail: "Your request history and employee actions will appear here."
    },
    manager: {
      eyebrow: "Manage",
      title: "Team OT overview",
      detail: "Authorized approvers can monitor assigned overtime workflows here."
    },
    "root-causes": {
      eyebrow: "Understand",
      title: "Root causes",
      detail: "Authorized managers can review structured overtime drivers here."
    }
  }[visibleView] || null;
  return React.createElement("div", {
    className: "ot-shell"
  }, React.createElement(FlowMatePromptHost, null), React.createElement("div", {
    className: "app__brand"
  }, React.createElement("img", {
    src: "garena/logo_graphic.png",
    alt: "Garena"
  }), React.createElement("span", {
    className: "app__brand-name"
  }, "OT Request"), React.createElement("span", {
    className: "app__brand-version"
  }, FLOWMATE_APP_VERSION)), React.createElement("div", {
    className: "app__topbar"
  }, React.createElement(HomeButton, {
    onHome: onHome
  }), React.createElement(ProductSwitch, {
    activeProduct: "ot-request",
    onSwitchFlowMate: onSwitchFlowMate,
    onSwitchMarketingPlan: onSwitchMarketingPlan,
    onSwitchProductBook: onSwitchProductBook,
    onSwitchOtRequest: onSwitchOtRequest
  }), React.createElement("span", {
    className: "topbar__spacer"
  }), React.createElement(ThemeToggle, null), React.createElement("div", {
    className: "topbar__user",
    title: `Signed in as ${currentUserEmail}`
  }, React.createElement(Avatar, {
    memberId: avatarMemberId,
    size: ""
  }), React.createElement("span", {
    className: "topbar__user-name"
  }, currentUserName)), React.createElement("button", {
    type: "button",
    className: "topbar__btn",
    onClick: onSignOut
  }, "Sign out")), React.createElement("nav", {
    className: "ot-sidebar",
    "aria-label": "OT Request navigation"
  }, React.createElement("div", {
    className: "nav-section"
  }, "Personal"), React.createElement("button", {
    type: "button",
    className: `nav-item ${visibleView === "overview" ? "is-active" : ""}`,
    "aria-current": visibleView === "overview" ? "page" : undefined,
    onClick: () => openView("overview")
  }, React.createElement(Icon, {
    name: "calendar",
    size: 16
  }), " Overview"), React.createElement("button", {
    type: "button",
    className: `nav-item ${visibleView === "my-requests" ? "is-active" : ""}`,
    "aria-current": visibleView === "my-requests" ? "page" : undefined,
    onClick: () => openView("my-requests")
  }, React.createElement(Icon, {
    name: "list",
    size: 16
  }), " My requests"), access.status === "ready" && access.canManage && React.createElement(React.Fragment, null, React.createElement("div", {
    className: "nav-section"
  }, "Manage"), React.createElement("button", {
    type: "button",
    className: `nav-item ${visibleView === "manager" ? "is-active" : ""}`,
    "aria-current": visibleView === "manager" ? "page" : undefined,
    onClick: () => openView("manager")
  }, React.createElement(Icon, {
    name: "users",
    size: 16
  }), " Team OT"), React.createElement("button", {
    type: "button",
    className: `nav-item ${visibleView === "root-causes" ? "is-active" : ""}`,
    "aria-current": visibleView === "root-causes" ? "page" : undefined,
    onClick: () => openView("root-causes")
  }, React.createElement(Icon, {
    name: "chart",
    size: 16
  }), " Root causes"))), React.createElement("main", {
    className: "ot-main ot-shell__main",
    "aria-labelledby": "ot-view-title"
  }, access.status === "loading" && React.createElement("div", {
    className: "ot-warning",
    role: "status"
  }, React.createElement("span", {
    "aria-hidden": "true"
  }, "ⓘ"), React.createElement("span", null, "Loading OT access…")), access.status === "error" && React.createElement("div", {
    className: "ot-warning ot-warning--error",
    role: "alert"
  }, React.createElement("span", {
    "aria-hidden": "true"
  }, "⚠"), React.createElement("span", null, access.message || "OT access could not be loaded.")), viewCopy && React.createElement("div", null, React.createElement("div", {
    className: "page-head"
  }, React.createElement("div", null, React.createElement("div", {
    className: "eyebrow"
  }, viewCopy.eyebrow), React.createElement("h1", {
    id: "ot-view-title"
  }, viewCopy.title), React.createElement("p", {
    className: "muted"
  }, viewCopy.detail))), React.createElement("section", {
    className: "ot-metric-grid",
    "aria-label": "OT workspace status"
  }, React.createElement("div", {
    className: "stat"
  }, React.createElement("span", null, "Weekly limit"), React.createElement("strong", null, access.weeklyLimitMinutes ? `${access.weeklyLimitMinutes / 60}h` : "—")), React.createElement("div", {
    className: "stat"
  }, React.createElement("span", null, "Timezone"), React.createElement("strong", null, access.timezone || "Asia/Bangkok")), React.createElement("div", {
    className: "stat"
  }, React.createElement("span", null, "Workweek"), React.createElement("strong", null, access.weekStartsOn === "monday" ? "Mon–Sun" : "—"))))));
}
window.OtRequestShell = OtRequestShell;
