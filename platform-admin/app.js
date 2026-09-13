(() => {
  "use strict";
  const API_BASE = "https://acadpulse-api.onrender.com/api/v1";
  const $ = (id) => document.getElementById(id);
  let organizations = [];
  let institutions = [];
  let groupedInstitutionIds = new Set();

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

  function organizationOptions(selected = "") {
    return `<option value="">Select organization</option>` + organizations.map((org) =>
      `<option value="${org.id}"${org.id === selected ? " selected" : ""}>${org.display_name || org.name}</option>`
    ).join("");
  }

  async function render() {
    $("organizationCount").textContent = `${organizations.length} organization${organizations.length === 1 ? "" : "s"}`;
    $("institutionCount").textContent = `${institutions.length} institution${institutions.length === 1 ? "" : "s"}`;
    $("organizationSelect").innerHTML = organizationOptions();

    groupedInstitutionIds = new Set();
    const blocks = [];
    for (const org of organizations) {
      const items = await api(`/organizations/${org.id}/institutions`);
      items.forEach((item) => groupedInstitutionIds.add(item.id));
      blocks.push(`<div><strong>${org.display_name || org.name}</strong><br><small>${org.organization_code}</small>${items.length ? `<div style="margin-top:10px">${items.map((item) => `• ${item.display_name || item.official_name} <small>(${item.institution_code})</small>`).join("<br>")}</div>` : `<div style="margin-top:10px"><small>No institutions assigned yet.</small></div>`}</div>`);
    }
    $("organizationList").innerHTML = blocks.length ? blocks.join("<hr>") : "No organizations have been created yet.";

    const unassigned = institutions.filter((item) => !groupedInstitutionIds.has(item.id));
    $("unassignedCard").hidden = !unassigned.length;
    $("unassignedList").innerHTML = unassigned.map((item) =>
      `<div style="margin-bottom:12px"><strong>${item.display_name || item.official_name}</strong><br><small>${item.institution_code}</small><div style="margin-top:8px"><select data-institution-id="${item.id}">${organizationOptions()}</select> <button type="button" class="assign-button" data-institution-id="${item.id}">Assign</button></div></div>`
    ).join("");
  }

  async function load() {
    try {
      [organizations, institutions] = await Promise.all([
        api("/organizations"),
        api("/institutions")
      ]);
      await render();
    } catch (error) {
      notice(error.message || "Could not load platform data.", true);
    }
  }

  $("organizationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api("/organizations", {
        method: "POST",
        body: JSON.stringify({
          organization_code: String(data.get("code") || "").trim(),
          name: String(data.get("name") || "").trim(),
          display_name: String(data.get("displayName") || "").trim() || null,
          status: "active"
        })
      });
      form.reset();
      await load();
      notice("Organization created.");
    } catch (error) {
      notice(error.message, true);
    }
  });

  $("institutionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const organizationId = String(data.get("organizationId") || "");
    try {
      const institution = await api("/institutions", {
        method: "POST",
        body: JSON.stringify({
          institution_code: String(data.get("code") || "").trim(),
          official_name: String(data.get("name") || "").trim(),
          display_name: String(data.get("displayName") || "").trim() || null,
          timezone: "Asia/Kolkata",
          status: "active"
        })
      });
      await api(`/institutions/${institution.id}/organization`, {
        method: "PATCH",
        body: JSON.stringify({ organization_id: organizationId })
      });
      form.reset();
      await load();
      notice("Institution created and linked to its organization.");
    } catch (error) {
      notice(error.message, true);
    }
  });

  document.addEventListener("click", async (event) => {
    const button = event.target.closest(".assign-button");
    if (!button) return;
    const institutionId = button.dataset.institutionId;
    const select = document.querySelector(`select[data-institution-id="${institutionId}"]`);
    if (!select?.value) return notice("Select an organization first.", true);
    try {
      await api(`/institutions/${institutionId}/organization`, {
        method: "PATCH",
        body: JSON.stringify({ organization_id: select.value })
      });
      await load();
      notice("Institution assigned to organization.");
    } catch (error) {
      notice(error.message, true);
    }
  });

  load();
})();
