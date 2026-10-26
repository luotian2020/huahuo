<script setup>
defineProps({
  actions: { type: Array, required: true },
  currentIndex: { type: Number, required: true },
  canAdd: { type: Boolean, default: true },
});

defineEmits(["select", "add"]);
</script>

<template>
  <section v-if="actions.length" class="filmstrip-section">
    <div class="filmstrip-heading"><span>全部动作</span><small>点击缩略图快速定位</small></div>
    <div class="filmstrip">
      <button
        v-for="(action, index) in actions"
        :key="action.id"
        class="film-card"
        :class="{ active: index === currentIndex, complete: action.completed }"
        type="button"
        @click="$emit('select', index)"
      >
        <img :src="action.image" alt="" loading="lazy" />
        <span class="film-number">{{ String(index + 1).padStart(2, "0") }}</span>
        <span v-if="action.completed" class="film-check">✓</span>
      </button>
      <button v-if="canAdd" class="film-add" type="button" @click="$emit('add')"><span>＋</span><small>新增</small></button>
    </div>
  </section>
</template>
