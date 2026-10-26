<script setup>
defineProps({
  action: { type: Object, default: null },
  index: { type: Number, required: true },
  total: { type: Number, required: true },
  canDelete: { type: Boolean, default: false },
  favorited: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
});

defineEmits(["previous", "next", "toggle", "update-notes", "zoom", "toggle-favorite", "edit", "delete", "add"]);
</script>

<template>
  <section v-if="action" class="viewer-grid">
    <div class="image-panel">
      <div class="image-topline">
        <span>REFERENCE FRAME</span>
        <button type="button" @click="$emit('zoom')">全屏查看 ↗</button>
      </div>
      <div class="image-canvas">
        <img :src="action.image" :alt="`${action.name}动作参考`" />
        <button class="viewer-nav viewer-prev" type="button" aria-label="上一张" @click="$emit('previous')">←</button>
        <button class="viewer-nav viewer-next" type="button" aria-label="下一张" @click="$emit('next')">→</button>
        <span class="image-index">{{ String(index + 1).padStart(2, "0") }} / {{ String(total).padStart(2, "0") }}</span>
      </div>
    </div>

    <aside class="action-panel">
      <div class="action-number">ACTION {{ String(index + 1).padStart(2, "0") }}</div>
      <div class="action-title-row">
        <h2>{{ action.name }}</h2>
        <span class="completion-badge" :class="{ complete: action.completed }">
          {{ action.completed ? "已拍摄" : "待拍摄" }}
        </span>
      </div>
      <p class="source-name">{{ action.sourceName }} · 由 {{ action.createdByName || "系统" }} 添加</p>
      <button
        v-if="!readonly"
        class="favorite-button"
        :class="{ active: favorited }"
        type="button"
        @click="$emit('toggle-favorite', !favorited)"
      >
        {{ favorited ? "★ 已收藏" : "☆ 收藏" }}
      </button>

      <div v-if="readonly" class="readonly-hint">
        登录后可以收藏动作、记录现场备注并标记拍摄完成。
      </div>

      <label v-else class="notes-field">
        <span>现场备注</span>
        <textarea
          :value="action.notes"
          rows="5"
          placeholder="记录角度、表情、光线或服装细节…"
          @change="$emit('update-notes', $event.target.value)"
        ></textarea>
      </label>

      <button v-if="!readonly" class="complete-button" :class="{ complete: action.completed }" type="button" @click="$emit('toggle')">
        <span class="check-icon">{{ action.completed ? "✓" : "○" }}</span>
        {{ action.completed ? "已完成这个动作" : "标记为拍摄完成" }}
      </button>
      <button v-if="!readonly" class="edit-button" type="button" @click="$emit('edit')">编辑动作</button>
      <button v-if="!readonly && canDelete" class="danger-button" type="button" @click="$emit('delete')">删除动作</button>

      <div v-if="!readonly" class="keyboard-tip"><kbd>←</kbd><kbd>→</kbd><span>快速切换动作</span></div>
    </aside>
  </section>

  <section v-else class="empty-state">
    <span class="empty-number">00</span>
    <div class="empty-orbit"><span>＋</span></div>
    <p class="section-kicker">EMPTY CHARACTER</p>
    <h2>为这个角色加入第一条动作参考</h2>
    <p>添加图片地址、动作名称和拍摄提示，建立专属的参考清单。</p>
    <button v-if="!readonly" class="primary-button" type="button" @click="$emit('add')">＋ 新增动作</button>
    <p v-else class="readonly-hint">登录后可以为这个角色新增动作。</p>
  </section>
</template>
