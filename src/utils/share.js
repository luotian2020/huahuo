import { buildCharacterSharePath } from "../router";

const WECHAT_USER_AGENT = /MicroMessenger/i;

export function buildCharacterShareUrl(characterId) {
  return new URL(buildCharacterSharePath(characterId), window.location.origin).toString();
}

export function isWeChatBrowser() {
  return WECHAT_USER_AGENT.test(navigator.userAgent);
}

export function toAbsoluteUrl(value) {
  if (!value) return "";
  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return "";
  }
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to the textarea approach below (e.g. insecure origins).
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export function openQqShare({ url, title, summary, image }) {
  const params = new URLSearchParams({
    url,
    title: title || "Posebook 动作参考",
    summary: summary || "",
    pics: image || "",
  });
  const popup = window.open(
    `https://connect.qq.com/widget/shareqq/index.html?${params.toString()}`,
    "_blank",
    "width=760,height=620",
  );
  if (!popup) return false;
  popup.opener = null;
  return true;
}
