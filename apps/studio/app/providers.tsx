"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { LicenseProvider } from "@/components/providers/LicenseProvider";
import { RoleProvider } from "@/components/providers/RoleProvider";
import { JobsProvider } from "@/components/providers/JobsProvider";
import { ConfirmProvider } from "@/components/providers/ConfirmProvider";
import FirstRunGate from "@/components/providers/FirstRunGate";
import SilenceChartWarning from "@/components/providers/SilenceChartWarning";

export function Providers({ children }: { children: ReactNode }) {
    return (
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >
            <SilenceChartWarning />
            <AuthProvider>
                <LicenseProvider>
                    <RoleProvider>
                        <JobsProvider>
                            <ConfirmProvider>
                                <FirstRunGate>{children}</FirstRunGate>
                            </ConfirmProvider>
                        </JobsProvider>
                    </RoleProvider>
                </LicenseProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}
