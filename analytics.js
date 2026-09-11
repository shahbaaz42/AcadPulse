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

  function loadPage2Resources() {
    if (typeof document === "undefined" || document.querySelector('script[data-acadpulse-page2]')) return;
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "page2-ui.css?v=20260910-1";
    document.head.appendChild(stylesheet);

    const analyticsScript = document.createElement("script");
    analyticsScript.src = "page2-analytics.js?v=20260910-1";
    analyticsScript.dataset.acadpulsePage2 = "analytics";
    analyticsScript.onload = () => {
      const uiScript = document.createElement("script");
      uiScript.src = "page2-ui.js?v=20260910-1";
      uiScript.dataset.acadpulsePage2 = "ui";
      document.body.appendChild(uiScript);
    };
    document.body.appendChild(analyticsScript);
  }

  const analytics = Object.freeze({ MEASUREMENT_ID, EVENT_NAMES, trackEvent });
  if (typeof module !== "undefined") module.exports = analytics;
  root.AcadPulseAnalytics = analytics;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadPage2Resources, { once: true });
    else loadPage2Resources();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
