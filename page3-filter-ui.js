(function () {
  "use strict";
  if (typeof document === "undefined") return;

  const FILTERS = [
    { id: "page3ResultFilter", label: "Result" },
    { id: "page3SubjectFilter", label: "Subject" },
    { id: "page3RangeFilter", label: "Mark Range" }
  ];
  const selectedById = new Map();

  function valuesFor(select) {
    return [...select.options]
      .filter(option => option.value && !option.dataset.multiCombined)
      .map(option => ({ value: option.value, label: option.textContent.trim() }));
  }

  function summaryText(selected, options) {
    if (!selected.size) return "All";
    const labels = options.filter(option => selected.has(option.value)).map(option => option.label);
    return labels.length <= 2 ? labels.join(", ") : `${labels.length} selected`;
  }

  function syncHiddenSelect(select, selected) {
    [...select.options].filter(option => option.dataset.multiCombined).forEach(option => option.remove());
    const values = [...selected];
    if (!values.length) select.value = "";
    else if (values.length === 1 && [...select.options].some(option => option.value === values[0])) select.value = values[0];
    else {
      const combined = document.createElement("option");
      combined.value = values.join("|");
      combined.textContent = values.join(", ");
      combined.dataset.multiCombined = "true";
      select.appendChild(combined);
      select.value = combined.value;
    }
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function renderControl(select, wrapper, selected) {
    const options = valuesFor(select);
    const validValues = new Set(options.map(option => option.value));
    [...selected].forEach(value => { if (!validValues.has(value)) selected.delete(value); });
    const summary = wrapper.querySelector("summary span");
    summary.textContent = summaryText(selected, options);
    const menu = wrapper.querySelector(".page3-multi-menu");
    menu.innerHTML = `
      <label class="page3-multi-all"><input type="checkbox" ${selected.size ? "" : "checked"}> <span>All</span></label>
      ${options.map(option => `<label><input type="checkbox" value="${option.value.replace(/&/g,"&amp;").replace(/"/g,"&quot;")}" ${selected.has(option.value) ? "checked" : ""}> <span>${option.label.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</span></label>`).join("")}`;

    const allBox = menu.querySelector(".page3-multi-all input");
    allBox.addEventListener("change", () => {
      if (!allBox.checked) return;
      selected.clear();
      renderControl(select, wrapper, selected);
      syncHiddenSelect(select, selected);
    });
    menu.querySelectorAll('label:not(.page3-multi-all) input').forEach(input => {
      input.addEventListener("change", () => {
        if (input.checked) selected.add(input.value); else selected.delete(input.value);
        summary.textContent = summaryText(selected, options);
        allBox.checked = selected.size === 0;
        syncHiddenSelect(select, selected);
      });
    });
  }

  function enhanceFilter({ id, label }) {
    const select = document.getElementById(id);
    if (!select || select.dataset.multiEnhanced) return;
    select.dataset.multiEnhanced = "true";
    select.classList.add("page3-multi-source");
    const selected = selectedById.get(id) || new Set();
    selectedById.set(id, selected);

    const wrapper = document.createElement("details");
    wrapper.className = "page3-multi";
    wrapper.dataset.for = id;
    wrapper.innerHTML = `<summary aria-label="${label} multi-select"><span>All</span><b>⌄</b></summary><div class="page3-multi-menu"></div>`;
    select.insertAdjacentElement("afterend", wrapper);
    renderControl(select, wrapper, selected);

    new MutationObserver(() => renderControl(select, wrapper, selected)).observe(select, { childList: true });
  }

  function enhanceAll() { FILTERS.forEach(enhanceFilter); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enhanceAll, { once: true });
  else enhanceAll();
  new MutationObserver(enhanceAll).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener("click", event => {
    document.querySelectorAll("details.page3-multi[open]").forEach(details => {
      if (!details.contains(event.target)) details.removeAttribute("open");
    });
  });
})();
