"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { AUTH_CHANGED_EVENT, apiRequest, CurrentUser, getAccessToken } from "../lib/api";

export default function PrincipalManageUsersShortcut() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (pathname !== "/") {
      setShow(false);
      setTarget(null);
      return;
    }

    let active = true;
    const refreshVisibility = () => {
      if (!getAccessToken()) {
        if (active) setShow(false);
        return;
      }

      apiRequest<CurrentUser>("/api/v1/auth/me")
        .then((user) => {
          if (!active) return;
          const isPrincipal = user.assignments.some(
            (assignment) =>
              assignment.role_code === "PRINCIPAL" &&
              assignment.scope_type === "institution",
          );
          setShow(isPrincipal);
        })
        .catch(() => {
          if (active) setShow(false);
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
    <Link className="secondary-button" href="/admin-users">
      Manage users
    </Link>,
    target,
  );
}
