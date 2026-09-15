import "./globals.css";

import PrincipalManageUsersShortcut from "./PrincipalManageUsersShortcut";
import StaffProfilesShortcut from "./StaffProfilesShortcut";

export const metadata = {
  title: "AcadPulse",
  description: "Integrated Education Management & Intelligence Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PrincipalManageUsersShortcut />
        <StaffProfilesShortcut />
        {children}
      </body>
    </html>
  );
}
