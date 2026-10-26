const TOKEN_KEY = "posebook-auth-token";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // The app can still work for the current page when storage is unavailable.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage failures on logout.
  }
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch(path, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      ...authHeaders(),
      ...headers,
    },
    body,
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const skipClear = path === "/api/login" || path === "/api/register";
    if (response.status === 401 && !skipClear) clearToken();
    throw new Error(result.message || "请求失败，请稍后重试。");
  }

  return result;
}
