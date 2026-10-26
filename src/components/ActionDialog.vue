<script setup>
import { computed, onBeforeUnmount, reactive, ref } from "vue";
import { uploadReferenceImage } from "../services/uploadApi";
import { MAX_COMPRESSED_BYTES, MAX_SOURCE_BYTES, compressImage } from "../utils/imageCompressor";

const props = defineProps({
  characterName: { type: String, default: "当前角色" },
  action: { type: Object, default: null },
});
const emit = defineEmits(["close", "submit"]);
const isEdit = computed(() => Boolean(props.action));
const form = reactive({
  name: props.action?.name || "",
  image: props.action?.image || "",
  notes: props.action?.notes || "",
});
const sourceMode = ref(props.action ? "url" : "upload");
const selectedFile = ref(null);
const compressedFile = ref(null);
const previewUrl = ref("");
const compressing = ref(false);
const uploading = ref(false);
const errorMessage = ref("");
const fileRevision = ref(0);
let disposed = false;

const canSubmit = computed(() => {
  const hasSource = sourceMode.value === "upload" ? compressedFile.value && !compressing.value : form.image.trim();
  return Boolean(form.name.trim() && hasSource && !uploading.value);
});

function formatFileSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}

function clearPreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = "";
}

async function setFile(file) {
  const revision = ++fileRevision.value;
  errorMessage.value = "";
  compressing.value = false;
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    errorMessage.value = "请选择图片文件。";
    return;
  }
  if (file.size > MAX_SOURCE_BYTES) {
    errorMessage.value = "图片不能超过 20MB。";
    return;
  }

  clearPreview();
  selectedFile.value = file;
  compressedFile.value = null;
  compressing.value = true;
  previewUrl.value = URL.createObjectURL(file);
  if (!form.name.trim()) form.name = file.name.replace(/\.[^.]+$/, "");

  try {
    const result = file.size <= MAX_COMPRESSED_BYTES ? file : await compressImage(file);
    if (disposed || revision !== fileRevision.value) return;
    compressedFile.value = result;
  } catch (error) {
    if (disposed || revision !== fileRevision.value) return;
    compressedFile.value = null;
    errorMessage.value = error.message || "图片压缩失败，请更换图片后重试。";
  } finally {
    if (!disposed && revision === fileRevision.value) compressing.value = false;
  }
}

function handleFileChange(event) {
  setFile(event.target.files?.[0]);
}

function handleDrop(event) {
  setFile(event.dataTransfer.files?.[0]);
}

async function submit() {
  if (!canSubmit.value) return;
  uploading.value = true;
  errorMessage.value = "";

  try {
    let image = form.image.trim();
    let sourceName = props.action?.sourceName || image.split("/").pop() || "参考图片";

    if (sourceMode.value === "upload") {
      const uploaded = await uploadReferenceImage(compressedFile.value);
      image = uploaded.url;
      sourceName = uploaded.originalName;
    }

    emit("submit", {
      name: form.name.trim(),
      image,
      sourceName,
      notes: form.notes.trim(),
    });
  } catch (error) {
    errorMessage.value = error.message || "上传失败，请稍后重试。";
  } finally {
    uploading.value = false;
  }
}

onBeforeUnmount(() => {
  disposed = true;
  clearPreview();
});
</script>

<template>
  <div class="dialog-backdrop">
    <section class="dialog-card action-dialog" role="dialog" aria-modal="true" aria-labelledby="action-dialog-title">
      <button class="dialog-close" type="button" aria-label="关闭" :disabled="uploading" @click="$emit('close')">×</button>
      <span class="section-kicker">{{ isEdit ? "EDIT REFERENCE" : "NEW REFERENCE" }} / {{ characterName }}</span>
      <h2 id="action-dialog-title">{{ isEdit ? "编辑动作参考" : "新增动作参考" }}</h2>
      <p>{{ isEdit ? "更新动作名称、参考图片或现场备注。" : "上传本地图片到参考库，或继续使用已有的图片 URL。" }}</p>

      <form @submit.prevent="submit">
        <label class="form-field">
          <span>动作名称</span>
          <input v-model="form.name" autofocus required maxlength="30" placeholder="例如：侧身回望" />
        </label>

        <div class="source-tabs" role="tablist" aria-label="图片来源">
          <button type="button" role="tab" :aria-selected="sourceMode === 'upload'" :class="{ active: sourceMode === 'upload' }" @click="sourceMode = 'upload'">上传图片</button>
          <button type="button" role="tab" :aria-selected="sourceMode === 'url'" :class="{ active: sourceMode === 'url' }" @click="sourceMode = 'url'">图片 URL</button>
        </div>

        <div v-if="sourceMode === 'upload'" class="upload-field">
          <input id="action-image" class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" @change="handleFileChange" />
          <label class="upload-dropzone" :class="{ selected: selectedFile }" for="action-image" @dragover.prevent @drop.prevent="handleDrop">
            <img v-if="previewUrl" :src="previewUrl" alt="待上传图片预览" />
            <span v-else class="upload-icon" aria-hidden="true">↥</span>
            <span class="upload-copy">
              <strong>{{ selectedFile ? selectedFile.name : "选择图片或拖放到这里" }}</strong>
              <small v-if="compressing">正在压缩至 1MB 以内…</small>
              <small v-else-if="compressedFile">
                {{ formatFileSize(compressedFile.size) }} · {{ selectedFile.size > MAX_COMPRESSED_BYTES ? "已压缩" : "无需压缩" }}
              </small>
              <small v-else>JPG、PNG、WebP、GIF、AVIF · 自动压缩至 1MB 内</small>
            </span>
            <span class="upload-change">{{ selectedFile ? "更换" : "浏览" }}</span>
          </label>
        </div>

        <label v-else class="form-field">
          <span>参考图片地址</span>
          <input v-model="form.image" required placeholder="https://example.com/reference.png" />
        </label>

        <label class="form-field">
          <span>初始备注</span>
          <textarea v-model="form.notes" rows="3" placeholder="机位、光线、表情等提示"></textarea>
        </label>

        <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
        <div class="dialog-actions">
          <button class="secondary-button" type="button" :disabled="uploading" @click="$emit('close')">取消</button>
          <button class="primary-button" type="submit" :disabled="!canSubmit">
            <span v-if="uploading" class="button-spinner" aria-hidden="true"></span>
            {{ uploading ? "正在上传…" : compressing ? "正在压缩…" : isEdit ? "保存修改" : "加入清单" }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
