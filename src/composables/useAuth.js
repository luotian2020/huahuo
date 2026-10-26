import { computed, ref } from "vue";
import {
  changePassword as changePasswordRequest,
  clearStoredToken,
  getCurrentUser,
  hasToken,
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from "../services/authApi";

const currentUser = ref(null);
const ready = ref(false);

export function useAuth() {
  const isSuperAdmin = computed(() => currentUser.value?.role === "superadmin");

  async function restore() {
    if (!hasToken()) {
      ready.value = true;
      return;
    }
    try {
      currentUser.value = await getCurrentUser();
    } catch {
      clearStoredToken();
      currentUser.value = null;
    } finally {
      ready.value = true;
    }
  }

  async function login(username, password) {
    currentUser.value = await loginRequest(username, password);
  }

  async function register(username, password) {
    currentUser.value = await registerRequest(username, password);
  }

  async function logout() {
    try {
      await logoutRequest();
    } finally {
      clearStoredToken();
      currentUser.value = null;
    }
  }

  async function changePassword(currentPassword, newPassword) {
    await changePasswordRequest(currentPassword, newPassword);
  }

  return {
    currentUser,
    ready,
    isSuperAdmin,
    restore,
    login,
    register,
    logout,
    changePassword,
  };
}
