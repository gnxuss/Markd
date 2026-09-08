export async function openBookmark(url: string, background: boolean): Promise<void> {
  await chrome.tabs.create({ url, active: !background });
}
