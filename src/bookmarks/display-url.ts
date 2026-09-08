const MAXIMUM_PATH_SEGMENTS = 3;

export function displayUrl(nativeUrl: string): string {
  try {
    const parsed = new URL(nativeUrl);
    const hostname = parsed.hostname.replace(/^www\./u, "");
    const segments = parsed.pathname.split("/").filter((segment) => segment.length > 0);
    const visibleSegments = segments.slice(0, MAXIMUM_PATH_SEGMENTS);
    const shortenedPath = visibleSegments.length > 0 ? `/${visibleSegments.join("/")}` : "";
    const suffix = segments.length > MAXIMUM_PATH_SEGMENTS ? "/…" : "";
    return `${hostname}${shortenedPath}${suffix}` || parsed.protocol.replace(":", "");
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      return nativeUrl;
    }
    throw error;
  }
}
