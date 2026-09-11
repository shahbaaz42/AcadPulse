(function (root) {
  "use strict";

  const MEASUREMENT_ID = "G-WNEYWX5WTY";
  const EVENT_NAMES = Object.freeze([
    "workbook_uploaded",
    "scoreboard_generated",
    "excel_download",
    "full_pdf_export",
    "house_pdf_export",
    "generation_error",
    "result_workbook_uploaded",
    "result_dashboard_generated",
    "result_analytics_error"
  ]);
  const allowedEvents = new Set(EVENT_NAMES);

  // Events deliberately contain only their allow-listed name. Never add workbook,
  // report, student, teacher, or error details to this call.
  function trackEvent(eventName) {
    if (!allowedEvents.has(eventName)) return false;
    try {
      if (typeof root.gtag !== "function") return false;
      root.gtag("event", eventName);
      return true;
    } catch (_) {
      return false;
    }
  }

  function addStylesheet(href, marker) {
    const attribute = `data-acadpulse-${marker}`;
    if (document.querySelector(`link[${attribute}]`)) return;
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = href;
    stylesheet.setAttribute(attribute, "true");
    document.head.appendChild(stylesheet);
  }

  function loadScript(src, marker, onload) {
    const attribute = `data-acadpulse-${marker}`;
    const existing = document.querySelector(`script[${attribute}]`);
    if (existing) {
      if (onload) {
        if (existing.dataset.loaded === "true") onload();
        else existing.addEventListener("load", onload, { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.setAttribute(attribute, "true");
    script.onload = () => {
      script.dataset.loaded = "true";
      if (onload) onload();
    };
    document.body.appendChild(script);
  }

  function loadPage3Resources() {
    addStylesheet("page3-ui.css?v=20260911-1", "page3-style");
    addStylesheet("page3-filter-ui.css?v=20260911-1", "page3-filter-style");
    loadScript("page3-analytics.js?v=20260911-2", "page3-analytics", () => {
      loadScript("page3-ui.js?v=20260911-1", "page3-ui", () => {
        loadScript("page3-filter-ui.js?v=20260911-1", "page3-filter-ui");
      });
    });
  }

  function loadResultAnalyticsResources() {
    if (typeof document === "undefined") return;
    addStylesheet("page2-ui.css?v=20260911-3", "page2-style");
    loadScript("page2-analytics.js?v=20260911-1", "page2-analytics", () => {
      loadScript("page2-ui.js?v=20260911-2", "page2-ui", loadPage3Resources);
    });
  }

  const analytics = Object.freeze({ MEASUREMENT_ID, EVENT_NAMES, trackEvent });
  if (typeof module !== "undefined") module.exports = analytics;
  root.AcadPulseAnalytics = analytics;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadResultAnalyticsResources, { once: true });
    else loadResultAnalyticsResources();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
