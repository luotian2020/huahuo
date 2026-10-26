import { apiFetch, clearToken, getToken, setToken } from "./apiClient";

export function hasToken() {
  return Boolean(getToken());
}

function withCredentials(path, payload) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

export async function login(username, password) {
  const result = await apiFetch("/api/login", withCredentials("/api/login", { username, password }));
  setToken(result.token);
  return result.user;
}

export async function register(username, password) {
  const result = await apiFetch("/api/register", withCredentials("/api/register", { username, password }));
  setToken(result.token);
  return result.user;
}

export async function getCurrentUser() {
  const result = await apiFetch("/api/me");
  return result.user;
}

export async function logout() {
  return apiFetch("/api/logout", { method: "POST" });
}

export async function changePassword(currentPassword, newPassword) {
  return apiFetch("/api/change-password", withCredentials("/api/change-password", { currentPassword, newPassword }));
}

export function clearStoredToken() {
  clearToken();
}
