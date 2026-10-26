import { getCurrentWindow } from "@tauri-apps/api/window";

const isWindows = navigator.userAgent.includes("Windows");

/** A red circle with the count, as PNG bytes for the taskbar overlay. */
async function overlayPng(count: number): Promise<Uint8Array> {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas");
  ctx.fillStyle = "#ff3b30";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${count > 99 ? 14 : count > 9 ? 18 : 22}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(count > 99 ? "99+" : String(count), size / 2, size / 2 + 1);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("could not encode overlay icon");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Shows how many PRs need action: the Dock badge on macOS, a taskbar overlay icon on Windows. */
export async function setActionBadge(count: number): Promise<void> {
  const win = getCurrentWindow();
  try {
    if (isWindows) await win.setOverlayIcon(count > 0 ? await overlayPng(count) : undefined);
    else await win.setBadgeCount(count > 0 ? count : undefined);
  } catch {
    // unsupported on this platform or window
  }
}
