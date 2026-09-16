"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { AUTH_CHANGED_EVENT, apiRequest, CurrentUser, getAccessToken } from "../lib/api";

export default function StaffProfilesShortcut() {
  const pathname = usePathname();
  const [showProfiles, setShowProfiles] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showAcademicResponsibilities, setShowAcademicResponsibilities] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (pathname !== "/") {
      setShowProfiles(false);
      setShowBulkImport(false);
      setShowAcademicResponsibilities(false);
      setTarget(null);
      return;
    }

    let active = true;
    const refreshVisibility = () => {
      if (!getAccessToken()) {
        if (active) {
          setShowProfiles(false);
          setShowBulkImport(false);
          setShowAcademicResponsibilities(false);
        }
        return;
      }

      apiRequest<CurrentUser>("/api/v1/auth/me")
        .then((user) => {
          if (!active) return;
          const canOpenStaffProfiles = user.is_platform_admin || user.assignments.some(
            (assignment) =>
              ["PRINCIPAL", "SCHOOL_ADMIN", "COMPARTMENT_HEAD"].includes(assignment.role_code) &&
              ["institution", "academic_compartment"].includes(assignment.scope_type),
          );
          const canBulkImport = user.is_platform_admin || user.assignments.some(
            (assignment) =>
              ["PRINCIPAL", "SCHOOL_ADMIN"].includes(assignment.role_code) &&
              assignment.scope_type === "institution",
          );
          setShowProfiles(canOpenStaffProfiles);
          setShowAcademicResponsibilities(canOpenStaffProfiles);
          setShowBulkImport(canBulkImport);
        })
        .catch(() => {
          if (!active) return;
          setShowProfiles(false);
          setShowBulkImport(false);
          setShowAcademicResponsibilities(false);
        });
    };

    refreshVisibility();
    window.addEventListener(AUTH_CHANGED_EVENT, refreshVisibility);
    return () => {
      active = false;
      window.removeEventListener(AUTH_CHANGED_EVENT, refreshVisibility);
    };
  }, [pathname]);

  useEffect(() => {
    if ((!showProfiles && !showBulkImport && !showAcademicResponsibilities) || pathname !== "/") {
      setTarget(null);
      return;
    }

    const attach = () => {
      const actions = document.querySelector(".session-bar > div:last-child");
      setTarget(actions instanceof HTMLElement ? actions : null);
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [showProfiles, showBulkImport, showAcademicResponsibilities, pathname]);

  if ((!showProfiles && !showBulkImport && !showAcademicResponsibilities) || !target) return null;

  return createPortal(
    <>
      {showProfiles ? (
        <Link className="secondary-button" href="/staff-profiles">
          Staff &amp; Teacher Profiles
        </Link>
      ) : null}
      {showAcademicResponsibilities ? (
        <Link className="secondary-button" href="/academic-responsibilities">
          Subjects &amp; Responsibilities
        </Link>
      ) : null}
      {showBulkImport ? (
        <Link className="secondary-button" href="/staff-profiles/import">
          Bulk Import Staff
        </Link>
      ) : null}
    </>,
    target,
  );
}
