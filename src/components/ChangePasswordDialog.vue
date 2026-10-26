<script setup>
import { reactive, ref } from "vue";
import { useAuth } from "../composables/useAuth";

const emit = defineEmits(["close"]);
const auth = useAuth();
const form = reactive({ currentPassword: "", newPassword: "", confirmPassword: "" });
const loading = ref(false);
const errorMessage = ref("");

async function submit() {
  if (!form.currentPassword || !form.newPassword) return;
  if (form.newPassword !== form.confirmPassword) {
    errorMessage.value = "两次输入的新密码不一致。";
    return;
  }

  loading.value = true;
  errorMessage.value = "";
  try {
    await auth.changePassword(form.currentPassword, form.newPassword);
    window.alert("密码已修改。");
    emit("close");
  } catch (error) {
    errorMessage.value = error.message || "修改密码失败。";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="dialog-backdrop">
    <section class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
      <button class="dialog-close" type="button" aria-label="关闭" :disabled="loading" @click="$emit('close')">×</button>
      <span class="section-kicker">ACCOUNT SECURITY</span>
      <h2 id="change-password-title">修改密码</h2>
      <p>修改后请使用新密码登录。</p>

      <form @submit.prevent="submit">
        <label class="form-field">
          <span>当前密码</span>
          <input v-model="form.currentPassword" type="password" autocomplete="current-password" required placeholder="输入当前密码" />
        </label>
        <label class="form-field">
          <span>新密码</span>
          <input v-model="form.newPassword" type="password" autocomplete="new-password" required placeholder="输入新密码" />
        </label>
        <label class="form-field">
          <span>确认新密码</span>
          <input v-model="form.confirmPassword" type="password" autocomplete="new-password" required placeholder="再次输入新密码" />
        </label>

        <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
        <div class="dialog-actions">
          <button class="secondary-button" type="button" :disabled="loading" @click="$emit('close')">取消</button>
          <button class="primary-button" type="submit" :disabled="loading">
            <span v-if="loading" class="button-spinner" aria-hidden="true"></span>
            {{ loading ? "正在修改…" : "保存密码" }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
