const VIEW_BASE_PATHS = {
  library: "/",
  mine: "/mine",
  favorites: "/favorites",
};

const CHARACTER_ROUTE_PATTERN = /^\/(?:(mine|favorites)\/)?character\/([^/]+)\/?$/;

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseAppRoute(location = window.location) {
  const pathname = location.pathname.replace(/\/+$/, "") || "/";

  const characterMatch = pathname.match(CHARACTER_ROUTE_PATTERN);
  if (characterMatch) {
    return {
      view: characterMatch[1] || "library",
      characterId: safeDecode(characterMatch[2]),
    };
  }

  if (pathname === "/mine") return { view: "mine", characterId: "" };
  if (pathname === "/favorites") return { view: "favorites", characterId: "" };
  return { view: "library", characterId: "" };
}

export function buildAppPath(view, characterId) {
  const basePath = VIEW_BASE_PATHS[view] || VIEW_BASE_PATHS.library;
  if (!characterId) return basePath;
  const prefix = basePath === "/" ? "" : basePath;
  return `${prefix}/character/${encodeURIComponent(characterId)}`;
}

// 分享链接始终指向共享动作库中的角色详情，避免“我的角色/收藏”等需要登录的路径。
export function buildCharacterSharePath(characterId) {
  return buildAppPath("library", characterId);
}
