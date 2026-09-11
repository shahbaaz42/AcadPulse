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
    if (document.querySelector(`link[data-acadpulse-${marker}]`)) return;
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = href;
    stylesheet.dataset[`acadpulse${marker[0].toUpperCase()}${marker.slice(1)}`] = "true";
    document.head.appendChild(stylesheet);
  }

  function loadScript(src, marker, onload) {
    if (document.querySelector(`script[data-acadpulse-${marker}]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.dataset[`acadpulse${marker[0].toUpperCase()}${marker.slice(1)}`] = "true";
    if (onload) script.onload = onload;
    document.body.appendChild(script);
  }

  function loadResultAnalyticsResources() {
    if (typeof document === "undefined") return;

    addStylesheet("page2-ui.css?v=20260911-3", "page2-style");
    loadScript("page2-analytics.js?v=20260911-1", "page2-analytics", () => {
      loadScript("page2-ui.js?v=20260911-2", "page2-ui");
    });

    addStylesheet("page3-ui.css?v=20260911-1", "page3-style");
    loadScript("page3-analytics.js?v=20260911-1", "page3-analytics", () => {
      loadScript("page3-ui.js?v=20260911-1", "page3-ui");
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
