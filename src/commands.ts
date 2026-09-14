export function dispatchExtensionCommand(command: string, openLibrary: () => void): boolean {
  if (command !== "open-library") return false;
  openLibrary();
  return true;
}
