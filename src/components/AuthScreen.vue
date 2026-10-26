<script setup>
import { reactive, ref } from "vue";
import { useAuth } from "../composables/useAuth";

const auth = useAuth();
const mode = ref("login");
const form = reactive({ username: "", password: "", confirmPassword: "" });
const loading = ref(false);
const errorMessage = ref("");

defineEmits(["close"]);

function switchMode(nextMode) {
  mode.value = nextMode;
  errorMessage.value = "";
  form.password = "";
  form.confirmPassword = "";
}

async function submit() {
  if (!form.username.trim() || !form.password) return;
  if (mode.value === "register" && form.password !== form.confirmPassword) {
    errorMessage.value = "两次输入的密码不一致。";
    return;
  }

  loading.value = true;
  errorMessage.value = "";
  try {
    if (mode.value === "login") {
      await auth.login(form.username.trim(), form.password);
    } else {
      await auth.register(form.username.trim(), form.password);
    }
  } catch (error) {
    errorMessage.value = error.message || "操作失败，请稍后重试。";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="auth-screen">
    <button class="auth-back" type="button" @click="$emit('close')">← 返回动作库</button>
    <section class="auth-card">
      <div class="auth-brand">
        <div class="brand-mark" aria-hidden="true"><span></span><span></span></div>
        <div>
          <strong>POSEBOOK</strong>
          <small>共享拍摄动作库</small>
        </div>
      </div>

      <div class="auth-tabs" role="tablist" aria-label="登录或注册">
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'login'"
          :class="{ active: mode === 'login' }"
          @click="switchMode('login')"
        >
          登录
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'register'"
          :class="{ active: mode === 'register' }"
          @click="switchMode('register')"
        >
          注册
        </button>
      </div>

      <form @submit.prevent="submit">
        <label class="form-field">
          <span>用户名</span>
          <input v-model="form.username" autocomplete="username" required maxlength="24" placeholder="请输入用户名" />
        </label>
        <label class="form-field">
          <span>密码</span>
          <input
            v-model="form.password"
            type="password"
            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            required
            placeholder="请输入密码"
          />
        </label>
        <label v-if="mode === 'register'" class="form-field">
          <span>确认密码</span>
          <input
            v-model="form.confirmPassword"
            type="password"
            autocomplete="new-password"
            required
            placeholder="再次输入密码"
          />
        </label>

        <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
        <button class="auth-submit" type="submit" :disabled="loading">
          <span v-if="loading" class="button-spinner" aria-hidden="true"></span>
          {{ loading ? "请稍候…" : mode === "login" ? "进入动作库" : "创建账号" }}
        </button>
      </form>

      <p class="auth-hint">登录后可管理角色、动作与收藏</p>
    </section>
  </main>
</template>
