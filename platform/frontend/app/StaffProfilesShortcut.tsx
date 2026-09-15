"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { apiRequest, CurrentUser } from "../lib/api";

export default function StaffProfilesShortcut() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (pathname !== "/") {
      setShow(false);
      setTarget(null);
      return;
    }

    apiRequest<CurrentUser>("/api/v1/auth/me")
      .then((user) => {
        const canOpenStaffProfiles = user.assignments.some(
          (assignment) =>
            ["PRINCIPAL", "SCHOOL_ADMIN", "COMPARTMENT_HEAD"].includes(assignment.role_code) &&
            ["institution", "academic_compartment"].includes(assignment.scope_type),
        );
        setShow(canOpenStaffProfiles);
      })
      .catch(() => setShow(false));
  }, [pathname]);

  useEffect(() => {
    if (!show || pathname !== "/") {
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
  }, [show, pathname]);

  if (!show || !target) return null;

  return createPortal(
    <Link className="secondary-button" href="/staff-profiles">
      Staff &amp; Teacher Profiles
    </Link>,
    target,
  );
}
