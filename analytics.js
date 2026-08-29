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

  const analytics = Object.freeze({ MEASUREMENT_ID, EVENT_NAMES, trackEvent });
  if (typeof module !== "undefined") module.exports = analytics;
  root.AcadPulseAnalytics = analytics;
})(typeof globalThis !== "undefined" ? globalThis : this);
