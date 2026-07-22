// FlowMate API client — a drop-in replacement for the old Supabase client.
// Exposes window.flowmateSupabase with the same surface the app already uses
// (.from().select()/insert()/update()/delete(), .rpc(), .auth.*), but every
// call goes to the FlowMate backend (/api/*, /auth/*) instead of Supabase.
// The rest of the frontend (supabase-*.js data layer, app.js) is unchanged.
(function () {
  "use strict";

  async function apiPost(path, body) {
    let response;
    try {
      response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body || {}),
      });
    } catch (networkErr) {
      return { data: null, error: { message: "Network error: " + networkErr.message } };
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch (parseErr) {
      payload = null;
    }
    if (!response.ok) {
      const message = (payload && payload.error && payload.error.message)
        || ("Request failed with status " + response.status);
      return { data: null, error: { message: message, status: response.status } };
    }
    return { data: payload ? payload.data : null, error: null };
  }

  // --- Query builder mirroring the supabase-js subset the app uses ----------
  function QueryBuilder(source) {
    this._source = source;
    this._action = "select";
    this._select = "*";
    this._values = null;
    this._filters = [];
    this._order = [];
    this._limit = null;
    this._single = false;
    this._maybeSingle = false;
  }

  QueryBuilder.prototype.select = function (columns) {
    if (this._action === "select") this._select = columns || "*";
    // after insert/update, .select() just means "return rows" — we always do
    return this;
  };
  QueryBuilder.prototype.insert = function (values) {
    this._action = "insert";
    this._values = values;
    return this;
  };
  QueryBuilder.prototype.update = function (values) {
    this._action = "update";
    this._values = values;
    return this;
  };
  QueryBuilder.prototype.delete = function () {
    this._action = "delete";
    return this;
  };
  QueryBuilder.prototype.eq = function (column, value) {
    this._filters.push({ op: "eq", column: column, value: value });
    return this;
  };
  QueryBuilder.prototype.neq = function (column, value) {
    this._filters.push({ op: "neq", column: column, value: value });
    return this;
  };
  QueryBuilder.prototype.gt = function (column, value) {
    this._filters.push({ op: "gt", column: column, value: value });
    return this;
  };
  QueryBuilder.prototype.gte = function (column, value) {
    this._filters.push({ op: "gte", column: column, value: value });
    return this;
  };
  QueryBuilder.prototype.lt = function (column, value) {
    this._filters.push({ op: "lt", column: column, value: value });
    return this;
  };
  QueryBuilder.prototype.lte = function (column, value) {
    this._filters.push({ op: "lte", column: column, value: value });
    return this;
  };
  QueryBuilder.prototype.in = function (column, values) {
    this._filters.push({ op: "in", column: column, value: values });
    return this;
  };
  QueryBuilder.prototype.is = function (column, value) {
    this._filters.push({ op: "is", column: column, value: value });
    return this;
  };
  QueryBuilder.prototype.not = function (column, operator, value) {
    if (operator === "is" && value === null) {
      this._filters.push({ op: "not_is", column: column });
      return this;
    }
    this._filters.push({ op: "neq", column: column, value: value });
    return this;
  };
  QueryBuilder.prototype.order = function (column, options) {
    this._order.push({ column: column, ascending: !options || options.ascending !== false });
    return this;
  };
  QueryBuilder.prototype.limit = function (n) {
    this._limit = n;
    return this;
  };
  QueryBuilder.prototype.single = function () {
    this._single = true;
    return this;
  };
  QueryBuilder.prototype.maybeSingle = function () {
    this._maybeSingle = true;
    return this;
  };

  QueryBuilder.prototype._execute = async function () {
    let result;
    if (this._action === "select") {
      result = await apiPost("/api/read", {
        source: this._source,
        select: this._select,
        filters: this._filters,
        order: this._order,
        limit: this._limit,
      });
    } else {
      result = await apiPost("/api/write", {
        action: this._action,
        source: this._source,
        values: this._values,
        filters: this._filters,
      });
    }
    if (result.error) return { data: null, error: result.error };

    let data = result.data;
    if (this._single || this._maybeSingle) {
      const rows = Array.isArray(data) ? data : [];
      if (rows.length === 0) {
        return this._maybeSingle
          ? { data: null, error: null }
          : { data: null, error: { message: "Row not found" } };
      }
      return { data: rows[0], error: null };
    }
    return { data: data, error: null };
  };

  // Builders are thenable, exactly like supabase-js — `await query` works.
  QueryBuilder.prototype.then = function (resolve, reject) {
    return this._execute().then(resolve, reject);
  };
  QueryBuilder.prototype.catch = function (fn) {
    return this._execute().catch(fn);
  };

  // --- Auth: same call shapes the app already uses ---------------------------
  const authApi = {
    async getSession() {
      let result;
      try {
        result = await fetch("/auth/me", { credentials: "same-origin" });
      } catch (networkErr) {
        return { data: { session: null }, error: null };
      }
      if (!result.ok) return { data: { session: null }, error: null };
      let payload = null;
      try { payload = await result.json(); } catch (e) { payload = null; }
      const user = payload && payload.user;
      if (!user) return { data: { session: null }, error: null };
      return {
        data: {
          session: {
            user: {
              id: user.userId,
              email: user.email,
              user_metadata: { full_name: user.displayName, role: user.role },
            },
          },
        },
        error: null,
      };
    },
    async getUser() {
      const session = await this.getSession();
      return { data: { user: session.data.session ? session.data.session.user : null }, error: null };
    },
    async signInWithOAuth() {
      // The backend drives the whole OAuth flow; options from the caller
      // (provider/redirect hints) are handled server-side.
      window.location.href = "/auth/google";
      return { data: null, error: null };
    },
    async signOut() {
      await apiPost("/auth/logout", {});
      return { error: null };
    },
    onAuthStateChange(callback) {
      // No client-held session anymore (httpOnly cookie). Emit one initial
      // state so existing app bootstrapping keeps working.
      this.getSession().then(function (result) {
        const session = result.data.session;
        callback(session ? "SIGNED_IN" : "SIGNED_OUT", session);
      });
      return { data: { subscription: { unsubscribe: function () {} } } };
    },
  };

  window.flowmateSupabase = {
    from: function (source) { return new QueryBuilder(source); },
    rpc: function (name, params) {
      // Thenable, like supabase-js rpc
      const promise = apiPost("/api/rpc/" + name, params || {});
      return {
        then: function (resolve, reject) { return promise.then(resolve, reject); },
        catch: function (fn) { return promise.catch(fn); },
      };
    },
    auth: authApi,
  };
  window.flowmateSupabaseLoadError = null;
})();
