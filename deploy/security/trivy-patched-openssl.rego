package trivy

# Debian DSA-6531-1 fixes this CVE; the Trivy feed has not recorded it yet.
# Match only the actual patched binary packages, never an unpatched version.
default ignore = false

ignore {
    input.VulnerabilityID == "CVE-2026-84782"
    input.PkgName == "libssl3t64"
    input.InstalledVersion == "3.5.7-1~deb13u3"
    time.now_ns() < time.parse_rfc3339_ns("2026-10-08T00:00:00Z")
}

ignore {
    input.VulnerabilityID == "CVE-2026-84782"
    input.PkgName == "openssl-provider-legacy"
    input.InstalledVersion == "3.5.7-1~deb13u3"
    time.now_ns() < time.parse_rfc3339_ns("2026-10-08T00:00:00Z")
}
