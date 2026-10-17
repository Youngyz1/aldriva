const BOOTSTRAP_SCRIPT = `(() => {
  try {
    const stored = localStorage.getItem("aldriva-theme-mode");
    const mode = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const pathSegments = window.location.pathname.split("/");
    const pathname = pathSegments[1] === "en" || pathSegments[1] === "fr"
      ? "/" + pathSegments.slice(2).join("/")
      : window.location.pathname;
    const ownedTheme = pathname.startsWith("/site/") || pathname.startsWith("/invitation/") || pathname.startsWith("/website-preview/") || pathname === "/fundraisers" || pathname.startsWith("/fundraisers/");
    const dark = !ownedTheme && (mode === "dark" || (mode === "system" && systemDark));
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("light", !dark);
  } catch {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
  }
})();`;

export function PlatformThemeBootstrap() {
  return (
    <script
      id="aldriva-theme-bootstrap"
      dangerouslySetInnerHTML={{ __html: BOOTSTRAP_SCRIPT }}
    />
  );
}
