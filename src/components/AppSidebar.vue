<script setup>
defineProps({
  user: { type: Object, default: null },
  view: { type: String, default: "library" },
});

defineEmits(["add", "logout", "navigate", "change-password", "login"]);
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true"><span></span><span></span></div>
      <div><strong>POSEBOOK</strong><small>拍摄动作库</small></div>
    </div>

    <nav class="app-nav" aria-label="页面导航">
      <button
        type="button"
        :class="{ active: view === 'library' }"
        @click="$emit('navigate', 'library')"
      >
        共享动作库
      </button>
      <button
        v-if="user"
        type="button"
        :class="{ active: view === 'mine' }"
        @click="$emit('navigate', 'mine')"
      >
        我的角色
      </button>
      <button
        v-if="user"
        type="button"
        :class="{ active: view === 'favorites' }"
        @click="$emit('navigate', 'favorites')"
      >
        我的收藏
      </button>
    </nav>

    <button v-if="user" class="add-role" type="button" @click="$emit('add')">
      <span aria-hidden="true">＋</span>
      <span><strong>建立新角色</strong><small>创建独立动作清单</small></span>
    </button>

    <button v-else class="add-role" type="button" @click="$emit('login')">
      <span aria-hidden="true">→</span>
      <span><strong>登录 / 注册</strong><small>登录后可管理角色、收藏与标记</small></span>
    </button>

    <div v-if="user" class="sidebar-user">
      <span class="user-avatar">{{ user.username.slice(0, 2).toUpperCase() }}</span>
      <span class="user-copy">
        <strong>{{ user.username }}</strong>
        <small>{{ user.role === "superadmin" ? "超级管理员" : "普通用户" }}</small>
      </span>
      <span class="sidebar-user-actions">
        <button type="button" @click="$emit('change-password')">改密</button>
        <button type="button" @click="$emit('logout')">退出</button>
      </span>
    </div>

    <div class="sidebar-note">
      <span class="status-dot"></span>
      <span>共享动作库 · 所有用户同步</span>
    </div>
  </aside>
</template>
