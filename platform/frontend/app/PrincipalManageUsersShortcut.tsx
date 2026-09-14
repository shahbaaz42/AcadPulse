"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { apiRequest, CurrentUser } from "../lib/api";

export default function PrincipalManageUsersShortcut() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (pathname !== "/") {
      setShow(false);
      return;
    }

    apiRequest<CurrentUser>("/api/v1/auth/me")
      .then((user) => {
        const isPrincipal = user.assignments.some(
          (assignment) =>
            assignment.role_code === "PRINCIPAL" &&
            assignment.scope_type === "institution",
        );
        setShow(isPrincipal);
      })
      .catch(() => setShow(false));
  }, [pathname]);

  if (!show) return null;

  return (
    <Link
      className="secondary-button principal-manage-users-shortcut"
      href="/admin-users"
    >
      Manage users
    </Link>
  );
}
