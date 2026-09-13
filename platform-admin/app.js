(() => {
  "use strict";
  const API_BASE = "https://acadpulse-api.onrender.com/api/v1";
  const $ = (id) => document.getElementById(id);
  let institutions = [];

  function notice(text, error = false) {
    const box = $("notice");
    box.textContent = text;
    box.className = `notice${error ? " error" : ""}`;
    box.hidden = false;
    clearTimeout(notice.timer);
    notice.timer = setTimeout(() => { box.hidden = true; }, 3600);
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const body = await response.json();
        if (typeof body.detail === "string") message = body.detail;
      } catch {}
      throw new Error(message);
    }
    return response.status === 204 ? null : response.json();
  }

  function render() {
    $("institutionCount").textContent = `${institutions.length} institution${institutions.length === 1 ? "" : "s"}`;
    if (!institutions.length) {
      $("institutionList").textContent = "No institutions have been onboarded yet.";
      return;
    }
    $("institutionList").innerHTML = institutions.map((item) =>
      `<div><strong>${item.display_name || item.official_name}</strong><br><small>${item.institution_code} · ${item.official_name}</small></div>`
    ).join("<hr>");
  }

  async function load() {
    try {
      institutions = await api("/institutions");
      render();
    } catch (error) {
      notice(error.message || "Could not load institutions.", true);
    }
  }

  $("institutionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api("/institutions", {
        method: "POST",
        body: JSON.stringify({
          institution_code: String(data.get("code") || "").trim(),
          official_name: String(data.get("name") || "").trim(),
          display_name: String(data.get("displayName") || "").trim() || null,
          timezone: "Asia/Kolkata",
          status: "active"
        })
      });
      form.reset();
      await load();
      notice("Institution created. It can now be configured in its school portal.");
    } catch (error) {
      notice(error.message, true);
    }
  });

  load();
})();
