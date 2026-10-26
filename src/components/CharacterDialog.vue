<script setup>
import { computed, reactive } from "vue";

const emit = defineEmits(["close", "submit"]);
const props = defineProps({
  character: { type: Object, default: null },
});
const isEditing = computed(() => Boolean(props.character));
const colors = ["#ff5c3a", "#0c8b78", "#e2a72e", "#2878d0", "#d84f78"];
const form = reactive({
  name: props.character?.name || "",
  tag: props.character?.tag || "",
  accent: props.character?.accent || colors[0],
});

function submit() {
  if (!form.name.trim()) return;
  emit("submit", { ...form, name: form.name.trim(), tag: form.tag.trim() });
}
</script>

<template>
  <div class="dialog-backdrop">
    <section class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="character-dialog-title">
      <button class="dialog-close" type="button" aria-label="关闭" @click="$emit('close')">×</button>
      <span class="section-kicker">{{ isEditing ? "EDIT CHARACTER" : "NEW CHARACTER" }}</span>
      <h2 id="character-dialog-title">{{ isEditing ? "修改角色" : "建立新角色" }}</h2>
      <p>{{ isEditing ? "修改角色名称、企划标签或强调色。" : "每个角色拥有独立的动作列表、拍摄备注与完成进度。" }}</p>

      <form @submit.prevent="submit">
        <label class="form-field">
          <span>角色名称</span>
          <input v-model="form.name" autofocus required maxlength="20" placeholder="例如：银狼" />
        </label>
        <label class="form-field">
          <span>企划标签</span>
          <input v-model="form.tag" maxlength="30" placeholder="例如：夜景街拍 · 周六" />
        </label>
        <fieldset class="color-field">
          <legend>角色强调色</legend>
          <label v-for="color in colors" :key="color" :style="{ background: color }">
            <input v-model="form.accent" type="radio" name="accent" :value="color" />
            <span>✓</span>
          </label>
        </fieldset>
        <div class="dialog-actions">
          <button class="secondary-button" type="button" @click="$emit('close')">取消</button>
          <button class="primary-button" type="submit">{{ isEditing ? "保存修改" : "创建角色" }}</button>
        </div>
      </form>
    </section>
  </div>
</template>
